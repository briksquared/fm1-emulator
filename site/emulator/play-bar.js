// Fullscreen toggle and Focus opener in the deck header (after Flash). Focus closes via ✕ or Escape.
(function () {
  "use strict";

  function ready(fn) {
    const t = setInterval(() => {
      const head = document.querySelector(".deck-head");
      const flash = document.getElementById("fm1-flash-btn");
      const canvas = window.FM1?.panelCanvas;
      if (head && flash && canvas && window.FM1Focus) { clearInterval(t); fn(head, flash); }
    }, 120);
    setTimeout(() => clearInterval(t), 15000);
  }

  ready((head, flashBtn) => {
    if (document.getElementById("epb-fullscreen")) return;

    const css = document.createElement("style");
    css.id = "emulator-head-ctls-css";
    css.textContent = `
      .emulator-head-ctls{display:inline-flex;flex:none;align-items:center;gap:5px;margin-left:6px}
      .emulator-head-ctls .epb-divider{width:1px;align-self:stretch;min-height:22px;max-height:26px;
        background:var(--ui-line,#2a2c31);opacity:.7;margin:0 2px 0 0}
      .emulator-head-ctls button{flex:0 0 auto;font:600 11.5px 'Space Grotesk',-apple-system,sans-serif;
        background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text,#e9edf2);
        border-radius:7px;padding:4px 11px;cursor:pointer;white-space:nowrap;line-height:1.25}
      .emulator-head-ctls button:hover{border-color:var(--amber);color:var(--ink,#fff)}
      .emulator-head-ctls button:active{transform:translateY(1px)}
      .emulator-head-ctls button[aria-pressed="true"]{background:var(--amber);color:var(--ui-on-accent,#180a02);border-color:transparent}
      .emulator-head-ctls button.epb-primary{background:var(--ui-surface,#17181b)}
      .emulator-head-ctls button.epb-primary[aria-pressed="true"]{background:var(--amber);color:var(--ui-on-accent,#180a02);border-color:transparent}
      body.fm1-focus-on .emulator-head-ctls #epb-focus{border-color:color-mix(in srgb,var(--amber) 55%,var(--ui-line))}`;
    document.head.appendChild(css);

    const group = document.createElement("div");
    group.className = "emulator-head-ctls";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Display");
    group.innerHTML = `<span class="epb-divider" aria-hidden="true"></span>
      <button type="button" id="epb-fullscreen" class="epb-primary" aria-pressed="false">Fullscreen</button>
      <button type="button" id="epb-focus" aria-pressed="false" title="Open enlarged panel play (close with ✕ or Escape)">Focus</button>`;
    flashBtn.insertAdjacentElement("afterend", group);

    const fsBtn = group.querySelector("#epb-fullscreen");
    const focusBtn = group.querySelector("#epb-focus");
    const stage = document.querySelector(".stage");

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

    group.addEventListener("pointerdown", (e) => e.stopPropagation());

    document.addEventListener("fullscreenchange", syncFs);
    window.addEventListener("fm1-focus-change", syncFocus);

    syncFs();
    syncFocus();
  });
})();
