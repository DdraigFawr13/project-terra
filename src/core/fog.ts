// Fog of war (step 5, D-007, D-025). The DM reveals and hides by hand; fog is the list of strokes and shapes in the
// order they were made, in the map's own inches (D-005), so it moves and turns with the map. Pure: drawing lives in
// the renderer, which replays the same list into masks. A long list is baked into one `base` op of cells (D-029), so
// the list, the saves and every redraw stay small however long the session runs.
import type { Point } from "./homography.ts";
import type { Bounds } from "./map.ts";

export type FogMode = "reveal" | "hide";

/**
 * Earlier fog baked into square cells over the map (D-029). Like Cover all followed by the cells: it replaces every op
 * before it. `seen` and `explored` are run lengths over the cells row by row, alternating off and on, starting with off.
 */
export type FogBase = {
  kind: "base";
  /** The top-left corner of the cells, in map inches, and cells per inch. */
  x: number;
  y: number;
  ppi: number;
  cols: number;
  rows: number;
  seen: number[];
  explored: number[];
};

/** One fog change. Reveal makes an area seen (and so explored); hide turns seen back into explored. */
export type FogOp =
  | { kind: "brush"; mode: FogMode; r: number; points: Point[] }
  | { kind: "outline"; mode: FogMode; points: Point[] }
  | { kind: "box"; mode: FogMode; x: number; y: number; width: number; height: number }
  | { kind: "revealAll" }
  /** The party moves on: everything seen becomes explored. */
  | { kind: "dimSeen" }
  | { kind: "coverAll" }
  | FogBase;

/** A stroke or shape: the ops that cover an area. */
export type FogShape = Extract<FogOp, { mode: FogMode }>;

/** What players see at a point: black, grey and hatched, or the map itself (D-023). */
export type FogLevel = "unexplored" | "explored" | "seen";

/** Limits for untrusted data. A long stroke is split into several ops by the DM window. */
const MAX_FOG_OPS = 2000;
export const MAX_FOG_POINTS = 1000;
const REACH_IN = 500;
const MIN_R = 0.25;
const MAX_R = 10;
/** A list this long is baked into a base before the next op (D-029). Replaying 500 ops takes about a tenth of a second. */
export const COMPACT_AT = 500;
/** Cells per inch in a base: the renderer's own mask resolution, so baking doesn't change what the table shows. */
const BASE_PPI = 24;
const MAX_BASE_SIDE = 4096;

/** Whether (px, py) lies within r of the segment a–b (a point when a is b). Squared, so baking millions of cells is quick. */
function nearSegment(px: number, py: number, a: Point, b: Point, r: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2)) : 0;
  const ex = px - (a.x + t * dx);
  const ey = py - (a.y + t * dy);
  return ex * ex + ey * ey <= r * r;
}

