// Map import (D-009, D-024): the DM marks a rectangle of known size on a map image, in squares. Each square becomes
// 1 inch on the table (D-005), and the image is straightened once at import, so a slanted phone photo of a book page
// comes out square. Pure: the pixel loop works on plain RGBA arrays, so it is tested without a browser.
import { apply, depth, invert, isConvex, rectToQuad, type Point, type Quad } from "./homography.ts";

/** A rectangle marked on the image: its corners in image pixels (top left, top right, bottom right, bottom left) and its size in squares. */
export type Marking = { corners: Quad; widthIn: number; heightIn: number };

/** The straightened map's extent in inches, relative to the marked rectangle's top-left corner. */
export type Bounds = { x: number; y: number; width: number; height: number };

export type Pixels = { width: number; height: number; data: Uint8ClampedArray };

const MAX_SQUARES = 120;
/** How far past the marked rectangle the map may reach, in inches. Beyond this the photo is too slanted to use. */
const MAX_REACH_IN = 120;
const MAX_PPI = 150;
const MIN_PPI = 10;
const MAX_SIDE_PX = 8192;
const GRID = 32;
const MAX_SQUASH = 4;

const isSquares = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_SQUARES;

/** A marking from untrusted data, or null. Corners must lie on the image and not fold. */
export function parseMarking(raw: unknown, image: { width: number; height: number }): Marking | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isSquares(r.widthIn) || !isSquares(r.heightIn) || !Array.isArray(r.corners) || r.corners.length !== 4) return null;
  const corners: Point[] = [];
  for (const c of r.corners as unknown[]) {
    const p = c as Record<string, unknown> | null;
    if (typeof p !== "object" || p === null || typeof p.x !== "number" || typeof p.y !== "number") return null;
    if (!(p.x >= 0 && p.x <= image.width && p.y >= 0 && p.y <= image.height)) return null;
    corners.push({ x: p.x, y: p.y });
  }
  return isConvex(corners as Quad) ? { corners: corners as Quad, widthIn: r.widthIn, heightIn: r.heightIn } : null;
}

/** How the straightened image is laid out: its extent in inches and its resolution. */
export type Plan = { bounds: Bounds; ppi: number; width: number; height: number };

/** Lay out the straightened image: the whole photo where it can be straightened, about as sharp as the source, within canvas limits. */
export function planRectify(m: Marking, image: { width: number; height: number }): Plan {
  const toImage = rectToQuad(m.widthIn, m.heightIn, m.corners);
  const toInches = invert(toImage);
  const reach = (lo: number, hi: number, v: number) => Math.min(hi + MAX_REACH_IN, Math.max(lo - MAX_REACH_IN, v));
  // Keep the part of the photo that is sharp enough to use: a slanted photo squashes whatever is far from the camera,
  // and straightening it would stretch a little backdrop into a huge, blurry wedge. Sample the photo on a grid and keep
  // points squashed at most MAX_SQUASH times (linearly) compared with the marked rectangle.
  const centre = depth(toImage, { x: m.widthIn / 2, y: m.heightIn / 2 });
  const pts: Point[] = [];
  for (let gy = 0; gy <= GRID; gy++)
    for (let gx = 0; gx <= GRID; gx++) {
      const t = apply(toInches, { x: (gx / GRID) * image.width, y: (gy / GRID) * image.height });
      const w = depth(toImage, t);
      if (Number.isFinite(t.x) && Number.isFinite(t.y) && w > 0 && (w / centre) ** 2 <= MAX_SQUASH)
        pts.push({ x: reach(0, m.widthIn, t.x), y: reach(0, m.heightIn, t.y) });
    }
  pts.push({ x: 0, y: 0 }, { x: m.widthIn, y: m.heightIn });
  const x0 = Math.floor(Math.min(...pts.map((p) => p.x)));
  const y0 = Math.floor(Math.min(...pts.map((p) => p.y)));
  const x1 = Math.ceil(Math.max(...pts.map((p) => p.x)));
  const y1 = Math.ceil(Math.max(...pts.map((p) => p.y)));
  const bounds = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };

  // Source pixels per inch inside the marked rectangle, so straightening neither blurs nor bloats the image.
  const side = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const [c0, c1, c2, c3] = m.corners;
  const source = Math.max((side(c0, c1) + side(c3, c2)) / 2 / m.widthIn, (side(c0, c3) + side(c1, c2)) / 2 / m.heightIn);
  const ppi = Math.max(MIN_PPI, Math.min(MAX_PPI, source, MAX_SIDE_PX / bounds.width, MAX_SIDE_PX / bounds.height));
  return { bounds, ppi, width: Math.round(bounds.width * ppi), height: Math.round(bounds.height * ppi) };
}

