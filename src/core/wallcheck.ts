// The wall check (D-044 item 8): light from a tapped point, stopped by walls, pillars and closed doors and secret
// doors; windows and openings let it through (D-040). It shows the DM gaps in the walls before play, and is the
// shape Look from here will use (D-040). Pure. The generator concept's light.ts casts rays the same way, but stays
// test-only (D-041).
import type { Annotation } from "./annotation.ts";
import type { Point } from "./homography.ts";
import type { Bounds } from "./map.ts";

/** Light reaches this far past the picture's edge, as walls may (annotation.ts). */
const EDGE_IN = 1;
/** Corners a pillar is drawn with when it blocks light. */
const PILLAR_SIDES = 16;
/** Rays pass this far (radians) either side of each corner, so light slips past it and reaches what lies behind. */
const NUDGE = 1e-5;

type Segment = [Point, Point];

/** Every piece that blocks light, and the edges of the area light may fill. */
function blockers(a: Annotation, b: Bounds): Segment[] {
  const out: Segment[] = [];
  for (const w of a.walls) {
    const n = w.closed ? w.points.length : w.points.length - 1;
    for (let k = 0; k < n; k++) out.push([w.points[k]!, w.points[(k + 1) % w.points.length]!]);
  }
  for (const c of a.pillars)
    for (let k = 0; k < PILLAR_SIDES; k++) {
      const at = (n: number): Point => ({
        x: c.at.x + c.r * Math.cos((n / PILLAR_SIDES) * Math.PI * 2),
        y: c.at.y + c.r * Math.sin((n / PILLAR_SIDES) * Math.PI * 2),
      });
      out.push([at(k), at(k + 1)]);
    }
  for (const o of a.openings) if ((o.kind === "door" || o.kind === "secret") && !o.open) out.push([o.a, o.b]);
  const [x0, y0, x1, y1] = [b.x - EDGE_IN, b.y - EDGE_IN, b.x + b.width + EDGE_IN, b.y + b.height + EDGE_IN];
  const box = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  box.forEach((p, i) => out.push([p, box[(i + 1) % 4]!]));
  return out;
}

/** How far along the ray from p in direction (dx, dy) it first meets a segment. */
function nearest(p: Point, dx: number, dy: number, segs: readonly Segment[]): number {
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

/**
 * The lit area around p, as an outline: a ray toward every corner of every blocker, and just either side of it,
 * stopped where it first meets one. Ordered by angle, so the outline goes once round p.
 */
export function lightFrom(a: Annotation, b: Bounds, p: Point): Point[] {
  const segs = blockers(a, b);
  const angles = new Set<number>();
  for (const s of segs)
    for (const c of s) {
      const t = Math.atan2(c.y - p.y, c.x - p.x);
      angles
        .add(t - NUDGE)
        .add(t)
        .add(t + NUDGE);
    }
  const out: Point[] = [];
  for (const t of [...angles].sort((m, n) => m - n)) {
    const [dx, dy] = [Math.cos(t), Math.sin(t)];
    const d = nearest(p, dx, dy, segs);
    if (Number.isFinite(d)) out.push({ x: p.x + dx * d, y: p.y + dy * d });
  }
  return out;
}
