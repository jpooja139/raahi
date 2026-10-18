"""Turn raw/ into results.json + samples.md. Pure regex: transparent and re-runnable.

Signals per comment (case-insensitive, English + a little Hinglish):
  OUTDATED   the tutorial no longer matches the product   (problem B)
  STILL_OK   "still works in 2026" — the counter-signal to OUTDATED
  STUCK      generic "not working / error / help"        (problem A-ish)
  LINK_DEAD  a description/product link is broken        (problem C)
"""
from __future__ import annotations

import json
import random
import re
import statistics
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
NOW = datetime(2026, 10, 18, tzinfo=timezone.utc)

UI = r"(?:option|button|setting|menu|tab|feature|section|icon|toggle|page)s?"
PATTERNS = {
    "OUTDATED": [
        r"\bout ?dated\b", r"\bout of date\b",
        r"\bno longer (?:works?|working|available|exists?|there|an option|shows?|appears?|possible|supported|free)\b",
        r"\b(?:does ?n[o']?t|doesnt|don'?t|is ?n[o']?t|isnt|not|no) (?:work|working|exist|there|available|showing|show up|appear)\w* any ?more\b",
        rf"\b{UI} (?:is |are |has |have )?(?:been )?(?:gone|missing|removed|not there|disappeared)\b",
        rf"\b(?:can'?t|cannot|can not|couldn'?t|unable to|don'?t|do not) (?:find|see|locate|get) (?:the|this|that|an?|any|my) (?:\w+ ){{0,3}}{UI}\b",
        rf"\bthere (?:is|'s) no (?:\w+ ){{0,3}}{UI}\b",
        r"\b(?:interface|ui|layout|dashboard|design|website|app|site|platform|everything) (?:has |have |is |was )?(?:completely |totally |all )?(?:changed|different now|updated)\b",
        r"\b(?:they|google|youtube|facebook|meta|instagram|canva|shopify|wordpress|obs|it) (?:have |has )?(?:changed|updated|removed|moved) (?:it|the|this|everything|that)\b",
        r"\bplease (?:make|do|upload|create) (?:an? )?(?:new|updated|latest)\b",
        r"\b(?:new|updated|latest) (?:version of (?:this|the) (?:video|tutorial))\b",
        r"\bdeprecated\b", r"\bdiscontinued\b", r"\bshut ?down\b",
        r"\boption (?:nahi|nhi|nai) (?:aa|a|dikh|mil)\w*",
    ],
    "STILL_OK": [
        r"\bstill (?:works?|working|valid|relevant|accurate|applies)\b",
        r"\bworks? (?:in|for|perfectly in|great in) 20(?:2[3-6])\b",
        r"\b20(?:2[4-6]) and (?:it )?(?:still|works)\b",
    ],
    "STUCK": [
        r"\b(?:i'?m|im|i am|got|getting) stuck\b", r"\bplease help\b", r"\bhelp me\b",
        r"\b(?:it )?(?:says|shows|showing|getting|get) (?:an? )?error\b",
        r"\b(?:does ?n[o']?t|doesnt|is ?n[o']?t|not|does not|is not) work(?:ing)?\b(?! ?any ?more)",
        r"\b(?:kaam|kam) (?:nahi|nhi) (?:kar|kr)\w*",
    ],
    "LINK_DEAD": [
        r"\blinks?(?: (?:in|on|from|you|that|the|this|my|your|description|bio|gave|posted|provided|below|above)){0,4} (?:is |are |was |were |seems? |looks? )?(?:not working|broken|dead|expired|invalid|does ?n[o']?t work|don'?t work|is ?n[o']?t working|are ?n[o']?t working)\b",
        r"\b(?:item|product|it|this)s? (?:is |are )?(?:no longer available|currently unavailable|unavailable now|out of stock|sold out everywhere)\b",
        r"\b(?:link|url) (?:is )?(?:gone|404)\b", r"\bpage (?:not found|does ?n[o']?t exist)\b",
        r"\blinks? (?:take|takes|goes|go|lead|leads) (?:me )?to (?:a |an )?(?:different|wrong|error|404|empty)\b",
    ],
}
RX = {k: [re.compile(p, re.I) for p in v] for k, v in PATTERNS.items()}
CREATOR_UPDATE = re.compile(r"\b(?:update|updated|edit|note|changed|new version|no longer|outdated|20(?:2[3-6]))\b", re.I)
AFFILIATE = re.compile(r"(?:amzn\.to|amazon\.[a-z.]+/|geni\.us|fkrt\.it|flipkart\.com|bit\.ly|rstyle\.me|shareasale|howl\.me|kit\.co|go\.skimresources|amzlink|tidd\.ly)", re.I)
URL = re.compile(r"https?://\S+")


