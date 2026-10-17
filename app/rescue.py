"""Tutorial Rescue — turn an old YouTube tutorial into today's steps.

Two passes: (1) extract the tutorial's steps from the video itself
(YouTube-URL ingestion), falling back to the transcript; (2) re-check each
step against current official docs via Search grounding."""
from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel

from . import gemini

VIDEO_RE = re.compile(
    r"(?:youtu\.be/|youtube\.com/watch\?v=|youtube\.com/shorts/)([\w-]{11})"
)


class RescueStep(BaseModel):
    n: int
    instruction: str
    status: Literal["current", "changed", "unverifiable"]
    note: str


class Rescue(BaseModel):
    video_title: str
    published_hint: str
    source: Literal["video", "transcript"]
    steps: list[RescueStep]


class _ExtractedStep(BaseModel):
    n: int
    instruction: str


class _Extracted(BaseModel):
    video_title: str
    published_hint: str
    tool_name: str
    steps: list[_ExtractedStep]


class _VerifiedStep(BaseModel):
    n: int
    status: Literal["current", "changed", "unverifiable"]
    note: str


class _Verified(BaseModel):
    steps: list[_VerifiedStep]


EXTRACT_PROMPT = """This is a tech tutorial a creator is following. Extract:
- video_title: the tutorial's title (or your best short description)
- published_hint: any clue about when it was made ("UI shows 2022", "mentions
  version 5") or "unknown"
- tool_name: the main product/tool being taught (e.g. "Google Sites")
- steps: the concrete actions the viewer is told to do, in order, each as one
  imperative sentence. 3-12 steps. Skip intro/outro chatter.
"""

TRANSCRIPT_PROMPT = EXTRACT_PROMPT + "\n\nTRANSCRIPT:\n{transcript}\n"

VERIFY_PROMPT = """A creator is following a tutorial about {tool}. For each
step below, check against the CURRENT official documentation and UI of {tool}
(search for it) whether the step still works exactly as written today.

For each step return:
- status: "current" (still right), "changed" (the UI/flow is different now),
  or "unverifiable" (docs don't say)
- note: for "changed", what to do TODAY instead, one sentence, naming the
  current menu/button; for "current", ""; for "unverifiable", what to watch for.

Steps:
{steps}
"""


def video_id(url: str) -> str:
    m = VIDEO_RE.search(url.strip())
    if not m:
        raise ValueError(
            "That doesn't look like a YouTube video URL. "
            "Paste a link like youtube.com/watch?v=… or youtu.be/…"
        )
    return m.group(1)


def _extract_from_video(url: str) -> _Extracted:
    from google.genai import types

    part = types.Part(file_data=types.FileData(file_uri=url, mime_type="video/mp4"))
    return gemini.generate_json(EXTRACT_PROMPT, _Extracted, parts=[part])


def _extract_from_transcript(vid: str) -> _Extracted:
    # youtube-transcript-api >= 1.0 instance API
    from youtube_transcript_api import YouTubeTranscriptApi

    fetched = YouTubeTranscriptApi().fetch(vid, languages=["en", "hi"])
    text = " ".join(snippet.text for snippet in fetched)[:30000]
    return gemini.generate_json(TRANSCRIPT_PROMPT.format(transcript=text), _Extracted)


def analyze(tutorial_url: str) -> Rescue:
    vid = video_id(tutorial_url)
    canonical = f"https://www.youtube.com/watch?v={vid}"
    source = "video"
    try:
        ex = _extract_from_video(canonical)
    except gemini.GeminiKeyMissing:
        raise  # no key — surface it, don't mask it behind the fallback
    except Exception:
        source = "transcript"
        ex = None
    if ex is None:
        try:
            ex = _extract_from_transcript(vid)
        except gemini.GeminiError:
            raise
        except Exception as e:
            raise gemini.GeminiError(
                f"Could not read the video or its transcript ({type(e).__name__}). "
                "Is the video public and does it have captions?"
            ) from e

    steps_text = "\n".join(f"{s.n}. {s.instruction}" for s in ex.steps)
    freshness_note = ""
    try:
        verified = gemini.generate_json(
            VERIFY_PROMPT.format(tool=ex.tool_name, steps=steps_text),
            _Verified,
            grounding=True,
        )
        vmap = {v.n: v for v in verified.steps}
    except gemini.GeminiError:
        # grounding quota/outage: return the extracted steps honestly unverified
        vmap = {}
        freshness_note = ("freshness check unavailable right now (search quota) — "
                          "steps extracted from the video but NOT verified against current docs")
    return Rescue(
        video_title=ex.video_title,
        published_hint=ex.published_hint,
        source=source,
        steps=[
            RescueStep(
                n=s.n,
                instruction=s.instruction,
                status=vmap[s.n].status if s.n in vmap else "unverifiable",
                note=vmap[s.n].note if s.n in vmap else (freshness_note or "could not verify this step"),
            )
            for s in ex.steps
        ],
    )
