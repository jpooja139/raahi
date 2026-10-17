"""Raahi Studio — AI video editing PLANS, honestly scoped.

What is REAL today: transcript with word-level timing → deterministic silence
detection, a real SRT caption file, and a Gemini-planned edit (cuts to keep or
drop, Shorts candidates with timecodes, pacing notes) driven by the creator's
natural-language instruction. The export pack (SRT + EDL JSON + timecodes)
works in any editor right now.

What is PLANNED (v2, never faked in the UI): cloud rendering of the plan via
FFmpeg on Cloud Run Jobs.
"""
from __future__ import annotations

from pydantic import BaseModel

from . import gemini
from .rescue import video_id

SILENCE_GAP_SEC = 1.5
MAX_TRANSCRIPT_CHARS = 16000


class Cut(BaseModel):
    start: float
    end: float
    reason: str


class Short(BaseModel):
    start: float
    end: float
    title: str
    hook: str
    reason: str


class _PlanLLM(BaseModel):
    ops_understood: list[str]
    shorts: list[Short]
    pacing_notes: list[str]
    keep_highlights: list[str]


class _VideoPlanLLM(_PlanLLM):
    duration_sec: float


class StudioPlan(BaseModel):
    video_id: str
    source: str              # "transcript" | "none"
    duration_sec: float
    ops_understood: list[str]
    silence_cuts: list[Cut]  # caption gaps (silence candidates) — from transcript timing, not audio analysis
    shorts: list[Short]      # model-selected, timestamped
    pacing_notes: list[str]
    keep_highlights: list[str]
    captions_srt: str        # real SRT built from the transcript
    render_status: str       # always "planned-v2" — honest


def _fetch_transcript(vid: str):
    from youtube_transcript_api import YouTubeTranscriptApi

    return YouTubeTranscriptApi().fetch(vid, languages=["en", "hi"])


def _srt_time(t: float) -> str:
    h, rem = divmod(int(t), 3600)
    m, s = divmod(rem, 60)
    ms = int((t - int(t)) * 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def _build_srt(snips) -> str:
    """Merge raw snippets into readable ~2-line cues. Deterministic = accurate."""
    cues, buf, start = [], [], None
    for sn in snips:
        if start is None:
            start = sn.start
        buf.append(sn.text.strip())
        end = sn.start + sn.duration
        if sum(len(b) for b in buf) > 70 or (end - start) > 5:
            cues.append((start, end, " ".join(buf)))
            buf, start = [], None
    if buf:
        last = snips[-1]
        cues.append((start, last.start + last.duration, " ".join(buf)))
    out = []
    for i, (s, e, text) in enumerate(cues, 1):
        out.append(f"{i}\n{_srt_time(s)} --> {_srt_time(e)}\n{text}\n")
    return "\n".join(out)


def _silences(snips) -> list[Cut]:
    cuts = []
    for a, b in zip(snips, snips[1:]):
        gap_start = a.start + a.duration
        gap = b.start - gap_start
        if gap >= SILENCE_GAP_SEC:
            cuts.append(Cut(start=round(gap_start, 1), end=round(b.start, 1),
                            reason=f"{gap:.1f}s caption gap (likely silence — verify in editor)"))
    return cuts[:40]


PLAN_PROMPT = """You are Raahi Studio, planning a video edit for a creator.
The creator's instruction: {instruction}

Below is the video transcript with [start-end] second timestamps. Plan ONLY
from it — never invent moments that are not in the transcript.

Return:
- ops_understood: the editing operations the instruction asks for, as short
  labels (e.g. "remove silences", "captions", "YouTube Short").
- shorts: 2-3 self-contained 20-55 second segments that would work as
  vertical Shorts. Each: exact start/end from the timestamps, a punchy title,
  the spoken "hook" line it opens with, and why it works.
- pacing_notes: 2-4 concrete observations (long monologue stretches, repeated
  explanations, where to tighten) with timestamps in the text.
- keep_highlights: 2-3 moments that must survive any edit, with timestamps.

TRANSCRIPT:
{transcript}
"""


VIDEO_PLAN_PROMPT = """You are Raahi Studio. Watch this video and plan an edit
for the creator's instruction: {instruction}

Return ops_understood, shorts (2-3 segments of 20-55s with exact start/end
seconds from the video, title, opening hook line, reason), pacing_notes (2-4,
with timestamps), keep_highlights (2-3, with timestamps), and duration_sec
(the video's total length in seconds). Only use moments that exist in the video.
"""


def _plan_from_video(url: str, vid: str, instruction: str) -> StudioPlan:
    """Cloud fallback: YouTube blocks transcript reads from cloud IPs, but
    Gemini ingests the YouTube URL itself. No SRT/caption-gaps on this path."""
    from google.genai import types

    part = types.Part(file_data=types.FileData(file_uri=f"https://www.youtube.com/watch?v={vid}", mime_type="video/mp4"))
    llm = gemini.generate_json(
        VIDEO_PLAN_PROMPT.format(instruction=instruction or "find the best Shorts"),
        _VideoPlanLLM,
        parts=[part],
        use_key_client=True,  # YouTube ingestion: Gemini API only, not Vertex
    )
    return StudioPlan(
        video_id=vid, source="video", duration_sec=max(llm.duration_sec, 1),
        ops_understood=llm.ops_understood,
        silence_cuts=[],
        shorts=[x for x in llm.shorts if x.end > x.start and x.end - x.start <= 75][:3],
        pacing_notes=llm.pacing_notes[:4], keep_highlights=llm.keep_highlights[:3],
        captions_srt="", render_status="planned-v2",
    )


def plan(url: str, instruction: str) -> StudioPlan:
    vid = video_id(url)
    try:
        snips = list(_fetch_transcript(vid))
    except Exception:
        return _plan_from_video(url, vid, instruction)

    duration = snips[-1].start + snips[-1].duration
    srt = _build_srt(snips)
    stamped = " ".join(
        f"[{sn.start:.0f}-{sn.start + sn.duration:.0f}] {sn.text.strip()}"
        for sn in snips
    )[:MAX_TRANSCRIPT_CHARS]

    llm = gemini.generate_json(
        PLAN_PROMPT.format(instruction=instruction or "remove silences, captions, one Short", transcript=stamped),
        _PlanLLM,
    )
    return StudioPlan(
        video_id=vid,
        source="transcript",
        duration_sec=round(duration, 1),
        ops_understood=llm.ops_understood,
        silence_cuts=_silences(snips),
        shorts=[s for s in llm.shorts if s.end > s.start and s.end - s.start <= 75][:3],
        pacing_notes=llm.pacing_notes[:4],
        keep_highlights=llm.keep_highlights[:3],
        captions_srt=srt,
        render_status="planned-v2",
    )
