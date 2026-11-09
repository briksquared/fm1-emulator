// Melodee's updater installs UFW type 101 (res.bin) at 0xCB000..0xDFFFF.
// The emulator boots the app image directly, so reproduce that resource
// install in virtual flash before the first render.
const BASE = 0xcb000, LIMIT = 0xe0000;
const u16 = (bytes, at) => bytes[at] | bytes[at + 1] << 8;
const u32 = (bytes, at) => (bytes[at] | bytes[at + 1] << 8 | bytes[at + 2] << 16 | bytes[at + 3] << 24) >>> 0;

function unmask(bytes) {
  let key = 0xffff;
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] ^= key & 255;
    key = ((key << 1) ^ (key & 0x8000 ? 0x1021 : 0)) & 0xffff;
  }
}

function crc16(bytes) {
  let crc = 0;
  for (const value of bytes) {
    crc ^= value << 8;
    for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
  }
  return crc;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function packageResources(bytes) {
  const file = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (file.length < 960) return null;
  let identity = "";
  for (let i = 0; i < 20; i++) if (file[i * 48 + 47] !== 0x7d) identity += String.fromCharCode((file[i * 48 + 47] - i - 1) & 255);
  if (!/^FM-1_\d+$/.test(identity)) return null;
  const stream = new Uint8Array(file.length - 20);
  for (let i = 0; i < 20; i++) stream.set(file.subarray(i * 48, i * 48 + 47), i * 47);
  stream.set(file.subarray(960), 940);
  const header = stream.slice(0, 64);
  unmask(header);
  if (crc16(header.subarray(2)) !== u16(header, 0)) return null;
  const count = u16(header, 8);
  for (let i = 0; i < count && 64 + (i + 1) * 80 <= 940; i++) {
    const entry = stream.slice(64 + i * 80, 144 + i * 80);
    unmask(entry);
    if (u16(entry, 0) !== 101) continue;
    const offset = u32(entry, 8), size = u32(entry, 12);
    if (!size || size % 4096 || size > LIMIT - BASE || offset + size > stream.length) throw new Error("invalid factory resource bounds");
    const data = stream.slice(offset, offset + size), length = u32(data, 4);
    if (u32(data, 0) !== 0x3153524d || length > size - 32 || crc32(data.subarray(0, 28)) !== u32(data, 28) || crc32(data.subarray(32, 32 + length)) !== u32(data, 8))
      throw new Error("factory resource checksum mismatch");
    return { at: BASE, data };
  }
  return null;
}

export function applyPackageResources(machine, bytes) {
  const resource = packageResources(bytes);
  if (!resource) return 0;
  if (machine.fm1_flash_len() < resource.at + resource.data.length) throw new Error("factory resources exceed virtual flash");
  for (const pointer of [machine.fm1_flash(), machine.fm1_flash_base()])
    new Uint8Array(machine.memory.buffer, pointer + resource.at, resource.data.length).set(resource.data);
  return resource.data.length;
}
