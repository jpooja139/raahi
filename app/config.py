"""Central configuration — the ONLY place model IDs and API keys live."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")

# Verified against https://ai.google.dev/gemini-api/docs/models on 2026-10-16.
MODEL_TEXT = "gemini-3.8-flash"
MODEL_LIVE = "gemini-3.8-live"

_DUMMY = {"", "dummy", "changeme", "your-key-here"}


def has_gemini() -> bool:
    return GEMINI_API_KEY.lower() not in _DUMMY


def has_youtube() -> bool:
    return YOUTUBE_API_KEY.lower() not in _DUMMY


def key_status() -> dict:
    return {"gemini": has_gemini(), "youtube": has_youtube()}
