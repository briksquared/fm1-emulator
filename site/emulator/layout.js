// Hide and show the app's bars and panels: the top bar, the transport bar, both sidebars, the
// title row, the shortcut hints, and the panels inside the sidebars (Now running, Firmware radar,
// Install firmware). Hidden bars and sidebars leave a tab in a slim "Hidden" strip at the top, with
// "Show all" next to them, and Ctrl+Shift+H (or the command palette) shows everything again, so
// hiding every bar can never leave you without a way back. Choices are kept between launches.
// Hiding only changes what is shown: nothing is stopped, reset or reloaded (audio, recordings,
// the running firmware and an install all carry on).
// Safety: the Install firmware panel and its sidebar come back by themselves while an install is
// running, while its confirm question is up, or when an earlier install did not finish, and they
// cannot be hidden until that is over (session only; the saved choice is not changed).
// Also here: the floating tool panels (Keys, Rec, Stickers, Banks, Resources, Scope, Tuner,
// MIDI monitor, Audio) get a close button and Esc, their buttons report aria-expanded, and Esc
// closes the Customize drawer too.
import { FlashJournal, pendingRecovery } from "./flash-core.js?v=5";

const KEY = "fm1.layout.v1";
const REGIONS = [
  { id: "top", label: "Top bar", sel: "header.site", place: "end" },
  { id: "transport", label: "Transport bar", sel: "#fm1-transport", place: "end" },
  { id: "left", label: "Left sidebar", sel: "aside.side-left", place: "side" },
  { id: "right", label: "Right sidebar", sel: "aside.side-right", place: "side" },
  { id: "title", label: "Title row", sel: ".deck > .deck-head", place: "end" },
  { id: "hints", label: "Shortcut hints", sel: ".deck > p.hint", place: "end" },
];
const PANELS = [
  { id: "now", label: "Now running", sel: "aside.side-left > section.box:not(.update-box)" },
  { id: "radar", label: "Firmware radar", sel: "aside.side-left > section.update-box" },
  { id: "install", label: "Install firmware", sel: "aside.side-right > section.install-box" },
];
// floating tool panels: [panel id, its button id, name]
const POPS = [["keys-pop", "keys-btn", "Keys"], ["rec-pop", "rec-btn", "Rec"], ["stk-pop", "stk-btn", "Stickers"],
  ["bank-pop", "bank-btn", "Banks"], ["res-pop", "res-btn", "Resources"], ["scope-pop", "scope-btn", "Scope"],
  ["tuner-pop", "tuner-btn", "Tuner"], ["mon-pop", "mon-btn", "MIDI monitor"], ["wav-pop", "wav-btn", "Audio"]];

const load = () => { try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; } };
let saved = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* storage full or off: the choice lasts this session */ } };
const refit = () => { try { window.FM1Rig?.fit?.(); } catch { /* deck not built yet */ } };

