// Turbo: opt-in JIT, per firmware, with the unsafe path removed.
//
// Why this exists. The JIT is off by default because switching firmware with
// it on stalled flash snapshots and crashed the renderer (2026-11-04). It is
// also a big win for most firmwares — measured here at 100 MHz:
//
//     Felucca   interpreter 1.3x / load 74%   JIT 3.9x / load 26%
//     SLOOP     interpreter 1.5x / load 67%   JIT 3.3x / load 30%
//     DARK-1    interpreter 0.5-0.7x          JIT 0.2-0.4x   <- worse
//
// So the JIT is not uniformly good: on DARK-1 it roughly halves throughput and
// pushes the audio thread further past real time, which is the firmware the
// crash was reproduced on. This module therefore (a) keeps the interpreter as
// the default, (b) makes Turbo an explicit per-firmware choice, (c) warns on
// firmwares measured slower with it, and (d) when Turbo is on, changes
// firmware by RELOADING rather than hot-switching, so the path that crashed is
// never taken.
(function () {
  "use strict";
  const KEY = "fm1.turbo.v1";
  // Firmwares measured slower with the JIT than without it.
  const SLOWER = { dark1: "DARK-1 runs about half as fast with Turbo on" };

  const params = () => new URLSearchParams(location.search);
  const isOn = () => params().get("jit") === "1";

  function prefs() {
    try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); return o && typeof o === "object" ? o : {}; }
    catch { return {}; }
  }
  function remember(id, on) {
    if (!id) return;
    try { const o = prefs(); if (on) o[id] = true; else delete o[id]; localStorage.setItem(KEY, JSON.stringify(o)); }
    catch (e) { console.warn("turbo: could not save", e); }
  }

  function go(fwId, on) {
    const p = params();
    if (fwId) p.set("fw", fwId);
    if (on) p.set("jit", "1"); else p.delete("jit");
    location.href = location.pathname + "?" + p.toString();
  }

  function ready(fn) {
    const t = setInterval(() => {
      const sel = document.getElementById("fw");
      const nav = document.querySelector(".sitenav") || document.querySelector("header.site .wrap");
      if (sel && nav) { clearInterval(t); fn(sel, nav); }
    }, 120);
    setTimeout(() => clearInterval(t), 9000);
  }

  ready((sel, nav) => {
    const css = document.createElement("style");
    css.textContent = `
      #turbo-btn.on{color:var(--amber-ink,var(--amber))}
      #turbo-btn .dot{display:inline-block;width:7px;height:7px;border-radius:50%;
        background:#3a3d44;margin-right:5px;vertical-align:middle}
      #turbo-btn.on .dot{background:var(--amber-ink,var(--amber));box-shadow:0 0 6px color-mix(in srgb,var(--amber) 60%,transparent)}`;
    document.head.appendChild(css);

    const btn = document.createElement("a");
    btn.href = "#"; btn.id = "turbo-btn"; btn.className = "sitelink";
    function paint() {
      const on = isOn();
      btn.classList.toggle("on", on);
      btn.innerHTML = `<span class="dot"></span>Turbo`;
      const warn = SLOWER[sel.value];
      btn.title = on
        ? "JIT on for this firmware. Click for the stable interpreter."
        : (warn ? warn + " — the interpreter is the better choice here."
                : "Compile hot code to WebAssembly: usually about 3x faster. Reloads the page.");
    }
    btn.onclick = (e) => {
      e.preventDefault();
      const on = !isOn();
      if (on && SLOWER[sel.value] && !confirm(SLOWER[sel.value] + ".\n\nTurn Turbo on anyway?")) return;
      remember(sel.value, on);
      go(sel.value, on);
    };
    nav.insertBefore(btn, nav.firstChild ? nav.firstChild.nextSibling : null);
    paint();

    // While Turbo is on, never hot-switch: that is the path that crashed.
    // Reload into the new firmware instead, keeping the JIT flag.
    sel.addEventListener("change", (e) => {
      if (!isOn()) { paint(); return; }
      e.stopImmediatePropagation();
      e.preventDefault();
      go(sel.value, true);
    }, true);

    window.FM1Turbo = { on: isOn, prefs, _slower: SLOWER, _go: go };
  });
})();
