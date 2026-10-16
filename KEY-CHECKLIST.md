# Live verifications to run once real keys land in .env

The server auto-reloads; no restart needed after editing .env... actually env vars load at import — run `touch app/config.py` after editing .env to trigger reload.

## Needs YOUTUBE_API_KEY
- [ ] `curl -s -X POST localhost:8000/api/linkdoctor -H 'Content-Type: application/json' -d '{"channel":"@GoogleDevelopers"}'` → report with channel_title "Google for Developers", no `broken` items caused solely by 403s
- [ ] Re-run the same scan → returns in <1 s (disk cache hit)

## Needs GEMINI_API_KEY
- [ ] Task 3: decide endpoint returns Google Sites roadmap for the website goal
- [ ] Task 6: Tutorial Rescue video-ingestion probe (3-min video) — THE day-one risk check
- [ ] Task 7: Live voice session en-IN, then hi-IN
- [ ] Task 5: `/api/guide` "mujhe DNS samajh nahi aaya" → Hindi hint, not the record value; "done" → run_check true; dikhao screenshot → names a visible control
- [ ] Task 6 PROBE (do FIRST): `curl -s -X POST localhost:8000/api/rescue -d '{"url":"<3-min tutorial>"}' -H 'Content-Type: application/json'` → steps with statuses; check `"source"` field: "video" = ingestion works, "transcript" = fallback engaged (both acceptable, video preferred)
- [ ] Task 7: mic button → speak "what's my next step?" (en-IN) → spoken reply matches roadmap; "check it" on DNS step → verifier runs, result spoken; force-kill session → auto-reconnect keeps step; repeat in hi-IN; note Hinglish behaviour for the pitch
- [ ] Reviewer flags needing real keys: does gemini-3.8-live accept explicit language_code hi-IN (some native-audio models ignore/reject it)? Is Search grounding enabled on the AI Studio tier?
- [ ] Cloud Run note: YouTube blocks transcript scraping from cloud IPs — run the Tutorial Rescue demo from the laptop, or pre-cache the demo video's rescue response
