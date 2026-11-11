import assert from "node:assert/strict";
import fs from "node:fs";
const src = fs.readFileSync(new URL("../site/emulator/jit-policy.js", import.meta.url), "utf8");
const { jitEnabled, usesWorkerEngine, JIT_SLOWER, jitQueryForToggle } =
  await import("data:text/javascript," + encodeURIComponent(src));

const p = (q) => new URLSearchParams(q);

const tests = {
  "worker defaults JIT on": () =>
    assert.equal(jitEnabled({ worker: true, fwId: "felucca", params: p("") }), true),
  "worker ?jit=0 turns off": () =>
    assert.equal(jitEnabled({ worker: true, fwId: "felucca", params: p("jit=0") }), false),
  "dark1 defaults JIT off on worker": () =>
    assert.equal(jitEnabled({ worker: true, fwId: "dark1", params: p("") }), false),
  "dark1 ?jit=1 forces JIT": () =>
    assert.equal(jitEnabled({ worker: true, fwId: "dark1", params: p("jit=1") }), true),
  "audio thread needs ?jit=1": () =>
    assert.equal(jitEnabled({ worker: false, fwId: "felucca", params: p("") }), false),
  "toggle off on worker sets jit=0": () => {
    const q = jitQueryForToggle({ worker: true, wantOn: false });
    assert.deepEqual(q, { set: { jit: "0" } });
  },
  "toggle on for slower firmware sets jit=1 on worker": () => {
    const q = jitQueryForToggle({ worker: true, wantOn: true, fwId: "dark1" });
    assert.deepEqual(q, { set: { jit: "1" } });
  },
  "slower set includes dark1": () => assert.ok(JIT_SLOWER.has("dark1")),
  "worklet engine param disables worker path": () =>
    assert.equal(usesWorkerEngine(p("engine=worklet")), false),
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log("ok  ", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", e.message); }
}
if (failed) process.exit(1);
console.log(`jit-policy tests: ${Object.keys(tests).length} passed`);
