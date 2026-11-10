// "Install firmware": install a firmware on the real FM-1 over USB-MIDI (desktop app, Chrome or
// Edge), using the community OTA module (foma/Felucca lineage, GPL-3.0), with recovery help for
// an install that stops and for a unit whose screen stays black. Injects a box into the side bar.
import { Updater, isCandidatePort, isKnownOtherGear } from "./fm1ota.js?v=13";
import { FlashJournal, FlashLog, explain, pendingRecovery, troubleshootingText, validatePackage, journalAgeMs, writeSafetyFlags, BADREQ_LIMIT } from "./flash-core.js?v=7";
import { createPackageVault } from "./flash-vault.js?v=2";

const params = new URLSearchParams(location.search);
let cat = { firmwares: [] };
try { cat = await (await fetch("firmwares.json?v=62")).json(); } catch (e) { console.warn("firmware catalog not loaded:", e); }

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
    .fi-scope{display:flex;flex-wrap:wrap;align-items:center;gap:6px 9px;min-height:40px;margin:0 0 9px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--well);font:10px 'Space Mono',monospace;color:var(--dim)}
    .fi-orb{width:15px;height:15px;flex:0 0 15px;border-radius:50%;border:1px solid var(--line)}
    .fi-connwrap{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 112px;line-height:1.3}
    #inst-state{font:700 11px 'Space Mono',monospace;letter-spacing:.06em;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #inst-conn{font:11px 'Space Grotesk',sans-serif;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .fi-scope button{flex:none;white-space:nowrap}
    #inst-conn-more{width:22px;height:22px;padding:0!important;border-radius:50%!important;font:700 11px 'Space Grotesk',sans-serif!important}
    #inst-conn-more[hidden]{display:none}
    .fi-connhelp{margin:-3px 0 9px!important;padding:7px 9px;border:1px solid var(--line);border-radius:7px;background:var(--well);color:var(--ink)!important;font:11px/1.45 'Space Grotesk',sans-serif!important}
    .fi-connhelp[hidden]{display:none}
    .fi-file{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin-top:8px;min-width:0}
    .fi-file button{flex:none;white-space:nowrap;color:var(--ink)!important;border-radius:6px!important;font:10px 'Space Grotesk',sans-serif!important;padding:3px 7px!important;min-height:0;cursor:pointer}
    .fi-file button:hover{filter:brightness(1.1)}
    .fi-fname{flex:1 1 90px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dim);font:11px 'Space Grotesk',sans-serif}
    .fi-fname.on{color:var(--ink)}
    #inst-scan{box-shadow:var(--raised,inset 0 1px 0 rgba(255,255,255,.12),0 2px 3px rgba(0,0,0,.45))!important}
    #inst-scan:hover{filter:brightness(1.1)}
    .fi-field{display:grid;gap:6px;margin:8px 0}
    .fi-field{min-width:0}
    .fi-field label{display:flex!important;justify-content:space-between;align-items:center;gap:8px;min-width:0;color:var(--dim)!important;font:10px 'Space Mono',monospace!important;letter-spacing:.07em;text-transform:uppercase}
    .fi-field select{max-width:62%!important;min-width:0!important;flex:0 1 auto!important;border:1px solid var(--line)!important;background:var(--well)!important;color:var(--ink)!important;border-radius:6px!important;font:12px 'Space Grotesk',sans-serif!important}
    .fi-main{width:100%;border:1px solid var(--amber-edge,#6e6e6e)!important;background:linear-gradient(180deg,var(--amber-hi),var(--amber) 55%,var(--amber-lo,#9a9a9a))!important;color:var(--ui-on-accent,#111)!important;border-radius:6px;font:700 10.5px 'Space Grotesk',sans-serif!important;letter-spacing:.02em;min-height:0;padding:5px 8px!important;white-space:normal;line-height:1.25;height:auto;box-shadow:inset 0 1px 0 rgba(255,255,255,.35),inset 0 -2px 0 rgba(0,0,0,.18),0 2px 4px rgba(0,0,0,.45)!important}
    .fi-main:hover{filter:brightness(1.08)}
    .fi-main:active{transform:translateY(1px);box-shadow:inset 0 2px 4px rgba(0,0,0,.35)!important}
    .fi-confirm{margin-top:6px;padding:7px 8px;border:1px solid var(--amber);border-radius:7px;background:color-mix(in srgb,var(--amber) 13%,var(--card));box-shadow:0 8px 22px rgba(0,0,0,.45)}
    .fi-confirm p{margin:0 0 6px;font-size:10.5px;line-height:1.35;color:var(--ink)}
    .fi-confirm .fi-checks{display:grid;gap:5px;margin:0 0 8px}
    .fi-confirm .fi-checks label{display:flex;gap:7px;align-items:flex-start;font-size:10.5px;line-height:1.35;color:var(--ink);cursor:pointer}
    .fi-confirm .fi-checks input{margin-top:2px;flex:none}
    .fi-confirm-btns{display:grid;grid-template-columns:1fr 1fr;gap:5px}
    .fi-confirm .fi-yes:disabled{opacity:.45;cursor:not-allowed}
    .fi-confirm .fi-yes{border:1px solid var(--amber-edge,#6e6e6e)!important;background:linear-gradient(180deg,var(--amber-hi),var(--amber))!important;color:var(--ui-on-accent,#111)!important;border-radius:6px!important;font:700 10px 'Space Grotesk',sans-serif!important;padding:4px 6px!important;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 2px 3px rgba(0,0,0,.4)!important}
    .fi-confirm .fi-yes:hover{filter:brightness(1.08)}
    .fi-confirm .fi-no{color:var(--ink)!important;border-radius:6px!important;font:10px 'Space Grotesk',sans-serif!important;padding:4px 6px!important;cursor:pointer}
    .fi-confirm .fi-no:hover{filter:brightness(1.1)}
    .fi-subrow{display:grid;grid-template-columns:1fr;gap:4px;margin-top:5px}
    .fi-subrow button,.fi-recov-grid button{color:var(--ink)!important;border-radius:6px!important;font:10px 'Space Grotesk',sans-serif!important;padding:4px 7px;min-height:0;cursor:pointer;min-width:0;white-space:normal;overflow:visible;text-overflow:clip;text-align:center;line-height:1.25;height:auto}
    .fi-subrow button:hover,.fi-recov-grid button:hover{filter:brightness(1.1)}
    .fi-progress{margin-top:10px;display:none}.fi-progress[active]{display:block}
    .fi-progress-track{height:3px;overflow:hidden;background:var(--line);border-radius:2px}
    .fi-progress-track::after{content:'';display:block;width:42%;height:100%;background:linear-gradient(90deg,transparent,var(--amber),transparent);animation:fiSweep 1.05s linear infinite}
    .fi-readout{min-height:16px;max-height:2.6em;margin:5px 0 0!important;color:var(--dim)!important;font:10px/1.3 'Space Mono',monospace!important;
      overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;word-break:break-word}
    .future-install[data-state="ok"] .fi-readout{color:var(--green)!important}
    .future-install[data-state="error"] .fi-readout{color:var(--ui-warn,var(--ink))!important}
    .fi-links{display:flex;justify-content:space-between;gap:9px;margin-top:6px;font:10px 'Space Mono',monospace;color:var(--faint)}
    .fi-links a{color:var(--amber-ink, var(--amber))!important}
    .fi-recovery{border-top:1px solid var(--line);background:rgba(0,0,0,.14)}
    .fi-recovery summary{padding:7px 12px;cursor:pointer;color:var(--ink);font:600 10.5px 'Space Grotesk',sans-serif;letter-spacing:.03em}
    .fi-recovery ol{margin:0;padding:0 18px 13px 29px;color:var(--dim);font-size:10.5px;line-height:1.5}
    .fi-recovery b{color:var(--ink)}
    .fi-recov-grid{display:grid;grid-template-columns:1fr;gap:6px;padding:10px 14px 4px}
    .fi-recov-grid button{text-align:center}
    .fi-before{margin:7px 0 0!important;color:var(--dim)!important;font:10.5px/1.4 'Space Grotesk',sans-serif!important}
    .fi-triage{padding:4px 14px 12px;color:var(--dim);font-size:10.5px;line-height:1.5}
    .fi-triage h3{margin:8px 0 4px;color:var(--ink);font:600 11px 'Space Grotesk',sans-serif}
    .fi-triage .fi-verdict{margin:6px 0;padding:8px 9px;border:1px solid var(--line);border-radius:7px;background:var(--well);color:var(--ink);white-space:pre-line}
    .fi-triage .fi-verdict:empty{display:none}
    .fi-triage ol{padding-left:17px!important;margin:4px 0!important}
    .fi-triage a{color:var(--amber-ink, var(--amber))!important}
    .fi-triage button{color:var(--ink)!important;border-radius:6px!important;font:10px 'Space Grotesk',sans-serif!important;padding:3px 7px;cursor:pointer}
    .fi-triage button:hover,.fi-triage button:focus-visible{filter:brightness(1.1)}
    .future-install button:focus-visible,.future-install summary:focus-visible,.future-install a:focus-visible{outline:2px solid var(--amber);outline-offset:2px}
    .future-install button:disabled{opacity:.55;cursor:default}
    .fi-recov-grid button[hidden]{display:none}
    .fi-subrow.fi-one{grid-template-columns:1fr}
    .fi-adv{margin:4px 14px 12px;border:1px solid var(--line);border-radius:8px;background:var(--well)}
    .fi-adv summary{padding:9px 10px;cursor:pointer;color:var(--ink);font:600 11px 'Space Grotesk',sans-serif}
    .fi-adv-body{padding:0 10px 10px;color:var(--dim);font-size:10.5px;line-height:1.5}
    .fi-adv-body p{margin:6px 0}
    .fi-adv-body b{color:var(--ink)}
    .fi-adv-body a{color:var(--amber-ink, var(--amber))!important}
    .fi-adv-body button{color:var(--ink)!important;border-radius:6px!important;font:10px 'Space Grotesk',sans-serif!important;padding:3px 7px;cursor:pointer;max-width:100%;overflow-wrap:anywhere}
    .fi-adv-body button:hover,.fi-adv-body button:focus-visible{filter:brightness(1.1)}
    .fi-adv-body button[hidden]{display:none}
    @keyframes fiSweep{to{transform:translateX(255%)}}@keyframes fiPulse{50%{opacity:.35;transform:scale(.7)}}
    @media(prefers-reduced-motion:reduce){.future-install *{animation:none!important}}
  `;
  document.head.appendChild(style);
  const box = document.createElement("section");
  box.className = "box install-box future-install";
  box.innerHTML = `
    <div class="fi-head"><div class="fi-eye"><i></i> FM-1 FIRMWARE</div><h2>Install firmware</h2><p class="fi-pitch">Install a firmware on your FM-1 over USB, and get help if an install stops.</p></div>
    <div class="fi-core"><div class="fi-scope"><span class="fi-orb" id="inst-orb"></span><span class="fi-connwrap"><b id="inst-state">NOT CHECKED</b><span id="inst-conn">Press Check to look for it</span></span><button type="button" id="inst-conn-more" aria-expanded="false" aria-controls="inst-conn-help" aria-label="More about this connection state" title="More about this" hidden>?</button><button type="button" id="inst-scan" aria-label="Check the FM-1 connection" style="margin-left:auto;align-self:center;background:var(--well);border:1px solid var(--line);color:var(--ink);border-radius:6px;font:9.5px 'Space Mono',monospace;letter-spacing:.08em;padding:2px 8px;cursor:pointer">CHECK</button></div>
    <p class="fi-connhelp" id="inst-conn-help" role="note" hidden></p>
    <div class="fi-field"><label>Firmware <select id="inst-fw" aria-label="Firmware to install"></select></label></div>
    <input type="file" id="inst-file" accept=".fwsc" hidden>
    <button type="button" id="inst-flash" class="primary fi-main">Install selected firmware</button>
    <p class="fi-before">USB <b>data</b> cable. Leave it on until it restarts.</p>
    <div class="fi-subrow"><button type="button" id="inst-resume">Finish interrupted install</button><button type="button" id="inst-rollback-top" hidden>Roll back</button></div>
    <div class="fi-progress" id="inst-prog" aria-hidden="true"><div class="fi-progress-track"></div></div>
    <p id="inst-status" class="fi-readout" role="status" aria-live="polite">Pick a firmware, connect the FM-1, then press Install.</p>
    <div class="fi-file"><button type="button" id="inst-upload-link" title="Install a .fwsc firmware file from this computer instead of one from the list">Choose .fwsc…</button><span class="fi-fname" id="inst-file-name">or pick one from the list</span></div></div>
    <details id="inst-recovery" class="fi-recovery">
      <summary>Recovery and help</summary>
      <div class="fi-recov-grid">
        <button type="button" id="inst-rescan">Check connection again</button>
        <button type="button" id="inst-resume2">Finish interrupted install</button>
        <button type="button" id="inst-rollback" hidden>Roll back to previous firmware</button>
        <button type="button" id="inst-copy">Copy troubleshooting info</button>
      </div>
      <ol>
        <li><b>No flash backup is made.</b> This app cannot read the FM-1. Before any first install, open <b>Advanced recovery</b> and back up the whole flash if you may want today’s firmware or on-device songs.</li>
        <li><b>You flash at your own risk.</b> A write can brick the unit. The author of this app is not responsible for a bricked or damaged FM-1 or lost songs.</li>
        <li><b>Install stopped?</b> Do not switch the FM-1 off. Reconnect and press <b>Check connection again</b>. If it shows update mode, press <b>Finish interrupted install</b>. The exact package bytes are kept on this computer for Finish / Roll back after a reload.</li>
        <li><b>Roll back</b> rewrites the last firmware this app successfully installed on this computer — not a dump of the chip. If that package is missing, restore from a full flash backup (Advanced recovery).</li>
        <li>Use a direct USB data cable (not charge-only, no hub). Only FM-1 packages are accepted; other models are refused before any write.</li>
      </ol>
      <div class="fi-triage" id="inst-triage">
        <h3>Screen black or not found?</h3>
        <p>A black screen has more than one cause. First find out what the computer can see. This check only looks; it sends nothing to the FM-1.</p>
        <button type="button" id="inst-triage-check">Check what is connected</button>
        <p class="fi-verdict" id="inst-triage-result" role="status" aria-live="polite"></p>
        <details id="inst-triage-steps"><summary>If nothing is found: steps, in order</summary>
          <ol>
            <li>Use a cable known to carry data, plugged straight into the computer. Charge the FM-1.</li>
            <li>Leave it switched on for two minutes, then check again. Felucca-family firmware restarts itself into the chip's download mode after repeated failed starts.</li>
            <li>Felucca-family firmware: switch off, hold <b>OCT−</b> and <b>OCT+</b> while switching on, keep holding about 10 seconds, then check again. The screen may stay black.</li>
            <li>Still nothing? Stop here, and do not keep switching it off and on. "Not detected" does not prove the boot area is damaged: a cable, port, battery, Windows driver or a firmware-specific start state can look the same. Installing again cannot reach a unit the computer does not see. What other owners have done next is in <b>Advanced recovery</b> below.</li>
          </ol>
        </details>
      </div>
      <details id="inst-advanced" class="fi-adv">
        <summary>Advanced recovery (external tools, optional)</summary>
        <div class="fi-adv-body">
          <p><b>What this app can do:</b> check the connection, install a checked FM-1 package over USB-MIDI, and finish an install that stopped while the FM-1 waits in update mode.</p>
          <p><b>What it cannot do:</b> read or back up the FM-1's flash, or reach the chip's download mode. In download mode Windows shows a USB disk called “WL82 UBOOT1.00”; that is not a MIDI device, so this app (and any browser MIDI page) cannot use it.</p>
          <p><b>Download mode or a full backup:</b> the desktop app can open a bundled <b>flash recovery tool</b> in its own window (Windows). This app does not control that window. Back up the whole flash first; if Windows offers to format a disk, press Cancel.</p>
          <p><button type="button" id="inst-device-lab">Open flash recovery tool</button></p>
          <p><b>No USB device at all, after the steps above:</b> some owners use a small RP2040 board wired to the FM-1’s USB data lines to force the chip’s download mode. That path is unofficial, needs wiring, and is at your own risk; it does not repair a damaged boot area.</p>
        </div>
      </details>
    </details>`;
  side.appendChild(box);
  for (const b of box.querySelectorAll(".fi-subrow button,.fi-recov-grid button")) if (!b.title) b.title = b.textContent.trim();

  const sel = box.querySelector("#inst-fw");
  for (const f of cat.firmwares) sel.add(new Option(`${f.name} ${f.version || ""}`.trim(), f.id));
  const cur = params.get("fw"); if (cur && cat.firmwares.some(f => f.id === cur)) sel.value = cur;

  // One-way follow: when the left bar / gallery / emulator picks a firmware to play, mirror it
  // here so Install is ready without re-searching. Changing #inst-fw by hand never pushes back
  // to the left — working only on this panel leaves the emulator selection alone.
  let followQuiet = false;
  function resolveFollowId(id) {
    if (!id || id === "local") return "";
    const has = (v) => [...sel.options].some((o) => o.value === v);
    if (has(id)) return id;
    // Catalogs can disagree on ids; fall back to a tight name / id match (no fuzzy substring).
    const norm = (s) => String(s || "").toLowerCase().replace(/[\s_-]+/g, "");
    const want = norm(id);
    const hit = cat.firmwares.find((f) => norm(f.id) === want || norm(f.name) === want);
    return hit && has(hit.id) ? hit.id : "";
  }
  function followEmulator(id) {
    if (busy) return false;
    const next = resolveFollowId(id);
    if (!next || sel.value === next) return !!next;
    followQuiet = true;
    sel.value = next;
    followQuiet = false;
    if (uploaded) { uploaded = null; file.value = ""; showFile(); }
    return true;
  }
  window.FM1Install = { followEmulator, selected: () => sel.value };

  const statusEl = box.querySelector("#inst-status");
  const prog = box.querySelector("#inst-prog");
  const flashBtn = box.querySelector("#inst-flash");
  const resumeBtn = box.querySelector("#inst-resume");
  const file = box.querySelector("#inst-file");
  let uploaded = null; // {bytes, name}
  let busy = false;

  const status = (m) => { statusEl.textContent = m; box.dataset.state = m.startsWith("✓") ? "ok" : (m.startsWith("✗") ? "error" : ""); };

  // In-place confirm under Install. Optional safety checkboxes must all be ticked before Yes enables.
  // Returns true | false | "alt".
  function askConfirm(message, yesLabel, altLabel, checks = []) {
    return new Promise((resolve) => {
      box.querySelector(".fi-confirm")?.remove();
      const c = document.createElement("div");
      c.className = "fi-confirm";
      c.innerHTML = `<p></p><div class="fi-checks"></div><div class="fi-confirm-btns"><button type="button" class="fi-yes"></button><button type="button" class="fi-no">Cancel</button></div>`;
      c.querySelector("p").textContent = message;
      const yes = c.querySelector(".fi-yes");
      yes.textContent = yesLabel || "Install";
      const checksEl = c.querySelector(".fi-checks");
      const boxes = [];
      for (const text of checks) {
        const lab = document.createElement("label");
        const inp = document.createElement("input");
        inp.type = "checkbox";
        lab.append(inp, document.createTextNode(text));
        checksEl.appendChild(lab);
        boxes.push(inp);
      }
      const syncYes = () => { yes.disabled = boxes.some((b) => !b.checked); };
      for (const b of boxes) b.addEventListener("change", syncYes);
      syncYes();
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
      yes.onclick = () => { if (!yes.disabled) done(true); };
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
  let midiAccess = null, scanning = false, connTimer = null, lastSeen = null, lastUsb = null;
  let confirmedName = null, confirmedId = null;   // the FM-1 a SCAN confirmed; the indicator holds while it stays plugged in
  // state: "ok" (green, connected), "update" (blue, in update/download loader), "warn" (amber,
  // not connected / problem), "checking" (neutral). label is the one-word verdict; detail explains.
  const connMore = box.querySelector("#inst-conn-more");
  const connHelp = box.querySelector("#inst-conn-help");
  connMore.onclick = () => { const open = connHelp.hidden; connHelp.hidden = !open; connMore.setAttribute("aria-expanded", String(open)); };
  // label: one word or two; detail: a short line (full text in its tooltip); more: the longer
  // explanation, shown under the indicator with the ? button
  const setConn = (label, detail, state, more) => {
    stateEl.textContent = label;
    connEl.textContent = detail || "";
    connEl.title = more ? `${detail}. ${more}` : (detail || "");
    connHelp.textContent = more || "";
    connMore.hidden = !more;
    if (!more) { connHelp.hidden = true; connMore.setAttribute("aria-expanded", "false"); }
    // Connection colours stay semantic (real green / amber) even when Customize chrome is monochrome
    // gray — stock --green/--ui-warn are washed to gray on purpose for decoration, not for this orb.
    const col = state === "ok" ? "var(--ui-conn-ok, #3dd68c)"
      : state === "update" ? "var(--amber-hi)"
      : state === "warn" ? "var(--ui-conn-warn, #e8a045)"
      : "var(--dim)";
    stateEl.style.color = col;
    orb.style.background = state === "checking" ? "transparent" : col;
    orb.style.boxShadow = state === "checking" ? "none" : `0 0 9px ${col}`;
    orb.style.borderColor = col;
  };
  async function ensureAccess() {
    if (midiAccess) return midiAccess;
    // Prefer the page's already-open SysEx MIDI access so Check does not fight MIDI in/out.
    if (typeof window.FM1MidiAccess === "function") {
      let shared = window.FM1MidiAccess();
      // Main may still be opening — wait so Check shares one SysEx session (never a parallel access).
      if (typeof window.FM1MidiOpen === "function" && (!shared || shared.sysexEnabled === false)) {
        try { await window.FM1MidiOpen(); } catch { /* fall through */ }
        shared = window.FM1MidiAccess();
      }
      if (shared && shared.sysexEnabled !== false) {
        midiAccess = shared;
        const prev = midiAccess.onstatechange;
        midiAccess.onstatechange = (ev) => {
          try { if (typeof prev === "function") prev(ev); } catch { /* ignore */ }
          clearTimeout(connTimer);
          connTimer = setTimeout(() => updatePresence(), 400);
        };
        return midiAccess;
      }
    }
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
  // device list (no port opened). It STAYS on while the device is connected. A known FM-1-named port
  // is green CONNECTED on sight. After Check confirms identity, that green holds with the product id.
  // An unknown-but-plausible port is amber PLUGGED IN (press Check to confirm).
  function updatePresence() {
    if (!midiAccess || scanning || busy) return;   // don't fight an in-progress scan / flash
    const live = [...midiAccess.inputs.values()].filter((i) => i.state === "connected");
    const names = live.map((i) => i.name);
    if (confirmedName && !names.includes(confirmedName)) { confirmedName = confirmedId = null; }  // it was unplugged
    const named = live.find((i) => isCandidatePort(i.name));
    const plausible = live.find((i) => !isKnownOtherGear(i.name) && !isCandidatePort(i.name));
    if (confirmedName) setConn("CONNECTED", `${confirmedId || confirmedName} · ready`, "ok");
    else if (named) setConn("CONNECTED", `${named.name} · ready`, "ok", `Seen “${named.name}”. Press Check for the firmware identity string.`);
    else if (plausible) setConn("PLUGGED IN", "Press Check to confirm", "update", `Seen: ${plausible.name}. Press Check to confirm it is the FM-1.`);
    else if (live.length === 0) setConn("NOT FOUND", "No USB-MIDI device", "warn", "Use a USB data cable (charge-only cables carry no data) straight into the computer, and switch the FM-1 on. Screen black? Open Recovery and help, then Screen black or not found?");
    else setConn("NOT FOUND", "Only other MIDI gear", "warn", `Seen: ${names.join(", ")}. Connect the FM-1 with a USB data cable.`);
  }
  async function refreshConn() {
    if (scanning || busy) return;              // never scan while a flash is in progress
    scanning = true;
    setConn("CHECKING…", "Reading USB-MIDI…", "checking");
    try {
      await ensureAccess();
      const r = await new Updater(midiAccess).detect();
      // remember a confirmed FM-1 so the live indicator can HOLD "CONNECTED" while it stays plugged in
      if (r.found && !r.inUpdateMode) { confirmedName = r.name; confirmedId = r.id; } else { confirmedName = confirmedId = null; }
      lastSeen = r;
      if (r.found && r.inUpdateMode) setConn("UPDATE MODE", "Keep it on · press Finish", "update", `${r.id} is waiting in update mode. Do not switch it off; press Finish interrupted install with the same firmware.`);
      else if (r.found) setConn("CONNECTED", `${r.id} · ready`, "ok", `On “${r.name}”. Ready to install.`);
      else if (r.code === "nomidi") setConn("NOT FOUND", "No USB-MIDI device", "warn", "Use a USB data cable (charge-only cables carry no data) straight into the computer, and switch the FM-1 on. Screen black? Open Recovery and help, then Screen black or not found?");
      else if (r.code === "noport") setConn("NOT FOUND", "FM-1 not among MIDI devices", "warn", `Seen: ${r.ports.join(", ")}. Use a USB data cable straight into the computer, or try another port.`);
      else if (r.code === "busy") setConn("PORT BUSY", "Another app is using it", "warn", "Close DAWs and MIDI tools (and other copies of this app), then press Check again.");
      else setConn("NO ANSWER", "Nothing answered as an FM-1", "warn", `Ports checked: ${r.ports.join(", ") || "none"}. Open Recovery and help, then Screen black or not found?`);
    } catch (e) {
      const code = (e && e.code) || "error";
      setConn(code === "midiperm" ? "ACCESS DENIED" : "CHECK FAILED", code === "midiperm" ? "MIDI access was not allowed" : "The check did not finish", "warn", (e && e.message) || String(e));
    } finally { scanning = false; }
  }
  scanBtn.onclick = () => { refreshConn(); };

  // Desktop-only: flash recovery tool reaches the chip's ROM download mode (USB disk, not MIDI).
  // It lives only in Advanced recovery and opens only from its one button: no failure, check
  // or reconnect launches it.
  const deviceLab = box.querySelector("#inst-device-lab");
  const advancedEl = box.querySelector("#inst-advanced");
  if (!window.FM1Desktop && deviceLab) { deviceLab.hidden = true; }
  const DL_STEPS = "In the recovery tool window: if the FM-1 is running, use DOWNLOAD MODE; with Felucca, SLOOP or Snoop37 running, hold OCT− and OCT+ for 5 s. If Windows offers to format a disk, press Cancel. Back up the whole flash before writing anything.";
  async function launchMFlasher(lead) {
    if (!window.FM1Desktop) return false;
    flog.add("recovery");
    status(lead || "Opening flash recovery tool… approve Windows if it asks.");
    try {
      const result = await window.FM1Desktop.openFlasher();
      if (result.ok) { status(`Flash recovery tool is open. ${DL_STEPS}`); return true; }
      if (result.download) { status("Flash recovery tool isn’t available. Reinstall the desktop app, or use Advanced recovery notes."); return false; }
      status(`✗ ${result.message}`); return false;
    } catch (error) { status(`✗ Could not open flash recovery tool: ${error.message || error}`); return false; }
  }
  if (window.FM1Desktop && deviceLab) {
    deviceLab.onclick = async () => { if (busy) return; deviceLab.disabled = true; try { await launchMFlasher("Opening flash recovery tool… approve Windows if it asks."); } finally { deviceLab.disabled = false; } };
  }
  // the persisted install journal: where an install stopped, survives reloads and crashes
  const journal = new FlashJournal(localStorage);
  const flog = new FlashLog(localStorage);
  const vault = createPackageVault();
  let lastStep = null;
  const JOURNAL_PHASE = { stage: "staging", loader: "loader", write: "writing", reboot: "rebooting", done: "done" };
  const onStep = (phase, n) => {
    prog.setAttribute("active", "");
    const jp = JOURNAL_PHASE[phase];
    if (jp && journal.read()?.phase !== jp) { try { journal.advance(jp); } catch {} }
    if (phase !== lastStep && ["start", "stage", "loader", "write", "reboot"].includes(phase)) { lastStep = phase; flog.add(phase); }
    if (phase === "stage") status(`Step 1 of 3: preparing the FM-1… (${n})`);
    else if (phase === "write") status(`Step 2 of 3: writing the firmware… (${n}) — do not unplug or switch off`);
    else if (phase === "loader") status("Step 2 of 3: waiting for the FM-1 to restart in update mode…");
    else if (phase === "reboot") status("Step 3 of 3: written. Waiting for the FM-1 to restart…");
    else if (phase === "start") status(`Starting the install on ${n}…`);
  };
  const rollbackBtn = box.querySelector("#inst-rollback");
  const rollbackTop = box.querySelector("#inst-rollback-top");
  const recoveryEl = box.querySelector("#inst-recovery");
  const resume2Btn = box.querySelector("#inst-resume2");
  function showPending() {
    const p = pendingRecovery(journal.read());
    const showRb = !!(p && p.rollback);
    rollbackBtn.hidden = !showRb;
    if (rollbackTop) rollbackTop.hidden = !showRb;
    if (p?.rollback) {
      const label = `Roll back to ${p.rollback.name}`;
      rollbackBtn.textContent = rollbackBtn.title = label;
      if (rollbackTop) { rollbackTop.textContent = label; rollbackTop.title = label; }
    }
    // badreq limit: Finish must stay disabled (not only titled) so a second click cannot retry.
    const blockFinish = !!p?.badreqBlocked;
    if (!busy) {
      resumeBtn.disabled = blockFinish;
      if (resume2Btn) resume2Btn.disabled = blockFinish;
    }
    if (blockFinish) {
      resumeBtn.title = `Blocked after ${BADREQ_LIMIT} bad-request failures — use Roll back or Advanced recovery`;
      if (resume2Btn) resume2Btn.title = resumeBtn.title;
    } else {
      resumeBtn.title = "Finish the interrupted install with the same package";
      if (resume2Btn) resume2Btn.title = resumeBtn.title;
    }
    return p;
  }
  async function rememberPackage(src, pkg) {
    const ok = await vault.put(pkg.sha256, src.bytes, { name: src.name, fwId: src.fwId, product: pkg.product });
    if (!ok) console.warn("flash vault: could not keep package bytes for recovery");
    return ok;
  }
  async function pruneVault() {
    const j = journal.read();
    const keep = [];
    if (j?.sha256) keep.push(j.sha256);
    if (j?.lastGood?.sha256) keep.push(j.lastGood.sha256);
    if (j?.status === "done" && j.sha256) keep.push(j.sha256);
    await vault.prune(keep);
  }
  const failure = (e) => {
    const x = explain(e);
    // Keep the visible line short; the next step lives on hover / title.
    status(`✗ ${x.what}`);
    statusEl.title = [x.next, x.code ? `[${x.code}]` : "", x.detail].filter(Boolean).join(" ");
    return x;
  };

  const fname = box.querySelector("#inst-file-name");
  const showFile = () => {
    fname.textContent = uploaded ? `${uploaded.name}.fwsc` : "or pick one from the list";
    fname.title = uploaded ? `Installs this file, not the list choice: ${uploaded.name}.fwsc` : "";
    fname.classList.toggle("on", !!uploaded);
  };
  box.querySelector("#inst-upload-link").onclick = (e) => { e.preventDefault(); if (!busy) file.click(); };
  file.onchange = async () => {
    const f = file.files[0]; if (!f) return;
    uploaded = { bytes: new Uint8Array(await f.arrayBuffer()), name: f.name.replace(/\.fwsc$/i, "") };
    showFile();
    status(`Loaded ${uploaded.name} — press Install.`);
  };
  // picking from the list goes back to the list (a chosen file is no longer used).
  // followQuiet skips the status chatter when the left bar drove the change.
  sel.addEventListener("change", () => {
    if (followQuiet) return;
    if (uploaded && !busy) { uploaded = null; file.value = ""; showFile(); status("Using the firmware picked in the list."); }
  });
  document.addEventListener("fm1-fw-selected", (e) => {
    const id = e?.detail?.id;
    if (id) followEmulator(id);
  });
  // Catch up if the left bar already chose something before this panel mounted.
  const bootFw = document.getElementById("fw")?.value || window.FM1?.runningFirmware?.()?.id;
  if (bootFw) followEmulator(bootFw);

  async function catalogBytes(fwId) {
    const f = cat.firmwares.find(x => x.id === fwId);
    if (!f?.package) { const e = new Error("pick a firmware package"); e.code = "badpackage"; throw e; }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30000);
    let r;
    try { r = await fetch(f.package, { signal: ctl.signal, cache: "no-store" }); }
    catch { r = null; }
    finally { clearTimeout(timer); }
    if (!r?.ok) { const e = new Error(`package: ${r ? `HTTP ${r.status}` : "not reachable"}`); e.code = "checksum"; throw e; }
    return { bytes: new Uint8Array(await r.arrayBuffer()), name: `${f.name} ${f.version || ""}`.trim(), fwId: f.id, expected: { sha256: f.sha256, product: f.product } };
  }
  async function sourceBytes() {
    if (uploaded) return { ...uploaded, fwId: null, expected: {} };
    return catalogBytes(sel.value);
  }
  // the package an interrupted install was writing (or the last good one, for a rollback).
  // Prefer the local vault (survives reload / offline), then catalog, then a still-selected upload.
  async function journalBytes(entry) {
    if (entry?.sha256) {
      const hit = await vault.get(entry.sha256);
      if (hit?.bytes?.length) {
        return {
          bytes: hit.bytes,
          name: hit.meta?.name || entry.name || "saved package",
          fwId: hit.meta?.fwId || entry.fwId || null,
          expected: { sha256: entry.sha256, product: entry.product || hit.meta?.product || undefined },
        };
      }
    }
    if (entry.fwId) {
      try { return await catalogBytes(entry.fwId); }
      catch (e) {
        if (e && e.code === "checksum") throw e;
      }
    }
    if (uploaded) return { ...uploaded, fwId: null, expected: { sha256: entry.sha256 } };
    const e = new Error(`No copy of “${entry.name || "that firmware"}” is kept on this computer.`);
    e.code = "vaultmissing";
    throw e;
  }

  // mode: "deploy" (a fresh install), "resume" (finish an interrupted one with the same package),
  // "rollback" (write the last good firmware through the waiting update loader)
  async function doFlash(mode) {
    if (busy) return;
    if (!navigator.requestMIDIAccess) { failure(Object.assign(new Error(""), { code: "midiaccess" })); return; }
    busy = true;
    lastStep = null;
    flashBtn.disabled = true;
    resumeBtn.disabled = true;
    if (resume2Btn) resume2Btn.disabled = true;
    rollbackBtn.disabled = true;
    if (rollbackTop) rollbackTop.disabled = true;
    box.setAttribute("aria-busy", "true");
    if (deviceLab) deviceLab.disabled = true;
    let started = false;
    try {
      const pending = pendingRecovery(journal.read());
      if (mode === "resume" && pending?.badreqBlocked) {
        throw Object.assign(new Error(""), { code: "badreqlimit" });
      }
      if (mode === "rollback" && !pending?.rollback) {
        throw Object.assign(new Error(""), { code: "norollback" });
      }
      let src;
      if (mode === "rollback") {
        src = await journalBytes(pending.rollback);
      } else if (mode === "resume" && pending?.kind === "restart") {
        status(`${pending.journal.name} was already written. Power-cycle the FM-1, then press Check.`);
        return;
      } else if (mode === "resume" && pending && (pending.kind === "resume" || pending.kind === "retry")) {
        // Always reload the package recorded in the journal — never a different list pick.
        src = await journalBytes(pending.journal);
      } else {
        src = await sourceBytes();
      }
      status("Checking the package…");
      flog.add("check", { mode: mode === "deploy" ? "install" : mode });
      const pkg = await validatePackage(src.bytes, src.expected);
      if (mode === "resume" && pending?.journal?.sha256 && pending.journal.sha256 !== pkg.sha256) {
        throw Object.assign(new Error(""), { code: "sourcemismatch" });
      }
      if (mode === "rollback" && pending?.rollback?.sha256 && pending.rollback.sha256 !== pkg.sha256) {
        throw Object.assign(new Error(""), { code: "sourcemismatch" });
      }
      // Keep bytes before any write so Finish / Roll back survive a crash or reload.
      await rememberPackage(src, pkg);

      status("Looking for the FM-1…");
      const access = await ensureAccess();   // shared with the Scan/connection system; coded errors
      const up = new Updater(access, (m) => status(m));
      const seen = await up.detect();
      if (!seen.found) throw Object.assign(new Error((seen.diag || []).join("; ")), { code: seen.code });
      if (mode === "deploy" && seen.inUpdateMode) throw Object.assign(new Error(seen.id), { code: "inupdate" });
      // A "retry" (failed before the loader) can run while the unit is still on its old firmware.
      if (mode === "resume" && pending?.kind === "resume" && !seen.inUpdateMode) {
        status(`The FM-1 is running ${seen.id}, not waiting in update mode.`);
        const clear = await askConfirm(
          `${seen.id} is running normally — nothing to finish. Clear the leftover install record?`,
          "Clear record",
          "Keep record",
        );
        if (clear === true) {
          journal.clear();
          await pruneVault();
          status(`Cleared. The FM-1 is running ${seen.id}. Use Install only if you still want a different firmware.`);
          showPending();
        } else {
          status("Kept the interrupted-install record. Reconnect in update mode to Finish or Roll back.");
        }
        return;
      }
      if (mode === "rollback" && !seen.inUpdateMode) {
        status(`The FM-1 is running ${seen.id}, not waiting in update mode, so there is nothing to roll back. Use Install if you want a different firmware.`);
        return;
      }
      if ((mode === "deploy" || (mode === "resume" && pending?.kind === "retry")) && seen.model !== pkg.product.split("_")[0]) {
        throw Object.assign(new Error(seen.id), { code: "model" });
      }

      const jNow = journal.read();
      const lastGoodSha = (jNow?.status === "done" ? jNow.sha256 : jNow?.lastGood?.sha256) || null;
      const hasVaultLastGood = !!(lastGoodSha && await vault.has(lastGoodSha));
      const flags = writeSafetyFlags(jNow, { hasVaultLastGood, journalUnsaved: !!journal.unsaved });
      if (flags.journalUnsaved) {
        const cont = await askConfirm(
          "Install journal won’t save here. Keep this window open until it finishes, or use the desktop app.",
          "Continue anyway",
        );
        if (!cont) { flog.add("cancel"); status("Cancelled. Nothing was written."); return; }
      }

      const verb = mode === "deploy" || pending?.kind === "retry" ? "Install" : mode === "resume" ? "Finish" : "Roll back";
      const staleNote = pending?.stale ? ` Interrupted ${Math.max(1, Math.round(journalAgeMs(pending.journal) / 3600000))} h ago — only if it stayed powered.` : "";
      let riskNote = " No flash backup · your risk.";
      if ((mode === "deploy" || pending?.kind === "retry") && !flags.hasRollbackTarget) {
        riskNote += " No in-app rollback yet.";
      } else if ((mode === "deploy" || pending?.kind === "retry") && !flags.rollbackReady) {
        riskNote += " Prior package missing for rollback.";
      }
      const yesLabel = mode === "deploy" || pending?.kind === "retry" ? "Install" : mode === "resume" ? "Finish" : "Roll back";
      // Short confirm. Fail-safes (journal / vault / package checks) stay.
      const answer = await askConfirm(
        `${verb} ${src.name} → ${seen.id}? Leave USB connected until it restarts.${staleNote} ${riskNote}`,
        yesLabel,
      );
      if (!answer) { flog.add("cancel"); status("Cancelled. Nothing was written."); return; }

      // "retry" = failed before the loader wrote anything → a fresh install, not a loader resume.
      const throughLoader = mode === "rollback" || (mode === "resume" && pending?.kind === "resume");
      flog.add("confirm", { product: pkg.product, mode: mode === "deploy" ? "install" : mode });
      journal.begin({ fwId: src.fwId, name: src.name, product: pkg.product, sha256: pkg.sha256, previous: seen.id, resume: throughLoader });
      started = true;
      if (!throughLoader) {
        status(`Installing ${src.name} (${pkg.product}) — keep the FM-1 plugged in and switched on…`);
        await up.install(pkg.image, pkg.product, onStep);
      } else {
        const id = await up.resume(pkg.image, pkg.product, onStep);
        if (!id) throw Object.assign(new Error("the update loader went away"), { code: "lost" });
      }
      try { journal.advance("done"); } catch {}
      await rememberPackage(src, pkg);
      await pruneVault();
      flog.add("done", { product: pkg.product });
      status(`✓ Installed ${src.name}. The FM-1 restarted and reports ${pkg.product}. Package kept on this computer for future Roll back.`);
      statusEl.title = "";
    } catch (e) {
      if (started) {
        if (e && e.code === "badreq") journal.bumpBadreq();
        else journal.fail(e && e.code);
      }
      const { code } = failure(e);
      flog.add("fail", { code, mode: mode === "deploy" ? "install" : mode });
      const UNREACHABLE = ["downloadmode", "notfound", "noport", "nomidi", "badreqlimit", "vaultmissing", "norollback"];
      if (UNREACHABLE.includes(code) || pendingRecovery(journal.read())) recoveryEl.open = true;
      if ((code === "downloadmode" || code === "vaultmissing" || code === "norollback" || code === "badreqlimit") && advancedEl) advancedEl.open = true;
    } finally {
      busy = false;
      flashBtn.disabled = false;
      resumeBtn.disabled = false;
      if (resume2Btn) resume2Btn.disabled = false;
      rollbackBtn.disabled = false;
      if (rollbackTop) rollbackTop.disabled = false;
      box.removeAttribute("aria-busy");
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
  if (rollbackTop) rollbackTop.onclick = () => doFlash("rollback");

  // Recovery grid: this app's own actions only (check, finish, roll back, copy info). External
  // tools are described, and offered by name, in Advanced recovery.
  const rescanBtn = box.querySelector("#inst-rescan");
  if (rescanBtn) rescanBtn.onclick = () => refreshConn();
  if (resume2Btn) resume2Btn.onclick = () => doFlash("resume");

  // Screen black or not found: find out what the computer sees, then give one next step. Looks
  // only: the USB-MIDI identity query (which every check already sends) and, on the desktop app,
  // Windows' list of USB devices. Nothing is written and nothing is retried.
  const triageBtn = box.querySelector("#inst-triage-check");
  const triageOut = box.querySelector("#inst-triage-result");
  function usbSummary(u) {
    if (!u) return null;
    if (!u.ok) return u.unsupported ? "not available on this system" : "Windows did not answer";
    if (!u.devices.length) return "no JieLi USB device";
    // the normal-firmware USB id is not independently confirmed (sources disagree), so say so
    const label = (m) => m === "running" ? "normal mode? (id not confirmed)" : m === "other" ? "unknown mode" : m;
    return u.devices.map((d) => `${d.id} ${label(d.mode)}${d.status && d.status !== "OK" ? ` (${d.status})` : ""}`).join(", ");
  }
  function triageVerdict(seen, usb) {
    const has = (m) => !!usb?.ok && usb.devices.some((d) => d.mode === m);
    const jieli = !!usb?.ok && usb.devices.length > 0;
    if (seen?.found && seen.inUpdateMode) return "Found, waiting in update mode.\nAn install did not finish. Press Finish interrupted install with the same firmware, or Roll back. Do not switch the FM-1 off first.";
    if (seen?.found) return `Found and answering: ${seen.id}.\nIts firmware starts and answers over USB, so a black screen here is most likely a firmware or display problem. Next: install a firmware you know works (for example the official one) with Install.`;
    if (seen?.code === "busy") return "Found, but another app is using its MIDI port.\nClose DAWs and MIDI tools, then check again.";
    if (has("download")) return "Detected in the chip's download mode (Windows shows a disk called “WL82 UBOOT1.00”).\nThis app cannot install in this mode. If Windows offers to format the disk, press Cancel. A separate tool can work with it: see Advanced recovery below.";
    if (has("update")) return "Detected as the update loader, but it did not answer over MIDI.\nClose other MIDI apps, replug the cable, and check again. Do not switch it off.";
    if (jieli) return `A JieLi USB device is present (${usbSummary(usb)}) but did not answer as an FM-1.\nClose other MIDI apps, replug the cable and check again. If it stays like this, see Advanced recovery below.`;
    if (usb && !usb.ok) return "Not found over USB-MIDI. The Windows USB check is not available here.\nIf Windows shows a disk called “WL82 UBOOT1.00”, the FM-1 is in download mode: see Advanced recovery below. Otherwise follow the steps below.";
    if (!usb) return "Not found over USB-MIDI.\nIf the computer shows a disk called “WL82 UBOOT1.00”, the FM-1 is in download mode: see Advanced recovery below. Otherwise follow the steps below.";
    return "Not detected: no FM-1 on USB-MIDI and no JieLi USB device.\nThis alone does not mean the FM-1 is broken. Follow the steps below, checking again after each one. If nothing ever appears, stop: installing again cannot reach it.";
  }
  if (triageBtn) triageBtn.onclick = async () => {
    if (busy || scanning) { triageOut.textContent = "An install or check is running. Wait for it to finish."; return; }
    triageBtn.disabled = true;
    triageOut.textContent = "Checking…";
    let seen = null, usb = null;
    try {
      try { await ensureAccess(); seen = await new Updater(midiAccess).detect(); }
      catch (e) { seen = { found: false, code: (e && e.code) || "error" }; }
      lastSeen = seen;
      if (window.FM1Desktop?.usbCheck) { try { usb = await window.FM1Desktop.usbCheck(); } catch { usb = { ok: false, devices: [] }; } }
      lastUsb = usb;
      triageOut.textContent = triageVerdict(seen, usb);
      if (advancedEl && usb?.ok && usb.devices.some((d) => d.mode === "download")) advancedEl.open = true;
      const quiet = !seen?.found && !(usb?.ok && usb.devices.length);
      box.querySelector("#inst-triage-steps").open = quiet;
      flog.add("usb-check", { code: seen?.found ? (seen.inUpdateMode ? "update" : "running") : (usb?.ok && usb.devices.some((d) => d.mode === "download") ? "download" : (quiet ? "none" : "other")) });
    } finally { triageBtn.disabled = false; }
  };
  const copyBtn = box.querySelector("#inst-copy");
  if (copyBtn) copyBtn.onclick = async () => {
    const text = troubleshootingText({ journal: journal.read(), log: flog.read(), seen: lastSeen, usb: lastUsb ? { summary: usbSummary(lastUsb) } : null, app: window.FM1Desktop ? "FM-1 Emulator desktop" : "FM-1 Emulator web" });
    flog.add("copy-info");
    try { await navigator.clipboard.writeText(text); status("Troubleshooting info copied. It has no file paths or serial numbers."); }
    catch { status("Could not copy automatically. The info is in the box below; select it and copy."); const pre = document.createElement("textarea"); pre.readOnly = true; pre.value = text; pre.rows = 8; pre.style.width = "100%"; triageOut.after(pre); pre.select(); }
  };

  // an install that did not finish last time (window closed, crash, cable pulled): say so on open.
  // Recovery stays collapsed — open it only when the user expands it (or a live install fails).
  recoveryEl.open = false;
  {
    const p = showPending();
    if (p) {
      const j = p.journal;
      const age = p.stale ? ` This record is ${Math.max(1, Math.round(journalAgeMs(j) / 3600000))} h old.` : "";
      if (p.badreqBlocked) status(`Finish is blocked for ${j.name} after ${BADREQ_LIMIT} bad-request failures. Use Roll back${p.rollback ? ` to ${p.rollback.name}` : ""} or Advanced recovery. Keep the FM-1 powered.${age}`);
      else if (p.kind === "retry") status(`An install of ${j.name} stopped before the firmware was written. Press Finish interrupted install (or Install) to try again.${age}`);
      else if (p.kind === "restart") status(`${j.name} was written but the FM-1 had not restarted yet. Switch it off and on, then press Check.${age}`);
      else status(`An install of ${j.name} did not finish. Keep the FM-1 switched on, reconnect it, and press Finish interrupted install${p.rollback ? `, or roll back to ${p.rollback.name}` : ""}. If its screen is black and nothing is found, see Screen black or not found?${age}`);
    }
  }

  // Desktop app (MIDI auto-granted): read the device list once on open and keep the indicator live via
  // statechange — LIST ONLY, no port opened, so it never glitches the device. Also poll: WinRT MIDI
  // sometimes skips statechange when a unit appears. Handshake stays on Check only. Web waits for Check
  // so we don't prompt for MIDI permission on load.
  if (window.FM1Desktop) {
    ensureAccess()
      .then(() => { updatePresence(); setInterval(() => { if (!scanning && !busy) updatePresence(); }, 1500); })
      .catch((e) => {
        const code = (e && e.code) || "error";
        setConn(code === "midiperm" ? "ACCESS DENIED" : "MIDI FAILED", code === "midiperm" ? "MIDI access was not allowed" : "Could not open USB-MIDI", "warn", (e && e.message) || String(e));
      });
  }
}
