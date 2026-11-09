// Interface themes: every preset, and custom colours picked badly on purpose, must leave text
// readable. Runs site/emulator/ui-theme.js against a stand-in document.
import vm from "node:vm";
import fs from "node:fs";
import assert from "node:assert/strict";

const props = {};
const root = { style: { setProperty: (k, v) => { props[k] = v; }, removeProperty: (k) => { delete props[k]; } }, toggleAttribute() {} };
const ctx = { window: {}, document: { documentElement: root }, localStorage: { getItem: () => null, setItem() {} } };
vm.runInNewContext(fs.readFileSync(new URL("../site/emulator/ui-theme.js", import.meta.url), "utf8"), ctx);
const T = ctx.window.FM1Theme;
let n = 0;

function check(ui, label) {
  const t = T.apply(ui);
  // unset in the stock look: the CSS falls back to the accent and to the stock dark ink
  const fallback = { "--amber-ink": t.accent, "--ui-on-accent": "#180a02" };
  const v = (k) => props[k] ?? fallback[k];
  const need = (fg, bg, min, what) => {
    const c = T.contrast(fg, bg);
    assert.ok(c >= min, `${label}: ${what} ${fg} on ${bg} is ${c.toFixed(2)}:1, under ${min}:1`);
  };
  if (!T.isStock(ui)) {
    need(v("--ui-text"), t.panel, 4.5, "text on panels");
    need(v("--ui-text"), v("--ui-bar"), 4.5, "text on the toolbar");
    need(v("--ui-dim"), t.panel, 3, "secondary text on panels");
  }
  need(v("--amber-ink"), t.panel, 4.5, "accent text on panels");
  need(v("--ui-on-accent"), t.accent, 3, "text on accent buttons");
  n++;
}

check({}, "stock");
for (const name of Object.keys(T.THEMES)) check({ theme: name }, name);
for (const name of Object.keys(T.THEMES))
  for (const accent of ["#fa5400", "#ffff00", "#000080", "#777777", "#ffffff", "#101010"])
    check({ theme: name, accent }, `${name} + accent ${accent}`);
// text the same colour as the panels, mid-grey everything, light text on a light theme
check({ theme: "Midnight", text: "#1e1f22" }, "text matching the panels");
check({ theme: "Ice", text: "#f0f0f0" }, "light text on Ice");
check({ bg: "#808080", panel: "#808080", surface: "#808080", text: "#808080", accent: "#808080" }, "all mid-grey");
check({ bg: "#ffffff", panel: "#ffffff", surface: "#ffffff", text: "#ffffff", accent: "#ffffff" }, "all white");
// junk in storage falls back to the preset
check({ theme: "Nope", bg: "red", accent: "#12" }, "junk values");
for (const theme of ["constructor", "__proto__", "toString", "hasOwnProperty"]) check({ theme, text: { a: 1 }, bg: 5 }, `theme named ${theme}`);

// the stock look sets nothing but the accent, so the original colours stay exact
T.apply({});
assert.deepEqual(Object.keys(props), ["--amber"]);
console.log(`theme tests: ${n} looks readable`);
