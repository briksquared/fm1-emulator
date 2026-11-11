// The page: the front panel (drawn by the same Rust code as the native window, in its own wasm
// instance), the pointer and keyboard input, the firmware and clock pickers, and the audio graph
// that runs the emulator. Every firmware boots from its whole update package (.fwsc), unpacked
// in the wasm: a catalog entry's fetched from its author's site, or one opened from this
// computer (M-VAVE's own: their server does not let other pages fetch it).
import { fetchPackage } from "./fwsc.js";
import { SaveStore, packageHash, changedSectors, packSectors, exportSave, importSave } from "./persistence.js";
import "./catalog-source.js";
import { judgeSecond, recovered } from "./perf-judge.js?v=3";
import { mergeCatalog, isSafeRemembered } from "./catalog-updates.js?v=5";
import { wireRadar } from "./radar.js?v=2";
import {
  remapChannel, isActivityMessage, isFm1PortName, splitSysex,
  parseRemoteFm1, parseFm1Ctrl, parsePanelAbsolute,
  fxMapFor, fxCcMessage, effectChannelConflict, classifyDx7Sysex,
  FM1_IDENTITY_REQ, isRecentRelease,
} from "./midi-bridge.js?v=4";
import { Updater } from "./fm1ota.js";

window.FM1Midi = {
  parseRemoteFm1, parseFm1Ctrl, parsePanelAbsolute,
  fxMapFor, fxCcMessage, effectChannelConflict, classifyDx7Sysex,
  FM1_IDENTITY_REQ, isRecentRelease, splitSysex, isFm1PortName,
};

const CLOCKS = [60, 80, 100, 120, 160, 200, 240];
// The device this page is for: the FM-1 (index.html) or the SMK-37 (smk37/index.html, <html
// data-device="smk37">): its catalog, words and panel. A package says which board it runs on, and
// the panel follows it (an SMK-37 package opened on the FM-1 page gets the SMK-37's).
const DEVICE = document.documentElement.dataset.device === "smk37" ? "smk37" : "fm1";
const DEV = DEVICE === "smk37"
  ? { product: "M-VAVE SMK-37", board: 1, key: "smk37.", stock: "SMK-37 Pro_016.fwsc", stockFile: /^SMK-37 (Pro|Elite)_\d+( \(\d+\))?\.fwsc$/i,
      other: { name: "FM-1", href: "../" } }
  : { product: "M-VAVE FM-1", board: 0, key: "fm1.", stock: "FM-1.fwsc", stockFile: /^FM-1( \(\d+\))?\.fwsc$/i,
      other: { name: "SMK-37", href: "smk37/" } };
const params = new URLSearchParams(location.search);
const stored = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

const bundledCatalog = await (await fetch("firmwares.json?v=62")).json();
const source = globalThis.FM1Source;
// Open-license radar finds only (firmwares.json is never rewritten). Prefer the current key;
// still read the older open-source key so 1.1.0 remembers survive an update.
const radarKey = "fm1.firmware-radar.v1";
const legacyRadarKey = "fm1.open-source-catalog.v1";
let radarRemembered = [];
try {
  const raw = JSON.parse(stored(radarKey) || stored(legacyRadarKey) || "[]");
  radarRemembered = (Array.isArray(raw) ? raw : []).filter(isSafeRemembered);
} catch { /* discard malformed local data */ }
const catalog = mergeCatalog(bundledCatalog, radarRemembered);
window.FM1Catalog = catalog;
window.FM1CatalogSite = source.origin;   // (extras.js links to the catalog site)
const byId = new Map(catalog.firmwares.map((f) => [f.id, f]));
// searchable text per firmware (name + author + description), so search finds by what it does
const fwSearchText = Object.fromEntries(catalog.firmwares.map((f) => [f.id, `${f.id} ${f.name} ${f.version || ""} ${f.author || ""} ${f.product || ""} ${f.about || ""}`.toLowerCase()]));
// the community catalog's ids too, where they differ (its cards link here with ?fw=<its id>)
for (const f of catalog.firmwares) { const id = source.idOf(f); if (id && !byId.has(id)) byId.set(id, f); }
// ?embed=1: only the device and its controls, for a window on another site (the inline script in
// <head> set data-embed before the first paint; style.css hides the rest). It does not change the
// firmware this browser starts with on the full page.
const EMBED = document.documentElement.hasAttribute("data-embed");
let fw = byId.get(params.get("fw")) || byId.get(stored(DEV.key + "fw")) || byId.get(catalog.default) || catalog.firmwares[0];
let mhz = Number(params.get("mhz") || stored("fm1.mhz") || 100);
// the audio buffer: "interactive" (small: keys answer quickly) unless this device needed a larger
// one ("playback", offered when the sound drops out with time to spare; ?latency= overrides)
const defaultLatency = () => (window.FM1Desktop ? "balanced" : "interactive");
let latency = params.get("latency") || stored("fm1.latency") || defaultLatency();

const canvas = document.getElementById("panel");
const ctx = canvas.getContext("2d");
const status = document.getElementById("status");
const startBtn = document.getElementById("start");
const fwSel = document.getElementById("fw");
const mhzSel = document.getElementById("mhz");
const bufSel = document.getElementById("buf");
const about = document.getElementById("about");
const title = document.getElementById("title");
const openInput = document.getElementById("open");
const bankInput = document.getElementById("bank");
const bankName = document.getElementById("bankname");
const saveStatus = document.getElementById("save-status");
const saveStore = new SaveStore();
const memoryRecords = new Map();
const saveMessage = (text, failed = false) => { saveStatus.textContent = text; saveStatus.dataset.error = String(failed); };
const issue = window.FM1Issues || { show() {}, clear() {} };   // the status chip in the transport bar (issues.js)
const saveFailure = error => {
  saveMessage(`Not saved in browser: ${error.message}. Export a backup to keep your changes.`, true);
  issue.show("save", { title: "Not saved", text: `Changes were not saved in the app: ${error.message}. Export a backup to keep them.`, level: "error" });
};

// per-firmware capability audit (what each one accepts, so the info panel can say how to drive it)
const CAPS = await fetch("classify.json?v=53").then(r => r.json()).then(a => Object.fromEntries(a.map(x => [x.id, x]))).catch(() => ({}));

const wasm = await (await fetch("fm1_web.wasm?v=25")).arrayBuffer();   // the worklet gets its own copy (bump v when the wasm is rebuilt)
// (the panel's instance runs no machine: its JIT import is never called)
const ui = (await WebAssembly.instantiate(wasm, { env: { fm1_jit_compile: () => 0 } })).instance.exports;
// the panel drawn: 0 the FM-1's, 1 the SMK-37's (setBoard; the canvas takes its size)
let W = 0, H = 0, board = -1;
const fitPanel = () => document.documentElement.style.setProperty("--above",
  `${Math.round(canvas.parentElement.getBoundingClientRect().top + scrollY)}px`);
{
  // (next frame: --above resizes the panel, which can resize what is observed; doing it inside
  // the callback is a ResizeObserver loop)
  let queued = false;
  const ro = new ResizeObserver(() => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; fitPanel(); }); } });
  ro.observe(document.querySelector("header"));
  ro.observe(document.querySelector(".bar"));
}
fitPanel();

let node = null, engine = null, worker = null, running = null;   // engine: where the machine runs (a worker or the worklet's port)
let frame = null;            // the latest LCD + LEDs from the audio thread
const down = new Uint8Array(64);           // keys and buttons held (FM-1: matrix ids 0..40; SMK-37: keys 0..36, buttons 37..54)
const encClicks = new Int32Array(8);
const turning = new Uint32Array(9);
let pot = 900;
// SMK-37: its analog inputs as set (pads 0..15, faders 16..19, the pitch / mod wheel 20 / 21)
const PITCH_REST = 535, MOD_REST = 629;
const analog = new Uint16Array(23);
analog[20] = PITCH_REST;
analog[21] = MOD_REST;
function setBoard(b) {
  if (b === board) return;
  board = b;
  ui.panel_board(b);
  W = ui.panel_width();
  H = ui.panel_height();
  canvas.width = W;
  canvas.height = H;
  // the synth's width follows the room left below the header and the bar (index.html's canvas rule)
  document.documentElement.style.setProperty("--aspect", String(W / H));
  document.documentElement.dataset.board = b ? "smk37" : "fm1";
  down.fill(0);
  encClicks.fill(0);
}
setBoard(DEV.board);

// ---------------------------------------------------------------- firmware and clock
for (const f of catalog.firmwares) fwSel.add(new Option(`${f.name} ${f.version}`, f.id));
for (const c of new Set([...CLOCKS, mhz].sort((a, b) => a - b))) mhzSel.add(new Option(`${c} MHz`, c));
fwSel.value = fw.id;
mhzSel.value = mhz;

