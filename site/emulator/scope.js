// Scope: a live oscilloscope and peak/clip meter for the FM-1's output. Taps
// FM1.outNode() with an AnalyserNode (a passive branch — it is not connected to
// the destination, so it never doubles the sound). For an FM synth, seeing the
// waveform and catching clipping is genuinely useful.
(function () {
  "use strict";
  const FM = () => window.FM1;

  // ---- pure DSP, unit-tested from app/test-scope.mjs ----
  function peakOf(buf) {
    let p = 0;
    for (let i = 0; i < buf.length; i++) { const a = buf[i] < 0 ? -buf[i] : buf[i]; if (a > p) p = a; }
    return p;
  }
  function clipCount(buf, thresh) {
    const t = thresh == null ? 0.999 : thresh;
    let n = 0;
    for (let i = 0; i < buf.length; i++) { const a = buf[i] < 0 ? -buf[i] : buf[i]; if (a >= t) n++; }
    return n;
  }
  function dbfs(peak) {
    if (!(peak > 0)) return -Infinity;
    return 20 * Math.log10(Math.min(1, peak));
  }
  // Map dBFS to a 0..1 meter fill over a -60..0 dB range.
  function meterFill(peak) {
    const db = dbfs(peak);
    if (db === -Infinity) return 0;
    return Math.max(0, Math.min(1, (db + 60) / 60));
  }

  // Group linear FFT bins into log-spaced bars (40 Hz..18 kHz), averaging the
  // bins in each band and normalising 0..1. Log spacing is what makes an FM
  // spectrum readable — otherwise the low octaves are crushed into a few bars.
  function logBars(freq, nBars, sampleRate, fftSize) {
    const binHz = sampleRate / fftSize;
    const fMin = 40, fMax = Math.min(18000, sampleRate / 2);
    const bars = new Array(nBars).fill(0);
    for (let b = 0; b < nBars; b++) {
      const f0 = fMin * Math.pow(fMax / fMin, b / nBars);
      const f1 = fMin * Math.pow(fMax / fMin, (b + 1) / nBars);
      let i0 = Math.max(1, Math.floor(f0 / binHz));
      let i1 = Math.min(freq.length, Math.max(i0 + 1, Math.ceil(f1 / binHz)));
      let sum = 0, n = 0;
      for (let i = i0; i < i1; i++) { sum += freq[i]; n++; }
      bars[b] = n ? (sum / n) / 255 : 0;
    }
    return bars;
  }

  // ---- analyser tap (re-attaches if the audio node is rebuilt) ----
  // A channel splitter feeds two analysers, so L and R are genuinely separate —
  // an FM-1 with stereo effects really does differ across channels. All of it
  // is a passive branch off the output; nothing connects to the destination.
  let aL = null, aR = null, splitter = null, tappedNode = null, bufL = null, bufR = null, freqL = null;
  function ensureAnalyser() {
    const fm = FM();
    const ac = fm && fm.context && fm.context();
    const out = fm && fm.outNode && fm.outNode();
    if (!ac || !out) return null;
    if (aL && tappedNode === out) return aL;
    try {
      splitter = ac.createChannelSplitter(2);
      aL = ac.createAnalyser(); aR = ac.createAnalyser();
      aL.fftSize = aR.fftSize = 2048;
      aL.smoothingTimeConstant = aR.smoothingTimeConstant = 0;
      out.connect(splitter);
      splitter.connect(aL, 0);
      splitter.connect(aR, 1);
      tappedNode = out;
      bufL = new Float32Array(aL.fftSize);
      bufR = new Float32Array(aR.fftSize);
      freqL = new Uint8Array(aL.frequencyBinCount);
      return aL;
    } catch (e) { console.warn("scope: could not attach analyser", e); aL = null; return null; }
  }
  function sample() {
    if (!ensureAnalyser()) return null;
    aL.getFloatTimeDomainData(bufL);
    aR.getFloatTimeDomainData(bufR);
    const pL = peakOf(bufL), pR = peakOf(bufR);
    return { bufL, bufR, peakL: pL, peakR: pR, peak: Math.max(pL, pR),
      clipped: clipCount(bufL) > 0 || clipCount(bufR) > 0 };
  }

  function spectrum() {
    if (!ensureAnalyser()) return null;
    aL.getByteFrequencyData(freqL);
    return freqL;
  }

  // A safe, dated filename for a saved scope image (pure, unit-tested).
  function scopeFilename(firmware, mode, date) {
    const d = date || new Date();
    const stamp = d.toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return ((firmware || "fm1") + "-scope-" + (mode || "wave") + "-" + stamp).replace(/[^A-Za-z0-9._-]/g, "_") + ".png";
  }

  window.FM1Scope = { peakOf, clipCount, dbfs, meterFill, logBars, scopeFilename, ensureAnalyser, sample, spectrum };

  // ---- UI ----
  // trace colours follow the interface accent (ui-theme.js); read at most once a second
  let inkAt = 0, inkNow = { hi: "#fa7a2a", dim: "#7a3a12" };
  function traceInk() {
    const now = performance.now();
    if (now - inkAt < 1000) return inkNow;
    inkAt = now;
    const css = getComputedStyle(document.documentElement);
    const hi = (css.getPropertyValue("--amber-ink") || css.getPropertyValue("--amber")).trim();
    if (/^#[0-9a-f]{6}$/i.test(hi)) {
      const n = parseInt(hi.slice(1), 16), half = (v) => Math.round(v * 0.45).toString(16).padStart(2, "0");
      inkNow = { hi, dim: "#" + half(n >> 16) + half((n >> 8) & 255) + half(n & 255) };
    }
    return inkNow;
  }
  function ready(fn) {
    const t = setInterval(() => {
      const nav = document.querySelector(".sitenav") || document.querySelector("header.site .wrap");
      if (nav && window.FM1) { clearInterval(t); fn(nav); }
    }, 120);
    setTimeout(() => clearInterval(t), 9000);
  }
  ready((nav) => {
    const css = document.createElement("style");
    css.textContent = `
      #scope-pop{position:fixed;z-index:9997;width:300px;max-width:92vw;background:#0c0d0f;border:1px solid #232428;
        border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.6);padding:12px;display:none;flex-direction:column;gap:9px;color:#e9edf2}
      #scope-pop.open{display:flex}
      #scope-pop canvas{width:100%;height:110px;background:#07080a;border:1px solid #1c1d21;border-radius:8px;display:block}
      #scope-pop .meters{display:flex;flex-direction:column;gap:5px}
      #scope-pop .mrow{display:flex;align-items:center;gap:7px;font:600 10px 'Space Mono',monospace;color:#8c93a0}
      #scope-pop .mrow .track{flex:1;height:8px;background:#141518;border-radius:4px;overflow:hidden;position:relative}
      #scope-pop .mrow .fill{height:100%;width:0;background:linear-gradient(90deg,#4cc96a,#e2d23b 72%,#e2543b);border-radius:4px}
      #scope-pop .mrow .db{min-width:4.2em;text-align:right}
      #scope-pop .clip{margin-left:auto;font:600 10px 'Space Mono',monospace;color:#3a3d44;border:1px solid #2a2c31;border-radius:5px;padding:2px 7px}
      #scope-pop .clip.on{color:#fff;background:#c0392b;border-color:#e2543b}
      #scope-pop .smode{display:flex;gap:6px}
      #scope-pop .smode button{flex:1;font:600 11px 'Space Grotesk',sans-serif;padding:4px 0;
        background:#141518;border:1px solid #2a2c31;color:#aeb4bd;border-radius:7px;cursor:pointer}
      #scope-pop .smode button.on{color:var(--amber-ink,var(--amber));border-color:color-mix(in srgb,var(--amber) 40%,#000);background:color-mix(in srgb,var(--amber) 12%,#000)}
      #scope-pop #scope-freeze.on{color:#7fb2ff;border-color:#2a4a6a;background:#101722}`;
    document.head.appendChild(css);

    const btn = document.createElement("a");
    btn.href = "#"; btn.id = "scope-btn"; btn.className = "sitelink"; btn.textContent = "Scope";
    btn.title = "Live output oscilloscope and peak meter";

    const pop = document.createElement("div");
    pop.id = "scope-pop";
    pop.innerHTML =
      `<div class="smode"><button type="button" data-m="wave" class="on">Wave</button>` +
      `<button type="button" data-m="spectrum">Spectrum</button>` +
      `<button type="button" id="scope-freeze" title="Hold the display to study it">Freeze</button>` +
      `<button type="button" id="scope-save" title="Save this view as a PNG">Save</button></div>` +
      `<canvas id="scope-cv" width="276" height="110"></canvas>` +
      `<div class="meters">` +
      `<div class="mrow"><span>L</span><span class="track"><span class="fill" id="scope-l"></span></span><span class="db" id="scope-ldb">-∞</span></div>` +
      `<div class="mrow"><span>R</span><span class="track"><span class="fill" id="scope-r"></span></span><span class="db" id="scope-rdb">-∞</span>` +
      `<span class="clip" id="scope-clip">CLIP</span></div></div>`;
    document.body.appendChild(pop);

    const cv = pop.querySelector("#scope-cv");
    const cx = cv.getContext("2d");
    const lFill = pop.querySelector("#scope-l"), rFill = pop.querySelector("#scope-r");
    const lDb = pop.querySelector("#scope-ldb"), rDb = pop.querySelector("#scope-rdb");
    const clipEl = pop.querySelector("#scope-clip");
    let open = false, raf = 0, clipUntil = 0, lHold = 0, rHold = 0, mode = "wave", frozen = false;
    const barHold = [];
    pop.querySelectorAll(".smode button[data-m]").forEach((b) => {
      b.onclick = () => {
        mode = b.dataset.m;
        pop.querySelectorAll(".smode button[data-m]").forEach((x) => x.classList.toggle("on", x === b));
        barHold.length = 0;
        if (frozen) { frozen = false; freezeBtn.classList.remove("on"); freezeBtn.textContent = "Freeze"; }
        drawFrame();
      };
    });
    const freezeBtn = pop.querySelector("#scope-freeze");
    freezeBtn.onclick = () => {
      frozen = !frozen;
      freezeBtn.classList.toggle("on", frozen);
      freezeBtn.textContent = frozen ? "Live" : "Freeze";
      if (!frozen) loop();              // resume
    };
    pop.querySelector("#scope-save").onclick = () => {
      cv.toBlob((blob) => {
        if (!blob) return;
        const fm = FM();
        const rf = (fm && fm.runningFirmware && fm.runningFirmware()) || {};
        const name = scopeFilename(rf.name, mode, new Date());
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }, "image/png");
    };

    function place() {
      const r = (window.FM1PopAnchor && window.FM1PopAnchor(btn)) || btn.getBoundingClientRect();
      pop.style.top = Math.round(r.bottom + 8) + "px";
      pop.style.left = Math.round(Math.min(r.left, window.innerWidth - 312)) + "px";
    }

    // One frame of drawing, callable directly (so it is verifiable without rAF).
    function drawFrame() {
      if (frozen) return { frozen: true };   // hold the last image for study/save
      const fm = FM();
      const a = ensureAnalyser();
      cx.clearRect(0, 0, cv.width, cv.height);
      // centre line
      cx.strokeStyle = "#1c1d21"; cx.lineWidth = 1;
      cx.beginPath(); cx.moveTo(0, cv.height / 2); cx.lineTo(cv.width, cv.height / 2); cx.stroke();
      if (!a || !(fm && fm.running && fm.running())) {
        cx.fillStyle = "#555"; cx.font = "11px monospace";
        cx.fillText(fm && fm.running && fm.running() ? "no signal" : "press Start", 10, cv.height / 2 - 6);
        lFill.style.width = rFill.style.width = "0"; lDb.textContent = rDb.textContent = "-∞";
        return { peak: 0 };
      }
      const s = sample();
      const ink = traceInk();
      if (mode === "spectrum") {
        const freq = spectrum();
        const n = 48;
        const bars = logBars(freq, n, (FM().context() || {}).sampleRate || 44100, aL.fftSize);
        const bw = cv.width / n;
        for (let b = 0; b < n; b++) {
          barHold[b] = Math.max(bars[b], (barHold[b] || 0) * 0.86);   // slow fall
          const h = Math.max(0, Math.min(cv.height - 2, bars[b] * (cv.height - 4)));
          const hold = Math.max(0, Math.min(cv.height - 2, barHold[b] * (cv.height - 4)));
          cx.fillStyle = ink.dim;
          cx.fillRect(b * bw + 0.5, cv.height - hold, bw - 1, hold);  // peak-hold ghost
          cx.fillStyle = ink.hi;
          cx.fillRect(b * bw + 0.5, cv.height - h, bw - 1, h);
        }
      } else {
        // waveform: R dim behind, L bright in front, so stereo width is visible.
        const trace = (buf, style, w) => {
          cx.strokeStyle = style; cx.lineWidth = w; cx.beginPath();
          const step = Math.max(1, Math.floor(buf.length / cv.width));
          for (let x = 0, i = 0; x < cv.width; x++, i += step) {
            const y = cv.height / 2 - buf[i] * (cv.height / 2 - 2);
            x === 0 ? cx.moveTo(x, y) : cx.lineTo(x, y);
          }
          cx.stroke();
        };
        trace(s.bufR, ink.dim, 1);
        trace(s.bufL, ink.hi, 1.5);
      }
      // meters: each channel with its own slow peak-hold fall-back.
      lHold = Math.max(s.peakL, lHold * 0.92); rHold = Math.max(s.peakR, rHold * 0.92);
      lFill.style.width = (meterFill(lHold) * 100).toFixed(1) + "%";
      rFill.style.width = (meterFill(rHold) * 100).toFixed(1) + "%";
      const fmt = (p) => { const db = dbfs(p); return db === -Infinity ? "-∞" : db.toFixed(1); };
      lDb.textContent = fmt(lHold); rDb.textContent = fmt(rHold);
      const nowMs = performance.now ? performance.now() : Date.now();
      if (s.clipped) clipUntil = nowMs + 1200;
      clipEl.classList.toggle("on", nowMs < clipUntil);
      return { peak: s.peak, peakL: s.peakL, peakR: s.peakR };
    }

    function loop() { if (!open || frozen) return; drawFrame(); raf = requestAnimationFrame(loop); }
    function openPop() { open = true; pop.classList.add("open"); place(); loop(); }
    function closePop() { open = false; pop.classList.remove("open"); cancelAnimationFrame(raf); }

    btn.onclick = (e) => { e.preventDefault(); open ? closePop() : openPop(); };
    document.addEventListener("click", (e) => { if (open && !pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closePop(); });
    window.addEventListener("resize", () => { if (open) place(); });
    nav.insertBefore(btn, nav.firstChild ? nav.firstChild.nextSibling : null);

    // Expose the single-frame draw for verification.
    window.FM1Scope._drawFrame = drawFrame;
    window.FM1Scope._open = openPop;
  });
})();
