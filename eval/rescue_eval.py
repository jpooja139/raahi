"""Tutorial Rescue eval: does Raahi find the change that viewers complained about?

Ground truth comes from the videos' own comments (eval/CASES.md): each case is an
old tutorial where viewers said a specific step no longer works. Keywords for
that change were frozen in cases.json BEFORE the first run (the subagent's draft
keywords are kept as keywords_draft).

  HIT      a step marked "changed" (sourced — unsourced verdicts are already
           downgraded) whose instruction or TODAY text contains a case keyword
  OTHER    steps marked "changed", none matching the keywords (hand-review)
  MISS     no step marked "changed"

Controls (controls.json) are 2026 tutorials with no outdated complaints; every
"changed" verdict there is a candidate false alarm and is hand-reviewed.

Run with Vertex credentials (USE_VERTEX=1 + ADC):
    python -m eval.rescue_eval [--force] [--workers N] [--out results.json]
--force re-runs the grounded check but reuses cached extractions, so two runs
differ only in the verify stage. --workers 1 gives single-user latency.
Prints a summary; RESULTS.md is written by hand from the JSON so that every
miss gets a human explanation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from app import rescue

HERE = Path(__file__).resolve().parent


def _run(case: dict, force: bool) -> dict:
    out = {"video_id": case["video_id"], "title": case["title"], "published": case["published"]}
    try:
        t0 = time.perf_counter()
        ex = rescue.extract(case["url"])
        t1 = time.perf_counter()
        r = rescue.analyze(case["url"], "en", force=force)
        t2 = time.perf_counter()
    except Exception as e:  # noqa: BLE001 — an eval row records the failure, never hides it
        out["error"] = f"{type(e).__name__}: {str(e)[:300]}"
        return out
    out.update(
        extract_s=round(t1 - t0, 1), verify_s=round(t2 - t1, 1), source=ex.source,
        tool=r.tool, note=r.note, counts=r.counts, n_steps=len(r.steps),
        steps=[{"n": s.n, "t": s.t, "status": s.status, "instruction": s.instruction,
                "today": s.today, "downgraded": s.downgraded,
                "sources": [f"{x.domain}{' *' if x.official else ''}" for x in s.sources]}
               for s in r.steps],
    )
    kws = [k.lower() for k in case.get("keywords", [])]
    changed = [s for s in r.steps if s.status == "changed"]
    matched = [s.n for s in changed if any(k in (s.instruction + " " + s.today).lower() for k in kws)]
    if kws:
        out["outcome"] = "HIT" if matched else ("OTHER" if changed else "MISS")
        out["matched_steps"] = matched
    return out


def run(path: Path, force: bool, workers: int) -> list[dict]:
    cases = json.loads(path.read_text(encoding="utf-8"))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(lambda c: _run(c, force), cases))


def summarize(rows: list[dict]) -> dict:
    ok = [r for r in rows if "error" not in r]
    steps = [s for r in ok for s in r["steps"]]
    n = len(steps) or 1
    s = {
        "videos": len(rows), "errors": len(rows) - len(ok), "steps": len(steps),
        "changed": sum(x["status"] == "changed" for x in steps),
        "current": sum(x["status"] == "current" for x in steps),
        "unverifiable": sum(x["status"] == "unverifiable" for x in steps),
        "downgraded": sum(x["downgraded"] for x in steps),
        "pct_steps_with_source": round(100 * sum(bool(x["sources"]) for x in steps) / n, 1),
        "pct_steps_with_official": round(100 * sum(any(y.endswith("*") for y in x["sources"]) for x in steps) / n, 1),
        "pct_steps_with_timestamp": round(100 * sum(bool(x["t"]) for x in steps) / n, 1),
        "videos_from_transcript": sum(r["source"] == "transcript" for r in ok),
    }
    if ok:
        s["median_extract_s"] = round(statistics.median(r["extract_s"] for r in ok), 1)
        s["median_verify_s"] = round(statistics.median(r["verify_s"] for r in ok), 1)
        s["max_total_s"] = max(r["extract_s"] + r["verify_s"] for r in ok)
    for k in ("HIT", "OTHER", "MISS"):
        s[k] = sum(r.get("outcome") == k for r in ok)
    s["videos_with_any_changed"] = sum(r["counts"]["changed"] > 0 for r in ok)
    return s


def main(force: bool = False, workers: int = 4, out: str = "results.json",
         sets: tuple[str, ...] = ("cases", "controls")) -> dict:
    res = {"verify_prompt_sha": hashlib.sha256(rescue.VERIFY_PROMPT.encode()).hexdigest()[:12],
           "workers": workers}
    for name in sets:
        rows = run(HERE / f"{name}.json", force, workers)
        res[name] = {"summary": summarize(rows), "rows": rows}
    (HERE / out).write_text(json.dumps(res, indent=1, ensure_ascii=False), encoding="utf-8")
    for name in sets:
        v = res[name]
        print(name, json.dumps(v["summary"]))
        for r in v["rows"]:
            print(f"  {r['video_id']} {r.get('outcome', '-'):5} "
                  f"{r.get('error') or str(r['counts']['changed']) + '/' + str(r['n_steps']) + ' changed'}")
    return res


def cli(argv=None) -> dict:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--out", default="results.json")
    ap.add_argument("--sets", default="cases,controls")
    a = ap.parse_args(argv)
    return main(a.force, a.workers, a.out, tuple(a.sets.split(",")))


if __name__ == "__main__":
    cli()
