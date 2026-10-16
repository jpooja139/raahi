/* Raahi voice — mic capture (16 kHz PCM16 → WS) and playback (24 kHz). */
"use strict";

const RaahiVoice = (() => {
  let ws = null, micCtx = null, playCtx = null, workletNode = null, stream = null;
  let playQueue = [], playing = false, active = false, wantReconnect = false;

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

  function clearPlayback() { playQueue = []; } // current chunk finishes (~small), queue drops

  let onText = () => {}, onTool = () => {}, onStatus = () => {}, onSpeaking = () => {};

  async function start(lang, getState) {
    active = true; wantReconnect = true;
    onStatus("connecting");
    ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/live?lang=${lang}`);
    ws.onopen = async () => {
      ws.send(JSON.stringify({ type: "state", ...getState() }));
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      micCtx = new AudioContext();
      await micCtx.audioWorklet.addModule(URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "application/javascript" })));
      const srcNode = micCtx.createMediaStreamSource(stream);
      workletNode = new AudioWorkletNode(micCtx, "cap");
      workletNode.port.onmessage = (e) => {
        if (ws && ws.readyState === 1)
          ws.send(JSON.stringify({ type: "audio", data: b64FromInt16(downsampleTo16k(e.data, micCtx.sampleRate)) }));
      };
      srcNode.connect(workletNode);
      onStatus("live");
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === "audio") schedulePlayback(int16FromB64(m.data));
      else if (m.type === "text") onText(m.text);
      else if (m.type === "toolcall") onTool(m.name);
      else if (m.type === "interrupted") clearPlayback();
      else if (m.type === "error") { onStatus("error:" + m.detail); stop(false); }
      else if (m.type === "reconnect" && active && wantReconnect) {
        onStatus("reconnecting");
        teardownMic();
        setTimeout(() => active && start(lang, getState), 800);
      }
    };
    ws.onclose = () => { if (active && wantReconnect) { onStatus("reconnecting"); teardownMic(); setTimeout(() => active && start(lang, getState), 1200); } };
  }

  function teardownMic() {
    if (workletNode) workletNode.disconnect();
    if (micCtx) micCtx.close();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    workletNode = micCtx = stream = null;
  }

  function stop(graceful = true) {
    active = false; wantReconnect = false;
    teardownMic();
    if (ws && ws.readyState === 1) ws.close();
    ws = null; clearPlayback();
    onStatus("off");
  }

  function sendState(getState) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "state", ...getState() }));
  }

  return {
    start, stop, sendState,
    isActive: () => active,
    hooks(h) { onText = h.onText || onText; onTool = h.onTool || onTool; onStatus = h.onStatus || onStatus; onSpeaking = h.onSpeaking || onSpeaking; },
  };
})();
