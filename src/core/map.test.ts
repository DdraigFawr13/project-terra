import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, invert, rectToQuad, type Quad } from "./homography.ts";
import { fillTable, mapToTable, parseMarking, tableToMap, placedExtent, planRectify, rectify, type Pixels } from "./map.ts";

// A slanted "phone photo" of a checkerboard with 1-inch squares: square (col, row) is white when col + row is even.
const slant: Quad = [
  { x: 40, y: 30 },
  { x: 330, y: 50 },
  { x: 360, y: 290 },
  { x: 20, y: 270 },
];
const BOARD = 12; // the photo shows a 12 × 12 inch board
function photo(): Pixels {
  const toInches = invert(rectToQuad(BOARD, BOARD, slant));
  const width = 380;
  const height = 320;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const t = apply(toInches, { x: x + 0.5, y: y + 0.5 });
      const o = (y * width + x) * 4;
      const on = t.x >= 0 && t.y >= 0 && t.x < BOARD && t.y < BOARD;
      const v = on && (Math.floor(t.x) + Math.floor(t.y)) % 2 === 0 ? 255 : 0;
      data.set([v, v, v, on ? 255 : 0], o);
    }
  return { width, height, data };
}

test("straightening a slanted photo gives square, 1-inch squares in the right places", () => {
  const src = photo();
  // The DM marks a 4 × 3 square block, from board square (2, 3) to (6, 6), on the photo.
  const onPhoto = rectToQuad(BOARD, BOARD, slant);
  const corners = [
    { x: 2, y: 3 },
    { x: 6, y: 3 },
    { x: 6, y: 6 },
    { x: 2, y: 6 },
  ].map((p) => apply(onPhoto, p)) as Quad;
  const marking = parseMarking({ corners, widthIn: 4, heightIn: 3 }, src);
  assert.ok(marking);
  const plan = planRectify(marking, src);
  // The whole photo is kept, so the whole 12-inch board fits. The marked block's corner is the origin: the board
  // starts 2 inches left of it and 3 above.
  const { x, y, width, height } = plan.bounds;
  assert.ok(x <= -2 && y <= -3 && x + width >= 10 && y + height >= 9, JSON.stringify(plan.bounds));
  const out = rectify(src, marking, plan);
  const at = (xIn: number, yIn: number) =>
    out.data[(Math.floor((yIn - plan.bounds.y) * plan.ppi) * out.width + Math.floor((xIn - plan.bounds.x) * plan.ppi)) * 4]!;
  // Check the middle of every board square: white or black by its board position.
  for (let row = 0; row < BOARD; row++)
    for (let col = 0; col < BOARD; col++) {
      const v = at(col - 2 + 0.5, row - 3 + 0.5);
      const white = (col + row) % 2 === 0;
      assert.ok(white ? v > 200 : v < 55, `square ${col},${row} reads ${v}`);
    }
});

test("markings from the DM window are checked against the image", () => {
  const img = { width: 100, height: 80 };
  const ok = {
    corners: [
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 70 },
      { x: 10, y: 70 },
    ],
    widthIn: 4,
    heightIn: 3,
  };
  assert.ok(parseMarking(ok, img));
  assert.equal(parseMarking({ ...ok, widthIn: 0 }, img), null);
  assert.equal(parseMarking({ ...ok, heightIn: 2.5 }, img), null);
  assert.equal(parseMarking({ ...ok, corners: [ok.corners[0], ok.corners[2], ok.corners[1], ok.corners[3]] }, img), null);
  assert.equal(parseMarking({ ...ok, corners: [{ x: -5, y: 10 }, ...ok.corners.slice(1)] }, img), null);
});

test("a huge, sharp photo is kept within canvas limits", () => {
  const img = { width: 9000, height: 9000 };
  const marking = parseMarking(
    {
      corners: [
        { x: 0, y: 0 },
        { x: 9000, y: 0 },
        { x: 9000, y: 9000 },
        { x: 0, y: 9000 },
      ],
      widthIn: 30,
      heightIn: 30,
    },
    img,
  )!;
  const plan = planRectify(marking, img);
  assert.equal(plan.ppi, 150);
  assert.ok(plan.width <= 8192 && plan.height <= 8192);
});