/** Even-odd rule, the same rule the renderer fills outlines with. */
export function insidePolygon(p: Point, pts: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function covers(op: FogShape, p: Point): boolean {
  switch (op.kind) {
    case "brush":
      if (op.points.length === 1) return nearSegment(p.x, p.y, op.points[0]!, op.points[0]!, op.r);
      return op.points.some((a, i) => i > 0 && nearSegment(p.x, p.y, op.points[i - 1]!, a, op.r));
    case "outline":
      return insidePolygon(p, op.points);
    case "box":
      return p.x >= op.x && p.x <= op.x + op.width && p.y >= op.y && p.y <= op.y + op.height;
  }
}

/** The fog at one point of the map, after replaying every op in order. */
export function fogAt(fog: readonly FogOp[], p: Point): FogLevel {
  let seen = false;
  let explored = false;
  for (const op of fog) {
    if (op.kind === "revealAll") seen = explored = true;
    else if (op.kind === "coverAll") seen = explored = false;
    else if (op.kind === "dimSeen") seen = false;
    else if (op.kind === "base") {
      const k = cellAt(op, p);
      const cells = baseCells(op);
      seen = k !== null && cells.seen[k] === 1;
      explored = k !== null && cells.explored[k] === 1;
    } else if (covers(op, p)) {
      if (op.mode === "reveal") seen = explored = true;
      else seen = false;
    }
  }
  return seen ? "seen" : explored ? "explored" : "unexplored";
}

/**
 * Add an op. Reveal all and cover all make every earlier op irrelevant, so they start the list afresh. A list of
 * COMPACT_AT ops is baked into one base first, over the map's `bounds` (D-029), so fog never stops taking strokes.
 */
export function addFog(fog: readonly FogOp[], op: FogOp, bounds: Bounds): FogOp[] {
  if (op.kind === "revealAll" || op.kind === "coverAll") return [op];
  return fog.length >= COMPACT_AT ? [bake(fog, bounds), op] : [...fog, op];
}

// ---- Bases: fog baked into cells (D-029) ----

type Cells = { seen: Uint8Array; explored: Uint8Array };

/** The cell a point falls in, or null outside the base. */
function cellAt(b: FogBase, p: Point): number | null {
  const i = Math.floor((p.x - b.x) * b.ppi);
  const j = Math.floor((p.y - b.y) * b.ppi);
  return i >= 0 && i < b.cols && j >= 0 && j < b.rows ? j * b.cols + i : null;
}

const decoded = new WeakMap<FogBase, Cells>();
/** A base's cells, decoded once per base. */
export function baseCells(b: FogBase): Cells {
  let cells = decoded.get(b);
  if (!cells) {
    cells = { seen: fromRuns(b.seen, b.cols * b.rows), explored: fromRuns(b.explored, b.cols * b.rows) };
    decoded.set(b, cells);
  }
  return cells;
}

function fromRuns(runs: readonly number[], n: number): Uint8Array {
  const out = new Uint8Array(n);
  let k = 0;
  runs.forEach((len, i) => {
    if (i % 2) out.fill(1, k, k + len);
    k += len;
  });
  return out;
}

function toRuns(cells: Uint8Array): number[] {
  const runs: number[] = [];
  let value = 0;
  let len = 0;
  for (const c of cells) {
    if (c === value) len++;
    else {
      runs.push(len);
      value = c;
      len = 1;
    }
  }
  runs.push(len);
  return runs;
}

/**
 * Where the row at height y crosses the band within r of the segment a–b, as [from, to] in x, or null. The band is a
 * rectangle along the segment with a disc at each end; it is convex, so the row meets it in one span, the union of
 * where it meets the two discs and the rectangle.
 */
function bandSpan(a: Point, b: Point, r: number, y: number): [number, number] | null {
  let from = Infinity;
  let to = -Infinity;
  for (const c of [a, b]) {
    const h2 = r * r - (y - c.y) ** 2;
    if (h2 >= 0) {
      from = Math.min(from, c.x - Math.sqrt(h2));
      to = Math.max(to, c.x + Math.sqrt(h2));
    }
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 > 0) {
    // Along the segment: 0 <= ((x - a.x) dx + (y - a.y) dy) / len2 <= 1. Across it: |(x - a.x) dy - (y - a.y) dx| <= r len.
    const along =
      dx === 0
        ? (y - a.y) * dy >= 0 && (y - a.y) * dy <= len2
          ? [-Infinity, Infinity]
          : null
        : sorted(a.x - ((y - a.y) * dy) / dx, a.x + (len2 - (y - a.y) * dy) / dx);
    const w = r * Math.sqrt(len2);
    const across =
      dy === 0
        ? Math.abs((y - a.y) * dx) <= w
          ? [-Infinity, Infinity]
          : null
        : sorted(a.x + ((y - a.y) * dx - w) / dy, a.x + ((y - a.y) * dx + w) / dy);
    if (along && across && Math.max(along[0]!, across[0]!) <= Math.min(along[1]!, across[1]!)) {
      from = Math.min(from, Math.max(along[0]!, across[0]!));
      to = Math.max(to, Math.min(along[1]!, across[1]!));
    }
  }
  return from <= to ? [from, to] : null;
}
const sorted = (p: number, q: number): [number, number] => (p <= q ? [p, q] : [q, p]);

/** Bake a fog list into one base over the map's bounds: each cell takes the fog at its centre, as `fogAt` gives it. */
export function bake(fog: readonly FogOp[], bounds: Bounds): FogBase {
  const ppi = Math.max(1, Math.min(BASE_PPI, Math.floor(MAX_BASE_SIDE / Math.max(bounds.width, bounds.height))));
  const cols = bounds.width * ppi;
  const rows = bounds.height * ppi;
  const shell = { kind: "base" as const, x: bounds.x, y: bounds.y, ppi, cols, rows };
  const seen = new Uint8Array(cols * rows);
  const explored = new Uint8Array(cols * rows);
  const centre = (i: number, j: number): Point => ({ x: shell.x + (i + 0.5) / ppi, y: shell.y + (j + 0.5) / ppi });
  /** Cells whose centres lie between two map coordinates, along one axis. */
  const span = (from: number, to: number, origin: number, n: number): [number, number] => [
    Math.max(0, Math.floor((from - origin) * ppi) - 1),
    Math.min(n - 1, Math.ceil((to - origin) * ppi) + 1),
  ];
  for (const op of fog) {
    if (op.kind === "revealAll" || op.kind === "coverAll") {
      seen.fill(op.kind === "revealAll" ? 1 : 0);
      explored.fill(op.kind === "revealAll" ? 1 : 0);
    } else if (op.kind === "dimSeen") seen.fill(0);
    else if (op.kind === "base") {
      const cells = baseCells(op);
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const k = cellAt(op, centre(i, j));
          seen[j * cols + i] = k === null ? 0 : cells.seen[k]!;
          explored[j * cols + i] = k === null ? 0 : cells.explored[k]!;
        }
    } else {
      const reveal = op.mode === "reveal";
      const mark = (k: number) => {
        if (reveal) seen[k] = explored[k] = 1;
        else seen[k] = 0;
      };
      // Visit only the cells near the op, checked with the same rule as `fogAt`.
      const pts = op.kind === "box" ? [op, { x: op.x + op.width, y: op.y + op.height }] : op.points;
      const pad = op.kind === "brush" ? op.r : 0;
      const [i0, i1] = span(Math.min(...pts.map((p) => p.x)) - pad, Math.max(...pts.map((p) => p.x)) + pad, shell.x, cols);
      const [j0, j1] = span(Math.min(...pts.map((p) => p.y)) - pad, Math.max(...pts.map((p) => p.y)) + pad, shell.y, rows);
      if (op.kind === "brush") {
        // Segment by segment and row by row: a row crosses a segment's round-ended band in one span. Cells well inside
        // the span are filled at once; the few at its ends get `fogAt`'s exact check, so baking matches it cell for cell.
        const segs = op.points.length === 1 ? [[op.points[0]!, op.points[0]!]] : op.points.slice(1).map((b, n) => [op.points[n]!, b]);
        for (const [a, b] of segs) {
          const [sj0, sj1] = span(Math.min(a!.y, b!.y) - op.r, Math.max(a!.y, b!.y) + op.r, shell.y, rows);
          for (let j = sj0; j <= sj1; j++) {
            const y = shell.y + (j + 0.5) / ppi;
            const hit = bandSpan(a!, b!, op.r, y);
            if (!hit) continue;
            const first = Math.max(0, Math.ceil((hit[0] - shell.x) * ppi - 0.5));
            const last = Math.min(cols - 1, Math.floor((hit[1] - shell.x) * ppi - 0.5));
            const row = j * cols;
            const edge = (i: number) => {
              if (i >= 0 && i < cols && nearSegment(shell.x + (i + 0.5) / ppi, y, a!, b!, op.r)) mark(row + i);
            };
            // Cells first+1 to last-1 sit a whole cell inside the span, far beyond any rounding.
            if (last - first > 2) {
              if (reveal) {
                seen.fill(1, row + first + 1, row + last);
                explored.fill(1, row + first + 1, row + last);
              } else seen.fill(0, row + first + 1, row + last);
              [first - 1, first, last, last + 1].forEach(edge);
            } else for (let i = first - 1; i <= last + 1; i++) edge(i);
          }
        }
      } else if (op.kind === "outline") {
        // Row by row: where the row crosses the outline, with `insidePolygon`'s rule (inside when an odd number of
        // crossings lie to the right of the point).
        for (let j = j0; j <= j1; j++) {
          const y = centre(0, j).y;
          const xs: number[] = [];
          for (let n = 0, m = op.points.length - 1; n < op.points.length; m = n++) {
            const a = op.points[n]!;
            const b = op.points[m]!;
            if (a.y > y !== b.y > y) xs.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
          }
          xs.sort((p, q) => p - q);
          let left = 0;
          for (let i = i0; i <= i1; i++) {
            const x = centre(i, j).x;
            while (left < xs.length && xs[left]! <= x) left++;
            if ((xs.length - left) % 2 === 1) mark(j * cols + i);
          }
        }
      } else for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (covers(op, centre(i, j))) mark(j * cols + i);
    }
  }
  const base: FogBase = { ...shell, seen: toRuns(seen), explored: toRuns(explored) };
  decoded.set(base, { seen, explored });
  return base;
}

