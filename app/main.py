from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, linkdoctor
from .youtube import ChannelNotFound, YouTubeError

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


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")
