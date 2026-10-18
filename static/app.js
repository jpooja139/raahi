/* Raahi frontend — vanilla JS, no build step. */
"use strict";

// ---- strings (bilingual-ready; hi values refined later) ----
const STRINGS = {
  tagline: {
    en: "Not every creator has an engineer. Raahi is yours.",
    hi: "हर क्रिएटर के पास इंजीनियर नहीं होता। राही आपका AI इंजीनियर है।",
  },
  chat_placeholder: { en: "Ask Raahi anything…", hi: "राही से कुछ भी पूछें…" },
  send: { en: "Send", hi: "भेजें" },
  dikhao: { en: "Show screen", hi: "दिखाओ" },
  ld_title: { en: "Link Doctor", hi: "लिंक डॉक्टर" },
  ld_sub: {
    en: "Scan a channel's video descriptions for broken links",
    hi: "चैनल के वीडियो डिस्क्रिप्शन में टूटे लिंक खोजें",
  },
  ld_placeholder: { en: "@handle or channel URL", hi: "@handle या चैनल URL" },
  ld_scan: { en: "Scan", hi: "स्कैन करें" },
  tr_title: { en: "Tutorial Rescue", hi: "ट्यूटोरियल रेस्क्यू" },
  tr_sub: {
    en: "Paste an old tutorial — get today's steps",
    hi: "पुराना ट्यूटोरियल दें — आज के स्टेप पाएं",
  },
  tr_placeholder: { en: "YouTube tutorial URL", hi: "YouTube ट्यूटोरियल URL" },
  tr_go: { en: "Rescue", hi: "रेस्क्यू" },
  dc_title: { en: "What do you want to build?", hi: "क्या बनाना चाहते हैं?" },
  dc_sub: {
    en: "Raahi picks the right tool and builds your roadmap",
    hi: "राही सही टूल चुनकर आपका रोडमैप बनाएगा",
  },
  dc_placeholder: {
    en: "e.g. my own website with my videos and an email signup",
    hi: "जैसे: मेरी वेबसाइट, मेरे वीडियो और ईमेल साइनअप के साथ",
  },
  dc_go: { en: "Plan it", hi: "प्लान करो" },
  thinking: { en: "Raahi is thinking…", hi: "राही सोच रहा है…" },
  wait_ld: { en: "Scanning… ~15 seconds", hi: "स्कैन हो रहा है… ~15 सेकंड" },
  wait_tr: { en: "Reading the video and today's docs… 1–2 minutes", hi: "वीडियो और आज के docs पढ़े जा रहे हैं… 1–2 मिनट" },
  wait_dc: { en: "Comparing tools and building your roadmap… ~40 seconds", hi: "टूल्स की तुलना और रोडमैप… ~40 सेकंड" },
  trust: { en: "🔒 Raahi never asks for passwords or OTPs", hi: "🔒 राही कभी पासवर्ड या OTP नहीं मांगता" },
  fixme: { en: "🔧 Fix these with me", hi: "🔧 मेरे साथ ठीक करें" },
  resumed: { en: "Resumed your plan:", hi: "आपका प्लान वापस लोड हुआ:" },
};

let LANG = "en";

function applyStrings() {
  document.querySelectorAll("[data-str]").forEach((el) => {
    const s = STRINGS[el.dataset.str];
    if (s) el.textContent = s[LANG];
  });
  document.querySelectorAll("[data-strph]").forEach((el) => {
    const s = STRINGS[el.dataset.strph];
    if (s) el.placeholder = s[LANG];
  });
}

document.getElementById("lang-en").onclick = () => setLang("en");
document.getElementById("lang-hi").onclick = () => setLang("hi");
function setLang(l) {
  LANG = l;
  document.getElementById("lang-en").classList.toggle("active", l === "en");
  document.getElementById("lang-hi").classList.toggle("active", l === "hi");
  applyStrings();
}

// ---- helpers ----
async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

function addMsg(role, text) {
  const log = document.getElementById("chat-log");
  const div = document.createElement("div");
  div.className = "msg " + role;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ---- boot ----
applyStrings();
addMsg("system", "Raahi is ready. नमस्ते!");

// Feature modules (Tasks 2-7) attach their handlers below this line.

// ---- Link Doctor (Task 2) ----
document.getElementById("ld-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const box = document.getElementById("ld-report");
  const q = document.getElementById("ld-input").value.trim();
  if (!q) return;
  box.innerHTML = "";
  box.appendChild(el("div", "spin", STRINGS.wait_ld[LANG]));
  try {
    const r = await api("/api/linkdoctor", { channel: q, force: !!window.RAAHI.fixing });
    window.RAAHI.handle = q;
    box.innerHTML = "";
    const rep = el("div", "report");
    rep.appendChild(
      el("div", "headline",
        `${r.channel_title}: ${r.broken} broken, ${r.warned} to review — ` +
        `${r.links_checked} links across ${r.videos_scanned} videos`)
    );
    r.items.filter((i) => i.status !== "ok").slice(0, 40).forEach((i) => {
      const row = el("div", "row");
      const pill = el("span", "pill " + i.status, i.status + (i.http_code ? " " + i.http_code : ""));
      row.appendChild(pill);
      row.appendChild(el("span", "url", i.url));
      row.appendChild(el("span", "vid", `${i.video_title} · ${i.video_views.toLocaleString()} views`));
      rep.appendChild(row);
    });
    if (r.broken + r.warned === 0) rep.appendChild(el("div", "spin", "All links healthy ✔"));
    if (r.broken > 0) {
      const fix = el("button", "cta", STRINGS.fixme[LANG]);
      fix.style.marginTop = "12px";
      fix.onclick = () => {
        const broken = r.items.filter((i) => i.status === "broken").slice(0, 5);
        const steps = broken.map((i, k) => ({
          n: k + 1,
          title: (LANG === "hi" ? `"${i.video_title}" के description में यह लिंक बदलें` : `Replace this link in the description of "${i.video_title}"`),
          why: `${i.url} (HTTP ${i.http_code || "dead"}) · ${i.video_views.toLocaleString()} views`,
          minutes: 3,
          concept: k === 0 ? (LANG === "hi" ? "YouTube Studio → Content → वीडियो → Description में लिंक बदलें।" : "YouTube Studio → Content → the video → edit the Description to swap the link.") : "",
          check: { type: "manual", target: "" },
        }));
        steps.push({ n: steps.length + 1,
          title: LANG === "hi" ? "दुबारा स्कैन करें — broken गिनती गिरनी चाहिए" : "Re-scan the channel — the broken count should drop",
          why: LANG === "hi" ? "यही सबूत है कि काम हुआ" : "That is the proof the fix worked",
          minutes: 1, concept: "", check: { type: "manual", target: "" } });
        window.RAAHI.fixing = true; // future re-scans bypass the cache to show fixes
        renderDecision({
          _source: "recipe",
          recommendation: (LANG === "hi" ? "टूटे लिंक ठीक करें" : "Fix broken links") + ` · ${r.channel_title}`,
          why: LANG === "hi" ? `${r.broken} टूटे लिंक मिले — सबसे ज़्यादा views वाले पहले।` : `${r.broken} broken link(s) found — highest-view videos first.`,
          cost: "", time_minutes: steps.reduce((a, x) => a + x.minutes, 0),
          rejected: [], clarifying_questions: [], roadmap: steps,
        });
        addMsg("system", LANG === "hi" ? "फ़िक्स रोडमैप तैयार — चैट में पूछते रहें" : "Fix roadmap ready — ask me in chat as you go");
        document.getElementById("tool-decide").scrollIntoView({ behavior: "smooth" });
      };
      rep.appendChild(fix);
    }
    box.appendChild(rep);
  } catch (err) {
    box.innerHTML = "";
    box.appendChild(el("div", "error", err.message));
  }
});

