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
