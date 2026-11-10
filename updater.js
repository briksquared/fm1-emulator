// Checking for a newer app version on GitHub Releases (briksquared/fm1-emulator). Separate from
// the firmware update radar in the page: this is about the desktop app itself.
//
// Nothing is downloaded or installed here. A check asks GitHub for the latest published release
// and, when it is newer, offers to open its release page; downloading and installing it is up
// to the player, as with the first install.
const { app, dialog, shell, net, BrowserWindow } = require("electron");

const RELEASES = "https://github.com/briksquared/fm1-emulator/releases";
const LATEST_API = "https://api.github.com/repos/briksquared/fm1-emulator/releases/latest";
const TIMEOUT_MS = 15000;

class CheckError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

// The latest published (non-draft, non-prerelease) release as { version, page }, or null when
// there is none.
async function latestRelease(fetch = net.fetch) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  let response, release;
  try {
    response = await fetch(LATEST_API, { signal: abort.signal,
      headers: { accept: "application/vnd.github+json", "user-agent": `fm1-emulator/${app.getVersion()}` } });
    if (response.status === 404) return null;   // no published release yet
    if (response.status === 403 || response.status === 429) {
      const left = response.headers?.get?.("x-ratelimit-remaining");
      throw new CheckError("limited", left === "0" || response.status === 429 ? "GitHub is limiting checks from this network right now." : `GitHub answered ${response.status}.`);
    }
    if (!response.ok) throw new CheckError("http", `GitHub answered ${response.status}.`);
    release = await response.json();
  } catch (error) {
    if (error instanceof CheckError) throw error;
    if (abort.signal.aborted) throw new CheckError("timeout", "GitHub didn't answer in time.");
    if (error instanceof SyntaxError) throw new CheckError("http", "GitHub's answer could not be read.");
    throw new CheckError(offlineError(error) ? "offline" : "other", String(error?.message || error).split("\n")[0]);
  } finally {
    clearTimeout(timer);
  }
  if (!release || typeof release !== "object" || release.draft || release.prerelease) return null;
  const tag = typeof release.tag_name === "string" ? release.tag_name.trim() : "";
  const version = cleanVersion(tag);
  if (!version) throw new CheckError("http", "GitHub's latest release has no version number.");
  return { version, page: releasePage(tag) };
}

const offlineError = (error) => /ENOTFOUND|ENETUNREACH|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|NETWORK_CHANGED|CONNECTION|ADDRESS_UNREACHABLE|PROXY|TIMED_OUT)/i
  .test(String(error?.message || error) + " " + String(error?.cause?.code || ""));

// the page opened in the browser: always this repository's release page for a validated tag
function releasePage(tag) {
  if (!cleanVersion(tag)) return RELEASES;
  const url = new URL(`${RELEASES}/tag/${encodeURIComponent(tag)}`);
  return url.origin === "https://github.com" && url.pathname.startsWith("/briksquared/fm1-emulator/releases/tag/") ? url.href : RELEASES;
}

// How this copy was installed only changes the advice on how to install the new version.
function installKind() {
  if (process.platform === "win32") return process.env.PORTABLE_EXECUTABLE_DIR ? "portable" : "installer";
  if (process.platform === "darwin") return "mac";
  if (process.platform === "linux") return process.env.APPIMAGE ? "appimage" : "deb";
  return "other";
}
const HOW = {
  installer: "Download the new installer and run it; it installs over this copy and keeps your settings.",
  portable: "Download the new portable .exe or the installer.",
  mac: "Download it and drag it to Applications to replace this copy.",
  appimage: "Download the new AppImage and use it in place of this one.",
  deb: "Download the .deb and install it over this one (sudo apt install ./FM-1-Emulator-*.deb).",
};

