// Arpeggiator: hold a chord (your fingers, the chord harmonizer, a dropped
// .mid) and step through its notes rhythmically instead of as a block. Like
// Transpose and Chords it wraps FM1.midi, but it is stateful: while on, it
// swallows the note-ons/offs it receives to track which notes are held, and a
// clock plays them back one at a time through the SAME downstream chain — so an
// arp step is still transposed and harmonized if those are on. CCs, pitch bend
// and realtime pass straight through. Turning it off, or releasing the last
// note, silences the current step so nothing hangs.
(function () {
  "use strict";

  // Pure, unit-tested. Unique note list preserving first-seen order.
  function dedup(notes) {
    const seen = new Set(), out = [];
    for (const n of notes || []) { if (!seen.has(n)) { seen.add(n); out.push(n); } }
    return out;
  }
  // Pure, unit-tested: one full cycle of an arp pattern over the held notes.
  // up/down sort; updown/downup bounce without repeating the turning points;
  // "played" keeps the order they were pressed; "random" returns the ascending
  // set (the clock picks a random index each step).
  function arpSequence(notes, mode) {
    const uniq = dedup(notes);
    if (uniq.length <= 1) return uniq.slice();
    const up = uniq.slice().sort((a, b) => a - b);
    const down = up.slice().reverse();
    switch (mode) {
      case "down": return down;
      case "played": return uniq.slice();
      case "random": return up;                         // stepping is random; set is the pool
      case "updown": return up.length <= 2 ? up : up.concat(down.slice(1, -1));
      case "downup": return down.length <= 2 ? down : down.concat(up.slice(1, -1));
      case "up":
      default: return up;
    }
  }
  // Pure: the index to play next. Random picks from an injectable rng; the rest
  // walk the cycle. Returns { idx, step } — the next running step for non-random.
  function pickStep(seqLen, mode, step, rand) {
    if (seqLen <= 0) return { idx: -1, step: 0 };
    if (mode === "random") return { idx: Math.min(seqLen - 1, Math.floor((rand || Math.random)() * seqLen)), step: step };
    const idx = ((step % seqLen) + seqLen) % seqLen;
    return { idx, step: step + 1 };
  }

  const MODES = ["up", "down", "updown", "downup", "played", "random"];
  const MODE_LABEL = { up: "Up", down: "Down", updown: "Up/Down", downup: "Down/Up", played: "As played", random: "Random" };

  let enabled = false, mode = "up", rateMs = 125, step = 0;
  let timer = 0;
  const held = new Map();         // note -> { vel, ch }
  const heldOrder = [];           // notes in press order (for "played")
  let sounding = null;            // { note, ch } currently ringing from the clock
  let prev = null;                // the downstream chain head, captured at wrap time
  let onChange = null;

  function heldNotes() { return heldOrder.slice(); }
  function addHeld(note, vel, ch) {
    if (!held.has(note)) heldOrder.push(note);
    held.set(note, { vel: vel || 100, ch: ch || 0 });
  }
  function removeHeld(note) {
    if (held.delete(note)) { const i = heldOrder.indexOf(note); if (i >= 0) heldOrder.splice(i, 1); }
  }
  function emit(bytes) { if (prev) prev(bytes); }
  function silence() { if (sounding) { emit([0x80 | (sounding.ch & 0x0f), sounding.note, 0]); sounding = null; } }

  function tick() {
    const seq = arpSequence(heldNotes(), mode);
    if (!seq.length) { silence(); return; }
    const s = pickStep(seq.length, mode, step, Math.random);
    step = s.step;
    const note = seq[s.idx];
    const info = held.get(note) || { vel: 100, ch: 0 };
    silence();                                    // release the previous step
    emit([0x90 | (info.ch & 0x0f), note, info.vel]);
    sounding = { note, ch: info.ch };
    window.FM1BayLeds?.pulse?.("assist");
  }

  function startClock() { stopClock(); step = 0; timer = setInterval(tick, rateMs); }
  function stopClock() { if (timer) { clearInterval(timer); timer = 0; } }

  function setEnabled(on) {
    on = !!on;
    if (on === enabled) return enabled;
    enabled = on;
    if (enabled) startClock();
    else { stopClock(); silence(); held.clear(); heldOrder.length = 0; }
    notify();
    return enabled;
  }

  // While on, note-ons/offs are captured to track the held set; everything else
  // passes through. While off, this is a pure passthrough.
  function intake(bytes) {
    if (!enabled || !bytes || bytes.length < 2) { emit(bytes); return; }
    const type = bytes[0] & 0xf0, ch = bytes[0] & 0x0f;
    const isOn = type === 0x90 && bytes[2] > 0;
    const isOff = type === 0x80 || (type === 0x90 && bytes[2] === 0);
    if (isOn) { addHeld(bytes[1], bytes[2], ch); return; }
    if (isOff) { removeHeld(bytes[1]); return; }
    emit(bytes);
  }

  function notify() { if (onChange) onChange({ enabled, mode, rateMs }); }

  window.FM1Arp = {
    arpSequence, pickStep, dedup,
    modes: () => MODES.slice(),
    label: (m) => MODE_LABEL[m] || String(m),
    get: () => mode,
    setMode: (m) => { if (MODES.indexOf(m) < 0 || m === mode) return mode; mode = m; step = 0; notify(); return mode; },
    cycleMode: () => window.FM1Arp.setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]),
    rate: () => rateMs,
    setRate: (ms) => { const v = Math.max(30, Math.min(1000, ms | 0)); if (v === rateMs) return rateMs; rateMs = v; if (enabled) startClock(); notify(); return rateMs; },
    faster: () => window.FM1Arp.setRate(Math.round(rateMs / 1.5)),
    slower: () => window.FM1Arp.setRate(Math.round(rateMs * 1.5)),
    bpmDiv: (bpm, div) => Math.round(60000 / (bpm * div)),   // ms per step for bpm + divisions-per-beat
    enabled: () => enabled,
    enable: () => setEnabled(true),
    disable: () => setEnabled(false),
    toggle: () => setEnabled(!enabled),
    held: heldNotes,
  };

  function ready(fn) {
    const t = setInterval(() => { if (window.FM1 && window.FM1.midi && document.body) { clearInterval(t); fn(); } }, 150);
    setTimeout(() => clearInterval(t), 9000);
  }
  ready(() => {
    if (!window.FM1._arpWrapped) {
      prev = window.FM1.midi;
      window.FM1.midi = intake;
      window.FM1._arpWrapped = true;
    }
    const css = document.createElement("style");
    css.textContent = `#arp-toast{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:10001;
      background:#17181b;border:1px solid #2a2c31;color:#e9edf2;font:600 12px 'Space Grotesk',sans-serif;
      padding:7px 13px;border-radius:9px;box-shadow:0 8px 24px rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .2s}
      #arp-toast.on{opacity:1}`;
    document.head.appendChild(css);
    const toast = document.createElement("div"); toast.id = "arp-toast"; document.body.appendChild(toast);
    let hide = 0;
    onChange = (st) => {
      toast.textContent = st.enabled
        ? "Arp: " + window.FM1Arp.label(st.mode) + "  ·  " + Math.round(60000 / (st.rateMs * 4)) + " BPM (1/16)"
        : "Arp off";
      toast.classList.add("on"); clearTimeout(hide); hide = setTimeout(() => toast.classList.remove("on"), 1500);
    };
  });
})();
