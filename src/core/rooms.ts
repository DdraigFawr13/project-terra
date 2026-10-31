// Rooms (D-044 step 2C): found by a tap inside walls and openings, or drawn as an outline; a tap with Uncover or Dim
// then does the whole room. Pure. The work happens on a grid of eighth-inch cells: walls, openings, pillars and other
// rooms block a flood from the tap, and the edges of the cells it reached are traced back into an outline.
import { MAX_ROOM_NAME, pt, segmentDistance, smooth, type Annotation } from "./annotation.ts";
import { insidePolygon, MAX_FOG_POINTS, type FogMode, type FogShape } from "./fog.ts";
import type { Point } from "./homography.ts";
import type { Bounds } from "./map.ts";

/** Cells per inch. */
const PPI = 8;
/** A cell whose middle is this close to a line is blocked: over half a cell, so a flood can't slip past a slanted line. */
const LINE_IN = 0.08;
/** An uncover grows this far past the room's outline, to show its walls (D-044). */
const GROW_IN = 0.5;
/** The grow leaves out cells this close to a secret door, so its paint stays hidden until it is found. */
const SECRET_IN = 0.6;
/** Traced outlines keep only corners that stand further than this off the cell edges' staircase. */
const TRACE_TOL = 0.06;

type Grid = { x: number; y: number; cols: number; rows: number; cells: Uint8Array };

/** A grid of cells covering x0..x1, y0..y1 in inches, all off. */
function grid(x0: number, y0: number, x1: number, y1: number): Grid {
  const x = Math.floor(x0 * PPI) / PPI;
  const y = Math.floor(y0 * PPI) / PPI;
  const cols = Math.max(1, Math.ceil((x1 - x) * PPI));
  const rows = Math.max(1, Math.ceil((y1 - y) * PPI));
  return { x, y, cols, rows, cells: new Uint8Array(cols * rows) };
}

const middle = (g: Grid, i: number, j: number): Point => ({ x: g.x + (i + 0.5) / PPI, y: g.y + (j + 0.5) / PPI });

/** Turn on every cell whose middle is within `r` of the segment a–b. */
function markSegment(g: Grid, a: Point, b: Point, r: number): void {
  const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - r - g.x) * PPI));
  const i1 = Math.min(g.cols - 1, Math.ceil((Math.max(a.x, b.x) + r - g.x) * PPI));
  const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - r - g.y) * PPI));
  const j1 = Math.min(g.rows - 1, Math.ceil((Math.max(a.y, b.y) + r - g.y) * PPI));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) if (segmentDistance(middle(g, i, j), a, b) <= r) g.cells[j * g.cols + i] = 1;
}

/** The pieces of a closed outline, last corner back to the first. */
const edgesOf = (ps: readonly Point[]): [Point, Point][] => ps.map((p, i) => [p, ps[(i + 1) % ps.length]!]);

/** What stops a room's flood: every wall, opening and pillar edge, and the outlines of the other rooms. */
function walls(a: Annotation, g: Grid): void {
  for (const w of a.walls) {
    const n = w.closed ? w.points.length : w.points.length - 1;
    for (let k = 0; k < n; k++) markSegment(g, w.points[k]!, w.points[(k + 1) % w.points.length]!, LINE_IN);
  }
  for (const o of a.openings) markSegment(g, o.a, o.b, LINE_IN);
  for (const c of a.pillars)
    for (let k = 0; k < 24; k++) {
      const t = (k / 24) * Math.PI * 2;
      const u = ((k + 1) / 24) * Math.PI * 2;
      markSegment(
        g,
        { x: c.at.x + c.r * Math.cos(t), y: c.at.y + c.r * Math.sin(t) },
        { x: c.at.x + c.r * Math.cos(u), y: c.at.y + c.r * Math.sin(u) },
        LINE_IN,
      );
    }
  for (const room of a.rooms) for (const [p, q] of edgesOf(room.outline)) markSegment(g, p, q, LINE_IN);
}

