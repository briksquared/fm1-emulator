// The app update check, with Electron replaced by stand-ins: no network, no dialogs, no browser.
// Each case scripts GitHub's answer and the dialog answers, and checks what the check did: what
// it said, and which page (if any) it opened. It never downloads or installs anything.
import assert from "node:assert/strict";
import Module from "node:module";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const UPDATER = require.resolve("../updater.js");
let env;   // the stand-ins for the current case

function setup({ platform = "win32", packaged = true, version = "1.1.0", latest = "1.2.0", answers = [], status = 200, body, headers = {}, fetchError, hang, portable, appimage } = {}) {
  const log = [], dialogs = [];
  const electron = {
    app: { isPackaged: packaged, getVersion: () => version },
    dialog: { async showMessageBox(...a) { const o = a[a.length - 1]; dialogs.push(o); log.push("dialog:" + o.message); const r = answers.length ? answers.shift() : (o.cancelId ?? 0); return { response: r }; } },
    shell: { async openExternal(u) { log.push("open:" + u); } },
    net: { fetch(url, opts) {
      log.push("api");
      assert.equal(url, "https://api.github.com/repos/briksquared/fm1-emulator/releases/latest");
      if (hang) return new Promise((_, reject) => opts.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
      if (fetchError) return Promise.reject(new Error(fetchError));
      return Promise.resolve({ ok: status < 400, status, headers: { get: (k) => headers[k] ?? null },
        json: async () => { if (body === "junk") throw new SyntaxError("Unexpected token"); return body !== undefined ? body : { tag_name: "v" + latest, draft: false, prerelease: false }; } });
    } },
    BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  };
  env = { electron };
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  delete process.env.PORTABLE_EXECUTABLE_DIR; delete process.env.APPIMAGE;
  if (portable) process.env.PORTABLE_EXECUTABLE_DIR = "C:\\x";
  if (appimage) process.env.APPIMAGE = "/x.AppImage";
  delete require.cache[UPDATER];
  const mod = require(UPDATER);
  return { mod, log, dialogs };
}
const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "electron") return env.electron;
  if (request === "electron-updater") throw new Error("electron-updater must not be used");
  return realLoad.call(this, request, ...rest);
};
const realPlatform = process.platform;
const PAGE = (tag) => `https://github.com/briksquared/fm1-emulator/releases/tag/${tag}`;
const RELEASES = "https://github.com/briksquared/fm1-emulator/releases";

