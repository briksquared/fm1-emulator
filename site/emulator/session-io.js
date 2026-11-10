// Export / import a desktop session bundle: MIDI ports prefs, assist, host panel,
// FX CC, skin, favorites ids, link flags. Does not touch firmware flash blobs.
(function () {
  "use strict";

  const KEYS = [
    "fm1.midi", "fm1.midiout", "fm1.midich", "fm1.midilink",
    "fm1.hostpanel.v1", "fm1.fxcc.v1", "fm1.assist.v1", "fm1.speak.v1",
    "fm1.ab.v1", "fm1.skin", "fm1.keys.touchvel", "fm1.keys.hwproc",
  ];

  function collect() {
    const prefs = {};
    for (const k of KEYS) {
      try {
        const v = localStorage.getItem(k);
        if (v != null) prefs[k] = v;
      } catch {}
    }
    let favorites = [];
    try { favorites = JSON.parse(localStorage.getItem("fm1.favorites") || "[]"); } catch {}
    const fm = window.FM1;
    const running = fm && fm.runningFirmware ? fm.runningFirmware() : null;
    return {
      format: "fm1-emulator-session",
      version: 1,
      at: new Date().toISOString(),
      prefs,
      favorites,
      running,
      ab: (window.FM1Ab && window.FM1Ab.get && window.FM1Ab.get()) || "both",
    };
  }

  function apply(bundle) {
    if (!bundle || bundle.format !== "fm1-emulator-session") throw new Error("Not an FM-1 session file");
    const prefs = bundle.prefs || {};
    for (const k of KEYS) {
      if (prefs[k] == null) continue;
      try { localStorage.setItem(k, prefs[k]); } catch {}
    }
    if (Array.isArray(bundle.favorites)) {
      try { localStorage.setItem("fm1.favorites", JSON.stringify(bundle.favorites)); } catch {}
    }
    if (bundle.ab && window.FM1Ab && window.FM1Ab.set) window.FM1Ab.set(bundle.ab);
    return true;
  }

  function download() {
    const data = collect();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fm1-session-${data.at.slice(0, 19).replace(/[:T]/g, "-")}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return data;
  }

  window.FM1Session = { collect, apply, download, KEYS };

  function ready(fn) {
    const t = setInterval(() => {
      const nav = document.querySelector(".sitenav") || document.querySelector("header.site .wrap");
      if (nav && window.FM1) { clearInterval(t); fn(nav); }
    }, 150);
    setTimeout(() => clearInterval(t), 12000);
  }

  ready((nav) => {
    const btn = document.createElement("a");
    btn.href = "#"; btn.id = "session-btn"; btn.className = "sitelink";
    btn.textContent = "Session";
    btn.title = "Export / import MIDI + UI prefs (not flash saves)";
    nav.appendChild(btn);

    const file = document.createElement("input");
    file.type = "file"; file.accept = "application/json,.json"; file.hidden = true;
    document.body.appendChild(file);

    const css = document.createElement("style");
    css.textContent = `
      #session-pop{position:fixed;z-index:9997;width:280px;max-width:92vw;background:#0c0d0f;border:1px solid #232428;
        border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.6);padding:12px;display:none;flex-direction:column;gap:8px;color:#e9edf2;
        font:12.5px 'Space Grotesk',sans-serif}
      #session-pop.open{display:flex}
      #session-pop button{font:inherit;padding:8px;border-radius:7px;border:1px solid #2a2c31;background:#17181b;color:inherit;cursor:pointer}
      #session-pop .dim{font-size:11px;color:#8c93a0;margin:0;line-height:1.35}`;
    document.head.appendChild(css);

    const pop = document.createElement("div");
    pop.id = "session-pop";
    pop.innerHTML = `
      <b>Session</b>
      <button type="button" id="session-export">Export prefs…</button>
      <button type="button" id="session-import">Import prefs…</button>
      <p class="dim" id="session-status">MIDI ports, assist, FX CC, panel host, skin prefs. Flash saves stay in IndexedDB.</p>`;
    document.body.appendChild(pop);

    pop.querySelector("#session-export").onclick = () => {
      download();
      pop.querySelector("#session-status").textContent = "Exported session JSON.";
      if (window.FM1Announce) window.FM1Announce("Session exported");
    };
    pop.querySelector("#session-import").onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files[0]; file.value = "";
      if (!f) return;
      try {
        apply(JSON.parse(await f.text()));
        pop.querySelector("#session-status").textContent = "Imported — reload recommended so MIDI lists refresh.";
        if (window.FM1Announce) window.FM1Announce("Session imported");
      } catch (e) {
        pop.querySelector("#session-status").textContent = "Import failed: " + ((e && e.message) || e);
      }
    };

    const place = () => {
      const r = (window.FM1PopAnchor && window.FM1PopAnchor(btn)) || btn.getBoundingClientRect();
      pop.style.top = (r.bottom + 6) + "px";
      pop.style.left = Math.max(8, Math.min(r.left, innerWidth - 300)) + "px";
    };
    btn.onclick = (e) => { e.preventDefault(); pop.classList.toggle("open"); if (pop.classList.contains("open")) place(); };
    document.addEventListener("click", (e) => {
      if (e.target !== btn && !btn.contains(e.target) && !pop.contains(e.target)) pop.classList.remove("open");
    });
  });
})();
