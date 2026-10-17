from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, context, guide, linkdoctor, live, planner, pulse, rescue, verifier
from . import store
from .gemini import GeminiError, GeminiKeyMissing
from .youtube import ChannelNotFound, YouTubeError


def _gemini_http(e: GeminiError):
    code = 503 if isinstance(e, GeminiKeyMissing) else 502
    return HTTPException(code, str(e))

app = FastAPI(title="Raahi")
STATIC = Path(__file__).resolve().parent.parent / "static"


VERSION = (Path(__file__).resolve().parent.parent / "VERSION").read_text().strip()


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


@app.post("/api/linkdoctor")
async def api_linkdoctor(body: LinkDoctorIn) -> linkdoctor.LinkReport:
    try:
        return await linkdoctor.scan(body.channel)
    except ChannelNotFound as e:
        raise HTTPException(400, str(e))
    except YouTubeError as e:
        raise HTTPException(503, str(e))


class DecideIn(BaseModel):
    goal: str
    answers: dict = {}


@app.post("/api/decide")
def api_decide(body: DecideIn) -> planner.Decision:
    try:
        return planner.decide(body.goal, body.answers)
    except GeminiError as e:
        raise _gemini_http(e)


class VerifyIn(BaseModel):
    type: str
    target: str


@app.post("/api/verify")
async def api_verify(body: VerifyIn) -> verifier.CheckResult:
    return await verifier.check(body.type, body.target)


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


@app.post("/api/rescue")
def api_rescue(body: RescueIn) -> rescue.Rescue:
    try:
        return rescue.analyze(body.url)
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
