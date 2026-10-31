// Playable keyboard input for the FM-1 emulator: an on-screen piano you click/tap (mouse drag or
// multi-touch for chords), with the musical assists a hardware synth ships with — scale lock,
// chord mode and an arpeggiator with latch. Notes go into the emulated device through the same
// window.FM1.midi path the pattern player uses (works after Start). Pure DOM; its own little panel.
(function () {
  "use strict";
  const FM = () => window.FM1;

  // ---- music theory ----
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  // scale -> pitch classes from the root (null = no lock: every key plays, nothing dimmed)
  const SCALES = {
    "Off": null,
    "Major": [0, 2, 4, 5, 7, 9, 11],
    "Minor": [0, 2, 3, 5, 7, 8, 10],
    "Dorian": [0, 2, 3, 5, 7, 9, 10],
    "Phrygian": [0, 1, 3, 5, 7, 8, 10],
    "Lydian": [0, 2, 4, 6, 7, 9, 11],
    "Mixolydian": [0, 2, 4, 5, 7, 9, 10],
    "Harmonic min": [0, 2, 3, 5, 7, 8, 11],
    "Major pent": [0, 2, 4, 7, 9],
    "Minor pent": [0, 3, 5, 7, 10],
    "Blues": [0, 3, 5, 6, 7, 10],
    "Chromatic": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  };
  // chord built on each played key (intervals from the key); "Off" = just the note
  const CHORDS = {
    "Off": [0], "5th": [0, 7], "Octave": [0, 12],
    "maj": [0, 4, 7], "min": [0, 3, 7], "maj7": [0, 4, 7, 11], "min7": [0, 3, 7, 10],
    "dom7": [0, 4, 7, 10], "sus2": [0, 2, 7], "sus4": [0, 5, 7],
    "dim": [0, 3, 6], "aug": [0, 4, 8], "add9": [0, 4, 7, 14],
    "Diatonic": [0], "Diat 7th": [0],   // built from the selected scale, not fixed intervals
  };
  const ARP_MODES = ["Off", "Up", "Down", "Up/Down", "Order", "Random"];
  // rate label -> multiple of a beat
  const RATES = { "1/4": 1, "1/8": 0.5, "1/8T": 1 / 3, "1/16": 0.25, "1/16T": 1 / 6, "1/32": 0.125 };

  const clampNote = (n) => Math.max(0, Math.min(127, n));

  // ---- presets: a named snapshot of the whole assist rig (recalled in one click) ----
  // built-in starter vibes; any field left out resets to its default on recall, so each is a full patch
  const BUILTIN = {
    "Clean": {},
    "Lo-fi chords": { scaleName: "Minor", scaleRoot: 9, chordName: "Diat 7th", inversion: 1, strumMs: 18, strumDir: "up", humanize: 22, vel: 86, touchVel: true },
    "Trance pluck": { scaleName: "Minor", scaleRoot: 0, chordName: "min", arpMode: "Up", curRate: "1/16", arpOcts: 2, bpm: 138, gate: 0.4, humanize: 8 },
    "Dream harp": { scaleName: "Major pent", scaleRoot: 7, chordName: "add9", arpMode: "Up/Down", curRate: "1/8", arpOcts: 3, bpm: 92, gate: 0.82, swing: 14, humanize: 14 },
    "Big strum": { scaleName: "Major", scaleRoot: 0, chordName: "Diatonic", strumMs: 55, strumDir: "alt", humanize: 18, touchVel: true },
  };

  // ---- state ----
  let base = 48;                 // left-most key (C3); octave buttons shift by 12
  let vel = 100, gate = 0.6, bpm = 120, swing = 0, inversion = 0, humanize = 0;
  let strumMs = 0, strumDir = "up", strumFlip = false, touchVel = false, velCurve = "linear";
  let hold = false; const sustainOff = []; let holdBtn = null;   // sustain pedal: deferred note-offs
  let padsOn = false, padRoots = [];                             // scale-degree chord pads
  // progression sequencer: a list of degree roots clocked at the tempo, played through the engine
  let progRec = false, prog = [], progTimer = null, progIdx = 0, progBeats = 4, progCurRoot = null;
  let progPlayBtn = null, progRecBtn = null, progView = null;
  let scaleName = "Off", scaleRoot = 0, chordName = "Off", arpMode = "Off", arpOcts = 1;
  let scaleSet = () => SCALES[scaleName];
  const chordIv = () => CHORDS[chordName];

  const activeKeys = new Map();  // note(root) -> [sounding notes]   (arp off, momentary)
  const latched = new Map();     // note(root) -> [sounding notes]   (arp off, latched)
  const roots = new Set();       // arp on: the held/latched root notes feeding the sequence
  const sounding = new Map();    // midi note -> refcount, so overlapping voices don't cut early
  let latch = false;

  // computer keyboard -> these assists (opt-in). Same letter row the panel uses, but the notes run
  // through scale/chord/arp and go out as MIDI. Offsets are semitones above the keyboard's low key.
  let pcRoute = false, hwProc = false; const pcDown = new Map();
  const PIANO_MAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ";": 16, "'": 17 };

  function sendRaw(b) { const F = FM(); if (F && F.midi && (!F.running || F.running())) F.midi(b); }
  // velocity curve: reshape the incoming velocity — soft eases up quiet, hard favours loud, fixed ignores
  // the input dynamics and plays the slider value; then humanize adds a little life on top.
  function curveVel(v) {
    if (velCurve === "fixed") return vel;
    const t = Math.max(0, Math.min(1, v / 127));
    const y = velCurve === "soft" ? Math.pow(t, 0.6) : velCurve === "hard" ? Math.pow(t, 1.7) : t;
    return Math.max(1, Math.min(127, Math.round(y * 127)));
  }
  // humanize: nudge each note's velocity by a random amount so repeated/chorded notes don't sound robotic
  function hvel(v) { if (!humanize) return v; const d = (Math.random() * 2 - 1) * (humanize / 100) * 45; return Math.max(1, Math.min(127, Math.round(v + d))); }
  const outVel = (v) => hvel(curveVel(v));
  function on(n, v) { n = clampNote(n); const c = sounding.get(n) || 0; if (c === 0) sendRaw([0x90, n, outVel(v)]); sounding.set(n, c + 1); }
  function off(n) { n = clampNote(n); const c = sounding.get(n) || 0; if (c <= 0) return; if (c === 1) { sendRaw([0x80, n, 0]); sounding.delete(n); } else sounding.set(n, c - 1); }

  function snap(n) {
    const s = scaleSet(); if (!s) return n;
    const pc = ((n - scaleRoot) % 12 + 12) % 12;
    if (s.includes(pc)) return n;
    for (let d = 1; d < 12; d++) { if (s.includes((pc + d) % 12)) return n + d; if (s.includes((pc - d + 12) % 12)) return n - d; }
    return n;
  }
  // a chord built by stacking thirds within the active scale (so each key gives the right diatonic
  // triad / 7th). Falls back to a plain major shape when no scale is set.
  function diatonicChord(root, count) {
    const s = scaleSet();
    if (!s) return [0, 4, 7, 11].slice(0, count).map((iv) => clampNote(root + iv));
    const sorted = [...s].sort((a, b) => a - b), len = sorted.length;
    const pc = ((root - scaleRoot) % 12 + 12) % 12;
    let idx = sorted.indexOf(pc); if (idx < 0) idx = 0;
    const anchor = root - pc;   // the scale root's pitch, in this octave
    const out = [];
    for (let k = 0; k < count; k++) { const deg = idx + k * 2; out.push(clampNote(anchor + sorted[deg % len] + 12 * Math.floor(deg / len))); }
    return out;
  }
  // invert a chord: raise the lowest note an octave, n times, so the voicing climbs while the chord stays
  function applyInversion(notes) {
    if (!inversion || notes.length < 2) return notes;
    const out = notes.slice().sort((a, b) => a - b);
    for (let k = 0; k < inversion; k++) { out.sort((a, b) => a - b); out[0] = clampNote(out[0] + 12); }
    return out.sort((a, b) => a - b);
  }
  function chordNotes(root) {
    let ns;
    if (chordName === "Diatonic") ns = diatonicChord(root, 3);
    else if (chordName === "Diat 7th") ns = diatonicChord(root, 4);
    else ns = chordIv().map((iv) => clampNote(root + iv));
    return applyInversion(ns);
  }

  // ---- strum: spread a chord's note-ons over time instead of hitting them together ----
  const strumTimers = new Map();   // root -> pending setTimeout ids (so a quick release can cancel them)
  function clearStrum(root) { const t = strumTimers.get(root); if (t) { t.forEach(clearTimeout); strumTimers.delete(root); } }
  function strumOrder(ns) {
    const arr = ns.slice().sort((a, b) => a - b);
    let dir = strumDir;
    if (dir === "alt") { dir = strumFlip ? "down" : "up"; strumFlip = !strumFlip; }
    if (dir === "down") arr.reverse();
    return arr;
  }
  function chordOn(root, ns, v) {
    clearStrum(root);
    if (strumMs > 0 && ns.length > 1) {
      const ids = []; strumOrder(ns).forEach((n, i) => ids.push(setTimeout(() => on(n, v), i * strumMs)));
      strumTimers.set(root, ids);
    } else ns.forEach((n) => on(n, v));
  }
  // with the sustain pedal down, a released key's notes keep ringing; their offs wait until it lifts.
  // Deferring the exact off() calls (one per on) keeps the refcount balanced through retriggers.
  function chordOff(root, ns) { clearStrum(root); if (hold) ns.forEach((n) => sustainOff.push(clampNote(n))); else ns.forEach(off); }
  function setHold(on) {
    if (on === hold) return; hold = on;
    if (holdBtn) holdBtn.classList.toggle("on", hold);
    if (!hold) { const q = sustainOff.splice(0); q.forEach(off); }   // pedal up: release everything it held
  }

  // ---- arpeggiator ----
  let arpTimer = null, arpIdx = 0, arpStep = 0;
  const stepMs = () => (60000 / bpm) * (RATES[curRate] || 0.5);
  // swing: lengthen the on-beat step and shorten the off-beat one, so pairs play long-short
  const swungMs = () => { const b = stepMs(), f = swing / 100; return (arpStep % 2 === 0) ? b * (1 + f) : b * (1 - f); };
  let curRate = "1/8";
  function buildSeq() {
    const rts = (arpMode === "Order") ? [...roots] : [...roots].sort((a, b) => a - b);   // Order = as played
    let notes = [];
    for (let o = 0; o < arpOcts; o++) for (const r of rts) for (const n of chordNotes(r)) notes.push(clampNote(n + 12 * o));
    if (arpMode !== "Order") notes = [...new Set(notes)].sort((a, b) => a - b);
    if (arpMode === "Down") notes.reverse();
    else if (arpMode === "Up/Down" && notes.length > 2) notes = notes.concat(notes.slice(1, -1).reverse());
    return notes;
  }
  function arpTick() {
    const dur = swungMs();
    arpTimer = setTimeout(arpTick, dur);
    arpStep++;
    const seq = buildSeq(); if (!seq.length) return;
    let n;
    if (arpMode === "Random") n = seq[(Math.random() * seq.length) | 0];
    else { if (arpIdx >= seq.length) arpIdx = 0; n = seq[arpIdx++]; }
    sendRaw([0x90, n, outVel(vel)]);
    setTimeout(() => sendRaw([0x80, n, 0]), Math.max(20, dur * gate));
  }
  function startArp() { stopArp(); if (arpMode === "Off") return; arpIdx = 0; arpStep = 0; arpTimer = setTimeout(arpTick, 0); }
  function stopArp() { if (arpTimer) { clearTimeout(arpTimer); arpTimer = null; } }

  // release every momentary + latched key — silence whatever is being held. Used on a mode/patch change
  // that would otherwise orphan the sounding notes, and on window blur when a key-up went missing.
  // Clears strum timers too, so a pending strum can't fire a note-on after the keys are gone.
  function releaseHeld() {
    for (const [root, ns] of activeKeys) { clearStrum(root); ns.forEach(off); }
    activeKeys.clear();
    for (const [root, ns] of latched) { clearStrum(root); ns.forEach(off); }
    latched.clear();
  }

  // ---- play a key (v: optional velocity, e.g. from a hardware key; defaults to the slider) ----
  function play(root, down, v) {
    v = v == null ? vel : v;
    root = snap(root);
    if (arpMode !== "Off") {
      if (down) { if (latch) { roots.has(root) ? roots.delete(root) : roots.add(root); } else roots.add(root); }
      else if (!latch) roots.delete(root);
    } else if (down) {
      if (latch) {
        if (latched.has(root)) { chordOff(root, latched.get(root)); latched.delete(root); }
        else { const ns = chordNotes(root); chordOn(root, ns, v); latched.set(root, ns); }
      } else { const ns = chordNotes(root); chordOn(root, ns, v); activeKeys.set(root, ns); }
    } else {
      const ns = activeKeys.get(root); if (ns) { chordOff(root, ns); activeKeys.delete(root); }
    }
    lights();
  }
  // run incoming hardware MIDI through the assists: notes become scale/chord/arp output, everything
  // else (CC, pitch bend, program) passes through untouched. Returns true when a note is consumed.
  function hwProcessor(bytes) {
    const st = bytes[0] & 0xf0;
    if (st === 0x90 && bytes[2] > 0) { play(bytes[1], true, bytes[2]); return true; }
    if (st === 0x80 || (st === 0x90 && bytes[2] === 0)) { play(bytes[1], false); return true; }
    return false;
  }
  function panic() {
    clearProgTimer(); progCurRoot = null; if (progPlayBtn) { progPlayBtn.textContent = "▶"; progPlayBtn.classList.remove("on"); }
    for (const t of strumTimers.values()) t.forEach(clearTimeout); strumTimers.clear();
    sustainOff.length = 0;
    for (const n of [...sounding.keys()]) sendRaw([0x80, n, 0]);
    sounding.clear(); activeKeys.clear(); latched.clear(); roots.clear();
    for (let ch = 0; ch < 16; ch++) sendRaw([0xb0 | ch, 123, 0]);
    lights();
  }

  // ---- chord / scale readout: name what the harmony engine is actually producing ----
  const CH_SUFFIX = { "Off": "", "5th": "5", "Octave": " oct", "maj": "", "min": "m", "maj7": "maj7", "min7": "m7", "dom7": "7", "sus2": "sus2", "sus4": "sus4", "dim": "dim", "aug": "aug", "add9": "add9" };
  // name a chord from its interval set (triad quality + optional 7th) — reproduces standard theory names
  function qualityName(notes) {
    const root = Math.min(...notes), iv = [...new Set(notes.map((n) => ((n - root) % 12 + 12) % 12))], h = (x) => iv.includes(x);
    let s = h(4) && h(8) ? "aug" : h(4) ? "" : (h(3) && h(6)) ? "dim" : h(3) ? "m" : "";
    if (h(11)) s = s === "" ? "maj7" : s === "m" ? "m(maj7)" : s + "maj7";
    else if (h(10)) s = s === "" ? "7" : s === "m" ? "m7" : s === "dim" ? "m7b5" : s + "7";
    else if (h(9) && s === "dim") s = "dim7";
    return s;
  }
  function romanDegree(root) {
    const sc = scaleSet(); if (!sc) return "";
    const sorted = [...sc].sort((a, b) => a - b), pc = ((root - scaleRoot) % 12 + 12) % 12, idx = sorted.indexOf(pc);
    if (idx < 0) return "";
    const q = qualityName(diatonicChord(root, chordName === "Diat 7th" ? 4 : 3));
    const minorish = (q.startsWith("m") && !q.startsWith("maj")) || q.startsWith("dim");
    let r = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"][idx] || String(idx + 1);
    if (!minorish) r = r.toUpperCase();
    if (q.startsWith("dim") || q.includes("b5")) r += "°"; else if (q === "aug") r += "+";
    if (/7/.test(q)) r += "7";
    return " (" + r + ")";
  }
  function chordLabel(root) {
    const rn = NOTE_NAMES[((root % 12) + 12) % 12];
    let name;
    if (chordName === "Diatonic" || chordName === "Diat 7th") {
      name = rn + qualityName(diatonicChord(root, chordName === "Diat 7th" ? 4 : 3)) + romanDegree(root);
    } else name = rn + (CH_SUFFIX[chordName] ?? "");
    const voiced = chordNotes(root), bass = Math.min(...voiced);         // slash chord when inverted
    if (voiced.length > 1 && (((bass % 12) + 12) % 12) !== (((root % 12) + 12) % 12)) name += "/" + NOTE_NAMES[((bass % 12) + 12) % 12];
    return name;
  }
  let nowEl = null;
  function updateReadout() {
    if (!nowEl) return;
    const held = arpMode !== "Off" ? [...roots] : [...new Set([...activeKeys.keys(), ...latched.keys()])];
    const scaleTxt = scaleSet() ? NOTE_NAMES[scaleRoot] + " " + scaleName : "";
    if (held.length) { const names = held.sort((a, b) => a - b).map(chordLabel).join("   "); nowEl.textContent = scaleTxt ? names + "   ·   " + scaleTxt : names; }
    else nowEl.textContent = scaleTxt ? scaleTxt : "—";
  }

  // ---- progression sequencer ----
  const degLabel = (r) => romanDegree(r).replace(/[()]/g, "").trim() || NOTE_NAMES[((r % 12) + 12) % 12];
  function updateProgView(active) {
    if (!progView) return;
    if (!prog.length) { progView.innerHTML = '<span style="opacity:.6">arm ●, then tap pads to build a progression</span>'; return; }
    progView.innerHTML = prog.map((r, i) => `<span style="${i === active ? "color:var(--amber);font-weight:700" : ""}">${degLabel(r)}</span>`).join('<span style="opacity:.4"> – </span>');
  }
  function progAppend(root) { if (!progRec) return; prog.push(root); updateProgView(-1); }
  const clearProgTimer = () => { if (progTimer) { clearTimeout(progTimer); progTimer = null; } };
  const progPlaying = () => progTimer != null;
  function progStep() {
    if (progCurRoot != null) { play(progCurRoot, false); progCurRoot = null; }
    if (!prog.length) { progStop(); return; }
    if (progIdx >= prog.length) progIdx = 0;
    const r = prog[progIdx]; play(r, true); progCurRoot = r; updateProgView(progIdx);
    progIdx++;
    progTimer = setTimeout(progStep, (60000 / bpm) * progBeats);
  }
  function progStart() {
    if (!prog.length) return; clearProgTimer(); progIdx = 0;
    if (progPlayBtn) { progPlayBtn.textContent = "⏹"; progPlayBtn.classList.add("on"); }
    progStep();
  }
  function progStop() {
    clearProgTimer();
    if (progCurRoot != null) { play(progCurRoot, false); progCurRoot = null; }
    if (progPlayBtn) { progPlayBtn.textContent = "▶"; progPlayBtn.classList.remove("on"); }
    updateProgView(-1);
  }
  function progClear() { if (progPlaying()) progStop(); prog = []; updateProgView(-1); }
  // render the progression as a Standard MIDI File (format 0): each step is a chord of progBeats beats,
  // voiced through the current chord mode/inversion, at the current tempo.
  function writeProgSMF() {
    const TPQN = 480, dur = Math.round(progBeats * TPQN), vlq = (v) => { const b = [v & 0x7f]; v = Math.floor(v / 128); while (v > 0) { b.unshift((v & 0x7f) | 0x80); v = Math.floor(v / 128); } return b; };
    const evts = []; let t = 0;
    for (const root of prog) { for (const n of chordNotes(root)) { evts.push({ tick: t, on: true, n }); evts.push({ tick: t + dur, on: false, n }); } t += dur; }
    evts.sort((a, b) => a.tick - b.tick || (a.on ? 1 : 0) - (b.on ? 1 : 0));   // offs before ons at a shared tick
    const body = [], us = Math.round(60000000 / bpm);
    body.push(...vlq(0), 0xff, 0x51, 0x03, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff);
    let last = 0;
    for (const e of evts) { body.push(...vlq(e.tick - last)); last = e.tick; body.push(e.on ? 0x90 : 0x80, clampNote(e.n), e.on ? 90 : 0); }
    body.push(...vlq(0), 0xff, 0x2f, 0x00);
    const L = body.length, hdr = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (TPQN >> 8) & 0xff, TPQN & 0xff];
    const trk = [0x4d, 0x54, 0x72, 0x6b, (L >> 24) & 0xff, (L >> 16) & 0xff, (L >> 8) & 0xff, L & 0xff];
    return new Uint8Array([...hdr, ...trk, ...body]);
  }

  // ---- keyboard build / lights ----
  const WHITE = new Set([0, 2, 4, 5, 7, 9, 11]);
  let noteToEl = new Map(), kb = null, octLab = null;
  function buildKeyboard() {
    kb = document.createElement("div"); kb.className = "kb";
    const SEMIS = 24;                        // two octaves
    const whiteW = 100 / 14;                 // 14 white keys across
    let whiteCount = 0;
    const blacks = [];
    for (let i = 0; i < SEMIS; i++) {
      if (WHITE.has(i % 12)) {
        const w = document.createElement("div"); w.className = "wk"; w.dataset.off = i; w.style.left = (whiteCount * whiteW) + "%"; w.style.width = whiteW + "%";
        w.innerHTML = '<span class="lab"></span>'; kb.appendChild(w); whiteCount++;
      } else {
        blacks.push(i);
      }
    }
    for (const i of blacks) {
      const b = document.createElement("div"); b.className = "bk"; b.dataset.off = i;
      // sit the black key centred on the gap before the next white
      let whitesBefore = 0; for (let j = 0; j < i; j++) if (WHITE.has(j % 12)) whitesBefore++;
      b.style.width = (whiteW * 0.62) + "%";
      b.style.left = (whitesBefore * whiteW - whiteW * 0.31) + "%";
      b.innerHTML = '<span class="lab"></span>'; kb.appendChild(b);
    }
    rebuildNotes();
    wireKeyboard();
    return kb;
  }
  function rebuildNotes() {
    noteToEl = new Map();
    for (const el of kb.querySelectorAll(".wk,.bk")) {
      const n = base + (+el.dataset.off); el.dataset.note = n; noteToEl.set(n, el);
      const lab = el.querySelector(".lab");
      if (lab) lab.textContent = el.classList.contains("wk") ? NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1) : NOTE_NAMES[n % 12];
    }
    if (octLab) { const o = Math.floor(base / 12) - 1; octLab.textContent = NOTE_NAMES[base % 12] + o; }
    lights();
  }
  function lights() {
    const active = arpMode !== "Off" ? roots : new Set([...activeKeys.keys(), ...latched.keys()]);
    const s = scaleSet();
    for (const [note, el] of noteToEl) {
      el.classList.toggle("off", !!s && !s.includes(((note - scaleRoot) % 12 + 12) % 12));
      el.classList.toggle("act", active.has(snap(note)));
    }
    updateReadout();
  }
  const keyEl = (el) => (el && el.closest && el.closest(".wk,.bk")) || null;
  const keyNote = (el) => { const k = keyEl(el); return k ? +k.dataset.note : null; };
  // touch-sensitive keys: velocity from where on the key you land — bottom = hard, top = soft
  function posVel(el, clientY) {
    if (!touchVel || !el) return undefined;
    const r = el.getBoundingClientRect(); if (!r.height) return undefined;
    const t = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    return Math.max(8, Math.min(127, Math.round(20 + t * 107)));
  }
  function wireKeyboard() {
    const pdown = new Map();
    kb.addEventListener("pointerdown", (e) => { e.preventDefault(); const el = keyEl(e.target); const n = keyNote(el); if (n == null) return; pdown.set(e.pointerId, n); play(n, true, posVel(el, e.clientY)); });
    kb.addEventListener("pointermove", (e) => {
      if (!pdown.has(e.pointerId)) return;
      const el = keyEl(document.elementFromPoint(e.clientX, e.clientY)); const n = keyNote(el); const prev = pdown.get(e.pointerId);
      if (n != null && n !== prev) { play(prev, false); play(n, true, posVel(el, e.clientY)); pdown.set(e.pointerId, n); }
    });
    const up = (e) => { if (pdown.has(e.pointerId)) { play(pdown.get(e.pointerId), false); pdown.delete(e.pointerId); } };
    kb.addEventListener("pointerup", up); kb.addEventListener("pointercancel", up); window.addEventListener("pointerup", up);
  }

  // ---- UI ----
  function ready(fn) { const t = setInterval(() => { const nav = document.querySelector("header.site .wrap"); if (nav && window.FM1) { clearInterval(t); fn(nav); } }, 120); setTimeout(() => clearInterval(t), 9000); }
  ready((nav) => {
    const css = document.createElement("style"); css.textContent = `
      #keys-btn{cursor:pointer}
      #keys-pop{position:fixed;z-index:9997;width:316px;max-width:94vw;max-height:88vh;overflow:auto;background:#0c0d0f;border:1px solid #232428;
        border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.6);padding:12px;display:none;flex-direction:column;gap:8px;color:#e9edf2;font:13px 'Space Grotesk',-apple-system,Segoe UI,Roboto,sans-serif}
      #keys-pop.open{display:flex}
      #keys-pop h3{margin:0;font-size:13px;display:flex;align-items:center;gap:7px}
      #keys-pop h3 .dot{width:8px;height:8px;border-radius:50%;background:var(--amber);box-shadow:0 0 8px var(--amber)}
      #keys-pop select{background:#17181b;border:1px solid #2a2c31;color:#e9edf2;border-radius:7px;padding:5px 7px;font:inherit;font-size:12px;flex:1;min-width:0}
      #keys-pop input[type=range]{flex:1;min-width:0}
      #keys-pop .krow{display:flex;gap:6px;align-items:center}
      #keys-pop .krow>.cap{font-size:11px;color:#8c93a0;flex:0 0 42px}
      #keys-pop button{background:#17181b;border:1px solid #2a2c31;color:#e9edf2;border-radius:7px;padding:6px 9px;font:inherit;font-size:12.5px;cursor:pointer}
      #keys-pop .ob{flex:0 0 30px;font-weight:700}
      #keys-pop .on{border-color:var(--amber);color:var(--amber)}
      #keys-pop .lbl{display:flex;justify-content:space-between;font-size:11px;color:#8c93a0;margin-bottom:2px}
      #keys-status{margin:0;font-size:11px;color:#8c93a0;min-height:1em}
      .kb{position:relative;height:88px;border-radius:6px;overflow:hidden;background:#000;touch-action:none;user-select:none;box-shadow:inset 0 2px 6px rgba(0,0,0,.6)}
      .kb .wk{position:absolute;top:0;height:100%;background:linear-gradient(#f4f1ea,#d7d2c6);border-right:1px solid #1a1a1a;box-sizing:border-box}
      .kb .wk.off{opacity:.38}
      .kb .wk.act{background:linear-gradient(var(--amber),#b23c00)}
      .kb .bk{position:absolute;top:0;height:58%;background:linear-gradient(#333,#090909);border:1px solid #000;border-radius:0 0 3px 3px;z-index:2;box-shadow:0 2px 3px rgba(0,0,0,.6)}
      .kb .bk.off{opacity:.4}
      .kb .bk.act{background:linear-gradient(var(--amber),#8a2d00)}
      .kb .lab{position:absolute;left:0;right:0;text-align:center;pointer-events:none;font-weight:700;letter-spacing:-.3px}
      .kb .wk .lab{bottom:4px;font-size:8.5px;color:#6b665b}
      .kb .wk.act .lab{color:#2a0f00}
      .kb .bk .lab{bottom:3px;font-size:7px;color:#b9b9b9}
      .kb .bk.act .lab{color:#2a0f00}
      .kb.nolabels .lab{display:none}
      #keys-pop .padrow{display:flex;flex-wrap:wrap;gap:4px}
      #keys-pop .pad{flex:1 1 auto;min-width:32px;background:#17181b;border:1px solid #2a2c31;color:#e9edf2;border-radius:6px;padding:5px 3px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;text-align:center;line-height:1.15;touch-action:none;user-select:none}
      #keys-pop .pad .rom{display:block;font-size:9px;font-weight:400;color:#8c93a0}
      #keys-pop .pad.act{border-color:var(--amber);color:var(--amber)}
      #keys-pop .pad.act .rom{color:var(--amber)}`;
    document.head.appendChild(css);

    const btn = document.createElement("a"); btn.id = "keys-btn"; btn.href = "#";
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 16 16" style="vertical-align:-2px;margin-right:5px"><rect x="1" y="2.5" width="14" height="11" rx="1.5" fill="var(--amber)"/><g fill="#0c0d0f"><rect x="3.4" y="2.5" width="1.3" height="6.5"/><rect x="6.2" y="2.5" width="1.3" height="6.5"/><rect x="9" y="2.5" width="1.3" height="6.5"/><rect x="11.8" y="2.5" width="1.3" height="6.5"/></g></svg>Keys`;
    (document.querySelector(".sitenav") || nav).appendChild(btn);

    const pop = document.createElement("div"); pop.id = "keys-pop";
    const scaleOpts = Object.keys(SCALES).map((n) => `<option>${n}</option>`).join("");
    const rootOpts = NOTE_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join("");
    const chordOpts = Object.keys(CHORDS).map((n) => `<option>${n}</option>`).join("");
    const arpOpts = ARP_MODES.map((n) => `<option>${n}</option>`).join("");
    const rateOpts = Object.keys(RATES).map((n) => `<option${n === "1/8" ? " selected" : ""}>${n}</option>`).join("");
    pop.innerHTML = `
      <h3><span class="dot"></span> Keys <span style="margin-left:auto;font-size:10.5px;color:#8c93a0">→ into the FM-1</span></h3>
      <div class="kbslot"></div>
      <div id="k-now" style="min-height:1.3em;font-size:12.5px;font-weight:700;color:#cdd3db;text-align:center;letter-spacing:.3px">—</div>
      <div class="krow"><button class="ob" id="k-octdn">−</button><span class="cap" style="flex:0 0 auto;text-align:center;min-width:34px" id="k-oct">C3</span><button class="ob" id="k-octup">+</button>
        <button id="k-latch" style="flex:1">Latch</button><button id="k-panic" style="flex:1">Panic</button></div>
      <div class="krow"><button id="k-pcroute" style="flex:1">⌨ Play with computer keys</button></div>
      <div class="krow"><button id="k-hw" style="flex:1">🎛 Assist hardware MIDI</button><button id="k-labels" style="flex:0 0 auto">🏷 Labels</button></div>
      <div class="krow"><button id="k-touchvel" style="flex:1">👆 Touch-sensitive keys</button></div>
      <div class="krow"><span class="cap">Scale</span><select id="k-root">${rootOpts}</select><select id="k-scale">${scaleOpts}</select></div>
      <div class="krow"><span class="cap">Chord</span><select id="k-chord">${chordOpts}</select>
        <select id="k-inv" title="Chord inversion"><option value="0">root</option><option value="1">1st inv</option><option value="2">2nd inv</option><option value="3">3rd inv</option></select></div>
      <div class="krow"><span class="cap">Strum</span>
        <select id="k-strumdir" title="Strum direction"><option value="up">↑ up</option><option value="down">↓ down</option><option value="alt">↕ alt</option></select>
        <input id="k-strum" type="range" min="0" max="120" value="0" title="Strum spread (ms per note)">
        <span id="k-strum-l" style="flex:0 0 32px;text-align:right;font-size:11px;color:#8c93a0">off</span></div>
      <div class="krow"><span class="cap">Arp</span><select id="k-arp">${arpOpts}</select><select id="k-rate">${rateOpts}</select>
        <select id="k-octs" title="Arp octave range"><option value="1">×1</option><option value="2">×2</option><option value="3">×3</option></select></div>
      <div class="krow"><button id="k-pads" style="flex:1">▦ Scale-degree chord pads</button></div>
      <div id="k-padwrap" class="padrow" style="display:none"></div>
      <div class="krow" id="k-progrow" style="display:none"><span class="cap" style="flex:0 0 auto">Prog</span>
        <button id="k-prog-rec" title="Arm: tap pads to record a progression" style="flex:1">● Rec</button>
        <button id="k-prog-play" title="Play / stop" style="flex:0 0 auto">▶</button>
        <button id="k-prog-clear" title="Clear the progression" style="flex:0 0 auto">⟲</button>
        <button id="k-prog-mid" title="Export the progression as a .mid file" style="flex:0 0 auto">⤓</button>
        <select id="k-prog-len" title="Chord length"><option value="2">½ bar</option><option value="4" selected>1 bar</option><option value="8">2 bars</option><option value="1">1 beat</option></select></div>
      <div id="k-progview" style="display:none;font-size:11px;color:#8c93a0;min-height:1.1em;text-align:center"></div>
      <div><div class="lbl"><span>Velocity</span><span id="k-vel-l">100</span></div><input id="k-vel" type="range" min="1" max="127" value="100" style="width:100%"></div>
      <div class="krow"><span class="cap">Vel curve</span>
        <select id="k-curve" title="How key velocity maps to output"><option value="linear">Linear</option><option value="soft">Soft</option><option value="hard">Hard</option><option value="fixed">Fixed</option></select>
        <button id="k-hold" style="flex:1" title="Sustain — hold Space as a pedal">🦶 Hold</button></div>
      <div><div class="lbl"><span>Arp gate</span><span id="k-gate-l">60%</span></div><input id="k-gate" type="range" min="10" max="100" value="60" style="width:100%"></div>
      <div><div class="lbl"><span>Arp swing</span><span id="k-swing-l">0%</span></div><input id="k-swing" type="range" min="0" max="60" value="0" style="width:100%"></div>
      <div><div class="lbl"><span>Humanize</span><span id="k-human-l">0%</span></div><input id="k-human" type="range" min="0" max="100" value="0" style="width:100%"></div>
      <div><div class="lbl"><span>Tempo</span><span id="k-bpm-l">120 BPM</span></div><input id="k-bpm" type="range" min="40" max="240" value="120" style="width:100%"></div>
      <div class="krow" style="margin-top:2px"><span class="cap">Preset</span><select id="k-preset"></select>
        <button id="k-presave" title="Save current settings as a preset">💾</button>
        <button id="k-predel" title="Delete the selected saved preset">🗑</button></div>
      <div class="krow" id="k-savewrap" style="display:none"><input id="k-savename" placeholder="name this preset" maxlength="24" style="flex:1;min-width:0;background:#17181b;border:1px solid #2a2c31;color:#e9edf2;border-radius:7px;padding:5px 7px;font:inherit;font-size:12px"><button id="k-saveok" class="on">Save</button><button id="k-savecancel">✕</button></div>
      <p id="keys-status">Click or tap the keys. Boot a firmware (Start) first.</p>`;
    document.body.appendChild(pop);
    octLab = pop.querySelector("#k-oct");
    nowEl = pop.querySelector("#k-now");
    pop.querySelector(".kbslot").appendChild(buildKeyboard());
    updateReadout();
    const status = (s) => { pop.querySelector("#keys-status").textContent = s; };

    const place = () => { const r = btn.getBoundingClientRect(); pop.style.top = (r.bottom + 6) + "px"; pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 328)) + "px"; };
    btn.onclick = (e) => { e.preventDefault(); pop.classList.toggle("open"); if (pop.classList.contains("open")) place(); };
    window.addEventListener("resize", () => { if (pop.classList.contains("open")) place(); });
    document.addEventListener("pointerdown", (e) => { if (e.target !== btn && !btn.contains(e.target) && !pop.contains(e.target)) pop.classList.remove("open"); });

    pop.querySelector("#k-octdn").onclick = () => { base = Math.max(12, base - 12); rebuildNotes(); buildPads(); };
    pop.querySelector("#k-octup").onclick = () => { base = Math.min(96, base + 12); rebuildNotes(); buildPads(); };
    const latchBtn = pop.querySelector("#k-latch");
    latchBtn.onclick = () => { latch = !latch; latchBtn.classList.toggle("on", latch); if (!latch) panic(); };
    pop.querySelector("#k-panic").onclick = panic;
    // changing the scale re-maps snap(), so a note held across the change would be looked up under a
    // different root on release and never stop — let go of anything held before the mapping moves.
    pop.querySelector("#k-root").onchange = (e) => { releaseHeld(); scaleRoot = +e.target.value; lights(); buildPads(); };
    pop.querySelector("#k-scale").onchange = (e) => { releaseHeld(); scaleName = e.target.value; lights(); buildPads(); };
    pop.querySelector("#k-chord").onchange = (e) => { chordName = e.target.value; updateReadout(); buildPads(); };
    pop.querySelector("#k-inv").onchange = (e) => { inversion = +e.target.value; updateReadout(); buildPads(); };
    pop.querySelector("#k-strumdir").onchange = (e) => { strumDir = e.target.value; };
    pop.querySelector("#k-strum").oninput = (e) => { strumMs = +e.target.value; pop.querySelector("#k-strum-l").textContent = strumMs ? strumMs + "ms" : "off"; };
    pop.querySelector("#k-arp").onchange = (e) => { const was = arpMode; arpMode = e.target.value; roots.clear(); if (was === "Off" && arpMode !== "Off") releaseHeld(); startArp(); lights(); status(arpMode === "Off" ? "Arp off." : `Arp: ${arpMode}. Hold keys (or Latch).`); };
    pop.querySelector("#k-rate").onchange = (e) => { curRate = e.target.value; };
    pop.querySelector("#k-octs").onchange = (e) => { arpOcts = +e.target.value; };
    pop.querySelector("#k-vel").oninput = (e) => { vel = +e.target.value; pop.querySelector("#k-vel-l").textContent = vel; };
    pop.querySelector("#k-gate").oninput = (e) => { gate = +e.target.value / 100; pop.querySelector("#k-gate-l").textContent = e.target.value + "%"; };
    pop.querySelector("#k-swing").oninput = (e) => { swing = +e.target.value; pop.querySelector("#k-swing-l").textContent = swing + "%"; };
    pop.querySelector("#k-human").oninput = (e) => { humanize = +e.target.value; pop.querySelector("#k-human-l").textContent = humanize + "%"; };
    pop.querySelector("#k-bpm").oninput = (e) => { bpm = +e.target.value; pop.querySelector("#k-bpm-l").textContent = bpm + " BPM"; };

    // note-name labels on the keys (persisted, default on)
    const labBtn = pop.querySelector("#k-labels");
    let showLabels = true; try { showLabels = localStorage.getItem("fm1.keys.labels") !== "0"; } catch {}
    const syncLabels = () => { kb.classList.toggle("nolabels", !showLabels); labBtn.classList.toggle("on", showLabels); };
    labBtn.onclick = () => { showLabels = !showLabels; try { localStorage.setItem("fm1.keys.labels", showLabels ? "1" : "0"); } catch {} syncLabels(); };
    syncLabels();

    // touch-sensitive keys: velocity follows where you hit the key (persisted)
    const tvBtn = pop.querySelector("#k-touchvel");
    try { touchVel = localStorage.getItem("fm1.keys.touchvel") === "1"; } catch {}
    const syncTv = () => { tvBtn.classList.toggle("on", touchVel); };
    tvBtn.onclick = () => { touchVel = !touchVel; try { localStorage.setItem("fm1.keys.touchvel", touchVel ? "1" : "0"); } catch {} syncTv(); status(touchVel ? "Touch-sensitive: hit lower on a key = louder." : "Click or tap the keys. Boot a firmware (Start) first."); };
    syncTv();

    // velocity curve + sustain (Hold). Space is a momentary pedal while the panel is open.
    pop.querySelector("#k-curve").onchange = (e) => { velCurve = e.target.value; };
    holdBtn = pop.querySelector("#k-hold");
    holdBtn.onclick = () => setHold(!hold);
    window.addEventListener("keydown", (e) => { if (e.key !== " " || !pop.classList.contains("open") || typingInField(e)) return; e.preventDefault(); if (!e.repeat) setHold(true); }, true);
    // release on Space-up even if the panel was closed while the pedal was down (otherwise sustain sticks on)
    window.addEventListener("keyup", (e) => { if (e.key !== " " || !hold) return; e.preventDefault(); setHold(false); }, true);

    // ---- scale-degree chord pads: one tap per degree plays the in-key chord through the engine ----
    const padWrap = pop.querySelector("#k-padwrap"), padsBtn = pop.querySelector("#k-pads");
    const ROM = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
    function buildPads() {
      if (!padsOn) return;
      const sc = scaleSet(); padWrap.innerHTML = ""; padRoots = [];
      if (!sc) { padWrap.innerHTML = '<span style="font-size:11px;color:#8c93a0;padding:4px 2px">Pick a scale to get degree pads.</span>'; return; }
      const sorted = [...sc].sort((a, b) => a - b), oct = base - (base % 12);
      sorted.forEach((iv, i) => {
        const root = clampNote(oct + scaleRoot + iv); padRoots.push(root);
        const b = document.createElement("button"); b.className = "pad"; b.dataset.root = root;
        const rom = romanDegree(root).replace(/[()]/g, "").trim() || ROM[i] || String(i + 1);
        b.innerHTML = `${NOTE_NAMES[root % 12]}<span class="rom">${rom}</span>`;
        b.title = chordLabel(root);
        padWrap.appendChild(b);
      });
    }
    const padDown = new Map();
    padWrap.addEventListener("pointerdown", (e) => { const p = e.target.closest(".pad"); if (!p) return; e.preventDefault(); const r = +p.dataset.root; padDown.set(e.pointerId, { r, p }); p.classList.add("act"); progAppend(r); play(r, true); });
    const relPad = (e) => { const d = padDown.get(e.pointerId); if (!d) return; padDown.delete(e.pointerId); d.p.classList.remove("act"); play(d.r, false); };
    padWrap.addEventListener("pointerup", relPad); padWrap.addEventListener("pointercancel", relPad); window.addEventListener("pointerup", relPad);
    // progression sequencer controls
    progRecBtn = pop.querySelector("#k-prog-rec"); progPlayBtn = pop.querySelector("#k-prog-play"); progView = pop.querySelector("#k-progview");
    progRecBtn.onclick = () => { progRec = !progRec; progRecBtn.classList.toggle("on", progRec); status(progRec ? "Recording: tap pads to add chords." : "Progression armed off."); };
    progPlayBtn.onclick = () => { if (progPlaying()) progStop(); else progStart(); };
    pop.querySelector("#k-prog-clear").onclick = progClear;
    pop.querySelector("#k-prog-len").onchange = (e) => { progBeats = +e.target.value; };
    pop.querySelector("#k-prog-mid").onclick = () => {
      if (!prog.length) { status("Build a progression first, then export."); return; }
      const blob = new Blob([writeProgSMF()], { type: "audio/midi" }), url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "fm1-progression.mid"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000); status("Exported fm1-progression.mid");
    };

    try { padsOn = localStorage.getItem("fm1.keys.pads") === "1"; } catch {}
    const progRow = pop.querySelector("#k-progrow");
    const syncPads = () => {
      padsBtn.classList.toggle("on", padsOn);
      padWrap.style.display = padsOn ? "flex" : "none";
      progRow.style.display = padsOn ? "flex" : "none";
      progView.style.display = padsOn ? "block" : "none";
      if (!padsOn && progPlaying()) progStop();
      buildPads(); updateProgView(-1);
    };
    padsBtn.onclick = () => { padsOn = !padsOn; try { localStorage.setItem("fm1.keys.pads", padsOn ? "1" : "0"); } catch {} syncPads(); };
    syncPads();

    // ---- presets: capture / recall the whole assist rig ----
    const captureState = () => ({ scaleName, scaleRoot, chordName, inversion, strumDir, strumMs, arpMode, curRate, arpOcts, vel, gate, bpm, swing, humanize, velCurve, base, touchVel, prog: prog.slice(), progBeats });
    const setSel = (id, v) => { const s = pop.querySelector(id); if (s) s.value = String(v); };
    const setRange = (id, labId, v, fmt) => { const r = pop.querySelector(id); if (r) { r.value = v; if (labId) pop.querySelector(labId).textContent = fmt(v); } };
    function applyState(stIn) {
      const st = stIn || {};
      releaseHeld();   // a recall is a fresh patch — silence anything held so it can't ring on with stale voicing
      scaleRoot = st.scaleRoot ?? 0; setSel("#k-root", scaleRoot);
      scaleName = st.scaleName ?? "Off"; setSel("#k-scale", scaleName);
      chordName = st.chordName ?? "Off"; setSel("#k-chord", chordName);
      inversion = st.inversion ?? 0; setSel("#k-inv", inversion);
      strumDir = st.strumDir ?? "up"; setSel("#k-strumdir", strumDir);
      strumMs = st.strumMs ?? 0; setRange("#k-strum", "#k-strum-l", strumMs, (v) => (v ? v + "ms" : "off"));
      curRate = st.curRate ?? "1/8"; setSel("#k-rate", curRate);
      arpOcts = st.arpOcts ?? 1; setSel("#k-octs", arpOcts);
      vel = st.vel ?? 100; setRange("#k-vel", "#k-vel-l", vel, (v) => String(v));
      gate = st.gate ?? 0.6; setRange("#k-gate", "#k-gate-l", Math.round(gate * 100), (v) => v + "%");
      bpm = st.bpm ?? 120; setRange("#k-bpm", "#k-bpm-l", bpm, (v) => v + " BPM");
      swing = st.swing ?? 0; setRange("#k-swing", "#k-swing-l", swing, (v) => v + "%");
      humanize = st.humanize ?? 0; setRange("#k-human", "#k-human-l", humanize, (v) => v + "%");
      velCurve = st.velCurve ?? "linear"; setSel("#k-curve", velCurve);
      if (st.touchVel != null && st.touchVel !== touchVel) { touchVel = st.touchVel; syncTv(); }
      if (st.base != null && st.base !== base) { base = st.base; rebuildNotes(); }
      if (progPlaying()) progStop();
      prog = Array.isArray(st.prog) ? st.prog.slice() : []; progBeats = st.progBeats ?? 4; setSel("#k-prog-len", progBeats); updateProgView(-1);
      arpMode = st.arpMode ?? "Off"; setSel("#k-arp", arpMode);
      roots.clear(); startArp();   // held notes already released above; just reset the arp
      lights(); buildPads();
    }

    let userPresets = {}; try { userPresets = JSON.parse(localStorage.getItem("fm1.keys.presets") || "{}"); } catch {}
    const saveUser = () => { try { localStorage.setItem("fm1.keys.presets", JSON.stringify(userPresets)); } catch {} };
    const presetSel = pop.querySelector("#k-preset");
    function refreshPresets(keep) {
      let h = '<option value="">Recall preset…</option>';
      h += '<optgroup label="Built-in">' + Object.keys(BUILTIN).map((n) => `<option value="b:${n}">${n}</option>`).join("") + "</optgroup>";
      const uk = Object.keys(userPresets);
      if (uk.length) h += '<optgroup label="Saved">' + uk.map((n) => `<option value="u:${n}">${n}</option>`).join("") + "</optgroup>";
      presetSel.innerHTML = h; if (keep) presetSel.value = keep;
    }
    refreshPresets();
    presetSel.onchange = (e) => {
      const v = e.target.value; if (!v) return;
      const name = v.slice(2), st = v[0] === "b" ? BUILTIN[name] : userPresets[name];
      if (st) { applyState(st); status(`Loaded “${name}”.`); }
    };
    const saveWrap = pop.querySelector("#k-savewrap"), saveName = pop.querySelector("#k-savename");
    pop.querySelector("#k-presave").onclick = () => { saveWrap.style.display = "flex"; saveName.value = ""; saveName.focus(); };
    pop.querySelector("#k-savecancel").onclick = () => { saveWrap.style.display = "none"; };
    const doSave = () => {
      const n = saveName.value.trim(); if (!n) { saveName.focus(); return; }
      userPresets[n] = captureState(); saveUser(); refreshPresets("u:" + n); saveWrap.style.display = "none"; status(`Saved “${n}”.`);
    };
    pop.querySelector("#k-saveok").onclick = doSave;
    saveName.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doSave(); } else if (e.key === "Escape") { saveWrap.style.display = "none"; } });
    pop.querySelector("#k-predel").onclick = () => {
      const v = presetSel.value; if (v[0] !== "u") { status("Pick a saved preset to delete."); return; }
      const name = v.slice(2); delete userPresets[name]; saveUser(); refreshPresets(); status(`Deleted “${name}”.`);
    };

    // route the computer keyboard through these assists (scale / chord / arp) instead of the raw panel.
    // Capture-phase listeners run before main.js's; stopImmediatePropagation keeps the panel from also playing.
    try { pcRoute = localStorage.getItem("fm1.keys.pcroute") !== "0"; } catch { pcRoute = true; }   // on by default: type on your keyboard to play
    const pcBtn = pop.querySelector("#k-pcroute");
    const syncPc = () => { pcBtn.classList.toggle("on", pcRoute); status(pcRoute ? "Computer keyboard → Keys (scale / chord / arp)." : "Click or tap the keys. Boot a firmware (Start) first."); };
    pcBtn.onclick = () => { pcRoute = !pcRoute; try { localStorage.setItem("fm1.keys.pcroute", pcRoute ? "1" : "0"); } catch {} if (!pcRoute) { for (const n of pcDown.values()) play(n, false); pcDown.clear(); } syncPc(); };
    syncPc();
    const typingInField = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable); };
    window.addEventListener("keydown", (e) => {
      if (!pcRoute || e.metaKey || e.ctrlKey || e.altKey || typingInField(e)) return;
      const k = e.key.toLowerCase();
      if (k === "z" || k === "x") { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) { base = k === "z" ? Math.max(12, base - 12) : Math.min(96, base + 12); rebuildNotes(); } return; }
      const off = PIANO_MAP[k]; if (off === undefined) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat || pcDown.has(k)) return;
      const n = base + off; pcDown.set(k, n); play(n, true);
    }, true);
    window.addEventListener("keyup", (e) => {
      if (!pcRoute) return;
      const k = e.key.toLowerCase();
      if (k === "z" || k === "x") { e.stopImmediatePropagation(); return; }
      if (PIANO_MAP[k] !== undefined) { e.stopImmediatePropagation(); if (pcDown.has(k)) { play(pcDown.get(k), false); pcDown.delete(k); } }
    }, true);

    // a key-up never arrives when the window loses focus (Alt-Tab / app switch) or the tab is hidden, so a
    // held computer key or the Space pedal would drone forever. Let go of all of it when focus leaves.
    const releaseKeyboardInput = () => {
      if (pcDown.size) { for (const n of pcDown.values()) play(n, false); pcDown.clear(); }
      if (hold) setHold(false);
    };
    window.addEventListener("blur", releaseKeyboardInput);
    document.addEventListener("visibilitychange", () => { if (document.hidden) releaseKeyboardInput(); });

    // run the hardware MIDI input through these assists (scale / chord / arp) before it reaches the synth
    const hwBtn = pop.querySelector("#k-hw");
    try { hwProc = localStorage.getItem("fm1.keys.hwproc") === "1"; } catch {}
    const syncHw = () => { hwBtn.classList.toggle("on", hwProc); if (FM() && FM().setInputProcessor) FM().setInputProcessor(hwProc ? hwProcessor : null); };
    hwBtn.onclick = () => { hwProc = !hwProc; try { localStorage.setItem("fm1.keys.hwproc", hwProc ? "1" : "0"); } catch {} if (!hwProc) panic(); syncHw(); status(hwProc ? "Hardware MIDI → scale / chord / arp." : "Hardware MIDI plays dry."); };
    syncHw();

    // expose a tiny hook for self-tests / scripting
    window.FM1Keys = { play, panic, setArp: (m) => { arpMode = m; startArp(); }, routePc: (on) => { pcRoute = on; syncPc(); }, _hw: hwProcessor, _chord: chordNotes, _setInv: (i) => { inversion = i; }, _setHuman: (h) => { humanize = h; }, _setStrum: (ms, dir) => { strumMs = ms; if (dir) strumDir = dir; }, _posVel: posVel, _apply: applyState, _capture: captureState, _setCurve: (c) => { velCurve = c; }, _curve: curveVel, _hold: setHold, _label: chordLabel, _prog: { list: () => prog.slice(), rec: (b) => { progRec = b; }, start: progStart, stop: progStop, playing: progPlaying, setBeats: (n) => { progBeats = n; }, add: progAppend, smf: writeProgSMF }, _state: () => ({ scaleName, chordName, arpMode, curRate, arpOcts, base, vel, gate, bpm, swing, inversion, humanize, strumMs, strumDir, touchVel, velCurve, hold, pcRoute, hwProc }) };
  });
})();