// the guide's firmware list, one card per catalog entry; "Play" picks it like the select does
const NO_NOTE = "MIDI: no sound from a plain note-on";
const MIDI_NOTES = {
  mvave: "MIDI: channel 2 in the emulator (not yet checked on a real FM-1)",
  felucca: "MIDI: its parts play on channels 1–4",
  choralroot: NO_NOTE, hortator: NO_NOTE, "sloop-alg": NO_NOTE, x0x: NO_NOTE,
};
const cards = new Map();
const catalogCard = (f) => source.card(f);
// the FM-1 page: which entries have an SMK-37 build (that catalog names them)
const twins = new Map();
if (DEVICE === "fm1") {
  try {
    for (const s of (await (await fetch("smk37/firmwares.json")).json()).firmwares) if (s.fm1) twins.set(s.fm1, s.id);
  } catch { /* (no SMK-37 catalog next to this page: no links) */ }
}
{
  const el = (tag, cls, ...kids) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    e.append(...kids);
    return e;
  };
  const link = (href, text) => Object.assign(document.createElement("a"), { href, textContent: text });
  const list = document.getElementById("fwlist");
  for (const f of catalog.firmwares) {
    const play = el("button", "", "Play");
    play.type = "button";
    play.setAttribute("aria-label", `Play ${f.name}`);
    play.addEventListener("click", () => {
      if (fw.id !== f.id) {
        fwSel.value = f.id;
        fwSel.dispatchEvent(new Event("change"));
      }
      scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
    const links = el("div", "links");
    if (f.byo) links.append(link(f.download, `download ${DEV.stock}`), link(f.repo, "notes ↗"));
    else {
      links.append(link(f.repo, `source · ${f.license} ↗`));
      // the catalog's card has the details and installs it on a real FM-1; the author's installer otherwise
      if (source.idOf(f)) links.append(link(catalogCard(f), "details & install ↗"));
      else if (f.installer) links.append(link(f.installer, "install ↗"));
    }
    // the same firmware on the other device (an SMK-37 build's `fm1`, or an FM-1 entry it names)
    const twin = DEVICE === "smk37" ? f.fm1 : twins.get(f.id);
    if (twin) links.append(link(`${DEV.other.href}?fw=${twin}`, `also on the ${DEV.other.name}`));
    const by = [f.author + (f.base ? ` (${f.base})` : ""), f.porter && `SMK-37 port: ${f.porter}`].filter(Boolean).join(" · ");
    const headKids = [el("b", "", f.name), el("span", "dim", f.version)];
    if (f.remote && isRecentRelease(f.released, 14)) {
      const badge = el("span", "new-badge", "new");
      badge.title = `Released ${String(f.released).slice(0, 10)}`;
      headKids.splice(2, 0, badge);
    }
    if (f.kind) {
      const kinds = Array.isArray(f.kind) ? f.kind : [f.kind];
      for (const k of kinds.slice(0, 2)) headKids.push(Object.assign(el("span", "kind-tag", String(k)), { title: "Catalog kind" }));
    }
    headKids.push(play);
    const card = el("li", "",
      el("div", "head", ...headKids),
      el("div", "by", by),
      el("p", "what", f.byo && DEVICE === "fm1" ? "The firmware the FM-1 ships with: a DX7-style FM synth, both cores running. " +
        "Bring your own copy (see below)." : f.about));
    if (DEVICE === "fm1" && MIDI_NOTES[f.id]) card.append(el("div", "midi", MIDI_NOTES[f.id]));
    card.append(links);
    list.append(card);
    cards.set(f.id, card);
  }
}

// Cached packages are pinned to their exact bytes. Checking for updates is explicit.
const packages = new Map();
let localFw = null;
class NeedFile extends Error {}
async function keptEntry(id) {
  try { return await saveStore.entry(DEV.key + id); }
  catch (error) { saveFailure(error); return null; }
}
async function packageOf(f) {
  if (f.id === "local") return { bytes: f.bytes, url: null };
  if (packages.has(f.id)) return packages.get(f.id);
  const kept = await keptEntry(f.id);
  // A kept copy is pinned bytes (with its saved flash). But if the catalog now points this id at a
  // different package than the kept one came from (e.g. the stock firmware was swapped to a build
  // that runs), the catalog wins: fall through and fetch the new one.
  if (kept && (!kept.url || f.byo || kept.url === f.package)) {
    const got = { bytes: kept.package, url: kept.url };
    packages.set(f.id, got);
    return got;
  }
  if (f.byo) {
    // Migration: old versions stored only uploaded stock packages, by catalog ID.
    let bytes;
    try { bytes = await saveStore.get("packages", f.id); } catch (error) { saveFailure(error); }
    if (!bytes) throw new NeedFile();
    const got = { bytes, url: null };
    packages.set(f.id, got);
    return got;
  }
  const got = await fetchPackage(f);
  if (f.remote && f.sha256 && await packageHash(got.bytes) !== f.sha256)
    throw new Error(`${f.name}: downloaded package does not match the catalog checksum`);
  packages.set(f.id, got);
  noteVersion(f, got.version);
  return got;
}
// A package that had gone came as the one the catalog lists now: show the version that runs.
function noteVersion(f, version) {
  if (!version || version === f.version) return;
  f.version = version;
  const opt = [...fwSel.options].find((o) => o.value === f.id);
  if (opt) opt.text = `${f.name} ${f.version}`;
  cards.get(f.id)?.querySelector(".head .dim")?.replaceChildren(f.version);
  if (f === fw) showFirmware();
}
const keptLocal = await keptEntry("local");
if (keptLocal) {
  localFw = { id: "local", name: keptLocal.name, version: "", bytes: keptLocal.package };
  fwSel.add(new Option(`${localFw.name} (your file)`, "local"), 0);
  if (params.get("fw") === "local" || (!params.has("fw") && stored(DEV.key + "fw") === "local")) { fw = localFw; fwSel.value = "local"; }
}
for (const f of catalog.firmwares.filter(f => f.byo)) {
  try { await packageOf(f); } catch { /* user has not opened a stock package yet */ }
}
let bank = null;                           // a DX7 32-voice bank for the stock firmware, or null

let loadedUrl = null;                      // the package the running machine came from

function showFirmware() {
  // Deck brand is the Worker mark; firmware name lives beside it (and in status), not as "M-VAVE · Felucca".
  const fwEl = document.getElementById("title-fw");
  const label = running && running.entry !== DEV.key + fw.id
    ? `${running.record.name} · ${fw.name}`
    : `${fw.name}`;
  if (fwEl) { fwEl.hidden = false; fwEl.textContent = label; }
  else if (title) title.textContent = label;
  for (const [id, card] of cards) {
    card.classList.toggle("on", id === fw.id);
    card.querySelector("button").textContent = id === fw.id ? "Selected" : "Play";
  }
  const b = document.createElement("b");
  b.textContent = `${fw.name} ${fw.version}`.trim();
  let parts;
  if (fw.id === "local") {
    parts = [b, "Opened from this computer; kept with its saved flash after Start."];
  } else if (fw.byo) {
    const dl = document.createElement("a");
    dl.href = fw.download;
    dl.textContent = `download ${DEV.stock} from M-VAVE`;
    const doc = document.createElement("a");
    doc.href = fw.repo;
    doc.textContent = "how it runs";
    const have = packages.has(fw.id) ? " Your copy is kept in this browser; open another .fwsc to replace it." :
      " Then click \u201cOpen .fwsc\u2026\u201d (or drop the file on the synth); this browser keeps it for next time.";
    parts = [b, "M-VAVE's own firmware. This page does not host it and cannot fetch it: ", dl, "." + have +
      (DEVICE === "fm1" ? " It starts with a small patch bank of the emulator's own; \u201cDX7 bank\u2026\u201d loads a 32-voice .syx · " :
        " (A MIDI controller: its notes go to USB / Bluetooth MIDI, so no sound here; slower than real time in the browser so far.) · "), doc];
  } else {
    const links = document.createElement("span");
    links.className = "links";
    const a = document.createElement("a");
    a.href = fw.repo;
    a.textContent = `source · ${fw.license} ↗`;
    links.append(a);
    if (source.idOf(fw)) {
      const h = document.createElement("a");
      h.href = catalogCard(fw);
      h.textContent = "details & install ↗";
      links.append(h);
    }
    const what = document.createElement("span");
    what.className = "what";
    what.textContent = fw.about;
    parts = [b, `by ${fw.author}`, links, what];
  }
  // capability tags from the audit: how you drive this firmware
  const cap = CAPS[fw.id];
  if (cap) {
    const tags = [];
    if (cap.usbMidi) tags.push(["Plays MIDI", "Open the MIDI device below the synth to play notes or patterns into it"]);
    if (cap.banks) tags.push(["DX7 banks", "Load a 32-voice .syx bank from “Banks” in the top bar"]);
    if (cap.audioIn) tags.push(["Sampler", "Open Tape, Feed a sample in, then record it on the device (e.g. zp12: LFO → REC)"]);
    if (cap.feats && cap.feats.includes("midiClock")) tags.push(["Clock-sync", "Turn on Clock in the MIDI device so its sequencer/arp follows the tempo"]);
    if (tags.length) {
      const wrap = document.createElement("span"); wrap.className = "caps";
      for (const [t, tip] of tags) { const s = document.createElement("span"); s.className = "cap"; s.textContent = t; s.title = tip; wrap.append(s); }
      parts.push(wrap);
    }
  }
  if (loadedUrl) {
    const p = document.createElement("a");
    p.href = loadedUrl;
    p.textContent = loadedUrl.replace(/\/$/, "").split("/").pop();   // April OS: its installer page
    parts.push(" Running ", p, ".");
  }
  about.replaceChildren(...parts);
  const q = new URLSearchParams(location.search);
  q.set("fw", fw.id);
  q.set("mhz", mhz);
  history.replaceState(null, "", `?${q}`);
  document.getElementById("fullpage").href = fw.id === "local" ? "./" : `./?fw=${fw.id}`;
}
showFirmware();

fwSel.addEventListener("change", () => {
  fw = byId.get(fwSel.value) || localFw;
  loadedUrl = null;
  if (!EMBED) store(DEV.key + "fw", fw.id);
  showFirmware();
  fwSel.blur();                 // back to playing from the keyboard
  // Tell the Install panel (right bar) to mirror this pick — Random / Browse / #fw all land here.
  // Install never writes back into #fw, so browsing firmwares only on the right stays independent.
  try { document.dispatchEvent(new CustomEvent("fm1-fw-selected", { detail: { id: fw.id } })); } catch {}
  try { window.FM1Install?.followEmulator?.(fw.id); } catch {}
  if (node) boot();
});
mhzSel.addEventListener("change", () => {
  mhz = Number(mhzSel.value);
  store("fm1.mhz", mhz);
  showFirmware();
  mhzSel.blur();
  if (node) boot();
});
if (bufSel) {
  bufSel.value = latency;                         // reflect the stored buffer size
  bufSel.addEventListener("change", () => {
    const v = bufSel.value;
    bufSel.blur();
    if (node) setLatency(v); else { latency = v; store("fm1.latency", v); }
  });
}

// a package from this computer: the file picker or a drop on the panel. With M-VAVE's entry
// chosen, or a file named like theirs, it is that entry's copy and is kept for next time.
async function openLocal(file) {
  if (!file) return;
  if (file.size > (8 << 20)) throw new Error("firmware package is larger than 8 MB");
  const mv = catalog.firmwares.find((f) => f.byo);
  if (mv && (fw.byo || DEV.stockFile.test(file.name))) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    packages.set(mv.id, { bytes, url: null });
    fw = mv;
    fwSel.value = mv.id;
    if (!EMBED) store(DEV.key + "fw", mv.id);
    loadedUrl = null;
    showFirmware();
    if (node) boot();
    else status.textContent = `${file.name} ready: click Start`;
    return;
  }
  localFw = { id: "local", name: file.name.replace(/\.fwsc$/i, ""), version: "", bytes: new Uint8Array(await file.arrayBuffer()) };
  let opt = [...fwSel.options].find((o) => o.value === "local");
  if (!opt) fwSel.add(opt = new Option("", "local"), 0);
  opt.text = `${localFw.name} (your file)`;
  fwSel.value = "local";
  fw = localFw;
  if (!EMBED) store(DEV.key + "fw", "local");
  loadedUrl = null;
  showFirmware();
  if (node) boot();
  else status.textContent = `${file.name} ready: click Start`;
}
const fileFailure = error => {
  status.textContent = `Could not open file: ${error.message || error}`;
  issue.show("file", { title: "File not opened", text: status.textContent, level: "error" });
};
openInput.addEventListener("change", () => { openLocal(openInput.files[0]).catch(fileFailure); openInput.value = ""; });
bankInput.addEventListener("change", async () => {
  const file = bankInput.files[0];
  bankInput.value = "";
  if (!file) return;
  try {
    if (file.size > (8 << 20)) throw new Error("DX7 bank is larger than 8 MB");
    bank = new Uint8Array(await file.arrayBuffer());
    bankName.textContent = file.name;
    if (node) await boot();
  } catch (error) { fileFailure(error); }
});
const stage = document.querySelector(".stage");
stage.addEventListener("dragover", (e) => { e.preventDefault(); });
stage.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = [...e.dataTransfer.files].find((f) => /\.(fwsc|syx)$/i.test(f.name));
  if (!file) return;
  if (/\.syx$/i.test(file.name)) {
    if (file.size > (8 << 20)) { fileFailure(new Error("DX7 bank is larger than 8 MB")); return; }
    file.arrayBuffer().then((b) => { bank = new Uint8Array(b); bankName.textContent = file.name; if (node) return boot(); }).catch(fileFailure);
  } else {
    openLocal(file).catch(fileFailure);
  }
});

