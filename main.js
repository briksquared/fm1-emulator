// FM-1 Emulator desktop app (Electron).
// Serves the static emulator over a FIXED custom origin (fm1://app) so localStorage — favorites,
// customize, stickers, the last firmware — lives in the app's own profile and persists every launch,
// regardless of any dev-server port. Fully offline: the emulator, firmware archive and fw/ are bundled.
const { app, BrowserWindow, Menu, dialog, protocol, screen, shell, ipcMain, session } = require("electron");
const updates = require("./updater");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

// Hardware acceleration made the full window turn black after Start on a real
// Windows installation. Keep the reliable renderer by default; the override
// remains available for graphics diagnostics.
const softwareRendering = process.env.FM1_SOFTWARE_RENDERING !== "0";
if (softwareRendering) app.disableHardwareAcceleration();
// Automated checks can use an isolated profile so they never contend with a
// user's running installed copy or alter its favorites and saved firmware.
// The installer's shortcuts carry the appId as their AppUserModelID. The window must use the
// same one, or Windows groups it apart from a pinned shortcut and keeps the pin's old icon.
if (process.platform === "win32") app.setAppUserModelId("com.briksquared.fm1emulator");
if (process.env.FM1_SELFTEST_PROFILE) app.setPath("userData", path.resolve(process.env.FM1_SELFTEST_PROFILE));

function desktopLog(event, details) {
  try {
    const dir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "desktop.log"), `${new Date().toISOString()} ${event} ${JSON.stringify(details)}\n`);
  } catch { /* a logging failure must not stop the app */ }
}

// Packaged: the site/ tree lives in resources. Dev (npm start): the same site/ beside this file.
const DEV_SITE = path.join(__dirname, "site");
const ROOT = app.isPackaged ? path.join(process.resourcesPath, "site") : (fs.existsSync(DEV_SITE) ? DEV_SITE : path.join(__dirname, ".."));

// The emulator can still use its browser/Web-MIDI installer, but the desktop app
// also hands recovery work to M-Flasher.  Keep this allow-listed: renderer code
// never supplies a command or a path to execute.
function mFlasherPath() {
  // M-Flasher is a Windows-only third-party tool, bundled with the Windows build (resources/M-Flasher).
  // From a source checkout it is used from vendor/; anywhere else the UI offers a download link.
  const candidates = [
    path.join(process.resourcesPath, "M-Flasher", "M-Flasher.exe"),
    path.join(__dirname, "vendor", "M-Flasher", "M-Flasher.exe"),
  ];
  return candidates.find((file) => file && fs.existsSync(file)) || null;
}

