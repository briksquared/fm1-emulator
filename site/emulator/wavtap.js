// Audio tap for the recorder: passes the FM-1's output through untouched and
// posts a copy of every quantum to the page. Runs on the audio thread, so a
// long recording never depends on main-thread timing.
class WavTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false;
    this.port.onmessage = (e) => { if (e.data && e.data.type === "arm") this.on = !!e.data.on; };
  }
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (input && input.length) {
      // Pass-through so the tap can sit in the graph without changing the sound.
      for (let c = 0; c < output.length; c++) {
        const src = input[Math.min(c, input.length - 1)];
        if (src) output[c].set(src);
      }
      if (this.on) {
        // Copy: the engine reuses these buffers on the next quantum.
        const copy = input.map((ch) => new Float32Array(ch));
        this.port.postMessage({ type: "chunk", channels: copy }, copy.map((c) => c.buffer));
      }
    }
    return true;
  }
}
registerProcessor("fm1-wav-tap", WavTap);
