// Test-only concept (D-041): nothing in the app uses this until the generator's design phase.
// Lighting, first concept: each light's visibility polygon, cut by walls, closed doors and solid objects, filled out
// to its bright and dim radius. This is light from fixed sources on the map, not line of sight from a creature
// (cut by D-037). Pure: the light map is a plain array, one value per pixel.
import type { Point } from "./homography.ts";
import type { GenMap, Light, Segment } from "./mapgen.ts";

/** What blocks light on a generated map: walls, closed doors, and solid objects as 12-sided outlines. */
export function blockers(m: Pick<GenMap, "walls" | "doors" | "things">): Segment[] {
  return [...m.walls, ...m.doors.filter((d) => !d.open), ...m.things.filter((t) => t.blocksLight).flatMap((t) => ring(t.at, t.r))];
}

function ring(at: Point, r: number, n = 12): Segment[] {
  const p = (i: number) => ({ x: at.x + Math.cos((i / n) * Math.PI * 2) * r, y: at.y + Math.sin((i / n) * Math.PI * 2) * r });
  return Array.from({ length: n }, (_, i) => ({ a: p(i), b: p(i + 1) }));
}

/** Where a ray from `o` along (dx, dy) first meets a segment, as a distance; `max` if it meets none sooner. */
function cast(o: Point, dx: number, dy: number, segs: readonly Segment[], max: number): number {
  let best = max;
  for (const s of segs) {
    const ex = s.b.x - s.a.x;
    const ey = s.b.y - s.a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const ax = s.a.x - o.x;
    const ay = s.a.y - o.y;
    const t = (ax * ey - ay * ex) / den;
    const u = (ax * dy - ay * dx) / den;
    if (t > 1e-9 && t < best && u >= 0 && u <= 1) best = t;
  }
  return best;
}

/** The area a light at `o` reaches within `radius`, as a polygon in angle order. */
function visibility(o: Point, segs: readonly Segment[], radius: number): Point[] {
  const near = segs.filter((s) => Math.min(Math.hypot(s.a.x - o.x, s.a.y - o.y), Math.hypot(s.b.x - o.x, s.b.y - o.y)) < radius * 2 + 1);
  const angles: number[] = [];
  for (let i = 0; i < 180; i++) angles.push((i / 180) * Math.PI * 2 - Math.PI);
  // Rays just either side of every corner, so the shadow edges are exact.
  for (const s of near)
    for (const p of [s.a, s.b]) {
      const a = Math.atan2(p.y - o.y, p.x - o.x);
      angles.push(a - 1e-5, a + 1e-5);
    }
  angles.sort((a, b) => a - b);
  return angles.map((a) => {
    const [dx, dy] = [Math.cos(a), Math.sin(a)];
    const d = cast(o, dx, dy, near, radius);
    return { x: o.x + dx * d, y: o.y + dy * d };
  });
}

/** Light level per pixel: 1 bright, 0.5 dim, 0 dark (the brightest light wins). */
export function lightMap(
  size: { width: number; height: number },
  ppi: number,
  feetPerSquare: number,
  lights: readonly Light[],
  segs: readonly Segment[],
): Float32Array {
  const level = new Float32Array(size.width * size.height);
  for (const l of lights) {
    const bright = l.brightFt / feetPerSquare;
    const reach = (l.brightFt + l.dimFt) / feetPerSquare;
    const poly = visibility(l.at, segs, reach).map((p) => ({ x: p.x * ppi, y: p.y * ppi }));
    const o = { x: l.at.x * ppi, y: l.at.y * ppi };
    const y0 = Math.max(0, Math.floor(o.y - reach * ppi));
    const y1 = Math.min(size.height - 1, Math.ceil(o.y + reach * ppi));
    for (let y = y0; y <= y1; y++) {
      // Scanline fill: where this row crosses the polygon's edges.
      const cy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i] as Point;
        const b = poly[j] as Point;
        if (a.y > cy !== b.y > cy) xs.push(a.x + ((cy - a.y) * (b.x - a.x)) / (b.y - a.y));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (
          let x = Math.max(0, Math.ceil((xs[k] as number) - 0.5));
          x <= Math.min(size.width - 1, Math.floor((xs[k + 1] as number) - 0.5));
          x++
        ) {
          const d = Math.hypot(x + 0.5 - o.x, cy - o.y) / ppi;
          const v = d <= bright ? 1 : d <= reach ? 0.5 : 0;
          const i = y * size.width + x;
          if (v > (level[i] as number)) level[i] = v;
        }
    }
  }
  return level;
}
