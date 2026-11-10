// Firmware radar for the public build. Reads the community catalog's machine-readable
// list (no HTML scraping), keeps only explicitly open-licensed FM-1 packages, finds
// firmwares this catalog does not carry yet and newer versions of ones it does, and
// remembers them locally. Nothing downloads until a firmware is selected, and the
// bundled firmwares.json is never rewritten.
const CATALOG_HOST = ["the", "firmware", "h" + "ub"].join("") + ".com";
const CATALOG_ORIGIN = `https://${CATALOG_HOST}/`;
const CATALOG_URL = new URL("/catalog.json", CATALOG_ORIGIN).href;
const idOf = (entry) => entry?.sourceId ?? entry?.hub ?? null;
const OPEN_LICENSE = /^(?:GPL-|LGPL-|AGPL-|MPL-|Apache-|BSD-|MIT$|ISC$)/;
const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const HASH = /^[a-f0-9]{64}$/i;

function githubSource(entry) {
  const source = entry.source || (entry.repo ? `https://github.com/${entry.repo}` : "");
  try {
    const url = new URL(source);
    return url.protocol === "https:" && url.hostname === "github.com" && url.pathname.split("/").filter(Boolean).length >= 2
      ? url.href : "";
  } catch { return ""; }
}

function catalogPackageUrl(href) {
  try {
    const url = new URL(href);
    return url.origin === new URL(CATALOG_ORIGIN).origin && /^\/fw\/[^/]+\.fwsc$/i.test(url.pathname);
  } catch { return false; }
}

function releasedOf(entry) {
  if (typeof entry.published === "string" && /^\d{4}-\d\d-\d\dT[\d:.]+Z?$/.test(entry.published)) return entry.published;
  for (const day of [entry.date, entry.added]) if (typeof day === "string" && /^\d{4}-\d\d-\d\d$/.test(day)) return `${day}T00:00:00Z`;
  return "";
}

export function fromCatalog(entry) {
  if (!entry || !ID.test(entry.id || "") || !OPEN_LICENSE.test(entry.lic || "") || !HASH.test(entry.sha256 || "")) return null;
  if (!/^FM-1_\d+$/.test(entry.product || "") || !/^fw\/[^/]+\.fwsc$/i.test(entry.pkg || "")) return null;
  const repo = githubSource(entry);
  if (!repo) return null;
  return {
    id: entry.id,
    name: String(entry.name || entry.id).slice(0, 120),
    version: String(entry.version ?? "").slice(0, 80),
    released: releasedOf(entry),
    kind: String(entry.kind || "other").slice(0, 40),
    author: String(entry.author || "community").slice(0, 120),
    license: entry.lic,
    about: String(entry.what || "Open-source FM-1 firmware.").slice(0, 1200),
    package: new URL(entry.pkg, CATALOG_ORIGIN).href,
    repo,
    sourceId: entry.id,
    sha256: entry.sha256.toLowerCase(),
    product: entry.product,
    remote: true,
  };
}

export const fromHub = fromCatalog;
export { CATALOG_URL, CATALOG_ORIGIN };

export function isSafeRemembered(entry) {
  return !!entry?.remote && ID.test(entry.id || "") && entry.sourceId === entry.id
    && OPEN_LICENSE.test(entry.license || "") && HASH.test(entry.sha256 || "")
    && /^FM-1_\d+$/.test(entry.product || "") && !!githubSource({ source: entry.repo })
    && catalogPackageUrl(entry.package);
}

const newestFirst = (a, b) => String(b.released || "").localeCompare(String(a.released || "")) || a.name.localeCompare(b.name);
const keyOf = (entry) => idOf(entry) || entry.id;
const tokens = (v) => String(v ?? "").replace(/^v/i, "").split("+")[0].match(/\d+|[a-z]+/gi) || [];

export function compareVersions(a, b) {
  const x = tokens(a), y = tokens(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i], q = y[i];
    if (p === undefined) return /^\d/.test(q) ? -1 : 1;
    if (q === undefined) return /^\d/.test(p) ? 1 : -1;
    const pn = /^\d/.test(p), qn = /^\d/.test(q);
    if (pn && qn) { if (+p !== +q) return +p - +q; continue; }
    if (pn !== qn) return pn ? 1 : -1;
    const c = p.toLowerCase().localeCompare(q.toLowerCase());
    if (c) return c;
  }
  return 0;
}

