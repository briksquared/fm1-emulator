// The app updater's decisions, with Electron and electron-updater replaced by stand-ins: no
// network, no dialogs, no install. Each case scripts the dialog answers and checks what the
// updater did (asked, opened a page, downloaded, restarted) and that it never installs unasked.
import assert from "node:assert/strict";
import Module from "node:module";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const UPDATER = require.resolve("../updater.js");
let env;   // the stand-ins for the current case

function setup({ platform = "win32", packaged = true, version = "1.1.0", latest = "1.2.0", answers = [], check, download, apiStatus = 200, apiTag, fetchError, portable, appimage } = {}) {
  const log = [];
  const updater = new EventEmitter();
  Object.assign(updater, {
    async checkForUpdates() {
      log.push("check");
      if (check) return check(updater);
      return { updateInfo: { version: latest } };
    },
    async downloadUpdate() { log.push("download"); if (download) return download(updater); updater.emit("download-progress", { percent: 50 }); return []; },
    quitAndInstall() { log.push("quitAndInstall"); },
  });
  const electron = {
    app: { isPackaged: packaged, getVersion: () => version },
    dialog: { async showMessageBox(...a) { const o = a[a.length - 1]; log.push("dialog:" + o.message); const r = answers.length ? answers.shift() : (o.cancelId ?? 0); return { response: r }; } },
    shell: { openExternal(u) { log.push("open:" + u); } },
    net: { async fetch() { log.push("api"); if (fetchError) throw new Error(fetchError); return { ok: apiStatus < 400, status: apiStatus, json: async () => ({ tag_name: apiTag ?? "v" + latest }) }; } },
    BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  };
  env = { electron, updater: { autoUpdater: updater } };
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  delete process.env.PORTABLE_EXECUTABLE_DIR; delete process.env.APPIMAGE;
  if (portable) process.env.PORTABLE_EXECUTABLE_DIR = "C:\\x";
  if (appimage) process.env.APPIMAGE = "/x.AppImage";
  delete require.cache[UPDATER];
  const mod = require(UPDATER);
  return { mod, log, updater };
}
const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "electron") return env.electron;
  if (request === "electron-updater") return env.updater;
  return realLoad.call(this, request, ...rest);
};
const realPlatform = process.platform;
const flush = () => new Promise((r) => setImmediate(r));

