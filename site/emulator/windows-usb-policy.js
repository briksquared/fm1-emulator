// Windows USB-MIDI policy: block firmware that cannot enumerate on Windows, and shared helpers.

const FM1_MIDI_PORT = /fm[\s_-]?1|mutable\s*dreams|patchwerk|masif|felucca|ota|m[\s-]?vave/i;

let blockById = new Map();
let blockByProduct = new Map();

function ingestEntry(id, meta) {
  const reason = typeof meta === "string" ? meta : (meta?.reason || "");
  const products = typeof meta === "string" ? [] : (meta?.products || []);
  blockById.set(id, reason);
  for (const p of products) if (p) blockByProduct.set(p, reason);
}

export function isWindowsDesktop() {
  return !!(globalThis.FM1Desktop || /Win/i.test(navigator.userAgent || ""));
}

export async function loadWindowsUsbPolicy() {
  blockById = new Map();
  blockByProduct = new Map();
  try {
    const j = await (await fetch("windows-usb-blocklist.json?v=1")).json();
    for (const [id, meta] of Object.entries(j.packages || {})) ingestEntry(id, meta);
  } catch (e) {
    console.warn("windows USB blocklist not loaded:", e);
    ingestEntry("masif-fm1", { products: ["FM-1_961"] });
  }
}

export function blockedOnWindows(fwId, product) {
  if (!isWindowsDesktop()) return false;
  if (fwId && blockById.has(fwId)) return true;
  if (product && blockByProduct.has(product)) return true;
  return false;
}

export function blockReason(fwId, product) {
  if (fwId && blockById.has(fwId)) return blockById.get(fwId);
  if (product && blockByProduct.has(product)) return blockByProduct.get(product);
  return "";
}

export function filterFirmwaresForPlatform(firmwares) {
  if (!isWindowsDesktop()) return firmwares;
  return firmwares.filter((f) => !blockedOnWindows(f.id, f.product));
}

export function osSupportLabel(fw) {
  if (blockedOnWindows(fw?.id, fw?.product)) return "macOS / Linux USB (not Windows)";
  return "";
}

export function isFm1WinMidiPortName(name) {
  return FM1_MIDI_PORT.test(name || "");
}