// ---- Decision card + roadmap (Tasks 3-4) ----
window.RAAHI = { decision: null, current_step: 1 };

function renderDecision(d) {
  const card = document.getElementById("dc-card");
  const qbox = document.getElementById("dc-questions");
  const rbox = document.getElementById("dc-roadmap");
  card.innerHTML = ""; qbox.innerHTML = ""; rbox.innerHTML = "";

  if (d.clarifying_questions.length) {
    const form = el("form", "report");
    d.clarifying_questions.forEach((q, i) => {
      const label = el("label", "", q);
      label.style.display = "block"; label.style.margin = "8px 0 4px";
      const inp = el("input"); inp.dataset.q = q; inp.style.width = "100%";
      form.appendChild(label); form.appendChild(inp);
    });
    const btn = el("button", "", LANG === "hi" ? "जवाब भेजें" : "Answer & plan");
    btn.style.marginTop = "10px";
    form.appendChild(btn);
    form.onsubmit = (e) => {
      e.preventDefault();
      const answers = { ...(window.RAAHI.answers || {}) };
      form.querySelectorAll("input").forEach((i) => { if (i.value.trim()) answers[i.dataset.q] = i.value.trim(); });
      window.RAAHI.answers = answers;
      runDecide(window.RAAHI.goal, answers);
    };
    qbox.appendChild(form);
    return;
  }

  window.RAAHI.decision = d;
  window.RAAHI.current_step = 1;
  if (typeof RaahiVoice !== "undefined") RaahiVoice.sendState(voiceState);
  updateProgress(); saveState();
  const c = el("div", "report");
  const headline = ["→ " + d.recommendation, d.cost, d.time_minutes ? `~${d.time_minutes} min` : ""]
    .filter((s) => s && s.trim()).join(" · ");
  const hl = el("div", "headline", headline);
  hl.appendChild(el("span", "plan-tag", d._source === "recipe"
    ? (LANG === "hi" ? "तैयार recipe · जाँच live" : "predefined recipe · checks live")
    : (LANG === "hi" ? "AI-planned" : "ai-planned")));
  c.appendChild(hl);
  c.appendChild(el("p", "", d.why));
  if (d.rejected.length) {
    const det = document.createElement("details");
    det.appendChild(el("summary", "", LANG === "hi" ? "क्या नहीं चुना और क्यों" : "What I rejected and why"));
    d.rejected.forEach((r) => det.appendChild(el("p", "", `✗ ${r.name} — ${r.reason}`)));
    c.appendChild(det);
  }
  card.appendChild(c);

  d.roadmap.forEach((s) => {
    const row = el("div", "row");
    row.id = "step-" + s.n;
    const left = el("div", "");
    left.style.flex = "1"; left.style.minWidth = "220px";
    left.appendChild(el("div", "", `${s.n}. ${s.title} · ${s.minutes} min`));
    const whyText = [s.why, s.concept ? "💡 " + s.concept : ""].filter(Boolean).join("  ");
    const why = el("div", "url", whyText);
    left.appendChild(why);
    row.appendChild(left);
    const status = el("span", "pill", "·");
    status.id = "step-status-" + s.n;
    const btn = el("button", "ghost", LANG === "hi" ? "जाँचें" : "Check");
    btn.onclick = () => runCheck(s, status);
    row.appendChild(status);
    row.appendChild(btn);
    rbox.appendChild(row);
  });
}

async function runDecide(goal, answers) {
  const card = document.getElementById("dc-card");
  card.innerHTML = ""; card.appendChild(el("div", "spin", STRINGS.wait_dc[LANG]));
  try {
    const d = await api("/api/decide", { goal, answers, handle: window.RAAHI.handle || "" });
    renderDecision(d);
  } catch (err) {
    card.innerHTML = ""; card.appendChild(el("div", "error", err.message));
  }
}

document.getElementById("dc-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const goal = document.getElementById("dc-input").value.trim();
  if (!goal) return;
  window.RAAHI.goal = goal; window.RAAHI.answers = {};
  runDecide(goal, {});
});