const tests = {
  async "up to date: says so when asked, stays quiet at startup"() {
    let { mod, log, dialogs } = setup({ latest: "1.1.0" });
    await mod.checkForUpdates({ interactive: true });
    assert.deepEqual(log, ["api", "dialog:FM-1 Emulator is up to date."]);
    assert.match(dialogs[0].detail, /1\.1\.0/);
    ({ mod, log } = setup({ latest: "1.1.0" }));
    await mod.checkForUpdates();
    assert.deepEqual(log, ["api"]);
  },
  async "an older release is not offered"() {
    const { mod, log } = setup({ version: "1.2.0", latest: "1.1.0" });
    await mod.checkForUpdates({ interactive: true });
    assert.deepEqual(log, ["api", "dialog:FM-1 Emulator is up to date."]);
  },
  async "newer: Open release page opens that release on GitHub, nothing else"() {
    const { mod, log, dialogs } = setup({ answers: [0] });
    await mod.checkForUpdates({ interactive: true });
    assert.deepEqual(log, ["api", "dialog:FM-1 Emulator 1.2.0 is available.", "open:" + PAGE("v1.2.0")]);
    assert.deepEqual(dialogs[0].buttons, ["Open release page", "Later"]);
  },
  async "newer: Later opens nothing"() {
    const { mod, log } = setup({ answers: [1] });
    await mod.checkForUpdates({ interactive: true });
    assert.deepEqual(log, ["api", "dialog:FM-1 Emulator 1.2.0 is available."]);
  },
  async "the startup check asks before opening a browser, and asks once per version"() {
    const { mod, log } = setup();
    await mod.checkForUpdates();
    await mod.checkForUpdates();
    assert.deepEqual(log, ["api", "dialog:FM-1 Emulator 1.2.0 is available.", "api"]);
    await mod.checkForUpdates({ interactive: true });   // asking from the menu always answers
    assert.equal(log.filter((l) => l.startsWith("dialog:")).length, 2);
    assert.ok(!log.some((l) => l.startsWith("open:")));
  },
  async "the advice follows how this copy was installed, and every one only links"() {
    for (const [o, re] of [[{ platform: "darwin" }, /Applications/], [{ platform: "linux" }, /\.deb/], [{ platform: "linux", appimage: true }, /AppImage/],
      [{ platform: "win32", portable: true }, /portable/], [{ platform: "win32" }, /installer/]]) {
      const { mod, log, dialogs } = setup({ ...o, answers: [0] });
      await mod.checkForUpdates({ interactive: true });
      assert.match(dialogs[0].detail, re);
      assert.deepEqual(log.at(-1), "open:" + PAGE("v1.2.0"));
    }
  },
  async "a development copy checks only when asked"() {
    let { mod, log } = setup({ packaged: false });
    await mod.checkForUpdates();
    assert.deepEqual(log, []);
    ({ mod, log } = setup({ packaged: false, latest: "1.1.0" }));
    await mod.checkForUpdates({ interactive: true });
    assert.deepEqual(log, ["api", "dialog:FM-1 Emulator is up to date."]);
  },
  async "offline: a plain message when asked, silence at startup"() {
    let { mod, log, dialogs } = setup({ fetchError: "net::ERR_INTERNET_DISCONNECTED" });
    await mod.checkForUpdates({ interactive: true });
    assert.deepEqual(log, ["api", "dialog:Couldn't check for updates."]);
    assert.match(dialogs[0].detail, /no connection/);
    ({ mod, log } = setup({ fetchError: "getaddrinfo ENOTFOUND api.github.com" }));
    await mod.checkForUpdates();
    assert.deepEqual(log, ["api"]);
  },
  async "rate limited: says so, and can open the releases page"() {
    for (const o of [{ status: 403, headers: { "x-ratelimit-remaining": "0" } }, { status: 429 }]) {
      const { mod, log, dialogs } = setup({ ...o, answers: [1] });
      await mod.checkForUpdates({ interactive: true });
      assert.match(dialogs[0].detail, /limiting/);
      assert.deepEqual(log.at(-1), "open:" + RELEASES);
    }
  },
  async "no answer in time: gives up with a message"() {
    const real = setTimeout;
    globalThis.setTimeout = (fn, ms, ...a) => real(fn, Math.min(ms, 5), ...a);
    try {
      const { mod, log, dialogs } = setup({ hang: true });
      await mod.checkForUpdates({ interactive: true });
      assert.deepEqual(log, ["api", "dialog:Couldn't check for updates."]);
      assert.match(dialogs[0].detail, /in time/);
    } finally { globalThis.setTimeout = real; }
  },
  async "server errors, unreadable answers and no release yet"() {
    let { mod, log, dialogs } = setup({ status: 500 });
    await mod.checkForUpdates({ interactive: true });
    assert.match(dialogs[0].detail, /GitHub answered 500/);
    ({ mod, dialogs } = setup({ body: "junk" }));
    await mod.checkForUpdates({ interactive: true });
    assert.match(dialogs[0].detail, /could not be read/);
    ({ mod, log, dialogs } = setup({ status: 404 }));
    await mod.checkForUpdates({ interactive: true });
    assert.deepEqual(log, ["api", "dialog:FM-1 Emulator is up to date."]);
    assert.match(dialogs[0].detail, /no published release/);
  },
  async "junk, draft and prerelease answers never open a page or offer a version"() {
    for (const body of [{ tag_name: "v9.9.9/../../evil" }, { tag_name: "latest" }, { tag_name: 7 }, {}, null, [],
      { tag_name: "v9.9.9", draft: true }, { tag_name: "v9.9.9-beta.1", prerelease: true }]) {
      const { mod, log } = setup({ body, answers: [0, 1] });
      await mod.checkForUpdates({ interactive: true });
      assert.ok(!log.some((l) => l.includes("is available")), JSON.stringify(body));
      assert.ok(!log.some((l) => l.startsWith("open:")), JSON.stringify(body));
    }
  },
  async "a tag without the v prefix links to its own page"() {
    const { mod, log } = setup({ body: { tag_name: "1.3.0" }, answers: [0] });
    await mod.checkForUpdates({ interactive: true });
    assert.deepEqual(log.at(-1), "open:" + PAGE("1.3.0"));
  },
  async "a second check while one runs is refused, not doubled"() {
    const { mod, log } = setup({ latest: "1.1.0" });
    const first = mod.checkForUpdates({ interactive: true });
    await mod.checkForUpdates({ interactive: true });
    await first;
    assert.equal(log.filter((l) => l === "api").length, 1);
    assert.ok(log.includes("dialog:Already checking for updates."));
  },
  async "release pages stay on this repository"() {
    const { mod } = setup();
    assert.equal(mod.releasePage("v1.2.0"), PAGE("v1.2.0"));
    assert.equal(mod.releasePage("v1.2.0-beta.1"), PAGE("v1.2.0-beta.1"));
    for (const t of ["../../x", "v1.2.0/../../x", "v1.2.0?x", "v1.2.0#x", "https://evil/v1.2.0", ""]) assert.equal(mod.releasePage(t), RELEASES, t);
  },
  async "versions: semver order, prereleases before their release, junk never newer"() {
    const { mod } = setup();
    const newer = [["1.2.0", "1.1.9"], ["1.10.0", "1.9.0"], ["2.0.0", "1.99.99"], ["1.2.0", "1.2.0-beta.3"], ["1.2.0-beta.10", "1.2.0-beta.2"],
      ["1.2.0-rc.1", "1.2.0-beta.9"], ["1.2.0-beta.1", "1.2.0-beta"], ["1.2.0-beta", "1.2.0-1"], ["v1.2.1", "1.2.0+build.5"]];
    for (const [a, b] of newer) { assert.ok(mod.isNewer(a, b), `${a} > ${b}`); assert.ok(!mod.isNewer(b, a), `${b} < ${a}`); }
    for (const [a, b] of [["1.2.0", "1.2.0"], ["v1.2.0", "1.2.0"], ["1.2.0+a", "1.2.0+b"], ["1.2.0-beta.1", "1.2.0-beta.1"]]) assert.ok(!mod.isNewer(a, b), `${a} = ${b}`);
    for (const j of ["", "latest", "1.2", "1.2.0.0", "1.2.0-", "1.2.0-beta..1", "1.2.0/../x", null, undefined, 3]) assert.ok(!mod.isNewer(j, "0.0.1"), String(j));
    assert.equal(mod.cleanVersion("v1.2.0+build.7"), "1.2.0");
  },
  async "a newer prerelease build is offered the final release"() {
    const { mod, log } = setup({ version: "1.2.0-beta.2", latest: "1.2.0", answers: [1] });
    await mod.checkForUpdates({ interactive: true });
    assert.ok(log.includes("dialog:FM-1 Emulator 1.2.0 is available."));
  },
};

let passed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { await fn(); passed++; console.log(`ok   ${name}`); }
  catch (error) { console.log(`FAIL ${name}\n${error.stack}`); process.exitCode = 1; }
}
Object.defineProperty(process, "platform", { value: realPlatform, configurable: true });
console.log(`updater tests: ${passed} passed${process.exitCode ? ", some failed" : ""}`);
