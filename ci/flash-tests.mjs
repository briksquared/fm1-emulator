// The real-FM-1 flash path against a simulated unit: package checks, the USB-MIDI update
// protocol, every failure the updater reports, resume and rollback through the update loader,
// and the install journal. Run by npm test.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const emulator = resolve(root, "site/emulator");
const { Updater } = await import(new URL("../site/emulator/fm1ota.js", import.meta.url));
const { Unit, makePackage } = await import(new URL("./fake-fm1.mjs", import.meta.url));
const core = await import(new URL("../site/emulator/flash-core.js", import.meta.url));
const { logicalImage } = await import(new URL("../site/emulator/fm1pkg.js", import.meta.url));
const { FlashJournal, FlashLog, HELP, explain, pendingRecovery, validatePackage, packageLayout, troubleshootingText } = core;

const FAST = { settle: 5, loaderBoot: 5, rebootBoot: 5, stageIdle: 150, writeIdle: 150, loaderWait: 300, returnWait: 300, poll: 15, openTimeout: 60, handshake: 40, packetGap: 0, backoff: 5, retries: 3 };
const pkgBytes = makePackage("FM-1_904");
const pkg = await validatePackage(pkgBytes);
const updater = (unit, log) => new Updater(unit.access, log, { timing: FAST });
const unitFor = (opts = {}) => new Unit({ image: pkg.image, target: pkg.product, ...opts });
async function failsWith(promise, code, label) {
  await assert.rejects(promise, (e) => { assert.equal(e.code, code, `${label}: ${e.code} ${e.message}`); return true; }, label);
}
let passed = 0;
const test = async (label, fn) => { await fn(); passed++; };

// ---------------------------------------------------------------- package checks
await test("valid package", async () => {
  assert.equal(pkg.product, "FM-1_904");
  assert.equal(pkg.image.length, pkgBytes.length - 20);
  assert.equal(pkg.sha256, createHash("sha256").update(pkgBytes).digest("hex"));
});
await test("bundled package with its catalog checksum", async () => {
  const entry = JSON.parse(readFileSync(resolve(emulator, "firmwares.json"), "utf8")).firmwares[0];
  const real = new Uint8Array(readFileSync(resolve(emulator, entry.package)));
  const ok = await validatePackage(real, { sha256: entry.sha256, product: entry.product });
  assert.equal(ok.product, entry.product);
  assert.deepEqual(ok.image, logicalImage(real));
});
await test("package checks refuse bad input", async () => {
  await failsWith(validatePackage(new Uint8Array(100)), "badpackage", "too small");
  await failsWith(validatePackage(new Uint8Array(core.PACKAGE_MAX + 1)), "badpackage", "too large");
  await failsWith(validatePackage(makePackage("SMK-37_1").fill(0x7d, 0, 1)), "badpackage", "no FM-1 identity");
  await failsWith(validatePackage(pkgBytes, { sha256: "0".repeat(64) }), "checksum", "checksum mismatch");
  await failsWith(validatePackage(pkgBytes, { product: "FM-1_900" }), "badpackage", "catalog product differs");
  await failsWith(validatePackage("not bytes"), "badpackage", "not bytes");
});

await test("package layout must match the FM-1 flash map", async () => {
  assert.equal(packageLayout(pkgBytes).appStart, 0x4000);
  const bent = (layout, label) => failsWith(validatePackage(makePackage("FM-1_904", 3000, 7, layout)), "layout", label);
  await bent({ badCrc: true }, "header checksum");
  await bent({ flashLen: 0xff001 }, "image reaching the chip key sector");
  await bent({ appStart: 0x3000 }, "firmware area below 0x4000");
  await bent({ appStart: 0x5000 }, "firmware area elsewhere");
  await bent({ bootEnd: 0x4100 }, "boot head past 0x4000");
  await bent({ noApp: true }, "no firmware area");
  await bent({ pastEnd: true }, "image past the end of the file");
  for (const entry of JSON.parse(readFileSync(resolve(emulator, "firmwares.json"), "utf8")).firmwares.slice(0, 3)) {
    const name = entry.package;
    const real = new Uint8Array(readFileSync(resolve(emulator, name)));
    const l = packageLayout(real);
    assert.equal(l.appStart, 0x4000, name);
    assert.ok(l.bootEnd <= 0x4000 && l.flashLength < 0xff000, name);
  }
});

