// Firmware info: a panel showing what a firmware actually is — author, version,
// license, what it does, and a link to its source — for a 311-strong collection
// where the gallery card only shows a truncated blurb. Reads the catalogue the
// emulator already serves; opened from the command palette.
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

  // Pure, unit-tested.
  function infoFor(catalog, id) {
    const list = (catalog && catalog.firmwares) || [];
    return list.find((f) => f.id === id) || null;
  }
  function formatInfo(rec) {
    if (!rec) return null;
    return {
      id: rec.id || "",
      name: rec.name || rec.id || "Firmware",
      version: rec.version || "",
      author: rec.author || "unknown",
      license: rec.license || "",
      about: rec.about || "",
      product: rec.product || "",
      sha256: rec.sha256 || "",
      repo: /^https?:\/\//.test(rec.repo || "") ? rec.repo : "",   // only a real URL is linkable
      kind: Array.isArray(rec.kind) ? rec.kind.join(", ") : (rec.kind || ""),
      released: rec.released ? String(rec.released).slice(0, 10) : "",
      package: rec.package || "",
      remote: !!rec.remote,
    };
  }

  window.FM1Info = { infoFor, formatInfo };

  function ready(fn) {
    const t = setInterval(() => {
      const fwSel = document.getElementById("fw");
      if (fwSel && document.body) { clearInterval(t); fn(fwSel); }
    }, 150);
    setTimeout(() => clearInterval(t), 9000);
  }
  ready(async (fwSel) => {
    let catalog = null, health = null;
    try { catalog = (await pageCatalog()) || await fetch("firmwares.json?v=61").then((r) => r.json()); } catch {}
    try { health = await fetch("boot-health.json?v=57").then((r) => r.json()).catch(() => null); } catch {}

    const css = document.createElement("style");
    css.textContent = `
      #info-ov{position:fixed;inset:0;z-index:10000;background:rgba(6,7,9,.6);backdrop-filter:blur(3px);
        display:none;align-items:flex-start;justify-content:center}
      #info-ov.open{display:flex}
      #info-box{margin-top:12vh;width:500px;max-width:92vw;background:var(--ui-pop,#0d0e11);border:1px solid var(--ui-line,#262830);
        border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.6);padding:18px 20px;
        font:14px 'Space Grotesk',sans-serif;color:var(--ui-text,#e9edf2)}
      #info-box h2{margin:0;font-size:20px}
      #info-box .ver{color:var(--ui-dim,#8c93a0);font-size:13px;margin:1px 0 12px}
      #info-box .about{color:var(--ui-text2,#c7ccd4);line-height:1.5;margin:0 0 14px}
      #info-box .grid{display:grid;grid-template-columns:auto 1fr;gap:5px 14px;font-size:13px}
      #info-box .grid .k{color:var(--ui-dim,#8c93a0)}
      #info-box .grid a{color:var(--amber-ink,var(--amber));text-decoration:none;word-break:break-all}
      #info-box .grid a:hover{text-decoration:underline}
      #info-box .caps{display:flex;flex-wrap:wrap;gap:5px;margin:10px 0 0}
      #info-box .caps i{font:600 10px 'Space Mono',monospace;font-style:normal;border:1px solid var(--ui-line,#2a2c31);
        border-radius:999px;padding:2px 8px;color:var(--ui-text2,#cdd2d8);background:var(--ui-surface,#17181b)}
      #info-box .health{display:inline-block;margin-top:12px;font:600 11px 'Space Mono',monospace;border-radius:6px;padding:3px 9px}
      #info-box .health.ok{color:#9be0a8;background:#17271b;border:1px solid #2c5d36}
      #info-box .health.bad{color:#ffc9c9;background:#331a1c;border:1px solid #5d2a2e}
      #info-box .notes{margin-top:14px;border-top:1px solid var(--ui-line,#1d1f25);padding-top:10px}
      #info-box .notes .nlabel{display:flex;font:600 10px 'Space Mono',monospace;color:var(--ui-dim,#8c93a0);
        letter-spacing:.06em;text-transform:uppercase;margin-bottom:5px}
      #info-box .notes .nlabel .saved{margin-left:auto;color:#4cc96a;opacity:0;transition:opacity .2s}
      #info-box .notes .nlabel .saved.on{opacity:1}
      #info-box textarea{width:100%;box-sizing:border-box;min-height:72px;resize:vertical;background:var(--ui-surface,#07080a);
        border:1px solid var(--ui-line,#1c1d21);border-radius:8px;color:var(--ui-text,#e9edf2);padding:7px 9px;font:13px 'Space Grotesk',sans-serif}
      #info-box textarea:focus{outline:none;border-color:var(--amber)}
      #info-acts{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}
      #info-acts button{font:inherit;font-size:12px;color:var(--ui-text,#e9edf2);background:var(--ui-surface,#17181b);
        border:1px solid var(--ui-line,#2a2c31);border-radius:8px;padding:5px 10px;cursor:pointer}
      #info-acts button:hover{border-color:var(--amber)}
      #info-close{float:right;cursor:pointer;color:var(--ui-dim,#8c93a0);border:1px solid var(--ui-line,#2a2c31);border-radius:7px;padding:3px 9px;font-size:12px}`;
    document.head.appendChild(css);

    const ov = document.createElement("div"); ov.id = "info-ov";
    ov.innerHTML = `<div id="info-box"></div>`;
    document.body.appendChild(ov);
    const box = ov.querySelector("#info-box");
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    function render(id) {
      // Prefer the live merged catalog (bundled + radar finds) over the first fetch.
      const live = window.FM1Catalog || catalog;
      const info = formatInfo(infoFor(live, id));
      if (!info) { box.innerHTML = `<span id="info-close">Esc</span><h2>No info</h2><p class="about">No catalogue entry for this firmware.</p>`; return; }
      const h = health && health.entries && health.entries[id];
      const hBadge = h ? (h.status === "ok"
        ? `<span class="health ok">Runs here</span>`
        : `<span class="health bad">${esc({ halts: "Halts here", blank: "No screen in test", slow: "Slow to test", error: "Audit issue" }[h.status] || h.status)}</span>`) : "";
      const row = (k, v) => v ? `<span class="k">${esc(k)}</span><span>${v}</span>` : "";
      const cap = (window.FM1 && window.FM1.caps && window.FM1.caps(id)) || null;
      const caps = [];
      if (cap?.usbMidi) caps.push("Plays MIDI");
      if (cap?.banks) caps.push("DX7 banks");
      if (cap?.audioIn) caps.push("Sampler");
      if (cap?.feats?.includes("midiClock")) caps.push("Clock-sync");
      if (cap?.feats?.includes("mpe")) caps.push("MPE");
      if (cap?.feats?.includes("sequencer")) caps.push("Sequencer");
      if (cap?.feats?.includes("looper")) caps.push("Looper");
      if (info.remote) caps.push("Radar find");
      const fav = window.FM1Fav && id && id !== "local";
      box.innerHTML =
        `<span id="info-close">Esc</span>` +
        `<h2>${esc(info.name)}</h2><div class="ver">${esc(info.version)}${info.kind ? " · " + esc(info.kind) : ""}${info.id ? " · " + esc(info.id) : ""}</div>` +
        (info.about ? `<p class="about">${esc(info.about)}</p>` : "") +
        `<div class="grid">` +
        row("Author", esc(info.author)) +
        row("License", esc(info.license)) +
        row("Product", esc(info.product)) +
        row("Released", esc(info.released)) +
        row("Source", info.repo ? `<a href="${esc(info.repo)}" target="_blank" rel="noopener noreferrer">${esc(info.repo)}</a>` : "") +
        row("Package", esc((info.package || "").replace(/^\.\.\//, ""))) +
        row("SHA-256", info.sha256 ? `<code style="font:11px 'Space Mono',monospace;overflow-wrap:anywhere">${esc(info.sha256)}</code>` : "") +
        `</div>` +
        (caps.length ? `<div class="caps">${caps.map((c) => `<i>${esc(c)}</i>`).join("")}</div>` : "") +
        hBadge +
        `<div id="info-acts">` +
        (fav ? `<button type="button" id="info-fav">${window.FM1Fav.has(id) ? "★ Unfavourite" : "☆ Favourite"}</button>` : "") +
        `<button type="button" id="info-audition">Audition</button>` +
        (info.sha256 ? `<button type="button" id="info-copy">Copy SHA-256</button>` : "") +
        `</div>` +
        (window.FM1Notes ? `<div class="notes"><div class="nlabel">Your notes<span class="saved" id="info-saved">saved</span></div>` +
          `<textarea id="info-notes" placeholder="Jot a note — kept on this device"></textarea></div>` : "");
      box.querySelector("#info-close").onclick = close;
      box.querySelector("#info-fav")?.addEventListener("click", () => { window.FM1Fav.toggle(id); render(id); });
      box.querySelector("#info-audition")?.addEventListener("click", () => {
        const A = window.FM1Audition;
        if (!A) return;
        if (A.playing()) A.stop(); else if (!A.play()) {
          const start = document.getElementById("start");
          if (start && !start.disabled) start.click();
          setTimeout(() => A.play(), 900);
        }
      });
      box.querySelector("#info-copy")?.addEventListener("click", async (e) => {
        try { await navigator.clipboard.writeText(info.sha256); e.target.textContent = "Copied"; }
        catch { e.target.textContent = "Copy failed"; }
      });
      // Per-firmware notes: load the saved note, save on input (debounced).
      const ta = box.querySelector("#info-notes");
      if (ta && window.FM1Notes) {
        ta.value = window.FM1Notes.get(id);
        const savedEl = box.querySelector("#info-saved");
        let deb = 0;
        ta.addEventListener("input", () => {
          clearTimeout(deb);
          deb = setTimeout(() => {
            if (window.FM1Notes.set(id, ta.value) && savedEl) {
              savedEl.classList.add("on"); setTimeout(() => savedEl.classList.remove("on"), 900);
            }
          }, 400);
        });
      }
    }
    function open(id) { render(id || fwSel.value); ov.classList.add("open"); }
    function close() { ov.classList.remove("open"); }
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && ov.classList.contains("open")) close(); });

    window.FM1Info.open = open;
    window.FM1Info.close = close;
  });
})();