/**
 * The outlines of the cells that are on, as closed loops of corners in inches. Each edge between an on cell and an off
 * one runs with the on cell on its right; at a corner shared by two diagonal cells the trace turns right, so cells
 * that only touch at a corner make separate loops, as the four-way flood treats them. Outer loops wind one way and
 * holes the other.
 */
function trace(g: Grid): Point[][] {
  const { cols, rows, cells } = g;
  const on = (i: number, j: number) => i >= 0 && j >= 0 && i < cols && j < rows && cells[j * cols + i] === 1;
  const W = cols + 1;
  // Directions: 0 +x, 1 +y, 2 -x, 3 -y (y runs down the map). An edge is its start corner and its direction.
  const STEP = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ] as const;
  const out = new Map<number, number[]>();
  const add = (i: number, j: number, d: number) => {
    const v = j * W + i;
    out.set(v, [...(out.get(v) ?? []), d]);
  };
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      if (!on(i, j)) continue;
      if (!on(i, j - 1)) add(i, j, 0);
      if (!on(i + 1, j)) add(i + 1, j, 1);
      if (!on(i, j + 1)) add(i + 1, j + 1, 2);
      if (!on(i - 1, j)) add(i, j + 1, 3);
    }
  const loops: Point[][] = [];
  for (const [start, dirs] of out) {
    while (dirs.length) {
      const corner = (v: number): Point => ({ x: g.x + (v % W) / PPI, y: g.y + Math.floor(v / W) / PPI });
      let v = start;
      let d = dirs.pop()!;
      const first = d;
      const loop = [corner(v)];
      for (;;) {
        v += STEP[d]![0] + STEP[d]![1] * W;
        if (v === start) break;
        const next = out.get(v)!;
        const turn = [(d + 1) % 4, d, (d + 3) % 4].find((t) => next.includes(t))!;
        next.splice(next.indexOf(turn), 1);
        // Corners only: a straight run needs no point in its middle.
        if (turn !== d) loop.push(corner(v));
        d = turn;
      }
      if (d === first) loop.shift();
      if (loop.length >= 3) loops.push(loop);
    }
  }
  return loops;
}

/** Twice the signed area: positive for the outer loops `trace` makes. */
const area2 = (ps: readonly Point[]) => edgesOf(ps).reduce((s, [p, q]) => s + p.x * q.y - q.x * p.y, 0);

/** A closed loop with the staircase of cell edges smoothed away. */
function smoothLoop(ps: readonly Point[], tol: number): Point[] {
  return smooth([...ps, ps[0]!], tol).slice(0, -1);
}

/** The room a point is in, or -1. */
export function roomAt(a: Annotation, p: Point): number {
  return a.rooms.findIndex((r) => insidePolygon(p, r.outline));
}

export type Found = { outline: Point[] } | { error: "room" | "wall" | "leak" };

/**
 * The room around a tap: the area closed by walls, openings, pillars and other rooms, as an outline. "leak" if the
 * area reaches the map's edge (a gap somewhere, or a room open to the outside), "wall" if the tap is on a line.
 */
export function findRoom(a: Annotation, bounds: Bounds, p: Point): Found {
  if (roomAt(a, p) >= 0) return { error: "room" };
  const g = grid(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height);
  walls(a, g);
  const i = Math.floor((p.x - g.x) * PPI);
  const j = Math.floor((p.y - g.y) * PPI);
  if (i < 0 || j < 0 || i >= g.cols || j >= g.rows || g.cells[j * g.cols + i]) return { error: "wall" };
  const region = { ...g, cells: new Uint8Array(g.cells.length) };
  const queue = [j * g.cols + i];
  region.cells[queue[0]!] = 1;
  while (queue.length) {
    const k = queue.pop()!;
    const [ci, cj] = [k % g.cols, Math.floor(k / g.cols)];
    if (ci === 0 || cj === 0 || ci === g.cols - 1 || cj === g.rows - 1) return { error: "leak" };
    for (const n of [k - 1, k + 1, k - g.cols, k + g.cols])
      if (!g.cells[n] && !region.cells[n]) {
        region.cells[n] = 1;
        queue.push(n);
      }
  }
  // The outer loop only: a pillar inside a room leaves a hole, and the room keeps it.
  const outer = trace(region).reduce((best, l) => (area2(l) > area2(best) ? l : best));
  return { outline: smoothLoop(outer, TRACE_TOL) };
}

