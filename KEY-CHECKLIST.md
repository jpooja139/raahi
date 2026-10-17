# Live verifications to run once real keys land in .env

The server auto-reloads; no restart needed after editing .env... actually env vars load at import — run `touch app/config.py` after editing .env to trigger reload.

## Needs YOUTUBE_API_KEY
- [x] 2026-10-17 PASSED (Google for Developers: 50 videos, 105 links, 3 real 404s, 0 false broken) `curl -s -X POST localhost:8000/api/linkdoctor -H 'Content-Type: application/json' -d '{"channel":"@GoogleDevelopers"}'` → report with channel_title "Google for Developers", no `broken` items caused solely by 403s
- [x] 2026-10-17 re-scan ~4 s: YouTube data cached, link checks re-run by design (fixed links must show fixed)

## Needs GEMINI_API_KEY
- [x] 2026-10-17 PASSED — Google Sites, 3 rejected w/ reasons, 6 steps, dns check (~40 s latency)
- [ ] Task 6: Tutorial Rescue video-ingestion probe (3-min video) — THE day-one risk check
- [ ] Task 7: Live voice session en-IN, then hi-IN
- [x] 2026-10-17 PASSED (Hindi hint-first phonebook analogy; 'ho gaya' → run_check true; dikhao still untested in browser) — `/api/guide` "mujhe DNS samajh nahi aaya" → Hindi hint, not the record value; "done" → run_check true; dikhao screenshot → names a visible control
- [x] 2026-10-17 PASSED LIVE on Cloud Run (hybrid): video extract + Vertex grounding, 8 steps incl 'changed', 89s — Task 6 PROBE: `curl -s -X POST localhost:8000/api/rescue -d '{"url":"<3-min tutorial>"}' -H 'Content-Type: application/json'` → steps with statuses; check `"source"` field: "video" = ingestion works, "transcript" = fallback engaged (both acceptable, video preferred)
- [ ] Task 7: mic button → speak "what's my next step?" (en-IN) → spoken reply matches roadmap; "check it" on DNS step → verifier runs, result spoken; force-kill session → auto-reconnect keeps step; repeat in hi-IN; note Hinglish behaviour for the pitch
- [ ] Reviewer flags needing real keys: does gemini-3.8-live accept explicit language_code hi-IN (some native-audio models ignore/reject it)? Is Search grounding enabled on the AI Studio tier?
- [ ] Cloud Run note: YouTube blocks transcript scraping from cloud IPs — run the Tutorial Rescue demo from the laptop, or pre-cache the demo video's rescue response
- [ ] AFTER THE EVENT: rotate both API keys (they transited terminals during the hackathon) and add the new values to Secret Manager (`gcloud secrets versions add raahi-env --data-file=.env`)
