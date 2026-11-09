// The firmware radar against a catalog that misbehaves: no answer, HTTP errors, not JSON, a new
// format, junk and hostile entries, duplicates, and an entry that disappears. Nothing here
// touches the network; every answer is a stand-in fetch.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const mod = await import(`data:text/javascript;base64,${readFileSync(new URL("../site/emulator/catalog-updates.js", import.meta.url)).toString("base64")}`);
const { fromCatalog, mergeCatalog, scanOpenFirmwareUpdates, isSafeRemembered, CATALOG_URL } = mod;

const good = (over = {}) => ({
  id: "test-open", name: "Test Open", version: "2.0", published: "2026-11-09T12:00:00Z", kind: "synth",
  author: "tester", lic: "GPL-3.0", what: "Test entry", pkg: "fw/test-open-2.0.fwsc",
  sha256: "a".repeat(64), product: "FM-1_123", source: "https://github.com/example/test-open/tree/v2.0", ...over,
});
const bundled = { firmwares: [{ id: "felucca", name: "Felucca", catalogId: "felucca", sha256: "b".repeat(64) }] };
const answer = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => (typeof body === "string" ? JSON.parse(body) : body) });
const scan = (fetchFn, opts) => scanOpenFirmwareUpdates(bundled, bundled, fetchFn, opts);

const tests = {
  async "an HTTP error keeps the catalog (throws, says why)"() {
    await assert.rejects(scan(answer({}, 503)), /HTTP 503/);
  },
  async "a network failure is passed on"() {
    await assert.rejects(scan(async () => { throw new TypeError("Failed to fetch"); }), /Failed to fetch/);
  },
  async "no answer in time is a timeout, not a hang"() {
    const hang = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    const t0 = Date.now();
    await assert.rejects(scan(hang, { timeoutMs: 50 }), /did not answer within/);
    assert.ok(Date.now() - t0 < 2000);
  },
  async "a body that is not JSON"() {
    await assert.rejects(scan(answer("<html>maintenance</html>")), /not valid JSON/);
  },
  async "a format this version doesn't know"() {
    await assert.rejects(scan(answer({ items: [good()] })), /format was not recognised/);
    await assert.rejects(scan(answer(null)), /format was not recognised/);
    await assert.rejects(scan(answer({ firmwares: "x" })), /format was not recognised/);
  },
  async "a list with no readable entry does not wipe what was found before"() {
    await assert.rejects(scan(answer({ firmwares: [{ id: 1 }, null, "x", good({ lic: "" })] })), /no open-license/);
  },
  async "hostile entries are dropped"() {
    const bad = [
      good({ id: "js", source: "javascript:alert(1)" }),
      good({ id: "http", source: "http://github.com/a/b" }),
      good({ id: "elsewhere", source: "https://github.com.evil.example/a/b" }),
      good({ id: "pkg-escape", pkg: "../../etc/passwd.fwsc" }),
      good({ id: "pkg-abs", pkg: "https://evil.example/fw/x.fwsc" }),
      good({ id: "pkg-sub", pkg: "fw/a/b.fwsc" }),
      good({ id: "../x" }), good({ id: "a".repeat(90) }),
      good({ id: "hash", sha256: "zz" }), good({ id: "smk", product: "SMK-37_1" }),
    ];
    for (const entry of bad) assert.equal(fromCatalog(entry), null, entry.id);
  },
  async "metadata stays text, and is bounded"() {
    const e = fromCatalog(good({ name: "<img src=x onerror=alert(1)>", what: "x".repeat(5000), author: { toString: () => "obj" }, published: { evil: 1 } }));
    assert.equal(e.name, "<img src=x onerror=alert(1)>");   // stored as text; the page renders it with textContent / esc()
    assert.equal(e.about.length, 1200);
    assert.equal(e.released, "");
    assert.ok(e.package.startsWith(new URL("./fw/", CATALOG_URL).href));
  },
  async "an id listed twice counts once and keeps the newest"() {
    const r = await scan(answer({ firmwares: [good({ version: "1.0", published: "2026-01-01T00:00:00Z", sha256: "c".repeat(64) }), good()] }));
    assert.equal(r.checked, 1); assert.equal(r.newCount, 1); assert.equal(r.remember.length, 1);
    assert.equal(r.remember[0].version, "2.0");
  },
  async "an entry the live list dropped stays remembered"() {
    const earlier = fromCatalog(good({ id: "gone", pkg: "fw/gone-1.fwsc" }));
    assert.ok(isSafeRemembered(earlier));
    const r = await scan(answer({ firmwares: [good()] }), { previous: [earlier] });
    assert.deepEqual(r.remember.map((e) => e.id).sort(), ["gone", "test-open"]);
  },
  async "a scan result merges with the bundled list without duplicates"() {
    const r = await scan(answer({ firmwares: [good(), good({ id: "felucca", sha256: "d".repeat(64), pkg: "fw/felucca-9.fwsc" })] }));
    const merged = mergeCatalog(bundled, r.remember);
    assert.equal(merged.firmwares.filter((f) => f.id === "felucca").length, 1);
    assert.equal(merged.firmwares.find((f) => f.id === "felucca").sha256, "d".repeat(64));
    assert.equal(r.updateCount, 1);
  },
  async "unsafe remembered data from storage never merges"() {
    const merged = mergeCatalog(bundled, [null, 5, { id: "x", remote: true }, { ...fromCatalog(good()), package: "https://evil.example/fw/x.fwsc" }]);
    assert.deepEqual(merged.firmwares.map((f) => f.id), ["felucca"]);
  },
};
let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { await fn(); console.log("ok  ", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", e.message); }
}
if (failed) process.exit(1);
console.log(`radar tests: ${Object.keys(tests).length} passed`);