def tags(text: str) -> set[str]:
    return {k for k, rxs in RX.items() if any(r.search(text) for r in rxs)}


def iso(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def seconds(d: str) -> int:
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", d)
    if not m:
        return 0
    dd, h, mi, s = (int(x or 0) for x in m.groups())
    return dd * 86400 + h * 3600 + mi * 60 + s


def load_comments(vid: str) -> tuple[list[dict], bool]:
    threads, disabled = {}, False
    for order in ("relevance", "time"):
        f = RAW / "comments" / f"{vid}.{order}.json"
        if not f.exists():
            continue
        d = json.loads(f.read_text(encoding="utf-8"))
        if d.get("error"):
            disabled = True
        for t in d["threads"]:
            threads[(t["at"], t["text"][:80])] = t  # dedupe across the two orders
    return list(threads.values()), disabled


def video_stats(v: dict, threads: list[dict]) -> dict:
    viewer = [t for t in threads if not t["by_creator"]]
    counts = {k: 0 for k in RX}
    flagged: dict[str, list[dict]] = {k: [] for k in RX}
    creator_replied_to_problem = False
    for t in viewer:
        tg = tags(t["text"])
        for k in tg:
            counts[k] += 1
            flagged[k].append(t)
        if tg & {"OUTDATED", "STUCK", "LINK_DEAD"} and any(r["by_creator"] for r in t["replies"]):
            creator_replied_to_problem = True
    creator_top = [t for t in threads if t["by_creator"]]
    latest = max((iso(t["at"]) for t in threads), default=None)
    return {
        "id": v["id"], "title": v["title"], "channel": v["channel"], "channel_id": v["channel_id"],
        "published": v["published"], "views": v["views"], "duration_s": seconds(v["duration"]),
        "comments_fetched": len(viewer), "counts": counts,
        "creator_replied_to_problem": creator_replied_to_problem,
        "creator_update_comment": any(CREATOR_UPDATE.search(t["text"]) for t in creator_top),
        "commented_last_90d": bool(latest and latest >= NOW - timedelta(days=90)),
        "desc_links": len(URL.findall(v["description"])),
        "desc_affiliate_links": len(AFFILIATE.findall(v["description"])),
        "_flagged": flagged,
    }


def pct(a: int, b: int) -> float | None:
    return round(100 * a / b, 1) if b else None


def summarize(name: str, rows: list[dict]) -> dict:
    n = len(rows)
    total_c = sum(r["comments_fetched"] for r in rows)
    out = {"cohort": name, "videos": n, "comments_analyzed": total_c,
           "median_views": int(statistics.median([r["views"] for r in rows])) if rows else 0,
           "median_age_days": int(statistics.median([(NOW - iso(r["published"])).days for r in rows])) if rows else 0,
           "pct_videos_commented_last_90d": pct(sum(r["commented_last_90d"] for r in rows), n)}
    for k in RX:
        hit = [r for r in rows if r["counts"][k] > 0]
        out[k] = {"pct_videos_with_signal": pct(len(hit), n),
                  "per_1000_comments": round(1000 * sum(r["counts"][k] for r in rows) / total_c, 2) if total_c else None,
                  "videos_with_signal": len(hit)}
    prob = [r for r in rows if r["counts"]["OUTDATED"] > 0]
    out["of_outdated_videos_pct_creator_replied_to_a_problem_comment"] = pct(sum(r["creator_replied_to_problem"] for r in prob), len(prob))
    out["pct_videos_with_creator_update_comment"] = pct(sum(r["creator_update_comment"] for r in rows), n)
    out["pct_videos_with_affiliate_links"] = pct(sum(r["desc_affiliate_links"] > 0 for r in rows), n)
    return out


def main() -> None:
    meta = json.loads((RAW / "videos.json").read_text(encoding="utf-8"))
    results, samples, per_video = {}, {k: [] for k in RX}, {}
    for f in sorted(RAW.glob("search_*.json")):
        name = f.stem.removeprefix("search_")
        rows, seen = [], set()
        for h in json.loads(f.read_text(encoding="utf-8")):
            v = meta.get(h["id"])
            if not v or h["id"] in seen or seconds(v["duration"]) < 120:  # skip Shorts / clips
                continue
            seen.add(h["id"])
            threads, disabled = load_comments(h["id"])
            if disabled or not threads:
                continue
            r = video_stats(v, threads)
            r["query"] = h["query"]
            rows.append(r)
            for k, ts in r.pop("_flagged").items():
                samples[k] += [(name, r["id"], t["text"]) for t in ts]
        results[name] = summarize(name, rows)
        per_video[name] = rows

    # Same channel, same query, both windows => creator re-made the tutorial.
    remakes = []
    for g in ("B", "C"):
        old = {(r["query"], r["channel_id"]): r for r in per_video.get(f"{g}_old", [])}
        for r in per_video.get(f"{g}_new", []):
            if (r["query"], r["channel_id"]) in old:
                remakes.append({"group": g, "query": r["query"], "channel": r["channel"],
                                "old": old[(r["query"], r["channel_id"])]["title"], "new": r["title"]})
    results["remakes_same_channel_same_query"] = remakes
    year_titles = [r for r in per_video.get("B_new", []) if re.search(r"\b202[5-6]\b|\b(?:updated|latest|new)\b", r["title"], re.I)]
    results["B_new_pct_titles_with_year_or_updated"] = pct(len(year_titles), len(per_video.get("B_new", [])))

    (HERE / "results.json").write_text(json.dumps(results, indent=1, ensure_ascii=False), encoding="utf-8")
    (HERE / "per_video.json").write_text(json.dumps(per_video, indent=1, ensure_ascii=False), encoding="utf-8")

    random.seed(7)  # fixed seed: the precision sample is reproducible
    lines = ["# Random samples of regex matches (for precision review)\n"]
    for k, items in samples.items():
        pick = random.sample(items, min(40, len(items)))
        lines.append(f"\n## {k} — {len(items)} matches, {len(pick)} sampled\n")
        lines += [f"{i}. [{c} {vid}] {' '.join(t.split())[:220]}" for i, (c, vid, t) in enumerate(pick, 1)]
    (HERE / "samples.md").write_text("\n".join(lines), encoding="utf-8")

    for name, s in results.items():
        if isinstance(s, dict) and "videos" in s:
            print(f"\n{name}: {s['videos']} videos, {s['comments_analyzed']} comments, median views {s['median_views']:,}, "
                  f"median age {s['median_age_days']}d, active last 90d {s['pct_videos_commented_last_90d']}%")
            for k in RX:
                print(f"  {k:<9} videos {s[k]['pct_videos_with_signal']}%  per1k {s[k]['per_1000_comments']}")
            print(f"  creator replied to a problem comment (of OUTDATED videos): {s['of_outdated_videos_pct_creator_replied_to_a_problem_comment']}%"
                  f" | creator update comment: {s['pct_videos_with_creator_update_comment']}% | affiliate links: {s['pct_videos_with_affiliate_links']}%")
    print(f"\nremakes: {len(remakes)}; B_new titles with year/updated: {results['B_new_pct_titles_with_year_or_updated']}%")


if __name__ == "__main__":
    main()