// ---------------------------------------------------------------- protocol, happy paths
await test("full install writes every byte and checks the new identity", async () => {
  const unit = unitFor();
  const steps = [];
  const id = await updater(unit).install(pkg.image, pkg.product, (p) => steps.push(p));
  assert.equal(id, pkg.product);
  assert.deepEqual(unit.written, pkg.image, "every byte written as served");
  assert.equal(unit.badAnswers, 0, "no answer failed its checksum");
  for (const p of ["start", "stage", "loader", "write", "reboot", "done"]) assert.ok(steps.includes(p), `step ${p}`);
});
await test("transient send failures are retried", async () => {
  const unit = unitFor({ fault: { sendFailures: 2 } });
  assert.equal(await updater(unit).install(pkg.image, pkg.product), pkg.product);
});
await test("detect never writes", async () => {
  const unit = unitFor();
  const r = await updater(unit).detect();
  assert.equal(r.found, true);
  assert.equal(r.id, "FM-1_900");
  assert.equal(unit.stage, undefined, "no update started");
});

// ---------------------------------------------------------------- failures, one per stage
await test("no MIDI at all", async () => {
  const access = { inputs: new Map(), outputs: new Map() };
  await failsWith(new Updater(access, null, { timing: FAST }).install(pkg.image, pkg.product), "nomidi", "nomidi");
});
await test("only other gear", async () => {
  const unit = unitFor({ others: ["Scarlett 2i2 USB"] });
  unit.detach();
  await failsWith(updater(unit).install(pkg.image, pkg.product), "noport", "noport");
});
await test("a port that never opens", async () => {
  await failsWith(updater(unitFor({ fault: { hangOpen: true } })).install(pkg.image, pkg.product), "busy", "busy");
});
await test("a device that is not an FM-1", async () => {
  await failsWith(updater(unitFor({ fault: { notFM1: true } })).install(pkg.image, pkg.product), "notfound", "notfound");
});
await test("wrong product", async () => {
  const unit = unitFor({ identity: "SMK-37_100" });
  await failsWith(updater(unit).install(pkg.image, pkg.product), "model", "model");
  assert.equal(unit.stage, undefined, "nothing started on the wrong unit");
});
await test("firmware without USB-MIDI updates", async () => {
  await failsWith(updater(unitFor({ fault: { noUpdateMode: true } })).install(pkg.image, pkg.product), "downloadmode", "downloadmode");
});
await test("unplugged while staging", async () => {
  await failsWith(updater(unitFor({ fault: { disconnectIn: "stage" } })).install(pkg.image, pkg.product), "lost", "lost in stage");
});
await test("silent while staging", async () => {
  await failsWith(updater(unitFor({ fault: { stallIn: "stage" } })).install(pkg.image, pkg.product), "stopped", "stopped in stage");
});
await test("loader never appears", async () => {
  await failsWith(updater(unitFor({ fault: { noLoader: true } })).install(pkg.image, pkg.product), "noloader", "noloader");
});
await test("unplugged while writing, then resumed", async () => {
  const unit = unitFor({ fault: { disconnectIn: "write", after: 3 } });
  await failsWith(updater(unit).install(pkg.image, pkg.product), "lost", "lost in write");
  unit.fault = {};
  unit.attach("loader");
  assert.equal(await updater(unit).resume(pkg.image, pkg.product), pkg.product, "resume finishes and verifies");
  assert.deepEqual(unit.written, pkg.image);
});
await test("a lost write is never retried on its own", async () => {
  const unit = unitFor({ fault: { disconnectIn: "write", after: 3 } });
  let sends = 0;
  const send = unit.output.send;
  unit.output.send = (b) => { sends++; return send(b); };
  await failsWith(updater(unit).install(pkg.image, pkg.product), "lost", "lost in write");
  const after = sends;
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(sends, after, "nothing is sent after the failure");
  unit.attach("loader");
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(unit.written.some((v, i) => i > 3 * 512 && v !== 0), false, "reconnecting alone writes nothing");
});
await test("silent while writing", async () => {
  await failsWith(updater(unitFor({ fault: { stallIn: "write" } })).install(pkg.image, pkg.product), "stopped", "stopped in write");
});
await test("request outside the image", async () => {
  await failsWith(updater(unitFor({ fault: { badRequest: true } })).install(pkg.image, pkg.product), "badreq", "badreq");
});
await test("never comes back after the write", async () => {
  await failsWith(updater(unitFor({ fault: { noReturn: true } })).install(pkg.image, pkg.product), "noreturn", "noreturn");
});
await test("comes back as something else", async () => {
  await failsWith(updater(unitFor({ fault: { returnAs: "FM-1_100" } })).install(pkg.image, pkg.product), "mismatch", "mismatch");
});
await test("already in update mode", async () => {
  const unit = unitFor({ startInLoader: true });
  await failsWith(updater(unit).install(pkg.image, pkg.product), "inupdate", "inupdate");
  assert.equal(await updater(unit).resume(pkg.image, pkg.product), pkg.product, "resume from the loader");
});
await test("rollback writes the previous package through the loader", async () => {
  const oldBytes = makePackage("FM-1_900", 2500, 99);
  const old = await validatePackage(oldBytes);
  const unit = new Unit({ image: old.image, target: old.product, startInLoader: true });
  assert.equal(await updater(unit).resume(old.image, old.product), "FM-1_900");
  assert.deepEqual(unit.written, old.image);
});
await test("resume with nothing in update mode", async () => {
  assert.equal(await updater(unitFor()).resume(pkg.image, pkg.product), null);
});
await test("unplugged before resume completes", async () => {
  const unit = unitFor({ startInLoader: true, fault: { disconnectIn: "write" } });
  await failsWith(updater(unit).resume(pkg.image, pkg.product), "lost", "lost in resume");
});