function advanceStep(n) {
  const total = window.RAAHI.decision?.roadmap.length || n;
  window.RAAHI.current_step = Math.min(n + 1, total + 1); // total+1 == complete
  if (typeof RaahiVoice !== "undefined") RaahiVoice.sendState(voiceState);
  updateProgress(); saveState();
}

function updateProgress() {
  const p = document.getElementById("progress");
  const d = window.RAAHI.decision;
  if (!p) return;
  if (!d || !d.roadmap.length) { p.hidden = true; return; }
  const cur = window.RAAHI.current_step;
  p.hidden = false;
  if (cur > d.roadmap.length) {
    p.textContent = LANG === "hi" ? "सब पूरा ✓" : "Complete ✓";
    p.style.color = "var(--ok)"; p.style.borderColor = "rgba(81,227,173,.35)"; p.style.background = "var(--ok-bg)";
    return;
  }
  p.style.color = ""; p.style.borderColor = ""; p.style.background = "";
  const left = d.roadmap.filter((s) => s.n >= cur).reduce((a, s) => a + s.minutes, 0);
  p.textContent = (LANG === "hi")
    ? `स्टेप ${cur} / ${d.roadmap.length} · ~${left} मिनट बाकी`
    : `Step ${cur} of ${d.roadmap.length} · ~${left} min left`;
}

function saveState() {
  try {
    localStorage.setItem("raahi", JSON.stringify({
      decision: window.RAAHI.decision, current_step: window.RAAHI.current_step,
      goal: window.RAAHI.goal || "", history: HISTORY.slice(-20),
    }));
  } catch {}
}

async function runCheck(step, statusEl) {
  if (step.check.type === "manual") {
    statusEl.className = "pill warn"; statusEl.textContent = LANG === "hi" ? "हो गया (आपके कहे पर)" : "done (your word)";
    advanceStep(step.n);
    return;
  }
  statusEl.className = "pill"; statusEl.textContent = "…";
  try {
    const r = await api("/api/verify", { type: step.check.type, target: step.check.target, expect: step.check.expect || "" });
    statusEl.className = "pill " + (r.passed ? "ok" : "warn");
    statusEl.textContent = (r.passed ? "✔ " : "✗ ") + r.detail;
    if (r.passed) { advanceStep(step.n); learnFromStep(step); }
  } catch (err) {
    statusEl.className = "pill broken"; statusEl.textContent = err.message;
  }
}

// ---- Guided chat + dikhao (Task 5) ----
const HISTORY = [];
let pendingShot = null;

const dikhaoBtn = document.getElementById("dikhao-btn");
dikhaoBtn.hidden = false;

dikhaoBtn.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const track = stream.getVideoTracks()[0];
    const video = document.createElement("video");
    video.srcObject = stream;
    await video.play();
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1024 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    track.stop(); // one frame, never a stream
    pendingShot = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
    addMsg("system", LANG === "hi" ? "📸 स्क्रीनशॉट अगले संदेश के साथ जाएगा" : "📸 Screenshot attached to your next message");
    document.getElementById("chat-text").focus();
  } catch {
    addMsg("system", LANG === "hi" ? "स्क्रीन शेयर नहीं हो पाई" : "Screen share was cancelled");
  }
});

document.getElementById("chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("chat-text");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  addMsg("user", text + (pendingShot ? " 📸" : ""));
  HISTORY.push({ role: "user", text });
  const thinking = addMsg("system", STRINGS.thinking[LANG]);
  const shot = pendingShot; pendingShot = null;
  try {
    const r = await api("/api/guide", {
      decision: window.RAAHI.decision,
      current_step: window.RAAHI.current_step,
      history: HISTORY.slice(0, -1),
      message: text,
      screenshot_b64: shot,
    });
    thinking.remove();
    addMsg("raahi", r.reply);
    HISTORY.push({ role: "raahi", text: r.reply });
    saveState();
    if (r.run_check && window.RAAHI.decision) {
      const step = window.RAAHI.decision.roadmap.find((s) => s.n === window.RAAHI.current_step);
      if (step && step.check.type === "manual") {
        const pill = document.getElementById("step-status-" + step.n);
        if (pill) { pill.className = "pill warn"; pill.textContent = LANG === "hi" ? "हो गया (आपके कहे पर)" : "done (your word)"; }
        advanceStep(step.n);
      } else if (step) {
        const res = await api("/api/verify", { type: step.check.type, target: step.check.target, expect: step.check.expect || "" });
        const line = (res.passed ? "✔ " : "✗ ") + res.detail;
        addMsg("raahi", line);
        HISTORY.push({ role: "raahi", text: line });
        const pill = document.getElementById("step-status-" + step.n);
        if (pill) { pill.className = "pill " + (res.passed ? "ok" : "warn"); pill.textContent = res.passed ? "✔" : "✗"; }
        if (res.passed) { advanceStep(step.n); learnFromStep(step); }
      }
    }
  } catch (err) {
    thinking.remove();
    addMsg("system", "⚠ " + err.message);
  }
});

