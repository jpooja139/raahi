"""Central configuration — the ONLY place model IDs and API keys live."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")

# Vertex AI mode: ADC/service-account auth, postpaid project billing.
# Flip with env USE_VERTEX=1 — instant rollback by unsetting it.
USE_VERTEX = os.getenv("USE_VERTEX", "") == "1"
GCP_PROJECT = os.getenv("GCP_PROJECT", "raahi-hackathon")
GCP_LOCATION = os.getenv("GCP_LOCATION", "global")

# Verified against https://ai.google.dev/gemini-api/docs/models on 2026-10-16.
MODEL_TEXT = "gemini-3.8-flash"
MODEL_LIVE = "gemini-3.8-live"

_DUMMY = {"", "dummy", "changeme", "your-key-here"}


def has_gemini() -> bool:
    return USE_VERTEX or GEMINI_API_KEY.lower() not in _DUMMY


def has_youtube() -> bool:
    return YOUTUBE_API_KEY.lower() not in _DUMMY


def key_status() -> dict:
    return {"gemini": has_gemini(), "youtube": has_youtube(),
            "ai_backend": "vertex-ai" if USE_VERTEX else "gemini-api-key"}
