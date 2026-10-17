# Raahi (राही) — the AI engineer for creators

**Team GoldHunter** · Google Cloud AI Builder Cup 2026 · theme: Media, Content & Digital Experiences

Creators are experts at content, not tech. They give up on their own website
at the DNS page, follow 2022 tutorials whose buttons no longer exist, and
never find the affiliate links that quietly died in old video descriptions.

Raahi is a voice-first AI engineer that **decides** the right tech path for a
creator, **guides** them through it in Hindi or English, and **checks** each
step actually worked — it never just hands over a wall of instructions.

## The four abilities

1. **Decide** — a decision card (tool, why, cost, time, what was rejected)
   chosen from a curated catalogue, so prices are vouched for, never invented.
2. **Tutorial Rescue** — paste the old YouTube tutorial you got stuck on;
   Gemini watches it, extracts the steps, and re-checks each one against the
   tool's *current* docs via Search grounding. Changed steps come back updated.
3. **Guide** — hint-first voice/chat guidance (Gemini Live, hi-IN/en-IN, with
   barge-in). Stuck? Say **"dikhao"** — one screenshot, and Raahi names the
   exact button. Never a screen stream, never a password.
4. **Check** — "done" is decided by verification (Google Public DNS, page
   loads, link checks), not by what the screen seems to show.

Plus **Link Doctor**: scan any channel's video descriptions and get the
broken links ranked by the views they're bleeding.

## How you work with Raahi (the mechanism)

1. **Start from a one-tap scenario** (or say your goal in your own words, Hindi or English).
2. Raahi shows a **decision card** — what it chose, what it rejected, cost, time.
3. The **roadmap** guides one step at a time: chat, voice (🎙), or "dikhao" screen-share when stuck.
4. Every step ends in a **check** — DNS, page, SPF/DMARC, link re-scan — "done" is proven, never claimed.
5. Your plan survives refreshes; the progress pill always shows where you are.

## Versioning & roadmap

Current: **v0.1.0** (`/api/health` reports it). Design invariants that never change:
*hold the creator's context · decide on the creator's side · prove outcomes independently.*
- **v1 — Intelligence layer:** Creator Context Engine (personalised env: skills learned, decisions + outcomes) and **Pulse** — daily/weekly diff-based insights (new broken links, vanished DNS/SPF records, traffic shifts), each with a one-tap verified fix.
- **v2 — Raahi Cut:** prompt-based Shorts extraction from existing YouTube videos (EDL + FFmpeg, approval-first).
- **North star (2035):** the creator's fiduciary engineer — the judgment-and-verification layer between creators and platform AIs.

## Run locally

```bash
pip3 install --user -r requirements.txt
cp .env.example .env     # add GEMINI_API_KEY (aistudio.google.com)
                         # and YOUTUBE_API_KEY (YouTube Data API v3)
python3 -m uvicorn app.main:app --port 8000
# open http://localhost:8000
```

## Deploy (Cloud Run)

```bash
export GEMINI_API_KEY=… YOUTUBE_API_KEY=…
./deploy.sh <gcp-project-id>
```

## Google stack

| Piece | Tech |
|---|---|
| Decisions, roadmaps, rescue extraction | Gemini 3.8 Flash, structured JSON output |
| Doc-freshness check | Google Search grounding |
| Voice | Gemini 3.8 Live, native audio, hi-IN / en-IN, tool calls |
| Channel + descriptions | YouTube Data API v3 |
| Step verification | Google Public DNS (DoH), live page checks |
| Hosting | Cloud Run (FastAPI) |

## What's real vs. pitch-only

**Working:** Link Doctor, decision cards + roadmap, DNS/page verifier,
hint-first guided chat with dikhao screenshots, Tutorial Rescue (video with
transcript fallback), live voice with run-the-check tool calls.

**Pitch-only (deliberately):** "why did my views drop" analytics (needs
OAuth), creator tech map, recipe sharing.

## Measured runs

<!-- Fill from rehearsals before submission: tasks tried, completed,
median minutes vs following the tutorial alone. -->
| Metric | Value |
|---|---|
| Test tasks run | _tbd_ |
| Completed without human help | _tbd_ |
| Median time vs tutorial | _tbd_ |

Architecture: [docs/architecture.md](docs/architecture.md)
