import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { addFog, bake, COMPACT_AT, fogAt, parseFog, parseFogOp, type FogBase, type FogOp } from "./fog.ts";

/** The map the fog lies on, in inches. */
const B = { x: -2, y: -1, width: 34, height: 12 };
const add = (fog: FogOp[], op: FogOp) => addFog(fog, op, B);

const room: FogOp = { kind: "box", mode: "reveal", x: 0, y: 0, width: 4, height: 3 };
const brush: FogOp = {
  kind: "brush",
  mode: "reveal",
  r: 1,
  points: [
    { x: 10, y: 0 },
    { x: 14, y: 0 },
  ],
};
const outline: FogOp = {
  kind: "outline",
  mode: "reveal",
  points: [
    { x: 20, y: 0 },
    { x: 24, y: 0 },
    { x: 22, y: 4 },
  ],
};

test("reveal makes an area seen; hide and 'party moves on' leave it explored; cover all makes it black", () => {
  let fog = [room, brush, outline].reduce<FogOp[]>(add, []);
  assert.equal(fogAt([], { x: 1, y: 1 }), "unexplored");
  assert.equal(fogAt(fog, { x: 1, y: 1 }), "seen");
  assert.equal(fogAt(fog, { x: 4, y: 3 }), "seen", "a box includes its edges");
  assert.equal(fogAt(fog, { x: 12, y: 0.9 }), "seen", "within the brush radius");
  assert.equal(fogAt(fog, { x: 12, y: 1.1 }), "unexplored");
  assert.equal(fogAt(fog, { x: 22, y: 1 }), "seen");
  assert.equal(fogAt(fog, { x: 20.5, y: 3 }), "unexplored", "outside the outline");

  fog = add(fog, { kind: "box", mode: "hide", x: 0, y: 0, width: 2, height: 3 });
  assert.equal(fogAt(fog, { x: 1, y: 1 }), "explored");
  assert.equal(fogAt(fog, { x: 3, y: 1 }), "seen");
  fog = add(fog, { kind: "dimSeen" });
  assert.equal(fogAt(fog, { x: 3, y: 1 }), "explored");
  assert.equal(fogAt(fog, { x: 30, y: 30 }), "unexplored");

  // Reveal all and cover all make earlier ops irrelevant, so the list starts afresh.
  assert.deepEqual(add(fog, { kind: "revealAll" }), [{ kind: "revealAll" }]);
  assert.equal(fogAt(add(fog, { kind: "coverAll" }), { x: 3, y: 1 }), "unexplored");
  // A long list is baked into a base and keeps taking strokes (D-029): it never stops, and stays short.
  const long = Array.from({ length: COMPACT_AT }, () => room);
  const next = add(long, brush);
  assert.deepEqual(
    next.map((op) => op.kind),
    ["base", "brush"],
  );
  assert.equal(fogAt(next, { x: 1, y: 1 }), "seen");
  assert.equal(fogAt(next, { x: 12, y: 0.5 }), "seen");
  assert.equal(add(next, outline).length, 3);
});