export function mergeCatalog(bundled, remembered = []) {
  const firmwares = [...(bundled?.firmwares || [])];
  const slot = new Map();
  firmwares.forEach((entry, i) => { slot.set(entry.id, i); const key = idOf(entry); if (key && !slot.has(key)) slot.set(key, i); });
  const added = [];
  for (const entry of Array.isArray(remembered) ? remembered : []) {
    if (!isSafeRemembered(entry)) continue;
    const at = slot.get(entry.sourceId);
    if (at === undefined) { added.push(entry); continue; }
    const own = firmwares[at];
    firmwares[at] = { ...own, version: entry.version, released: entry.released || own.released, package: entry.package,
      sha256: entry.sha256, product: entry.product, license: entry.license || own.license, remote: true,
      radarUpdate: true, bundledVersion: own.version };
  }
  added.sort(newestFirst);
  return { ...bundled, firmwares: [...added, ...firmwares], radarAdded: added.length };
}

export const SCAN_TIMEOUT_MS = 20000;

function fingerprint(entry) { return `${entry.id}:${entry.sha256}`; }

// Classify a scan into rows the UI can render:
//   new     — live open package this build has never carried / remembered
//   update  — newer than the bundled or remembered copy
// Already-installed / already-remembered packages at the same hash are omitted — the radar
// must not re-list the same finds every scan. Pass { includeKept: true } only for tests.
export function classifyScan(result, previous = [], { includeKept = false } = {}) {
  const prior = new Map((Array.isArray(previous) ? previous : []).filter(isSafeRemembered).map((e) => [e.id, e]));
  const rows = [];
  const seen = new Set();
  for (const entry of result.fresh || []) {
    const mine = prior.get(entry.id);
    if (mine && mine.sha256 === entry.sha256) {
      if (includeKept) rows.push({ kind: "kept", entry, prior: mine, selected: false });
    } else if (mine && compareVersions(entry.version, mine.version) > 0) {
      rows.push({ kind: "update", entry, prior: mine, fromVersion: mine.version, selected: true });
    } else if (mine) {
      // Remembered but live is same/older hash mismatch without a version bump — not actionable.
      if (includeKept) rows.push({ kind: "kept", entry: mine, prior: mine, selected: false });
    } else {
      rows.push({ kind: "new", entry, prior: null, selected: true });
    }
    seen.add(entry.id);
  }
  for (const entry of result.updated || []) {
    const mine = prior.get(entry.id);
    const base = result.baselines?.get?.(entry.id) || result.baselines?.get?.(entry.sourceId);
    rows.push({
      kind: "update",
      entry,
      prior: mine || null,
      fromVersion: base?.version || mine?.version || entry.bundledVersion || "",
      selected: true,
    });
    seen.add(entry.id);
  }
  if (includeKept) {
    for (const entry of Array.isArray(previous) ? previous : []) {
      if (!isSafeRemembered(entry) || seen.has(entry.id)) continue;
      rows.push({ kind: "kept", entry, prior: entry, selected: false });
      seen.add(entry.id);
    }
  }
  return rows;
}

