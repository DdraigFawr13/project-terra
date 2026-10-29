// The generator concept (D-041): generation, drawing, detection and lighting share one file, so the suite starts
// one process for them, not three (D-020).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { detect, scoreThings, scoreWalls } from "./detect.ts";
import { blockers, lightMap } from "./light.ts";
import { drawMap } from "./mapdraw.ts";
import { TERRAINS, floorAt, generate, segDist, type Door, type Segment, type Terrain, type Thing, type Wall } from "./mapgen.ts";

test("the same seed gives the same map, another seed another map (GAME-06)", () => {
  for (const t of TERRAINS) {
    assert.deepEqual(generate(t, 7), generate(t, 7));
    assert.notDeepEqual(generate(t, 7).walls, generate(t, 8).walls);
  }
});

test("every terrain keeps its walls on the map, and its objects and lights on clear floor", () => {
  for (const t of TERRAINS)
    for (let seed = 1; seed <= 2; seed++) {
      const m = generate(t, seed);
      assert.ok(m.walls.length > 10 && m.things.length > 3 && m.lights.length > 0, `${t} ${seed} has walls, objects and lights`);
      for (const w of m.walls)
        for (const p of [w.a, w.b]) assert.ok(p.x >= 0 && p.y >= 0 && p.x <= m.width && p.y <= m.height, `${t} ${seed} wall on the map`);
      for (const thing of [...m.things, ...m.lights.map((l) => ({ at: l.at, r: 0.1 }))]) {
        assert.ok(floorAt(m.ground, thing.at), `${t} ${seed} ${JSON.stringify(thing.at)} on floor`);
        const gap = Math.min(...m.walls.map((w) => segDist(thing.at, w.a, w.b)));
        assert.ok(gap >= thing.r - 0.01, `${t} ${seed} ${JSON.stringify(thing.at)} clear of walls by ${gap}`);
      }
      // The annotation is plain data: it saves and loads unchanged.
      const { ground, ...annotation } = m;
      assert.deepEqual(JSON.parse(JSON.stringify(annotation)), annotation);
      assert.equal(ground.v.length, ground.cols * ground.rows);
    }
});

test("the generator concept stays out of the app until its design phase (D-041)", () => {
  const concept = /\/core\/(mapgen|mapdraw|detect|light|rng)\.ts/;
  for (const dir of ["src/main", "src/renderer"])
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".ts")))
      assert.ok(!concept.test(fs.readFileSync(path.join(dir, f), "utf8")), `${dir}/${f} imports the generator concept`);
});

// Small maps keep the suite inside its budget (D-020); the script draws full maps at 40 pixels per inch. Walls and
// objects are found from 12 pixels per inch; doors need about 20, below which their pencil outline is as thick as a
// wall's ink. Each map is the smallest that still has walls (and, for the town, open and closed doors).
// The dungeon is drawn with its rock printed solid black, as many book maps are; the others are hatched.
const MAPS: [Terrain, number, number, number][] = [
  ["dungeon", 18, 12, 12],
  ["cave", 18, 12, 12],
  ["ruins", 24, 16, 12],
  ["town", 20, 14, 20],
];
const mid = (d: Segment) => ({ at: { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 } });

test("finds each terrain's walls, closed doors and objects in the drawn map, and not the pencil", () => {
  for (const [t, width, height, ppi] of MAPS) {
    const m = generate(t, 1, width, height);
    assert.ok(m.walls.length >= 5, `${t} has walls`);
    const found = detect(drawMap(m, ppi, t === "dungeon" ? "solid" : "hatch"), ppi);
    const w = scoreWalls(m.walls, found.walls);
    const o = scoreThings(m.things, found.things);
    assert.ok(w.recall >= 0.95 && w.precision >= 0.95, `${t} walls ${JSON.stringify(w)}`);
    assert.ok(o.recall >= 0.95 && o.precision >= 0.95, `${t} objects ${JSON.stringify(o)}`);
    if (t !== "town") continue;
    // Closed doors count as walls for light and sight, so each must be found; open ones must not be.
    const closed = m.doors.filter((x) => !x.open);
    assert.ok(closed.length >= 1 && closed.length < m.doors.length, "the town has open and closed doors");
    assert.deepEqual(scoreThings(closed.map(mid), found.doors.map(mid)), { recall: 1, precision: 1 }, "closed doors");
  }
});

const LIGHT_PPI = 4;
const size = { width: 30 * LIGHT_PPI, height: 20 * LIGHT_PPI };
/** A 10 × 10 inch room from (5, 5), with a one-inch doorway in its right wall at y 9–10. */
const room: Wall[] = [
  { a: { x: 5, y: 5 }, b: { x: 15, y: 5 } },
  { a: { x: 5, y: 15 }, b: { x: 15, y: 15 } },
  { a: { x: 5, y: 5 }, b: { x: 5, y: 15 } },
  { a: { x: 15, y: 5 }, b: { x: 15, y: 9 } },
  { a: { x: 15, y: 10 }, b: { x: 15, y: 15 } },
].map((s) => ({ ...s, material: "stone" }));
const torch = { kind: "torch" as const, at: { x: 10, y: 9.5 }, brightFt: 20, dimFt: 20 };
const at = (level: Float32Array, x: number, y: number) => level[Math.floor(y * LIGHT_PPI) * size.width + Math.floor(x * LIGHT_PPI)];

function lit(doors: Door[], things: Thing[] = []) {
  return lightMap(size, LIGHT_PPI, 5, [torch], blockers({ walls: room, doors, things }));
}

test("a torch lights 4 squares bright and 4 more dim (at 5 ft a square), and walls stop it", () => {
  const level = lit([]);
  assert.equal(at(level, 12, 9.5), 1);
  assert.equal(at(level, 10, 14.2), 0.5);
  assert.equal(at(level, 10, 16), 0, "behind the bottom wall");
  // Through the doorway the light carries on.
  assert.equal(at(level, 16, 9.5), 0.5);
  assert.equal(at(level, 16, 12), 0, "outside, beside the doorway");
});

test("a closed door blocks light, an open one doesn't; a pillar casts a shadow", () => {
  const door = { a: { x: 15, y: 9 }, b: { x: 15, y: 10 } };
  assert.equal(at(lit([{ ...door, open: false }]), 16, 9.5), 0);
  assert.equal(at(lit([{ ...door, open: true }]), 16, 9.5), 0.5);
  const pillar: Thing = { kind: "pillar", at: { x: 10, y: 8 }, r: 0.5, blocksLight: true };
  const level = lit([], [pillar]);
  assert.equal(at(level, 10, 6), 0, "behind the pillar");
  assert.equal(at(level, 12, 7.5), 1, "beside its shadow");
});
