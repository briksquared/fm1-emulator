// Hardware panel host: drive the emulator from a real FM-1 whose firmware
// sends panel MIDI (keys / buttons / encoders / MASTER). Intercepts hardware
// MIDI before the normal play path when a host mode is selected.
(function () {
  "use strict";
  const KEY = "fm1.hostpanel.v1";
  const MODES = [
    { id: "off", label: "Off — normal MIDI in" },
    { id: "remote", label: "Panel map A — ch15/16 + CC16–22" },
    { id: "ctrl", label: "Panel map B — notes 53–79 + CC20–26" },
    { id: "abs", label: "Panel map C — absolute CC 20–26 / 40–53" },
  ];

  function load() {
    try { return localStorage.getItem(KEY) || "off"; } catch { return "off"; }
  }
  function save(id) {
    try { localStorage.setItem(KEY, id); } catch {}
  }

  let mode = load();
  let master14 = 0; // 14-bit pot accumulator

  function parse(bytes) {
    if (mode === "remote") return window.FM1Midi?.parseRemoteFm1?.(bytes) || null;
    if (mode === "ctrl") return window.FM1Midi?.parseFm1Ctrl?.(bytes) || null;
    if (mode === "abs") return window.FM1Midi?.parsePanelAbsolute?.(bytes) || null;
    return null;
  }

  // Button index → FM-1 matrix key id (matches main.js BUTTONS layout for board 0).
  const BTN0 = 37;
  function buttonId(i) {
    // FX..OCT+ style 0..13 → key ids used by the stock panel (2..11 + extras)
    if (i >= 0 && i <= 9) return 2 + i;           // FX..SEQ-ish
    if (i === 10) return 0;                       // OCT-
    if (i === 11) return 1;                       // OCT+
    if (i === 12) return 12;                      // PLAY-ish
    if (i === 13) return 13;                      // REC
    return BTN0 + (i % 14);
  }

  function apply(ev) {
    const fm = window.FM1;
    if (!fm || !ev) return false;
    if (ev.type === "key" && fm.panelKey) {
      if (ev.on && ev.vel != null && fm.panelVelocity) fm.panelVelocity(ev.vel / 127);
      fm.panelKey(ev.id, !!ev.on);
      return true;
    }
    if (ev.type === "button" && fm.panelKey) {
      fm.panelKey(buttonId(ev.id), !!ev.on);
      return true;
    }
    if (ev.type === "enc" && fm.panelEnc && ev.clicks) {
      fm.panelEnc(ev.enc, ev.clicks);
      return true;
    }
    if (ev.type === "encAbs" && fm.panelEncAbs) {
      fm.panelEncAbs(ev.enc, ev.value);
      return true;
    }
    if (ev.type === "master" && fm.panelPot) {
      fm.panelPot(Math.round((ev.value / 127) * 1023));
      return true;
    }
    if (ev.type === "master7") {
      master14 = ((ev.msb & 0x7f) << 7) | (master14 & 0x7f);
      if (fm.panelPot) fm.panelPot(Math.round((master14 / 16383) * 1023));
      return true;
    }
    if (ev.type === "master39") {
      master14 = (master14 & 0x3f80) | (ev.lsb & 0x7f);
      if (fm.panelPot) fm.panelPot(Math.round((master14 / 16383) * 1023));
      return true;
    }
    return false;
  }

  /**
   * Input processor: when host mode is on, consume panel messages and drive the
   * emulated panel; return true so main.js does not also treat them as notes.
   */
  function processor(bytes) {
    if (mode === "off") return false;
    const ev = parse(bytes);
    if (!ev) return false;
    apply(ev);
    return true;
  }

  function installProcessor() {
    const fm = window.FM1;
    if (!fm || !fm.setInputProcessor) return;
    // Compose with Keys hw processor if present: panel host wins first.
    const prev = fm._hostPrevProc;
    const keysProc = null; // Keys installs its own; we chain via setInputProcessor wrap below
    fm.setInputProcessor((bytes) => {
      if (processor(bytes)) return true;
      if (typeof window.FM1Keys?._hw === "function" && window.FM1Keys._state?.().hwProc) {
        try { if (window.FM1Keys._hw(bytes)) return true; } catch {}
      }
      if (typeof prev === "function") {
        try { return !!prev(bytes); } catch { return false; }
      }
      return false;
    });
  }

  function setMode(id) {
    mode = MODES.some((m) => m.id === id) ? id : "off";
    save(mode);
    installProcessor();
    const st = document.getElementById("hostpanel-status");
    if (st) st.textContent = mode === "off"
      ? "Normal MIDI in."
      : `Panel host: ${MODES.find((m) => m.id === mode)?.label || mode}. Use a unit firmware that sends panel MIDI; screen draw-back onto the hardware is not implemented.`;
    return mode;
  }

  window.FM1HostPanel = {
    modes: MODES,
    get: () => mode,
    set: setMode,
    process: processor,
    apply,
  };

  function ready(fn) {
    const t = setInterval(() => {
      if (window.FM1 && window.FM1.setInputProcessor && document.body) { clearInterval(t); fn(); }
    }, 150);
    setTimeout(() => clearInterval(t), 12000);
  }

  ready(() => {
    // Parsers come from main.js → window.FM1Midi (module). Wait briefly if needed.
    const css = document.createElement("style");
    css.textContent = `
      #hostpanel-pop{position:fixed;z-index:9997;width:320px;max-width:94vw;background:var(--ui-pop,#0c0d0f);border:1px solid var(--ui-line,#232428);
        border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.6);padding:12px;display:none;flex-direction:column;gap:8px;color:var(--ui-text,#e9edf2);
        font:12.5px 'Space Grotesk',sans-serif}
      #hostpanel-pop.open{display:flex}
      #hostpanel-pop select{width:100%;background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:inherit;border-radius:7px;padding:6px 8px;font:inherit}
      #hostpanel-pop .dim{font-size:11px;color:var(--ui-dim,#8c93a0);margin:0;line-height:1.35}`;
    document.head.appendChild(css);

    const btn = document.createElement("a");
    btn.href = "#"; btn.id = "hostpanel-btn"; btn.className = "sitelink";
    btn.textContent = "Panel host";
    btn.title = "Use a real FM-1 as this emulator’s panel over MIDI";
    const host = document.querySelector(".sitenav") || document.querySelector("header.site .wrap");
    if (host) host.appendChild(btn);

    const pop = document.createElement("div");
    pop.id = "hostpanel-pop";
    pop.innerHTML = `
      <b>Hardware panel host</b>
      <select id="hostpanel-mode" aria-label="Panel host mode"></select>
      <p class="dim" id="hostpanel-status"></p>
      <p class="dim">Map A: keys on ch16, buttons on ch15, encoders CC16–22, MASTER CC7/39. Input host only — the unit’s screen is not redrawn from here. Pair MIDI in to the unit.</p>`;
    document.body.appendChild(pop);
    const sel = pop.querySelector("#hostpanel-mode");
    for (const m of MODES) sel.add(new Option(m.label, m.id));
    sel.value = mode;
    sel.onchange = () => setMode(sel.value);
    setMode(mode);

    const place = () => {
      const r = (window.FM1PopAnchor && window.FM1PopAnchor(btn)) || btn.getBoundingClientRect();
      pop.style.top = (r.bottom + 6) + "px";
      pop.style.left = Math.max(8, Math.min(r.left, innerWidth - 340)) + "px";
    };
    btn.onclick = (e) => { e.preventDefault(); pop.classList.toggle("open"); if (pop.classList.contains("open")) place(); };
    addEventListener("resize", () => { if (pop.classList.contains("open")) place(); });
    document.addEventListener("click", (e) => {
      if (e.target !== btn && !btn.contains(e.target) && !pop.contains(e.target)) pop.classList.remove("open");
    });
  });
})();