/** Whether segments a–b and c–d cross at a point inside both. Touching or running along each other isn't crossing. */
function cross(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** Whether two outlines overlap: their edges cross, or one has a corner inside the other. */
function overlaps(p: readonly Point[], q: readonly Point[]): boolean {
  if (edgesOf(p).some(([a, b]) => edgesOf(q).some(([c, d]) => cross(a, b, c, d)))) return true;
  return p.some((v) => insidePolygon(v, q) && !onOutline(v, q)) || q.some((v) => insidePolygon(v, p) && !onOutline(v, p));
}
const onOutline = (v: Point, ps: readonly Point[]) => edgesOf(ps).some(([a, b]) => segmentDistance(v, a, b) < 0.01);

/** The lowest whole number not yet used as a room's name: the name a new room starts with. */
export function nextRoomName(a: Annotation): string {
  let n = 1;
  while (a.rooms.some((r) => r.name === String(n))) n++;
  return String(n);
}

/** Add a room, or null if its outline overlaps another room's (D-044: rooms don't overlap). */
export function addRoom(a: Annotation, outline: readonly Point[], name: string): Annotation | null {
  const ps = outline.map(pt);
  if (ps.length < 3 || a.rooms.some((r) => overlaps(ps, r.outline))) return null;
  return { ...a, rooms: [...a.rooms, { outline: ps, name: name.trim().slice(0, MAX_ROOM_NAME) }] };
}

export function renameRoom(a: Annotation, i: number, name: string): Annotation {
  return { ...a, rooms: a.rooms.map((r, k) => (k === i ? { ...r, name: name.trim().slice(0, MAX_ROOM_NAME) } : r)) };
}

export function removeRoom(a: Annotation, i: number): Annotation {
  return { ...a, rooms: a.rooms.filter((_, k) => k !== i) };
}

/**
 * The fog op that uncovers (or dims) a whole room: inside its outline, and up to GROW_IN past it so the walls show,
 * but never into another room and not near a secret door (D-044). One ordinary outline op, so the table gets only
 * the area itself and never another room's shape (D-002). Every loop goes into one point list, joined through the
 * first corner: the even-odd fill cancels the joins, and holes stay holes.
 */
export function roomUncover(a: Annotation, i: number, mode: FogMode): FogShape | null {
  const room = a.rooms[i];
  if (!room) return null;
  const xs = room.outline.map((p) => p.x);
  const ys = room.outline.map((p) => p.y);
  const pad = GROW_IN + 1 / PPI;
  const g = grid(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad);
  const others = a.rooms.filter((_, k) => k !== i);
  const secrets = a.openings.filter((o) => o.kind === "secret");
  const edges = edgesOf(room.outline);
  for (let j = 0; j < g.rows; j++)
    for (let k = 0; k < g.cols; k++) {
      const c = middle(g, k, j);
      const inside = insidePolygon(c, room.outline);
      const grown =
        !inside &&
        edges.some(([p, q]) => segmentDistance(c, p, q) <= GROW_IN) &&
        !others.some((r) => insidePolygon(c, r.outline)) &&
        !secrets.some((o) => segmentDistance(c, o.a, o.b) <= SECRET_IN);
      if (inside || grown) g.cells[j * g.cols + k] = 1;
    }
  const loops = trace(g).sort((p, q) => area2(q) - area2(p));
  if (!loops.length) return null;
  for (let tol = TRACE_TOL; ; tol *= 2) {
    const smoothed = loops.map((l) => smoothLoop(l, tol)).filter((l) => l.length >= 3);
    const anchor = smoothed[0]![0]!;
    const points = smoothed.flatMap((l, n) => (n === 0 ? [...l, l[0]!] : [...l, l[0]!, anchor])).map(pt);
    if (points.length <= MAX_FOG_POINTS) return { kind: "outline", mode, points };
  }
}
