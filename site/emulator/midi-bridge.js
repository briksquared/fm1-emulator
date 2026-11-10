// Shared MIDI helpers: channel remap, note lights, SysEx split, stock FX maps,
// hardware panel maps (A/B/C), and DX7 dump classification.

/** True for port names that look like an FM-1 / M-VAVE / SMK (USB or BLE MIDI). */
export function isFm1PortName(name) {
  return /fm[\s_-]?1|mutable\s*dreams|m[\s-]?vave|smk[\s-]?37/i.test(String(name || ""));
}

export function remapChannel(bytes, ch) {
  if (!bytes || !bytes.length) return [];
  const out = Array.from(bytes);
  if (ch && out[0] >= 0x80 && out[0] < 0xf0) out[0] = (out[0] & 0xf0) | ((ch - 1) & 0x0f);
  return out;
}

/** Update a Set of sounding MIDI note numbers from one message. Returns true if the set changed. */
export function applyNoteLight(set, bytes) {
  if (!set || !bytes || !bytes.length) return false;
  const st = bytes[0] & 0xf0;
  if (st === 0x90 && bytes[2] > 0) {
    const n = bytes[1] & 0x7f;
    if (set.has(n)) return false;
    set.add(n);
    return true;
  }
  if (st === 0x80 || (st === 0x90 && !(bytes[2] > 0))) {
    const n = bytes[1] & 0x7f;
    if (!set.has(n)) return false;
    set.delete(n);
    return true;
  }
  if (st === 0xb0 && (bytes[1] === 123 || bytes[1] === 120)) {
    if (!set.size) return false;
    set.clear();
    return true;
  }
  return false;
}

/** True for messages worth showing as activity (skip only the 24‑ppqn clock tick). */
export function isActivityMessage(bytes) {
  return !!(bytes && bytes.length && bytes[0] !== 0xf8);
}

/**
 * Split a .syx / dump buffer into complete SysEx messages (F0 … F7).
 * Ignores stray bytes between messages. Empty / non-SysEx buffers yield [].
 */
export function splitSysex(bytes) {
  const src = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);
  const msgs = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] !== 0xf0) { i++; continue; }
    let j = i + 1;
    while (j < src.length && src[j] !== 0xf7) j++;
    if (j >= src.length) break;
    msgs.push(src.subarray(i, j + 1));
    i = j + 1;
  }
  return msgs;
}

/** Classify a Yamaha DX7 dump SysEx (single voice ~163 B or 32-voice bank ~4104 B). */
export function classifyDx7Sysex(msg) {
  const m = msg instanceof Uint8Array ? msg : Uint8Array.from(msg || []);
  if (m.length < 6 || m[0] !== 0xf0 || m[1] !== 0x43) return { kind: "other", size: m.length };
  // F0 43 0n 00 01 1B … single; F0 43 0n 09 20 00 … bank
  const fmt = m[3] & 0x7f;
  if (fmt === 0x00 && m.length >= 160) return { kind: "voice", size: m.length };
  if (fmt === 0x09 && m.length >= 4000) return { kind: "bank", size: m.length };
  if (m.length >= 4000) return { kind: "bank", size: m.length };
  if (m.length >= 150 && m.length <= 200) return { kind: "voice", size: m.length };
  return { kind: "other", size: m.length };
}

/** M-VAVE identity request (vendor SysEx). */
export const FM1_IDENTITY_REQ = Object.freeze([0xf0, 0x00, 0x32, 0x45, 0x00, 0x00, 0x00, 0x40, 0x7f, 0xf7]);

/** Stock FX CC tables: V15 uses CC 0–23; V16 moved effects to CC 70–93. */
export const FX_CC_V15 = Object.freeze([
  { cc: 0, fx: "Filter", param: "On/off", max: 1 },
  { cc: 1, fx: "Filter", param: "Type", max: 2 },
  { cc: 2, fx: "Filter", param: "Cutoff", max: 107 },
  { cc: 3, fx: "Filter", param: "Q", max: 10 },
  { cc: 4, fx: "Reverb", param: "On/off", max: 1 },
  { cc: 5, fx: "Reverb", param: "Type", max: 2 },
  { cc: 6, fx: "Reverb", param: "Decay", max: 100 },
  { cc: 7, fx: "Reverb", param: "Mix", max: 100 },
  { cc: 8, fx: "Delay", param: "On/off", max: 1 },
  { cc: 9, fx: "Delay", param: "Decay", max: 100 },
  { cc: 10, fx: "Delay", param: "Rate", max: 100 },
  { cc: 11, fx: "Delay", param: "Mix", max: 100 },
  { cc: 12, fx: "Distortion", param: "On/off", max: 1 },
  { cc: 13, fx: "Distortion", param: "Gain", max: 100 },
  { cc: 14, fx: "Distortion", param: "Tone", max: 100 },
  { cc: 15, fx: "Distortion", param: "Level", max: 100 },
  { cc: 16, fx: "Chorus", param: "On/off", max: 1 },
  { cc: 17, fx: "Chorus", param: "Freq", max: 100 },
  { cc: 18, fx: "Chorus", param: "Depth", max: 100 },
  { cc: 19, fx: "Chorus", param: "Mix", max: 100 },
  { cc: 20, fx: "Phaser", param: "On/off", max: 1 },
  { cc: 21, fx: "Phaser", param: "Freq", max: 100 },
  { cc: 22, fx: "Phaser", param: "Depth", max: 100 },
  { cc: 23, fx: "Phaser", param: "Mix", max: 100 },
]);

