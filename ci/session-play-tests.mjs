import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../site/emulator/session-play.js", import.meta.url), "utf8");
const { mayEnsurePlaying, autostartFromParams, SESSION_KEY, SESSION_CLASS } =
  await import("data:text/javascript," + encodeURIComponent(src));

const tests = {
  "cold start needs user or live session": () => {
    assert.equal(mayEnsurePlaying({ cold: true, fromUser: false, live: false }), false);
    assert.equal(mayEnsurePlaying({ cold: true, fromUser: false, live: true }), true);
    assert.equal(mayEnsurePlaying({ cold: true, fromUser: true, live: false }), true);
  },
  "warm path always allowed": () =>
    assert.equal(mayEnsurePlaying({ cold: false, fromUser: false }), true),
  "autostart only with explicit param": () => {
    assert.equal(autostartFromParams(new URLSearchParams(""), false), false);
    assert.equal(autostartFromParams(new URLSearchParams("autostart=1"), false), true);
    assert.equal(autostartFromParams(new URLSearchParams("autostart=1"), true), false);
  },
  "session constants are stable": () => {
    assert.equal(SESSION_KEY, "fm1.audio");
    assert.equal(SESSION_CLASS, "fm1-session");
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log("ok  ", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", e.message); }
}
if (failed) process.exit(1);
console.log(`session-play tests: ${Object.keys(tests).length} passed`);
