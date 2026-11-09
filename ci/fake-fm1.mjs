// A simulated FM-1 for the flash tests: the device side of the USB-MIDI update protocol behind
// a fake Web MIDI access.
import { pack7, unpack7 } from "../site/emulator/fm1ota.js";

const HS_QUERY = [0xf0, 0x00, 0x32, 0x45, 0x00, 0x00, 0x00, 0x40, 0x7f, 0xf7];
const UPGRADE = [0xf0, 0x22, 0x24, 0x35, 0x7f, 0xf7];
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// a minimal .fwsc: 20 blocks whose marker bytes spell the product, then the image body
export function makePackage(product = "FM-1_904", body = 3000, seed = 7) {
  const out = new Uint8Array(20 * 0x30 + body);
  let x = seed;
  for (let i = 0; i < out.length; i++) { x = (x * 1103515245 + 12345) >>> 0; out[i] = x >>> 24; }
  for (let i = 0; i < 20; i++) out[i * 0x30 + 0x2f] = i < product.length ? (product.charCodeAt(i) + i + 1) & 0xff : 0x7d;
  return out;
}

// ---------------------------------------------------------------- simulated unit
// Speaks the device side of the update protocol over a fake Web MIDI access: answers the
// identity query, pulls the image with read requests, checks each answer's checksum and bytes,
// and re-enumerates as the update loader and then as the new firmware. `fault` picks one
// failure to inject.
export class Unit {
  constructor({ identity = "FM-1_900", image, target, fault = {}, startInLoader = false, others = [] } = {}) {
    this.access = { inputs: new Map(), outputs: new Map() };
    this.identity = identity;
    this.image = image;
    this.target = target;
    this.fault = fault;
    this.written = image ? new Uint8Array(image.length) : null;
    this.badAnswers = 0;
    this.sendFailures = fault.sendFailures || 0;
    for (const name of others) this.attachOther(name);
    if (startInLoader) this.attach("loader"); else this.attach("app");
  }
  attachOther(name) {
    const input = { name, state: "connected", open: async () => {}, close: async () => {}, onmidimessage: null };
    const output = { name, state: "connected", open: async () => {}, close: async () => {}, send: () => {} };
    this.access.inputs.set(name, input);
    this.access.outputs.set(name, output);
  }
  attach(mode) {
    this.mode = mode;
    const name = mode === "loader" ? "OTA Loader" : "FM-1";
    const unit = this;
    const port = { name, state: "connected", async open() { if (unit.fault.hangOpen) return new Promise(() => {}); }, async close() {} };
    this.input = { ...port, onmidimessage: null };
    this.output = { ...port, send: (bytes) => this.receive(bytes) };
    this.access.inputs.set(name, this.input);
    this.access.outputs.set(name, this.output);
  }
  detach() {
    for (const p of [this.input, this.output]) if (p) p.state = "disconnected";
    for (const map of [this.access.inputs, this.access.outputs]) for (const [k, v] of map) if (v === this.input || v === this.output) map.delete(k);
    this.mode = "gone";
    clearTimeout(this.stallTimer);
  }
  emit(bytes) {
    const input = this.input;
    setTimeout(() => { if (input.state === "connected") input.onmidimessage?.({ data: Uint8Array.from(bytes) }); }, 0);
  }
  idText() { return this.mode === "loader" ? "OTA-FM1_1" : this.identity; }
  identityPacket(text) {
    const d = [0x00, 0x59, 0x11, 0, 0, 0];
    for (let i = 0; i < 27; i++) d.push(i < text.length ? text.charCodeAt(i) : 0);
    d.push(0);
    return [0xf0, ...pack7(d), 0xf7];
  }
  request(addr, len, fl = 0) {
    const u = [0x00, 0x59, 0x30, 0, 0, 0, fl, addr & 0xff, (addr >>> 8) & 0xff, (addr >>> 16) & 0xff, (addr >>> 24) & 0xff, len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff];
    let s = 0;
    for (let i = 6; i < 14; i++) s += u[i];
    u.push(~s & 0xff);
    this.pending = { addr, len };
    this.emit([0xf0, ...pack7(u), 0xf7]);
  }
  receive(bytes) {
    if (this.output.state !== "connected") throw new Error("disconnected");
    if (this.sendFailures > 0) { this.sendFailures--; throw new Error("transient"); }
    const b = Array.from(bytes);
    if (same(b, HS_QUERY)) {
      if (this.fault.notFM1) return;
      return this.emit(this.identityPacket(this.mode === "app" && this.fault.reportAs ? this.fault.reportAs : this.idText()));
    }
    if (same(b, UPGRADE)) {
      if (this.mode === "app" && this.fault.noUpdateMode) return;
      this.stage = this.mode === "loader" ? "write" : "stage";
      this.reads = 0;
      return setTimeout(() => this.next(), 1);
    }
    if (b[0] === 0xf0 && this.pending) this.answer(unpack7(b.slice(1, -1)));
  }
  answer(u) {
    const { addr, len } = this.pending;
    let s = 0;
    for (let i = 6; i < u.length - 1; i++) s += u[i];
    const got = (u[7] | (u[8] << 8) | (u[9] << 16) | (u[10] << 24)) >>> 0;
    const data = u.slice(14, u.length - 1).slice(0, len);
    if ((~s & 0xff) !== u[u.length - 1] || got !== addr) { this.badAnswers++; return this.request(addr, len); }
    this.pending = null;
    if (addr === 0xe0000000) { this.detach(); if (!this.fault.noLoader) setTimeout(() => this.attach("loader"), 10); return; }
    if (addr === 0xf0000000) {
      this.detach();
      const ok = same(Array.from(this.written), Array.from(this.image));
      if (!this.fault.noReturn) setTimeout(() => { this.identity = this.fault.returnAs || (ok ? this.target : "FM-1_000"); this.attach("app"); }, 10);
      return;
    }
    if (this.stage === "write") this.written.set(data, addr);
    this.reads++;
    this.next();
  }
  next() {
    if (this.mode === "gone") return;
    const f = this.fault;
    if (f.disconnectIn === this.stage && this.reads === (f.after ?? 2)) return this.detach();
    if (f.stallIn === this.stage && this.reads === (f.after ?? 2)) return;   // goes quiet, stays plugged in
    if (f.badRequest && this.stage === "write" && this.reads === 1) return this.request(this.image.length, 512);
    if (this.stage === "stage") return this.reads < 4 ? this.request(this.reads * 512, 512) : this.request(0xe0000000, 0);
    const addr = this.reads * 512;
    if (addr >= this.image.length) return this.request(0xf0000000, 0);
    this.request(addr, Math.min(512, this.image.length - addr));
  }
}

