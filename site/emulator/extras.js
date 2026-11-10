// Extra features for the FM-1 emulator fork: a firmware search box and a Resources panel linking the
// whole FM-1 ecosystem. Pure DOM, injected after the page builds.
(function () {
  "use strict";

  // Shared pop placement: menu items live in a display:none .tool-menu when closed, so
  // getBoundingClientRect() is 0×0 — fall back to the Menu/Studio trigger or the header.
  window.FM1PopAnchor = function (el) {
    const pick = (node) => {
      if (!node || !node.getBoundingClientRect) return null;
      const r = node.getBoundingClientRect();
      return (r.width >= 2 && r.height >= 2) ? r : null;
    };
    return pick(el)
      || pick(el && el.closest && el.closest(".tool-group")?.querySelector(".tool-group-btn"))
      || pick(document.querySelector("#tool-group-menu .tool-group-btn"))
      || pick(document.querySelector("#tool-group-studio .tool-group-btn"))
      || pick(document.querySelector("header.site .wrap"))
      || { left: 12, right: 172, top: 8, bottom: 40, width: 160, height: 28 };
  };

  function ready(fn) {
    const t = setInterval(() => {
      const sel = document.getElementById("fw");
      const side = document.querySelector(".side.bar") || document.querySelector(".side");
      if (sel && side) { clearInterval(t); fn(sel, side); }
    }, 120);
    setTimeout(() => clearInterval(t), 8000);
  }

  ready((fwSel, side) => {
    injectStyles();
    addSearch(fwSel);
    addQuickActions(fwSel);
    relocateMidi(fwSel);
    addFullscreen();
    addFullscreenControls(fwSel);
    addResources();
    wireMoreMenu();
  });

  // More ▾ uses position:fixed (same stacking fix as Studio/Menu) — place it under the summary.
  function wireMoreMenu() {
    const more = document.querySelector("details.site-more");
    const menu = more && more.querySelector(".site-more-menu");
    if (!more || !menu) return;
    const place = () => {
      const r = more.querySelector("summary").getBoundingClientRect();
      menu.style.top = `${Math.round(r.bottom + 4)}px`;
      menu.style.left = `${Math.round(Math.max(8, Math.min(r.right - menu.offsetWidth, window.innerWidth - 160)))}px`;
    };
    more.addEventListener("toggle", () => { if (more.open) place(); });
    window.addEventListener("resize", () => { if (more.open) place(); });
    window.addEventListener("scroll", () => { if (more.open) place(); }, true);
    const browse = document.getElementById("more-browse");
    const help = document.getElementById("more-help");
    if (browse) browse.addEventListener("click", (e) => {
      e.preventDefault(); more.open = false;
      const gal = document.getElementById("gal-btn");
      if (gal) gal.click();
    });
    if (help) help.addEventListener("click", (e) => {
      e.preventDefault(); more.open = false;
      if (window.FM1Help?.open) window.FM1Help.open();
      else document.getElementById("help-btn")?.click();
    });
    const hintHelp = document.getElementById("hint-help");
    if (hintHelp) hintHelp.addEventListener("click", (e) => {
      e.preventDefault();
      if (window.FM1Help?.open) window.FM1Help.open();
      else if (window.FM1Shortcuts?.open) window.FM1Shortcuts.open();
      else document.getElementById("help-btn")?.click();
    });
  }

  // in-panel controls popout (works anytime, essential in fullscreen since the page chrome is hidden):
  // firmware search/select, flash to the device, customize, exit
  function addFullscreenControls(fwSel) {
    const stage = document.querySelector(".stage"); if (!stage) return;
    if (getComputedStyle(stage).position === "static") stage.style.position = "relative";
    const fab = document.createElement("button");
    fab.id = "fs-ctrl-fab"; fab.type = "button"; fab.title = "Controls"; fab.textContent = "⚙";
    stage.appendChild(fab);
    const pop = document.createElement("div"); pop.id = "fs-ctrl-pop"; pop.hidden = true;
    pop.innerHTML = `
      <input id="fsc-search" type="search" placeholder="Search firmwares…" autocomplete="off">
      <select id="fsc-fw" aria-label="Firmware"></select>
      <button id="fsc-flash" class="primary">Install on FM-1</button>
      <p id="fsc-status"></p>
      <div class="fsc-row"><button id="fsc-cz">Customize</button><button id="fsc-exit">Exit</button></div>`;
    stage.appendChild(pop);
    const fscFw = pop.querySelector("#fsc-fw");
    for (const o of fwSel.options) fscFw.add(new Option(o.text, o.value));
    fscFw.value = fwSel.value;
    fscFw.onchange = () => { fwSel.value = fscFw.value; fwSel.dispatchEvent(new Event("change", { bubbles: true })); };
    fwSel.addEventListener("change", () => { fscFw.value = fwSel.value; });
    pop.querySelector("#fsc-search").oninput = (e) => {
      const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
      const t = fold(e.target.value.trim());
      const tokens = t ? t.split(/\s+/).filter(Boolean) : [];
      for (const o of fscFw.options) {
        const blob = fold([o.value, o.text, window.FM1?.fwText?.(o.value) || ""].join(" "));
        o.hidden = tokens.length > 0 && !tokens.every((tok) => blob.includes(tok));
      }
    };
    pop.querySelector("#fsc-flash").onclick = () => {
      const inst = document.getElementById("inst-fw"); if (inst) inst.value = fscFw.value;
      document.getElementById("inst-flash")?.click();
    };
    // mirror the install status into the popout so progress shows in fullscreen
    const instStatus = document.getElementById("inst-status");
    const fscStatus = pop.querySelector("#fsc-status");
    if (instStatus) new MutationObserver(() => { fscStatus.textContent = instStatus.textContent; }).observe(instStatus, { childList: true, characterData: true, subtree: true });
    pop.querySelector("#fsc-cz").onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      setTimeout(() => document.getElementById("fm1-cz-btn")?.click(), 60);
    };
    pop.querySelector("#fsc-exit").onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); pop.hidden = true; };
    fab.onclick = () => { pop.hidden = !pop.hidden; };
  }

  function addQuickActions(fwSel) {
    const search = document.getElementById("fw-search"); if (!search) return;
    const row = document.createElement("div"); row.className = "fw-quick";
    row.innerHTML = `<button type="button" id="fw-random">Random</button><button type="button" id="fw-share">Share</button>`;
    search.parentNode.insertBefore(row, search.nextSibling);
    row.querySelector("#fw-random").onclick = () => {
      const opts = [...fwSel.options].filter((o) => !o.hidden);
      const o = opts[Math.floor(Math.random() * opts.length)];
      if (o) { fwSel.value = o.value; fwSel.dispatchEvent(new Event("change", { bubbles: true })); }
    };
    const share = row.querySelector("#fw-share");
    share.onclick = async () => {
      const mhz = new URLSearchParams(location.search).get("mhz") || "";
      const url = location.origin + location.pathname + "?fw=" + encodeURIComponent(fwSel.value) + (mhz ? "&mhz=" + mhz : "");
      try { await navigator.clipboard.writeText(url); share.textContent = "✓ Copied"; } catch { share.textContent = "Copy failed"; }
      setTimeout(() => (share.textContent = "Share"), 1500);
    };
  }

  // bring the (already-wired) MIDI in/out controls back into the menu, compact
  function relocateMidi(fwSel) {
    const nowBox = fwSel.closest(".box"); if (!nowBox) return;
    const midi = document.getElementById("midiin");
    const midiOut = document.getElementById("midioutl");
    const midiLink = document.getElementById("midilinkl");
    const midch = document.getElementById("midichl");
    const midiAb = document.getElementById("midiabl");
    const midiId = document.getElementById("midi-identify");
    const midiIdTxt = document.getElementById("midi-identity");
    const midiFx = document.getElementById("midi-fx-warn");
    const hint = document.getElementById("midi-ble-hint");
    if (midi) nowBox.appendChild(midi);
    if (midiOut) nowBox.appendChild(midiOut);
    if (midiLink) nowBox.appendChild(midiLink);
    if (midch) nowBox.appendChild(midch);
    if (midiAb) nowBox.appendChild(midiAb);
    if (midiId) nowBox.appendChild(midiId);
    if (midiIdTxt) nowBox.appendChild(midiIdTxt);
    if (midiFx) nowBox.appendChild(midiFx);
    if (hint) nowBox.appendChild(hint);
  }

  // a fullscreen toggle for the panel
  function addFullscreen() {
    const dh = document.querySelector(".deck-head"); if (!dh) return;
    const b = document.createElement("button");
    b.id = "fs-btn"; b.type = "button"; b.textContent = "Fullscreen";
    b.onclick = () => {
      // fullscreen the whole machine column so the plugged-in devices (MIDI, Tape) come with it
      const st = document.querySelector(".player .deck") || document.querySelector(".stage"); if (!st) return;
      if (document.fullscreenElement) document.exitFullscreen();
      else st.requestFullscreen && st.requestFullscreen();
    };
    dh.appendChild(b);
  }

  function injectStyles() {
    if (document.getElementById("fm1-extra-css")) return;
    const el = document.createElement("style");
    el.id = "fm1-extra-css";
    el.textContent = `
      #fw-search{width:100%;background:var(--well);border:1px solid var(--line);color:var(--ink);
        border-radius:7px;padding:6px 9px;font:inherit;font-size:12.5px;margin-bottom:6px;outline:none}
      #fw-search:focus{border-color:var(--amber)}
      #fw-search-wrap{position:relative;margin-bottom:6px}
      #fw-search-results{position:absolute;z-index:80;left:0;right:0;top:calc(100% - 2px);max-height:220px;overflow:auto;
        list-style:none;margin:0;padding:4px;display:grid;gap:2px;background:var(--ui-pop,#0c0d0f);
        border:1px solid var(--line);border-radius:0 0 8px 8px;box-shadow:0 10px 28px rgba(0,0,0,.45)}
      #fw-search-results[hidden]{display:none!important}
      .fw-search-hit{display:block;width:100%;text-align:left;background:transparent;border:0;color:var(--ink);
        border-radius:6px;padding:6px 8px;font:12px/1.25 'Space Grotesk',sans-serif;cursor:pointer}
      .fw-search-hit:hover,.fw-search-hit:focus-visible{background:var(--well);outline:none}
      .fw-search-hit small{display:block;color:var(--dim);font-size:10.5px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .fw-filters{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 7px}
      .fw-chip{background:var(--well);border:1px solid var(--line);color:var(--dim);border-radius:999px;
        padding:3px 11px;font:600 11.5px 'Space Grotesk',-apple-system,sans-serif;cursor:pointer}
      .fw-chip:hover{color:var(--ink);border-color:var(--amber)}
      .fw-chip.on{background:var(--amber);color:var(--ui-on-accent,#180a02);border-color:transparent}
      #res-btn{cursor:pointer}
      #res-pop{position:fixed;z-index:9997;width:280px;max-width:92vw;max-height:72vh;overflow:auto;
        background:var(--ui-pop,#0c0d0f);border:1px solid var(--ui-line,#232428);border-radius:10px;box-shadow:0 12px 34px rgba(0,0,0,.6)}
      #res-pop .grp{padding:6px 12px 10px}
      #res-pop h4{margin:9px 0 3px;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--dim)}
      #res-pop a{display:block;color:var(--text);text-decoration:none;font-size:12.5px;padding:3px 0}
      #res-pop a:hover{color:var(--amber-ink, var(--amber))}
      #fs-btn{background:var(--amber);border:0;color:var(--ui-on-accent,#180a02);border-radius:7px;font-weight:700;
        padding:5px 10px;font:inherit;font-size:11.5px;cursor:pointer}
      #fs-btn:hover{background:var(--amber-hi)}
      .fw-quick{display:flex;gap:6px;margin-bottom:6px}
      .fw-quick button{flex:1;background:var(--well);border:1px solid var(--line);color:var(--text);
        border-radius:7px;padding:5px;font:inherit;font-size:11.5px;cursor:pointer}
      .fw-quick button:hover{border-color:var(--amber);color:var(--ink)}
      header.site .gh{display:none !important;}
      #fs-ctrl-fab{position:absolute;top:10px;right:10px;z-index:40;width:34px;height:34px;border-radius:50%;
        background:rgba(18,18,20,.82);border:1px solid var(--ui-line,#333);color:#fff;font-size:16px;cursor:pointer;line-height:1}
      #fs-ctrl-fab:hover{background:var(--amber);color:var(--ui-on-accent,#180a02);border-color:transparent}
      #fs-ctrl-pop{position:absolute;top:52px;right:10px;z-index:41;width:240px;max-width:90%;background:var(--ui-pop,#0c0d0f);
        border:1px solid var(--ui-line,#2a2c31);border-radius:10px;box-shadow:0 12px 34px rgba(0,0,0,.6);padding:10px;display:flex;flex-direction:column;gap:7px}
      #fs-ctrl-pop input,#fs-ctrl-pop select{background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text,#e9edf2);border-radius:7px;padding:6px 8px;font:inherit;font-size:12.5px;width:100%}
      #fs-ctrl-pop button{background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text,#e9edf2);border-radius:7px;padding:7px;font:inherit;font-size:12.5px;cursor:pointer}
      #fs-ctrl-pop button.primary{background:var(--amber);color:var(--ui-on-accent,#180a02);border:0;font-weight:600}
      #fs-ctrl-pop .fsc-row{display:flex;gap:6px}#fs-ctrl-pop .fsc-row>*{flex:1}
      #fsc-status{font-size:11.5px;color:var(--ui-text2,#cfd4da);min-height:1em;margin:0}
    `;
    document.head.appendChild(el);
  }

  function addSearch(fwSel) {
    const label = document.getElementById("fwlabel") || fwSel.closest("label") || fwSel;
    const wrap = document.createElement("div"); wrap.id = "fw-search-wrap";
    const s = document.createElement("input");
    s.type = "search"; s.id = "fw-search"; s.placeholder = `Search ${fwSel.options.length} firmwares (name or what it does)…`;
    s.autocomplete = "off"; s.setAttribute("aria-controls", "fw-search-results");
    const results = document.createElement("div");
    results.id = "fw-search-results"; results.hidden = true; results.setAttribute("role", "listbox");
    results.setAttribute("aria-label", "Firmware search results");
    wrap.append(s, results);
    // the list may still be filling when this mounts: keep the count in the hint current
    new MutationObserver(() => { s.placeholder = `Search ${fwSel.options.length} firmwares (name or what it does)…`; }).observe(fwSel, { childList: true });
    label.parentNode.insertBefore(wrap, label);
    // filter chips: samplers, starred favorites, and firmwares you've annotated
    let samplerOnly = false, favOnly = false, notesOnly = false;
    const chips = document.createElement("div"); chips.className = "fw-filters";
    const samp = document.createElement("button"); samp.type = "button"; samp.className = "fw-chip"; samp.textContent = "Samplers";
    samp.title = "Show only firmwares that sample audio you feed in (use the Tape device)";
    const fav = document.createElement("button"); fav.type = "button"; fav.className = "fw-chip"; fav.textContent = "★ Favorites";
    fav.title = "Show only the firmwares you've starred";
    const notesChip = document.createElement("button"); notesChip.type = "button"; notesChip.className = "fw-chip"; notesChip.textContent = "Notes";
    notesChip.title = "Show only firmwares you've written a personal note for";
    chips.append(samp, fav, notesChip);
    label.parentNode.insertBefore(chips, label);
    const FM = () => window.FM1;
    // Fold accents so "coqui" still finds "COQUÍ".
    const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    const noteOf = (id) => (window.FM1Notes && window.FM1Notes.get(id)) || "";
    const textOf = (o) => fold([o.value, o.text, FM()?.fwText?.(o.value) || "", noteOf(o.value)].filter(Boolean).join(" "));
    const isSamp = (o) => FM() && FM().isSampler && FM().isSampler(o.value);
    const isFav = (o) => window.FM1Fav && window.FM1Fav.has(o.value);
    const hasNote = (o) => !!(window.FM1Notes && window.FM1Notes.has(o.value));
    const pick = (id) => {
      if (!id || ![...fwSel.options].some((o) => o.value === id)) return;
      fwSel.value = id;
      fwSel.dispatchEvent(new Event("change", { bubbles: true }));
      results.hidden = true;
      s.blur();
    };
    function apply() {
      const t = fold(s.value.trim());
      const tokens = t ? t.split(/\s+/).filter(Boolean) : [];
      const hits = [];
      for (const o of fwSel.options) {
        if (!o.value) { o.hidden = true; continue; }
        const blob = textOf(o);
        const matchText = !tokens.length || tokens.every((tok) => blob.includes(tok));
        const hit = matchText && (!samplerOnly || isSamp(o)) && (!favOnly || isFav(o)) && (!notesOnly || hasNote(o));
        o.hidden = !hit;
        if (hit) hits.push(o);
      }
      const inst = document.getElementById("inst-fw");
      if (inst) for (const o of inst.options) {
        if (!o.value) continue;
        const blob = textOf(o);
        o.hidden = (tokens.length && !tokens.every((tok) => blob.includes(tok))) || (samplerOnly && !isSamp(o)) || (favOnly && !isFav(o)) || (notesOnly && !hasNote(o));
      }
      // Visible result list only while typing (empty query keeps the select usable).
      if (!tokens.length) { results.hidden = true; results.replaceChildren(); return; }
      results.hidden = false;
      results.replaceChildren();
      const shown = hits.slice(0, 40);
      if (!shown.length) {
        const empty = document.createElement("div");
        empty.className = "fw-search-empty"; empty.style.cssText = "padding:7px 8px;color:var(--dim);font-size:12px";
        empty.textContent = "No firmwares match";
        results.appendChild(empty);
        return;
      }
      for (const o of shown) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "fw-search-hit"; b.dataset.id = o.value;
        b.setAttribute("role", "option");
        const labelText = o.textContent || o.value;
        b.append(labelText);
        const detail = (FM()?.fwText?.(o.value) || "").trim();
        if (detail && detail !== labelText.toLowerCase()) {
          const small = document.createElement("small");
          small.textContent = detail.slice(0, 120);
          b.appendChild(small);
        }
        b.onclick = () => pick(o.value);
        results.appendChild(b);
      }
    }
    s.addEventListener("input", apply);
    s.addEventListener("focus", () => { if (s.value.trim()) apply(); });
    samp.addEventListener("click", () => { samplerOnly = !samplerOnly; samp.classList.toggle("on", samplerOnly); apply(); });
    fav.addEventListener("click", () => { favOnly = !favOnly; fav.classList.toggle("on", favOnly); apply(); });
    notesChip.addEventListener("click", () => { notesOnly = !notesOnly; notesChip.classList.toggle("on", notesOnly); apply(); });
    // Enter loads the first match
    s.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { results.hidden = true; return; }
      if (e.key !== "Enter") return;
      const first = results.querySelector(".fw-search-hit[data-id]");
      if (first) { e.preventDefault(); pick(first.dataset.id); return; }
      const m = [...fwSel.options].find((o) => o.value && !o.hidden);
      if (m) pick(m.value);
    });
    document.addEventListener("pointerdown", (e) => {
      if (!results.hidden && !wrap.contains(e.target)) results.hidden = true;
    });
  }

  function addResources() {
    const L = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text} ↗</a>`;
    const links = `<div class="grp">
      <h4>This app</h4>
      ${L("https://github.com/briksquared/fm1-emulator", "Source on GitHub")}
      ${L("https://github.com/briksquared/fm1-emulator/releases", "Desktop releases")}
      <h4>Official</h4>
      ${L("https://www.m-vave.com/download", "M-VAVE downloads (stock FW)")}
      ${L("https://github.com/m-vave/fm1_open", "M-VAVE FM1 Open SDK")}
      ${L("https://open.m-vave.com/fm1-workbench", "M-VAVE online workbench")}
      <h4>Community</h4>
      ${L(globalThis.FM1Source.page(), "Open-license firmware catalog")}
      ${L("https://www.reddit.com/r/MVaveFM1/", "r/MVaveFM1")}
      ${L("https://forum.m-vave.com/", "M-VAVE forum")}
    </div>`;
    const nav = document.querySelector(".sitenav") || document.querySelector("header.site .wrap");
    const btn = document.createElement("a");
    btn.href = "#"; btn.id = "res-btn"; btn.textContent = "Resources";
    if (nav) nav.appendChild(btn); else document.body.appendChild(btn);
    // App updates → GitHub Releases. Desktop uses the IPC check; browser opens the releases page.
    if (nav && !document.getElementById("app-upd-btn")) {
      const RELEASES = "https://github.com/briksquared/fm1-emulator/releases";
      const upd = document.createElement("button");
      upd.type = "button"; upd.id = "app-upd-btn"; upd.textContent = "Updates";
      upd.title = window.FM1Desktop?.checkUpdates
        ? "Check for a newer FM-1 Emulator desktop build"
        : "Open GitHub Releases for FM-1 Emulator";
      upd.onclick = async () => {
        upd.disabled = true;
        try {
          if (window.FM1Desktop?.checkUpdates) await window.FM1Desktop.checkUpdates();
          else window.open(RELEASES, "_blank", "noopener");
        } catch (e) {
          window.FM1Issues?.show?.("app-update", { title: "Update check failed", text: String(e?.message || e), level: "error" });
          window.open(RELEASES, "_blank", "noopener");
        } finally { upd.disabled = false; }
      };
      nav.appendChild(upd);
    }
    const pop = document.createElement("div"); pop.id = "res-pop"; pop.hidden = true; pop.innerHTML = links;
    document.body.appendChild(pop);
    const place = () => { const r = (window.FM1PopAnchor && window.FM1PopAnchor(btn)) || btn.getBoundingClientRect(); pop.style.top = (r.bottom + 6) + "px"; pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 292)) + "px"; };
    btn.addEventListener("click", (e) => { e.preventDefault(); pop.hidden = !pop.hidden; if (!pop.hidden) place(); });
    window.addEventListener("resize", () => { if (!pop.hidden) place(); });
    document.addEventListener("click", (e) => { if (e.target !== btn && !pop.contains(e.target)) pop.hidden = true; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") pop.hidden = true; });
  }
})();
