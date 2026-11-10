// Unit-test the public firmware radar: open-license filter, merge safety, scan classification,
// and pending-review helpers. No network — every catalog answer is a stand-in.
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(resolve(here, "../site/emulator/catalog-updates.js")).href);
const {
  scanCatalog, mergeCatalog, fromCatalog, fromHub, isSafeRemembered,
  compareVersions, classifyScan, CATALOG_URL,
} = mod;

const hash = (c) => c.repeat(64);
const listed = (id, extra = {}) => ({
  id, name: id.toUpperCase(), version: "1.0.0", product: "FM-1_904",
  pkg: `fw/${id}.fwsc`, sha256: hash("a"), date: "2026-11-01",
  lic: "GPL-3.0", repo: "someone/" + id, ...extra,
});
const answer = (body, status = 200) => async (url, opts) => {
  assert.ok(String(url).startsWith(String(CATALOG_URL)), "the scan asks the catalog");
  assert.equal(opts?.cache, "no-store", "a scan never reads a cached answer");
  return { ok: status < 400, status, json: async () => (typeof body === "string" ? JSON.parse(body) : body) };
};
const bundled = { firmwares: [{ id: "felucca", name: "Felucca", version: "1.8.2", sourceId: "felucca" }] };
let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log("ok  ", name); };

await test("compareVersions orders numeric and pre-release tags", () => {
  assert.ok(compareVersions("1.10.0", "1.9.0") > 0);
  assert.ok(compareVersions("2.0.0-beta", "2.0.0") < 0);
  assert.equal(compareVersions("1.8.2", "1.8.2"), 0);
});

await test("new and newer firmwares are found", async () => {
  const r = await scanCatalog(bundled, answer({ firmwares: [listed("felucca", { version: "1.9.0" }), listed("fresh")] }));
  assert.deepEqual(r.fresh.map((e) => e.id), ["fresh"]);
  assert.deepEqual(r.updated.map((e) => e.id), ["felucca"]);
  assert.equal(r.checked, 2);
  assert.equal(r.newCount, 1);
  assert.equal(r.updateCount, 1);
});

await test("closed licenses are counted and skipped", async () => {
  const r = await scanCatalog(bundled, answer({
    firmwares: [listed("open"), listed("paid", { lic: "Proprietary" }), listed("blank", { lic: "" })],
  }));
  assert.equal(r.checked, 1);
  assert.equal(r.closedLicense, 2);
  assert.equal(r.liveTotal, 3);
  assert.deepEqual(r.fresh.map((e) => e.id), ["open"]);
});

await test("an older or equal version is not an update", async () => {
  const r = await scanCatalog(bundled, answer({ firmwares: [listed("felucca", { version: "1.8.2" }), listed("x")] }));
  assert.equal(r.updated.length, 0);
  assert.equal(r.same, 1);
});

