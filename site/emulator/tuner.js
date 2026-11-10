// Tuner: detect the pitch of the FM-1's output and show the note and how many
// cents sharp/flat. Autocorrelation on the time-domain signal (robust against
// the strong harmonics of an FM tone, where a bare FFT peak can lock onto an
// overtone). Reuses FM1Scope's analyser tap, so no second audio branch.
(function () {
  "use strict";
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  // ---- pure DSP, unit-tested from app/test-tuner.mjs ----
  function noteFromFreq(hz, a4) {
    const ref = a4 || 440;
    if (!(hz > 0)) return null;
    const midiFloat = 69 + 12 * Math.log2(hz / ref);
    const midi = Math.round(midiFloat);
    const cents = Math.round((midiFloat - midi) * 100);
    return { name: NAMES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1, cents, midi, hz };
  }
  // Returns the fundamental in Hz, or -1 if the signal is too quiet / unclear.
  function autocorrelate(buf, sampleRate) {
    const SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.004) return -1;                        // essentially silent
    // Trim near-silent ends so the correlation locks onto the steady part.
    let r1 = 0, r2 = SIZE - 1;
    const thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    const b = buf.slice(r1, r2);
    const n = b.length;
    if (n < 16) return -1;
    const c = new Array(n).fill(0);
    for (let lag = 0; lag < n; lag++) { let s = 0; for (let i = 0; i < n - lag; i++) s += b[i] * b[i + lag]; c[lag] = s; }
    let d = 0; while (d < n - 1 && c[d] > c[d + 1]) d++;   // skip the lag-0 descent
    let maxval = -1, maxpos = -1;
    for (let i = d; i < n; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    if (maxpos <= 0) return -1;
    // Parabolic interpolation around the peak for sub-sample precision.
    let T0 = maxpos;
    const x1 = c[T0 - 1] || 0, x2 = c[T0], x3 = c[T0 + 1] || 0;
    const a = (x1 + x3 - 2 * x2) / 2, bb = (x3 - x1) / 2;
    if (a) T0 = T0 - bb / (2 * a);
    if (T0 <= 0) return -1;
    const hz = sampleRate / T0;
    return (hz >= 25 && hz <= 5000) ? hz : -1;         // musical range only
  }

  window.FM1Tuner = { noteFromFreq, autocorrelate };

  function ready(fn) {
    const t = setInterval(() => {
      const nav = document.querySelector(".sitenav") || document.querySelector("header.site .wrap");
      if (nav && window.FM1) { clearInterval(t); fn(nav); }
    }, 150);
    setTimeout(() => clearInterval(t), 9000);
  }
  ready((nav) => {
    const css = document.createElement("style");
    css.textContent = `
      #tuner-pop{position:fixed;z-index:9997;width:240px;max-width:92vw;background:#0c0d0f;border:1px solid #232428;
        border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.6);padding:14px;display:none;flex-direction:column;gap:8px;color:#e9edf2;
        font:13px 'Space Grotesk',sans-serif;text-align:center}
      #tuner-pop.open{display:flex}
      #tuner-pop .note{font:700 46px 'Space Grotesk',sans-serif;line-height:1;letter-spacing:-1px}
      #tuner-pop .note .oct{font-size:20px;color:#8c93a0;vertical-align:super;margin-left:2px}
      #tuner-pop .hz{font:600 11px 'Space Mono',monospace;color:#8c93a0}
      #tuner-pop .bar{position:relative;height:12px;background:#141518;border-radius:6px;margin:4px 2px 0}
      #tuner-pop .bar .mid{position:absolute;left:50%;top:-3px;width:1px;height:18px;background:#3a3d44;transform:translateX(-.5px)}
      #tuner-pop .bar .nee{position:absolute;top:0;width:4px;height:12px;border-radius:2px;background:var(--amber-ink,var(--amber));left:50%;transform:translateX(-2px);transition:left .07s,background .07s}
      #tuner-pop .bar.lit .nee{background:#4cc96a}
      #tuner-pop .cents{font:600 10px 'Space Mono',monospace;color:#8c93a0;display:flex;justify-content:space-between}`;
    document.head.appendChild(css);

    const btn = document.createElement("a");
    btn.href = "#"; btn.id = "tuner-btn"; btn.className = "sitelink"; btn.textContent = "Tuner";
    btn.title = "Detect the output pitch (note + cents)";

    const pop = document.createElement("div");
    pop.id = "tuner-pop";
    pop.innerHTML =
      `<div class="note" id="tn-note">—</div>` +
      `<div class="hz" id="tn-hz">press Start</div>` +
      `<div class="bar" id="tn-bar"><span class="mid"></span><span class="nee" id="tn-nee"></span></div>` +
      `<div class="cents"><span>-50¢</span><span>in tune</span><span>+50¢</span></div>` +
      `<div class="a4row" style="display:flex;align-items:center;gap:6px;justify-content:center;margin-top:2px">` +
      `<label for="tn-a4" style="font:600 10px 'Space Mono',monospace;color:#8c93a0">A4</label>` +
      `<input id="tn-a4" type="number" min="415" max="466" step="1" value="440" ` +
      `style="width:64px;background:#17181b;border:1px solid #2a2c31;color:#e9edf2;border-radius:6px;padding:3px 6px;font:12px 'Space Mono',monospace">` +
      `<button type="button" id="tn-a4-reset" style="font-size:10.5px;padding:3px 7px;background:#17181b;border:1px solid #2a2c31;color:#e9edf2;border-radius:6px;cursor:pointer">440</button></div>`;
    document.body.appendChild(pop);
    const noteEl = pop.querySelector("#tn-note"), hzEl = pop.querySelector("#tn-hz");
    const barEl = pop.querySelector("#tn-bar"), neeEl = pop.querySelector("#tn-nee");
    const a4El = pop.querySelector("#tn-a4");

    let open = false, raf = 0, smoothHz = 0, a4 = 440;
    try {
      const saved = +localStorage.getItem("fm1.tuner.a4");
      if (saved >= 415 && saved <= 466) { a4 = saved; a4El.value = String(a4); }
    } catch { /* ignore */ }
    function setA4(v) {
      a4 = Math.max(415, Math.min(466, v | 0));
      a4El.value = String(a4);
      try { localStorage.setItem("fm1.tuner.a4", String(a4)); } catch { /* ignore */ }
      return a4;
    }
    a4El.onchange = () => setA4(+a4El.value);
    pop.querySelector("#tn-a4-reset").onclick = () => setA4(440);
    function place() { const r = (window.FM1PopAnchor && window.FM1PopAnchor(btn)) || btn.getBoundingClientRect(); pop.style.top = (r.bottom + 8) + "px"; pop.style.left = Math.round(Math.min(r.left, window.innerWidth - 252)) + "px"; }

    function frame() {
      const fm = window.FM1;
      const running = fm && fm.running && fm.running();
      const scope = window.FM1Scope;
      const ctx = fm && fm.context && fm.context();
      const s = running && scope && scope.sample && scope.sample();
      if (!s || !s.bufL || !ctx) {
        noteEl.textContent = "—"; hzEl.textContent = running ? "listening…" : "press Start";
        neeEl.style.left = "50%"; barEl.classList.remove("lit");
        return { hz: -1 };
      }
      const hz = autocorrelate(s.bufL, ctx.sampleRate);
      if (hz < 0) { hzEl.textContent = "—"; barEl.classList.remove("lit"); return { hz: -1 }; }
      smoothHz = smoothHz ? smoothHz * 0.7 + hz * 0.3 : hz;   // steady the reading
      const note = noteFromFreq(smoothHz, a4);
      noteEl.innerHTML = `${note.name}<span class="oct">${note.octave}</span>`;
      hzEl.textContent = smoothHz.toFixed(1) + " Hz · A4=" + a4;
      neeEl.style.left = (50 + Math.max(-50, Math.min(50, note.cents)) ) + "%";
      barEl.classList.toggle("lit", Math.abs(note.cents) <= 5);
      return { hz: smoothHz, note, a4 };
    }
    function loop() { if (!open) return; frame(); raf = requestAnimationFrame(loop); }
    function openPop() { open = true; smoothHz = 0; pop.classList.add("open"); place(); loop(); }
    function closePop() { open = false; pop.classList.remove("open"); cancelAnimationFrame(raf); }

    btn.onclick = (e) => { e.preventDefault(); open ? closePop() : openPop(); };
    document.addEventListener("click", (e) => { if (open && !pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closePop(); });
    window.addEventListener("resize", () => { if (open) place(); });
    nav.insertBefore(btn, nav.firstChild ? nav.firstChild.nextSibling : null);

    window.FM1Tuner._frame = frame;
    window.FM1Tuner._open = openPop;
  });
})();
