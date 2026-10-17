"""Pulse — daily/weekly intelligence as diffs + proofs, never generic tips.

snapshot(): measures the creator's world (links, views, DNS/SPF/DMARC).
diff(): compares the two latest snapshots into concrete changes.
narrate(): Gemini turns the diffs into 2-4 plain-language insights, each with
an action and (where possible) a one-tap check. If there is no history yet,
Pulse reports the baseline instead.
"""
from __future__ import annotations

import time
from typing import Literal

from pydantic import BaseModel

from . import context, gemini, linkdoctor, verifier


class PulseInsight(BaseModel):
    headline: str
    detail: str
    action: str
    check_type: Literal["dns", "page", "spf", "dmarc", "manual"]
    check_target: str


class _Narration(BaseModel):
    insights: list[PulseInsight]


class PulseReport(BaseModel):
    handle: str
    baseline: bool
    snapshot_ts: float
    insights: list[PulseInsight]
    diffs: dict


async def take_snapshot(handle: str, domain: str = "") -> dict:
    report = await linkdoctor.scan(handle, max_videos=50)
    snap: dict = {
        "ts": time.time(),
        "channel": report.channel_title,
        "videos": report.videos_scanned,
        "links": report.links_checked,
        "broken": report.broken,
        "warned": report.warned,
        "broken_urls": sorted({i.url for i in report.items if i.status == "broken"}),
        "top_videos": [
            {"title": i.video_title, "views": i.video_views}
            for i in {x.video_title: x for x in report.items}.values()
        ][:10],
    }
    if domain:
        snap["domain"] = domain
        for ctype in ("dns", "spf", "dmarc"):
            res = await verifier.check(ctype, domain)
            snap[ctype] = {"passed": res.passed, "detail": res.detail[:140]}
    return snap


def diff(prev: dict | None, cur: dict) -> dict:
    if not prev:
        return {}
    d: dict = {}
    new_broken = sorted(set(cur.get("broken_urls", [])) - set(prev.get("broken_urls", [])))
    fixed = sorted(set(prev.get("broken_urls", [])) - set(cur.get("broken_urls", [])))
    if new_broken:
        d["new_broken_links"] = new_broken[:10]
    if fixed:
        d["links_fixed"] = fixed[:10]
    prev_views = {v["title"]: v["views"] for v in prev.get("top_videos", [])}
    movers = []
    for v in cur.get("top_videos", []):
        if v["title"] in prev_views and prev_views[v["title"]] > 100:
            delta = (v["views"] - prev_views[v["title"]]) / prev_views[v["title"]]
            if abs(delta) >= 0.10:
                movers.append({"title": v["title"], "change_pct": round(delta * 100)})
    if movers:
        d["view_movers"] = movers[:5]
    for ctype in ("dns", "spf", "dmarc"):
        if ctype in prev and ctype in cur and prev[ctype]["passed"] != cur[ctype]["passed"]:
            d[f"{ctype}_changed"] = {"was_passing": prev[ctype]["passed"], "now_passing": cur[ctype]["passed"]}
    d["videos_added"] = max(0, cur.get("videos", 0) - prev.get("videos", 0))
    return {k: v for k, v in d.items() if v}


NARRATE_PROMPT = """You are Raahi, a creator's AI engineer. Below is what changed
in the creator's channel/domain since the last check, plus the current state.
Write 2-4 insights. Rules:
- Each insight is grounded ONLY in the data below — never invent numbers.
- headline: one punchy sentence naming the concrete change or state.
- detail: one sentence of plain-words meaning (no jargon).
- action: one imperative next step the creator can do today.
- check_type/check_target: a verification Raahi can run to prove the action
  worked — dns/spf/dmarc with the domain, page with a URL — else "manual" and "".
- Order by money impact: broken links on high-view videos first, then email
  authentication, then traffic movers.
- Match the language hint: {lang}.

CURRENT STATE: {current}
CHANGES SINCE LAST CHECK: {diffs}
"""


async def run(handle: str, domain: str = "", lang: str = "en") -> PulseReport:
    profile = context.get_profile(handle)
    domain = domain or profile.get("domain", "")
    cur = await take_snapshot(handle, domain)
    prev = profile["snapshots"][-1] if profile["snapshots"] else None
    d = diff(prev, cur)
    context.add_snapshot(handle, cur, domain)

    baseline = prev is None
    if baseline:
        insights = [
            PulseInsight(
                headline=f"Baseline recorded: {cur['links']} links across {cur['videos']} videos, {cur['broken']} broken",
                detail="From now on, Pulse reports what CHANGED — new dead links, record changes, traffic moves.",
                action="Fix the broken links now so your baseline starts clean.",
                check_type="manual",
                check_target="",
            )
        ]
        if domain and not cur.get("spf", {}).get("passed", True):
            insights.append(
                PulseInsight(
                    headline=f"Your domain {domain} has no SPF record — newsletters will land in spam",
                    detail="Gmail and Yahoo now junk mail from domains without SPF/DMARC.",
                    action="Run the spam-check scenario and add the records.",
                    check_type="spf",
                    check_target=domain,
                )
            )
        return PulseReport(handle=handle, baseline=True, snapshot_ts=cur["ts"], insights=insights, diffs={})

    if not d:
        return PulseReport(
            handle=handle, baseline=False, snapshot_ts=cur["ts"],
            insights=[
                PulseInsight(
                    headline="All quiet: nothing broke since the last check",
                    detail=f"{cur['links']} links checked, {cur['broken']} broken (unchanged), records stable.",
                    action="Nothing needed — Raahi will keep watching.",
                    check_type="manual", check_target="",
                )
            ],
            diffs={},
        )

    import asyncio
    narration = await asyncio.to_thread(
        gemini.generate_json,
        NARRATE_PROMPT.format(lang=lang, current=str({k: cur[k] for k in cur if k != "top_videos"}), diffs=str(d)),
        _Narration,
    )
    return PulseReport(
        handle=handle, baseline=False, snapshot_ts=cur["ts"],
        insights=narration.insights[:4], diffs=d,
    )