/** Straighten the image: each output pixel samples the photo where its inch position lands (bilinear). Outside the photo stays transparent. */
export function rectify(src: Pixels, m: Marking, plan: Plan): Pixels {
  const toImage = rectToQuad(m.widthIn, m.heightIn, m.corners);
  const [a, b, c, d, e, f, g, h, i] = toImage;
  const out = new Uint8ClampedArray(plan.width * plan.height * 4);
  const sw = src.width;
  const sh = src.height;
  const s = src.data;
  for (let oy = 0; oy < plan.height; oy++) {
    const ty = plan.bounds.y + (oy + 0.5) / plan.ppi;
    for (let ox = 0; ox < plan.width; ox++) {
      const tx = plan.bounds.x + (ox + 0.5) / plan.ppi;
      const w = g * tx + h * ty + i;
      if (w <= 0) continue;
      const px = (a * tx + b * ty + c) / w - 0.5;
      const py = (d * tx + e * ty + f) / w - 0.5;
      if (px < -0.5 || py < -0.5 || px > sw - 0.5 || py > sh - 0.5) continue;
      const x0 = Math.max(0, Math.floor(px));
      const y0 = Math.max(0, Math.floor(py));
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = Math.min(1, Math.max(0, px - x0));
      const fy = Math.min(1, Math.max(0, py - y0));
      const o = (oy * plan.width + ox) * 4;
      for (let k = 0; k < 4; k++) {
        const top = s[(y0 * sw + x0) * 4 + k]! * (1 - fx) + s[(y0 * sw + x1) * 4 + k]! * fx;
        const bottom = s[(y1 * sw + x0) * 4 + k]! * (1 - fx) + s[(y1 * sw + x1) * 4 + k]! * fx;
        out[o + k] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return { width: plan.width, height: plan.height, data: out };
}

/** A map as placed on the table: its marked corner at (x, y) inches, turned clockwise by quarter turns about that corner. */
export type Placement = { bounds: Bounds; x: number; y: number; turns: 0 | 1 | 2 | 3 };

const QUARTER_TURNS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

/** Where a point of the map (in map inches) lands on the table. */
export function mapToTable(p: Placement, pt: Point): Point {
  const [cos, sin] = QUARTER_TURNS[p.turns];
  return { x: p.x + pt.x * cos - pt.y * sin + 0, y: p.y + pt.x * sin + pt.y * cos + 0 };
}

/** Where a point of the table (in table inches) falls on the map, in map inches: the reverse of `mapToTable`. */
export function tableToMap(p: Placement, pt: Point): Point {
  const [cos, sin] = QUARTER_TURNS[p.turns];
  const dx = pt.x - p.x;
  const dy = pt.y - p.y;
  return { x: dx * cos + dy * sin + 0, y: dy * cos - dx * sin + 0 };
}

/** The table area a placed map covers, in inches. */
export function placedExtent(p: Placement): Bounds {
  const b = p.bounds;
  const pts = [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
  ].map((q) => mapToTable(p, q));
  const x = Math.min(pts[0]!.x, pts[1]!.x);
  const y = Math.min(pts[0]!.y, pts[1]!.y);
  return { x, y, width: Math.abs(pts[0]!.x - pts[1]!.x), height: Math.abs(pts[0]!.y - pts[1]!.y) };
}
