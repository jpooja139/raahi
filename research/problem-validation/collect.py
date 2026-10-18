"""Collect public YouTube data to test which creator problem is real.

Cohorts (YouTube Data API v3 search, order=viewCount, relevanceLanguage=en):
  B_old / B_new : software-setup tutorials, published 2019-2022 vs last 6 months
  C_old / C_new : affiliate-heavy product videos, same windows

Per video: metadata (videos.list) + up to 100 top comments (order=relevance)
+ up to 100 newest comments (order=time, old cohorts only), with replies the
API includes in the thread. Commenter names/ids are NOT stored; only whether
the author is the video's own channel.

Usage:  python -I collect.py        (writes raw/*.json; ~4.5k quota units)
"""
from __future__ import annotations

import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
API = "https://www.googleapis.com/youtube/v3"


def _key() -> str:
    env = HERE.parent / "raahi" / ".env"
    for line in env.read_text(encoding="utf-8").splitlines():
        if line.startswith("YOUTUBE_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    sys.exit("YOUTUBE_API_KEY not found in raahi/.env")


KEY = _key()
OLD = ("2019-01-01T00:00:00Z", "2023-01-01T00:00:00Z")
NEW = ("2026-04-18T00:00:00Z", None)

QUERIES = {
    "B": [
        "how to connect custom domain to google sites",
        "google analytics setup tutorial",
        "how to create facebook business page",
        "how to set up instagram business account",
        "wordpress website tutorial for beginners",
        "shopify store setup tutorial",
        "canva tutorial for beginners",
        "obs studio setup tutorial",
        "google search console setup",
        "youtube channel monetization setup",
    ],
    "C": [
        "best budget earbuds",
        "amazon must haves",
        "desk setup tour",
        "best budget microphone for youtube",
        "best phone under 15000",
        "kitchen gadgets from amazon",
    ],
}
PER_QUERY = 20


class QuotaExceeded(Exception):
    pass


def get(resource: str, **params) -> dict | None:
    """GET with the key; never prints the URL (it contains the key)."""
    params["key"] = KEY
    for attempt in range(3):
        try:
            r = httpx.get(f"{API}/{resource}", params=params, timeout=30)
        except httpx.HTTPError as e:
            print(f"  {resource}: {type(e).__name__}, retry {attempt + 1}")
            time.sleep(2)
            continue
        if r.status_code == 200:
            return r.json()
        try:
            reason = r.json()["error"]["errors"][0]["reason"]
        except Exception:
            reason = str(r.status_code)
        if reason in ("quotaExceeded", "dailyLimitExceeded"):
            raise QuotaExceeded(reason)
        if reason in ("commentsDisabled", "videoNotFound", "forbidden"):
            return {"_error": reason}
        print(f"  {resource}: HTTP {r.status_code} {reason}, retry {attempt + 1}")
        time.sleep(2)
    return {"_error": "failed"}


def search(q: str, window: tuple) -> list[str]:
    params = dict(part="id", q=q, type="video", order="viewCount", maxResults=PER_QUERY,
                  relevanceLanguage="en", publishedAfter=window[0])
    if window[1]:
        params["publishedBefore"] = window[1]
    data = get("search", **params) or {}
    return [it["id"]["videoId"] for it in data.get("items", []) if it.get("id", {}).get("videoId")]


def videos(ids: list[str]) -> dict[str, dict]:
    out = {}
    for i in range(0, len(ids), 50):
        data = get("videos", part="snippet,statistics,contentDetails", id=",".join(ids[i:i + 50])) or {}
        for it in data.get("items", []):
            sn, st = it["snippet"], it.get("statistics", {})
            out[it["id"]] = {
                "id": it["id"], "title": sn["title"], "channel_id": sn["channelId"],
                "channel": sn["channelTitle"], "published": sn["publishedAt"],
                "description": sn.get("description", ""), "duration": it["contentDetails"]["duration"],
                "views": int(st.get("viewCount", 0)), "comment_count": int(st.get("commentCount", 0)),
            }
    return out


def _slim(c: dict, channel_id: str) -> dict:
    sn = c["snippet"]
    author = (sn.get("authorChannelId") or {}).get("value")
    return {"text": sn.get("textOriginal") or sn.get("textDisplay", ""), "at": sn["publishedAt"],
            "likes": sn.get("likeCount", 0), "by_creator": author == channel_id}


def comments(vid: str, channel_id: str, order: str) -> dict:
    data = get("commentThreads", part="snippet,replies", videoId=vid, maxResults=100,
               order=order, textFormat="plainText") or {}
    if "_error" in data:
        return {"error": data["_error"], "threads": []}
    threads = []
    for t in data.get("items", []):
        top = _slim(t["snippet"]["topLevelComment"], channel_id)
        top["reply_total"] = t["snippet"].get("totalReplyCount", 0)
        top["replies"] = [_slim(r, channel_id) for r in t.get("replies", {}).get("comments", [])]
        threads.append(top)
    return {"error": None, "threads": threads}


def main() -> None:
    RAW.mkdir(exist_ok=True)
    cohorts: dict[str, list[dict]] = {}
    try:
        for group, qs in QUERIES.items():
            for label, window in (("old", OLD), ("new", NEW)):
                name = f"{group}_{label}"
                path = RAW / f"search_{name}.json"
                if path.exists():
                    cohorts[name] = json.loads(path.read_text(encoding="utf-8"))
                    continue
                hits = []
                for q in qs:
                    ids = search(q, window)
                    print(f"{name}: {len(ids):>2} hits  {q}")
                    hits += [{"query": q, "id": v} for v in ids]
                path.write_text(json.dumps(hits, indent=1), encoding="utf-8")
                cohorts[name] = hits

        all_ids = sorted({h["id"] for hs in cohorts.values() for h in hs})
        vpath = RAW / "videos.json"
        meta = json.loads(vpath.read_text(encoding="utf-8")) if vpath.exists() else {}
        missing = [v for v in all_ids if v not in meta]
        if missing:
            meta.update(videos(missing))
            vpath.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"videos: {len(meta)} with metadata")

        cdir = RAW / "comments"
        cdir.mkdir(exist_ok=True)
        jobs = []
        for name, hits in cohorts.items():
            for h in hits:
                v = meta.get(h["id"])
                if not v:
                    continue
                orders = ("relevance", "time") if name.endswith("old") else ("relevance",)
                for order in orders:
                    f = cdir / f"{h['id']}.{order}.json"
                    if not f.exists():
                        jobs.append((h["id"], v["channel_id"], order, f))
        jobs = list({j[3]: j for j in jobs}.values())
        print(f"comment pages to fetch: {len(jobs)}")

        def run(job):
            vid, ch, order, f = job
            res = comments(vid, ch, order)
            f.write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")

        with ThreadPoolExecutor(max_workers=8) as pool:
            for i, _ in enumerate(pool.map(run, jobs), 1):
                if i % 50 == 0:
                    print(f"  {i}/{len(jobs)}")
    except QuotaExceeded as e:
        print(f"STOPPED: YouTube quota ({e}). Partial data kept; re-run after reset to resume.")
        sys.exit(1)
    print("done")


if __name__ == "__main__":
    main()