const tests = {
  async "a development copy never checks"() {
    const { mod, log } = setup({ packaged: false });
    await mod.checkForUpdates({ interactive: true });
    assert.deepEqual(log, ["dialog:Updates are checked in the installed app."]);
  },
  async "up to date: says so when asked, stays quiet at startup"() {
    let { mod, log } = setup({ latest: "1.1.0" });
    await mod.checkForUpdates({ interactive: true });
    assert.deepEqual(log, ["check", "dialog:FM-1 Emulator is up to date."]);
    ({ mod, log } = setup({ latest: "1.1.0" }));
    await mod.checkForUpdates();
    assert.deepEqual(log, ["check"]);
  },
  async "an older release is not offered"() {
    const { mod, log } = setup({ version: "1.2.0", latest: "1.1.0" });
    await mod.checkForUpdates({ interactive: true });
    assert.ok(log.includes("dialog:FM-1 Emulator is up to date."));
  },
  async "Windows installer: Later downloads nothing"() {
    const { mod, log } = setup({ answers: [2] });
    await mod.checkForUpdates({ interactive: true });
    assert.deepEqual(log, ["check", "dialog:FM-1 Emulator 1.2.0 is available."]);
  },
  async "Windows installer: Download, then Later: no restart forced"() {
    const { mod, log } = setup({ answers: [0, 1] });
    await mod.checkForUpdates({ interactive: true }); await flush();
    assert.deepEqual(log, ["check", "dialog:FM-1 Emulator 1.2.0 is available.", "download", "dialog:FM-1 Emulator 1.2.0 is ready to install."]);
  },
  async "Windows installer: Download, then Restart now"() {
    const { mod, log } = setup({ answers: [0, 0] });
    await mod.checkForUpdates({ interactive: true }); await flush();
    assert.equal(log.at(-1), "quitAndInstall");
  },
  async "after a download, checking again offers the restart instead of a second download"() {
    const { mod, log } = setup({ answers: [0, 1, 1] });
    await mod.checkForUpdates({ interactive: true }); await mod.checkForUpdates({ interactive: true });
    assert.equal(log.filter((x) => x === "download").length, 1);
    assert.equal(log.at(-1), "dialog:FM-1 Emulator 1.2.0 is ready to install.");
  },
  async "Release notes opens the tag page and downloads nothing"() {
    const { mod, log } = setup({ answers: [1] });
    await mod.checkForUpdates({ interactive: true });
    assert.ok(log.includes("open:https://github.com/briksquared/fm1-emulator/releases/tag/v1.2.0"));
    assert.ok(!log.includes("download"));
  },
  async "macOS never uses the in-place updater; it opens the download page if asked"() {
    const { mod, log } = setup({ platform: "darwin", answers: [0] });
    await mod.checkForUpdates({ interactive: true });
    assert.deepEqual(log, ["api", "dialog:FM-1 Emulator 1.2.0 is available.", "open:https://github.com/briksquared/fm1-emulator/releases/tag/v1.2.0"]);
  },
  async ".deb and portable builds only link"() {
    for (const o of [{ platform: "linux" }, { platform: "win32", portable: true }]) {
      const { mod, log } = setup({ ...o, answers: [1] });
      await mod.checkForUpdates({ interactive: true });
      assert.deepEqual(log, ["api", "dialog:FM-1 Emulator 1.2.0 is available."], JSON.stringify(o));
    }
  },
  async "AppImage uses the in-place updater"() {
    const { mod, log } = setup({ platform: "linux", appimage: true, answers: [2] });
    await mod.checkForUpdates({ interactive: true });
    assert.equal(log[0], "check");
  },
  async "offline: a plain message when asked, silence at startup"() {
    let { mod, log } = setup({ check: async () => { throw new Error("net::ERR_INTERNET_DISCONNECTED"); } });
    await mod.checkForUpdates({ interactive: true });
    assert.deepEqual(log, ["check", "dialog:Couldn't check for updates."]);
    ({ mod, log } = setup({ check: async () => { throw new Error("net::ERR_INTERNET_DISCONNECTED"); } }));
    await mod.checkForUpdates();
    assert.deepEqual(log, ["check"]);
  },
  async "an updater error event still reaches the dialog with its reason"() {
    const msgs = [];
    const { mod } = setup({ check: async (u) => { const e = new Error("bad feed"); u.emit("error", e); throw e; } });
    env.electron.dialog.showMessageBox = async (...a) => { msgs.push(a.at(-1).detail); return { response: 0 }; };
    await mod.checkForUpdates({ interactive: true });
    assert.match(msgs[0], /^bad feed/);
  },
  async "a failed download leaves no half state: the next check starts over"() {
    let n = 0;
    const { mod, log } = setup({ answers: [0, 0, 2], download: async () => { if (!n++) throw new Error("socket hang up"); return []; } });
    await mod.checkForUpdates({ interactive: true });
    assert.ok(log.includes("dialog:Couldn't check for updates."));
    await mod.checkForUpdates({ interactive: true });
    assert.equal(log.filter((x) => x === "check").length, 2);
    assert.ok(!log.includes("quitAndInstall"));
  },
  async "a second check while one runs is refused, not doubled"() {
    let release;
    const { mod, log } = setup({ check: () => new Promise((r) => { release = () => r({ updateInfo: { version: "1.1.0" } }); }) });
    const first = mod.checkForUpdates();
    await mod.checkForUpdates({ interactive: true });
    release(); await first;
    assert.equal(log.filter((x) => x === "check").length, 1);
    assert.ok(log.includes("dialog:Already checking for updates."));
  },
  async "GitHub API errors and junk tags"() {
    let { mod, log } = setup({ platform: "darwin", apiStatus: 403 });
    await mod.checkForUpdates({ interactive: true });
    assert.ok(log.includes("dialog:Couldn't check for updates."));
    ({ mod, log } = setup({ platform: "darwin", apiTag: "v9.9.9/../../evil" }));
    await mod.checkForUpdates({ interactive: true });
    assert.ok(!log.some((x) => x.startsWith("open:")));
    assert.ok(log.includes("dialog:FM-1 Emulator is up to date."));
  },
  async "version comparison"() {
    const { mod } = setup();
    assert.equal(mod.isNewer("1.2.0", "1.1.0"), true);
    assert.equal(mod.isNewer("1.10.0", "1.9.0"), true);
    assert.equal(mod.isNewer("1.1.0", "1.1.0"), false);
    assert.equal(mod.isNewer("1.2.0-beta", "1.2.0"), false);
    assert.equal(mod.cleanVersion("v1.2.3"), "1.2.3");
    assert.equal(mod.cleanVersion("1.2"), null);
    assert.equal(mod.cleanVersion("1.2.3 <b>"), null);
  },
};
let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { await fn(); console.log("ok  ", name); } catch (e) { failed++; console.log("FAIL", name, "\n     ", e.message); }
}
Object.defineProperty(process, "platform", { value: realPlatform });
if (failed) process.exit(1);
console.log(`updater tests: ${Object.keys(tests).length} passed`);
