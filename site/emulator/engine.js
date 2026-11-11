// The emulator off the audio thread. worklet.js's machine runs here, in a dedicated worker,
// and streams its audio to a small reader in the AudioWorklet (stream-worklet.js) that only
// copies samples out. Running the whole machine inside the audio callback left no slack: one
// slow quantum (a JIT compile, a garbage collection, a busy stretch of firmware, the OS moving
// the audio thread to a slower core) was an audible gap, and a device near its limit played
// a stream of gaps that sounds like noise. Here those stalls are absorbed by a short queue.
//
// Flow control: the reader starts with `prefill` frames of credit and returns credit for every
// frame it plays, so exactly that much audio is in flight and the emulation stays paced by the
// audio device, as before, just `prefill` frames ahead of it.
const QUANTUM = 128;
const CHUNK = 1024;                      // frames per message to the reader (more = less thread overhead)

let proc = null, audio = null, credit = 0;
const pending = [];                      // page messages that arrive before the machine is loaded

self.onmessage = async (e) => {
  const m = e.data;
  if (m?.type === "engine-init") {
    globalThis.sampleRate = m.sampleRate;
    let Processor = null;
    globalThis.registerProcessor = (_name, c) => { Processor = c; };
    globalThis.AudioWorkletProcessor = class {
      constructor() { this.port = { postMessage: (msg, transfer) => self.postMessage(msg, transfer || []), onmessage: null, onmessageerror: null }; }
    };
    await import("./worklet.js?v=30");
    proc = new Processor();
    audio = m.audio;
    audio.onmessage = (a) => { if (a.data?.type === "need") { credit += a.data.frames; render(); } };
    for (const p of pending.splice(0)) proc.port.onmessage({ data: p });
    return;
  }
  if (!proc) { pending.push(m); return; }
  proc.port.onmessage({ data: m });
};

const outL = new Float32Array(QUANTUM), outR = new Float32Array(QUANTUM);
const outputs = [[outL, outR]];
function render() {
  while (credit >= QUANTUM) {
    const frames = Math.min(CHUNK, credit - credit % QUANTUM);
    const l = new Float32Array(frames), r = new Float32Array(frames);
    for (let at = 0; at < frames; at += QUANTUM) {
      outL.fill(0); outR.fill(0);
      proc.process([], outputs);
      l.set(outL, at); r.set(outR, at);
    }
    credit -= frames;
    audio.postMessage({ type: "audio", l, r }, [l.buffer, r.buffer]);
  }
}
