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

const THEMES = ["Midnight", "Graphite", "Cobalt", "Emerald", "Crimson", "Vaporwave", "Ice", "Paper"];

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
  await sleep(700);
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
  await sleep(450);
}

async function shot(name) {
  const path = resolve(outDir, name);
  await page.screenshot({ path, type: "png" });
  console.log("ok", name);
}

async function startFw(id) {
  await goto(`fw=${encodeURIComponent(id)}`);
  await page.waitForFunction(() => (document.getElementById("fw")?.options?.length || 0) > 1, { timeout: 45000 }).catch(() => {});
  await page.evaluate((fw) => {
    const sel = document.getElementById("fw");
    if (sel) {
      const opt = [...sel.options].find((o) => o.value === fw || (o.textContent || "").toLowerCase().includes(fw.toLowerCase()));
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
    }
  }, id);
  await sleep(400);
  const started = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => /^Start$/i.test(b.textContent.trim()));
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (started) await sleep(4200);
}

async function openDeckMod(label) {
  await page.evaluate((lab) => {
    const face = [...document.querySelectorAll(".fm1-face, .fm1-mod")].find((el) =>
      new RegExp(lab, "i").test(el.textContent || ""));
    face?.click?.() || face?.querySelector?.(".fm1-face")?.click();
  }, label);
  await sleep(600);
}

try {
  await startFw("felucca");

  // One clean shot per interface colour
  let n = 1;
  for (const theme of THEMES) {
    await setTheme(theme);
    await sleep(300);
    const file = `${String(n).padStart(2, "0")}-${theme.toLowerCase()}.png`;
    await shot(file);
    n++;
  }

  // Feature shots (still cycling colours)
  await setTheme("Cobalt");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button,a,[role=button]")].find((b) => /Customize/i.test(b.textContent || ""));
    btn?.click();
  });
  await sleep(700);
  await shot("09-cobalt-customize.png");

  await setTheme("Emerald");
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

  await setTheme("Ice");
  await openDeckMod("GATE");
  await sleep(500);
  await shot("11-ice-patch-bay.png");

  await setTheme("Vaporwave");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button,summary,a")].find((b) => /^Keys$/i.test((b.textContent || "").trim()) || /\bKeys\b/i.test(b.textContent || ""));
    btn?.click();
  });
  await sleep(700);
  await shot("12-vaporwave-keys.png");

  // Hero for README top
  await setTheme("Midnight");
  await sleep(800);
  const hero = resolve(root, "docs/screenshot.jpg");
  await page.screenshot({ path: hero, type: "jpeg", quality: 90 });
  console.log("ok screenshot.jpg");
  // Also keep a PNG hero copy of Midnight
  copyFileSync(resolve(outDir, "01-midnight.png"), resolve(outDir, "hero-midnight.png"));
} finally {
  await browser.close();
}

console.log(`PASS: screenshots in ${outDir}`);
