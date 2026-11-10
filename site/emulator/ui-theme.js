/* Interface themes: the app's own colours (background, panels, controls, text and the accent),
   applied as CSS custom properties on <html>. Loaded in <head> so a saved theme paints from the
   first frame. Customize > Interface edits it; the stylesheets read the variables with the
   original colours as fallbacks, so the default theme is the stock look exactly. */
(function () {
  "use strict";
  const KEY = "fm1.ui";
  // Public default: monochrome accent (no orange). Customize can still pick colour.
  const DEFAULT_ACCENT = "#d8d8d8";
  const LEGACY_STOCK_ACCENT = "#fa5400";
  const DEFAULT_THEME = "Midnight";
  // bg: the page, panel: cards and boxes, surface: inputs and buttons, text: body text
  const THEMES = {
    Midnight:  { bg: "#000000", panel: "#121212", surface: "#141414", text: "#f0f0f0", accent: DEFAULT_ACCENT },
    Graphite:  { bg: "#111111", panel: "#1a1a1a", surface: "#161616", text: "#f0f0f0", accent: "#c0c0c0" },
    Cobalt:    { bg: "#050a17", panel: "#111b33", surface: "#0b1428", text: "#e5ecff", accent: "#4d82ff" },
    Emerald:   { bg: "#03100a", panel: "#0e2419", surface: "#091a12", text: "#e2f5eb", accent: "#10b981" },
    Crimson:   { bg: "#110406", panel: "#261014", surface: "#1b0a0d", text: "#f8e6e8", accent: "#ff3a4c" },
    Vaporwave: { bg: "#130923", panel: "#25153f", surface: "#1b0f31", text: "#f6e9ff", accent: "#ff4fd8" },
    Ice:       { bg: "#e4eaf0", panel: "#fbfcfd", surface: "#eef2f6", text: "#13202c", accent: "#0b7fc0" },
    Paper:     { bg: "#ebe6dc", panel: "#fbf9f4", surface: "#f2eee6", text: "#27221b", accent: "#2f7a64" },
  };
  const FIELDS = ["bg", "panel", "surface", "text", "accent"];
  // every variable a theme sets, so switching back to the default can remove them all
  const VARS = ["--room", "--bar", "--card", "--well", "--line", "--rule", "--ink", "--text", "--dim", "--faint",
    "--ui-bar", "--ui-pop", "--ui-surface", "--ui-surface2", "--ui-line", "--ui-line-hi", "--ui-text", "--ui-text2",
    "--ui-dim", "--ui-cap-top", "--ui-cap-bot", "--ui-cap-edge", "--ui-cap-shade", "--ui-box-top", "--ui-box-bot",
    "--ui-box-edge", "--ui-well-top", "--ui-well-bot", "--ui-head-top", "--ui-head-bot", "--ui-stage-top",
    "--ui-stage-bot", "--ui-mod-top", "--ui-mod-bot", "--ui-raised", "--ui-pressed", "--ui-panel-shadow",
    "--amber", "--amber-hi", "--amber-lo", "--amber-edge", "--amber-ink", "--ui-on-accent",
    "--green", "--ui-warn", "--ui-cable-midi", "--ui-cable-scope", "--ui-cable-tuner"];

  // --- colour maths (sRGB hex) ---
  const isHex = (h) => typeof h === "string" && /^#[0-9a-f]{6}$/i.test(h);
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, f) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * f)); };
  const scale = (h, f) => hex(rgb(h).map((v) => v * f));
  const lum = (h) => { const c = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  function hueSat(hx) {
    const [r, g, b] = rgb(hx).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return [0, 0];
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, d / (1 - Math.abs(mx + mn - 1) || 1)];
  }
  // move c away from bg (toward white or black) until it reaches the ratio
  function ensure(c, bg, ratio) {
    const to = contrast("#000000", bg) > contrast("#ffffff", bg) ? "#000000" : "#ffffff";
    for (let f = 0; f <= 1.0001 && contrast(c, bg) < ratio; f += 0.05) c = mix(c, to, f > 0 ? 0.05 / (1 - f + 0.05) : 0);
    return contrast(c, bg) >= ratio ? c : to;
  }

  function load() { try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; } }
  function save(ui) { try { localStorage.setItem(KEY, JSON.stringify(ui)); } catch {} }

  const isStock = (ui) => (!ui.theme || ui.theme === DEFAULT_THEME || !Object.hasOwn(THEMES, ui.theme)) && !FIELDS.some((k) => k !== "accent" && isHex(ui[k]));

  // the colours in effect: a preset, any custom fields over it, and the accent
  function resolve(ui) {
    // (own names only: "constructor" or "__proto__" from a link or storage is not a theme)
    const base = (ui && typeof ui.theme === "string" && Object.hasOwn(THEMES, ui.theme) && THEMES[ui.theme]) || THEMES[DEFAULT_THEME];
    const t = { ...base };
    for (const k of FIELDS) if (isHex(ui[k])) t[k] = ui[k].toLowerCase();
    if (isHex(ui.accent)) t.accent = ui.accent.toLowerCase();
    // Prior public builds used orange as the stock accent; treat that alone as the new mono default.
    if (t.accent === LEGACY_STOCK_ACCENT && isStock(ui)) t.accent = DEFAULT_ACCENT;
    return t;
  }

  // readable text: body text at least 7:1 on panels (falls back to near-white/near-black),
  // secondary text 4.5:1, accent-coloured text 4.5:1, text on the accent whichever is stronger
  function derive(t) {
    const light = lum(t.bg) > 0.35;
    let text = t.text;
    if (contrast(text, t.panel) < 4.5 || contrast(text, t.bg) < 4.5)
      text = contrast("#111820", t.panel) > contrast("#f2f4f7", t.panel) ? "#111820" : "#f2f4f7";
    text = ensure(text, t.panel, 7);
    const v = {};
    v["--room"] = t.bg; v["--card"] = t.panel; v["--well"] = t.surface; v["--ink"] = text; v["--ui-text"] = text;
    v["--bar"] = v["--ui-bar"] = mix(t.bg, t.panel, 0.5);
    v["--text"] = ensure(mix(text, t.panel, 0.12), t.panel, 7);
    v["--ui-text2"] = ensure(mix(text, t.panel, 0.18), t.panel, 6);
    v["--dim"] = v["--ui-dim"] = ensure(mix(text, t.panel, 0.38), t.panel, 4.6);
    v["--faint"] = ensure(mix(text, t.panel, 0.5), t.panel, 3.4);
    v["--line"] = mix(t.panel, text, 0.16); v["--rule"] = mix(t.panel, text, 0.09);
    v["--ui-line"] = mix(t.surface, text, light ? 0.16 : 0.13); v["--ui-line-hi"] = mix(t.surface, text, 0.26);
    v["--ui-pop"] = light ? t.panel : mix(t.bg, t.panel, 0.4);
    v["--ui-surface"] = t.surface; v["--ui-surface2"] = mix(t.surface, text, 0.03);
    if (light) {
      v["--ui-cap-top"] = mix(t.panel, "#ffffff", 0.7); v["--ui-cap-bot"] = mix(t.surface, t.bg, 0.4);
      v["--ui-cap-edge"] = mix(t.panel, text, 0.2); v["--ui-cap-shade"] = mix(t.panel, text, 0.32);
      v["--ui-box-top"] = t.panel; v["--ui-box-bot"] = mix(t.panel, t.bg, 0.35); v["--ui-box-edge"] = mix(t.panel, text, 0.13);
      v["--ui-well-top"] = mix(t.surface, t.bg, 0.4); v["--ui-well-bot"] = t.surface;
      v["--ui-head-top"] = t.panel; v["--ui-head-bot"] = mix(t.panel, t.bg, 0.5);
      v["--ui-stage-top"] = mix(t.bg, text, 0.06); v["--ui-stage-bot"] = mix(t.bg, text, 0.16);
      v["--ui-mod-top"] = t.panel; v["--ui-mod-bot"] = mix(t.panel, t.bg, 0.45);
      v["--ui-raised"] = "inset 0 1px 0 rgba(255,255,255,.85), inset 0 -1px 0 rgba(0,0,0,.10), 0 1px 2px rgba(10,20,40,.18)";
      v["--ui-pressed"] = "inset 0 2px 4px rgba(10,20,40,.22), inset 0 0 0 1px rgba(10,20,40,.10)";
      v["--ui-panel-shadow"] = "inset 0 1px 0 rgba(255,255,255,.9), 0 10px 24px -14px rgba(10,20,40,.45), 0 2px 4px rgba(10,20,40,.12)";
    } else {
      v["--ui-cap-top"] = mix(t.panel, text, 0.08); v["--ui-cap-bot"] = mix(t.panel, t.bg, 0.12);
      v["--ui-cap-edge"] = mix(t.panel, text, 0.17); v["--ui-cap-shade"] = mix(t.panel, t.bg, 0.6);
      v["--ui-box-top"] = mix(t.panel, text, 0.03); v["--ui-box-bot"] = mix(t.panel, t.bg, 0.2); v["--ui-box-edge"] = mix(t.panel, text, 0.1);
      v["--ui-well-top"] = mix(t.panel, t.bg, 0.1); v["--ui-well-bot"] = mix(t.panel, t.bg, 0.28);
      v["--ui-head-top"] = mix(t.panel, t.bg, 0.35); v["--ui-head-bot"] = mix(t.panel, t.bg, 0.75);
      v["--ui-stage-top"] = mix(t.bg, t.panel, 0.55); v["--ui-stage-bot"] = scale(t.bg, 0.5);
      v["--ui-mod-top"] = mix(t.panel, text, 0.02); v["--ui-mod-bot"] = mix(t.panel, t.bg, 0.35);
    }
    return { vars: v, light, text };
  }
  function accentVars(a, panel) {
    const v = {};
    v["--amber"] = a; v["--amber-hi"] = mix(a, "#ffffff", 0.28); v["--amber-lo"] = scale(a, 0.86); v["--amber-edge"] = scale(a, 0.72);
    v["--amber-ink"] = ensure(a, panel, 4.5);
    v["--ui-on-accent"] = contrast(a, "#111111") >= contrast(a, "#ffffff") ? "#111111" : "#ffffff";
    const [h, sat] = hueSat(a);
    const mono = sat < 0.14;
    // Stock / monochrome accent: every chrome token stays gray (cables, ok/warn, LEDs).
    if (mono) {
      v["--green"] = ensure(mix(a, "#ffffff", 0.22), panel, 4.5);
      v["--ui-warn"] = ensure(mix(panel, "#ffffff", 0.55), panel, 4.5);
      v["--ui-cable-midi"] = mix(a, "#888888", 0.45);
      v["--ui-cable-scope"] = mix(a, "#aaaaaa", 0.35);
      v["--ui-cable-tuner"] = "#ff8a1a"; // tuner cable stays orange even in stock mono chrome
      return v;
    }
    // Coloured Customize themes: restore semantic green / warn and distinct cable hues.
    v["--green"] = "#7cc48a";
    v["--ui-warn"] = "#e2705f";
    const near = (x) => sat > 0.25 && Math.min(Math.abs(h - x), 360 - Math.abs(h - x)) < 32;
    v["--ui-cable-midi"] = near(211) ? "#b48cff" : "#4aa8ff";
    v["--ui-cable-scope"] = near(154) ? "#e8c547" : "#49d49a";
    v["--ui-cable-tuner"] = near(30) ? "#ffb347" : "#ff8a1a";
    return v;
  }

  function apply(ui) {
    ui = ui || load();
    const root = document.documentElement, st = root.style;
    for (const k of VARS) st.removeProperty(k);
    const t = resolve(ui);
    let light = false;
    if (!isStock(ui)) { const d = derive(t); light = d.light; for (const [k, val] of Object.entries(d.vars)) st.setProperty(k, val); }
    // Always derive accent companions (hi/lo/ink/on-accent) so mono defaults stay consistent.
    for (const [k, val] of Object.entries(accentVars(t.accent, t.panel))) st.setProperty(k, val);
    root.style.colorScheme = light ? "light" : "dark";
    root.toggleAttribute("data-ui-light", light);
    return t;
  }

  window.FM1Theme = { THEMES, FIELDS, DEFAULT_THEME, DEFAULT_ACCENT, load, save, resolve, apply, derive, contrast, isStock };
  apply();
})();
