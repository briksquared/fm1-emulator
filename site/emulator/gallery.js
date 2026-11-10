// Firmware browser for the FM-1 emulator: a searchable, category-filtered card gallery over the
// whole catalog (now ~191). Reads firmwares.json + classify.json directly; clicking a card loads
// that firmware. Pure DOM, injected after the page builds.
(function () {
  "use strict";
  // The page's merged list (this build's firmwares plus any radar finds), once main.js has it.
  const pageCatalog = () => new Promise((resolve) => {
    const t0 = Date.now();
    (function wait() {
      if (window.FM1Catalog) return resolve(window.FM1Catalog);
      if (Date.now() - t0 > 6000) return resolve(null);
      setTimeout(wait, 50);
    })();
  });
  const V = "61"; // catalog cache version, keep in step with main.js
  const ICONS = {
    synth: '<path d="M2 12c3 0 3-8 6-8s3 16 6 16 3-8 6-8"/>',
    groove: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    drums: '<circle cx="6" cy="17" r="2"/><circle cx="18" cy="17" r="2"/><path d="M3 4h18M3 9h18M6 15V9m12 6V4"/>',
    chords: '<path d="M5 19V5l11-2v14"/><circle cx="3" cy="19" r="2"/><circle cx="14" cy="17" r="2"/><path d="M18 6h4m-2-2v4"/>',
    tracker: '<path d="M5 3v18m7-18v18m7-18v18M2 8h20M2 16h20"/>',
    dev: '<path d="m8 5-5 7 5 7m8-14 5 7-5 7m-3-16-3 18"/>',
    other: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/>',
  };
  function cardIcon(f) {
    const kind = Array.isArray(f.kind) ? f.kind[0] : f.kind;
    return `<span class="gal-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind] || ICONS.other}</svg></span>`;
  }

  function ready(fn) {
    const t = setInterval(() => {
      const fwSel = document.getElementById("fw");
      const nav = document.querySelector(".sitenav") || document.querySelector("header.site .wrap");
      if (fwSel && nav) { clearInterval(t); fn(fwSel, nav); }
    }, 120);
    setTimeout(() => clearInterval(t), 8000);
  }

  ready(async (fwSel, nav) => {
    let cat, capsArr, healthDoc;
    try {
      [cat, capsArr, healthDoc] = await Promise.all([
        pageCatalog().then((c) => c || fetch("firmwares.json?v=" + V).then((r) => r.json())),
        fetch("classify.json?v=" + V).then((r) => r.json()).catch(() => []),
        fetch("boot-health.json?v=" + V).then((r) => r.json()).catch(() => null),
      ]);
    } catch { return; }
    const CAPS = Object.fromEntries((capsArr || []).map((c) => [c.id, c]));
    // Boot health is optional: with no boot-health.json the gallery behaves
    // exactly as before rather than claiming every firmware is fine.
    const HEALTH = (healthDoc && healthDoc.entries) || {};
    // Labels state what was measured, not a verdict on the firmware: the check
    // is headless, and a heavy firmware can be fine interactively.
    const HEALTH_LABEL = { halts: "Halts here", blank: "No screen in test", slow: "Too slow to test", error: "Audit error" };
    const health = (f) => HEALTH[f.id] || null;
    const healthy = (f) => { const h = health(f); return !h || h.status === "ok" || h.status === "slow"; };
    const fws = cat.firmwares.filter((f) => f.id && f.id !== "local" && f.package);

    // Recently played: most-recent-first list of firmware ids, in localStorage.
    // Recorded on any #fw change, so URL loads and other modules count too.
    const RECENT_KEY = "fm1.recent.v1", RECENT_MAX = 24;
    const known = new Set(fws.map((f) => f.id));
    function loadRecent() {
      try {
        const a = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
        return Array.isArray(a) ? a.filter((id) => typeof id === "string" && known.has(id)) : [];
      } catch { return []; }
    }
    function recordRecent(id) {
      if (!id || !known.has(id)) return loadRecent();
      const list = loadRecent().filter((x) => x !== id);
      list.unshift(id);
      while (list.length > RECENT_MAX) list.pop();
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { console.warn("recent: could not save", e); }
      return list;
    }
    const recentRank = () => { const m = new Map(); loadRecent().forEach((id, i) => m.set(id, i)); return m; };
    fwSel.addEventListener("change", () => recordRecent(fwSel.value));
    if (fwSel.value) recordRecent(fwSel.value);   // the firmware booted at page load
    window.FM1Recent = { list: loadRecent, record: recordRecent, _key: RECENT_KEY };

    injectStyles();

    const CATS = [
      { key: "all", label: "All" },
      { key: "recent", label: "Recent", t: (f) => recentRank().has(f.id) },
      { key: "fav", label: "★ Favorites", t: (f) => favIds().includes(f.id) },
      { key: "noted", label: "Noted", t: (f) => !!(window.FM1Notes && window.FM1Notes.has(f.id)) },
      { key: "sampler", label: "Samplers", t: (f, c) => c && c.audioIn },
      { key: "banks", label: "DX7 banks", t: (f, c) => c && c.banks },
      { key: "seq", label: "Sequencer", t: (f, c) => c && c.feats && (c.feats.includes("sequencer") || c.feats.includes("looper")) },
      { key: "clock", label: "Clock-sync", t: (f, c) => c && c.feats && c.feats.includes("midiClock") },
      { key: "mpe", label: "MPE", t: (f, c) => c && c.feats && c.feats.includes("mpe") },
      { key: "game", label: "Games & fun", t: (f) => /\b(doom|nes|game|boy|cat|zombie|fart|trump|reggae|dino|coin|karaoke|quest|sky|witch|bongo|arcade|pet)\b/i.test(f.name + " " + (f.about || "")) },
    ];
    // Only offer the boot-health filters when there is data behind them.
    if (Object.keys(HEALTH).length) {
      CATS.push({ key: "runs", label: "Runs here", t: (f) => { const h = health(f); return h && h.status === "ok"; } });
      CATS.push({ key: "issues", label: "Known issues", t: (f) => !healthy(f) });
    }
    // favorites: the sidebar's star (favorites.js) and these cards share one list
    const favIds = () => { try { return window.FM1Fav ? window.FM1Fav.ids() : []; } catch { return []; } };
    const capList = (f) => {
      const c = CAPS[f.id] || {}; const out = [];
      if (c.usbMidi) out.push("MIDI");
      if (c.banks) out.push("DX7");
      if (c.audioIn) out.push("Sampler");
      if (c.feats && c.feats.includes("midiClock")) out.push("Clock");
      if (c.feats && c.feats.includes("mpe")) out.push("MPE");
      return out;
    };

    // trigger in the top nav
    const btn = document.createElement("a");
    btn.href = "#"; btn.id = "gal-btn"; btn.className = "sitelink"; btn.textContent = "Browse";
    nav.insertBefore(btn, nav.firstChild ? nav.firstChild.nextSibling : null);

    // modal
    const ov = document.createElement("div"); ov.id = "gal-ov"; ov.hidden = true;
    ov.innerHTML = `
      <div class="gal-box" role="dialog" aria-label="Browse firmwares">
        <div class="gal-head">
          <input id="gal-q" type="search" placeholder="Search firmwares — name, author, what it does…" autocomplete="off">
          <span id="gal-count"></span>
          <button id="gal-rand" title="Load a random one from this view">🎲</button>
          <button id="gal-x" title="Close (Esc)">✕</button>
        </div>
        <div class="gal-chips"></div>
        <div class="gal-grid" tabindex="-1"></div>
      </div>`;
    document.body.appendChild(ov);
    const q = ov.querySelector("#gal-q");
    const grid = ov.querySelector(".gal-grid");
    const countEl = ov.querySelector("#gal-count");
    const chipsWrap = ov.querySelector(".gal-chips");
    let activeCat = "all";

    for (const cdef of CATS) {
      const n = cdef.key === "all" ? fws.length : fws.filter((f) => cdef.t(f, CAPS[f.id])).length;
      const chip = document.createElement("button");
      chip.className = "gal-chip" + (cdef.key === "all" ? " on" : "");
      chip.innerHTML = `${esc(cdef.label)} <span class="gal-chip-n">${n}</span>`; chip.dataset.key = cdef.key;
      if (cdef.key === "recent" || cdef.key === "fav") chip.style.display = n ? "" : "none";
      chip.onclick = () => { activeCat = cdef.key; chipsWrap.querySelectorAll(".gal-chip").forEach((x) => x.classList.toggle("on", x === chip)); render(); };
      chipsWrap.appendChild(chip);
    }

    function matches(f) {
      const term = q.value.trim().toLowerCase();
      if (term) {
        const note = (window.FM1Notes && window.FM1Notes.get(f.id)) || "";
        const hay = (f.name + " " + (f.author || "") + " " + (f.about || "") + " " + (f.product || "") + " " + note).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      const cdef = CATS.find((c) => c.key === activeCat);
      if (cdef && cdef.t && !cdef.t(f, CAPS[f.id])) return false;
      return true;
    }

    function load(id) {
      fwSel.value = id;
      fwSel.dispatchEvent(new Event("change", { bubbles: true }));
      close();
    }

    function render() {
      const cur = fwSel.value;
      // Keep the Recent chip's count live, and hide it until something has been
      // played — a "Recent 0" chip before you have loaded anything is just noise.
      const rank = recentRank();
      const recentChip = chipsWrap.querySelector('[data-key="recent"]');
      if (recentChip) {
        recentChip.style.display = rank.size ? "" : "none";
        const nEl = recentChip.querySelector(".gal-chip-n");
        if (nEl) nEl.textContent = rank.size;
        if (!rank.size && activeCat === "recent") {
          activeCat = "all";
          chipsWrap.querySelectorAll(".gal-chip").forEach((x) => x.classList.toggle("on", x.dataset.key === "all"));
        }
      }
      // The Noted chip's count is live too, and it hides until you've written one.
      const noteCount = (window.FM1Notes && window.FM1Notes.count && window.FM1Notes.count()) || 0;
      const notedChip = chipsWrap.querySelector('[data-key="noted"]');
      if (notedChip) {
        notedChip.style.display = noteCount ? "" : "none";
        const nEl = notedChip.querySelector(".gal-chip-n");
        if (nEl) nEl.textContent = noteCount;
        if (!noteCount && activeCat === "noted") {
          activeCat = "all";
          chipsWrap.querySelectorAll(".gal-chip").forEach((x) => x.classList.toggle("on", x.dataset.key === "all"));
        }
      }
      let list = fws.filter(matches);
      if (activeCat === "recent") list = list.slice().sort((a, b) => rank.get(a.id) - rank.get(b.id));
      if (activeCat === "fav") { const order = favIds(); list = list.slice().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); }
      countEl.textContent = list.length + " of " + fws.length;
      grid.replaceChildren();
      if (!list.length) { const e = document.createElement("p"); e.className = "gal-empty"; e.textContent = "Nothing matches — try a different word or category."; grid.appendChild(e); return; }
      const frag = document.createDocumentFragment();
      const favs = favIds();
      for (const f of list) {
        const item = document.createElement("div"); item.className = "gal-item";
        const card = document.createElement("button");
        const h = health(f);
        const bad = h && h.status !== "ok" && h.status !== "slow";
        card.className = "gal-card" + (f.id === cur ? " cur" : "") + (bad ? " bad" : "");
        card.onclick = () => load(f.id);
        if (h && h.note) card.title = HEALTH_LABEL[h.status] + " — " + h.note;
        const caps = capList(f).map((t) => `<span class="gal-cap">${t}</span>`).join("");
        const flag = h && h.status !== "ok"
          ? `<span class="gal-health ${h.status}">${esc(HEALTH_LABEL[h.status] || h.status)}</span>` : "";
        const noted = window.FM1Notes && window.FM1Notes.has(f.id);
        if (noted) card.title = (card.title ? card.title + " · " : "") + "Your note: " + window.FM1Notes.get(f.id).slice(0, 80);
        card.innerHTML =
          `<span class="gal-title">${cardIcon(f)}<span class="gal-name">${esc(f.name)}${f.version ? ` <em>${esc(f.version)}</em>` : ""}</span>${noted ? '<span class="gal-noted" title="You noted this">📝</span>' : ""}</span>` +
          `<span class="gal-by">${esc(f.author || "")}</span>` +
          `<span class="gal-about">${esc((f.about || "").slice(0, 110))}</span>` +
          `<span class="gal-caps">${flag}${caps}</span>`;
        item.appendChild(card);
        if (window.FM1Fav) {
          const on = favs.includes(f.id);
          const star = document.createElement("button");
          star.type = "button"; star.className = "gal-star" + (on ? " on" : "");
          star.textContent = on ? "★" : "☆";
          star.title = on ? "Remove from favorites" : "Add to favorites";
          star.setAttribute("aria-label", `${star.title}: ${f.name}`);
          star.setAttribute("aria-pressed", String(on));
          star.onclick = (e) => { e.stopPropagation(); window.FM1Fav.toggle(f.id); };
          item.appendChild(star);
        }
        frag.appendChild(item);
      }
      grid.appendChild(frag);
    }

    function refreshRecent() {
      // (the Recent and Noted chips keep their own counts in render)
      for (const [key, ids] of [["fav", favIds()]]) {
        const chip = chipsWrap.querySelector(`.gal-chip[data-key="${key}"]`);
        const n = fws.filter((f) => ids.includes(f.id)).length;
        if (chip) { chip.style.display = n ? "" : "none"; chip.querySelector(".gal-chip-n").textContent = n; }
        if (!n && activeCat === key) { activeCat = "all"; chipsWrap.querySelectorAll(".gal-chip").forEach((x) => x.classList.toggle("on", x.dataset.key === "all")); }
      }
    }
    // a star changed here or in the sidebar: keep the counts and cards in step (the list stays put)
    window.FM1Fav?.onChange(() => { refreshRecent(); if (!ov.hidden) { const top = grid.scrollTop; render(); grid.scrollTop = top; } });
    function open() { refreshRecent(); ov.hidden = false; document.body.style.overflow = "hidden"; render(); setTimeout(() => { q.focus(); grid.querySelector(".gal-card.cur")?.scrollIntoView({ block: "nearest" }); }, 30); }
    function close() { ov.hidden = true; document.body.style.overflow = ""; }
    btn.onclick = (e) => { e.preventDefault(); open(); };
    ov.querySelector("#gal-x").onclick = close;
    ov.querySelector("#gal-rand").onclick = () => { const list = fws.filter(matches); if (list.length) load(list[Math.floor(Math.random() * list.length)].id); };
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    q.addEventListener("input", render);
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") { const first = fws.filter(matches)[0]; if (first) load(first.id); } });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !ov.hidden) { close(); return; }
      // "b" opens the browser when not typing into a field
      const tag = (e.target.tagName || "").toLowerCase();
      if (ov.hidden && !window.FM1Shortcuts?.isOpen?.() && !document.querySelector("#fm1-cz.open") && !e.repeat && (e.key === "b" || e.key === "B") && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== "input" && tag !== "textarea" && !e.target.isContentEditable) { e.preventDefault(); open(); }
    });
    // keep the "cur" highlight honest if the firmware changes elsewhere
    fwSel.addEventListener("change", () => { if (!ov.hidden) render(); });

    // a prominent entry point in the sidebar, next to the search
    (function sidebarEntry() {
      const t = setInterval(() => {
        const search = document.getElementById("fw-search");
        if (!search) return; clearInterval(t);
        if (document.getElementById("gal-side")) return;
        const b = document.createElement("button");
        b.id = "gal-side"; b.type = "button"; b.textContent = `Browse all ${fws.length}`;
        b.onclick = open;
        // Place after the whole search wrap (input + results), not between them.
        const anchor = document.getElementById("fw-search-wrap") || search;
        anchor.parentNode.insertBefore(b, anchor.nextSibling);
      }, 150);
      setTimeout(() => clearInterval(t), 8000);
    })();
  });

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function injectStyles() {
    if (document.getElementById("fm1-gal-css")) return;
    const el = document.createElement("style"); el.id = "fm1-gal-css";
    el.textContent = `
      #gal-btn{cursor:pointer}
      #gal-ov{position:fixed;inset:0;z-index:9998;background:rgba(6,7,9,.72);backdrop-filter:blur(3px);
        display:flex;align-items:flex-start;justify-content:center;padding:4vh 16px}
      .gal-box{background:var(--ui-pop,#0c0d10);border:1px solid var(--ui-line,#23252b);border-radius:14px;width:100%;max-width:920px;max-height:92vh;
        display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,.6);overflow:hidden}
      .gal-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--ui-line,#1c1e23)}
      #gal-q{flex:1;background:var(--ui-surface,#141518);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text,#e9edf2);border-radius:9px;padding:9px 12px;
        font:inherit;font-size:14px;outline:none}
      #gal-q:focus{border-color:var(--amber)}
      #gal-count{font:600 12px 'Space Mono',monospace;color:var(--ui-dim,#8c93a0);white-space:nowrap}
      #gal-x,#gal-rand{background:none;border:0;color:var(--ui-dim,#8c93a0);font-size:18px;cursor:pointer;padding:4px 8px;line-height:1}
      #gal-x:hover,#gal-rand:hover{color:var(--ui-text,#fff);transform:scale(1.1)}
      #gal-rand{font-size:16px}
      .gal-chip-n{opacity:.7;font-size:10px}
      .gal-chip.on .gal-chip-n{opacity:.85}
      #gal-side{width:100%;background:var(--well);border:1px solid var(--line);color:var(--ink);border-radius:7px;
        padding:7px;margin-bottom:6px;font:600 12.5px 'Space Grotesk',-apple-system,sans-serif;cursor:pointer;transition:all .12s}
      #gal-side:hover{border-color:var(--amber);color:var(--ui-text,#fff)}
      .gal-chips{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px;border-bottom:1px solid var(--ui-line,#1c1e23)}
      .gal-chip{background:var(--ui-surface,#141518);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text2,#aeb4bd);border-radius:999px;padding:4px 12px;
        font:600 12px 'Space Grotesk',-apple-system,sans-serif;cursor:pointer;transition:all .12s}
      .gal-chip:hover{color:var(--ui-text,#fff);border-color:var(--ui-line-hi,#3a3d44)}
      .gal-chip.on{background:var(--amber);color:var(--ui-on-accent,#180a02);border-color:transparent}
      .gal-grid{overflow-y:auto;padding:14px;display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(210px,1fr))}
      .gal-card{text-align:left;background:var(--ui-surface,#141518);border:1px solid var(--ui-line,#23252b);border-radius:11px;padding:12px 13px;
        cursor:pointer;display:flex;flex-direction:column;gap:3px;transition:border-color .12s,transform .06s;color:inherit}
      .gal-card:hover{border-color:var(--amber);transform:translateY(-1px)}
      .gal-item{position:relative;display:flex}
      .gal-item>.gal-card{flex:1;min-width:0;padding-right:34px}
      .gal-star{position:absolute;top:7px;right:7px;width:26px;height:26px;border-radius:7px;border:1px solid transparent;background:none;
        color:var(--ui-dim,#8b9099);font-size:15px;line-height:1;cursor:pointer}
      .gal-star:hover,.gal-star:focus-visible{color:var(--amber-ink,var(--amber));border-color:var(--ui-line,#2a2c31);outline:none}
      .gal-star.on{color:var(--amber-ink,var(--amber))}
      .gal-card.cur{border-color:var(--amber);box-shadow:inset 0 0 0 1px var(--amber)}
      .gal-title{display:flex;align-items:center;gap:9px;min-height:32px}
      .gal-icon{width:29px;height:29px;flex:none;display:grid;place-items:center;color:var(--amber-hi);background:color-mix(in srgb,var(--amber) 14%,var(--ui-surface,#141518));border:1px solid color-mix(in srgb,var(--amber) 35%,var(--ui-line,#2a2c31));border-radius:8px}
      .gal-icon svg{width:18px;height:18px}
      .gal-name{font:700 14px 'Space Grotesk',-apple-system,sans-serif;color:var(--ui-text,#f2f4f7)}
      .gal-name em{font-style:normal;color:var(--ui-dim,#8c93a0);font-weight:500;font-size:12px}
      .gal-noted{margin-left:auto;flex:none;font-size:13px;line-height:1;opacity:.9;filter:saturate(.9)}
      .gal-by{font-size:11.5px;color:var(--amber-hi)}
      .gal-about{font-size:11.5px;color:var(--ui-dim,#9aa0ab);line-height:1.35;margin-top:2px;min-height:2.4em}
      .gal-caps{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
      .gal-cap{font:600 10px 'Space Mono',monospace;color:var(--ui-text2,#cdd2d8);background:var(--ui-surface,#1e2024);border:1px solid var(--ui-line,#2c2f35);
        border-radius:5px;padding:1px 6px}
      /* Boot health: a firmware that will not run here is dimmed but still
         loadable — the check is headless, so it is a warning, not a verdict. */
      .gal-health{font:600 10px 'Space Mono',monospace;border-radius:5px;padding:1px 6px}
      .gal-health.halts,.gal-health.blank,.gal-health.error{color:#ffc9c9;background:#331a1c;border:1px solid #5d2a2e}
      .gal-health.slow{color:#ffe2b3;background:#31271a;border:1px solid #5c4526}
      .gal-card.bad{opacity:.62}
      .gal-card.bad:hover,.gal-card.bad:focus{opacity:1}
      .gal-empty{grid-column:1/-1;color:var(--ui-dim,#8c93a0);text-align:center;padding:30px 0}
      @media (max-width:520px){ .gal-box{max-height:94vh} .gal-grid{grid-template-columns:1fr 1fr;padding:10px} }
    `;
    document.head.appendChild(el);
  }
})();
