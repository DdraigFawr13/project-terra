// The wall check (D-044 item 8) and sight (D-047, docs/specs/sight.md "Faster wall check"): light or sight from a point,
// stopped by walls, pillars and closed doors and secret doors; windows and openings let it through (D-040). Pure. The
// blocking pieces sit in a grid of 1-inch cells, so each ray tests only the cells it crosses and stops at its first hit.
// The generator concept's light.ts casts rays the old way, but stays test-only (D-041).
import { segmentDistance, type Annotation } from "./annotation.ts";
import { doorOpen, type Doors } from "./doors.ts";
import type { Point } from "./homography.ts";
import type { Bounds } from "./map.ts";

/** Light reaches this far past the picture's edge, as walls may (annotation.ts). */
const EDGE_IN = 1;
/** Corners a pillar is drawn with when it blocks light. */
const PILLAR_SIDES = 16;
/** Rays pass this far (radians) either side of each corner, so light slips past it and reaches what lies behind. */
const NUDGE = 1e-5;
/** Sight stopped by a piece goes this far past it, so drawn walls show unbroken (a disc ½ inch past stays hidden). */
const PAST_WALL_IN = 0.25;
/** Between two rays stopped by the range, the edge follows the circle with a point at least every 10°. */
const ARC_STEP = Math.PI / 18;
/** A sight outline is stored as a fog op, which holds at most this many points (fog.ts). */
const MAX_OUTLINE = 1000;
const SIMPLIFY_IN = 1 / 32;
/** A piece goes in every cell its box touches, widened by this, so pieces on cell borders sit on both sides. */
const CELL_EPS = 1e-9;

type Segment = [Point, Point];
type BlockIndex = { segs: Segment[]; x0: number; y0: number; cols: number; rows: number; start: Int32Array; items: Int32Array };
/** One ray: its angle, how far it went, and the piece it stopped at (an index into `segs`), or -1 at the range. */
type Ray = { angle: number; t: number; seg: number };

/** Every piece that blocks light and sight: walls, pillars, and doors and secret doors closed in this scene. */
export function blockersFor(a: Annotation, doors: Doors): Segment[] {
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
  for (const o of a.openings) if ((o.kind === "door" || o.kind === "secret") && !doorOpen(o, doors)) out.push([o.a, o.b]);
  return out;
}

/**
 * The blocking pieces, plus the edge of the area light may fill (an inch past the picture), in a grid of 1-inch cells.
 * Built once per look and shared by every point looked from.
 */
export function blockIndex(a: Annotation, doors: Doors, b: Bounds): BlockIndex {
  const segs = blockersFor(a, doors);
  const [x0, y0, x1, y1] = [b.x - EDGE_IN, b.y - EDGE_IN, b.x + b.width + EDGE_IN, b.y + b.height + EDGE_IN];
  const box = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  box.forEach((p, i) => segs.push([p, box[(i + 1) % 4]!]));
  const cols = Math.max(1, Math.ceil(x1 - x0));
  const rows = Math.max(1, Math.ceil(y1 - y0));
  const clamp = (v: number, n: number) => Math.min(n - 1, Math.max(0, v));
  const cells = segs.map(([p, q]) => [
    clamp(Math.floor(Math.min(p.x, q.x) - CELL_EPS - x0), cols),
    clamp(Math.floor(Math.max(p.x, q.x) + CELL_EPS - x0), cols),
    clamp(Math.floor(Math.min(p.y, q.y) - CELL_EPS - y0), rows),
    clamp(Math.floor(Math.max(p.y, q.y) + CELL_EPS - y0), rows),
  ]);
  // Each cell's pieces, packed: cell c holds items[start[c]] up to items[start[c + 1]].
  const start = new Int32Array(cols * rows + 1);
  for (const [cx0, cx1, cy0, cy1] of cells)
    for (let cy = cy0!; cy <= cy1!; cy++) for (let cx = cx0!; cx <= cx1!; cx++) start[cy * cols + cx + 1]!++;
  for (let c = 0; c < cols * rows; c++) start[c + 1]! += start[c]!;
  const items = new Int32Array(start[cols * rows]!);
  const fill = start.slice(0, cols * rows);
  cells.forEach(([cx0, cx1, cy0, cy1], i) => {
    for (let cy = cy0!; cy <= cy1!; cy++) for (let cx = cx0!; cx <= cx1!; cx++) items[fill[cy * cols + cx]!++] = i;
  });
  return { segs, x0, y0, cols, rows, start, items };
}

