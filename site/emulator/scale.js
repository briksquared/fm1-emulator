// Scale lock: snap every note you play to a chosen key and scale, so a wrong
// note is nudged to the nearest right one and you stay in key — on the on-screen
// keys, a dropped .mid, the audition, anything. Like Transpose it wraps FM1.midi
// with a pure note transform (CCs, pitch bend and realtime pass through), snaps
// note-on and note-off by the same rule so they still pair up, and sends
// all-notes-off on a change so a note held across it can't hang.
(function () {
  "use strict";

  // Scale degrees as semitone pitch-classes from the root. "off" is chromatic
  // (every note allowed → a pure passthrough).
  const SCALES = {
    off:    { label: "Off (chromatic)", pc: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    major:  { label: "Major",           pc: [0, 2, 4, 5, 7, 9, 11] },
    minor:  { label: "Minor",           pc: [0, 2, 3, 5, 7, 8, 10] },
    harm:   { label: "Harmonic minor",  pc: [0, 2, 3, 5, 7, 8, 11] },
    dorian: { label: "Dorian",          pc: [0, 2, 3, 5, 7, 9, 10] },
    phryg:  { label: "Phrygian",        pc: [0, 1, 3, 5, 7, 8, 10] },
    lydian: { label: "Lydian",          pc: [0, 2, 4, 6, 7, 9, 11] },
    mixo:   { label: "Mixolydian",      pc: [0, 2, 4, 5, 7, 9, 10] },
    pentM:  { label: "Major pentatonic", pc: [0, 2, 4, 7, 9] },
    pentm:  { label: "Minor pentatonic", pc: [0, 3, 5, 7, 10] },
    blues:  { label: "Blues",           pc: [0, 3, 5, 6, 7, 10] },
  };
  const ORDER = ["off", "major", "minor", "harm", "dorian", "phryg", "lydian", "mixo", "pentM", "pentm", "blues"];
  const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  // Pure, unit-tested: snap one MIDI note to the nearest degree of scale+root.
  // Searches outward 0, +1, -1, +2, -2 … so the nearest allowed pitch wins and a
  // tie snaps UP; the shift is small, so the note stays in its own octave.
  // Clamped to the MIDI range. An unknown/"off" scale returns the note unchanged.
  function snapNote(note, root, scaleName) {
    const sc = SCALES[scaleName];
    if (!sc || scaleName === "off") return note;
    const allowed = sc.pc;
    const r = ((root | 0) % 12 + 12) % 12;
    const pc = ((note - r) % 12 + 12) % 12;
    if (allowed.indexOf(pc) >= 0) return note;
    for (let d = 1; d <= 6; d++) {
      if (allowed.indexOf(((pc + d) % 12 + 12) % 12) >= 0) { const n = note + d; return n <= 127 ? n : note; }
      if (allowed.indexOf(((pc - d) % 12 + 12) % 12) >= 0) { const n = note - d; return n >= 0 ? n : note; }
    }
    return note;
  }

  // Pure: snap the note in a note-on/off message; pass everything else through.
  function snapBytes(bytes, root, scaleName) {
    if (!bytes || bytes.length < 2) return bytes;
    const type = bytes[0] & 0xf0;
    if (type !== 0x90 && type !== 0x80) return bytes;
    const n = snapNote(bytes[1], root, scaleName);
    if (n === bytes[1]) return bytes;
    const c = bytes.slice ? bytes.slice() : Array.prototype.slice.call(bytes);
    c[1] = n;
    return c;
  }

  let root = 0, scale = "off";
  window.FM1Scale = {
    snapNote, snapBytes,
    scales: () => ORDER.slice(),
    label: (s) => (SCALES[s] ? SCALES[s].label : String(s)),
    roots: () => ROOTS.slice(),
    rootName: () => ROOTS[root],
    get: () => scale,
    getRoot: () => root,
    enabled: () => scale !== "off",
    setScale: (s) => { if (!SCALES[s] || s === scale) return scale; allOff(); scale = s; notify(); return scale; },
    cycleScale: () => window.FM1Scale.setScale(ORDER[(ORDER.indexOf(scale) + 1) % ORDER.length]),
    setRoot: (r) => { const v = ((r | 0) % 12 + 12) % 12; if (v === root) return root; allOff(); root = v; notify(); return root; },
    rootUp: () => window.FM1Scale.setRoot(root + 1),
    rootDown: () => window.FM1Scale.setRoot(root - 1),
    off: () => window.FM1Scale.setScale("off"),
  };

  function allOff() { const fm = window.FM1; if (fm && fm.midi) for (let ch = 0; ch < 16; ch++) fm.midi([0xb0 | ch, 123, 0]); }
  let onChange = null;
  function notify() { if (onChange) onChange(scale, root); }

  function ready(fn) {
    const t = setInterval(() => { if (window.FM1 && window.FM1.midi && document.body) { clearInterval(t); fn(); } }, 150);
    setTimeout(() => clearInterval(t), 9000);
  }
  ready(() => {
    if (!window.FM1._scaleWrapped) {
      const prev = window.FM1.midi;
      window.FM1.midi = (bytes) => prev(snapBytes(bytes, root, scale));
      window.FM1._scaleWrapped = true;
    }
    const css = document.createElement("style");
    css.textContent = `#sc-toast{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:10001;
      background:#17181b;border:1px solid #2a2c31;color:#e9edf2;font:600 12px 'Space Grotesk',sans-serif;
      padding:7px 13px;border-radius:9px;box-shadow:0 8px 24px rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .2s}
      #sc-toast.on{opacity:1}`;
    document.head.appendChild(css);
    const toast = document.createElement("div"); toast.id = "sc-toast"; document.body.appendChild(toast);
    let hide = 0;
    onChange = (s, r) => {
      toast.textContent = s === "off" ? "Scale lock off" : "Scale: " + ROOTS[r] + " " + window.FM1Scale.label(s);
      toast.classList.add("on"); clearTimeout(hide); hide = setTimeout(() => toast.classList.remove("on"), 1500);
    };
  });
})();