test("a placed map turns clockwise about its marked corner", () => {
  const p = { bounds: { x: -2, y: -1, width: 10, height: 6 }, x: 5, y: 3, turns: 1 as const };
  // One quarter turn clockwise: a point 1 inch right of the corner moves to 1 inch below it.
  assert.deepEqual(mapToTable(p, { x: 1, y: 0 }), { x: 5, y: 4 });
  assert.deepEqual(placedExtent(p), { x: 0, y: 1, width: 6, height: 10 });
  assert.deepEqual(placedExtent({ ...p, turns: 0 }), { x: 3, y: 2, width: 10, height: 6 });
  // Fog is painted in map inches, so a point on the table goes back onto the map exactly, at every turn.
  for (const turns of [0, 1, 2, 3] as const) {
    const q = { ...p, turns };
    assert.deepEqual(tableToMap(q, mapToTable(q, { x: 2.5, y: -1 })), { x: 2.5, y: -1 });
  }
});

test("the far, squashed edge of a steep photo is left out instead of stretched", () => {
  // A photo taken so steeply that the far edge of a 40-inch board shrinks to a sliver.
  const steep: Quad = [
    { x: 380, y: 10 },
    { x: 420, y: 10 },
    { x: 790, y: 590 },
    { x: 10, y: 590 },
  ];
  const onPhoto = rectToQuad(40, 40, steep);
  const corners = [
    { x: 18, y: 34 },
    { x: 22, y: 34 },
    { x: 22, y: 38 },
    { x: 18, y: 38 },
  ].map((p) => apply(onPhoto, p)) as Quad;
  const image = { width: 800, height: 600 };
  const plan = planRectify(parseMarking({ corners, widthIn: 4, heightIn: 4 }, image)!, image);
  // The near part of the board is kept; the far end (more than 4 times squashed) is not.
  assert.ok(plan.bounds.y + plan.bounds.height >= 5, JSON.stringify(plan.bounds));
  assert.ok(plan.bounds.y > -34, JSON.stringify(plan.bounds));
});

test("a picture with no squares fills the table as far as it can, turned if that is bigger, never stretched (D-042)", () => {
  const board = { x: 0, y: 0, width: 42, height: 24 };
  // A tall region map, 2648 x 3625 pixels: turned it lies 30 x 22 inches, centred on the board.
  const tall = fillTable({ width: 2648, height: 3625 }, board)!;
  assert.deepEqual(tall, { widthIn: 22, heightIn: 30, x: 36, y: 1, turns: 1 });
  const at = { bounds: { x: 0, y: 0, width: tall.widthIn, height: tall.heightIn }, x: tall.x, y: tall.y, turns: tall.turns };
  assert.deepEqual(placedExtent(at), { x: 6, y: 1, width: 30, height: 22 });
  assert.ok(Math.abs(tall.widthIn / tall.heightIn - 2648 / 3625) / (2648 / 3625) <= 0.015);
  // A wide picture stays as it is, within an area that starts away from the corner.
  assert.deepEqual(fillTable({ width: 1600, height: 900 }, { x: 2, y: 1.5, width: 40, height: 21 }), {
    widthIn: 37,
    heightIn: 21,
    x: 4,
    y: 2,
    turns: 0,
  });
  assert.equal(fillTable({ width: 100, height: 100 }, { x: 0, y: 0, width: 0.5, height: 0.5 }), null);
  // The whole picture marked as the rectangle straightens to exactly that size, with no strip past its edge.
  const whole = parseMarking(
    {
      corners: [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 400 },
        { x: 0, y: 400 },
      ],
      widthIn: 6,
      heightIn: 6,
    },
    { width: 400, height: 400 },
  )!;
  assert.deepEqual(planRectify(whole, { width: 400, height: 400 }).bounds, { x: 0, y: 0, width: 6, height: 6 });
  // Never -0, which saves as 0 (LESSONS).
  assert.ok(!Object.is(fillTable({ width: 100, height: 100 }, { x: -0.4, y: -0.4, width: 10, height: 10 })!.x, -0));
});
