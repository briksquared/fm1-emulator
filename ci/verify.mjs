#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const site = resolve(root, "site");
const emulator = resolve(site, "emulator");
const json = file => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const text = file => readFileSync(resolve(root, file), "utf8");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const browserModule = file => import(`data:text/javascript;base64,${readFileSync(file).toString("base64")}`);
const productOf = bytes => {
  assert.ok(bytes.length >= 960, "package has a complete FM-1 header");
  let product = "";
  for (let i = 0; i < 20; i++) {
    const marker = bytes[i * 48 + 47];
    if (marker !== 0x7d) product += String.fromCharCode((marker - i - 1) & 255);
  }
  assert.match(product, /^FM-1_\d+$/, "package has an FM-1 product identity");
  return product;
};
const inside = (base, target) => {
  const rel = relative(base, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== "..");
};

const packageJson = json("package.json");
const lock = json("package-lock.json");
const manifest = json("site/emulator/firmwares.json");
const sources = json("FIRMWARE-SOURCES.json");
const catalog = json("site/catalog.json");
const entries = manifest.firmwares;
assert.equal(packageJson.version, lock.version, "package-lock root version");
assert.equal(packageJson.version, lock.packages[""].version, "package-lock package version");
assert.equal(entries.length, sources.firmwares.length, "source manifest count");
assert.ok(entries.length >= 250, "expanded public firmware set");
assert.ok(entries.some(entry => entry.id === manifest.default), "default firmware exists");
assert.ok(catalog.firmwares.length >= 160, "current open-license Hub catalog");

