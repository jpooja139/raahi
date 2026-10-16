from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, guide, linkdoctor, planner, verifier
from .gemini import GeminiError
from .youtube import ChannelNotFound, YouTubeError


def _gemini_http(e: GeminiError):
    code = 503 if "missing" in str(e) else 502
    return HTTPException(code, str(e))

app = FastAPI(title="Raahi")
STATIC = Path(__file__).resolve().parent.parent / "static"


@app.get("/api/health")
def health():
    return {
        "ok": True,
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


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")
