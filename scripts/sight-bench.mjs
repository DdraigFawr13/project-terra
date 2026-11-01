// Times a Sight re-look on the dense test map with four tokens (docs/specs/sight.md, J6). Not run in CI: timings on
// shared runners are noise (VER-04). Usage: npm run bench:sight [runs]
// The whole look is a token move through `apply`, `afterCommand` and `playerViewOf`. Packing runs in a worker in the
// app (D-047 item 8), so it stays out of the timed path; one `bake` of 500 ops is timed apart as the worker's cost, with
// the main thread's share of a pack (two `fogCheck`s and the `packFog` command).
import { performance } from "node:perf_hooks";
import { denseRooms } from "../src/core/sight-fixtures.ts";
import { bake, COMPACT_AT, fogCheck } from "../src/core/fog.ts";
import { afterCommand } from "../src/core/sight.ts";
import { apply, defaultState, playerViewOf } from "../src/core/table.ts";
import { blockIndex, blockersFor, sightFrom } from "../src/core/wallcheck.ts";

const runs = Number(process.argv[2] ?? 200);
const { annotation, bounds, points } = denseRooms(20, 12, 60);

let state = apply(defaultState(), {
  type: "placeMap",
  map: {
    id: "map-bench",
    name: "Dense rooms",
    bounds,
    feetPerSquare: 5,
    x: 0,
    y: 0,
    turns: 0,
    fog: [],
    discs: [],
    groups: {},
    pins: [],
    drawings: [],
    spots: [],
    party: null,
    tokens: [],
    doors: {},
  },
});
state = apply(state, { type: "sceneSight", id: state.scene, sight: "on" });
for (const [n, at] of points.entries()) {
  state = apply(state, {
    type: "addCharacter",
    character: { name: `Hero ${n + 1}`, ac: 12, hp: 10, hpMax: 10, passive: 10, speed: 30, conditions: [] },
  });
  state = apply(state, { type: "token", id: `pc-${n + 1}`, at });
}

let k = 0;
/** One token move with its re-look, as main runs it: `apply`, `afterCommand` (index, dimSeen, 4 outlines through `addFog`), `playerViewOf`. */
function look(s) {
  // Each token in turn steps a square and back, so every look has a token move to follow.
  const n = k % points.length;
  const at = points[n];
  const c = { type: "token", id: `pc-${n + 1}`, at: { x: at.x + (Math.floor(k / points.length) % 2), y: at.y } };
  k++;
  const next = afterCommand(s, apply(s, c), c, annotation);
  playerViewOf(next, "window");
  return next;
}

/** What the worker does off the main thread once the list reaches COMPACT_AT: untimed here, as in the app. */
function pack(s) {
  const fog = s.map.fog;
  if (fog.length < COMPACT_AT) return s;
  return apply(s, { type: "packFog", scene: s.scene, count: fog.length, check: fogCheck(fog), base: bake(fog, s.map.bounds) });
}

const time = (fn) => {
  const t0 = performance.now();
  const out = fn();
  return [performance.now() - t0, out];
};
const stats = (ms) => {
  const s = [...ms].sort((a, b) => a - b);
  const at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return `median ${at(0.5).toFixed(2)} ms, 95th ${at(0.95).toFixed(2)} ms, slowest ${s[s.length - 1].toFixed(2)} ms`;
};

// Warm up, then measure each part and the whole.
for (let w = 0; w < 20; w++) state = pack(look(state));
const [indexMs, outlineMs, wholeMs] = [[], [], []];
const pointsPer = [];
let packs = 0;
for (let r = 0; r < runs; r++) {
  const [ims, index] = time(() => blockIndex(annotation, state.map.doors, state.map.bounds));
  indexMs.push(ims);
  for (const t of points) {
    const [oms, outline] = time(() => sightFrom(index, t, null));
    outlineMs.push(oms);
    if (r === 0) pointsPer.push(outline.length);
  }
  const [wms, next] = time(() => look(state));
  if (next.map.fog.some((op, i) => op.kind === "base" && state.map.fog[i] !== op)) throw new Error("addFog baked in the timed path");
  wholeMs.push(wms);
  const packed = pack(next);
  if (packed !== next) packs++;
  state = packed;
}
// The worker's cost: one bake of the first 500 ops of a list as long looks leave it, and main's share of that pack.
let list = state;
while (list.map.fog.length < COMPACT_AT) list = look(list);
const ops = list.map.fog.slice(0, COMPACT_AT);
const bakes = [];
const checks = [];
const lands = [];
for (let r = 0; r < 5; r++) {
  const [bms, base] = time(() => bake(ops, list.map.bounds));
  bakes.push(bms);
  // Main posts the pack with a fogCheck; the packFog command checks it again when the base lands.
  const [cms, check] = time(() => fogCheck(ops));
  checks.push(cms);
  lands.push(time(() => apply(list, { type: "packFog", scene: list.scene, count: COMPACT_AT, check, base }))[0]);
}
console.log(`Dense test map: ${blockersFor(annotation, {}).length} blocking pieces, 4 tokens, ${runs} runs (Node ${process.version}).`);
console.log(`Index:              ${stats(indexMs)}`);
console.log(`sightFrom per token: ${stats(outlineMs)}; points ${pointsPer.join(", ")}`);
console.log(`Whole look:         ${stats(wholeMs)} (token move: apply, afterCommand, playerViewOf; no packing)`);
console.log(`Packs landed between looks: ${packs} (untimed; the worker's job)`);
console.log(`Worker bake of ${COMPACT_AT} ops: ${stats(bakes)}`);
console.log(
  `Main thread per pack: fogCheck of ${COMPACT_AT} ops ${stats(checks)} when posting; packFog landing (its own fogCheck) ${stats(lands)}`,
);
