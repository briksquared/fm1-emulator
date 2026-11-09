// The once-a-second call on whether the emulator is keeping up, kept free of the page so it can
// be tested on its own (ci/perf-tests.mjs). `st` carries { secs, bad, dryAt } between seconds.
//
// Seconds that say nothing about this device keeping up are skipped: the audio clock stopped (an
// output device change, Bluetooth reconnecting, sleep, a suspended context) or the page was
// hidden. They used to count as "late" and brought up the buffer warning, which no buffer fixes.
//
// The worker engine: the audio thread keeps time and plays silence when the emulator is late, so
// the clock stays steady either way; the real measure is the quanta that ran dry.
export const GRACE_SECONDS = 5;     // booting, compiling, the queue refilling
export const DRY_PER_SECOND = 3;    // dry quanta in a second that count as a dropout
export const BAD_SECONDS = 3;       // bad seconds in a row before the notice

export function judgeSecond(st, s) {
  const newDry = s.dry != null && st.dryAt != null ? s.dry - st.dryAt : 0;
  if (s.dry != null) st.dryAt = s.dry;
  const stalled = s.state !== "running" || s.hidden || s.gap > 1600 || Math.abs(s.drift) > 0.5;
  if (++st.secs <= GRACE_SECONDS || s.halted) return { warn: false, late: false };
  if (stalled) { st.bad = 0; return { warn: false, late: false, stalled: true }; }
  const over = s.load > 0.95;
  const late = s.worker ? newDry >= DRY_PER_SECOND : s.drift > 0.02;
  st.bad = over || late ? st.bad + 1 : 0;
  return { warn: st.bad >= BAD_SECONDS, over, late };
}

// Once the notice is up it stays while the dropouts go on; this many good seconds in a row clear
// it (a stalled second neither counts nor resets: it says nothing either way).
export const GOOD_SECONDS_TO_CLEAR = 20;
export function recovered(st, j) {
  if (j.stalled) return false;
  st.good = j.late || j.over ? 0 : (st.good || 0) + 1;
  if (st.good < GOOD_SECONDS_TO_CLEAR) return false;
  st.good = 0;
  return true;
}
