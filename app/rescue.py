"""Tutorial Rescue — an old YouTube tutorial, re-checked step by step.

Every stage leaves something a person can check:
1. extract   Gemini watches the video (falling back to the timed transcript)
             and lists the steps with the m:ss where each one is shown.
2. verify    Search-grounded calls (VERIFY_BATCH steps each, run in parallel)
             answer in a fixed STEP-block format, parsed with a regex — no
             second LLM pass re-wording the answer.
3. evidence  each step's sources come from the grounding metadata's byte-offset
             supports, never from what the model writes about its sources.
4. validate  a "current"/"changed" verdict with no source behind it becomes
             "unverifiable"; timestamps past the video's end are dropped.
5. update    the pin-ready "what changed" comment is a template filled from
             validated steps only — the model never writes the public comment.
"""
from __future__ import annotations

import asyncio
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel

from . import gemini, store, youtube

VIDEO_RE = re.compile(
    r"(?:youtu\.be/|youtube\.com/watch\?(?:.*&)?v=|youtube\.com/(?:shorts|live|embed)/)([\w-]{11})"
)
CACHE_DAYS = 7          # a verdict is "as of" its check date; re-check weekly
MAX_STEPS = 12
MAX_SOURCES = 3
VIDEO_RESOLUTION = "low"  # menu names were read correctly in all 26 eval videos; higher resolutions not compared
VERIFY_BATCH = 4          # steps per grounded call; batches run in parallel
VERIFY_THINKING = "low"   # with batching: ~108 s -> ~12 s on one 10-step video; accuracy at default thinking not compared

Status = Literal["current", "changed", "unverifiable"]
Lang = Literal["en", "hi"]


class Source(BaseModel):
    title: str
    domain: str
    uri: str
    official: bool = False    # domain belongs to the tool's own vendor (string match, not model opinion)


class ExtractedStep(BaseModel):
    n: int
    t: str
    instruction: str


class Extraction(BaseModel):
    video_id: str
    video_title: str
    published: str            # YYYY-MM-DD from the YouTube API, else the model's on-screen hint
    duration_s: int | None
    tool: str
    official_domains: list[str] = []
    source: Literal["video", "transcript"]
    steps: list[ExtractedStep]


class RescueStep(BaseModel):
    n: int
    t: str = ""               # m:ss where the old video shows this step; "" if unknown
    seconds: int | None = None
    instruction: str          # what the old video says to do
    status: Status
    today: str                # changed: do this instead · current: confirmation · unverifiable: what to watch for
    sources: list[Source] = []
    downgraded: bool = False  # the model gave a verdict, but no source backed it


class Rescue(BaseModel):
    video_id: str
    video_title: str
    published: str
    tool: str
    source: Literal["video", "transcript"]
    lang: Lang
    checked_at: str
    steps: list[RescueStep]
    counts: dict[str, int]
    search_queries: list[str] = []
    search_entry_html: str = ""   # Google Search suggestions; shown with grounded results
    update_card: str = ""
    note: str = ""


class _LLMStep(BaseModel):
    t: str
    instruction: str


class _LLMExtraction(BaseModel):
    video_title: str
    published_hint: str
    tool_name: str
    official_domains: list[str]
    steps: list[_LLMStep]


EXTRACT_PROMPT = """You are watching a software tutorial that a viewer is following step by step.
Return:
- video_title: the tutorial's title (or a short description)
- published_hint: on-screen clues to when it was recorded (a date, a version number,
  an old logo or UI), or "unknown"
- tool_name: the main product being taught, e.g. "Google Sites"
- official_domains: 1-3 bare domains its maker publishes help on, e.g. ["google.com"]
  or ["obsproject.com"]; [] if unsure
- steps: 3-12 concrete actions the viewer is told to perform, in order. For each:
  - t: the m:ss (or h:mm:ss) in the video where the action is shown on screen
  - instruction: one imperative sentence naming the exact menu, button, option or
    product as it appears in the video, e.g. "Click Settings > Custom domains > Start setup"
  Merge trivial clicks into one step. Skip intro, outro and sponsor segments.
"""

TRANSCRIPT_PROMPT = EXTRACT_PROMPT + """
You cannot see the video, only its transcript. Each line starts with [m:ss]; use it for t.

TRANSCRIPT:
{transcript}
"""

