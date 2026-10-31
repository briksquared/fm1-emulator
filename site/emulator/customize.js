/* Customize panel for the FM-1 emulator fork: live colour skinning (via the wasm fm1_skin export)
   and a cut-out image "decal" you can stick on the machine. Loaded before main.js; main.js calls
   window.initCustomize(FM1) once the panel wasm is ready. No build step — pure DOM. */
(function () {
  "use strict";
  const SKIN_KEY = "fm1.skin";

  // --- colour helpers ---
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const toHex = (r, g, b) => "#" + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("");
  const parse = (h) => { h = (h || "#000000").replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const dk = (h, f) => { const [r, g, b] = parse(h); return toHex(r * f, g * f, b * f); };
  const lt = (h, f) => { const [r, g, b] = parse(h); return toHex(r * f, g * f, b * f); };

  // one picker controls one "element" (may drive a gradient pair), keeping the panel's shading
  const CONTROLS = [
    { label: "Background",       get: (s) => s.room,        set: (c) => ({ room: c }) },
    { label: "Panel body",       get: (s) => s.body_top,    set: (c) => ({ body_top: c, body_bot: dk(c, 0.55) }) },
    { label: "Trays",            get: (s) => s.tray,        set: (c) => ({ tray: c }) },
    { label: "Screen bezel",     get: (s) => s.bezel_a,     set: (c) => ({ bezel_a: c, bezel_b: dk(c, 0.8) }) },
    { label: "Knob cap",         get: (s) => s.knob_cap_b,  set: (c) => ({ knob_cap_b: c, knob_cap_a: dk(c, 0.6) }) },
    { label: "Knob skirt",       get: (s) => s.knob_skirt_a,set: (c) => ({ knob_skirt_a: c, knob_skirt_b: lt(c, 1.5) }) },
    { label: "Knob glow",        get: (s) => s.knob_glow,   set: (c) => ({ knob_glow: c }) },
    { label: "Keys",             get: (s) => s.key_top,     set: (c) => ({ key_top: c, key_bot: dk(c, 0.7) }) },
    { label: "Key ridge",        get: (s) => s.key_line,    set: (c) => ({ key_line: c }) },
    { label: "Key glow (touch)", get: (s) => s.key_lit,     set: (c) => ({ key_lit: c }) },
    { label: "Buttons",          get: (s) => s.btn_top,     set: (c) => ({ btn_top: c, btn_bot: dk(c, 0.7) }) },
    { label: "Button text",      get: (s) => s.btn_ink,     set: (c) => ({ btn_ink: c }) },
    { label: "PLAY / REC",       get: (s) => s.green,       set: (c) => ({ green: c }) },
    { label: "Labels",           get: (s) => s.silk,        set: (c) => ({ silk: c }) },
  ];

  // a white/cream body shell (the FM-1's white colorways), shared by the White/* presets
  const WHITE = { room: "#161514", body_top: "#e4e1d7", body_bot: "#c6c1b3", tray: "#d2cdbf", silk: "#2a2824",
    btn_top: "#eeeae0", btn_bot: "#d6d1c4", btn_ink: "#4a4840", knob_skirt_a: "#c6c1b3", knob_skirt_b: "#e4e1d7",
    knob_cap_a: "#d6d1c4", knob_cap_b: "#f2efe6", bezel_a: "#2a2824", bezel_b: "#1a1917" };

  const PRESETS = {
    // --- the real FM-1 hardware colorways (black or white body + coloured rubber keys) ---
    "FM-1 Black": { body_top: "#141414", key_top: "#2a2a2c", key_bot: "#161617", key_line: "#4a4a4e", key_lit: "#9aa0a8", amber: "#9aa0a8", knob_glow: "#6a6e76", silk: "#9c9a94" },
    "FM-1 Orange": { body_top: "#141414", key_top: "#f26322", key_bot: "#a83e12", key_line: "#ff9a56", key_lit: "#ffd8bf", amber: "#f26322", knob_glow: "#f26322" },
    "FM-1 Green": { body_top: "#141414", key_top: "#78b73a", key_bot: "#4a7420", key_line: "#a2db6a", key_lit: "#e2f6c8", amber: "#78b73a", knob_glow: "#78b73a", green: "#78b73a" },
    "FM-1 Navy": { body_top: "#141414", key_top: "#2f5fbf", key_bot: "#1a3a7a", key_line: "#6a92e0", key_lit: "#cddcff", amber: "#4a86ff", knob_glow: "#2f5fbf" },
    "FM-1 Purple": { body_top: "#141414", key_top: "#7a52c7", key_bot: "#4c2f8a", key_line: "#a888e4", key_lit: "#e4d8ff", amber: "#7a52c7", knob_glow: "#7a52c7" },
    "FM-1 Grey": { body_top: "#141414", key_top: "#8a8f98", key_bot: "#565a62", key_line: "#b4b9c2", key_lit: "#e8ebf0", amber: "#b4b9c2", knob_glow: "#8a8f98" },
    "FM-1 Brown": { body_top: "#141414", key_top: "#9c6b3f", key_bot: "#654224", key_line: "#c89a6a", key_lit: "#f0dcc2", amber: "#c89a6a", knob_glow: "#9c6b3f" },
    "FM-1 Pink": { body_top: "#141414", key_top: "#e85a9b", key_bot: "#a82f68", key_line: "#ff8ec0", key_lit: "#ffd6ea", amber: "#e85a9b", knob_glow: "#e85a9b" },
    "FM-1 White / Green": { ...WHITE, key_top: "#78b73a", key_bot: "#4a7420", key_line: "#a2db6a", key_lit: "#eaf8d6", amber: "#4a7420", knob_glow: "#78b73a" },
    "FM-1 White / Grey": { ...WHITE, key_top: "#8a8f98", key_bot: "#565a62", key_line: "#b4b9c2", key_lit: "#eef1f5", amber: "#565a62", knob_glow: "#8a8f98" },
    "FM-1 White / Blue": { ...WHITE, key_top: "#2f5fbf", key_bot: "#1a3a7a", key_line: "#6a92e0", key_lit: "#dde8ff", amber: "#1a3a7a", knob_glow: "#2f5fbf" },
    // --- the house looks ---
    "Electro Orange": { body_top: "#141414", key_top: "#fa5400", key_bot: "#b23c00", key_line: "#ff8a3a", key_lit: "#ffd0a0", amber: "#fa5400", knob_glow: "#fa5400", green: "#62d36e" },
    "Anthracite keys": { body_top: "#141414", key_top: "#3b3c40", key_bot: "#26272b", key_line: "#6a6c74", key_lit: "#fa5400", amber: "#fa5400", knob_glow: "#fa5400" },
    "Blackout": { room: "#000000", body_top: "#0c0c0c", body_bot: "#050505", tray: "#0a0a0a", key_top: "#2a2826", key_bot: "#161514", key_line: "#4a443e", key_lit: "#ff7a1a", amber: "#ff7a1a", knob_glow: "#ff7a1a" },
    // --- neon / synth ---
    "Nike Volt": { body_top: "#101210", key_top: "#d7ff2e", key_bot: "#8aa800", key_line: "#e9ff7a", key_lit: "#f6ffcf", amber: "#d7ff2e", knob_glow: "#d7ff2e", green: "#d7ff2e" },
    "Miami": { room: "#07090e", body_top: "#121318", body_bot: "#0a0b0f", key_top: "#ff2d95", key_bot: "#a0186a", key_line: "#ff7ac0", key_lit: "#ffd0ea", amber: "#22e0d6", knob_glow: "#ff2d95", green: "#22e0d6", bezel_a: "#0a0f14", bezel_b: "#070b0f" },
    "Vaporwave": { body_top: "#141018", key_top: "#b06cff", key_bot: "#6a2fb0", key_line: "#d0a8ff", key_lit: "#ecdcff", amber: "#52e0ff", knob_glow: "#b06cff", green: "#52e0ff" },
    "Sunset": { body_top: "#140e10", key_top: "#ff5e3a", key_bot: "#c21a6b", key_line: "#ff9a6a", key_lit: "#ffd9c0", amber: "#ff5e3a", knob_glow: "#ff3a7a" },
    "Infrared": { room: "#000000", body_top: "#0a0a0a", body_bot: "#040404", tray: "#080808", key_top: "#1c1a1a", key_bot: "#0f0e0e", key_line: "#3a2a2a", key_lit: "#ff2a2a", amber: "#ff2a2a", knob_glow: "#ff2a2a", green: "#ff2a2a" },
    // --- jewel tones ---
    "Crimson": { body_top: "#140e0f", key_top: "#e01e32", key_bot: "#8a0f1e", key_line: "#ff5a6a", key_lit: "#ffc9cf", amber: "#e01e32", knob_glow: "#e01e32" },
    "Cobalt": { body_top: "#0d1016", key_top: "#2f6bff", key_bot: "#163a9a", key_line: "#6f9aff", key_lit: "#cfddff", amber: "#2f6bff", knob_glow: "#2f6bff" },
    "Emerald": { body_top: "#0c130f", key_top: "#10b981", key_bot: "#0a6e4e", key_line: "#4fe0b0", key_lit: "#c9fff0", amber: "#10b981", knob_glow: "#10b981", green: "#10b981" },
    "Lagoon": { body_top: "#0b1315", key_top: "#0fb6c4", key_bot: "#0a6e78", key_line: "#4fe0ea", key_lit: "#c9fbff", amber: "#0fb6c4", knob_glow: "#0fb6c4" },
    "Amethyst": { body_top: "#110e16", key_top: "#9b5cff", key_bot: "#5e2fb0", key_line: "#c4a0ff", key_lit: "#ecdcff", amber: "#9b5cff", knob_glow: "#9b5cff" },
    "Stealth Green": { body_top: "#101311", key_top: "#2a302b", key_bot: "#1a1f1b", key_line: "#4a524c", key_lit: "#62d36e", amber: "#62d36e", knob_glow: "#62d36e" },
    "Ice": { body_top: "#12161b", key_top: "#2a333c", key_bot: "#1a2129", key_line: "#4a5560", key_lit: "#6ec6ff", amber: "#6ec6ff", knob_glow: "#6ec6ff" },
    // --- luxe / light ---
    "Gold on Black": { room: "#000000", body_top: "#12100a", body_bot: "#070603", tray: "#0b0a06", silk: "#e8dcb0", key_top: "#d4a537", key_bot: "#8a6a16", key_line: "#f0cf6a", key_lit: "#fff0c0", amber: "#d4a537", knob_glow: "#d4a537", bezel_a: "#100e08", bezel_b: "#0b0a06" },
    "Royal": { body_top: "#0f0c16", silk: "#d8cfe8", key_top: "#6d3cff", key_bot: "#3e1f9a", key_line: "#a07aff", key_lit: "#e0d0ff", amber: "#d4a537", knob_glow: "#d4a537", green: "#d4a537" },
    "Carbon": { body_top: "#121315", body_bot: "#070808", silk: "#9aa0a8", key_top: "#4a4d52", key_bot: "#2e3034", key_line: "#6d7178", key_lit: "#aeb4bd", amber: "#aeb4bd", knob_glow: "#8a9099", green: "#8a9099" },
    "Bone (light shell)": { room: "#161514", body_top: "#d8d4c8", body_bot: "#b6b1a2", tray: "#c9c4b6", silk: "#2a2824", btn_top: "#e8e4d8", btn_bot: "#cfcabb", btn_ink: "#4a4840", key_top: "#2a2826", key_bot: "#161514", key_line: "#55514a", key_lit: "#fa5400", amber: "#c24a0a", knob_skirt_a: "#b6b1a2", knob_skirt_b: "#d8d4c8", knob_cap_a: "#cfcabb", knob_cap_b: "#efece2", knob_glow: "#fa5400", bezel_a: "#2a2824", bezel_b: "#1a1917" },
  };

  // how the presets are grouped in the dropdown (names must match PRESETS keys)
  const GROUPS = [
    ["FM-1 hardware colours", ["FM-1 Black", "FM-1 Orange", "FM-1 Green", "FM-1 Navy", "FM-1 Purple", "FM-1 Grey", "FM-1 Brown", "FM-1 Pink", "FM-1 White / Green", "FM-1 White / Grey", "FM-1 White / Blue"]],
    ["House looks", ["Electro Orange", "Anthracite keys", "Blackout"]],
    ["Neon / synth", ["Nike Volt", "Miami", "Vaporwave", "Sunset", "Infrared"]],
    ["Jewel tones", ["Crimson", "Cobalt", "Emerald", "Lagoon", "Amethyst", "Stealth Green", "Ice"]],
    ["Luxe / light", ["Gold on Black", "Royal", "Carbon", "Bone (light shell)"]],
  ];

  function injectStyles() {
    if (document.getElementById("fm1-cz-style")) return;
    const el = document.createElement("style");
    el.id = "fm1-cz-style";
    el.textContent = `
      #fm1-cz-btn{background:var(--amber,#fa5400);color:#180a02;border:0;border-radius:999px;padding:6px 13px;
        font:600 13px/1 'Space Grotesk',-apple-system,Segoe UI,Roboto,sans-serif;cursor:pointer;white-space:nowrap}
      #fm1-cz .cz-tabs{display:flex;gap:6px;margin:2px 0 12px}
      #fm1-cz .cz-tab{flex:1;background:#17181b;border:1px solid #2a2c31;color:#aeb4bd;border-radius:8px;padding:7px;font:600 13px/1 inherit;cursor:pointer}
      #fm1-cz .cz-tab.on{background:var(--amber,#fa5400);color:#180a02;border-color:transparent}
      #fm1-cz .cz-sw{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 2px}
      #fm1-cz .cz-swatch{width:30px;height:30px;border-radius:50%;border:2px solid #2a2c31;cursor:pointer;padding:0;transition:transform .08s}
      #fm1-cz .cz-swatch:hover{border-color:#fff;transform:scale(1.1)}
      #fm1-cz-btn:hover{filter:brightness(1.1)}
      #fm1-cz{position:fixed;top:0;right:0;height:100%;width:320px;max-width:92vw;z-index:9999;background:#0c0d0f;
        border-left:1px solid #232428;box-shadow:-10px 0 40px rgba(0,0,0,.6);transform:translateX(100%);
        transition:transform .22s ease;display:flex;flex-direction:column;color:#e9edf2;
        font:14px/1.4 'Space Grotesk',-apple-system,Segoe UI,Roboto,sans-serif}
      #fm1-cz.open{transform:none}
      #fm1-cz h2{margin:0;padding:14px 16px;font-size:16px;border-bottom:1px solid #1e1f22;display:flex;align-items:center;gap:8px}
      #fm1-cz .close{margin-left:auto;background:none;border:0;color:#9aa6b2;font-size:20px;cursor:pointer;line-height:1}
      #fm1-cz .body{overflow:auto;padding:12px 16px 90px;flex:1}
      #fm1-cz .sec{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#8c93a0;margin:16px 0 6px}
      #fm1-cz .row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 0}
      #fm1-cz .row label{color:#cfd4da}
      #fm1-cz input[type=color]{width:42px;height:28px;border:1px solid #2a2c31;border-radius:7px;background:#000;padding:0;cursor:pointer}
      #fm1-cz select,#fm1-cz .file{width:100%;background:#17181b;color:#e9edf2;border:1px solid #2a2c31;border-radius:8px;padding:8px;font:inherit;cursor:pointer}
      #fm1-cz input[type=range]{width:100%}
      #fm1-cz .decal-row{display:flex;gap:8px;align-items:center;margin-top:8px}
      #fm1-cz .decal-row button{flex:1;background:#17181b;color:#e9edf2;border:1px solid #2a2c31;border-radius:8px;padding:7px;cursor:pointer}
      #fm1-cz .foot{position:absolute;bottom:0;left:0;right:0;display:flex;gap:8px;padding:12px 16px;background:#0c0d0f;border-top:1px solid #1e1f22}
      #fm1-cz .foot button{flex:1;border:0;border-radius:9px;padding:11px;font:600 14px/1 inherit;cursor:pointer}
      #fm1-cz .apply{background:#62d36e;color:#07130d}
      #fm1-cz .reset{background:#232428;color:#e9edf2}
    `;
    document.head.appendChild(el);
  }

  // flood-fill background removal from the image edges (works best on a plain backdrop)
  function cutout(img, tol) {
    let w = img.naturalWidth, h = img.naturalHeight;
    const max = 720; if (Math.max(w, h) > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h), px = d.data;
    const corners = [0, (w - 1) * 4, (h - 1) * w * 4, (w * h - 1) * 4];
    let br = 0, bg = 0, bb = 0; for (const o of corners) { br += px[o]; bg += px[o + 1]; bb += px[o + 2]; }
    br /= 4; bg /= 4; bb /= 4;
    const t = (tol * tol) * 3;
    const seen = new Uint8Array(w * h), st = [];
    for (let x = 0; x < w; x++) { st.push(x, (h - 1) * w + x); }
    for (let y = 0; y < h; y++) { st.push(y * w, y * w + w - 1); }
    while (st.length) {
      const i = st.pop(); if (seen[i]) continue; seen[i] = 1; const o = i * 4;
      const dr = px[o] - br, dg = px[o + 1] - bg, db = px[o + 2] - bb;
      if (dr * dr + dg * dg + db * db > t) continue;
      px[o + 3] = 0;
      const x = i % w, y = (i / w) | 0;
      if (x > 0) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y > 0) st.push(i - w); if (y < h - 1) st.push(i + w);
    }
    g.putImageData(d, 0, 0);
    return c.toDataURL("image/png");
  }

  window.initCustomize = function (FM1) {
    injectStyles();
    let skin = { ...FM1.SKIN_DEFAULT };
    try { skin = { ...skin, ...JSON.parse(localStorage.getItem(SKIN_KEY) || "{}") }; } catch {}

    // button in the top bar (next to the GitHub link); falls back to the body
    const btn = document.createElement("button"); btn.id = "fm1-cz-btn"; btn.type = "button"; btn.textContent = "🎨 Customize";
    const header = document.querySelector("header.site .wrap");
    if (header) header.appendChild(btn); else document.body.appendChild(btn);

    // panel
    const pan = document.createElement("div"); pan.id = "fm1-cz";
    pan.innerHTML = `<h2>🎨 Customize <button class="close" title="Close">×</button></h2><div class="body"></div>
      <div class="foot"><button class="reset">Reset</button><button class="apply">Apply</button></div>`;
    document.body.appendChild(pan);
    const outer = pan.querySelector(".body");
    // two tabs: Device (the synth skin) and Interface (the page/app accent colour)
    outer.insertAdjacentHTML("beforeend", `<div class="cz-tabs"><button type="button" class="cz-tab on" data-t="device">Device</button><button type="button" class="cz-tab" data-t="ui">Interface</button></div>`);
    const body = document.createElement("div"); outer.appendChild(body);         // device content appends here, unchanged
    const uipane = document.createElement("div"); uipane.hidden = true; outer.appendChild(uipane);
    outer.querySelectorAll(".cz-tab").forEach((t) => t.onclick = () => {
      outer.querySelectorAll(".cz-tab").forEach((x) => x.classList.toggle("on", x === t));
      body.hidden = t.dataset.t !== "device"; uipane.hidden = t.dataset.t !== "ui";
    });

    // --- Interface tab: recolour the whole UI accent (the electro-orange --amber) ---
    const DEF_ACCENT = "#fa5400";
    let ui = {}; try { ui = JSON.parse(localStorage.getItem("fm1.ui") || "{}"); } catch {}
    const applyUI = () => { const a = ui.accent || DEF_ACCENT; const root = document.documentElement.style; root.setProperty("--amber", a); root.setProperty("--amber-hi", lt(a, 1.32)); };
    const persistUI = () => { try { localStorage.setItem("fm1.ui", JSON.stringify(ui)); } catch {} };
    // a shared "look" in the URL (?look=…) previews someone's skin + accent for this visit,
    // without overwriting your own saved look — adopt it by touching any control or pressing Apply.
    const czParams = new URLSearchParams(location.search);
    try {
      const lk = czParams.get("look");
      if (lk) { const o = JSON.parse(decodeURIComponent(escape(atob(lk.replace(/-/g, "+").replace(/_/g, "/"))))); if (o && o.s) skin = { ...FM1.SKIN_DEFAULT, ...o.s }; if (o && o.a) ui.accent = o.a; }
    } catch {}
    applyUI();
    uipane.insertAdjacentHTML("beforeend", `<div class="sec">Accent colour</div>
      <p style="color:#8c93a0;margin:4px 0 8px">Recolours the whole interface — buttons, links, highlights, the patch cables — away from electro orange. (The synth's own colours live on the Device tab.)</p>`);
    const sw = document.createElement("div"); sw.className = "cz-sw"; uipane.appendChild(sw);
    const accInp = document.createElement("input"); accInp.type = "color"; accInp.value = ui.accent || DEF_ACCENT;
    for (const c of ["#fa5400", "#ff2d95", "#2f6bff", "#10b981", "#9b5cff", "#ffd400", "#ff3a3a", "#22e0d6", "#7cc48a", "#e9e6de"]) {
      const b = document.createElement("button"); b.type = "button"; b.className = "cz-swatch"; b.style.background = c; b.title = c;
      b.onclick = () => { ui.accent = c; applyUI(); persistUI(); accInp.value = c; }; sw.appendChild(b);
    }
    const accRow = document.createElement("div"); accRow.className = "row"; accRow.innerHTML = `<label>Custom accent</label>`;
    accInp.oninput = () => { ui.accent = accInp.value; applyUI(); persistUI(); };
    accRow.appendChild(accInp); uipane.appendChild(accRow);
    const resetUI = document.createElement("button"); resetUI.type = "button"; resetUI.className = "file"; resetUI.textContent = "Reset to electro orange";
    resetUI.style.marginTop = "10px";
    resetUI.onclick = () => { ui.accent = DEF_ACCENT; applyUI(); persistUI(); accInp.value = DEF_ACCENT; };
    uipane.appendChild(resetUI);

    const apply = () => { try { FM1.applySkin(skin); } catch (e) {} };
    const persist = () => { try { localStorage.setItem(SKIN_KEY, JSON.stringify(skin)); } catch {} };

    // presets
    body.insertAdjacentHTML("beforeend", `<div class="sec">Preset</div>`);
    const sel = document.createElement("select");
    sel.innerHTML = `<option value="">Custom…</option>` +
      GROUPS.map(([label, names]) => `<optgroup label="${label}">` + names.map((n) => `<option>${n}</option>`).join("") + `</optgroup>`).join("");
    // apply a preset from the defaults (not the current skin) so each one is a clean, complete look
    sel.onchange = () => { const p = PRESETS[sel.value]; if (p) { skin = { ...FM1.SKIN_DEFAULT, ...p }; apply(); persist(); rebuildInputs(); } };
    body.appendChild(sel);

    // colour controls
    body.insertAdjacentHTML("beforeend", `<div class="sec">Colours</div>`);
    const inputs = [];
    for (const ctl of CONTROLS) {
      const row = document.createElement("div"); row.className = "row";
      const lab = document.createElement("label"); lab.textContent = ctl.label;
      const inp = document.createElement("input"); inp.type = "color"; inp.value = ctl.get(skin) || "#000000";
      inp.oninput = () => { skin = { ...skin, ...ctl.set(inp.value) }; apply(); persist(); sel.value = ""; };
      row.appendChild(lab); row.appendChild(inp); body.appendChild(row);
      inputs.push({ ctl, inp });
    }
    const rebuildInputs = () => { for (const { ctl, inp } of inputs) inp.value = ctl.get(skin) || "#000000"; };

    // picture on the case (added to the shared overlay layer; any number allowed)
    body.insertAdjacentHTML("beforeend", `<div class="sec">Picture on the case</div>
      <p style="color:#8c93a0;margin:4px 0 8px">Add any picture and it drops onto the machine. Keep "Remove background" on to cut it out of its backdrop. Then drag to move, corner to resize or rotate, × to remove. Want stickers instead? Use the <b>Stickers</b> button in the top bar — hundreds to pick from.</p>`);
    const file = document.createElement("input"); file.type = "file"; file.accept = "image/*"; file.className = "file";
    body.appendChild(file);
    const bgRow = document.createElement("label"); bgRow.className = "row"; bgRow.style.cursor = "pointer";
    bgRow.innerHTML = `<span>Remove background</span>`;
    const bgChk = document.createElement("input"); bgChk.type = "checkbox"; bgChk.checked = true; bgChk.style.width = "18px"; bgChk.style.height = "18px";
    bgRow.appendChild(bgChk); body.appendChild(bgRow);
    const tolWrap = document.createElement("div"); tolWrap.style.margin = "2px 0 4px";
    tolWrap.innerHTML = `<label style="font-size:12px;color:#8c93a0">Cut-out strength</label>`;
    const tol = document.createElement("input"); tol.type = "range"; tol.min = "10"; tol.max = "90"; tol.value = "40";
    tolWrap.appendChild(tol); body.appendChild(tolWrap);

    function imgToDataURL(img, max) {
      max = max || 720; let w = img.naturalWidth, h = img.naturalHeight;
      if (Math.max(w, h) > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h); return c.toDataURL("image/png");
    }
    file.onchange = () => {
      const f = file.files[0]; if (!f) return;
      const img = new Image();
      img.onload = () => { const src = bgChk.checked ? cutout(img, +tol.value) : imgToDataURL(img); if (window.FM1Overlay) window.FM1Overlay.addImage(src); };
      img.src = URL.createObjectURL(f);
      file.value = "";
    };

    // power tools: randomize, export/import skin, save panel PNG
    body.insertAdjacentHTML("beforeend", `<div class="sec">Tools</div>`);
    const tools = document.createElement("div"); tools.className = "decal-row"; tools.style.flexWrap = "wrap";
    tools.innerHTML = `<button class="rnd">🎲 Random</button><button class="exp">Export</button><button class="imp">Import</button><button class="png">Save PNG</button><button class="shr">🔗 Share look</button>`;
    body.appendChild(tools);
    const impFile = document.createElement("input"); impFile.type = "file"; impFile.accept = ".json,application/json"; impFile.hidden = true; body.appendChild(impFile);
    tools.querySelector(".rnd").onclick = () => {
      const h = () => "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
      const o = h();
      skin = { ...skin, key_top: o, key_bot: dk(o, 0.6), key_line: lt(o, 1.4), key_lit: lt(o, 1.5), amber: o, knob_glow: o };
      apply(); persist(); rebuildInputs(); sel.value = "";
    };
    tools.querySelector(".exp").onclick = () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(skin, null, 2)], { type: "application/json" }));
      a.download = "fm1-skin.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    tools.querySelector(".imp").onclick = () => impFile.click();
    impFile.onchange = async () => {
      const f = impFile.files[0]; if (!f) return;
      try { skin = { ...FM1.SKIN_DEFAULT, ...JSON.parse(await f.text()) }; apply(); persist(); rebuildInputs(); sel.value = ""; } catch {}
    };
    tools.querySelector(".png").onclick = () => {
      const c = FM1.panelCanvas; if (!c) return;
      // composite the panel + any pictures/stickers into one image
      const out = document.createElement("canvas"); out.width = c.width; out.height = c.height;
      const ctx = out.getContext("2d");
      ctx.drawImage(c, 0, 0);
      try { window.FM1Overlay && window.FM1Overlay.compositeOnto(ctx, c); } catch {}
      out.toBlob((b) => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "fm1-panel.png"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });
    };
    // Share look: pack the skin (as a diff from defaults) + UI accent into a ?look= link, with the
    // current firmware/clock, and copy it. Opening it previews the exact paint job — colours + accent.
    tools.querySelector(".shr").onclick = async (e) => {
      const btnEl = e.currentTarget;
      const base = FM1.SKIN_DEFAULT || {};
      const diff = {}; for (const k in skin) if (skin[k] !== base[k]) diff[k] = skin[k];
      const payload = { s: diff }; if ((ui.accent || DEF_ACCENT) !== DEF_ACCENT) payload.a = ui.accent;
      const code = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      let fw = ""; try { const m = (document.getElementById("fullpage")?.getAttribute("href") || "").match(/[?&]fw=([^&]+)/); if (m) fw = decodeURIComponent(m[1]); } catch {}
      if (!fw) fw = czParams.get("fw") || "";
      const u = new URL(location.origin + location.pathname);
      if (fw) u.searchParams.set("fw", fw);
      const mhz = czParams.get("mhz"); if (mhz) u.searchParams.set("mhz", mhz);
      u.searchParams.set("look", code);
      try { await navigator.clipboard.writeText(u.toString()); btnEl.textContent = "✓ Link copied"; }
      catch { btnEl.textContent = "Copy failed"; }
      setTimeout(() => (btnEl.textContent = "🔗 Share look"), 1600);
    };

    // footer + open/close
    pan.querySelector(".apply").onclick = () => { apply(); persist(); };
    pan.querySelector(".reset").onclick = () => { skin = { ...FM1.SKIN_DEFAULT }; apply(); persist(); rebuildInputs(); sel.value = ""; };
    const setOpen = (open) => { pan.classList.toggle("open", open); if (window.FM1Overlay) window.FM1Overlay.setEditing(open, "customize"); };
    pan.querySelector(".close").onclick = () => setOpen(false);
    btn.onclick = () => setOpen(!pan.classList.contains("open"));

    // initial state
    apply();
  };
})();
