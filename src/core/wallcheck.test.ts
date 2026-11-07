import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAnnotation, type Annotation } from "./annotation.ts";
import { insidePolygon } from "./fog.ts";
import type { Point } from "./homography.ts";
import type { Bounds } from "./map.ts";
import { rng } from "./rng.ts";
import { denseRooms } from "./sight-fixtures.ts";
import { blockIndex, blockersFor, lightFrom, sightFrom } from "./wallcheck.ts";

// ---- The ray cast before the grid index, kept here as the reference the fast one must agree with ----

type Segment = [Point, Point];
/** The pieces that stop light from p: a pillar p stands inside is left out (the look-out rule, D-047 item 9). */
function referenceBlockers(a: Annotation, b: Bounds, p: Point): Segment[] {
  const out: Segment[] = [];
  for (const w of a.walls) {
    const n = w.closed ? w.points.length : w.points.length - 1;
    for (let k = 0; k < n; k++) out.push([w.points[k]!, w.points[(k + 1) % w.points.length]!]);
  }
  for (const c of a.pillars) {
    const at = (n: number): Point => ({
      x: c.at.x + c.r * Math.cos((n / 16) * Math.PI * 2),
      y: c.at.y + c.r * Math.sin((n / 16) * Math.PI * 2),
    });
    const corners = Array.from({ length: 16 }, (_, k) => at(k));
    if (insidePolygon(p, corners)) continue;
    for (let k = 0; k < 16; k++) out.push([corners[k]!, corners[(k + 1) % 16]!]);
  }
  for (const o of a.openings) if ((o.kind === "door" || o.kind === "secret") && !o.open) out.push([o.a, o.b]);
  const [x0, y0, x1, y1] = [b.x - 1, b.y - 1, b.x + b.width + 1, b.y + b.height + 1];
  const box = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  box.forEach((p, i) => out.push([p, box[(i + 1) % 4]!]));
  return out;
}
function referenceNearest(p: Point, dx: number, dy: number, segs: readonly Segment[]): number {
  let best = Infinity;
  for (const [a, b] of segs) {
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const den = dx * sy - dy * sx;
    if (Math.abs(den) < 1e-12) continue;
    const ax = a.x - p.x;
    const ay = a.y - p.y;
    const t = (ax * sy - ay * sx) / den;
    const u = (ax * dy - ay * dx) / den;
    if (t > 1e-9 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}
function referenceLight(a: Annotation, b: Bounds, p: Point): Point[] {
  const segs = referenceBlockers(a, b, p);
  const angles = new Set<number>();
  for (const s of segs)
    for (const c of s) {
      const t = Math.atan2(c.y - p.y, c.x - p.x);
      angles
        .add(t - 1e-5)
        .add(t)
        .add(t + 1e-5);
    }
  const out: Point[] = [];
  for (const t of [...angles].sort((m, n) => m - n)) {
    const [dx, dy] = [Math.cos(t), Math.sin(t)];
    const d = referenceNearest(p, dx, dy, segs);
    if (Number.isFinite(d)) out.push({ x: p.x + dx * d, y: p.y + dy * d });
  }
  return out;
}

/** How far p is from the closed outline. */
function offOutline(p: Point, outline: readonly Point[]): number {
  let best = Infinity;
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    const [sx, sy] = [b.x - a.x, b.y - a.y];
    const len = sx * sx + sy * sy;
    const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * sx + (p.y - a.y) * sy) / len)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + sx * t), p.y - (a.y + sy * t)));
  });
  return best;
}

test("fast outline agrees with the reference", () => {
  const r = rng(47);
  const bounds = { x: 0, y: 0, width: 20, height: 12 };
  for (let n = 0; n < 50; n++) {
    const a = emptyAnnotation();
    // Random walls; every other one on whole inches, so some lie along the grid's cell borders.
    for (let k = 0; k < 12; k++) {
      const whole = k % 2 === 0;
      const v = (lo: number, hi: number) => (whole ? r.int(lo, hi) : Math.round(r.range(lo, hi) * 100) / 100);
      const from = { x: v(0, 20), y: v(0, 12) };
      const along = r.chance(0.5);
      const to = whole ? (along ? { x: v(0, 20), y: from.y } : { x: from.x, y: v(0, 12) }) : { x: v(0, 20), y: v(0, 12) };
      if (from.x !== to.x || from.y !== to.y) a.walls.push({ points: [from, to], closed: false });
    }
    a.pillars.push({ at: { x: r.int(2, 18), y: r.int(2, 10) }, r: 0.5 });
    a.openings.push({ kind: "door", a: { x: 5, y: r.int(1, 11) }, b: { x: 6, y: r.int(1, 11) }, open: r.chance(0.5) });
    a.openings.push({ kind: "window", a: { x: 9, y: 3 }, b: { x: 9, y: 5 }, open: false });
    // Most points anywhere on the map; every fifth on whole inches (a cell corner, so rays start on cell borders and
    // some run along them), and one off the map, where the grid isn't used.
    const p =
      n === 49
        ? { x: -0.6, y: 5.5 }
        : n % 5 === 0
          ? { x: r.int(1, 19), y: r.int(1, 11) }
          : { x: r.range(0.3, 19.7), y: r.range(0.3, 11.7) };
    const fast = lightFrom(a, bounds, p);
    for (const q of referenceLight(a, bounds, p))
      assert.ok(offOutline(q, fast) < 1e-6, `point ${n}: (${q.x}, ${q.y}) is off the fast outline`);
  }
});