VERIFY_PROMPT = """An old {tool} tutorial (published {published}) is being followed today, {today}.
Search the web, preferring {tool}'s official help pages and documentation, and check each
step below against how {tool} works TODAY.

Reply with exactly one block per step, in this format and nothing else:

STEP <n>: <current|changed|unverifiable>
TODAY: <one sentence, {lang_rule}>

- current: a viewer following the step as written would still succeed. A button whose
  wording differs slightly but sits in the same place is current; name the new label
  in TODAY.
- changed: a viewer following the step as written would get stuck, because the menu,
  button, option, plan or product was removed, replaced, or moved somewhere they would
  not find it. Only answer changed when a page you found describes the new way or says
  the old way is gone. TODAY says exactly what to do instead, naming today's menu or button.
- unverifiable: you found nothing current that confirms or contradicts the step. Not
  finding the old option mentioned is NOT evidence that it changed.
  TODAY says what to look out for.
Base every verdict on what you found, not on memory.

Steps:
{steps}
"""

LANG_RULE = {
    "en": "in English",
    "hi": "in simple Hindi (Devanagari), keeping product, menu and button names in English "
          "exactly as they appear on screen",
}
NOT_CHECKED = {
    "en": "Not checked: the search pass returned no verdict for this step.",
    "hi": "जाँच नहीं हो पाई: इस स्टेप के लिए सर्च से कोई जवाब नहीं मिला।",
}
UNAVAILABLE = {
    "en": "The freshness check is unavailable right now. These are the video's steps, NOT verified "
          "against current docs.",
    "hi": "आज के docs से जाँच अभी उपलब्ध नहीं है। ये वीडियो के स्टेप हैं, इनकी जाँच नहीं हुई है।",
}
PARTIAL = {
    "en": "Some steps couldn't be checked right now; they are marked unverifiable.",
    "hi": "कुछ स्टेप अभी जाँचे नहीं जा सके; उन्हें 'पुष्टि नहीं' दिखाया गया है।",
}
MONTHS_HI = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त",
             "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"]


# ---------- pure helpers (unit-tested in tests/test_rescue.py) ----------

def video_id(url: str) -> str:
    m = VIDEO_RE.search(url.strip())
    if not m:
        raise ValueError(
            "That doesn't look like a YouTube video URL. "
            "Paste a link like youtube.com/watch?v=… or youtu.be/…"
        )
    return m.group(1)


def parse_ts(t: str) -> int | None:
    """'2:14' / '02:14' / '1:02:14' → seconds; anything else → None."""
    m = re.fullmatch(r"\s*(?:(\d{1,2}):)?(\d{1,3}):(\d{2})\s*", t or "")
    if not m or int(m.group(3)) >= 60:
        return None
    h, mi, s = int(m.group(1) or 0), int(m.group(2)), int(m.group(3))
    return h * 3600 + mi * 60 + s


def fmt_ts(sec: int) -> str:
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def iso_duration(d: str) -> int | None:
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", d or "")
    if not m or not any(m.groups()):
        return None
    dd, h, mi, s = (int(x or 0) for x in m.groups())
    return dd * 86400 + h * 3600 + mi * 60 + s


_BLOCK = re.compile(
    r"^[ \t>*#_-]*STEP[ \t*_]*(\d+)[ \t*_]*[:.\-–—][ \t*_]*(current|changed|unverifiable)\b",
    re.I | re.M,
)
_TODAY = re.compile(r"TODAY[ \t*_]*:[ \t*_]*(.+?)(?:\n[ \t]*\n|\Z)", re.I | re.S)


def parse_blocks(text: str) -> dict[int, dict]:
    """STEP blocks → {n: {status, today, b0, b1}}. b0/b1 are UTF-8 BYTE offsets,
    because grounding supports index the response's bytes, not its characters
    (they differ as soon as the answer contains Hindi)."""
    found = list(_BLOCK.finditer(text))
    out: dict[int, dict] = {}
    for i, m in enumerate(found):
        c0 = m.start()
        c1 = found[i + 1].start() if i + 1 < len(found) else len(text)
        n = int(m.group(1))
        if n in out:
            continue  # first verdict for a step wins
        tm = _TODAY.search(text[m.end():c1])
        today = " ".join(tm.group(1).split()).strip(" *_") if tm else ""
        out[n] = {
            "status": m.group(2).lower(),
            "today": today,
            "b0": len(text[:c0].encode("utf-8")),
            "b1": len(text[:c1].encode("utf-8")),
        }
    return out


