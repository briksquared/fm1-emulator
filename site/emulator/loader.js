// Firmware boot indicator. It reflects the real boot stages emitted by main.js and never invents
// device or transfer progress. A quiet state: the machine dims a little and a small label with a
// spinner names what is loading. It appears only if a boot takes longer than a moment, so a quick
// switch shows nothing at all.
(function () {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SHOW_AFTER_MS = 180;
  const style = document.createElement("style");
  style.textContent = `
    .fm1-bootviz{position:absolute;inset:0;z-index:12;display:grid;place-items:center;pointer-events:none;
      background:rgba(0,0,0,.32);opacity:0;transition:opacity .18s ease;border-radius:inherit}
    .fm1-bootviz.on{opacity:1}
    .fm1-bootcard{display:flex;align-items:center;gap:10px;max-width:min(80%,420px);padding:9px 15px 9px 12px;border-radius:999px;
      background:var(--ui-pop,#0c0d0f);border:1px solid var(--ui-line,#2a2c31);box-shadow:0 8px 24px rgba(0,0,0,.45);
      color:var(--ui-text,#e9edf2);font:600 12.5px/1.2 'Space Grotesk',-apple-system,Segoe UI,Roboto,sans-serif}
    .fm1-bootcard .sp{flex:none;width:14px;height:14px;border-radius:50%;border:2px solid color-mix(in srgb,var(--amber) 25%,transparent);
      border-top-color:var(--amber);animation:fm1spin .8s linear infinite}
    .fm1-bootcard .tx{display:flex;flex-direction:column;gap:2px;min-width:0}
    .fm1-bootcard .tt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .fm1-bootcard .st{font:500 10.5px/1.2 'Space Mono',ui-monospace,monospace;color:var(--ui-dim,#8c93a0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .fm1-bootviz.fail .sp{animation:none;border-color:#ff6b5e}
    @keyframes fm1spin{to{transform:rotate(360deg)}}
    @media (prefers-reduced-motion:reduce){.fm1-bootcard .sp{animation:none}.fm1-bootviz{transition:none}}
  `;
  document.head.appendChild(style);
  const stage = document.querySelector(".stage");
  if (!stage) return;
  const overlay = document.createElement("div");
  overlay.className = "fm1-bootviz";
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML = `<div class="fm1-bootcard"><span class="sp"></span><span class="tx"><span class="tt">Loading firmware</span><span class="st"></span></span></div>`;
  stage.appendChild(overlay);
  const title = overlay.querySelector(".tt"), line = overlay.querySelector(".st");
  let showTimer = 0, hideTimer = 0;
  function begin(name) {
    clearTimeout(showTimer); clearTimeout(hideTimer);
    overlay.className = "fm1-bootviz";
    title.textContent = name ? `Loading ${name}` : "Loading firmware";
    line.textContent = "reading package";
    showTimer = setTimeout(() => overlay.classList.add("on"), reduce ? 0 : SHOW_AFTER_MS);
  }
  function stageText(text) { line.textContent = text; }
  function complete() {
    clearTimeout(showTimer);
    hideTimer = setTimeout(() => { overlay.className = "fm1-bootviz"; }, overlay.classList.contains("on") && !reduce ? 120 : 0);
  }
  function fail(message) {
    clearTimeout(showTimer); clearTimeout(hideTimer);
    overlay.className = "fm1-bootviz on fail";
    title.textContent = "Firmware did not boot";
    line.textContent = message || "check the package and try again";
    // the status line and the toolbar notice keep the details; the machine is not left covered
    hideTimer = setTimeout(() => { overlay.className = "fm1-bootviz"; }, 4000);
  }
  window.FM1Loader = { begin, stage: stageText, complete, fail };
})();