function isInsideRoot(file) {
  const relative = path.relative(ROOT, file);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

const MIME = {
  ".html": "text/html", ".htm": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".wasm": "application/wasm", ".css": "text/css", ".map": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".txt": "text/plain",
  ".fwsc": "application/octet-stream", ".syx": "application/octet-stream", ".fm1save": "application/octet-stream",
};

// Register fm1:// as a standard, secure scheme BEFORE the app is ready so localStorage/AudioWorklet work.
protocol.registerSchemesAsPrivileged([
  { scheme: "fm1", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// Open at most as large as the screen's work area (the taskbar/dock excluded). A fixed
// 1300x900 window, or a 640 px minimum height, is taller than a 1366x768 screen at 125% or
// 150% scaling (614 or 512 px), which put the bottom of the window off screen.
function windowBounds() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const minWidth = Math.min(800, area.width), minHeight = Math.min(520, area.height);
  return { width: Math.max(minWidth, Math.min(1300, area.width)), height: Math.max(minHeight, Math.min(900, area.height)), minWidth, minHeight };
}

function createWindow() {
  const win = new BrowserWindow({
    ...windowBounds(),
    backgroundColor: "#0b0c0e", title: "FM-1 Emulator", autoHideMenuBar: true,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  let recovering = false;
  function showRecovery(reason) {
    if (win.isDestroyed() || recovering) return;
    recovering = true;
    const safe = String(reason).replace(/[&<>\"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const html = `<!doctype html><meta charset="utf-8"><title>FM-1 Emulator recovery</title><body style="background:#17191e;color:#f0f1f5;font:18px system-ui;padding:64px;max-width:700px"><h1>The emulator window stopped</h1><p>${safe}</p><p>Your saved settings and firmware files are still in place.</p><a style="display:inline-block;background:#ff5b00;color:#fff;padding:14px 22px;border-radius:9px;text-decoration:none" href="fm1://app/emulator/index.html">Reload FM-1 Emulator</a></body>`;
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html)).catch(error => desktopLog("recovery-load-failed", String(error)));
  }
  win.webContents.on("render-process-gone", (_event, details) => {
    desktopLog("renderer-gone", details);
    if (details.reason !== "clean-exit") showRecovery("The desktop renderer closed unexpectedly. Reload the emulator to continue.");
  });
  win.webContents.on("did-fail-load", (_event, code, description, url, mainFrame) => {
    desktopLog("load-failed", { code, description, url, mainFrame });
    if (mainFrame && code !== -3) showRecovery("The app page could not load: " + description);
  });
  win.webContents.on("did-finish-load", () => {
    const url = win.webContents.getURL();
    if (url.startsWith("fm1://app/")) recovering = false;
    desktopLog("page-loaded", { url });
  });
  win.webContents.on("unresponsive", () => desktopLog("renderer-unresponsive", {}));
  // the page blocks unloading only while a firmware install is writing to a real FM-1
  win.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      buttons: ["Keep the install running", "Close anyway"],
      defaultId: 0,
      cancelId: 0,
      message: "A firmware install is writing to your FM-1.",
      detail: "Closing now interrupts it. The FM-1 stays in update mode, and Resume interrupted install finishes it the next time you open the app.",
    });
    if (choice === 1) event.preventDefault();
  });
  win.webContents.on("will-navigate", (event, url) => {
    try {
      const target = new URL(url);
      if (target.protocol === "fm1:" && target.hostname === "app") return;
      event.preventDefault();
      if (target.protocol === "https:" || target.protocol === "http:") shell.openExternal(url);
    } catch { event.preventDefault(); }
  });
  const testParams = new URLSearchParams();
  if (process.env.FM1_SELFTEST && process.env.FM1_SELFTEST_FW) testParams.set("fw", process.env.FM1_SELFTEST_FW);
  if (process.env.FM1_SELFTEST && process.env.FM1_SELFTEST_CLOCK) testParams.set("mhz", process.env.FM1_SELFTEST_CLOCK);
  if (process.env.FM1_SELFTEST && process.env.FM1_SELFTEST_JIT) testParams.set("jit", process.env.FM1_SELFTEST_JIT);
  const testQuery = testParams.size ? "?" + testParams : "";
  win.loadURL("fm1://app/emulator/index.html" + testQuery).catch(error => {
    desktopLog("initial-load-failed", String(error));
    showRecovery("The app could not open its local page.");
  });
  // open external links (Resources, source repos) in the real browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const protocol = new URL(url).protocol;
      if (protocol === "https:" || protocol === "http:") { shell.openExternal(url); return { action: "deny" }; }
    } catch { /* deny malformed URLs below */ }
    return { action: "deny" };
  });
  return win;
}

