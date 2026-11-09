// The dropout notice: when a second counts against the device, and when it says nothing.
import assert from "node:assert/strict";
import fs from "node:fs";
// (loaded from source: the page serves it as a plain script module, without a package type)
const src = fs.readFileSync(new URL("../site/emulator/perf-judge.js", import.meta.url), "utf8");
const { judgeSecond, GRACE_SECONDS, BAD_SECONDS } = await import("data:text/javascript," + encodeURIComponent(src));

const fresh = () => ({ secs: 0, bad: 0, dryAt: null });
const ok = { state: "running", hidden: false, gap: 1000, drift: 0.0002, load: 0.4, worker: true, halted: false };
function run(seconds) {
  const st = fresh(); let warned = 0, dry = 0;
  for (const s of seconds) { dry += s.newDry || 0; if (judgeSecond(st, { ...ok, ...s, dry }).warn) warned++; }
  return warned;
}
const steady = (n, s = {}) => Array.from({ length: n }, () => ({ ...s }));
const tests = {
  "steady playback never warns": () => assert.equal(run(steady(120)), 0),
  "a boot burst in the first seconds is ignored": () =>
    assert.equal(run([{ newDry: 30, load: 1.5 }, { newDry: 20, load: 1.2 }, { newDry: 5 }, { newDry: 4 }, { newDry: 3 }, ...steady(30)]), 0),
  "a reboot later on (Random, a clock change) is ignored": () => {
    const st = fresh(); let dry = 0, warned = 0;
    for (let i = 0; i < 20; i++) judgeSecond(st, { ...ok, dry });
    st.secs = 0;                                   // perf.reset() on every boot
    for (const d of [25, 10, 4, 3, 0, 0, 0, 0]) { dry += d; if (judgeSecond(st, { ...ok, dry }).warn) warned++; }
    assert.equal(warned, 0);
  },
  "a stalled clock (sleep, device change, hidden page) is not a dropout": () => {
    assert.equal(run([...steady(8), ...steady(10, { drift: 0.89, newDry: 40 })]), 0);
    assert.equal(run([...steady(8), ...steady(10, { hidden: true, newDry: 40 })]), 0);
    assert.equal(run([...steady(8), ...steady(10, { state: "suspended", newDry: 40 })]), 0);
    assert.equal(run([...steady(8), ...steady(10, { gap: 5000, newDry: 40 })]), 0);
  },
  "a single bad second is forgiven": () =>
    assert.equal(run([...steady(8), { newDry: 50 }, ...steady(5), { newDry: 50 }, ...steady(5)]), 0),
  "sustained dropouts warn": () =>
    assert.ok(run([...steady(GRACE_SECONDS + 1), ...steady(BAD_SECONDS, { newDry: 6 })]) >= 1),
  "a device at its limit warns on load": () =>
    assert.ok(run([...steady(GRACE_SECONDS + 1), ...steady(BAD_SECONDS, { load: 0.99 })]) >= 1),
  "the worker engine ignores small clock drift": () =>
    assert.equal(run(steady(30, { drift: 0.05 })), 0),
  "the in-thread engine still warns on drift": () =>
    assert.ok(run(steady(GRACE_SECONDS + BAD_SECONDS, { worker: false, drift: 0.05 })) >= 1),
  "a halted firmware never warns": () =>
    assert.equal(run(steady(20, { halted: true, newDry: 40 })), 0),
};
let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log("ok  ", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", e.message); }
}
if (failed) process.exit(1);
console.log(`perf tests: ${Object.keys(tests).length} passed`);
