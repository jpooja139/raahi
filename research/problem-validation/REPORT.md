# What is the creator's real pain? — evidence, 18 Oct 2026

Three independent lenses, no product idea assumed.

## Lens 1 — Creators' own words (measured, reproducible)
`collect_creator_voices.py` + `code_voices.py`: 9,738 unique comments (86,950 likes) on the latest long-form
uploads of YouTube Creators, Creator Insider, vidIQ, Think Media (94 videos; YouTube India had only Shorts).
Themes came from open coding of a random 170-comment sample (seed 11), then a regex codebook over all comments.
Likes = other creators agreeing.

| Theme | Comments | Share of all likes | Top comment (likes) |
|---|---:|---:|---|
| Monetization rules / getting into YPP | 198 | **11.2%** | "4,000 watch hours already seemed impossible... 😢" (1,960) |
| Small vs big creators (unfairness) | 144 | 6.5% | "big creators eat the whole cake, small creators fight for the crumbs" (614) |
| Quit / burnout / lost joy* | 83 | 6.4% | "YouTube! Just tell us to Quit. We are not MR beast…" (1,395) |
| Reach / algorithm / impressions | 150 | 1.0% | "0 views jails hurts" (57) |
| Stolen / reused / AI content | 56 | 0.8% | "reach collapsed while AI-generated content floods recommendations" (35) |
| Copyright claims | 30 | 0.3% | library music still claimed on Shorts |
| Demonetized / terminated / strikes | 57 | 0.3% | "no response of emails… don't create trouble for small creators" (14) |
| No human support / appeals | 26 | 0.1% | "fix creator support, at least watch our appeals" (56) |

*Top-liked "quit" comments are reactions to the monetization change, so this theme overlaps the first.
Milestone "thanks for N subscribers" posts (7.4% of comments) are noise, but show the audience is tiny creators.
Our earlier concepts barely register: dead links 0, tool/website setup 0, "outdated" 13 (≈50% precision).

Caveats: comments react to what these channels posted (26% of monetization comments are on one video —
YouTube's YPP update); regex precision not yet hand-checked per theme; English-dominant; reply/like counts are API snapshots.

## Lens 2 — The trigger (verified)
YouTube, 10 Aug 2026: from **1 Feb 2027** new YPP applicants need **8,000 qualified watch hours / 365 days or
20M qualified Shorts views / 90 days** (was 4,000 / 10M); existing members must stay above 10M Shorts views / 90 days
to keep Shorts revenue and accept new terms by 31 Jan 2027.
https://blog.youtube/news-and-events/youtube-monetization-qualified-watch-hours-shorts-views/

## Lens 3 — Surveys 2024–26 (secondary; mostly vendor-run)
1. Income instability — 51% struggle to monetise (Fujifilm, AU, n=1,000+); 48.7% of US creators earn <$10K
   (Influencer Marketing Factory, n=1,000, Jan 2026); 55% of burned-out creators cite financial instability (BDB, n=1,000).
2. Reach / algorithm — top growth barrier 18% (CreatorIQ, n=300); 59% of long-form YouTubers <1K views/post (IMF).
3. Burnout — 52% burnout, 37% considering leaving (BDB); 65% stressed (Kolsquare, n=783).
4. Brand deals (India) — 55% lost deals because brands couldn't reach them (HashFame, n=32,000); Kofluence "Decoding Influence" 2025 (vendor; 1,000+ creators/brands/marketers
   surveyed + 2M creator profiles; published 9 Jul 2025), verbatim: "Sponsored collaborations top income streams for
   creators, though platform ad revenue accounts for only 15% of their earnings" and "88% of creators earn less than
   75% of their income from social media". The often-quoted "brand deals = 47% of revenue" appears only in Net Influencer
   (8 Jul 2025), not on Kofluence's own 2025 or 2025-26 pages or the PTI wire; "47.1% prefer ambassador deals" also
   not found. Use the verbatim lines, never 47%; Hindi = 42% of Indian creators (ISB–HashFame 2026).
5. AI — 78% fear unconsented AI training (Adobe, Jan 2026).
Full source list: agent summary in the session; key URLs in the chat answer.