test("fast outline has under 1,000 points and fewer than the reference on denseRooms(20, 12, 60)", () => {
  const { annotation, bounds, points } = denseRooms(20, 12, 60);
  assert.equal(blockersFor(annotation, {}).length, 2080);
  for (const p of points) {
    const fast = lightFrom(annotation, bounds, p);
    const ref = referenceLight(annotation, bounds, p);
    assert.ok(fast.length < 1000 && fast.length < ref.length, `${fast.length} points against ${ref.length}`);
  }
});

test("a point inside a pillar or a closed loop looks out of it; from outside the shape still blocks (D-047 item 9)", () => {
  const bounds = { x: 0, y: 0, width: 10, height: 10 };
  const a = emptyAnnotation();
  a.pillars.push({ at: { x: 7, y: 7 }, r: 0.5 });
  // A VTT canopy: a run that ends where it began, not marked closed.
  const sq = (x0: number, y0: number, x1: number, y1: number) => [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
    { x: x0, y: y0 },
  ];
  a.walls.push({ points: sq(2, 2, 4, 4), closed: false });
  const index = blockIndex(a, {}, bounds);
  const far = (seen: readonly Point[]) => seen.some((q) => q.x < 0.5) && seen.some((q) => q.x > 9.5) && seen.some((q) => q.y > 9.5);
  // In the trunk and in the bush: the whole map, as if the shape weren't there.
  assert.ok(far(sightFrom(index, { x: 7, y: 7 }, null)));
  assert.ok(far(sightFrom(index, { x: 3, y: 3 }, null)));
  assert.ok(far(lightFrom(a, bounds, { x: 3, y: 3 })));
  // From outside: the bush hides its inside and what lies behind it, and the trunk its far side.
  const outside = sightFrom(index, { x: 3, y: 8 }, null);
  assert.ok(!insidePolygon({ x: 3, y: 3 }, outside) && !insidePolygon({ x: 3, y: 0.5 }, outside));
  assert.ok(!insidePolygon({ x: 7, y: 6.6 }, sightFrom(index, { x: 7, y: 9 }, null)));
});

test("sightFrom: walls extend by a quarter inch, a range clamps with arcs, rounded, and a centre on a wall sees both sides", () => {
  const bounds = { x: 0, y: 0, width: 10, height: 10 };
  const a = emptyAnnotation();
  a.walls.push({
    points: [
      { x: 6, y: 0 },
      { x: 6, y: 10 },
    ],
    closed: false,
  });
  const index = blockIndex(a, {}, bounds);
  const seen = sightFrom(index, { x: 3, y: 5 }, null);
  // Rays stop a quarter inch past the wall, so the wall line is inside the outline, and a disc centre half an inch past it isn't.
  assert.ok(insidePolygon({ x: 6.1, y: 5 }, seen) && !insidePolygon({ x: 6.5, y: 5 }, seen));
  const hundredths = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9 && !Object.is(v, -0);
  assert.ok(seen.every((q) => hundredths(q.x) && hundredths(q.y)));
  // With a 2-inch range nothing reaches the wall: a circle of arc points every 10 degrees or closer.
  const near = sightFrom(index, { x: 3, y: 5 }, 2);
  assert.ok(near.length >= 36);
  assert.ok(near.every((q) => Math.abs(Math.hypot(q.x - 3, q.y - 5) - 2) < 0.01));
  // On the wall line: both sides.
  const on = sightFrom(index, { x: 6, y: 5 }, null);
  assert.ok(on.some((q) => q.x < 1) && on.some((q) => q.x > 9));
});
