import { test } from "node:test";
import assert from "node:assert/strict";
import { addFog, fogAt, MAX_FOG_OPS, parseFog, parseFogOp, type FogOp } from "./fog.ts";

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
  let fog = [room, brush, outline].reduce<FogOp[]>(addFog, []);
  assert.equal(fogAt([], { x: 1, y: 1 }), "unexplored");
  assert.equal(fogAt(fog, { x: 1, y: 1 }), "seen");
  assert.equal(fogAt(fog, { x: 4, y: 3 }), "seen", "a box includes its edges");
  assert.equal(fogAt(fog, { x: 12, y: 0.9 }), "seen", "within the brush radius");
  assert.equal(fogAt(fog, { x: 12, y: 1.1 }), "unexplored");
  assert.equal(fogAt(fog, { x: 22, y: 1 }), "seen");
  assert.equal(fogAt(fog, { x: 20.5, y: 3 }), "unexplored", "outside the outline");

  fog = addFog(fog, { kind: "box", mode: "hide", x: 0, y: 0, width: 2, height: 3 });
  assert.equal(fogAt(fog, { x: 1, y: 1 }), "explored");
  assert.equal(fogAt(fog, { x: 3, y: 1 }), "seen");
  fog = addFog(fog, { kind: "dimSeen" });
  assert.equal(fogAt(fog, { x: 3, y: 1 }), "explored");
  assert.equal(fogAt(fog, { x: 30, y: 30 }), "unexplored");

  // Reveal all and cover all make earlier ops irrelevant, so the list starts afresh.
  assert.deepEqual(addFog(fog, { kind: "revealAll" }), [{ kind: "revealAll" }]);
  assert.equal(fogAt(addFog(fog, { kind: "coverAll" }), { x: 3, y: 1 }), "unexplored");
  // A full list takes no more strokes.
  const full = Array.from({ length: MAX_FOG_OPS }, () => room);
  assert.equal(addFog(full, brush).length, MAX_FOG_OPS);
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
