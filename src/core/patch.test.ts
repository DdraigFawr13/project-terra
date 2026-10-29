import { test } from "node:test";
import assert from "node:assert/strict";
import { cloneMasked, fillMasked, snapOffset, strokeMask } from "./patch.ts";
import type { Pixels } from "./map.ts";

/** A 20 × 20 floor: left half grey 100, right half grey 200, with a black "number" in the middle of each half. */
function floor(): Pixels {
  const width = 20;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y++)
    for (let x = 0; x < width; x++) {
      const v = (x >= 4 && x < 6 && y >= 9 && y < 11) || (x >= 14 && x < 16 && y >= 9 && y < 11) ? 0 : x < 10 ? 100 : 200;
      data.set([v, v, v, 255], (y * width + x) * 4);
    }
  return { width, height: width, data };
}
const grey = (px: Pixels, x: number, y: number) => px.data[(y * px.width + x) * 4]!;

test("a stroke covers the pixels within its radius, with no gaps on a fast swipe", () => {
  const { mask, rect } = strokeMask(
    20,
    20,
    [
      { x: 2, y: 10 },
      { x: 18, y: 10 },
    ],
    1.5,
  );
  assert.deepEqual(rect, { x: 1, y: 9, width: 18, height: 2 });
  for (let x = 2; x < 18; x++) assert.equal(mask.data[10 * 20 + x], 1);
  assert.equal(mask.data[5 * 20 + 10], 0);
  // Off the picture: nothing.
  assert.deepEqual(strokeMask(20, 20, [{ x: -10, y: -10 }], 2).rect, { x: 0, y: 0, width: 0, height: 0 });
});

test("fill paints a number out from the floor around it; clone copies floor from an offset", () => {
  const px = floor();
  fillMasked(px, strokeMask(20, 20, [{ x: 5, y: 10 }], 2).mask);
  for (const [x, y] of [
    [4, 9],
    [5, 10],
  ] as const)
    assert.equal(grey(px, x, y), 100);
  // Pixels outside the mask are untouched.
  assert.equal(grey(px, 15, 10), 0);
  assert.equal(grey(px, 12, 3), 200);

  const { mask, rect } = strokeMask(20, 20, [{ x: 15, y: 10 }], 1.5);
  cloneMasked(px, mask, rect, { x: 0, y: -5 });
  for (const [x, y] of [
    [14, 9],
    [15, 10],
  ] as const)
    assert.equal(grey(px, x, y), 200);
  // A mask over everything has no edge to fill from and changes nothing.
  const all = floor();
  fillMasked(all, { width: 20, height: 20, data: new Uint8Array(400).fill(1) });
  assert.deepEqual(all, floor());
});

test("clone offsets snap to whole squares, so grid lines stay lined up", () => {
  assert.deepEqual(snapOffset({ x: -65, y: 10 }, 50), { x: -50, y: 0 });
  assert.deepEqual(snapOffset({ x: 80, y: -130 }, 50), { x: 100, y: -150 });
  // Picked within half a square: one square away along the larger direction.
  assert.deepEqual(snapOffset({ x: -10, y: 20 }, 50), { x: 0, y: 50 });
});
