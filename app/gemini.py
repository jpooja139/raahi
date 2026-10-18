"""All Gemini calls go through here. Keys never leave the server."""
from __future__ import annotations

from typing import Type, TypeVar

from pydantic import BaseModel

from . import config


class GeminiError(Exception):
    """Raised when a key is missing or Gemini returns unusable output."""


class GeminiKeyMissing(GeminiError):
    """The API key is absent — never mask this behind fallbacks."""


_client = None
_key_client = None

M = TypeVar("M", bound=BaseModel)


def client():
    global _client
    if not config.has_gemini():
        raise GeminiKeyMissing(
            "GEMINI_API_KEY missing — paste your real key into raahi/.env and retry."
        )
    if _client is None:
        from google import genai

        if config.USE_VERTEX:
            # ADC: Cloud Run service account in prod, gcloud ADC locally
            _client = genai.Client(
                vertexai=True, project=config.GCP_PROJECT, location=config.GCP_LOCATION
            )
        else:
            _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def key_client():
    """YouTube-URL video ingestion. Vertex accepts YouTube URLs when the part's
    mime_type is "video/*" ("video/mp4" returns 500 INTERNAL — verified
    2026-10-18), so under USE_VERTEX this is just client(); otherwise the
    Gemini API key."""
    global _key_client
    if config.USE_VERTEX:
        return client()
    if config.GEMINI_API_KEY.lower() in ("", "dummy", "changeme", "your-key-here"):
        raise GeminiKeyMissing(
            "Video ingestion needs GEMINI_API_KEY or USE_VERTEX=1."
        )
    if _key_client is None:
        from google import genai

        _key_client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _key_client


def youtube_part(url: str):
    """A YouTube URL as a video part, with the mime type each backend accepts."""
    from google.genai import types

    mime = "video/*" if config.USE_VERTEX else "video/mp4"
    return types.Part(file_data=types.FileData(file_uri=url, mime_type=mime))


def generate_grounded(prompt: str, thinking: str = ""):
    """One Search-grounded text call. Returns (text, grounding_metadata) so the
    caller can tie each claim to its sources — the metadata is the evidence.
    thinking: "" (model default) | "low" | "minimal"."""
    from google.genai import types

    c = client()
    level = {"low": types.ThinkingLevel.LOW, "minimal": types.ThinkingLevel.MINIMAL}.get(thinking)
    try:
        resp = _with_429_retry(
            lambda: c.models.generate_content(
                model=config.MODEL_TEXT,
                contents=[prompt],
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                    thinking_config=types.ThinkingConfig(thinking_level=level) if level else None,
                ),
            )
        )
    except Exception as e:
        raise GeminiError(f"Grounded search failed: {e}") from e
    cand = (resp.candidates or [None])[0]
    return resp.text or "", (cand.grounding_metadata if cand else None)


def generate_json(
    prompt: str,
    schema: Type[M],
    parts: list | None = None,
    grounding: bool = False,
    use_key_client: bool = False,
    media_resolution: str = "",
) -> M:
    """One structured-output call. grounding=True runs a grounded text pass
    first (Search grounding and response_schema can't share one call), then
    converts that answer to the schema. Retries the JSON pass once.
    media_resolution: "" (model default) | "low" | "medium" for video parts."""
    from google.genai import types

    c = key_client() if use_key_client else client()
    media = {
        "low": types.MediaResolution.MEDIA_RESOLUTION_LOW,
        "medium": types.MediaResolution.MEDIA_RESOLUTION_MEDIUM,
    }.get(media_resolution)
    contents = list(parts or []) + [prompt]

    if grounding:
        try:
            grounded = _with_429_retry(
                lambda: c.models.generate_content(
                    model=config.MODEL_TEXT,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        tools=[types.Tool(google_search=types.GoogleSearch())]
                    ),
                )
            )
        except Exception as e:
            raise GeminiError(f"Grounded search failed: {e}") from e
        contents = [
            "Convert the following findings into the required JSON exactly. "
            "Do not add facts that are not in the findings.\n\n" + (grounded.text or "")
        ]

    last_err: Exception | None = None
    raw = ""
    for _ in range(2):  # one retry per Global Constraints
        try:
            resp = _with_429_retry(
                lambda: c.models.generate_content(
                    model=config.MODEL_TEXT,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=schema,
                        media_resolution=media,
                    ),
                )
            )
            raw = resp.text or ""
            return schema.model_validate_json(raw)
        except Exception as e:  # noqa: BLE001 — surfaced via GeminiError below
            last_err = e
    raise GeminiError(f"Gemini JSON call failed: {last_err}; raw={raw[:500]}")


def _with_429_retry(fn, waits=(20, 40)):
    """Free-tier TPM quotas reset per minute: on RESOURCE_EXHAUSTED, wait and
    retry instead of failing a live demo. Runs in FastAPI's threadpool, so
    time.sleep here never blocks the event loop."""
    import time

    last = None
    for wait in (0, *waits):
        if wait:
            time.sleep(wait)
        try:
            return fn()
        except Exception as e:  # noqa: BLE001
            if "RESOURCE_EXHAUSTED" not in str(e) and "429" not in str(e):
                raise
            last = e
    raise last
