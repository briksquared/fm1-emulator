// Turbo: toggle the WebAssembly JIT. With the worker engine (default), JIT is already on;
// this turns it off for stability or forces it on for DARK-1 and other slower-with-JIT firmwares.
// The legacy audio-thread engine still reloads the page when Turbo is on and you change firmware.
import { jitEnabled, usesWorkerEngine, JIT_SLOWER, jitQueryForToggle } from "./jit-policy.js?v=2";

const KEY = "fm1.turbo.v1";
const params = () => new URLSearchParams(location.search);
const workerPath = () => usesWorkerEngine(params());

function isOn(fwId) {
  return jitEnabled({ worker: workerPath(), fwId: fwId || document.getElementById("fw")?.value, params: params() });
}

function remember(id, on) {
  if (!id) return;
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (on) o[id] = true; else delete o[id];
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch (e) { console.warn("turbo: could not save", e); }
}

function go(fwId, wantOn) {
  const p = params();
  if (fwId) p.set("fw", fwId);
  const patch = jitQueryForToggle({ worker: workerPath(), wantOn, fwId });
  if (patch.set) for (const [k, v] of Object.entries(patch.set)) p.set(k, v);
  if (patch.delete) for (const k of patch.delete) p.delete(k);
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
    const on = isOn(sel.value);
    btn.classList.toggle("on", on);
    btn.innerHTML = `<span class="dot"></span>Turbo`;
    const warn = JIT_SLOWER.has(sel.value) ? "This firmware runs faster with the interpreter" : "";
    const worker = workerPath();
    btn.title = on
      ? (worker ? "JIT compiling hot code (default with the worker engine). Click to use the interpreter only."
              : "JIT on. Click for the interpreter.")
      : (warn ? warn + " — click to try JIT anyway (reloads)."
              : (worker ? "Interpreter only. Click to turn JIT back on (reloads)."
                        : "Compile hot code to WebAssembly (~3× on many firmwares). Reloads the page."));
  }
  btn.onclick = (e) => {
    e.preventDefault();
    const on = !isOn(sel.value);
    if (on && JIT_SLOWER.has(sel.value) && !confirm("This firmware has measured slower with Turbo on.\n\nTurn Turbo on anyway?")) return;
    remember(sel.value, on);
    go(sel.value, on);
  };
  nav.insertBefore(btn, nav.firstChild ? nav.firstChild.nextSibling : null);
  paint();

  sel.addEventListener("change", (e) => {
    if (!isOn(sel.value)) { paint(); return; }
    // Worker engine: switch firmware in place (main.js boot). Reload only on the legacy audio-thread path.
    if (workerPath()) { paint(); return; }
    e.stopImmediatePropagation();
    e.preventDefault();
    go(sel.value, true);
  }, true);

  window.FM1Turbo = { on: () => isOn(sel.value), prefs: () => JSON.parse(localStorage.getItem(KEY) || "{}"), _slower: JIT_SLOWER, _go: go };
});
