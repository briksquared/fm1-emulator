#!/usr/bin/env node
// Focus / play-bar: open from deck header, close via overlay ✕; canvas never toggles focus.
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
assert.match(focus, /--focus-lcd-scale/, "focus scale is computed, not fixed");
assert.doesNotMatch(focus, /scale\(2\.4\)/, "focus does not use a hard-coded 2.4 scale");
assert.match(focus, /getBoundingClientRect/, "focus scale uses measured canvas layout");

const bar = text("site/emulator/play-bar.js");
assert.match(bar, /fm1-flash-btn/, "play-bar waits for Flash button");
assert.match(bar, /deck-head/, "controls mount in deck header");
assert.doesNotMatch(bar, /emulator-play-bar/, "standalone panel bar removed");
assert.doesNotMatch(bar, /stage\.insertBefore/, "controls are not injected above canvas");
assert.match(bar, /epb-fullscreen/, "fullscreen control exists");
assert.match(bar, /epb-focus/, "focus opener exists");
assert.doesNotMatch(bar, /epb-voice|toggleSpeak|Speak status/, "voice control not in UI");
assert.match(bar, /FM1Focus\.open/, "header opens focus");
assert.doesNotMatch(bar, /FM1Focus\.toggle\(\)/, "header does not toggle-close focus");
assert.doesNotMatch(bar, /Exit focus/i, "header is not the close control");

const html = text("site/emulator/index.html");
assert.match(html, /play-bar\.js/, "page loads play-bar");
assert.doesNotMatch(html, /above the panel/i, "copy does not say focus is above panel");

const extras = text("site/emulator/extras.js");
assert.doesNotMatch(extras, /#fs-btn/, "legacy deck-head fullscreen button removed");

let n = 20;
console.log(`PASS: ${n} play-bar tests`);
