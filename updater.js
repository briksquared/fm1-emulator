// App updates from GitHub Releases (briksquared/fm1-emulator). Separate from the firmware
// update radar in the page: this updates the desktop app itself.
//
// Where the build can replace itself (the Windows installer, an AppImage), a newer release is
// downloaded and installed when the app restarts. Elsewhere it opens the release page:
// unsigned macOS builds cannot install updates in place (Squirrel.Mac requires a signed app),
// a .deb is upgraded through the package manager, and the portable .exe has no installation.
const { app, dialog, shell, net, BrowserWindow } = require("electron");

const RELEASES = "https://github.com/briksquared/fm1-emulator/releases";
const LATEST_API = "https://api.github.com/repos/briksquared/fm1-emulator/releases/latest";

// The newest published (non-draft, non-prerelease) version, for builds that only link to it.
async function latestRelease() {
  const response = await net.fetch(LATEST_API, { headers: { accept: "application/vnd.github+json", "user-agent": `fm1-emulator/${app.getVersion()}` } });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const release = await response.json();
  return String(release.tag_name || "").replace(/^v/, "") || null;
}

let updater = null;
function getUpdater() {
  if (!updater) {
    updater = require("electron-updater").autoUpdater;
    updater.autoDownload = false;            // ask first; a download is ~100 MB
    updater.autoInstallOnAppQuit = true;     // a finished download installs on the next quit
    updater.allowPrerelease = false;
    updater.logger = null;
  }
  return updater;
}

// How this copy was installed decides whether it can update itself.
function installKind() {
  if (process.platform === "win32") return process.env.PORTABLE_EXECUTABLE_DIR ? "portable" : "nsis";
  if (process.platform === "darwin") return "mac";
  if (process.platform === "linux") return process.env.APPIMAGE ? "appimage" : "deb";
  return "other";
}
const canSelfInstall = () => ["nsis", "appimage"].includes(installKind());

const appWindow = () => BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
function message(options) {
  const win = appWindow();
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

let busy = false, downloaded = null;

// interactive: from the menu (always answers); otherwise the quiet check at startup, which
// only speaks up when there is a newer version and never reports network failures.
async function checkForUpdates({ interactive = false, log = () => {} } = {}) {
  if (downloaded) return promptRestart(downloaded);
  if (busy) {
    if (interactive) message({ type: "info", message: "Already checking for updates.", buttons: ["OK"] });
    return;
  }
  if (!app.isPackaged) {
    if (interactive) message({ type: "info", message: "Updates are checked in the installed app.",
      detail: `This is a development copy (${app.getVersion()}).`, buttons: ["OK"] });
    return;
  }
  busy = true;
  try {
    const u = canSelfInstall() ? getUpdater() : null;
    let latest;
    if (u) {
      const result = await u.checkForUpdates();
      if (!result) throw new Error("this copy cannot check for updates");
      latest = result.updateInfo?.version;
    } else latest = await latestRelease();
    const newer = !!(latest && isNewer(latest, app.getVersion()));
    log("update-check", { current: app.getVersion(), latest: latest || null, newer, kind: installKind() });
    if (!newer) {
      if (interactive) await message({ type: "info", message: "FM-1 Emulator is up to date.",
        detail: `You have version ${app.getVersion()}, the latest release.`, buttons: ["OK"] });
      return;
    }
    const page = `${RELEASES}/tag/v${latest}`;
    if (!canSelfInstall()) {
      const how = { mac: "Download it and drag it to Applications to replace this copy.",
        deb: "Download the .deb and install it over this one (sudo apt install ./FM-1-Emulator-*.deb).",
        portable: "Download the new portable .exe or the installer." }[installKind()] || "Download it from the release page.";
      const { response } = await message({ type: "info", message: `FM-1 Emulator ${latest} is available.`,
        detail: `You have ${app.getVersion()}. ${how}`, buttons: ["Open download page", "Later"], defaultId: 0, cancelId: 1 });
      if (response === 0) shell.openExternal(page);
      return;
    }
    const { response } = await message({ type: "info", message: `FM-1 Emulator ${latest} is available.`,
      detail: `You have ${app.getVersion()}. Download it now? It installs when the app restarts; your settings and saved firmware are kept.`,
      buttons: ["Download", "Release notes", "Later"], defaultId: 0, cancelId: 2 });
    if (response === 1) { shell.openExternal(page); return; }
    if (response !== 0) return;
    const win = appWindow();
    const progress = (p) => { if (win && !win.isDestroyed()) win.setProgressBar(Math.max(0, Math.min(1, p.percent / 100))); };
    u.on("download-progress", progress);
    try {
      await u.downloadUpdate();
    } finally {
      u.removeListener("download-progress", progress);
      if (win && !win.isDestroyed()) win.setProgressBar(-1);
    }
    downloaded = latest;
    log("update-downloaded", { version: latest });
    await promptRestart(latest);
  } catch (error) {
    log("update-error", { error: String(error?.message || error) });
    if (interactive) {
      const offline = /ENOTFOUND|ENETUNREACH|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|net::ERR_/i.test(String(error?.message || error));
      const { response } = await message({ type: "warning", message: "Couldn't check for updates.",
        detail: offline ? "There's no connection to GitHub right now. Try again when you're online."
          : `${String(error?.message || error).split("\n")[0]}\nYou can also look for a newer version on the releases page.`,
        buttons: ["OK", "Open releases page"], defaultId: 0, cancelId: 0 });
      if (response === 1) shell.openExternal(RELEASES);
    }
  } finally {
    busy = false;
  }
}

async function promptRestart(version) {
  const { response } = await message({ type: "info", message: `FM-1 Emulator ${version} is ready to install.`,
    detail: "Restart now to finish, or it installs the next time you quit.", buttons: ["Restart now", "Later"], defaultId: 0, cancelId: 1 });
  if (response === 0) setImmediate(() => getUpdater().quitAndInstall(false, true));
}

// semver core comparison (release builds only carry x.y.z)
function isNewer(latest, current) {
  const parse = (v) => String(v).replace(/^v/, "").split(/[.+-]/).slice(0, 3).map((n) => Number(n) || 0);
  const a = parse(latest), b = parse(current);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

module.exports = { checkForUpdates, installKind, isNewer, RELEASES };
