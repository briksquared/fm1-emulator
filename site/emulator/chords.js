// Chord / harmonizer: turn each note you play into a chord, so a firmware you
// drive one finger at a time (the on-screen keys, a monophonic line, the
// audition) fills out to power 5ths, triads, 7ths and more. Like Transpose it
// wraps FM1.midi with a transform, so it applies to every note source; CCs,
// pitch bend and realtime pass through untouched. Note-on AND note-off expand
// to the same set so releases always pair up, and a change sends all-notes-off
// so a chord held across the change can't hang.
(function () {
  "use strict";

  // Interval tables, semitones from the root (0 = the note you played).
  const CHORDS = {
    off:   { label: "Off",         iv: [0] },
    oct:   { label: "Octave",      iv: [0, 12] },
    power: { label: "Power 5th",   iv: [0, 7, 12] },
    maj:   { label: "Major",       iv: [0, 4, 7] },
    min:   { label: "Minor",       iv: [0, 3, 7] },
    sus4:  { label: "Sus4",        iv: [0, 5, 7] },
    maj7:  { label: "Major 7",     iv: [0, 4, 7, 11] },
    min7:  { label: "Minor 7",     iv: [0, 3, 7, 10] },
    dom7:  { label: "Dominant 7",  iv: [0, 4, 7, 10] },
    dim:   { label: "Diminished",  iv: [0, 3, 6] },
    aug:   { label: "Augmented",   iv: [0, 4, 8] },
    add9:  { label: "Add 9",       iv: [0, 4, 7, 14] },
  };
  const ORDER = ["off", "oct", "power", "maj", "min", "sus4", "maj7", "min7", "dom7", "dim", "aug", "add9"];

  // Pure, unit-tested: the interval list for a chord name. An unknown name (or
  // "off") is just the root, [0], so it harmonizes to nothing.
  function chordIntervals(name) {
    const c = CHORDS[name];
    return c ? c.iv.slice() : [0];
  }

  // Pure, unit-tested: expand one note-on/off into the chord. Returns an array of
  // messages (each a byte array). A non-note message, and a root-only chord,
  // pass through as a single unchanged message. A chord note that leaves the
  // MIDI range is dropped and a duplicate note (a clamp/interval collision) is
  // sent once, so nothing is ever struck or released twice. The input is never
  // mutated — each emitted message is a copy.
  function harmonize(bytes, intervals) {
    if (!bytes || bytes.length < 2) return [bytes];
    const type = bytes[0] & 0xf0;
    if ((type !== 0x90 && type !== 0x80) || !intervals || intervals.length <= 1) return [bytes];
    const root = bytes[1];
    const seen = new Set();
    const out = [];
    for (const iv of intervals) {
      const n = root + iv;
      if (n < 0 || n > 127 || seen.has(n)) continue;
      seen.add(n);
      const c = bytes.slice ? bytes.slice() : Array.prototype.slice.call(bytes);
      c[1] = n;
      out.push(c);
    }
    return out.length ? out : [bytes];
  }

  let cur = "off";
  window.FM1Chords = {
    chordIntervals, harmonize,
    names: () => ORDER.slice(),
    label: (name) => (CHORDS[name] ? CHORDS[name].label : String(name)),
    get: () => cur,
    set: (name) => { if (!CHORDS[name] || name === cur) return cur; allOff(); cur = name; notify(); return cur; },
    cycle: () => { const i = ORDER.indexOf(cur); return window.FM1Chords.set(ORDER[(i + 1) % ORDER.length]); },
    off: () => window.FM1Chords.set("off"),
  };

  function allOff() { const fm = window.FM1; if (fm && fm.midi) for (let ch = 0; ch < 16; ch++) fm.midi([0xb0 | ch, 123, 0]); }
  let onChange = null;
  function notify() { if (onChange) onChange(cur); }

  function ready(fn) {
    const t = setInterval(() => { if (window.FM1 && window.FM1.midi && document.body) { clearInterval(t); fn(); } }, 150);
    setTimeout(() => clearInterval(t), 9000);
  }
  ready(() => {
    // Wrap FM1.midi once so the harmonizer applies to every note source. It
    // stacks cleanly with Transpose: whichever wraps first runs inner, and a
    // chord note emitted here is then shifted, or a shifted root is harmonized —
    // both give the same chord.
    if (!window.FM1._chordWrapped) {
      const prev = window.FM1.midi;
      window.FM1.midi = (bytes) => { const msgs = harmonize(bytes, chordIntervals(cur)); for (let i = 0; i < msgs.length; i++) prev(msgs[i]); };
      window.FM1._chordWrapped = true;
    }

    const css = document.createElement("style");
    css.textContent = `#ch-toast{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:10001;
      background:#17181b;border:1px solid #2a2c31;color:#e9edf2;font:600 12px 'Space Grotesk',sans-serif;
      padding:7px 13px;border-radius:9px;box-shadow:0 8px 24px rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .2s}
      #ch-toast.on{opacity:1}`;
    document.head.appendChild(css);
    const toast = document.createElement("div"); toast.id = "ch-toast"; document.body.appendChild(toast);
    let hide = 0;
    onChange = (name) => {
      const iv = chordIntervals(name);
      toast.textContent = name === "off" ? "Chord off" : "Chord: " + window.FM1Chords.label(name) + "  (" + iv.length + " notes)";
      toast.classList.add("on"); clearTimeout(hide); hide = setTimeout(() => toast.classList.remove("on"), 1400);
    };
  });
})();
