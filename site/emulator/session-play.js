// Start-once session: after the user presses Start, firmware picks auto-boot and Start stays hidden.
export const SESSION_KEY = "fm1.audio";
export const SESSION_CLASS = "fm1-session";

let live = false;

export function sessionLive() {
  if (live) return true;
  try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch { return false; }
}

export function markSessionLive(startBtn) {
  live = true;
  try { sessionStorage.setItem(SESSION_KEY, "1"); } catch {}
  document.documentElement.classList.add(SESSION_CLASS);
  applyStartButton(startBtn, true);
}

export function clearSession(startBtn) {
  live = false;
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  document.documentElement.classList.remove(SESSION_CLASS);
  applyStartButton(startBtn, false);
}

export function hideStartForSession(startBtn) {
  if (!sessionLive()) return;
  document.documentElement.classList.add(SESSION_CLASS);
  applyStartButton(startBtn, true);
}

export function applyStartButton(startBtn, playing) {
  if (!startBtn) return;
  if (playing) {
    startBtn.hidden = true;
  } else {
    startBtn.hidden = false;
    startBtn.disabled = false;
  }
}

// May this call start audio and boot?
export function mayEnsurePlaying({ cold, fromUser, live }) {
  if (!cold) return true;
  if (fromUser) return true;
  return !!live;
}

export function autostartFromParams(params, embed) {
  if (embed) return false;
  return params.get("autostart") === "1";
}