// ---------------------------------------------------------------- journal and messages
class Store { constructor() { this.m = new Map(); } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } }
await test("journal follows the install and survives a reload", async () => {
  const store = new Store();
  const j = new FlashJournal(store);
  j.begin({ fwId: "a", name: "A 1", product: "FM-1_900", sha256: "aa", previous: "FM-1_800" });
  for (const p of ["staging", "loader", "writing", "rebooting", "done"]) j.advance(p);
  assert.equal(new FlashJournal(store).read().status, "done");
  assert.equal(pendingRecovery(j.read()), null);
  j.begin({ fwId: "b", name: "B 2", product: "FM-1_904", sha256: "bb" });
  assert.deepEqual(j.read().lastGood, { fwId: "a", name: "A 1", product: "FM-1_900", sha256: "aa" }, "last good kept for rollback");
  assert.throws(() => j.advance("writing") && j.advance("staging"), /cannot go/, "no going backwards");
});
await test("pending recovery for each stopping point", async () => {
  const store = new Store();
  const j = new FlashJournal(store);
  j.begin({ fwId: "a", name: "A", product: "FM-1_900", sha256: "aa" });
  j.advance("staging"); j.fail("lost");
  assert.equal(pendingRecovery(j.read()).kind, "retry", "before the loader nothing was written");
  j.begin({ fwId: "a", name: "A", product: "FM-1_900", sha256: "aa" });
  for (const p of ["staging", "loader", "writing", "rebooting", "done"]) j.advance(p);
  j.begin({ fwId: "b", name: "B", product: "FM-1_904", sha256: "bb" });
  j.advance("staging"); j.advance("loader"); j.advance("writing");
  const crashed = pendingRecovery(new FlashJournal(store).read());
  assert.equal(crashed.kind, "resume", "a window closed mid-write resumes");
  assert.equal(crashed.rollback.fwId, "a", "and can roll back");
  j.fail("lost");
  assert.equal(pendingRecovery(j.read()).kind, "resume");
  j.save({ ...j.read(), status: "running", phase: "rebooting" });
  assert.equal(pendingRecovery(j.read()).kind, "restart");
  j.clear();
  assert.equal(pendingRecovery(j.read()), null);
  assert.equal(j.read().lastGood.fwId, "a");
});
await test("journal storage failures never stop an install", async () => {
  const full = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); }, removeItem() {} };
  const j = new FlashJournal(full);
  j.begin({ fwId: "a", name: "A", product: "FM-1_900", sha256: "aa" });
  assert.equal(j.unsaved, true, "the journal knows it was not saved");
  const log = new FlashLog(full);
  assert.doesNotThrow(() => log.add("start", { code: "x" }));
  assert.deepEqual(log.read(), []);
  const corrupt = { getItem: () => "{not json", setItem() {}, removeItem() {} };
  assert.equal(new FlashJournal(corrupt).read(), null, "a corrupt journal reads as none");
  assert.equal(pendingRecovery(new FlashJournal(corrupt).read()), null);
  assert.deepEqual(new FlashLog(corrupt).read(), []);
  const odd = new Store(); odd.setItem("fm1.flash-journal.v1", JSON.stringify({ status: "running", phase: "nonsense" }));
  assert.equal(pendingRecovery(new FlashJournal(odd).read()), null, "an unknown phase offers nothing");
});
await test("event log is bounded and keeps no paths, ports or serials", async () => {
  const store = new Store();
  const log = new FlashLog(store, undefined, 5);
  for (let i = 0; i < 9; i++) log.add(i < 4 ? "start" : "write", { code: i === 4 ? "lost" : null, product: "FM-1_904", mode: "install" });
  assert.equal(log.read().length, 5, "bounded");
  assert.equal(log.read()[0].code, "lost", "oldest dropped first");
  const e = log.add("C:\\Users\\someone\\x<script>", { code: "a".repeat(80), product: "FM-1_904\nserial=ABC", mode: "\\\\.\\PhysicalDrive5" });
  assert.deepEqual({ step: e.step, code: e.code, product: e.product, mode: e.mode }, { step: "other", code: "other", product: undefined, mode: undefined });
  const text = troubleshootingText({
    journal: { status: "failed", phase: "writing", code: "lost", name: "B 2", product: "FM-1_904", updated: 1, lastGood: { name: "A 1", product: "FM-1_900" } },
    log: log.read(), seen: { found: false, code: "nomidi" }, usb: { summary: "download mode (WL82 UBOOT1.00)" }, app: "FM-1 Emulator",
  });
  for (const want of ["step writing, failed (lost)", "other code=other", "write [install] FM-1_904", "Previous good install: A 1", "not found (nomidi)", "download mode"]) assert.ok(text.includes(want), want);
  assert.ok(!/C:|Users|someone|Physical|serial/.test(text), "no local paths, drives or serials");
});
await test("every updater failure has words and a next step", async () => {
  const codes = new Set([...readFileSync(resolve(emulator, "fm1ota.js"), "utf8").matchAll(/fail\('(\w+)'/g)].map((m) => m[1]));
  for (const code of [...codes, "badpackage", "layout", "checksum", "midiperm", "midiaccess", "sourcemismatch", "busy", "notfound", "nomidi", "noport"]) {
    assert.ok(HELP[code], `message for ${code}`);
    const x = explain(Object.assign(new Error("x"), { code }));
    assert.ok(x.what && x.next, `${code}: what and next`);
  }
});

console.log(`PASS: ${passed} flash tests (simulated FM-1: install, resume, rollback, every failure stage, journal).`);
