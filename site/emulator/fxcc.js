// Stock FX CC strip: send Filter/Reverb/Delay/Distortion/Chorus/Phaser CCs on
// Effect Chn (V15 CC0–23 or V16 CC70–93) to the emulator and MIDI out.
(function () {
  "use strict";
  const KEY = "fm1.fxcc.v1";

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; }
  }
  function save(partial) {
    try {
      const next = { ...load(), ...partial };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    } catch { return partial; }
  }

  function map() {
    const ver = (document.getElementById("fxcc-ver") || {}).value || load().ver || "15";
    return (window.FM1Midi && window.FM1Midi.fxMapFor)
      ? window.FM1Midi.fxMapFor(ver)
      : [];
  }

  function sendCc(cc, value, max) {
    const ch = Number((document.getElementById("fxcc-ch") || {}).value || load().ch || 2) || 2;
    const v = Math.max(0, Math.min(max > 1 ? max : 127, value | 0));
    const scaled = max > 1 && max < 127 ? Math.round((v / max) * max) : v;
    const msg = (window.FM1Midi && window.FM1Midi.fxCcMessage)
      ? window.FM1Midi.fxCcMessage(ch, cc, scaled)
      : [0xb0 | ((ch - 1) & 0x0f), cc & 0x7f, scaled & 0x7f];
    const fm = window.FM1;
    if (fm && fm.midi) fm.midi(msg);
  }

  function renderGrid(pop) {
    const grid = pop.querySelector("#fxcc-grid");
    if (!grid) return;
    const rows = map();
    const state = load().vals || {};
    grid.innerHTML = "";
    let lastFx = "";
    for (const row of rows) {
      if (row.fx !== lastFx) {
        const h = document.createElement("div");
        h.className = "fxcc-h";
        h.textContent = row.fx;
        grid.appendChild(h);
        lastFx = row.fx;
      }
      const wrap = document.createElement("label");
      wrap.className = "fxcc-row";
      const id = `fxcc-${row.cc}`;
      const cur = state[row.cc] != null ? state[row.cc] : (row.max <= 1 ? 0 : Math.round(row.max / 2));
      if (row.max <= 1) {
        wrap.innerHTML = `<span>${row.param}</span><input type="checkbox" id="${id}" ${cur ? "checked" : ""}>`;
        grid.appendChild(wrap);
        wrap.querySelector("input").onchange = (e) => {
          const v = e.target.checked ? 127 : 0;
          save({ vals: { ...load().vals, [row.cc]: v } });
          sendCc(row.cc, v, 127);
        };
      } else {
        wrap.innerHTML = `<span>${row.param} <i>${cur}</i></span><input type="range" id="${id}" min="0" max="${row.max}" value="${cur}">`;
        grid.appendChild(wrap);
        const range = wrap.querySelector("input");
        const lab = wrap.querySelector("i");
        range.oninput = () => {
          lab.textContent = range.value;
          save({ vals: { ...load().vals, [row.cc]: +range.value } });
          sendCc(row.cc, +range.value, row.max);
        };
      }
    }
  }

  function ready(fn) {
    const t = setInterval(() => {
      const nav = document.querySelector(".sitenav") || document.querySelector("header.site .wrap");
      if (nav && window.FM1) { clearInterval(t); fn(nav); }
    }, 150);
    setTimeout(() => clearInterval(t), 12000);
  }

  ready((nav) => {
    const css = document.createElement("style");
    css.textContent = `
      #fxcc-pop{position:fixed;z-index:9997;width:340px;max-width:94vw;max-height:80vh;overflow:auto;background:var(--ui-pop,#0c0d0f);border:1px solid var(--ui-line,#232428);
        border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.6);padding:12px;display:none;flex-direction:column;gap:8px;color:var(--ui-text,#e9edf2);
        font:12.5px 'Space Grotesk',sans-serif}
      #fxcc-pop.open{display:flex}
      #fxcc-pop .top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      #fxcc-pop select{background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:inherit;border-radius:7px;padding:5px 7px;font:inherit}
      #fxcc-grid{display:flex;flex-direction:column;gap:4px}
      #fxcc-grid .fxcc-h{font:600 10px 'Space Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--amber);margin-top:6px}
      #fxcc-grid .fxcc-row{display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:center;font-size:12px}
      #fxcc-grid .fxcc-row i{font-style:normal;color:var(--ui-dim,#8c93a0);margin-left:4px}
      #fxcc-pop .warn{font-size:11px;color:#e7a35a;margin:0;line-height:1.35;display:none}
      #fxcc-pop .warn.on{display:block}
      #fxcc-pop .dim{font-size:11px;color:var(--ui-dim,#8c93a0);margin:0;line-height:1.35}`;
    document.head.appendChild(css);

    const btn = document.createElement("a");
    btn.href = "#"; btn.id = "fxcc-btn"; btn.className = "sitelink";
    btn.textContent = "FX CC";
    btn.title = "Stock firmware effects over MIDI (Effect Chn)";
    nav.appendChild(btn);

    const s = load();
    const pop = document.createElement("div");
    pop.id = "fxcc-pop";
    pop.innerHTML = `
      <div class="top">
        <b>FX CC</b>
        <label>Map <select id="fxcc-ver"><option value="15">V15 (CC0–23)</option><option value="16">V16 (CC70–93)</option></select></label>
        <label>Effect Chn <select id="fxcc-ch"></select></label>
      </div>
      <p class="warn" id="fxcc-warn"></p>
      <div id="fxcc-grid"></div>
      <p class="dim">Sends to the emulator and MIDI out. Stock firmware: effects only on Effect Chn (factory channel 2). Play notes on a different channel.</p>`;
    document.body.appendChild(pop);
    const chSel = pop.querySelector("#fxcc-ch");
    for (let c = 1; c <= 16; c++) chSel.add(new Option(String(c), c));
    chSel.value = s.ch || 2;
    pop.querySelector("#fxcc-ver").value = s.ver || "15";
    chSel.onchange = () => { save({ ch: +chSel.value }); warn(); renderGrid(pop); };
    pop.querySelector("#fxcc-ver").onchange = () => { save({ ver: pop.querySelector("#fxcc-ver").value }); renderGrid(pop); };

    function warn() {
      const play = Number((document.getElementById("midich") || {}).value || 0);
      const effect = +chSel.value;
      const msg = (window.FM1Midi && window.FM1Midi.effectChannelConflict)
        ? window.FM1Midi.effectChannelConflict(play, effect)
        : (play && play === effect ? `Play channel ${play} equals Effect Chn — mod/sustain may be eaten.` : "");
      const el = pop.querySelector("#fxcc-warn");
      el.textContent = msg;
      el.classList.toggle("on", !!msg);
      const midWarn = document.getElementById("midi-fx-warn");
      if (midWarn) {
        midWarn.textContent = msg;
        midWarn.hidden = !msg;
      }
    }
    document.getElementById("midich")?.addEventListener("change", warn);
    renderGrid(pop);
    warn();
    setInterval(warn, 2000);

    const place = () => {
      const r = (window.FM1PopAnchor && window.FM1PopAnchor(btn)) || btn.getBoundingClientRect();
      pop.style.top = (r.bottom + 6) + "px";
      pop.style.left = Math.max(8, Math.min(r.left, innerWidth - 360)) + "px";
    };
    btn.onclick = (e) => { e.preventDefault(); pop.classList.toggle("open"); if (pop.classList.contains("open")) { renderGrid(pop); warn(); place(); } };
    addEventListener("resize", () => { if (pop.classList.contains("open")) place(); });
    document.addEventListener("click", (e) => {
      if (e.target !== btn && !btn.contains(e.target) && !pop.contains(e.target)) pop.classList.remove("open");
    });
  });
})();