## Earlier lens (concepts A/B/C) — see results.json, samples.md
Old tutorials: 45.8% carry "doesn't work anymore" comments vs 14.6% of new ones — a real VIEWER pain,
but creators don't voice it. Dead-link tools exist (5+) with near-zero revenue (BrokenTube $119 all-time).

## Brand deals / brand discovery (collect_brand.py + code_brand.py)
65 videos found by 7 "how to get brand deals / sponsorship kaise le" queries (4 English, 3 Hindi; since 2024),
4,573 comments (bot spam excluded). Themes from open coding (seed 3, 150 comments); hand-check of 10 random matches
per theme: NO_DEALS ~8/10, SCAM ~8/10, PLATFORM 10/10, PRICING ~8/10 correct.

| Theme | Comments | From Hindi-query videos | Example |
|---|---:|---:|---|
| Whom/how to pitch, media kit | 71 | 66% | creators paste the video's template: "free review video in exchange of your product" |
| Negotiation / contracts / payment / tax | 63 | 25% | "big brands… delayed payments… 30/60/90-day net" |
| Pitching for FREE product (barter) | 47 | 85% | template paste-ins |
| No deals / no reply | 41 | 71% | "6 years, 1,800 videos, 6,000 subs, 0 brand deals. No one has ever reached out"; "Koi brand reply n karta 104k followers here" |
| Scams / pay-to-collab | 38 | 57% | "Wo sab 599 mang rahe hai"; "paid 499 still not getting any collaboration… refund" |
| Instagram Creator Marketplace black hole | 35 | 91% | "Discover projects pe koi brands dikh hi nahi rahi… 10k followers, 8M reach"; "I'm interested kiya, koi response nahi" |
| Alone / manager / time | 25 | 12% | "Do I really have to do all this alone???" |
| How many views/followers needed | 20 | 45% | "Kitne followers me collab milta hai?" |
| Pricing / rates | 20 | 10% | "14.7k followers, 4.5% engagement, no deals… lost on what to charge" |

Caveats: absolute volumes are small (each theme ≈1% of comments; most comments are generic thanks/questions);
likes are low on these smaller videos, so intensity is not comparable with the YPP reaction; Instagram-focused
videos appear in results (Hindi queries especially), so this is cross-platform creator pain, not YouTube-only.

Market check (agent, vendor-heavy): ISB–HashFame (Jul 2026, Qoruz platform data, press summary): ~85% of non-metro
creators get no paid campaign in a year; non-metro = 66% of 4.12M Indian creators. WPP Media 2025: 83% of Indian
marketers struggle with influencer discovery. Scams: CloudSEK (Dec 2024) 200K+ creators targeted by fake
"collaboration proposal" malware; Google TAG (2021) 15K attacker accounts. Payments: Indian agency cycles 90–120 days
(Storyboard18, interviews). YouTube BrandConnect requires YPP membership, so the 2027 YPP doubling also delays
access to YouTube's own brand marketplace. Instagram Creator Marketplace launched in India Feb 2024 (inbound only).

### Scam theme, hand-reviewed (all 38 matches → 35 unique texts; one comment posted 4×)
29 of 35 are genuine offer-legitimacy concerns (the rest: refunds, pricing, a brand complaining about agencies):
- Pay-to-collab fee (₹199–₹599 "registration / shipping / subscription"): 14 — 12 of them on two videos that promoted
  paid creator platforms (one commenter: the platform paid the YouTuber, who "didn't verify"). Do not name platforms as scams.
- Account hijack / malware fear or experience: 7 — incl. "email from DJI… sent me a WinRAR file to view the contract"
  (the CloudSEK lure pattern) and "my channel was hacked because of brand collaboration. I checked and it seems legit".
- Explicit "how do I know if this offer is legit?": 8 — e.g. "How do you know if an email offer is legit and not something malicious?"
Volume is small (≈0.6% of comments); severity is high (lost money or lost channel). Script: inline in session, uses code_brand.RX.

### Can public YouTube data show who sponsors whom? (probe, 432 already-collected videos)
API `paidProductPlacementDetails.hasPaidProductPlacement`: 2.5% (C_old), 3.3% (C_new), 7.2% (B_new).
Sponsor phrase in description: 11.0% / 0.8% / 0.5%. The flag under-reports (C_old: 3 flagged vs 13 described), and the
phrase regex also hit "is not sponsored", so brand names need LLM extraction. Signal exists but is sparse.