// ---------------------------------------------------------------- drawing
function draw() {
  // The reschedule lives in `finally`. It used to be the last statement in the
  // body, so ANY throw here killed the render loop for good and the panel
  // froze until reload -- the "window went black after Start" failure. A frame
  // can legitimately throw: every view below is built over ui.memory.buffer,
  // and that buffer detaches if the wasm memory grows mid-frame. Skipping one
  // frame is harmless; the views are rebuilt on the next one.
  try {
    drawFrame();
  } catch (e) {
    if (!draw.warned) { console.warn("draw: skipped a frame", e); draw.warned = true; }
  } finally {
    requestAnimationFrame(draw);
  }
}
function drawFrame() {
  const mem = () => ui.memory.buffer;
  if (frame) {
    if (frame.lcd) {
      new Uint16Array(mem(), ui.panel_lcd(), 240 * 240).set(frame.lcd);
      frame.lcd = null;
    }
    new Float32Array(mem(), ui.panel_leds(), 41).set(frame.leds);
    if (frame.pads) for (let p = 0; p < 16; p++) ui.panel_set(5, p, frame.pads[p]);
  }
  for (let i = 0; i < 64; i++) ui.panel_set(0, i, down[i]);
  for (let i = 0; i < 8; i++) ui.panel_set(1, i, encClicks[i]);
  ui.panel_set(2, 0, pot);
  for (let i = 0; i < 9; i++) {
    ui.panel_set(3, i, turning[i]);
    if (turning[i]) turning[i]--;
  }
  if (board === 1) for (let i = 0; i < 23; i++) ui.panel_set(4, i, analog[i]);
  const p = ui.panel_draw();
  const img = new ImageData(new Uint8ClampedArray(mem(), p, W * H * 4), W, H);
  ctx.putImageData(img, 0, 0);
}
requestAnimationFrame(draw);

/* ---------- Customize: live panel skin (fm1_skin) + a cut-out decal ---------- */
const SKIN_ORDER = ["room","body_top","body_bot","tray","silk","btn_top","btn_bot","btn_ink","key_top","key_bot","key_line","key_lit","knob_skirt_a","knob_skirt_b","knob_cap_a","knob_cap_b","knob_glow","amber","green","bezel_a","bezel_b"];
const SKIN_DEFAULT = {room:"#000000",body_top:"#141414",body_bot:"#070707",tray:"#0d0d0d",silk:"#c8c8c8",btn_top:"#1e1e1e",btn_bot:"#141414",btn_ink:"#9a9a9a",key_top:"#3a3a3a",key_bot:"#1c1c1c",key_line:"#6e6e6e",key_lit:"#e8e8e8",knob_skirt_a:"#2e2e2e",knob_skirt_b:"#505050",knob_cap_a:"#3a3a3a",knob_cap_b:"#6d6d6d",knob_glow:"#d8d8d8",amber:"#d8d8d8",green:"#c8c8c8",bezel_a:"#0e0e0e",bezel_b:"#0b0b0b"};
function fm1ApplySkin(sk) {
  // (anything but #rrggbb, from storage or a shared look, falls back to the stock colour)
  const arr = SKIN_ORDER.map(k => (parseInt((/^#[0-9a-f]{6}$/i.test(sk?.[k]) ? sk[k] : SKIN_DEFAULT[k]).slice(1), 16) >>> 0));
  const p = ui.fm1_alloc(arr.length * 4);
  new Uint32Array(ui.memory.buffer, p, arr.length).set(arr);
  ui.fm1_skin(p, arr.length);
}
// MIDI bus declared before FM1 is published so Keys / MIDI Mon can subscribe as soon as they see it.
const midiTaps = new Set();
function subscribeMidi(fn) {
  if (typeof fn !== "function") return () => {};
  midiTaps.add(fn);
  return () => midiTaps.delete(fn);
}
function notifyMidi(bytes) {
  for (const fn of midiTaps) {
    try { fn(bytes); }
    catch (err) { if (!notifyMidi.warned) { notifyMidi.warned = true; console.error("MIDI tap failed", err); } }
  }
}
// Forward declarations: real bodies are wired with the MIDI UI below (after Start/node exist).
let midiMessage = (e) => { /* not ready */ };
let hwMessage = (e) => { midiMessage(e); };
let inputProcessor = null;

// Wrap canvas + Start so % placement is relative to the panel art and survives deck zoom.
// Worker mark is a sticker only (stickers.js) — not painted onto the faceplate.
(function ensurePanelStack() {
  const stage = canvas.closest(".stage") || canvas.parentElement;
  if (!stage) return;
  let stack = stage.querySelector(".panel-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "panel-stack";
    canvas.replaceWith(stack);
    stack.appendChild(canvas);
    const start = document.getElementById("start");
    if (start) stack.appendChild(start);
  }
  window.FM1PlaceBrand = () => {};
})();

window.FM1 = { applySkin: fm1ApplySkin, SKIN_ORDER, SKIN_DEFAULT, panelCanvas: canvas, stage: canvas.closest(".stage") || canvas.parentElement,
  midi: (bytes) => { try { midiMessage({ data: bytes }); } catch (e) {} },     // inject MIDI into the device (after Start)
  midiInput: (bytes) => { try { hwMessage({ data: bytes }); } catch (e) {} },   // feed the input chain, through any processor
  setInputProcessor: (fn) => { inputProcessor = fn; },                          // transform hardware MIDI (scale/chord/arp)
  onMidi: (fn) => subscribeMidi(fn),                                          // every byte that reaches the device (Keys, HW, player)
  audio: (samples) => { try { engine && engine.postMessage({ type: "audio", samples }); } catch (e) {} }, // line-in over USB audio
  hasAudioIn: () => !!window.FM1._audioIn,                                     // the booted firmware takes USB line-in
  _audioIn: false,
  context: () => ac,                                                          // the 44.1 kHz AudioContext (null before Start)
  outNode: () => node,                                                        // the FM-1's output node, to tap for recording
  loadBank: (bytes, name) => {                                                // load a DX7 32-voice .syx and reboot with it
    try { bank = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      if (bankName) bankName.textContent = name || "bank"; if (node) boot(); return true; } catch (e) { return false; }
  },
  supportsBanks: () => !!window.FM1._usr,                                      // the booted firmware has a DX7 patch area
  _usr: false,
  fwText: (id) => fwSearchText[id] || "",                                      // searchable text (name + description) for a firmware
  caps: (id) => (id && CAPS[id]) || null,                                      // classify.json entry (MIDI / banks / audioIn / feats)
  isSampler: (id) => !!(CAPS[id] && CAPS[id].audioIn),                         // takes USB audio in (a sampler)
  runningFirmware: () => running ? { id: running.entry.slice(DEV.key.length), name: running.record.name, hash: running.record.hash } : null,
  latency: () => latency,                                                      // the buffer in use (self-tests)
  heldKeys: () => [...down.keys()].filter((i) => down[i]),                    // matrix keys held (self-tests)
  running: () => !!running,
  // Panel host / tools (filled after input helpers exist; stubs until then)
  panelKey: (id, on) => { try { setKey(id, !!on); } catch {} },
  panelEnc: (i, clicks) => { try { turn(i, clicks); } catch {} },
  panelEncAbs: null,
  panelPot: (v) => { try { setPot(v); } catch {} },
  panelVelocity: (f) => { try { setVelocity(f); } catch {} },
};
try { fm1ApplySkin({ ...SKIN_DEFAULT, ...JSON.parse(localStorage.getItem("fm1.skin") || "{}") }); } catch {}
if (typeof window.initCustomize === "function") window.initCustomize(window.FM1);

// Absolute encoder CC → relative clicks for the panel host.
const encAbsLast = new Array(8).fill(64);
window.FM1.panelEncAbs = (i, value) => {
  const idx = Math.max(0, Math.min(7, i | 0));
  const v = Math.max(0, Math.min(127, value | 0));
  const prev = encAbsLast[idx];
  encAbsLast[idx] = v;
  const d = v - prev;
  if (d) turn(idx, Math.sign(d) * Math.max(1, Math.round(Math.abs(d) / 3)));
};

// A/B listen: both | emu (mute MIDI out) | hw (mute emu audio, keep MIDI out). Declared early for MIDI UI.
let outGain = null;
let abMode = (() => { try { return localStorage.getItem("fm1.ab.v1") || "both"; } catch { return "both"; } })();
function applyAbAudio() {
  if (outGain) outGain.gain.value = abMode === "hw" ? 0 : 1;
}
function setAbMode(mode) {
  abMode = mode === "emu" || mode === "hw" ? mode : "both";
  try { localStorage.setItem("fm1.ab.v1", abMode); } catch {}
  applyAbAudio();
  return abMode;
}
window.FM1Ab = { get: () => abMode, set: setAbMode };

// ---------------------------------------------------------------- input to the machine
const send = (m) => engine && engine.postMessage(m);
function setKey(id, on) {
  if (down[id] === (on ? 1 : 0)) return;
  down[id] = on ? 1 : 0;
  send({ type: "key", id, down: on });
}
function turn(i, clicks) {
  encClicks[i] += clicks;
  turning[i] = 10;
  send({ type: "enc", enc: ui.panel_enc_id(i), clicks });
}
function setPot(v) {
  pot = Math.max(0, Math.min(1023, Math.round(v)));
  turning[7] = 10;                           // (the FM-1's knob 7: its pot; the SMK-37's K8)
  send({ type: "pot", value: pot });
}
// SMK-37: an analog input (a pad's force, a fader, a wheel)
function setAnalog(i, v) {
  v = Math.max(0, Math.min(1023, Math.round(v)));
  if (analog[i] === v) return;
  analog[i] = v;
  send({ type: "analog", idx: i, value: v });
}
// SMK-37: the velocity of the next keys, as the time between a key's two contacts: 0 (softest)
// .. 1 (hardest) -> 80 ms .. 2 ms (the stock curve: full below ~4 ms, the least above ~100 ms)
function setVelocity(f) {
  send({ type: "vel", us: Math.round(Math.exp(Math.log(80000) + (Math.log(2000) - Math.log(80000)) * Math.max(0, Math.min(1, f)))) });
}
const NKEY = 37, BTN0 = 37;

// pointer: keys and buttons held while pressed (drag across keys: glissando), knobs dragged
// up / down or scrolled, MASTER as a pot. Every pointer on its own, so on a touch screen
// several fingers play a chord, or hold a key while one turns a knob.
const at = (e) => {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
};
const holds = new Uint8Array(64);          // pointers holding each key / button
function press(id) { if (holds[id]++ === 0) setKey(id, true); }
function unpress(id) { if (holds[id] && --holds[id] === 0) setKey(id, false); }
const pointers = new Map();                // pointerId -> { grab, lastY, acc, held }
canvas.addEventListener("pointerdown", (e) => {
  const [x, y] = at(e);
  const p = { grab: ui.panel_hit(x, y), lastY: y, acc: 0, held: -1 };
  pointers.set(e.pointerId, p);
  canvas.setPointerCapture(e.pointerId);
  if (p.grab >= 100 && p.grab < 200) {
    p.held = p.grab - 100;
    // SMK-37: a key hit further down sounds harder
    if (board === 1 && p.held < NKEY) setVelocity(ui.panel_hit_y());
    press(p.held);
  } else if (board === 1 && p.grab >= 200) slide(p, y);
});
// SMK-37: a pad pressed (harder the lower it is hit), a fader or a wheel dragged
function slide(p, y) {
  if (p.grab < 300) setAnalog(p.grab - 200, 700);
  else if (p.grab < 400) setAnalog(16 + p.grab - 300, ui.panel_slide(p.grab - 300, y));
  else setAnalog(p.grab === 400 ? 20 : 21, ui.panel_slide(p.grab === 400 ? 4 : 5, y));
}
canvas.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId);
  if (!p || p.grab < 0) return;
  const [x, y] = at(e);
  const keys = board === 1 ? [0, NKEY] : [14, 41];
  if (p.grab >= 100 && p.grab < 200 && p.held >= keys[0] && p.held < keys[1]) {
    const h = ui.panel_hit(x, y);              // glissando over the note keys
    if (h >= 100 + keys[0] && h < 100 + keys[1] && h - 100 !== p.held) {
      unpress(p.held);
      p.held = h - 100;
      if (board === 1) setVelocity(ui.panel_hit_y());
      press(p.held);
    }
  } else if (board === 1 && p.grab >= 300) {
    slide(p, y);
  } else if (p.grab >= 0 && p.grab < (board === 1 ? 8 : 7)) {
    p.acc += p.lastY - y;
    while (p.acc >= 12) { p.acc -= 12; turn(p.grab, 1); }
    while (p.acc <= -12) { p.acc += 12; turn(p.grab, -1); }
  } else if (board === 0 && p.grab === 7) {
    setPot(pot + (p.lastY - y) * 4);
  }
  p.lastY = y;
});
const release = (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (p.held >= 0) unpress(p.held);
  if (board === 1 && p.grab >= 200 && p.grab < 216) setAnalog(p.grab - 200, 0);   // a pad let go
  if (board === 1 && p.grab === 400) setAnalog(20, PITCH_REST);                   // the pitch wheel springs back
  pointers.delete(e.pointerId);
};
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);
canvas.addEventListener("lostpointercapture", release);
let wheelAcc = 0;
canvas.addEventListener("wheel", (e) => {
  const [x, y] = at(e);
  const h = ui.panel_hit(x, y);
  if (board === 1 && h >= 300 && h < 304) {          // SMK-37: a fader scrolled
    e.preventDefault();
    setAnalog(16 + h - 300, analog[16 + h - 300] - e.deltaY * 2);
    return;
  }
  if (h < 0 || h > 7) return;
  e.preventDefault();
  if (board === 0 && h === 7) { setPot(pot - e.deltaY * 0.5); return; }
  wheelAcc -= e.deltaY;
  while (wheelAcc >= 40) { wheelAcc -= 40; turn(h, 1); }
  while (wheelAcc <= -40) { wheelAcc += 40; turn(h, -1); }
}, { passive: false });

