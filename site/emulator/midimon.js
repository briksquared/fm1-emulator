// MIDI monitor: a live, human-readable log of the MIDI reaching the device —
// from the on-screen keys, the MIDI player, a dropped .mid, or panic. Taps the
// flow by wrapping FM1.midi once (tee + pass through), so it sees everything
// without changing what is sent.
(function () {
  "use strict";
  const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const CC_NAME = { 1: "Mod", 7: "Volume", 10: "Pan", 11: "Expression", 64: "Sustain",
    120: "All Sound Off", 121: "Reset Controllers", 123: "All Notes Off" };

  function noteName(n) { return NOTE[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1); }

  // Pure, unit-tested. Returns a label, or null for messages not worth logging
  // (the 24-per-beat realtime clock would drown everything else).
  function formatMidi(bytes) {
    if (!bytes || !bytes.length) return null;
    const st = bytes[0];
    if (st === 0xf8) return null;                 // realtime clock tick — skip
    if (st === 0xfa) return "Start";
    if (st === 0xfb) return "Continue";
    if (st === 0xfc) return "Stop";
    if (st >= 0xf0) return "Sys 0x" + st.toString(16);
    const ch = (st & 0x0f) + 1, type = st & 0xf0;
    const d1 = bytes[1] | 0, d2 = bytes[2] | 0;
    switch (type) {
      case 0x90: return d2 > 0 ? `Note On  ${noteName(d1)} v${d2} ch${ch}` : `Note Off ${noteName(d1)} ch${ch}`;
      case 0x80: return `Note Off ${noteName(d1)} ch${ch}`;
      case 0xa0: return `Aftertouch ${noteName(d1)} ${d2} ch${ch}`;
      case 0xb0: return `CC ${d1}${CC_NAME[d1] ? " (" + CC_NAME[d1] + ")" : ""} = ${d2} ch${ch}`;
      case 0xc0: return `Program ${d1} ch${ch}`;
      case 0xd0: return `Ch Pressure ${d1} ch${ch}`;
      case 0xe0: return `Pitch Bend ${((d2 << 7) | d1) - 8192} ch${ch}`;
      default: return `0x${st.toString(16)} ${d1} ${d2}`;
    }
  }

  window.FM1MidiMon = { formatMidi, noteName };

  function ready(fn) {
    const t = setInterval(() => {
      const nav = document.querySelector(".sitenav") || document.querySelector("header.site .wrap");
      if (nav && window.FM1 && window.FM1.midi && window.FM1.onMidi) { clearInterval(t); fn(nav); }
    }, 150);
    setTimeout(() => clearInterval(t), 9000);
  }
  ready((nav) => {
    const log = [];           // {text, n, kind, raw} most-recent last
    const MAX = 400;
    let counter = 0, onMsg = null, paused = false;
    let showNotes = true, showCc = true, showOther = true;

    function kindOf(text) {
      if (/^Note (On|Off)/.test(text)) return "note";
      if (/^CC /.test(text)) return "cc";
      return "other";
    }
    function rawHex(bytes) {
      try { return Array.from(bytes || []).map((b) => b.toString(16).padStart(2, "0")).join(" "); }
      catch { return ""; }
    }

    // Tap the shared MIDI bus (hardware + Keys + player). Do not wrap FM1.midi — that missed
    // hardware input that goes straight into the device.
    if (!window.FM1._monWrapped && typeof window.FM1.onMidi === "function") {
      window.FM1.onMidi((bytes) => {
        try {
          if (paused) return;
          const text = formatMidi(bytes);
          if (!text) return;
          log.push({ text, n: ++counter, kind: kindOf(text), raw: rawHex(bytes) });
          if (log.length > MAX) log.shift();
          window.FM1MidiMon._last = performance.now();
          window.FM1BayLeds?.pulse?.("mon");
          if (onMsg) onMsg();
        } catch {}
      });
      window.FM1._monWrapped = true;
    }

    const css = document.createElement("style");
    css.textContent = `
      #mon-pop{position:fixed;z-index:9997;width:320px;max-width:94vw;background:var(--ui-pop,#0c0d0f);border:1px solid var(--ui-line,#232428);
        border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.6);padding:12px;display:none;flex-direction:column;gap:7px;color:var(--ui-text,#e9edf2);
        font:13px 'Space Grotesk',sans-serif}
      #mon-pop.open{display:flex}
      #mon-pop .top{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      #mon-pop .top b{font-size:13px}
      #mon-pop .top .rate{margin-left:auto;font:600 10px 'Space Mono',monospace;color:var(--ui-dim,#8c93a0)}
      #mon-pop .top button{font-size:11px;padding:3px 8px;background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);
        color:var(--ui-text,#e9edf2);border-radius:6px;cursor:pointer}
      #mon-pop .top button.on{background:var(--amber);color:var(--ui-on-accent,#111);border-color:transparent;font-weight:700}
      #mon-pop .filters{display:flex;gap:5px;flex-wrap:wrap}
      #mon-pop .filters button{font-size:10.5px;padding:2px 7px;border-radius:999px;background:var(--ui-surface,#17181b);
        border:1px solid var(--ui-line,#2a2c31);color:var(--ui-dim,#8c93a0);cursor:pointer}
      #mon-pop .filters button.on{color:var(--ui-text,#e9edf2);border-color:var(--amber)}
      #mon-pop .log{height:240px;overflow:auto;background:#07080a;border:1px solid #1c1d21;border-radius:8px;
        padding:6px 8px;font:11.5px 'Space Mono',monospace;color:#cdd2d8;white-space:pre;line-height:1.5}
      #mon-pop .log .noteon{color:var(--amber-ink,var(--amber))}
      #mon-pop .log .cc{color:#7fb2ff}
      #mon-pop .log .rt{color:#e2b23b}
      #mon-pop .empty{color:#6a7079}`;
    document.head.appendChild(css);

    const btn = document.createElement("a");
    btn.href = "#"; btn.id = "mon-btn"; btn.className = "sitelink"; btn.textContent = "MIDI Mon";
    btn.title = "Live log of MIDI reaching the device";

    const pop = document.createElement("div"); pop.id = "mon-pop";
    pop.innerHTML = `<div class="top"><b>MIDI monitor</b><span class="rate" id="mon-rate"></span>` +
      `<button type="button" id="mon-pause" title="Pause capture">Pause</button>` +
      `<button type="button" id="mon-copy" title="Copy visible log">Copy</button>` +
      `<button type="button" id="mon-clear">Clear</button></div>` +
      `<div class="filters">` +
      `<button type="button" class="on" data-f="note">Notes</button>` +
      `<button type="button" class="on" data-f="cc">CC</button>` +
      `<button type="button" class="on" data-f="other">Other</button></div>` +
      `<div class="log" id="mon-log"></div>`;
    document.body.appendChild(pop);
    const logEl = pop.querySelector("#mon-log"), rateEl = pop.querySelector("#mon-rate");
    const pauseBtn = pop.querySelector("#mon-pause");

    let open = false, lastKey = "", raf = 0, windowCounts = [];
    function cls(text) { return /^Note On/.test(text) ? "noteon" : /^CC/.test(text) ? "cc" : /^(Start|Stop|Continue)/.test(text) ? "rt" : ""; }
    function visible() {
      return log.filter((e) =>
        (e.kind === "note" && showNotes) || (e.kind === "cc" && showCc) || (e.kind === "other" && showOther));
    }
    function render(force) {
      const rows = visible();
      const key = rows.length + ":" + (rows.length ? rows[rows.length - 1].n : 0) + ":" + showNotes + showCc + showOther;
      if (!force && key === lastKey) return;
      lastKey = key;
      if (!rows.length) {
        logEl.innerHTML = `<span class="empty">${log.length ? "Filtered out — flip a filter chip." : "No MIDI yet — play the Keys, load a .mid, or press a pad."}</span>`;
        return;
      }
      const atBottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 4;
      logEl.innerHTML = rows.map((e) =>
        `<span class="${cls(e.text)}" title="${esc(e.raw || "")}">${esc(e.text)}</span>`).join("\n");
      if (atBottom) logEl.scrollTop = logEl.scrollHeight;
    }
    function tick() {
      if (!open) return;
      const now = performance.now ? performance.now() : Date.now();
      windowCounts.push({ n: counter, t: now });
      while (windowCounts.length && now - windowCounts[0].t > 1000) windowCounts.shift();
      const rate = windowCounts.length ? counter - windowCounts[0].n : 0;
      rateEl.textContent = (paused ? "paused · " : "") + (rate ? rate + "/s" : (counter ? counter + " msg" : ""));
      render();
      raf = requestAnimationFrame(tick);
    }
    onMsg = () => { if (open && !raf) raf = requestAnimationFrame(tick); };

    function place() { const r = (window.FM1PopAnchor && window.FM1PopAnchor(btn)) || btn.getBoundingClientRect(); pop.style.top = (r.bottom + 8) + "px"; pop.style.left = Math.round(Math.min(r.left, window.innerWidth - 332)) + "px"; }
    function openPop() { open = true; lastKey = ""; pop.classList.add("open"); place(); render(true); tick(); }
    function closePop() { open = false; pop.classList.remove("open"); cancelAnimationFrame(raf); raf = 0; }

    pauseBtn.onclick = () => {
      paused = !paused;
      pauseBtn.classList.toggle("on", paused);
      pauseBtn.textContent = paused ? "Resume" : "Pause";
    };
    pop.querySelector("#mon-clear").onclick = () => { log.length = 0; lastKey = ""; render(true); };
    pop.querySelector("#mon-copy").onclick = async (e) => {
      const text = visible().map((x) => x.text).join("\n");
      try {
        await navigator.clipboard.writeText(text || "");
        e.target.textContent = "Copied";
        setTimeout(() => { e.target.textContent = "Copy"; }, 900);
      } catch { e.target.textContent = "Failed"; }
    };
    pop.querySelectorAll(".filters button").forEach((b) => {
      b.onclick = () => {
        const f = b.dataset.f;
        if (f === "note") showNotes = !showNotes;
        if (f === "cc") showCc = !showCc;
        if (f === "other") showOther = !showOther;
        b.classList.toggle("on", f === "note" ? showNotes : f === "cc" ? showCc : showOther);
        render(true);
      };
    });
    btn.onclick = (e) => { e.preventDefault(); open ? closePop() : openPop(); };
    document.addEventListener("click", (e) => { if (open && !pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closePop(); });
    window.addEventListener("resize", () => { if (open) place(); });
    nav.insertBefore(btn, nav.firstChild ? nav.firstChild.nextSibling : null);

    window.FM1MidiMon._log = () => log.slice();
    window.FM1MidiMon._open = openPop;
    window.FM1MidiMon._close = closePop;
    window.FM1MidiMon.listening = () => open;
    window.FM1MidiMon._visible = visible;
  });

  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
})();
