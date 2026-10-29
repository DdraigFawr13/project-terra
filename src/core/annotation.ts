// Map annotation (D-044): walls, pillars and openings traced on a library map, in the map's own inches like fog
// (D-025), so they move and turn with the map. DM-only: none of it is ever sent to the table window (D-002). Pure:
// the editor's tapping, joining and smoothing rules live here so they are tested without a browser.
import type { Point } from "./homography.ts";
import type { Bounds } from "./map.ts";

/** Door, Secret door, Window, and Opening: an arch or broken wall that closes a room but blocks nothing (D-044). */
const OPENING_KINDS = ["door", "secret", "window", "opening"] as const;
export type OpeningKind = (typeof OPENING_KINDS)[number];

/** A run of wall through its corners; `closed` joins the last corner back to the first (a loop round a pillar). */
type Wall = { points: Point[]; closed: boolean };
/** A round pillar, boulder or tree trunk that blocks sight. */
type Pillar = { at: Point; r: number };
/** `open`: how a door starts; each scene keeps its own state from step 2C. */
type Opening = { kind: OpeningKind; a: Point; b: Point; open: boolean };
export type Annotation = { walls: Wall[]; pillars: Pillar[]; openings: Opening[] };

export const ANNOTATION_VERSION = 1;
/** Taps land on the nearest quarter inch (D-044). */
const SNAP_IN = 0.25;
/** Any end this close to a corner joins it, so freehand and tapped walls leave no hairline gaps. */
const JOIN_IN = 0.125;
/** Freehand lines keep only corners that bend more than this off the straight line. */
const SMOOTH_IN = 0.1;
const MAX_ITEMS = 5000;
const MAX_POINTS = 2000;
/** Lines may reach this far past the picture's edge, for walls drawn along it. */
const EDGE_IN = 1;

export const emptyAnnotation = (): Annotation => ({ walls: [], pillars: [], openings: [] });

/** Hundredths of an inch, as fog keeps them (D-025); `+ 0` so -0 never reaches a save (AGENTS.md). */
const round = (v: number): number => Math.round(v * 100) / 100 + 0;
const pt = (p: Point): Point => ({ x: round(p.x), y: round(p.y) });

export function snapPoint(p: Point, step = SNAP_IN): Point {
  return pt({ x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step });
}

/** Every corner and opening end on the map: what a new point may join. */
function corners(a: Annotation): Point[] {
  return [...a.walls.flatMap((w) => w.points), ...a.openings.flatMap((o) => [o.a, o.b])];
}

/** The nearest existing corner within `reach` inches, or null. */
function nearestCorner(a: Annotation, p: Point, reach: number): Point | null {
  let best: Point | null = null;
  let d = reach;
  for (const c of corners(a)) {
    const e = Math.hypot(c.x - p.x, c.y - p.y);
    if (e <= d) [best, d] = [c, e];
  }
  return best;
}

/**
 * Where a tap puts a corner: on an existing corner within `reach` (the editor passes a reach of at least `JOIN_IN`,
 * wider for a pen on a small screen), otherwise on the nearest quarter inch. `extra` are corners of the line being
 * drawn, so it can close on itself.
 */
export function placePoint(a: Annotation, p: Point, reach: number, extra: readonly Point[] = []): Point {
  const near = nearestCorner({ ...a, walls: [...a.walls, { points: [...extra], closed: false }] }, p, Math.max(reach, JOIN_IN));
  return near ? { ...near } : snapPoint(p);
}

/** Distance from p to the segment ab. */
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Douglas–Peucker: the fewest corners that keep the line within `tol` inches of where it was drawn. */
export function smooth(points: readonly Point[], tol = SMOOTH_IN): Point[] {
  if (points.length < 3) return points.map(pt);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let far = -1;
    let d = tol;
    for (let k = i + 1; k < j; k++) {
      const e = segmentDistance(points[k]!, points[i]!, points[j]!);
      if (e > d) [far, d] = [k, e];
    }
    if (far < 0) continue;
    keep[far] = 1;
    stack.push([i, far], [far, j]);
  }
  return points.filter((_, i) => keep[i]).map(pt);
}

/** Add a run of wall through tapped corners; a run that ends on its own first corner becomes a loop. */
export function addWall(a: Annotation, points: readonly Point[]): Annotation {
  const ps = points.map(pt).filter((p, i, all) => i === 0 || p.x !== all[i - 1]!.x || p.y !== all[i - 1]!.y);
  const closed = ps.length > 3 && ps[0]!.x === ps.at(-1)!.x && ps[0]!.y === ps.at(-1)!.y;
  const run = closed ? ps.slice(0, -1) : ps;
  if (run.length < 2) return a;
  return { ...a, walls: [...a.walls, { points: run, closed }] };
}

/**
 * Add a freehand wall (caves): smoothed into straight pieces and not snapped; each end joins a corner within
 * `JOIN_IN`, and a line whose ends meet becomes a loop.
 */
export function addFreehand(a: Annotation, drawn: readonly Point[]): Annotation {
  const ps = smooth(drawn);
  if (ps.length < 2) return a;
  const first = nearestCorner(a, ps[0]!, JOIN_IN);
  const last = nearestCorner(a, ps.at(-1)!, JOIN_IN);
  if (first) ps[0] = { ...first };
  if (last) ps[ps.length - 1] = { ...last };
  const meets = ps.length > 2 && Math.hypot(ps[0]!.x - ps.at(-1)!.x, ps[0]!.y - ps.at(-1)!.y) <= JOIN_IN;
  if (meets) ps[ps.length - 1] = { ...ps[0]! };
  return addWall(a, ps);
}