const css = document.createElement("style");
css.textContent = `
  .lay-off{display:none!important}
  .lay-btn{flex:none;display:inline-grid;place-items:center;min-width:24px;height:24px;padding:0 5px!important;margin:0!important;border-radius:6px!important;
    border:1px solid var(--ui-line,#2a2c31)!important;background:var(--ui-surface,#17181b)!important;color:var(--ui-dim,#9aa0ab)!important;
    font:600 12px/1 'Space Grotesk',-apple-system,'Segoe UI',sans-serif!important;cursor:pointer;line-height:1!important;min-height:0!important}
  .lay-btn:hover,.lay-btn:focus-visible{color:var(--ui-text,#e9edf2)!important;border-color:var(--amber)!important}
  .lay-btn:focus-visible,#lay-dock button:focus-visible,.fm1-face:focus-visible,.lay-popx:focus-visible{outline:2px solid var(--amber);outline-offset:2px}
  .lay-btn:disabled{opacity:.45;cursor:not-allowed}
  .lay-btn,.lay-boxbar .lay-btn{width:auto!important}
  header.site .wrap > .lay-btn{order:99}
  .deck-head > .lay-btn{order:99}
  #fm1-transport > .lay-btn{margin-left:auto!important}
  .deck-head > .lay-btn{align-self:center;margin-left:2px!important}
  .hint > .lay-btn{margin-left:4px!important}
  .lay-sidehead{display:flex;justify-content:flex-end;align-items:center;gap:6px;margin:0 0 -4px}
  .lay-sidehead span{font:600 10px 'Space Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ui-dim,#8b9099);margin-right:auto}
  .lay-box{position:relative}
  .lay-boxbar{display:flex;align-items:center;gap:6px}
  .lay-box:not(.lay-boxoff) > .lay-boxbar{position:absolute;top:4px;right:4px;z-index:2}
  .lay-box:not(.lay-boxoff) > .lay-boxbar .lay-boxname{display:none}
  .lay-boxname{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:600 10.5px 'Space Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ui-text2,#c4c8cd)}
  .lay-boxoff > :not(.lay-boxbar){display:none!important}
  .lay-boxoff{padding-block:6px!important}
  .install-box.lay-boxoff > .fi-head{display:block!important}
  .install-box.lay-boxoff .fi-pitch{display:none}
  .install-box > .lay-boxbar{position:absolute!important;top:8px;right:8px}
  .install-box > .lay-boxbar .lay-boxname{display:none!important}
  #lay-dock{display:flex;flex-wrap:wrap;align-items:center;gap:5px 6px;padding:4px 12px;background:var(--ui-bar,var(--bar,#0d0e10));
    border-bottom:1px solid var(--ui-line,#1c1e23);font:11.5px 'Space Grotesk',-apple-system,'Segoe UI',sans-serif;color:var(--ui-dim,#8b9099);position:relative;z-index:41}
  #lay-dock[hidden]{display:none}
  #lay-dock .lay-dock-lab{font:600 10px 'Space Mono',monospace;letter-spacing:.08em;text-transform:uppercase;margin-right:2px}
  #lay-dock button{white-space:nowrap;min-height:26px;padding:3px 10px;border-radius:999px;cursor:pointer;font:inherit;
    border:1px solid var(--ui-line,#2a2c31);background:var(--ui-surface,#17181b);color:var(--ui-text,#e9edf2)}
  #lay-dock button:hover{border-color:var(--amber)}
  #lay-dock .lay-all{margin-left:auto;border-color:var(--amber);color:var(--amber-ink,var(--amber))}
  #lay-dock kbd{font:10px 'Space Mono',monospace;opacity:.8}
  .lay-pophead{display:flex;justify-content:flex-end;align-items:center;margin:-6px -4px 2px 0;padding:0;flex:none}
  #stk-pop > .lay-pophead,#res-pop > .lay-pophead{margin:0;padding:5px 6px 0}
  .lay-popx{width:24px!important;height:24px!important;min-width:0!important;max-width:24px!important;display:grid!important;place-items:center;padding:0!important;margin:0!important;
    border-radius:6px!important;cursor:pointer;flex:none!important;border:1px solid var(--ui-line,#2a2c31)!important;background:var(--ui-surface,#17181b)!important;
    color:var(--ui-dim,#9aa0ab)!important;font:13px/1 sans-serif!important;box-shadow:none!important}
  .lay-popx:hover{color:var(--ui-text,#fff);border-color:var(--amber)}
  @media (prefers-reduced-motion:reduce){#lay-dock *{transition:none!important}}`;
document.head.appendChild(css);

const btn = (text, label) => { const b = document.createElement("button"); b.type = "button"; b.className = "lay-btn"; b.textContent = text; b.title = label; b.setAttribute("aria-label", label); return b; };
const dock = document.createElement("div");
dock.id = "lay-dock"; dock.hidden = true; dock.setAttribute("role", "region"); dock.setAttribute("aria-label", "Hidden bars and panels");
document.body.prepend(dock);

const regions = new Map();   // id -> { r, el, toggle }
const panels = new Map();
let locked = false;          // an install needs its panel on screen

function renderDock() {
  dock.textContent = "";
  const hidden = [...regions.values()].filter((x) => x.el.classList.contains("lay-off"));
  dock.hidden = hidden.length === 0;
  if (!hidden.length) return;
  const lab = document.createElement("span"); lab.className = "lay-dock-lab"; lab.textContent = "Hidden:"; dock.appendChild(lab);
  for (const x of hidden) {
    const b = document.createElement("button"); b.type = "button"; b.dataset.region = x.r.id;
    b.textContent = `${x.r.label} ▾`; b.title = `Show the ${x.r.label.toLowerCase()}`; b.setAttribute("aria-expanded", "false");
    b.onclick = () => { setRegion(x.r.id, false); x.toggle?.focus(); };
    dock.appendChild(b);
  }
  const all = document.createElement("button"); all.type = "button"; all.className = "lay-all";
  all.innerHTML = "Show all <kbd>Ctrl+Shift+H</kbd>"; all.title = "Show every bar and panel (Ctrl+Shift+H)";
  all.onclick = () => { showAll(); [...regions.values()].map((x) => x.toggle).find((t) => t.getClientRects().length)?.focus(); };
  dock.appendChild(all);
}

