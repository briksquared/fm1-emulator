// "Install to FM-1": flash a firmware onto the real device over USB-MIDI (Chrome/Edge), using the
// community-proven OTA module (foma/Felucca lineage, GPL-3.0). Injects a compact box into the menu.
import { Updater, isCandidatePort, isKnownOtherGear } from "./fm1ota.js?v=9";
import { FlashJournal, explain, pendingRecovery, validatePackage } from "./flash-core.js?v=1";

const params = new URLSearchParams(location.search);
let cat = { firmwares: [] };
try { cat = await (await fetch("firmwares.json?v=62")).json(); } catch {}

// prefer the right column (saves / MIDI), falling back to any sidebar on older single-column layouts
const side = document.querySelector(".side.side-right") || document.querySelector(".side.bar") || document.querySelector(".side");
if (side) build(side);

function build(side) {
  const style = document.createElement("style");
  // The flasher wears the app's own theme, driven by the same CSS variables the rest of the UI uses
  // (--amber / --amber-hi recolour live when the user changes the accent in Customize; --card/--well/
  // --rule/--line/--ink/--dim/--green are the shared dark-panel tokens). No hardcoded palette, so it
  // follows every theme change. Connection-state colours stay semantic: green ok, amber-hi update,
  // a fixed warm red for problems (a recoloured accent must not make "not connected" look fine).
  style.textContent = `
    .future-install{position:relative;overflow:hidden;padding:0!important}
    .fi-head{padding:9px 14px 8px;border-bottom:1px solid var(--line);background:linear-gradient(90deg,color-mix(in srgb,var(--amber) 11%,transparent),transparent)}
    .fi-eye{display:flex;align-items:center;gap:7px;font:700 9px 'Space Mono',monospace;letter-spacing:.16em;color:var(--amber-ink, var(--amber))}
    .fi-eye i{width:7px;height:7px;border-radius:50%;background:var(--amber);box-shadow:0 0 10px var(--amber);animation:fiPulse 1.9s ease-in-out infinite}
    .fi-head h2{margin:4px 0 0!important;font:650 15px 'Space Grotesk',sans-serif!important;letter-spacing:.01em;color:var(--ink)}
    .fi-pitch{margin:4px 0 0!important;font:11px/1.35 'Space Grotesk',sans-serif!important;color:var(--dim)!important}
    .fi-core{padding:10px 14px 12px}
    .fi-scope{display:flex;align-items:center;gap:9px;min-height:40px;margin:0 0 9px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--well);font:10px 'Space Mono',monospace;color:var(--dim)}
    .fi-orb{width:15px;height:15px;flex:0 0 15px;border-radius:50%;border:1px solid var(--line)}
    .fi-connwrap{display:flex;flex-direction:column;gap:2px;min-width:0;line-height:1.3}
    #inst-state{font:700 11px 'Space Mono',monospace;letter-spacing:.12em;color:var(--dim)}
    #inst-conn{font-size:9.5px;color:var(--dim);white-space:normal}
    #inst-scan:hover{border-color:var(--amber)!important}
    .fi-field{display:grid;gap:6px;margin:8px 0}
    .fi-field{min-width:0}
    .fi-field label{display:flex!important;justify-content:space-between;align-items:center;gap:8px;min-width:0;color:var(--dim)!important;font:10px 'Space Mono',monospace!important;letter-spacing:.07em;text-transform:uppercase}
    .fi-field select{max-width:62%!important;min-width:0!important;flex:0 1 auto!important;border:1px solid var(--line)!important;background:var(--well)!important;color:var(--ink)!important;border-radius:6px!important;font:12px 'Space Grotesk',sans-serif!important}
    .fi-main{width:100%;border:1px solid var(--amber)!important;background:var(--amber)!important;color:var(--ui-on-accent,#180a02)!important;border-radius:8px;font:700 12.5px 'Space Grotesk',sans-serif!important;letter-spacing:.02em;min-height:33px}
    .fi-main:hover{background:var(--amber-hi)!important;border-color:var(--amber-hi)!important}
    .fi-confirm{margin-top:7px;padding:9px 10px;border:1px solid var(--amber);border-radius:8px;background:color-mix(in srgb,var(--amber) 13%,var(--card));box-shadow:0 8px 22px rgba(0,0,0,.45)}
    .fi-confirm p{margin:0 0 8px;font-size:11.5px;line-height:1.35;color:var(--ink)}
    .fi-confirm-btns{display:grid;grid-template-columns:1fr 1fr;gap:7px}
    .fi-confirm .fi-yes{border:1px solid var(--amber)!important;background:var(--amber)!important;color:var(--ui-on-accent,#180a02)!important;border-radius:7px!important;font:700 11.5px 'Space Grotesk',sans-serif!important;padding:7px!important;cursor:pointer}
    .fi-confirm .fi-yes:hover{background:var(--amber-hi)!important;border-color:var(--amber-hi)!important}
    .fi-confirm .fi-no{border:1px solid var(--line)!important;background:var(--well)!important;color:var(--ink)!important;border-radius:7px!important;font:11.5px 'Space Grotesk',sans-serif!important;padding:7px!important;cursor:pointer}
    .fi-confirm .fi-no:hover{border-color:var(--amber)!important}
    .fi-subrow{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:6px}
    .fi-subrow button,.fi-recov-grid button{border:1px solid var(--line)!important;background:var(--well)!important;color:var(--ink)!important;border-radius:7px!important;font:11px 'Space Grotesk',sans-serif!important;padding:8px 7px;cursor:pointer;min-width:0;overflow-wrap:anywhere}
    .fi-subrow button:hover,.fi-recov-grid button:hover{border-color:var(--amber)!important}
    .fi-progress{margin-top:10px;display:none}.fi-progress[active]{display:block}
    .fi-progress-track{height:3px;overflow:hidden;background:var(--line);border-radius:2px}
    .fi-progress-track::after{content:'';display:block;width:42%;height:100%;background:linear-gradient(90deg,transparent,var(--amber),transparent);animation:fiSweep 1.05s linear infinite}
    .fi-readout{min-height:18px;margin:7px 0 0!important;color:var(--dim)!important;font:10px/1.4 'Space Mono',monospace!important}
    .future-install[data-state="ok"] .fi-readout{color:var(--green)!important}
    .future-install[data-state="error"] .fi-readout{color:#e2705f!important}
    .fi-links{display:flex;justify-content:space-between;gap:9px;margin-top:6px;font:10px 'Space Mono',monospace;color:var(--faint)}
    .fi-links a{color:var(--amber-ink, var(--amber))!important}
    .fi-recovery{border-top:1px solid var(--line);background:rgba(0,0,0,.14)}
    .fi-recovery summary{padding:11px 14px;cursor:pointer;color:var(--ink);font:600 11px 'Space Grotesk',sans-serif;letter-spacing:.03em}
    .fi-recovery ol{margin:0;padding:0 18px 13px 29px;color:var(--dim);font-size:10.5px;line-height:1.5}
    .fi-recovery b{color:var(--ink)}
    .fi-recov-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:10px 14px 4px}
    .fi-recov-grid button{text-align:left}
    .fi-recov-grid button[hidden]{display:none}
    @keyframes fiSweep{to{transform:translateX(255%)}}@keyframes fiPulse{50%{opacity:.35;transform:scale(.7)}}
    @media(prefers-reduced-motion:reduce){.future-install *{animation:none!important}}
  `;
  document.head.appendChild(style);
  const box = document.createElement("section");
  box.className = "box install-box future-install";
  box.innerHTML = `
    <div class="fi-head"><div class="fi-eye"><i></i> HARDWARE CONTROL / FM-1</div><h2>Firmware uplink</h2><p class="fi-pitch">Flash any firmware to your FM-1 in a few clicks, and recover if anything goes wrong.</p></div>
    <div class="fi-core"><div class="fi-scope"><span class="fi-orb" id="inst-orb"></span><span class="fi-connwrap"><b id="inst-state">TAP SCAN</b><span id="inst-conn">press SCAN to check the FM-1 connection</span></span><button type="button" id="inst-scan" style="margin-left:auto;align-self:center;background:var(--well);border:1px solid var(--line);color:var(--ink);border-radius:6px;font:10px 'Space Mono',monospace;letter-spacing:.08em;padding:4px 11px;cursor:pointer">SCAN</button></div>
    <div class="fi-field"><label>Deployment payload <select id="inst-fw" aria-label="Firmware to install"></select></label></div>
    <input type="file" id="inst-file" accept=".fwsc" hidden>
    <button type="button" id="inst-flash" class="primary fi-main">Deploy selected firmware</button>
    <div class="fi-subrow"><button type="button" id="inst-device-lab">Open Device Lab</button><button type="button" id="inst-resume">Resume interrupted install</button></div>
    <div class="fi-progress" id="inst-prog" aria-hidden="true"><div class="fi-progress-track"></div></div>
    <p id="inst-status" class="fi-readout" role="status" aria-live="polite">READY / select a payload, then connect the FM-1.</p>
    <div class="fi-links">
      <a id="inst-upload-link" href="#">Upload .fwsc…</a><span>BACKUP FIRST</span>
    </div></div>
    <details id="inst-recovery" class="fi-recovery">
      <summary>Recovery options — you can always get back ▸</summary>
      <div class="fi-recov-grid">
        <button type="button" id="inst-backup">⭳ Back up flash first</button>
        <button type="button" id="inst-mflash">⚑ M-Flasher · download mode</button>
        <button type="button" id="inst-rescan">⟳ Re-scan connection</button>
        <button type="button" id="inst-resume2">↺ Resume interrupted install</button>
        <button type="button" id="inst-rollback" hidden>↶ Roll back to previous firmware</button>
      </div>
      <ol>
        <li>Stuck or unsure? <b>Back up flash first</b> — a backup can always be restored, so a flash is never a dead end.</li>
        <li>No in-app connection? <b>M-Flasher · download mode</b>: hold <b>OCT− + OCT+</b> for 5 seconds (or power on holding <b>REC</b>, or use M-Flasher's <b>DOWNLOAD MODE</b> button), then write.</li>
        <li>Install interrupted? Reconnect with a USB <b>data</b> cable and <b>Resume interrupted install</b> — the unit stays in update mode until it finishes. The app remembers which firmware it was writing, and <b>Roll back</b> writes the one you had before instead.</li>
        <li>Use a USB data cable (not charge-only), plugged straight into the computer. Never flash an SMK-37 package on an FM-1.</li>
      </ol>
    </details>`;
  side.appendChild(box);

  const sel = box.querySelector("#inst-fw");
  for (const f of cat.firmwares) sel.add(new Option(`${f.name} ${f.version || ""}`.trim(), f.id));
  const cur = params.get("fw"); if (cur && cat.firmwares.some(f => f.id === cur)) sel.value = cur;

  const statusEl = box.querySelector("#inst-status");
  const prog = box.querySelector("#inst-prog");
  const flashBtn = box.querySelector("#inst-flash");
  const resumeBtn = box.querySelector("#inst-resume");
  const file = box.querySelector("#inst-file");
  let uploaded = null; // {bytes, name}
  let busy = false;

  const status = (m) => { statusEl.textContent = m; box.dataset.state = m.startsWith("✓") ? "ok" : (m.startsWith("✗") ? "error" : ""); };

  // In-place confirm, popped right under the Deploy button (the browser's own confirm() dialog lands
  // in the middle of the screen, far from the button over here in the right column).
  function askConfirm(message, yesLabel, altLabel) {
    return new Promise((resolve) => {
      box.querySelector(".fi-confirm")?.remove();
      const c = document.createElement("div");
      c.className = "fi-confirm";
      c.innerHTML = `<p></p><div class="fi-confirm-btns"><button type="button" class="fi-yes"></button><button type="button" class="fi-no">Cancel</button></div>`;
      c.querySelector("p").textContent = message;
      c.querySelector(".fi-yes").textContent = yesLabel || "Flash";
      if (altLabel) {
        const alt = document.createElement("button");
        alt.type = "button"; alt.className = "fi-no fi-alt"; alt.textContent = altLabel;
        alt.style.gridColumn = "1 / -1";
        alt.onclick = () => done("alt");
        c.querySelector(".fi-confirm-btns").appendChild(alt);
      }
      flashBtn.insertAdjacentElement("afterend", c);
      const done = (v) => { c.remove(); document.removeEventListener("keydown", onKey, true); resolve(v); };
      const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); done(false); } };
      c.querySelector(".fi-yes").onclick = () => done(true);
      c.querySelector(".fi-no").onclick = () => done(false);
      document.addEventListener("keydown", onKey, true);
      c.querySelector(".fi-no").focus();
    });
  }

  // --- live connect / disconnect system ---------------------------------------------------------
  // One shared MIDIAccess; a Scan button and WebMIDI statechange keep a non-destructive view of what
  // is connected, so the user can confirm the FM-1 before flashing. detect() never holds the port.
  const orb = box.querySelector("#inst-orb");
  const stateEl = box.querySelector("#inst-state");
  const connEl = box.querySelector("#inst-conn");
  const scanBtn = box.querySelector("#inst-scan");
  let midiAccess = null, scanning = false, connTimer = null;
  let confirmedName = null, confirmedId = null;   // the FM-1 a SCAN confirmed; the indicator holds while it stays plugged in
  // state: "ok" (green, connected), "update" (blue, in update/download loader), "warn" (amber,
  // not connected / problem), "checking" (neutral). label is the one-word verdict; detail explains.
  const setConn = (label, detail, state) => {
    stateEl.textContent = label;
    connEl.textContent = detail || "";
    // theme-following state colours: green ok, amber-hi update (recolours with the accent), a fixed
    // warm red for problems, dim while checking. Driven by the same CSS vars as the rest of the app.
    const col = state === "ok" ? "var(--green)" : state === "update" ? "var(--amber-hi)" : state === "warn" ? "#e2705f" : "var(--dim)";
    stateEl.style.color = col;
    orb.style.background = state === "checking" ? "transparent" : col;
    orb.style.boxShadow = state === "checking" ? "none" : `0 0 9px ${col}`;
    orb.style.borderColor = col;
  };
  async function ensureAccess() {
    if (midiAccess) return midiAccess;
    if (!navigator.requestMIDIAccess) { const e = new Error("USB-MIDI needs a supported browser or the FM-1 Emulator desktop app."); e.code = "midiaccess"; throw e; }
    let a;
    try { a = await navigator.requestMIDIAccess({ sysex: true }); }
    catch (e) {
      const denied = /notallowed|security|denied|permission/i.test(`${(e && e.name) || ""} ${(e && e.message) || ""}`);
      const err = new Error(denied
        ? "USB-MIDI/SysEx access was denied. Allow MIDI for this page (the desktop app grants it automatically), then retry."
        : `Could not obtain USB-MIDI access: ${(e && e.message) || e}`);
      err.code = denied ? "midiperm" : "midiaccess"; throw err;
    }
    midiAccess = a;
    // On connect/disconnect, update the live indicator from the device LIST only — never open/probe
    // a port here. Opening a re-enumerating port (a freshly-flashed unit rebooting) fired statechange
    // repeatedly and glitched the device ~once a second; reading names/states can't. The deep handshake
    // happens only on SCAN / Re-scan (and once after a flash).
    midiAccess.onstatechange = () => {
      clearTimeout(connTimer);
      connTimer = setTimeout(() => updatePresence(), 400);
    };
    return midiAccess;
  }
  // The persistent connection indicator: reflects whether the FM-1 is plugged in, read from the MIDI
  // device list (no port opened). It STAYS on while the device is connected. Once a SCAN confirms an
  // FM-1, that green CONNECTED is held as long as the same port is present; a known FM-1-named port
  // reads as CONNECTED on sight; an unknown-but-plausible port reads DETECTED (press SCAN to confirm).
  function updatePresence() {
    if (!midiAccess || scanning || busy) return;   // don't fight an in-progress scan / flash
    const live = [...midiAccess.inputs.values()].filter((i) => i.state === "connected");
    const names = live.map((i) => i.name);
    if (confirmedName && !names.includes(confirmedName)) { confirmedName = confirmedId = null; }  // it was unplugged
    const named = live.find((i) => isCandidatePort(i.name));
    const plausible = live.find((i) => !isKnownOtherGear(i.name));
    if (confirmedName) setConn("CONNECTED", `${confirmedId || confirmedName} — ready to flash or back up`, "ok");
    else if (named) setConn("CONNECTED", `${named.name} — press SCAN to confirm / flash`, "ok");
    else if (plausible) setConn("DETECTED", `${plausible.name} — press SCAN to confirm it’s the FM-1`, "update");
    else if (live.length === 0) setConn("NOT CONNECTED", "no MIDI — use a USB DATA cable (not charge-only)", "warn");
    else setConn("NOT CONNECTED", `only other gear: ${names.join(", ")}`, "warn");
  }
  async function refreshConn() {
    if (scanning || busy) return;              // never scan while a flash is in progress
    scanning = true;
    setConn("CHECKING…", "reading USB-MIDI…", "checking");
    try {
      await ensureAccess();
      const r = await new Updater(midiAccess).detect();
      // remember a confirmed FM-1 so the live indicator can HOLD "CONNECTED" while it stays plugged in
      if (r.found && !r.inUpdateMode) { confirmedName = r.name; confirmedId = r.id; } else { confirmedName = confirmedId = null; }
      if (r.found && r.inUpdateMode) setConn("UPDATE MODE", `loader ready (${r.id}) — Resume, or let a flash finish`, "update");
      else if (r.found) setConn("CONNECTED", `${r.id} on “${r.name}” — ready to flash or back up`, "ok");
      else if (r.code === "nomidi") setConn("NOT CONNECTED", "no MIDI at all — use a USB DATA cable (not charge-only), try another port", "warn");
      else if (r.code === "noport") setConn("NOT CONNECTED", `the FM-1 isn’t among the MIDI devices — only: ${r.ports.join(", ")}`, "warn");
      else if (r.code === "busy") setConn("PORT BUSY", "another app is holding the FM-1 — close your DAW / MIDI tools, then re-scan", "warn");
      else setConn("NO RESPONSE", `probed ${r.ports.join(", ") || "(none)"} — try download mode + M-Flasher below`, "warn");
    } catch (e) {
      const code = (e && e.code) || "error";
      setConn(code === "midiperm" ? "ACCESS DENIED" : "SCAN FAILED", (e && e.message) || String(e), "warn");
    } finally { scanning = false; }
  }
  scanBtn.onclick = () => { refreshConn(); };

  // Desktop-only: launch the recovery-grade flasher (bundled M-Flasher). The in-app USB-MIDI
  // path can't reach a unit in download mode (that's a non-MIDI JieLi USB device) or flash a
  // firmware that has no in-app OTA responder, so this is the path that actually works — used by
  // the button AND automatically when the in-app flash can't proceed (see doFlash).
  const deviceLab = box.querySelector("#inst-device-lab");
  if (!window.FM1Desktop && deviceLab) { deviceLab.hidden = true; }
  const DL_STEPS = "To flash: put the FM-1 in DOWNLOAD MODE — hold OCT− and OCT+ together for 5 seconds " +
    "(or power it on holding REC, or click M-Flasher’s DOWNLOAD MODE button) — then Back up the whole flash, and write the firmware.";
  async function launchMFlasher(lead) {
    if (!window.FM1Desktop) return false;
    status(lead || "Opening M-Flasher… approve Windows if it asks.");
    try {
      const result = await window.FM1Desktop.openFlasher();
      if (result.ok) { status(`M-Flasher is open. ${DL_STEPS}`); return true; }
      if (result.download) { status("M-Flasher isn’t installed; opening its official download page."); window.open(result.download, "_blank", "noopener"); return false; }
      status(`✗ ${result.message}`); return false;
    } catch (error) { status(`✗ Could not open M-Flasher: ${error.message || error}`); return false; }
  }
  if (window.FM1Desktop && deviceLab) {
    deviceLab.onclick = async () => { deviceLab.disabled = true; try { await launchMFlasher("Opening Device Lab… approve Windows if it asks."); } finally { deviceLab.disabled = false; } };
  }
  // the persisted install journal: where an install stopped, survives reloads and crashes
  const journal = new FlashJournal(localStorage);
  const JOURNAL_PHASE = { stage: "staging", loader: "loader", write: "writing", reboot: "rebooting", done: "done" };
  const onStep = (phase, n) => {
    prog.setAttribute("active", "");
    const jp = JOURNAL_PHASE[phase];
    if (jp && journal.read()?.phase !== jp) { try { journal.advance(jp); } catch {} }
    if (phase === "stage") status(`Preparing the update… (${n})`);
    else if (phase === "write") status(`Writing to flash… (${n}) — keep the FM-1 plugged in`);
    else if (phase === "loader") status("Waiting for the update loader…");
    else if (phase === "reboot") status("Written. Waiting for the FM-1 to restart…");
    else if (phase === "start") status(`Starting the install on ${n}…`);
  };
  const rollbackBtn = box.querySelector("#inst-rollback");
  const recoveryEl = box.querySelector("#inst-recovery");
  function showPending() {
    const p = pendingRecovery(journal.read());
    rollbackBtn.hidden = !(p && p.rollback);
    if (p?.rollback) rollbackBtn.textContent = `↶ Roll back to ${p.rollback.name}`;
    return p;
  }
  const failure = (e) => {
    const x = explain(e);
    status(`✗ ${x.what} ${x.next}`);
    statusEl.title = `[${x.code}] ${x.detail}`;
    return x;
  };

  box.querySelector("#inst-upload-link").onclick = (e) => { e.preventDefault(); file.click(); };
  file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    uploaded = { bytes: new Uint8Array(await f.arrayBuffer()), name: f.name.replace(/\.fwsc$/i, "") };
    status(`Loaded ${uploaded.name} — press Flash.`);
  };

  async function catalogBytes(fwId) {
    const f = cat.firmwares.find(x => x.id === fwId);
    if (!f?.package) { const e = new Error("pick a firmware package"); e.code = "badpackage"; throw e; }
    let r;
    try { r = await fetch(f.package); } catch { r = null; }
    if (!r?.ok) { const e = new Error(`package: ${r ? `HTTP ${r.status}` : "not reachable"}`); e.code = "checksum"; throw e; }
    return { bytes: new Uint8Array(await r.arrayBuffer()), name: `${f.name} ${f.version || ""}`.trim(), fwId: f.id, expected: { sha256: f.sha256, product: f.product } };
  }
  async function sourceBytes() {
    if (uploaded) return { ...uploaded, fwId: null, expected: {} };
    return catalogBytes(sel.value);
  }
  // the package an interrupted install was writing (or the last good one, for a rollback)
  async function journalBytes(entry) {
    if (entry.fwId) return catalogBytes(entry.fwId);
    if (uploaded) return { ...uploaded, fwId: null, expected: { sha256: entry.sha256 } };
    const e = new Error(`Choose the file you were installing (${entry.name}) with Upload .fwsc…, then press Resume again.`);
    e.code = "sourcemismatch";
    throw e;
  }

  // mode: "deploy" (a fresh install), "resume" (finish an interrupted one with the same package),
  // "rollback" (write the last good firmware through the waiting update loader)
  async function doFlash(mode) {
    if (busy) return;
    if (!navigator.requestMIDIAccess) { failure(Object.assign(new Error(""), { code: "midiaccess" })); return; }
    busy = true;
    flashBtn.disabled = true;
    resumeBtn.disabled = true;
    if (deviceLab) deviceLab.disabled = true;
    let started = false;
    try {
      const pending = pendingRecovery(journal.read());
      let src;
      if (mode === "rollback") {
        if (!pending?.rollback) { status("No earlier firmware to roll back to."); return; }
        src = await journalBytes(pending.rollback);
      } else if (mode === "resume" && pending?.kind === "resume") {
        src = await journalBytes(pending.journal);
      } else {
        src = await sourceBytes();
      }
      status("Checking the package…");
      const pkg = await validatePackage(src.bytes, src.expected);
      if (mode === "resume" && pending?.kind === "resume" && pending.journal.sha256 !== pkg.sha256) {
        throw Object.assign(new Error(""), { code: "sourcemismatch" });
      }
      status("Looking for the FM-1…");
      const access = await ensureAccess();   // shared with the Scan/connection system; coded errors
      const up = new Updater(access, (m) => status(m));
      const seen = await up.detect();
      if (!seen.found) throw Object.assign(new Error((seen.diag || []).join("; ")), { code: seen.code });
      if (mode === "deploy" && seen.inUpdateMode) throw Object.assign(new Error(seen.id), { code: "inupdate" });
      if (mode !== "deploy" && !seen.inUpdateMode) {
        status(`The FM-1 is running ${seen.id}, not waiting in update mode, so there is nothing to resume. Use Deploy to install a firmware.`);
        if (pending?.kind === "resume") journal.clear();
        showPending();
        return;
      }
      if (mode === "deploy" && seen.model !== pkg.product.split("_")[0]) throw Object.assign(new Error(seen.id), { code: "model" });
      const verb = mode === "deploy" ? "Flash" : mode === "resume" ? "Finish installing" : "Roll back to";
      const backup = mode === "deploy" && window.FM1Desktop ? "Back up the flash first (M-Flasher)" : null;
      const answer = await askConfirm(`${verb} ${src.name} on the FM-1 (${seen.id})? Keep it connected until it restarts.${backup ? "" : " Back up the flash first if unsure."}`, mode === "deploy" ? "Flash" : mode === "resume" ? "Resume" : "Roll back", backup);
      if (answer === "alt") { await launchMFlasher("Opening M-Flasher — back up the whole flash, close it, then press Deploy again."); return; }
      if (!answer) { status("Cancelled. Nothing was written."); return; }
      journal.begin({ fwId: src.fwId, name: src.name, product: pkg.product, sha256: pkg.sha256, previous: seen.id, resume: mode !== "deploy" });
      started = true;
      if (mode === "deploy") {
        status(`Flashing ${src.name} (${pkg.product}) — keep the FM-1 plugged in…`);
        await up.install(pkg.image, pkg.product, onStep);
      } else {
        const id = await up.resume(pkg.image, pkg.product, onStep);
        if (!id) throw Object.assign(new Error("the update loader went away"), { code: "lost" });
      }
      try { journal.advance("done"); } catch {}
      status(`✓ Installed ${src.name}. The FM-1 restarted and reports ${pkg.product}.`);
      statusEl.title = "";
    } catch (e) {
      if (started) journal.fail(e && e.code);
      const { code } = failure(e);
      // The in-app USB-MIDI path cannot reach this unit at all (no in-app OTA responder, or it is
      // not on MIDI). On the desktop app, hand off to M-Flasher, which reaches a unit in download
      // mode. Interrupted installs are resumed here instead.
      const HANDOFF = ["downloadmode", "notfound", "noport", "nomidi"];
      if (window.FM1Desktop && HANDOFF.includes(code)) {
        await launchMFlasher(`✗ ${explain(e).what} Opening M-Flasher (download mode) instead…`);
      }
      if (pendingRecovery(journal.read())) recoveryEl.open = true;
    } finally {
      busy = false;
      flashBtn.disabled = false;
      resumeBtn.disabled = false;
      if (deviceLab) deviceLab.disabled = false;
      prog.removeAttribute("active");
      showPending();
      // after a flash the device re-enumerates; update the indicator from the list (no probe of the
      // just-rebooted unit). A manual SCAN confirms the new firmware's identity.
      if (midiAccess) setTimeout(() => updatePresence(), 1200);
    }
  }

  // closing the window mid-install interrupts it; ask first (the desktop app shows a dialog)
  addEventListener("beforeunload", (e) => { if (busy && journal.read()?.status === "running") { e.preventDefault(); e.returnValue = ""; } });

  flashBtn.onclick = () => doFlash("deploy");
  resumeBtn.onclick = (e) => { e.preventDefault(); doFlash("resume"); };
  rollbackBtn.onclick = () => doFlash("rollback");

  // Recovery options grid: always reachable so a flash is never a dead end. Back-up and M-Flasher
  // need the desktop bridge; hide them on the web build. Re-scan and Resume work everywhere.
  const backupBtn = box.querySelector("#inst-backup");
  const mflashBtn = box.querySelector("#inst-mflash");
  const rescanBtn = box.querySelector("#inst-rescan");
  const resume2Btn = box.querySelector("#inst-resume2");
  if (!window.FM1Desktop) { if (backupBtn) backupBtn.hidden = true; if (mflashBtn) mflashBtn.hidden = true; }
  if (backupBtn) backupBtn.onclick = async () => { backupBtn.disabled = true; try { await launchMFlasher("Opening M-Flasher — use Back up the whole flash first, then write."); } finally { backupBtn.disabled = false; } };
  if (mflashBtn) mflashBtn.onclick = async () => { mflashBtn.disabled = true; try { await launchMFlasher("Opening M-Flasher — download mode."); } finally { mflashBtn.disabled = false; } };
  if (rescanBtn) rescanBtn.onclick = () => refreshConn();
  if (resume2Btn) resume2Btn.onclick = () => doFlash("resume");

  // an install that did not finish last time (window closed, crash, cable pulled): say so on open
  {
    const p = showPending();
    if (p) {
      recoveryEl.open = true;
      const j = p.journal;
      if (p.kind === "retry") status(`An install of ${j.name} stopped before anything was written. Press Deploy to try again.`);
      else if (p.kind === "restart") status(`${j.name} was written but the FM-1 had not restarted yet. Power-cycle it and press SCAN.`);
      else status(`An install of ${j.name} did not finish. Reconnect the FM-1 and press Resume interrupted install${p.rollback ? `, or roll back to ${p.rollback.name}` : ""}.`);
    }
  }

  // Desktop app (MIDI auto-granted): read the device list once on open and keep the indicator live via
  // statechange — LIST ONLY, no port opened, so it never glitches the device. The indicator then stays
  // on while the FM-1 is plugged in. The deep handshake is still only on SCAN / Re-scan. On the web
  // build we wait for SCAN so we don't prompt for MIDI permission on load.
  if (window.FM1Desktop) ensureAccess().then(() => updatePresence()).catch(() => {});
}
