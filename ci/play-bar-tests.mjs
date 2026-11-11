#!/usr/bin/env node
// Focus / play-bar: canvas clicks must not exit focus; toolbar modules stay wired.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const text = (f) => readFileSync(resolve(root, f), "utf8");

const focus = text("site/emulator/focus-lcd.js");
assert.match(focus, /pointer-events:none/, "focus backdrop ignores pointer");
assert.doesNotMatch(focus, /veil\.onclick/, "backdrop does not exit focus on click");
assert.doesNotMatch(focus, /dblclick/, "canvas double-click does not toggle focus");
assert.match(focus, /window\.FM1Focus/, "focus API is exposed");

const bar = text("site/emulator/play-bar.js");
assert.match(bar, /emulator-play-bar/, "play toolbar is defined");
assert.match(bar, /epb-fullscreen/, "fullscreen control exists");
assert.match(bar, /epb-focus/, "focus control exists");

const html = text("site/emulator/index.html");
assert.match(html, /play-bar\.js/, "page loads play-bar");

const extras = text("site/emulator/extras.js");
assert.doesNotMatch(extras, /#fs-btn/, "legacy deck-head fullscreen button removed");

let n = 7;
console.log(`PASS: ${n} play-bar tests`);
