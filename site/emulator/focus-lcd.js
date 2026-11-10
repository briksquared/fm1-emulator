// Focus Mode: enlarge the panel LCD; optional spoken status via speechSynthesis
// and an aria-live region (screen-reader style, inspired by FM-1 Screen Reader / ESTAMPIE).
(function () {
  "use strict";
  const SPEAK_KEY = "fm1.speak.v1";

  function speakOn() {
    try { return localStorage.getItem(SPEAK_KEY) === "1"; } catch { return false; }
  }
  function setSpeak(on) {
    try { localStorage.setItem(SPEAK_KEY, on ? "1" : "0"); } catch {}
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

    const css = document.createElement("style");
    css.textContent = `
      .panel-stack.focus-lcd, .stage.focus-lcd{z-index:10030;position:relative}
      .panel-stack.focus-lcd canvas, .stage.focus-lcd canvas{
        position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(2.4);
        transform-origin:center center;z-index:10031;box-shadow:0 24px 80px rgba(0,0,0,.65);
        border-radius:8px;cursor:zoom-out}
      #focus-lcd-veil{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10029;display:none}
      #focus-lcd-veil.on{display:block}
      #focus-lcd-bar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:10032;display:none;
        gap:8px;align-items:center;background:#0c0d0f;border:1px solid #232428;border-radius:999px;padding:6px 12px;
        font:12px 'Space Grotesk',sans-serif;color:#e9edf2}
      #focus-lcd-bar.on{display:flex}
      #focus-lcd-bar button{font:inherit;font-size:12px;background:#17181b;border:1px solid #2a2c31;color:inherit;border-radius:7px;padding:4px 9px;cursor:pointer}`;
    document.head.appendChild(css);

    const veil = document.createElement("div");
    veil.id = "focus-lcd-veil";
    document.body.appendChild(veil);
    const bar = document.createElement("div");
    bar.id = "focus-lcd-bar";
    bar.innerHTML = `<span>Focus LCD</span><button type="button" id="focus-exit">Exit</button>
      <button type="button" id="focus-speak">${speakOn() ? "Voice: on" : "Voice: off"}</button>`;
    document.body.appendChild(bar);

    let focused = false;
    function setFocus(on) {
      focused = !!on;
      stage.classList.toggle("focus-lcd", focused);
      veil.classList.toggle("on", focused);
      bar.classList.toggle("on", focused);
      canvas.title = focused ? "Click to exit Focus Mode" : "Double-click LCD for Focus Mode";
      announce(focused ? "Focus mode on. Double-click or press Escape to exit." : "Focus mode off.");
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

    canvas.addEventListener("dblclick", (e) => {
      e.preventDefault();
      setFocus(!focused);
    });
    veil.onclick = () => setFocus(false);
    bar.querySelector("#focus-exit").onclick = () => setFocus(false);
    bar.querySelector("#focus-speak").onclick = () => {
      const on = !speakOn();
      setSpeak(on);
      bar.querySelector("#focus-speak").textContent = on ? "Voice: on" : "Voice: off";
      announce(on ? "Voice on" : "Voice off");
    };
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && focused) { e.preventDefault(); setFocus(false); }
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
