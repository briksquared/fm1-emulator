// Capture README gallery shots from a running local site server.
// Usage: CHROME="C:/.../chrome.exe" node tools/capture-screenshots.mjs [baseUrl]
import { createRequire } from "node:module";
import { mkdirSync, unlinkSync, readdirSync, copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = resolve(root, "docs/screenshots");
const chrome = process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const base = (process.argv[2] || "http://127.0.0.1:8845/emulator/").replace(/\/?$/, "/");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const require = createRequire(resolve(
  process.env.PUPPETEER_ROOT || "C:/Users/briks/Desktop/GitHub/audio/firmwares/FM1-FIRMWARE/FM1-firmwares/app",
  "package.json",
));
const puppeteer = require("puppeteer-core");

// One distinct firmware per colour / feature / hero so the LCD is not the same Felucca home every time.
const THEME_SHOTS = [
  { theme: "Midnight", fw: "aurora", file: "01-midnight.png" },
  { theme: "Graphite", fw: "jiant", file: "02-graphite.png" },
  { theme: "Cobalt", fw: "sidou", file: "03-cobalt.png" },
  { theme: "Emerald", fw: "melodee", file: "04-emerald.png" },
  { theme: "Crimson", fw: "bigorna", file: "05-crimson.png" },
  { theme: "Vaporwave", fw: "ravel", file: "06-vaporwave.png" },
  { theme: "Ice", fw: "cutador", file: "07-ice.png" },
  { theme: "Paper", fw: "bunker", file: "08-paper.png" },
];
const FEATURE_SHOTS = {
  customize: { theme: "Cobalt", fw: "karma" },
  browser: { theme: "Emerald", fw: "mono2k" },
  patchBay: { theme: "Ice", fw: "chipbox" },
  keys: { theme: "Vaporwave", fw: "beetleblue" },
};
const HERO = { theme: "Midnight", fw: "aurora" };

mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) {
  if (/\.(png|jpg|jpeg|webp)$/i.test(f)) unlinkSync(resolve(outDir, f));
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: "new",
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  args: ["--no-sandbox", "--disable-gpu", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
page.setDefaultTimeout(60000);

async function goto(qs = "") {
  await page.goto(base + (qs ? `?${qs}` : ""), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("fw") || document.querySelector(".side"), { timeout: 30000 }).catch(() => {});
  await sleep(500);
}

async function setTheme(name) {
  await page.evaluate((theme) => {
    const TH = window.FM1Theme;
    if (!TH) {
      document.documentElement.dataset.theme = theme;
      return;
    }
    const ui = { theme };
    TH.save(ui);
    TH.apply(ui);
  }, name);
  await sleep(350);
}

async function shot(name) {
  const path = resolve(outDir, name);
  await page.screenshot({ path, type: "png" });
  console.log("ok", name);
}

async function dismissOverlays() {
  await page.keyboard.press("Escape");
  await sleep(150);
  await page.keyboard.press("Escape");
  await sleep(150);
  await page.evaluate(() => {
    for (const sel of [
      "[data-close]", ".modal-close", ".drawer-close", ".panel-close",
      "button[aria-label*=close i]", "button[title*=close i]",
    ]) {
      document.querySelectorAll(sel).forEach((el) => { try { el.click(); } catch {} });
    }
    for (const lab of [/^Close$/i, /^×$/, /^✕$/]) {
      [...document.querySelectorAll("button,a,[role=button]")].forEach((b) => {
        const t = (b.textContent || "").trim();
        if (lab.test(t) && b.offsetParent) { try { b.click(); } catch {} }
      });
    }
    document.querySelectorAll(".modal,.drawer,.overlay,[aria-modal=true]").forEach((el) => {
      el.classList.remove("open", "show", "active", "visible");
      if (el.style) el.style.display = "none";
    });
  });
  await sleep(250);
}

async function isRunning() {
  return page.evaluate(() => {
    try {
      if (window.FM1?.running?.()) return true;
    } catch {}
    const start = document.getElementById("start");
    // After a successful boot the Start control is hidden.
    if (start && start.hidden) return true;
    const st = (document.getElementById("status")?.textContent || "").toLowerCase();
    if (st && !/click start|preparing|ready: click/.test(st) && /mhz|real time|load/.test(st)) return true;
    return false;
  });
}

async function pokeMachine() {
  // Real key events (not evaluate-clicks) so the audio path and LCD update.
  await page.keyboard.down("KeyA");
  await sleep(140);
  await page.keyboard.up("KeyA");
  await page.keyboard.down("KeyS");
  await sleep(140);
  await page.keyboard.up("KeyS");
  await page.keyboard.down("KeyD");
  await sleep(200);
  await page.keyboard.up("KeyD");
  await sleep(500);
}

async function startFw(id) {
  // Fresh document each boot so the prior AudioContext / worker cannot stick.
  await page.goto("about:blank");
  await goto(`fw=${encodeURIComponent(id)}`);
  await page.waitForFunction(() => (document.getElementById("fw")?.options?.length || 0) > 1, { timeout: 45000 }).catch(() => {});
  await page.waitForSelector("#start", { timeout: 30000 });
  await page.waitForFunction(() => {
    const b = document.getElementById("start");
    return b && b.dataset.ready === "true" && !b.disabled;
  }, { timeout: 30000 }).catch(() => {});

  const picked = await page.evaluate((fw) => {
    const sel = document.getElementById("fw");
    if (!sel) return null;
    const needle = fw.toLowerCase();
    const opt = [...sel.options].find((o) => o.value.toLowerCase() === needle)
      || [...sel.options].find((o) => o.value.toLowerCase().includes(needle))
      || [...sel.options].find((o) => (o.textContent || "").toLowerCase().includes(needle));
    if (!opt) return null;
    sel.value = opt.value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return { value: opt.value, label: (opt.textContent || "").trim() };
  }, id);
  if (!picked) {
    console.warn("warn: firmware not found in selector:", id);
    return;
  }
  await sleep(400);

  // Must be a real CDP click — evaluate()-click does not unlock AudioContext, so the LCD stays blank.
  try {
    await page.click("#start", { delay: 40 });
  } catch (err) {
    console.warn("warn: #start click failed for", id, err.message);
    return;
  }

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await isRunning()) break;
    await sleep(350);
  }
  if (!(await isRunning())) {
    console.warn("warn: firmware never reported running:", id, "picked=", picked);
    return;
  }
  await pokeMachine();
  await sleep(1100);
  const label = await page.evaluate(() => (document.getElementById("status")?.textContent || "").trim().slice(0, 80));
  console.log("running", id, "→", picked.value, "|", label);
}

