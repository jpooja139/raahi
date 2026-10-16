# Raahi — architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[Single-page UI<br/>chat · cards · roadmap]
    MIC[Mic AudioWorklet<br/>PCM16 16 kHz]
    SPK[Playback 24 kHz<br/>barge-in clears queue]
    SHOT["dikhao" — one<br/>getDisplayMedia frame]
  end

  subgraph FastAPI[FastAPI on Cloud Run — keys stay server-side]
    LD[Link Doctor]
    PL[Planner<br/>decision card + roadmap]
    VR[Verifier]
    GD[Guide chat]
    RS[Tutorial Rescue<br/>2-pass]
    LV[Live bridge /ws/live<br/>tools: run_check,<br/>get_current_step]
  end

  subgraph Google
    YT[YouTube Data API v3]
    GM[Gemini 3.8 Flash<br/>structured output]
    GS[Google Search grounding]
    GL[Gemini 3.8 Live<br/>native audio hi-IN/en-IN]
    DNS[Google Public DNS<br/>DoH]
  end

  UI --> LD --> YT
  LD -->|httpx link checks| WEB[(the open web)]
  UI --> PL --> GM
  UI --> VR --> DNS
  VR --> WEB
  UI --> GD --> GM
  SHOT --> GD
  UI --> RS --> GM
  RS -->|video URL / transcript| YT
  RS --> GS
  MIC --> LV <--> GL
  LV --> SPK
  LV --> VR
```

Design rules baked in:
- **Voice is a layer, not a dependency** — every feature works over text, so a
  Live failure never kills the demo.
- **Hints before answers** (PNAS 2025: answer-giving tutors harm learning).
- **Trust the check, not the screen** — DNS/page verification decides "done".
- **One screenshot on request, never a stream** — fits Live's ~2-min
  audio+video cap and the user's privacy.
- **Curated tool catalogue** — prices and difficulty are vouched for, not
  hallucinated.
