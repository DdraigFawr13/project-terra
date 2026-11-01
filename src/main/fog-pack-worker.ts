// The fog-pack worker (D-047 item 8): bakes a long fog list into one base off the main thread, so a re-look never waits
// for it. It only calls core `bake` and posts the result back; main checks it still fits before using it.
import { parentPort } from "node:worker_threads";
import { bake, type FogOp } from "../core/fog.ts";
import type { Bounds } from "../core/map.ts";

parentPort?.on("message", (job: { ops: FogOp[]; bounds: Bounds }) => {
  parentPort!.postMessage(bake(job.ops, job.bounds));
});
