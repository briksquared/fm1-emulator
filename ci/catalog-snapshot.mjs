// Shape the live catalog into the snapshot bundled as site/catalog.json. Nothing in the app
// reads the snapshot's per-card extras, so they are trimmed to what describes the firmware:
// - the license block keeps the license id and its text's address
// - each firmware's maker card (`fmhub` in the live list) is stored as `makerCard`, without
//   its picture path (relative to the maker's repository, so it does not resolve here)
// - links that point back at the catalog's own site are dropped
// - creators no listed firmware refers to are dropped
export function catalogSnapshot(live, catalogUrl) {
  const host = new URL(catalogUrl).hostname;
  const ownSite = (value) => {
    try { const h = new URL(value).hostname; return h === host || h.endsWith(`.${host}`); } catch { return false; }
  };
  const card = (value) => {
    if (!value || typeof value !== "object" || !value.data || typeof value.data !== "object") return value ?? null;
    const { image, ...data } = value.data;
    for (const key of Object.keys(data)) if (typeof data[key] === "string" && ownSite(data[key])) delete data[key];
    return { ...value, data };
  };
  const tidy = (entry) => {
    const out = {};
    for (const [key, value] of Object.entries(entry)) {
      if (typeof value === "string" && ownSite(value)) continue;
      if (key === "fmhub") out.makerCard = card(value);
      else out[key] = value;
    }
    return out;
  };
  const firmwares = (live.firmwares || []).map(tidy);
  const smk37 = live.smk37 && typeof live.smk37 === "object" ? tidy(live.smk37) : live.smk37;
  const referenced = JSON.stringify([firmwares, smk37]).toLowerCase();
  const creators = Object.fromEntries(Object.entries(live.creators || {}).filter(([login]) => referenced.includes(login.toLowerCase())));
  const { license, url } = live.license || {};
  return { ...live, license: { license, url }, firmwares, ...(live.smk37 === undefined ? {} : { smk37 }), creators };
}
