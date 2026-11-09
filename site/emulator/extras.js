// Extra features for the FM-1 emulator fork: a firmware search box and a Resources hub linking the
// whole FM-1 ecosystem. Pure DOM, injected after the page builds.
(function () {
  "use strict";

  function ready(fn) {
    const t = setInterval(() => {
      const sel = document.getElementById("fw");
      const side = document.querySelector(".side.bar") || document.querySelector(".side");
      if (sel && side && sel.options.length && window.FM1Catalog && window.FM1) { clearInterval(t); fn(sel, side); }
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
  });

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
      <button id="fsc-flash" class="primary">⚡ Flash to FM-1</button>
      <p id="fsc-status"></p>
      <div class="fsc-row"><button id="fsc-cz">🎨 Customize</button><button id="fsc-exit">⛶ Exit</button></div>`;
    stage.appendChild(pop);
    const fscFw = pop.querySelector("#fsc-fw");
    for (const o of fwSel.options) fscFw.add(new Option(o.text, o.value));
    fscFw.value = fwSel.value;
    fscFw.onchange = () => { fwSel.value = fscFw.value; fwSel.dispatchEvent(new Event("change", { bubbles: true })); };
    fwSel.addEventListener("change", () => { fscFw.value = fwSel.value; });
    pop.querySelector("#fsc-search").oninput = (e) => {
      const t = e.target.value.toLowerCase();
      for (const o of fscFw.options) o.hidden = t && !o.text.toLowerCase().includes(t);
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
    row.innerHTML = `<button type="button" id="fw-random">🎲 Random</button><button type="button" id="fw-share">🔗 Share</button>`;
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
      setTimeout(() => (share.textContent = "🔗 Share"), 1500);
    };
  }

  // bring the (already-wired) MIDI-in controls back into the menu, compact
  function relocateMidi(fwSel) {
    const nowBox = fwSel.closest(".box"); if (!nowBox) return;
    const midi = document.getElementById("midiin");
    const midch = document.getElementById("midichl");
    if (midi) nowBox.appendChild(midi);
    if (midch) nowBox.appendChild(midch);
  }

  // a fullscreen toggle for the panel
  function addFullscreen() {
    const dh = document.querySelector(".deck-head"); if (!dh) return;
    const b = document.createElement("button");
    b.id = "fs-btn"; b.type = "button"; b.textContent = "⛶ Fullscreen";
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
      #fw-search-status{display:block;margin:-4px 0 1px;color:var(--dim);font-size:10.5px}
      #fw-search-status:empty{display:none}
      #fw-search-results{max-height:210px;overflow:auto;border:1px solid var(--line);border-radius:8px;background:var(--room);padding:4px}
      #fw-search-results[hidden]{display:none}
      .fw-search-hit{display:flex!important;width:100%;align-items:baseline;justify-content:space-between;gap:8px;text-align:left;
        border:0!important;border-radius:5px!important;background:transparent!important;padding:5px 6px!important}
      .fw-search-hit:hover,.fw-search-hit:focus-visible{background:var(--well)!important}
      .fw-search-hit strong{font-size:11.5px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .fw-search-hit span{font-size:9.5px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .fw-search-more{display:block;padding:6px;color:var(--dim);font-size:10px;text-align:center}
      .fw-filters{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 7px}
      .fw-chip{background:var(--well);border:1px solid var(--line);color:var(--dim);border-radius:999px;
        padding:3px 11px;font:600 11.5px 'Space Grotesk',-apple-system,sans-serif;cursor:pointer}
      .fw-chip:hover{color:var(--ink);border-color:var(--amber)}
      .fw-chip.on{background:var(--amber);color:#180a02;border-color:transparent}
      #res-btn{cursor:pointer}
      #res-pop{position:fixed;z-index:9997;width:280px;max-width:92vw;max-height:72vh;overflow:auto;
        background:#0c0d0f;border:1px solid #232428;border-radius:10px;box-shadow:0 12px 34px rgba(0,0,0,.6)}
      #res-pop .grp{padding:6px 12px 10px}
      #res-pop h4{margin:9px 0 3px;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--dim)}
      #res-pop a{display:block;color:var(--text);text-decoration:none;font-size:12.5px;padding:3px 0}
      #res-pop a:hover{color:var(--amber)}
      #fs-btn{background:var(--amber);border:0;color:#180a02;border-radius:7px;font-weight:700;
        padding:5px 10px;font:inherit;font-size:11.5px;cursor:pointer}
      #fs-btn:hover{background:var(--amber-hi)}
      .fw-quick{display:flex;gap:6px;margin-bottom:6px}
      .fw-quick button{flex:1;background:var(--well);border:1px solid var(--line);color:var(--text);
        border-radius:7px;padding:5px;font:inherit;font-size:11.5px;cursor:pointer}
      .fw-quick button:hover{border-color:var(--amber);color:var(--ink)}
      header.site .gh{display:none !important;}
      #fs-ctrl-fab{position:absolute;top:10px;right:10px;z-index:40;width:34px;height:34px;border-radius:50%;
        background:rgba(18,18,20,.82);border:1px solid #333;color:#fff;font-size:16px;cursor:pointer;line-height:1}
      #fs-ctrl-fab:hover{background:var(--amber);color:#180a02;border-color:transparent}
      #fs-ctrl-pop{position:absolute;top:52px;right:10px;z-index:41;width:240px;max-width:90%;background:#0c0d0f;
        border:1px solid #2a2c31;border-radius:10px;box-shadow:0 12px 34px rgba(0,0,0,.6);padding:10px;display:flex;flex-direction:column;gap:7px}
      #fs-ctrl-pop input,#fs-ctrl-pop select{background:#17181b;border:1px solid #2a2c31;color:#e9edf2;border-radius:7px;padding:6px 8px;font:inherit;font-size:12.5px;width:100%}
      #fs-ctrl-pop button{background:#17181b;border:1px solid #2a2c31;color:#e9edf2;border-radius:7px;padding:7px;font:inherit;font-size:12.5px;cursor:pointer}
      #fs-ctrl-pop button.primary{background:var(--amber);color:#180a02;border:0;font-weight:600}
      #fs-ctrl-pop .fsc-row{display:flex;gap:6px}#fs-ctrl-pop .fsc-row>*{flex:1}
      #fsc-status{font-size:11.5px;color:#cfd4da;min-height:1em;margin:0}
    `;
    document.head.appendChild(el);
  }

  function addSearch(fwSel) {
    const label = document.getElementById("fwlabel") || fwSel.closest("label") || fwSel;
    const s = document.createElement("input");
    s.type = "search"; s.id = "fw-search"; s.placeholder = `Search all ${fwSel.options.length} firmwares…`;
    s.autocomplete = "off";
    s.setAttribute("aria-label", "Search every firmware by name, author, version, license, ID, or description");
    s.setAttribute("aria-controls", "fw-search-results");
    label.parentNode.insertBefore(s, label);
    const searchStatus = document.createElement("span"); searchStatus.id = "fw-search-status"; searchStatus.setAttribute("aria-live", "polite");
    const results = document.createElement("div"); results.id = "fw-search-results"; results.hidden = true;
    label.parentNode.insertBefore(searchStatus, label);
    label.parentNode.insertBefore(results, label);
    // filter chips: samplers (take audio in) and your starred favorites (favorites.js owns the store)
    let samplerOnly = false, favOnly = false;
    const chips = document.createElement("div"); chips.className = "fw-filters";
    const samp = document.createElement("button"); samp.type = "button"; samp.className = "fw-chip"; samp.textContent = "Samplers";
    samp.title = "Show only firmwares that sample audio you feed in (use the Tape device)";
    const fav = document.createElement("button"); fav.type = "button"; fav.className = "fw-chip"; fav.textContent = "★ Favorites";
    fav.title = "Show only the firmwares you've starred";
    chips.append(samp, fav);
    label.parentNode.insertBefore(chips, label);
    const FM = () => window.FM1;
    const norm = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const allEntries = () => window.FM1Catalog?.firmwares || [];
    const byId = () => new Map(allEntries().map((entry) => [entry.id, entry]));
    const textOfEntry = (f) => norm([f.id, f.name, f.version, f.author, f.license, f.kind, f.product, f.about, f.repo].join(" "));
    const textOf = (o, entries = byId()) => textOfEntry(entries.get(o.value) || { id: o.value, name: o.text });
    const isSamp = (o) => FM() && FM().isSampler && FM().isSampler(o.value);
    const isFav = (o) => window.FM1Fav && window.FM1Fav.has(o.value);
    const select = (id) => {
      fwSel.value = id;
      fwSel.dispatchEvent(new Event("change", { bubbles: true }));
      s.value = "";
      apply();
      fwSel.focus();
    };
    function apply() {
      const terms = norm(s.value).trim().split(/\s+/).filter(Boolean);
      const entries = byId();
      const matches = [];
      for (const o of fwSel.options) {
        const hay = textOf(o, entries);
        const hit = terms.every((term) => hay.includes(term)) && (!samplerOnly || isSamp(o)) && (!favOnly || isFav(o));
        o.hidden = !hit;
        o.disabled = !hit && o.value !== fwSel.value;
        if (hit) matches.push({ option: o, entry: entries.get(o.value) });
      }
      const inst = document.getElementById("inst-fw");
      if (inst) for (const o of inst.options) {
        const hit = terms.every((term) => textOf(o, entries).includes(term)) && (!samplerOnly || isSamp(o)) && (!favOnly || isFav(o));
        o.hidden = !hit; o.disabled = !hit;
      }
      const active = terms.length || samplerOnly || favOnly;
      results.hidden = !active;
      results.replaceChildren();
      searchStatus.textContent = active ? `${matches.length} firmware${matches.length === 1 ? "" : "s"} found` : "";
      if (!active) return;
      for (const { option, entry } of matches.slice(0, 80)) {
        const button = document.createElement("button");
        button.type = "button"; button.className = "fw-search-hit"; button.dataset.id = option.value;
        const name = document.createElement("strong"); name.textContent = entry?.name || option.text;
        const meta = document.createElement("span"); meta.textContent = [entry?.version, entry?.author, entry?.license].filter(Boolean).join(" · ");
        button.append(name, meta); button.addEventListener("click", () => select(option.value)); results.appendChild(button);
      }
      if (matches.length > 80) {
        const more = document.createElement("span"); more.className = "fw-search-more";
        more.textContent = `${matches.length - 80} more match — add another search word to narrow it down.`;
        results.appendChild(more);
      }
    }
    s.addEventListener("input", apply);
    samp.addEventListener("click", () => { samplerOnly = !samplerOnly; samp.classList.toggle("on", samplerOnly); apply(); });
    fav.addEventListener("click", () => { favOnly = !favOnly; fav.classList.toggle("on", favOnly); apply(); });
    // Enter loads the first match
    s.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const m = [...fwSel.options].find((o) => !o.hidden);
      if (m) select(m.value);
    });
    s.addEventListener("keydown", (e) => { if (e.key === "Escape" && s.value) { s.value = ""; apply(); } });
    new MutationObserver(() => { s.placeholder = `Search all ${fwSel.options.length} firmwares…`; if (s.value || samplerOnly || favOnly) apply(); })
      .observe(fwSel, { childList: true });
  }

  function addResources() {
    const L = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text} ↗</a>`;
    const links = `<div class="grp">
      <h4>Install &amp; emulate</h4>
      ${L("https://thefirmwarehub.com/", "The Firmware Hub (one-click)")}
      ${L("https://fm1-editor.com/firmware/", "fm1-editor — every firmware")}
      ${L("https://open.m-vave.com/fm1-workbench", "M-VAVE Workbench (official)")}
      ${L("https://joakimeriksson.github.io/fm1-emu/", "fm1-emu (this fork's base)")}
      <h4>Edit sounds &amp; patches</h4>
      ${L("https://asb2m10.github.io/dexed/", "Dexed — DX7 editor")}
      ${L("https://github.com/mene311/fm1-banks", "fm1-banks — 832 DX7 patches")}
      ${L("https://github.com/KingParamount/fm1-factory-presets", "FM-1 factory presets")}
      <h4>Rescue a stuck FM-1</h4>
      ${L("https://github.com/Quixotic7/MvaveFM1Unbricker", "MvaveFM1Unbricker (Windows)")}
      ${L("https://github.com/kurogedelic/FM-1-transporter", "FM-1 Transporter (hardware)")}
      ${L("https://thefirmwarehub.com/#rescue", "USB rescue (Linux)")}
      <h4>Learn &amp; reverse-engineer</h4>
      ${L("https://github.com/cicloid/awesome-fm-1", "awesome-fm-1 (everything)")}
      ${L("https://github.com/AL-255/FM-1-RE", "FM-1-RE (reverse engineering)")}
      ${L("https://github.com/m-vave/fm1_open", "FM1 Open — official SDK")}
      <h4>Buy firmware / official</h4>
      ${L("https://baudgirl.com/work/FM-1+VA", "Baud Girl FM-1+VA")}
      ${L("https://www.groove-os.com/", "Groove OS")}
      ${L("https://www.m-vave.com/download", "M-VAVE downloads (stock FW)")}
      <h4>Community</h4>
      ${L("https://www.reddit.com/r/MVaveFM1/", "r/MVaveFM1")}
      ${L("https://www.elektronauts.com/t/m-vave-fm-1/252170", "Elektronauts thread")}
      ${L("https://forum.m-vave.com/", "M-VAVE forum")}
    </div>`;
    const nav = document.querySelector(".sitenav") || document.querySelector("header.site .wrap");
    const btn = document.createElement("a");
    btn.href = "#"; btn.id = "res-btn"; btn.textContent = "Resources";
    if (nav) nav.appendChild(btn); else document.body.appendChild(btn);
    const pop = document.createElement("div"); pop.id = "res-pop"; pop.hidden = true; pop.innerHTML = links;
    document.body.appendChild(pop);
    const place = () => { const r = btn.getBoundingClientRect(); pop.style.top = (r.bottom + 6) + "px"; pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 292)) + "px"; };
    btn.addEventListener("click", (e) => { e.preventDefault(); pop.hidden = !pop.hidden; if (!pop.hidden) place(); });
    window.addEventListener("resize", () => { if (!pop.hidden) place(); });
    document.addEventListener("click", (e) => { if (e.target !== btn && !pop.contains(e.target)) pop.hidden = true; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") pop.hidden = true; });
  }
})();
