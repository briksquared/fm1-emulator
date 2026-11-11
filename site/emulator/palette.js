// Command palette (Ctrl/Cmd+K): type to load any of the 311 firmwares or run any
// tool, without hunting through menus. Uses Cmd+K so it never collides with the
// on-screen keyboard's letter-to-note mapping. Commands are gathered live from
// the firmware <select> and the tool buttons, so it stays in sync with whatever
// is installed and mounted.
(function () {
  "use strict";

  // Ranked substring filter (pure, unit-tested from app/test-palette.mjs).
  function scoreCmd(label, q) {
    if (!q) return 0.5;
    const L = label.toLowerCase(), Q = q.toLowerCase();
    const i = L.indexOf(Q);
    if (i < 0) return -1;
    if (i === 0) return 3;                  // prefix
    if (L[i - 1] === " ") return 2;         // word boundary
    return 1;                               // anywhere
  }
  // A command may carry `rank` (favourite 3 > recent 2 > tool 1 > firmware 0).
  // With no query, rank orders the list so favourites and recents sit on top;
  // with a query, the text score leads and rank only breaks ties.
  function filterCommands(cmds, q, limit) {
    const lim = limit || 40;
    const Q = (q || "").trim();
    return cmds
      .map((c) => ({ c, s: scoreCmd(c.label, Q) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => {
        if (!Q) return (b.c.rank || 0) - (a.c.rank || 0) || a.c.label.localeCompare(b.c.label);
        return b.s - a.s || (b.c.rank || 0) - (a.c.rank || 0) || a.c.label.localeCompare(b.c.label);
      })
      .slice(0, lim)
      .map((x) => x.c);
  }
  // The previously-played firmware (for an A/B flip): the most recent id that
  // is not the current one. null if there is nothing to flip back to.
  function pickPrevious(recent, curId) {
    for (const id of recent || []) if (id && id !== curId) return id;
    return null;
  }
  // A random firmware id that is not the current one. `rand` is injectable [0,1).
  function pickRandom(ids, curId, rand) {
    const pool = (ids || []).filter((id) => id && id !== curId && id !== "local");
    if (!pool.length) return null;
    const r = (rand || Math.random)();
    return pool[Math.min(pool.length - 1, Math.max(0, Math.floor(r * pool.length)))];
  }

  window.FM1Palette = { scoreCmd, filterCommands, pickPrevious, pickRandom };

  function ready(fn) {
    const t = setInterval(() => {
      const fwSel = document.getElementById("fw");
      if (fwSel && document.body) { clearInterval(t); fn(fwSel); }
    }, 150);
    setTimeout(() => clearInterval(t), 9000);
  }

  ready((fwSel) => {
    const css = document.createElement("style");
    css.textContent = `
      #pal-ov{position:fixed;inset:0;z-index:10000;background:rgba(6,7,9,.6);backdrop-filter:blur(3px);
        display:none;align-items:flex-start;justify-content:center}
      #pal-ov.open{display:flex}
      #pal-box{margin-top:12vh;width:540px;max-width:92vw;background:#0d0e11;border:1px solid #262830;
        border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.6);overflow:hidden;
        font:14px 'Space Grotesk',-apple-system,Segoe UI,Roboto,sans-serif;color:#e9edf2}
      #pal-q{width:100%;box-sizing:border-box;padding:15px 16px;background:transparent;border:0;
        border-bottom:1px solid #1d1f25;color:#e9edf2;font-size:16px;outline:none}
      #pal-list{max-height:52vh;overflow:auto;padding:6px}
      #pal-list .row{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:9px;cursor:pointer}
      #pal-list .row.sel{background:#1b1d22}
      #pal-list .row .k{font:600 9.5px 'Space Mono',monospace;color:#8c93a0;border:1px solid #2a2c31;
        border-radius:5px;padding:1px 6px;flex:0 0 auto}
      #pal-list .row .lbl{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #pal-list .row .grp{font:600 9.5px 'Space Mono',monospace;color:#6a7079}
      #pal-list .row .star{color:var(--amber-ink,var(--amber))}
      #pal-empty{padding:16px;color:#8c93a0;text-align:center}`;
    document.head.appendChild(css);

    const ov = document.createElement("div"); ov.id = "pal-ov";
    ov.innerHTML = `<div id="pal-box"><input id="pal-q" type="text" autocomplete="off" spellcheck="false"
      placeholder="Type a firmware or a command…  (Esc to close)"><div id="pal-list"></div></div>`;
    document.body.appendChild(ov);
    const q = ov.querySelector("#pal-q");
    const listEl = ov.querySelector("#pal-list");

    const trigger = (id) => { const b = document.getElementById(id); if (b) b.click(); };
    const Fav = () => window.FM1Fav || null;
    const Recent = () => (window.FM1Recent && window.FM1Recent.list && window.FM1Recent.list()) || [];
    // favorites.js prefixes a "★ " to a favourited firmware's <option> text; the
    // palette owns its own star, so read the clean name.
    const cleanName = (opt) => (opt && opt.textContent ? opt.textContent.trim().replace(/^★\s*/, "") : "");
    function commands() {
      const fav = Fav();
      const curId = fwSel.value;
      const curName = cleanName(fwSel.options[fwSel.selectedIndex]) || curId;
      const loadId = (id) => { if (!id) return; fwSel.value = id; fwSel.dispatchEvent(new Event("change", { bubbles: true })); };
      const nameOf = (id) => { for (const o of fwSel.options) if (o.value === id) return cleanName(o); return id; };
      const allIds = [...fwSel.options].map((o) => o.value).filter(Boolean);
      const prevId = pickPrevious(Recent(), curId);
      const cmds = [
        { label: "Browse firmwares", group: "open", rank: 1, run: () => trigger("gal-btn") },
        { label: prevId ? ("Flip to previous — " + nameOf(prevId)) : "Flip to previous firmware", group: "run", rank: 1,
          run: () => loadId(prevId || pickPrevious(Recent(), curId)) },
        { label: "Random firmware", group: "run", rank: 1, run: () => loadId(pickRandom(allIds, curId)) },
        { label: "Scope (oscilloscope + meter)", group: "tool", rank: 1, run: () => openTool("scope-btn") },
        { label: "Tuner (detect output pitch)", group: "tool", rank: 1, run: () => openTool("tuner-btn") },
        { label: "MIDI monitor (log messages)", group: "tool", rank: 1, run: () => openTool("mon-btn") },
        { label: "Audio recorder", group: "tool", rank: 1, run: () => openTool("wav-btn") },
        { label: "Snapshot (save panel PNG)", group: "tool", rank: 1, run: () => openTool("snap-btn") },
        { label: "Turbo (toggle JIT)", group: "tool", rank: 1, run: () => trigger("turbo-btn") },
        { label: "Keys (on-screen keyboard)", group: "open", rank: 1, run: () => trigger("keys-btn") },
        { label: "Record / Rec panel", group: "open", rank: 1, run: () => trigger("rec-btn") },
        { label: (document.getElementById("start") && !document.getElementById("start").disabled && window.FM1 && window.FM1.running && window.FM1.running()) ? "Restart firmware" : "Start the FM-1", group: "run", rank: 1, run: () => trigger("start") },
        { label: (window.FM1Audition && window.FM1Audition.playing()) ? "Stop audition" : "Audition — play a riff on this firmware", group: "run", rank: 1,
          run: () => { const A = window.FM1Audition; if (!A) return; A.playing() ? A.stop() : A.play(); } },
        { label: "Audition style: " + ((window.FM1Audition && window.FM1Audition.style && window.FM1Audition.style()) || "melody") + " (cycle)", group: "run", rank: 1,
          run: () => { const A = window.FM1Audition; if (!A || !A.cycleStyle) return; A.cycleStyle(); if (A.playing()) A.play(); } },
        ...((window.FM1Audition && window.FM1Audition.styles) ? window.FM1Audition.styles().map((st) => ({
          label: "Audition as " + st + (window.FM1Audition.style() === st ? "  ✓" : ""),
          group: "run", rank: 1,
          run: () => { window.FM1Audition.setStyle(st); window.FM1Audition.play(); },
        })) : []),
        { label: "Open Play assist panel", group: "tune", rank: 1, run: () => openTool("assist-btn") },
        { label: "Transpose octave up", group: "tune", rank: 1, run: () => window.FM1Transpose && window.FM1Transpose.shift(12) },
        { label: "Transpose octave down", group: "tune", rank: 1, run: () => window.FM1Transpose && window.FM1Transpose.shift(-12) },
        { label: "Transpose up a semitone", group: "tune", rank: 1, run: () => window.FM1Transpose && window.FM1Transpose.shift(1) },
        { label: "Transpose down a semitone", group: "tune", rank: 1, run: () => window.FM1Transpose && window.FM1Transpose.shift(-1) },
        { label: (window.FM1Transpose && window.FM1Transpose.get()) ? ("Reset transpose (now " + (window.FM1Transpose.get() > 0 ? "+" : "") + window.FM1Transpose.get() + ")") : "Transpose: off", group: "tune", rank: 1, run: () => window.FM1Transpose && window.FM1Transpose.reset() },
        { label: (window.FM1Chords && window.FM1Chords.get() !== "off") ? ("Chord: " + window.FM1Chords.label(window.FM1Chords.get()) + " — turn off") : "Chord harmonizer: off", group: "tune", rank: 1, run: () => window.FM1Chords && window.FM1Chords.off() },
        { label: (window.FM1Arp && window.FM1Arp.enabled()) ? ("Arpeggiator: on (" + window.FM1Arp.label(window.FM1Arp.get()) + ") — turn off") : "Arpeggiator — step through held notes", group: "tune", rank: 1, run: () => window.FM1Arp && window.FM1Arp.toggle() },
        { label: "Arp faster", group: "tune", rank: 1, run: () => window.FM1Arp && (window.FM1Arp.enable(), window.FM1Arp.faster()) },
        { label: "Arp slower", group: "tune", rank: 1, run: () => window.FM1Arp && (window.FM1Arp.enable(), window.FM1Arp.slower()) },
        { label: (window.FM1Scale && window.FM1Scale.enabled()) ? ("Scale lock: " + window.FM1Scale.rootName() + " " + window.FM1Scale.label(window.FM1Scale.get()) + " — turn off") : "Scale lock — play in a key", group: "tune", rank: 1, run: () => window.FM1Scale && window.FM1Scale.off() },
        { label: "Scale root up a semitone", group: "tune", rank: 1, run: () => window.FM1Scale && window.FM1Scale.rootUp() },
        { label: "Scale root down a semitone", group: "tune", rank: 1, run: () => window.FM1Scale && window.FM1Scale.rootDown() },
        { label: "Panic — silence all notes", group: "run", rank: 1, run: () => (window.FM1Panic && (window.FM1Panic.panicUI || window.FM1Panic.panic)()) },
        { label: "Firmware info (this firmware)", group: "open", rank: 1, run: () => (window.FM1Info && window.FM1Info.open && window.FM1Info.open(curId)) },
        { label: "How to use the app", group: "open", rank: 1, run: () => (window.FM1Howto && window.FM1Howto.open && window.FM1Howto.open()) },
        { label: "Keyboard shortcuts & help", group: "open", rank: 1, run: () => (window.FM1Help && window.FM1Help.open && window.FM1Help.open()) },
        { label: (window.FM1Focus && window.FM1Focus.isOn && window.FM1Focus.isOn()) ? "Focus mode — on (close with ✕ or Escape)" : "Focus mode — enlarge LCD screen",
          group: "tool", rank: 1, run: () => { if (window.FM1Focus && !window.FM1Focus.isOn()) window.FM1Focus.open(); } },
        // show / hide the bars and panels (layout.js)
        ...((window.FM1Layout && window.FM1Layout.commands && window.FM1Layout.commands()) || []),
      ];
      // One command per chord, so "chord" in the palette lists them all. The
      // current one is marked; "off" is handled by the toggle above.
      if (window.FM1Chords) {
        for (const name of window.FM1Chords.names()) {
          if (name === "off") continue;
          const on = window.FM1Chords.get() === name;
          cmds.push({ label: "Chord: " + window.FM1Chords.label(name) + (on ? "  ✓" : ""), group: "tune", rank: 1,
            run: () => window.FM1Chords.set(name) });
        }
      }
      // One command per arp pattern — selecting one turns the arp on in that mode.
      if (window.FM1Arp) {
        for (const m of window.FM1Arp.modes()) {
          const on = window.FM1Arp.enabled() && window.FM1Arp.get() === m;
          cmds.push({ label: "Arp: " + window.FM1Arp.label(m) + (on ? "  ✓" : ""), group: "tune", rank: 1,
            run: () => { window.FM1Arp.setMode(m); window.FM1Arp.enable(); } });
        }
      }
      // One command per scale — selecting one locks to it at the current root.
      if (window.FM1Scale) {
        const curRoot = window.FM1Scale.rootName();
        for (const s of window.FM1Scale.scales()) {
          if (s === "off") continue;
          const on = window.FM1Scale.enabled() && window.FM1Scale.get() === s;
          cmds.push({ label: "Scale: " + curRoot + " " + window.FM1Scale.label(s) + (on ? "  ✓" : ""), group: "tune", rank: 1,
            run: () => window.FM1Scale.setScale(s) });
        }
      }
      if (fav && curId && curId !== "local") {
        cmds.push({ label: (fav.has(curId) ? "Unfavourite " : "Favourite ") + curName, group: "star", rank: 1,
          run: () => { fav.toggle(curId); } });
      }
      // Recency rank: most-recent first → higher rank among recents.
      const recent = Recent();
      const recentRank = new Map(recent.map((id, i) => [id, recent.length - i]));
      // Live firmware list from the select, boosted by favourite and recency.
      for (const opt of fwSel.options) {
        if (!opt.value) continue;
        const id = opt.value;
        const isFav = !!(fav && fav.has(id));
        // Recents sit at rank 2 with a small recency boost, so the most recently
        // played leads within the group but all stay below favourites (3).
        const rank = isFav ? 3 : (recentRank.has(id) ? 2 + recentRank.get(id) / 100 : 0);
        cmds.push({ label: "Load " + cleanName(opt), group: "firmware", fav: isFav, rank,
          run: () => { fwSel.value = id; fwSel.dispatchEvent(new Event("change", { bubbles: true })); } });
      }
      return cmds;
    }
    // A tool lives in the Studio menu now; open that menu first so the tool's
    // popup positions against its (now visible) button.
    function openTool(id) {
      if (window.FM1Tools && window.FM1Tools.open) window.FM1Tools.open();
      const b = document.getElementById(id);
      if (b) b.click();
    }

    let all = [], shown = [], sel = 0, open = false;
    function render() {
      shown = filterCommands(all, q.value.trim());
      if (sel >= shown.length) sel = Math.max(0, shown.length - 1);
      if (!shown.length) { listEl.innerHTML = `<div id="pal-empty">No match</div>`; return; }
      listEl.innerHTML = shown.map((c, i) =>
        `<div class="row${i === sel ? " sel" : ""}" data-i="${i}">` +
        `<span class="lbl">${c.fav ? '<span class="star">★</span> ' : ""}${esc(c.label)}</span>` +
        `<span class="grp">${esc(c.group || "")}</span></div>`).join("");
      listEl.querySelectorAll(".row").forEach((r) => {
        r.onmousemove = () => { sel = +r.dataset.i; markSel(); };
        r.onclick = () => run(+r.dataset.i);
      });
      scrollSel();
    }
    function markSel() { listEl.querySelectorAll(".row").forEach((r, i) => r.classList.toggle("sel", i === sel)); }
    function scrollSel() { const r = listEl.querySelectorAll(".row")[sel]; if (r) r.scrollIntoView({ block: "nearest" }); }
    function run(i) { const c = shown[i]; if (!c) return; closePal(); try { c.run(); } catch (e) { console.warn("palette: command failed", e); } }

    function openPal() { all = commands(); sel = 0; q.value = ""; open = true; ov.classList.add("open"); render(); setTimeout(() => q.focus(), 20); }
    function closePal() { open = false; ov.classList.remove("open"); }

    q.addEventListener("input", () => { sel = 0; render(); });
    q.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); markSel(); scrollSel(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); markSel(); scrollSel(); }
      else if (e.key === "Enter") { e.preventDefault(); run(sel); }
      else if (e.key === "Escape") { e.preventDefault(); closePal(); }
    });
    ov.addEventListener("click", (e) => { if (e.target === ov) closePal(); });
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); open ? closePal() : openPal(); }
    });

    window.FM1Palette.open = openPal;
    window.FM1Palette.close = closePal;
    window.FM1Palette._commands = commands;
  });

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();
