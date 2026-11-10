#!/usr/bin/env node
// Fake-upload every catalog .fwsc against the simulated FM-1 (no real hardware).
// Usage: node ci/test-flash-all.mjs [--out DIR] [--jobs N] [ID ...]
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

if (!isMainThread) {
  const { entry, emulator, FAST } = workerData;
  const row = { id: entry.id, name: entry.name, package: entry.package, product: entry.product };
  try {
    const { Updater } = await import(new URL("../site/emulator/fm1ota.js", import.meta.url));
    const { Unit } = await import(new URL("./fake-fm1.mjs", import.meta.url));
    const { validatePackage } = await import(new URL("../site/emulator/flash-core.js", import.meta.url));
    const bytes = new Uint8Array(readFileSync(resolve(emulator, entry.package)));
    const pkg = await validatePackage(bytes, { sha256: entry.sha256, product: entry.product });
    row.validated = true;
    row.imageBytes = pkg.image.length;
    const unit = new Unit({ identity: "FM-1_900", image: pkg.image, target: pkg.product });
    const steps = [];
    const id = await new Updater(unit.access, null, { timing: FAST }).install(
      pkg.image,
      pkg.product,
      (p) => steps.push(p),
    );
    if (id !== pkg.product) throw new Error(`identity after install: ${id}`);
    if (unit.badAnswers) throw new Error(`badAnswers=${unit.badAnswers}`);
    for (const p of ["start", "stage", "loader", "write", "reboot", "done"]) {
      if (!steps.includes(p)) throw new Error(`missing step ${p}`);
    }
    row.ok = true;
    row.steps = steps;
  } catch (error) {
    row.ok = false;
    row.error = String(error && error.message ? error.message : error);
    if (error && error.code) row.code = error.code;
  }
  parentPort.postMessage(row);
} else {
  const root = resolve(import.meta.dirname, "..");
  const emulator = resolve(root, "site/emulator");
  const FAST = {
    settle: 5, loaderBoot: 5, rebootBoot: 5, stageIdle: 150, returnIdle: 150,
    loaderWait: 300, returnWait: 300, poll: 15, openTimeout: 60, handshake: 40,
    packetGap: 0, backoff: 5, retries: 3,
  };

  const args = process.argv.slice(2);
  let outDir = resolve(root, "ci/out/flash-all");
  let jobs = 4;
  const take = (name, fallback) => {
    const i = args.indexOf(name);
    if (i < 0) return fallback;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const outOpt = take("--out");
  if (outOpt) outDir = resolve(outOpt);
  const jobsOpt = take("--jobs");
  if (jobsOpt) jobs = Math.max(1, Math.min(8, Number(jobsOpt) || 4));
  mkdirSync(outDir, { recursive: true });

  const catalog = JSON.parse(readFileSync(resolve(emulator, "firmwares.json"), "utf8")).firmwares;
  const entries = catalog.filter((f) => f.package && (!args.length || args.includes(f.id)));
  const results = [];
  let next = 0;
  const started = Date.now();

  async function runWorker() {
    while (next < entries.length) {
      const entry = entries[next++];
      const row = await new Promise((finish) => {
        const worker = new Worker(new URL(import.meta.url), {
          workerData: { entry, emulator, FAST },
        });
        let done = false;
        const end = (value) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          finish(value);
        };
        const timer = setTimeout(() => {
          worker.terminate();
          end({ id: entry.id, name: entry.name, package: entry.package, product: entry.product, ok: false, error: "flash-all worker timeout" });
        }, 180_000);
        worker.once("message", end);
        worker.once("error", (error) => end({ id: entry.id, ok: false, error: String(error) }));
        worker.once("exit", (code) => {
          if (!done) end({ id: entry.id, ok: false, error: `worker exited ${code}` });
        });
      });
      results.push(row);
      if (results.length % 25 === 0 || results.length === entries.length) {
        const ok = results.filter((r) => r.ok).length;
        const failed = results.length - ok;
        console.log(`flash-all ${results.length}/${entries.length} (ok ${ok}, fail ${failed})`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(jobs, entries.length) }, () => runWorker()));
  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  const report = {
    count: results.length,
    ok,
    failed,
    wallMs: Date.now() - started,
    failures: results.filter((r) => !r.ok),
    results,
  };
  writeFileSync(resolve(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    count: report.count,
    ok,
    failed,
    wallMs: report.wallMs,
    failures: report.failures.map((f) => ({ id: f.id, error: f.error, code: f.code })),
  }));
  if (failed || report.count !== entries.length) process.exitCode = 1;
  else console.log(`PASS: fake-uploaded ${ok} catalog packages`);
}
