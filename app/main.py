from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, context, guide, linkdoctor, live, planner, pulse, rescue, studio, verifier
from . import store
from .gemini import GeminiError, GeminiKeyMissing
from .youtube import ChannelNotFound, YouTubeError


def _gemini_http(e: GeminiError):
    code = 503 if isinstance(e, GeminiKeyMissing) else 502
    return HTTPException(code, str(e))

app = FastAPI(title="Raahi")
STATIC = Path(__file__).resolve().parent.parent / "static"

# -- minimal per-IP rate limit: 40 API requests / 60 s (demo-grade, in-memory) --
import time as _time
from collections import defaultdict, deque

_hits: dict[str, deque] = defaultdict(deque)


@app.middleware("http")
async def _rate_limit(request, call_next):
    if request.url.path.startswith("/api/"):
        ip = (request.client.host if request.client else "?")
        q = _hits[ip]
        now = _time.time()
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= 40:
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "Rate limit: 40 requests/minute. Try again shortly."}, status_code=429)
        q.append(now)
    return await call_next(request)


try:
    VERSION = (Path(__file__).resolve().parent.parent / "VERSION").read_text().strip()
except OSError:
    VERSION = "0.1.0"


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "version": VERSION,
        "models": {"text": config.MODEL_TEXT, "live": config.MODEL_LIVE},
        "keys": config.key_status(),
    }


class LinkDoctorIn(BaseModel):
    channel: str
    force: bool = False


@app.post("/api/linkdoctor")
async def api_linkdoctor(body: LinkDoctorIn) -> linkdoctor.LinkReport:
    try:
        return await linkdoctor.scan(body.channel, force=body.force)
    except ChannelNotFound as e:
        raise HTTPException(400, str(e))
    except YouTubeError as e:
        raise HTTPException(503, str(e))


class DecideIn(BaseModel):
    goal: str
    answers: dict = {}
    handle: str = ""  # creator identity, when known — feeds the context engine


@app.post("/api/decide")
def api_decide(body: DecideIn) -> planner.Decision:
    skills: list[str] = []
    if body.handle:
        skills = context.get_profile(body.handle).get("skills_learned", [])
    try:
        d = planner.decide(body.goal, body.answers, known_skills=skills)
    except GeminiError as e:
        raise _gemini_http(e)
    if body.handle and not d.clarifying_questions:
        context.record_decision(body.handle, body.goal, d.recommendation)
    return d


class VerifyIn(BaseModel):
    type: str
    target: str
    expect: str = ""


@app.post("/api/verify")
async def api_verify(body: VerifyIn) -> verifier.CheckResult:
    return await verifier.check(body.type, body.target, body.expect)


class LearnIn(BaseModel):
    handle: str
    concept: str


@app.post("/api/context/learn")
def api_learn(body: LearnIn):
    context.learn_skill(body.handle, body.concept)
    return {"ok": True}


class GuideIn(BaseModel):
    decision: dict | None = None
    current_step: int = 1
    history: list[dict] = []
    message: str
    screenshot_b64: str | None = None


@app.post("/api/guide")
def api_guide(body: GuideIn) -> guide.GuideReply:
    try:
        return guide.respond(
            body.decision, body.current_step, body.history, body.message, body.screenshot_b64
        )
    except GeminiError as e:
        raise _gemini_http(e)


class RescueIn(BaseModel):
    url: str
    lang: str = "en"
    force: bool = False  # re-check against today's docs, ignoring the 7-day cache


@app.post("/api/rescue/extract")
def api_rescue_extract(body: RescueIn) -> rescue.Extraction:
    """Stage 1 alone, so the UI can show the video's steps while they're checked."""
    try:
        return rescue.extract(body.url)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except GeminiError as e:
        raise _gemini_http(e)


@app.post("/api/rescue")
def api_rescue(body: RescueIn) -> rescue.Rescue:
    try:
        return rescue.analyze(body.url, body.lang, body.force)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except GeminiError as e:
        raise _gemini_http(e)


class PulseIn(BaseModel):
    channel: str
    domain: str = ""
    lang: str = "en"


@app.post("/api/pulse")
async def api_pulse(body: PulseIn) -> pulse.PulseReport:
    try:
        return await pulse.run(body.channel, body.domain, body.lang)
    except ChannelNotFound as e:
        raise HTTPException(400, str(e))
    except YouTubeError as e:
        raise HTTPException(503, str(e))
    except GeminiError as e:
        raise _gemini_http(e)


@app.get("/api/context/{handle}")
def api_context(handle: str):
    doc = context.get_profile(handle)
    return {"backend": store.backend(), **doc}


class StudioIn(BaseModel):
    url: str
    instruction: str = ""


@app.post("/api/studio/plan")
def api_studio_plan(body: StudioIn) -> studio.StudioPlan:
    try:
        return studio.plan(body.url, body.instruction)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except GeminiError as e:
        raise _gemini_http(e)


@app.websocket("/ws/live")
async def ws_live(ws: WebSocket):
    await live.live_session(ws)


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return FileResponse(STATIC / "logo.png")


app.mount("/static", StaticFiles(directory=STATIC), name="static")
