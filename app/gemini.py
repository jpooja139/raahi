"""All Gemini calls go through here. Keys never leave the server."""
from __future__ import annotations

from typing import Type, TypeVar

from pydantic import BaseModel

from . import config


class GeminiError(Exception):
    """Raised when a key is missing or Gemini returns unusable output."""


_client = None

M = TypeVar("M", bound=BaseModel)


def client():
    global _client
    if not config.has_gemini():
        raise GeminiError(
            "GEMINI_API_KEY missing — paste your real key into raahi/.env and retry."
        )
    if _client is None:
        from google import genai

        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def generate_json(
    prompt: str,
    schema: Type[M],
    parts: list | None = None,
    grounding: bool = False,
) -> M:
    """One structured-output call. grounding=True runs a grounded text pass
    first (Search grounding and response_schema can't share one call), then
    converts that answer to the schema. Retries the JSON pass once."""
    from google.genai import types

    c = client()
    contents = list(parts or []) + [prompt]

    if grounding:
        grounded = c.models.generate_content(
            model=config.MODEL_TEXT,
            contents=contents,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())]
            ),
        )
        contents = [
            "Convert the following findings into the required JSON exactly. "
            "Do not add facts that are not in the findings.\n\n" + (grounded.text or "")
        ]

    last_err: Exception | None = None
    raw = ""
    for _ in range(2):  # one retry per Global Constraints
        try:
            resp = c.models.generate_content(
                model=config.MODEL_TEXT,
                contents=contents,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=schema,
                ),
            )
            raw = resp.text or ""
            return schema.model_validate_json(raw)
        except Exception as e:  # noqa: BLE001 — surfaced via GeminiError below
            last_err = e
    raise GeminiError(f"Gemini JSON call failed: {last_err}; raw={raw[:500]}")
