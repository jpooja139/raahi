# Tutorial Rescue: eval results (18 Oct 2026)

**Question:** given an old YouTube tutorial that viewers say no longer works,
does Raahi find the step that changed? And on a recent tutorial that works,
does Raahi stay quiet?

## Sets

| Set | Videos | Steps | Chosen how |
|---|---|---|---|
| `cases.json` | 16 | 145 | Old tutorials (2019–2022) where viewers' comments name a specific step that no longer works. 47 candidates scanned, 16 kept ([CASES.md](CASES.md)). Keywords for each reported change were frozen **before the first run** (`keywords_draft` keeps the earlier draft). |
| `controls.json` | 6 | 61 | Most-viewed 2026 tutorials with no "outdated" comment, one per query. |
| `holdout_controls.json` | 4 | 46 | 2026 UI walk-throughs picked by title **after** run 1 and before run 2. No prompt change was looked at against these. |

Video lengths: 3–23 minutes (median 13). All 26 videos were read from the
video itself, not the transcript.

## Two runs, one change

The only change between the two runs is the verify prompt (`rescue.VERIFY_PROMPT`).
Run 2 reused run 1's cached extractions, so its scores differ only in the verify stage.
Run 1's controls showed "changed" verdicts for wording nitpicks ("Continue", not
"Next") and for "I couldn't find that option". Run 2's prompt says a step is
`changed` only when a viewer following it would get stuck, and only when a page
found describes the new way. It also says that not finding the old option is not
evidence of change.

| | Run 1 | Run 2 |
|---|---|---|
| Cases: reported change found (hand-reviewed, strict) | 9 / 16 | **10 / 16** |
| Cases: keyword score (automatic, looser) | 12 / 16 | 12 / 16 |
| Controls: steps marked changed | 10 / 61 | **4 / 61** |
| Controls: videos with any changed step | 5 / 6 | 2 / 6 |
| Holdout: steps marked changed | not run | **0 / 46** |

Raw rows: [results_v1.json](results_v1.json) (run 1), [results.json](results.json) (run 2).

## Cases, hand-reviewed (run 2)

"Strict" means a step marked changed describes the change viewers reported.
A keyword match alone does not count.

| Video | Tool | What viewers reported | Raahi (run 2) | Outcome |
|---|---|---|---|---|
| b4ij06Tt3U4 | Google Domains | Google Domains is gone (Squarespace) | Steps 1–6 changed: buy/forward on Squarespace Domains | hit |
| 1G51dz5Gt-g | Google Sites | Domain purchase via Google Domains gone | Steps 1–4 changed: third-party registrar, start at sites.google.com | hit |
| FHL75CGDjgA | Blogger | "Third-party URL" option missing | Settings > Publishing > **Custom domain** (google.com) | hit |
| njri8_gJTs0 | Google Analytics | UA menus (Behavior, Acquisition) gone | GA4 paths for 6 steps, e.g. Reports > Engagement > Pages and screens | hit |
| vshlg0U3UqA | Google Analytics | "Tracking code" / UA property flow gone | UA creation removed, GA4 property + Google tag (google.com) | hit |
| trBA7xGgzjk | Facebook | Settings / Unpublish page moved | Settings & privacy > … > Deactivation and deletion (facebook.com) | hit |
| 2f6mfgzTQSA | Instagram | "Switch to professional" not in Settings | For professionals > **Account type and tools** | hit |
| Q7AOvWpIVHU | Vite / Three.js | `npm init @vitejs/app` outdated | `npm create vite@latest` | hit |
| f_fGXgh0A8k | Snap Camera | App discontinued | 7 of 8 steps changed, Snapchat for Web / Chrome extension (snapchat.com) | hit |
| kdbniwINFFA | Bluehost DNS | DNS/Zone Editor not where shown | Domains > your domain > **DNS** tab (bluehost.com ×3) | hit (run 1: miss) |
| 6Kn0MFAaQDM | Pixel Caffeine | Plugin no longer works | Suggests Meta's own WordPress integration instead; doesn't say the plugin is dead | partial |
| eTLWd70Y3F0 | Shopify | No Slideshow section; trial no longer 14 days | Found other changes (Navigation moved to Content > Menus, shopify.com), not the reported ones | other (keyword match on "trial" rejected) |
| pEd7jw0uNE4 | Voicemeeter | "Aux" output missing | Windows Sound settings path changed; Voicemeeter steps rated current | other |
| xdGG-9aKq74 | Zoho Mail | "Forever Free" plan removed | Rated current. Run 1 said the free plan still exists under "Sign Up Now". Possibly regional; unresolved | miss (run 1 keyword match rejected) |
| 7H1r1fC_HMY | OBS Studio | Audio monitoring / ReaEQ interface changed | All 8 steps rated current | miss |
| C_0FSgVgqnc | Search Console | DNS provider dropdown gone | Rated current, with google.com sources: Raahi and the viewers disagree | miss |

## Controls, hand-reviewed (run 2)

4 of 61 steps were marked changed, on 2 of 6 videos. Both videos are Claude products,
which shipped UI changes in 2026.
- Claude Design: "Export, not Share, for Hand off to Claude Code" (claude.com ×2): plausibly real.
- Claude Design: Tweaks panel and Edit button. Sources are competitor and blog sites: doubtful.
- Claude connectors: "Continue" instead of "Add" (claude.com). The button was renamed, so
  under run 2's own rule this should have been `current`: a false alarm.

Holdout (OBS, Canva, Instagram in Hindi, Facebook payouts; all 2026): 46/46 steps
rated current, 46/46 with a source, 27/46 with an official source.

## Evidence coverage (run 2, all 252 steps)

| | Cases | Controls | Holdout |
|---|---|---|---|
| Steps with ≥1 grounding source | 95.9% | 85.2% | 100% |
| Steps with an official-vendor source | 53.8% | 23.0% | 58.7% |
| Steps with a timestamp link | 100% | 100% | 100% |
| Verdicts downgraded (no source) | 6 | 7 | 0 |

## Latency

| Stage | Setting | Median | Range |
|---|---|---|---|
| Verify (all steps, batches of 4 in parallel) | one video at a time (run 2) | 10.8 s (cases) | 5.7–50.7 s |
| Verify | 4 videos at once (run 1) | 14.2 s | up to 111.8 s |
| Extract (Gemini watches the video) | one video at a time (holdout) | 21.6 s | 11.8–106.6 s (the 106.6 s video is 21 min long) |
| Extract | 4 videos at once (run 1) | 44.4 s | up to 650.9 s |

Extraction is the slow, variable stage, and it slows down sharply under concurrent load.
A video is only extracted once (cached 7 days), so a demo video should be warmed
beforehand.

## What these results do not show

- **Small and hand-built.** 16 cases, 10 controls. One person (the build agent)
  chose the cases and did the hand review. Nobody independent has checked it yet.
- **Tuned on controls.** The run 2 prompt was written after seeing run 1's controls.
  The 4 holdout videos are the only untuned precision check.
- **One run each.** Gemini is not deterministic, and repeated runs may differ by a case or two.
- **Changed steps that viewers didn't report were not scored.** On old videos Raahi marks
  about a third of steps changed, and most of those spot-checked look right (GA4 paths,
  Shopify Content > Menus), but this was not scored step by step.
- **Viewers can be wrong too.** Two misses (Zoho, Search Console) may be
  region- or account-specific; Raahi cites official pages for its "current" verdict.

Reproduce: `python -m eval.rescue_eval --force --workers 1 --sets cases,controls,holdout_controls`
(needs `USE_VERTEX=1` and Vertex credentials).