def _source(web) -> Source:
    uri = web.uri or ""
    domain = (getattr(web, "domain", None) or web.title or urlparse(uri).hostname or "").strip()
    return Source(title=(web.title or domain).strip(), domain=domain, uri=uri)


def sources_by_step(blocks: dict[int, dict], gm) -> dict[int, list[Source]]:
    """Attach each grounding support to the STEP block its segment starts in."""
    out: dict[int, list[Source]] = {n: [] for n in blocks}
    if gm is None:
        return out
    chunks = gm.grounding_chunks or []
    for sup in gm.grounding_supports or []:
        seg = sup.segment
        if seg is None or seg.end_index is None:
            continue
        start = seg.start_index or 0
        for n, b in blocks.items():
            if b["b0"] <= start < b["b1"]:
                for ci in sup.grounding_chunk_indices or []:
                    web = chunks[ci].web if 0 <= ci < len(chunks) else None
                    if web is None or not web.uri:
                        continue
                    src = _source(web)
                    if all(s.uri != src.uri for s in out[n]):
                        out[n].append(src)
                break
    return {n: v[:MAX_SOURCES] for n, v in out.items()}


def root_domain(d: str) -> str:
    """'https://support.google.com/x' / 'www.Google.com' → 'google.com';
    'help.example.co.uk' → 'example.co.uk'."""
    d = (urlparse(d).hostname if "//" in d else d.split("/")[0]) or ""
    labels = [x for x in d.lower().strip(".").split(".") if x and x != "www"]
    if len(labels) >= 3 and len(labels[-1]) == 2 and labels[-2] in {"co", "com", "org", "net", "gov", "ac", "edu"}:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def mark_official(sources: dict[int, list[Source]], official_domains: list[str]) -> dict[int, list[Source]]:
    """Flag sources on the tool vendor's own domain and list them first."""
    roots = {root_domain(d) for d in official_domains if root_domain(d)}
    out = {}
    for n, ss in sources.items():
        for s in ss:
            s.official = root_domain(s.domain) in roots
        out[n] = sorted(ss, key=lambda s: not s.official)
    return out


def validate(steps: list[ExtractedStep], blocks: dict[int, dict],
             sources: dict[int, list[Source]], duration_s: int | None,
             lang: str = "en") -> list[RescueStep]:
    """The model proposes; this decides what may be shown as fact."""
    out = []
    for s in steps:
        sec = parse_ts(s.t)
        if sec is not None and duration_s and sec > duration_s:
            sec = None  # a timestamp past the end of the video is invented
        b = blocks.get(s.n)
        src = sources.get(s.n, [])
        if b is None:
            status, today, down = "unverifiable", NOT_CHECKED.get(lang, NOT_CHECKED["en"]), False
        elif b["status"] != "unverifiable" and not src:
            status, today, down = "unverifiable", b["today"], True
        else:
            status, today, down = b["status"], b["today"], False
        out.append(RescueStep(
            n=s.n, t=fmt_ts(sec) if sec is not None else "", seconds=sec,
            instruction=s.instruction, status=status, today=today,
            sources=src, downgraded=down,
        ))
    return out


def _ranges(ns: list[int]) -> str:
    """[1,2,3,5,7,8] → '1–3, 5, 7–8'."""
    parts, ns = [], sorted(ns)
    i = 0
    while i < len(ns):
        j = i
        while j + 1 < len(ns) and ns[j + 1] == ns[j] + 1:
            j += 1
        parts.append(str(ns[i]) if i == j else f"{ns[i]}–{ns[j]}")
        i = j + 1
    return ", ".join(parts)