function setRegion(id, off, { persist = true } = {}) {
  const x = regions.get(id); if (!x) return;
  if (off && locked && id === "right") return;
  x.el.classList.toggle("lay-off", off);
  if (x.toggle) x.toggle.setAttribute("aria-expanded", String(!off));
  if (persist) { if (off) saved[id] = true; else delete saved[id]; save(); }
  renderDock();
  requestAnimationFrame(refit);
}
function setPanel(id, off, { persist = true } = {}) {
  const x = panels.get(id); if (!x) return;
  if (off && locked && id === "install") return;
  x.el.classList.toggle("lay-boxoff", off);
  x.toggle.textContent = off ? "▾" : "▴";
  const l = `${off ? "Show" : "Hide"} ${x.p.label}`;
  x.toggle.title = l; x.toggle.setAttribute("aria-label", l); x.toggle.setAttribute("aria-expanded", String(!off));
  if (persist) { if (off) saved["panel:" + id] = true; else delete saved["panel:" + id]; save(); }
  requestAnimationFrame(refit);
}
function showAll() {
  for (const id of regions.keys()) setRegion(id, false);
  for (const id of panels.keys()) setPanel(id, false);
}
function hideAll() {
  for (const id of regions.keys()) setRegion(id, true);
}

function mountRegion(r) {
  if (regions.has(r.id)) return true;
  const el = document.querySelector(r.sel); if (!el) return false;
  const toggle = btn(r.place === "side" ? "‹›" : "▴", `Hide the ${r.label.toLowerCase()}`);
  toggle.setAttribute("aria-expanded", "true");
  if (r.id === "left") toggle.textContent = "‹";
  if (r.id === "right") toggle.textContent = "›";
  toggle.onclick = () => { setRegion(r.id, true); dock.querySelector(`[data-region="${r.id}"]`)?.focus(); };
  if (r.place === "side") {
    const head = document.createElement("div"); head.className = "lay-sidehead";
    head.appendChild(toggle);
    el.prepend(head);
  } else if (r.id === "top") (el.querySelector(".wrap") || el).appendChild(toggle);
  else el.appendChild(toggle);
  regions.set(r.id, { r, el, toggle });
  if (saved[r.id]) setRegion(r.id, true, { persist: false });
  return true;
}
function mountPanel(p) {
  if (panels.has(p.id)) return true;
  const el = document.querySelector(p.sel); if (!el) return false;
  el.classList.add("lay-box");
  const bar = document.createElement("div"); bar.className = "lay-boxbar";
  const name = document.createElement("span"); name.className = "lay-boxname"; name.textContent = p.label;
  const toggle = btn("▴", `Hide ${p.label}`); toggle.setAttribute("aria-expanded", "true");
  toggle.onclick = () => setPanel(p.id, !el.classList.contains("lay-boxoff"));
  bar.append(name, toggle); el.prepend(bar);
  panels.set(p.id, { p, el, toggle });
  // Firmware radar always boots collapsed so the player stays one screen; expand with ▾.
  // Other panels honour a saved collapse choice.
  if (p.id === "radar") setPanel(p.id, true, { persist: false });
  else if (saved["panel:" + p.id]) setPanel(p.id, true, { persist: false });
  return true;
}

// The install panel stays on screen while it matters (see the header).
const journalNeedsPanel = () => { try { return !!pendingRecovery(new FlashJournal(localStorage).read()); } catch { return false; } };
function guardInstall() {
  const box = document.querySelector("aside.side-right > section.install-box");
  if (!box) return;
  const need = box.getAttribute("aria-busy") === "true" || !!box.querySelector(".fi-confirm");
  if (need || journalNeedsPanel()) {
    if (regions.get("right")?.el.classList.contains("lay-off")) setRegion("right", false, { persist: false });
    if (panels.get("install")?.el.classList.contains("lay-boxoff")) setPanel("install", false, { persist: false });
  }
  locked = need;
  const reason = "Can't hide this while an install is running or waiting for your answer";
  for (const t of [regions.get("right")?.toggle, panels.get("install")?.toggle]) if (t) { t.disabled = need; if (need) t.title = reason; else t.title = t.getAttribute("aria-label"); }
}

