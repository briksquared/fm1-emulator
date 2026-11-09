// The patch bay. The FM-1 gets real I/O jacks along its bottom edge; below it sit two hardware-style
// modules — a MIDI keyboard/controller (notes in) and a Tape deck (feed audio in / record the output).
// Thick patch cables, VCV-style (a sag, a glossy highlight, metal plugs), run from the machine's jacks
// down to each module. The modules re-use the existing #midi-pop / #tape-pop control panels so all the
// real logic (sending MIDI, feeding audio, recording) is unchanged — this is the chrome around it.
(function () {
  "use strict";
  const PORTS = [
    { pop: "midi-pop", btn: "midi-btn", id: "midi", label: "MIDI",  sub: "notes in",          color: "var(--ui-cable-midi, #4aa8ff)", keys: true,  jx: 0.26 },
    { pop: "tape-pop", btn: "tape-btn", id: "tape", label: "TAPE",  sub: "sample in · rec out", color: "var(--amber)", keys: false, jx: 0.50 },
    { id: "scope", label: "SCOPE", sub: "output", color: "var(--ui-cable-scope, #49d49a)", scope: true, jx: 0.74 },
  ];
  const FM = () => window.FM1;
  const svgNS = "http://www.w3.org/2000/svg";
  const el = (n, cls) => { const e = document.createElement(n); if (cls) e.className = cls; return e; };

  function ready(fn) {
    const t = setInterval(() => {
      const deck = document.querySelector(".player .deck"), stage = document.querySelector(".stage");
      const ok = PORTS.every((p) => p.scope || (document.getElementById(p.pop) && document.getElementById(p.btn)));
      if (deck && stage && ok) { clearInterval(t); fn(deck, stage); }
    }, 120);
    setTimeout(() => clearInterval(t), 12000);
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

  // a socket graphic (metal ring + dark hole), used on the machine and on each module
  function jack(color) {
    const j = el("span", "pj"); j.style.setProperty("--jc", color);
    j.innerHTML = `<span class="pj-ring"></span><span class="pj-hole"></span>`;
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
    const GREEN = "#49d49a", DIM = "rgba(73,212,154,.35)", FAINT = "rgba(73,212,154,.14)";
    function draw() {
      requestAnimationFrame(draw);
      if (!wrap.isConnected || !wrap.offsetParent) return;   // skip when hidden/collapsed
      ensure();
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
          ctx.fillStyle = m > 225 ? "#ff9f4a" : GREEN;
          ctx.fillRect(x, h - bh, bw, bh);
        }
      } else { // level meter: peak amplitude from the time domain, with a falling peak-hold
        analyser.getByteTimeDomainData(tdata);
        let pk = 0; for (let i = 0; i < tdata.length; i++) { const v = Math.abs(tdata[i] - 128) / 128; if (v > pk) pk = v; }
        lvl += (pk - lvl) * 0.4;                       // smooth the bar
        peakHold = Math.max(peakHold - 0.012, lvl);     // and hold the peak, falling slowly
        const barH = h - 10, x0 = 6, barW = w - 12;
        ctx.fillStyle = "rgba(73,212,154,.08)"; ctx.fillRect(x0, 5, barW, barH);
        const grd = ctx.createLinearGradient(x0, 0, x0 + barW, 0);
        grd.addColorStop(0, "#39e0a0"); grd.addColorStop(0.75, "#9fe04a"); grd.addColorStop(0.9, "#ffcf33"); grd.addColorStop(1, "#ff5a3c");
        ctx.fillStyle = grd; ctx.fillRect(x0, 5, barW * Math.min(1, lvl), barH);
        const px = x0 + barW * Math.min(1, peakHold);
        ctx.fillStyle = peakHold > 0.98 ? "#ff5a3c" : "#eafff6"; ctx.fillRect(px - 1, 3, 2, barH + 4);
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
      /* I/O jacks mounted on the machine's bottom edge */
      .fm1-ports{position:absolute;left:0;right:0;bottom:-2px;display:flex;justify-content:center;gap:clamp(40px,22%,150px);
        pointer-events:none;z-index:4}
      .fm1-ports .port{display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:auto}
      .fm1-ports .port b{font:700 8.5px 'Space Mono',ui-monospace,monospace;letter-spacing:.09em;color:var(--ui-text2,#aeb4bd);text-transform:uppercase}
      /* a jack socket */
      .pj{position:relative;width:26px;height:26px;display:inline-block;border-radius:50%;
        background:radial-gradient(circle at 50% 38%,#4a4e56,#1b1d21 62%,#0c0d0f);
        box-shadow:inset 0 1px 1px rgba(255,255,255,.18),inset 0 -2px 3px rgba(0,0,0,.6),0 2px 4px rgba(0,0,0,.5)}
      .pj-ring{position:absolute;inset:3px;border-radius:50%;border:1.5px solid color-mix(in srgb,var(--jc,#888) 70%,#000);
        box-shadow:0 0 6px color-mix(in srgb,var(--jc,#888) 45%,transparent)}
      .pj-hole{position:absolute;inset:8px;border-radius:50%;background:radial-gradient(circle at 50% 40%,#17191d,#000);
        box-shadow:inset 0 1px 3px rgba(0,0,0,.9)}
      /* the bay under the machine */
      .fm1-bay{position:relative;margin:0 auto;width:100%;max-width:var(--panel-w,860px);z-index:3;padding-top:40px}
      .fm1-cables{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:5}
      .fm1-mods{display:flex;gap:12px;justify-content:center;align-items:flex-start;flex-wrap:nowrap}
      /* a hardware-style module */
      .fm1-mod{position:relative;min-width:150px;border-radius:12px;background:linear-gradient(var(--ui-mod-top,#1a1c20),var(--ui-mod-bot,#121317));
        border:1px solid var(--ui-line,#2c2f35);box-shadow:0 10px 24px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.05);overflow:hidden}
      .fm1-mod::before,.fm1-mod::after{content:"";position:absolute;top:8px;width:5px;height:5px;border-radius:50%;
        background:radial-gradient(circle at 40% 35%,#6a6e76,#2a2d33);box-shadow:inset 0 0 1px #000}
      .fm1-mod::before{left:8px}.fm1-mod::after{right:8px}
      .fm1-face{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer}
      .fm1-face .pj{flex:none}
      .fm1-face .lab{display:flex;flex-direction:column;line-height:1.15;flex:1}
      .fm1-face .lab b{font:800 13px 'Space Grotesk',-apple-system,sans-serif;letter-spacing:.02em;color:var(--ui-text,#f2f4f7)}
      .fm1-face .lab small{font:600 10px 'Space Mono',ui-monospace,monospace;color:var(--pc)}
      .fm1-face .chev{color:var(--ui-dim,#8c93a0);font-size:12px;transition:transform .16s}
      .fm1-mod.open .fm1-face{border-bottom:1px solid var(--ui-line,#26292f)}
      .fm1-mod.open .fm1-face .chev{transform:rotate(180deg);color:var(--pc)}
      .fm1-mod.open{border-color:color-mix(in srgb,var(--pc) 55%,#2c2f35)}
      .fm1-body{display:none;flex-direction:column;align-items:center;gap:8px;padding:10px}
      .fm1-mod.open .fm1-body{display:flex}
      .scope-wrap{width:260px;max-width:90vw;background:#070809;border:1px solid #16231c;border-radius:8px;padding:7px}
      .scope-cv{width:100%;height:150px;display:block}
      .scope-modes{display:flex;gap:4px;margin-bottom:6px}
      .scope-mode{flex:1;background:#0c1511;border:1px solid #16231c;color:#5f8f79;border-radius:5px;padding:3px 0;
        font:700 9px 'Space Mono',ui-monospace,monospace;letter-spacing:.1em;cursor:pointer;transition:all .12s}
      .scope-mode:hover{border-color:#2a5c47;color:#8fd4b6}
      .scope-mode.on{background:#49d49a;border-color:transparent;color:#041a12}
      .scope-fs{flex:0 0 auto;width:30px;background:#0c1511;border:1px solid #16231c;color:#5f8f79;border-radius:5px;
        font-size:12px;line-height:1;cursor:pointer;padding:3px 0}
      .scope-fs:hover{border-color:#2a5c47;color:#8fd4b6}
      .scope-wrap:fullscreen{display:flex;flex-direction:column;justify-content:center;gap:10px;padding:18px;background:#050607;box-sizing:border-box}
      .scope-wrap:fullscreen .scope-cv{width:100%;height:auto;flex:1;min-height:0;object-fit:contain}
      .scope-wrap:fullscreen .scope-modes{max-width:560px;margin:0 auto}
      /* in the right sidebar column the scope box is narrow (~256px) — let the WAVE/SPEC/LEVEL/XY tabs
         shrink to fit instead of spilling out of the box (flex:1 won't shrink below text without min-width:0) */
      .scope-box .scope-wrap{width:100%!important;max-width:none!important;padding:6px}
      .scope-box .scope-modes{gap:3px}
      .scope-box .scope-mode{min-width:0;padding:3px 1px;letter-spacing:.03em;overflow:hidden;text-overflow:ellipsis}
      .scope-box .scope-fs{width:22px;flex:0 0 22px}
      /* dock the existing control panels open, inline */
      #midi-pop.fm1-inline,#tape-pop.fm1-inline{position:static!important;display:flex!important;transform:none!important;
        width:244px!important;max-width:86vw!important;max-height:none!important;box-shadow:none!important;margin:0!important;border:0!important;background:transparent!important;padding:0!important}
      #tape-pop.fm1-inline{width:244px!important}
      /* keyboard */
      .kbd{display:flex;flex-direction:column;gap:5px;width:232px;max-width:86vw;border-radius:8px;background:var(--ui-pop,#0c0d0f);border:1px solid var(--ui-line,#232428);padding:6px}
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
      /* user-driven machine size control, up in the header */
      .fm1-size{display:flex;align-items:center;gap:7px;flex:none;margin-left:auto}
      .fm1-size.in-bar{margin-left:12px}
      .fm1-size label{font:700 9px 'Space Mono',ui-monospace,monospace;letter-spacing:.12em;color:var(--ui-dim,#8c93a0);text-transform:uppercase}
      .fm1-size input[type=range]{width:118px;accent-color:var(--amber,#49d49a);cursor:ew-resize;margin:0}
      .fm1-size .val{font:700 10px 'Space Mono',ui-monospace,monospace;color:var(--ui-text2,#cfd4da);min-width:38px;text-align:right}
      .fm1-size button{flex:none;background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text2,#cfd4da);border-radius:6px;padding:3px 9px;
        font:700 9.5px 'Space Grotesk',-apple-system,sans-serif;letter-spacing:.04em;cursor:pointer}
      .fm1-size button:hover{border-color:var(--amber);color:var(--ui-text,#fff)}
      .fm1-size button.on{background:var(--amber);border-color:transparent;color:var(--ui-on-accent,#180a02)}
      /* when the machine is sized by hand it can be wider than the row: keep it on the first line, top-left
         anchored (so the panel + screen stay visible at the top), and let the page scroll to the rest
         instead of wrapping the whole machine below the tall sidebar out of sight */
      .player.fm1-sized{flex-wrap:nowrap;align-items:flex-start}
      .player.fm1-sized > .side{flex:0 0 auto}
      /* when hand-sized, let the FM-1 PANEL itself fill the width instead of being capped by window
         height (which leaves dead space around the machine) — the page scrolls for the extra height */
      .player.fm1-sized .stage{padding:8px}
      .player.fm1-sized canvas{max-width:none}
      @media (max-width:620px){ .fm1-mods{gap:12px} .fm1-mod{min-width:132px} .fm1-size input[type=range]{width:84px} }`;
    document.head.appendChild(css);

    // ---- user size override: the player sets the machine size (persisted), overriding auto-fit ----
    let userZoom = null;
    try { const s = localStorage.getItem("fm1_rig_zoom"); if (s != null) { const v = parseFloat(s); if (v >= 0.5 && v <= 3) userZoom = v; } } catch {}

    // a small Flash button up in the header next to the firmware name: flashes the current firmware
    const flashBtn = el("button", "fm1-flash-btn"); flashBtn.type = "button";
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

    // size control: drag to set the machine size yourself; "Fit" returns to auto-fit. Persisted.
    const sizeWrap = el("div", "fm1-size");
    const sizeLab = el("label"); sizeLab.textContent = "Size";
    const sizeRange = el("input"); sizeRange.type = "range"; sizeRange.min = "50"; sizeRange.max = "300"; sizeRange.step = "5";
    sizeRange.title = "Machine size";
    const sizeVal = el("span", "val");
    const sizeFit = el("button"); sizeFit.type = "button"; sizeFit.textContent = "Fit"; sizeFit.title = "Auto-fit the machine to the window";
    sizeWrap.append(sizeLab, sizeRange, sizeVal, sizeFit);
    // The size control sits in the top row of the site header when that row has room for it, and
    // otherwise in the transport row below it: it never takes a row of its own, and both rows stay
    // in view (the transport bar is sticky) so it can't scroll off with a big machine.
    const topBar = document.querySelector("header.site .wrap");
    (topBar || head || deck).appendChild(sizeWrap);
    function placeSize() {
      const bar = document.getElementById("fm1-transport");
      if (!topBar || !bar) return;
      if (sizeWrap.parentNode !== topBar) topBar.appendChild(sizeWrap);
      sizeWrap.classList.remove("in-bar");
      const first = topBar.firstElementChild;
      const wraps = first && sizeWrap.getBoundingClientRect().top > first.getBoundingClientRect().bottom - 4;
      if (wraps) { sizeWrap.classList.add("in-bar"); bar.appendChild(sizeWrap); }
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

    // 1) I/O jacks on the machine's bottom edge
    const ports = el("div", "fm1-ports");
    for (const p of PORTS) {
      const port = el("div", "port"); port.dataset.id = p.id; port.style.setProperty("--pc", p.color);
      const mj = jack(p.color); mj.classList.add("mjack"); mj.title = p.label + " — " + p.sub;
      port.append(mj);   // jack only; no label text under it (the cable drops straight through here)
      ports.appendChild(port);
    }
    stage.appendChild(ports);

    // 2) the modules below
    const bay = el("div", "fm1-bay");
    const svg = document.createElementNS(svgNS, "svg"); svg.setAttribute("class", "fm1-cables");
    const mods = el("div", "fm1-mods"); bay.appendChild(mods);

    const built = [];
    for (const p of PORTS) {
      const mod = el("div", "fm1-mod"); mod.style.setProperty("--pc", p.color); mod.dataset.id = p.id;
      const face = el("div", "fm1-face");
      const dj = jack(p.color); dj.classList.add("djack");
      const lab = el("div", "lab"); lab.innerHTML = `<b>${p.label}</b><small>${p.sub}</small>`;
      const chev = el("span", "chev"); chev.textContent = "▾";
      face.append(dj, lab, chev);
      const body = el("div", "fm1-body");
      if (p.scope) {
        body.appendChild(buildScope());
      } else {
        const pop = document.getElementById(p.pop), btn = document.getElementById(p.btn);
        if (p.keys) body.appendChild(keyboard());
        if (pop) { pop.classList.add("fm1-inline", "open"); body.appendChild(pop); }
        if (btn) btn.style.display = "none";
      }
      mod.classList.add("open");                    // MIDI, Tape and Scope all start expanded
      mod.append(face, body);
      face.onclick = () => { mod.classList.toggle("open"); requestAnimationFrame(draw); };
      mods.appendChild(mod);
      built.push({ p, mod, mjack: ports.querySelector(`.port[data-id="${p.id}"] .mjack`), djack: dj });
    }
    stage.insertAdjacentElement("afterend", bay);
    deck.appendChild(svg);   // the cables overlay the whole machine column, drawn in deck coordinates

    let rigZoom = 1, fitting = false;   // the whole rig is laid out at a fixed width and zoomed to fit

    // 3) the cables — thick, sagging, with plugs and a glossy highlight
    // machine jack (x1,y1) is ABOVE the module jack (x2,y2): drop out of the top jack, bow across the
    // gap, and come back UP into the module jack — the belly stays between them, never over the keys.
    function cablePath(x1, y1, x2, y2) {
      const dy = Math.max(1, y2 - y1);
      const slack = Math.min(40, 14 + Math.abs(x2 - x1) * 0.25);   // how far it rises into the lower jack
      const c1y = y1 + dy * 0.42;                                   // first control: straight below the top jack
      const c2y = y2 - slack;                                       // second control: above the module jack
      return `M ${x1} ${y1} C ${x1} ${c1y}, ${x2} ${c2y}, ${x2} ${y2}`;
    }
    function plug(x, y, color) {
      const g = document.createElementNS(svgNS, "g");
      const barrel = document.createElementNS(svgNS, "circle");
      barrel.setAttribute("cx", x); barrel.setAttribute("cy", y); barrel.setAttribute("r", "6");
      barrel.setAttribute("fill", "#16181c"); barrel.style.stroke = color; barrel.setAttribute("stroke-width", "2.5");
      const tip = document.createElementNS(svgNS, "circle");
      tip.setAttribute("cx", x); tip.setAttribute("cy", y); tip.setAttribute("r", "2.4"); tip.style.fill = color;
      g.append(barrel, tip); return g;
    }
    function draw() {
      // no viewBox: the SVG fills the deck via CSS inset:0, so 1 user unit == 1 CSS pixel and the
      // coordinates below (deck-relative pixels) can never be stretched if the deck height changes.
      const dr = deck.getBoundingClientRect();
      svg.innerHTML = "";
      // getBoundingClientRect is in on-screen (zoomed) px; divide by the zoom to get the SVG's own
      // user units (it has no viewBox), so plugs land on the jacks at any scale.
      const c = (r) => [(r.left - dr.left + r.width / 2) / rigZoom, (r.top - dr.top + r.height / 2) / rigZoom];
      for (const { p, mjack, djack } of built) {
        const [x1, y1] = c(mjack.getBoundingClientRect());
        const [x2, y2] = c(djack.getBoundingClientRect());
        const d = cablePath(x1, y1 + 4, x2, y2 - 4);
        const mk = (w, stroke, op, dash) => { const path = document.createElementNS(svgNS, "path"); path.setAttribute("d", d); path.setAttribute("fill", "none"); path.style.stroke = stroke; path.setAttribute("stroke-width", w); path.setAttribute("stroke-linecap", "round"); path.setAttribute("opacity", op); if (dash) path.setAttribute("transform", "translate(0,-1.3)"); return path; };
        svg.appendChild(mk(9, "rgba(0,0,0,.45)", "1"));                 // drop shadow
        svg.appendChild(mk(6.5, p.color, "1"));                        // the cable
        svg.appendChild(mk(2, "rgba(255,255,255,.35)", ".9", true));   // glossy highlight
        svg.appendChild(plug(x1, y1, p.color));
        svg.appendChild(plug(x2, y2, p.color));
      }
    }
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
    // redraw when devices change height (panels update, recordings, etc.)
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => draw()); ro.observe(bay); for (const { mod } of built) ro.observe(mod); }
  });
})();