/** How far along the ray from p in direction (dx, dy) it meets a segment, or Infinity. */
function hit(p: Point, dx: number, dy: number, s: Segment): number {
  const a = s[0];
  const b = s[1];
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const den = dx * sy - dy * sx;
  if (Math.abs(den) < 1e-12) return Infinity;
  const ax = a.x - p.x;
  const ay = a.y - p.y;
  const t = (ax * sy - ay * sx) / den;
  const u = (ax * dy - ay * dx) / den;
  return t > 1e-9 && u >= 0 && u <= 1 ? t : Infinity;
}

/** The first piece the ray meets within `maxT`, walking only the cells it crosses (a DDA grid walk). */
function cast(ix: BlockIndex, p: Point, dx: number, dy: number, maxT: number): { t: number; seg: number } {
  // Plain loops and no closures: this runs for every ray of every look.
  let best = Infinity;
  let seg = -1;
  let cx = Math.floor(p.x - ix.x0);
  let cy = Math.floor(p.y - ix.y0);
  if (cx < 0 || cy < 0 || cx >= ix.cols || cy >= ix.rows) {
    // Outside the grid (a point off the map): every piece.
    for (let i = 0; i < ix.segs.length; i++) {
      const t = hit(p, dx, dy, ix.segs[i]!);
      if (t < best) {
        best = t;
        seg = i;
      }
    }
  } else {
    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    let tx = dx > 0 ? (ix.x0 + cx + 1 - p.x) / dx : dx < 0 ? (ix.x0 + cx - p.x) / dx : Infinity;
    let ty = dy > 0 ? (ix.y0 + cy + 1 - p.y) / dy : dy < 0 ? (ix.y0 + cy - p.y) / dy : Infinity;
    const ddx = dx ? Math.abs(1 / dx) : Infinity;
    const ddy = dy ? Math.abs(1 / dy) : Infinity;
    for (;;) {
      const c = cy * ix.cols + cx;
      for (let k = ix.start[c]!, to = ix.start[c + 1]!; k < to; k++) {
        const i = ix.items[k]!;
        const t = hit(p, dx, dy, ix.segs[i]!);
        if (t < best) {
          best = t;
          seg = i;
        }
      }
      const exit = tx < ty ? tx : ty;
      // Every point of the ray up to `exit` lies in a cell already tested.
      if (best <= exit + CELL_EPS || exit >= maxT) break;
      if (tx < ty) {
        cx += stepX;
        tx += ddx;
      } else {
        cy += stepY;
        ty += ddy;
      }
      if (cx < 0 || cy < 0 || cx >= ix.cols || cy >= ix.rows) break;
    }
  }
  return best <= maxT ? { t: best, seg } : { t: maxT, seg: -1 };
}

/** A ray toward every corner of every piece, and just either side of it, ordered by angle. */
function rays(ix: BlockIndex, p: Point, maxT: number): Ray[] {
  const angles = new Set<number>();
  for (const s of ix.segs)
    for (const c of s) {
      const t = Math.atan2(c.y - p.y, c.x - p.x);
      angles
        .add(t - NUDGE)
        .add(t)
        .add(t + NUDGE);
    }
  const out: Ray[] = [];
  for (const angle of [...angles].sort((m, n) => m - n)) {
    const { t, seg } = cast(ix, p, Math.cos(angle), Math.sin(angle), maxT);
    if (Number.isFinite(t)) out.push({ angle, t, seg });
  }
  return out;
}

