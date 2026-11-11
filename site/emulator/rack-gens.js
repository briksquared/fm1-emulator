// Professional generative engines for the FM-1 patch bay.
// Presets · grooves · swing clock · user slots · live meters → window.FM1.midi
(function () {
  "use strict";

  const DEG = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    harm: [0, 2, 3, 5, 7, 8, 11],
    melmin: [0, 2, 3, 5, 7, 9, 11],
    pent: [0, 2, 4, 7, 9],
    pentm: [0, 3, 5, 7, 10],
    blues: [0, 3, 5, 6, 7, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phryg: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    mixo: [0, 2, 4, 5, 7, 9, 10],
    locrian: [0, 1, 3, 5, 6, 8, 10],
    whole: [0, 2, 4, 6, 8, 10],
    dim: [0, 2, 3, 5, 6, 8, 9, 11],
    aug: [0, 3, 4, 7, 8, 11],
    chrom: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    hungarian: [0, 2, 3, 6, 7, 8, 11],
    japanese: [0, 1, 5, 7, 8],
    egyptian: [0, 2, 5, 7, 10],
    hirajoshi: [0, 2, 3, 7, 8],
    pelog: [0, 1, 3, 7, 8],
  };
  const SCALE_OPTS = Object.keys(DEG).map((s) => ({ id: s, label: s }));
  const ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const DIVS = [
    { id: "1", label: "1/1", mul: 4 },
    { id: "2", label: "1/2", mul: 2 },
    { id: "4", label: "1/4", mul: 1 },
    { id: "4t", label: "1/4T", mul: 2 / 3 },
    { id: "8", label: "1/8", mul: 0.5 },
    { id: "8t", label: "1/8T", mul: 1 / 3 },
    { id: "16", label: "1/16", mul: 0.25 },
    { id: "16t", label: "1/16T", mul: 1 / 6 },
    { id: "32", label: "1/32", mul: 0.125 },
    { id: "32t", label: "1/32T", mul: 1 / 12 },
  ];
  const GROOVES = [
    { id: "straight", label: "Straight", swing: 0, accent: [1, 0.85, 0.92, 0.85] },
    { id: "swing", label: "Swing", swing: 0.28, accent: [1, 0.75, 0.95, 0.75] },
    { id: "hard", label: "Hard swing", swing: 0.42, accent: [1, 0.65, 0.9, 0.65] },
    { id: "shuffle", label: "Shuffle", swing: 0.33, accent: [1, 0.7, 1, 0.7] },
    { id: "mpc", label: "MPC", swing: 0.18, accent: [1, 0.8, 0.88, 0.78] },
    { id: "dotted", label: "Dotted", swing: 0.5, accent: [1, 0.6, 0.85, 0.6] },
    { id: "latin", label: "Latin", swing: 0.08, accent: [1, 0.7, 0.95, 0.75] },
    { id: "techno", label: "Techno", swing: 0, accent: [1, 0.9, 0.95, 0.9] },
  ];

  function assistScale() {
    const S = window.FM1Scale;
    if (S && S.enabled && S.enabled()) {
      const name = S.get(), root = S.getRoot() | 0;
      const map = {
        major: "major", minor: "minor", harm: "harm", dorian: "dorian", phryg: "phryg",
        lydian: "lydian", mixo: "mixo", pentM: "pent", pentm: "pentm", blues: "blues",
      };
      return { rootPc: root, scale: map[name] || "pent", follow: true };
    }
    return { rootPc: 0, scale: "pent", follow: false };
  }
  function degrees(p) {
    const a = assistScale();
    const scale = (p.followAssist !== false && a.follow) ? a.scale : (p.scale || "pent");
    const rootPc = (p.followAssist !== false && a.follow) ? a.rootPc : (p.rootPc | 0);
    return { root: 12 * (3 + (p.oct | 0)) + (rootPc % 12), deg: DEG[scale] || DEG.pent, scale, rootPc };
  }
  function degNote(p, degIdx, octShift) {
    const { root, deg } = degrees(p);
    const d = deg[((degIdx % deg.length) + deg.length) % deg.length];
    return clamp(root + d + ((octShift | 0) * 12), 12, 108);
  }
  function chordFromDegree(p, romanIdx, inv) {
    const { root, deg } = degrees(p);
    const i0 = deg[romanIdx % deg.length];
    const i1 = deg[(romanIdx + 2) % deg.length] + ((romanIdx + 2) >= deg.length ? 12 : 0);
    const i2 = deg[(romanIdx + 4) % deg.length] + ((romanIdx + 4) >= deg.length ? 12 : 0);
    let notes = [root + i0, root + i1, root + i2];
    for (let i = 0; i < (inv | 0); i++) notes = [notes[1], notes[2], notes[0] + 12];
    return notes.map((n) => clamp(n, 24, 96));
  }

  function bpmNow() {
    try { if (window.FM1Transport) return window.FM1Transport.getBpm() || 120; } catch {}
    return 120;
  }
  function send(bytes) { try { window.FM1 && window.FM1.midi && window.FM1.midi(bytes); } catch {} }
  function noteOn(n, v, ch) { send([0x90 | ((ch || 0) & 15), n & 127, clamp(v | 0, 1, 127)]); }
  function noteOff(n, ch) { send([0x80 | ((ch || 0) & 15), n & 127, 0]); }
  function cc(ch, num, val) { send([0xb0 | ((ch || 0) & 15), num & 127, clamp(val | 0, 0, 127)]); }
  function allOff(ch) {
    if (ch == null) for (let c = 0; c < 16; c++) send([0xb0 | c, 123, 0]);
    else send([0xb0 | (ch & 15), 123, 0]);
  }
  function running() {
    try { return !!(window.FM1 && window.FM1.running && window.FM1.running()); } catch { return false; }
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  // Swing-aware clock (alternating step delay)
  function makeClock() {
    let timer = 0, step = 0, onTick = null, baseMs = 125, swing = 0, alive = false, bayId = null;
    function schedule() {
      if (!alive) return;
      const odd = step % 2 === 1;
      const delay = baseMs * (odd ? 1 + swing : 1 - swing * 0.55);
      timer = setTimeout(() => {
        if (!alive) return;
        if (bayId) window.FM1BayLeds?.pulse?.(bayId);
        if (onTick) onTick(step++);
        schedule();
      }, Math.max(18, delay));
    }
    return {
      setMs(v) { baseMs = Math.max(18, v | 0); },
      setSwing(v) { swing = clamp(v, 0, 0.6); },
      getMs: () => baseMs,
      step: () => step,
      setBay(id) { bayId = id || null; },
      start(fn) {
        onTick = fn; step = 0; alive = true;
        if (bayId) window.FM1BayLeds?.setActive?.(bayId, true);
        clearTimeout(timer); schedule();
      },
      stop() {
        alive = false; clearTimeout(timer); timer = 0; onTick = null;
        if (bayId) window.FM1BayLeds?.setActive?.(bayId, false);
      },
      running: () => alive,
    };
  }

  function divMs(divId) {
    const d = DIVS.find((x) => x.id === divId) || DIVS[4];
    return Math.max(18, (60000 / bpmNow()) * d.mul);
  }
  function grooveOf(id) { return GROOVES.find((g) => g.id === id) || GROOVES[0]; }
  function accentVel(base, step, groove, human) {
    const g = grooveOf(groove);
    const mul = g.accent[step % g.accent.length] || 1;
    const j = (Math.random() * 2 - 1) * (human || 0) * 28;
    return clamp((base * mul + j) | 0, 1, 127);
  }

  // ---- persistence ----
  function storeKey(kind) { return "fm1.rackgen." + kind + ".v2"; }
  function saveUser(kind, name, data) {
    try {
      const all = JSON.parse(localStorage.getItem(storeKey(kind)) || "{}");
      all[name] = { t: Date.now(), data };
      localStorage.setItem(storeKey(kind), JSON.stringify(all));
    } catch {}
  }
  function loadUserList(kind) {
    try { return Object.keys(JSON.parse(localStorage.getItem(storeKey(kind)) || "{}")); } catch { return []; }
  }
  function loadUser(kind, name) {
    try { return JSON.parse(localStorage.getItem(storeKey(kind)) || "{}")[name]?.data || null; } catch { return null; }
  }

  // ---- DOM ----
  function el(n, cls) { const e = document.createElement(n); if (cls) e.className = cls; return e; }
  function btn(label, cls) { const b = el("button", cls || ""); b.type = "button"; b.textContent = label; return b; }

  function section(title) {
    const s = el("div", "rgen-sec");
    const h = el("div", "rgen-sec-h"); h.textContent = title;
    const body = el("div", "rgen-sec-b");
    s.append(h, body);
    return { el: s, body };
  }

  function slider(label, min, max, step, val, fmt, on) {
    const wrap = el("label", "rgen-slider");
    const top = el("div", "rgen-slider-top");
    const lab = el("span"); lab.textContent = label;
    const read = el("span", "rgen-read");
    top.append(lab, read);
    const inp = el("input"); inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = val;
    const sync = () => { read.textContent = fmt ? fmt(+inp.value) : String(inp.value); };
    inp.oninput = () => { sync(); on(+inp.value); };
    sync(); wrap.append(top, inp);
    return { wrap, inp, set(v) { inp.value = v; sync(); on(+inp.value); }, get: () => +inp.value };
  }
  function select(label, opts, val, on) {
    const wrap = el("label", "rgen-select");
    wrap.appendChild(Object.assign(el("span"), { textContent: label }));
    const sel = el("select");
    opts.forEach((o) => {
      const op = el("option");
      op.value = o.id != null ? o.id : o;
      op.textContent = o.label != null ? o.label : o;
      if (String(op.value) === String(val)) op.selected = true;
      sel.appendChild(op);
    });
    sel.onchange = () => on(sel.value);
    wrap.appendChild(sel);
    return { wrap, sel, set(v) { sel.value = v; on(sel.value); }, get: () => sel.value };
  }
  function chips(label, opts, val, on) {
    const wrap = el("div", "rgen-chips");
    if (label) {
      const c = el("div", "rgen-cap"); c.textContent = label; wrap.appendChild(c);
    }
    const row = el("div", "rgen-chiprow");
    const buttons = [];
    opts.forEach((o) => {
      const id = o.id != null ? o.id : o;
      const lab = o.label != null ? o.label : o;
      const b = btn(lab, String(id) === String(val) ? "on" : "");
      b.onclick = () => { buttons.forEach((x) => x.classList.remove("on")); b.classList.add("on"); on(id); };
      buttons.push(b); row.appendChild(b);
    });
    wrap.appendChild(row);
    return {
      wrap,
      set(v) {
        buttons.forEach((b, i) => {
          const id = opts[i].id != null ? opts[i].id : opts[i];
          b.classList.toggle("on", String(id) === String(v));
        });
        on(v);
      },
    };
  }

  function presetBar(presets, apply) {
    const wrap = el("div", "rgen-presets");
    const cap = el("div", "rgen-cap"); cap.textContent = "Factory presets";
    const row = el("div", "rgen-chiprow rgen-presets-row");
    presets.forEach((p) => {
      const b = btn(p.name, "preset");
      b.title = p.blurb || p.name;
      b.onclick = () => apply(p);
      row.appendChild(b);
    });
    wrap.append(cap, row);
    return wrap;
  }

  function userSlots(kind, getState, applyState) {
    const wrap = el("div", "rgen-user");
    const cap = el("div", "rgen-cap"); cap.textContent = "User slots";
    const row = el("div", "rgen-chiprow");
    const nameIn = el("input"); nameIn.type = "text"; nameIn.placeholder = "slot name"; nameIn.className = "rgen-name";
    const save = btn("Save", "");
    const sel = el("select"); sel.className = "rgen-usersel";
    function refresh() {
      const names = loadUserList(kind);
      sel.innerHTML = "";
      const ph = el("option"); ph.value = ""; ph.textContent = names.length ? "Load…" : "No saves";
      sel.appendChild(ph);
      names.forEach((n) => { const o = el("option"); o.value = n; o.textContent = n; sel.appendChild(o); });
    }
    refresh();
    save.onclick = () => {
      const name = (nameIn.value || "Slot " + (loadUserList(kind).length + 1)).trim().slice(0, 24);
      saveUser(kind, name, getState());
      nameIn.value = name; refresh(); sel.value = name;
    };
    sel.onchange = () => {
      if (!sel.value) return;
      const data = loadUser(kind, sel.value);
      if (data) applyState(data);
    };
    row.append(nameIn, save, sel);
    wrap.append(cap, row);
    return wrap;
  }

  // ---- animation ----
  function makeAnim(kind) {
    const wrap = el("div", "rganim");
    const cv = el("canvas", "rganim-cv");
    cv.width = 360; cv.height = 52;
    wrap.appendChild(cv);
    const ctx = cv.getContext("2d");
    const pulses = [];
    let phase = 0, raf = 0, alive = true, level = 0, notes = [], beat = 0;

    function hit(color, strength) {
      level = Math.min(1, level + (strength == null ? 0.5 : strength));
      pulses.push({ x: Math.random(), life: 1 });
      if (pulses.length > 28) pulses.shift();
    }
    function note(n, color) {
      notes.push({ n: n || 60, life: 1, color: color || "#9ad" });
      if (notes.length > 22) notes.shift();
      hit(color, 0.35);
    }
    function tickBeat() { beat = 1; }
    function paint() {
      const w = cv.width, h = cv.height;
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#12141a"); g.addColorStop(1, "#08090c");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,.045)";
      ctx.beginPath();
      for (let x = 0; x <= w; x += 20) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
      ctx.stroke();
      phase += 0.045 + level * 0.09;
      level *= 0.9; beat *= 0.85;

      if (kind === "bars") {
        for (let i = 0; i < 28; i++) {
          const t = i / 28;
          const wave = 0.35 + 0.65 * Math.abs(Math.sin(phase * 2.2 + t * 9));
          const hh = 5 + wave * (h - 12) * (0.3 + level * 0.85);
          ctx.fillStyle = `hsla(${18 + i * 3},78%,${52 + level * 18}%,${0.4 + level * 0.45})`;
          ctx.fillRect((w / 28) * i + 1.5, h - hh - 3, Math.max(2, w / 28 - 3), hh);
        }
      } else if (kind === "orbit") {
        const cx = w / 2, cy = h / 2;
        for (let i = 0; i < 4; i++) {
          const r = 7 + i * 7 + level * 5 + beat * 3;
          ctx.strokeStyle = `hsla(${175 + i * 28},65%,60%,${0.22 + level * 0.35})`;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
          const a = phase * (0.9 + i * 0.35);
          ctx.fillStyle = `hsla(${45 + i * 40},85%,70%,.95)`;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.3, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (kind === "scope") {
        ctx.strokeStyle = `hsla(38,85%,62%,${0.5 + level * 0.45})`;
        ctx.lineWidth = 1.6; ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const y = h / 2
            + Math.sin(x * 0.07 + phase * 3) * (5 + level * 12 + beat * 4)
            + Math.sin(x * 0.021 + phase) * (2 + level * 5);
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      } else {
        for (const n of notes) {
          n.life *= 0.955;
          const x = ((n.n - 24) / 84) * w;
          const y = 6 + (1 - n.life) * (h - 14);
          ctx.globalAlpha = Math.max(0, n.life);
          ctx.fillStyle = n.color;
          ctx.fillRect(x - 2, y, 4, 4 + (1 - n.life) * 8);
          ctx.globalAlpha = 1;
        }
        notes = notes.filter((n) => n.life > 0.05);
      }
      for (const p of pulses) {
        p.life *= 0.88;
        ctx.globalAlpha = p.life * 0.7;
        ctx.fillStyle = "#f0c050";
        ctx.beginPath(); ctx.arc(p.x * w, h * 0.5, 2 + (1 - p.life) * 12, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      while (pulses.length && pulses[0].life < 0.05) pulses.shift();
      // beat lamp
      ctx.fillStyle = `rgba(240,192,80,${0.15 + beat * 0.55})`;
      ctx.fillRect(0, h - 2, w, 2);
    }
    function loop() { paint(); if (alive) raf = requestAnimationFrame(loop); }
    alive = true; raf = requestAnimationFrame(loop);
    return {
      el: wrap, hit, note, tickBeat,
      start() { if (!alive) { alive = true; raf = requestAnimationFrame(loop); } },
      stop() { /* keep painting idle */ },
    };
  }

  function shell(body, color, animKind, title) {
    const ui = el("div", "rgen");
    ui.style.setProperty("--pc", color || "#9ad");
    if (title) {
      const head = el("div", "rgen-head");
      const t = el("b"); t.textContent = title;
      const sub = el("span"); sub.textContent = "pro";
      head.append(t, sub); ui.appendChild(head);
    }
    const anim = makeAnim(animKind || "dots");
    ui.appendChild(anim.el);
    const status = el("p", "rgen-status");
    status.textContent = "Idle — Start FM-1, load a preset, then ▶";
    const transport = el("div", "rgen-transport");
    body.appendChild(ui);
    return { ui, anim, status, transport };
  }

  function needStart(status) {
    if (running()) return true;
    status.textContent = "Press Start on the FM-1 first.";
    return false;
  }

  function commonMusical(p, parent, opts) {
    opts = opts || {};
    const secR = section("Rhythm");
    const secP = section("Pitch");
    const secF = section("Feel");
    const secO = section("Output");

    const groove = select("Groove", GROOVES, p.groove || "straight", (v) => {
      p.groove = v;
      const g = grooveOf(v);
      if (!opts.lockSwing) p.swing = g.swing;
      if (swing) swing.set(Math.round((p.swing || 0) * 100));
    });
    const div = select("Division", DIVS, p.div || "8", (v) => { p.div = v; });
    const swing = slider("Swing", 0, 60, 1, Math.round((p.swing || 0) * 100), (v) => v + "%", (v) => { p.swing = v / 100; });
    secR.body.append(groove.wrap, div.wrap, swing.wrap);

    const follow = chips(null, [{ id: "assist", label: "Assist scale" }, { id: "local", label: "Local scale" }],
      p.followAssist !== false ? "assist" : "local", (v) => { p.followAssist = v === "assist"; });
    const scale = select("Scale", SCALE_OPTS, p.scale || "pent", (v) => { p.scale = v; });
    const root = select("Root", ROOTS.map((r, i) => ({ id: String(i), label: r })), String(p.rootPc | 0), (v) => { p.rootPc = +v; });
    const oct = slider("Octave", -2, 3, 1, p.oct | 0, (v) => (v >= 0 ? "+" : "") + v, (v) => { p.oct = v; });
    secP.body.append(follow.wrap, scale.wrap, root.wrap, oct.wrap);

    const human = slider("Humanize", 0, 100, 1, Math.round((p.human || 0.2) * 100), (v) => v + "%", (v) => { p.human = v / 100; });
    const vel = slider("Velocity", 1, 127, 1, p.vel || 96, (v) => String(v), (v) => { p.vel = v; });
    const gate = slider("Gate", 8, 160, 1, Math.round((p.gate || 0.7) * 100), (v) => v + "%", (v) => { p.gate = v / 100; });
    secF.body.append(human.wrap, vel.wrap, gate.wrap);

    const ch = slider("MIDI ch", 1, 16, 1, (p.ch | 0) + 1, (v) => String(v), (v) => { p.ch = v - 1; });
    const expr = slider("CC11 expr", 0, 127, 1, p.expr || 0, (v) => v === 0 ? "off" : String(v), (v) => { p.expr = v; });
    secO.body.append(ch.wrap, expr.wrap);

    parent.append(secR.el, secP.el, secF.el, secO.el);
    return {
      groove, div, swing, follow, scale, root, oct, human, vel, gate, ch, expr,
      sync() {
        groove.set(p.groove || "straight");
        div.set(p.div || "8");
        swing.set(Math.round((p.swing || 0) * 100));
        follow.set(p.followAssist !== false ? "assist" : "local");
        scale.set(p.scale || "pent");
        root.set(String(p.rootPc | 0));
        oct.set(p.oct | 0);
        human.set(Math.round((p.human || 0) * 100));
        vel.set(p.vel || 96);
        gate.set(Math.round((p.gate || 0.7) * 100));
        ch.set((p.ch | 0) + 1);
        expr.set(p.expr || 0);
      },
    };
  }

  function armClock(clock, p, anim, onStep) {
    clock.setMs(divMs(p.div));
    clock.setSwing(p.swing || grooveOf(p.groove).swing || 0);
    clock.start((s) => {
      if (s % 4 === 0) anim.tickBeat();
      if (p.expr > 0 && s % 8 === 0) cc(p.ch, 11, p.expr);
      onStep(s);
    });
  }

  // ===================== GATE =====================
  function buildGate(body, bayId) {
    const MAX = 32;
    const p = {
      followAssist: true, scale: "pent", rootPc: 0, oct: 1, div: "16", swing: 0.12, human: 0.22,
      vel: 100, gate: 0.5, ch: 0, groove: "mpc", expr: 0, steps: 16, mutate: 0.08, length: 16,
    };
    const on = Array.from({ length: MAX }, (_, i) => i % 4 === 0 || i % 4 === 2);
    const degs = Array.from({ length: MAX }, (_, i) => i % 5);
    const accents = Array.from({ length: MAX }, (_, i) => i % 4 === 0);
    const probs = Array.from({ length: MAX }, () => 1);
    const { ui, anim, status, transport } = shell(body, "#ff6b4a", "bars", "GATE");

    const presets = [
      { name: "Four", blurb: "Four-on-floor", patch: { div: "8", groove: "techno", swing: 0 }, fill() { for (let i = 0; i < MAX; i++) { on[i] = i % 4 === 0; degs[i] = 0; accents[i] = true; probs[i] = 1; } p.length = 16; } },
      { name: "Offbeat", patch: { div: "8", groove: "swing" }, fill() { for (let i = 0; i < MAX; i++) { on[i] = i % 4 === 2; degs[i] = 4; accents[i] = false; probs[i] = 1; } } },
      { name: "Clave 3-2", patch: { div: "16", groove: "latin" }, fill() { const h = [0, 3, 6, 10, 12]; for (let i = 0; i < MAX; i++) { on[i] = h.includes(i % 16); degs[i] = (h.indexOf(i % 16) + 5) % 5; accents[i] = i % 16 === 0; probs[i] = 1; } } },
      { name: "Clave 2-3", patch: { div: "16", groove: "latin" }, fill() { const h = [0, 2, 5, 7, 10]; for (let i = 0; i < MAX; i++) { on[i] = h.includes(i % 16); degs[i] = i % 5; accents[i] = i % 16 === 0; probs[i] = 1; } } },
      { name: "Gallop", patch: { div: "16", groove: "hard", swing: 0.35 }, fill() { for (let i = 0; i < MAX; i++) { on[i] = i % 3 !== 2; degs[i] = (i * 2) % 5; accents[i] = i % 3 === 0; probs[i] = 0.95; } } },
      { name: "Sparse", patch: { div: "8", groove: "straight", human: 0.4 }, fill() { for (let i = 0; i < MAX; i++) { on[i] = [0, 7, 12, 20].includes(i); degs[i] = [0, 2, 4, 3][i % 4]; accents[i] = i === 0; probs[i] = 1; } } },
      { name: "Dense", patch: { div: "16", gate: 0.32, vel: 86 }, fill() { for (let i = 0; i < MAX; i++) { on[i] = true; degs[i] = i % 7; accents[i] = i % 4 === 0; probs[i] = 0.9; } } },
      { name: "Probable", patch: { div: "16", mutate: 0.2 }, fill() { for (let i = 0; i < MAX; i++) { on[i] = i % 2 === 0; degs[i] = i % 5; accents[i] = i % 8 === 0; probs[i] = 0.55 + (i % 4) * 0.1; } } },
      { name: "Rise 16", patch: { div: "16", scale: "major" }, fill() { for (let i = 0; i < MAX; i++) { on[i] = i % 2 === 0; degs[i] = Math.min(6, (i / 2) | 0); accents[i] = i > 12; probs[i] = 1; } p.length = 16; } },
      { name: "32 House", patch: { div: "16", groove: "techno", length: 32 }, fill() { p.length = 32; for (let i = 0; i < MAX; i++) { on[i] = i % 4 === 0 || i % 8 === 6; degs[i] = i % 8 === 6 ? 4 : 0; accents[i] = i % 4 === 0; probs[i] = 1; } } },
      { name: "Break", patch: { div: "16", groove: "mpc" }, fill() { const h = [0, 2, 3, 5, 8, 10, 11, 13]; for (let i = 0; i < MAX; i++) { on[i] = h.includes(i % 16); degs[i] = [0, 2, 4, 1][i % 4]; accents[i] = i % 16 === 0 || i % 16 === 8; probs[i] = 1; } } },
      { name: "Dembow", patch: { div: "16", groove: "latin" }, fill() { for (let i = 0; i < MAX; i++) { const x = i % 8; on[i] = x === 0 || x === 3 || x === 6; degs[i] = x === 0 ? 0 : 4; accents[i] = x === 0; probs[i] = 1; } } },
    ];
    ui.appendChild(presetBar(presets, (pr) => {
      Object.assign(p, pr.patch || {});
      if (pr.fill) pr.fill();
      paint(); commons.sync(); length.set(p.length || 16);
      status.textContent = "Preset · " + pr.name;
    }));

    const grid = el("div", "rgate-grid16");
    const cells = [];
    function paint() {
      const n = clamp(p.length || 16, 4, MAX);
      cells.forEach((c, i) => {
        c.style.display = i < n ? "" : "none";
        c.classList.toggle("on", on[i]);
        c.classList.toggle("accent", accents[i]);
        c.style.opacity = String(0.35 + probs[i] * 0.65);
        c.textContent = on[i] ? String(degs[i] + 1) : "·";
      });
    }
    for (let i = 0; i < MAX; i++) {
      const c = el("button", "rgate-cell");
      c.type = "button";
      c.onclick = () => { on[i] = !on[i]; paint(); };
      c.oncontextmenu = (e) => {
        e.preventDefault();
        if (e.altKey) probs[i] = probs[i] > 0.7 ? 0.4 : (probs[i] > 0.4 ? 0.15 : 1);
        else if (e.shiftKey) accents[i] = !accents[i];
        else degs[i] = (degs[i] + 1) % 7;
        paint();
      };
      c.title = "click gate · right degree · shift-right accent · alt-right probability";
      grid.appendChild(c); cells.push(c);
    }
    paint();
    ui.appendChild(grid);

    const tools = el("div", "rgen-transport");
    const dens = btn("Fill", ""); const clr = btn("Clear", ""); const mut = btn("Mutate", "");
    const shiftL = btn("←", ""); const shiftR = btn("→", "");
    dens.onclick = () => { for (let i = 0; i < MAX; i++) on[i] = true; paint(); };
    clr.onclick = () => { for (let i = 0; i < MAX; i++) on[i] = false; paint(); };
    mut.onclick = () => {
      for (let i = 0; i < MAX; i++) {
        if (Math.random() < 0.28) on[i] = !on[i];
        if (Math.random() < 0.2) degs[i] = (Math.random() * 7) | 0;
        if (Math.random() < 0.15) probs[i] = 0.3 + Math.random() * 0.7;
      }
      paint(); anim.hit();
    };
    shiftL.onclick = () => {
      on.push(on.shift()); degs.push(degs.shift()); accents.push(accents.shift()); probs.push(probs.shift()); paint();
    };
    shiftR.onclick = () => {
      on.unshift(on.pop()); degs.unshift(degs.pop()); accents.unshift(accents.pop()); probs.unshift(probs.pop()); paint();
    };
    tools.append(dens, clr, mut, shiftL, shiftR);
    ui.appendChild(tools);

    const length = slider("Length", 4, 32, 1, p.length || 16, (v) => v + " steps", (v) => { p.length = v; paint(); });
    const mutate = slider("Live mutate", 0, 60, 1, Math.round((p.mutate || 0) * 100), (v) => v + "%", (v) => { p.mutate = v / 100; });
    ui.append(length.wrap, mutate.wrap);

    const commons = commonMusical(p, ui);
    ui.appendChild(userSlots("gate", () => ({ p: { ...p }, on: on.slice(), degs: degs.slice(), accents: accents.slice(), probs: probs.slice() }), (data) => {
      Object.assign(p, data.p || {});
      if (data.on) data.on.forEach((v, i) => { on[i] = v; });
      if (data.degs) data.degs.forEach((v, i) => { degs[i] = v; });
      if (data.accents) data.accents.forEach((v, i) => { accents[i] = v; });
      if (data.probs) data.probs.forEach((v, i) => { probs[i] = v; });
      paint(); commons.sync(); length.set(p.length || 16);
      status.textContent = "Loaded user slot";
    }));

    const clock = makeClock();
    if (bayId) clock.setBay(bayId);
    let lit = -1;
    const play = btn("▶ Gate", "play");
    const stop = btn("■", "stop");
    transport.append(play, stop);
    ui.append(transport, status);

    stop.onclick = () => {
      clock.stop(); allOff(p.ch);
      cells.forEach((c) => c.classList.remove("lit")); lit = -1;
      status.textContent = "Stopped";
    };
    play.onclick = () => {
      if (!needStart(status)) return;
      stop.onclick();
      armClock(clock, p, anim, (s) => {
        const nSteps = clamp(p.length || 16, 4, MAX);
        const i = s % nSteps;
        if (lit >= 0) cells[lit].classList.remove("lit");
        cells[i].classList.add("lit"); lit = i;
        if (!on[i]) return;
        if (Math.random() > probs[i]) return;
        if (p.mutate > 0 && Math.random() < p.mutate) return;
        const note = degNote(p, degs[i], 0);
        const v = accentVel(accents[i] ? Math.min(127, p.vel + 16) : p.vel, i, p.groove, p.human);
        noteOn(note, v, p.ch);
        anim.note(note, "#ff6b4a");
        setTimeout(() => noteOff(note, p.ch), Math.max(22, clock.getMs() * p.gate));
      });
      status.textContent = `Gate · ${p.length} steps · ${bpmNow()} BPM · ${p.groove}`;
    };
  }

  // ===================== PIANIST =====================
  function buildPianist(body, bayId) {
    const STYLES = [
      { id: "comp", label: "Comp" }, { id: "alberti", label: "Alberti" }, { id: "waltz", label: "Waltz" },
      { id: "boom", label: "Boom" }, { id: "stride", label: "Stride" }, { id: "broken", label: "Broken" },
      { id: "arp8", label: "Arp8" }, { id: "ballad", label: "Ballad" }, { id: "samba", label: "Samba" },
      { id: "gospel", label: "Gospel" }, { id: "bossa", label: "Bossa" }, { id: "house", label: "House" },
    ];
    const PROGS = [
      { id: "none", label: "Static", seq: [0] },
      { id: "pop", label: "I–V–vi–IV", seq: [0, 4, 5, 3] },
      { id: "jazz", label: "ii–V–I", seq: [1, 4, 0, 0] },
      { id: "andalu", label: "Andalusian", seq: [0, 6, 5, 4] },
      { id: "axis", label: "Axis", seq: [0, 2, 3, 4] },
      { id: "canon", label: "Canon", seq: [0, 4, 5, 2, 3, 0, 3, 4] },
      { id: "blues", label: "Blues 12", seq: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4] },
      { id: "modal", label: "Modal vamp", seq: [0, 0, 3, 3] },
    ];
    const p = {
      followAssist: true, scale: "major", rootPc: 0, oct: 0, div: "8", swing: 0.1, human: 0.22,
      vel: 84, gate: 0.95, ch: 0, groove: "swing", expr: 0, style: "comp", inv: 0, dens: 1,
      spread: 0, prog: "pop", barsPer: 1, seventh: 0.35, voiceLead: 1,
    };
    const { ui, anim, status, transport } = shell(body, "#f0c050", "orbit", "PIANIST");
    const presets = [
      { name: "Jazz Comp", patch: { style: "comp", prog: "jazz", groove: "swing", div: "2", human: 0.4, seventh: 0.7, scale: "dorian" } },
      { name: "Pop Ballad", patch: { style: "ballad", prog: "pop", div: "2", vel: 64, human: 0.35, gate: 1.2 } },
      { name: "Classical", patch: { style: "alberti", prog: "canon", div: "8", groove: "straight", human: 0.12 } },
      { name: "Waltz", patch: { style: "waltz", prog: "pop", div: "4", swing: 0 } },
      { name: "Country", patch: { style: "boom", prog: "pop", groove: "shuffle", div: "8" } },
      { name: "Stride", patch: { style: "stride", prog: "jazz", div: "8", vel: 92 } },
      { name: "Bossa", patch: { style: "bossa", prog: "jazz", groove: "latin", div: "16", seventh: 0.8 } },
      { name: "Gospel", patch: { style: "gospel", prog: "pop", div: "4", vel: 90, seventh: 0.5 } },
      { name: "House Pad", patch: { style: "house", prog: "modal", div: "8", groove: "techno", dens: 0.85 } },
      { name: "Samba LH", patch: { style: "samba", prog: "axis", div: "16", groove: "latin" } },
      { name: "Broken 5ths", patch: { style: "broken", prog: "none", scale: "minor", div: "8" } },
      { name: "Arp Wash", patch: { style: "arp8", prog: "pop", div: "16", vel: 70, gate: 0.4 } },
    ];
    ui.appendChild(presetBar(presets, (pr) => {
      Object.assign(p, pr.patch || {}); sync(); status.textContent = "Preset · " + pr.name;
    }));
    const styleChips = chips("Style", STYLES, p.style, (v) => { p.style = v; });
    const prog = select("Progression", PROGS, p.prog, (v) => { p.prog = v; });
    ui.append(styleChips.wrap, prog.wrap);
    const commons = commonMusical(p, ui);
    const inv = slider("Inversion", 0, 3, 1, 0, (v) => String(v), (v) => { p.inv = v; });
    const dens = slider("Density", 20, 100, 1, 100, (v) => v + "%", (v) => { p.dens = v / 100; });
    const spread = slider("Spread", 0, 100, 1, 0, (v) => v + "%", (v) => { p.spread = v / 100; });
    const seventh = slider("7ths", 0, 100, 1, 35, (v) => v + "%", (v) => { p.seventh = v / 100; });
    const barsPer = slider("Chord bars", 1, 4, 1, 1, (v) => String(v), (v) => { p.barsPer = v; });
    ui.append(inv.wrap, dens.wrap, spread.wrap, seventh.wrap, barsPer.wrap);

    function sync() {
      styleChips.set(p.style); prog.set(p.prog); commons.sync();
      inv.set(p.inv | 0); dens.set(Math.round((p.dens || 1) * 100));
      spread.set(Math.round((p.spread || 0) * 100)); seventh.set(Math.round((p.seventh || 0) * 100));
      barsPer.set(p.barsPer || 1);
    }
    ui.appendChild(userSlots("pianist", () => ({ ...p }), (d) => { Object.assign(p, d); sync(); status.textContent = "Loaded user slot"; }));

    let held = [], clock = makeClock(), progStep = 0, lastChord = [];
    if (bayId) clock.setBay(bayId);
    function currentRootDegree(s) {
      const pr = PROGS.find((x) => x.id === p.prog) || PROGS[0];
      const bar = Math.floor(s / (4 * (p.barsPer || 1)));
      return pr.seq[bar % pr.seq.length];
    }
    function voicing(s) {
      const roman = currentRootDegree(s);
      let notes = chordFromDegree(p, roman, p.inv);
      if (p.seventh > 0.05 && Math.random() < p.seventh) {
        const { root, deg } = degrees(p);
        notes.push(clamp(root + deg[(roman + 6) % deg.length] + ((roman + 6) >= deg.length ? 12 : 0), 24, 96));
      }
      if (p.spread > 0.01) notes = notes.map((n, i) => n + Math.round(i * p.spread * 7));
      if (p.voiceLead && lastChord.length) {
        notes = notes.map((n, i) => {
          const prev = lastChord[Math.min(i, lastChord.length - 1)];
          while (n - prev > 6) n -= 12;
          while (prev - n > 6) n += 12;
          return clamp(n, 24, 96);
        });
      }
      lastChord = notes.slice();
      return notes;
    }
    function patternNotes(s) {
      const tri = voicing(s);
      const base = tri[0] - 12;
      const st = p.style;
      if (st === "alberti") return [[tri[0]], [tri[2]], [tri[1]], [tri[2]]];
      if (st === "waltz") { const c = s % 3; return [c === 0 ? [tri[0]] : (c === 1 ? [tri[1]] : [tri[2]])]; }
      if (st === "boom") return [s % 2 === 0 ? [base] : [tri[1], tri[2]]];
      if (st === "stride") return [s % 2 === 0 ? [base] : tri];
      if (st === "broken") return [[tri[0]], [tri[1]], [tri[0]], [tri[2]]];
      if (st === "arp8") {
        const seq = [tri[0], tri[1], tri[2], tri[1] + 12, tri[2], tri[1], tri[0], tri[1]];
        return [[seq[s % seq.length]]];
      }
      if (st === "ballad") return [s % 4 === 0 ? tri : []];
      if (st === "samba") {
        const hits = [1, 0, 1, 0, 1, 1, 0, 1];
        return [hits[s % 8] ? (s % 2 === 0 ? [base] : [tri[1], tri[2]]) : []];
      }
      if (st === "bossa") {
        const hits = [1, 0, 0, 1, 0, 1, 0, 0];
        return [hits[s % 8] ? tri : []];
      }
      if (st === "gospel") return [s % 2 === 0 ? [...tri, tri[0] + 12] : []];
      if (st === "house") return [s % 2 === 0 ? tri : [tri[0], tri[2]]];
      return [s % 4 === 0 ? tri : (s % 4 === 2 ? [tri[0], tri[2]] : [])];
    }

    const play = btn("▶ Accompany", "play");
    const stop = btn("■", "stop");
    transport.append(play, stop);
    ui.append(transport, status);

    stop.onclick = () => {
      clock.stop(); for (const n of held) noteOff(n, p.ch); held = []; allOff(p.ch); status.textContent = "Stopped";
    };
    play.onclick = () => {
      if (!needStart(status)) return;
      stop.onclick(); progStep = 0; lastChord = [];
      armClock(clock, p, anim, (s) => {
        for (const n of held) noteOff(n, p.ch);
        held = [];
        if (Math.random() > (p.dens || 1)) return;
        const choices = patternNotes(s);
        const notes = choices[s % choices.length] || [];
        for (const n of notes) {
          const nn = clamp(n, 24, 88);
          held.push(nn);
          noteOn(nn, accentVel(p.vel, s, p.groove, p.human), p.ch);
          anim.note(nn, "#f0c050");
        }
      });
      status.textContent = `Pianist · ${p.style} · ${p.prog} · ${bpmNow()} BPM`;
    };
  }

  // ===================== QUANT =====================
  function buildQuant(body, bayId) {
    const CONTOURS = [
      { id: "free", label: "Free" }, { id: "arch", label: "Arch" }, { id: "rise", label: "Rise" },
      { id: "fall", label: "Fall" }, { id: "wave", label: "Wave" }, { id: "pend", label: "Pendulum" },
    ];
    const p = {
      followAssist: true, scale: "pent", rootPc: 0, oct: 1, div: "8", swing: 0.1, human: 0.28,
      vel: 92, gate: 0.68, ch: 0, groove: "mpc", expr: 0, dens: 0.62, leap: 0.32, stepBias: 0.55,
      rest: 0.08, motif: 0.28, repeat: 0.18, rangeLo: 0, rangeHi: 2, contour: "free", phrase: 8,
      syncop: 0.15, seed: (Math.random() * 1e9) | 0,
    };
    const { ui, anim, status, transport } = shell(body, "#6ec8ff", "scope", "QUANT");
    const presets = [
      { name: "Gentle", patch: { dens: 0.32, leap: 0.08, stepBias: 0.9, div: "8", vel: 76, contour: "arch", human: 0.4 } },
      { name: "Stepwise", patch: { dens: 0.75, leap: 0.04, stepBias: 0.96, div: "16", contour: "pend" } },
      { name: "Leapy", patch: { dens: 0.55, leap: 0.8, stepBias: 0.15, contour: "free" } },
      { name: "Dense", patch: { dens: 0.94, div: "16", gate: 0.35, vel: 84, syncop: 0.25 } },
      { name: "Ambient", patch: { dens: 0.2, div: "2", gate: 1.35, vel: 58, scale: "whole", contour: "wave" } },
      { name: "Frenzy", patch: { dens: 0.96, div: "32", gate: 0.28, human: 0.1, syncop: 0.4 } },
      { name: "Motivic", patch: { dens: 0.68, motif: 0.75, repeat: 0.5, phrase: 4, leap: 0.18 } },
      { name: "Call/Resp", patch: { dens: 0.5, rest: 0.28, motif: 0.55, phrase: 8 } },
      { name: "Bluesy", patch: { dens: 0.55, scale: "blues", swing: 0.38, groove: "shuffle", leap: 0.28 } },
      { name: "Modal", patch: { dens: 0.5, scale: "dorian", contour: "arch", phrase: 16 } },
      { name: "Minimal", patch: { dens: 0.4, repeat: 0.7, motif: 0.6, leap: 0.05, phrase: 4, vel: 70 } },
      { name: "Cinematic", patch: { dens: 0.35, contour: "rise", phrase: 16, gate: 1.1, vel: 78, scale: "harm" } },
    ];
    ui.appendChild(presetBar(presets, (pr) => { Object.assign(p, pr.patch || {}); sync(); status.textContent = "Preset · " + pr.name; }));
    const contour = chips("Contour", CONTOURS, p.contour, (v) => { p.contour = v; });
    ui.appendChild(contour.wrap);
    const commons = commonMusical(p, ui);
    const dens = slider("Density", 5, 100, 1, Math.round(p.dens * 100), (v) => v + "%", (v) => { p.dens = v / 100; });
    const leap = slider("Leap", 0, 100, 1, Math.round(p.leap * 100), (v) => v + "%", (v) => { p.leap = v / 100; });
    const stepBias = slider("Step bias", 0, 100, 1, Math.round(p.stepBias * 100), (v) => v + "%", (v) => { p.stepBias = v / 100; });
    const rest = slider("Rest", 0, 60, 1, Math.round(p.rest * 100), (v) => v + "%", (v) => { p.rest = v / 100; });
    const motif = slider("Motif lock", 0, 100, 1, Math.round(p.motif * 100), (v) => v + "%", (v) => { p.motif = v / 100; });
    const repeat = slider("Repeat", 0, 100, 1, Math.round(p.repeat * 100), (v) => v + "%", (v) => { p.repeat = v / 100; });
    const phrase = slider("Phrase", 2, 32, 1, p.phrase, (v) => v + " steps", (v) => { p.phrase = v; });
    const syncop = slider("Syncopation", 0, 80, 1, Math.round(p.syncop * 100), (v) => v + "%", (v) => { p.syncop = v / 100; });
    const lo = slider("Oct low", 0, 2, 1, p.rangeLo, (v) => String(v), (v) => { p.rangeLo = v; });
    const hi = slider("Oct high", 0, 3, 1, p.rangeHi, (v) => String(v), (v) => { p.rangeHi = v; });
    ui.append(dens.wrap, leap.wrap, stepBias.wrap, rest.wrap, motif.wrap, repeat.wrap, phrase.wrap, syncop.wrap, lo.wrap, hi.wrap);

    function sync() {
      contour.set(p.contour); commons.sync();
      dens.set(Math.round(p.dens * 100)); leap.set(Math.round(p.leap * 100));
      stepBias.set(Math.round(p.stepBias * 100)); rest.set(Math.round(p.rest * 100));
      motif.set(Math.round(p.motif * 100)); repeat.set(Math.round(p.repeat * 100));
      phrase.set(p.phrase); syncop.set(Math.round(p.syncop * 100)); lo.set(p.rangeLo); hi.set(p.rangeHi);
    }
    ui.appendChild(userSlots("quant", () => ({ ...p }), (d) => { Object.assign(p, d); sync(); status.textContent = "Loaded user slot"; }));

    let seed = p.seed, last = null, degIdx = 0, motifBuf = [], clock = makeClock();
    if (bayId) clock.setBay(bayId);
    function rng() {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function contourTarget(s, len) {
      const t = (s % (p.phrase || 8)) / Math.max(1, (p.phrase || 8) - 1);
      if (p.contour === "rise") return t;
      if (p.contour === "fall") return 1 - t;
      if (p.contour === "arch") return 1 - Math.abs(t * 2 - 1);
      if (p.contour === "wave") return 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
      if (p.contour === "pend") return (s % 2);
      return rng();
    }

    const play = btn("▶ Generate", "play");
    const stop = btn("■", "stop");
    const dice = btn("🎲 Reseed", "");
    dice.onclick = () => { seed = (Math.random() * 1e9) | 0; p.seed = seed; status.textContent = "Seed " + seed; anim.hit(); };
    transport.append(play, stop, dice);
    ui.append(transport, status);

    stop.onclick = () => {
      clock.stop(); if (last != null) noteOff(last, p.ch); last = null; allOff(p.ch); status.textContent = "Stopped";
    };
    play.onclick = () => {
      if (!needStart(status)) return;
      stop.onclick(); degIdx = 0; motifBuf = [];
      armClock(clock, p, anim, (s) => {
        if (p.syncop > 0 && s % 2 === 1 && rng() < p.syncop) return;
        if (rng() < p.rest) return;
        if (rng() > p.dens) return;
        const { deg } = degrees(p);
        if (p.repeat > 0 && last != null && rng() < p.repeat) {
          noteOn(last, accentVel(p.vel, s, p.groove, p.human), p.ch);
          anim.note(last, "#6ec8ff");
          const hold = last;
          setTimeout(() => { if (last === hold) { noteOff(hold, p.ch); last = null; } }, Math.max(28, clock.getMs() * p.gate));
          return;
        }
        if (p.motif > 0.05 && motifBuf.length >= 3 && rng() < p.motif) {
          degIdx = motifBuf[(rng() * motifBuf.length) | 0];
        } else if (p.contour !== "free") {
          degIdx = Math.floor(contourTarget(s, deg.length) * (deg.length - 0.001));
        } else if (rng() < p.stepBias) {
          degIdx += rng() < 0.5 ? 1 : -1;
        } else if (rng() < p.leap) {
          degIdx += ((rng() * 5) | 0) - 2;
        } else degIdx = (rng() * deg.length) | 0;
        degIdx = ((degIdx % deg.length) + deg.length) % deg.length;
        motifBuf.push(degIdx); if (motifBuf.length > 10) motifBuf.shift();
        const octS = p.rangeLo + ((rng() * (p.rangeHi - p.rangeLo + 1)) | 0);
        const n = degNote(p, degIdx, octS - 1);
        if (last != null) noteOff(last, p.ch);
        last = n;
        noteOn(n, accentVel(p.vel, s, p.groove, p.human), p.ch);
        anim.note(n, "#6ec8ff");
        setTimeout(() => { if (last === n) { noteOff(n, p.ch); last = null; } }, Math.max(28, clock.getMs() * p.gate));
      });
      status.textContent = `Quantum · ${p.contour} · dens ${Math.round(p.dens * 100)}% · ${bpmNow()} BPM`;
    };
  }

  // ===================== EUCLID =====================
  function buildEuclid(body, bayId) {
    const p = {
      followAssist: true, scale: "pent", rootPc: 0, oct: 1, div: "16", swing: 0, human: 0.18,
      vel: 108, gate: 0.48, ch: 0, groove: "straight", expr: 0, steps: 16, hits: 5, rot: 0,
      degIdx: 0, fill: 0, accentEvery: 4, layerB: 0, xor: 0, hitsB: 3, rotB: 2,
    };
    const { ui, anim, status, transport } = shell(body, "#7dffb3", "bars", "EUCLID");
    const presets = [
      { name: "5/16", patch: { steps: 16, hits: 5, rot: 0 } },
      { name: "7/12", patch: { steps: 12, hits: 7 } },
      { name: "Tresillo", patch: { steps: 8, hits: 3, div: "8" } },
      { name: "Son", patch: { steps: 16, hits: 5, rot: 3 } },
      { name: "Rum", patch: { steps: 16, hits: 5, degIdx: 4 } },
      { name: "Shaker", patch: { steps: 16, hits: 9, rot: 1, vel: 68, gate: 0.28 } },
      { name: "Sparse", patch: { steps: 16, hits: 3, rot: 2, div: "8" } },
      { name: "Dense", patch: { steps: 16, hits: 11, gate: 0.32 } },
      { name: "Bjorklund", patch: { steps: 13, hits: 5 } },
      { name: "XOR Dual", patch: { steps: 16, hits: 5, hitsB: 7, xor: 1, layerB: 1 } },
      { name: "Layered", patch: { steps: 16, hits: 4, hitsB: 6, layerB: 1, rotB: 3, degIdx: 0 } },
      { name: "Pulse", patch: { steps: 8, hits: 8, div: "8" } },
    ];
    ui.appendChild(presetBar(presets, (pr) => { Object.assign(p, pr.patch || {}); sync(); paint(); status.textContent = "Preset · " + pr.name; }));

    function bjork(steps, hits, rot) {
      const pat = Array(steps).fill(false);
      if (hits > 0) for (let i = 0; i < hits; i++) pat[Math.floor((i * steps) / hits) % steps] = true;
      const r = ((rot % steps) + steps) % steps;
      return pat.slice(r).concat(pat.slice(0, r));
    }
    const dots = el("div", "reucl-dots");
    function paint() {
      dots.innerHTML = "";
      const a = bjork(p.steps, p.hits, p.rot);
      const b = p.layerB ? bjork(p.steps, p.hitsB, p.rotB) : null;
      a.forEach((on, i) => {
        let lit = on;
        if (b) lit = p.xor ? (on !== b[i]) : (on || b[i]);
        const d = el("span", "reucl-dot" + (lit ? " on" : "") + (b && b[i] && !on ? " b" : ""));
        dots.appendChild(d);
      });
    }
    paint();
    ui.appendChild(dots);
    const commons = commonMusical(p, ui);
    const hitsIn = slider("Hits A", 0, 32, 1, p.hits, (v) => String(v), (v) => { p.hits = v; paint(); });
    const stepsIn = slider("Steps", 2, 32, 1, p.steps, (v) => String(v), (v) => { p.steps = v; paint(); });
    const rotIn = slider("Rotate A", 0, 31, 1, p.rot, (v) => String(v), (v) => { p.rot = v; paint(); });
    const hitsB = slider("Hits B", 0, 32, 1, p.hitsB, (v) => String(v), (v) => { p.hitsB = v; paint(); });
    const rotB = slider("Rotate B", 0, 31, 1, p.rotB, (v) => String(v), (v) => { p.rotB = v; paint(); });
    const layer = chips("Layer B", [{ id: "off", label: "Off" }, { id: "or", label: "OR" }, { id: "xor", label: "XOR" }], "off", (v) => {
      p.layerB = v === "off" ? 0 : 1; p.xor = v === "xor" ? 1 : 0; paint();
    });
    const degIn = slider("Degree", 1, 7, 1, 1, (v) => String(v), (v) => { p.degIdx = v - 1; });
    const fill = slider("Fill", 0, 100, 1, 0, (v) => v + "%", (v) => { p.fill = v / 100; });
    const acc = slider("Accent every", 0, 8, 1, 4, (v) => v === 0 ? "off" : String(v), (v) => { p.accentEvery = v; });
    ui.append(hitsIn.wrap, stepsIn.wrap, rotIn.wrap, layer.wrap, hitsB.wrap, rotB.wrap, degIn.wrap, fill.wrap, acc.wrap);

    function sync() {
      commons.sync(); hitsIn.set(p.hits); stepsIn.set(p.steps); rotIn.set(p.rot);
      hitsB.set(p.hitsB); rotB.set(p.rotB); degIn.set((p.degIdx | 0) + 1);
      layer.set(!p.layerB ? "off" : (p.xor ? "xor" : "or"));
      fill.set(Math.round((p.fill || 0) * 100)); acc.set(p.accentEvery | 0);
    }
    ui.appendChild(userSlots("euclid", () => ({ ...p }), (d) => { Object.assign(p, d); sync(); paint(); status.textContent = "Loaded user slot"; }));

    const clock = makeClock();
    if (bayId) clock.setBay(bayId);
    const play = btn("▶ Euclid", "play");
    const stop = btn("■", "stop");
    transport.append(play, stop);
    ui.append(transport, status);

    stop.onclick = () => { clock.stop(); allOff(p.ch); status.textContent = "Stopped"; };
    play.onclick = () => {
      if (!needStart(status)) return;
      stop.onclick();
      armClock(clock, p, anim, (s) => {
        const a = bjork(p.steps, p.hits, p.rot);
        const b = p.layerB ? bjork(p.steps, p.hitsB, p.rotB) : null;
        const i = s % a.length;
        [...dots.children].forEach((d, di) => d.classList.toggle("lit", di === i));
        let fire = a[i];
        if (b) fire = p.xor ? (a[i] !== b[i]) : (a[i] || b[i]);
        if (!fire && !(p.fill > 0 && Math.random() < p.fill)) return;
        const accent = p.accentEvery > 0 && (i % p.accentEvery === 0);
        const n = degNote(p, p.degIdx, accent && Math.random() < 0.25 ? 1 : 0);
        noteOn(n, accentVel(accent ? Math.min(127, p.vel + 14) : p.vel, i, p.groove, p.human), p.ch);
        anim.note(n, "#7dffb3");
        setTimeout(() => noteOff(n, p.ch), Math.max(22, clock.getMs() * p.gate));
      });
      status.textContent = `Euclid ${p.hits}/${p.steps} · ${bpmNow()} BPM`;
    };
  }

  // ===================== BASS =====================
  function buildBass(body, bayId) {
    const MODES = [
      { id: "walk", label: "Walk" }, { id: "acid", label: "Acid" }, { id: "dub", label: "Dub" },
      { id: "octaves", label: "Octaves" }, { id: "pedal", label: "Pedal" }, { id: "funk", label: "Funk" },
      { id: "latin", label: "Latin" }, { id: "chromatic", label: "Chrom" }, { id: "fifths", label: "5ths" },
      { id: "gallop", label: "Gallop" }, { id: "approach", label: "Approach" }, { id: "rego", label: "Reggae" },
    ];
    const p = {
      followAssist: true, scale: "minor", rootPc: 0, oct: -1, div: "8", swing: 0.14, human: 0.2,
      vel: 112, gate: 0.68, ch: 0, groove: "mpc", expr: 0, mode: "walk", drive: 0.35, space: 0.08,
      slide: 0.2, ghost: 0.15, approach: 0.25,
    };
    const { ui, anim, status, transport } = shell(body, "#c9a0ff", "scope", "BASS");
    const presets = [
      { name: "Walking", patch: { mode: "walk", groove: "swing", div: "8", scale: "mixo" } },
      { name: "303 Acid", patch: { mode: "acid", div: "16", gate: 0.38, drive: 0.75, slide: 0.55, scale: "minor" } },
      { name: "Dub", patch: { mode: "dub", div: "4", space: 0.45, vel: 120, gate: 1.15 } },
      { name: "Octave Pump", patch: { mode: "octaves", div: "8", groove: "techno" } },
      { name: "Pedal", patch: { mode: "pedal", div: "2", gate: 1.4, vel: 92 } },
      { name: "Funk", patch: { mode: "funk", div: "16", groove: "mpc", swing: 0.28, ghost: 0.35, gate: 0.32 } },
      { name: "Latin", patch: { mode: "latin", div: "16", groove: "latin", scale: "dorian" } },
      { name: "Approach", patch: { mode: "approach", approach: 0.7, div: "8", scale: "major" } },
      { name: "Reggae", patch: { mode: "rego", div: "8", space: 0.3, groove: "straight" } },
      { name: "Metal Gallop", patch: { mode: "gallop", div: "16", gate: 0.32, vel: 122, groove: "straight" } },
      { name: "Chrom Walk", patch: { mode: "chromatic", followAssist: false, scale: "chrom", div: "8" } },
      { name: "Power 5ths", patch: { mode: "fifths", div: "8", vel: 118 } },
    ];
    ui.appendChild(presetBar(presets, (pr) => { Object.assign(p, pr.patch || {}); sync(); status.textContent = "Preset · " + pr.name; }));
    const modeChips = chips("Mode", MODES, p.mode, (v) => { p.mode = v; });
    ui.appendChild(modeChips.wrap);
    const commons = commonMusical(p, ui);
    const drive = slider("Drive", 0, 100, 1, 35, (v) => v + "%", (v) => { p.drive = v / 100; });
    const space = slider("Space", 0, 80, 1, 8, (v) => v + "%", (v) => { p.space = v / 100; });
    const slide = slider("Slide feel", 0, 100, 1, 20, (v) => v + "%", (v) => { p.slide = v / 100; });
    const ghost = slider("Ghost notes", 0, 70, 1, 15, (v) => v + "%", (v) => { p.ghost = v / 100; });
    const approach = slider("Approach", 0, 100, 1, 25, (v) => v + "%", (v) => { p.approach = v / 100; });
    ui.append(drive.wrap, space.wrap, slide.wrap, ghost.wrap, approach.wrap);
    function sync() {
      modeChips.set(p.mode); commons.sync();
      drive.set(Math.round(p.drive * 100)); space.set(Math.round(p.space * 100));
      slide.set(Math.round(p.slide * 100)); ghost.set(Math.round(p.ghost * 100)); approach.set(Math.round(p.approach * 100));
    }
    ui.appendChild(userSlots("bass", () => ({ ...p }), (d) => { Object.assign(p, d); sync(); status.textContent = "Loaded user slot"; }));

    let last = null, step = 0, target = 0, clock = makeClock();
    if (bayId) clock.setBay(bayId);
    function nextNote(s) {
      const { root, deg } = degrees(p);
      const base = clamp(root - 12, 24, 55);
      const m = p.mode;
      if (m === "acid") {
        const pool = [0, 0, 7, 12, 3, 0, 10, 0, 12, 7, 0, 5, 0, 0, 10, 12];
        return base + pool[s % pool.length];
      }
      if (m === "dub") return s % 4 === 0 ? base : (s % 4 === 2 && Math.random() > p.space ? base + 2 : null);
      if (m === "octaves") return s % 2 === 0 ? base : base + 12;
      if (m === "pedal") return base;
      if (m === "funk") {
        if (s % 2 === 1 && Math.random() < 0.45 + p.space) return Math.random() < p.ghost ? base : null;
        return base + deg[(s * 2) % deg.length] - ((s % 8 === 4) ? 12 : 0);
      }
      if (m === "latin") {
        const hits = [1, 0, 1, 0, 1, 1, 0, 1];
        if (!hits[s % 8]) return null;
        return base + deg[s % deg.length];
      }
      if (m === "chromatic") return base + (s % 12);
      if (m === "fifths") return s % 2 === 0 ? base : base + 7;
      if (m === "gallop") {
        const g = [1, 1, 1, 0];
        if (!g[s % 4]) return null;
        return base + ((s % 8 < 4) ? 0 : 7);
      }
      if (m === "rego") return s % 4 === 2 ? base : null;
      if (m === "approach") {
        target = base + deg[Math.floor(s / 2) % deg.length];
        if (s % 2 === 0 && Math.random() < p.approach) return target + (Math.random() < 0.5 ? -1 : 1);
        return target;
      }
      return base + deg[s % deg.length];
    }

    const play = btn("▶ Bass", "play");
    const stop = btn("■", "stop");
    transport.append(play, stop);
    ui.append(transport, status);

    stop.onclick = () => {
      clock.stop(); if (last != null) noteOff(last, p.ch); last = null; allOff(p.ch); status.textContent = "Stopped";
    };
    play.onclick = () => {
      if (!needStart(status)) return;
      stop.onclick(); step = 0;
      armClock(clock, p, anim, () => {
        if (Math.random() < p.space && p.mode !== "dub" && p.mode !== "rego") {
          if (last != null) { noteOff(last, p.ch); last = null; }
          return;
        }
        const n = nextNote(step++);
        if (last != null) noteOff(last, p.ch);
        last = null;
        if (n == null) return;
        last = clamp(n, 24, 60);
        const ghostHit = Math.random() < p.ghost && step % 2 === 0;
        const v = accentVel(ghostHit ? p.vel * 0.45 : p.vel, step, p.groove, p.human) * (1 + (step % 4 === 1 ? p.drive * 0.15 : 0));
        noteOn(last, v, p.ch);
        anim.note(last, "#c9a0ff");
        const g = p.gate * (1 + (p.slide > 0.3 && Math.random() < p.slide ? 0.45 : 0));
        const hold = last;
        setTimeout(() => { if (last === hold) { noteOff(hold, p.ch); last = null; } }, Math.max(28, clock.getMs() * g));
      });
      status.textContent = `Bass · ${p.mode} · ${bpmNow()} BPM`;
    };
  }

  // ===================== DRONE =====================
  function buildDrone(body, bayId) {
    const SHAPES = [
      { id: "power", label: "Power", ints: [0, 7, 12] },
      { id: "minor", label: "Minor", ints: [0, 3, 7, 12] },
      { id: "major", label: "Major", ints: [0, 4, 7, 12] },
      { id: "add9", label: "Add9", ints: [0, 4, 7, 14] },
      { id: "sus2", label: "Sus2", ints: [0, 2, 7, 12] },
      { id: "sus4", label: "Sus4", ints: [0, 5, 7, 12] },
      { id: "fourths", label: "4ths", ints: [0, 5, 10, 15] },
      { id: "cluster", label: "Cluster", ints: [0, 1, 3, 7] },
      { id: "shimmer", label: "Shimmer", ints: [0, 7, 12, 16, 19] },
      { id: "rumble", label: "Rumble", ints: [0, 12, -5] },
      { id: "open", label: "Open", ints: [0, 12, 19] },
      { id: "maj7", label: "Maj7", ints: [0, 4, 7, 11] },
    ];
    const p = {
      followAssist: true, scale: "pent", rootPc: 0, oct: 0, div: "2", swing: 0, human: 0.08,
      vel: 62, gate: 1, ch: 0, groove: "straight", expr: 70, shape: "power", breathe: 0.32,
      shimmer: 0.22, pulse: 0, fadeIn: 0.4, motion: 0.15,
    };
    const { ui, anim, status, transport } = shell(body, "#a0b0c0", "orbit", "DRONE");
    const presets = [
      { name: "Root5Oct", patch: { shape: "power", vel: 70, breathe: 0.18 } },
      { name: "Minor Pad", patch: { shape: "minor", vel: 56, breathe: 0.48, shimmer: 0.35 } },
      { name: "Add9 Air", patch: { shape: "add9", vel: 52, shimmer: 0.55, oct: 1 } },
      { name: "Maj7 Soft", patch: { shape: "maj7", vel: 50, breathe: 0.4, expr: 80 } },
      { name: "Sus Wash", patch: { shape: "sus4", vel: 58, breathe: 0.5 } },
      { name: "4ths", patch: { shape: "fourths", vel: 60 } },
      { name: "Cluster", patch: { shape: "cluster", vel: 48, followAssist: false, scale: "chrom" } },
      { name: "Shimmer", patch: { shape: "shimmer", vel: 46, shimmer: 0.75, breathe: 0.4, oct: 1 } },
      { name: "Rumble", patch: { shape: "rumble", vel: 82, oct: -1, breathe: 0.12 } },
      { name: "Pulse", patch: { shape: "power", pulse: 0.65, div: "2", vel: 72 } },
      { name: "Open Sky", patch: { shape: "open", vel: 50, shimmer: 0.45, oct: 1 } },
      { name: "Motion Pad", patch: { shape: "add9", motion: 0.55, shimmer: 0.4, breathe: 0.5 } },
    ];
    ui.appendChild(presetBar(presets, (pr) => { Object.assign(p, pr.patch || {}); sync(); status.textContent = "Preset · " + pr.name; }));
    const shapeChips = chips("Voicing", SHAPES.map((s) => ({ id: s.id, label: s.label })), p.shape, (v) => { p.shape = v; });
    ui.appendChild(shapeChips.wrap);
    const commons = commonMusical(p, ui);
    const breathe = slider("Breathe", 0, 100, 1, 32, (v) => v + "%", (v) => { p.breathe = v / 100; });
    const shimmer = slider("Shimmer", 0, 100, 1, 22, (v) => v + "%", (v) => { p.shimmer = v / 100; });
    const pulse = slider("Pulse", 0, 100, 1, 0, (v) => v + "%", (v) => { p.pulse = v / 100; });
    const fadeIn = slider("Fade in", 0, 100, 1, 40, (v) => v + "%", (v) => { p.fadeIn = v / 100; });
    const motion = slider("Motion", 0, 100, 1, 15, (v) => v + "%", (v) => { p.motion = v / 100; });
    ui.append(breathe.wrap, shimmer.wrap, pulse.wrap, fadeIn.wrap, motion.wrap);
    function sync() {
      shapeChips.set(p.shape); commons.sync();
      breathe.set(Math.round(p.breathe * 100)); shimmer.set(Math.round(p.shimmer * 100));
      pulse.set(Math.round(p.pulse * 100)); fadeIn.set(Math.round(p.fadeIn * 100)); motion.set(Math.round(p.motion * 100));
    }
    ui.appendChild(userSlots("drone", () => ({ ...p }), (d) => { Object.assign(p, d); sync(); status.textContent = "Loaded user slot"; }));

    let held = [], extras = [], clock = makeClock(), age = 0;
    if (bayId) clock.setBay(bayId);
    function voicing() {
      const { root } = degrees(p);
      const shape = SHAPES.find((s) => s.id === p.shape) || SHAPES[0];
      return shape.ints.map((i) => clamp(root + i, 18, 100));
    }
    const play = btn("Hold drone", "play");
    const stop = btn("Release", "stop");
    transport.append(play, stop);
    ui.append(transport, status);

    stop.onclick = () => {
      clock.stop();
      for (const n of held.concat(extras)) noteOff(n, p.ch);
      held = []; extras = []; allOff(p.ch); status.textContent = "Released";
    };
    play.onclick = () => {
      if (!needStart(status)) return;
      stop.onclick();
      held = voicing(); age = 0;
      const startVel = Math.max(1, (p.vel * (1 - p.fadeIn)) | 0);
      for (const n of held) { noteOn(n, startVel, p.ch); anim.note(n, "#a0b0c0"); }
      armClock(clock, p, anim, (s) => {
        age++;
        const fade = clamp(age / Math.max(1, 8 * p.fadeIn * 4 + 1), 0, 1);
        const velNow = (p.vel * (0.55 + 0.45 * fade)) | 0;
        anim.hit("#a0b0c0", 0.15 + p.breathe * 0.35);
        if (p.breathe > 0.05 && s % 4 === 0) {
          for (const n of held) noteOn(n, accentVel(velNow, s, p.groove, p.human), p.ch);
        }
        for (const n of extras) noteOff(n, p.ch);
        extras = [];
        if (p.shimmer > 0.05 && Math.random() < p.shimmer) {
          const n = clamp(held[held.length - 1] + pick([12, 7, 5, 16, 19]), 40, 108);
          extras.push(n);
          noteOn(n, accentVel(velNow * 0.55, s, p.groove, p.human), p.ch);
          anim.note(n, "#d0e0ff");
          setTimeout(() => noteOff(n, p.ch), Math.max(80, clock.getMs() * 1.3));
        }
        if (p.motion > 0.05 && s % 2 === 0 && Math.random() < p.motion) {
          const idx = (Math.random() * held.length) | 0;
          noteOff(held[idx], p.ch);
          held[idx] = clamp(held[idx] + pick([-2, -1, 1, 2, 5, -5]), 18, 100);
          noteOn(held[idx], velNow, p.ch);
        }
        if (p.pulse > 0.05) {
          const gateOn = Math.sin(s / Math.max(1, 3.2 - p.pulse * 2)) > 0;
          if (!gateOn) for (const n of held) noteOff(n, p.ch);
          else for (const n of held) noteOn(n, velNow, p.ch);
        }
        if (p.expr > 0) cc(p.ch, 11, clamp(p.expr * (0.7 + 0.3 * Math.sin(s / 6)), 0, 127));
      });
      status.textContent = `Drone · ${p.shape} · held`;
    };
  }

  // ===================== MARKOV =====================
  function buildMarkov(body, bayId) {
    const TABLES = {
      lazy: [[0, 0.42], [1, 0.24], [-1, 0.24], [2, 0.05], [-2, 0.05]],
      busy: [[0, 0.12], [1, 0.3], [-1, 0.3], [2, 0.16], [-2, 0.12]],
      leaps: [[0, 0.08], [1, 0.14], [-1, 0.14], [3, 0.26], [-3, 0.22], [5, 0.16]],
      pendulum: [[1, 0.5], [-1, 0.5]],
      rising: [[1, 0.55], [2, 0.25], [0, 0.1], [-1, 0.1]],
      falling: [[-1, 0.55], [-2, 0.25], [0, 0.1], [1, 0.1]],
      drunk: [[0, 0.18], [1, 0.2], [-1, 0.2], [2, 0.14], [-2, 0.14], [4, 0.07], [-4, 0.07]],
      cadential: [[0, 0.18], [-1, 0.14], [1, 0.14], [-2, 0.12], [4, 0.22], [-3, 0.2]],
      serial: [[1, 0.7], [2, 0.2], [-1, 0.1]],
      neighbor: [[0, 0.2], [1, 0.4], [-1, 0.4]],
    };
    const p = {
      followAssist: true, scale: "pent", rootPc: 0, oct: 1, div: "8", swing: 0.1, human: 0.28,
      vel: 88, gate: 0.62, ch: 0, groove: "mpc", expr: 0, table: "lazy", stay: 0.1, octJump: 0.12,
      dens: 0.88, memory: 0.35,
    };
    const { ui, anim, status, transport } = shell(body, "#ff7ab8", "dots", "MARKOV");
    const presets = [
      { name: "Lazy", patch: { table: "lazy", dens: 0.7 } },
      { name: "Busy", patch: { table: "busy", dens: 0.96, div: "16", gate: 0.38 } },
      { name: "Leaps", patch: { table: "leaps" } },
      { name: "Pendulum", patch: { table: "pendulum", div: "16", dens: 1 } },
      { name: "Rising", patch: { table: "rising" } },
      { name: "Falling", patch: { table: "falling" } },
      { name: "Drunk", patch: { table: "drunk", human: 0.48 } },
      { name: "Cadence", patch: { table: "cadential", dens: 0.72, div: "4", gate: 0.95 } },
      { name: "Serial", patch: { table: "serial", dens: 1, human: 0.08 } },
      { name: "Neighbor", patch: { table: "neighbor", dens: 0.9, memory: 0.6 } },
      { name: "Whisper", patch: { table: "lazy", vel: 52, dens: 0.38, div: "4", gate: 1.15 } },
      { name: "Machine", patch: { table: "busy", human: 0.04, swing: 0, groove: "techno", div: "16" } },
    ];
    ui.appendChild(presetBar(presets, (pr) => { Object.assign(p, pr.patch || {}); sync(); status.textContent = "Preset · " + pr.name; }));
    const tableChips = chips("Walker", Object.keys(TABLES).map((k) => ({ id: k, label: k })), p.table, (v) => { p.table = v; });
    ui.appendChild(tableChips.wrap);
    const commons = commonMusical(p, ui);
    const dens = slider("Density", 20, 100, 1, 88, (v) => v + "%", (v) => { p.dens = v / 100; });
    const stay = slider("Stay", 0, 60, 1, 10, (v) => v + "%", (v) => { p.stay = v / 100; });
    const octJump = slider("Oct jump", 0, 50, 1, 12, (v) => v + "%", (v) => { p.octJump = v / 100; });
    const memory = slider("Memory", 0, 100, 1, 35, (v) => v + "%", (v) => { p.memory = v / 100; });
    ui.append(dens.wrap, stay.wrap, octJump.wrap, memory.wrap);
    function sync() {
      tableChips.set(p.table); commons.sync();
      dens.set(Math.round(p.dens * 100)); stay.set(Math.round(p.stay * 100));
      octJump.set(Math.round(p.octJump * 100)); memory.set(Math.round(p.memory * 100));
    }
    ui.appendChild(userSlots("markov", () => ({ ...p }), (d) => { Object.assign(p, d); sync(); status.textContent = "Loaded user slot"; }));

    let last = null, degIdx = 0, hist = [], clock = makeClock();
    if (bayId) clock.setBay(bayId);
    const play = btn("▶ Markov", "play");
    const stop = btn("■", "stop");
    transport.append(play, stop);
    ui.append(transport, status);

    stop.onclick = () => {
      clock.stop(); if (last != null) noteOff(last, p.ch); last = null; allOff(p.ch); status.textContent = "Stopped";
    };
    play.onclick = () => {
      if (!needStart(status)) return;
      stop.onclick(); degIdx = 0; hist = [];
      armClock(clock, p, anim, (s) => {
        if (Math.random() > p.dens) return;
        if (Math.random() < p.stay && last != null) {
          noteOn(last, accentVel(p.vel * 0.85, s, p.groove, p.human), p.ch);
          anim.note(last, "#ff7ab8");
          return;
        }
        const { deg } = degrees(p);
        if (p.memory > 0.05 && hist.length > 2 && Math.random() < p.memory) {
          degIdx = hist[hist.length - 1 - ((Math.random() * Math.min(3, hist.length)) | 0)];
        } else {
          const table = TABLES[p.table] || TABLES.lazy;
          let r = Math.random(), pickD = 0;
          for (const [d, w] of table) { r -= w; if (r <= 0) { pickD = d; break; } }
          degIdx = (degIdx + pickD + deg.length * 8) % deg.length;
        }
        hist.push(degIdx); if (hist.length > 12) hist.shift();
        const octS = Math.random() < p.octJump ? (Math.random() < 0.5 ? 1 : -1) : 0;
        const n = degNote(p, degIdx, octS);
        if (last != null) noteOff(last, p.ch);
        last = n;
        noteOn(n, accentVel(p.vel, s, p.groove, p.human), p.ch);
        anim.note(n, "#ff7ab8");
        setTimeout(() => { if (last === n) { noteOff(n, p.ch); last = null; } }, Math.max(28, clock.getMs() * p.gate));
      });
      status.textContent = `Markov · ${p.table} · ${bpmNow()} BPM`;
    };
  }

  // ===================== POLYR =====================
  function buildPolyr(body, bayId) {
    const p = {
      followAssist: true, scale: "pent", rootPc: 0, oct: 1, div: "16", swing: 0, human: 0.18,
      vel: 100, gate: 0.42, ch: 0, groove: "straight", expr: 0,
      aHits: 3, bHits: 5, cHits: 0, len: 8, aDeg: 0, bDeg: 4, cDeg: 2, bOct: 1, cOct: 0,
      aVel: 100, bVel: 78, cVel: 70, rotate: 0, rotateC: 0,
    };
    const { ui, anim, status, transport } = shell(body, "#5ad0e6", "bars", "POLYR");
    const presets = [
      { name: "3 vs 5", patch: { aHits: 3, bHits: 5, len: 8, cHits: 0 } },
      { name: "4 vs 7", patch: { aHits: 4, bHits: 7, len: 12 } },
      { name: "5 vs 8", patch: { aHits: 5, bHits: 8, len: 16 } },
      { name: "Triple", patch: { aHits: 3, bHits: 5, cHits: 7, len: 16 } },
      { name: "Clave dual", patch: { aHits: 5, bHits: 3, len: 16, rotate: 3 } },
      { name: "Sparse", patch: { aHits: 2, bHits: 3, len: 16 } },
      { name: "Dense", patch: { aHits: 7, bHits: 11, len: 16, gate: 0.28 } },
      { name: "Oct lock", patch: { aHits: 4, bHits: 4, len: 8, bOct: 1, aDeg: 0, bDeg: 0 } },
      { name: "Fifth canon", patch: { aHits: 3, bHits: 3, len: 8, bDeg: 4, rotate: 2 } },
      { name: "Hemiola", patch: { aHits: 3, bHits: 2, len: 6, div: "8" } },
      { name: "Machine", patch: { aHits: 8, bHits: 5, len: 16, human: 0.04, groove: "techno" } },
      { name: "Trio weave", patch: { aHits: 4, bHits: 6, cHits: 5, len: 12, cOct: 1 } },
    ];
    ui.appendChild(presetBar(presets, (pr) => { Object.assign(p, pr.patch || {}); sync(); status.textContent = "Preset · " + pr.name; }));
    const commons = commonMusical(p, ui);
    const aH = slider("A hits", 0, 16, 1, p.aHits, (v) => String(v), (v) => { p.aHits = v; });
    const bH = slider("B hits", 0, 16, 1, p.bHits, (v) => String(v), (v) => { p.bHits = v; });
    const cH = slider("C hits", 0, 16, 1, p.cHits, (v) => v === 0 ? "off" : String(v), (v) => { p.cHits = v; });
    const len = slider("Length", 4, 24, 1, p.len, (v) => String(v), (v) => { p.len = v; });
    const rot = slider("Rotate B", 0, 16, 1, 0, (v) => String(v), (v) => { p.rotate = v; });
    const rotC = slider("Rotate C", 0, 16, 1, 0, (v) => String(v), (v) => { p.rotateC = v; });
    const aDeg = slider("A deg", 1, 7, 1, 1, (v) => String(v), (v) => { p.aDeg = v - 1; });
    const bDeg = slider("B deg", 1, 7, 1, 5, (v) => String(v), (v) => { p.bDeg = v - 1; });
    const cDeg = slider("C deg", 1, 7, 1, 3, (v) => String(v), (v) => { p.cDeg = v - 1; });
    const bOct = slider("B oct", 0, 2, 1, 1, (v) => "+" + v, (v) => { p.bOct = v; });
    const cOct = slider("C oct", 0, 2, 1, 0, (v) => "+" + v, (v) => { p.cOct = v; });
    ui.append(aH.wrap, bH.wrap, cH.wrap, len.wrap, rot.wrap, rotC.wrap, aDeg.wrap, bDeg.wrap, cDeg.wrap, bOct.wrap, cOct.wrap);
    function sync() {
      commons.sync();
      aH.set(p.aHits); bH.set(p.bHits); cH.set(p.cHits); len.set(p.len);
      rot.set(p.rotate | 0); rotC.set(p.rotateC | 0);
      aDeg.set((p.aDeg | 0) + 1); bDeg.set((p.bDeg | 0) + 1); cDeg.set((p.cDeg | 0) + 1);
      bOct.set(p.bOct | 0); cOct.set(p.cOct | 0);
    }
    ui.appendChild(userSlots("polyr", () => ({ ...p }), (d) => { Object.assign(p, d); sync(); status.textContent = "Loaded user slot"; }));

    function hit(i, n, lenN) { return n > 0 && Math.round(i * n / lenN) !== Math.round((i - 1) * n / lenN); }
    let lastA = null, lastB = null, lastC = null, step = 0, clock = makeClock();
    if (bayId) clock.setBay(bayId);
    const play = btn("▶ Polyr", "play");
    const stop = btn("■", "stop");
    transport.append(play, stop);
    ui.append(transport, status);

    stop.onclick = () => {
      clock.stop();
      if (lastA != null) noteOff(lastA, p.ch);
      if (lastB != null) noteOff(lastB, p.ch);
      if (lastC != null) noteOff(lastC, p.ch);
      lastA = lastB = lastC = null; allOff(p.ch); status.textContent = "Stopped";
    };
    play.onclick = () => {
      if (!needStart(status)) return;
      stop.onclick(); step = 0;
      armClock(clock, p, anim, () => {
        const lenN = clamp(p.len, 4, 24);
        const i = step++ % lenN;
        const j = (i + (p.rotate | 0)) % lenN;
        const k = (i + (p.rotateC | 0)) % lenN;
        if (lastA != null) { noteOff(lastA, p.ch); lastA = null; }
        if (lastB != null) { noteOff(lastB, p.ch); lastB = null; }
        if (lastC != null) { noteOff(lastC, p.ch); lastC = null; }
        if (hit(i, p.aHits, lenN)) {
          lastA = degNote(p, p.aDeg, 0);
          noteOn(lastA, accentVel(p.aVel, i, p.groove, p.human), p.ch);
          anim.note(lastA, "#5ad0e6");
        }
        if (hit(j, p.bHits, lenN)) {
          lastB = degNote(p, p.bDeg, p.bOct | 0);
          noteOn(lastB, accentVel(p.bVel, j, p.groove, p.human), p.ch);
          anim.note(lastB, "#9cf");
        }
        if (hit(k, p.cHits, lenN)) {
          lastC = degNote(p, p.cDeg, p.cOct | 0);
          noteOn(lastC, accentVel(p.cVel || 70, k, p.groove, p.human), p.ch);
          anim.note(lastC, "#b8f");
        }
      });
      status.textContent = `Polyr ${p.aHits}:${p.bHits}${p.cHits ? ":" + p.cHits : ""} / ${p.len} · ${bpmNow()} BPM`;
    };
  }

  // ===================== ARP (new) =====================
  function buildArp(body, bayId) {
    const MODES = [
      { id: "up", label: "Up" }, { id: "down", label: "Down" }, { id: "updown", label: "Up/Dn" },
      { id: "downup", label: "Dn/Up" }, { id: "converge", label: "Converge" }, { id: "diverge", label: "Diverge" },
      { id: "random", label: "Random" }, { id: "asplayed", label: "Chord" },
    ];
    const p = {
      followAssist: true, scale: "major", rootPc: 0, oct: 1, div: "16", swing: 0.08, human: 0.15,
      vel: 96, gate: 0.45, ch: 0, groove: "straight", expr: 0, mode: "up", octaves: 2, chord: 0,
      rateGate: 0.5, ping: 0, inv: 0,
    };
    const { ui, anim, status, transport } = shell(body, "#ffb347", "bars", "ARP");
    const presets = [
      { name: "Classic Up", patch: { mode: "up", octaves: 2, div: "16" } },
      { name: "Down Cascade", patch: { mode: "down", octaves: 3, div: "16", gate: 0.35 } },
      { name: "Up/Down", patch: { mode: "updown", octaves: 2, div: "16" } },
      { name: "Converge", patch: { mode: "converge", octaves: 2 } },
      { name: "Random", patch: { mode: "random", octaves: 2, human: 0.35 } },
      { name: "Trance", patch: { mode: "up", octaves: 3, div: "16", groove: "techno", gate: 0.3, vel: 100 } },
      { name: "Swing Arp", patch: { mode: "updown", groove: "swing", div: "8" } },
      { name: "Wide", patch: { mode: "diverge", octaves: 3, vel: 88 } },
      { name: "ii–V Feel", patch: { mode: "up", chord: 1, scale: "dorian", octaves: 2 } },
      { name: "Soft Pluck", patch: { mode: "up", vel: 64, gate: 0.28, human: 0.3, octaves: 1 } },
      { name: "32nd Spray", patch: { mode: "random", div: "32", gate: 0.22, octaves: 2 } },
      { name: "Octave Bounce", patch: { mode: "updown", octaves: 1, div: "8", chord: 0 } },
    ];
    ui.appendChild(presetBar(presets, (pr) => { Object.assign(p, pr.patch || {}); sync(); status.textContent = "Preset · " + pr.name; }));
    const modeChips = chips("Pattern", MODES, p.mode, (v) => { p.mode = v; });
    const chord = select("Chord", [
      { id: "0", label: "I" }, { id: "1", label: "ii" }, { id: "2", label: "iii" }, { id: "3", label: "IV" },
      { id: "4", label: "V" }, { id: "5", label: "vi" }, { id: "6", label: "vii" },
    ], String(p.chord | 0), (v) => { p.chord = +v; });
    ui.append(modeChips.wrap, chord.wrap);
    const commons = commonMusical(p, ui);
    const octaves = slider("Oct span", 1, 4, 1, 2, (v) => String(v), (v) => { p.octaves = v; });
    const inv = slider("Inversion", 0, 3, 1, 0, (v) => String(v), (v) => { p.inv = v; });
    ui.append(octaves.wrap, inv.wrap);
    function sync() {
      modeChips.set(p.mode); chord.set(String(p.chord | 0)); commons.sync();
      octaves.set(p.octaves || 2); inv.set(p.inv | 0);
    }
    ui.appendChild(userSlots("arp", () => ({ ...p }), (d) => { Object.assign(p, d); sync(); status.textContent = "Loaded user slot"; }));

    function buildPool() {
      let notes = chordFromDegree(p, p.chord | 0, p.inv);
      const pool = [];
      for (let o = 0; o < (p.octaves || 1); o++) for (const n of notes) pool.push(clamp(n + o * 12, 24, 108));
      return pool;
    }
    function orderPool(pool, s) {
      const m = p.mode;
      if (m === "down") return pool.slice().reverse();
      if (m === "updown") {
        const up = pool, down = pool.slice().reverse().slice(1, -1);
        return up.concat(down);
      }
      if (m === "downup") {
        const down = pool.slice().reverse(), up = pool.slice(1, -1);
        return down.concat(up);
      }
      if (m === "converge") {
        const out = []; let a = 0, b = pool.length - 1;
        while (a <= b) { out.push(pool[a++]); if (a <= b) out.push(pool[b--]); }
        return out;
      }
      if (m === "diverge") {
        const mid = pool.length >> 1; const out = [pool[mid]];
        for (let i = 1; i <= mid; i++) {
          if (mid - i >= 0) out.push(pool[mid - i]);
          if (mid + i < pool.length) out.push(pool[mid + i]);
        }
        return out;
      }
      if (m === "random") return pool.slice().sort(() => Math.random() - 0.5);
      return pool;
    }

    let last = null, idx = 0, clock = makeClock(), ordered = [];
    if (bayId) clock.setBay(bayId);
    const play = btn("▶ Arp", "play");
    const stop = btn("■", "stop");
    transport.append(play, stop);
    ui.append(transport, status);

    stop.onclick = () => {
      clock.stop(); if (last != null) noteOff(last, p.ch); last = null; allOff(p.ch); status.textContent = "Stopped";
    };
    play.onclick = () => {
      if (!needStart(status)) return;
      stop.onclick(); idx = 0; ordered = orderPool(buildPool(), 0);
      armClock(clock, p, anim, (s) => {
        if (s % ordered.length === 0) ordered = orderPool(buildPool(), s);
        if (!ordered.length) return;
        const n = ordered[idx % ordered.length];
        idx++;
        if (last != null) noteOff(last, p.ch);
        last = n;
        noteOn(n, accentVel(p.vel, s, p.groove, p.human), p.ch);
        anim.note(n, "#ffb347");
        setTimeout(() => { if (last === n) { noteOff(n, p.ch); last = null; } }, Math.max(20, clock.getMs() * p.gate));
      });
      status.textContent = `Arp · ${p.mode} · ${p.octaves}oct · ${bpmNow()} BPM`;
    };
  }

  // ===================== PROG (new) =====================
  function buildProg(body, bayId) {
    const PROGS = [
      { id: "pop", label: "I–V–vi–IV", seq: [0, 4, 5, 3] },
      { id: "jazz", label: "ii–V–I–I", seq: [1, 4, 0, 0] },
      { id: "jazz2", label: "I–vi–ii–V", seq: [0, 5, 1, 4] },
      { id: "andalu", label: "Andalusian", seq: [0, 6, 5, 4] },
      { id: "axis", label: "Axis", seq: [0, 2, 3, 4] },
      { id: "canon", label: "Pachelbel", seq: [0, 4, 5, 2, 3, 0, 3, 4] },
      { id: "blues", label: "Blues 12", seq: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4] },
      { id: "modal", label: "Modal", seq: [0, 0, 3, 3] },
      { id: "rhythm", label: "Rhythm changes A", seq: [0, 5, 1, 4, 0, 5, 1, 4] },
      { id: "epic", label: "Epic", seq: [5, 3, 0, 4] },
    ];
    const p = {
      followAssist: true, scale: "major", rootPc: 0, oct: 1, div: "1", swing: 0, human: 0.2,
      vel: 82, gate: 1.2, ch: 0, groove: "straight", expr: 40, prog: "pop", bars: 1,
      seventh: 0.5, ninth: 0.15, inv: 0, strum: 0.25, arp: 0,
    };
    const { ui, anim, status, transport } = shell(body, "#e8a0ff", "orbit", "PROG");
    const presets = [
      { name: "Pop Pad", patch: { prog: "pop", bars: 2, seventh: 0.4, strum: 0.1 } },
      { name: "Jazz ii–V–I", patch: { prog: "jazz", scale: "major", seventh: 0.9, bars: 1 } },
      { name: "Canon", patch: { prog: "canon", bars: 1, strum: 0.35 } },
      { name: "Blues", patch: { prog: "blues", scale: "blues", bars: 1, seventh: 0.7 } },
      { name: "Andalusian", patch: { prog: "andalu", scale: "phryg", bars: 2 } },
      { name: "Epic", patch: { prog: "epic", bars: 2, ninth: 0.4, vel: 90 } },
      { name: "Modal Vamp", patch: { prog: "modal", scale: "dorian", bars: 2, gate: 1.5 } },
      { name: "Rhythm A", patch: { prog: "rhythm", seventh: 0.85, bars: 1 } },
      { name: "Strum", patch: { prog: "pop", strum: 0.7, gate: 0.9 } },
      { name: "Arp Chords", patch: { prog: "jazz2", arp: 1, div: "8", gate: 0.4 } },
      { name: "Wide 9ths", patch: { prog: "pop", ninth: 0.8, inv: 1, oct: 1 } },
      { name: "Soft Beds", patch: { prog: "pop", vel: 54, human: 0.4, gate: 1.6, expr: 70 } },
    ];
    ui.appendChild(presetBar(presets, (pr) => { Object.assign(p, pr.patch || {}); sync(); status.textContent = "Preset · " + pr.name; }));
    const prog = select("Progression", PROGS, p.prog, (v) => { p.prog = v; });
    ui.appendChild(prog.wrap);
    const commons = commonMusical(p, ui);
    const bars = slider("Bars/chord", 1, 4, 1, 1, (v) => String(v), (v) => { p.bars = v; });
    const seventh = slider("7ths", 0, 100, 1, 50, (v) => v + "%", (v) => { p.seventh = v / 100; });
    const ninth = slider("9ths", 0, 100, 1, 15, (v) => v + "%", (v) => { p.ninth = v / 100; });
    const inv = slider("Inversion", 0, 3, 1, 0, (v) => String(v), (v) => { p.inv = v; });
    const strum = slider("Strum", 0, 100, 1, 25, (v) => v + "%", (v) => { p.strum = v / 100; });
    const arp = chips("Play", [{ id: "block", label: "Block" }, { id: "arp", label: "Arpeggiate" }], "block", (v) => { p.arp = v === "arp" ? 1 : 0; });
    ui.append(bars.wrap, seventh.wrap, ninth.wrap, inv.wrap, strum.wrap, arp.wrap);
    function sync() {
      prog.set(p.prog); commons.sync();
      bars.set(p.bars || 1); seventh.set(Math.round((p.seventh || 0) * 100));
      ninth.set(Math.round((p.ninth || 0) * 100)); inv.set(p.inv | 0);
      strum.set(Math.round((p.strum || 0) * 100)); arp.set(p.arp ? "arp" : "block");
    }
    ui.appendChild(userSlots("prog", () => ({ ...p }), (d) => { Object.assign(p, d); sync(); status.textContent = "Loaded user slot"; }));

    let held = [], clock = makeClock(), arpIdx = 0;
    if (bayId) clock.setBay(bayId);
    function chordAt(bar) {
      const pr = PROGS.find((x) => x.id === p.prog) || PROGS[0];
      const roman = pr.seq[bar % pr.seq.length];
      let notes = chordFromDegree(p, roman, p.inv);
      const { root, deg } = degrees(p);
      if (Math.random() < p.seventh || p.seventh > 0.6) notes.push(clamp(root + deg[(roman + 6) % deg.length] + 12, 24, 96));
      if (Math.random() < p.ninth) notes.push(clamp(root + deg[(roman + 1) % deg.length] + 12, 24, 100));
      return notes;
    }

    const play = btn("▶ Prog", "play");
    const stop = btn("■", "stop");
    transport.append(play, stop);
    ui.append(transport, status);

    stop.onclick = () => {
      clock.stop(); for (const n of held) noteOff(n, p.ch); held = []; allOff(p.ch); status.textContent = "Stopped";
    };
    play.onclick = () => {
      if (!needStart(status)) return;
      stop.onclick(); arpIdx = 0;
      // Force chord changes on bar-ish boundaries using division
      const useDiv = p.arp ? (p.div || "8") : "1";
      const saved = p.div; p.div = useDiv;
      armClock(clock, p, anim, (s) => {
        const stepsPerChord = Math.max(1, Math.round((p.arp ? 8 : 1) * (p.bars || 1)));
        if (!p.arp) {
          if (s % stepsPerChord !== 0 && s !== 0) return;
          for (const n of held) noteOff(n, p.ch);
          held = [];
          const notes = chordAt(Math.floor(s / stepsPerChord));
          notes.forEach((n, i) => {
            const delay = i * p.strum * 45;
            setTimeout(() => {
              held.push(n);
              noteOn(n, accentVel(p.vel, s, p.groove, p.human), p.ch);
              anim.note(n, "#e8a0ff");
            }, delay);
          });
        } else {
          const pool = chordAt(Math.floor(s / Math.max(4, stepsPerChord)));
          if (!pool.length) return;
          if (s % 8 === 0) { for (const n of held) noteOff(n, p.ch); held = []; }
          const n = pool[arpIdx % pool.length];
          arpIdx++;
          held = [n];
          noteOn(n, accentVel(p.vel, s, p.groove, p.human), p.ch);
          anim.note(n, "#e8a0ff");
          setTimeout(() => noteOff(n, p.ch), Math.max(25, clock.getMs() * p.gate));
        }
      });
      p.div = saved;
      status.textContent = `Prog · ${p.prog} · ${bpmNow()} BPM`;
    };
  }

  // ===================== RIFF =====================
  function buildRiff(body, bayId) {
    const p = {
      followAssist: true, scale: "pent", rootPc: 0, oct: 1, div: "8", swing: 0.1, human: 0.25,
      vel: 96, gate: 0.7, ch: 0, groove: "mpc", expr: 0, style: "melody", loop: true, gap: 0.2, transpose: 0,
    };
    const { ui, anim, status, transport } = shell(body, "#ff8a1a", "scope", "RIFF");
    const styles = (window.FM1Audition && window.FM1Audition.styles && window.FM1Audition.styles()) || ["melody", "bass", "arp", "chords"];
    const presets = [
      { name: "Melody", patch: { style: "melody" } },
      { name: "Bass riff", patch: { style: "bass" } },
      { name: "Arp", patch: { style: "arp" } },
      { name: "Chords", patch: { style: "chords", gate: 1.1 } },
      { name: "Tight", patch: { style: "melody", human: 0.05, swing: 0, vel: 112, groove: "techno" } },
      { name: "Loose", patch: { style: "melody", human: 0.55, swing: 0.3, groove: "swing" } },
      { name: "Low", patch: { style: "bass", transpose: -12 } },
      { name: "High", patch: { style: "melody", transpose: 12 } },
      { name: "Loop gap", patch: { style: "melody", gap: 0.55, loop: true } },
      { name: "One-shot", patch: { style: "melody", loop: false } },
      { name: "Swing lead", patch: { style: "melody", groove: "hard", swing: 0.4 } },
      { name: "MPC feel", patch: { style: "melody", groove: "mpc", human: 0.35 } },
    ];
    ui.appendChild(presetBar(presets, (pr) => {
      Object.assign(p, pr.patch || {});
      if (window.FM1Audition && p.style) window.FM1Audition.setStyle(p.style);
      sync(); status.textContent = "Preset · " + pr.name;
    }));
    const styleChips = chips("Style", styles.map((s) => ({ id: s, label: s })), p.style, (v) => {
      p.style = v; window.FM1Audition && window.FM1Audition.setStyle(v);
    });
    ui.appendChild(styleChips.wrap);
    const commons = commonMusical(p, ui);
    const gap = slider("Loop gap", 0, 100, 1, 20, (v) => v + "%", (v) => { p.gap = v / 100; });
    const tr = slider("Transpose", -24, 24, 1, 0, (v) => (v >= 0 ? "+" : "") + v, (v) => { p.transpose = v; });
    const loopChip = chips("Play", [{ id: "loop", label: "Loop" }, { id: "once", label: "Once" }], "loop", (v) => { p.loop = v === "loop"; });
    ui.append(gap.wrap, tr.wrap, loopChip.wrap);
    function sync() {
      styleChips.set(p.style); commons.sync();
      gap.set(Math.round(p.gap * 100)); tr.set(p.transpose | 0); loopChip.set(p.loop ? "loop" : "once");
    }
    ui.appendChild(userSlots("riff", () => ({ ...p }), (d) => { Object.assign(p, d); sync(); status.textContent = "Loaded user slot"; }));

    let timer = 0;
    const play = btn("▶ Riff", "play");
    const stop = btn("■", "stop");
    transport.append(play, stop);
    ui.append(transport, status);

    function fire() {
      if (bayId) window.FM1BayLeds?.pulse?.(bayId);
      anim.hit("#ff8a1a", 0.7); anim.tickBeat();
      const ok = window.FM1Audition && window.FM1Audition.play(null, { bpm: bpmNow() });
      status.textContent = ok ? `Riff · ${p.style} · ${bpmNow()} BPM` : "Audition unavailable.";
      if (ok && p.loop) {
        clearTimeout(timer);
        timer = setTimeout(() => { if (p.loop) fire(); }, (60000 / bpmNow()) * 8 * (1 + p.gap));
      }
    }
    stop.onclick = () => {
      clearTimeout(timer); timer = 0;
      if (bayId) window.FM1BayLeds?.setActive?.(bayId, false);
      window.FM1Audition && window.FM1Audition.stop();
      allOff(p.ch); status.textContent = "Stopped";
    };
    play.onclick = () => {
      if (!needStart(status)) return;
      stop.onclick();
      if (window.FM1Audition && p.style) window.FM1Audition.setStyle(p.style);
      if (bayId) window.FM1BayLeds?.setActive?.(bayId, true);
      fire();
    };
  }

  // ---- CSS ----
  const css = el("style");
  css.textContent = `
    .rgen{display:flex;flex-direction:column;gap:8px;width:100%;min-width:0;font-family:'Space Grotesk',system-ui,sans-serif}
    .rgen-head{display:flex;align-items:baseline;gap:8px}
    .rgen-head b{font:800 12px 'Space Grotesk',sans-serif;letter-spacing:.04em;color:var(--ui-text,#f2f4f7)}
    .rgen-head span{font:700 8px 'Space Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--pc,#9ad);
      border:1px solid color-mix(in srgb,var(--pc) 45%,#333);border-radius:3px;padding:1px 5px}
    .rganim{border-radius:8px;overflow:hidden;border:1px solid var(--ui-line,#2a2c31);background:#0a0b0e;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
    .rganim-cv{display:block;width:100%;height:52px}
    .rgen-cap{font:700 9px 'Space Mono',monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ui-dim,#8c93a0);margin-top:2px}
    .rgen-status{margin:0;font-size:10.5px;line-height:1.35;color:var(--ui-dim,#8c93a0)}
    .rgen-sec{border:1px solid #26292f;border-radius:8px;background:rgba(0,0,0,.18);overflow:hidden}
    .rgen-sec-h{font:700 9px 'Space Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:#9aa0aa;
      padding:5px 8px;background:rgba(255,255,255,.03);border-bottom:1px solid #26292f}
    .rgen-sec-b{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:7px}
    .rgen-presets-row{max-height:72px;overflow:auto}
    .rgen-presets .preset{flex:0 1 auto;min-width:0;padding:4px 7px;font-size:10px}
    .rgen-chiprow,.rgen-transport{display:flex;flex-wrap:wrap;gap:4px}
    .rgen-chips{display:flex;flex-direction:column;gap:4px}
    .rgen-chiprow button,.rgen-transport button{
      background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text,#e9edf2);
      border-radius:6px;padding:5px 7px;font:700 10.5px 'Space Grotesk',sans-serif;cursor:pointer}
    .rgen-chiprow button.on{border-color:var(--pc,#6ec8ff);color:var(--pc,#6ec8ff);
      background:color-mix(in srgb,var(--pc,#6ec8ff) 16%,#17181b)}
    .rgen-transport button.play{background:var(--amber,#d8d8d8);color:var(--ui-on-accent,#180a02);border:0}
    .rgen-transport button{flex:1 1 auto;min-width:0}
    .rgen-slider,.rgen-select{display:flex;flex-direction:column;gap:2px;font-size:10px;color:var(--ui-dim,#8c93a0);min-width:0}
    .rgen-slider-top{display:flex;justify-content:space-between;gap:6px}
    .rgen-read{font:700 10px 'Space Mono',monospace;color:var(--ui-text2,#cfd4da)}
    .rgen-slider input[type=range]{width:100%;accent-color:var(--pc,#6ec8ff)}
    .rgen-select select,.rgen-usersel,.rgen-name{
      width:100%;box-sizing:border-box;background:#17181b;border:1px solid #2a2c31;color:#e9edf2;
      border-radius:6px;padding:4px 6px;font:600 11px 'Space Grotesk',sans-serif}
    .rgen-name{flex:1 1 80px;min-width:70px}
    .rgen-usersel{flex:1 1 90px}
    .rgen-user .rgen-chiprow{align-items:center}
    .rgate-grid16{display:grid;grid-template-columns:repeat(8,1fr);gap:3px}
    .rgate-cell{background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-dim,#8c93a0);
      border-radius:5px;padding:6px 2px;font:700 10px 'Space Mono',monospace;cursor:pointer}
    .rgate-cell.on{background:color-mix(in srgb,var(--pc,#ff6b4a) 32%,#17181b);border-color:var(--pc,#ff6b4a);color:#f2f4f7}
    .rgate-cell.accent{box-shadow:inset 0 -2px 0 var(--amber,#d8d8d8)}
    .rgate-cell.lit{outline:1px solid var(--amber);outline-offset:1px}
    .reucl-dots{display:flex;flex-wrap:wrap;gap:3px}
    .reucl-dot{width:11px;height:11px;border-radius:50%;background:#2a2c31;border:1px solid #3a3d44}
    .reucl-dot.on{background:var(--pc,#7dffb3);border-color:transparent}
    .reucl-dot.b{background:color-mix(in srgb,var(--pc,#7dffb3) 55%,#fff);border-color:transparent}
    .reucl-dot.lit{box-shadow:0 0 0 2px var(--amber)}
    @media (max-width:420px){ .rgen-sec-b{grid-template-columns:1fr} }
  `;
  document.head.appendChild(css);

  window.FM1RackGens = {
    mount(kind, body) {
      const map = {
        gate: buildGate, pianist: buildPianist, quant: buildQuant, euclid: buildEuclid,
        bass: buildBass, drone: buildDrone, riff: buildRiff, markov: buildMarkov,
        polyr: buildPolyr, arp: buildArp, prog: buildProg,
      };
      const fn = map[kind];
      if (fn) return fn(body, kind);
    },
  };
})();