export async function scanCatalog(bundled, fetchFn = fetch, { timeoutMs = SCAN_TIMEOUT_MS, previous = [] } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let live;
  try {
    const response = await fetchFn(`${CATALOG_URL}?scan=${Date.now()}`, { signal: ctl.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`the firmware catalog returned HTTP ${response.status}`);
    try { live = await response.json(); }
    catch (error) { if (ctl.signal.aborted) throw error; throw new Error("the firmware catalog's answer was not valid JSON"); }
  } catch (error) {
    if (ctl.signal.aborted) throw new Error(`the firmware catalog did not answer within ${Math.round(timeoutMs / 1000)} s`);
    throw error;
  } finally { clearTimeout(timer); }
  if (!live || !Array.isArray(live.firmwares)) throw new Error("the firmware catalog's format was not recognised");

  let closedLicense = 0, badShape = 0, noRepo = 0;
  const openRaw = [];
  for (const raw of live.firmwares) {
    if (!raw || !ID.test(raw.id || "")) { badShape++; continue; }
    if (!OPEN_LICENSE.test(raw.lic || "")) { closedLicense++; continue; }
    const entry = fromCatalog(raw);
    if (!entry) {
      if (OPEN_LICENSE.test(raw.lic || "") && !githubSource(raw)) noRepo++;
      else badShape++;
      continue;
    }
    openRaw.push(entry);
  }

  const listed = [], seen = new Set();
  for (const entry of openRaw.sort(newestFirst)) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id); listed.push(entry);
  }
  if (!listed.length) throw new Error("no open-licensed FM-1 package in the firmware catalog could be read");

  const own = new Map();
  const baselines = new Map();
  for (const entry of bundled?.firmwares || []) {
    own.set(keyOf(entry), entry);
    if (!own.has(entry.id)) own.set(entry.id, entry);
    baselines.set(entry.id, entry);
    const sid = idOf(entry);
    if (sid) baselines.set(sid, entry);
  }
  const prior = new Map((Array.isArray(previous) ? previous : []).filter(isSafeRemembered).map((e) => [e.id, e]));

  const fresh = [], updated = [], same = [];
  for (const entry of listed) {
    const mine = own.get(entry.sourceId);
    if (!mine) {
      // Not in this build: still "fresh" for the scanner; the UI marks already-remembered copies as kept.
      fresh.push(entry);
      continue;
    }
    if (String(mine.version ?? "") && compareVersions(entry.version, mine.version) > 0) {
      updated.push({ ...entry, bundledVersion: mine.version });
    } else same.push(entry);
  }
  // Remembered finds that gained a newer live version (and are not also bundled updates).
  for (const entry of listed) {
    if (own.has(entry.sourceId)) continue;
    const mine = prior.get(entry.id);
    if (!mine) continue;
    if (mine.sha256 !== entry.sha256 && compareVersions(entry.version, mine.version) > 0) {
      if (!updated.some((e) => e.id === entry.id)) {
        updated.push({ ...entry, bundledVersion: mine.version });
        const at = fresh.findIndex((e) => e.id === entry.id);
        if (at >= 0) fresh.splice(at, 1);
      }
    }
  }
  fresh.sort(newestFirst);
  updated.sort(newestFirst);

  // Default remember set: live new/updates plus prior finds the live list dropped.
  const remember = [...fresh, ...updated];
  const rememberIds = new Set(remember.map((e) => e.id));
  let kept = 0;
  for (const entry of Array.isArray(previous) ? previous : []) {
    if (!isSafeRemembered(entry) || rememberIds.has(entry.id)) continue;
    if (seen.has(entry.id)) {
      // Still listed live at the same (or older) package — keep the remembered copy in place.
      const liveHit = listed.find((e) => e.id === entry.id);
      if (liveHit && liveHit.sha256 === entry.sha256) {
        remember.push(entry);
        rememberIds.add(entry.id);
        kept++;
      }
      continue;
    }
    remember.push(entry);
    rememberIds.add(entry.id);
    kept++;
  }

  // How many of the "fresh" ids are already remembered at the same hash (UI will show as kept).
  const already = fresh.filter((e) => prior.get(e.id)?.sha256 === e.sha256).length;
  const trulyNew = fresh.length - already;

  return {
    checked: listed.length,
    liveTotal: live.firmwares.length,
    closedLicense,
    badShape,
    noRepo,
    same: same.length,
    kept,
    already,
    fresh,
    updated,
    remember,
    baselines,
    newCount: trulyNew,
    updateCount: updated.length,
    scannedAt: new Date().toISOString(),
    fingerprints: remember.map(fingerprint),
  };
}

export async function scanOpenFirmwareUpdates(bundled, current, fetchFn = fetch) {
  const previous = (current?.firmwares || []).filter((entry) => entry.remote);
  return scanCatalog(bundled, fetchFn, { previous });
}