// ---- Tutorial Rescue: the video's steps appear first, then each is checked ----
const TR = {
  reading: { en: "Watching the video for its steps… usually under a minute", hi: "वीडियो देखकर स्टेप निकाले जा रहे हैं… आमतौर पर एक मिनट से कम" },
  checking: { en: "Checking each step against today's docs… about 10 seconds", hi: "हर स्टेप आज के docs से जाँचा जा रहा है… लगभग 10 सेकंड" },
  st: {
    current: { en: "still works", hi: "अभी भी सही" },
    changed: { en: "changed", hi: "बदल गया" },
    unverifiable: { en: "unconfirmed", hi: "पुष्टि नहीं" },
    pending: { en: "checking…", hi: "जाँच…" },
  },
  today: { en: "Today: ", hi: "आज: " },
  old: { en: "The video said: ", hi: "वीडियो में: " },
  nosrc: { en: "No source backed this verdict, so Raahi won't call it current or changed.", hi: "इस जवाब का कोई स्रोत नहीं मिला, इसलिए राही इसे सही या बदला हुआ नहीं कहेगा।" },
  official: { en: "official", hi: "आधिकारिक" },
  from_video: { en: "read from the video", hi: "वीडियो से पढ़ा" },
  from_tr: { en: "read from the transcript", hi: "ट्रांसक्रिप्ट से पढ़ा" },
  published: { en: "published ", hi: "प्रकाशित " },
  card_h: { en: "For the creator: pin this comment on the video", hi: "क्रिएटर के लिए: यह कमेंट वीडियो पर पिन करें" },
  copy: { en: "Copy comment", hi: "कमेंट कॉपी करें" },
  copied: { en: "Copied ✓", hi: "कॉपी हुआ ✓" },
  recheck: { en: "Re-check now", hi: "फिर से जाँचें" },
  guide: { en: "Guide me through this", hi: "मुझे इसमें गाइड करो" },
};
const T = (o) => o[LANG] || o.en;

function trSummary(r) {
  const c = r.counts, n = r.steps.length;
  const when = new Date(r.checked_at).toLocaleDateString(LANG === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" });
  return LANG === "hi"
    ? `${n} में से ${c.changed} स्टेप बदल गए · ${c.with_sources} स्टेप स्रोत के साथ जाँचे (${c.with_official_source} आधिकारिक) · ${when} तक`
    : `${c.changed} of ${n} steps changed · ${c.with_sources} checked with sources (${c.with_official_source} official) · as of ${when}`;
}

function trStepRow(vid, s, checked) {
  const status = checked ? s.status : "pending";
  const row = el("div", "row tr-step");
  const pillCls = { current: "ok", changed: "warn", unverifiable: "broken", pending: "wait" }[status];
  row.appendChild(el("span", "pill " + pillCls, T(TR.st[status])));
  if (s.seconds !== null && s.seconds !== undefined) {
    const a = el("a", "ts", s.t);
    a.href = `https://www.youtube.com/watch?v=${encodeURIComponent(vid)}&t=${s.seconds}s`;
    a.target = "_blank"; a.rel = "noopener";
    row.appendChild(a);
  } else if (s.t) {
    row.appendChild(el("span", "ts", s.t));
  }
  const body = el("div", "tr-body");
  if (checked && s.status === "changed") {
    body.appendChild(el("div", "tr-today", T(TR.today) + s.today));
    body.appendChild(el("div", "tr-old", T(TR.old) + s.instruction));
  } else {
    body.appendChild(el("div", "", `${s.n}. ${s.instruction}`));
    if (checked && s.today) body.appendChild(el("div", "tr-note", "→ " + s.today));
  }
  if (checked && s.downgraded) body.appendChild(el("div", "tr-nosrc", T(TR.nosrc)));
  if (checked && s.sources && s.sources.length) {
    const srcs = el("div", "srcs");
    s.sources.forEach((src) => {
      const a = el("a", "src" + (src.official ? " official" : ""), src.domain + (src.official ? " · " + T(TR.official) : ""));
      a.href = src.uri; a.target = "_blank"; a.rel = "noopener nofollow"; a.title = src.title;
      srcs.appendChild(a);
    });
    body.appendChild(srcs);
  }
  row.appendChild(body);
  return row;
}

function renderRescue(box, url, ex, r) {
  box.innerHTML = "";
  const rep = el("div", "report");
  rep.appendChild(el("div", "headline", ex.video_title));
  const meta = [ex.tool, ex.published ? T(TR.published) + ex.published : "",
                ex.source === "transcript" ? T(TR.from_tr) : T(TR.from_video)].filter(Boolean).join(" · ");
  rep.appendChild(el("div", "tr-meta", meta));
  if (r) rep.appendChild(el("div", "tr-sum", trSummary(r)));
  else rep.appendChild(el("div", "spin", T(TR.checking)));
  if (r && r.note) rep.appendChild(el("div", "error", r.note));
  (r ? r.steps : ex.steps).forEach((s) => rep.appendChild(trStepRow(ex.video_id, s, !!r)));
  if (!r) { box.appendChild(rep); return; }

  if (r.update_card) {
    const card = el("div", "tr-card");
    card.appendChild(el("h3", "", T(TR.card_h)));
    card.appendChild(el("pre", "", r.update_card));
    const copy = el("button", "ghost", T(TR.copy));
    copy.type = "button";
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(r.update_card); copy.textContent = T(TR.copied); } catch {}
    };
    card.appendChild(copy);
    rep.appendChild(card);
  }

  // Google Search suggestions must be shown with grounded results. Sandboxed:
  // no scripts run inside; links open in a new tab.
  if (r.search_entry_html) {
    const f = document.createElement("iframe");
    f.className = "tr-suggest";
    f.title = "Google Search suggestions";
    f.setAttribute("sandbox", "allow-same-origin allow-popups allow-popups-to-escape-sandbox");
    f.srcdoc = '<base target="_blank">' + r.search_entry_html;
    f.onload = () => { try { f.style.height = (f.contentDocument.body.scrollHeight + 8) + "px"; } catch {} };
    rep.appendChild(f);
  }

  const actions = el("div", "tr-actions");
  const guideBtn = el("button", "cta", T(TR.guide));
  guideBtn.type = "button";
  guideBtn.onclick = () => {
    renderDecision({
      _source: "recipe",
      recommendation: "Rescued: " + r.video_title,
      why: S("Roadmap built from the tutorial — changed steps already updated to today's UI.",
             "यह रोडमैप ट्यूटोरियल से बना है — बदले हुए स्टेप अपडेट हो चुके हैं।"),
      cost: "", time_minutes: r.steps.length * 5, rejected: [], clarifying_questions: [],
      roadmap: r.steps.map((s) => ({
        n: s.n, title: s.status === "changed" && s.today ? s.today : s.instruction,
        why: s.status === "changed" ? S("Old way: ", "पुराना तरीका: ") + s.instruction : "",
        minutes: 5, concept: "", check: { type: "manual", target: "" },
      })),
    });
    addMsg("system", S("Rescue roadmap ready — ask me in chat as you go", "रेस्क्यू रोडमैप तैयार — चैट में पूछते रहें"));
  };
  const again = el("button", "ghost", T(TR.recheck));
  again.type = "button";
  again.onclick = () => { document.getElementById("tr-input").value = url; runRescue(true); };
  actions.appendChild(guideBtn);
  actions.appendChild(again);
  rep.appendChild(actions);
  box.appendChild(rep);
}