// computer keyboard: A W S E D F T G Y H U J K O L P ; ' = C4..F5, Z X OCT- OCT+, Space PLAY,
// R REC, 1..0 FX SCL ENV LFO EDIT GLO HOME SAVE ARP SEQ, arrows / , . encoders. SMK-37: the same
// notes (keys 12..29), Z X OCTAVE- / +, Space SEQ PLAY, R SEQ REC, 1..8 the top pads, arrows K1 / K2,
// , . K3
const PIANO = "awsedftgyhujkolp;'";
const BUTTONS = [
  { z: 0, x: 1, " ": 12, r: 13, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 0: 11 },
  { z: BTN0 + 4, x: BTN0 + 5, " ": BTN0 + 16, r: BTN0 + 17 },
];
const ENC_KEYS = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowDown: [1, -1], ArrowUp: [1, 1], ",": [2, -1], ".": [2, 1] };
function keyId(k) {
  const i = PIANO.indexOf(k.toLowerCase());
  if (i >= 0) return (board === 1 ? 12 : 21) + i;
  const b = BUTTONS[board === 1 ? 1 : 0][k.toLowerCase()];
  return b === undefined ? -1 : b;
}
const padKey = (k) => (board === 1 && /^[1-8]$/.test(k) ? Number(k) - 1 : -1);
// Text fields, lists and editable areas keep their keys: typing "a" into a search box used to
// play a note and lose the letter. A focused slider keeps its arrows.
const TEXT_INPUT = /^(text|search|email|url|tel|password|number|date|time|datetime-local|month|week)$/;
function keepsKeys(t, key) {
  if (!t || t === document.body) return false;
  if (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  if (t instanceof HTMLInputElement) return TEXT_INPUT.test(t.type) || (t.type === "range" && key.startsWith("Arrow"));
  return false;
}
addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || keepsKeys(e.target, e.key)) return;
  if (ENC_KEYS[e.key]) { e.preventDefault(); turn(...ENC_KEYS[e.key]); return; }
  const pad = padKey(e.key);
  if (pad >= 0) { e.preventDefault(); if (!e.repeat) setAnalog(pad, 700); return; }
  const id = keyId(e.key);
  if (id < 0 || e.repeat) return;
  e.preventDefault();
  if (board === 1 && id < NKEY) setVelocity(0.75);
  setKey(id, true);
});
addEventListener("keyup", (e) => {
  const pad = padKey(e.key);
  if (pad >= 0) { setAnalog(pad, 0); return; }
  const id = keyId(e.key);
  if (id >= 0) setKey(id, false);
});

