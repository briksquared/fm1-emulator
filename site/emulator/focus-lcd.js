// Focus Mode: enlarge the LCD screen well for easier read/play — not the whole panel chrome.
// Open from Focus in the deck header; close via the Focus ✕ or Escape — never canvas clicks.
// Screen fractions match overlay.js KEEPOUT "screen well" (1280×820 FM-1 panel).
(function () {
  "use strict";
  const SPEAK_KEY = "fm1.speak.v1";
  const SCREEN = { x0: 0.275, y0: 0.029, x1: 0.678, y1: 0.659 };
  const MARGIN_X = 24;
  const MARGIN_TOP = 48;
  const MARGIN_BOTTOM = 24;
  const MAX_SCALE = 3.25;
  const MIN_SCALE = 1.05;

  function speakOn() {
    try { return localStorage.getItem(SPEAK_KEY) === "1"; } catch { return false; }
  }
  function setSpeak(on) {
    try { localStorage.setItem(SPEAK_KEY, on ? "1" : "0"); } catch {}
    window.dispatchEvent(new CustomEvent("fm1-focus-speak-change", { detail: { on: !!on } }));
  }

  const clipPath = () => {
    const top = SCREEN.y0 * 100;
    const right = (1 - SCREEN.x1) * 100;
    const bottom = (1 - SCREEN.y1) * 100;
    const left = SCREEN.x0 * 100;
    return `inset(${top}% ${right}% ${bottom}% ${left}% round 6px)`;
  };

  function ready(fn) {
    const t = setInterval(() => {
      if (window.FM1 && window.FM1.panelCanvas && document.body) { clearInterval(t); fn(); }
    }, 150);
    setTimeout(() => clearInterval(t), 12000);
  }

  ready(() => {
    const canvas = window.FM1.panelCanvas;
    const stage = canvas.closest(".panel-stack") || canvas.closest(".stage") || canvas.parentElement;
    if (!stage) return;

    const live = document.createElement("div");
    live.id = "fm1-aria-live";
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    live.className = "visually-hidden";
    live.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;";
    document.body.appendChild(live);

    const css = document.createElement("style");
    css.textContent = `
      .panel-stack.focus-lcd, .stage.focus-lcd{z-index:10030;position:relative}
      .panel-stack.focus-lcd canvas, .stage.focus-lcd canvas{
        position:fixed;z-index:10031;margin:0;
        box-shadow:0 20px 64px rgba(0,0,0,.62),0 0 0 1px color-mix(in srgb, var(--amber, #e8a020) 28%, transparent);
        border-radius:6px;cursor:default;max-width:none;max-height:none}
      @media (prefers-reduced-motion: no-preference){
        .panel-stack.focus-lcd canvas, .stage.focus-lcd canvas{transition:transform .14s ease-out,box-shadow .14s ease-out}}
      #focus-lcd-veil{position:fixed;inset:0;z-index:10029;display:none;pointer-events:none;
        background:radial-gradient(ellipse 115% 95% at 50% 42%,rgba(0,0,0,.5),rgba(0,0,0,.88))}
      #focus-lcd-veil.on{display:block}
      body.fm1-focus-on .player .deck-head{opacity:.55;transition:opacity .14s ease}
      @media (prefers-reduced-motion: reduce){body.fm1-focus-on .player .deck-head{transition:none}}
      #focus-lcd-close{position:fixed;top:max(12px,env(safe-area-inset-top,0px));right:max(12px,env(safe-area-inset-right,0px));
        z-index:10034;display:none;align-items:center;justify-content:center;width:40px;height:40px;padding:0;
        font:700 18px/1 'Space Grotesk',sans-serif;background:var(--ui-pop,#0c0d0f);border:1px solid var(--ui-line,#2a2c31);
        color:var(--ui-text,#e9edf2);border-radius:10px;cursor:pointer;box-shadow:0 8px 28px rgba(0,0,0,.5)}
      #focus-lcd-close:hover{border-color:var(--amber);color:var(--ink,#fff)}
      #focus-lcd-close.on{display:flex}
      #focus-lcd-close:focus-visible{outline:2px solid var(--amber);outline-offset:2px}`;
    document.head.appendChild(css);

    const veil = document.createElement("div");
    veil.id = "focus-lcd-veil";
    document.body.appendChild(veil);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.id = "focus-lcd-close";
    closeBtn.setAttribute("aria-label", "Close Focus");
    closeBtn.title = "Close Focus";
    closeBtn.textContent = "✕";
    document.body.appendChild(closeBtn);

    let focused = false;
    let layout = null;

    const screenScale = () => {
      if (!layout) return MIN_SCALE;
      const sw = (SCREEN.x1 - SCREEN.x0) * layout.w;
      const sh = (SCREEN.y1 - SCREEN.y0) * layout.h;
      const vw = window.innerWidth - MARGIN_X * 2;
      const vh = window.innerHeight - MARGIN_TOP - MARGIN_BOTTOM;
      const s = Math.min(vw / sw, vh / sh, MAX_SCALE);
      return Math.max(MIN_SCALE, s);
    };

    const applyFocusLayout = () => {
      if (!layout) return;
      const cx = (SCREEN.x0 + SCREEN.x1) / 2;
      const cy = (SCREEN.y0 + SCREEN.y1) / 2;
      const ox = cx * layout.w;
      const oy = cy * layout.h;
      const s = screenScale();
      const vx = window.innerWidth / 2;
      const vy = window.innerHeight / 2;
      canvas.style.width = `${layout.w}px`;
      canvas.style.height = `${layout.h}px`;
      canvas.style.left = `${vx - ox}px`;
      canvas.style.top = `${vy - oy}px`;
      canvas.style.transformOrigin = `${ox}px ${oy}px`;
      canvas.style.transform = `scale(${s})`;
      canvas.style.clipPath = clipPath();
      document.documentElement.style.setProperty("--focus-lcd-scale", s.toFixed(3));
    };

    const clearFocusLayout = () => {
      canvas.style.width = "";
      canvas.style.height = "";
      canvas.style.left = "";
      canvas.style.top = "";
      canvas.style.transformOrigin = "";
      canvas.style.transform = "";
      canvas.style.clipPath = "";
      document.documentElement.style.removeProperty("--focus-lcd-scale");
    };

    function setFocus(on) {
      focused = !!on;
      if (focused) {
        const r = canvas.getBoundingClientRect();
        layout = { w: r.width, h: r.height };
        applyFocusLayout();
      } else {
        layout = null;
        clearFocusLayout();
      }
      stage.classList.toggle("focus-lcd", focused);
      document.body.classList.toggle("fm1-focus-on", focused);
      veil.classList.toggle("on", focused);
      closeBtn.classList.toggle("on", focused);
      canvas.title = "FM-1 front panel";
      announce(focused ? "Focus on screen. Close with ✕ or press Escape." : "Focus mode off.");
      window.dispatchEvent(new CustomEvent("fm1-focus-change", { detail: { on: focused } }));
    }

    function announce(text) {
      if (!text) return;
      live.textContent = "";
      requestAnimationFrame(() => { live.textContent = text; });
      if (speakOn() && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.rate = 1.05;
          window.speechSynthesis.speak(u);
        } catch {}
      }
    }
    window.FM1Announce = announce;

    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setFocus(false);
    });

    window.FM1Focus = {
      isOn: () => focused,
      set: setFocus,
      open: () => { if (!focused) setFocus(true); },
      close: () => { if (focused) setFocus(false); },
      speakOn,
      toggleSpeak: () => {
        const on = !speakOn();
        setSpeak(on);
        announce(on ? "Voice on" : "Voice off");
        return on;
      },
    };

    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && focused) { e.preventDefault(); setFocus(false); }
    });
    addEventListener("resize", () => {
      if (!focused) return;
      const box = stage.getBoundingClientRect();
      if (box.width > 8 && box.height > 8) layout = { w: box.width, h: box.height };
      applyFocusLayout();
    });

    // Speak major status-line changes when voice is on.
    const status = document.getElementById("status");
    if (status) {
      let last = "";
      const obs = new MutationObserver(() => {
        const t = (status.textContent || "").trim();
        if (t && t !== last) { last = t; if (speakOn()) announce(t); }
      });
      obs.observe(status, { childList: true, characterData: true, subtree: true });
    }
  });
})();
