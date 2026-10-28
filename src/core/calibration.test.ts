import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { apply, cssMatrix3d, invert, isConvex, rectToQuad, type Point, type Quad } from "./homography.ts";
import {
  defaultCalibration,
  layerFor,
  moveCorner,
  nudgeCorner,
  parseCalibration,
  tableToScreen,
  visibleRect,
  type Calibration,
  type Surface,
} from "./calibration.ts";

const close = (a: Point, b: Point, tol = 1e-6) => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
const projector: Surface = { width: 1536, height: 864, scale: 1.25 }; // 1920 × 1080 at 125% Windows scaling

// A rectangle's corners, each pushed up to a quarter of the way in any direction: an angled projector's view.
const quad = fc
  .tuple(...Array.from({ length: 8 }, () => fc.double({ min: -0.25, max: 0.25, noNaN: true })))
  .map((d): Quad => [
    { x: 0.2 + d[0]!, y: 0.2 + d[1]! },
    { x: 0.8 + d[2]!, y: 0.2 + d[3]! },
    { x: 0.8 + d[4]!, y: 0.8 + d[5]! },
    { x: 0.2 + d[6]!, y: 0.8 + d[7]! },
  ])
  .filter(isConvex);

test("the warp puts the measured rectangle's corners exactly on the dragged corners, and inverts", () => {
  fc.assert(
    fc.property(quad, fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 40 }), (q, w, h) => {
      const m = rectToQuad(w, h, q);
      const rect = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ];
      rect.forEach((p, i) => assert.ok(close(apply(m, p), q[i]!), `corner ${i}`));
      const inside = { x: w * 0.3, y: h * 0.6 };
      assert.ok(close(apply(invert(m), apply(m, inside)), inside));
      // CSS matrix3d is column-major: the browser computes (x, y, 0, 1) times these columns, then divides by w.
      const c = cssMatrix3d(m);
      const col = (r: number) => c[r]! * inside.x + c[4 + r]! * inside.y + c[12 + r]!;
      assert.ok(close({ x: col(0) / col(3), y: col(1) / col(3) }, apply(m, inside)));
    }),
  );
});

test("a straight-on calibration is an even scale: every inch is the same size", () => {
  const cal: Calibration = {
    widthIn: 10,
    heightIn: 5,
    corners: [
      { x: 0.1, y: 0.2 },
      { x: 0.6, y: 0.2 },
      { x: 0.6, y: 0.45 },
      { x: 0.1, y: 0.45 },
    ],
  };
  const m = tableToScreen(cal, { width: 1000, height: 1000, scale: 1 });
  // 500 px across 10 inches and 250 px down 5 inches: 50 px per inch both ways.
  assert.ok(close(apply(m, { x: 3, y: 2 }), { x: 100 + 150, y: 200 + 100 }));
});

test("corners stay on screen and can't be dragged into a fold", () => {
  const cal = defaultCalibration(projector);
  assert.deepEqual(moveCorner(cal, 0, { x: -0.5, y: -2 }).corners[0], { x: 0, y: 0 });
  // Dragging the top-left corner past the bottom-right one would turn the square inside out.
  assert.equal(moveCorner(cal, 0, { x: 0.99, y: 0.99 }), cal);
  assert.equal(moveCorner(cal, 4, { x: 0.5, y: 0.5 }), cal);
  // One arrow-key press moves a corner one physical pixel: 1920 across at 125% scaling.
  const nudged = nudgeCorner(cal, 1, 1, 0, projector);
  assert.ok(Math.abs(nudged.corners[1].x - cal.corners[1].x - 1 / 1920) < 1e-12);
});

test("the default is a square at 96 pixels per inch that fits the screen, and reads back unchanged", () => {
  for (const s of [projector, { width: 960, height: 600, scale: 1 }, { width: 300, height: 200, scale: 2 }]) {
    const cal = defaultCalibration(s);
    assert.equal(cal.widthIn, cal.heightIn);
    assert.ok(Math.abs((cal.corners[1].x - cal.corners[0].x) * s.width - cal.widthIn * 96) < 1e-9);
    assert.deepEqual(parseCalibration(JSON.parse(JSON.stringify(cal))), cal);
  }
  assert.equal(defaultCalibration(projector).widthIn, 7);
});

test("calibrations from a save are checked, not trusted", () => {
  const good = defaultCalibration(projector);
  assert.equal(parseCalibration({ ...good, widthIn: 0 }), null);
  assert.equal(parseCalibration({ ...good, widthIn: 2.5 }), null);
  assert.equal(parseCalibration({ ...good, corners: good.corners.slice(0, 3) }), null);
  assert.equal(parseCalibration({ ...good, corners: [good.corners[0], { x: 1.5, y: 0 }, good.corners[2], good.corners[3]] }), null);
  assert.equal(parseCalibration({ ...good, corners: [good.corners[0], good.corners[2], good.corners[1], good.corners[3]] }), null);
  assert.equal(parseCalibration("square"), null);
});

test("the table layer covers the whole screen and stays within canvas limits", () => {
  fc.assert(
    fc.property(quad, (corners) => {
      const cal: Calibration = {
        widthIn: 10,
        heightIn: 10,
        corners: corners.map((p) => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) })) as Quad,
      };
      fc.pre(isConvex(cal.corners));
      const layer = layerFor(cal, projector);
      assert.ok(layer.box.width * layer.pxPerInch <= 4096 + 1e-6 && layer.box.height * layer.pxPerInch <= 4096 + 1e-6);
      // The layer's pixel for the rectangle's top-left corner lands on the dragged corner.
      const px = { x: (0 - layer.box.x) * layer.pxPerInch, y: (0 - layer.box.y) * layer.pxPerInch };
      assert.ok(close(apply(layer.transform, px), { x: cal.corners[0].x * projector.width, y: cal.corners[0].y * projector.height }, 1e-6));
    }),
  );
  // A mild angle: every screen corner's table point is inside the layer.
  const cal: Calibration = {
    widthIn: 10,
    heightIn: 10,
    corners: [
      { x: 0.3, y: 0.2 },
      { x: 0.7, y: 0.22 },
      { x: 0.75, y: 0.8 },
      { x: 0.25, y: 0.78 },
    ],
  };
  const { box } = layerFor(cal, projector);
  const inv = invert(tableToScreen(cal, projector));
  for (const s of [
    { x: 0, y: 0 },
    { x: projector.width, y: 0 },
    { x: projector.width, y: projector.height },
    { x: 0, y: projector.height },
  ]) {
    const t = apply(inv, s);
    assert.ok(t.x >= box.x && t.x <= box.x + box.width && t.y >= box.y && t.y <= box.y + box.height);
  }
  // The turn strip's area: straight on, the whole screen in inches, wherever the measured square sits.
  const straight = visibleRect(defaultCalibration(projector), projector);
  assert.ok(close({ x: straight.width, y: straight.height }, { x: projector.width / 96, y: projector.height / 96 }, 1e-9));
  const angled = visibleRect(cal, projector);
  assert.ok(angled.x >= box.x && angled.x + angled.width <= box.x + box.width && angled.width > 10 && angled.height > 10);
});
