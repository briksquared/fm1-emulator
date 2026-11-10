// Firmware radar panel: scan → review → apply selected finds. Pending scans live in a
// separate localStorage key until Apply, so a scan never silently changes the running list.
import { scanCatalog, classifyScan, isSafeRemembered } from "./catalog-updates.js?v=5";

const PENDING_KEY = "fm1.firmware-radar.pending.v1";
const LAST_KEY = "fm1.firmware-radar.last.v1";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode / quota */ }
}
function clearKey(key) {
  try { localStorage.removeItem(key); } catch { /* private mode */ }
}

function chip(text, cls = "") {
  return `<span class="${cls}">${esc(text)}</span>`;
}

function rowHtml(row) {
  const e = row.entry;
  const kindLabel = row.kind === "new" ? "new" : row.kind === "update" ? "update" : "kept";
  const version = row.kind === "update"
    ? `${esc(row.fromVersion || row.prior?.version || "?")} → ${esc(e.version || "?")}`
    : esc(e.version || "");
  const hashHint = e.sha256 ? ` · ${esc(e.sha256.slice(0, 8))}…` : "";
  const about = (e.about || "").trim();
  const tags = [
    `<i>${kindLabel}</i>`,
    e.license ? `<i>${esc(e.license)}</i>` : "",
    e.kind ? `<i>${esc(e.kind)}</i>` : "",
    e.author ? `<i>${esc(e.author)}</i>` : "",
    e.product ? `<i>${esc(e.product)}</i>` : "",
  ].filter(Boolean).join("");
  return `<li data-kind="${row.kind}" data-id="${esc(e.id)}">
    <label>
      <input type="checkbox" data-radar-id="${esc(e.id)}" ${row.selected ? "checked" : ""}>
      <span class="radar-body">
        <span class="radar-name" title="${esc(e.name)} (${esc(e.id)})">${esc(e.name)}</span>
        <span class="radar-detail">${version}${e.released ? ` · ${esc(e.released.slice(0, 10))}` : ""}${hashHint}</span>
        ${about ? `<span class="radar-about">${esc(about.slice(0, 140))}${about.length > 140 ? "…" : ""}</span>` : ""}
        <span class="radar-tags">${tags}</span>
      </span>
    </label>
  </li>`;
}

