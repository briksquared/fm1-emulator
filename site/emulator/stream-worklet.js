// The audio thread's side of engine.js: plays the frames the emulator worker sends and gives
// back credit for each one played. Nothing here allocates or emulates, so the audio callback
// stays short whatever the firmware does. A dry queue plays silence and is counted.
class Fm1Stream extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.queue = [];
    this.head = 0;                       // read position in queue[0]
    this.played = 0;                     // frames played since credit was last returned
    this.underruns = 0;                  // quanta the queue ran dry in (after the first audio)
    this.started = false;
    this.reported = 0;
    this.prefill = options.processorOptions?.prefill || 2048;
    this.engine = null;
    this.port.onmessage = (e) => {
      if (e.data?.type !== "engine" || !e.data.port) return;
      this.engine = e.data.port;
      this.engine.onmessage = (a) => { if (a.data?.type === "audio") this.queue.push(a.data); };
      this.engine.postMessage({ type: "need", frames: this.prefill });
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0], l = out[0], r = out[1] || out[0], n = l.length;
    let at = 0;
    while (at < n && this.queue.length) {
      const chunk = this.queue[0], take = Math.min(n - at, chunk.l.length - this.head);
      l.set(chunk.l.subarray(this.head, this.head + take), at);
      if (out[1]) r.set(chunk.r.subarray(this.head, this.head + take), at);
      at += take;
      this.head += take;
      if (this.head >= chunk.l.length) { this.queue.shift(); this.head = 0; }
    }
    if (at > 0) this.started = true;
    if (at < n && this.started) this.underruns++;   // (the rest of the quantum stays silent)
    if (++this.reported >= sampleRate / 128) {      // about once a second, for the page's report
      this.reported = 0;
      this.port.postMessage({ type: "stream", underruns: this.underruns, queued: this.queue.reduce((a, c) => a + c.l.length, 0) - this.head });
    }
    this.played += at;
    if (this.engine && this.played >= 256) {
      this.engine.postMessage({ type: "need", frames: this.played });
      this.played = 0;
    }
    return true;
  }
}
registerProcessor("fm1-stream", Fm1Stream);
