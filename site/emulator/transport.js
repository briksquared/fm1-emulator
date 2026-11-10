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
    if (bpmLbl) bpmLbl.textContent = String(bpm);
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
      #fm1-transport{display:flex;flex-wrap:nowrap;align-items:center;gap:4px 8px;padding:2px 10px;min-height:26px;
        background:var(--ui-bar,#121316);border-bottom:1px solid var(--ui-line,#232428);color:var(--ui-text,#e9edf2);
        font:11px 'Space Grotesk',-apple-system,Segoe UI,Roboto,sans-serif;position:sticky;top:0;z-index:40}
      #fm1-transport.live{box-shadow:inset 0 -1px 0 var(--amber,#d8d8d8)}
      #fm1-transport .t-lab{font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:var(--ui-dim,#8c93a0);margin-right:0}
      #fm1-transport .t-bpm{display:flex;align-items:center;gap:5px;min-width:120px;flex:1;max-width:200px}
      #fm1-transport .t-bpm input[type=range]{flex:1;min-width:60px;height:14px}
      #fm1-transport .t-bpm b{font-variant-numeric:tabular-nums;min-width:3.6em;text-align:right;font-size:10.5px}
      #fm1-transport button{background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text,#e9edf2);border-radius:5px;
        padding:2px 7px;font:inherit;font-size:11px;cursor:pointer;line-height:1.2}
      #fm1-transport button.on{border-color:var(--amber,#d8d8d8);color:var(--amber,#d8d8d8);background:color-mix(in srgb,var(--amber) 14%,var(--ui-surface,#17181b))}
      #fm1-transport select{background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text,#e9edf2);border-radius:4px;padding:1px 3px;font:inherit;font-size:10.5px}
      #fm1-transport .t-hint{display:none}
      #fm1-transport .fm1-size.in-bar{margin-left:auto}
      #fm1-transport .fm1-size input[type=range]{width:72px}
      #fm1-transport .fm1-size label{font-size:8px}
      @media (max-width:720px){#fm1-transport .t-lab:first-child{display:none}}`;
    document.head.appendChild(css);

    barEl = document.createElement("div");
    barEl.id = "fm1-transport";
    barEl.innerHTML = `
      <span class="t-lab">TP</span>
      <div class="t-bpm"><input id="tp-bpm" type="range" min="40" max="240" value="${bpm}"><b id="tp-bpm-l">${bpm}</b></div>
      <label class="t-lab" style="display:flex;align-items:center;gap:3px;text-transform:none;letter-spacing:0;font-size:10.5px;color:var(--ui-text2,#cfd4da)">
        <select id="tp-meter"><option>2</option><option>3</option><option selected>4</option><option>5</option><option>6</option><option>7</option><option>8</option></select>/bar
      </label>
      <button type="button" id="tp-metro" title="Audible metronome click">Click</button>
      <button type="button" id="tp-clock" title="Send MIDI clock (0xF8) so the firmware sequencer / arp follows this tempo">Clock</button>`;
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
