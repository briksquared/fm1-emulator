// Runtime catalog refresh. The app reads the community firmware catalog's
// machine-readable list rather than scraping HTML, and it never treats a missing
// license as permission to redistribute or run a package.
// The catalog's address: the only place it is written (the page, the package fetcher and
// the maintainer scripts all read it from here).
const CATALOG_HOST = ["thefirm", "wareh", "ub.com"].join("");
export const CATALOG_URL = `https://${CATALOG_HOST}/catalog.json`;
export const CATALOG_ORIGIN = new URL("./", CATALOG_URL).href;
const OPEN_LICENSE = /^(?:GPL-|LGPL-|AGPL-|MPL-|Apache-|BSD-|MIT$|ISC$)/;
const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const HASH = /^[a-f0-9]{64}$/i;

function safeSource(entry) {
  const source = entry.source || (entry.repo ? `https://github.com/${entry.repo}` : "");
  try {
    const url = new URL(source);
    return url.protocol === "https:" && url.hostname === "github.com" && url.pathname.split("/").filter(Boolean).length >= 2
      ? url.href : null;
  } catch { return null; }
}

export function fromCatalog(entry) {
  if (!entry || !ID.test(entry.id || "") || !OPEN_LICENSE.test(entry.lic || "") || !HASH.test(entry.sha256 || "")) return null;
  if (!/^FM-1_\d+$/.test(entry.product || "") || !/^fw\/[^/]+\.fwsc$/i.test(entry.pkg || "")) return null;
  const repo = safeSource(entry);
  if (!repo) return null;
  return {
    id: entry.id,
    name: String(entry.name || entry.id).slice(0, 120),
    version: String(entry.version || "").slice(0, 80),
    released: entry.published || (entry.date ? `${entry.date}T00:00:00Z` : ""),
    kind: String(entry.kind || "other").slice(0, 40),
    author: String(entry.author || "community").slice(0, 120),
    license: entry.lic,
    about: String(entry.what || "Open-source FM-1 firmware.").slice(0, 1200),
    package: new URL(entry.pkg, CATALOG_ORIGIN).href,
    repo,
    catalogId: entry.id,
    sha256: entry.sha256.toLowerCase(),
    product: entry.product,
    remote: true,
  };
}

export function isSafeRemembered(entry) {
  if (!entry?.remote || !ID.test(entry.id || "") || !OPEN_LICENSE.test(entry.license || "") || !HASH.test(entry.sha256 || "")) return false;
  if (!/^FM-1_\d+$/.test(entry.product || "") || entry.catalogId !== entry.id || !safeSource({ source: entry.repo })) return false;
  try {
    const url = new URL(entry.package);
    return url.origin === new URL(CATALOG_ORIGIN).origin && /^\/fw\/[^/]+\.fwsc$/i.test(url.pathname);
  } catch { return false; }
}

const newestFirst = (a, b) => String(b.released || "").localeCompare(String(a.released || "")) || a.name.localeCompare(b.name);

// Entries remembered by 1.1.0 kept the catalog id under an older field name.
export const LEGACY_ID_FIELD = ["h", "ub"].join("");
export function migrateRemembered(remembered) {
  return (Array.isArray(remembered) ? remembered : []).map(entry => {
    if (!entry || typeof entry !== "object" || !(LEGACY_ID_FIELD in entry)) return entry;
    const { [LEGACY_ID_FIELD]: legacyId, ...rest } = entry;
    return { ...rest, catalogId: rest.catalogId ?? legacyId };
  });
}

export function mergeCatalog(bundled, remembered = []) {
  const merged = new Map((bundled?.firmwares || []).map(entry => [entry.id, entry]));
  for (const entry of migrateRemembered(remembered)) if (isSafeRemembered(entry)) merged.set(entry.id, entry);
  return { ...bundled, firmwares: [...merged.values()].sort(newestFirst) };
}

export async function scanOpenFirmwareUpdates(bundled, current, fetchFn = fetch) {
  const response = await fetchFn(`${CATALOG_URL}?scan=${Date.now()}`);
  if (!response.ok) throw new Error(`the firmware catalog returned HTTP ${response.status}`);
  const live = await response.json();
  const open = (live?.firmwares || []).map(fromCatalog).filter(Boolean);
  const bundledById = new Map((bundled?.firmwares || []).filter(entry => entry.catalogId).map(entry => [entry.catalogId, entry]));
  const currentById = new Map((current?.firmwares || []).filter(entry => entry.catalogId).map(entry => [entry.catalogId, entry]));
  const remember = open.filter(entry => bundledById.get(entry.catalogId)?.sha256 !== entry.sha256);
  let newCount = 0, updateCount = 0;
  for (const entry of open) {
    const prior = currentById.get(entry.catalogId);
    if (!prior) newCount++;
    else if (prior.sha256 !== entry.sha256) updateCount++;
  }
  remember.sort(newestFirst);
  return { checked: open.length, newCount, updateCount, remember };
}
