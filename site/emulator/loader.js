// Firmware boot visualizer. It reflects the real boot stages emitted by main.js;
// it never invents device or transfer progress.
(function () {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const style = document.createElement("style");
  style.textContent = `
    .fm1-bootviz{position:absolute;inset:0;z-index:12;display:grid;place-items:center;overflow:hidden;
      background:radial-gradient(circle at 50% 42%,rgba(32,247,211,.18),transparent 27%),linear-gradient(125deg,rgba(5,11,18,.93),rgba(8,18,29,.97));
      opacity:0;pointer-events:none;transition:opacity .28s ease;color:#d8fff8;font-family:'Space Mono',monospace}
    .fm1-bootviz.on{opacity:1;pointer-events:auto}.fm1-bootviz::before{content:'';position:absolute;inset:-80%;background:repeating-linear-gradient(90deg,transparent 0 27px,rgba(85,255,232,.045) 28px),repeating-linear-gradient(0deg,transparent 0 27px,rgba(85,255,232,.045) 28px);transform:perspective(420px) rotateX(60deg) translateY(28%);animation:fmgrid 8s linear infinite}
    .fm1-bootcard{position:relative;width:min(74%,430px);padding:25px 28px 22px;border:1px solid rgba(84,255,222,.48);background:rgba(5,17,25,.72);box-shadow:0 0 0 1px rgba(67,180,255,.12) inset,0 0 52px rgba(0,229,196,.16);clip-path:polygon(0 12px,12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%)}
    .fm1-bootcard::after{content:'';position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,transparent,#90ffe9,transparent);animation:fmbeam 1.7s ease-in-out infinite}.fm1-boot-kicker{font-size:9px;letter-spacing:.22em;color:#78ebd9}.fm1-boot-title{margin:9px 0 18px;font:600 clamp(15px,2vw,22px) 'Space Grotesk',sans-serif;letter-spacing:.02em}.fm1-boot-orbit{width:76px;height:76px;margin:0 auto 17px;border:1px solid rgba(117,255,224,.35);border-radius:50%;position:relative;box-shadow:0 0 22px rgba(55,239,211,.22) inset}.fm1-boot-orbit::before,.fm1-boot-orbit::after{content:'';position:absolute;border-radius:50%;inset:10px;border:2px solid transparent;border-top-color:#7affdf;border-right-color:#31baff;animation:fmspin 1.2s linear infinite}.fm1-boot-orbit::after{inset:22px;border-width:1px;border-top-color:#d9fffd;border-right-color:transparent;animation-direction:reverse;animation-duration:.78s}.fm1-boot-core{position:absolute;inset:31px;border-radius:50%;background:#9affeb;box-shadow:0 0 24px #58f6d7}.fm1-boot-step{display:flex;gap:9px;align-items:center;border-top:1px solid rgba(132,255,231,.15);padding-top:13px;font-size:10px;color:#b6d7d5}.fm1-boot-step i{display:block;width:7px;height:7px;border-radius:50%;background:#3d8078;box-shadow:none}.fm1-boot-step i.live{background:#8fffe7;box-shadow:0 0 11px #5dffe1}.fm1-boot-step strong{color:#effffc;font-weight:400}.fm1-bootviz.done{opacity:0;transition-delay:.5s}.fm1-bootviz.fail .fm1-bootcard{border-color:#ff6f91;box-shadow:0 0 38px rgba(255,65,113,.2)}.fm1-bootviz.fail .fm1-boot-core{background:#ff7897;box-shadow:0 0 24px #ff507c}.fm1-bootviz.fail .fm1-boot-step i.live{background:#ff7897;box-shadow:0 0 11px #ff507c}@keyframes fmspin{to{transform:rotate(360deg)}}@keyframes fmbeam{50%{opacity:.25;transform:scaleX(.55)}}@keyframes fmgrid{to{transform:perspective(420px) rotateX(60deg) translateY(34%)}}@media(prefers-reduced-motion:reduce){.fm1-bootviz *,.fm1-bootviz::before,.fm1-bootviz::after{animation:none!important}}
  `;
  document.head.appendChild(style);
  const stage = document.querySelector(".stage");
  if (!stage) return;
  const overlay = document.createElement("div");
  overlay.className = "fm1-bootviz";
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML = `<div class="fm1-bootcard"><div class="fm1-boot-kicker">FM-1 / FIRMWARE MATRIX</div><div class="fm1-boot-title">Preparing firmware</div><div class="fm1-boot-orbit"><span class="fm1-boot-core"></span></div><div class="fm1-boot-step"><i class="live"></i><span>STAGE / <strong>awaiting package</strong></span></div></div>`;
  stage.appendChild(overlay);
  const title = overlay.querySelector(".fm1-boot-title"), line = overlay.querySelector("strong"), dot = overlay.querySelector("i");
  let timer;
  function begin(name) { clearTimeout(timer); overlay.className = "fm1-bootviz on"; title.textContent = name || "Preparing firmware"; line.textContent = "acquiring package"; dot.className = "live"; }
  function stageText(text) { if (!overlay.classList.contains("on")) return; line.textContent = text; }
  function complete() { stageText("system online"); timer = setTimeout(() => { overlay.className = "fm1-bootviz done"; }, reduce ? 0 : 420); }
  function fail(message) { clearTimeout(timer); overlay.className = "fm1-bootviz on fail"; title.textContent = "Firmware did not boot"; line.textContent = message || "check package and retry"; }
  window.FM1Loader = { begin, stage: stageText, complete, fail };
})();
