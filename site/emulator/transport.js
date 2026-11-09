// Global transport for the FM-1 emulator: shared tempo, metronome click, and MIDI clock.
// Recorder + MIDI Player subscribe so BPM / clock stay in sync across panels.
// Exposes window.FM1Transport. Pure DOM + Web Audio; mounts a sticky bar under the site header.
(function () {
  "use strict";
  const FM = () => window.FM1;
  const LS = "fm1.transport.v1";

  let bpm = 120, beatsPerBar = 4, metroOn = false, clockOn = false;
  try {
    const s = JSON.parse(localStorage.getItem(LS) || "{}");
    if (s.bpm) bpm = Math.max(40, Math.min(240, +s.bpm));
    if (s.beatsPerBar) beatsPerBar = Math.max(2, Math.min(8, +s.beatsPerBar));
  } catch {}

  const listeners = new Set();
  function emit(type, detail) {
    const d = Object.assign({ bpm, beatsPerBar, metroOn, clockOn }, detail || {});
    listeners.forEach((fn) => { try { fn(type, d); } catch (e) { console.error("transport listener failed", e); } });
    try { window.dispatchEvent(new CustomEvent("fm1-transport", { detail: { type, ...d } })); } catch {}
  }
  function persist() {
    try { localStorage.setItem(LS, JSON.stringify({ bpm, beatsPerBar })); } catch {}
  }

  // ---- metronome (lookahead scheduler on the FM-1 AudioContext) ----
  let clickTimer = null, clickRunning = false;
  function clickTone(when, accent) {
    const ac = FM() && FM().context && FM().context(); if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "square"; o.frequency.value = accent ? 1800 : 1100;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(accent ? 0.45 : 0.28, when + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    o.connect(g); g.connect(ac.destination);
    o.start(when); o.stop(when + 0.065);
  }
  function stopMetro() {
    clickRunning = false;
    if (clickTimer) { clearInterval(clickTimer); clickTimer = null; }
  }
  function startMetro() {
    stopMetro();
    const ac = FM() && FM().context && FM().context();
    if (!ac || !metroOn) return;
    clickRunning = true;
    let beat = 0, nextTime = ac.currentTime + 0.08;
    clickTimer = setInterval(() => {
      if (!clickRunning || !metroOn) { stopMetro(); return; }
      const c = FM() && FM().context && FM().context(); if (!c) { stopMetro(); return; }
      while (nextTime < c.currentTime + 0.25) {
        clickTone(nextTime, (beat % beatsPerBar) === 0);
        beat++; nextTime += 60 / bpm;
      }
    }, 25);
  }

  // ---- MIDI clock to the emulated device (24 PPQN) ----
  let clockTimer = null, clockRunning = false;
  function stopClock() {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    if (clockRunning && FM()) { try { FM().midi([0xfc]); } catch {} clockRunning = false; }
  }
  function startClock() {
    if (!FM() || (FM().running && !FM().running())) return false;
    if (!clockRunning) { try { FM().midi([0xfa]); } catch {} clockRunning = true; }
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      if (!clockOn) return;
      if (FM() && FM().running && FM().running()) try { FM().midi([0xf8]); } catch {}
    }, 60000 / bpm / 24);
    return true;
  }

  function setBpm(v) {
    bpm = Math.max(40, Math.min(240, Math.round(+v) || 120));
    persist();
    if (metroOn) startMetro();
    if (clockOn) startClock();
    emit("bpm");
    syncUi();
  }
  function setBeatsPerBar(v) {
    beatsPerBar = Math.max(2, Math.min(8, +v || 4));
    persist();
    if (metroOn) startMetro();
    emit("meter");
    syncUi();
  }
  function setMetro(on) {
    metroOn = !!on;
    if (metroOn) {
      if (!FM() || (FM().running && !FM().running())) { metroOn = false; emit("metro"); syncUi(); return false; }
      startMetro();
    } else stopMetro();
    emit("metro");
    syncUi();
    return metroOn;
  }
  function setClock(on) {
    clockOn = !!on;
    if (clockOn) {
      if (!startClock()) { clockOn = false; emit("clock"); syncUi(); return false; }
    } else stopClock();
    emit("clock");
    syncUi();
    return clockOn;
  }

  let bpmInput, bpmLbl, metroBtn, clockBtn, meterSel, barEl;
  function syncUi() {
    if (!barEl) return;
    if (bpmInput && document.activeElement !== bpmInput) bpmInput.value = bpm;
    if (bpmLbl) bpmLbl.textContent = bpm + " BPM";
    if (metroBtn) metroBtn.classList.toggle("on", metroOn);
    if (clockBtn) clockBtn.classList.toggle("on", clockOn);
    if (meterSel) meterSel.value = String(beatsPerBar);
    barEl.classList.toggle("live", metroOn || clockOn);
  }

  function ready(fn) {
    const t = setInterval(() => {
      const nav = document.querySelector("header.site .wrap");
      if (nav && window.FM1) { clearInterval(t); fn(nav); }
    }, 120);
    setTimeout(() => clearInterval(t), 9000);
  }

  ready(() => {
    const css = document.createElement("style");
    css.textContent = `
      #fm1-transport{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:7px 16px;
        background:var(--ui-bar,#121316);border-bottom:1px solid var(--ui-line,#232428);color:var(--ui-text,#e9edf2);
        font:12.5px 'Space Grotesk',-apple-system,Segoe UI,Roboto,sans-serif;position:sticky;top:0;z-index:40}
      #fm1-transport.live{box-shadow:inset 0 -2px 0 var(--amber,#fa5400)}
      #fm1-transport .t-lab{font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--ui-dim,#8c93a0);margin-right:2px}
      #fm1-transport .t-bpm{display:flex;align-items:center;gap:8px;min-width:180px;flex:1;max-width:280px}
      #fm1-transport .t-bpm input[type=range]{flex:1;min-width:80px}
      #fm1-transport .t-bpm b{font-variant-numeric:tabular-nums;min-width:4.5em;text-align:right}
      #fm1-transport button{background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text,#e9edf2);border-radius:7px;
        padding:5px 10px;font:inherit;font-size:12.5px;cursor:pointer}
      #fm1-transport button.on{border-color:var(--amber,#fa5400);color:var(--amber,#fa5400);background:color-mix(in srgb,var(--amber) 14%,var(--ui-surface,#17181b))}
      #fm1-transport select{background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text,#e9edf2);border-radius:6px;padding:4px 6px;font:inherit;font-size:12px}
      #fm1-transport .t-hint{margin-left:auto;font-size:11px;color:var(--ui-dim,#6d7380);white-space:nowrap}
      #fm1-transport:has(.fm1-size.in-bar) .t-hint{display:none}
      #fm1-transport .fm1-size.in-bar{margin-left:auto}
      @media (max-width:720px){#fm1-transport .t-hint{display:none}}`;
    document.head.appendChild(css);

    barEl = document.createElement("div");
    barEl.id = "fm1-transport";
    barEl.innerHTML = `
      <span class="t-lab">Transport</span>
      <div class="t-bpm"><input id="tp-bpm" type="range" min="40" max="240" value="${bpm}"><b id="tp-bpm-l">${bpm} BPM</b></div>
      <label class="t-lab" style="display:flex;align-items:center;gap:5px;text-transform:none;letter-spacing:0;font-size:12px;color:var(--ui-text2,#cfd4da)">
        <select id="tp-meter"><option>2</option><option>3</option><option selected>4</option><option>5</option><option>6</option><option>7</option><option>8</option></select>/bar
      </label>
      <button type="button" id="tp-metro" title="Audible metronome click">Click</button>
      <button type="button" id="tp-clock" title="Send MIDI clock (0xF8) so the firmware sequencer / arp follows this tempo">Clock</button>
      <span class="t-hint">Shared with Rec + MIDI</span>`;
    const header = document.querySelector("header.site");
    if (header && header.parentNode) header.parentNode.insertBefore(barEl, header.nextSibling);
    else document.body.prepend(barEl);

    bpmInput = barEl.querySelector("#tp-bpm");
    bpmLbl = barEl.querySelector("#tp-bpm-l");
    metroBtn = barEl.querySelector("#tp-metro");
    clockBtn = barEl.querySelector("#tp-clock");
    meterSel = barEl.querySelector("#tp-meter");
    meterSel.value = String(beatsPerBar);

    bpmInput.oninput = (e) => setBpm(e.target.value);
    meterSel.onchange = (e) => setBeatsPerBar(e.target.value);
    metroBtn.onclick = () => {
      if (!setMetro(!metroOn) && !metroOn) {
        bpmLbl.title = "Press Start to boot a firmware first.";
      }
    };
    clockBtn.onclick = () => {
      if (!setClock(!clockOn) && !clockOn) {
        bpmLbl.title = "Press Start to boot a firmware first.";
      }
    };
    syncUi();
  });

  window.FM1Transport = {
    getBpm: () => bpm,
    setBpm,
    getBeatsPerBar: () => beatsPerBar,
    setBeatsPerBar,
    metroOn: () => metroOn,
    setMetro,
    clockOn: () => clockOn,
    setClock,
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    _startMetro: startMetro,
    _stopMetro: stopMetro,
  };
})();
