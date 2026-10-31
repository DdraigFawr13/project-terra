import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addFreehand,
  addOpening,
  addPillar,
  addWall,
  annotationFile,
  countOf,
  emptyAnnotation,
  eraseAt,
  parseAnnotation,
  placePoint,
  smooth,
} from "./annotation.ts";

const B = { x: 0, y: 0, width: 20, height: 10 };
const square = [
  { x: 1, y: 1 },
  { x: 5, y: 1 },
  { x: 5, y: 4 },
  { x: 1, y: 4 },
  { x: 1, y: 1 },
];

test("a tap snaps to the quarter inch, or joins a corner within reach", () => {
  const a = addWall(emptyAnnotation(), square);
  assert.deepEqual(placePoint(a, { x: 7.13, y: 2.87 }, 0), { x: 7.25, y: 2.75 });
  // Within ⅛ inch of a corner it joins it, even with no wider reach.
  assert.deepEqual(placePoint(a, { x: 5.1, y: 1.05 }, 0), { x: 5, y: 1 });
  // A wider reach (the pen on a small screen) joins from further away; the line being drawn counts too.
  assert.deepEqual(placePoint(a, { x: 5.3, y: 1.3 }, 0.5), { x: 5, y: 1 });
  assert.deepEqual(placePoint(emptyAnnotation(), { x: 9.3, y: 9.2 }, 0.5, [{ x: 9, y: 9 }]), { x: 9, y: 9 });
});

test("a run that ends on its first corner becomes a loop; repeated taps add nothing", () => {
  const a = addWall(emptyAnnotation(), square);
  assert.deepEqual(a.walls, [{ points: square.slice(0, 4), closed: true }]);
  assert.deepEqual(countOf(a), { walls: 4, pillars: 0, openings: 0, rooms: 0, areas: 0 });
  const b = addWall(emptyAnnotation(), [
    { x: 2, y: 2 },
    { x: 2, y: 2 },
    { x: 3, y: 2 },
  ]);
  assert.equal(b.walls[0]!.points.length, 2);
  assert.equal(addWall(emptyAnnotation(), [{ x: 1, y: 1 }]).walls.length, 0);
});

test("freehand is smoothed into straight pieces, joins nearby corners, and closes when its ends meet", () => {
  // A wobbly line along y = 2 with one real bend.
  const drawn = [];
  for (let i = 0; i <= 40; i++) drawn.push({ x: 1 + i * 0.1, y: 2 + (i % 2) * 0.04 });
  for (let i = 1; i <= 20; i++) drawn.push({ x: 5, y: 2 + i * 0.1 });
  const pieces = smooth(drawn);
  assert.equal(pieces.length, 3);
  const a = addWall(emptyAnnotation(), [
    { x: 5.05, y: 4.05 },
    { x: 8, y: 4 },
  ]);
  const b = addFreehand(a, drawn);
  // Its last end (5, 4) was within ⅛ inch of the wall's corner (5.05, 4.05) and joined it.
  assert.deepEqual(b.walls[1]!.points.at(-1), { x: 5.05, y: 4.05 });
  // A rough circle whose ends meet is a loop.
  const loop = [];
  for (let i = 0; i <= 24; i++) loop.push({ x: 10 + Math.cos((i / 24) * 2 * Math.PI) * 2, y: 5 + Math.sin((i / 24) * 2 * Math.PI) * 2 });
  assert.equal(addFreehand(emptyAnnotation(), loop).walls[0]!.closed, true);
});

test("erasing removes the nearest piece: a run splits, a loop opens, an opening or pillar goes", () => {
  let a = addWall(emptyAnnotation(), square);
  a = eraseAt(a, { x: 3, y: 1.1 }, 0.3);
  assert.deepEqual(a.walls, [{ points: [square[1], square[2], square[3], square[0]], closed: false }]);
  a = eraseAt(a, { x: 5.1, y: 2.5 }, 0.3);
  assert.deepEqual(
    a.walls.map((w) => w.points.length),
    [3],
  );
  a = addOpening(a, "door", { x: 10, y: 1 }, { x: 11, y: 1 });
  a = addPillar(a, { x: 15, y: 5 }, 0.5);
  assert.equal(eraseAt(a, { x: 10.5, y: 1.2 }, 0.3).openings.length, 0);
  assert.equal(eraseAt(a, { x: 15.5, y: 5 }, 0.3).pillars.length, 0);
  // Nothing close: unchanged.
  assert.equal(eraseAt(a, { x: 18, y: 9 }, 0.3), a);
});

test("a saved annotation loads back equal; damaged or out-of-bounds files are refused whole, and -0 never survives", () => {
  let a = addWall(emptyAnnotation(), square);
  a = addOpening(a, "secret", { x: -0, y: 2 }, { x: 0, y: 3 });
  a = addPillar(a, { x: 15, y: 5 }, 0.5);
  const file = JSON.parse(JSON.stringify(annotationFile(a)));
  assert.deepEqual(parseAnnotation(file, B), a);
  assert.ok(Object.is(parseAnnotation({ ...file, pillars: [{ at: { x: -0, y: 1 }, r: 1 }] }, B)!.pillars[0]!.at.x, 0));
  assert.equal(parseAnnotation({ ...file, version: 4 }, B), null);
  assert.equal(parseAnnotation({ ...file, openings: [{ ...file.openings[0], kind: "portcullis" }] }, B), null);
  assert.equal(
    parseAnnotation(
      {
        ...file,
        walls: [
          {
            points: [
              { x: 1, y: 1 },
              { x: 40, y: 1 },
            ],
            closed: false,
          },
        ],
      },
      B,
    ),
    null,
  );
  assert.equal(parseAnnotation({ ...file, walls: [{ points: [{ x: 1, y: Number.NaN }], closed: false }] }, B), null);
  assert.equal(parseAnnotation(null, B), null);
});
