// Fog of war (step 5, D-007, D-025). The DM reveals and hides by hand; fog is the list of strokes and shapes in the
// order they were made, in the map's own inches (D-005), so it moves and turns with the map. Pure: drawing lives in
// the renderer, which replays the same list into masks.
import type { Point } from "./homography.ts";

export type FogMode = "reveal" | "hide";

/** One fog change. Reveal makes an area seen (and so explored); hide turns seen back into explored. */
export type FogOp =
  | { kind: "brush"; mode: FogMode; r: number; points: Point[] }
  | { kind: "outline"; mode: FogMode; points: Point[] }
  | { kind: "box"; mode: FogMode; x: number; y: number; width: number; height: number }
  | { kind: "revealAll" }
  /** The party moves on: everything seen becomes explored. */
  | { kind: "dimSeen" }
  | { kind: "coverAll" };

/** A stroke or shape: the ops that cover an area. */
export type FogShape = Extract<FogOp, { mode: FogMode }>;

/** What players see at a point: black, grey and hatched, or the map itself (D-023). */
export type FogLevel = "unexplored" | "explored" | "seen";

/** Limits for untrusted data. A long stroke is split into several ops by the DM window. */
export const MAX_FOG_OPS = 2000;
export const MAX_FOG_POINTS = 1000;
const REACH_IN = 500;
const MIN_R = 0.25;
const MAX_R = 10;

const distToSegment = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Even-odd rule, the same rule the renderer fills outlines with. */
function insidePolygon(p: Point, pts: Point[]): boolean {
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
      if (op.points.length === 1) return Math.hypot(p.x - op.points[0]!.x, p.y - op.points[0]!.y) <= op.r;
      return op.points.some((a, i) => i > 0 && distToSegment(p, op.points[i - 1]!, a) <= op.r);
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
    else if (covers(op, p)) {
      if (op.mode === "reveal") seen = explored = true;
      else seen = false;
    }
  }
  return seen ? "seen" : explored ? "explored" : "unexplored";
}

/** Add an op. Reveal all and cover all make every earlier op irrelevant, so they start the list afresh. */
export function addFog(fog: readonly FogOp[], op: FogOp): FogOp[] {
  if (op.kind === "revealAll" || op.kind === "coverAll") return [op];
  return fog.length >= MAX_FOG_OPS ? [...fog] : [...fog, op];
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

export function parseFogOp(raw: unknown): FogOp | null {
  if (!isObject(raw)) return null;
  if (raw.kind === "revealAll" || raw.kind === "dimSeen" || raw.kind === "coverAll") return { kind: raw.kind };
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
