// Keyboard shortcuts and the firmware details view.
//   ?      this list            I   details of the selected firmware
//   B      browse firmwares     M   add / remove the selected firmware from favorites
//   [ ]    previous / next firmware in the list
// None of them are note or panel keys, and none fire while typing in a field, with Ctrl, Cmd or
// Alt held, on key repeat, or while a dialog or the Customize panel is open (Esc closes those).
(function () {
  "use strict";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TEXT_INPUT = /^(text|search|email|url|tel|password|number|date|time|datetime-local|month|week)$/;
  const typing = (t) => !!t && (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement ||
    (t instanceof HTMLInputElement && TEXT_INPUT.test(t.type)));
  const visible = (el) => !!el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const dialogOpen = () => [...document.querySelectorAll('[role="dialog"]')].some((d) => visible(d) && !d.closest("[hidden]")) ||
    !!document.querySelector("#fm1-cz.open");
  const httpsLink = (u) => { try { const x = new URL(u); return x.protocol === "https:" ? x.href : null; } catch { return null; } };

  // ---------------------------------------------------------------- a small modal
  let openModal = null;
  function modal(id, title) {
    const ov = document.createElement("div"); ov.id = id; ov.className = "sc-ov"; ov.hidden = true;
    ov.innerHTML = `<div class="sc-box" role="dialog" aria-modal="true" aria-labelledby="${id}-t">
      <div class="sc-head"><h2 id="${id}-t">${esc(title)}</h2><button type="button" class="sc-x" aria-label="Close">✕</button></div>
      <div class="sc-body"></div></div>`;
    document.body.appendChild(ov);
    let back = null;
    const m = {
      ov, body: ov.querySelector(".sc-body"), title: ov.querySelector("h2"),
      open() { if (openModal && openModal !== m) openModal.close(); back = document.activeElement; ov.hidden = false; openModal = m; ov.querySelector(".sc-x").focus(); },
      close() { if (ov.hidden) return; ov.hidden = true; if (openModal === m) openModal = null; if (back && back.isConnected) try { back.focus(); } catch { /* gone */ } },
    };
    ov.querySelector(".sc-x").onclick = () => m.close();
    ov.addEventListener("click", (e) => { if (e.target === ov) m.close(); });
    return m;
  }

  function ready(fn) {
    const t = setInterval(() => {
      const fwSel = document.getElementById("fw"), about = document.getElementById("about");
      if (fwSel && about && fwSel.options.length > 1 && window.FM1Catalog) { clearInterval(t); fn(fwSel, about); }
    }, 150);
    setTimeout(() => clearInterval(t), 15000);
  }

  ready(async (fwSel, about) => {
    injectStyles();
    let caps = {};
    try { caps = Object.fromEntries((await (await fetch("classify.json?v=53")).json()).map((c) => [c.id, c])); }
    catch (e) { console.warn("firmware capabilities not loaded:", e); }

    // ---------------------------------------------------------------- shortcuts list
    const sheet = modal("sc-keys", "Keyboard shortcuts");
    const row = (keys, what) => `<tr><td>${keys.map((k) => `<kbd>${esc(k)}</kbd>`).join(" ")}</td><td>${esc(what)}</td></tr>`;
    sheet.body.innerHTML = `
      <h3>Playing</h3><table>
        ${row(["A", "…", "'"], "Keys, C4 to F5 (W E T Y U O P: the black keys)")}
        ${row(["Z", "X"], "Octave down / up")}
        ${row(["Space"], "PLAY")}${row(["R"], "REC")}
        ${row(["1", "…", "0"], "Panel buttons")}
        ${row(["←", "→"], "SELECT knob")}${row(["↓", "↑"], "PRESETS knob")}${row([",", "."], "Third encoder")}
      </table>
      <h3>App</h3><table>
        ${row(["B"], "Browse firmwares")}
        ${row(["I"], "Details of the selected firmware")}
        ${row(["M"], "Add or remove the selected firmware from favorites")}
        ${row(["[", "]"], "Previous / next firmware")}
        ${row(["?"], "This list")}${row(["Esc"], "Close a dialog or a tool panel")}
        ${row(["Ctrl", "Shift", "H"], "Show every hidden bar and panel")}
        ${row(["Ctrl", "K"], "Command palette (also hides or shows bars)")}
      </table>
      <h3>Play assists</h3><table>
        ${row(["Studio", "Play"], "Transpose / chord / scale lock / arp panel (saved on this device)")}
        ${row(["Ctrl", "K", "transpose"], "Palette: shift notes by octaves or semitones")}
        ${row(["Ctrl", "K", "chord"], "Palette: pick a harmonizer voicing")}
        ${row(["Ctrl", "K", "scale"], "Palette: lock notes to a key")}
        ${row(["Ctrl", "K", "arp"], "Palette: arpeggiate held notes")}
      </table>
      <p class="sc-note">Shortcuts don't fire while you type in a field or while a dialog is open. With Keys open and
        "Play with computer keys" on, the letter keys play through its scale, chord and arpeggiator. Studio → Play
        assists apply to every note source (Keys, MIDI files, audition), not only the on-screen keyboard.</p>`;

    // ---------------------------------------------------------------- firmware details
    const details = modal("fw-details", "Firmware");
    const entryOf = (id) => (window.FM1Catalog?.firmwares || []).find((f) => f.id === id) || null;
    function showDetails() {
      const id = fwSel.value, f = entryOf(id), opt = fwSel.selectedOptions[0];
      const name = f?.name || (opt?.dataset.base || opt?.text || "Firmware").replace(/^★ /, "");
      details.title.textContent = name + (f?.version ? ` ${f.version}` : "");
      const running = window.FM1?.runningFirmware?.() || null;
      const isRunning = running && running.id === id;
      const c = caps[id] || {};
      const rows = [];
      const add = (k, v, raw = false) => { if (v) rows.push(`<tr><th>${esc(k)}</th><td>${raw ? v : esc(v)}</td></tr>`); };
      if (f) {
        add("Author", f.author);
        add("License", f.license);
        const src = httpsLink(f.repo);
        if (src) add("Source", `<a href="${esc(src)}" target="_blank" rel="noopener">${esc(src.replace(/^https:\/\//, ""))} ↗</a>`, true);
        if (f.released && !Number.isNaN(Date.parse(f.released))) add("Released", new Date(f.released).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }));
        add("Device", f.product);
        if (f.sha256) add("Package SHA-256", `<code>${esc(f.sha256)}</code>`, true);
        add("From", f.remote ? "Found by the firmware radar (downloads when selected)" : f.package ? "Bundled with the app" : "");
      } else add("Package", id === "local" ? "A .fwsc you opened" : "");
      const feats = [];
      if (c.usbMidi) feats.push(["Plays MIDI", "notes and patterns from the MIDI device below the synth or a controller"]);
      if (c.banks) feats.push(["DX7 banks", "loads a 32-voice .syx from Banks"]);
      if (c.audioIn) feats.push(["Sampler", "takes audio in from Tape"]);
      if (c.feats?.includes("midiClock")) feats.push(["Clock-sync", "follows MIDI clock from the transport"]);
      if (c.feats?.includes("mpe")) feats.push(["MPE", ""]);
      if (c.feats?.includes("sequencer")) feats.push(["Sequencer", ""]);
      if (c.feats?.includes("looper")) feats.push(["Looper", ""]);
      if (feats.length) add("What it takes", feats.map(([t, d]) => `<span class="fd-cap">${esc(t)}</span>${d ? ` <span class="fd-dim">${esc(d)}</span>` : ""}`).join("<br>"), true);
      if (isRunning) {
        const match = f?.sha256 && running.hash === f.sha256;
        add("Running now", `${esc(running.name)}${running.hash ? ` · <code>${esc(running.hash.slice(0, 12))}…</code>` : ""}${match ? ' <span class="fd-ok">matches the package hash</span>' : ""}`, true);
      }
      const fav = window.FM1Fav?.has(id);
      details.body.innerHTML = `${f?.about ? `<p class="fd-about">${esc(f.about)}</p>` : ""}<table class="fd-t">${rows.join("")}</table>
        <div class="fd-acts">${window.FM1Fav ? `<button type="button" class="fd-fav">${fav ? "★ Remove from favorites" : "☆ Add to favorites"}</button>` : ""}
          ${f?.sha256 ? `<button type="button" class="fd-copy">Copy SHA-256</button>` : ""}</div>`;
      details.body.querySelector(".fd-fav")?.addEventListener("click", () => { window.FM1Fav.toggle(id); showDetails(); });
      details.body.querySelector(".fd-copy")?.addEventListener("click", async (e) => {
        try { await navigator.clipboard.writeText(f.sha256); e.target.textContent = "Copied"; }
        catch { e.target.textContent = "Copy failed"; }
      });
      details.open();
    }
    // a Details button in the firmware card (#about is rebuilt on every firmware change)
    const more = document.createElement("button");
    more.type = "button"; more.className = "fw-details-btn"; more.textContent = "Details"; more.title = "Firmware details (I)";
    more.addEventListener("click", showDetails);
    // (next to the favorites star, near the top of the card; only moved when out of place, so the
    // star's own observer and this one don't keep moving each other)
    const mount = () => {
      const anchor = about.querySelector(".fw-fav-star") || about.querySelector("b");
      if (anchor) { if (anchor.nextElementSibling !== more) anchor.insertAdjacentElement("afterend", more); }
      else if (!about.contains(more)) about.append(more);
    };
    new MutationObserver(mount).observe(about, { childList: true });
    mount();

    // the hint row under the synth: where the list of keys lives
    const hint = document.querySelector(".hint");
    if (hint && !document.getElementById("sc-open")) {
      const s = document.createElement("span"); s.className = "keyb";
      s.innerHTML = `<button type="button" id="sc-open" class="sc-link" title="All shortcuts"><kbd>?</kbd></button>`;
      hint.appendChild(s);
      s.querySelector("button").onclick = () => sheet.open();
    }

    // ---------------------------------------------------------------- keys
    const step = (d) => {
      const opts = [...fwSel.options].filter((o) => o.value && !o.disabled);
      if (!opts.length) return;
      const i = opts.findIndex((o) => o.value === fwSel.value);
      const next = opts[(i + d + opts.length) % opts.length];
      if (next.value === fwSel.value) return;
      fwSel.value = next.value;
      fwSel.dispatchEvent(new Event("change", { bubbles: true }));
    };
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && openModal) { e.preventDefault(); e.stopPropagation(); openModal.close(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || typing(e.target)) return;
      if (openModal) { if (e.key === "?") { e.preventDefault(); openModal.close(); } return; }
      if (dialogOpen()) return;
      const k = e.key;
      const act = k === "?" ? () => sheet.open() : k === "i" || k === "I" ? showDetails : k === "m" || k === "M" ? () => window.FM1Fav?.toggle(fwSel.value)
        : k === "[" ? () => step(-1) : k === "]" ? () => step(1) : null;
      if (!act) return;
      e.preventDefault();
      act();
    }, true);
    window.FM1Shortcuts = { open: () => sheet.open(), details: showDetails, close: () => openModal?.close(), isOpen: () => !!openModal };
  });

  function injectStyles() {
    if (document.getElementById("sc-css")) return;
    const st = document.createElement("style"); st.id = "sc-css";
    st.textContent = `
      .sc-ov{position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:16px}
      .sc-ov[hidden]{display:none}
      .sc-box{width:min(560px,100%);max-height:min(86vh,760px);display:flex;flex-direction:column;background:var(--ui-pop,#0c0d0f);
        color:var(--ui-text,#e9edf2);border:1px solid var(--ui-line,#2a2c31);border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.55);
        font:13px 'Space Grotesk',-apple-system,'Segoe UI',sans-serif}
      .sc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--ui-line,#1c1e23)}
      .sc-head h2{margin:0;font-size:15px;font-weight:600;min-width:0;overflow-wrap:anywhere}
      .sc-x{background:none;border:1px solid transparent;color:var(--ui-dim,#8b9099);border-radius:7px;width:28px;height:28px;cursor:pointer;font-size:14px;flex:none}
      .sc-x:hover,.sc-x:focus-visible{color:var(--ui-text,#fff);border-color:var(--ui-line,#2a2c31);outline:none}
      .sc-body{overflow-y:auto;padding:6px 16px 16px}
      .sc-body h3{margin:14px 0 6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ui-dim,#8b9099);font-weight:600}
      .sc-body table{width:100%;border-collapse:collapse}
      .sc-body td,.sc-body th{padding:5px 0;vertical-align:top;border-bottom:1px solid var(--ui-line,#1c1e23);text-align:left}
      .sc-body td:first-child{width:38%;white-space:nowrap;padding-right:12px}
      .sc-body th{width:34%;font-weight:500;color:var(--ui-dim,#8b9099);padding-right:12px}
      .sc-body kbd{display:inline-block;min-width:18px;text-align:center;padding:1px 6px;border-radius:5px;font:600 11px 'Space Mono',ui-monospace,monospace;
        background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text,#e9edf2)}
      .sc-body code{font:11px 'Space Mono',ui-monospace,monospace;overflow-wrap:anywhere;color:var(--ui-text2,#c4c8cd)}
      .sc-body a{color:var(--amber-ink,var(--amber));overflow-wrap:anywhere}
      .sc-note,.fd-dim{color:var(--ui-dim,#8b9099)}
      .sc-note{margin:12px 0 0;line-height:1.5}
      .fd-about{margin:10px 0 6px;line-height:1.5;color:var(--ui-text2,#c4c8cd)}
      .fd-cap{display:inline-block;font-weight:600}
      .fd-ok{color:var(--ui-dim,#8b9099)}
      .fd-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
      .fd-acts button{font:inherit;font-size:12px;color:var(--ui-text,#e9edf2);background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);
        border-radius:8px;padding:6px 11px;cursor:pointer}
      .fd-acts button:hover{border-color:var(--ui-line-hi,#3a3d44)}
      .fw-details-btn{font:inherit;font-size:11px;margin-left:6px;padding:1px 8px;border-radius:6px;cursor:pointer;color:var(--ui-text2,#c4c8cd);
        background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);vertical-align:1px}
      .fw-details-btn:hover{border-color:var(--ui-line-hi,#3a3d44);color:var(--ui-text,#fff)}
      .sc-link{font:inherit;background:none;border:0;padding:0;color:inherit;cursor:pointer}
      .sc-link:hover{color:var(--ui-text,#fff)}
    `;
    document.head.appendChild(st);
  }
})();