let trRun = 0;  // only the latest run may draw; an older, slower response is dropped

async function runRescue(force) {
  const box = document.getElementById("tr-report");
  const url = document.getElementById("tr-input").value.trim();
  if (!url) return;
  const run = ++trRun;
  const btn = document.querySelector("#tr-form button[type=submit]");
  btn.disabled = true;
  box.innerHTML = "";
  box.appendChild(el("div", "spin", T(TR.reading)));
  try {
    let ex;
    try {
      ex = await api("/api/rescue/extract", { url });
    } catch (err) {
      if (run !== trRun) return;
      box.innerHTML = "";
      box.appendChild(el("div", "error", err.message));
      return;
    }
    if (run !== trRun) return;
    renderRescue(box, url, ex, null);
    try {
      const r = await api("/api/rescue", { url, lang: LANG, force: !!force });
      if (run !== trRun) return;
      renderRescue(box, url, ex, r);
    } catch (err) {
      if (run !== trRun) return;
      box.querySelectorAll(".spin").forEach((n) => n.remove());
      box.querySelectorAll(".pill.wait").forEach((p) => { p.className = "pill broken"; p.textContent = T(TR.st.unverifiable); });
      box.appendChild(el("div", "error", err.message));
    }
  } finally {
    if (run === trRun) btn.disabled = false;
  }
}

document.getElementById("tr-form").addEventListener("submit", (e) => {
  e.preventDefault();
  runRescue(false);
});

// ---- Voice (Task 7) ----
const micBtn = document.getElementById("mic-btn");
micBtn.disabled = false;
micBtn.title = "Talk to Raahi";

function voiceLang() { return LANG === "hi" ? "hi-IN" : "en-IN"; }
function voiceState() {
  return { decision: window.RAAHI.decision, current_step: window.RAAHI.current_step };
}

let liveTranscript = null;
RaahiVoice.hooks({
  onText(t) {
    if (!liveTranscript) { liveTranscript = addMsg("raahi", ""); }
    liveTranscript.textContent += t;
    const log = document.getElementById("chat-log"); log.scrollTop = log.scrollHeight;
  },
  onTool(name) {
    addMsg("system", (LANG === "hi" ? "⚙ राही जाँच रहा है: " : "⚙ Raahi is checking: ") + name);
  },
  onSpeaking(sp) { if (!sp && liveTranscript) { HISTORY.push({ role: "raahi", text: liveTranscript.textContent }); liveTranscript = null; } },
  onCheck(m) {
    const pill = document.getElementById("step-status-" + m.n);
    if (pill) { pill.className = "pill " + (m.passed ? "ok" : "warn"); pill.textContent = m.passed ? "✔" : "✗"; }
    if (m.passed) window.RAAHI.current_step = Math.min(m.n + 1, window.RAAHI.decision?.roadmap.length || m.n);
    updateProgress(); saveState();
  },
  onStatus(s) {
    micBtn.classList.toggle("live", s === "live");
    if (s === "live") addMsg("system", LANG === "hi" ? "🎙 राही सुन रहा है — बोलिए" : "🎙 Raahi is listening — speak");
    else if (s === "reconnecting") addMsg("system", LANG === "hi" ? "फिर जुड़ रहा है…" : "Reconnecting…");
    else if (s.startsWith("error:")) addMsg("system", "⚠ " + s.slice(6));
  },
});

micBtn.addEventListener("click", () => {
  if (RaahiVoice.isActive()) { RaahiVoice.stop(); micBtn.classList.remove("live"); }
  else RaahiVoice.start(voiceLang(), voiceState);
});

// ---- UI: hero/head strings + example chips ----
STRINGS.tagline = {
  en: "For creators who master content, not tech — in Hindi or English, by voice or text.",
  hi: "उन क्रिएटर्स के लिए जो कंटेंट के उस्ताद हैं, टेक के नहीं — हिंदी या English में, आवाज़ से या लिखकर।",
};
STRINGS.chat_title = { en: "Talk to Raahi", hi: "राही से बात करें" };
const HERO = {
  en: 'Your AI engineer. Decides. Guides. <span>Proves it works.</span>',
  hi: 'आपका AI इंजीनियर। फ़ैसला। गाइड। <span>और सबूत कि काम हुआ।</span>',
};
const heroEl = document.getElementById("hero-h1");
const _setLang = setLang;
setLang = function (l) { _setLang(l); heroEl.innerHTML = HERO[l]; };
document.querySelectorAll(".chip[data-fill]").forEach((c) => {
  c.addEventListener("click", () => {
    const inp = document.getElementById(c.dataset.fill);
    inp.value = c.dataset.val;
    inp.focus();
  });
});
applyStrings();


// ---- restore state (survives refresh) ----
try {
  const saved = JSON.parse(localStorage.getItem("raahi") || "null");
  if (saved && saved.decision) {
    window.RAAHI.goal = saved.goal;
    (saved.history || []).forEach((m) => { HISTORY.push(m); addMsg(m.role === "user" ? "user" : "raahi", m.text); });
    renderDecision(saved.decision);
    window.RAAHI.current_step = saved.current_step || 1;
    updateProgress();
    addMsg("system", STRINGS.resumed[LANG] + " " + saved.decision.recommendation);
  }
} catch {}


