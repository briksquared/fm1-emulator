// Boot every bundled package in an isolated WASM instance and inspect its LCD.
// This exercises the same interpreter and package-resource path as the app.
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const emulator = resolve(here, "../site/emulator");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

if (!isMainThread) {
  const { entry, module, output, seconds, clock } = workerData;
  const result = { id: entry.id, name: entry.name, package: entry.package };
  try {
    const bytes = readFileSync(resolve(emulator, entry.package));
    result.packageHash = sha256(bytes);
    const jitSource = readFileSync(resolve(emulator, "jit.js")).toString("base64");
    const { jitImports } = await import(`data:text/javascript;base64,${jitSource}`);
    let machine;
    machine = new WebAssembly.Instance(module, { env: jitImports(() => machine) }).exports;
    machine.fm1_jit(0, 16);
    machine.fm1_ahead(1024);
    const pointer = machine.fm1_alloc(bytes.length);
    new Uint8Array(machine.memory.buffer, pointer, bytes.length).set(bytes);
    if (machine.fm1_boot_fwsc(pointer, bytes.length, 0, 0, clock) !== 0) {
      throw new Error("package boot rejected");
    }
    const resourceSource = readFileSync(resolve(emulator, "package-resources.js")).toString("base64");
    const { applyPackageResources } = await import(`data:text/javascript;base64,${resourceSource}`);
    result.resourceBytes = applyPackageResources(machine, bytes);
    result.xipHash = sha256(new Uint8Array(machine.memory.buffer, machine.fm1_xip(), machine.fm1_xip_len()));
    machine.fm1_usb_plug();

    const total = 44100 * seconds;
    const marks = [0.4, 0.6, 0.8, 1.0];
    const samples = [];
    let mark = 0;
    const started = performance.now();
    for (let frame = 0; frame < total; frame += 128) {
      machine.fm1_render(128, 4_000_000);
      if (mark < marks.length && frame >= total * marks[mark]) {
        const lcd = new Uint16Array(machine.memory.buffer, machine.fm1_lcd(), 240 * 240);
        samples.push(new Set(lcd).size);
        mark += 1;
      }
    }
    result.wallMs = Math.round(performance.now() - started);
    const lcd = new Uint16Array(machine.memory.buffer, machine.fm1_lcd(), 240 * 240);
    result.colorsSamples = samples;
    result.colorsMax = samples.length ? Math.max(...samples) : 0;
    result.halted = Boolean(machine.fm1_halted());
    result.ms = machine.fm1_ms();
    result.board = machine.fm1_board();
    result.lcdHash = sha256(Buffer.from(lcd.buffer, lcd.byteOffset, lcd.byteLength));
    result.colors = new Set(lcd).size;
    writeFileSync(resolve(output, `${entry.id}.rgb565`), Buffer.from(lcd.buffer, lcd.byteOffset, lcd.byteLength));
  } catch (error) {
    result.error = String(error);
  }
  parentPort.postMessage(result);
} else {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  if (outIndex < 0 || !args[outIndex + 1]) {
    throw new Error("usage: node ci/audit-firmwares.mjs --out DIRECTORY [--seconds N] [--timeout N] [ID ...]");
  }
  const output = resolve(args[outIndex + 1]);
  args.splice(outIndex, 2);
  const option = (name, fallback) => {
    const index = args.indexOf(name);
    if (index < 0) return fallback;
    const value = Number(args[index + 1]);
    args.splice(index, 2);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`invalid ${name}`);
    return value;
  };
  const seconds = option("--seconds", 3);
  const timeout = option("--timeout", 30);
  const clock = option("--clock", 100);
  mkdirSync(output, { recursive: true });
  const catalog = JSON.parse(readFileSync(resolve(emulator, "firmwares.json"))).firmwares;
  const entries = catalog.filter((firmware) => firmware.package && (!args.length || args.includes(firmware.id)));
  const module = new WebAssembly.Module(readFileSync(resolve(emulator, "fm1_web.wasm")));
  const results = [];
  let next = 0;

  async function run() {
    while (next < entries.length) {
      const entry = entries[next++];
      const result = await new Promise((finishPromise) => {
        const worker = new Worker(new URL(import.meta.url), {
          workerData: { entry, module, output, seconds, clock },
        });
        let done = false;
        const finish = (value) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          finishPromise(value);
        };
        const timer = setTimeout(() => {
          worker.terminate();
          finish({ id: entry.id, error: `${timeout}-second audit timeout` });
        }, timeout * 1000);
        worker.once("message", finish);
        worker.once("error", (error) => finish({ id: entry.id, error: String(error) }));
        worker.once("exit", (code) => {
          if (!done) finish({ id: entry.id, error: `worker exited ${code}` });
        });
      });
      results.push(result);
      if (results.length % 25 === 0 || results.length === entries.length) {
        console.log(`audited ${results.length}/${entries.length}`);
      }
    }
  }

  await Promise.all([run(), run(), run()]);
  const groups = (key) => {
    const grouped = new Map();
    for (const result of results) {
      if (result[key]) grouped.set(result[key], [...(grouped.get(result[key]) || []), result.id]);
    }
    return [...grouped.values()].filter((ids) => ids.length > 1);
  };
  const failures = results.filter((result) =>
    result.error || result.halted || Math.max(result.colors || 0, result.colorsMax || 0) < 2
  );
  const report = {
    count: results.length,
    seconds,
    clock,
    failures,
    identicalPackages: groups("packageHash"),
    identicalPrograms: groups("xipHash"),
    results,
  };
  writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    count: report.count,
    failures: report.failures,
    identicalPackages: report.identicalPackages,
  }));
  if (report.count !== entries.length || report.failures.length || report.identicalPackages.length) {
    process.exitCode = 1;
  }
}
