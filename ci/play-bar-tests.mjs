#!/usr/bin/env node
// Focus / play-bar: open from toolbar, close via overlay ✕; canvas never toggles focus.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const text = (f) => readFileSync(resolve(root, f), "utf8");

const focus = text("site/emulator/focus-lcd.js");
assert.match(focus, /pointer-events:none/, "focus backdrop ignores pointer");
assert.doesNotMatch(focus, /veil\.onclick/, "backdrop does not exit focus on click");
assert.doesNotMatch(focus, /dblclick/, "canvas double-click does not toggle focus");
assert.match(focus, /focus-lcd-close/, "focus overlay has close control");
assert.match(focus, /focus-lcd-close[\s\S]*setFocus\(false\)/, "close ✕ exits focus");
assert.match(focus, /open:\s*\(\)\s*=>\s*\{/, "focus API supports open");
assert.doesNotMatch(focus, /toggle:\s*\(\)\s*=>/, "focus API does not expose toggle");

const bar = text("site/emulator/play-bar.js");
assert.match(bar, /emulator-play-bar/, "play toolbar is defined");
assert.match(bar, /epb-fullscreen/, "fullscreen control exists");
assert.match(bar, /epb-focus/, "focus opener exists");
assert.match(bar, /FM1Focus\.open/, "toolbar opens focus");
assert.doesNotMatch(bar, /FM1Focus\.toggle\(\)/, "toolbar does not toggle-close focus");
assert.doesNotMatch(bar, /Exit focus/i, "toolbar is not the close control");

const html = text("site/emulator/index.html");
assert.match(html, /play-bar\.js/, "page loads play-bar");

const extras = text("site/emulator/extras.js");
assert.doesNotMatch(extras, /#fs-btn/, "legacy deck-head fullscreen button removed");

let n = 13;
console.log(`PASS: ${n} play-bar tests`);
