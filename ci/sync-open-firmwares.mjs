#!/usr/bin/env node
// Refresh every explicitly open-licensed catalog package, then merge the
// separately reviewed GitHub set. All bytes are hash- and identity-checked.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const site = resolve(root, "site");
const emulator = resolve(site, "emulator");
const { CATALOG_URL } = await import(new URL("../site/emulator/catalog-updates.js", import.meta.url));
const openLicense = /^(?:GPL-|LGPL-|AGPL-|MPL-|Apache-|BSD-|MIT$|ISC$)/;
const manual = JSON.parse(readFileSync(resolve(root, "ci", "manual-firmwares.json"), "utf8"));

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
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== "..");
}

async function fetchBytes(url) {
  const response = await fetch(url, { headers: { "user-agent": "fm1-emulator-release-sync/1.1" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const response = await fetch(CATALOG_URL, { headers: { "user-agent": "fm1-emulator-release-sync/1.1" } });
if (!response.ok) throw new Error(`firmware catalog: HTTP ${response.status}`);
const live = await response.json();
const catalogFirmware = live.firmwares
  .filter(entry => openLicense.test(entry.lic || ""))
  .sort((a, b) => String(b.published || "").localeCompare(String(a.published || "")) || a.name.localeCompare(b.name));
const omitted = live.firmwares.filter(entry => !openLicense.test(entry.lic || ""));

const entries = [];
for (const entry of catalogFirmware) {
  if (!/^fw\/[^/]+\.fwsc$/.test(entry.pkg || "")) throw new Error(`${entry.id}: unsafe catalog package path`);
  const destination = resolve(site, entry.pkg);
  if (!inside(site, destination)) throw new Error(`${entry.id}: package escapes the public site`);
  let bytes = existsSync(destination) ? readFileSync(destination) : null;
  if (!bytes || sha256(bytes) !== String(entry.sha256).toLowerCase()) {
    bytes = await fetchBytes(new URL(entry.pkg, CATALOG_URL).href);
    const digest = sha256(bytes);
    if (digest !== String(entry.sha256).toLowerCase()) throw new Error(`${entry.id}: catalog SHA-256 mismatch`);
    productOf(bytes);
    mkdirSync(dirname(destination), { recursive: true });
    const temporary = `${destination}.download`;
    writeFileSync(temporary, bytes);
    renameSync(temporary, destination);
  }
  const digest = sha256(bytes);
  const product = productOf(bytes);
  if (entry.product && entry.product !== product) throw new Error(`${entry.id}: catalog product identity mismatch`);
  entries.push({
    id: entry.id,
    name: entry.name,
    version: entry.version || "",
    released: entry.published || (entry.date ? `${entry.date}T00:00:00Z` : ""),
    kind: entry.kind || "other",
    author: entry.author || "community",
    license: entry.lic,
    about: entry.what || "Open-source FM-1 firmware.",
    package: `../${entry.pkg}`,
    repo: entry.source || `https://github.com/${entry.repo}`,
    catalogId: entry.id,
    sha256: digest,
    product,
  });
}

for (const entry of manual) {
  const file = resolve(emulator, entry.package);
  if (!inside(site, file) || !existsSync(file)) throw new Error(`${entry.id}: missing reviewed package ${entry.package}`);
  const bytes = readFileSync(file);
  if (sha256(bytes) !== entry.sha256 || productOf(bytes) !== entry.product) throw new Error(`${entry.id}: reviewed package changed`);
  entries.push(entry);
}

entries.sort((a, b) => String(b.released || "").localeCompare(String(a.released || "")) || a.name.localeCompare(b.name));
const ids = new Set(), hashes = new Set();
for (const entry of entries) {
  if (ids.has(entry.id)) throw new Error(`duplicate firmware id: ${entry.id}`);
  if (hashes.has(entry.sha256)) throw new Error(`duplicate firmware bytes: ${entry.id}`);
  ids.add(entry.id);
  hashes.add(entry.sha256);
}

const selectedFiles = new Set(entries.map(entry => resolve(emulator, entry.package).toLowerCase()));
for (const directory of [resolve(site, "fw"), resolve(site, "archive")]) {
  if (!existsSync(directory) || !inside(site, directory)) continue;
  const visit = folder => {
    for (const item of readdirSync(folder, { withFileTypes: true })) {
      const target = resolve(folder, item.name);
      if (item.isDirectory()) visit(target);
      else if (item.isFile() && item.name.endsWith(".fwsc") && !selectedFiles.has(target.toLowerCase())) rmSync(target);
    }
  };
  visit(directory);
}

const publicCatalog = {
  ...live,
  updated: new Date().toISOString(),
  firmwares: catalogFirmware,
};
writeFileSync(resolve(site, "catalog.json"), JSON.stringify(publicCatalog, null, 2) + "\n");
writeFileSync(resolve(emulator, "firmwares.json"), JSON.stringify({
  note: "Public, redistributable FM-1 packages. Newest first; every package is SHA-256 and FM-1 identity checked.",
  default: ids.has("felucca") ? "felucca" : entries[0].id,
  firmwares: entries,
}, null, 2) + "\n");
writeFileSync(resolve(root, "FIRMWARE-SOURCES.json"), JSON.stringify({
  generated: new Date().toISOString(),
  policy: "Explicit open-source license, available corresponding source, FM-1 package identity, unique bytes, and passing emulator boot audit.",
  firmwares: entries.map(({ id, name, version, released, author, license, repo, package: file, sha256: hash, product, catalogId }) =>
    ({ id, name, version, released, author, license, source: repo, package: file.replace(/^\.\.\//, "site/"), sha256: hash, product, catalogId: catalogId || null })),
}, null, 2) + "\n");

const rows = entries.map(entry =>
  `| ${entry.name.replaceAll("|", "\\|")} | ${String(entry.version || "—").replaceAll("|", "\\|")} | ${String(entry.author || "community").replaceAll("|", "\\|")} | ${entry.license} | [source](${entry.repo}) |`);
const thirdParty = `# Third-party credits\n\nThe FM-1 Emulator bundles work by many people. Thank you to all of them.\n\n## Emulation engine\n\n- **fm1-emu** by Joakim Eriksson — the Rust/WebAssembly pi32v2 emulation engine and base player page this project forks. License: MIT. https://github.com/joakimeriksson/fm1-emu\n\n## Bundled firmware (${entries.length})\n\nEvery package below has an explicit open-source license and an available source repository. Packages are redistributed unchanged. Exact package paths, full SHA-256 hashes, FM-1 product identities, versions, and source URLs are recorded in [FIRMWARE-SOURCES.json](FIRMWARE-SOURCES.json). License texts are in [LICENSES](LICENSES/).\n\nThe ${catalogFirmware.length} catalog packages use the license and checksum published in the live firmware catalog (the list itself: CC BY 4.0, The Firmware Hub, https://thefirmwarehub.com). The ${manual.length} additional GitHub packages were individually repository-license-reviewed and boot-audited on 9 November 2026.\n\n| Firmware | Version | Author | License | Corresponding source |\n| --- | --- | --- | --- | --- |\n${rows.join("\n")}\n\n## Also included\n\n- **FM-1 SID** — a sub-app that turns the FM-1 into a Commodore 64 SID synth, with a bundled demo tune for the player. Part of this project's fork.\n- **“Emulating a Synthesizer Before It Arrives”** (fm1-emu-report.pdf) — the project's own technical write-up.\n- **M-Flasher** by Julius Vitkauskas — the Windows recovery/flashing tool for backing up, restoring, and reinstalling FM-1 firmware. Bundled unmodified (v0.6.1) in the Windows build only. License: MIT. https://github.com/jvitkauskas/m-flasher\n- **Fonts** — loaded from Google Fonts at runtime when online; the UI falls back to system fonts offline.\n\n## Deliberately not bundled\n\n- Packages without an explicit redistributable license or available corresponding source.\n- Known emulator failures (halted CPU or blank LCD) and unconfirmed slow boots.\n- MPFM1's published package: its code is MIT, but its README identifies bundled Nintendo audio/art as separately non-MIT.\n- Wrong-device SMK-37, Pocket, MKE-P37, and Donner builds.\n- M-VAVE stock firmware.\n`;
writeFileSync(resolve(root, "THIRD-PARTY.md"), thirdParty);

console.log(`Synchronized ${entries.length} unique public firmware packages (${catalogFirmware.length} catalog + ${manual.length} reviewed GitHub).`);
console.log(`Omitted ${omitted.length} catalog entries without an explicit open license: ${omitted.map(f => f.id).join(", ") || "none"}.`);