// ---------------------------------------------------------------- MIDI in / out (Web MIDI)
// Inputs play the synth through its MIDI IN jack (UART1 at 31250 baud in the emulator).
// Outputs tee Keys / player / assist MIDI to a real FM-1 (USB or Bluetooth LE MIDI). Hardware
// input is never echoed to the chosen output (avoids a feedback loop with a paired unit).
// Access is asked for only once an input/out is picked (Chrome asks the visitor), and on Start
// when one was picked on an earlier visit. Channel: channel messages rewritten to one channel
// (0 = as sent). Desktop Windows enables WinRT MIDI so BLE devices appear in this list.
const midiSel = document.getElementById("midi");
const midiOutSel = document.getElementById("midiout");
const midiChSel = document.getElementById("midich");
const midiLinkEl = document.getElementById("midilink");
const midiAct = document.getElementById("midiact");
const midiOutAct = document.getElementById("midioutact");
let midi = null, midiAsked = null, midiActOff = 0, midiOutActOff = 0;
let midiOutPort = null;
let midiHwDepth = 0; // >0 while handling a hardware MIDI message (blocks out echo)
let midiCh = Number(stored("fm1.midich") || 0);
let midiDropWarned = false;
let midiPortsSeen = null; // Set of FM-1-ish names after first connect (for appear/disappear toasts)
for (let c = 1; c <= 16; c++) midiChSel.add(new Option(String(c), c));
midiChSel.value = midiCh;
const midiWant = () => stored("fm1.midi") || "";
const midiOutWant = () => stored("fm1.midiout") || "";
const midiLinkOn = () => (midiLinkEl ? midiLinkEl.checked : true);
if (midiLinkEl) {
  const savedLink = stored("fm1.midilink");
  midiLinkEl.checked = savedLink === null ? true : savedLink === "1";
  midiLinkEl.addEventListener("change", () => store("fm1.midilink", midiLinkEl.checked ? "1" : "0"));
}
if (!navigator.requestMIDIAccess) {
  midiSel.disabled = midiOutSel.disabled = midiChSel.disabled = true;
  if (midiLinkEl) midiLinkEl.disabled = true;
  document.getElementById("midiin").title = "this browser has no Web MIDI (Chrome, Edge and Firefox do)";
  document.getElementById("midioutl").title = "this browser has no Web MIDI (Chrome, Edge and Firefox do)";
}
function midiOutPulse(bytes) {
  if (isActivityMessage(bytes) && midiOutAct) {
    midiOutAct.classList.add("on");
    clearTimeout(midiOutActOff);
    midiOutActOff = setTimeout(() => midiOutAct.classList.remove("on"), 120);
  }
}
function midiOutSend(bytes) {
  if (!midiOutPort || midiHwDepth > 0 || !bytes || !bytes.length) return false;
  if (abMode === "emu") return false; // A/B: emu only — keep MIDI on the soft synth
  try {
    midiOutPort.send(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes));
    midiOutPulse(bytes);
    return true;
  } catch (err) {
    if (!midiOutSend.warned) { midiOutSend.warned = true; console.error("MIDI out send failed", err); }
    return false;
  }
}
/** Send one or more SysEx messages from a .syx buffer to MIDI out. Upgrades to sysex access if needed. */
async function midiOutSendSysex(bytes) {
  await midiOpen(); // always SysEx-capable; do not open a second MIDIAccess beside the shared one
  if (!midiOutPort) return { ok: false, count: 0, reason: "no-out" };
  if (!midi || midi.sysexEnabled === false) return { ok: false, count: 0, reason: "sysex-denied" };
  if (!midiOutPort) return { ok: false, count: 0, reason: "no-out" };
  const msgs = splitSysex(bytes);
  if (!msgs.length) return { ok: false, count: 0, reason: "no-sysex" };
  let sent = 0;
  for (const msg of msgs) {
    try {
      midiOutPort.send(msg);
      midiOutPulse(msg);
      sent++;
      if (msgs.length > 1) await new Promise((r) => setTimeout(r, 40));
    } catch (err) {
      if (!midiOutSendSysex.warned) { midiOutSendSysex.warned = true; console.error("MIDI SysEx send failed", err); }
      return { ok: false, count: sent, reason: "send-failed" };
    }
  }
  return { ok: true, count: sent, reason: "" };
}
function applyMidiLink(fromInName) {
  if (!midiLinkOn() || !fromInName || fromInName === "*") return;
  if (![...midiOutSel.options].some((o) => o.value === fromInName)) return;
  if (midiOutSel.value === fromInName) return;
  midiOutSel.value = fromInName;
  store("fm1.midiout", fromInName);
}
midiMessage = function midiMessage(e) {
  const d = e?.data;
  if (!d || !d.length) return;
  // Remap → notify screen/monitor/recorder → tee soft MIDI to hardware out → drive emulator.
  const bytes = remapChannel(d, midiCh);
  notifyMidi(bytes);
  midiOutSend(bytes);
  if (window.FM1Rec) { try { window.FM1Rec(bytes); } catch (err) {} }
  if (isActivityMessage(bytes)) {
    midiAct.classList.add("on");
    clearTimeout(midiActOff);
    midiActOff = setTimeout(() => midiAct.classList.remove("on"), 120);
  }
  // A/B hardware-only: soft MIDI still goes out, but the emulator stays silent.
  if (abMode === "hw") return;
  if (!node || !engine) {
    if (!midiDropWarned && isActivityMessage(bytes)) {
      midiDropWarned = true;
      status.textContent = "MIDI is arriving — press Start so the emulator plays what you see.";
    }
    return;
  }
  midiDropWarned = false;
  if (board === 1) {
    // the SMK-37 has no MIDI in jack: notes C3..C6 play its keys (the velocity as the time between
    // the contacts), the pitch bend and the mod wheel its wheels — screen + machine stay one path
    const st = bytes[0] & 0xf0, k = bytes[1] - 48;
    if ((st === 0x90 || st === 0x80) && k >= 0 && k < NKEY) {
      const on = st === 0x90 && bytes[2] > 0;
      if (on) setVelocity((bytes[2] - 1) / 126);
      setKey(k, on);
    } else if (st === 0xe0) {
      const bend = ((bytes[2] << 7) | bytes[1]) - 8192;
      setAnalog(20, PITCH_REST + (bend >= 0 ? bend / 8191 * (640 - PITCH_REST) : bend / 8192 * (PITCH_REST - 445)));
    } else if (st === 0xb0 && bytes[1] === 1) {
      setAnalog(21, MOD_REST - bytes[2] / 127 * (MOD_REST - 474));
    }
  } else {
    send({ type: "midi", bytes });
  }
};
// hardware MIDI can run through an input processor (the Keys module's scale/chord/arp) before it
// reaches the synth; the processor returns true when it has handled and re-injected the message.
// notes and sustain held from hardware, so they can be let go if the device is unplugged mid-note
// (its note-offs never come)
const hwHeld = new Set(), hwSustain = new Set();
function trackHeld(d) {
  const st = d[0] & 0xf0, ch = d[0] & 0x0f;
  if (st === 0x90 && d[2] > 0) hwHeld.add((ch << 8) | d[1]);
  else if (st === 0x80 || st === 0x90) hwHeld.delete((ch << 8) | d[1]);
  else if (st === 0xb0 && d[1] === 64) { if (d[2] >= 64) hwSustain.add(ch); else hwSustain.delete(ch); }
}
function releaseHardware() {
  for (const k of [...hwHeld]) hwMessage({ data: new Uint8Array([0x80 | (k >> 8), k & 0x7f, 0]) });
  for (const ch of [...hwSustain]) hwMessage({ data: new Uint8Array([0xb0 | ch, 64, 0]) });
  hwHeld.clear(); hwSustain.clear();
}
hwMessage = function hwMessage(e) {
  midiHwDepth++;
  try {
    if (e?.data?.length >= 3) trackHeld(e.data);
    // Panel host consumes hardware panel MIDI before Keys / play path.
    if (window.FM1HostPanel && window.FM1HostPanel.get && window.FM1HostPanel.get() !== "off") {
      try {
        if (window.FM1HostPanel.process(Array.from(e.data || []))) return;
      } catch (err) {
        if (!hwMessage.hostWarned) { hwMessage.hostWarned = true; console.error("Panel host failed; passing input through", err); }
      }
    }
    if (inputProcessor) {
      try { if (inputProcessor(Array.from(e.data))) return; }
      catch (err) { if (!hwMessage.warned) { hwMessage.warned = true; console.error("MIDI input processor failed; passing input through", err); } }
    }
    midiMessage(e);
  } finally {
    midiHwDepth--;
  }
};
// listen to the wanted inputs / outputs only; the lists follow devices coming and going
let attached = new Set();
function midiConnect() {
  if (!midi) return;
  // the saved choice wins: when the chosen device is unplugged its entry leaves the list (and the
  // list falls back to "off"); it used to stay off when the device came back
  const saved = stored("fm1.midi");
  let want = saved !== null && saved !== "" ? saved : midiSel.value;
  const inputs = [...midi.inputs.values()].filter((i) => i.state !== "disconnected");
  const names = inputs.map((i) => i.name);
  for (const o of [...midiSel.options]) if (o.value !== "" && o.value !== "*" && !names.includes(o.value)) o.remove();
  for (const n of names) if (![...midiSel.options].some((o) => o.value === n)) midiSel.add(new Option(n, n));
  // Never auto-grab a port. MIDI stays off until the user picks one (or a saved choice reconnects).
  if ([...midiSel.options].some((o) => o.value === want)) midiSel.value = want;
  else if (!want) midiSel.value = "";
  if (midiLinkOn() && want && want !== "*") applyMidiLink(want);
  const now = new Set();
  // Never reassign handlers while Check/install is listening — that raced the SysEx
  // handshake and made a live FM-1 look "not found" / unreadable over USB.
  const holdHandlers = !!globalThis.FM1MidiUpdaterBusy;
  for (const input of midi.inputs.values()) {
    const on = input.state !== "disconnected" && (want === "*" || want === input.name);
    if (!holdHandlers) input.onmidimessage = on ? hwMessage : null;
    if (on) now.add(input.id || input.name);
  }
  // an input that was playing is gone: let go of what it held
  if ([...attached].some((id) => !now.has(id))) releaseHardware();
  attached = now;

  // MIDI out: Keys / player / assist / panic / clock → paired FM-1 (USB or BLE). Never echo hardware in.
  const savedOut = stored("fm1.midiout");
  let wantOut = savedOut !== null && savedOut !== "" ? savedOut : midiOutSel.value;
  const outputs = [...midi.outputs.values()].filter((o) => o.state !== "disconnected");
  const outNames = outputs.map((o) => o.name);
  for (const o of [...midiOutSel.options]) if (o.value !== "" && !outNames.includes(o.value)) o.remove();
  for (const n of outNames) if (![...midiOutSel.options].some((o) => o.value === n)) midiOutSel.add(new Option(n, n));
  // Link only mirrors an explicit in choice onto out — never invents an out on its own.
  if (midiLinkOn() && want && want !== "*" && outNames.includes(want)) wantOut = want;
  if ([...midiOutSel.options].some((o) => o.value === wantOut)) midiOutSel.value = wantOut;
  else midiOutSel.value = "";
  midiOutPort = outputs.find((o) => o.name === midiOutSel.value) || null;

  // Quiet appear/disappear notice only after the user has chosen a port (never on first auto-enum).
  const fmNow = new Set([...names, ...outNames].filter(isFm1PortName));
  if (midiPortsSeen && (midiWant() || midiOutWant())) {
    for (const n of fmNow) {
      if (!midiPortsSeen.has(n)) status.textContent = `${n} connected — available under MIDI in / out.`;
    }
    for (const n of midiPortsSeen) {
      if (!fmNow.has(n)) status.textContent = `${n} disconnected.`;
    }
  }
  midiPortsSeen = fmNow;
}
async function midiOpen() {
  if (!navigator.requestMIDIAccess) return midiConnect();
  // Always ask for SysEx. Install / Identify / bank dump need it; a first open without
  // sysex on Windows can leave the FM-1 port silent to identity queries ("nothing answered").
  if (midi && midi.sysexEnabled !== false) return midiConnect();
  if (midi && midi.sysexEnabled === false) midiAsked = null; // upgrade a non-sysex session
  midiAsked ||= navigator.requestMIDIAccess({ sysex: true }).then((m) => {
    midi = m;
    midi.onstatechange = midiConnect;
  }, () => {
    midiAsked = null;
    midiSel.value = "";
    midiOutSel.value = "";
    status.textContent = "MIDI: access was not given";
  });
  await midiAsked;
  midiConnect();
}
// Shared with Install firmware so Check / flash use the same SysEx-capable access.
window.FM1MidiAccess = () => midi;
window.FM1MidiOpen = midiOpen;
{
  const want = midiWant();
  if (want && want !== "*") midiSel.add(new Option(want, want));
  midiSel.value = want;
  const wantOut = midiOutWant();
  if (wantOut) midiOutSel.add(new Option(wantOut, wantOut));
  midiOutSel.value = wantOut;
}
// On load, reconnect only a port the user already chose. Never open MIDI / grab devices unprompted.
if (navigator.requestMIDIAccess && (midiWant() || midiOutWant())) midiOpen();
midiSel.addEventListener("change", () => {
  store("fm1.midi", midiSel.value);
  applyMidiLink(midiSel.value);
  if (midiSel.value || midiOutSel.value) midiOpen(); else midiConnect();
});
midiOutSel.addEventListener("change", () => {
  store("fm1.midiout", midiOutSel.value);
  // Manual out choice that disagrees with in turns Link off so we don't snap it back.
  if (midiLinkEl && midiLinkOn() && midiSel.value && midiSel.value !== "*" && midiOutSel.value !== midiSel.value) {
    midiLinkEl.checked = false;
    store("fm1.midilink", "0");
  }
  if (midiOutSel.value || midiSel.value) midiOpen(); else { midiOutPort = null; midiConnect(); }
});
midiChSel.addEventListener("change", () => {
  midiCh = Number(midiChSel.value);
  store("fm1.midich", midiCh);
});
// Soft MIDI already tees to MIDI out (Keys, player, assist, panic, clock). Expose helpers for Banks / tools.
Object.assign(window.FM1, {
  hasMidiOut: () => !!midiOutPort,
  midiOutName: () => (midiOutPort && midiOutPort.name) || "",
  midiOutSend: (bytes) => midiOutSend(bytes),
  midiOutSendSysex: (bytes) => midiOutSendSysex(bytes),
  midiIdentify: () => midiIdentify(),
});

const midiAbSel = document.getElementById("midiab");
if (midiAbSel) {
  midiAbSel.value = abMode;
  midiAbSel.addEventListener("change", () => {
    setAbMode(midiAbSel.value);
    status.textContent = abMode === "both" ? "A/B: emu + hardware"
      : abMode === "emu" ? "A/B: emulator only (MIDI out muted)"
      : "A/B: hardware only (emu audio muted)";
    if (window.FM1Announce) window.FM1Announce(status.textContent);
  });
}

const midiIdBtn = document.getElementById("midi-identify");
const midiIdEl = document.getElementById("midi-identity");
let identityBytes = null;
async function midiIdentify() {
  await midiOpen();
  if (!midi) {
    if (midiIdEl) { midiIdEl.hidden = false; midiIdEl.textContent = "MIDI access was not given."; }
    return null;
  }
  if (midiIdEl) { midiIdEl.hidden = false; midiIdEl.textContent = "Checking…"; }
  // Same SysEx handshake as Install → Check. Do not steal onmidimessage or open a second access.
  let text = "No identity reply (unit may ignore this SysEx, or needs USB).";
  identityBytes = null;
  try {
    const r = await new Updater(midi).detect();
    if (r.found) {
      text = r.inUpdateMode
        ? `Identity: ${r.id} (update mode) via ${r.name}`
        : `Identity: ${r.id} via ${r.name}`;
      identityBytes = r.id;
    } else if (r.code === "busy") text = "Port busy — close other MIDI apps, then Identify again.";
    else if (r.code === "nomidi") text = "No USB-MIDI device visible.";
    else if (r.code === "noport") text = "No FM-1-like MIDI port among connected devices.";
    else text = `No FM-1 answer. Ports: ${(r.ports || []).join(", ") || "none"}.`;
  } catch (e) {
    text = (e && e.message) || "Identify failed.";
  }
  if (midiIdEl) { midiIdEl.hidden = false; midiIdEl.textContent = text; }
  status.textContent = text;
  return identityBytes;
}
if (midiIdBtn) midiIdBtn.addEventListener("click", () => { midiIdentify(); });

// Effect-channel conflict hint (play ch vs factory Effect Chn 2).
function refreshFxWarn() {
  const el = document.getElementById("midi-fx-warn");
  if (!el) return;
  const msg = effectChannelConflict(midiCh, 2);
  el.textContent = msg;
  el.hidden = !msg;
}
midiChSel.addEventListener("change", refreshFxWarn);
refreshFxWarn();

