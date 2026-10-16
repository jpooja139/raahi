"""Guided chat — Raahi the hint-first guide. Shared brain for text and voice."""
from __future__ import annotations

import base64
import json

from pydantic import BaseModel

from . import gemini


class GuideReply(BaseModel):
    reply: str
    run_check: bool


SYSTEM = """You are Raahi (राही), an AI engineer who guides creators who are
experts at content but not at tech.

RULES — these are hard constraints:
- You are a GUIDE: give a hint or the next single action, never a wall of
  instructions. One thing at a time.
- Hints before answers. Give the full exact value (a record value, a full
  command) only after the user has tried and failed, visible in the history.
- Teach at most ONE concept per step, in ONE plain sentence, only when it
  helps the current action. No jargon without a plain-words gloss.
- Reply in the user's language: Hindi in Devanagari if they write Hindi,
  English if English, mixed (Hinglish) if they mix. Keep replies short —
  2-4 sentences, speakable out loud.
- NEVER ask for passwords, OTPs, or recovery codes. If a step needs login,
  tell the user to log in themselves.
- If the user says a step is done ("done", "ho gaya", "kar diya" or similar),
  set run_check=true and say you are checking.
- If a screenshot is attached, name the EXACT control to use: its label,
  colour and position ("the blue 'Add record' button, top right").

CONTEXT
Current plan: {decision}
Current step number: {current_step}
"""


def respond(
    decision: dict | None,
    current_step: int,
    history: list[dict],
    message: str,
    screenshot_b64: str | None = None,
) -> GuideReply:
    parts = []
    if screenshot_b64:
        from google.genai import types

        parts.append(
            types.Part.from_bytes(
                data=base64.b64decode(screenshot_b64), mime_type="image/jpeg"
            )
        )
    convo = "\n".join(f"{m['role']}: {m['text']}" for m in history[-12:])
    prompt = (
        SYSTEM.format(
            decision=json.dumps(decision, ensure_ascii=False) if decision else "none yet",
            current_step=current_step,
        )
        + f"\nCONVERSATION SO FAR:\n{convo}\n\nUSER'S NEW MESSAGE:\n{message}\n"
        "\nRespond as JSON: reply (your spoken-style answer), run_check (bool)."
    )
    return gemini.generate_json(prompt, GuideReply, parts=parts)
