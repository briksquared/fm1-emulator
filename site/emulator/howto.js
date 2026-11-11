// Whole-app how-to overlay. Opens from Menu → How to, More → How to, and Ctrl/Cmd+K.
(function () {
  "use strict";

  const SECTIONS = [
    {
      id: "quick",
      title: "Quick start",
      body: `
        <ol>
          <li><b>Pick a firmware</b> in the left panel (Felucca is the default). Search matches names and descriptions.</li>
          <li>Press <b>Start</b> — browsers only play sound after a click. Changing firmware or clock reboots the synth.</li>
          <li><b>Play</b> with the computer keyboard, mouse/touch on the panel, <b>Keys</b> under Menu, or a MIDI controller under <b>Play from</b>.</li>
          <li>Optional: plug a real FM-1 with a <b>USB data</b> cable, press <b>Check</b> in Install firmware, then install when you mean to flash.</li>
        </ol>
        <p class="ht-note">Status line = clock, speed vs real time, and audio-thread load. If sound breaks up, drop the clock or raise <b>Audio buffer</b>.</p>`,
    },
    {
      id: "play",
      title: "Playing the panel",
      body: `
        <h4>Computer keyboard</h4>
        <ul>
          <li><kbd>A</kbd>–<kbd>'</kbd> notes (C4–F5); black keys on <kbd>W E T Y U O P</kbd></li>
          <li><kbd>Z</kbd>/<kbd>X</kbd> octave · <kbd>Space</kbd> PLAY · <kbd>R</kbd> REC</li>
          <li><kbd>1</kbd>–<kbd>0</kbd> panel buttons · <kbd>←</kbd><kbd>→</kbd> SELECT · <kbd>↑</kbd><kbd>↓</kbd> PRESETS</li>
          <li>Knobs: drag up/down or scroll — MASTER is volume</li>
        </ul>
        <h4>Mouse &amp; touch</h4>
        <ul>
          <li>Click keys/buttons; drag across keys for a glissando</li>
          <li>Touch: multi-finger chords; hold a key while turning a knob</li>
          <li>Phone: rotate sideways for a bigger synth</li>
          <li>Use <b>Focus</b> in the header (next to Flash) to enlarge the <b>LCD screen</b>; close with <b>✕</b> or <b>Escape</b> (panel clicks keep playing)</li>
        </ul>
        <p class="ht-note">The real FM-1 has no touchscreen — menus are knobs and buttons. SELECT moves pages; FX / EDIT / … choose modes.</p>`,
    },
    {
      id: "studio",
      title: "Studio menu",
      body: `
        <ul>
          <li><b>Play</b> — transpose, chord harmonizer, scale lock, arpeggiator (saved on this device)</li>
          <li><b>Turbo</b> — toggle the JIT (faster on most firmwares)</li>
          <li><b>MIDI Mon</b> — live MIDI log; pause, filter, copy</li>
          <li><b>Audio</b> — record output to a <code>.wav</code></li>
          <li><b>Snapshot</b> — PNG of the panel</li>
          <li><b>FX CC</b> — map CCs to stock Effect Chn (V15 / V16)</li>
          <li><b>Panel host</b> — map hardware panel MIDI into the emulated panel</li>
        </ul>
        <p>Under the machine: <b>MIDI</b> (on-screen Keys + pattern player + clock) and <b>Tape</b> (feed audio into samplers; Rec captures output).</p>`,
    },
    {
      id: "menu",
      title: "Menu tools",
      body: `
        <ul>
          <li><b>Browse</b> — firmware gallery / cards</li>
          <li><b>Resources</b> — links and docs for this build</li>
          <li><b>Keys</b> — full on-screen keyboard with velocity, pads, presets</li>
          <li><b>Stickers</b> — decorate the case</li>
          <li><b>Banks</b> — DX7 32-voice banks into DX7-capable firmwares; SysEx send to hardware when MIDI out is set</li>
          <li><b>Session</b> — export / import UI prefs and favorites</li>
          <li><b>Customize</b> — colors, skins, brand look</li>
          <li><b>Help</b> — shortcut list · <b>How to</b> — this guide</li>
          <li><b>Updates</b> — check for a newer desktop app</li>
        </ul>
        <p>Press <kbd>Ctrl</kbd>+<kbd>K</kbd> (Mac: <kbd>⌘</kbd>+<kbd>K</kbd>) any time for the command palette — firmwares and tools by name.</p>`,
    },
    {
      id: "midi",
      title: "MIDI in / out",
      body: `
        <ol>
          <li>Connect a controller (USB) or pair an FM-1 in Windows Bluetooth settings.</li>
          <li>Under <b>Play from</b>, pick <b>MIDI in</b> and/or <b>MIDI out</b>. Desktop auto-picks an FM-1-named port the first time.</li>
          <li>Allow MIDI / SysEx when asked (desktop grants it for this app).</li>
          <li>Press <b>Start</b> before expecting notes to sound.</li>
        </ol>
        <ul>
          <li><b>Link in ↔ out</b> — choosing in also selects matching out</li>
          <li><b>Channel</b> — remap play channel (“as sent” leaves bytes alone)</li>
          <li><b>A/B</b> — both / emu only / hardware only</li>
          <li><b>Identify FM-1</b> — same SysEx handshake as Install → Check</li>
        </ul>
        <p class="ht-note">Hardware MIDI in is not echoed to out (no feedback loop). Flashing needs <b>USB</b>; Bluetooth MIDI is for play only. Safari has no Web MIDI.</p>
        <p>Stock M-VAVE firmware listens on channel <b>2</b> here; Felucca parts often use 1–4. Some firmwares ignore plain note-on (see firmware info tags).</p>`,
    },
    {
      id: "saves",
      title: "Saves &amp; firmwares",
      body: `
        <ul>
          <li><b>Your save</b> — settings/patches written to flash are kept automatically; <b>Save now</b>, Export / Import backups</li>
          <li><b>Open .fwsc…</b> — load a local update package; drag-and-drop works too</li>
          <li><b>DX7 bank…</b> — 32-voice <code>.syx</code> into stock-style engines</li>
          <li><b>Firmware radar</b> — scan the live open-source catalog; closed licenses are skipped; nothing downloads until you add and run a find</li>
          <li><b>Check for firmware updates</b> (under Your save → More) fetches a newer package for the current entry without wiping older saves</li>
        </ul>
        <p class="ht-note">Clearing browser / app profile data removes local saves. M-VAVE stock is not redistributed; open your own <code>.fwsc</code> to run it.</p>`,
    },
    {
      id: "flash",
      title: "Install on a real FM-1",
      body: `
        <ol>
          <li>Use a <b>USB data</b> cable (charge-only cables carry no MIDI). Switch the unit on.</li>
          <li>Open <b>Install firmware</b>, pick a package, press <b>Check</b> — you want identity like <code>FM-1_…</code> and green <b>CONNECTED</b>.</li>
          <li>Press <b>Install</b>, confirm Yes, keep power until it restarts.</li>
          <li>If an install stops: <b>Finish interrupted install</b> or <b>Roll back</b> (when a previous package is still kept here). <b>Recovery and help</b> has the next steps.</li>
        </ol>
        <p class="ht-warn">This app does <b>not</b> back up flash or songs. You flash at your own risk — the author is not responsible if a unit is bricked or damaged. Fail-safes (Check, journal, Finish, Roll back, Advanced recovery) still apply.</p>
        <ul>
          <li><b>PLUGGED IN</b> = a port is visible · <b>CONNECTED</b> = Check got an FM-1 identity</li>
          <li><b>NO ANSWER</b> = close DAWs / other MIDI apps, try another cable/port, then Check again</li>
          <li><b>PORT BUSY</b> = something else holds the USB-MIDI port</li>
        </ul>`,
    },
    {
      id: "trouble",
      title: "If something fails",
      body: `
        <ul>
          <li><b>No sound</b> — press Start; raise MASTER; try a larger audio buffer; close DevTools (they slow the emu a lot)</li>
          <li><b>Dropouts</b> — lower clock or raise buffer; notice chip offers a fix</li>
          <li><b>MIDI quiet</b> — Start first; correct channel; Identify / Check on desktop with SysEx allowed</li>
          <li><b>Firmware won't boot</b> — try another package; open a known-good <code>.fwsc</code>; report with Copy diagnostics</li>
          <li><b>Settings gone</b> — profile / browser data was cleared; re-import a backup if you have one</li>
        </ul>
        <p>Full docs on GitHub: Installation, Troubleshooting, Firmware, Recovery. Report issues from the footer or Help → diagnostics.</p>`,
    },
    {
      id: "more",
      title: "Also good to know",
      body: `
        <ul>
          <li>Unofficial — not affiliated with M-VAVE</li>
          <li>Only open-license, boot-checked firmwares are bundled; radar skips closed licenses</li>
          <li>Plugin builds (AU / VST3 / CLAP) ship with releases when available</li>
          <li><a href="fm1-sid/" target="_blank" rel="noopener">FM-1 SID</a> — C64 SID-style firmware playground</li>
          <li>Source: <a href="https://github.com/briksquared/fm1-emulator" target="_blank" rel="noopener">github.com/briksquared/fm1-emulator</a></li>
        </ul>`,
    },
  ];

  function ready(fn) {
    const t = setInterval(() => {
      const nav = document.querySelector("#site-menu-host") || document.querySelector(".sitenav") || document.querySelector("header.site .wrap");
      if (nav && document.body) { clearInterval(t); fn(nav); }
    }, 100);
    setTimeout(() => clearInterval(t), 9000);
  }

  ready((nav) => {
    const css = document.createElement("style");
    css.textContent = `
      #howto-ov{position:fixed;inset:0;z-index:10010;background:rgba(6,7,9,.62);backdrop-filter:blur(3px);
        display:none;align-items:flex-start;justify-content:center;padding:0 10px}
      #howto-ov.open{display:flex}
      #howto-box{margin-top:6vh;width:720px;max-width:96vw;max-height:86vh;display:flex;flex-direction:column;
        background:#0d0e11;border:1px solid #262830;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.6);
        font:14px 'Space Grotesk',-apple-system,Segoe UI,Roboto,sans-serif;color:#e9edf2;overflow:hidden}
      #howto-head{display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid #1d1f25;flex:none}
      #howto-head h2{margin:0;font-size:17px;flex:1}
      #howto-close{cursor:pointer;color:#8c93a0;border:1px solid #2a2c31;border-radius:7px;padding:3px 9px;font-size:12px;background:transparent}
      #howto-close:hover{border-color:var(--amber);color:#e9edf2}
      #howto-body{display:flex;min-height:0;flex:1}
      #howto-toc{flex:0 0 168px;overflow:auto;padding:10px 8px;border-right:1px solid #1d1f25;display:flex;flex-direction:column;gap:2px}
      #howto-toc button{text-align:left;border:0;background:transparent;color:#9aa1ab;font:600 12px inherit;padding:7px 8px;border-radius:7px;cursor:pointer}
      #howto-toc button:hover,#howto-toc button.on{background:#17181b;color:#e9edf2}
      #howto-main{flex:1;overflow:auto;padding:14px 18px 22px;line-height:1.45}
      #howto-main h3{margin:0 0 10px;font-size:16px}
      #howto-main h4{margin:14px 0 6px;font-size:13px;color:var(--amber-ink,var(--amber))}
      #howto-main ol,#howto-main ul{margin:0 0 10px;padding-left:1.2em}
      #howto-main li{margin:0 0 5px}
      #howto-main p{margin:0 0 10px;color:#c2c7cf}
      #howto-main .ht-note{font-size:12.5px;color:#8c93a0}
      #howto-main .ht-warn{font-size:12.5px;color:#e7a35a;border:1px solid color-mix(in srgb,#e7a35a 45%,#2a2c31);
        background:color-mix(in srgb,#e7a35a 10%,#0d0e11);border-radius:8px;padding:8px 10px}
      #howto-main kbd{font:600 11px 'Space Mono',monospace;color:#cdd2d8;background:#1a1c20;border:1px solid #2c2f35;border-radius:5px;padding:1px 6px}
      #howto-main a{color:var(--amber-ink,var(--amber))}
      @media (max-width:640px){
        #howto-body{flex-direction:column}
        #howto-toc{flex:none;flex-direction:row;flex-wrap:wrap;border-right:0;border-bottom:1px solid #1d1f25;max-height:28vh}
      }`;
    document.head.appendChild(css);

    const ov = document.createElement("div");
    ov.id = "howto-ov";
    ov.innerHTML = `<div id="howto-box" role="dialog" aria-modal="true" aria-labelledby="howto-title">
      <div id="howto-head"><h2 id="howto-title">How to use FM-1 Emulator</h2><button type="button" id="howto-close">Esc</button></div>
      <div id="howto-body"><nav id="howto-toc" aria-label="How-to sections"></nav><div id="howto-main"></div></div>
    </div>`;
    document.body.appendChild(ov);

    const toc = ov.querySelector("#howto-toc");
    const main = ov.querySelector("#howto-main");
    let cur = SECTIONS[0].id;
    let open = false;

    function show(id) {
      const sec = SECTIONS.find((s) => s.id === id) || SECTIONS[0];
      cur = sec.id;
      for (const b of toc.querySelectorAll("button")) b.classList.toggle("on", b.dataset.id === cur);
      main.innerHTML = `<h3>${sec.title}</h3>${sec.body}`;
      main.scrollTop = 0;
    }

    for (const s of SECTIONS) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.id = s.id;
      b.textContent = s.title;
      b.onclick = () => show(s.id);
      toc.appendChild(b);
    }
    show(cur);

    const openHowto = (section) => {
      open = true;
      ov.classList.add("open");
      if (section) show(section);
      try { window.FM1Tools?.close?.(); } catch { /* ignore */ }
    };
    const closeHowto = () => { open = false; ov.classList.remove("open"); };

    ov.querySelector("#howto-close").onclick = closeHowto;
    ov.addEventListener("click", (e) => { if (e.target === ov) closeHowto(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && open) { e.stopPropagation(); closeHowto(); }
    });

    const btn = document.createElement("a");
    btn.href = "#";
    btn.id = "howto-btn";
    btn.className = "sitelink";
    btn.textContent = "How to";
    btn.title = "How to use the whole app";
    btn.onclick = (e) => { e.preventDefault(); open ? closeHowto() : openHowto(); };
    // Prefer Menu host; toolgroup will fold this into Menu ▾ when it mounts.
    nav.appendChild(btn);

    // More ▾ link
    const moreMenu = document.querySelector(".site-more-menu");
    if (moreMenu && !document.getElementById("more-howto")) {
      const a = document.createElement("a");
      a.href = "#";
      a.id = "more-howto";
      a.textContent = "How to";
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const more = document.querySelector("details.site-more");
        if (more) more.open = false;
        openHowto();
      });
      const helpLink = document.getElementById("more-help");
      if (helpLink) moreMenu.insertBefore(a, helpLink);
      else moreMenu.appendChild(a);
    }

    window.FM1Howto = {
      open: openHowto,
      close: closeHowto,
      isOpen: () => open,
      sections: () => SECTIONS.map((s) => s.id),
    };
  });
})();
