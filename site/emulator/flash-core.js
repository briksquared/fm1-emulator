// Flashing a real FM-1: the checks before a write, the journal that survives an interrupted
// one, and the words shown for each failure. No DOM here, so ci/flash-tests.mjs runs it in Node.
import { productOf, logicalImage } from "./fm1pkg.js";

// A .fwsc is 20 marker blocks plus the image. The bundled ones are 0.5 to 1.1 MB; anything
// far outside that is not a firmware for this unit.
export const PACKAGE_MIN = 20 * 0x30 + 1024;
export const PACKAGE_MAX = 4 * 1024 * 1024;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export async function sha256(bytes) {
  return hex(await globalThis.crypto.subtle.digest("SHA-256", bytes));
}

function bad(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// Check a package before anything is sent to the device: size, FM-1 identity, and (when the
// catalog lists one) its SHA-256. Resolves to what the updater needs.
export async function validatePackage(bytes, expected = {}) {
  if (!(bytes instanceof Uint8Array)) throw bad("badpackage", "The firmware file could not be read.");
  if (bytes.length < PACKAGE_MIN) throw bad("badpackage", `This file is too small to be an FM-1 firmware (${bytes.length} bytes).`);
  if (bytes.length > PACKAGE_MAX) throw bad("badpackage", `This file is too large to be an FM-1 firmware (${bytes.length} bytes).`);
  let product;
  try { product = productOf(bytes); } catch (e) { throw bad("badpackage", `This is not an FM-1 firmware package: ${e.message}.`); }
  if (expected.product && expected.product !== product) throw bad("badpackage", `The package identifies as ${product}, the catalog says ${expected.product}.`);
  // Only FM-1 packages — never SMK-37 / other M-VAVE models — may be offered to the updater.
  // Catalog products use 1–10 digits (e.g. FM-1_4747 and FM-1_82012900). Cap keeps non-FM junk out.
  if (!/^FM-1_\d{1,10}$/i.test(product)) throw bad("badpackage", `This package is for ${product}, not an FM-1. Nothing was written.`);
  let layout;
  try { layout = packageLayout(bytes); } catch (e) { throw bad("layout", `This file is not laid out like an FM-1 firmware package: ${e.message}. Nothing was written.`); }
  const hash = await sha256(bytes);
  if (expected.sha256 && expected.sha256.toLowerCase() !== hash) throw bad("checksum", "The downloaded package does not match its published checksum, so it was not written. Download it again.");
  const image = logicalImage(bytes);
  if (!image.length) throw bad("badpackage", "The package has no firmware image.");
  // Image must stay inside the safe flash map even after logical unwrap.
  if (image.length > FLASH.keySector) throw bad("layout", "This package's flash image would reach the unit's chip key sector. Nothing was written.");
  return { product, sha256: hash, image, size: bytes.length, layout };
}

// ---------------------------------------------------------------- flash layout
// What the package's flash image would cover on the unit's 1 MiB flash. The FM-1 (JieLi
// AC791N / WL82) keeps its boot head below 0x4000, the firmware from 0x4000, and the per-unit
// chip key and Bluetooth address in the last sector at 0xFF000. In the USB-MIDI update the unit's
// own update loader decides what it writes; this app only answers its read requests from the
// package. So the app cannot stop a loader from writing a region, but it can refuse a package
// whose layout is not the one every known FM-1 package uses: a readable UFW header with a flash
// image, a boot head that ends by 0x4000, the firmware area at exactly 0x4000, and an image that
// stops before the chip key sector. (Checked against every FM-1 package in the local archive.)
export const FLASH = { size: 0x100000, appStart: 0x4000, keySector: 0xff000 };
function unmask(buf, off, len, key = 0xffff) {
  for (let i = 0; i < len; i++) {
    buf[off + i] ^= key & 0xff;
    key = ((key << 1) ^ (key & 0x8000 ? 0x1021 : 0)) & 0xffff;
  }
}
function crc16(buf, off, len) {
  let crc = 0;
  for (let i = 0; i < len; i++) {
    crc ^= buf[off + i] << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}
const le16 = (b, o) => b[o] | (b[o + 1] << 8);
const le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
export function packageLayout(file) {
  if (file.length < 20 * 0x30 + 0x40) throw new Error("too short");
  const hdr = new Uint8Array(20 * 0x2f);
  for (let i = 0; i < 20; i++) hdr.set(file.subarray(i * 0x30, i * 0x30 + 0x2f), i * 0x2f);
  unmask(hdr, 0, 0x40);
  if (crc16(hdr, 2, 0x3e) !== le16(hdr, 0)) throw new Error("its header checksum is wrong");
  const count = le16(hdr, 8);
  let start = -1, length = 0;
  for (let k = 0; k < count && 0x90 + k * 0x50 <= hdr.length; k++) {
    const e = hdr.slice(0x40 + k * 0x50, 0x90 + k * 0x50);
    unmask(e, 0, 0x50);
    if (le16(e, 0) === 0) { start = le32(e, 8) + 20; length = le32(e, 12); break; }
  }
  if (start < 20 * 0x30 || !length) throw new Error("it has no flash image");
  if (start + length > file.length) throw new Error("its flash image runs past the end of the file");
  if (length > FLASH.keySector) throw new Error(`its flash image (0x${length.toString(16)} bytes) would reach the unit's chip key sector at 0xFF000`);
  const flash = file.slice(start, start + Math.min(length, 0x4000));
  unmask(flash, 0, 32);
  const entries = [];
  for (let o = 32; o + 32 <= flash.length && entries.length < 32; o += 32) {
    unmask(flash, o, 32);
    let name = "";
    for (let i = 0; i < 16 && flash[o + 16 + i]; i++) name += String.fromCharCode(flash[o + 16 + i]);
    const h = { name, offset: le32(flash, o + 4), size: le32(flash, o + 8), flags: flash[o + 12] };
    entries.push(h);
    if (le16(flash, o + 14)) break;
  }
  const boot = entries.find((h) => h.name === "uboot.boot");
  if (boot && boot.offset + boot.size > FLASH.appStart) throw new Error("its boot head reaches past 0x4000");
  const app = entries.find((h) => h.name === "app_dir_head" && h.flags === 0x81);
  if (!app) throw new Error("it has no FM-1 firmware area");
  if (app.offset !== FLASH.appStart) throw new Error(`its firmware area starts at 0x${app.offset.toString(16)}, not 0x4000`);
  return { flashLength: length, appStart: app.offset, bootEnd: boot ? boot.offset + boot.size : 0, entries: entries.map((h) => h.name) };
}

// ---------------------------------------------------------------- journal
// One install at a time, persisted so a closed window, a crash or an unplugged cable leaves a
// record of where it stopped. Phases run in this order; `status` is running, failed or done.
export const PHASES = ["checked", "staging", "loader", "writing", "rebooting", "done"];
const NEXT = {
  checked: ["staging", "writing"],      // writing: a resume goes straight to the loader
  staging: ["loader"],
  loader: ["writing"],
  writing: ["rebooting"],
  rebooting: ["done"],
  done: [],
};
export const JOURNAL_KEY = "fm1.flash-journal.v1";

const JOURNAL_STATUSES = new Set(["running", "failed", "done", "idle"]);
// An interrupted write older than this is still offered (the loader may still be waiting),
// but the UI can warn that the record is stale.
export const JOURNAL_STALE_MS = 24 * 60 * 60 * 1000;
export function journalAgeMs(j, now = Date.now()) {
  const t = Number(j?.updated || j?.started || 0);
  return t > 0 ? Math.max(0, now - t) : 0;
}

export class FlashJournal {
  constructor(storage, key = JOURNAL_KEY) {
    this.storage = storage;
    this.key = key;
  }
  read() {
    try {
      const j = JSON.parse(this.storage.getItem(this.key) || "null");
      if (!j || typeof j !== "object" || Array.isArray(j)) return null;
      if (j.status != null && !JOURNAL_STATUSES.has(j.status)) return null;
      if ((j.status === "running" || j.status === "failed") && (!j.phase || !PHASES.includes(j.phase))) return null;
      if (j.sha256 != null && (typeof j.sha256 !== "string" || (j.sha256 && !/^[a-f0-9]{64}$/i.test(j.sha256)))) return null;
      if (j.product != null && (typeof j.product !== "string" || (j.product && !/^(ota-)?FM-1_\d{1,10}$/i.test(j.product)))) return null;
      return j;
    } catch { return null; }
  }
  save(j) {
    // (storage full or blocked: the flash still runs, but a crash now could not offer recovery)
    try { this.storage.setItem(this.key, JSON.stringify(j)); this.unsaved = false; }
    catch (e) { this.unsaved = true; console.warn("flash journal not saved:", e); }
    return j;
  }
  // a new attempt; the last good install is kept so a later failure can roll back to it
  begin({ fwId = null, name, product, sha256, previous = null, resume = false }) {
    if (!sha256 || !/^[a-f0-9]{64}$/i.test(sha256)) throw new Error("install journal: package sha256 required before writing");
    if (product && !/^(ota-)?FM-1_\d{1,10}$/i.test(product)) throw new Error("install journal: refusing non-FM-1 product");
    const prior = this.read();
    return this.save({
      fwId, name, product, sha256: sha256.toLowerCase(), previous, resume,
      phase: "checked", status: "running", code: null, served: 0, badreq: 0,
      started: Date.now(), updated: Date.now(),
      lastGood: prior?.status === "done" ? { fwId: prior.fwId, name: prior.name, product: prior.product, sha256: prior.sha256 } : prior?.lastGood || null,
    });
  }
  // Count protocol "asked outside the image" failures for this attempt. After the limit the UI
  // must refuse another Finish of the same package and push Roll back / Advanced recovery.
  bumpBadreq() {
    const j = this.read();
    if (!j || (j.status !== "running" && j.status !== "failed")) return null;
    const badreq = (Number(j.badreq) || 0) + 1;
    return this.save({ ...j, badreq, status: "failed", code: "badreq", updated: Date.now() });
  }
  advance(phase, extra = {}) {
    const j = this.read();
    if (!j || j.status !== "running") throw new Error(`no install in progress for ${phase}`);
    if (phase !== j.phase && !NEXT[j.phase]?.includes(phase)) throw new Error(`install journal: ${j.phase} cannot go to ${phase}`);
    return this.save({ ...j, ...extra, phase, status: phase === "done" ? "done" : "running", updated: Date.now() });
  }
  fail(code) {
    const j = this.read();
    if (!j) return null;
    return this.save({ ...j, status: "failed", code: code || "error", updated: Date.now() });
  }
  clear() {
    const j = this.read();
    // keep only what a later rollback needs
    this.save({ status: "idle", lastGood: j?.status === "done" ? { fwId: j.fwId, name: j.name, product: j.product, sha256: j.sha256 } : j?.lastGood || null });
  }
}

// ---------------------------------------------------------------- event log
// A short local history of install and recovery attempts, for troubleshooting: time, step,
// result code, and the package identity. No file paths, port names, serial numbers or firmware
// bytes; nothing is sent anywhere. Bounded, and a storage failure is ignored so it can never stop
// an install.
export const LOG_KEY = "fm1.flash-log.v1";
export const LOG_MAX = 50;
export const LOG_STEPS = ["check", "confirm", "cancel", "start", "stage", "loader", "write", "reboot", "done", "fail", "usb-check", "recovery", "copy-info"];
const tidy = (v, n) => (v == null ? null : String(v).replace(/[^\w .:+#()/-]/g, "").slice(0, n) || null);
export class FlashLog {
  constructor(storage, key = LOG_KEY, max = LOG_MAX) {
    this.storage = storage;
    this.key = key;
    this.max = max;
  }
  read() {
    try {
      const v = JSON.parse(this.storage.getItem(this.key) || "[]");
      return Array.isArray(v) ? v.filter((e) => e && typeof e === "object").slice(-this.max) : [];
    } catch { return []; }
  }
  add(step, { code = null, product = null, mode = null } = {}) {
    const e = {
      t: new Date().toISOString(),
      step: LOG_STEPS.includes(step) ? step : "other",
      code: /^[a-z]{1,24}$/.test(code || "") ? code : (code ? "other" : null),
      product: /^(ota-)?FM-1_\d{1,10}$/i.test(product || "") ? product : null,
      mode: ["install", "resume", "rollback"].includes(mode) ? mode : null,
    };
    for (const k of Object.keys(e)) if (e[k] == null) delete e[k];
    try { this.storage.setItem(this.key, JSON.stringify([...this.read(), e].slice(-this.max))); } catch { /* full or blocked: skip */ }
    return e;
  }
  clear() { try { this.storage.removeItem(this.key); } catch { /* ignore */ } }
}

// Plain text the user can paste into a message when asking for help: what the app saw, the
// last install record, and recent steps. Same rule as the log: no paths, ports or serials.
export function troubleshootingText({ journal = null, log = [], seen = null, usb = null, app = "" } = {}) {
  const lines = ["FM-1 install troubleshooting", `Created: ${new Date().toISOString()}`];
  if (app) lines.push(`App: ${tidy(app, 60)}`);
  if (seen) lines.push(`USB-MIDI check: ${seen.found ? `found ${tidy(seen.id, 40)}${seen.inUpdateMode ? " (update mode)" : ""}` : `not found (${tidy(seen.code, 24)})`}`);
  if (usb) lines.push(`USB device check: ${tidy(usb.summary, 120)}`);
  if (journal && journal.status && journal.status !== "idle") {
    lines.push(`Last install: ${tidy(journal.name, 60)} ${tidy(journal.product, 24) || ""}, step ${tidy(journal.phase, 16)}, ${tidy(journal.status, 12)}${journal.code ? ` (${tidy(journal.code, 24)})` : ""}`);
    if (journal.updated) lines.push(`Last install updated: ${new Date(journal.updated).toISOString()}`);
  } else lines.push("Last install: none pending");
  if (journal?.lastGood) lines.push(`Previous good install: ${tidy(journal.lastGood.name, 60)} ${tidy(journal.lastGood.product, 24) || ""}`);
  lines.push("Recent steps:");
  const recent = log.slice(-15);
  if (!recent.length) lines.push("  (none)");
  for (const e of recent) lines.push(`  ${e.t} ${e.step || "?"}${e.mode ? ` [${e.mode}]` : ""}${e.product ? ` ${e.product}` : ""}${e.code ? ` code=${e.code}` : ""}`);
  return lines.join("\n");
}

// What an unfinished journal means for the unit, and what to offer. null when nothing is pending.
//  - before the loader ran, the running firmware only staged the loader: nothing was written,
//    retry is safe
//  - from the loader on, the unit stays in update mode until a whole image is written: resume
//    with the same package, or roll back by writing the last good one through the loader
//  - after the write, only the restart is outstanding: power-cycle and scan
// How many times the same interrupted package may throw badreq before we refuse another Finish.
export const BADREQ_LIMIT = 2;

export function pendingRecovery(j, { now = Date.now(), staleMs = JOURNAL_STALE_MS } = {}) {
  if (!j || (j.status !== "running" && j.status !== "failed")) return null;
  const at = PHASES.indexOf(j.phase);
  if (at < 0 || j.phase === "done") return null;
  const stale = journalAgeMs(j, now) >= staleMs;
  const badreq = Number(j.badreq) || 0;
  const badreqBlocked = badreq >= BADREQ_LIMIT;
  const rollback = j.lastGood && j.lastGood.sha256 && j.lastGood.sha256 !== j.sha256 ? j.lastGood : null;
  if (at < PHASES.indexOf("loader")) return { kind: "retry", journal: j, stale, badreq, badreqBlocked, rollback };
  if (j.phase === "rebooting") return { kind: "restart", journal: j, stale, badreq, badreqBlocked, rollback };
  return {
    kind: "resume",
    journal: j,
    rollback,
    stale,
    badreq,
    badreqBlocked,
  };
}

/** What the confirm dialog must force the user to acknowledge before a destructive write. */
export function writeSafetyFlags(j, { hasVaultLastGood = false, journalUnsaved = false } = {}) {
  const lastGood = j?.status === "done"
    ? { fwId: j.fwId, name: j.name, product: j.product, sha256: j.sha256 }
    : j?.lastGood || null;
  return {
    hasRollbackTarget: !!(lastGood && lastGood.sha256),
    rollbackReady: !!(lastGood && lastGood.sha256 && hasVaultLastGood),
    // `unsaved` lives on the FlashJournal instance, not the persisted record — pass it in.
    journalUnsaved: !!journalUnsaved,
  };
}

// ---------------------------------------------------------------- messages
// Every updater/validation code: what happened, and the one next step.
export const HELP = {
  badpackage: ["That file is not a firmware for this unit.", "Pick a firmware from the list, or a .fwsc made for the FM-1."],
  checksum: ["The package failed its checksum, so nothing was written.", "Check the internet connection and press Install again."],
  layout: ["This file is not laid out like an FM-1 firmware package, so nothing was written.", "Pick a firmware from the list, or a .fwsc made for the FM-1 (not an SMK-37 or other model)."],
  midiaccess: ["This browser cannot reach USB-MIDI.", "Use the FM-1 Emulator desktop app, or Chrome or Edge."],
  midiperm: ["MIDI access was not allowed.", "Allow MIDI (with SysEx) for this page, then press Install again."],
  nomidi: ["No USB-MIDI device is visible.", "Connect the FM-1 with a USB data cable (charge-only cables do not work), then press SCAN."],
  noport: ["The FM-1 is not among the connected MIDI devices.", "Connect it with a USB data cable. If the screen is black or it still is not found, open Screen black or not found? below."],
  busy: ["Another app is holding the FM-1's MIDI port.", "Close DAWs and MIDI tools (and other copies of this app), then press SCAN."],
  notfound: ["Nothing answered as an FM-1.", "Check the cable, then press Check connection. If it still does not answer, open Screen black or not found? below."],
  model: ["The connected unit is a different product than this package is for.", "Pick a package made for the connected unit. Nothing was written."],
  inupdate: ["The FM-1 is waiting in update mode from an earlier install.", "Press Finish interrupted install with the same firmware, or Roll back to put the previous firmware back."],
  downloadmode: ["The running firmware does not take updates over USB-MIDI. Nothing was written.", "This app cannot install on this unit. See Advanced recovery under Recovery and help for what a separate tool can do."],
  stopped: ["The FM-1 stopped answering during the install.", "Do not switch it off. Replug the USB cable, press Check connection, and if it shows update mode press Finish interrupted install."],
  lost: ["The FM-1 was disconnected during the install.", "Do not switch it off. Reconnect the cable, press Check connection, and if it shows update mode press Finish interrupted install. If it was switched off or its battery ran out, it may not return to update mode: open Screen black or not found?"],
  badreq: ["The FM-1 asked for data outside the package, so the install stopped.", "Do not switch it off. Try Finish interrupted install once with the same firmware; if it stops the same way, do not keep retrying: use Roll back, or see Advanced recovery."],
  badreqlimit: ["The same package failed the same way twice (bad request outside the image).", "Do not Finish that package again. Use Roll back if offered, or Advanced recovery. Keep the FM-1 powered."],
  noloader: ["The update loader did not appear after the first step. Nothing was written to the firmware area yet.", "Replug the USB cable, press Check connection, and if it shows update mode press Finish interrupted install; if it shows the old firmware, press Install again."],
  noreturn: ["The firmware was written but the FM-1 did not restart on its own.", "Power-cycle the FM-1, then press SCAN to check the new firmware."],
  mismatch: ["The FM-1 restarted with a different firmware than the one written.", "It is running, so it can still be updated. Press Install once more with the same firmware; if it happens again, stop and check that the package is the one you meant."],
  sourcemismatch: ["This is not the package the interrupted install was writing.", "Finish with the same firmware, or use Roll back."],
  vaultmissing: ["This device no longer has a copy of that firmware package, so Finish / Roll back cannot run safely.", "Re-select the same .fwsc (or the same list entry), then try again. Prefer a full flash restore from Advanced recovery if you have a backup."],
  norollback: ["There is no previous in-app install to roll back to on this computer.", "Restore from a full flash backup (Advanced recovery) if you made one, or install a known-good catalog firmware once the unit answers again."],
  unsavedjournal: ["This browser blocked saving the install journal, so a crash may not offer Finish interrupted install.", "Cancel unless you can keep this window open until the FM-1 restarts, or use the desktop app."],
};
export function explain(error) {
  const code = (error && error.code) || "error";
  const [what, next] = HELP[code] || [(error && error.message) || String(error), "Open Recovery and help below."];
  return { code, what, next, detail: (error && error.message) || "" };
}
