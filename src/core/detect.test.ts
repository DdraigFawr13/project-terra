import { test } from "node:test";
import assert from "node:assert/strict";
import { detect, scoreThings, scoreWalls } from "./detect.ts";
import { drawMap } from "./mapdraw.ts";
import { generate, type Segment, type Terrain } from "./mapgen.ts";

// Small maps keep the suite inside its budget (D-020); the script draws full maps at 40 pixels per inch. Walls and
// objects are found from 12 pixels per inch; doors need about 20, below which their pencil outline is as thick as a
// wall's ink. Each map is the smallest that still has walls (and, for the town, open and closed doors).
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
    const found = detect(drawMap(m, ppi), ppi);
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

test("finds the walls where rock is printed solid black", () => {
  const m = generate("dungeon", 1, 18, 12);
  const w = scoreWalls(m.walls, detect(drawMap(m, 12, "solid"), 12).walls);
  assert.ok(w.recall >= 0.95 && w.precision >= 0.95, JSON.stringify(w));
});