async function openDeckMod(label) {
  await page.evaluate((lab) => {
    const face = [...document.querySelectorAll(".fm1-face, .fm1-mod")].find((el) =>
      new RegExp(lab, "i").test(el.textContent || ""));
    face?.click?.() || face?.querySelector?.(".fm1-face")?.click();
  }, label);
  await sleep(600);
}

async function bootThemeShot({ theme, fw, file }) {
  await startFw(fw);
  await dismissOverlays();
  await setTheme(theme);
  await pokeMachine();
  await sleep(500);
  await shot(file);
}

try {
  for (const spec of THEME_SHOTS) {
    await bootThemeShot(spec);
  }

  // Feature: Customize (karma on Cobalt)
  await startFw(FEATURE_SHOTS.customize.fw);
  await dismissOverlays();
  await setTheme(FEATURE_SHOTS.customize.theme);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button,a,[role=button]")].find((b) => /Customize/i.test(b.textContent || ""));
    btn?.click();
  });
  await sleep(700);
  await shot("09-cobalt-customize.png");
  await dismissOverlays();

  // Feature: Browser (mono2k on Emerald)
  await startFw(FEATURE_SHOTS.browser.fw);
  await dismissOverlays();
  await setTheme(FEATURE_SHOTS.browser.theme);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button,a,[role=button]")].find((b) => /Browse|Browser|Firmwares/i.test(b.textContent || ""));
    btn?.click();
  });
  await sleep(700);
  await page.evaluate(() => {
    const input = document.querySelector('input[type=search], input[placeholder*="earch" i], #fw-search, .fw-search input');
    if (input) {
      input.focus();
      input.value = "drum";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await sleep(700);
  await shot("10-emerald-browser.png");
  await dismissOverlays();

  // Feature: Patch bay (chipbox on Ice)
  await startFw(FEATURE_SHOTS.patchBay.fw);
  await dismissOverlays();
  await setTheme(FEATURE_SHOTS.patchBay.theme);
  await openDeckMod("GATE");
  await sleep(500);
  await shot("11-ice-patch-bay.png");

  // Feature: Keys (beetle on Vaporwave)
  await startFw(FEATURE_SHOTS.keys.fw);
  await dismissOverlays();
  await setTheme(FEATURE_SHOTS.keys.theme);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button,summary,a")].find((b) =>
      /^Keys$/i.test((b.textContent || "").trim()) || /\bKeys\b/i.test(b.textContent || ""));
    btn?.click();
  });
  await sleep(700);
  await shot("12-vaporwave-keys.png");
  await dismissOverlays();

  // Hero under Downloads: AURORA on Midnight — rename file so GitHub CDN cannot keep the old Felucca/menu JPG.
  await startFw(HERO.fw);
  await dismissOverlays();
  await setTheme(HERO.theme);
  await pokeMachine();
  await sleep(1000);
  const heroJpg = resolve(root, "docs/hero.jpg");
  const heroLegacy = resolve(root, "docs/screenshot.jpg");
  await page.screenshot({ path: heroJpg, type: "jpeg", quality: 92 });
  copyFileSync(heroJpg, heroLegacy);
  copyFileSync(resolve(outDir, "01-midnight.png"), resolve(outDir, "hero-midnight.png"));
  console.log("ok hero.jpg (+ screenshot.jpg mirror)");
} finally {
  await browser.close();
}

console.log(`PASS: screenshots in ${outDir}`);