def update_card(steps: list[RescueStep], tool: str, checked: datetime, lang: str = "en") -> str:
    """Pin-ready comment for the creator. Only sourced verdicts appear in it."""
    changed = [s for s in steps if s.status == "changed" and s.sources]
    current = [s for s in steps if s.status == "current" and s.sources]
    unsure = [s for s in steps if s not in changed and s not in current]
    if not changed and not current:
        return ""

    def at(s: RescueStep) -> str:
        return f" ({s.t})" if s.t else ""

    if lang == "hi":
        month = f"{MONTHS_HI[checked.month - 1]} {checked.year}"
        if not changed:
            lines = [f"📌 {month} में जाँचा गया: इस वीडियो के स्टेप ({_ranges([s.n for s in current])}) "
                     f"आज भी {tool} में वैसे ही काम करते हैं।"]
        else:
            lines = [f"📌 अपडेट ({month}): इस वीडियो के {len(changed)} स्टेप अब बदल गए हैं —"]
            lines += [f"• स्टेप {s.n}{at(s)}: {s.today} (स्रोत: {s.sources[0].domain})"
                      for s in changed]
            if current:
                lines.append(f"स्टेप {_ranges([s.n for s in current])} आज भी वैसे ही हैं।")
        if unsure:
            lines.append(f"स्टेप {_ranges([s.n for s in unsure])} की पुष्टि नहीं हो पाई।")
        lines.append("Raahi से आज के docs के साथ जाँचा गया।")
        return "\n".join(lines)

    month = checked.strftime("%b %Y")

    def steps_word(ss: list[RescueStep]) -> str:
        return f"Step{'s' if len(ss) > 1 else ''} {_ranges([s.n for s in ss])}"

    def work(ss: list[RescueStep]) -> str:
        return "still work" if len(ss) > 1 else "still works"

    if not changed:
        lines = [f"📌 Checked {month}: {steps_word(current)} of this video {work(current)} in {tool} today."]
    else:
        lines = [f"📌 Update ({month}): {len(changed)} step{'s' if len(changed) > 1 else ''} "
                 f"in this video changed —"]
        lines += [f"• Step {s.n}{at(s)}: {s.today} (source: {s.sources[0].domain})"
                  for s in changed]
        if current:
            lines.append(f"{steps_word(current)} {work(current)} as shown.")
    if unsure:
        lines.append(f"Couldn't confirm {steps_word(unsure).lower()} either way.")
    lines.append("Checked against today's docs with Raahi.")
    return "\n".join(lines)


def counts(steps: list[RescueStep]) -> dict[str, int]:
    return {
        "current": sum(s.status == "current" for s in steps),
        "changed": sum(s.status == "changed" for s in steps),
        "unverifiable": sum(s.status == "unverifiable" for s in steps),
        "downgraded": sum(s.downgraded for s in steps),
        "with_sources": sum(bool(s.sources) for s in steps),
        "with_official_source": sum(any(x.official for x in s.sources) for s in steps),
        "with_timestamp": sum(s.seconds is not None for s in steps),
    }


# ---------- stages that call out ----------

def _video_meta(vid: str) -> tuple[str, str, int | None]:
    """(title, published YYYY-MM-DD, duration seconds) from the YouTube Data API.
    Blanks when the API is unavailable; ValueError when the video doesn't exist."""
    try:
        data = asyncio.run(youtube._get("videos", {"part": "snippet,contentDetails", "id": vid}))
    except youtube.YouTubeError:
        return "", "", None
    items = data.get("items") or []
    if not items:
        raise ValueError("That video is private, deleted or doesn't exist.")
    sn, cd = items[0].get("snippet", {}), items[0].get("contentDetails", {})
    return sn.get("title", ""), (sn.get("publishedAt") or "")[:10], iso_duration(cd.get("duration", ""))


def _extract_from_video(url: str) -> _LLMExtraction:
    return gemini.generate_json(
        EXTRACT_PROMPT, _LLMExtraction, parts=[gemini.youtube_part(url)],
        use_key_client=True, media_resolution=VIDEO_RESOLUTION,
    )


def _extract_from_transcript(vid: str) -> _LLMExtraction:
    # youtube-transcript-api >= 1.0 instance API
    from youtube_transcript_api import YouTubeTranscriptApi

    fetched = YouTubeTranscriptApi().fetch(vid, languages=["en", "hi"])
    lines = [f"[{fmt_ts(int(sn.start))}] {sn.text}" for sn in fetched]
    text = "\n".join(lines)[:40000]
    return gemini.generate_json(TRANSCRIPT_PROMPT.format(transcript=text), _LLMExtraction)


