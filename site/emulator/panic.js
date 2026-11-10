// MIDI panic: silence every voice on all 16 channels. Notes can hang when a
// firmware is switched mid-note, when a loaded .mid is interrupted, or when a
// note-off is lost — this sends the standard reset so the device goes quiet
// without a reboot. Bound to Ctrl/Cmd+. (a "stop" chord that never collides
// with the on-screen keyboard's letter→note mapping) and offered in the palette.
(function () {
  "use strict";

  // The reset sequence, per channel, as raw MIDI bytes (pure, unit-tested).
  function messages() {
    const m = [];
    for (let ch = 0; ch < 16; ch++) {
      const cc = 0xb0 | ch;
      m.push([cc, 120, 0]); // All Sound Off
      m.push([cc, 123, 0]); // All Notes Off
      m.push([cc, 64, 0]);  // Sustain pedal off
      m.push([cc, 121, 0]); // Reset All Controllers
    }
    return m;
  }

  function panic() {
    const fm = window.FM1;
    if (!fm || !fm.midi) return false;
    for (const b of messages()) { try { fm.midi(b); } catch {} }
    return true;
  }

  window.FM1Panic = { messages, panic };

  function ready(fn) {
    const t = setInterval(() => { if (window.FM1 && document.body) { clearInterval(t); fn(); } }, 150);
    setTimeout(() => clearInterval(t), 9000);
  }
  ready(() => {
    const css = document.createElement("style");
    css.textContent = `
      #panic-flash{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:10001;
        background:#c0392b;color:#fff;font:600 12px 'Space Grotesk',sans-serif;padding:7px 14px;
        border-radius:9px;box-shadow:0 8px 24px rgba(0,0,0,.5);opacity:0;pointer-events:none;
        transition:opacity .2s}
      #panic-flash.on{opacity:1;transition:none}`;
    document.head.appendChild(css);
    const toast = document.createElement("div");
    toast.id = "panic-flash"; toast.textContent = "■ Silenced all notes";
    document.body.appendChild(toast);
    let hide = 0;
    function flash() {
      toast.textContent = (window.FM1 && window.FM1.hasMidiOut && window.FM1.hasMidiOut())
        ? "■ Silenced emu + MIDI out"
        : "■ Silenced all notes";
      toast.classList.add("on");
      clearTimeout(hide);
      hide = setTimeout(() => toast.classList.remove("on"), 900);
    }
    window.FM1Panic.panicUI = () => { const ok = panic(); if (ok) flash(); return ok; };

    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") { e.preventDefault(); window.FM1Panic.panicUI(); }
    });
  });
})();
