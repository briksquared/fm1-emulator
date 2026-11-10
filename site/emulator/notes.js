// Per-firmware notes: a personal note kept per firmware id in localStorage, so
// you can annotate a 311-strong collection ("great bass", "glitchy on hardware")
// and have it persist on this device. Just the store here; the Firmware info
// panel provides the editor.
(function () {
  "use strict";
  const KEY = "fm1.notes.v1";
  const MAX = 2000;                       // a note, not an essay

  function load() {
    try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); return (o && typeof o === "object" && !Array.isArray(o)) ? o : {}; }
    catch { return {}; }
  }
  function save(o) {
    try { localStorage.setItem(KEY, JSON.stringify(o)); return true; }
    catch (e) { console.warn("notes: could not save", e); return false; }
  }

  window.FM1Notes = {
    get: (id) => (id && load()[id]) || "",
    has: (id) => !!(id && load()[id]),
    all: () => load(),
    count: () => Object.keys(load()).length,
    ids: () => Object.keys(load()),
    // Trims; an empty note removes the entry rather than storing "". Returns
    // whether the write stuck (false if storage is full/blocked).
    set(id, text) {
      if (!id) return false;
      const o = load();
      const t = String(text == null ? "" : text).trim().slice(0, MAX);
      if (t) o[id] = t; else delete o[id];
      return save(o);
    },
    // Merge notes from another device/export without wiping existing ones unless overwrite.
    importAll(obj, { overwrite = false } = {}) {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return 0;
      const o = load();
      let n = 0;
      for (const [id, text] of Object.entries(obj)) {
        if (!id || typeof text !== "string") continue;
        const t = text.trim().slice(0, MAX);
        if (!t) continue;
        if (!overwrite && o[id]) continue;
        o[id] = t; n++;
      }
      return save(o) ? n : 0;
    },
    clear(id) { return id ? this.set(id, "") : false; },
    _key: KEY,
  };
})();