// ---- Reading untrusted data ----

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** Hundredths of an inch are plenty for fog and keep saves small; `+ 0` turns -0 into 0, as JSON would. */
const coord = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= REACH_IN ? Math.round(v * 100) / 100 + 0 : null;
const whole = (v: unknown, min: number): number | null =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= REACH_IN ? (v as number) + 0 : null;

function parsePoints(raw: unknown, min: number): Point[] | null {
  if (!Array.isArray(raw) || raw.length < min || raw.length > MAX_FOG_POINTS) return null;
  const out: Point[] = [];
  for (const p of raw) {
    if (!isObject(p)) return null;
    const x = coord(p.x);
    const y = coord(p.y);
    if (x === null || y === null) return null;
    out.push({ x, y });
  }
  return out;
}

/** Run lengths that cover exactly `n` cells. */
function parseRuns(raw: unknown, n: number): number[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > n + 1) return null;
  let sum = 0;
  for (const len of raw) {
    if (!Number.isInteger(len) || len < 0) return null;
    sum += len;
  }
  return sum === n ? raw.map((len: number) => len + 0) : null;
}

function parseBase(raw: Record<string, unknown>): FogBase | null {
  const [x, y] = [whole(raw.x, -REACH_IN), whole(raw.y, -REACH_IN)];
  const side = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_BASE_SIDE ? (v as number) : null);
  const [ppi, cols, rows] = [raw.ppi, side(raw.cols), side(raw.rows)];
  if (x === null || y === null || cols === null || rows === null) return null;
  if (!Number.isInteger(ppi) || (ppi as number) < 1 || (ppi as number) > BASE_PPI) return null;
  const seen = parseRuns(raw.seen, cols * rows);
  const explored = parseRuns(raw.explored, cols * rows);
  return seen && explored && { kind: "base", x, y, ppi: ppi as number, cols, rows, seen, explored };
}

