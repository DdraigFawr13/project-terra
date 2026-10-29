import { test } from "node:test";
import assert from "node:assert/strict";
import { detect, scoreThings, scoreWalls } from "./detect.ts";
import { drawMap } from "./mapdraw.ts";
import { TERRAINS, generate } from "./mapgen.ts";

// Small maps at 12 pixels per inch keep the suite inside its budget (D-020); the script draws full maps at 40.
const PPI = 12;

test("finds each terrain's walls and objects in the drawn map, and not the pencil", () => {
  for (const t of TERRAINS) {
    const m = generate(t, 1, 18, 12);
    const found = detect(drawMap(m, PPI), PPI);
    const w = scoreWalls(m.walls, found.walls);
    const o = scoreThings(m.things, found.things);
    assert.ok(w.recall >= 0.95 && w.precision >= 0.95, `${t} walls ${JSON.stringify(w)}`);
    assert.ok(o.recall >= 0.95 && o.precision >= 0.95, `${t} objects ${JSON.stringify(o)}`);
  }
});

test("finds the walls where rock is printed solid black", () => {
  const m = generate("dungeon", 1, 18, 12);
  const w = scoreWalls(m.walls, detect(drawMap(m, PPI, "solid"), PPI).walls);
  assert.ok(w.recall >= 0.95 && w.precision >= 0.95, JSON.stringify(w));
});
