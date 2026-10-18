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
2. **Tutorial Rescue** — paste the old YouTube tutorial you got stuck on.
   Gemini watches the video and lists its steps with the m:ss where each is
   shown. Each step is then re-checked against the tool's *current* docs with
   Search grounding, and comes back as still works / changed (here's today's
   way) / unconfirmed, with its sources. The creator gets a pin-ready "what
   changed" comment. See [Tutorial Rescue: evidence](#tutorial-rescue-evidence).
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

## Running with Vertex AI (recommended; the deployed URL uses this)

```bash
gcloud auth application-default login   # once
USE_VERTEX=1 GCP_PROJECT=raahi-hackathon python3 -m uvicorn app.main:app --port 8000
```
Everything runs on Vertex, including YouTube video understanding: a YouTube
URL part must use `mime_type="video/*"` (`video/mp4` returns 500 INTERNAL;
`gemini.youtube_part()` handles it). Grounded freshness checks run on Vertex's
postpaid quota. On the plain API-key path, grounding may exhaust prepaid quota
and steps arrive labeled *unconfirmed*: honest degradation, documented, not a pass.

## Run locally

```bash
pip3 install --user -r requirements.txt
./fetch-env.sh           # team: pulls .env from Secret Manager (needs gcloud login)
# or: cp .env.example .env and add your own GEMINI_API_KEY + YOUTUBE_API_KEY
python3 -m uvicorn app.main:app --port 8000
# open http://localhost:8000
```

## Deploy (Cloud Run)

First deploy to a new project:
```bash
export GEMINI_API_KEY=… YOUTUBE_API_KEY=…
./deploy.sh <gcp-project-id>
```
**Redeploying the existing service:** don't use `deploy.sh`. Its `--set-env-vars`
replaces every env var, which would drop `USE_VERTEX=1` and the Secret Manager
refs the live service uses. Run this instead (it keeps the current env and secrets):
```bash
gcloud run deploy raahi --source . --region asia-south1 --project raahi-hackathon
```

## Google stack

| Piece | Tech |
|---|---|
| Decisions, roadmaps | Gemini 3.8 Flash, structured JSON output |
| Rescue: watching the tutorial | Gemini video understanding of a YouTube URL on Vertex (low media resolution) |
| Rescue: doc-freshness check | Google Search grounding; sources from grounding supports |
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

## Honesty & limits (read this, judges)

- **Predefined vs AI:** scenario cards load handwritten "recipes" (zero latency, deliberately) and are badged *predefined recipe* in the UI; typed goals go through the Gemini planner and are badged *ai-planned*. Checks are live in both.
- **Verification semantics:** unknown check types are refused; DNS checks support an expected destination (the website recipe requires `ghs.googlehosted.com`); "manual" completion is shown as *done (your word)* — never as verified. SPF/DMARC checks prove record presence (required for deliverability), not inbox placement.
- **Studio:** "silence" cuts are caption-gap candidates from transcript timing, not audio analysis — labeled as such. Cloud rendering is planned v2 and its button is disabled.
- **Security:** outbound fetches refuse private/metadata addresses (SSRF guard); API is rate-limited per IP (demo-grade); no auth yet — do not store secrets in profiles.
- **Tutorial Rescue:**
  - Verdicts are *as of* the check date (cached 7 days).
  - The eval is small and hand-reviewed by the builder, and the prompt was tuned on 6 of the controls (the 4-video holdout was not).
  - Extraction slows sharply under concurrent load (up to 651 s with 4 videos at once), so demo videos are pre-warmed.
  - YouTube's own "Ask" button answers questions about a video. To our understanding, it does not re-check each step against today's docs with cited sources.
- **Not yet evidenced:** completion-rate benchmarks, user study, willingness to pay. These are the v1 evaluation plan, not claims.

## Tutorial Rescue: evidence

**The problem is measured, not assumed** ([research/problem-validation/REPORT.md](research/problem-validation/REPORT.md), YouTube Data API):
- 144 software-setup tutorials from 2019–2022 have a median of 1.1M views, and 66% got new comments in the last 90 days, so people still follow them.
- 45.8% of them carry "doesn't work anymore" comments, against 14.6% of 151 tutorials from the last 6 months.
- On the outdated ones, the creator replied to a problem comment on only 28.8% of videos.

The "outdated" regex behind these rates was not hand-checked for precision, so treat the rates as upper bounds; the old-vs-new gap is the stronger signal.

**How a verdict earns its place on screen** (`app/rescue.py`, 25 unit tests in `tests/test_rescue.py`):
- **Sources:** they come from the grounding metadata's byte-offset supports, never from what the model writes about its sources.
- **Unsourced verdicts:** a "current" or "changed" verdict with no source behind it is shown as *unconfirmed*.
- **"Official" sources:** a root-domain string match against the tool vendor's domains, not model opinion.
- **Timestamps:** any past the video's real end (YouTube Data API) are dropped.
- **The public comment:** a template filled from sourced verdicts only. The model never writes it.
- **Caching:** a partial or failed check is never cached.

**Eval** ([eval/RESULTS.md](eval/RESULTS.md)):
- **Cases:** 16 old tutorials, where viewers' comments name the step that broke. Keywords were frozen before the first run.
- **Controls:** 10 tutorials from 2026, of which 4 are a holdout that was never used for tuning.

| | Result |
|---|---|
| Old tutorials: viewer-reported change found (hand-reviewed) | **10 / 16** (+1 partial) |
| Unseen 2026 tutorials: steps wrongly marked changed | **0 / 46** |
| All 2026 controls: steps marked changed | 4 / 107 (1 plausibly real) |
| Steps on old tutorials with a grounding source | 95.9% |
| Steps with a timestamp link into the video | 100% |
| Verify, whole tutorial (median, one at a time) | 10.8 s |
| Watch + extract (median, one at a time) | 21.6 s (up to 107 s for a 21-min video) |

Misses are listed with reasons in RESULTS.md. Two of them (Zoho, Search
Console) are cases where Raahi cites official pages and disagrees with the viewers.

## Measured runs

| Metric | Value |
|---|---|
| Tutorial Rescue eval | see the table above and [eval/RESULTS.md](eval/RESULTS.md) |
| Guided-task completion vs following the tutorial alone | not measured yet |

Architecture: [docs/architecture.md](docs/architecture.md) · Project hub (open locally): [html/index.html](html/index.html)
