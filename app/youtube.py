"""YouTube Data API v3 access — API key only, no OAuth. Disk-cached 24 h."""
from __future__ import annotations

import hashlib
import json
import re
import time
from pathlib import Path

import httpx
from pydantic import BaseModel

from . import config

API = "https://www.googleapis.com/youtube/v3"
CACHE_DIR = Path(__file__).resolve().parent.parent / "cache"
CACHE_TTL = 24 * 3600

ACCEPTED_FORMS = (
    "Accepted forms: @handle, youtube.com/@handle, youtube.com/channel/UC…, "
    "youtube.com/c/name, youtube.com/user/name, or any video URL from the channel."
)


class YouTubeError(Exception):
    pass


class ChannelNotFound(YouTubeError):
    pass


class ChannelInfo(BaseModel):
    channel_id: str
    title: str
    uploads_playlist_id: str


class Video(BaseModel):
    video_id: str
    title: str
    views: int
    description: str


async def _get(resource: str, params: dict) -> dict:
    if not config.has_youtube():
        raise YouTubeError(
            "YOUTUBE_API_KEY missing — paste your real key into raahi/.env and retry."
        )
    full = {**params, "key": config.YOUTUBE_API_KEY}
    cache_key = hashlib.sha1(
        (resource + json.dumps(full, sort_keys=True)).encode()
    ).hexdigest()
    cache_file = CACHE_DIR / f"{cache_key}.json"
    if cache_file.exists() and time.time() - cache_file.stat().st_mtime < CACHE_TTL:
        return json.loads(cache_file.read_text())

    async with httpx.AsyncClient(timeout=15) as cx:
        resp = await cx.get(f"{API}/{resource}", params=full)
    if resp.status_code == 403:
        raise YouTubeError(
            "YouTube API refused the key (quota exhausted, or the key is wrong / "
            "the API is not enabled on the project)."
        )
    if resp.status_code != 200:
        raise YouTubeError(f"YouTube API error {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    CACHE_DIR.mkdir(exist_ok=True)
    cache_file.write_text(json.dumps(data))
    return data


def parse_channel_ref(url_or_handle: str) -> tuple[str, str]:
    """Return (kind, value): kind in handle|id|user|custom|video."""
    s = url_or_handle.strip()
    if m := re.search(r"(?:youtube\.com/|^)@([\w.-]+)", s):
        return "handle", m.group(1)
    if m := re.search(r"youtube\.com/channel/(UC[\w-]+)", s):
        return "id", m.group(1)
    if m := re.search(r"^(UC[\w-]{20,})$", s):
        return "id", m.group(1)
    if m := re.search(r"youtube\.com/user/([\w.-]+)", s):
        return "user", m.group(1)
    if m := re.search(r"youtube\.com/c/([\w.-]+)", s):
        return "custom", m.group(1)
    if m := re.search(r"(?:youtu\.be/|youtube\.com/watch\?v=|youtube\.com/shorts/)([\w-]{11})", s):
        return "video", m.group(1)
    raise ChannelNotFound(f"Could not read '{s}' as a channel. {ACCEPTED_FORMS}")


def _channel_from_items(data: dict, ref: str) -> ChannelInfo:
    items = data.get("items") or []
    if not items:
        raise ChannelNotFound(f"No channel found for '{ref}'. {ACCEPTED_FORMS}")
    it = items[0]
    return ChannelInfo(
        channel_id=it["id"],
        title=it["snippet"]["title"],
        uploads_playlist_id=it["contentDetails"]["relatedPlaylists"]["uploads"],
    )


async def resolve_channel(url_or_handle: str) -> ChannelInfo:
    kind, value = parse_channel_ref(url_or_handle)
    part = {"part": "snippet,contentDetails"}
    if kind == "handle":
        return _channel_from_items(
            await _get("channels", {**part, "forHandle": "@" + value}), value
        )
    if kind == "id":
        return _channel_from_items(await _get("channels", {**part, "id": value}), value)
    if kind == "user":
        return _channel_from_items(
            await _get("channels", {**part, "forUsername": value}), value
        )
    if kind == "video":
        vids = await _get("videos", {"part": "snippet", "id": value})
        items = vids.get("items") or []
        if not items:
            raise ChannelNotFound(f"Video '{value}' not found. {ACCEPTED_FORMS}")
        cid = items[0]["snippet"]["channelId"]
        return _channel_from_items(await _get("channels", {**part, "id": cid}), value)
    # custom /c/ name: search, take the top channel hit
    found = await _get(
        "search", {"part": "snippet", "q": value, "type": "channel", "maxResults": 1}
    )
    items = found.get("items") or []
    if not items:
        raise ChannelNotFound(f"No channel found for '{value}'. {ACCEPTED_FORMS}")
    cid = items[0]["snippet"]["channelId"]
    return _channel_from_items(await _get("channels", {**part, "id": cid}), value)


async def list_videos(channel: ChannelInfo, max_videos: int = 50) -> list[Video]:
    pl = await _get(
        "playlistItems",
        {
            "part": "contentDetails",
            "playlistId": channel.uploads_playlist_id,
            "maxResults": min(max_videos, 50),
        },
    )
    ids = [it["contentDetails"]["videoId"] for it in pl.get("items", [])]
    if not ids:
        return []
    vids = await _get(
        "videos", {"part": "snippet,statistics", "id": ",".join(ids)}
    )
    out = []
    for it in vids.get("items", []):
        out.append(
            Video(
                video_id=it["id"],
                title=it["snippet"]["title"],
                views=int(it.get("statistics", {}).get("viewCount", 0)),
                description=it["snippet"].get("description", ""),
            )
        )
    return out