// Automated end-to-end check (set FM1_SELFTEST=write|read). Proves assets load, a firmware boots,
// and that localStorage survives a full app restart — logs one JSON line, then quits.
function runSelfTest(win, mode) {
  win.webContents.on("did-fail-load", (_e, code, desc, url) => console.log("SELFTEST did-fail-load", code, desc, url));
  win.webContents.on("render-process-gone", (_e, d) => console.log("SELFTEST render-gone", JSON.stringify(d)));
  win.webContents.once("did-finish-load", async () => {
    try {
      const js = mode === "layout"
        ? `(async()=>{ const sleep=ms=>new Promise(r=>setTimeout(r,ms));
             for(let i=0;i<60;i++){ const s=document.getElementById('fw'); if(s&&s.options.length>1&&document.querySelector('.future-install')) break; await sleep(250); }
             const st=document.getElementById('start'); st&&st.click(); await sleep(3500);
             const r=el=>el?(b=>({x:Math.round(b.left),w:Math.round(b.width),h:Math.round(b.height),top:Math.round(b.top),bottom:Math.round(b.bottom)}))(el.getBoundingClientRect()):null;
             const L=document.querySelector('.side-left'),deck=document.querySelector('.deck'),R=document.querySelector('.side-right'),cv=window.FM1&&window.FM1.panelCanvas;
             const lb=L&&L.getBoundingClientRect(),db=deck&&deck.getBoundingClientRect(),rb=R&&R.getBoundingClientRect(),cb=cv&&cv.getBoundingClientRect();
             return { vw:innerWidth, vh:innerHeight, left:r(L), deck:r(deck), right:r(R), canvas:r(cv),
               flashInRight:!!R?.querySelector('.future-install'), firmwareInLeft:!!L?.querySelector('#fw'),
               threeInaRow: lb&&db&&rb ? (lb.right<=db.left+1 && db.right<=rb.left+1 && Math.abs(lb.top-rb.top)<60) : false,
               machineInView: !!cb && cb.top>=0 && cb.bottom<=innerHeight+1 && cb.left>=0 && cb.right<=innerWidth+1,
               noSideScroll: document.documentElement.scrollWidth<=innerWidth+1 }; })()`
        : mode === "search"
        ? `(async()=>{ const sleep=ms=>new Promise(r=>setTimeout(r,ms));
             for(let i=0;i<80;i++){ if(document.getElementById('fw-search')&&(document.getElementById('fw')?.options.length||0)>=259) break; await sleep(200); }
             const q=document.getElementById('fw-search'), results=document.getElementById('fw-search-results');
             const run=async value=>{q.value=value;q.dispatchEvent(new Event('input',{bubbles:true}));await sleep(80);return [...results.querySelectorAll('.fw-search-hit')].map(b=>b.dataset.id);};
             const aurora=await run('twochannels aurora'), accent=await run('coqui'), version=await run('0.9.1 FM-1_4747');
             q.value='';q.dispatchEvent(new Event('input',{bubbles:true}));await sleep(40);
             return {fwCount:document.getElementById('fw')?.options.length,aurora,accent,version,cleared:results.hidden}; })()`
        : mode === "updates"
        ? `(async()=>{ const sleep=ms=>new Promise(r=>setTimeout(r,ms));
             for(let i=0;i<80;i++){ const b=document.getElementById('scan-open-source'); if(b&&!b.disabled) break; await sleep(200); }
             const button=document.getElementById('scan-open-source'), status=document.getElementById('open-source-status');
             button.click(); for(let i=0;i<120&&button.classList.contains('scanning');i++) await sleep(250);
             return {finished:!button.classList.contains('scanning'),error:status.dataset.error==='true',status:status.textContent}; })()`
        : mode === "read"
        ? `(async()=>{ const sleep=ms=>new Promise(r=>setTimeout(r,ms)); for(let i=0;i<60;i++){ if((document.getElementById('fw')?.options.length||0)>1) break; await sleep(250); } return { fav: (()=>{try{return localStorage.getItem('fm1.favs.v1')}catch(e){return 'ERR:'+e}})(), marker: (()=>{try{return localStorage.getItem('fm1.__selftest')}catch(e){return 'ERR'}})(), fwCount: document.getElementById('fw')?.options.length }; })()`
        : mode === "filefail"
        ? `(async()=>{ const sleep=ms=>new Promise(r=>setTimeout(r,ms));
             for(let i=0;i<60;i++){ if((document.getElementById('fw')?.options.length||0)>1&&window.FM1) break; await sleep(250); }
             await sleep(500); const before=document.getElementById('fw').value;
             const transfer=new DataTransfer(); transfer.items.add(new File([new Uint8Array(9*1024*1024)],'oversize.fwsc'));
             document.querySelector('.stage').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));
             await sleep(250); return { rejected:document.getElementById('status').textContent.includes('larger than 8 MB'), selectionPreserved:document.getElementById('fw').value===before }; })()`
        : mode === "cycle"
        ? `(async()=>{ const sleep=ms=>new Promise(r=>setTimeout(r,ms));
             for(let i=0;i<60;i++){ if((document.getElementById('fw')?.options.length||0)>1&&window.FM1) break; await sleep(250); }
             const select=document.getElementById('fw'), status=document.getElementById('status');
             const first=select.value; document.getElementById('start').click(); await sleep(4000);
             const booted=window.FM1?.running?.()===true, firstStatus=status.textContent;
             const second=first==='felucca'?'hortator':'felucca'; select.value=second; select.dispatchEvent(new Event('change')); await sleep(5000);
             const switched=window.FM1?.running?.()===true&&status.textContent.includes(second==='felucca'?'Felucca':'Hortator'); const secondStatus=status.textContent;
             select.value=first; select.dispatchEvent(new Event('change')); await sleep(5000);
             return {booted,switched,restored:window.FM1?.running?.()===true&&status.textContent.includes(first==='felucca'?'Felucca':'Hortator'),firstStatus,secondStatus,lastStatus:status.textContent}; })()`
        : mode === "bufferfail"
        ? `(async()=>{ const sleep=ms=>new Promise(r=>setTimeout(r,ms));
             for(let i=0;i<60;i++){ if((document.getElementById('fw')?.options.length||0)>1&&window.FM1) break; await sleep(250); }
             document.getElementById('start').click(); await sleep(4000);
             const initial=window.FM1?.running?.()===true, button=document.getElementById('start'), buffer=document.getElementById('buf');
             const original=window.AudioContext; window.AudioContext=class { constructor(){ throw new Error('test context failure'); } };
             buffer.value=buffer.value==='playback'?'interactive':'playback'; buffer.dispatchEvent(new Event('change')); await sleep(3500);
             const recovered=!button.hidden&&!button.disabled&&document.getElementById('status').textContent.includes('Audio buffer change failed');
             window.AudioContext=original; button.click(); await sleep(4500);
             return {initial,recovered,running:window.FM1?.running?.()===true,status:document.getElementById('status').textContent}; })()`
        : mode === "ports"
        ? `(async()=>{ try { const midi=await navigator.requestMIDIAccess({sysex:true});
             return { inputs:[...midi.inputs.values()].map(p=>({name:p.name,state:p.state})),
               outputs:[...midi.outputs.values()].map(p=>({name:p.name,state:p.state})) }; }
             catch(error){ return {error:String(error)}; } })()`
        : `(async()=>{ const out={};
             const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
             // wait until the catalog select and the favorites API are ready (packaged first-run can be slow)
             for(let i=0;i<60;i++){ const sel=document.getElementById('fw'); if(sel&&sel.options.length>1&&window.FM1Fav&&window.FM1Loader&&document.getElementById('gal-btn')&&document.querySelector('.future-install')) break; await sleep(250); }
             out.fwCount=document.getElementById('fw')?.options.length;
             out.hasFavApi=!!window.FM1Fav; out.hasGallery=!!document.getElementById('gal-btn'); out.hasLoader=!!window.FM1Loader;
             out.hasDeviceLab=!!document.getElementById('inst-device-lab'); out.hasRecovery=!!document.getElementById('inst-recovery');
             const s=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Start'); out.hasStart=!!s; s&&s.click();
             for(let i=0;i<60&&!window.FM1?.running?.();i++) await sleep(250);
             out.running=window.FM1?.running?.() === true;
             out.runningFirmware=window.FM1?.runningFirmware?.()||null; out.status=document.getElementById('status')?.textContent;
             try{ window.FM1Fav&&window.FM1Fav.toggle('felucca'); }catch(e){ out.favErr=String(e); }
             try{ localStorage.setItem('fm1.__selftest','persisted'); }catch(e){ out.lsErr=String(e); }
             out.favNow=(()=>{try{return localStorage.getItem('fm1.favs.v1')}catch{return 'ERR'}})();
             return out; })()`;
      const res = await win.webContents.executeJavaScript(js, true);
      console.log("SELFTEST_RESULT " + JSON.stringify(res));
      const passed = mode === "search"
        ? Number(res.fwCount) === 259 && res.aurora.length === 1 && res.aurora[0] === "aurora" && res.accent.includes("coqui") && res.version.includes("aurora") && res.cleared
        : mode === "updates"
        ? res.finished && !res.error && /^(Up to date|Found \d+ new)/.test(res.status)
        : mode === "read"
        ? res.marker === "persisted" && Number(res.fwCount) > 1
        : mode === "filefail"
          ? res.rejected && res.selectionPreserved
        : mode === "cycle"
          ? res.booted && res.switched && res.restored
        : mode === "bufferfail"
          ? res.initial && res.recovered && res.running
        : mode === "ports"
          ? !res.error && Array.isArray(res.inputs) && Array.isArray(res.outputs)
        : mode === "layout"
          ? res.flashInRight && res.firmwareInLeft && res.threeInaRow && res.machineInView && res.noSideScroll
          : Number(res.fwCount) > 1 && res.hasFavApi && res.hasGallery && res.hasLoader &&
            res.hasDeviceLab && res.hasRecovery && res.hasStart && res.running;
      if (!passed) {
        console.error("SELFTEST_ASSERTION_FAILED", mode, JSON.stringify(res));
        setTimeout(() => app.exit(1), 600);
        return;
      }
    } catch (e) {
      console.log("SELFTEST_ERROR " + String(e));
      setTimeout(() => app.exit(1), 600);
      return;
    }
    setTimeout(() => app.quit(), 600);
  });
}