await test("no answer in time is a timeout error", async () => {
  const hang = (_u, { signal }) => new Promise((_r, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
  await assert.rejects(scanCatalog(bundled, hang, { timeoutMs: 30 }), /did not answer within/);
});

await test("an HTTP error is an error", async () => {
  await assert.rejects(scanCatalog(bundled, answer({}, 503)), /HTTP 503/);
});

await test("an answer that is not JSON is an error", async () => {
  await assert.rejects(scanCatalog(bundled, answer("<html>")), /not valid JSON/);
});

await test("an unknown format is an error, not an empty list", async () => {
  await assert.rejects(scanCatalog(bundled, answer({ items: [] })), /format was not recognised/);
  await assert.rejects(scanCatalog(bundled, answer(null)), /format was not recognised/);
});

await test("a list with no open-licensed readable entry is an error", async () => {
  await assert.rejects(
    scanCatalog(bundled, answer({ firmwares: [{ id: "bad" }, listed("x", { pkg: "../evil.fwsc" }), listed("closed", { lic: "Proprietary" })] })),
    /no open-licensed FM-1 package/,
  );
});

await test("an id listed twice counts once, keeping the newest", async () => {
  const r = await scanCatalog(bundled, answer({
    firmwares: [
      listed("dup", { date: "2026-01-01", sha256: hash("b") }),
      listed("dup", { date: "2026-10-01", sha256: hash("c") }),
    ],
  }));
  assert.equal(r.fresh.length, 1);
  assert.equal(r.fresh[0].sha256, hash("c"));
});

await test("a find the live list dropped stays remembered", async () => {
  const before = await scanCatalog(bundled, answer({ firmwares: [listed("gone"), listed("kept")] }));
  const after = await scanCatalog(bundled, answer({ firmwares: [listed("kept")] }), { previous: before.remember });
  assert.deepEqual(after.remember.map((e) => e.id).sort(), ["gone", "kept"]);
  assert.ok(after.kept >= 1);
});

await test("already-remembered live finds count as already, not new", async () => {
  const first = await scanCatalog(bundled, answer({ firmwares: [listed("stay")] }));
  const again = await scanCatalog(bundled, answer({ firmwares: [listed("stay")] }), { previous: first.remember });
  assert.equal(again.newCount, 0);
  assert.equal(again.already, 1);
  const rows = classifyScan(again, first.remember, { includeKept: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "kept");
});

await test("a remembered find that gained a newer live version is an update", async () => {
  const first = await scanCatalog(bundled, answer({ firmwares: [listed("grow", { version: "1.0.0", sha256: hash("a") })] }));
  const next = await scanCatalog(bundled, answer({
    firmwares: [listed("grow", { version: "1.1.0", sha256: hash("b") })],
  }), { previous: first.remember });
  assert.equal(next.updateCount, 1);
  assert.equal(next.newCount, 0);
  const rows = classifyScan(next, first.remember);
  assert.equal(rows[0].kind, "update");
  assert.equal(rows[0].fromVersion, "1.0.0");
});

await test("unsafe remembered entries are ignored", async () => {
  const good = fromCatalog(listed("ok"));
  assert.ok(isSafeRemembered(good));
  assert.equal(isSafeRemembered({ ...good, package: "https://elsewhere.example/fw/ok.fwsc" }), false);
  assert.equal(isSafeRemembered({ ...good, sha256: "zz" }), false);
  assert.equal(isSafeRemembered({ ...good, sourceId: "other" }), false);
  assert.equal(isSafeRemembered({ ...good, license: "Proprietary" }), false);
  assert.equal(isSafeRemembered({ ...good, repo: "https://gitlab.com/x/y" }), false);
  const merged = mergeCatalog(bundled, [good, { ...good, id: "evil", sourceId: "evil", package: "file:///c:/x.fwsc" }]);
  assert.deepEqual(merged.firmwares.map((f) => f.id), ["ok", "felucca"]);
});

await test("a newer version takes its firmware's place under the same id", async () => {
  const r = await scanCatalog(bundled, answer({ firmwares: [listed("felucca", { version: "2.0.0", sha256: hash("d") })] }));
  const merged = mergeCatalog(bundled, r.remember);
  assert.equal(merged.firmwares.length, 1);
  assert.equal(merged.firmwares[0].id, "felucca");
  assert.equal(merged.firmwares[0].version, "2.0.0");
  assert.equal(merged.firmwares[0].bundledVersion, "1.8.2");
  assert.equal(merged.firmwares[0].radarUpdate, true);
});

await test("release dates are kept only when they are dates", () => {
  assert.equal(fromCatalog(listed("d", { date: "soon" })).released, "");
  assert.equal(fromCatalog(listed("d", { published: "2026-11-02T10:00:00Z" })).released, "2026-11-02T10:00:00Z");
});

await test("fromHub rejects missing license and wrong device", () => {
  const live = listed("test-open", { lic: "GPL-3.0", source: "https://github.com/example/test-open" });
  assert.equal(fromHub({ ...live, lic: "" }), null);
  assert.equal(fromHub({ ...live, product: "SMK-37_123" }), null);
  assert.ok(fromHub(live).remote);
});

await test("classifyScan marks true newcomers as new", async () => {
  const r = await scanCatalog(bundled, answer({ firmwares: [listed("brand-new"), listed("felucca", { version: "9.0.0", sha256: hash("e") })] }));
  const rows = classifyScan(r, []);
  assert.deepEqual(rows.map((row) => [row.kind, row.entry.id]).sort(), [["new", "brand-new"], ["update", "felucca"]]);
});

console.log(`PASS: ${n} radar tests`);
