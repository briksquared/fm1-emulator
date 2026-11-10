// MIDI recorder for the FM-1 emulator: captures everything you play into the device — the Keys
// module (incl. the routed computer keyboard and processed hardware MIDI), the pattern player and
// loaded .mid files — by tapping window.FM1Rec, and exports it as a Standard MIDI File (.mid).
// Has a metronome click with a bar count-in, a fixed-bar take length (auto-stop), DAW-style
// quantize (grid + strength + swing, preserving note lengths), and can split the export into one
// track per channel. Pure DOM + Web Audio; its own little panel. Timing is real wall-clock.
(function () {
  "use strict";
  const FM = () => window.FM1;

  // ---- Standard MIDI File writer (480 TPQN). perChannel: one track per MIDI channel (format 1,
  // a conductor track for tempo + a named track per channel); otherwise one merged track (format 0). ----
  function vlq(arr, v) { const b = [v & 0x7f]; v >>>= 7; while (v) { b.unshift((v & 0x7f) | 0x80); v >>>= 7; } for (const x of b) arr.push(x); }
  const nameMeta = (s) => { const b = []; for (let i = 0; i < s.length && i < 120; i++) b.push(s.charCodeAt(i) & 0x7f); return [0xff, 0x03, b.length, ...b]; };
  function writeSMF(evts, bpm, perChannel) {
    const div = 480, msPerBeat = 60000 / bpm, tempo = Math.round(60000000 / bpm);
    const tempoMeta = [0xff, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff];
    const mkTrack = (evs, metas) => {
      const trk = [];
      for (const m of (metas || [])) { vlq(trk, 0); for (const x of m) trk.push(x & 0xff); }
      let last = 0;
      for (const e of evs) { const tick = Math.round(e.t / msPerBeat * div); vlq(trk, Math.max(0, tick - last)); last = tick; for (const by of e.b) trk.push(by & 0xff); }
      vlq(trk, 0); trk.push(0xff, 0x2f, 0x00);
      return trk;
    };
    const tracks = [];
    if (perChannel) {
      tracks.push(mkTrack([], [tempoMeta, nameMeta("Tempo")]));
      const byCh = new Map();
      for (const e of evts) { const s = e.b[0]; if (s >= 0x80 && s < 0xf0) { const ch = s & 0x0f; if (!byCh.has(ch)) byCh.set(ch, []); byCh.get(ch).push(e); } }
      for (const ch of [...byCh.keys()].sort((a, b) => a - b)) tracks.push(mkTrack(byCh.get(ch), [nameMeta(ch === 9 ? "Drums (ch10)" : "Channel " + (ch + 1))]));
    } else {
      tracks.push(mkTrack(evts, [tempoMeta]));
    }
    const fmt = perChannel ? 1 : 0, ntrks = tracks.length;
    const out = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, fmt, (ntrks >> 8) & 0xff, ntrks & 0xff, (div >> 8) & 0xff, div & 0xff];
    for (const trk of tracks) { const L = trk.length; out.push(0x4d, 0x54, 0x72, 0x6b, (L >>> 24) & 0xff, (L >>> 16) & 0xff, (L >>> 8) & 0xff, L & 0xff); for (const x of trk) out.push(x); }
    return new Uint8Array(out);
  }

  // ---- DAW-style quantize. gridBeats is the grid size in beats (1/4 = 1, 1/8 = .5, 1/8T = 1/3,
  // 1/16 = .25, 1/16T = 1/6). strength 0..1 pulls each hit toward the grid; swing 0..~.6 delays the
  // off-beat grid slots. Note starts snap; each note's matching note-off moves by the same amount so
  // durations are preserved (exactly how a DAW quantizes note starts). CC / pitch-bend / orphan
  // note-offs snap on their own. Non-destructive — only the export is quantized. ----
  function quantizeEvents(evts, bpm, gridBeats, strength, swing) {
    const src = evts.map((e) => ({ t: e.t, b: e.b.slice(), done: false }));
    if (!gridBeats || !src.length) return src.map((e) => ({ t: Math.max(0, e.t), b: e.b }));
    const grid = gridBeats * (60000 / bpm);
    const snap = (t) => {
      const idx = Math.round(t / grid);
      let target = idx * grid;
      if (swing > 0 && (idx % 2 === 1)) target += swing * grid;   // delay the off-beats
      return t + (target - t) * strength;
    };
    for (let i = 0; i < src.length; i++) {
      const e = src[i], s = e.b[0];
      if (s >= 0x90 && s < 0xa0 && e.b[2] > 0) {                    // note-on
        const nt = snap(e.t), delta = nt - e.t, ch = s & 0x0f, note = e.b[1];
        e.t = nt; e.done = true;
        for (let j = i + 1; j < src.length; j++) {                 // move its note-off by the same delta
          const o = src[j], os = o.b[0];
          const isOff = ((os >= 0x80 && os < 0x90) || (os >= 0x90 && os < 0xa0 && o.b[2] === 0)) && (os & 0x0f) === ch && o.b[1] === note;
          if (isOff && !o.done) { o.t += delta; o.done = true; break; }
        }
      }
    }
    for (const e of src) if (!e.done) { e.t = snap(e.t); e.done = true; }   // CC, bend, orphan offs
    src.sort((a, b) => a.t - b.t);
    return src.map((e) => ({ t: Math.max(0, e.t), b: e.b }));
  }
  const GRIDS = { "0": 0, "4": 1, "8": 0.5, "8t": 1 / 3, "16": 0.25, "16t": 1 / 6 };
  const GRID_LBL = { "4": "1/4", "8": "1/8", "8t": "1/8T", "16": "1/16", "16t": "1/16T" };

  // ---- recording (overdub keeps prior takes; loop folds time into a fixed bar cycle) ----
  let events = [], recording = false, t0 = 0, tick = null, overdub = false, loopOn = false;
  let bpm = 120, beatsPerBar = 4, muted = new Set();
  function loopMs() {
    if (!loopOn || !recBarsRef()) return 0;
    return recBarsRef() * sharedMeter() * (60000 / sharedBpm());
  }
  let _recBars = 0;
  function recBarsRef() { return _recBars; }
  function stamp() {
    const abs = performance.now() - t0;
    const L = loopMs();
    return L > 0 ? abs % L : abs;
  }
  function start() {
    if (!overdub && !loopOn) events = [];
    // Overdub without loop continues after the last event; loop reuses the cycle from t0.
    const offset = (!loopOn && overdub && events.length) ? ((events[events.length - 1] || {}).t || 0) + 10 : 0;
    t0 = performance.now() - offset; recording = true;
    window.FM1Rec = (bytes) => {
      if (!recording) return;
      const s = bytes[0]; if (s < 0x80 || s >= 0xf0) return;
      // Capture everything. Mute is a mixer setting applied on playback and on
      // export; dropping events here used to destroy them permanently, so a
      // channel muted mid-take could never be brought back.
      events.push({ t: stamp(), b: bytes.slice() });
    };
  }
  function stop() { recording = false; window.FM1Rec = null; }
  function sharedBpm() { return (window.FM1Transport && window.FM1Transport.getBpm()) || bpm; }
  function sharedMeter() { return (window.FM1Transport && window.FM1Transport.getBeatsPerBar()) || beatsPerBar; }
  function channelStats() {
    const m = new Map();
    for (const e of events) {
      const s = e.b[0]; if (s < 0x80 || s >= 0xf0) continue;
      const ch = s & 0x0f;
      m.set(ch, (m.get(ch) || 0) + 1);
    }
    return m;
  }
  // ---- mixer: mute, solo and per-channel level, applied to playback AND export
  // so what you hear is what you get. Non-destructive: `events` is never edited.
  const soloed = new Set();
  const levels = new Map();            // ch -> 0..2, 1 = as played
  function level(ch) { const v = levels.get(ch); return v === undefined ? 1 : v; }
  function audible(ch) {
    if (soloed.size) return soloed.has(ch);
    return !muted.has(ch);
  }
  function mixEvents() {
    const out = [];
    for (const e of events) {
      const s = e.b[0];
      if (s < 0x80 || s >= 0xf0) { out.push(e); continue; }
      const ch = s & 0x0f;
      if (!audible(ch)) continue;
      const lv = level(ch);
      if (lv !== 1 && (s & 0xf0) === 0x90 && e.b[2] > 0) {
        const b = e.b.slice();
        b[2] = Math.max(1, Math.min(127, Math.round(e.b[2] * lv)));
        out.push({ t: e.t, b });
      } else out.push(e);
    }
    return out;
  }
  function filteredEvents() { return mixEvents(); }

  // ---- saved takes: a small library in localStorage, so a good take survives
  // a reload or a firmware change instead of living only in this buffer ----
  const TAKES_KEY = "fm1.takes.v1";
  const TAKES_MAX = 24;
  // Take names are user text rendered into innerHTML; escape them.
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function loadTakes() {
    try {
      const a = JSON.parse(localStorage.getItem(TAKES_KEY) || "[]");
      return Array.isArray(a) ? a.filter((t) => t && Array.isArray(t.events)) : [];
    } catch { return []; }
  }
  function writeTakes(list) {
    try { localStorage.setItem(TAKES_KEY, JSON.stringify(list)); return true; }
    catch (e) { console.warn("takes: could not save", e); return false; }
  }
  function currentFirmwareName() {
    const fm = FM();
    const rf = fm && fm.runningFirmware && fm.runningFirmware();
    if (rf && rf.name) return rf.name;
    const sel = document.getElementById("fw");
    const opt = sel && sel.options && sel.options[sel.selectedIndex];
    return (opt && opt.textContent && opt.textContent.trim()) || "";
  }
  function saveTake(name) {
    if (!events.length) return null;
    const list = loadTakes();
    // Date.now() alone collides for two takes kept in the same millisecond,
    // and then deleting one deletes both.
    let id;
    do { id = "t" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8); }
    while (list.some((t) => t.id === id));
    const take = {
      id,
      name: (name || "").trim() || new Date().toLocaleString(),
      at: Date.now(),
      bpm: sharedBpm(),
      meter: sharedMeter(),
      firmware: currentFirmwareName(),
      // Store the take as played. Mixer settings are a view, so they are saved
      // beside it and can be changed after recall.
      events: events.map((e) => ({ t: Math.round(e.t), b: [...e.b] })),
      mix: { muted: [...muted], soloed: [...soloed], levels: [...levels.entries()] },
    };
    list.unshift(take);
    while (list.length > TAKES_MAX) list.pop();
    return writeTakes(list) ? take : null;
  }
  function recallTake(id) {
    const take = loadTakes().find((t) => t.id === id);
    if (!take) return false;
    events = take.events.map((e) => ({ t: e.t, b: e.b.slice() }));
    muted.clear(); soloed.clear(); levels.clear();
    const m = take.mix || {};
    for (const ch of m.muted || []) muted.add(ch);
    for (const ch of m.soloed || []) soloed.add(ch);
    for (const [ch, v] of m.levels || []) levels.set(ch, v);
    if (take.bpm && window.FM1Transport && window.FM1Transport.setBpm) window.FM1Transport.setBpm(take.bpm);
    return true;
  }
  function deleteTake(id) {
    const list = loadTakes().filter((t) => t.id !== id);
    return writeTakes(list);
  }

  // ---- take playback: send the mixed take back into the device ----
  let playTimers = [], playing = false, onPlayState = null, playDone = null;
  function allNotesOff() {
    const fm = FM(); if (!fm || !fm.midi) return;
    for (let ch = 0; ch < 16; ch++) { fm.midi([0xb0 | ch, 123, 0]); fm.midi([0xb0 | ch, 64, 0]); }
  }
  function stopPlay() {
    playing = false;
    for (const t of playTimers) clearTimeout(t);
    playTimers = [];
    allNotesOff();
    if (onPlayState) onPlayState(false);
    const done = playDone; playDone = null;
    if (done) done();
  }
  function playTake(onComplete) {
    const fm = FM();
    if (!fm || !fm.midi || !fm.running || !fm.running()) return false;
    stopPlay();
    const evts = mixEvents();
    if (!evts.length) return false;
    playing = true;
    playDone = onComplete || null;
    if (onPlayState) onPlayState(true);
    const t0p = evts[0].t;
    let last = 0;
    for (const e of evts) {
      const at = Math.max(0, e.t - t0p);
      if (at > last) last = at;
      playTimers.push(setTimeout(() => { if (playing) fm.midi(e.b); }, at));
    }
    playTimers.push(setTimeout(stopPlay, last + 420));
    return true;
  }

  // Bounce: render the current take to audio by playing it (mixer applied) while
  // FM1Audio captures the output, then hand the .wav to the recordings tray.
  // Reuses the tested playback and capture paths; no new audio code.
  let bouncing = false, onBounceState = null;
  function setBouncing(v) { bouncing = v; if (onBounceState) onBounceState(v); }
  async function bounce() {
    const A = window.FM1Audio;
    const fm = FM();
    if (bouncing || !A || !fm || !fm.running || !fm.running()) return false;
    if (!mixEvents().length) return false;
    if (!(await A.start())) return false;
    setBouncing(true);
    return await new Promise((resolve) => {
      const finish = () => {
        // A short tail after the last note so release/reverb is captured.
        setTimeout(() => {
          const blob = A.stop();
          setBouncing(false);     // notifies the UI, so the label never sticks
          const rec = blob && A.addRecording ? A.addRecording(blob) : null;
          resolve(rec || !!blob);
        }, 600);
      };
      if (!playTake(finish)) { A.stop(); setBouncing(false); resolve(false); }
    });
  }

  // ---- UI ----
  function ready(fn) { const t = setInterval(() => { const nav = document.querySelector("header.site .wrap"); if (nav && window.FM1) { clearInterval(t); fn(nav); } }, 120); setTimeout(() => clearInterval(t), 9000); }
  ready((nav) => {
    const css = document.createElement("style"); css.textContent = `
      #rec-btn{cursor:pointer}
      #rec-pop{position:fixed;z-index:9997;width:262px;max-width:92vw;background:var(--ui-pop,#0c0d0f);border:1px solid var(--ui-line,#232428);
        border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.6);padding:12px;display:none;flex-direction:column;gap:9px;color:var(--ui-text,#e9edf2);font:13px 'Space Grotesk',-apple-system,Segoe UI,Roboto,sans-serif}
      #rec-pop.open{display:flex}
      #rec-pop h3{margin:0;font-size:13px;display:flex;align-items:center;gap:7px}
      #rec-pop h3 .dot{width:8px;height:8px;border-radius:50%;background:#e23b3b;box-shadow:0 0 8px #e23b3b}
      #rec-pop h3 .dot.live{animation:recblink 1s steps(2,start) infinite}
      @keyframes recblink{50%{opacity:.25}}
      #rec-pop .rrow{display:flex;gap:7px;align-items:center}
      #rec-pop button{flex:1;background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text,#e9edf2);border-radius:7px;padding:8px;font:inherit;font-size:13px;cursor:pointer}
      #rec-pop button:disabled{opacity:.4;cursor:default}
      #rec-pop button.on{border-color:var(--amber);color:var(--amber-ink, var(--amber))}
      #rec-pop button.rec{background:#e23b3b;color:var(--ui-text,#fff);border:0;font-weight:700}
      #rec-pop button.dl{background:var(--amber);color:var(--ui-on-accent,#180a02);border:0;font-weight:700}
      #rec-pop .lbl{display:flex;justify-content:space-between;font-size:11px;color:var(--ui-dim,#8c93a0)}
      #rec-pop input[type=range]{width:100%}
      #rec-pop .mini{font-size:11px;color:var(--ui-dim,#8c93a0);display:flex;align-items:center;gap:4px;white-space:nowrap}
      #rec-pop select{background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text,#e9edf2);border-radius:6px;padding:3px 5px;font:inherit;font-size:11px;cursor:pointer}
      #rec-pop .splitrow{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--ui-text2,#cfd4da);cursor:pointer}
      #rec-pop .qrow{display:none;flex-direction:column;gap:5px;border-top:1px solid #1c1d21;padding-top:8px}
      #rec-pop .qrow.show{display:flex}
      #rec-pop .mixer{display:flex;flex-direction:column;gap:4px;border-top:1px solid #1c1d21;padding-top:8px}
      #rec-pop .mixer .ch{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--ui-text2,#cfd4da)}
      #rec-pop .mixer .ch b{font-variant-numeric:tabular-nums;min-width:2.2em}
      #rec-pop .mixer .bar{flex:1;height:6px;background:#1a1b1e;border-radius:3px;overflow:hidden}
      #rec-pop .mixer .bar i{display:block;height:100%;background:var(--amber);border-radius:3px}
      #rec-pop .mixer .mute,#rec-pop .mixer .solo{font-size:10px;padding:3px 6px;flex:0 0 auto;min-width:22px}
      #rec-pop .mixer .mute.on{border-color:#e23b3b;color:#e23b3b}
      #rec-pop .mixer .solo.on{border-color:#e2b23b;color:#e2b23b}
      #rec-pop .mixer .ch.off b,#rec-pop .mixer .ch.off span{opacity:.45}
      #rec-pop .mixer .mixhead{display:flex;align-items:center;gap:8px;margin:2px 0 4px}
      #rec-pop .mixer .mixhead button{font-size:11px;padding:4px 10px}
      #rec-pop .mixer .mixhead .hint{font-size:10.5px;color:#8c93a0}
      #rec-pop .mixer .lvl{display:flex;align-items:center;gap:6px;margin:-2px 0 4px 0}
      #rec-pop .mixer .lvl input{flex:1;height:3px}
      #rec-pop .mixer .lvl span{font:600 10px 'Space Mono',monospace;color:#8c93a0;min-width:3.2em;text-align:right}
      #rec-pop .takes{display:flex;flex-direction:column;gap:3px;border-top:1px solid #1c1d21;padding-top:8px}
      #rec-pop .takes .take{display:flex;align-items:center;gap:6px;font-size:11.5px;color:#cfd4da}
      #rec-pop .takes .tk-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #rec-pop .takes .tk-meta{font:600 9.5px 'Space Mono',monospace;color:#8c93a0;flex:0 0 auto}
      #rec-pop .takes .tk-load,#rec-pop .takes .tk-del{font-size:10px;padding:3px 6px;flex:0 0 auto}
      #rec-pop .takes .tk-del{color:#9aa1ab}
      #rec-pop .takes .tk-del:hover{border-color:#e23b3b;color:#e23b3b}
      #rec-status{margin:0;font-size:11.5px;color:var(--ui-text2,#cfd4da);min-height:1em}`;
    document.head.appendChild(css);

    const btn = document.createElement("a"); btn.id = "rec-btn"; btn.href = "#";
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" style="vertical-align:-2px;margin-right:5px"><circle cx="8" cy="8" r="6" fill="#e23b3b"/></svg>Rec`;
    (document.querySelector(".sitenav") || nav).appendChild(btn);

    const pop = document.createElement("div"); pop.id = "rec-pop";
    pop.innerHTML = `
      <h3><span class="dot"></span> MIDI Recorder</h3>
      <div class="rrow"><button class="rec" id="rec-go">● Record</button><button id="rec-stop" disabled>■ Stop</button></div>
      <div><div class="lbl"><span>Tempo <span style="opacity:.55">(shared)</span></span><span id="rec-bpm-l">120 BPM</span></div><input id="rec-bpm" type="range" min="40" max="240" value="120"></div>
      <div class="rrow"><button id="rec-click" style="flex:0 0 auto">Click</button>
        <label class="mini">Count-in <select id="rec-ci"><option value="0">off</option><option value="1">1 bar</option><option value="2">2 bars</option></select></label>
        <label class="mini"><select id="rec-beats"><option>2</option><option>3</option><option selected>4</option><option>6</option></select>/bar</label></div>
      <div class="rrow">
        <label class="splitrow" style="flex:1;margin:0"><input type="checkbox" id="rec-overdub" style="width:16px;height:16px;flex:0 0 auto"> Overdub</label>
        <label class="splitrow" style="flex:1;margin:0" title="Needs Length &gt; Free. Wraps the take and layers into the same bars."><input type="checkbox" id="rec-loop" style="width:16px;height:16px;flex:0 0 auto"> Loop take</label>
      </div>
      <div class="rrow"><label class="mini">Quantize <select id="rec-grid">
          <option value="0">Off</option><option value="4">1/4</option><option value="8">1/8</option>
          <option value="8t">1/8T</option><option value="16">1/16</option><option value="16t">1/16T</option></select></label>
        <label class="mini">Length <select id="rec-len">
          <option value="0">Free</option><option value="1">1 bar</option><option value="2">2 bars</option><option value="4">4 bars</option><option value="8">8 bars</option></select></label></div>
      <div class="qrow" id="rec-qrow">
        <div><div class="lbl"><span>Quantize strength</span><span id="rec-qs-l">100%</span></div><input id="rec-qs" type="range" min="0" max="100" value="100"></div>
        <div><div class="lbl"><span>Swing</span><span id="rec-sw-l">0%</span></div><input id="rec-sw" type="range" min="0" max="60" value="0"></div></div>
      <label class="splitrow"><input type="checkbox" id="rec-split" style="width:16px;height:16px;flex:0 0 auto"> Split export into per-channel tracks</label>
      <div id="rec-mixer" class="mixer" hidden></div>
      <div class="rrow"><button class="dl" id="rec-dl" disabled style="flex:2">⤓ Download .mid</button><button id="rec-clear" disabled style="flex:1">Clear</button></div>
      <div class="rrow"><button id="rec-save" disabled style="flex:1">★ Keep take</button></div>
      <div id="rec-takes" class="takes" hidden></div>
      <p id="rec-status">Records everything you play into the FM-1.</p>`;
    document.body.appendChild(pop);
    const statusEl = pop.querySelector("#rec-status");
    const status = (s) => { statusEl.textContent = s; };
    const dot = pop.querySelector("h3 .dot");
    const goBtn = pop.querySelector("#rec-go"), stopBtn = pop.querySelector("#rec-stop"), dlBtn = pop.querySelector("#rec-dl");
    const bpmSlider = pop.querySelector("#rec-bpm"), bpmLbl = pop.querySelector("#rec-bpm-l");
    const clickBtn = pop.querySelector("#rec-click");
    const gridSel = pop.querySelector("#rec-grid"), lenSel = pop.querySelector("#rec-len");
    const qrow = pop.querySelector("#rec-qrow"), qsSlider = pop.querySelector("#rec-qs"), swSlider = pop.querySelector("#rec-sw");
    const qsLbl = pop.querySelector("#rec-qs-l"), swLbl = pop.querySelector("#rec-sw-l");
    let clickOn = false, countInBars = 0, perChannel = false, armed = false;
    let gridKey = "0", quantStrength = 1, swing = 0, recBars = 0, autoStop = null;
    const mixerEl = pop.querySelector("#rec-mixer");
    const clearBtn = pop.querySelector("#rec-clear");
    function refreshMixer() {
      const stats = channelStats();
      if (!stats.size) { mixerEl.hidden = true; mixerEl.innerHTML = ""; return; }
      mixerEl.hidden = false;
      const max = Math.max(...stats.values());
      let html = `<div class="lbl"><span>Channels</span><span>${stats.size} active · affects play + export</span></div>` +
        `<div class="mixhead"><button type="button" id="rec-play">${playing ? "Stop" : "Play take"}</button>` +
        (window.FM1Audio ? `<button type="button" id="rec-bounce"${bouncing ? " disabled" : ""}>${bouncing ? "Bouncing…" : "Bounce ↓"}</button>` : "") +
        `<span class="hint">${soloed.size ? soloed.size + " soloed" : (muted.size ? muted.size + " muted" : "all channels")}</span></div>`;
      for (const ch of [...stats.keys()].sort((a, b) => a - b)) {
        const n = stats.get(ch), pct = Math.max(4, Math.round(n / max * 100));
        const name = ch === 9 ? "Ch10 drums" : "Ch " + (ch + 1);
        const dim = audible(ch) ? "" : " off";
        html += `<div class="ch${dim}" data-ch="${ch}"><b>${name}</b>` +
          `<span class="bar"><i style="width:${pct}%"></i></span><span>${n}</span>` +
          `<button type="button" class="solo${soloed.has(ch) ? " on" : ""}">S</button>` +
          `<button type="button" class="mute${muted.has(ch) ? " on" : ""}">M</button></div>` +
          `<div class="lvl" data-ch="${ch}"><input type="range" min="0" max="150" step="5" value="${Math.round(level(ch) * 100)}">` +
          `<span>${Math.round(level(ch) * 100)}%</span></div>`;
      }
      mixerEl.innerHTML = html;
      const sync = () => { refreshMixer(); dlBtn.disabled = filteredEvents().length === 0; };
      mixerEl.querySelectorAll(".mute").forEach((btn) => {
        btn.onclick = () => {
          const ch = +btn.closest(".ch").dataset.ch;
          if (muted.has(ch)) muted.delete(ch); else muted.add(ch);
          sync();
        };
      });
      mixerEl.querySelectorAll(".solo").forEach((btn) => {
        btn.onclick = () => {
          const ch = +btn.closest(".ch").dataset.ch;
          if (soloed.has(ch)) soloed.delete(ch); else soloed.add(ch);
          sync();
        };
      });
      mixerEl.querySelectorAll(".lvl input").forEach((sl) => {
        sl.oninput = () => {
          const ch = +sl.closest(".lvl").dataset.ch;
          levels.set(ch, (+sl.value) / 100);
          sl.nextElementSibling.textContent = sl.value + "%";
        };
      });
      const playBtn = mixerEl.querySelector("#rec-play");
      if (playBtn) playBtn.onclick = () => {
        if (playing) { stopPlay(); return; }
        if (!playTake()) playBtn.textContent = "Press Start first";
      };
      const bounceBtn = mixerEl.querySelector("#rec-bounce");
      if (bounceBtn) bounceBtn.onclick = async () => {
        if (bouncing) return;
        const ok = await bounce();
        refreshMixer();
        if (!ok) { const b = mixerEl.querySelector("#rec-bounce"); if (b) b.textContent = "Press Start first"; }
        else status("Bounced the take to audio — it's in the Audio tray.");
      };
    }
    onPlayState = () => refreshMixer();
    onBounceState = () => refreshMixer();

    const takesEl = pop.querySelector("#rec-takes");
    const saveBtn = pop.querySelector("#rec-save");
    function refreshTakes() {
      const list = loadTakes();
      if (!list.length) { takesEl.hidden = true; takesEl.innerHTML = ""; return; }
      takesEl.hidden = false;
      let html = `<div class="lbl"><span>Kept takes</span><span>${list.length}${list.length >= TAKES_MAX ? " (full)" : ""}</span></div>`;
      for (const t of list) {
        const bars = t.meter && t.bpm
          ? Math.max(1, Math.round((t.events.length ? t.events[t.events.length - 1].t : 0) / (60000 / t.bpm * t.meter)))
          : 0;
        html += `<div class="take" data-id="${t.id}">` +
          `<span class="tk-name" title="${esc(t.firmware || "")}">${esc(t.name)}</span>` +
          `<span class="tk-meta">${t.events.length} ev${bars ? " · " + bars + " bar" + (bars > 1 ? "s" : "") : ""} · ${Math.round(t.bpm || 0)} BPM</span>` +
          `<button type="button" class="tk-load">Load</button>` +
          `<button type="button" class="tk-del" title="Delete this take">✕</button></div>`;
      }
      takesEl.innerHTML = html;
      takesEl.querySelectorAll(".tk-load").forEach((b) => {
        b.onclick = () => {
          const id = b.closest(".take").dataset.id;
          if (!recallTake(id)) return;
          refreshMixer();
          dlBtn.disabled = filteredEvents().length === 0;
          clearBtn.disabled = events.length === 0;
          saveBtn.disabled = events.length === 0;
        };
      });
      takesEl.querySelectorAll(".tk-del").forEach((b) => {
        b.onclick = () => { deleteTake(b.closest(".take").dataset.id); refreshTakes(); };
      });
    }
    saveBtn.onclick = () => {
      if (!events.length) return;
      const suggested = (currentFirmwareName() || "Take") + " " + new Date().toTimeString().slice(0, 5);
      const name = window.prompt("Name this take", suggested);
      if (name === null) return;      // cancelled
      if (saveTake(name)) refreshTakes();
      else saveBtn.textContent = "Storage full";
    };
    refreshTakes();

    // ---- metronome: short blips on the FM-1 AudioContext, scheduled with a lookahead for steady time ----
    let clickTimer = null, clickRunning = false;
    function clickTone(when, accent) {
      const ac = FM() && FM().context(); if (!ac) return;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "square"; o.frequency.value = accent ? 1800 : 1100;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, when + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.055);
      o.connect(g); g.connect(ac.destination);
      o.start(when); o.stop(when + 0.07);
    }
    function startClicks(onCountInDone) {
      stopClicks();
      const ac = FM() && FM().context();
      if (!ac) { if (onCountInDone) onCountInDone(); return; }
      clickRunning = true;
      bpm = sharedBpm(); beatsPerBar = sharedMeter();
      const beatDur = 60 / bpm, totalCI = countInBars * beatsPerBar;
      let beat = 0, nextTime = ac.currentTime + 0.12, fired = false;
      if (totalCI === 0 && onCountInDone) { onCountInDone(); onCountInDone = null; fired = true; }
      clickTimer = setInterval(() => {
        if (!clickRunning) { clearInterval(clickTimer); clickTimer = null; return; }
        const c = FM() && FM().context(); if (!c) { stopClicks(); return; }
        while (nextTime < c.currentTime + 0.25) {
          const inCI = beat < totalCI;
          if (clickOn || inCI) clickTone(nextTime, (beat % beatsPerBar) === 0);
          beat++;
          if (!fired && onCountInDone && beat === totalCI) { const delay = Math.max(0, (nextTime + beatDur - c.currentTime) * 1000); const cb = onCountInDone; onCountInDone = null; fired = true; setTimeout(cb, delay); }
          nextTime += beatDur;
          if (!clickOn && totalCI > 0 && beat >= totalCI) { clickRunning = false; break; }   // count-in only
        }
        if (!clickRunning && clickTimer) { clearInterval(clickTimer); clickTimer = null; }
      }, 25);
    }
    function stopClicks() { clickRunning = false; if (clickTimer) { clearInterval(clickTimer); clickTimer = null; } }

    function tickUpdate() {
      if (!recording) return;
      const abs = performance.now() - t0;
      const L = loopMs();
      const pass = L > 0 ? Math.floor(abs / L) + 1 : 0;
      const bars = recBars ? ` / ${recBars} bar${recBars > 1 ? "s" : ""}` : "";
      const loopBit = loopOn && L > 0 ? ` · loop #${pass}` : "";
      status(`● Recording — ${(abs / 1000).toFixed(1)}s${bars}${loopBit} · ${events.length} events`);
      tick = setTimeout(tickUpdate, 200);
    }

    function doStop() {
      armed = false; stop(); stopClicks(); dot.classList.remove("live"); clearTimeout(tick);
      if (autoStop) { clearTimeout(autoStop); autoStop = null; }
      goBtn.disabled = false; stopBtn.disabled = true;
      dlBtn.disabled = filteredEvents().length === 0;
      clearBtn.disabled = events.length === 0;
      saveBtn.disabled = events.length === 0;
      refreshMixer();
      status(events.length ? `Captured ${events.length} events · ${(((events[events.length - 1] || {}).t || 0) / 1000).toFixed(1)}s. Keep it or download below.` : "Nothing was played.");
    }

    goBtn.onclick = () => {
      if (!FM() || (FM().running && !FM().running())) { status("Press Start to boot a firmware first."); return; }
      if (loopOn && !recBars) { status("Loop take needs Length set (1–8 bars)."); return; }
      _recBars = recBars;
      armed = true; goBtn.disabled = true; stopBtn.disabled = false; dlBtn.disabled = true; clearBtn.disabled = true;
      const begin = () => {
        if (!armed) return;
        // Loop recording implies layering into the cycle.
        if (loopOn) overdub = true;
        start(); dot.classList.add("live"); status("● Recording… play the keys."); tickUpdate();
        // Fixed length auto-stops unless looping (user stops manually).
        if (recBars > 0 && !loopOn) {
          const ms = recBars * sharedMeter() * (60000 / sharedBpm());
          autoStop = setTimeout(() => { if (recording) doStop(); }, ms + 40);
        }
      };
      if (countInBars > 0) { status(`Count-in — ${countInBars} bar${countInBars > 1 ? "s" : ""}…`); startClicks(begin); }
      else { if (clickOn) startClicks(null); begin(); }
    };
    stopBtn.onclick = doStop;
    clearBtn.onclick = () => {
      if (recording) return;
      // Clear empties the working buffer only; kept takes are a separate library.
      events = []; muted.clear(); soloed.clear(); levels.clear();
      dlBtn.disabled = true; clearBtn.disabled = true; saveBtn.disabled = true;
      refreshMixer();
      status("Take cleared. Kept takes are still below.");
    };
    dlBtn.onclick = () => {
      const src = filteredEvents();
      if (!src.length) return;
      bpm = sharedBpm();
      const grid = GRIDS[gridKey] || 0;
      const sorted = src.slice().sort((a, b) => a.t - b.t);
      const outEvts = grid ? quantizeEvents(sorted, bpm, grid, quantStrength, swing) : sorted;
      const blob = new Blob([writeSMF(outEvts, bpm, perChannel)], { type: "audio/midi" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "fm1-performance.mid"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      const q = grid ? `, quantized ${GRID_LBL[gridKey]}${swing > 0 ? ` swing ${Math.round(swing * 100)}%` : ""}` : "";
      const muteBit = muted.size ? `, ${muted.size} ch muted` : "";
      status(`Saved fm1-performance.mid (${src.length} events${perChannel ? ", per-channel" : ""}${q}${muteBit}).`);
    };
    bpmSlider.oninput = (e) => {
      bpm = +e.target.value; bpmLbl.textContent = bpm + " BPM";
      if (window.FM1Transport) window.FM1Transport.setBpm(bpm);
    };
    bpmSlider.onchange = () => { if (clickRunning) startClicks(null); };
    clickBtn.onclick = () => {
      clickOn = !clickOn; clickBtn.classList.toggle("on", clickOn);
      if (window.FM1Transport) window.FM1Transport.setMetro(clickOn);
      else if (clickOn) startClicks(null); else stopClicks();
    };
    pop.querySelector("#rec-ci").onchange = (e) => { countInBars = +e.target.value; };
    pop.querySelector("#rec-beats").onchange = (e) => {
      beatsPerBar = +e.target.value;
      if (window.FM1Transport) window.FM1Transport.setBeatsPerBar(beatsPerBar);
    };
    pop.querySelector("#rec-split").onchange = (e) => { perChannel = e.target.checked; };
    pop.querySelector("#rec-overdub").onchange = (e) => { overdub = e.target.checked; };
    pop.querySelector("#rec-loop").onchange = (e) => {
      loopOn = e.target.checked;
      if (loopOn && !recBars) { status("Set Length to 1–8 bars for loop recording."); }
      if (loopOn) { overdub = true; pop.querySelector("#rec-overdub").checked = true; }
    };
    if (window.FM1Transport) {
      bpm = window.FM1Transport.getBpm(); beatsPerBar = window.FM1Transport.getBeatsPerBar();
      bpmSlider.value = bpm; bpmLbl.textContent = bpm + " BPM";
      pop.querySelector("#rec-beats").value = String(beatsPerBar);
      window.FM1Transport.on((type, d) => {
        if (type === "bpm" || type === "meter") {
          bpm = d.bpm; beatsPerBar = d.beatsPerBar;
          bpmSlider.value = bpm; bpmLbl.textContent = bpm + " BPM";
          pop.querySelector("#rec-beats").value = String(beatsPerBar);
          if (clickRunning) startClicks(null);
        }
        if (type === "metro") { clickOn = d.metroOn; clickBtn.classList.toggle("on", clickOn); }
      });
    }
    gridSel.onchange = (e) => { gridKey = e.target.value; qrow.classList.toggle("show", gridKey !== "0"); };
    lenSel.onchange = (e) => {
      recBars = +e.target.value; _recBars = recBars;
      if (loopOn && !recBars) status("Loop take needs Length set (1–8 bars).");
    };
    qsSlider.oninput = (e) => { quantStrength = +e.target.value / 100; qsLbl.textContent = e.target.value + "%"; };
    swSlider.oninput = (e) => { swing = +e.target.value / 100; swLbl.textContent = e.target.value + "%"; };

    const place = () => { const r = (window.FM1PopAnchor && window.FM1PopAnchor(btn)) || btn.getBoundingClientRect(); pop.style.top = (r.bottom + 6) + "px"; pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 274)) + "px"; };
    btn.onclick = (e) => { e.preventDefault(); pop.classList.toggle("open"); if (pop.classList.contains("open")) place(); };
    window.addEventListener("resize", () => { if (pop.classList.contains("open")) place(); });
    document.addEventListener("pointerdown", (e) => { if (e.target !== btn && !btn.contains(e.target) && !pop.contains(e.target)) pop.classList.remove("open"); });

    window.FM1Recorder = {
      writeSMF, start, stop, quantize: quantizeEvents, events: () => events,
      _startClicks: startClicks, _stopClicks: stopClicks,
      _inject: (evs) => { events = evs.map((e) => ({ t: e.t, b: e.b.slice() })); refreshMixer(); },
      _grids: GRIDS, _setOverdub: (v) => { overdub = !!v; }, _setLoop: (v) => { loopOn = !!v; },
      _muted: () => [...muted], _channelStats: channelStats, _refreshMixer: refreshMixer,
      // mixer: mute/solo/level are non-destructive and shared by play and export
      mix: mixEvents, filtered: filteredEvents,
      _setMute: (ch, on) => { if (on) muted.add(ch); else muted.delete(ch); },
      _setSolo: (ch, on) => { if (on) soloed.add(ch); else soloed.delete(ch); },
      _setLevel: (ch, v) => { levels.set(ch, v); },
      _soloed: () => [...soloed], _level: level, _audible: audible,
      play: playTake, stopPlay, playing: () => playing, bounce, bouncing: () => bouncing,
      // saved-take library
      saveTake, recallTake, deleteTake, takes: loadTakes, _takesKey: TAKES_KEY, _takesMax: TAKES_MAX
    };
  });
})();
