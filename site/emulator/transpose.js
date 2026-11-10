// Transpose: shift every note sent to the device up or down, so you can play a
// firmware in a different octave or key. Applies to everything that sends notes
// — the keys, a loaded/dropped .mid, the audition — by wrapping FM1.midi with a
// note transform (CCs, pitch bend and realtime pass through untouched). On a
// change it sends all-notes-off so a note held across the shift can't hang.
(function () {
  "use strict";

  // Pure, unit-tested: shift note-on/off by `semis`, clamped to the MIDI range;
  // everything else (and an out-of-range shift) passes through unchanged.
  function transposeBytes(bytes, semis) {
    if (!semis || !bytes || bytes.length < 2) return bytes;
    const type = bytes[0] & 0xf0;
    if (type !== 0x90 && type !== 0x80) return bytes;
    const n = bytes[1] + semis;
    if (n < 0 || n > 127) return bytes;        // keep on/off consistent — don't half-shift
    const c = bytes.slice ? bytes.slice() : Array.prototype.slice.call(bytes);
    c[1] = n;
    return c;
  }

  let semis = 0;
  window.FM1Transpose = {
    transposeBytes,
    get: () => semis,
    set: (n) => { const v = Math.max(-36, Math.min(36, n | 0)); if (v === semis) return semis; allOff(); semis = v; notify(); return semis; },
    shift: (d) => window.FM1Transpose.set(semis + (d | 0)),
    reset: () => window.FM1Transpose.set(0),
  };

  function allOff() { const fm = window.FM1; if (fm && fm.midi) for (let ch = 0; ch < 16; ch++) fm.midi([0xb0 | ch, 123, 0]); }
  let onChange = null;
  function notify() { if (onChange) onChange(semis); }

  function ready(fn) {
    const t = setInterval(() => { if (window.FM1 && window.FM1.midi && document.body) { clearInterval(t); fn(); } }, 150);
    setTimeout(() => clearInterval(t), 9000);
  }
  ready(() => {
    // Wrap FM1.midi once so the transform applies to every note source. This sits
    // outermost of the MIDI-monitor tee, so the monitor logs what is actually sent.
    if (!window.FM1._transposeWrapped) {
      const prev = window.FM1.midi;
      window.FM1.midi = (bytes) => prev(transposeBytes(bytes, semis));
      window.FM1._transposeWrapped = true;
    }

    const css = document.createElement("style");
    css.textContent = `#tr-toast{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:10001;
      background:#17181b;border:1px solid #2a2c31;color:#e9edf2;font:600 12px 'Space Grotesk',sans-serif;
      padding:7px 13px;border-radius:9px;box-shadow:0 8px 24px rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .2s}
      #tr-toast.on{opacity:1}`;
    document.head.appendChild(css);
    const toast = document.createElement("div"); toast.id = "tr-toast"; document.body.appendChild(toast);
    let hide = 0;
    onChange = (v) => {
      toast.textContent = "Transpose " + (v > 0 ? "+" + v : v === 0 ? "0 (off)" : v) + (v % 12 === 0 && v !== 0 ? "  (" + (v / 12 > 0 ? "+" : "") + (v / 12) + " oct)" : "");
      toast.classList.add("on"); clearTimeout(hide); hide = setTimeout(() => toast.classList.remove("on"), 1400);
    };
  });
})();
