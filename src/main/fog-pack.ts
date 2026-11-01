// Packs long fog lists in the background (D-047 item 8, docs/specs/sight.md "Fog packing"). One worker bakes the oldest
// ops of the current map's fog; main turns the base into a `packFog` command, which lands only if those ops are still
// there. A worker error, an exit without a result or no result within 10 s is reported, and the worker is replaced.
import path from "node:path";
import { Worker } from "node:worker_threads";
import { COMPACT_AT, fogCheck, type FogBase } from "../core/fog.ts";
import type { TableState } from "../core/table.ts";

const STALL_MS = 10_000;

export type Pack = { scene: string; count: number; check: string; base: FogBase };

/**
 * Starts the worker. `maybePack(state)` posts a pack when the current map's fog has at least COMPACT_AT ops and none is
 * running; `onBase` gets the finished pack, `onProblem` a short text for the Problem report.
 */
export function startPacking(onBase: (pack: Pack) => void, onProblem: (text: string) => void): { maybePack: (state: TableState) => void } {
  let worker: Worker | null = null;
  let running: { scene: string; count: number; check: string; timer: NodeJS.Timeout } | null = null;

  const fail = (text: string) => {
    if (running) clearTimeout(running.timer);
    running = null;
    const w = worker;
    worker = null;
    // Replaced at the next pack; the 1,900-op fallback in `addFog` still holds meanwhile.
    void w?.terminate();
    onProblem(text);
  };

  function spawn(): Worker {
    const w = new Worker(path.join(__dirname, "fog-pack-worker.cjs"));
    w.on("message", (base: FogBase) => {
      if (w !== worker || !running) return;
      const { scene, count, check, timer } = running;
      clearTimeout(timer);
      running = null;
      onBase({ scene, count, check, base });
    });
    w.on("error", (e) => {
      if (w === worker) fail(`Fog packing failed (${e.message}).`);
    });
    w.on("exit", (code) => {
      if (w === worker) fail(`Fog packing stopped without a result (exit ${code}).`);
    });
    return w;
  }

  function maybePack(state: TableState): void {
    const m = state.map;
    if (running || !m || m.fog.length < COMPACT_AT) return;
    const ops = m.fog.slice(0, m.fog.length);
    worker ??= spawn();
    const timer = setTimeout(() => fail(`Fog packing took over ${STALL_MS / 1000} s; restarted.`), STALL_MS);
    running = { scene: state.scene, count: ops.length, check: fogCheck(ops), timer };
    worker.postMessage({ ops, bounds: m.bounds });
  }

  return { maybePack };
}
