// Capture README gallery shots from a running local site server.
// Usage: CHROME="C:/.../chrome.exe" node tools/capture-screenshots.mjs [baseUrl]
import { createRequire } from "node:module";
import { mkdirSync, unlinkSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = resolve(root, "docs/screenshots");
const chrome = process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const base = (process.argv[2] || "http://127.0.0.1:8844/emulator/").replace(/\/?$/, "/");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const require = createRequire(resolve(
  process.env.PUPPETEER_ROOT || "C:/Users/briks/Desktop/GitHub/audio/firmwares/FM1-FIRMWARE/FM1-firmwares/app",
  "package.json",
));
const puppeteer = require("puppeteer-core");

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
  await sleep(800);
}

async function setTheme(id) {
  await page.evaluate((theme) => {
    const apply = window.FM1Theme?.set || window.FM1UiTheme?.set;
    if (typeof apply === "function") apply(theme);
    else {
      document.documentElement.dataset.theme = theme;
      document.body.className = (document.body.className || "").replace(/theme-\S+/g, "") + ` theme-${theme}`;
      try { localStorage.setItem("fm1.theme.v1", theme); } catch {}
    }
  }, id);
  await sleep(400);
}

async function clickText(sel, re) {
  const ok = await page.$$eval(sel, (els, source) => {
    const rx = new RegExp(source, "i");
    const el = els.find((e) => rx.test((e.textContent || "").trim()));
    if (!el) return false;
    el.click();
    return true;
  }, re.source || String(re));
  return ok;
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
  await sleep(500);
  const started = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => /^Start$/i.test(b.textContent.trim()));
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (started) await sleep(4500);
}

try {
  await startFw("felucca");
  await setTheme("miami");
  await shot("01-miami.png");

  await setTheme("cobalt");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button,a,[role=button]")].find((b) => /Customize/i.test(b.textContent || ""));
    btn?.click();
  });
  await sleep(800);
  await clickText("button,a,[role=tab],.tab", /Interface/i);
  await sleep(600);
  await shot("02-cobalt-customize-interface.png");

  await setTheme("paper");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button,a,[role=button]")].find((b) => /Customize/i.test(b.textContent || ""));
    btn?.click();
  });
  await sleep(500);
  await clickText("button,a,[role=tab],.tab", /Device|Case|Colour/i);
  await sleep(400);
  await page.evaluate(() => {
    const opt = [...document.querySelectorAll("button,option,label")].find((e) => /White\s*\/\s*Green|White \/ Green/i.test(e.textContent || ""));
    opt?.click();
  });
  await sleep(500);
  await clickText("button,a,[role=tab],.tab", /Sticker/i);
  await sleep(500);
  await page.evaluate(() => {
    const stickers = [...document.querySelectorAll("img,button,.sticker")].slice(0, 6);
    for (const s of stickers) s.click();
  });
  await sleep(700);
  await shot("03-white-green-stickers.png");

  await setTheme("graphite");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button,a,[role=button]")].find((b) => /Customize/i.test(b.textContent || ""));
    btn?.click();
  });
  await sleep(500);
  await clickText("button,a,[role=tab],.tab", /Device|Case/i);
  await sleep(400);
  await page.evaluate(() => {
    const opt = [...document.querySelectorAll("button,option,label")].find((e) => /Gold/i.test(e.textContent || ""));
    opt?.click();
  });
  await sleep(700);
  await shot("04-gold-customize-device-stickers.png");

  await setTheme("emerald");
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
  await sleep(800);
  await shot("05-emerald-browser-search.png");

  await setTheme("amethyst");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button,a,[role=button]")].find((b) => /Radar|Updates/i.test(b.textContent || ""));
    btn?.click();
  });
  await sleep(900);
  await page.evaluate(() => {
    const det = document.querySelector("#inst-recovery");
    if (det) det.open = true;
  });
  await sleep(500);
  await shot("06-amethyst-radar-uplink.png");

  await startFw("mvave");
  await setTheme("crimson");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button,a,[role=button],summary")].find((b) => /Banks|DX7/i.test(b.textContent || ""));
    btn?.click();
  });
  await sleep(1000);
  await shot("07-crimson-banks.png");

  await setTheme("ice");
  await page.evaluate(() => {
    for (const label of [/MIDI/i, /Tape/i, /Scope/i, /Rec/i]) {
      const el = [...document.querySelectorAll("button,summary,a")].find((b) => label.test(b.textContent || ""));
      el?.click();
    }
  });
  await sleep(1000);
  await shot("08-ice-cables-scope-rec.png");

  await setTheme("vaporwave");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button,summary,a")].find((b) => /^Keys$/i.test((b.textContent || "").trim()) || /Keys/i.test(b.textContent || ""));
    btn?.click();
  });
  await sleep(800);
  await shot("09-vaporwave-keys.png");

  await setTheme("midnight");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button,summary,a")].find((b) => /FX|Effect|Panel host|MIDI out/i.test(b.textContent || ""));
    btn?.click();
  });
  await sleep(900);
  await shot("10-midnight-midi-fx.png");

  await startFw("x0x");
  await setTheme("graphite");
  await sleep(3500);
  await page.evaluate(() => {
    const lcd = document.querySelector("canvas, .lcd, #lcd, .panel-lcd");
    if (lcd) lcd.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await sleep(800);
  await shot("11-graphite-focus-lcd.png");

  await setTheme("miami");
  await page.evaluate(() => {
    const det = document.querySelector("#inst-recovery");
    if (det) { det.open = true; det.scrollIntoView({ block: "center" }); }
    const adv = document.querySelector("#inst-advanced");
    if (adv) adv.open = true;
  });
  await sleep(700);
  await shot("12-miami-install-recovery.png");

  // Hero image for README top
  await startFw("felucca");
  await setTheme("miami");
  await sleep(2500);
  const hero = resolve(root, "docs/screenshot.jpg");
  await page.screenshot({ path: hero, type: "jpeg", quality: 88 });
  console.log("ok screenshot.jpg");
} finally {
  await browser.close();
}

console.log(`PASS: screenshots in ${outDir}`);