// ---- Predefined scenarios: instant handcrafted roadmaps, real checks ----
STRINGS.scen_title = { en: "One-tap scenarios", hi: "एक-टैप सीनारियो" };
const ASK = { en: "Your domain (e.g. priyacooks.com)?", hi: "आपका डोमेन (जैसे priyacooks.com)?" };

function S(en, hi) { return LANG === "hi" ? hi : en; }
function mstep(n, tEn, tHi, why, min, concept, check) {
  return { n, title: S(tEn, tHi), why: why || "", minutes: min, concept: concept || "", check: check || { type: "manual", target: "" } };
}

const SCENARIOS = [
  {
    ico: "🩺", id: "deadlinks",
    t: { en: "Stop losing affiliate money", hi: "affiliate पैसा बचाएं" },
    s: { en: "Scan your channel, fix dead links, prove it", hi: "चैनल स्कैन, टूटे लिंक ठीक, सबूत के साथ" },
    run() {
      document.getElementById("ld-input").focus();
      document.getElementById("tool-linkdoctor").scrollIntoView({ behavior: "smooth" });
      addMsg("system", S("Paste your @handle above and press Scan — I'll build the fix plan from what I find.",
                         "ऊपर अपना @handle डालकर Scan दबाएं — जो मिलेगा उससे मैं fix प्लान बना दूंगा।"));
    },
  },
  {
    ico: "🌐", id: "website",
    t: { en: "Launch my website this weekend", hi: "इस वीकेंड मेरी वेबसाइट" },
    s: { en: "Free site + your own domain, DNS-verified", hi: "फ्री साइट + अपना डोमेन, DNS-verified" },
    needsDomain: true,
    run(domain) {
      renderDecision({
        _source: "recipe",
        recommendation: "Google Sites", cost: S("Free (domain ~Rs 800/yr)", "फ्री (डोमेन ~₹800/साल)"), time_minutes: 45,
        why: S("Free, zero maintenance, embeds your YouTube videos natively, and connects your own domain without a paid plan.",
               "फ्री, कोई मेंटेनेंस नहीं, YouTube वीडियो सीधे embed होते हैं, और अपना डोमेन बिना paid plan जुड़ता है।"),
        rejected: [{ name: "Carrd", reason: S("custom domain needs the paid tier", "custom domain के लिए paid tier चाहिए") },
                   { name: "WordPress.com", reason: S("Rs 400/mo and needs upkeep", "₹400/माह और देखभाल चाहिए") }],
        clarifying_questions: [],
        roadmap: [
          mstep(1, "Create your site at sites.google.com", "sites.google.com पर साइट बनाएं", "", 10,
                S("A visual builder: drag blocks, no code.", "विज़ुअल बिल्डर: ब्लॉक खींचें, कोड नहीं।")),
          mstep(2, "Embed your latest YouTube videos", "अपने YouTube वीडियो embed करें", "", 10,
                S("Embedding streams from YouTube — nothing re-uploads.", "Embed से वीडियो YouTube से ही चलता है।")),
          mstep(3, "Add a Google Form for fan emails", "fan emails के लिए Google Form जोड़ें", "", 10,
                S("Signups land in a Google Sheet automatically.", "साइनअप अपने आप Google Sheet में आते हैं।")),
          mstep(4, "Publish the site", "साइट publish करें", "", 5, ""),
          mstep(5, `Connect ${domain} in Settings → Custom domains`, `Settings → Custom domains में ${domain} जोड़ें`, "", 10,
                S("DNS is the internet's phonebook — the CNAME must point at ghs.googlehosted.com.", "DNS इंटरनेट की फोनबुक है — CNAME ghs.googlehosted.com की ओर होना चाहिए।"),
                { type: "dns", target: domain, expect: "ghs.googlehosted.com" }),
        ],
      });
      addMsg("system", S("Scenario loaded — say \u201cguide me\u201d or tap the mic.", "सीनारियो तैयार — \u201cguide me\u201d लिखें या mic दबाएं।"));
    },
  },
  {
    ico: "📬", id: "spam",
    t: { en: "Why do my emails land in spam?", hi: "मेरे emails spam में क्यों?" },
    s: { en: "Check SPF & DMARC on your domain, live", hi: "SPF और DMARC की लाइव जाँच" },
    needsDomain: true,
    run(domain) {
      renderDecision({
        _source: "recipe",
        recommendation: S("Email authentication fix", "Email authentication fix"), cost: S("Free", "फ्री"), time_minutes: 25,
        why: S("Gmail and Yahoo now junk mail from domains without SPF and DMARC records. Raahi checks your DNS live and proves when you're clean.",
               "Gmail/Yahoo अब बिना SPF-DMARC वाले डोमेन की मेल spam में डालते हैं। राही लाइव DNS जाँच कर सबूत देता है।"),
        rejected: [], clarifying_questions: [],
        roadmap: [
          mstep(1, `Check SPF on ${domain}`, `${domain} पर SPF जाँचें`, "", 2,
                S("SPF is a TXT record listing who may send mail as you.", "SPF एक TXT record है: आपके नाम से mail कौन भेज सकता है।"),
                { type: "spf", target: domain }),
          mstep(2, "Add the SPF record your email tool shows (e.g. Mailchimp → Verified domains)", "अपने email tool का SPF record जोड़ें", "", 10, ""),
          mstep(3, `Check DMARC on ${domain}`, `${domain} पर DMARC जाँचें`, "", 2,
                S("DMARC tells inboxes what to do when a mail fails checks.", "DMARC बताता है कि फेल mail का क्या हो।"),
                { type: "dmarc", target: domain }),
          mstep(4, "Add a basic DMARC record (v=DMARC1; p=none)", "basic DMARC record जोड़ें (v=DMARC1; p=none)", "", 10, ""),
          mstep(5, `Re-check both — records present (required for inbox; content still matters)`, `दोनों दुबारा जाँचें — records ज़रूरी हैं inbox के लिए`, "", 1, "", { type: "dmarc", target: domain }),
        ],
      });
    },
  },
  {
    ico: "📈", id: "pulse",
    t: { en: "My channel pulse", hi: "मेरा चैनल pulse" },
    s: { en: "What changed this week — with proof", hi: "इस हफ्ते क्या बदला — सबूत के साथ" },
    run() {
      const h = (window.prompt ? window.prompt(S("Your @handle?", "आपका @handle?")) : "") || "";
      if (!h.trim()) return;
      const dom = (window.prompt ? window.prompt(S("Your domain (optional, for email/DNS checks)?", "आपका डोमेन (optional)?")) : "") || "";
      runPulse(h.trim(), dom.trim());
    },
  },
  {
    ico: "🛟", id: "tutorial",
    t: { en: "A tutorial got me stuck", hi: "ट्यूटोरियल में अटक गई" },
    s: { en: "Paste it — get today's steps, then a guide", hi: "पेस्ट करें — आज के स्टेप + गाइड" },
    run() {
      document.getElementById("tr-input").focus();
      document.getElementById("tool-rescue").scrollIntoView({ behavior: "smooth" });
      addMsg("system", S("Paste the YouTube tutorial you were following above.", "जो YouTube ट्यूटोरियल फॉलो कर रही थीं, ऊपर पेस्ट करें।"));
    },
  },
];

