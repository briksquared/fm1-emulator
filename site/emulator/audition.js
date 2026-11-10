// Audition: play a short generated riff through the current firmware so you can
// hear it without reaching for the keys — handy when browsing hundreds of them.
// Phrases are seeded (same firmware → same demo), can follow the active scale
// lock, and offer a few styles (melody / bass / arp / chords).
(function () {
  "use strict";
  const PENT = [0, 2, 4, 7, 9];
  const STYLES = ["melody", "bass", "arp", "chords"];

  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function activeDegrees() {
    const S = window.FM1Scale;
    if (S && S.enabled && S.enabled()) {
      // Prefer the locked scale's pitch classes (relative to C) plus its root.
      const name = S.get();
      const root = S.getRoot();
      const table = {
        major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11],
        dorian: [0, 2, 3, 5, 7, 9, 10], phryg: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
        mixo: [0, 2, 4, 5, 7, 9, 10], pentM: [0, 2, 4, 7, 9], pentm: [0, 3, 5, 7, 10], blues: [0, 3, 5, 6, 7, 10],
      };
      const pc = table[name] || PENT;
      return { root: 60 + root, deg: pc };
    }
    return { root: 60, deg: PENT };
  }

  // Pure: timed note events for a style. Exposed for unit tests.
  function phrase(seed, bars, bpm, style) {
    const r = rng(seed || 1);
    const B = bars || 2, tempo = bpm || 112;
    const st = STYLES.includes(style) ? style : "melody";
    const stepMs = 60000 / tempo / 2;
    const steps = B * 8;
    const { root, deg } = activeDegrees();
    const pick = () => deg[Math.floor(r() * deg.length)];
    const ev = [];

    if (st === "bass") {
      for (let s = 0; s < steps; s++) {
        if (s % 2 !== 0 && r() > 0.35) continue;
        const note = Math.max(24, Math.min(54, root - 24 + pick()));
        const dur = stepMs * (s % 4 === 0 ? 1.6 : 0.9);
        ev.push({ note, t: s * stepMs, dur, vel: 78 + Math.floor(r() * 30) });
      }
    } else if (st === "arp") {
      const chord = [0, 2, 4].map((i) => deg[i % deg.length]);
      for (let s = 0; s < steps; s++) {
        const iv = chord[s % chord.length];
        const oct = Math.floor(s / chord.length) % 2 === 0 ? 0 : 12;
        const note = Math.max(36, Math.min(96, root + iv + oct));
        ev.push({ note, t: s * stepMs, dur: stepMs * 0.85, vel: 70 + ((s % 3) * 12) });
      }
    } else if (st === "chords") {
      for (let s = 0; s < steps; s += 4) {
        const base = root + pick();
        const stack = [0, 4, 7].map((iv) => Math.max(24, Math.min(100, base + iv)));
        for (const note of stack) {
          ev.push({ note, t: s * stepMs, dur: stepMs * 3.4, vel: 62 + Math.floor(r() * 28) });
        }
      }
    } else {
      for (let s = 0; s < steps; s++) {
        if (r() < 0.18) continue;
        const oct = r() < 0.22 ? 12 : (r() < 0.1 ? -12 : 0);
        const note = Math.max(36, Math.min(96, root + pick() + oct));
        const dur = stepMs * (r() < 0.28 ? 2 : 1) * 0.9;
        ev.push({ note, t: s * stepMs, dur, vel: 70 + Math.floor(r() * 45) });
      }
    }
    return { ev, bpm: tempo, lenMs: steps * stepMs, style: st };
  }

  let timers = [], playing = false, onState = null, style = "melody";
  try {
    const s = localStorage.getItem("fm1.audition.style");
    if (STYLES.includes(s)) style = s;
  } catch { /* ignore */ }

  function stop() {
    playing = false;
    for (const t of timers) clearTimeout(t);
    timers = [];
    const fm = window.FM1;
    if (fm && fm.midi) for (let ch = 0; ch < 16; ch++) { fm.midi([0xb0 | ch, 123, 0]); }
    if (onState) onState(false);
  }

  function play(seed, opts) {
    const fm = window.FM1;
    if (!fm || !fm.midi || !fm.running || !fm.running()) return false;
    stop();
    const o = opts && typeof opts === "object" ? opts : {};
    const st = STYLES.includes(o.style) ? o.style : style;
    const bars = o.bars || (st === "chords" ? 4 : 4);
    const bpm = o.bpm || 112;
    const rf = (fm.runningFirmware && fm.runningFirmware()) || {};
    const s = seed != null ? seed : [...String(rf.id || rf.name || "fm1")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
    const p = phrase(s, bars, bpm, st);
    playing = true;
    if (onState) onState(true);
    for (const e of p.ev) {
      timers.push(setTimeout(() => { if (playing) fm.midi([0x90, e.note, e.vel]); }, e.t));
      timers.push(setTimeout(() => { if (playing) fm.midi([0x80, e.note, 0]); }, e.t + e.dur));
    }
    timers.push(setTimeout(stop, p.lenMs + 300));
    return true;
  }

  function setStyle(s) {
    if (!STYLES.includes(s)) return style;
    style = s;
    try { localStorage.setItem("fm1.audition.style", s); } catch { /* ignore */ }
    return style;
  }

  window.FM1Audition = {
    phrase, rng, play, stop, playing: () => playing,
    styles: () => STYLES.slice(),
    style: () => style,
    setStyle,
    cycleStyle: () => setStyle(STYLES[(STYLES.indexOf(style) + 1) % STYLES.length]),
    onState: (fn) => { onState = fn; },
  };
})();
