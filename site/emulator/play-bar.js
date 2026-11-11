// Toolbar above the panel canvas: Fullscreen toggle and a Focus opener (not a close control).
// Focus closes only via the overlay ✕ or Escape; panel clicks stay play-only.
(function () {
  "use strict";

  function ready(fn) {
    const t = setInterval(() => {
      const stage = document.querySelector(".stage");
      const canvas = window.FM1?.panelCanvas;
      if (stage && canvas && window.FM1Focus) { clearInterval(t); fn(stage, canvas); }
    }, 120);
    setTimeout(() => clearInterval(t), 15000);
  }

  ready((stage) => {
    if (document.getElementById("emulator-play-bar")) return;

    const css = document.createElement("style");
    css.id = "emulator-play-bar-css";
    css.textContent = `
      #emulator-play-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;width:100%;
        margin:0 0 8px;padding:6px 8px;box-sizing:border-box;
        background:var(--ui-bar,#101114);border:1px solid var(--ui-line,#232428);border-radius:10px;
        font:600 11.5px 'Space Grotesk',-apple-system,sans-serif;color:var(--ui-text,#e9edf2)}
      #emulator-play-bar .epb-label{flex:1 1 auto;min-width:0;font-weight:500;color:var(--ui-dim,#9aa3ad);
        font-size:10.5px;letter-spacing:.03em}
      #emulator-play-bar button{flex:0 0 auto;font:inherit;font-size:11.5px;font-weight:600;
        background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:inherit;
        border-radius:7px;padding:5px 10px;cursor:pointer;white-space:nowrap}
      #emulator-play-bar button:hover{border-color:var(--amber);color:var(--ink,#fff)}
      #emulator-play-bar button[aria-pressed="true"]{background:var(--amber);color:var(--ui-on-accent,#180a02);border-color:transparent}
      #emulator-play-bar button.epb-primary{background:var(--amber);color:var(--ui-on-accent,#180a02);border:0}
      #emulator-play-bar button.epb-primary[aria-pressed="true"]{filter:brightness(1.08)}
      .stage.focus-lcd #emulator-play-bar{position:fixed;top:max(10px,env(safe-area-inset-top,0px));left:50%;
        transform:translateX(-50%);z-index:10033;width:min(96vw,520px);margin:0;
        box-shadow:0 12px 40px rgba(0,0,0,.55)}`;
    document.head.appendChild(css);

    const bar = document.createElement("div");
    bar.id = "emulator-play-bar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Emulator display");
    bar.innerHTML = `<span class="epb-label">Panel controls</span>
      <button type="button" id="epb-fullscreen" class="epb-primary" aria-pressed="false">Fullscreen</button>
      <button type="button" id="epb-focus" aria-pressed="false" title="Open enlarged panel play (close with ✕ or Escape)">Focus</button>
      <button type="button" id="epb-voice" aria-pressed="false" title="Speak status-line changes">Voice</button>`;
    stage.insertBefore(bar, stage.firstChild);

    const fsBtn = bar.querySelector("#epb-fullscreen");
    const focusBtn = bar.querySelector("#epb-focus");
    const voiceBtn = bar.querySelector("#epb-voice");

    const deckEl = () => document.querySelector(".player .deck") || stage;

    const isFs = () => {
      const el = document.fullscreenElement;
      return el === deckEl() || el === stage;
    };

    const syncFs = () => {
      const on = isFs();
      fsBtn.setAttribute("aria-pressed", on ? "true" : "false");
      fsBtn.textContent = on ? "Exit fullscreen" : "Fullscreen";
    };

    const syncFocus = () => {
      const on = window.FM1Focus.isOn();
      focusBtn.disabled = on;
      focusBtn.setAttribute("aria-pressed", on ? "true" : "false");
      focusBtn.textContent = "Focus";
      bar.classList.toggle("focus-on", on);
    };

    const syncVoice = () => {
      const on = window.FM1Focus.speakOn();
      voiceBtn.setAttribute("aria-pressed", on ? "true" : "false");
      voiceBtn.textContent = on ? "Voice on" : "Voice off";
    };

    const toggleFs = () => {
      const target = deckEl();
      if (isFs()) document.exitFullscreen?.();
      else target.requestFullscreen?.();
    };

    fsBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleFs(); });
    focusBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!window.FM1Focus.isOn()) window.FM1Focus.open();
    });
    voiceBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      window.FM1Focus.toggleSpeak();
      syncVoice();
    });

    // Keep toolbar clicks from reaching the panel hit-test layer beneath.
    bar.addEventListener("pointerdown", (e) => e.stopPropagation());

    document.addEventListener("fullscreenchange", syncFs);
    window.addEventListener("fm1-focus-change", syncFocus);
    window.addEventListener("fm1-focus-speak-change", syncVoice);

    syncFs();
    syncFocus();
    syncVoice();
  });
})();
