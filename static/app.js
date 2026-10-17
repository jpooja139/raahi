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
          mstep(4, "Publish the site", "साइट publish करें", "", 5, "", { type: "page", target: "" }),
          mstep(5, `Connect ${domain} in Settings → Custom domains`, `Settings → Custom domains में ${domain} जोड़ें`, "", 10,
                S("DNS is the internet's phonebook — a CNAME points your name at Google.", "DNS इंटरनेट की फोनबुक है — CNAME आपका नाम Google की ओर करता है।"),
                { type: "dns", target: domain }),
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
          mstep(5, `Re-check both — green means inbox, not spam`, `दोनों दुबारा जाँचें — green मतलब inbox`, "", 1, "", { type: "dmarc", target: domain }),
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
