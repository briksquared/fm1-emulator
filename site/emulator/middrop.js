// Drag-and-drop a .mid onto the window to audition it on the current firmware.
// The MIDI player already parses, loads and plays a file (FM1MidiPlayer.loadBuffer);
// this just wires drop-anywhere to it. The synth panel already takes .fwsc/.syx
// drops on itself (main.js), so this is careful not to steal those: it only acts
// on a .mid, and otherwise points a stray firmware file at the panel.
(function () {
  "use strict";

  // Pure, unit-tested file pickers.
  function midiFileOf(files) {
    for (const f of files) if (/\.midi?$/i.test(f.name)) return f;
    return null;
  }
  function fwscFileOf(files) {
    for (const f of files) if (/\.(fwsc|syx)$/i.test(f.name)) return f;
    return null;
  }
  window.FM1MidiDrop = { midiFileOf, fwscFileOf };

  function ready(fn) {
    const t = setInterval(() => { if (document.body) { clearInterval(t); fn(); } }, 120);
    setTimeout(() => clearInterval(t), 9000);
  }
  ready(() => {
    const css = document.createElement("style");
    css.textContent = `
      #drop-ov{position:fixed;inset:0;z-index:10002;display:none;align-items:center;justify-content:center;
        background:rgba(6,7,9,.55);backdrop-filter:blur(2px);pointer-events:none}
      #drop-ov.on{display:flex}
      #drop-ov .box{border:2px dashed var(--amber-ink,var(--amber));border-radius:16px;padding:28px 40px;background:#0d0e11cc;
        color:#e9edf2;font:600 16px 'Space Grotesk',sans-serif;text-align:center}
      #drop-ov .box small{display:block;margin-top:5px;color:#8c93a0;font-weight:400;font-size:12px}
      #drop-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:10003;
        background:#17181b;border:1px solid #2a2c31;color:#e9edf2;font:13px 'Space Grotesk',sans-serif;
        padding:8px 14px;border-radius:9px;box-shadow:0 8px 24px rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .2s}
      #drop-toast.on{opacity:1}`;
    document.head.appendChild(css);

    const ov = document.createElement("div"); ov.id = "drop-ov";
    ov.innerHTML = `<div class="box">Drop a .mid to play it<small>plays on the current firmware</small></div>`;
    document.body.appendChild(ov);
    const toastEl = document.createElement("div"); toastEl.id = "drop-toast";
    document.body.appendChild(toastEl);
    let toastHide = 0;
    function toast(msg) { toastEl.textContent = msg; toastEl.classList.add("on"); clearTimeout(toastHide); toastHide = setTimeout(() => toastEl.classList.remove("on"), 2200); }

    // A dragenter/dragleave counter avoids the overlay flickering as the cursor
    // crosses child elements.
    let depth = 0;
    const draggingFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
    document.addEventListener("dragenter", (e) => { if (!draggingFiles(e)) return; depth++; ov.classList.add("on"); });
    document.addEventListener("dragleave", (e) => { if (!draggingFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) ov.classList.remove("on"); });
    document.addEventListener("dragover", (e) => { if (draggingFiles(e)) e.preventDefault(); });
    document.addEventListener("drop", (e) => {
      depth = 0; ov.classList.remove("on");
      const files = [...((e.dataTransfer && e.dataTransfer.files) || [])];
      if (!files.length) return;
      e.preventDefault();                       // never let the browser navigate to a dropped file
      const mid = midiFileOf(files);
      if (mid) {
        if (!(window.FM1MidiPlayer && window.FM1MidiPlayer.loadBuffer)) { toast("MIDI player not ready"); return; }
        mid.arrayBuffer()
          .then((buf) => { window.FM1MidiPlayer.loadBuffer(buf, mid.name.replace(/\.midi?$/i, "")); toast("▶ " + mid.name); })
          .catch(() => toast("Couldn't read that .mid"));
        return;
      }
      // A firmware file is handled by the synth panel's own drop — but only when
      // dropped on the panel. If it landed elsewhere, point the user at the panel.
      if (fwscFileOf(files)) {
        const stage = (window.FM1 && window.FM1.stage) || document.getElementById("panel");
        const onStage = stage && e.target && stage.contains(e.target);
        if (!onStage) toast("Drop a firmware (.fwsc) on the synth panel to load it");
        return;
      }
      toast("Not a MIDI or firmware file");
    });
  });
})();
