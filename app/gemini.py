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
    """YouTube-URL video ingestion is not available on Vertex AI yet —
    those calls go through the Gemini API key explicitly."""
    global _key_client
    if config.GEMINI_API_KEY.lower() in ("", "dummy", "changeme", "your-key-here"):
        raise GeminiKeyMissing(
            "Video ingestion needs GEMINI_API_KEY (Vertex does not accept YouTube URLs yet)."
        )
    if _key_client is None:
        from google import genai

        _key_client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _key_client


def generate_json(
    prompt: str,
    schema: Type[M],
    parts: list | None = None,
    grounding: bool = False,
    use_key_client: bool = False,
) -> M:
    """One structured-output call. grounding=True runs a grounded text pass
    first (Search grounding and response_schema can't share one call), then
    converts that answer to the schema. Retries the JSON pass once."""
    from google.genai import types

    c = key_client() if use_key_client else client()
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
