#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
for (const excluded of ["modfm1", "fm1-operator", "fm1-doom", "core-fm1", "fm1-neverhood", "ketch", "mpfm1", "vesper", "emb", "bb1", "bubba"])
  assert.ok(!ids.has(excluded), `excluded unsafe/unverified package: ${excluded}`);

const host = text("main.js");
const page = text("site/emulator/main.js");
const worklet = text("site/emulator/worklet.js");
assert.match(host, /app\.disableHardwareAcceleration\(\)/, "software-rendering default");
assert.match(host, /render-process-gone/, "renderer recovery hook");
assert.match(host, /showRecovery/, "visible renderer recovery page");
// Worker engine (default): JIT on, queue absorbs compiles. Audio-thread fallback
// (?engine=worklet): interpreter default, ?jit=1 opts in. Fixes Mac Apple Silicon
// "noise instead of sound" underruns (issue #1).
assert.match(page, /return worker \? params\.get\("jit"\) !== "0" : params\.get\("jit"\) === "1"/,
  "JIT on with worker engine; interpreter default in audio-thread fallback");
assert.match(page, /stream-worklet\.js/, "threaded audio reader is wired");
assert.match(page, /new Worker\("engine\.js/, "emulator runs off the audio thread by default");
assert.ok(existsSync(resolve(emulator, "engine.js")), "engine.js is shipped");
assert.ok(existsSync(resolve(emulator, "stream-worklet.js")), "stream-worklet.js is shipped");
assert.ok(existsSync(resolve(emulator, "layout.js")), "hide/show layout is shipped");
assert.ok(existsSync(resolve(emulator, "flash-core.js")), "install recovery core is shipped");
assert.ok(existsSync(resolve(emulator, "flash-vault.js")), "package vault for resume/rollback is shipped");
assert.ok(existsSync(resolve(emulator, "install.js")), "install UI is shipped");
assert.ok(existsSync(resolve(root, "ci/fake-fm1.mjs")), "simulated FM-1 for flash tests is shipped");
assert.match(text("site/emulator/flash-core.js"), /pendingRecovery/, "interrupted-install recovery is shipped");
assert.match(text("site/emulator/flash-core.js"), /JOURNAL_STALE_MS/, "stale journal warning is shipped");
assert.match(text("site/emulator/flash-core.js"), /BADREQ_LIMIT/, "bad-request retry limit is shipped");
assert.match(text("site/emulator/install.js"), /createPackageVault/, "install keeps package bytes for recovery");
assert.match(text("site/emulator/install.js"), /fi-checks/, "install requires safety acknowledgements");
assert.match(text("docs/Recovery.md"), /Package vault/, "recovery docs describe the package vault");
assert.match(text("main.js"), /isPeExecutable/, "M-Flasher PE check is shipped");
assert.match(text("main.js"), /usb-check/, "USB check is logged");
assert.match(text("main.js"), /fm1:check-updates/, "app update IPC is wired");
assert.match(text("preload.js"), /checkUpdates/, "app update bridge is exposed");
assert.match(text("updater.js"), /briksquared\/fm1-emulator/, "public updater points at the public repo");
assert.match(text("site/emulator/extras.js"), /app-upd-btn/, "desktop Updates control is injected");
{
  const html = text("site/emulator/index.html");
  const nav = html.match(/<nav class="sitenav"[\s\S]*?<\/nav>/)?.[0] || "";
  const header = html.match(/<header class="site"[\s\S]*?<\/header>/)?.[0] || "";
  assert.ok(nav, "site nav exists");
  assert.doesNotMatch(nav, /href="#firmwares"|href="#guide"|href="#plugin"/, "top nav does not link to hidden sections");
  // Docs lives under More ▾ (site-more), not the empty plugin host nav.
  assert.match(header, /briksquared\/fm1-emulator#readme/, "Docs link remains in the site header");
}
assert.match(text("site/emulator/install.js"), /Keep the visible line short/, "install errors stay compact");
assert.ok(existsSync(resolve(emulator, "catalog-source.js")), "neutral catalog source is shipped");
assert.match(text("site/emulator/index.html"), /layout\.js\?v=\d+/, "layout.js is loaded");
assert.doesNotMatch(text("site/emulator/index.html"), /Firmware Hub|thefirmwarehub/i, "page must not brand the Firmware Hub");
assert.match(page, /finally\s*{\s*requestAnimationFrame\(draw\)/, "render loop survives a bad frame");
assert.match(worklet, /m\.jit === true \? 1 : 0/, "worklet cannot silently re-enable JIT");
assert.match(worklet, /applyPackageResources\(x, m\.package\)/, "type-101 package resources applied");
assert.match(host, /fm1:usb-check/, "desktop USB check IPC is wired");
assert.match(host, /require\("\.\/updater"\)/, "app update check is wired");
assert.ok(existsSync(resolve(root, "updater.js")), "updater.js is shipped");

const { packageResources } = await browserModule(resolve(emulator, "package-resources.js"));
const melodee = entries.find(entry => entry.id === "melodee");
assert.ok(melodee, "Melodee is bundled");
assert.ok(packageResources(readFileSync(resolve(emulator, melodee.package)))?.data.length > 0, "Melodee type-101 resource is decoded");
const felucca = entries.find(entry => entry.id === "felucca");
assert.equal(packageResources(readFileSync(resolve(emulator, felucca.package))), null, "ordinary packages do not invent resources");

const { fromHub, mergeCatalog, scanOpenFirmwareUpdates, classifyScan } = await browserModule(resolve(emulator, "catalog-updates.js"));
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
assert.deepEqual({ checked: scanned.checked, newCount: scanned.newCount, updateCount: scanned.updateCount, remembered: scanned.remember.length, closedLicense: scanned.closedLicense },
  { checked: 1, newCount: 1, updateCount: 0, remembered: 1, closedLicense: 1 }, "open-source update scan filters and counts releases");
const review = classifyScan(scanned, []);
assert.equal(review.length, 1, "review list has the new open find");
assert.equal(review[0].kind, "new", "new find is marked for review");
assert.ok(existsSync(resolve(emulator, "radar.js")), "radar panel module is shipped");
assert.match(text("site/emulator/index.html"), /firmware-radar-list/, "radar results list is in the page");
assert.match(text("site/emulator/index.html"), /radar-filter-new/, "radar filters are in the page");
assert.match(text("site/emulator/index.html"), /radar-filter-q/, "radar text filter is in the page");
assert.match(text("site/emulator/index.html"), /assist\.js\?v=\d+/, "Play assist panel is loaded");
assert.match(text("site/emulator/assist.js"), /fm1\.assist\.v1/, "Play assist persists its state");
assert.match(text("site/emulator/audition.js"), /STYLES/, "audition has multiple phrase styles");
assert.match(text("site/emulator/midimon.js"), /mon-pause/, "MIDI monitor can pause capture");
assert.match(text("site/emulator/style.css"), /flex-wrap:\s*nowrap/, "key legend stays on one row");
assert.ok(entries.some(entry => entry.id === "aurora" && entry.version === "0.9.1" && entry.product === "FM-1_4747"), "AURORA 0.9.1 is bundled and identified");

const radarTests = spawnSync(process.execPath, [resolve(root, "ci/test-radar.mjs")], { encoding: "utf8" });
assert.equal(radarTests.status, 0, `radar unit tests failed:\n${radarTests.stdout}\n${radarTests.stderr}`);
assert.match(radarTests.stdout, /PASS: \d+ radar tests/, "radar unit tests report a pass count");
const flashTests = spawnSync(process.execPath, [resolve(root, "ci/test-flash.mjs")], { encoding: "utf8" });
assert.equal(flashTests.status, 0, `flash unit tests failed:\n${flashTests.stdout}\n${flashTests.stderr}`);
assert.match(flashTests.stdout, /PASS: \d+ flash tests/, "flash unit tests report a pass count");

const readme = text("README.md");
assert.match(readme, new RegExp(`\\b${entries.length}\\b`), "README firmware count");
assert.match(text("THIRD-PARTY.md"), new RegExp(`Bundled firmware \\(${entries.length}\\)`), "third-party count");
assert.ok(packageJson.build.files.includes("FIRMWARE-SOURCES.json"), "source manifest included in packaged app");
assert.ok(packageJson.build.files.includes("LICENSES/**/*"), "third-party license texts included in packaged app");
console.log(`PASS: ${entries.length} unique, open-license FM-1 packages; hashes, identities, order, source manifest, patch, and resource loader verified.`);