// The standard menus plus "Check for App Updates…" (the desktop app itself, from GitHub
// Releases; firmware updates are the page's own update radar).
function appMenu() {
  const check = { label: "Check for App Updates…", click: () => updates.checkForUpdates({ interactive: true, log: desktopLog }) };
  const releases = { label: "Release Notes", click: () => shell.openExternal(updates.RELEASES) };
  const mac = process.platform === "darwin";
  return Menu.buildFromTemplate([
    ...(mac ? [{ label: app.name, submenu: [{ role: "about" }, check, { type: "separator" }, { role: "services" },
      { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] }] : []),
    { role: "fileMenu" }, { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" },
    { role: "help", submenu: [...(mac ? [] : [check]), releases] },
  ]);
}

// Single-instance: clicking the icon again focuses the existing window instead of
// spawning a second one (second windows never pick up new files and look "stuck").
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const existing = BrowserWindow.getAllWindows()[0];
    if (existing) { if (existing.isMinimized()) existing.restore(); existing.focus(); }
  });
  app.whenReady().then(() => {
  desktopLog("startup", { softwareRendering, gpuCompositing: app.getGPUFeatureStatus().gpu_compositing });
  // The installer uses Web MIDI SysEx.  Electron otherwise treats this as an
  // ungranted browser permission, so scope it to our local, packaged origin.
  const permitDeviceAccess = (_webContents, permission, callback, details) => {
    const origin = details?.requestingUrl || "";
    callback((permission === "midi" || permission === "midiSysex") && origin.startsWith("fm1://app/"));
  };
  session.defaultSession.setPermissionRequestHandler(permitDeviceAccess);
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) =>
    (permission === "midi" || permission === "midiSysex") && requestingOrigin.startsWith("fm1://app/"));
  ipcMain.handle("fm1:open-flasher", async () => {
    const executable = mFlasherPath();
    if (!executable) {
      return {
        ok: false,
        message: "M-Flasher is not installed. Download its Windows ZIP, extract it, then open M-Flasher.exe.",
        download: "https://github.com/jvitkauskas/m-flasher/releases/latest",
      };
    }
    return new Promise((resolve) => {
      try {
        const child = spawn(executable, [], { detached: true, stdio: "ignore", windowsHide: false });
        child.once("error", (error) => resolve({ ok: false, message: `Could not open M-Flasher: ${error.message}` }));
        child.once("spawn", () => { child.unref(); resolve({ ok: true, path: executable }); });
      } catch (error) { resolve({ ok: false, message: `Could not open M-Flasher: ${error.message}` }); }
    });
  });
  protocol.handle("fm1", async (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname || "/");
    if (p === "/" || p === "") p = "/emulator/index.html";
    const file = path.normalize(path.join(ROOT, p));
    if (!isInsideRoot(file)) return new Response("forbidden", { status: 403 });
    try {
      const data = await fs.promises.readFile(file);
      const ext = path.extname(file).toLowerCase();
      return new Response(data, { headers: { "content-type": MIME[ext] || "application/octet-stream", "cache-control": "no-cache" } });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
  Menu.setApplicationMenu(appMenu());
  const win = createWindow();
  if (process.env.FM1_SELFTEST) runSelfTest(win, process.env.FM1_SELFTEST);
  // a quiet check shortly after launch: it only speaks up when a newer release exists
  else if (app.isPackaged && process.env.FM1_NO_UPDATE_CHECK !== "1")
    setTimeout(() => updates.checkForUpdates({ log: desktopLog }), 15000);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