// ---------------------------------------------------------------- is the device keeping up?
// Two measures, per second: the load (the share of the audio thread's time the emulation takes,
// timed in the worklet; over ~100% and the sound must break up) and the drift of the audio
// clock against the wall clock (getOutputTimestamp: the output falls behind when quanta come
// late, also with a load below 100% when the buffer is too small for this device's hiccups).
// Some seconds of either, once the JIT has warmed up, bring up a warning that offers the fix.
// The speed shown is the emulator's own: emulated time per time spent emulating (as
// `node web/bench.mjs` and `fm1-live --bench` print it); at 1x a device just keeps up.
const perf = {
  reset() {
    this.busy = 0; this.span = 0; this.emulated = 0; this.idle = 0; this.idleShare = 0; this.worst = 0;
    this.secs = 0; this.bad = 0; this.drops = 0; this.loads = []; this.speeds = []; this.drift = 0;
    this.stamp = null; this.jit = null; this.lastSecond = 0; this.dryAt = null; this.shown = false; this.good = 0;
    // a dismissed warning stays dismissed for this firmware, clock and buffer, across reboots
    if (this.dismissedFor !== this.key()) this.dismissed = false;
    const mk = this.key();
    if (this.mitigateKey !== mk) {
      this.mitigateKey = mk;
      this.autoClockTried = false;
      this.autoBufferTried = false;
    }
    issue.clear("perf");
  },
  add(m) {
    this.busy += m.busy;
    this.span += (m.quanta * m.frames) / 44.1;     // ms of audio those quanta stand for
    this.emulated += m.emulated ?? 0;              // ms of emulated time they ran
    this.idle += m.idle ?? 0;                      // of which idle skipping jumped over
    if (m.worst > this.worst) this.worst = m.worst;
    this.jit = m.jit;
  },
  key() { return `${fw?.id}|${mhz}|${latency}`; },
  load() { return this.loads.length ? this.loads[this.loads.length - 1] : 0; },
  loadText() { return this.loads.length ? `${Math.round(100 * this.load())}%` : "…"; },
  speed() { return this.speeds.length ? this.speeds[this.speeds.length - 1] : NaN; },
  speedText() { return Number.isFinite(this.speed()) ? `${this.speed().toFixed(this.speed() < 10 ? 1 : 0)}x real time` : "…"; },
  // once a second: close the window, judge it
  second(m) {
    if (this.span > 0) this.loads.push(this.busy / this.span);
    // (a whole-millisecond worklet clock: a second's quanta still add up to a fair figure)
    if (this.busy > 0 && this.emulated > 0) this.speeds.push(this.emulated / this.busy);
    if (this.emulated > 0) this.idleShare = Math.min(1, this.idle / this.emulated);
    if (this.loads.length > 30) this.loads.shift();
    if (this.speeds.length > 30) this.speeds.shift();
    this.busy = 0; this.span = 0; this.emulated = 0; this.idle = 0;
    const ts = ac.getOutputTimestamp?.();
    let drift = 0;
    if (ts && ts.contextTime > 0) {
      if (this.stamp) {
        const wall = (ts.performanceTime - this.stamp.performanceTime) / 1000;
        if (wall > 0.5) drift = 1 - (ts.contextTime - this.stamp.contextTime) / wall;
      }
      this.stamp = ts;
    }
    this.drift = drift;
    const now = performance.now(), gap = this.lastSecond ? now - this.lastSecond : 1000;
    this.lastSecond = now;
    const j = judgeSecond(this, {
      state: ac?.state, hidden: document.hidden, gap, drift, halted: m.halted, load: this.load(),
      worker: !!worker, dry: worker && stream ? stream.underruns : null,
    });
    if (Array.isArray(window.FM1PerfTrace)) window.FM1PerfTrace.push({ secs: this.secs, dry: worker && stream ? stream.underruns : null, drift, gap: Math.round(gap), state: ac?.state, load: this.load(), ...j });   // (opt-in, for tests)
    if (j.late) this.drops++;
    if (j.warn && !this.shown && !this.dismissed) {
      if (j.over && !this.autoClockTried) {
        const pick = this.lowerClock(this.load());
        if (pick) {
          this.autoClockTried = true;
          status.textContent = `Audio tight at ${mhz} MHz — switching to ${pick} MHz…`;
          setClock(pick);
          return;
        }
      }
      if (j.late && !j.over && !this.autoBufferTried) {
        const next = latency === "interactive" ? "playback" : (latency === "balanced" || latency === "playback" ? "0.3" : null);
        if (next) {
          this.autoBufferTried = true;
          status.textContent = next === "playback" ? "Steadying audio (larger buffer)…" : "Using the largest audio buffer…";
          setLatency(next);
          return;
        }
      }
      this.warn(j.over);
    }
    // the notice stays while the dropouts go on, and clears after 20 good seconds in a row (it can
    // come back if they start again)
    if (this.shown && recovered(this, j)) { this.shown = false; issue.clear("perf"); }
  },
  // A lower clock that brings the load down to ~80%, if one does. The cost of emulating a
  // second is a fixed part (about a quarter at the clocks offered: the peripherals, the audio, the
  // JIT's dispatch) and the cycles the firmware runs, which a lower clock cuts only where the
  // firmware runs more of them than the lower clock has: the time it idles is skipped (fm1_soc's
  // skip_idle), so a firmware that mostly idles (M-VAVE's: 70-80% of the time at 120-240 MHz)
  // does the same work at any clock, and a lower one does not help it (measured: 2.6x real time
  // at 60 MHz, 2.4x at 240; Felucca 5.0x at 60 MHz, 2.0x at 240).
  lowerClock(load) {
    const FIXED = 0.25, busy = mhz * (1 - this.idleShare);   // MHz of cycles the firmware runs
    const at = (c) => load * (FIXED + (1 - FIXED) * Math.min(busy, c) / Math.max(busy, 1));
    const lower = CLOCKS.filter((c) => c < mhz && at(c) <= 0.8);
    const pick = lower.length ? lower[lower.length - 1] : CLOCKS.find((c) => c < mhz);
    return pick && at(pick) < 0.85 * load ? pick : null;     // only where it clearly helps
  },
  warn(over) {
    const load = this.load();
    const pick = over ? this.lowerClock(load) : null;
    const text = { textContent: "" }, fix = { hidden: false, textContent: "", onclick: null };
    // (a debugger attached, as DevTools open, runs the WebAssembly 3-4x slower)
    const devtools = " If the browser's developer tools are open, close them: they slow the emulator down 3-4x.";
    fix.hidden = false;
    if (over && pick) {
      text.textContent = `This device can't run ${fw.name} at ${mhz} MHz in real time (it needs ${Math.round(100 * load)}% ` +
        `of real time to emulate), so the sound breaks up. It needs less at a lower clock.` + devtools;
      fix.textContent = `Use ${pick} MHz`;
      fix.onclick = () => { setClock(pick); };
    } else if (over) {
      // (a lower clock exists but would not help: say why)
      const why = !CLOCKS.some((c) => c < mhz) ? "" : this.idleShare >= 0.3
        ? " A lower clock would not help: the emulator skips the time this firmware idles, so it costs about the same at any clock."
        : " A lower clock would help only a little.";
      text.textContent = `This device can't run ${fw.name} at ${mhz} MHz in real time (it needs ` +
        `${Math.round(100 * load)}% of real time to emulate), so the sound breaks up.` + why + devtools +
        ` A faster device or the desktop version will play it.`;
      fix.hidden = true;
    } else if (latency === "interactive") {
      text.textContent = `The sound drops out although the emulator has time to spare (load ${Math.round(100 * load)}%): ` +
        `this device's audio buffer is too small for it. A larger one adds a little delay to the keys.`;
      fix.textContent = "Use a larger audio buffer";
      fix.onclick = () => { setLatency("playback"); };
    } else if (!(Number(latency) >= 0.3)) {
      text.textContent = `The sound still drops out with the larger buffer (load ${Math.round(100 * load)}%). ` +
        `The largest buffer adds a bit more key delay but is the steadiest.`;
      fix.textContent = "Use the largest buffer";
      fix.onclick = () => { setLatency("0.3"); };
    } else {
      text.textContent = `The sound drops out on this device even with the largest audio buffer (load ${Math.round(100 * load)}%).`;
      fix.hidden = true;
    }
    this.shown = true;
    const actions = [];
    if (!fix.hidden) actions.push({ label: fix.textContent, primary: true, run: fix.onclick });
    actions.push({ label: "Report on GitHub ↗", href: "https://github.com/briksquared/fm1-emulator/issues/new" });
    issue.show("perf", { title: over ? "Emulator can't keep up" : "Audio dropouts", text: text.textContent, level: "warn", actions, persist: true,
      onDismiss: () => { this.dismissed = true; this.dismissedFor = this.key(); } });
  },
  // for a bug report: what the device is and how it kept up
  report() {
    const r = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : "?");
    const loads = this.loads.map((l) => Math.round(100 * l)), jit = this.jit;
    return [
      `FM-1 emulator report (${location.origin}${location.pathname})`,
      `firmware: ${fw.id} ${fw.version || ""} · clock ${mhz} MHz · JIT ${jitOn() ? "on" : "off"}`,
      `browser: ${navigator.userAgent}`,
      `cores: ${navigator.hardwareConcurrency ?? "?"} · memory: ${navigator.deviceMemory ?? "?"} GB`,
      `audio: ${ac ? `${ac.sampleRate} Hz, buffer "${latency}", base latency ${r(1000 * (ac.baseLatency ?? NaN), 1)} ms, ` +
        `output latency ${r(1000 * (ac.outputLatency ?? NaN), 1)} ms` : "not started"}`,
      `speed (emulated time per time spent emulating, last ${this.speeds.length} s): ${this.speeds.map((v) => r(v, 2)).join(" ")}x real time`,
      `load (last ${loads.length} s): ${loads.join(" ")}% · worst quantum since the audio started ${r(this.worst, 1)} ms of ${r(128 / 44.1, 1)}`,
      `audio clock drift: ${r(100 * this.drift, 1)}% · seconds with drops: ${this.drops} · idle skipped: ${r(100 * this.idleShare)}% of the time`,
      `jit: ${jit ? `${jit.regions} regions compiled, ${jit.failed} failed${jit.error ? ` (${jit.error})` : ""} · ` +
        `compiling took ${r(jit.compileMs)} ms, the longest ${r(jit.compileMaxMs, 1)} ms` : "?"}`,
      `emulated: ${frame ? r(frame.ms / 1000, 1) : "?"} s · short audio quanta: ${frame?.short ?? "?"}`,
      `engine: ${worker ? `worker, audio queue ${stream?.queued ?? "?"} frames, ${stream?.underruns ?? "?"} dry quanta` : "audio thread"}`,
    ].join("\n");
  },
};
// Copy diagnostics (any notice's details): what a bug report needs, as plain text on the clipboard
// when asked. Versions, platform, engine and audio settings, timing, and the notices; no file
// paths, no names of files you opened, no firmware data, no MIDI. Nothing is sent anywhere.
function diagnostics(notices = []) {
  const scrub = (t) => {
    let x = String(t ?? "");
    if (fw?.id === "local" && fw.name) x = x.split(fw.name).join("(your .fwsc)");
    return x.replace(/(?:file:\/\/|[A-Za-z]:[\\/]|\/(?:Users|home|var|tmp|private|Volumes|mnt|media)\/)[^\s"'),;]*/g, "<path>");
  };
  const lines = perf.report().split("\n").slice(1);
  const ago = (at) => `${Math.max(0, Math.round((Date.now() - at) / 1000))} s ago`;
  return [
    `FM-1 Emulator diagnostics, ${new Date().toISOString().replace(/\.\d+Z$/, "Z")}`,
    `app: ${window.FM1Desktop ? "desktop" : "browser"} · page: ${/^(https?|fm1):$/.test(location.protocol) ? location.origin : "a local copy"} · device: ${DEVICE}`,
    `running: ${running ? scrub(running.record.name) : "nothing"} · status: ${scrub(status.textContent)}`,
    ...lines.map(scrub),
    `notices:${notices.length ? "" : " none"}`,
    ...notices.map((n) => `- [${n.level}] ${scrub(n.title)}: ${scrub(n.text)} (${ago(n.at)})`),
  ].join("\n");
}
issue.setDiagnostics?.(diagnostics);
function setClock(c) {
  mhz = c;
  if (![...mhzSel.options].some((o) => Number(o.value) === c)) mhzSel.add(new Option(`${c} MHz`, c));
  mhzSel.value = c;
  store("fm1.mhz", c);
  showFirmware();
  boot();
}
// A change asked for while one is under way waits and runs next (the newest one wins); it used to
// be dropped, leaving the list, the stored setting and the running buffer disagreeing.
let pendingLatency = null;
async function setLatency(l) {
  if (bufferChanging) { pendingLatency = l; return; }
  bufferChanging = true;
  const previous = latency;
  if (bufSel) bufSel.disabled = true;
  try {
    await bootQueue;
    await flushRunning(true);
    // A larger buffer needs a new audio context: rebuild the graph, boot again.
    stopAudioGraph();
    running = null;
    await ac.close();
    ac = null;
    latency = l;
    await startAudio();
    if (!(await boot())) throw new Error(status.textContent);
    await ac.resume();
    store("fm1.latency", l);
    return true;
  } catch (error) {
    latency = previous;
    // the old context is already closed: bring the sound back on the buffer that worked
    let restored = false;
    try {
      // (startAudio may have built a context at the new buffer before boot failed: start over)
      stopAudioGraph();
      running = null;
      if (ac) { await ac.close().catch(() => {}); ac = null; }
      await startAudio();
      restored = await boot();
      if (restored) await ac.resume();
    } catch { restored = false; }
    if (!running) {
      startBtn.hidden = false;
      startBtn.disabled = false;
    }
    const why = error.message || String(error);
    status.textContent = restored ? `Audio buffer change failed: ${why}. Kept the previous buffer.`
      : `Audio buffer change failed: ${why}. Click Start to retry.`;
    issue.show("audio", { title: "Buffer change failed", text: status.textContent, level: "error" });
    return false;
  } finally {
    if (bufSel) { bufSel.value = latency; bufSel.disabled = false; }
    bufferChanging = false;
    if (pendingLatency != null) {
      const next = pendingLatency; pendingLatency = null;
      if (String(next) !== String(latency)) setLatency(next);
    }
  }
}

// ---------------------------------------------------------------- audio: start on a click
let stream = null;                         // the audio queue's health (worker engine only)
let ac = null, last = null, bootSeq = 0, booting = 0, bufferChanging = false;

let bootQueue = Promise.resolve(), requestId = 0;
const sessions = new Map(), bootWaiters = new Map(), snapshotWaiters = new Map();

function sameSectors(a, b) {
  return a.length === b.length && a.every((s, i) => {
    if (s.at !== b[i].at) return false;
    const left = new DataView(s.data.buffer, s.data.byteOffset, s.data.byteLength);
    const right = new DataView(b[i].data.buffer, b[i].data.byteOffset, b[i].data.byteLength);
    for (let at = 0; at < s.data.length; at += 4) if (left.getUint32(at) !== right.getUint32(at)) return false;
    return true;
  });
}
function saveSnapshot(session, flash, flashRevision) {
  session.flash = flash;
  const sectors = changedSectors(session.base, flash);
  session.record = { ...session.record, sectors };
  memoryRecords.set(session.record.hash, session.record);
  if (!session.forceSave && session.revision && sameSectors(session.persistedSectors || [], sectors)) {
    session.pending = Promise.resolve(session.pending).then(() => saveStore.remember(session.record.hash, session.entry));
    session.pending.then(() => { if (running === session) saveMessage("Saved in this browser"); })
      .catch(error => { if (running === session) saveFailure(error); });
    return session.pending;
  }
  session.record.unsaved = true;
  if (running === session) saveMessage("Saving…");
  const record = session.record;
  session.pending = (session.pending || Promise.resolve()).catch(() => {}).then(async () => {
    const { unsaved: _unsaved, ...stored } = record;
    const revision = await saveStore.save({ ...stored, revision: session.revision }, session.entry);
    session.revision = revision;
    record.unsaved = false;
    session.persistedSectors = record.sectors;
    session.forceSave = false;
    session.record.revision = revision;
    // Keep the newest memory snapshot, even when an earlier transaction has just completed.
    const latest = memoryRecords.get(record.hash);
    if (latest) latest.revision = revision;
    if (running === session && session.record === record && session.observedRevision === flashRevision) saveMessage("Saved in this browser");
  });
  session.pending.catch(error => { if (running === session) saveFailure(error); });
  return session.pending;
}

async function flushRunning(pause = false) {
  const session = running;
  if (!session) return;
  if (ac.state === "suspended") await ac.resume();
  const request = ++requestId;
  const response = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      snapshotWaiters.delete(request);
      engine?.postMessage({ type: "cancel-snapshot", request });
      reject(new Error("flash snapshot timed out"));
    }, 10000);
    snapshotWaiters.set(request, { seq: session.seq, resolve, reject, timer });
  });
  engine.postMessage({ type: "snapshot", seq: session.seq, request, pause });
  await response;
  // A storage failure leaves the snapshot in memory, available for export and retry.
  await session.pending?.catch(() => {});
}

