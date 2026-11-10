// MIDI ↔ emulator bridge helpers: channel remap + note-light tracker used so the on-screen
// piano / monitor stay locked to what the emulated device hears.
import assert from "node:assert/strict";
import {
  remapChannel, applyNoteLight, isActivityMessage, isFm1PortName, splitSysex,
  classifyDx7Sysex, fxMapFor, fxCcMessage, effectChannelConflict,
  parseRemoteFm1, parseFm1Ctrl, parsePanelAbsolute, isRecentRelease,
} from "../site/emulator/midi-bridge.js";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`ok   ${name}`); passed++; };

test("isFm1PortName matches FM-1 / M-VAVE / SMK BLE or USB names", () => {
  assert.equal(isFm1PortName("FM-1"), true);
  assert.equal(isFm1PortName("FM-1 MIDI"), true);
  assert.equal(isFm1PortName("M-VAVE FM1"), true);
  assert.equal(isFm1PortName("SMK-37"), true);
  assert.equal(isFm1PortName("Generic MIDI"), false);
});

test("remapChannel leaves bytes alone when channel is as-sent", () => {
  assert.deepEqual(remapChannel([0x91, 60, 100], 0), [0x91, 60, 100]);
});

test("remapChannel moves note-on/off and CC onto the chosen channel", () => {
  assert.deepEqual(remapChannel([0x90, 60, 100], 2), [0x91, 60, 100]);
  assert.deepEqual(remapChannel([0x80, 60, 0], 16), [0x8f, 60, 0]);
  assert.deepEqual(remapChannel([0xb0, 1, 64], 4), [0xb3, 1, 64]);
});

test("remapChannel does not touch realtime clock / start / stop", () => {
  assert.deepEqual(remapChannel([0xf8], 5), [0xf8]);
  assert.deepEqual(remapChannel([0xfa], 5), [0xfa]);
  assert.deepEqual(remapChannel([0xfc], 5), [0xfc]);
});

test("applyNoteLight tracks note on/off and all-notes-off", () => {
  const lit = new Set();
  assert.equal(applyNoteLight(lit, [0x90, 60, 100]), true);
  assert.ok(lit.has(60));
  assert.equal(applyNoteLight(lit, [0x90, 60, 100]), false); // already lit
  assert.equal(applyNoteLight(lit, [0x80, 60, 0]), true);
  assert.equal(lit.has(60), false);
  applyNoteLight(lit, [0x90, 64, 80]);
  applyNoteLight(lit, [0x90, 67, 80]);
  assert.equal(applyNoteLight(lit, [0xb0, 123, 0]), true);
  assert.equal(lit.size, 0);
});

test("note-on velocity 0 counts as note-off for lights", () => {
  const lit = new Set();
  applyNoteLight(lit, [0x90, 48, 1]);
  assert.equal(applyNoteLight(lit, [0x90, 48, 0]), true);
  assert.equal(lit.size, 0);
});

test("isActivityMessage skips MIDI clock ticks", () => {
  assert.equal(isActivityMessage([0xf8]), false);
  assert.equal(isActivityMessage([0x90, 60, 1]), true);
  assert.equal(isActivityMessage([0xfa]), true);
});

test("splitSysex extracts complete F0…F7 messages and ignores junk", () => {
  const a = [0xf0, 0x43, 0x00, 0xf7];
  const b = [0xf0, 0x01, 0xf7];
  const buf = Uint8Array.from([0x90, 60, 1, ...a, 0xfe, ...b, 0xf0, 0x02]);
  const msgs = splitSysex(buf);
  assert.equal(msgs.length, 2);
  assert.deepEqual([...msgs[0]], a);
  assert.deepEqual([...msgs[1]], b);
  assert.deepEqual(splitSysex([]), []);
  assert.deepEqual(splitSysex([0x90, 60, 100]), []);
});

test("classifyDx7Sysex spots bank vs voice vs other", () => {
  const voice = Uint8Array.from([0xf0, 0x43, 0x00, 0x00, 0x01, 0x1b, ...Array(155).fill(0), 0xf7]);
  const bank = Uint8Array.from([0xf0, 0x43, 0x00, 0x09, 0x20, 0x00, ...Array(4090).fill(0), 0xf7]);
  assert.equal(classifyDx7Sysex(voice).kind, "voice");
  assert.equal(classifyDx7Sysex(bank).kind, "bank");
  assert.equal(classifyDx7Sysex([0xf0, 0x7e, 0xf7]).kind, "other");
});

test("fxMapFor switches V15 vs V16 CC bases", () => {
  assert.equal(fxMapFor("15")[0].cc, 0);
  assert.equal(fxMapFor("16")[0].cc, 70);
  assert.deepEqual(fxCcMessage(2, 7, 64), [0xb1, 7, 64]);
});

test("effectChannelConflict warns only when play equals effect", () => {
  assert.equal(effectChannelConflict(0, 2), "");
  assert.equal(effectChannelConflict(1, 2), "");
  assert.match(effectChannelConflict(2, 2), /Effect Chn/);
});

test("parseRemoteFm1 maps ch16 keys and relative encoders", () => {
  assert.deepEqual(parseRemoteFm1([0x9f, 5, 100]), { type: "key", id: 5, on: true, vel: 100 });
  assert.deepEqual(parseRemoteFm1([0x9e, 3, 127]), { type: "button", id: 3, on: true });
  const enc = parseRemoteFm1([0xb0, 16, 65]);
  assert.equal(enc.type, "enc");
  assert.equal(enc.enc, 0);
  assert.equal(enc.clicks, 1);
});

test("parseFm1Ctrl maps notes 53–79 and CC20 relative", () => {
  assert.deepEqual(parseFm1Ctrl([0x90, 53, 90]), { type: "key", id: 0, on: true, vel: 90 });
  assert.deepEqual(parseFm1Ctrl([0xb0, 40, 127]), { type: "button", id: 0, on: true });
  assert.equal(parseFm1Ctrl([0xb0, 20, 63]).clicks, -1);
});

test("parsePanelAbsolute maps CC20–26", () => {
  assert.deepEqual(parsePanelAbsolute([0xb0, 22, 40]), { type: "encAbs", enc: 2, value: 40 });
  assert.equal(parsePanelAbsolute([0x90, 60, 1]), null);
});

test("isRecentRelease uses day window", () => {
  const now = Date.parse("2026-11-10");
  assert.equal(isRecentRelease("2026-11-05", 14, now), true);
  assert.equal(isRecentRelease("2026-01-01", 14, now), false);
  assert.equal(isRecentRelease("", 14, now), false);
});

console.log(`PASS: ${passed} midi-bridge tests`);
