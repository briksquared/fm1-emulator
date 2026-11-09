// Firmware browser for the FM-1 emulator: a searchable, category-filtered card gallery over the
// whole public catalog. Reads firmwares.json + classify.json directly; clicking a card loads
// that firmware. Pure DOM, injected after the page builds.
(function () {
  "use strict";
  const V = "62"; // cache version, keep in step with main.js

  function ready(fn) {
    const t = setInterval(() => {
      const fwSel = document.getElementById("fw");
      const nav = document.querySelector(".sitenav") || document.querySelector("header.site .wrap");
      if (fwSel && nav && window.FM1Catalog) { clearInterval(t); fn(fwSel, nav); }
    }, 120);
    setTimeout(() => clearInterval(t), 8000);
  }

  ready(async (fwSel, nav) => {
    let cat, capsArr;
    try {
      [cat, capsArr] = await Promise.all([
        Promise.resolve(window.FM1Catalog),
        fetch("classify.json?v=" + V).then((r) => r.json()).catch(() => []),
      ]);
    } catch { return; }
    const CAPS = Object.fromEntries((capsArr || []).map((c) => [c.id, c]));
    const fws = cat.firmwares.filter((f) => f.id && f.id !== "local" && f.package);
    injectStyles();

    // the firmwares booted most recently, newest first
    const RKEY = "fm1.recent";
    let recent = [];
    try { const a = JSON.parse(localStorage.getItem(RKEY) || "[]"); if (Array.isArray(a)) recent = a.filter((x) => typeof x === "string"); } catch { /* unreadable: start empty */ }
    fwSel.addEventListener("change", () => {
      const id = fwSel.value;
      if (!id || id === "local" || !fws.some((f) => f.id === id)) return;
      recent = [id, ...recent.filter((x) => x !== id)].slice(0, 12);
      try { localStorage.setItem(RKEY, JSON.stringify(recent)); } catch { /* storage full: keep it for this session */ }
    });

    const CATS = [
      { key: "all", label: "All" },
      { key: "recent", label: "Recent", t: (f) => recent.includes(f.id) },
      { key: "sampler", label: "Samplers", t: (f, c) => c && c.audioIn },
      { key: "banks", label: "DX7 banks", t: (f, c) => c && c.banks },
      { key: "seq", label: "Sequencer", t: (f, c) => c && c.feats && (c.feats.includes("sequencer") || c.feats.includes("looper")) },
      { key: "clock", label: "Clock-sync", t: (f, c) => c && c.feats && c.feats.includes("midiClock") },
      { key: "mpe", label: "MPE", t: (f, c) => c && c.feats && c.feats.includes("mpe") },
      { key: "game", label: "Games & fun", t: (f) => /\b(doom|nes|game|boy|cat|zombie|fart|trump|reggae|dino|coin|karaoke|quest|sky|witch|bongo|arcade|pet)\b/i.test(f.name + " " + (f.about || "")) },
    ];
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
      if (cdef.key === "recent") chip.hidden = !n;
      chip.onclick = () => { activeCat = cdef.key; chipsWrap.querySelectorAll(".gal-chip").forEach((x) => x.classList.toggle("on", x === chip)); render(); };
      chipsWrap.appendChild(chip);
    }

    function matches(f) {
      const norm = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const terms = norm(q.value).trim().split(/\s+/).filter(Boolean);
      const hay = norm([f.id, f.name, f.version, f.author, f.license, f.kind, f.product, f.about, f.repo].join(" "));
      if (!terms.every((term) => hay.includes(term))) return false;
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
      const list = fws.filter(matches);
      if (activeCat === "recent") list.sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id));
      countEl.textContent = list.length + " of " + fws.length;
      grid.replaceChildren();
      if (!list.length) { const e = document.createElement("p"); e.className = "gal-empty"; e.textContent = "Nothing matches — try a different word or category."; grid.appendChild(e); return; }
      const frag = document.createDocumentFragment();
      for (const f of list) {
        const card = document.createElement("button");
        card.className = "gal-card" + (f.id === cur ? " cur" : "");
        card.onclick = () => load(f.id);
        const caps = capList(f).map((t) => `<span class="gal-cap">${t}</span>`).join("");
        card.innerHTML =
          `<span class="gal-name">${esc(f.name)}${f.version ? ` <em>${esc(f.version)}</em>` : ""}</span>` +
          `<span class="gal-by">${esc(f.author || "")}</span>` +
          `<span class="gal-about">${esc((f.about || "").slice(0, 110))}</span>` +
          `<span class="gal-caps">${caps}</span>`;
        frag.appendChild(card);
      }
      grid.appendChild(frag);
    }

    function refreshRecent() {
      const chip = chipsWrap.querySelector('.gal-chip[data-key="recent"]');
      const n = fws.filter((f) => recent.includes(f.id)).length;
      if (chip) { chip.hidden = !n; chip.querySelector(".gal-chip-n").textContent = n; }
      if (!n && activeCat === "recent") { activeCat = "all"; chipsWrap.querySelectorAll(".gal-chip").forEach((x) => x.classList.toggle("on", x.dataset.key === "all")); }
    }
    function open() { refreshRecent(); ov.hidden = false; document.body.style.overflow = "hidden"; render(); setTimeout(() => { q.focus(); grid.querySelector(".gal-card.cur")?.scrollIntoView({ block: "nearest" }); }, 30); }
    function close() { ov.hidden = true; document.body.style.overflow = ""; }
    btn.onclick = (e) => { e.preventDefault(); open(); };
    ov.querySelector("#gal-x").onclick = close;
    ov.querySelector("#gal-rand").onclick = () => { const list = fws.filter(matches); if (list.length) load(list[Math.floor(Math.random() * list.length)].id); };
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    q.addEventListener("input", () => {
      if (q.value.trim()) {
        activeCat = "all";
        chipsWrap.querySelectorAll(".gal-chip").forEach((chip) => chip.classList.toggle("on", chip.dataset.key === "all"));
      }
      render();
    });
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") { const first = fws.filter(matches)[0]; if (first) load(first.id); } });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !ov.hidden) { close(); return; }
      // "b" opens the browser when not typing into a field
      const tag = (e.target.tagName || "").toLowerCase();
      if (ov.hidden && (e.key === "b" || e.key === "B") && !e.ctrlKey && !e.metaKey && !e.altKey && tag !== "input" && tag !== "textarea" && !e.target.isContentEditable) { e.preventDefault(); open(); }
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
        search.parentNode.insertBefore(b, search.nextSibling);
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
      .gal-card.cur{border-color:var(--amber);box-shadow:inset 0 0 0 1px var(--amber)}
      .gal-name{font:700 14px 'Space Grotesk',-apple-system,sans-serif;color:var(--ui-text,#f2f4f7)}
      .gal-name em{font-style:normal;color:var(--ui-dim,#8c93a0);font-weight:500;font-size:12px}
      .gal-by{font-size:11.5px;color:var(--amber-hi)}
      .gal-about{font-size:11.5px;color:var(--ui-dim,#9aa0ab);line-height:1.35;margin-top:2px;min-height:2.4em}
      .gal-caps{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}
      .gal-cap{font:600 10px 'Space Mono',monospace;color:var(--ui-text2,#cdd2d8);background:var(--ui-surface,#1e2024);border:1px solid var(--ui-line,#2c2f35);
        border-radius:5px;padding:1px 6px}
      .gal-empty{grid-column:1/-1;color:var(--ui-dim,#8c93a0);text-align:center;padding:30px 0}
      @media (max-width:520px){ .gal-box{max-height:94vh} .gal-grid{grid-template-columns:1fr 1fr;padding:10px} }
    `;
    document.head.appendChild(el);
  }
})();
