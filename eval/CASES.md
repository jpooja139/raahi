# Tutorial Rescue eval set (comment-labelled)

Procedure: B_old rows with counts.OUTDATED>0 and 120<=duration_s<=1500 (47 scanned). Pulled non-creator top-level comments (relevance+time files) tagged OUTDATED by analyze.py, then read them by hand; kept a video only if a comment names a specific gone/renamed/moved UI element or a shut-down/replaced product. Max 4 per query; likes/repeats raised confidence. No web or API used.

Counts: candidates scanned 47 | kept 16 | rejected-vague 21 (generic 'outdated'/'please update', or no named element) | rejected-other 10 (viewer-own-problem, off-topic, per-query cap, or no real change evidence). Target of 20 not reached; floor of 12 met.

Kept per query: how to connect custom domain to google sites: 4; google analytics setup tutorial: 2; how to create facebook business page: 2; how to set up instagram business account: 1; wordpress website tutorial for beginners: 1; shopify store setup tutorial: 1; obs studio setup tutorial: 3; google search console setup: 2

Caveat: 'option not showing' comments (Instagram, Blogger, Facebook) may be account-type/region/mobile issues, hence medium.

| video_id | tool | changed_label | confidence |
|---|---|---|---|
| b4ij06Tt3U4 | Google Workspace / Gmail with custom domain | Google Domains no longer exists (sold to Squarespace), so the domain-purchase step shown in the video is gone. | high |
| 1G51dz5Gt-g | Google Sites with custom domain | Google Domains was discontinued and taken over by Squarespace; the custom-URL setup no longer works as shown. | high |
| xdGG-9aKq74 | Free custom-domain email (Zoho Mail) | The 'Forever Free' plan option/tab has been removed, so the free-email path in the video is gone. | high |
| FHL75CGDjgA | Blogger (Blogspot) custom domain | Blogger's settings no longer show the third-party/custom domain option shown in the video. | medium |
| njri8_gJTs0 | Google Analytics | Universal Analytics was replaced by GA4; the Acquisition/Behavior side menu in the video no longer exists. | high |
| vshlg0U3UqA | Google Analytics | The 'Tracking code' option shown in the video is no longer present (GA4 uses a different install flow). | medium |
| trBA7xGgzjk | Facebook Page | Meta redesigned Pages: the Settings entry in the left menu and the 'unpublish page' option are no longer where the video shows. | medium |
| 6Kn0MFAaQDM | Facebook Ads | The Pixel Caffeine tool no longer works and the Ads interface for viewing ad performance has changed. | medium |
| 2f6mfgzTQSA | Instagram Business account | The 'Switch to professional/business account' option is not showing where the video shows it in Settings. | medium |
| Q7AOvWpIVHU | Vite / Three.js project setup | The Vite install command shown is outdated; viewers say 'npm init vite' is now the way to scaffold. | medium |
| eTLWd70Y3F0 | Shopify | Shopify's admin/theme editor changed: no Slideshow section option, and the free trial is no longer 14 days. | high |
| f_fGXgh0A8k | Snap Camera with OBS | Snap Camera was discontinued and its download site is gone, so the whole workflow no longer works. | high |
| pEd7jw0uNE4 | Voicemeeter with OBS | Viewers cannot find the Voicemeeter 'Aux' output option shown in the video; B2 output used instead. | medium |
| 7H1r1fC_HMY | OBS Studio audio filters | OBS update changed audio monitoring and the interface; ReaEQ VST filter has no open-interface button. | medium |
| C_0FSgVgqnc | Google Search Console | Search Console's DNS verification flow changed: the provider dropdown (GoDaddy, Namecheap) and 'advanced detailed instructions' link are gone. | high |
| kdbniwINFFA | Google Search Console (Bluehost DNS) | Bluehost updated its dashboard, so the DNS/TXT record option shown is no longer visible. | medium |