export function wireRadar({
  bundledCatalog,
  radarRemembered,
  radarKey,
  legacyRadarKey,
  store,
}) {
  const scan = document.getElementById("firmware-radar-scan");
  const apply = document.getElementById("firmware-radar-apply");
  const discard = document.getElementById("firmware-radar-discard");
  const reset = document.getElementById("firmware-radar-reset");
  const status = document.getElementById("firmware-radar-status");
  const list = document.getElementById("firmware-radar-list");
  const filters = document.getElementById("firmware-radar-filters");
  const meta = document.getElementById("firmware-radar-meta");
  const filterNew = document.getElementById("radar-filter-new");
  const filterUpd = document.getElementById("radar-filter-upd");
  const filterKept = document.getElementById("radar-filter-kept");
  const filterQ = document.getElementById("radar-filter-q");
  const selectAll = document.getElementById("radar-select-all");
  const selectNone = document.getElementById("radar-select-none");
  if (!scan || !apply || !reset || !status || !list) return;

  let pending = readJson(PENDING_KEY, null);
  let rows = Array.isArray(pending?.rows) ? pending.rows : [];

  const idle = () => {
    const last = readJson(LAST_KEY, null);
    const base = radarRemembered.length
      ? `${plural(bundledCatalog.firmwares.length, "firmware")} bundled + ${plural(radarRemembered.length, "find")} in use`
      : `${plural(bundledCatalog.firmwares.length, "open-license firmware")} in this build`;
    if (!last?.scannedAt) return base;
    const when = last.scannedAt.slice(0, 16).replace("T", " ");
    return `${base} · last scan ${when}Z · checked ${last.checked ?? "?"}`;
  };

  const showMeta = (result) => {
    if (!meta) return;
    if (!result) { meta.hidden = true; meta.textContent = ""; return; }
    meta.hidden = false;
    meta.innerHTML = [
      chip(`${result.checked} open`, "ok"),
      chip(`${result.liveTotal} live`),
      result.closedLicense ? chip(`${result.closedLicense} closed skipped`, "warn") : "",
      result.noRepo ? chip(`${result.noRepo} no-repo skipped`) : "",
      chip(`${result.newCount} new`, result.newCount ? "ok" : ""),
      chip(`${result.updateCount} updates`, result.updateCount ? "warn" : ""),
      result.kept ? chip(`${result.kept} kept`) : "",
    ].filter(Boolean).join("");
  };

  const visibleKinds = () => ({
    new: !filterNew || filterNew.checked,
    update: !filterUpd || filterUpd.checked,
    kept: !filterKept || filterKept.checked,
  });

  const queryTokens = () => String(filterQ?.value || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
  const rowMatchesQuery = (row) => {
    const toks = queryTokens();
    if (!toks.length) return true;
    const e = row.entry || {};
    const hay = `${e.id || ""} ${e.name || ""} ${e.author || ""} ${e.about || ""} ${e.license || ""} ${e.kind || ""} ${e.product || ""} ${e.version || ""}`.toLowerCase();
    return toks.every((t) => hay.includes(t));
  };

  const renderList = () => {
    const show = visibleKinds();
    const visible = rows.filter((r) => show[r.kind] && rowMatchesQuery(r));
    list.hidden = !rows.length;
    filters.hidden = !rows.length;
    if (!rows.length) { list.innerHTML = ""; return; }
    list.innerHTML = visible.map(rowHtml).join("") || `<li class="radar-empty"><span class="radar-body"><span class="radar-detail">No rows match these filters.</span></span></li>`;
    const selected = selectedEntries().length;
    apply.hidden = !rows.length;
    apply.textContent = selected ? `Add ${plural(selected, "selected find")}` : "Select finds to add";
    apply.disabled = selected === 0;
    if (discard) discard.hidden = !rows.length;
  };

  const selectedEntries = () => {
    const on = new Set([...list.querySelectorAll("input[data-radar-id]:checked")].map((el) => el.dataset.radarId));
    // Keep selection state on the row objects too (filters may hide nodes).
    for (const row of rows) {
      if (list.querySelector(`input[data-radar-id="${CSS.escape(row.entry.id)}"]`)) {
        row.selected = on.has(row.entry.id);
      }
    }
    return rows.filter((r) => r.selected).map((r) => r.entry).filter(isSafeRemembered);
  };

  const syncChrome = () => {
    status.dataset.error = "false";
    status.textContent = rows.length
      ? `Review ${plural(rows.length, "result")} below, then add the ones you want. Nothing is in the list until you apply.`
      : idle();
    reset.hidden = !radarRemembered.length;
    if (discard) discard.hidden = !rows.length;
    apply.hidden = !rows.length;
    renderList();
    if (pending?.result) showMeta(pending.result);
    else showMeta(readJson(LAST_KEY, null));
  };

  list.addEventListener("change", (e) => {
    if (!(e.target instanceof HTMLInputElement) || !e.target.dataset.radarId) return;
    const row = rows.find((r) => r.entry.id === e.target.dataset.radarId);
    if (row) row.selected = e.target.checked;
    writeJson(PENDING_KEY, { ...pending, rows });
    renderList();
  });

  for (const el of [filterNew, filterUpd, filterKept]) el?.addEventListener("change", renderList);
  filterQ?.addEventListener("input", renderList);
  selectAll?.addEventListener("click", () => {
    const show = visibleKinds();
    for (const row of rows) if (show[row.kind] && rowMatchesQuery(row)) row.selected = true;
    writeJson(PENDING_KEY, { ...pending, rows });
    renderList();
  });
  selectNone?.addEventListener("click", () => {
    const show = visibleKinds();
    for (const row of rows) if (show[row.kind] && rowMatchesQuery(row)) row.selected = false;
    writeJson(PENDING_KEY, { ...pending, rows });
    renderList();
  });

  scan.addEventListener("click", async () => {
    scan.disabled = true;
    scan.classList.add("scanning");
    apply.hidden = true;
    if (discard) discard.hidden = true;
    status.dataset.error = "false";
    status.textContent = "Scanning the live open-source catalog…";
    list.hidden = true;
    try {
      const result = await scanCatalog(bundledCatalog, fetch, { previous: radarRemembered });
      rows = classifyScan(result, radarRemembered).map((row) => {
        if (row.kind === "update" && !row.fromVersion) {
          const base = result.baselines?.get?.(row.entry.id) || result.baselines?.get?.(row.entry.sourceId);
          row.fromVersion = base?.version || row.prior?.version || "";
        }
        return row;
      });
      pending = { result: { ...result, baselines: undefined }, rows, at: result.scannedAt };
      writeJson(PENDING_KEY, pending);
      writeJson(LAST_KEY, {
        scannedAt: result.scannedAt,
        checked: result.checked,
        liveTotal: result.liveTotal,
        closedLicense: result.closedLicense,
        newCount: result.newCount,
        updateCount: result.updateCount,
        kept: result.kept,
      });
      const bits = [];
      if (result.newCount) bits.push(plural(result.newCount, "new firmware"));
      if (result.updateCount) bits.push(plural(result.updateCount, "update"));
      if (result.already) bits.push(`${result.already} already in use`);
      status.textContent = bits.length
        ? `Found ${bits.join(", ")}. Pick what to add — apply does not download packages.`
        : `Up to date against ${plural(result.checked, "open package")}${result.closedLicense ? ` (${result.closedLicense} closed licenses skipped)` : ""}.`;
      showMeta(result);
      renderList();
    } catch (error) {
      status.dataset.error = "true";
      status.textContent = `Firmware scan failed: ${error.message}`;
    } finally {
      scan.disabled = false;
      scan.classList.remove("scanning");
    }
  });

  apply.addEventListener("click", () => {
    const chosen = selectedEntries();
    if (!chosen.length) {
      status.dataset.error = "true";
      status.textContent = "Select at least one find before adding.";
      return;
    }
    // Only the checked rows become the remembered set (unchecked "kept" finds drop out).
    store(radarKey, JSON.stringify(chosen));
    clearKey(PENDING_KEY);
    clearKey(legacyRadarKey);
    location.reload();
  });

  discard?.addEventListener("click", () => {
    clearKey(PENDING_KEY);
    pending = null;
    rows = [];
    syncChrome();
  });

  reset.addEventListener("click", () => {
    if (!confirm("Clear radar finds and go back to this build’s bundled list? Saved flash is kept.")) return;
    clearKey(radarKey);
    clearKey(legacyRadarKey);
    clearKey(PENDING_KEY);
    location.reload();
  });

  syncChrome();
  scan.disabled = false;
}
