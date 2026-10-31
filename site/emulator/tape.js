// Virtual tape deck for the FM-1 emulator: a cassette you load with a sample, a file or the mic
// and feed into the device's USB audio line-in (UAC1) — and a recorder that captures the FM-1's
// own output to a .wav. Line-in only drives firmwares that actually expose a USB audio input
// (window.FM1.hasAudioIn()); the FM-1's stock USB is MIDI, so most firmwares take notes, not audio.
// Pure DOM + Web Audio; styled like a little deck. Classic script (loads before main.js's module).
(function () {
  "use strict";
  const RATE = 44100;                 // the AudioContext and the firmwares' audio clock
  const FM = () => window.FM1;

  // ---- a small library of test signals, rendered offline at 44.1k when first played ----
  const LIB = {
    "Sine A (440 Hz)":   (t) => Math.sin(2 * Math.PI * 440 * t),
    "Sine low (110 Hz)": (t) => Math.sin(2 * Math.PI * 110 * t),
    "Square (220 Hz)":   (t) => (Math.sin(2 * Math.PI * 220 * t) >= 0 ? 0.7 : -0.7),
    "Sweep 50→5 kHz":    (t, d) => Math.sin(2 * Math.PI * (50 * Math.pow(100, t / d)) * t) * 0.9,
    "White noise":       () => Math.random() * 2 - 1,
    "Pink-ish noise":    (() => { let b = 0; return () => { b = 0.98 * b + 0.02 * (Math.random() * 2 - 1); return b * 4; }; })(),
    "Click track":       (t) => ((t % 0.5) < 0.01 ? Math.sin(2 * Math.PI * 1000 * t) : 0),
  };
  const LIB_LEN = 3.0;                 // seconds per generated clip

  function renderLib(name) {
    const g = LIB[name], n = Math.floor(RATE * LIB_LEN), buf = new Float32Array(n * 2);
    // note: "Pink-ish noise" keeps its one-pole filter state across renders (harmless for a test tone)
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      let v = g(t, LIB_LEN);
      if (!isFinite(v)) v = 0;
      v = Math.max(-1, Math.min(1, v)) * 0.85;
      buf[i * 2] = v; buf[i * 2 + 1] = v;
    }
    return buf;                        // interleaved stereo
  }

  // ---- feeding the line-in: push interleaved stereo in realtime-paced chunks ----
  let feedTimer = null, feedPos = 0, feedBuf = null, micStop = null, recNodes = null, recChunks = null, feedGen = 0;
  let feedSpeed = 1;                     // tape varispeed: playback rate multiplier (couples pitch + speed)
  let feedReverse = false;               // play the buffer backwards
  const CHUNK = Math.floor(RATE * 0.1); // 100 ms per tick

  // every start/stop bumps feedGen; an async start (fetch/decode/mic permission) that finds its
  // generation superseded bails out, so Stop always wins and two Feeds can't both run.
  function stopFeed() {
    feedGen++;
    if (feedTimer) { clearInterval(feedTimer); feedTimer = null; }
    feedBuf = null; feedPos = 0;
    if (micStop) { micStop(); micStop = null; }
  }

  // feedPos is a fractional FRAME index; each tick resamples CHUNK output frames from the buffer at
  // feedSpeed (linear interpolation), so the varispeed slider changes pitch + speed together, live.
  function playBuffer(buf, loop, onDone) {
    stopFeed();
    const gen = feedGen;
    const frames = (buf.length / 2) | 0;
    feedBuf = buf; feedPos = feedReverse ? frames - 1 : 0;
    feedTimer = setInterval(() => {
      if (gen !== feedGen) { clearInterval(feedTimer); return; }           // superseded
      if (!FM() || !FM().running()) { stopFeed(); onDone && onDone("Press Start first."); return; }
      if (frames < 2) { stopFeed(); onDone && onDone("done"); return; }
      const sp = feedSpeed, rev = feedReverse, out = new Float32Array(CHUNK * 2); let o = 0, done = false;
      for (let k = 0; k < CHUNK; k++) {
        if (rev) { if (feedPos < 0) { if (loop) feedPos += frames; else { done = true; break; } } }
        else { if (feedPos >= frames) { if (loop) feedPos -= frames; else { done = true; break; } } }
        const i0 = feedPos < 0 ? 0 : (feedPos | 0) % frames, frac = feedPos - Math.floor(feedPos), a0 = i0 * 2, a1 = ((i0 + 1) % frames) * 2;
        out[o++] = buf[a0] + (buf[a1] - buf[a0]) * frac;
        out[o++] = buf[a0 + 1] + (buf[a1 + 1] - buf[a0 + 1]) * frac;
        feedPos += rev ? -sp : sp;
      }
      if (o > 0) FM().audio(out.subarray(0, o));
      if (done) { stopFeed(); onDone && onDone("done"); }
    }, 100);
  }

  async function decodeToStereo(arrayBuf) {
    const ac = FM()?.context() || new (window.AudioContext || window.webkitAudioContext)({ sampleRate: RATE });
    const ab = await ac.decodeAudioData(arrayBuf);   // resamples to the context rate (44.1k)
    const n = ab.length, buf = new Float32Array(n * 2);
    const l = ab.getChannelData(0), r = ab.numberOfChannels > 1 ? ab.getChannelData(1) : l;
    for (let i = 0; i < n; i++) { buf[i * 2] = l[i]; buf[i * 2 + 1] = r[i]; }
    return buf;
  }
  async function playFile(file, loop, onDone) {
    stopFeed(); const gen = feedGen;
    const buf = await decodeToStereo(await file.arrayBuffer());
    if (gen !== feedGen) return;                      // Stop / new Feed happened during decode
    playBuffer(buf, loop, onDone);
  }
  async function playUrl(url, loop, onDone) {
    stopFeed(); const gen = feedGen;
    const r = await fetch(url); if (!r.ok) throw new Error(`sample: HTTP ${r.status}`);
    const buf = await decodeToStereo(await r.arrayBuffer());
    if (gen !== feedGen) return;                      // superseded during fetch/decode
    playBuffer(buf, loop, onDone);
  }

  async function playMic(onDone) {
    stopFeed();
    const gen = feedGen;
    const ac = FM()?.context();
    if (!ac) { onDone && onDone("Press Start first."); return; }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
    if (gen !== feedGen) { stream.getTracks().forEach(t => t.stop()); return; }   // stopped during the permission prompt
    const src = ac.createMediaStreamSource(stream);
    const sp = ac.createScriptProcessor(2048, 2, 1);
    src.connect(sp); const sink = ac.createGain(); sink.gain.value = 0; sp.connect(sink); sink.connect(ac.destination);
    sp.onaudioprocess = (e) => {
      const l = e.inputBuffer.getChannelData(0);
      const r = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : l;
      const out = new Float32Array(l.length * 2);
      for (let i = 0; i < l.length; i++) { out[i * 2] = l[i]; out[i * 2 + 1] = r[i]; }
      FM()?.audio(out);
    };
    micStop = () => { try { sp.disconnect(); src.disconnect(); sink.disconnect(); stream.getTracks().forEach(t => t.stop()); } catch {} };
  }

  // ---- recording the FM-1's output to a WAV ----
  function startRec(onDone) {
    const ac = FM()?.context(), node = FM()?.outNode();
    if (!ac || !node) { onDone && onDone("Press Start first."); return false; }
    recChunks = [[], []];
    const sp = ac.createScriptProcessor(4096, 2, 2);
    const sink = ac.createGain(); sink.gain.value = 0;
    node.connect(sp); sp.connect(sink); sink.connect(ac.destination);
    sp.onaudioprocess = (e) => {
      recChunks[0].push(e.inputBuffer.getChannelData(0).slice());
      recChunks[1].push(e.inputBuffer.getChannelData(1).slice());
    };
    recNodes = () => { try { node.disconnect(sp); sp.disconnect(); sink.disconnect(); } catch {} };
    return true;
  }
  function stopRec() {
    if (!recNodes) return null;
    recNodes(); recNodes = null;
    const cat = (arr) => { let len = 0; for (const a of arr) len += a.length; const o = new Float32Array(len); let p = 0; for (const a of arr) { o.set(a, p); p += a.length; } return o; };
    const l = cat(recChunks[0]), r = cat(recChunks[1]); recChunks = null;
    return encodeWav(l, r, RATE);
  }
  function encodeWav(l, r, rate) {
    const n = Math.min(l.length, r.length), buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, n * 4, true);
    let o = 44;
    for (let i = 0; i < n; i++) {
      v.setInt16(o, Math.max(-1, Math.min(1, l[i])) * 32767, true); o += 2;
      v.setInt16(o, Math.max(-1, Math.min(1, r[i])) * 32767, true); o += 2;
    }
    return new Blob([buf], { type: "audio/wav" });
  }

  // ---- UI ----
  function ready(fn) { const t = setInterval(() => { const nav = document.querySelector("header.site .wrap"); if (nav && window.FM1) { clearInterval(t); fn(nav); } }, 120); setTimeout(() => clearInterval(t), 9000); }
  let SAMPLES = { groups: [] };
  const SAMP_FLAT = [];
  ready(async (nav) => {
    try { SAMPLES = await (await fetch("samples.json?v=23")).json(); } catch {}
    const css = document.createElement("style"); css.textContent = `
      #tape-btn{cursor:pointer}
      #tape-pop{position:fixed;z-index:9997;width:300px;max-width:93vw;background:#0c0d0f;border:1px solid #232428;
        border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.6);padding:13px;display:none;flex-direction:column;gap:10px;color:#e9edf2;font:13px 'Space Grotesk',-apple-system,Segoe UI,Roboto,sans-serif}
      #tape-pop.open{display:flex}
      #tape-pop h3{margin:0;font-size:13px;display:flex;align-items:center;gap:7px}
      #tape-pop h3 .dot{width:8px;height:8px;border-radius:50%;background:var(--amber);box-shadow:0 0 8px var(--amber)}
      /* the cassette */
      .cass{position:relative;height:96px;border-radius:10px;
        background:linear-gradient(160deg,#202225,#121316 70%);border:1px solid #2c2e33;overflow:hidden;box-shadow:inset 0 1px 0 #3a3d44,inset 0 -10px 20px rgba(0,0,0,.5)}
      .cass .label{position:absolute;left:12px;right:12px;top:10px;height:30px;border-radius:4px;
        background:linear-gradient(#f4f1e8,#d9d4c4);box-shadow:0 1px 2px rgba(0,0,0,.4)}
      .cass .label b{position:absolute;left:8px;top:6px;font:700 11px Georgia,serif;color:#b23c00}
      .cass .label i{position:absolute;right:8px;top:7px;font:italic 10px Georgia,serif;color:#555}
      .cass .win{position:absolute;left:50%;transform:translateX(-50%);bottom:12px;width:150px;height:40px;border-radius:6px;
        background:#0c0d0f;border:1px solid #000;box-shadow:inset 0 2px 6px #000;display:flex;align-items:center;justify-content:space-between;padding:0 14px}
      .reel{width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 50% 50%,#3a3d44 28%,#17181b 30%,#17181b 44%,#2a2c31 46%);
        position:relative}
      .reel::before{content:"";position:absolute;inset:11px;border-radius:50%;background:var(--amber);box-shadow:0 0 6px var(--amber)}
      .reel .teeth{position:absolute;inset:0;border-radius:50%;background:
        conic-gradient(from 0deg,#6b6e76 0 8deg,transparent 8deg 45deg,#6b6e76 45deg 53deg,transparent 53deg 90deg,
        #6b6e76 90deg 98deg,transparent 98deg 135deg,#6b6e76 135deg 143deg,transparent 143deg 180deg,
        #6b6e76 180deg 188deg,transparent 188deg 225deg,#6b6e76 225deg 233deg,transparent 233deg 270deg,
        #6b6e76 270deg 278deg,transparent 278deg 315deg,#6b6e76 315deg 323deg,transparent 323deg 360deg);
        -webkit-mask:radial-gradient(circle,transparent 9px,#000 10px);mask:radial-gradient(circle,transparent 9px,#000 10px)}
      .cass.spin .reel .teeth{animation:reelspin 1.6s linear infinite}
      .cass.rec .reel::before{background:#ff2a2a;box-shadow:0 0 8px #ff2a2a}
      @keyframes reelspin{to{transform:rotate(360deg)}}
      .cass .tapeline{position:absolute;bottom:30px;left:70px;right:70px;height:2px;background:#5a3a1a;opacity:.6}
      #tape-pop select,#tape-pop input[type=range]{width:100%}
      #tape-pop select{background:#17181b;border:1px solid #2a2c31;color:#e9edf2;border-radius:7px;padding:6px 8px;font:inherit;font-size:12.5px}
      #tape-pop .seg{display:flex;gap:6px}
      #tape-pop .seg button{flex:1;background:#17181b;border:1px solid #2a2c31;color:#9aa0ab;border-radius:7px;padding:6px;font:inherit;font-size:12px;cursor:pointer}
      #tape-pop .seg button.on{border-color:var(--amber);color:var(--amber)}
      #tape-pop .tp{display:flex;gap:7px}
      #tape-pop .tp button{flex:1;background:#17181b;border:1px solid #2a2c31;color:#e9edf2;border-radius:7px;padding:9px;font:inherit;font-size:14px;cursor:pointer}
      #tape-pop .tp button.play{background:var(--amber);color:#180a02;border:0;font-weight:700}
      #tape-pop .tp button.rec{color:#ff6a6a;border-color:#5a2a2a}
      #tape-pop .tp button.rec.on{background:#ff2a2a;color:#190404;border:0}
      #tape-pop .loopon{border-color:var(--amber);color:var(--amber)}
      #tape-pop .lbl{display:flex;justify-content:space-between;font-size:11px;color:#8c93a0;margin-bottom:2px}
      #tape-status{margin:0;font-size:11.5px;color:#cfd4da;min-height:1em}
      #tape-badge{font-size:10.5px;padding:2px 7px;border-radius:999px;border:1px solid #2a2c31;color:#8c93a0}
      #tape-badge.ok{border-color:#2f6b35;color:#62d36e}
      #tape-pop a.dl{color:var(--amber);font-size:11.5px}`;
    document.head.appendChild(css);

    const btn = document.createElement("a"); btn.id = "tape-btn"; btn.href = "#";
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 16 16" style="vertical-align:-2px;margin-right:5px"><rect x="1" y="3" width="14" height="10" rx="2" fill="var(--amber)"/><circle cx="5.5" cy="8" r="1.7" fill="#0c0d0f"/><circle cx="10.5" cy="8" r="1.7" fill="#0c0d0f"/><rect x="5.5" y="11.4" width="5" height="1" fill="#0c0d0f"/></svg>Tape`;
    (document.querySelector(".sitenav") || nav).appendChild(btn);

    const pop = document.createElement("div"); pop.id = "tape-pop";
    let opts = "";
    for (const g of (SAMPLES.groups || [])) { opts += `<optgroup label="${g.name}">`; for (const it of g.items) { const i = SAMP_FLAT.push(it) - 1; opts += `<option value="smp|${i}">${it.n}</option>`; } opts += `</optgroup>`; }
    opts += `<optgroup label="Test tones">`;
    for (const k of Object.keys(LIB)) opts += `<option value="tone|${k}">${k}</option>`;
    opts += `</optgroup>`;
    pop.innerHTML = `
      <h3><span class="dot"></span> Tape Deck <span id="tape-badge" style="margin-left:auto">line-in: ?</span></h3>
      <div class="cass" id="tape-cass">
        <div class="label"><b>FM-1</b><i>type&nbsp;IV</i></div>
        <div class="tapeline"></div>
        <div class="win"><div class="reel"><div class="teeth"></div></div><div class="reel"><div class="teeth"></div></div></div>
      </div>
      <div class="seg" id="tape-src">
        <button data-s="lib" class="on">Library</button><button data-s="file">File…</button><button data-s="mic">Mic</button>
      </div>
      <select id="tape-sel">${opts}</select>
      <input type="file" id="tape-file" accept="audio/*" hidden>
      <div class="tp">
        <button class="play" id="tape-play">▶ Feed</button>
        <button id="tape-stop">■ Stop</button>
        <button class="rec" id="tape-rec">● Rec</button>
        <button id="tape-loop" class="loopon">↻</button>
        <button id="tape-rev" title="Reverse playback">⇄</button>
      </div>
      <div><div class="lbl"><span>Speed / pitch <span style="opacity:.7">(double-click = 1×)</span></span><span id="tape-speed-l">1.00× · 0 st</span></div>
        <input id="tape-speed" type="range" min="-24" max="24" value="0" step="1"></div>
      <p id="tape-status"></p>
      <p style="margin:0;font-size:11px;color:#8c93a0"><b>Feed</b> plays audio into the FM-1 over USB. On a sampler (zp12, pigeon…) set it recording — on zp12: tap <b>LFO</b>, then <b>REC</b> — and it samples what you feed (loop it so you can catch it). <b>Rec</b> here captures the FM-1's own output to a .wav.</p>`;
    document.body.appendChild(pop);

    const statusEl = pop.querySelector("#tape-status");
    const badge = pop.querySelector("#tape-badge");
    const cass = pop.querySelector("#tape-cass");
    const sel = pop.querySelector("#tape-sel");
    const fileIn = pop.querySelector("#tape-file");
    const playBtn = pop.querySelector("#tape-play");
    const recBtn = pop.querySelector("#tape-rec");
    const loopBtn = pop.querySelector("#tape-loop");
    let src = "lib", loop = true, pickedFile = null, recording = false;
    const status = (s) => { statusEl.textContent = s; };
    const spin = (on, rec) => { cass.classList.toggle("spin", on); cass.classList.toggle("rec", !!rec); };

    // reflect whether the booted firmware takes line-in
    setInterval(() => {
      if (!FM() || !FM().running()) { badge.textContent = "USB audio: —"; badge.classList.remove("ok"); return; }
      const ok = FM().hasAudioIn();
      badge.textContent = ok ? "sampler: ready ●" : "no USB audio-in";
      badge.classList.toggle("ok", ok);
    }, 700);

    pop.querySelector("#tape-src").onclick = (e) => {
      const b = e.target.closest("button[data-s]"); if (!b) return;
      src = b.dataset.s;
      pop.querySelectorAll("#tape-src button").forEach(x => x.classList.toggle("on", x === b));
      sel.style.display = src === "lib" ? "" : "none";
      if (src === "file") { fileIn.click(); }
      status(src === "mic" ? "Mic — press Feed (grants mic access)." : src === "file" ? "Pick a file…" : "");
    };
    fileIn.onchange = () => { pickedFile = fileIn.files[0] || null; if (pickedFile) status(`Loaded ${pickedFile.name} — press Feed.`); };

    playBtn.onclick = async () => {
      if (!FM() || !FM().running()) { status("Press Start to boot a firmware first."); return; }
      try {
        const done = (m) => { if (m !== "done") status(m); spin(false); };
        if (src === "lib") {
          const [kind, key] = sel.value.split("|");
          if (kind === "smp") { const it = SAMP_FLAT[+key]; status("Loading sample…"); await playUrl(it.f, loop, done); status(`▶ Feeding ${it.n}${loop ? " · loop" : ""}`); spin(true); }
          else { playBuffer(renderLib(key), loop, done); status(`▶ Feeding ${key}${loop ? " · loop" : ""}`); spin(true); }
        }
        else if (src === "file") { if (!pickedFile) { fileIn.click(); return; } status("Decoding…"); await playFile(pickedFile, loop, done); status(`▶ Feeding ${pickedFile.name}${loop ? " · loop" : ""}`); spin(true); }
        else { await playMic(() => spin(false)); status("▶ Feeding mic"); spin(true); }
        if (!FM().hasAudioIn()) status("▶ Feeding — but this firmware has no USB audio input, so it won't capture it. Try a sampler (zp12, pigeon).");
      } catch (e) { status(`✗ ${(e && e.message) || e}`); spin(false); }
    };
    pop.querySelector("#tape-stop").onclick = () => { stopFeed(); if (!recording) spin(false); status("Stopped."); };
    recBtn.onclick = () => {
      if (!recording) { if (startRec((m) => status(m))) { recording = true; recBtn.classList.add("on"); recBtn.textContent = "● Stop"; spin(true, true); status("● Recording the FM-1 output…"); } }
      else {
        recording = false; recBtn.classList.remove("on"); recBtn.textContent = "● Rec"; if (!feedTimer && !micStop) spin(false);
        const blob = stopRec();
        if (blob && blob.size > 44) {
          const url = URL.createObjectURL(blob); const name = `fm1-recording-${Date.now()}.wav`;
          statusEl.innerHTML = `✓ Recorded. <a class="dl" href="${url}" download="${name}">Download ${name}</a>`;
        } else status("Nothing recorded.");
      }
    };
    loopBtn.onclick = () => { loop = !loop; loopBtn.classList.toggle("loopon", loop); };
    const revBtn = pop.querySelector("#tape-rev");
    revBtn.onclick = () => { feedReverse = !feedReverse; revBtn.classList.toggle("loopon", feedReverse); };

    // tape varispeed: semitones -> rate multiplier (2^(st/12)); updates live while feeding
    const speedSlider = pop.querySelector("#tape-speed"), speedLbl = pop.querySelector("#tape-speed-l");
    const applySpeed = () => { const st = +speedSlider.value; feedSpeed = Math.pow(2, st / 12); speedLbl.textContent = feedSpeed.toFixed(2) + "× · " + (st > 0 ? "+" : "") + st + " st"; };
    speedSlider.oninput = applySpeed;
    speedSlider.ondblclick = () => { speedSlider.value = 0; applySpeed(); };
    applySpeed();

    const place = () => { const r = btn.getBoundingClientRect(); pop.style.top = (r.bottom + 6) + "px"; pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 312)) + "px"; };
    btn.onclick = (e) => { e.preventDefault(); pop.classList.toggle("open"); if (pop.classList.contains("open")) place(); };
    window.addEventListener("resize", () => { if (pop.classList.contains("open")) place(); });
    document.addEventListener("click", (e) => { if (e.target !== btn && !pop.contains(e.target)) pop.classList.remove("open"); });
  });
})();