def extract(url: str, force: bool = False) -> Extraction:
    vid = video_id(url)
    key = f"rescue_ex_{vid}"
    if not force and (doc := store.get(key)):
        try:
            return Extraction.model_validate(doc)
        except Exception:  # noqa: BLE001 — stale schema: re-extract
            pass
    title, published, duration = _video_meta(vid)
    canonical = f"https://www.youtube.com/watch?v={vid}"
    source = "video"
    try:
        llm = _extract_from_video(canonical)
    except gemini.GeminiKeyMissing:
        raise  # no key — surface it, don't mask it behind the fallback
    except Exception as e:  # noqa: BLE001 — fall back to the transcript
        print(f"[rescue] video ingestion failed for {vid}: {type(e).__name__}: {str(e)[:200]}", flush=True)
        source = "transcript"
        try:
            llm = _extract_from_transcript(vid)
        except gemini.GeminiError:
            raise
        except Exception as e2:
            raise gemini.GeminiError(
                f"Could not read the video or its transcript ({type(e2).__name__}). "
                "Is the video public and does it have captions?"
            ) from e2
    steps = [ExtractedStep(n=i, t=s.t, instruction=s.instruction.strip())
             for i, s in enumerate((s for s in llm.steps if s.instruction.strip()), 1)][:MAX_STEPS]
    if not steps:
        raise gemini.GeminiError("No steps found. Is this a step-by-step tutorial?")
    ex = Extraction(
        video_id=vid, video_title=title or llm.video_title,
        published=published or llm.published_hint, duration_s=duration,
        tool=llm.tool_name, official_domains=[d for d in map(root_domain, llm.official_domains) if d][:3],
        source=source, steps=steps,
    )
    store.put(key, ex.model_dump())
    return ex


def analyze(tutorial_url: str, lang: str = "en", force: bool = False) -> Rescue:
    lang = lang if lang in LANG_RULE else "en"
    vid = video_id(tutorial_url)
    key = f"rescue_{vid}_{lang}"
    if not force and (doc := store.get(key)):
        try:
            cached = Rescue.model_validate(doc)
            age = datetime.now(timezone.utc) - datetime.fromisoformat(cached.checked_at)
            if age.days < CACHE_DAYS:
                return cached
        except Exception:  # noqa: BLE001 — stale or corrupt cache: re-check
            pass

    ex = extract(tutorial_url)
    now = datetime.now(timezone.utc)

    def check(batch: list[ExtractedStep]):
        """One grounded call for a few steps. Each batch's blocks keep the
        original step numbers, so batches merge without renumbering."""
        text, gm = gemini.generate_grounded(VERIFY_PROMPT.format(
            tool=ex.tool, published=ex.published or "date unknown",
            today=now.strftime("%d %b %Y"), lang_rule=LANG_RULE[lang],
            steps="\n".join(f"{s.n}. {s.instruction}" for s in batch),
        ), thinking=VERIFY_THINKING)
        blocks = {n: b for n, b in parse_blocks(text).items() if n in {s.n for s in batch}}
        sep = gm.search_entry_point if gm is not None else None
        return (blocks, sources_by_step(blocks, gm),
                list(gm.web_search_queries or []) if gm is not None else [],
                (sep.rendered_content or "") if sep else "")

    batches = [ex.steps[i:i + VERIFY_BATCH] for i in range(0, len(ex.steps), VERIFY_BATCH)]
    blocks, srcs, queries, entries, failed = {}, {}, [], [], 0
    with ThreadPoolExecutor(max_workers=len(batches)) as pool:
        for fut in [pool.submit(check, b) for b in batches]:
            try:
                b, s, q, e = fut.result()
            except gemini.GeminiError as err:
                print(f"[rescue] grounded verify failed for {vid}: {str(err)[:200]}", flush=True)
                failed += 1
                continue
            blocks.update(b)
            srcs.update(s)
            queries += [x for x in q if x not in queries]
            if e and e not in entries:
                entries.append(e)
    all_failed = failed == len(batches)
    note = UNAVAILABLE[lang] if all_failed else (PARTIAL[lang] if failed else "")

    steps = validate(ex.steps, blocks, mark_official(srcs, ex.official_domains), ex.duration_s, lang)
    r = Rescue(
        video_id=vid, video_title=ex.video_title, published=ex.published, tool=ex.tool,
        source=ex.source, lang=lang, checked_at=now.isoformat(timespec="seconds"),
        steps=steps, counts=counts(steps), search_queries=queries,
        search_entry_html="".join(entries), note=note,
        update_card="" if all_failed else update_card(steps, ex.tool, now, lang),
    )
    if not failed:
        store.put(key, r.model_dump())  # never cache a partial or failed check
    return r
