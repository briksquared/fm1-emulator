// Focus Mode: enlarge the panel for easier play; optional spoken status via speechSynthesis
// and an aria-live region (screen-reader style, inspired by FM-1 Screen Reader / ESTAMPIE).
// Open from Focus in the deck header; close via the Focus ✕ or Escape — never canvas clicks.
(function () {
  "use strict";
  const SPEAK_KEY = "fm1.speak.v1";

  function speakOn() {
    try { return localStorage.getItem(SPEAK_KEY) === "1"; } catch { return false; }
  }
  function setSpeak(on) {
    try { localStorage.setItem(SPEAK_KEY, on ? "1" : "0"); } catch {}
    window.dispatchEvent(new CustomEvent("fm1-focus-speak-change", { detail: { on: !!on } }));
  }

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

    const MARGIN_X = 28;
    const MARGIN_TOP = 52;
    const MARGIN_BOTTOM = 28;
    const MAX_SCALE = 2.15;
    const MIN_SCALE = 1.1;
    let layout = null;

    const focusScale = () => {
      if (!layout) return 1.35;
      const vw = window.innerWidth - MARGIN_X * 2;
      const vh = window.innerHeight - MARGIN_TOP - MARGIN_BOTTOM;
      const s = Math.min(vw / layout.w, vh / layout.h, MAX_SCALE);
      return Math.max(MIN_SCALE, s);
    };
    const applyFocusScale = () => {
      document.documentElement.style.setProperty("--focus-lcd-scale", focusScale().toFixed(3));
    };

    const css = document.createElement("style");
    css.textContent = `
      .panel-stack.focus-lcd, .stage.focus-lcd{z-index:10030;position:relative}
      .panel-stack.focus-lcd canvas, .stage.focus-lcd canvas{
        position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(var(--focus-lcd-scale, 1.35));
        transform-origin:center center;z-index:10031;
        box-shadow:0 24px 80px rgba(0,0,0,.65),0 0 0 1px color-mix(in srgb, var(--amber, #e8a020) 22%, transparent);
        border-radius:8px;cursor:default}
      @media (prefers-reduced-motion: no-preference){
        .panel-stack.focus-lcd canvas, .stage.focus-lcd canvas{
          transition:transform .14s ease-out,box-shadow .14s ease-out}}
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
    function setFocus(on) {
      focused = !!on;
      if (focused) {
        const r = canvas.getBoundingClientRect();
        layout = { w: r.width, h: r.height };
        applyFocusScale();
      } else {
        layout = null;
        document.documentElement.style.removeProperty("--focus-lcd-scale");
      }
      stage.classList.toggle("focus-lcd", focused);
      document.body.classList.toggle("fm1-focus-on", focused);
      veil.classList.toggle("on", focused);
      closeBtn.classList.toggle("on", focused);
      canvas.title = "FM-1 front panel";
      announce(focused ? "Focus mode on. Close with ✕ or press Escape." : "Focus mode off.");
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
    addEventListener("resize", () => { if (focused) applyFocusScale(); });

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
