/* Raahi frontend — vanilla JS, no build step. */
"use strict";

// ---- strings (bilingual-ready; hi values refined later) ----
const STRINGS = {
  tagline: {
    en: "Your AI engineer — decides, guides by voice, checks it works",
    hi: "आपका AI इंजीनियर — फ़ैसला, आवाज़ से गाइड, और जाँच भी",
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
    const r = await api("/api/linkdoctor", { channel: q });
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
        renderDecision({
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
  c.appendChild(el("div", "headline", headline));
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
    const why = el("div", "url", s.why + "  💡 " + s.concept);
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
    const d = await api("/api/decide", { goal, answers });
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
  window.RAAHI.current_step = Math.min(n + 1, (window.RAAHI.decision?.roadmap.length || n));
  if (typeof RaahiVoice !== "undefined") RaahiVoice.sendState(voiceState);
  updateProgress(); saveState();
}

function updateProgress() {
  const p = document.getElementById("progress");
  const d = window.RAAHI.decision;
  if (!p) return;
  if (!d || !d.roadmap.length) { p.hidden = true; return; }
  const cur = window.RAAHI.current_step;
  const left = d.roadmap.filter((s) => s.n >= cur).reduce((a, s) => a + s.minutes, 0);
  p.hidden = false;
  p.textContent = (LANG === "hi")
    ? `स्टेप ${Math.min(cur, d.roadmap.length)} / ${d.roadmap.length} · ~${left} मिनट बाकी`
    : `Step ${Math.min(cur, d.roadmap.length)} of ${d.roadmap.length} · ~${left} min left`;
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
    statusEl.className = "pill ok"; statusEl.textContent = LANG === "hi" ? "हो गया ✔" : "done ✔";
    advanceStep(step.n);
    return;
  }
  statusEl.className = "pill"; statusEl.textContent = "…";
  try {
    const r = await api("/api/verify", { type: step.check.type, target: step.check.target });
    statusEl.className = "pill " + (r.passed ? "ok" : "warn");
    statusEl.textContent = (r.passed ? "✔ " : "✗ ") + r.detail;
    if (r.passed) advanceStep(step.n);
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
        if (pill) { pill.className = "pill ok"; pill.textContent = LANG === "hi" ? "हो गया ✔" : "done ✔"; }
        advanceStep(step.n);
      } else if (step) {
        const res = await api("/api/verify", step.check);
        const line = (res.passed ? "✔ " : "✗ ") + res.detail;
        addMsg("raahi", line);
        HISTORY.push({ role: "raahi", text: line });
        const pill = document.getElementById("step-status-" + step.n);
        if (pill) { pill.className = "pill " + (res.passed ? "ok" : "warn"); pill.textContent = res.passed ? "✔" : "✗"; }
        if (res.passed) advanceStep(step.n);
      }
    }
  } catch (err) {
    thinking.remove();
    addMsg("system", "⚠ " + err.message);
  }
});

// ---- Tutorial Rescue (Task 6) ----
document.getElementById("tr-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const box = document.getElementById("tr-report");
  const url = document.getElementById("tr-input").value.trim();
  if (!url) return;
  box.innerHTML = "";
  box.appendChild(el("div", "spin", STRINGS.wait_tr[LANG]));
  try {
    const r = await api("/api/rescue", { url });
    box.innerHTML = "";
    const rep = el("div", "report");
    const changed = r.steps.filter((s) => s.status === "changed").length;
    rep.appendChild(el("div", "headline",
      `${r.video_title} (${r.published_hint}) — ${changed} step(s) changed since` +
      (r.source === "transcript" ? " · read from transcript" : "")));
    r.steps.forEach((s) => {
      const row = el("div", "row");
      row.appendChild(el("span", "pill " + (s.status === "current" ? "ok" : s.status === "changed" ? "warn" : "broken"), s.status));
      const body = el("div", "");
      body.style.flex = "1"; body.style.minWidth = "220px";
      body.appendChild(el("div", "", `${s.n}. ${s.instruction}`));
      if (s.note) body.appendChild(el("div", "url", "→ " + s.note));
      row.appendChild(body);
      rep.appendChild(row);
    });
    const btn = el("button", "", LANG === "hi" ? "मुझे इसमें गाइड करो" : "Guide me through this");
    btn.style.marginTop = "10px";
    btn.onclick = () => {
      renderDecision({
        recommendation: "Rescued: " + r.video_title,
        why: LANG === "hi" ? "यह रोडमैप ट्यूटोरियल से बना है — बदले हुए स्टेप अपडेट हो चुके हैं।" : "Roadmap built from the tutorial — changed steps already updated to today's UI.",
        cost: "", time_minutes: r.steps.length * 5, rejected: [], clarifying_questions: [],
        roadmap: r.steps.map((s) => ({
          n: s.n, title: s.status === "changed" && s.note ? s.note : s.instruction,
          why: s.status === "changed" ? (LANG === "hi" ? "पुराना तरीका: " : "Old way: ") + s.instruction : "",
          minutes: 5, concept: "", check: { type: "manual", target: "" },
        })),
      });
      addMsg("system", LANG === "hi" ? "रेस्क्यू रोडमैप तैयार — चैट में पूछते रहें" : "Rescue roadmap ready — ask me in chat as you go");
    };
    rep.appendChild(btn);
    box.appendChild(rep);
  } catch (err) {
    box.innerHTML = "";
    box.appendChild(el("div", "error", err.message));
  }
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
