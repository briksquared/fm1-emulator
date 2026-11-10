// Keyboard shortcuts & help overlay. A session's worth of power features hide
// behind shortcuts (the command palette especially) that nobody would discover.
// Opens on "?" (Shift+/) when not typing, from the command palette, and from a
// small "?" affordance. Platform-aware: shows Cmd on a Mac, Ctrl elsewhere.
(function () {
  "use strict";

  // Pure, unit-tested: the modifier label for this platform.
  function modLabel(platform) {
    return /Mac|iPhone|iPad|iPod/i.test(platform || "") ? "⌘" : "Ctrl";
  }
  // The shortcut catalogue (data, so it can be checked and rendered uniformly).
  function shortcuts(mod) {
    const M = mod || "Ctrl";
    return [
      { group: "Navigate", items: [
        { keys: [M + "+K"], desc: "Command palette — jump to any firmware or tool" },
        { keys: ["B"], desc: "Browse the firmware gallery" },
        { keys: ["?"], desc: "Shortcut list (this panel: the ? link)" },
        { keys: ["I"], desc: "Details of the selected firmware" },
        { keys: ["M"], desc: "Add or remove the selected firmware from favorites" },
        { keys: ["[", "]"], desc: "Previous / next firmware in the list" },
        { keys: [M + "+K", "info"], desc: "Firmware info — author, licence, source link" },
      ] },
      { group: "Play", items: [
        { keys: [M + "+."], desc: "Panic — silence all notes" },
        { keys: ["Keys"], desc: "On-screen keyboard (letters play notes)" },
        { keys: ["Studio", "Play"], desc: "Play assist panel — transpose, chords, scale lock, arp (persists)" },
        { keys: [M + "+K", "audition"], desc: "Audition — play a short riff to hear the firmware" },
        { keys: [M + "+K", "transpose"], desc: "Shift everything you play up/down an octave or semitone" },
        { keys: [M + "+K", "chord"], desc: "Harmonize — turn single notes into power 5ths, triads or 7ths" },
        { keys: [M + "+K", "arp"], desc: "Arpeggiate — step through held notes (up/down/random, with a rate)" },
        { keys: [M + "+K", "scale"], desc: "Scale lock — snap what you play to a key so you can't hit a wrong note" },
      ] },
      { group: "Capture", items: [
        { keys: ["Studio", "Audio"], desc: "Record the output to a .wav" },
        { keys: ["Rec"], desc: "Record MIDI; mix, keep and bounce takes" },
        { keys: ["Studio", "Snapshot"], desc: "Save the panel as a PNG" },
      ] },
      { group: "Visualise", items: [
        { keys: ["Studio", "Scope"], desc: "Oscilloscope, stereo meter, spectrum" },
        { keys: ["Studio", "Tuner"], desc: "Detect the output pitch — note and cents (A4 reference)" },
        { keys: ["Studio", "MIDI Mon"], desc: "Live MIDI log — pause, filter notes/CC, copy" },
        { keys: ["Studio", "Turbo"], desc: "Toggle the JIT (faster on most firmwares)" },
      ] },
    ];
  }

  window.FM1Help = { modLabel, shortcuts };

  function ready(fn) {
    const t = setInterval(() => {
      const nav = document.querySelector(".sitenav") || document.querySelector("header.site .wrap");
      if (nav && document.body) { clearInterval(t); fn(nav); }
    }, 150);
    setTimeout(() => clearInterval(t), 9000);
  }
  ready((nav) => {
    const MOD = modLabel(navigator.platform);
    const css = document.createElement("style");
    css.textContent = `
      #help-ov{position:fixed;inset:0;z-index:10000;background:rgba(6,7,9,.6);backdrop-filter:blur(3px);
        display:none;align-items:flex-start;justify-content:center}
      #help-ov.open{display:flex}
      #help-box{margin-top:10vh;width:560px;max-width:92vw;max-height:78vh;overflow:auto;background:#0d0e11;
        border:1px solid #262830;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.6);padding:18px 20px;
        font:14px 'Space Grotesk',-apple-system,Segoe UI,Roboto,sans-serif;color:#e9edf2}
      #help-box h2{margin:0 0 2px;font-size:17px}
      #help-box .sub{color:#8c93a0;font-size:12px;margin-bottom:14px}
      #help-box .grp{font:600 10px 'Space Mono',monospace;color:var(--amber-ink,var(--amber));letter-spacing:.06em;
        text-transform:uppercase;margin:14px 0 6px}
      #help-box .row{display:flex;align-items:center;gap:10px;padding:5px 0}
      #help-box .row .keys{flex:0 0 150px;display:flex;gap:4px;flex-wrap:wrap}
      #help-box .row .keys .kk{font:600 11px 'Space Mono',monospace;color:#cdd2d8;background:#1a1c20;
        border:1px solid #2c2f35;border-radius:5px;padding:2px 7px}
      #help-box .row .d{color:#c2c7cf;font-size:13px}
      #help-close{float:right;cursor:pointer;color:#8c93a0;border:1px solid #2a2c31;border-radius:7px;
        padding:3px 9px;font-size:12px}`;
    document.head.appendChild(css);

    const ov = document.createElement("div"); ov.id = "help-ov";
    const data = shortcuts(MOD);
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const rows = data.map((sec) =>
      `<div class="grp">${esc(sec.group)}</div>` +
      sec.items.map((it) =>
        `<div class="row"><span class="keys">${it.keys.map((k) => `<span class="kk">${esc(k)}</span>`).join("")}</span>` +
        `<span class="d">${esc(it.desc)}</span></div>`).join("")).join("");
    ov.innerHTML = `<div id="help-box"><span id="help-close">Esc</span><h2>Shortcuts &amp; tools</h2>` +
      `<div class="sub">Press <b>${esc(MOD)}+K</b> any time to jump to a firmware or tool.</div>${rows}</div>`;
    document.body.appendChild(ov);

    let open = false;
    const openHelp = () => { open = true; ov.classList.add("open"); };
    const closeHelp = () => { open = false; ov.classList.remove("open"); };
    ov.querySelector("#help-close").onclick = closeHelp;
    ov.addEventListener("click", (e) => { if (e.target === ov) closeHelp(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && open) { closeHelp(); return; }
      const tag = (e.target.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || e.target.isContentEditable;
      // the "?" key belongs to the shortcut list (shortcuts.js) when it took it; this panel stays on the "?" link
      if (e.defaultPrevented) return;
      if (e.key === "?" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); open ? closeHelp() : openHelp(); }
    });

    // Small "?" nav affordance.
    const btn = document.createElement("a");
    btn.href = "#"; btn.id = "help-btn"; btn.className = "sitelink"; btn.textContent = "?";
    btn.title = "Keyboard shortcuts & tools";
    btn.onclick = (e) => { e.preventDefault(); open ? closeHelp() : openHelp(); };
    nav.appendChild(btn);

    window.FM1Help.open = openHelp;
    window.FM1Help.close = closeHelp;
  });
})();
