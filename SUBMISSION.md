# Raahi (राही)

**Tagline:** Paste an old tutorial. Raahi shows which steps still work today.

Live app: https://raahi-szvmusvcra-el.a.run.app · Repo: https://github.com/jpooja139/raahi · Demo video: [DEMO VIDEO LINK]

## 50-word pitch

Old YouTube tutorials still get views, and many steps no longer work. Raahi's Tutorial Rescue has Gemini watch the video, then re-checks every step against today's docs with Search grounding. Each step comes back as still works, changed, or unconfirmed, with sources, plus a pin-ready comment for the creator.

## 150-word pitch

Old software tutorials keep getting views after their menus have changed. Viewers get stuck; creators rarely reply.

Paste an old tutorial URL into Raahi's Tutorial Rescue. Gemini on Vertex AI watches the video and lists its steps with m:ss timestamps. Each step is re-checked against current docs with Google Search grounding and marked still works, changed (with today's way), or unconfirmed, with sources. Raahi then drafts a pin-ready "what changed" comment for the creator, in English or Hindi.

A verdict with no source is shown as unconfirmed, and the model never writes the public comment. On 46 unseen steps from 2026 tutorials, Raahi marked 0 as changed.

## The problem

Creators and their viewers follow tutorials that went out of date. We measured it with the YouTube Data API:

- 144 software-setup tutorials from 2019-2022 have a median of 1.1M views. 66% received new comments in the last 90 days, so people still follow them.
- 45.8% of those old tutorials carry "doesn't work anymore" comments, against 14.6% of 151 tutorials from the last 6 months.
- On the outdated ones, the creator replied to a problem comment on only 28.8% of videos.

Caveat: the "outdated" regex was not hand-checked, so these rates are upper bounds. The old-vs-new gap is the stronger signal.

## What we built

**Tutorial Rescue (the hero feature):**

1. Paste an old YouTube tutorial URL.
2. Gemini watches the video and extracts steps, each with the m:ss where it appears.
3. Each step is re-checked against current docs with Google Search grounding.
4. Each step is marked still works, changed (today's way), or unconfirmed, with sources. Official vendor sources are badged.
5. Raahi produces a pin-ready "what changed" comment for the creator, in English or Hindi.

**Supporting abilities:**

- **Decide:** a decision card (tool, why, cost, time, rejected options).
- **Guide:** voice guidance on Gemini Live; say "dikhao" to send one screenshot and Raahi names the exact button.
- **Check:** "done" is proven (Google Public DNS, page loads, link checks).
- **Link Doctor:** ranks a channel's broken description links by views lost.

## How it uses Google Cloud and GenAI

| Piece | How we use it |
|---|---|
| Gemini 3.8 Flash on Vertex AI | Video understanding of a YouTube URL: steps, m:ss timestamps. |
| Google Search grounding | Freshness check per step; sources from grounding supports. |
| Gemini 3.8 Live | Voice, hi-IN / en-IN, with tool calls. |
| Cloud Run | FastAPI service. |
| Secret Manager | Runtime key mounts. |
| Cloud Storage | Creator context store. |
| YouTube Data API v3 | Real publish date, video length, channel descriptions. |

Engineering details (`app/rescue.py`, 39 unit tests):

- **Verdict invariants:** a "current" or "changed" verdict with no source is shown as unconfirmed. "Official" is a root-domain match against the vendor's domains, not model opinion. The model never writes the public comment; it is a template filled from sourced verdicts. A video that isn't a software tutorial is refused rather than given invented steps.
- **Byte-offset source mapping:** sources are mapped to steps by UTF-8 byte offsets in grounding supports, so it works on Hindi text.
- **Parallel batched verification:** 4 steps per grounded call. **Cache:** 7 days; partial or failed checks are never cached.

## Evidence it works

Cases are 16 old tutorials where viewer comments name the step that broke, with keywords frozen before the first run. Controls are 10 tutorials from 2026; 4 are a holdout never used for tuning.

| Measure | Result |
|---|---|
| Old tutorials: viewer-reported change found (hand-reviewed) | **10 / 16** (+1 partial) |
| Unseen 2026 holdout: steps wrongly marked changed | **0 / 46** |
| Steps on old tutorials with a grounding source | 95.9% |
| Steps with a timestamp link into the video | 100% |
| Verify whole tutorial (median, one at a time) | 10.8 s |
| Watch + extract (median, one at a time) | 21.6 s (up to 107 s for a 21-min video) |

## What is new

- **It fixes the video, not just one viewer's question.** A chat assistant answers whoever asks. Raahi gives the creator a pin-ready update for the exact steps that changed, so every future viewer sees it.
- **Video and web, checked step by step.** Gemini reads the video itself (menus on screen, with m:ss), then each step is checked against today's docs with cited sources and official-vendor badges.
- **Code decides what counts as fact.** Unsourced verdicts are downgraded, timestamps past the video's end are dropped, and the public comment is a template. These rules are unit-tested, not left to the prompt.

## Impact

- **Viewers stuck on old tutorials:** see which steps changed, with a link to the exact moment.
- **Creators whose old videos still get views:** old tutorials carry a median of 1.1M views and 66% are still commented on, yet on the outdated ones creators answered a problem comment on only 28.8%. One pinned update answers everyone.
- **India and Hindi:** Guidance and update comments work in Hindi as well as English.

## Honest limits

- The eval is small and hand-reviewed by the builder (16 cases, 10 controls). Nobody independent has checked it yet.
- The prompt was tuned on 6 controls; only the 4-video holdout was untuned.
- Extraction slows under load (up to 650.9 s with 4 videos at once), so demo videos are pre-warmed.
- Not yet evidenced: completion rates, user study, willingness to pay.

## Team

Team GoldHunter