function mountPops() {
  for (const [popId, btnId, name] of POPS) {
    const pop = document.getElementById(popId), b = document.getElementById(btnId);
    if (!pop || !b || pop.dataset.layx) continue;
    pop.dataset.layx = "1";
    const isOpen = () => (pop.classList.contains("open") || (popId === "res-pop" && !pop.hidden)) && !pop.classList.contains("fm1-inline");
    if (pop.classList.contains("fm1-inline")) continue;            // built into a module below the FM-1
    // (some panels rebuild their contents, so the button is put back whenever it goes missing)
    // It sits in a slim strip of its own at the top of the panel, so it never covers the panel's
    // own controls (several panels have buttons or labels in their top-right corner).
    const ensureX = () => {
      if (pop.querySelector(".lay-popx")) return;
      const x = document.createElement("button"); x.type = "button"; x.className = "lay-popx"; x.textContent = "✕";
      x.setAttribute("aria-label", `Close ${name} (it keeps its settings)`); x.title = `Close ${name}`;
      x.onclick = (e) => { e.stopPropagation(); if (isOpen()) b.click(); b.focus?.(); };
      const head = document.createElement("div"); head.className = "lay-pophead"; head.appendChild(x);
      pop.prepend(head);
    };
    ensureX();
    b.setAttribute("aria-haspopup", "true");
    const sync = () => b.setAttribute("aria-expanded", String(isOpen()));
    new MutationObserver(sync).observe(pop, { attributes: true, attributeFilter: ["class", "hidden"] }); sync();
    new MutationObserver(ensureX).observe(pop, { childList: true, subtree: true });
    pop._layOpen = isOpen; pop._layBtn = b;
  }
  const sg = document.getElementById("tool-group"), sb = document.getElementById("tool-group-btn");
  if (sg && sb && !sb.dataset.layx) {
    sb.dataset.layx = "1"; sb.setAttribute("aria-haspopup", "menu");
    const sync = () => sb.setAttribute("aria-expanded", String(sg.classList.contains("open")));
    new MutationObserver(sync).observe(sg, { attributes: true, attributeFilter: ["class"] }); sync();
  }
}

// Keyboard: Ctrl+Shift+H shows everything. Esc closes the floating tool panels (not a confirm or a
// dialog: those handle Esc themselves, and a pending install question is answered "Cancel" by its own code).
addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key === "H" || e.key === "h")) { e.preventDefault(); showAll(); return; }
  if (e.key !== "Escape" || e.defaultPrevented) return;
  if (document.querySelector(".fi-confirm")) return;
  let closed = false;
  for (const [popId] of POPS) { const pop = document.getElementById(popId); if (pop?._layOpen?.()) { pop._layBtn.click(); closed = true; } }
  const cz = document.querySelector("#fm1-cz.open");
  if (!closed && cz && ![...document.querySelectorAll('[role="dialog"]')].some((d) => d.getClientRects().length && !cz.contains(d))) { cz.querySelector(".close")?.click(); closed = true; }
  if (closed) e.preventDefault();
});

// Command palette entries (palette.js reads window.FM1Layout.commands()).
function commands() {
  const out = [
    { label: "Show all bars and panels (Ctrl+Shift+H)", group: "view", rank: 1, run: showAll },
    { label: "Hide all bars (keep the FM-1)", group: "view", rank: 1, run: hideAll },
  ];
  for (const [id, x] of regions) { const off = x.el.classList.contains("lay-off"); out.push({ label: `${off ? "Show" : "Hide"} the ${x.r.label.toLowerCase()}`, group: "view", rank: 1, run: () => setRegion(id, !off) }); }
  for (const [id, x] of panels) { const off = x.el.classList.contains("lay-boxoff"); out.push({ label: `${off ? "Show" : "Hide"} ${x.p.label}`, group: "view", rank: 1, run: () => setPanel(id, !off) }); }
  return out;
}
window.FM1Layout = {
  commands, showAll, hideAll,
  set: (id, off) => (regions.has(id) ? setRegion(id, off) : setPanel(id, off)),
  state: () => ({ regions: Object.fromEntries([...regions].map(([k, x]) => [k, !x.el.classList.contains("lay-off")])), panels: Object.fromEntries([...panels].map(([k, x]) => [k, !x.el.classList.contains("lay-boxoff")])) }),
  regions: () => REGIONS.map((r) => r.id), panels: () => PANELS.map((p) => p.id),
};

// Mount as the pieces appear (the transport bar, the install panel and the tool panels are built by
// other scripts, some after this one runs).
let tries = 0;
const mountAll = () => {
  let done = true;
  for (const r of REGIONS) done = mountRegion(r) && done;
  for (const p of PANELS) done = mountPanel(p) && done;
  mountPops();
  if (panels.has("install") && !panels.get("install").obs) {
    const box = panels.get("install").el;
    panels.get("install").obs = new MutationObserver(guardInstall);
    panels.get("install").obs.observe(box, { attributes: true, attributeFilter: ["aria-busy"], childList: true, subtree: true });
    guardInstall();
  }
  return done && POPS.every(([id]) => document.getElementById(id)?.dataset.layx || document.getElementById(id)?.classList.contains("fm1-inline"));
};
const timer = setInterval(() => { if (mountAll() || ++tries > 80) clearInterval(timer); }, 150);
mountAll();
