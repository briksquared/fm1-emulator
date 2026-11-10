// Local package vault: keep the exact .fwsc bytes of the last good install and the
// in-progress install on this device, so Finish interrupted install / Roll back still
// work after a reload, offline, or when the original file picker selection is gone.
// Browser: IndexedDB. Tests / Node: MemoryVault. Never stores paths or serials — only
// sha256 + package bytes + small metadata.
export const VAULT_DB = "fm1.flash-packages.v1";
export const VAULT_STORE = "packages";
export const VAULT_MAX = 4; // lastGood + current + a couple of recent attempts

const isSha = (h) => typeof h === "string" && /^[a-f0-9]{64}$/i.test(h);

export class MemoryVault {
  constructor() { this.m = new Map(); }
  async put(sha256, bytes, meta = {}) {
    if (!isSha(sha256) || !(bytes instanceof Uint8Array) || !bytes.length) return false;
    this.m.set(sha256.toLowerCase(), {
      sha256: sha256.toLowerCase(),
      bytes: bytes.slice(),
      meta: {
        name: String(meta.name || "").slice(0, 80),
        fwId: meta.fwId ? String(meta.fwId).slice(0, 64) : null,
        product: meta.product ? String(meta.product).slice(0, 24) : null,
        savedAt: Date.now(),
      },
    });
    return true;
  }
  async get(sha256) {
    if (!isSha(sha256)) return null;
    const e = this.m.get(sha256.toLowerCase());
    return e ? { bytes: e.bytes.slice(), meta: { ...e.meta }, sha256: e.sha256 } : null;
  }
  async has(sha256) { return isSha(sha256) && this.m.has(sha256.toLowerCase()); }
  async list() {
    return [...this.m.values()].map((e) => ({ sha256: e.sha256, meta: { ...e.meta }, size: e.bytes.length }));
  }
  async prune(keep) {
    const want = new Set([...(keep || [])].filter(isSha).map((h) => h.toLowerCase()));
    for (const k of [...this.m.keys()]) if (!want.has(k)) this.m.delete(k);
    // Cap only by dropping entries that are not required. If `keep` itself exceeds
    // VAULT_MAX, prefer recovery safety over the soft size limit.
    if (this.m.size > VAULT_MAX) {
      const ranked = [...this.m.values()]
        .filter((e) => !want.has(e.sha256))
        .sort((a, b) => (a.meta.savedAt || 0) - (b.meta.savedAt || 0));
      for (const drop of ranked) {
        if (this.m.size <= VAULT_MAX) break;
        this.m.delete(drop.sha256);
      }
    }
  }
  async clear() { this.m.clear(); }
}

function openDb(indexedDB, name = VAULT_DB) {
  return new Promise((resolve, reject) => {
    if (!indexedDB) return reject(new Error("no IndexedDB"));
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VAULT_STORE)) db.createObjectStore(VAULT_STORE, { keyPath: "sha256" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
}

function idbReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
  });
}

export class PackageVault {
  constructor(indexedDB = globalThis.indexedDB) {
    this.indexedDB = indexedDB;
    this._db = null;
  }
  async _dbReady() {
    if (this._db) return this._db;
    this._db = await openDb(this.indexedDB);
    this._db.onclose = () => { this._db = null; };
    return this._db;
  }
  async put(sha256, bytes, meta = {}) {
    if (!isSha(sha256) || !(bytes instanceof Uint8Array) || !bytes.length) return false;
    try {
      const db = await this._dbReady();
      const row = {
        sha256: sha256.toLowerCase(),
        // Copy so a later mutation of the caller's buffer cannot corrupt recovery bytes.
        bytes: bytes.slice(),
        meta: {
          name: String(meta.name || "").slice(0, 80),
          fwId: meta.fwId ? String(meta.fwId).slice(0, 64) : null,
          product: meta.product ? String(meta.product).slice(0, 24) : null,
          savedAt: Date.now(),
        },
      };
      await idbReq(db.transaction(VAULT_STORE, "readwrite").objectStore(VAULT_STORE).put(row));
      return true;
    } catch { return false; }
  }
  async get(sha256) {
    if (!isSha(sha256)) return null;
    try {
      const db = await this._dbReady();
      const row = await idbReq(db.transaction(VAULT_STORE, "readonly").objectStore(VAULT_STORE).get(sha256.toLowerCase()));
      if (!row || !(row.bytes instanceof Uint8Array || ArrayBuffer.isView(row.bytes))) return null;
      const bytes = row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array(row.bytes);
      return { bytes: bytes.slice(), meta: { ...(row.meta || {}) }, sha256: row.sha256 };
    } catch { return null; }
  }
  async has(sha256) { return !!(await this.get(sha256)); }
  async list() {
    try {
      const db = await this._dbReady();
      const rows = await idbReq(db.transaction(VAULT_STORE, "readonly").objectStore(VAULT_STORE).getAll());
      return (rows || []).map((r) => ({
        sha256: r.sha256,
        meta: { ...(r.meta || {}) },
        size: r.bytes?.byteLength || r.bytes?.length || 0,
      }));
    } catch { return []; }
  }
  async prune(keep) {
    const want = new Set([...(keep || [])].filter(isSha).map((h) => h.toLowerCase()));
    try {
      const db = await this._dbReady();
      // IndexedDB transactions go inactive across awaits — plan deletes first, then
      // issue every delete inside one fresh readwrite transaction.
      const rows = await idbReq(db.transaction(VAULT_STORE, "readonly").objectStore(VAULT_STORE).getAll()) || [];
      const doomed = rows.filter((r) => !want.has(r.sha256)).map((r) => r.sha256);
      // Required `keep` entries may exceed VAULT_MAX — prefer recovery over the soft cap.
      if (!doomed.length) return;
      const store = db.transaction(VAULT_STORE, "readwrite").objectStore(VAULT_STORE);
      await Promise.all(doomed.map((sha) => idbReq(store.delete(sha))));
    } catch { /* vault is best-effort */ }
  }
  async clear() {
    try {
      const db = await this._dbReady();
      await idbReq(db.transaction(VAULT_STORE, "readwrite").objectStore(VAULT_STORE).clear());
    } catch { /* ignore */ }
  }
}

/** Prefer IndexedDB in the browser; fall back to memory if unavailable. */
export function createPackageVault() {
  try {
    if (typeof indexedDB !== "undefined" && indexedDB) return new PackageVault(indexedDB);
  } catch { /* private mode quirks */ }
  return new MemoryVault();
}