const appWindow = () => BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
function message(options) {
  const win = appWindow();
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

let busy = false, offered = null;

// interactive: from the menu (always answers). Otherwise the quiet check at startup, which only
// speaks up, once per run and per version, when there is a newer version, and never reports
// failures. Neither opens a browser unless the player picks "Open release page".
async function checkForUpdates({ interactive = false, log = () => {}, fetch } = {}) {
  if (busy) {
    if (interactive) await message({ type: "info", message: "Already checking for updates.", buttons: ["OK"] });
    return;
  }
  if (!app.isPackaged && !interactive) return;
  busy = true;
  const current = app.getVersion();
  try {
    const latest = await latestRelease(fetch);
    const newer = !!(latest && isNewer(latest.version, current));
    log("update-check", { current, latest: latest?.version || null, newer });
    if (!newer) {
      if (interactive) await message({ type: "info", message: "FM-1 Emulator is up to date.",
        detail: latest ? `You have version ${current}; the latest release is ${latest.version}.` : `You have version ${current}. There is no published release to compare with yet.`,
        buttons: ["OK"] });
      return;
    }
    if (!interactive && offered === latest.version) return;
    offered = latest.version;
    const { response } = await message({ type: "info", message: `FM-1 Emulator ${latest.version} is available.`,
      detail: `You have ${current}. ${HOW[installKind()] || "Download it from the release page."}`,
      buttons: ["Open release page", "Later"], defaultId: 0, cancelId: 1 });
    if (response === 0) await shell.openExternal(latest.page);
  } catch (error) {
    log("update-error", { kind: error?.kind || "other", error: String(error?.message || error).split("\n")[0] });
    if (interactive) {
      const detail = {
        offline: "There's no connection to GitHub right now. Try again when you're online.",
        timeout: "GitHub didn't answer in time. Try again in a moment.",
        limited: "GitHub is limiting update checks from this network for now. Try again later, or look at the releases page.",
      }[error?.kind] || `${String(error?.message || error).split("\n")[0]}\nYou can also look for a newer version on the releases page.`;
      const { response } = await message({ type: "warning", message: "Couldn't check for updates.", detail,
        buttons: ["OK", "Open releases page"], defaultId: 0, cancelId: 0 });
      if (response === 1) await shell.openExternal(RELEASES);
    }
  } finally {
    busy = false;
  }
}

// a release version as x.y.z with an optional prerelease and build suffix, or null: it ends up
// in a URL and a dialog
function cleanVersion(v) {
  const m = /^v?(\d{1,9}\.\d{1,9}\.\d{1,9}(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)(?:\+[0-9A-Za-z.-]+)?$/.exec(String(v ?? "").trim());
  return m ? m[1] : null;
}

// semver precedence: x.y.z first; then a release is newer than its own prereleases (1.2.0 >
// 1.2.0-beta.2), and prereleases compare field by field (numbers numerically, beta.10 > beta.2).
// Anything unreadable is never newer.
function compareVersions(a, b) {
  const pa = cleanVersion(a), pb = cleanVersion(b);
  if (!pa || !pb) return null;
  const split = (v) => { const i = v.indexOf("-"); return [v.slice(0, i < 0 ? v.length : i).split(".").map(Number), i < 0 ? [] : v.slice(i + 1).split(".")]; };
  const [ca, ra] = split(pa), [cb, rb] = split(pb);
  for (let i = 0; i < 3; i++) if (ca[i] !== cb[i]) return ca[i] > cb[i] ? 1 : -1;
  if (!ra.length || !rb.length) return ra.length === rb.length ? 0 : ra.length ? -1 : 1;
  for (let i = 0; i < Math.max(ra.length, rb.length); i++) {
    if (i >= ra.length) return -1;
    if (i >= rb.length) return 1;
    const x = ra[i], y = rb[i], nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (x === y) continue;
    if (nx && ny) return Number(x) > Number(y) ? 1 : -1;
    if (nx !== ny) return nx ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}
const isNewer = (latest, current) => compareVersions(latest, current) === 1;

module.exports = { checkForUpdates, latestRelease, installKind, isNewer, compareVersions, cleanVersion, releasePage, RELEASES };
