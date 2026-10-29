import { test } from "node:test";
import assert from "node:assert/strict";
import { TERRAINS, floorAt, generate, segDist } from "./mapgen.ts";

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
