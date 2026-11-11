// Whether the WebAssembly JIT runs for this session. Worker engine: on by default (queue
// absorbs compiles). Audio-thread fallback: interpreter unless ?jit=1. Some firmwares measure
// slower with JIT — interpreter unless ?jit=1 forces it.
export const JIT_SLOWER = new Set(["dark1"]);

export function usesWorkerEngine(params) {
  return params.get("engine") !== "worklet" && typeof Worker === "function";
}

export function jitEnabled({ worker, fwId, params }) {
  const forceOn = params.get("jit") === "1";
  const forceOff = params.get("jit") === "0";
  if (JIT_SLOWER.has(fwId) && !forceOn) return false;
  if (forceOff) return false;
  if (forceOn) return true;
  return !!worker;
}

export function jitQueryForToggle({ worker, wantOn, fwId }) {
  if (worker) {
    if (!wantOn) return { set: { jit: "0" } };
    if (fwId && JIT_SLOWER.has(fwId)) return { set: { jit: "1" } };
    return { delete: ["jit"] };
  }
  return wantOn ? { set: { jit: "1" } } : { delete: ["jit"] };
}