const ids = new Set(), hashes = new Set(), files = new Set();
let previous = "9999";
for (const entry of entries) {
  assert.ok(!ids.has(entry.id), `unique id: ${entry.id}`);
  assert.ok(!hashes.has(entry.sha256), `unique package bytes: ${entry.id}`);
  assert.match(entry.license, /^(?:GPL-|LGPL-|AGPL-|MPL-|Apache-|BSD-|MIT$|ISC$)/, `${entry.id}: open license`);
  assert.match(entry.repo, /^https:\/\/github\.com\//, `${entry.id}: source repository`);
  assert.ok(String(entry.released || "") <= previous, `${entry.id}: newest-to-oldest order`);
  previous = String(entry.released || "");
  const file = resolve(emulator, entry.package);
  assert.ok(inside(site, file), `${entry.id}: package remains inside site`);
  assert.ok(existsSync(file), `${entry.id}: package exists`);
  const bytes = readFileSync(file);
  assert.equal(sha256(bytes), entry.sha256, `${entry.id}: SHA-256`);
  assert.equal(productOf(bytes), entry.product, `${entry.id}: product identity`);
  ids.add(entry.id);
  hashes.add(entry.sha256);
  files.add(file.toLowerCase());
}

const diskPackages = [];
for (const directory of [resolve(site, "fw"), resolve(site, "archive")]) {
  const visit = folder => {
    if (!existsSync(folder)) return;
    for (const item of readdirSync(folder, { withFileTypes: true })) {
      const target = resolve(folder, item.name);
      if (item.isDirectory()) visit(target);
      else if (item.isFile() && item.name.endsWith(".fwsc")) diskPackages.push(target.toLowerCase());
    }
  };
  visit(directory);
}
assert.deepEqual(new Set(diskPackages), files, "no stale or unlisted .fwsc packages");
for (const excluded of ["modfm1", "fm1-operator", "fm1-doom", "core-fm1", "fm1-neverhood", "ketch", "mpfm1", "vesper", "emb"])
  assert.ok(!ids.has(excluded), `excluded unsafe/unverified package: ${excluded}`);

const host = text("main.js");
const page = text("site/emulator/main.js");
const worklet = text("site/emulator/worklet.js");
assert.match(host, /app\.disableHardwareAcceleration\(\)/, "software-rendering default");
assert.match(host, /render-process-gone/, "renderer recovery hook");
assert.match(host, /showRecovery/, "visible renderer recovery page");
assert.match(page, /params\.get\("jit"\) === "1"/, "interpreter default with opt-in JIT in the audio thread");
assert.match(page, /new Worker\("engine\.js/, "emulation runs off the audio thread");
assert.match(page, /addModule\("stream-worklet\.js/, "audio thread only plays the queued stream");
assert.match(page, /finally\s*{\s*requestAnimationFrame\(draw\)/, "render loop survives a bad frame");
assert.match(worklet, /m\.jit === true \? 1 : 0/, "worklet cannot silently re-enable JIT");
assert.match(worklet, /applyPackageResources\(x, m\.package\)/, "type-101 package resources applied");

const { packageResources } = await browserModule(resolve(emulator, "package-resources.js"));
const melodee = entries.find(entry => entry.id === "melodee");
assert.ok(melodee, "Melodee is bundled");
assert.ok(packageResources(readFileSync(resolve(emulator, melodee.package)))?.data.length > 0, "Melodee type-101 resource is decoded");
const felucca = entries.find(entry => entry.id === "felucca");
assert.equal(packageResources(readFileSync(resolve(emulator, felucca.package))), null, "ordinary packages do not invent resources");

const { fromHub, mergeCatalog, scanOpenFirmwareUpdates } = await browserModule(resolve(emulator, "catalog-updates.js"));
const liveExample = {
  id: "test-open", name: "Test Open", version: "2.0", published: "2026-11-09T12:00:00Z",
  kind: "synth", author: "tester", lic: "GPL-3.0", what: "Test entry", pkg: "fw/test-open-2.0.fwsc",
  sha256: "a".repeat(64), product: "FM-1_123", source: "https://github.com/example/test-open/tree/v2.0",
};
assert.equal(fromHub({ ...liveExample, lic: "" }), null, "scanner rejects a missing license");
assert.equal(fromHub({ ...liveExample, product: "SMK-37_123" }), null, "scanner rejects a wrong-device product");
const converted = fromHub(liveExample);
assert.equal(converted.package, "https://thefirmwarehub.com/fw/test-open-2.0.fwsc", "scanner creates a pinned Hub URL");
const merged = mergeCatalog({ default: "felucca", firmwares: [felucca] }, [converted, { ...converted, id: "bad", package: "https://evil.example/fw/bad.fwsc" }]);
assert.deepEqual(merged.firmwares.map(entry => entry.id), ["test-open", "felucca"], "only safe remembered entries merge");
const scanned = await scanOpenFirmwareUpdates({ firmwares: [felucca] }, { firmwares: [felucca] }, async () => ({ ok: true, json: async () => ({ firmwares: [liveExample, { ...liveExample, id: "closed", lic: "" }] }) }));
assert.deepEqual({ checked: scanned.checked, newCount: scanned.newCount, updateCount: scanned.updateCount, remembered: scanned.remember.length },
  { checked: 1, newCount: 1, updateCount: 0, remembered: 1 }, "open-source update scan filters and counts releases");
assert.ok(entries.some(entry => entry.id === "aurora" && entry.version === "0.9.1" && entry.product === "FM-1_4747"), "AURORA 0.9.1 is bundled and identified");

const readme = text("README.md");
assert.match(readme, new RegExp(`\\b${entries.length}\\b`), "README firmware count");
assert.match(text("THIRD-PARTY.md"), new RegExp(`Bundled firmware \\(${entries.length}\\)`), "third-party count");
// Upgrades: every public installer so far used this appId, product name and NSIS GUID (the GUID
// electron-builder derives from the appId). Changing any of them makes a new installer a
// different app, which leaves the old one installed beside it.
assert.equal(packageJson.build.appId, "com.briksquared.fm1emulator", "appId stays stable across releases");
assert.equal(packageJson.build.productName, "FM-1 Emulator", "productName stays stable across releases");
assert.equal(packageJson.build.nsis.guid, "79b50ff1-604f-59d5-b1fb-36e19b956082", "NSIS GUID matches earlier installers");
assert.equal(packageJson.build.nsis.perMachine, false, "per-user install, as before");
assert.notEqual(packageJson.build.nsis.deleteAppDataOnUninstall, true, "upgrades keep user data");
assert.match(host, /setAppUserModelId\("com\.briksquared\.fm1emulator"\)/, "window AppUserModelID matches the shortcuts");
assert.ok(packageJson.build.files.includes("FIRMWARE-SOURCES.json"), "source manifest included in packaged app");
assert.ok(packageJson.build.files.includes("LICENSES/**/*"), "third-party license texts included in packaged app");
console.log(`PASS: ${entries.length} unique, open-license FM-1 packages; hashes, identities, order, source manifest, patch, and resource loader verified.`);