// Serialize machine replacement, including the snapshot of the old machine. Requests that
// became obsolete while downloading are skipped; every actual boot receives an acknowledgement.
function boot(options = {}) {
  const seq = ++bootSeq, f = fw, clock = mhz;
  const task = async () => {
    if (seq !== bootSeq) return false;
    window.FM1Loader?.begin(f.name);
    const importedBank = bank;
    let got;
    try {
      window.FM1Loader?.stage("acquiring package");
      got = await packageOf(f);
      window.FM1Loader?.stage("validating saved state");
      const hash = await packageHash(got.bytes);
      let record = memoryRecords.get(hash);
      if (!record) {
        try { record = await saveStore.load(hash); } catch (error) { saveFailure(error); }
      }
      if (seq !== bootSeq) return false;
      await flushRunning(true);
      // flushRunning may have updated this firmware's most recent snapshot.
      record = options.imported
        ? { ...options.imported, revision: memoryRecords.get(hash)?.revision || options.imported.revision }
        : memoryRecords.get(hash) || record;
      if (options.reset) record = { ...record, sectors: [] };
      const sectors = record?.sectors || [];
      const session = { seq, forceSave: !!(options.reset || options.imported || record?.unsaved),
        persistedSectors: record?.sectors || [], entry: DEV.key + f.id, revision: record?.revision || 0,
        record: { version: 1, hash, name: f.name, byo: !!(f.byo || record?.byo), device: DEVICE, package: got.bytes, url: got.url,
          sectors, revision: record?.revision || 0 } };
      sessions.set(seq, session);
      loadedUrl = got.url;
      showFirmware();
      down.fill(0); holds.fill(0); pointers.clear(); encClicks.fill(0);
      frame = last = null;
      booting = seq;
      perf.reset();
      const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          bootWaiters.delete(seq);
          running = null;
          engine?.postMessage({ type: "cancel-boot", seq });
          reject(new Error("firmware boot timed out"));
        }, 30000);
        bootWaiters.set(seq, { resolve, reject, timer });
      });
      window.FM1Loader?.stage("initializing virtual hardware");
      engine.postMessage({ type: "boot", seq, wasm: wasm.slice(0), package: got.bytes.slice().buffer,
        sectors: packSectors(sectors).buffer, syx: importedBank ? importedBank.slice().buffer : null,
        mhz: clock, jit: jitOn(),
        // (?ahead=0: each quantum emulates only for its own frames, as before the even pace)
        ahead: params.has("ahead") ? Number(params.get("ahead")) : undefined });
      status.textContent = `booting ${f.name}…`;
      await ready;
      if (bank === importedBank) bank = null; // imports seed flash once; saved edits win on later boots
      window.FM1Loader?.complete();
      return true;
    } catch (error) {
      if (bank === importedBank) bank = null;
      booting = 0;
      engine?.postMessage({ type: "resume" });
      if (seq === bootSeq) {
        window.FM1Loader?.fail(error instanceof NeedFile ? "package required" : "boot error");
        showFirmware();
        if (!running) { startBtn.hidden = false; startBtn.disabled = false; }
        const why = String(error?.message || error).replace(new RegExp(`^${f.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: `), "")
          .replace(/^boot: /, "").replace(/^Error: /, ""); // the engine's own prefixes say nothing to a player
        status.textContent = error instanceof NeedFile
        ? `${f.name}: open your ${DEV.stock} to boot it` : `${f.name}: ${why}${running ? `; ${running.record.name} is still running` : ""}`;
        if (!(error instanceof NeedFile)) {
          // the status line is one line and may be cut short: the notice keeps the whole reason
          issue.show("boot", { title: `Couldn't load ${f.name}`, text: `${why}.${running ? ` ${running.record.name} is still running.` : ""}`, level: "error", persist: true });
          // the list and the remembered choice follow what is actually running
          const runId = running ? running.entry.slice(DEV.key.length) : null;
          if (runId && byId.has(runId) && fwSel.value !== runId) {
            fwSel.value = runId; fw = byId.get(runId);
            if (!EMBED) store(DEV.key + "fw", runId);
            showFirmware();
          }
        }
      }
      return false;
    }
  };
  bootQueue = bootQueue.then(task, task);
  return bootQueue;
}

// the audio graph: a context with the chosen buffer, the emulator's output node in it.
// The machine runs in a worker (engine.js) that streams to a light reader in the audio thread
// (stream-worklet.js), so a slow stretch of emulation is absorbed by a short queue instead of
// being a gap in the sound. ?engine=worklet runs it in the audio thread itself, as before.
const STREAM_PREFILL = { interactive: 2048, balanced: 3072, playback: 4096 };
// The JIT compiles hot code while it runs, which can take longer than one audio quantum: in the
// audio thread that is a gap, so there the interpreter stays the default (?jit=1 opts in). The
// worker's queue absorbs the compiles, and the interpreter alone cannot keep up with busier
// firmware at the default clock, so with the worker the JIT is on (?jit=0 turns it off).
function jitOn() {
  return worker ? params.get("jit") !== "0" : params.get("jit") === "1";
}
function stopAudioGraph() {
  if (engine) engine.onmessage = null;
  worker?.terminate();
  worker = null;
  engine = null;
  try { node?.disconnect(); } catch {}
  try { outGain?.disconnect(); } catch {}
  node = null;
  outGain = null;
}
async function startAudio() {
  // "interactive"/"playback" are the browser hints; a number (e.g. 0.3) asks for an even larger buffer
  const hint = ["interactive", "balanced", "playback"].includes(latency) ? latency : (Number(latency) || "playback");
  ac = new AudioContext({ sampleRate: 44100, latencyHint: hint });
  try {
    if (params.get("engine") !== "worklet" && typeof Worker === "function") {
      await ac.audioWorklet.addModule("stream-worklet.js?v=1");
      const prefill = STREAM_PREFILL[latency] || 8192;
      node = new AudioWorkletNode(ac, "fm1-stream", { numberOfInputs: 0, outputChannelCount: [2], processorOptions: { prefill } });
      worker = new Worker("engine.js?v=1", { type: "module" });
      worker.onerror = (e) => {
        status.textContent = `the emulator worker failed: ${e.message || "unknown error"}`;
        issue.show("boot", { title: "Emulator stopped", text: status.textContent + ". Press Start to run it again.", level: "error", persist: true });
      };
      const channel = new MessageChannel();
      worker.postMessage({ type: "engine-init", sampleRate: ac.sampleRate, audio: channel.port1 }, [channel.port1]);
      node.port.postMessage({ type: "engine", port: channel.port2 }, [channel.port2]);
      node.port.onmessage = (e) => { if (e.data?.type === "stream") stream = e.data; };
      engine = worker;
    } else {
      await ac.audioWorklet.addModule("worklet.js?v=29");
      node = new AudioWorkletNode(ac, "fm1", { numberOfInputs: 0, outputChannelCount: [2] });
      engine = node.port;
    }
    // Master gain between the emulator and speakers so A/B can mute emu while MIDI out still drives hardware.
    if (!outGain || outGain.context !== ac) {
      outGain = ac.createGain();
      outGain.gain.value = abMode === "hw" ? 0 : 1;
    }
    node.connect(outGain);
    outGain.connect(ac.destination);
    engine.onmessage = onWorklet;
    perf.reset();
    // Boot now waits for a worklet acknowledgement; let its thread run even on browsers
    // that create an AudioContext suspended until the Start gesture is resumed explicitly.
    await ac.resume();
  } catch (error) {
    stopAudioGraph();
    await ac.close().catch(() => {});
    ac = null;
    throw error;
  }
}