/** Drops a ray only when it and both its neighbours stopped at the same piece: its point lies mid-way along that piece. */
function dropMid(rs: Ray[]): Ray[] {
  const n = rs.length;
  if (n < 3) return rs;
  return rs.filter((r, i) => r.seg < 0 || rs[(i + n - 1) % n]!.seg !== r.seg || rs[(i + 1) % n]!.seg !== r.seg);
}

/**
 * The lit area around p, as an outline ordered by angle so it goes once round p: the editor's wall check, with doors
 * as the library map has them.
 */
export function lightFrom(a: Annotation, b: Bounds, p: Point): Point[] {
  return dropMid(rays(blockIndex(a, {}, b), p, Infinity)).map((r) => ({
    x: p.x + Math.cos(r.angle) * r.t,
    y: p.y + Math.sin(r.angle) * r.t,
  }));
}

/** Hundredths of an inch, as fog keeps them; `+ 0` so -0 never reaches a save (AGENTS.md). */
const r2 = (v: number): number => Math.round(v * 100) / 100 + 0;

/** Ramer–Douglas–Peucker on an open line, keeping both ends. */
function simplifyLine(ps: readonly Point[], tol: number): Point[] {
  const last = ps.length - 1;
  if (last < 2) return ps.slice();
  const keep = new Uint8Array(ps.length);
  keep[0] = keep[last] = 1;
  const stack: [number, number][] = [[0, last]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let [far, d] = [-1, tol];
    for (let k = i + 1; k < j; k++) {
      const e = segmentDistance(ps[k]!, ps[i]!, ps[j]!);
      if (e > d) [far, d] = [k, e];
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([i, far], [far, j]);
    }
  }
  return ps.filter((_, k) => keep[k]);
}

/** Ramer–Douglas–Peucker on a closed outline: split at its first point and the point farthest from it. */
function simplifyClosed(ps: readonly Point[], tol: number): Point[] {
  const p0 = ps[0]!;
  let far = 0;
  ps.forEach((q, k) => {
    if (Math.hypot(q.x - p0.x, q.y - p0.y) > Math.hypot(ps[far]!.x - p0.x, ps[far]!.y - p0.y)) far = k;
  });
  const one = simplifyLine(ps.slice(0, far + 1), tol);
  const two = simplifyLine([...ps.slice(far), p0], tol);
  return [...one.slice(0, -1), ...two.slice(0, -1)];
}

/**
 * What can be seen from p (map inches), as an outline for a fog reveal op. `rangeIn` limits it (a dark scene), or null.
 * Rays stopped at a piece go a quarter inch past it; rays stopped at the range are joined by arcs; numbers are in
 * hundredths; at most 1,000 points; [] when fewer than 3 remain. A point on a wall line sees both sides of it.
 */
export function sightFrom(index: BlockIndex, p: Point, rangeIn: number | null): Point[] {
  const kept = dropMid(rays(index, p, rangeIn ?? Infinity));
  const at = (angle: number, t: number): Point => ({ x: r2(p.x + Math.cos(angle) * t), y: r2(p.y + Math.sin(angle) * t) });
  let out: Point[] = [];
  kept.forEach((r, i) => {
    out.push(at(r.angle, r.seg < 0 ? r.t : r.t + PAST_WALL_IN));
    const next = kept[(i + 1) % kept.length]!;
    if (rangeIn === null || r.seg >= 0 || next.seg >= 0 || kept.length < 2) return;
    const end = next.angle > r.angle ? next.angle : next.angle + Math.PI * 2;
    for (let angle = r.angle + ARC_STEP; angle < end - 1e-9; angle += ARC_STEP) out.push(at(angle, rangeIn));
  });
  for (let tol = SIMPLIFY_IN; out.length > MAX_OUTLINE; tol *= 2) out = simplifyClosed(out, tol);
  return out.length < 3 ? [] : out;
}
