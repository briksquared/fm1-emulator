// Patch bay under the FM-1 — bus → modules only (nothing plugged into the panel).
// Cables are short cartoon patch cords; Livewire on the bay sets opacity / glow / fat / motion.
(function () {
  "use strict";
  const IO = [
    { pop: "midi-pop", btn: "midi-btn", id: "midi", label: "MIDI",  sub: "notes in",            color: "var(--ui-cable-midi, #9a9a9a)", keys: true },
    { pop: "tape-pop", btn: "tape-btn", id: "tape", label: "TAPE",  sub: "sample in · rec out", color: "var(--amber)" },
    { id: "scope", label: "SCOPE", sub: "output", color: "var(--ui-cable-scope, #b8b8b8)", scope: true },
    { pop: "tuner-pop", btn: "tuner-btn", id: "tuner", label: "TUNER", sub: "pitch detect",     color: "var(--ui-cable-tuner, #ff8a1a)" },
    { pop: "rec-pop", btn: "rec-btn", id: "rec", label: "REC", sub: "MIDI capture",             color: "var(--ink, #f0f0f0)" },
  ];
  // Rest of the bay — generative engines + play/debug tools.
  const EXTRA = [
    { id: "gate", label: "GATE", sub: "32-step · grooves", color: "#ff6b4a", gen: "gate" },
    { id: "pianist", label: "PIANIST", sub: "LH · progressions", color: "#f0c050", gen: "pianist" },
    { id: "quant", label: "QUANT", sub: "contour · motifs", color: "#6ec8ff", gen: "quant" },
    { id: "euclid", label: "EUCLID", sub: "dual · XOR", color: "#7dffb3", gen: "euclid" },
    { id: "bass", label: "BASS", sub: "12 modes · ghosts", color: "#c9a0ff", gen: "bass" },
    { id: "drone", label: "DRONE", sub: "voicings · motion", color: "#a0b0c0", gen: "drone" },
    { id: "arp", label: "ARP", sub: "classic · spans", color: "#ffb347", gen: "arp" },
    { id: "prog", label: "PROG", sub: "chord beds", color: "#e8a0ff", gen: "prog" },
    { id: "riff", label: "RIFF", sub: "audition · loop", color: "#ff8a1a", gen: "riff" },
    { id: "markov", label: "MARKOV", sub: "10 walkers", color: "#ff7ab8", gen: "markov" },
    { id: "polyr", label: "POLYR", sub: "A/B/C weave", color: "#5ad0e6", gen: "polyr" },
    { pop: "assist-pop", btn: "assist-btn", id: "assist", label: "ASSIST", sub: "arp · scale · chord", color: "#6ec8ff" },
    { pop: "mon-pop", btn: "mon-btn", id: "mon", label: "MONITOR", sub: "MIDI traffic", color: "#7fb2ff" },
    { pop: "fxcc-pop", btn: "fxcc-btn", id: "fx", label: "FX", sub: "stock CC map", color: "#c9a0ff" },
    { id: "panic", label: "PANIC", sub: "all notes off", color: "#ff5a5a", panic: true },
  ];
  const BAY = IO.concat(EXTRA);
  const FM = () => window.FM1;
  const svgNS = "http://www.w3.org/2000/svg";
  const el = (n, cls) => { const e = document.createElement(n); if (cls) e.className = cls; return e; };
  const portReady = (p) => p.scope || p.gen || p.panic || (document.getElementById(p.pop) && document.getElementById(p.btn));

  function ready(fn) {
    const t = setInterval(() => {
      const deck = document.querySelector(".player .deck"), stage = document.querySelector(".stage");
      // Panel I/O must be ready; Assist/Mon/FX mount when their pops appear.
      if (deck && stage && IO.every(portReady)) { clearInterval(t); fn(deck, stage); }
    }, 120);
    setTimeout(() => clearInterval(t), 12000);
  }

  function buildPanic() {
    const wrap = el("div", "fm1-panic");
    const kill = el("button", "kill"); kill.type = "button"; kill.textContent = "Silence all notes";
    kill.onclick = () => { try { (window.FM1Panic?.panicUI || window.FM1Panic?.panic)?.(); } catch {} };
    const hint = el("p", "hint"); hint.textContent = "Ctrl/Cmd + . also panics.";
    wrap.append(kill, hint);
    return wrap;
  }

  // ---- a playable one-octave keyboard (octave shift, velocity, pitch/mod wheels) ----------------
  function keyboard() {
    const WH = [60, 62, 64, 65, 67, 69, 71, 72];
    const BK = { 0: 61, 1: 63, 3: 66, 4: 68, 5: 70 };
    const wrap = el("div", "kbd");
    let oct = 0; try { oct = Math.max(-3, Math.min(3, +localStorage.getItem("fm1.kbd.oct") || 0)); } catch {}
    const held = new Map();
    const on = (base, k, vel) => { if (held.has(base)) return; held.set(base, k); k.classList.add("dn"); try { FM().midi([0x90, base + oct * 12, vel || 100]); } catch {} };
    const off = (base, k) => { if (!held.has(base)) return; const n = base + oct * 12; held.delete(base); k.classList.remove("dn"); try { FM().midi([0x80, n, 0]); } catch {} };
    const allOff = () => { for (const [b, k] of [...held]) off(b, k); };
    const velAt = (k, e) => { const r = k.getBoundingClientRect(); return Math.max(24, Math.min(127, Math.round(30 + (e.clientY - r.top) / r.height * 97))); };
    const mkKey = (base, cls) => {
      const k = el("div", cls);
      k.addEventListener("pointerdown", (e) => { e.preventDefault(); try { k.setPointerCapture(e.pointerId); } catch {} on(base, k, velAt(k, e)); });
      k.addEventListener("pointerup", () => off(base, k));
      k.addEventListener("pointercancel", () => off(base, k));
      k.addEventListener("pointerleave", (e) => { if (e.buttons) off(base, k); });
      k.addEventListener("pointerenter", (e) => { if (e.buttons && e.pointerType === "mouse") on(base, k, 96); });
      return k;
    };
    const keys = el("div", "keys"); const whites = el("div", "wh");
    WH.forEach((n, i) => { whites.appendChild(mkKey(n, "wk")); if (BK[i] != null) { const b = mkKey(BK[i], "bk"); b.style.left = `calc(${(i + 1) / WH.length * 100}% - 9px)`; keys.appendChild(b); } });
    keys.insertBefore(whites, keys.firstChild);
    const ctr = el("div", "kbd-ctr"); const lbl = el("span", "oct");
    const setLbl = () => { lbl.textContent = `C${4 + oct}`; };
    const mk = (txt, d) => { const b = el("button"); b.type = "button"; b.textContent = txt; b.title = d < 0 ? "Octave down" : "Octave up"; b.onclick = () => { const no = Math.max(-3, Math.min(3, oct + d)); if (no !== oct) { allOff(); oct = no; setLbl(); try { localStorage.setItem("fm1.kbd.oct", oct); } catch {} } }; return b; };
    setLbl(); ctr.append(mk("−", -1), lbl, mk("+", 1));
    function wheel(kind) {
      const w = el("div", "whl " + kind); w.title = kind === "pb" ? "Pitch bend" : "Mod wheel";
      const th = el("div", "th"); w.appendChild(th);
      let v = kind === "pb" ? 0.5 : 0;
      const send = () => { if (!FM()) return; try { if (kind === "pb") { const n = Math.round(v * 16383); FM().midi([0xe0, n & 0x7f, (n >> 7) & 0x7f]); } else FM().midi([0xb0, 1, Math.round(v * 127)]); } catch {} };
      const place = () => { th.style.bottom = (v * 100) + "%"; };
      const set = (cy) => { const r = w.getBoundingClientRect(); v = Math.max(0, Math.min(1, 1 - (cy - r.top) / r.height)); place(); send(); };
      w.addEventListener("pointerdown", (e) => { e.preventDefault(); try { w.setPointerCapture(e.pointerId); } catch {} set(e.clientY); });
      w.addEventListener("pointermove", (e) => { if (e.buttons) set(e.clientY); });
      const spring = () => { if (kind === "pb") { v = 0.5; place(); send(); } };
      w.addEventListener("pointerup", spring); w.addEventListener("pointercancel", spring);
      place(); return w;
    }
    const whls = el("div", "whls"); whls.append(wheel("pb"), wheel("mod"));
    const main = el("div", "kbd-main"); main.append(whls, keys);
    wrap.append(ctr, main);
    return wrap;
  }

  // Simple circle jack — outer ring + dark hole (no fancy hardware chrome).
  function jack(color) {
    const j = el("span", "pj"); j.style.setProperty("--jc", color);
    j.innerHTML = `<span class="pj-hole"></span>`;
    return j;
  }

  // a live oscilloscope that taps the FM-1's audio output (window.FM1.outNode).
  // Display modes cycle from the little tabs: WAVE (time domain), SPEC (FFT bars), LEVEL (peak/RMS
  // meter with a decaying peak-hold), XY (stereo Lissajous, L vs R). The ⛶ button goes fullscreen.
  // The chosen mode sticks in localStorage.
  const SCOPE_MODES = ["wave", "spectrum", "level", "xy"];
  const SCOPE_LABELS = { wave: "WAVE", spectrum: "SPEC", level: "LEVEL", xy: "XY" };
  function buildScope() {
    const wrap = el("div", "scope-wrap");
    let mode = "wave";
    try { const s = localStorage.getItem("fm1.scope.mode"); if (SCOPE_MODES.includes(s)) mode = s; } catch {}
    const bar = el("div", "scope-modes"); const btns = {};
    for (const m of SCOPE_MODES) {
      const b = el("button", "scope-mode"); b.type = "button"; b.textContent = SCOPE_LABELS[m];
      b.onclick = () => { mode = m; try { localStorage.setItem("fm1.scope.mode", m); } catch {} sync(); };
      btns[m] = b; bar.appendChild(b);
    }
    function sync() { for (const m of SCOPE_MODES) btns[m].classList.toggle("on", m === mode); }
    sync();
    // fullscreen toggle (native Fullscreen API on the scope; the canvas is re-sized for crisp pixels)
    const fsBtn = el("button", "scope-fs"); fsBtn.type = "button"; fsBtn.textContent = "⛶"; fsBtn.title = "Fullscreen scope";
    fsBtn.onclick = () => { if (document.fullscreenElement === wrap) document.exitFullscreen(); else if (wrap.requestFullscreen) wrap.requestFullscreen(); };
    bar.appendChild(fsBtn);
    wrap.appendChild(bar);
    const cv = el("canvas", "scope-cv"); cv.width = 440; cv.height = 150;
    wrap.appendChild(cv);
    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement === wrap) { cv.width = Math.min(1920, Math.floor(window.innerWidth * 0.96)); cv.height = Math.min(1080, Math.floor(window.innerHeight * 0.82)); wrap.classList.add("fs"); }
      else { cv.width = 440; cv.height = 150; wrap.classList.remove("fs"); }
    });
    const ctx = cv.getContext("2d");
    let analyser = null, tdata = null, fdata = null, peakHold = 0, lvl = 0;
    let splitter = null, aL = null, aR = null, xyL = null, xyR = null;   // stereo taps for XY
    function ensure() {
      const F = FM(); if (analyser || !F) return;
      const actx = typeof F.context === "function" ? F.context() : F.context;
      const node = typeof F.outNode === "function" ? F.outNode() : F.outNode;
      if (!actx || !node) return;
      try { analyser = actx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.5; tdata = new Uint8Array(analyser.fftSize); fdata = new Uint8Array(analyser.frequencyBinCount); node.connect(analyser); } catch {}
      try { splitter = actx.createChannelSplitter(2); node.connect(splitter); aL = actx.createAnalyser(); aR = actx.createAnalyser(); aL.fftSize = aR.fftSize = 1024; splitter.connect(aL, 0); splitter.connect(aR, 1); xyL = new Uint8Array(aL.fftSize); xyR = new Uint8Array(aR.fftSize); } catch {}
    }
    function scopeColors() {
      const cs = getComputedStyle(document.documentElement);
      const g = (cs.getPropertyValue("--ui-cable-scope").trim() || cs.getPropertyValue("--green").trim() || "#c0c0c0");
      // soft grid / mid lines derived from the scope stroke so stock B&W stays gray
      const dim = g.startsWith("#") && g.length === 7
        ? `rgba(${parseInt(g.slice(1, 3), 16)},${parseInt(g.slice(3, 5), 16)},${parseInt(g.slice(5, 7), 16)},.35)`
        : "rgba(192,192,192,.35)";
      const faint = dim.replace(",.35)", ",.14)");
      return { GREEN: g, DIM: dim, FAINT: faint };
    }
    function draw() {
      requestAnimationFrame(draw);
      if (!wrap.isConnected || !wrap.offsetParent) return;   // skip when hidden/collapsed
      ensure();
      const { GREEN, DIM, FAINT } = scopeColors();
      const w = cv.width, h = cv.height, mid = h / 2;
      ctx.clearRect(0, 0, w, h);
      if (!analyser) {
        ctx.strokeStyle = FAINT; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
        ctx.strokeStyle = DIM; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
        return;
      }
      if (mode === "xy") {
        ctx.strokeStyle = FAINT; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
        if (aL && aR) {
          aL.getByteTimeDomainData(xyL); aR.getByteTimeDomainData(xyR);
          const n = Math.min(xyL.length, 1024), s = Math.min(w, h) * 0.46;
          ctx.strokeStyle = GREEN; ctx.lineWidth = 1.4; ctx.beginPath();
          for (let i = 0; i < n; i++) { const x = w / 2 + (xyL[i] - 128) / 128 * s, y = mid - (xyR[i] - 128) / 128 * s; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          ctx.stroke();
        }
      } else if (mode === "wave") {
        ctx.strokeStyle = FAINT; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
        analyser.getByteTimeDomainData(tdata);
        ctx.strokeStyle = GREEN; ctx.lineWidth = 1.6; ctx.beginPath();
        for (let i = 0; i < w; i++) { const v = (tdata[(i / w * tdata.length) | 0] - 128) / 128; const y = mid - v * (mid - 3); i ? ctx.lineTo(i, y) : ctx.moveTo(i, y); }
        ctx.stroke();
      } else if (mode === "spectrum") {
        analyser.getByteFrequencyData(fdata);
        const bars = 40, lo = 2, hi = fdata.length * 0.7, gap = 1.5;
        const bw = (w - (bars - 1) * gap) / bars;
        for (let b = 0; b < bars; b++) {
          // log-spaced bin window so low notes aren't all crammed into bar 0
          const f0 = lo * Math.pow(hi / lo, b / bars), f1 = lo * Math.pow(hi / lo, (b + 1) / bars);
          let m = 0; for (let i = Math.floor(f0); i < Math.max(Math.floor(f0) + 1, Math.ceil(f1)); i++) if (fdata[i] > m) m = fdata[i];
          const bh = Math.max(1, (m / 255) * (h - 2)), x = b * (bw + gap);
          ctx.fillStyle = m > 225 ? (getComputedStyle(document.documentElement).getPropertyValue("--amber-hi").trim() || "#f2f2f2") : GREEN;
          ctx.fillRect(x, h - bh, bw, bh);
        }
      } else { // level meter: peak amplitude from the time domain, with a falling peak-hold
        analyser.getByteTimeDomainData(tdata);
        let pk = 0; for (let i = 0; i < tdata.length; i++) { const v = Math.abs(tdata[i] - 128) / 128; if (v > pk) pk = v; }
        lvl += (pk - lvl) * 0.4;                       // smooth the bar
        peakHold = Math.max(peakHold - 0.012, lvl);     // and hold the peak, falling slowly
        const barH = h - 10, x0 = 6, barW = w - 12;
        ctx.fillStyle = FAINT; ctx.fillRect(x0, 5, barW, barH);
        const grd = ctx.createLinearGradient(x0, 0, x0 + barW, 0);
        // Follow theme tokens so stock stays black/white; colour themes can tint via cable/accent.
        const hi = getComputedStyle(document.documentElement).getPropertyValue("--amber-hi").trim() || "#f2f2f2";
        const mid = getComputedStyle(document.documentElement).getPropertyValue("--amber").trim() || GREEN;
        const warn = getComputedStyle(document.documentElement).getPropertyValue("--ui-warn").trim() || hi;
        grd.addColorStop(0, DIM); grd.addColorStop(0.7, GREEN); grd.addColorStop(0.9, mid); grd.addColorStop(1, warn);
        ctx.fillStyle = grd; ctx.fillRect(x0, 5, barW * Math.min(1, lvl), barH);
        const px = x0 + barW * Math.min(1, peakHold);
        ctx.fillStyle = peakHold > 0.98 ? warn : hi; ctx.fillRect(px - 1, 3, 2, barH + 4);
      }
    }
    requestAnimationFrame(draw);
    return wrap;
  }

  ready((deck, stage) => {
    const css = el("style"); css.textContent = `
      .deck { position: relative; }
      /* a small Flash button up in the header, by the firmware name */
      .fm1-flash-btn{flex:none;background:var(--amber);border:0;color:var(--ui-on-accent,#180a02);border-radius:7px;padding:4px 11px;
        font:700 11.5px 'Space Grotesk',-apple-system,sans-serif;letter-spacing:.02em;cursor:pointer}
      .fm1-flash-btn:hover{background:var(--amber-hi)}
      .fm1-flash-btn:active{transform:translateY(1px)}
      /* Circle jack — same size as the whole time */
      .pj{position:relative;width:26px;height:26px;display:inline-block;border-radius:50%;
        background:radial-gradient(circle at 40% 32%,#3a3e46,#121418 70%);
        border:2px solid color-mix(in srgb,var(--jc,#888) 55%,#1a1c20);
        box-shadow:inset 0 1px 2px rgba(0,0,0,.75),0 1px 2px rgba(0,0,0,.35)}
      .pj-hole{position:absolute;inset:6px;border-radius:50%;background:#050607;
        box-shadow:inset 0 1px 2px rgba(0,0,0,.9)}
      /* One rack case; cards keep their original size */
      .fm1-bay{position:relative;margin:14px auto 0;width:100%;max-width:var(--panel-w,860px);z-index:3;
        overflow:visible;display:flex;flex-direction:column;gap:8px;padding:8px;
        background:#1a1c20;border:1px solid #3a3d44;border-radius:2px;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 8px 22px rgba(0,0,0,.5)}
      .fm1-cables{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:5}
      /* Slim cable bar */
      .fm1-livewire{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:3px 6px;
        border-radius:6px;border:1px solid #2a2c31;background:#16181c}
      .fm1-livewire .lw-brand{font:600 8px 'Space Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:#8a909a;margin-right:2px}
      .fm1-livewire .lw-knob{display:flex;align-items:center;gap:4px;user-select:none}
      .fm1-livewire .lw-knob .dial{width:18px;height:18px;border-radius:50%;cursor:ns-resize;touch-action:none;position:relative;
        background:radial-gradient(circle at 32% 28%,#6a6e76,#2e3138 58%,#121418);
        border:1px solid #4a4e56;box-shadow:inset 0 1px 0 rgba(255,255,255,.1)}
      .fm1-livewire .lw-knob .cap{display:none}
      .fm1-livewire .lw-knob .val{font:600 8px 'Space Mono',monospace;color:#9aa0aa;min-width:26px}
      .fm1-livewire .lw-sw,.fm1-livewire .lw-motion{display:flex;gap:2px;flex-wrap:wrap}
      .fm1-livewire .lw-motion{margin-left:4px;padding-left:4px;border-left:1px solid #2a2c31}
      .fm1-livewire button{min-width:0;padding:2px 5px;border-radius:2px;cursor:pointer;line-height:1.2;
        background:#22252a;border:1px solid #3a3e46;color:#9aa0aa;
        font:600 7px 'Space Mono',monospace;letter-spacing:.06em;text-transform:uppercase}
      .fm1-livewire button:hover{border-color:#6a6e76;color:#e0e4ea}
      .fm1-livewire button.on{background:var(--amber,#d8d8d8);border-color:transparent;color:var(--ui-on-accent,#111)}
      /* Module cards — original 4-under size (min 150px, grow to fill a row of ~4) */
      .fm1-mods{display:flex;gap:12px;justify-content:center;align-items:flex-start;flex-wrap:wrap}
      .fm1-mod{position:relative;min-width:150px;flex:1 1 150px;max-width:220px;border-radius:12px;
        background:linear-gradient(var(--ui-mod-top,#1a1c20),var(--ui-mod-bot,#121317));
        border:1px solid var(--ui-line,#2c2f35);box-shadow:0 10px 24px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.05);overflow:hidden}
      .fm1-mod::before,.fm1-mod::after{content:"";position:absolute;top:8px;width:5px;height:5px;border-radius:50%;
        background:radial-gradient(circle at 40% 35%,#6a6e76,#2a2d33);box-shadow:inset 0 0 1px #000}
      .fm1-mod::before{left:8px}.fm1-mod::after{right:8px}
      .fm1-face{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer}
      .fm1-face .pj{flex:none}
      .fm1-face .lab{display:flex;flex-direction:column;line-height:1.15;flex:1;min-width:0}
      .fm1-face .lab b{font:800 13px 'Space Grotesk',-apple-system,sans-serif;letter-spacing:.02em;color:var(--ui-text,#f2f4f7)}
      .fm1-face .lab small{font:600 10px 'Space Mono',ui-monospace,monospace;color:var(--pc)}
      .fm1-face .chev{color:var(--ui-dim,#8c93a0);font-size:12px;transition:transform .16s}
      .fm1-mod.open .fm1-face{border-bottom:1px solid var(--ui-line,#26292f)}
      .fm1-mod.open .fm1-face .chev{transform:rotate(180deg);color:var(--pc)}
      .fm1-mod.open{flex:0 1 auto;min-width:min(300px,96%);max-width:min(320px,100%);width:max-content;
        overflow:visible;z-index:6;border-color:color-mix(in srgb,var(--pc) 55%,#2c2f35)}
      .fm1-body{display:none;flex-direction:column;align-items:stretch;gap:8px;padding:10px;min-width:0;width:100%;box-sizing:border-box}
      .fm1-mod.open .fm1-body{display:flex}
      .scope-wrap{width:100%;max-width:100%;box-sizing:border-box;background:#070809;border:1px solid var(--ui-line,#2a2a2a);border-radius:8px;padding:7px}
      .scope-cv{width:100%;height:150px;display:block}
      .scope-modes{display:flex;gap:4px;margin-bottom:6px}
      .scope-mode{flex:1;min-width:0;background:var(--ui-surface,#141414);border:1px solid var(--ui-line,#2a2a2a);color:var(--ui-dim,#a0a0a0);border-radius:5px;padding:3px 2px;
        font:700 9px 'Space Mono',ui-monospace,monospace;letter-spacing:.06em;cursor:pointer;transition:all .12s}
      .scope-mode:hover{border-color:var(--amber);color:var(--ink)}
      .scope-mode.on{background:var(--ui-cable-scope,var(--green,#c0c0c0));border-color:transparent;color:var(--ui-on-accent,#111)}
      .scope-fs{flex:0 0 auto;width:30px;background:var(--ui-surface,#141414);border:1px solid var(--ui-line,#2a2a2a);color:var(--ui-dim,#a0a0a0);border-radius:5px;
        font-size:12px;line-height:1;cursor:pointer;padding:3px 0}
      .scope-fs:hover{border-color:var(--amber);color:var(--ink)}
      .scope-wrap:fullscreen{display:flex;flex-direction:column;justify-content:center;gap:10px;padding:18px;background:#050607;box-sizing:border-box}
      .scope-wrap:fullscreen .scope-cv{width:100%;height:auto;flex:1;min-height:0;object-fit:contain}
      .scope-wrap:fullscreen .scope-modes{max-width:560px;margin:0 auto}
      /* in the right sidebar column the scope box is narrow (~256px) — let the WAVE/SPEC/LEVEL/XY tabs
         shrink to fit instead of spilling out of the box (flex:1 won't shrink below text without min-width:0) */
      .scope-box .scope-wrap{width:100%!important;max-width:none!important;padding:6px}
      .scope-box .scope-modes{gap:3px}
      .scope-box .scope-mode{min-width:0;padding:3px 4px;letter-spacing:0;overflow:visible;text-overflow:clip;white-space:normal;line-height:1.2;height:auto}
      .scope-box .scope-fs{width:22px;flex:0 0 22px}
      /* dock the existing control panels open, inline — fill the open module, never a fixed width that gets clipped */
      #midi-pop.fm1-inline,#tape-pop.fm1-inline,#tuner-pop.fm1-inline,#rec-pop.fm1-inline,
      #assist-pop.fm1-inline,#mon-pop.fm1-inline,#fxcc-pop.fm1-inline{position:static!important;display:flex!important;transform:none!important;
        width:100%!important;max-width:100%!important;max-height:none!important;box-sizing:border-box!important;
        box-shadow:none!important;margin:0!important;border:0!important;background:transparent!important;padding:0!important;overflow:visible!important}
      .fm1-panic{display:flex;flex-direction:column;gap:6px;width:100%}
      .fm1-panic button{width:100%;padding:8px;border-radius:7px;border:1px solid var(--ui-line,#2a2c31);background:var(--ui-surface,#17181b);
        color:var(--ui-text,#e9edf2);font:700 12px 'Space Grotesk',sans-serif;cursor:pointer}
      .fm1-panic button.kill{background:#ff2a2a;color:#190404;border:0}
      .fm1-panic button:hover{filter:brightness(1.08)}
      .fm1-panic .hint{margin:0;font-size:10.5px;line-height:1.35;color:var(--ui-dim,#8c93a0)}
      /* keyboard */
      .kbd{display:flex;flex-direction:column;gap:5px;width:100%;max-width:100%;box-sizing:border-box;border-radius:8px;background:var(--ui-pop,#0c0d0f);border:1px solid var(--ui-line,#232428);padding:6px}
      .kbd-ctr{display:flex;align-items:center;justify-content:center;gap:9px}
      .kbd-ctr button{width:24px;height:18px;border-radius:5px;background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text2,#cfd4da);font:700 13px 'Space Grotesk',sans-serif;cursor:pointer;line-height:1;padding:0}
      .kbd-ctr button:hover{border-color:var(--pc);color:var(--ui-text,#fff)}
      .kbd-ctr .oct{font:700 11px 'Space Mono',ui-monospace,monospace;color:var(--ui-dim,#8c93a0);min-width:28px;text-align:center}
      .kbd-main{display:flex;gap:5px;align-items:stretch;height:56px}
      .kbd .keys{position:relative;flex:1}
      .whls{display:flex;gap:4px}
      .whl{position:relative;width:14px;border-radius:6px;background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);cursor:ns-resize;touch-action:none}
      .whl.pb::after{content:"";position:absolute;left:2px;right:2px;top:50%;height:1px;background:#4a4d54}
      .whl .th{position:absolute;left:1px;right:1px;height:11px;border-radius:4px;background:linear-gradient(#7a7f87,#3a3d43);transform:translateY(50%);box-shadow:0 1px 2px rgba(0,0,0,.4)}
      .kbd .wh{display:flex;gap:2px;height:100%}
      .kbd .wk{flex:1;border-radius:0 0 4px 4px;background:linear-gradient(#f4f4ef,#dcdcd4);border:1px solid #9a9a92;border-top:0;cursor:pointer}
      .kbd .wk.dn{background:linear-gradient(var(--pc),color-mix(in srgb,var(--pc) 60%,#000))}
      .kbd .bk{position:absolute;top:0;width:18px;height:62%;border-radius:0 0 3px 3px;background:linear-gradient(#2a2a2e,#0b0b0d);border:1px solid #000;z-index:2;cursor:pointer;box-shadow:0 2px 3px rgba(0,0,0,.5)}
      .kbd .bk.dn{background:linear-gradient(var(--pc),color-mix(in srgb,var(--pc) 45%,#000))}
      /* Size control in the header (cable looks live on the Livewire strip) */
      .fm1-deck-ctls{display:flex;align-items:center;gap:14px;flex:none;margin-left:auto;flex-wrap:wrap}
      .fm1-deck-ctls.in-bar{margin-left:12px}
      .fm1-size{display:flex;align-items:center;gap:7px;flex:none}
      .fm1-size label{font:700 9px 'Space Mono',ui-monospace,monospace;letter-spacing:.12em;color:var(--ui-dim,#8c93a0);text-transform:uppercase}
      .fm1-size input[type=range]{width:118px;accent-color:var(--amber,#d8d8d8);cursor:ew-resize;margin:0}
      .fm1-size .val{font:700 10px 'Space Mono',ui-monospace,monospace;color:var(--ui-text2,#cfd4da);min-width:38px;text-align:right}
      .fm1-fitted .panel-stack,
      .fm1-fitted canvas{max-width:none;width:100%}
      .fm1-fitted .fm1-bay{max-width:100%}
      .fm1-deck-ctls button{
        flex:none;background:linear-gradient(180deg,var(--cap-top,#34353b),var(--cap-bot,#1c1d21));
        border:1px solid var(--cap-edge,#4a4b52);border-bottom-color:var(--cap-shade,#0e0f12);
        box-shadow:var(--raised,inset 0 1px 0 rgba(255,255,255,.12),0 2px 3px rgba(0,0,0,.45));
        color:var(--ui-text2,#cfd4da);border-radius:6px;padding:2px 8px;
        font:700 9px 'Space Grotesk',-apple-system,sans-serif;letter-spacing:.04em;cursor:pointer}
      .fm1-deck-ctls button:hover{filter:brightness(1.1)}
      .fm1-deck-ctls button.on{background:linear-gradient(180deg,var(--amber-hi,#f2f2f2),var(--amber,#d8d8d8));border-color:transparent;color:var(--ui-on-accent,#180a02);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 2px 3px rgba(0,0,0,.4)}
      @media (max-width:620px){ .fm1-mods{gap:12px} .fm1-mod{min-width:132px} .fm1-mod.open{min-width:min(260px,96%);max-width:100%} .fm1-size input[type=range]{width:84px} }`;
    document.head.appendChild(css);

    // Absolute Size zoom (50–300%). null = Auto-fit. Persisted as fm1_rig_zoom.
    let userZoom = null;
    try {
      localStorage.removeItem("fm1_rig_scale"); // drop the short-lived relative-Fit key
      const s = localStorage.getItem("fm1_rig_zoom");
      if (s != null) { const v = parseFloat(s); if (v >= 0.5 && v <= 3) userZoom = v; }
    } catch {}

    // a small Flash button up in the header next to the firmware name: flashes the current firmware
    const flashBtn = el("button", "fm1-flash-btn"); flashBtn.type = "button"; flashBtn.id = "fm1-flash-btn";
    flashBtn.innerHTML = "Flash"; flashBtn.title = "Flash the current firmware to a real FM-1";
    flashBtn.onclick = () => {
      const inst = document.getElementById("inst-fw"), cur = document.getElementById("fw") && document.getElementById("fw").value;
      const fb = document.getElementById("inst-flash");
      if (inst && cur) { inst.value = cur; inst.dispatchEvent(new Event("change", { bubbles: true })); }
      if (fb) { fb.scrollIntoView({ block: "nearest" }); fb.click(); }
      else alert("Flashing to a real FM-1 needs the desktop app or Chrome/Edge (WebSerial). The emulator itself runs everywhere.");
    };
    const head = deck.querySelector(".deck-head");
    (head || deck).appendChild(flashBtn);

    // Size sits in the header; cable looks live on the Livewire strip under the bay label.
    const ctls = el("div", "fm1-deck-ctls");
    const sizeWrap = el("div", "fm1-size");
    const sizeLab = el("label"); sizeLab.textContent = "Size";
    const sizeRange = el("input"); sizeRange.type = "range"; sizeRange.min = "50"; sizeRange.max = "300"; sizeRange.step = "5";
    sizeRange.title = "Machine size";
    const sizeVal = el("span", "val");
    const sizeFit = el("button"); sizeFit.type = "button"; sizeFit.textContent = "Fit"; sizeFit.title = "Auto-fit the machine to the window";
    sizeWrap.append(sizeLab, sizeRange, sizeVal, sizeFit);
    ctls.appendChild(sizeWrap);

    const topBar = document.querySelector("header.site .wrap");
    (topBar || head || deck).appendChild(ctls);
    function placeSize() {
      const bar = document.getElementById("fm1-transport");
      if (!topBar || !bar) return;
      if (ctls.parentNode !== topBar) topBar.appendChild(ctls);
      ctls.classList.remove("in-bar");
      const first = topBar.firstElementChild;
      const wraps = first && ctls.getBoundingClientRect().top > first.getBoundingClientRect().bottom - 4;
      if (wraps) { ctls.classList.add("in-bar"); bar.appendChild(ctls); }
    }
    let placeTries = 0;
    const placeWait = setInterval(() => { if (document.getElementById("fm1-transport") || ++placeTries > 60) { clearInterval(placeWait); placeSize(); } }, 100);
    if (window.ResizeObserver && topBar) new ResizeObserver(() => requestAnimationFrame(placeSize)).observe(document.querySelector("header.site") || topBar);
    window.addEventListener("resize", () => requestAnimationFrame(placeSize));
    document.fonts?.ready?.then(placeSize);
    function syncSizeUI() {
      if (userZoom == null) { sizeVal.textContent = "Auto"; sizeFit.classList.add("on"); sizeRange.value = String(Math.round(Math.min(3, Math.max(.5, rigZoom || 1)) * 100)); }
      else { sizeVal.textContent = Math.round(userZoom * 100) + "%"; sizeFit.classList.remove("on"); sizeRange.value = String(Math.round(userZoom * 100)); }
      const playerEl = deck.closest(".player");
      if (playerEl) playerEl.classList.toggle("fm1-sized", userZoom != null);
    }
    sizeRange.addEventListener("input", () => {
      userZoom = Math.min(3, Math.max(.5, (parseInt(sizeRange.value, 10) || 100) / 100));
      try { localStorage.setItem("fm1_rig_zoom", String(userZoom)); } catch {}
      syncSizeUI(); fit();
    });
    sizeFit.addEventListener("click", () => {
      userZoom = null;
      try { localStorage.removeItem("fm1_rig_zoom"); } catch {}
      syncSizeUI(); fit();
    });

    // Cable bar: opacity + Glow/Fat + motion modes (no tension).
    const MOTION = ["off", "free", "beat", "wiggle"];
    let lw = { opacity: 0.55, glow: false, fat: false, motion: "off" };
    try {
      const raw = JSON.parse(localStorage.getItem("fm1_livewire") || "null");
      if (raw && typeof raw === "object") {
        if (typeof raw.opacity === "number") lw.opacity = Math.min(1, Math.max(0, raw.opacity));
        lw.glow = !!raw.glow; lw.fat = !!raw.fat;
        if (raw.motion === true) lw.motion = "free";
        else if (MOTION.includes(raw.motion)) lw.motion = raw.motion;
      } else {
        const v = localStorage.getItem("fm1_cables");
        if (v === "off") lw.opacity = 0;
        else if (v === "on") lw.opacity = 1;
        else if (v === "dim") lw.opacity = 0.32;
      }
    } catch {}
    function saveLw() { try { localStorage.setItem("fm1_livewire", JSON.stringify(lw)); } catch {} }

    function makeKnob(fmt) {
      const wrap = el("div", "lw-knob");
      const dial = el("div", "dial"); dial.title = "Opacity — drag";
      const tick = el("span"); tick.style.cssText = "position:absolute;left:50%;top:2px;width:2px;height:6px;margin-left:-1px;border-radius:1px;background:#e8ecf2;transform-origin:50% 7px;pointer-events:none";
      dial.appendChild(tick);
      const cap = el("span", "cap");
      const val = el("span", "val");
      const syncDial = () => {
        tick.style.transform = `rotate(${-135 + lw.opacity * 270}deg)`;
        val.textContent = fmt(lw.opacity);
      };
      let dragging = false, lastY = 0;
      dial.addEventListener("pointerdown", (e) => { dragging = true; lastY = e.clientY; dial.setPointerCapture(e.pointerId); });
      dial.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        lw.opacity = Math.min(1, Math.max(0, lw.opacity + (lastY - e.clientY) * 0.012));
        lastY = e.clientY; saveLw(); syncDial(); draw();
      });
      dial.addEventListener("pointerup", () => { dragging = false; });
      dial.addEventListener("dblclick", () => { lw.opacity = 0.55; saveLw(); syncDial(); draw(); });
      wrap.append(dial, cap, val);
      syncDial();
      return wrap;
    }

    const livewire = el("div", "fm1-livewire");
    const lwBrand = el("span", "lw-brand"); lwBrand.textContent = "Cables";
    const lwSw = el("div", "lw-sw");
    const swGlow = el("button"); swGlow.type = "button"; swGlow.textContent = "Glow"; swGlow.title = "Halo";
    const swFat = el("button"); swFat.type = "button"; swFat.textContent = "Fat"; swFat.title = "Thicker";
    const lwMotion = el("div", "lw-motion");
    const motionBtns = {};
    for (const [id, label, title] of [
      ["off", "Off", "Static cables"],
      ["free", "Wave", "Free-running sway"],
      ["beat", "Beat", "Pulse with transport BPM"],
      ["wiggle", "Wiggle", "Nervous multi-frequency wiggle"],
    ]) {
      const b = el("button"); b.type = "button"; b.textContent = label; b.title = title;
      b.onclick = () => { lw.motion = id; saveLw(); syncSw(); draw(); tickMotion(); };
      motionBtns[id] = b; lwMotion.appendChild(b);
    }
    const syncSw = () => {
      swGlow.classList.toggle("on", lw.glow);
      swFat.classList.toggle("on", lw.fat);
      for (const id of MOTION) motionBtns[id].classList.toggle("on", lw.motion === id);
    };
    swGlow.onclick = () => { lw.glow = !lw.glow; saveLw(); syncSw(); draw(); };
    swFat.onclick = () => { lw.fat = !lw.fat; saveLw(); syncSw(); draw(); };
    lwSw.append(swGlow, swFat);
    livewire.append(lwBrand, makeKnob((v) => Math.round(v * 100) + "%"), lwSw, lwMotion);
    syncSw();

    // One rack: cable bar + modules only (no separate bus strip).
    const bay = el("div", "fm1-bay");
    const svg = document.createElementNS(svgNS, "svg"); svg.setAttribute("class", "fm1-cables");
    const mods = el("div", "fm1-mods");
    bay.append(livewire, mods, svg);

    const links = []; // { color, from, to, seed, mod }

    function mountMod(p) {
      if (!portReady(p)) return null;
      const mod = el("div", "fm1-mod"); mod.style.setProperty("--pc", p.color); mod.dataset.id = p.id;
      const face = el("div", "fm1-face");
      const dj = jack(p.color); dj.classList.add("djack");
      const lab = el("div", "lab"); lab.innerHTML = `<b>${p.label}</b><small>${p.sub}</small>`;
      const chev = el("span", "chev"); chev.textContent = "▾";
      face.append(dj, lab, chev);
      const body = el("div", "fm1-body");
      if (p.scope) {
        body.appendChild(buildScope());
        const scopeBtn = document.getElementById("scope-btn");
        if (scopeBtn) scopeBtn.style.display = "none";
      } else if (p.gen) {
        if (window.FM1RackGens) window.FM1RackGens.mount(p.gen, body);
        else body.appendChild(Object.assign(el("p", "rgate-hint"), { textContent: "Generator loading…" }));
      } else if (p.panic) {
        body.appendChild(buildPanic());
      } else {
        const pop = document.getElementById(p.pop), btn = document.getElementById(p.btn);
        if (p.keys) body.appendChild(keyboard());
        if (pop) { pop.classList.add("fm1-inline", "open"); body.appendChild(pop); }
        if (btn) btn.style.display = "none";
      }
      face.setAttribute("role", "button"); face.tabIndex = 0;
      const syncFace = () => { const o = mod.classList.contains("open"); face.setAttribute("aria-expanded", String(o)); face.title = `${o ? "Fold" : "Open"} ${p.label}`; };
      const flip = () => {
        mod.classList.toggle("open");
        syncFace();
        requestAnimationFrame(() => {
          draw();
          if (mod.classList.contains("open")) {
            try { mod.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); } catch {}
            try { window.FM1Rig?.fit?.(); } catch {}
          }
        });
      };
      syncFace();
      mod.append(face, body);
      face.onclick = flip;
      face.onkeydown = (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === face) { e.preventDefault(); e.stopPropagation(); flip(); } };
      mods.appendChild(mod);

      const seed = (p.id.charCodeAt(0) * 17 + links.length * 13) & 31;
      // Cable hangs from the top of this module column into its face jack (one rack, no second bus).
      links.push({ color: p.color, from: null, to: dj, seed, mod });
      return mod;
    }

    const mounted = new Set();
    for (const p of BAY) {
      if (mountMod(p)) mounted.add(p.id);
    }

    let rackTries = 0;
    const rackWait = setInterval(() => {
      let added = false;
      for (const p of EXTRA) {
        if (mounted.has(p.id) || !portReady(p)) continue;
        if (mountMod(p)) { mounted.add(p.id); added = true; }
      }
      if (added) requestAnimationFrame(draw);
      if (++rackTries > 40) clearInterval(rackWait);
    }, 250);

    stage.insertAdjacentElement("afterend", bay);

    let rigZoom = 1, fitting = false, motionT = 0, motionRaf = 0;

    function bpmMs() {
      let bpm = 120;
      try { if (window.FM1Transport) bpm = window.FM1Transport.getBpm() || 120; } catch {}
      return 60000 / Math.max(40, bpm);
    }
    // Short cords into each module jack. Motion: off / free wave / beat / wiggle.
    function cablePath(x1, y1, x2, y2, seed) {
      const dy = Math.max(6, y2 - y1);
      const dist = Math.hypot(x2 - x1, dy);
      const lean = ((seed % 5) - 2) * 1.4;
      const sag = 10 + Math.min(28, dist * 0.18) + (seed % 5);
      let ox = 0, oy = 0;
      const t = motionT;
      const ph = seed * 0.7;
      if (lw.motion === "free") {
        ox = Math.sin(t * 0.0022 + ph) * 4.5;
        oy = Math.cos(t * 0.0017 + ph) * 2.2;
      } else if (lw.motion === "beat") {
        const beat = ((t % bpmMs()) / bpmMs());
        const pulse = Math.sin(beat * Math.PI) * 6;
        ox = Math.sin(ph) * pulse;
        oy = Math.abs(Math.cos(beat * Math.PI)) * 3;
      } else if (lw.motion === "wiggle") {
        ox = Math.sin(t * 0.011 + ph) * 3.2 + Math.sin(t * 0.029 + ph * 2) * 2.4;
        oy = Math.sin(t * 0.017 + ph * 1.3) * 2.8;
      }
      const mx = (x1 + x2) / 2 + lean + ox;
      const my = y1 + dy * 0.5 + sag + oy;
      return `M ${x1} ${y1} C ${x1 + lean * 0.3 + ox * 0.4} ${y1 + sag * 0.65}, ${mx} ${my}, ${x2} ${y2}`;
    }
    function plug(x, y, color) {
      const g = document.createElementNS(svgNS, "g");
      const outer = document.createElementNS(svgNS, "circle");
      outer.setAttribute("cx", x); outer.setAttribute("cy", y); outer.setAttribute("r", "6.5");
      outer.style.fill = color; outer.setAttribute("stroke", "rgba(0,0,0,.55)"); outer.setAttribute("stroke-width", "1.2");
      const hole = document.createElementNS(svgNS, "circle");
      hole.setAttribute("cx", x); hole.setAttribute("cy", y); hole.setAttribute("r", "2.5");
      hole.setAttribute("fill", "#0a0b0d");
      g.append(outer, hole);
      return g;
    }
    function draw() {
      const br = bay.getBoundingClientRect();
      svg.innerHTML = "";
      svg.style.opacity = String(lw.opacity);
      svg.style.visibility = lw.opacity <= 0.01 ? "hidden" : "visible";
      if (lw.opacity <= 0.01) return;
      const c = (r) => [(r.left - br.left + r.width / 2) / rigZoom, (r.top - br.top + r.height / 2) / rigZoom];
      const fat = lw.fat ? 1.35 : 1;
      const railTop = (livewire.getBoundingClientRect().bottom - br.top) / rigZoom + 2;
      for (const { color, to, seed, mod } of links) {
        if (!to || !mod) continue;
        const mr = mod.getBoundingClientRect();
        const x1 = (mr.left - br.left + mr.width / 2) / rigZoom;
        const y1 = railTop;
        const [x2, y2] = c(to.getBoundingClientRect());
        const d = cablePath(x1, y1, x2, y2 - 1, seed || 0);
        if (lw.glow) {
          const halo = document.createElementNS(svgNS, "path");
          halo.setAttribute("d", d); halo.setAttribute("fill", "none");
          halo.style.stroke = color; halo.setAttribute("stroke-width", String(9 * fat));
          halo.setAttribute("stroke-linecap", "round"); halo.setAttribute("opacity", "0.22");
          svg.appendChild(halo);
        }
        const edge = document.createElementNS(svgNS, "path");
        edge.setAttribute("d", d); edge.setAttribute("fill", "none");
        edge.setAttribute("stroke", "rgba(0,0,0,.5)"); edge.setAttribute("stroke-width", String(5.4 * fat));
        edge.setAttribute("stroke-linecap", "round");
        const cord = document.createElementNS(svgNS, "path");
        cord.setAttribute("d", d); cord.setAttribute("fill", "none");
        cord.style.stroke = color; cord.setAttribute("stroke-width", String(3.4 * fat));
        cord.setAttribute("stroke-linecap", "round");
        // soft cartoon highlight along the top of the cord
        const hi = document.createElementNS(svgNS, "path");
        hi.setAttribute("d", d); hi.setAttribute("fill", "none");
        hi.setAttribute("stroke", "rgba(255,255,255,.28)"); hi.setAttribute("stroke-width", String(1.15 * fat));
        hi.setAttribute("stroke-linecap", "round"); hi.setAttribute("opacity", "0.85");
        hi.setAttribute("transform", "translate(0,-0.9)");
        svg.append(edge, cord, hi);
        svg.appendChild(plug(x1, y1 + 1, color));
        svg.appendChild(plug(x2, y2 - 1, color));
      }
    }
    function tickMotion() {
      cancelAnimationFrame(motionRaf);
      if (lw.motion === "off") return;
      const step = (t) => { motionT = t; draw(); motionRaf = requestAnimationFrame(step); };
      motionRaf = requestAnimationFrame(step);
    }
    tickMotion();
    // Scale the whole rig to fit: lay the deck out at a fixed design width (so the panel and the bay
    // never wrap or overflow) and zoom it down when the available width is smaller. The cables, keys,
    // modules and jacks all scale together as one piece.
    const RIG_W = 920;
    function fit() {
      if (fitting) return; fitting = true;
      try {
        if (document.fullscreenElement === deck) { deck.style.width = ""; deck.style.flex = ""; deck.style.zoom = ""; bay.style.maxWidth = ""; deck.classList.remove("fm1-fitted"); rigZoom = 1; draw(); return; }
        // measure the width the deck naturally gets (its flex share, beside the sidebar or full-width
        // when the sidebar stacks), by briefly dropping the fixed width + zoom, then scale to fit it.
        deck.style.width = ""; deck.style.flex = ""; deck.style.zoom = ""; bay.style.maxWidth = "";
        const avail = deck.clientWidth || RIG_W;
        const top = deck.getBoundingClientRect().top + scrollY;   // the page above the deck, in its own place in the row
        // scale the rig UP to fill the space it's given (capped so the upscaled panel doesn't get soft),
        // not just down — so the machine grows to fill a wide center column instead of sitting native-size.
        // A user-set size (the Size slider) wins over auto-fit so the player controls the machine size.
        deck.classList.add("fm1-fitted");
        deck.style.width = RIG_W + "px";
        deck.style.flex = "0 0 auto";
        // Auto-fit also keeps the machine itself (title row + panel) inside the window's height:
        // scaling by width alone pushed the bottom of the panel below the window on wide or
        // short windows. The devices under it may still scroll into view.
        let byHeight = Infinity;
        if (userZoom == null && innerHeight > 0) {
          const panel = stage.offsetTop + stage.offsetHeight;                // deck px at zoom 1 (offsetParent: the deck)
          if (panel > 0) byHeight = Math.max(0, innerHeight - top - 14) / panel;
        }
        rigZoom = (userZoom != null) ? userZoom : Math.max(0.4, Math.min(3.2, avail / RIG_W, byHeight));
        deck.style.zoom = rigZoom === 1 ? "" : String(rigZoom);
        // Bay matches the filled panel column (not a narrower leftover cap).
        bay.style.maxWidth = RIG_W + "px";
        draw();
        syncSizeUI();
      } finally { fitting = false; }
    }
    fit();
    window.addEventListener("resize", fit);
    let n = 0; const settle = setInterval(() => { fit(); if (++n > 8) clearInterval(settle); }, 280);
    // redraw the instant fonts/images/layout settle, so cables never paint on a stale layout (the one-frame sag)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestAnimationFrame(fit));
    window.addEventListener("load", fit);
    requestAnimationFrame(() => requestAnimationFrame(fit));
    document.addEventListener("fullscreenchange", fit);
    // The cables are drawn in deck coordinates, so anything that moves a jack inside the deck
    // (a device panel opening, the title row wrapping, the machine resizing, a module shown or
    // hidden) redraws them; anything above the deck changing height (the header wrapping, the
    // toolbar) changes the room the machine has, so it fits again. Both wait for the next frame,
    // once per frame, so a burst of changes is one redraw and never a ResizeObserver loop.
    let drawQueued = false, fitQueued = false;
    const queueDraw = () => { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; draw(); }); };
    const queueFit = () => { if (fitQueued) return; fitQueued = true; requestAnimationFrame(() => { fitQueued = false; fit(); try { window.FM1PlaceBrand?.(); } catch {} }); };
    // layout.js calls this after a bar or sidebar is hidden or shown (the room the machine has changed)
    window.FM1Rig = { fit: queueFit, draw: queueDraw };
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(queueDraw);
      ro.observe(deck); ro.observe(bay);
      for (const el of deck.children) if (el !== svg) ro.observe(el);
      for (const mod of mods.children) ro.observe(mod);
      const above = new ResizeObserver(queueFit);
      const hdr = document.querySelector("header.site"); if (hdr) above.observe(hdr);
      // (the toolbar is built by transport.js, possibly after this)
      let tries = 0;
      const waitBar = setInterval(() => {
        const bar = document.getElementById("fm1-transport");
        if (bar) above.observe(bar);
        if (bar || ++tries > 50) clearInterval(waitBar);
      }, 200);
    }
    if (window.MutationObserver) {
      // (the deck's own children and their visibility; the cables' own SVG is left out)
      new MutationObserver((list) => { if (list.some((m) => m.target !== svg && !svg.contains(m.target))) queueDraw(); })
        .observe(deck, { childList: true, attributes: true, attributeFilter: ["hidden", "class"] });
      for (const el of deck.children) if (el !== svg)
        new MutationObserver(queueDraw).observe(el, { attributes: true, attributeFilter: ["hidden", "class"] });
    }
  });
})();
