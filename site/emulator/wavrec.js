// Record the FM-1's actual audio output to a .wav.
//
// The recorder module captures MIDI; this captures sound. It taps
// FM1.outNode() — the output node main.js already exposes "to tap for
// recording" — through an AudioWorklet, so capture happens on the audio thread
// and a long take does not depend on main-thread timing. 16-bit PCM, at the
// context's own sample rate, no resampling and no lossy codec.
(function () {
  "use strict";
  const FM = () => window.FM1;
  const MAX_SECONDS = 20 * 60;          // a sane ceiling; ~200 MB of float data

  let tap = null, sink = null, armed = false, chunks = [], frames = 0, rate = 44100, channels = 2;
  let startedAt = 0;

  // ---- WAV encoding (pure; unit-tested from app/test-wav.mjs) ----
  function encodeWav(chunkList, sampleRate, numChannels) {
    let total = 0;
    for (const c of chunkList) total += c[0] ? c[0].length : 0;
    const bytes = 44 + total * numChannels * 2;
    const buf = new ArrayBuffer(bytes);
    const view = new DataView(buf);
    const ascii = (at, s) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
    ascii(0, "RIFF");
    view.setUint32(4, bytes - 8, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true);            // PCM fmt chunk size
    view.setUint16(20, 1, true);             // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);  // byte rate
    view.setUint16(32, numChannels * 2, true);               // block align
    view.setUint16(34, 16, true);            // bits
    ascii(36, "data");
    view.setUint32(40, total * numChannels * 2, true);
    let at = 44;
    for (const c of chunkList) {
      const len = c[0] ? c[0].length : 0;
      for (let i = 0; i < len; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
          const src = c[Math.min(ch, c.length - 1)];
          let v = src ? src[i] : 0;
          v = v > 1 ? 1 : v < -1 ? -1 : v;   // clamp, or loud takes wrap
          view.setInt16(at, Math.round(v * 32767), true);
          at += 2;
        }
      }
    }
    return new Blob([buf], { type: "audio/wav" });
  }

  async function ensureTap() {
    const fm = FM();
    const ac = fm && fm.context && fm.context();
    const out = fm && fm.outNode && fm.outNode();
    if (!ac || !out) return false;
    if (tap) return true;
    try {
      await ac.audioWorklet.addModule("wavtap.js?v=1");
      tap = new AudioWorkletNode(ac, "fm1-wav-tap", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
      // Silent sink: the tap must be pulled by the graph to run, but it must
      // not add a second copy of the sound to the speakers.
      sink = ac.createGain();
      sink.gain.value = 0;
      out.connect(tap);
      tap.connect(sink);
      sink.connect(ac.destination);
      rate = ac.sampleRate;
      tap.port.onmessage = (e) => {
        if (!armed || !e.data || e.data.type !== "chunk") return;
        const chs = e.data.channels;
        chunks.push(chs);
        frames += chs[0] ? chs[0].length : 0;
        channels = Math.max(1, Math.min(2, chs.length));
        if (frames / rate >= MAX_SECONDS) stop();
      };
      return true;
    } catch (e) {
      console.warn("wavrec: could not attach tap", e);
      tap = null;
      return false;
    }
  }

  async function start() {
    const fm = FM();
    if (!fm || !fm.running || !fm.running()) return false;
    if (!(await ensureTap())) return false;
    chunks = []; frames = 0; armed = true; startedAt = Date.now();
    tap.port.postMessage({ type: "arm", on: true });
    return true;
  }
  function stop() {
    if (!armed) return null;
    armed = false;
    if (tap) tap.port.postMessage({ type: "arm", on: false });
    return chunks.length ? encodeWav(chunks, rate, channels) : null;
  }
  const seconds = () => frames / rate;

  // ---- in-session recordings tray ----
  // Captures stay in memory as object URLs so you can listen back and compare
  // before deciding what to download. Bounded, and cleared on reload (blobs are
  // too big for localStorage); the newest is evicted last.
  const RECS_MAX = 12;
  const recordings = [];
  function addRecording(blob) {
    const fm = FM();
    const rf = (fm && fm.runningFirmware && fm.runningFirmware()) || {};
    const stamp = new Date();
    const rec = {
      id: "r" + stamp.getTime().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
      name: ((rf.name || "fm1") + "-" + stamp.toISOString().slice(0, 19).replace(/[:T]/g, "-"))
        .replace(/[^A-Za-z0-9._-]/g, "_") + ".wav",
      firmware: rf.name || "",
      at: stamp.getTime(),
      seconds: seconds(),
      bytes: blob.size,
      blob,
      url: URL.createObjectURL(blob),
    };
    recordings.unshift(rec);
    while (recordings.length > RECS_MAX) {
      const gone = recordings.pop();
      try { URL.revokeObjectURL(gone.url); } catch {}
    }
    return rec;
  }
  function deleteRecording(id) {
    const i = recordings.findIndex((r) => r.id === id);
    if (i < 0) return false;
    try { URL.revokeObjectURL(recordings[i].url); } catch {}
    recordings.splice(i, 1);
    return true;
  }

  /** Re-encode a WAV blob to audio/webm via MediaRecorder when the browser supports it (share-friendly). */
  async function toWebm(wavBlob) {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported?.("audio/webm;codecs=opus")) {
      return null;
    }
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    try {
      const buf = await ac.decodeAudioData(await wavBlob.arrayBuffer());
      const dest = ac.createMediaStreamDestination();
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.connect(dest);
      const rec = new MediaRecorder(dest.stream, { mimeType: "audio/webm;codecs=opus" });
      const chunks = [];
      const done = new Promise((resolve) => {
        rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        rec.onstop = () => resolve(new Blob(chunks, { type: "audio/webm" }));
      });
      rec.start();
      src.start();
      await new Promise((r) => { src.onended = r; });
      rec.stop();
      const webm = await done;
      await ac.close().catch(() => {});
      return webm;
    } catch {
      try { await ac.close(); } catch {}
      return null;
    }
  }

  window.FM1Audio = {
    start, stop, recording: () => armed, seconds, frames: () => frames, encodeWav, toWebm, _rate: () => rate,
    recordings: () => recordings, addRecording, deleteRecording,
  };

  // ---- UI ----
  function ready(fn) {
    const t = setInterval(() => {
      const nav = document.querySelector(".sitenav") || document.querySelector("header.site .wrap");
      if (nav && window.FM1) { clearInterval(t); fn(nav); }
    }, 120);
    setTimeout(() => clearInterval(t), 9000);
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const fmtSize = (b) => (b >= 1 << 20 ? (b / (1 << 20)).toFixed(1) + " MB" : Math.round(b / 1024) + " KB");

  ready((nav) => {
    const css = document.createElement("style");
    css.textContent = `
      #wav-btn.rec{color:#ff6b6b}
      #wav-btn .dot{display:inline-block;width:7px;height:7px;border-radius:50%;
        background:#3a3d44;margin-right:5px;vertical-align:middle}
      #wav-btn.rec .dot{background:#ff4d4d;box-shadow:0 0 7px #ff4d4daa;animation:wavpulse 1s infinite}
      @keyframes wavpulse{0%,100%{opacity:1}50%{opacity:.35}}
      #wav-pop{position:fixed;z-index:9997;width:300px;max-width:92vw;background:#0c0d0f;border:1px solid #232428;
        border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.6);padding:12px;display:none;flex-direction:column;gap:9px;
        color:#e9edf2;font:13px 'Space Grotesk',-apple-system,Segoe UI,Roboto,sans-serif}
      #wav-pop.open{display:flex}
      #wav-pop .wtop{display:flex;align-items:center;gap:8px}
      #wav-pop .wtop button{font-size:12px;padding:6px 11px}
      #wav-pop .wtop .hint{font-size:10.5px;color:#8c93a0;margin-left:auto}
      #wav-pop .recs{display:flex;flex-direction:column;gap:6px;max-height:48vh;overflow:auto}
      #wav-pop .empty{color:#8c93a0;font-size:12px;text-align:center;padding:14px 0}
      #wav-pop .rec{display:flex;flex-direction:column;gap:4px;border:1px solid #1d1f23;border-radius:9px;padding:7px 8px}
      #wav-pop .rec .r1{display:flex;align-items:center;gap:6px}
      #wav-pop .rec .r1 b{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
      #wav-pop .rec .meta{font:600 9.5px 'Space Mono',monospace;color:#8c93a0}
      #wav-pop .rec audio{width:100%;height:30px}
      #wav-pop .rec .dl,#wav-pop .rec .del{font-size:10px;padding:3px 7px;flex:0 0 auto}
      #wav-pop .rec .del{color:#9aa1ab}
      #wav-pop .rec .del:hover{border-color:#e23b3b;color:#e23b3b}`;
    document.head.appendChild(css);

    const btn = document.createElement("a");
    btn.href = "#"; btn.id = "wav-btn"; btn.className = "sitelink";
    let timer = null;
    function paint(label) {
      btn.innerHTML = `<span class="dot"></span>${label || "Audio"}`;
      btn.classList.toggle("rec", armed);
    }
    paint();
    btn.title = "Record the FM-1's output to .wav";

    const pop = document.createElement("div");
    pop.id = "wav-pop";
    document.body.appendChild(pop);
    let open = false;
    function place() {
      const r = (window.FM1PopAnchor && window.FM1PopAnchor(btn)) || btn.getBoundingClientRect();
      pop.style.top = Math.round(r.bottom + 8) + "px";
      pop.style.left = Math.round(Math.min(r.left, window.innerWidth - 312)) + "px";
    }
    function download(rec) {
      const a = document.createElement("a");
      a.href = rec.url; a.download = rec.name; document.body.appendChild(a); a.click(); a.remove();
    }
    function renderPop() {
      const recs = recordings;
      const armNote = armed ? `<span class="hint">● recording ${fmtDur(seconds())}</span>` : "";
      let html = `<div class="wtop"><button id="wav-go">${armed ? "■ Stop" : "● Record"}</button>${armNote}</div>`;
      html += `<div class="recs">`;
      if (!recs.length) html += `<div class="empty">No recordings yet. Press Record while a firmware is running.</div>`;
      for (const rec of recs) {
        html += `<div class="rec" data-id="${rec.id}">` +
          `<div class="r1"><b title="${esc(rec.firmware)}">${esc(rec.name)}</b>` +
          `<button type="button" class="dl" title="Download WAV">WAV</button>` +
          `<button type="button" class="dlwebm" title="Share as WebM/Opus">WebM</button>` +
          `<button type="button" class="del" title="Delete">✕</button></div>` +
          `<span class="meta">${fmtDur(rec.seconds)} · ${fmtSize(rec.bytes)}</span>` +
          `<audio controls preload="none" src="${rec.url}"></audio></div>`;
      }
      html += `</div>`;
      pop.innerHTML = html;
      pop.querySelector("#wav-go").onclick = toggleRecord;
      pop.querySelectorAll(".rec").forEach((el) => {
        const rec = recordings.find((r) => r.id === el.dataset.id);
        el.querySelector(".dl").onclick = () => download(rec);
        el.querySelector(".dlwebm").onclick = async () => {
          const webm = await toWebm(rec.blob);
          if (!webm) { el.querySelector(".meta").textContent = "WebM not supported in this browser — use WAV."; return; }
          const a = document.createElement("a");
          a.href = URL.createObjectURL(webm);
          a.download = rec.name.replace(/\.wav$/i, ".webm");
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        };
        el.querySelector(".del").onclick = () => { deleteRecording(el.dataset.id); renderPop(); };
      });
    }
    function openPop() { open = true; pop.classList.add("open"); place(); renderPop(); }
    function closePop() { open = false; pop.classList.remove("open"); }

    async function toggleRecord() {
      if (armed) {
        const blob = stop();
        clearInterval(timer); timer = null;
        paint();
        if (blob) addRecording(blob);
        if (open) renderPop();
        return;
      }
      if (!(await start())) {
        paint("Press Start");
        setTimeout(paint, 1800);
        if (open) renderPop();
        return;
      }
      paint("0:00");
      timer = setInterval(() => {
        paint(fmtDur(seconds()));
        if (open) { const go = pop.querySelector("#wav-go"); const h = pop.querySelector(".hint"); if (h) h.textContent = "● recording " + fmtDur(seconds()); }
      }, 500);
      if (open) renderPop();
    }

    btn.onclick = (e) => { e.preventDefault(); open ? closePop() : openPop(); };
    document.addEventListener("click", (e) => { if (open && !pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closePop(); });
    window.addEventListener("resize", () => { if (open) place(); });
    nav.insertBefore(btn, nav.firstChild ? nav.firstChild.nextSibling : null);
  });
})();