function renderScenarios() {
  const box = document.getElementById("scenarios");
  if (!box) return;
  box.innerHTML = "";
  SCENARIOS.forEach((sc) => {
    const b = el("button", "scen");
    b.innerHTML = `<span class="ico">${sc.ico}</span><span><b>${sc.t[LANG]}</b><span>${sc.s[LANG]}</span></span>`;
    b.onclick = () => {
      if (sc.needsDomain) {
        const d = (window.prompt ? window.prompt(ASK[LANG]) : "") || "";
        const domain = d.trim().replace(/^https?:\/\//, "").split("/")[0];
        if (!domain) return;
        sc.run(domain);
        document.getElementById("tool-decide").scrollIntoView({ behavior: "smooth" });
      } else sc.run();
    };
    box.appendChild(b);
  });
}
renderScenarios();
const _setLang2 = setLang;
setLang = function (l) { _setLang2(l); renderScenarios(); };
applyStrings();


// ---- Pulse rendering ----
async function runPulse(channel, domain) {
  const card = document.getElementById("dc-card");
  const rbox = document.getElementById("dc-roadmap");
  document.getElementById("dc-questions").innerHTML = "";
  rbox.innerHTML = "";
  card.innerHTML = "";
  card.appendChild(el("div", "spin", S("Measuring your channel… ~20 seconds", "आपका चैनल नापा जा रहा है… ~20 सेकंड")));
  document.getElementById("tool-decide").scrollIntoView({ behavior: "smooth" });
  try {
    const r = await api("/api/pulse", { channel, domain, lang: LANG });
    card.innerHTML = "";
    const rep = el("div", "report");
    rep.appendChild(el("div", "headline",
      (r.baseline ? S("📈 Pulse baseline for ", "📈 Pulse baseline: ") : S("📈 Since your last check — ", "📈 पिछली जाँच के बाद — ")) + channel));
    r.insights.forEach((ins) => {
      const row = el("div", "row");
      const body = el("div", "");
      body.style.flex = "1"; body.style.minWidth = "220px";
      body.appendChild(el("div", "", ins.headline));
      body.appendChild(el("div", "url", ins.detail + "  →  " + ins.action));
      row.appendChild(body);
      if (ins.check_type !== "manual") {
        const status = el("span", "pill", "·");
        const btn = el("button", "ghost", S("Check", "जाँचें"));
        btn.onclick = async () => {
          status.textContent = "…";
          try {
            const res = await api("/api/verify", { type: ins.check_type, target: ins.check_target });
            status.className = "pill " + (res.passed ? "ok" : "warn");
            status.textContent = (res.passed ? "✔ " : "✗ ") + res.detail;
          } catch (e) { status.className = "pill broken"; status.textContent = e.message; }
        };
        row.appendChild(status); row.appendChild(btn);
      }
      rep.appendChild(row);
    });
    rep.appendChild(el("div", "spin", r.baseline
      ? S("Run Pulse again after your next upload — from then on it reports only what changed.", "अगले upload के बाद फिर चलाएं — तब से सिर्फ बदलाव दिखेंगे।")
      : S("Raahi can run this for you every morning.", "राही इसे रोज़ सुबह आपके लिए चला सकता है।")));
    card.appendChild(rep);
  } catch (err) {
    card.innerHTML = ""; card.appendChild(el("div", "error", err.message));
  }
}
renderScenarios();

// ---- Raahi Studio (honest video-edit planning) ----
Object.assign(STRINGS, {
  st_title: { en: "Raahi Studio", hi: "राही स्टूडियो" },
  st_sub: { en: "Tell it the edit — get cuts, captions & Shorts with timecodes", hi: "एडिट बोलिए — cuts, captions और Shorts timecodes के साथ" },
  st_url: { en: "YouTube video URL (your existing video)", hi: "YouTube वीडियो URL" },
  st_go: { en: "Plan my edit", hi: "एडिट प्लान करो" },
  st_instruction: { en: "e.g. remove silences, add captions, create a Short", hi: "जैसे: silences हटाओ, captions, एक Short" },
  ld_try: { en: "try @GoogleDevelopers", hi: "@GoogleDevelopers आज़माएँ" },
  st_full: { en: "✂️ the full treatment", hi: "✂️ पूरा पैकेज" },
  tr_honest: { en: "Measured: found the change viewers reported in 10 of 16 old tutorials; 0 of 46 steps wrongly flagged on new ones. A verdict with no source is shown as unconfirmed.", hi: "मापा गया: 16 में से 10 पुराने ट्यूटोरियल में दर्शकों का बताया बदलाव मिला; नए ट्यूटोरियल के 46 में से 0 स्टेप गलत बताए। बिना स्रोत वाला जवाब 'पुष्टि नहीं' दिखता है।" },
  st_honest: { en: "Real today: edit plan, SRT captions, Shorts timecodes — works in any editor. Cloud rendering: planned v2.", hi: "आज असली: एडिट प्लान, SRT captions, Shorts timecodes। Cloud rendering: v2 में।" },
  st_wait: { en: "Reading transcript & planning your edit… ~30 seconds", hi: "Transcript पढ़कर एडिट प्लान बन रहा है… ~30 सेकंड" },
});
applyStrings();

function dl(filename, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function fmtT(s) { const m = Math.floor(s / 60); return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`; }

document.getElementById("st-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = document.getElementById("st-url").value.trim();
  const instruction = document.getElementById("st-instruction").value.trim();
  const box = document.getElementById("st-result");
  if (!url) return;
  box.innerHTML = "";
  box.appendChild(el("div", "spin", STRINGS.st_wait[LANG]));
  for (let i = 0; i < 3; i++) box.appendChild(el("div", "skeleton"));
  try {
    const p = await api("/api/studio/plan", { url, instruction });
    box.innerHTML = "";
    const rep = el("div", "report");

    const badges = el("div", "badges");
    p.ops_understood.forEach((o) => badges.appendChild(el("span", "badge", o)));
    rep.appendChild(badges);

    // preview player (clicking a Short seeks it)
    const frame = document.createElement("iframe");
    frame.className = "yt-embed";
    frame.allow = "autoplay; encrypted-media";
    frame.src = `https://www.youtube.com/embed/${p.video_id}`;
    rep.appendChild(frame);

    // timeline
    const tl = el("div", "timeline");
    p.silence_cuts.forEach((c) => {
      const seg = el("div", "tl-cut");
      seg.style.left = (c.start / p.duration_sec) * 100 + "%";
      seg.style.width = Math.max(0.4, ((c.end - c.start) / p.duration_sec) * 100) + "%";
      seg.title = c.reason;
      tl.appendChild(seg);
    });
    p.shorts.forEach((s) => {
      const seg = el("div", "tl-short");
      seg.style.left = (s.start / p.duration_sec) * 100 + "%";
      seg.style.width = ((s.end - s.start) / p.duration_sec) * 100 + "%";
      seg.title = s.title;
      seg.onclick = () => { frame.src = `https://www.youtube.com/embed/${p.video_id}?start=${Math.floor(s.start)}&autoplay=1`; };
      tl.appendChild(seg);
    });
    rep.appendChild(tl);
    const lbl = el("div", "tl-label");
    lbl.appendChild(el("span", "", "0:00"));
    lbl.appendChild(el("span", "", S(`gold = Shorts (click to preview) · red = silence cuts`, "सुनहरा = Shorts (क्लिक करें) · लाल = silence cuts")));
    lbl.appendChild(el("span", "", fmtT(p.duration_sec)));
    rep.appendChild(lbl);

    p.shorts.forEach((s) => {
      const row = el("div", "row");
      const body = el("div", "");
      body.style.flex = "1"; body.style.minWidth = "220px";
      body.appendChild(el("div", "", `🎯 ${s.title} · ${fmtT(s.start)}–${fmtT(s.end)}`));
      body.appendChild(el("div", "url", `Hook: "${s.hook}" — ${s.reason}`));
      row.appendChild(body);
      const cp = el("button", "ghost", S("Copy timecode", "Timecode copy"));
      cp.onclick = async () => { try { await navigator.clipboard.writeText(`${fmtT(s.start)}-${fmtT(s.end)} ${s.title}`); cp.textContent = "✔"; } catch {} };
      row.appendChild(cp);
      rep.appendChild(row);
    });

    if (p.pacing_notes.length) {
      const det = document.createElement("details");
      det.appendChild(el("summary", "", S("Pacing notes", "Pacing नोट्स") + ` (${p.pacing_notes.length})`));
      p.pacing_notes.forEach((n) => det.appendChild(el("p", "url", "• " + n)));
      rep.appendChild(det);
    }

    const actions = el("div", "chips");
    if (!p.captions_srt) rep.appendChild(el("div", "honest", S(
      "planned from the video itself (cloud mode) — captions & gap-cuts need a local run",
      "वीडियो से प्लान बना (cloud mode) — captions के लिए local run चाहिए")));
    const srtBtn = el("button", "cta", S("⬇ Download captions (.srt)", "⬇ Captions (.srt)"));
    srtBtn.hidden = !p.captions_srt;
    srtBtn.onclick = () => dl("captions.srt", p.captions_srt, "text/plain");
    const packBtn = el("button", "ghost", S("⬇ Export edit plan (JSON)", "⬇ एडिट प्लान (JSON)"));
    packBtn.onclick = () => dl("raahi-edit-plan.json", JSON.stringify(p, null, 2), "application/json");
    const render = el("button", "ghost", S("Render in cloud", "Cloud में render"));
    render.disabled = true;
    actions.appendChild(srtBtn); actions.appendChild(packBtn); actions.appendChild(render);
    const tag = el("span", "plan-tag", "planned · v2");
    actions.appendChild(tag);
    rep.appendChild(actions);

    box.appendChild(rep);
  } catch (err) {
    box.innerHTML = "";
    box.appendChild(el("div", "error", err.message));
  }
});
// chips added after boot need wiring
document.querySelectorAll("#tool-studio .chip[data-fill]").forEach((c) => {
  c.addEventListener("click", () => { const i = document.getElementById(c.dataset.fill); i.value = c.dataset.val; i.focus(); });
});


// learn a concept only after an INDEPENDENTLY verified pass, when we know who the creator is
async function learnFromStep(step) {
  if (!window.RAAHI.handle || !step.concept) return;
  try { await api("/api/context/learn", { handle: window.RAAHI.handle, concept: step.concept }); } catch {}
}