export function parseFogOp(raw: unknown): FogOp | null {
  if (!isObject(raw)) return null;
  if (raw.kind === "revealAll" || raw.kind === "dimSeen" || raw.kind === "coverAll") return { kind: raw.kind };
  if (raw.kind === "base") return parseBase(raw);
  const mode = raw.mode === "reveal" || raw.mode === "hide" ? raw.mode : null;
  if (!mode) return null;
  switch (raw.kind) {
    case "brush": {
      const r = coord(raw.r);
      const points = parsePoints(raw.points, 1);
      return r !== null && r >= MIN_R && r <= MAX_R && points ? { kind: "brush", mode, r, points } : null;
    }
    case "outline": {
      const points = parsePoints(raw.points, 3);
      return points && { kind: "outline", mode, points };
    }
    case "box": {
      const [x, y, width, height] = [whole(raw.x, -REACH_IN), whole(raw.y, -REACH_IN), whole(raw.width, 1), whole(raw.height, 1)];
      return x === null || y === null || width === null || height === null ? null : { kind: "box", mode, x, y, width, height };
    }
    default:
      return null;
  }
}

/** A whole fog list from a save or a placed map: every op must read, or the list is refused. */
export function parseFog(raw: unknown): FogOp[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_FOG_OPS) return null;
  const out: FogOp[] = [];
  for (const r of raw) {
    const op = parseFogOp(r);
    if (!op) return null;
    out.push(op);
  }
  return out;
}