export const FX_CC_V16 = Object.freeze(FX_CC_V15.map((r) => ({ ...r, cc: r.cc + 70 })));

export function fxMapFor(version) {
  return String(version || "").toLowerCase().includes("16") ? FX_CC_V16 : FX_CC_V15;
}

/** Build a CC message on the given 1–16 channel. */
export function fxCcMessage(ch, cc, value) {
  const channel = Math.max(1, Math.min(16, ch | 0));
  const v = Math.max(0, Math.min(127, value | 0));
  return [0xb0 | ((channel - 1) & 0x0f), cc & 0x7f, v];
}

/**
 * Warn when play channel collides with Effect Chn (mod wheel / sustain eaten by FX).
 * Returns a short string or "".
 */
export function effectChannelConflict(playCh, effectCh) {
  const p = Number(playCh) || 0;
  const e = Number(effectCh) || 0;
  if (!p || !e || p !== e) return "";
  return `Play channel ${p} is also Effect Chn — mod wheel (CC1) and sustain can be eaten by FX. Use a different play channel or Effect Chn.`;
}

/**
 * Panel map A (plain MIDI into the host):
 *  ch16 notes → keys 0..26, ch15 notes → buttons, CC16–22 relative encoders, CC7/39 MASTER.
 * Returns { type, ... } or null if not a panel message.
 */
export function parseRemoteFm1(bytes) {
  if (!bytes || !bytes.length) return null;
  const st = bytes[0] & 0xf0, ch = (bytes[0] & 0x0f) + 1;
  if (st === 0x90 || st === 0x80) {
    const on = st === 0x90 && bytes[2] > 0;
    const note = bytes[1] & 0x7f;
    if (ch === 16 && note >= 0 && note <= 26) return { type: "key", id: note, on, vel: bytes[2] & 0x7f };
    if (ch === 15 && note >= 0 && note <= 20) return { type: "button", id: note, on };
  }
  if (st === 0xb0) {
    const cc = bytes[1] & 0x7f, val = bytes[2] & 0x7f;
    if (cc >= 16 && cc <= 22) {
      const det = val >= 64 ? val - 128 : val; // two's relative often; also accept 64-centre
      const clicks = val === 0 ? 0 : (val > 64 ? val - 64 : val < 64 ? -(64 - val) : (det || 0));
      // Prefer 64-centre relative (common): 65 = +1, 63 = -1
      const rel = val >= 64 ? val - 64 : -(64 - val);
      return { type: "enc", enc: cc - 16, clicks: rel || clicks };
    }
    if (cc === 7) return { type: "master7", msb: val };
    if (cc === 39) return { type: "master39", lsb: val };
  }
  return null;
}

/**
 * Panel map B:
 *  notes 53..79 keys, CC20–26 relative enc (64+), CC40–53 buttons, CC27 master 7-bit.
 */
export function parseFm1Ctrl(bytes) {
  if (!bytes || !bytes.length) return null;
  const st = bytes[0] & 0xf0;
  if (st === 0x90 || st === 0x80) {
    const on = st === 0x90 && bytes[2] > 0;
    const note = bytes[1] & 0x7f;
    if (note >= 53 && note <= 79) return { type: "key", id: note - 53, on, vel: bytes[2] & 0x7f };
  }
  if (st === 0xb0) {
    const cc = bytes[1] & 0x7f, val = bytes[2] & 0x7f;
    if (cc >= 20 && cc <= 26) return { type: "enc", enc: cc - 20, clicks: val >= 64 ? val - 64 : -(64 - val) };
    if (cc >= 40 && cc <= 53) return { type: "button", id: cc - 40, on: val >= 64 };
    if (cc === 27) return { type: "master", value: val };
    if (cc === 7) return { type: "master7", msb: val };
    if (cc === 39) return { type: "master39", lsb: val };
  }
  return null;
}

/** Absolute panel CC map (ESTAMPIE-style): CC 20–26 knobs 0–1, CC 40–53 buttons. */
export function parsePanelAbsolute(bytes) {
  if (!bytes || !bytes.length) return null;
  const st = bytes[0] & 0xf0;
  if (st !== 0xb0) return null;
  const cc = bytes[1] & 0x7f, val = bytes[2] & 0x7f;
  if (cc >= 20 && cc <= 26) return { type: "encAbs", enc: cc - 20, value: val };
  if (cc >= 40 && cc <= 53) return { type: "button", id: cc - 40, on: val >= 64 };
  if (cc === 27 || cc === 7) return { type: "master", value: val };
  return null;
}

/** Firmware released within `days` of `now` (ISO date string). */
export function isRecentRelease(released, days = 14, now = Date.now()) {
  if (!released) return false;
  const t = Date.parse(String(released).slice(0, 10));
  if (!Number.isFinite(t)) return false;
  return (now - t) <= days * 86400000;
}
