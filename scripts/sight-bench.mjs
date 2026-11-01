// Times a Sight re-look on the dense test map with four tokens (docs/specs/sight.md, J6). Not run in CI: timings on
// shared runners are noise (VER-04). Usage: npm run bench:sight [runs]
// Until S2 brings `afterCommand`, this times a stand-in for it (Morgan, 2026-11-01): build the index, `sightFrom` for
// each token, then apply one `dimSeen` and one reveal outline per token through `apply` (which calls `addFog`), then
// `playerViewOf`. S2 swaps the stand-in for `afterCommand` itself.
import { performance } from "node:perf_hooks";
import { denseRooms } from "../src/core/sight-fixtures.ts";
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
for (const [n, at] of points.entries()) {
  state = apply(state, { type: "addCharacter", character: { name: `Hero ${n + 1}`, ac: 12, hp: 10, hpMax: 10, passive: 10, speed: 30 } });
  state = apply(state, { type: "token", id: `pc-${n + 1}`, at });
}

function relook(s) {
  const index = blockIndex(annotation, s.map.doors, s.map.bounds);
  let next = apply(s, { type: "fog", op: { kind: "dimSeen" } });
  for (const t of s.map.tokens) {
    const outline = sightFrom(index, t, null);
    if (outline.length) next = apply(next, { type: "fog", op: { kind: "outline", mode: "reveal", points: outline } });
  }
  playerViewOf(next, "window");
  return next;
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
for (let k = 0; k < 20; k++) state = relook(state);
const [indexMs, outlineMs, wholeMs, bakeMs] = [[], [], [], []];
let pointsPer = [];
for (let k = 0; k < runs; k++) {
  const [ims, index] = time(() => blockIndex(annotation, state.map.doors, state.map.bounds));
  indexMs.push(ims);
  for (const t of state.map.tokens) {
    const [oms, outline] = time(() => sightFrom(index, t, null));
    outlineMs.push(oms);
    if (k === 0) pointsPer.push(outline.length);
  }
  const [wms, next] = time(() => relook(state));
  // A shorter fog list means `addFog` baked it into one base (fog.ts, COMPACT_AT): timed apart.
  (next.map.fog.length < state.map.fog.length ? bakeMs : wholeMs).push(wms);
  state = next;
}
console.log(`Dense test map: ${blockersFor(annotation, {}).length} blocking pieces, 4 tokens, ${runs} runs (Node ${process.version}).`);
console.log(`Index:              ${stats(indexMs)}`);
console.log(`sightFrom per token: ${stats(outlineMs)}; points ${pointsPer.join(", ")}`);
console.log(`Whole re-look:      ${stats(wholeMs)} without a bake (index, 4 outlines, dimSeen and reveals through apply, playerViewOf)`);
console.log(`Re-looks that baked the fog list: ${bakeMs.length}, ${bakeMs.map((ms) => `${ms.toFixed(0)} ms`).join(", ")}`);
