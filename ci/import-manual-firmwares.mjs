#!/usr/bin/env node
// Import the non-Hub firmware set that was individually reviewed on 2026-11-09.
// This maintainer tool deliberately requires the private, audited checkout as input;
// normal public builds only consume the resulting manifest and packages.
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const privateRoot = resolve(process.argv[2] || "");
if (!process.argv[2]) throw new Error("usage: node ci/import-manual-firmwares.mjs <private FM1-firmwares root>");

const site = resolve(root, "site");
const privateEmulator = resolve(privateRoot, "emulator");
const firmware = JSON.parse(readFileSync(resolve(privateEmulator, "firmwares.json"), "utf8")).firmwares;
const health = JSON.parse(readFileSync(resolve(privateEmulator, "boot-health.json"), "utf8")).entries;
const hub = await fetch("https://thefirmwarehub.com/catalog.json").then(r => {
  if (!r.ok) throw new Error(`Firmware Hub catalog: HTTP ${r.status}`);
  return r.json();
});
const hubIds = new Set(hub.firmwares.map(f => f.id));
const openLicense = /^(?:GPL-|LGPL-|AGPL-|MPL-|Apache-|BSD-|MIT$|ISC$)/;

// Each exclusion is evidence-based, not a blanket dislike of the project.
const excluded = new Map(Object.entries({
  modfm1: "emulated CPU halts in the full boot audit",
  "fm1-operator": "emulated CPU halts in the full boot audit",
  "fm1-doom": "LCD remains blank in the full boot audit",
  "core-fm1": "did not finish the boot audit window; not confirmed for the public set",
  "fm1-neverhood": "source repository is unavailable, so its stale MIT label cannot be reverified",
  ketch: "source repository is unavailable, so corresponding source cannot be supplied",
  mpfm1: "code is MIT, but the published package contains separately restricted Nintendo media",
}));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function productOf(bytes) {
  if (bytes.length < 960) throw new Error("package is too short");
  let product = "";
  for (let i = 0; i < 20; i++) {
    const marker = bytes[i * 48 + 47];
    if (marker !== 0x7d) product += String.fromCharCode((marker - i - 1) & 255);
  }
  if (!/^FM-1_\d+$/.test(product)) throw new Error(`wrong package identity: ${JSON.stringify(product)}`);
  return product;
}

function inside(base, target) {
  const rel = relative(base, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !rel.includes(":\0"));
}

const selected = [];
for (const entry of firmware) {
  if (hubIds.has(entry.id) || (entry.hub && hubIds.has(entry.hub))) continue;
  if (!openLicense.test(entry.license || "") || !/^https:\/\/github\.com\/[^/]+\/[^/]+/.test(entry.repo || "")) continue;
  if (excluded.has(entry.id)) continue;
  if (health[entry.id]?.status !== "ok") throw new Error(`${entry.id}: expected a passing boot audit`);
  if (!entry.package?.startsWith("../")) throw new Error(`${entry.id}: unsafe source package path`);

  const source = resolve(privateEmulator, entry.package);
  if (!inside(privateRoot, source)) throw new Error(`${entry.id}: package escapes the private firmware root`);
  const publicPackage = entry.package.replace(/^\.\.\//, "");
  const destination = resolve(site, publicPackage);
  if (!inside(site, destination)) throw new Error(`${entry.id}: package escapes the public site`);
  const bytes = readFileSync(source);
  const digest = sha256(bytes);
  const product = productOf(bytes);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  selected.push({
    ...entry,
    package: `../${publicPackage.replaceAll("\\", "/")}`,
    sha256: digest,
    product,
    licenseReviewed: "2026-11-09",
  });
}

selected.sort((a, b) => String(b.released || "").localeCompare(String(a.released || "")) || a.name.localeCompare(b.name));
writeFileSync(resolve(root, "ci", "manual-firmwares.json"), JSON.stringify(selected, null, 2) + "\n");
console.log(`Imported ${selected.length} individually reviewed, non-Hub firmware packages.`);
console.log(`Excluded ${excluded.size}: ${[...excluded].map(([id, reason]) => `${id} (${reason})`).join("; ")}`);
