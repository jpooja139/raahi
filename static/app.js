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
};

let LANG = "en";

function applyStrings() {
  document.querySelectorAll("[data-str]").forEach((el) => {
    el.textContent = STRINGS[el.dataset.str][LANG];
  });
  document.querySelectorAll("[data-strph]").forEach((el) => {
    el.placeholder = STRINGS[el.dataset.strph][LANG];
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
  box.appendChild(el("div", "spin", STRINGS.thinking[LANG]));
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
  const c = el("div", "report");
  c.appendChild(el("div", "headline", `→ ${d.recommendation} · ${d.cost} · ~${d.time_minutes} min`));
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
  card.innerHTML = ""; card.appendChild(el("div", "spin", STRINGS.thinking[LANG]));
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

async function runCheck(step, statusEl) {
  if (step.check.type === "manual") {
    statusEl.className = "pill ok"; statusEl.textContent = LANG === "hi" ? "हो गया ✔" : "done ✔";
    window.RAAHI.current_step = Math.min(step.n + 1, (window.RAAHI.decision?.roadmap.length || step.n));
    return;
  }
  statusEl.className = "pill"; statusEl.textContent = "…";
  try {
    const r = await api("/api/verify", { type: step.check.type, target: step.check.target });
    statusEl.className = "pill " + (r.passed ? "ok" : "warn");
    statusEl.textContent = (r.passed ? "✔ " : "✗ ") + r.detail;
    if (r.passed) window.RAAHI.current_step = Math.min(step.n + 1, window.RAAHI.decision.roadmap.length);
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
    if (r.run_check && window.RAAHI.decision) {
      const step = window.RAAHI.decision.roadmap.find((s) => s.n === window.RAAHI.current_step);
      if (step && step.check.type !== "manual") {
        const res = await api("/api/verify", step.check);
        const line = (res.passed ? "✔ " : "✗ ") + res.detail;
        addMsg("raahi", line);
        HISTORY.push({ role: "raahi", text: line });
        const pill = document.getElementById("step-status-" + step.n);
        if (pill) { pill.className = "pill " + (res.passed ? "ok" : "warn"); pill.textContent = res.passed ? "✔" : "✗"; }
        if (res.passed) window.RAAHI.current_step = Math.min(step.n + 1, window.RAAHI.decision.roadmap.length);
      }
    }
  } catch (err) {
    thinking.remove();
    addMsg("system", "⚠ " + err.message);
  }
});
