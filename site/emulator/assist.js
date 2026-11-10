// Play Assist panel: a visible control surface for the global MIDI transforms
// (transpose / chord / scale lock / arp). Those modules already wrap FM1.midi;
// this only drives and persists them so they are not toast-and-palette only.
(function () {
  "use strict";
  const KEY = "fm1.assist.v1";

  function load() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || "{}");
      return o && typeof o === "object" ? o : {};
    } catch { return {}; }
  }
  function save(partial) {
    try {
      const next = { ...load(), ...partial, at: Date.now() };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    } catch { return null; }
  }

  function applySaved() {
    const s = load();
    const T = window.FM1Transpose, C = window.FM1Chords, S = window.FM1Scale, A = window.FM1Arp;
    if (T && Number.isFinite(+s.transpose)) T.set(+s.transpose | 0);
    if (C && typeof s.chord === "string") C.set(s.chord);
    if (S) {
      if (typeof s.scale === "string") S.setScale(s.scale);
      if (Number.isFinite(+s.root)) S.setRoot(+s.root | 0);
    }
    if (A) {
      if (typeof s.arpMode === "string") A.setMode(s.arpMode);
      if (Number.isFinite(+s.arpRate)) A.setRate(+s.arpRate | 0);
      if (s.arpOn) A.enable(); else A.disable();
    }
  }

  function snapshot() {
    const T = window.FM1Transpose, C = window.FM1Chords, S = window.FM1Scale, A = window.FM1Arp;
    return {
      transpose: T ? T.get() : 0,
      chord: C ? C.get() : "off",
      scale: S ? S.get() : "off",
      root: S ? S.getRoot() : 0,
      arpOn: A ? A.enabled() : false,
      arpMode: A ? A.get() : "up",
      arpRate: A ? A.rate() : 125,
    };
  }

  function persist() { return save(snapshot()); }

  function ready(fn) {
    const t = setInterval(() => {
      const nav = document.querySelector(".sitenav") || document.querySelector("header.site .wrap");
      if (nav && window.FM1Transpose && window.FM1Chords && window.FM1Scale && window.FM1Arp && document.body) {
        clearInterval(t); fn(nav);
      }
    }, 150);
    setTimeout(() => clearInterval(t), 12000);
  }

  ready((nav) => {
    applySaved();

    const css = document.createElement("style");
    css.textContent = `
      #assist-pop{position:fixed;z-index:9997;width:300px;max-width:94vw;background:var(--ui-pop,#0c0d0f);border:1px solid var(--ui-line,#232428);
        border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.6);padding:11px 12px;display:none;flex-direction:column;gap:8px;color:var(--ui-text,#e9edf2);
        font:12.5px 'Space Grotesk',sans-serif}
      #assist-pop.open{display:flex}
      #assist-pop .top{display:flex;align-items:center;gap:8px}
      #assist-pop .top b{font-size:13px}
      #assist-pop .top .live{margin-left:auto;font:600 10px 'Space Mono',monospace;color:var(--ui-dim,#8c93a0);max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #assist-pop .row{display:grid;grid-template-columns:68px 1fr;gap:6px;align-items:center}
      #assist-pop .row.span{grid-template-columns:1fr;gap:5px}
      #assist-pop label.cap{font:600 10px 'Space Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--ui-dim,#8c93a0)}
      #assist-pop select,#assist-pop input[type=number]{width:100%;box-sizing:border-box;background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);
        color:var(--ui-text,#e9edf2);border-radius:7px;padding:5px 7px;font:inherit;font-size:12px}
      #assist-pop .btns{display:flex;flex-wrap:wrap;gap:5px}
      #assist-pop .btns button{flex:1 1 auto;min-width:0;background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);
        color:var(--ui-text,#e9edf2);border-radius:7px;padding:5px 7px;font:inherit;font-size:11.5px;cursor:pointer}
      #assist-pop .btns button:hover{border-color:var(--amber)}
      #assist-pop .btns button.on{background:var(--amber);color:var(--ui-on-accent,#111);border-color:transparent;font-weight:700}
      #assist-pop .hint{margin:0;font-size:11px;line-height:1.4;color:var(--ui-dim,#8c93a0)}
      #assist-btn.on{color:var(--amber-ink,var(--amber))}`;
    document.head.appendChild(css);

    const btn = document.createElement("a");
    btn.href = "#"; btn.id = "assist-btn"; btn.className = "sitelink"; btn.textContent = "Play";
    btn.title = "Transpose, chords, scale lock, arpeggiator — applied to every note source";

    const pop = document.createElement("div");
    pop.id = "assist-pop";
    const chordOpts = window.FM1Chords.names().map((n) =>
      `<option value="${n}">${n === "off" ? "Off" : window.FM1Chords.label(n)}</option>`).join("");
    const scaleOpts = window.FM1Scale.scales().map((n) =>
      `<option value="${n}">${window.FM1Scale.label(n)}</option>`).join("");
    const rootOpts = window.FM1Scale.roots().map((n, i) => `<option value="${i}">${n}</option>`).join("");
    const arpOpts = window.FM1Arp.modes().map((m) =>
      `<option value="${m}">${window.FM1Arp.label(m)}</option>`).join("");
    pop.innerHTML = `
      <div class="top"><b>Play assist</b><span class="live" id="as-live"></span></div>
      <div class="row"><label class="cap" for="as-tr">Transpose</label>
        <div class="btns">
          <button type="button" id="as-tr-dn" title="-1 semitone">−1</button>
          <button type="button" id="as-tr-up" title="+1 semitone">+1</button>
          <button type="button" id="as-tr-od" title="-1 octave">−12</button>
          <button type="button" id="as-tr-ou" title="+1 octave">+12</button>
          <button type="button" id="as-tr-0" title="Reset">0</button>
        </div>
      </div>
      <div class="row"><label class="cap" for="as-tr-val">Semitones</label>
        <input id="as-tr-val" type="number" min="-36" max="36" step="1" value="0" aria-label="Transpose semitones">
      </div>
      <div class="row"><label class="cap" for="as-chord">Chord</label>
        <select id="as-chord" aria-label="Chord harmonizer">${chordOpts}</select>
      </div>
      <div class="row"><label class="cap" for="as-scale">Scale</label>
        <select id="as-scale" aria-label="Scale lock">${scaleOpts}</select>
      </div>
      <div class="row"><label class="cap" for="as-root">Root</label>
        <select id="as-root" aria-label="Scale root">${rootOpts}</select>
      </div>
      <div class="row span"><label class="cap">Arpeggiator</label>
        <div class="btns">
          <button type="button" id="as-arp-tog">Off</button>
          <select id="as-arp-mode" aria-label="Arp pattern" style="flex:1.4">${arpOpts}</select>
        </div>
      </div>
      <div class="row"><label class="cap" for="as-arp-rate">Rate ms</label>
        <div class="btns">
          <button type="button" id="as-arp-slow" title="Slower">−</button>
          <input id="as-arp-rate" type="number" min="30" max="1000" step="5" value="125" aria-label="Arp step rate in milliseconds">
          <button type="button" id="as-arp-fast" title="Faster">+</button>
        </div>
      </div>
      <div class="btns"><button type="button" id="as-reset">Reset all assists</button>
        <button type="button" id="as-panic">Panic</button></div>
      <p class="hint">Applies to Keys, dropped MIDI, audition, and the player — not just the on-screen keyboard’s own assists.</p>`;
    document.body.appendChild(pop);

    const live = pop.querySelector("#as-live");
    const trVal = pop.querySelector("#as-tr-val");
    const chordSel = pop.querySelector("#as-chord");
    const scaleSel = pop.querySelector("#as-scale");
    const rootSel = pop.querySelector("#as-root");
    const arpTog = pop.querySelector("#as-arp-tog");
    const arpMode = pop.querySelector("#as-arp-mode");
    const arpRate = pop.querySelector("#as-arp-rate");

    let open = false, syncing = false;
    function paint() {
      syncing = true;
      const s = snapshot();
      trVal.value = String(s.transpose);
      chordSel.value = s.chord;
      scaleSel.value = s.scale;
      rootSel.value = String(s.root);
      arpMode.value = s.arpMode;
      arpRate.value = String(s.arpRate);
      arpTog.textContent = s.arpOn ? "On" : "Off";
      arpTog.classList.toggle("on", s.arpOn);
      const bits = [];
      if (s.transpose) bits.push((s.transpose > 0 ? "+" : "") + s.transpose);
      if (s.chord !== "off") bits.push(window.FM1Chords.label(s.chord));
      if (s.scale !== "off") bits.push(window.FM1Scale.rootName() + " " + window.FM1Scale.label(s.scale));
      if (s.arpOn) bits.push("Arp " + window.FM1Arp.label(s.arpMode));
      live.textContent = bits.length ? bits.join(" · ") : "all off";
      btn.classList.toggle("on", bits.length > 0);
      btn.title = bits.length ? ("Play assist: " + bits.join(", ")) : "Transpose, chords, scale lock, arpeggiator";
      syncing = false;
    }
    function after() { persist(); paint(); }

    pop.querySelector("#as-tr-dn").onclick = () => { window.FM1Transpose.shift(-1); after(); };
    pop.querySelector("#as-tr-up").onclick = () => { window.FM1Transpose.shift(1); after(); };
    pop.querySelector("#as-tr-od").onclick = () => { window.FM1Transpose.shift(-12); after(); };
    pop.querySelector("#as-tr-ou").onclick = () => { window.FM1Transpose.shift(12); after(); };
    pop.querySelector("#as-tr-0").onclick = () => { window.FM1Transpose.reset(); after(); };
    trVal.onchange = () => { if (syncing) return; window.FM1Transpose.set(+trVal.value | 0); after(); };
    chordSel.onchange = () => { if (syncing) return; window.FM1Chords.set(chordSel.value); after(); };
    scaleSel.onchange = () => { if (syncing) return; window.FM1Scale.setScale(scaleSel.value); after(); };
    rootSel.onchange = () => { if (syncing) return; window.FM1Scale.setRoot(+rootSel.value | 0); after(); };
    arpTog.onclick = () => { window.FM1Arp.toggle(); after(); };
    arpMode.onchange = () => {
      if (syncing) return;
      window.FM1Arp.setMode(arpMode.value);
      window.FM1Arp.enable();
      after();
    };
    arpRate.onchange = () => { if (syncing) return; window.FM1Arp.setRate(+arpRate.value | 0); after(); };
    pop.querySelector("#as-arp-slow").onclick = () => { window.FM1Arp.slower(); after(); };
    pop.querySelector("#as-arp-fast").onclick = () => { window.FM1Arp.faster(); after(); };
    pop.querySelector("#as-reset").onclick = () => {
      window.FM1Transpose.reset();
      window.FM1Chords.off();
      window.FM1Scale.off();
      window.FM1Arp.disable();
      after();
    };
    pop.querySelector("#as-panic").onclick = () => {
      (window.FM1Panic && (window.FM1Panic.panicUI || window.FM1Panic.panic) || (() => {}))();
    };

    function place() {
      const r = (window.FM1PopAnchor && window.FM1PopAnchor(btn)) || btn.getBoundingClientRect();
      pop.style.top = (r.bottom + 8) + "px";
      pop.style.left = Math.round(Math.min(r.left, window.innerWidth - 312)) + "px";
    }
    function openPop() { open = true; pop.classList.add("open"); paint(); place(); }
    function closePop() { open = false; pop.classList.remove("open"); }

    btn.onclick = (e) => { e.preventDefault(); open ? closePop() : openPop(); };
    document.addEventListener("click", (e) => {
      if (open && !pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closePop();
    });
    window.addEventListener("resize", () => { if (open) place(); });
    nav.insertBefore(btn, nav.firstChild ? nav.firstChild.nextSibling : null);
    paint();

    // Keep the badge honest when palette / toast shortcuts mutate the modules.
    let lastSnap = "";
    setInterval(() => {
      const cur = JSON.stringify(snapshot());
      if (cur === lastSnap) return;
      lastSnap = cur;
      persist();
      paint();
    }, 700);

    window.FM1Assist = {
      open: openPop, close: closePop, snapshot, persist, applySaved, load,
      _key: KEY,
    };
  });
})();