// what the audio thread sends: the screen and LEDs with its timing, boot and error news
function onWorklet(e) {
  const m = e.data;
  if (m.type === "error") {
    if (m.fatal && running?.seq === m.seq) {
      running = null;
      for (const [id, pending] of snapshotWaiters) if (pending.seq === m.seq) {
        clearTimeout(pending.timer); snapshotWaiters.delete(id); pending.resolve();
      }
    }
    const waiter = bootWaiters.get(m.seq);
    if (waiter) { clearTimeout(waiter.timer); bootWaiters.delete(m.seq); waiter.reject(new Error(m.message)); }
    if (m.seq === bootSeq) {
      status.textContent = `${fw.name}: ${m.message}`;
      issue.show("boot", { title: `${fw.name} stopped`, text: `${fw.name}: ${m.message}`, level: "error", persist: true });
    }
    return;
  }
  if (m.type === "flash-changed") {
    const session = sessions.get(m.seq);
    if (session) session.observedRevision = m.revision;
    if (session === running) saveMessage("Saving…");
    return;
  }
  if (m.type === "snapshot") {
    const session = sessions.get(m.seq);
    if (session && m.flash) {
      session.observedRevision = m.revision;
      saveSnapshot(session, m.flash, m.revision);
    }
    const waiter = snapshotWaiters.get(m.request);
    if (waiter?.seq === m.seq) {
      clearTimeout(waiter.timer); snapshotWaiters.delete(m.request);
      if (m.error) waiter.reject(new Error(m.error)); else waiter.resolve();
    }
    return;
  }
  if (m.type === "booted") {
    const session = sessions.get(m.seq), waiter = bootWaiters.get(m.seq);
    if (!session || !waiter) return;
    running = session;
    showFirmware();
    for (const key of sessions.keys()) if (key !== m.seq) sessions.delete(key);
    session.base = m.base;
    session.observedRevision = m.revision;
    saveSnapshot(session, m.flash, m.revision);
    clearTimeout(waiter.timer); bootWaiters.delete(m.seq); waiter.resolve();
    if (m.seq === bootSeq) {
      booting = 0;
      issue.clear("boot");
      setBoard(m.board);
      if (m.board === 1) for (let i = 16; i < 22; i++) send({ type: "analog", idx: i, value: analog[i] });
    }
    return;
  }
  if (m.type !== "frame" || booting || m.seq !== bootSeq) return;
  // Preserve an update not yet drawn when a status-only message arrives.
  if (!m.lcd && frame?.lcd) m.lcd = frame.lcd;
  frame = m;
  if ("audioIn" in m) window.FM1._audioIn = !!m.audioIn;
  if ("usr" in m) window.FM1._usr = !!m.usr;
  perf.add(m);
  const now = performance.now();
  if (!last || now - last.t > 1000) {
    perf.second(m);
    status.textContent = m.halted ? `${fw.name}: the emulated CPU halted` :
      `${fw.name} · ${mhz} MHz · ${perf.speedText()} · load ${perf.loadText()} · ` +
      `${(m.ms / 1000).toFixed(1)} s`;
    // (hover: what the figures mean, the JIT's work in the audio thread, and the audio's health)
    status.title = [`speed: how much faster than real time the emulator runs this firmware on this device ` +
      `(emulated time per time spent emulating; below 1x the sound breaks up)`,
      `load: the time the emulator takes to run a second of audio (over 100%: the sound breaks up)`,
      m.jit ? `JIT: ${m.jit.regions} regions compiled, ${m.jit.failed} failed${m.jit.error ? ` (${m.jit.error})` : ""}` : "",
      `${m.short} short audio quanta (the firmware's audio fell behind its own clock)`].filter(Boolean).join("\n");
    last = { t: now };
  }
}

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  status.textContent = "starting audio…";
  try {
    if (!node) await startAudio();
    const started = await boot();
    if (!started) return;
    if (midiSel.value) midiOpen();                  // (an input picked on an earlier visit)
    await ac.resume();
    startBtn.hidden = true;
    // a phone on its side: the synth fills the screen, so bring all of it into view
    if (matchMedia("(orientation: landscape) and (max-height: 560px) and (pointer: coarse)").matches) canvas.scrollIntoView({ block: "center" });
  } catch (error) {
    status.textContent = `Could not start audio: ${error.message || error}`;
    issue.show("audio", { title: "No audio", text: `${status.textContent}. Check that an output device is connected, then press Start again.`, level: "error" });
  } finally {
    if (!startBtn.hidden) startBtn.disabled = false;
  }
});
startBtn.dataset.ready = "true";
startBtn.disabled = false;
if (status.textContent === "Preparing emulator…") status.textContent = "click Start to boot";

// Persistence controls use the running machine's identity, even while another firmware is selected.
const action = fn => async () => { try { await fn(); } catch (error) { saveFailure(error); } };
document.getElementById("save-now").addEventListener("click", action(async () => {
  if (!running) throw new Error("start a firmware first");
  await flushRunning();
}));
document.getElementById("export-save").addEventListener("click", action(async () => {
  if (!running) throw new Error("start a firmware first");
  await flushRunning();
  const record = running.record;
  const url = URL.createObjectURL(new Blob([exportSave(record)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${record.name.replace(/[^a-z0-9_-]/gi, '_')}.fm1save`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}));
document.getElementById("import-save").addEventListener("change", action(async () => {
  const input = document.getElementById("import-save"), file = input.files[0];
  input.value = "";
  if (!file) return;
  if (file.size > 16 << 20) throw new Error("backup too large");
  const record = await importSave(await file.text(), async hash => {
    const kept = memoryRecords.get(hash) || await saveStore.load(hash);
    if (kept) return kept.package;
    if (localFw?.bytes && await packageHash(localFw.bytes) === hash) return localFw.bytes;
    for (const got of packages.values()) if (await packageHash(got.bytes) === hash) return got.bytes;
    return null;
  });
  if (!confirm(`Import “${record.name}”? This replaces any saved flash for the same firmware package.`)) return;
  await bootQueue;
  await flushRunning();
  let existing;
  try { existing = await saveStore.load(record.hash); } catch (error) { saveFailure(error); }
  record.byo ||= memoryRecords.get(record.hash)?.byo || existing?.byo || false;
  record.revision = memoryRecords.get(record.hash)?.revision || existing?.revision || 0;
  memoryRecords.set(record.hash, record);
  // Explicit imports are always a local entry, independent of the currently selected stock firmware.
  localFw = { id: "local", name: record.name, version: "", bytes: record.package };
  let opt = [...fwSel.options].find(o => o.value === "local");
  if (!opt) fwSel.add(opt = new Option("", "local"), 0);
  opt.text = `${record.name} (your file)`;
  fw = localFw; fwSel.value = "local";
  if (!EMBED) store(DEV.key + "fw", "local");
  bank = null;
  loadedUrl = null;
  showFirmware();
  if (node) await boot({ imported: record });
  else status.textContent = `${record.name} backup ready: click Start`;
}));
document.getElementById("reset-save").addEventListener("click", action(async () => {
  if (!running || running.entry !== DEV.key + fw.id) throw new Error("start the selected firmware first");
  if (!confirm(`Reset saved settings and patches for “${running.record.name}”? Export a backup first if you want to keep them.`)) return;
  bank = null;
  await boot({ reset: true });
}));
document.getElementById("update-firmware").addEventListener("click", action(async () => {
  if (fw.id === "local" || fw.byo) throw new Error("open a new .fwsc file to update this firmware");
  const selected = fw;
  saveMessage(`Checking ${selected.name}…`);
  const got = await fetchPackage(selected);
  const hash = await packageHash(got.bytes);
  packages.set(selected.id, got);
  noteVersion(selected, got.version);
  if (fw !== selected) return;
  if (running?.record.hash === hash) { saveMessage("Firmware is up to date"); return; }
  if (node) await boot();
  else saveMessage("Firmware ready: click Start");
}));
wireRadar({ bundledCatalog, radarRemembered, radarKey, legacyRadarKey, store });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && running) flushRunning().catch(saveFailure);
});

// Closing a tab is best effort: the browser may terminate the worklet before its reply.
// Frequent quiet autosaves remain the durable fallback.
addEventListener("pagehide", () => {
  if (running) flushRunning().catch(saveFailure);
});

// Saved hashes remain accessible after catalog updates and subsequent local-file imports.
const savedVersions = document.getElementById("saved-versions");
document.getElementById("browse-saves").addEventListener("click", action(async () => {
  const records = new Map((await saveStore.list()).map(r => [r.hash, r]));
  for (const [hash, record] of memoryRecords) records.set(hash, record);
  savedVersions.replaceChildren();
  for (const record of records.values()) {
    if (record.device && record.device !== DEVICE) continue;
    savedVersions.add(new Option(`${record.name} · ${record.hash.slice(0, 12)}`, record.hash));
  }
  saveMessage(records.size ? "Choose a saved firmware, then Open saved firmware" : "No saved firmwares yet");
}));
document.getElementById("open-saved-version").addEventListener("click", action(async () => {
  const hash = savedVersions.value;
  const record = memoryRecords.get(hash) || await saveStore.load(hash);
  if (!record) throw new Error("choose a saved firmware first");
  await bootQueue;
  await flushRunning();
  localFw = { id: "local", name: record.name, version: "", bytes: record.package };
  let opt = [...fwSel.options].find(o => o.value === "local");
  if (!opt) fwSel.add(opt = new Option("", "local"), 0);
  opt.text = `${record.name} (saved version)`;
  fw = localFw; fwSel.value = "local";
  if (!EMBED) store(DEV.key + "fw", "local");
  bank = null; loadedUrl = null; showFirmware();
  if (node) await boot();
  else status.textContent = `${record.name} saved version ready: click Start`;
}));

// First-launch flash risk notice (once). Install still asks Yes/Cancel; journal/vault fail-safes stay.
if (stored("fm1.flashRiskAck") !== "1") {
  queueMicrotask(() => {
    issue.show("flash-risk", {
      title: "Flashing the real FM-1",
      text: "Install replaces what’s on the unit. No flash backup · your risk. Check / Finish / Roll back still apply.",
      level: "warn",
      persist: true,
      actions: [{ label: "Got it", primary: true, run: () => store("fm1.flashRiskAck", "1") }],
      onDismiss: () => store("fm1.flashRiskAck", "1"),
    });
  });
}