test("baked fog reads the same as the ops it came from, at every cell, and saves and loads unchanged", () => {
  const bounds = { x: -1, y: -1, width: 4, height: 3 };
  const coord = fc.integer({ min: -150, max: 350 }).map((n) => n / 100);
  const point = fc.record({ x: coord, y: coord });
  const mode = fc.constantFrom("reveal" as const, "hide" as const);
  const op: fc.Arbitrary<FogOp> = fc.oneof(
    fc.record({
      kind: fc.constant("brush" as const),
      mode,
      r: fc.constantFrom(0.25, 0.5, 1, 1.5),
      points: fc.array(point, { minLength: 1, maxLength: 5 }),
    }),
    fc.record({ kind: fc.constant("outline" as const), mode, points: fc.array(point, { minLength: 3, maxLength: 6 }) }),
    fc.record({
      kind: fc.constant("box" as const),
      mode,
      x: fc.integer({ min: -2, max: 3 }),
      y: fc.integer({ min: -2, max: 3 }),
      width: fc.integer({ min: 1, max: 4 }),
      height: fc.integer({ min: 1, max: 4 }),
    }),
    fc.constantFrom<FogOp>({ kind: "dimSeen" }, { kind: "revealAll" }, { kind: "coverAll" }),
  );
  fc.assert(
    fc.property(fc.array(op, { maxLength: 8 }), fc.array(op, { maxLength: 3 }), (before, after) => {
      const base = bake(before, bounds);
      // Baking a list that already starts with a base must work too, as a long session bakes again and again.
      const again = bake([base, ...after], bounds);
      for (let j = 0; j < base.rows; j++)
        for (let i = 0; i < base.cols; i++) {
          const p = { x: base.x + (i + 0.5) / base.ppi, y: base.y + (j + 0.5) / base.ppi };
          assert.equal(fogAt([base], p), fogAt(before, p));
          assert.equal(fogAt([again], p), fogAt([...before, ...after], p));
        }
      assert.deepEqual(parseFogOp(JSON.parse(JSON.stringify(base))), base);
    }),
    { numRuns: 30 },
  );
});

test("a base from untrusted data must cover exactly its cells", () => {
  const good: FogBase = { kind: "base", x: 0, y: 0, ppi: 2, cols: 2, rows: 2, seen: [1, 2, 1], explored: [0, 4] };
  assert.deepEqual(parseFogOp(good), good);
  assert.equal(fogAt([good], { x: 0.75, y: 0.25 }), "seen");
  assert.equal(fogAt([good], { x: 0.25, y: 0.25 }), "explored");
  assert.equal(fogAt([good], { x: 5, y: 5 }), "unexplored", "outside the base");
  for (const bad of [
    { ...good, seen: [1, 2] },
    { ...good, seen: [1, -1, 4] },
    { ...good, explored: [4.5] },
    { ...good, ppi: 25 },
    { ...good, cols: 0, seen: [0], explored: [0] },
    { ...good, x: 0.5 },
  ])
    assert.equal(parseFogOp(bad), null, JSON.stringify(bad));
});

test("fog ops from untrusted data are checked, rounded to hundredths, and -0 becomes 0", () => {
  assert.deepEqual(parseFogOp({ kind: "brush", mode: "hide", r: 0.5, points: [{ x: -0, y: 1.23456 }] }), {
    kind: "brush",
    mode: "hide",
    r: 0.5,
    points: [{ x: 0, y: 1.23 }],
  });
  assert.ok(Object.is((parseFogOp({ kind: "box", mode: "reveal", x: -0, y: 0, width: 1, height: 1 }) as { x: number }).x, 0));
  const bad = [
    { kind: "brush", mode: "reveal", r: 0, points: [{ x: 0, y: 0 }] },
    { kind: "brush", mode: "reveal", r: 1, points: [] },
    { kind: "brush", mode: "peek", r: 1, points: [{ x: 0, y: 0 }] },
    {
      kind: "outline",
      mode: "reveal",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    },
    {
      kind: "outline",
      mode: "reveal",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: Infinity },
        { x: 2, y: 0 },
      ],
    },
    { kind: "box", mode: "reveal", x: 0.5, y: 0, width: 1, height: 1 },
    { kind: "box", mode: "reveal", x: 0, y: 0, width: 0, height: 1 },
    { kind: "brush", mode: "reveal", r: 1, points: Array.from({ length: 1001 }, () => ({ x: 0, y: 0 })) },
    { kind: "explode" },
    null,
  ];
  for (const op of bad) assert.equal(parseFogOp(op), null, JSON.stringify(op).slice(0, 80));
  // A whole list is refused if any op in it is wrong.
  assert.deepEqual(parseFog([room, { kind: "dimSeen" }]), [room, { kind: "dimSeen" }]);
  assert.equal(parseFog([room, { kind: "explode" }]), null);
  assert.equal(parseFog({}), null);
});
