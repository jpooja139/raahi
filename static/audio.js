/* Raahi voice — mic capture (16 kHz PCM16 → WS) and playback (24 kHz).
   Connection lifecycle: one socket at a time (generation-tagged), reconnect
   only from onclose, capped retries with backoff. */
"use strict";

const RaahiVoice = (() => {
  let ws = null, micCtx = null, playCtx = null, workletNode = null, stream = null;
  let playQueue = [], playing = false, active = false;
  let gen = 0;            // generation token: events from old sockets are ignored
  let retries = 0;
  const MAX_RETRIES = 3;
  let lastDetail = "";

  const CAPTURE_WORKLET = `
    class Cap extends AudioWorkletProcessor {
      process(inputs) {
        const ch = inputs[0][0];
        if (ch) this.port.postMessage(ch.slice(0));
        return true;
      }
    }
    registerProcessor("cap", Cap);
  `;

  function downsampleTo16k(f32, fromRate) {
    const ratio = fromRate / 16000;
    const out = new Int16Array(Math.floor(f32.length / ratio));
    for (let i = 0; i < out.length; i++) {
      const v = Math.max(-1, Math.min(1, f32[Math.floor(i * ratio)]));
      out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    return out;
  }

  function b64FromInt16(i16) {
    const bytes = new Uint8Array(i16.buffer);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function int16FromB64(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  }

  function schedulePlayback(i16) {
    if (!playCtx) playCtx = new AudioContext({ sampleRate: 24000 });
    const f32 = Float32Array.from(i16, (v) => v / 0x8000);
    const buf = playCtx.createBuffer(1, f32.length, 24000);
    buf.copyToChannel(f32, 0);
    playQueue.push(buf);
    if (!playing) pump();
  }

  function pump() {
    const buf = playQueue.shift();
    if (!buf) { playing = false; onSpeaking(false); return; }
    playing = true; onSpeaking(true);
    const src = playCtx.createBufferSource();
    src.buffer = buf;
    src.connect(playCtx.destination);
    src.onended = pump;
    src.start();
  }

  function clearPlayback() { playQueue = []; }

  let onText = () => {}, onTool = () => {}, onStatus = () => {}, onSpeaking = () => {}, onCheck = () => {};

  async function startMic(myGen) {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    if (myGen !== gen || !active) { stream.getTracks().forEach((t) => t.stop()); stream = null; return; }
    micCtx = new AudioContext();
    await micCtx.audioWorklet.addModule(
      URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "application/javascript" }))
    );
    const srcNode = micCtx.createMediaStreamSource(stream);
    workletNode = new AudioWorkletNode(micCtx, "cap");
    let buf = [];
    let buffered = 0;
    workletNode.port.onmessage = (e) => {
      if (myGen !== gen || !ws || ws.readyState !== 1) return;
      buf.push(e.data); buffered += e.data.length;
      if (buffered >= 2048) { // ~46 ms at 44.1k → one WS message, not 375/s
        const joined = new Float32Array(buffered);
        let off = 0;
        for (const c of buf) { joined.set(c, off); off += c.length; }
        buf = []; buffered = 0;
        ws.send(JSON.stringify({ type: "audio", data: b64FromInt16(downsampleTo16k(joined, micCtx.sampleRate)) }));
      }
    };
    srcNode.connect(workletNode);
  }

  function connect(lang, getState) {
    const myGen = ++gen;
    onStatus(retries ? "reconnecting" : "connecting");
    const sock = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/live?lang=${lang}`
    );
    ws = sock;

    sock.onopen = async () => {
      if (myGen !== gen || !active) { sock.close(); return; }
      sock.send(JSON.stringify({ type: "state", ...getState() }));
      try {
        await startMic(myGen);
        retries = 0;
        onStatus("live");
      } catch (err) {
        onStatus("error:" + (LANGUAGE_HINT_MIC(err) || err.message));
        stop();
      }
    };
    sock.onmessage = (e) => {
      if (myGen !== gen) return;
      const m = JSON.parse(e.data);
      if (m.type === "audio") schedulePlayback(int16FromB64(m.data));
      else if (m.type === "text") onText(m.text);
      else if (m.type === "toolcall") onTool(m.name);
      else if (m.type === "check") onCheck(m);
      else if (m.type === "interrupted") clearPlayback();
      else if (m.type === "error") { onStatus("error:" + m.detail); stop(); }
      else if (m.type === "reconnect") { lastDetail = m.detail || ""; }
      // reconnect itself happens in onclose — single path, no double-start
    };
    sock.onclose = () => {
      if (myGen !== gen || !active) return;
      teardownMic();
      if (retries >= MAX_RETRIES) {
        onStatus("error:" + (lastDetail || "voice connection keeps dropping — switch to text chat"));
        stop();
        return;
      }
      retries += 1;
      onStatus("reconnecting");
      setTimeout(() => { if (active && myGen === gen) connect(lang, getState); }, 800 * retries);
    };
  }

  function LANGUAGE_HINT_MIC(err) {
    if (err && (err.name === "NotAllowedError" || err.name === "NotFoundError"))
      return "microphone blocked — allow mic access in the browser and try again";
    return null;
  }

  function start(lang, getState) {
    if (active) return;
    active = true;
    retries = 0;
    lastDetail = "";
    connect(lang, getState);
  }

  function teardownMic() {
    if (workletNode) workletNode.disconnect();
    if (micCtx) micCtx.close();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    workletNode = micCtx = stream = null;
  }

  function stop() {
    active = false;
    gen += 1; // invalidate every in-flight handler
    teardownMic();
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) ws.close();
    ws = null;
    clearPlayback();
    onStatus("off");
  }

  function sendState(getState) {
    if (active && ws && ws.readyState === 1)
      ws.send(JSON.stringify({ type: "state", ...getState() }));
  }

  return {
    start, stop, sendState,
    isActive: () => active,
    hooks(h) {
      onText = h.onText || onText; onTool = h.onTool || onTool;
      onStatus = h.onStatus || onStatus; onSpeaking = h.onSpeaking || onSpeaking;
      onCheck = h.onCheck || onCheck;
    },
  };
})();
