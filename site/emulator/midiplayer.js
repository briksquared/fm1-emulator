// Virtual MIDI player for the FM-1 emulator fork: a library of patterns piped into the emulated
// device via window.FM1.midi (works after Start). Think of it as a MIDI cable you plug in, loaded
// with a ton of material. Pure DOM; styled to look like a little device.
(function () {
  "use strict";

  // ---- pattern builders (times in beats; ch 0-based, drums on ch 9 = MIDI ch 10) ----
  const N = (ch, p, v, t, d) => [[t, [0x90 | ch, p, v]], [t + d, [0x80 | ch, p, 0]]];
  const pat = (name, len, ev) => ({ name, len, ev: ev.slice().sort((a, b) => a[0] - b[0]) });
  const seq = (ch, notes, step, dur, vel) => { let t = 0, ev = []; for (const p of notes) { if (p != null) ev.push(...N(ch, p, vel || 100, t, dur || step * 0.9)); t += step; } return ev; };
  const scale = (name, root, steps) => { let t = 0, p = root, ev = [...N(0, p, 100, t, 0.45)]; for (const s of steps) { t += 0.5; p += s; ev.push(...N(0, p, 100, t, 0.45)); } return pat(name, t + 0.5, ev); };
  const arp = (name, root, chord) => { let ev = [], t = 0; for (let o = 0; o < 2; o++) for (const c of chord) { ev.push(...N(0, root + c + o * 12, 96, t, 0.22)); t += 0.25; } return pat(name, t, ev); };
  const chords = (name, prog) => { let ev = [], t = 0; for (const ch of prog) { for (const n of ch) ev.push(...N(0, n, 84, t, 1.9)); t += 2; } return pat(name, t, ev); };
  const drum = (name, len, lanes) => { let ev = []; for (const [note, hits] of lanes) hits.forEach((h, i) => { if (h) ev.push(...N(9, note, h === 2 ? 120 : 92, i * 0.25, 0.12)); }); return pat(name, len, ev); };
  const K = 36, SN = 38, CH = 42, OH = 46, CL = 39, RIM = 37, TOM = 45;

  const LIB = {
    "Scales": [
      scale("C major", 60, [2, 2, 1, 2, 2, 2, 1]),
      scale("C minor", 60, [2, 1, 2, 2, 1, 2, 2]),
      scale("C dorian", 60, [2, 1, 2, 2, 2, 1, 2]),
      scale("C phrygian", 60, [1, 2, 2, 2, 1, 2, 2]),
      scale("Pentatonic", 60, [3, 2, 2, 3, 2]),
      scale("Chromatic", 60, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
      pat("Single C4", 1, N(0, 60, 110, 0, 0.9)),
    ],
    "Arpeggios": [
      arp("Cmaj7 arp", 60, [0, 4, 7, 11]),
      arp("Amin7 arp", 57, [0, 3, 7, 10]),
      arp("Dsus arp", 62, [0, 5, 7, 12]),
      arp("Cm9 arp", 60, [0, 3, 7, 10, 14]),
    ],
    "Chords": [
      chords("I-V-vi-IV", [[60, 64, 67], [67, 71, 74], [69, 72, 76], [65, 69, 72]]),
      chords("ii-V-I jazz", [[62, 65, 69, 72], [67, 71, 74, 77], [60, 64, 67, 71]]),
      chords("Minor pad", [[60, 63, 67], [58, 62, 65], [56, 60, 63], [58, 62, 65]]),
    ],
    "Drum grooves (ch10)": [
      drum("Four on floor", 4, [[K, [2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0]], [CH, [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]], [OH, [0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0]]]),
      drum("House", 4, [[K, [2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0]], [CL, [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0]], [CH, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]]]),
      drum("Techno", 4, [[K, [2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0]], [CH, [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 2]], [RIM, [0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0]]]),
      drum("Hip-hop", 4, [[K, [2, 0, 0, 0, 0, 0, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0]], [SN, [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0]], [CH, [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]]]),
      drum("Breakbeat", 4, [[K, [2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 0, 0]], [SN, [0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 2, 0, 0, 2]], [CH, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]]]),
    ],
    "Bass lines": [
      pat("Acid 303", 4, seq(0, [36, null, 36, 48, 36, null, 39, 36, 41, null, 36, 48, 36, null, 36, 34], 0.25, 0.18, 110)),
      pat("Walking", 4, seq(0, [36, 40, 43, 45, 36, 40, 43, 47], 0.5, 0.4, 96)),
      pat("Dub bass", 4, seq(0, [36, null, null, 36, null, 38, null, null], 0.5, 1.4, 108)),
    ],
    "Melodies": [
      pat("Arp riff", 4, seq(0, [72, 76, 79, 76, 74, 77, 81, 77, 72, 76, 79, 83, 81, 79, 76, 74], 0.25, 0.22, 100)),
      pat("Simple tune", 4, seq(0, [60, 62, 64, 65, 67, 65, 64, 62], 0.5, 0.45, 100)),
    ],
  };

  // ---- Standard MIDI File (.mid) loader: parse a file into the same {name,len,ev} the scheduler plays.
  // All tracks merge; ticks become beats via the header division; the first tempo sets the BPM. ----
  function parseSMF(buf) {
    const dv = new DataView(buf); let p = 0;
    const u8 = () => dv.getUint8(p++), u16 = () => { const v = dv.getUint16(p); p += 2; return v; }, u32 = () => { const v = dv.getUint32(p); p += 4; return v; };
    const tag = () => { let s = ""; for (let i = 0; i < 4; i++) s += String.fromCharCode(dv.getUint8(p++)); return s; };
    const vlq = () => { let v = 0, b; do { b = u8(); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
    if (tag() !== "MThd") throw new Error("not a MIDI file");
    u32(); u16(); const ntrks = u16(), div = u16();
    if (div & 0x8000) throw new Error("SMPTE timing not supported");
    const tpqn = div || 480;
    const ev = []; let tempo = 500000, gotTempo = false;
    for (let t = 0; t < ntrks; t++) {
      const id = tag(); const len = u32(); const end = p + len;
      if (id !== "MTrk") { p = end; continue; }
      let tick = 0, status = 0;
      while (p < end) {
        tick += vlq();
        let st = dv.getUint8(p);
        if (st < 0x80) { st = status; } else { p++; if (st < 0xf0) status = st; }
        if (st === 0xff) { const type = u8(), l = vlq(); if (type === 0x51 && l === 3 && !gotTempo) { tempo = (dv.getUint8(p) << 16) | (dv.getUint8(p + 1) << 8) | dv.getUint8(p + 2); gotTempo = true; } p += l; }
        else if (st === 0xf0 || st === 0xf7) { p += vlq(); }
        else { const hi = st & 0xf0, d1 = u8(), two = !(hi === 0xc0 || hi === 0xd0), d2 = two ? u8() : 0; ev.push([tick / tpqn, two ? [st, d1, d2] : [st, d1]]); }
      }
      p = end;
    }
    ev.sort((a, b) => a[0] - b[0]);
    const len = ev.length ? ev[ev.length - 1][0] + 1 : 1;
    const bpm = Math.max(50, Math.min(200, Math.round(60000000 / tempo)));
    return { ev, len, bpm };
  }

  // ---- scheduler ----
  let timers = [], playing = false, loop = true, bpm = 120, cur = null, statusEl = null, loadedPat = null;
  const FM = () => window.FM1;
  const allOff = () => { for (let ch = 0; ch < 16; ch++) FM()?.midi([0xb0 | ch, 123, 0]); };
  const status = (s) => { if (statusEl) statusEl.textContent = s; };

  // ---- MIDI clock / transport (24 PPQN): lets a firmware's sequencer, arp or synced LFO follow
  // the emulator's tempo. Start (0xFA) + clock pulses (0xF8) while on, Stop (0xFC) when off.
  let clockOn = false, clockTimer = null, clockRunning = false;
  function clockTick() { if (clockOn && FM() && FM().running()) FM().midi([0xf8]); }
  function startClock() {
    if (!FM() || !FM().running()) return;
    if (!clockRunning) { FM().midi([0xfa]); clockRunning = true; }
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(clockTick, 60000 / bpm / 24);
  }
  function stopClock() {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    if (clockRunning && FM()) { FM().midi([0xfc]); clockRunning = false; }
  }

  function stop() { playing = false; timers.forEach(clearTimeout); timers = []; allOff(); status(cur ? `Stopped — ${cur.name}` : ""); }
  function schedule(p) {
    const beatMs = 60000 / bpm;
    for (const [t, b] of p.ev) timers.push(setTimeout(() => { if (playing) FM().midi(b); }, t * beatMs));
    timers.push(setTimeout(() => { if (playing && loop) { timers = []; schedule(p); } else if (playing) { playing = false; allOff(); status(`Done — ${p.name}`); } }, p.len * beatMs));
  }
  function play(p) {
    stop();
    if (!FM() || !FM().running()) { status("Press Start to boot a firmware first."); return; }
    playing = true; cur = p; status(`▶ ${p.name} · ${bpm} BPM${loop ? " · loop" : ""}`); schedule(p);
  }

  // ---- UI ----
  function ready(fn) { const t = setInterval(() => { const nav = document.querySelector("header.site .wrap"); if (nav && window.FM1) { clearInterval(t); fn(nav); } }, 120); setTimeout(() => clearInterval(t), 9000); }
  ready((nav) => {
    const css = document.createElement("style"); css.textContent = `
      #midi-btn{cursor:pointer}
      #midi-pop{position:fixed;z-index:9997;width:270px;max-width:92vw;background:var(--ui-pop,#0c0d0f);border:1px solid var(--ui-line,#232428);
        border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.6);padding:12px;display:none;flex-direction:column;gap:9px;color:var(--ui-text,#e9edf2);font:13px 'Space Grotesk',-apple-system,Segoe UI,Roboto,sans-serif}
      #midi-pop.open{display:flex}
      #midi-pop h3{margin:0;font-size:13px;display:flex;align-items:center;gap:7px}
      #midi-pop h3 .dot{width:8px;height:8px;border-radius:50%;background:var(--amber);box-shadow:0 0 8px var(--amber)}
      #midi-pop select,#midi-pop input[type=range]{width:100%}
      #midi-pop select{background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text,#e9edf2);border-radius:7px;padding:6px 8px;font:inherit;font-size:12.5px}
      #midi-pop .mprow{display:flex;gap:7px;align-items:center}
      #midi-pop button{flex:1;background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text,#e9edf2);border-radius:7px;padding:8px;font:inherit;font-size:13px;cursor:pointer}
      #midi-pop button.play{background:var(--amber);color:var(--ui-on-accent,#180a02);border:0;font-weight:700}
      #midi-pop .lbl{display:flex;justify-content:space-between;font-size:11px;color:var(--ui-dim,#8c93a0)}
      #midi-pop .loopon{border-color:var(--amber);color:var(--amber-ink, var(--amber))}
      #midi-status{margin:0;font-size:11.5px;color:var(--ui-text2,#cfd4da);min-height:1em}`;
    document.head.appendChild(css);

    const btn = document.createElement("a"); btn.id = "midi-btn"; btn.href = "#";
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 16 16" style="vertical-align:-2px;margin-right:5px"><rect x="1" y="2.5" width="14" height="11" rx="1.5" fill="var(--amber)"/><rect x="4.1" y="2.5" width="1" height="7" fill="#0c0d0f"/><rect x="7.5" y="2.5" width="1" height="7" fill="#0c0d0f"/><rect x="10.9" y="2.5" width="1" height="7" fill="#0c0d0f"/></svg>MIDI`;
    (document.querySelector(".sitenav") || nav).appendChild(btn);

    const pop = document.createElement("div"); pop.id = "midi-pop";
    let opts = "";
    for (const [grp, list] of Object.entries(LIB)) { opts += `<optgroup label="${grp}">`; list.forEach((p, i) => opts += `<option value="${grp}|${i}">${p.name}</option>`); opts += `</optgroup>`; }
    pop.innerHTML = `
      <h3><span class="dot"></span> MIDI Player <span style="margin-left:auto;font-size:10.5px;color:var(--ui-dim,#8c93a0)">→ into the FM-1</span></h3>
      <select id="midi-pat">${opts}</select>
      <div class="mprow"><button class="play" id="midi-play">▶ Play</button><button id="midi-stop">■ Stop</button><button id="midi-loop" class="loopon">↻ Loop</button><button id="midi-clock" title="Send MIDI clock so the firmware's sequencer / arp follows this tempo">⏱ Clock</button></div>
      <div><div class="lbl"><span>Tempo</span><span id="midi-bpm">120 BPM</span></div><input id="midi-tempo" type="range" min="50" max="200" value="120"></div>
      <div class="mprow"><button id="midi-file">📁 Load a .mid file</button></div>
      <p id="midi-status"></p>
      <p style="margin:0;font-size:11px;color:var(--ui-dim,#8c93a0)">Plays patterns into the emulated device. Boot a firmware (Start) first.</p>`;
    document.body.appendChild(pop);
    statusEl = pop.querySelector("#midi-status");

    const sel = pop.querySelector("#midi-pat");
    const get = () => { const v = sel.value; if (v === "file" && loadedPat) return loadedPat; const [g, i] = v.split("|"); return LIB[g][+i]; };
    // .mid file: parse, add it as a selectable option, adopt its tempo, and play it
    const fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.accept = ".mid,.midi,audio/midi"; fileInput.hidden = true; pop.appendChild(fileInput);
    function loadBuffer(buf, name) {
      let pat; try { pat = parseSMF(buf); } catch (e) { status("Couldn't read that .mid — " + e.message); return; }
      if (!pat.ev.length) { status("That .mid had no notes."); return; }
      pat.name = name || "MIDI file"; loadedPat = pat;
      let og = sel.querySelector("optgroup[label='Loaded file']");
      if (!og) { og = document.createElement("optgroup"); og.label = "Loaded file"; sel.insertBefore(og, sel.firstChild); }
      og.innerHTML = ""; og.appendChild(new Option("📁 " + pat.name, "file")); sel.value = "file";
      bpm = pat.bpm; pop.querySelector("#midi-tempo").value = bpm; pop.querySelector("#midi-bpm").textContent = bpm + " BPM";
      play(loadedPat);
    }
    pop.querySelector("#midi-file").onclick = () => fileInput.click();
    fileInput.onchange = async () => { const f = fileInput.files[0]; if (!f) return; try { loadBuffer(await f.arrayBuffer(), f.name.replace(/\.midi?$/i, "")); } catch { status("Couldn't read that file."); } fileInput.value = ""; };
    window.FM1MidiPlayer = { parseSMF, loadBuffer };
    const place = () => { const r = btn.getBoundingClientRect(); pop.style.top = (r.bottom + 6) + "px"; pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 282)) + "px"; };
    btn.onclick = (e) => { e.preventDefault(); pop.classList.toggle("open"); if (pop.classList.contains("open")) place(); };
    window.addEventListener("resize", () => { if (pop.classList.contains("open")) place(); });
    document.addEventListener("click", (e) => { if (e.target !== btn && !pop.contains(e.target)) pop.classList.remove("open"); });

    pop.querySelector("#midi-play").onclick = () => play(get());
    pop.querySelector("#midi-stop").onclick = stop;
    const loopBtn = pop.querySelector("#midi-loop");
    loopBtn.onclick = () => { loop = !loop; loopBtn.classList.toggle("loopon", loop); };
    const clockBtn = pop.querySelector("#midi-clock");
    clockBtn.onclick = () => {
      // Prefer global transport clock when present (one 0xF8 stream).
      if (window.FM1Transport) {
        const next = !window.FM1Transport.clockOn();
        const ok = window.FM1Transport.setClock(next);
        clockOn = window.FM1Transport.clockOn();
        clockBtn.classList.toggle("loopon", clockOn);
        if (!ok && next) status("Press Start to boot a firmware first.");
        else status(clockOn ? `⏱ Clock running · ${bpm} BPM` : "Clock stopped.");
        return;
      }
      clockOn = !clockOn; clockBtn.classList.toggle("loopon", clockOn);
      if (clockOn) { if (!FM() || !FM().running()) { clockOn = false; clockBtn.classList.remove("loopon"); status("Press Start to boot a firmware first."); return; } startClock(); status(`⏱ Clock running · ${bpm} BPM`); }
      else { stopClock(); status("Clock stopped."); }
    };
    pop.querySelector("#midi-tempo").oninput = (e) => {
      bpm = +e.target.value; pop.querySelector("#midi-bpm").textContent = bpm + " BPM";
      if (window.FM1Transport) window.FM1Transport.setBpm(bpm);
      if (clockOn) startClock();
    };
    pop.querySelector("#midi-pat").onchange = () => { if (playing) play(get()); };

    if (window.FM1Transport) {
      bpm = window.FM1Transport.getBpm();
      pop.querySelector("#midi-tempo").value = bpm;
      pop.querySelector("#midi-bpm").textContent = bpm + " BPM";
      clockOn = window.FM1Transport.clockOn();
      clockBtn.classList.toggle("loopon", clockOn);
      window.FM1Transport.on((type, d) => {
        if (type === "bpm") {
          bpm = d.bpm;
          pop.querySelector("#midi-tempo").value = bpm;
          pop.querySelector("#midi-bpm").textContent = bpm + " BPM";
          if (clockOn && !window.FM1Transport) startClock();
        }
        if (type === "clock") {
          clockOn = d.clockOn;
          clockBtn.classList.toggle("loopon", clockOn);
          // Global transport owns the timer; only stop local leftover.
          if (!clockOn) stopClock();
        }
      });
    }
  });
})();
