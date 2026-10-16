"""Link Doctor — scan a channel's video descriptions for dead links."""
from __future__ import annotations

import asyncio
import re
from typing import Literal

import httpx
from pydantic import BaseModel

from .youtube import Video, list_videos, resolve_channel

URL_RE = re.compile(r"https?://[^\s<>()\"']+")
STRIP_TRAIL = ".,);:!?'\"”’»"

CHECK_TIMEOUT = 8.0
MAX_CONCURRENT = 20
UA = {"User-Agent": "Mozilla/5.0 (RaahiLinkDoctor)"}


class LinkItem(BaseModel):
    video_title: str
    video_views: int
    url: str
    status: Literal["ok", "broken", "warn"]
    http_code: int | None


class LinkReport(BaseModel):
    channel_title: str
    videos_scanned: int
    links_checked: int
    broken: int
    warned: int
    items: list[LinkItem]


def extract_links(videos: list[Video]) -> list[tuple[Video, str]]:
    pairs = []
    for v in videos:
        seen = set()
        for raw in URL_RE.findall(v.description):
            url = raw.rstrip(STRIP_TRAIL)
            if url not in seen:
                seen.add(url)
                pairs.append((v, url))
    return pairs


def classify(code: int | None) -> str:
    if code is None:
        return "broken"
    if code in (404, 410):
        return "broken"
    if 200 <= code < 400:
        return "ok"
    # 403/405/429, 5xx and other 4xx: likely bot-blocking, never call it broken
    return "warn"


async def _check(cx: httpx.AsyncClient, sem: asyncio.Semaphore, url: str) -> int | None:
    async with sem:
        try:
            r = await cx.head(url, follow_redirects=True)
            if r.status_code in (405, 501, 403):
                r = await cx.get(url, follow_redirects=True)
            return r.status_code
        except Exception:
            # malformed URLs (httpx.InvalidURL) and network errors alike:
            # one bad link must never kill the whole scan
            try:
                r = await cx.get(url, follow_redirects=True)
                return r.status_code
            except Exception:
                return None


async def scan(channel_url: str, max_videos: int = 50) -> LinkReport:
    channel = await resolve_channel(channel_url)
    videos = await list_videos(channel, max_videos)
    pairs = extract_links(videos)

    # creators paste the same link block into every description — check each
    # unique URL once, then map the result back to every video that carries it
    unique_urls = list({u for _, u in pairs})
    sem = asyncio.Semaphore(MAX_CONCURRENT)
    async with httpx.AsyncClient(timeout=CHECK_TIMEOUT, headers=UA) as cx:
        codes = await asyncio.gather(*(_check(cx, sem, u) for u in unique_urls))
    code_by_url = dict(zip(unique_urls, codes))

    items = [
        LinkItem(
            video_title=v.title,
            video_views=v.views,
            url=u,
            status=classify(code_by_url[u]),
            http_code=code_by_url[u],
        )
        for (v, u) in pairs
    ]
    rank = {"broken": 0, "warn": 1, "ok": 2}
    items.sort(key=lambda i: (rank[i.status], -i.video_views))
    return LinkReport(
        channel_title=channel.title,
        videos_scanned=len(videos),
        links_checked=len(items),
        broken=sum(1 for i in items if i.status == "broken"),
        warned=sum(1 for i in items if i.status == "warn"),
        items=items,
    )
