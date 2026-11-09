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
  const hash = await sha256(bytes);
  if (expected.sha256 && expected.sha256.toLowerCase() !== hash) throw bad("checksum", "The downloaded package does not match its published checksum, so it was not written. Download it again.");
  const image = logicalImage(bytes);
  if (!image.length) throw bad("badpackage", "The package has no firmware image.");
  return { product, sha256: hash, image, size: bytes.length };
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

export class FlashJournal {
  constructor(storage, key = JOURNAL_KEY) {
    this.storage = storage;
    this.key = key;
  }
  read() {
    try { return JSON.parse(this.storage.getItem(this.key) || "null"); } catch { return null; }
  }
  save(j) {
    // (storage full or blocked: the flash still runs, but a crash now could not offer recovery)
    try { this.storage.setItem(this.key, JSON.stringify(j)); this.unsaved = false; }
    catch (e) { this.unsaved = true; console.warn("flash journal not saved:", e); }
    return j;
  }
  // a new attempt; the last good install is kept so a later failure can roll back to it
  begin({ fwId = null, name, product, sha256, previous = null, resume = false }) {
    const prior = this.read();
    return this.save({
      fwId, name, product, sha256, previous, resume,
      phase: "checked", status: "running", code: null, served: 0,
      started: Date.now(), updated: Date.now(),
      lastGood: prior?.status === "done" ? { fwId: prior.fwId, name: prior.name, product: prior.product, sha256: prior.sha256 } : prior?.lastGood || null,
    });
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

// What an unfinished journal means for the unit, and what to offer. null when nothing is pending.
//  - before the loader ran, the running firmware only staged the loader: nothing was written,
//    retry is safe
//  - from the loader on, the unit stays in update mode until a whole image is written: resume
//    with the same package, or roll back by writing the last good one through the loader
//  - after the write, only the restart is outstanding: power-cycle and scan
export function pendingRecovery(j) {
  if (!j || (j.status !== "running" && j.status !== "failed")) return null;
  const at = PHASES.indexOf(j.phase);
  if (at < 0 || j.phase === "done") return null;
  if (at < PHASES.indexOf("loader")) return { kind: "retry", journal: j };
  if (j.phase === "rebooting") return { kind: "restart", journal: j };
  return { kind: "resume", journal: j, rollback: j.lastGood && j.lastGood.sha256 !== j.sha256 ? j.lastGood : null };
}

// ---------------------------------------------------------------- messages
// Every updater/validation code: what happened, and the one next step.
export const HELP = {
  badpackage: ["That file is not a firmware for this unit.", "Pick a firmware from the list, or a .fwsc made for the FM-1."],
  checksum: ["The package failed its checksum, so nothing was written.", "Check the internet connection and press Deploy again."],
  midiaccess: ["This browser cannot reach USB-MIDI.", "Use the FM-1 Emulator desktop app, or Chrome or Edge."],
  midiperm: ["MIDI access was not allowed.", "Allow MIDI (with SysEx) for this page, then press Deploy again."],
  nomidi: ["No USB-MIDI device is visible.", "Connect the FM-1 with a USB data cable (charge-only cables do not work), then press SCAN."],
  noport: ["The FM-1 is not among the connected MIDI devices.", "Connect it with a USB data cable. If its firmware has no USB-MIDI update port, use download mode with M-Flasher (Recovery options)."],
  busy: ["Another app is holding the FM-1's MIDI port.", "Close DAWs and MIDI tools (and other copies of this app), then press SCAN."],
  notfound: ["Nothing answered as an FM-1.", "Check the cable, then press SCAN. If the unit does not respond, use download mode with M-Flasher (Recovery options)."],
  model: ["The connected unit is a different product than this package is for.", "Pick a package made for the connected unit. Nothing was written."],
  inupdate: ["The FM-1 is waiting in update mode from an earlier install.", "Press Resume interrupted install, or Roll back to put the previous firmware back."],
  downloadmode: ["The running firmware does not take updates over USB-MIDI. Nothing was written.", "Use download mode with M-Flasher (Recovery options) to flash this unit."],
  stopped: ["The FM-1 stopped answering during the install.", "Replug the USB cable and press Resume interrupted install."],
  lost: ["The FM-1 was disconnected during the install.", "Reconnect it and press Resume interrupted install. The unit stays in update mode until it is finished."],
  badreq: ["The FM-1 asked for data outside the package, so the install stopped.", "Press Resume interrupted install with the same firmware; if it happens again, roll back."],
  noloader: ["The update loader did not appear after staging.", "Replug the USB cable and press Resume interrupted install."],
  noreturn: ["The firmware was written but the FM-1 did not restart on its own.", "Power-cycle the FM-1, then press SCAN to check the new firmware."],
  mismatch: ["The FM-1 restarted with a different firmware than the one written.", "Press Deploy again with the same firmware, or roll back."],
  sourcemismatch: ["This is not the package the interrupted install was writing.", "Resume with the same firmware, or use Roll back."],
};
export function explain(error) {
  const code = (error && error.code) || "error";
  const [what, next] = HELP[code] || [(error && error.message) || String(error), "Open Recovery options below."];
  return { code, what, next, detail: (error && error.message) || "" };
}