export function addOpening(a: Annotation, kind: OpeningKind, from: Point, to: Point): Annotation {
  const [p, q] = [pt(from), pt(to)];
  if (p.x === q.x && p.y === q.y) return a;
  return { ...a, openings: [...a.openings, { kind, a: p, b: q, open: false }] };
}

export function addPillar(a: Annotation, at: Point, r: number): Annotation {
  const radius = round(Math.max(SNAP_IN / 2, r));
  return { ...a, pillars: [...a.pillars, { at: pt(at), r: radius }] };
}

/**
 * Rub out what is nearest to p within `reach`: one piece of a wall (splitting the run there), an opening, or a pillar.
 * Unchanged if nothing is that close.
 */
export function eraseAt(a: Annotation, p: Point, reach: number): Annotation {
  type Hit = { d: number; apply: () => Annotation };
  let best: Hit | null = null;
  const consider = (d: number, apply: () => Annotation) => {
    if (d <= reach && (!best || d < best.d)) best = { d, apply };
  };
  a.openings.forEach((o, i) => consider(segmentDistance(p, o.a, o.b), () => ({ ...a, openings: a.openings.filter((_, j) => j !== i) })));
  a.pillars.forEach((c, i) =>
    consider(Math.abs(Math.hypot(p.x - c.at.x, p.y - c.at.y) - c.r), () => ({ ...a, pillars: a.pillars.filter((_, j) => j !== i) })),
  );
  a.walls.forEach((w, i) => {
    const n = w.closed ? w.points.length : w.points.length - 1;
    for (let k = 0; k < n; k++) {
      const s = w.points[k]!;
      const e = w.points[(k + 1) % w.points.length]!;
      consider(segmentDistance(p, s, e), () => {
        // A loop opens into one run starting after the piece; a run splits into the parts either side of it.
        const parts = w.closed
          ? [[...w.points.slice(k + 1), ...w.points.slice(0, k + 1)]]
          : [w.points.slice(0, k + 1), w.points.slice(k + 1)];
        const kept = parts.filter((r) => r.length >= 2).map((r) => ({ points: r, closed: false }));
        return { ...a, walls: [...a.walls.slice(0, i), ...kept, ...a.walls.slice(i + 1)] };
      });
    }
  });
  return best ? (best as Hit).apply() : a;
}

/** How many things are traced, for the editor's status line. */
export function countOf(a: Annotation): { walls: number; pillars: number; openings: number } {
  const pieces = a.walls.reduce((n, w) => n + (w.closed ? w.points.length : w.points.length - 1), 0);
  return { walls: pieces, pillars: a.pillars.length, openings: a.openings.length };
}

// ---- Reading saved files ----

function parsePoint(raw: unknown, b: Bounds): Point | null {
  if (!raw || typeof raw !== "object") return null;
  const { x, y } = raw as Record<string, unknown>;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < b.x - EDGE_IN || y < b.y - EDGE_IN || x > b.x + b.width + EDGE_IN || y > b.y + b.height + EDGE_IN) return null;
  return pt({ x, y });
}

function parsePoints(raw: unknown, b: Bounds, min: number): Point[] | null {
  if (!Array.isArray(raw) || raw.length < min || raw.length > MAX_POINTS) return null;
  const ps = raw.map((p) => parsePoint(p, b));
  return ps.every((p): p is Point => !!p) ? ps : null;
}

/**
 * A saved annotation for a map with these bounds, or null if any part of it is unusable. The file is `{ version,
 * walls, pillars, openings }`; whole-file refusal keeps a damaged file from being half-loaded and then saved over.
 */
export function parseAnnotation(raw: unknown, b: Bounds): Annotation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== ANNOTATION_VERSION) return null;
  const { walls, pillars, openings } = r;
  if (!Array.isArray(walls) || !Array.isArray(pillars) || !Array.isArray(openings)) return null;
  if (walls.length + pillars.length + openings.length > MAX_ITEMS) return null;
  const out = emptyAnnotation();
  for (const w of walls) {
    if (!w || typeof w !== "object" || typeof w.closed !== "boolean") return null;
    const points = parsePoints(w.points, b, w.closed ? 3 : 2);
    if (!points) return null;
    out.walls.push({ points, closed: w.closed });
  }
  for (const c of pillars) {
    const at = c && typeof c === "object" ? parsePoint(c.at, b) : null;
    if (!at || typeof c.r !== "number" || !Number.isFinite(c.r) || c.r <= 0 || c.r > 20) return null;
    out.pillars.push({ at, r: round(c.r) });
  }
  for (const o of openings) {
    if (!o || typeof o !== "object" || !OPENING_KINDS.includes(o.kind) || typeof o.open !== "boolean") return null;
    const [a, bb] = [parsePoint(o.a, b), parsePoint(o.b, b)];
    if (!a || !bb) return null;
    out.openings.push({ kind: o.kind, a, b: bb, open: o.open });
  }
  return out;
}

/** The file written for an annotation. */
export const annotationFile = (a: Annotation) => ({ version: ANNOTATION_VERSION, ...a });
