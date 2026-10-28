// Corner-pin calibration (D-004, D-021). The DM drags four corners on the table screen until they sit on the
// corners of a rectangle measured on the mat. Corners are stored as fractions of the table screen, so the
// same calibration holds at any resolution or Windows display scaling.
import { apply, depth, invert, isConvex, multiply, rectToQuad, type Matrix, type Point, type Quad } from "./homography.ts";

export type Calibration = {
  /** Size of the measured rectangle on the mat, in inches. */
  widthIn: number;
  heightIn: number;
  /** Where its corners land on the table screen (top left, top right, bottom right, bottom left), as fractions 0–1. */
  corners: Quad;
};

/** The table window's drawing area: size in CSS pixels and device pixels per CSS pixel. */
export type Surface = { width: number; height: number; scale: number };

const MAX_INCHES = 120;
/** Before calibration the table assumes the browser's 96 CSS pixels per inch. */
const UNCALIBRATED_PX_PER_INCH = 96;

const isFraction = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 1;
const isInches = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_INCHES;

/** A calibration from untrusted data, or null if any part is wrong. */
export function parseCalibration(raw: unknown): Calibration | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isInches(r.widthIn) || !isInches(r.heightIn) || !Array.isArray(r.corners) || r.corners.length !== 4) return null;
  const corners: Point[] = [];
  for (const c of r.corners as unknown[]) {
    const p = c as Record<string, unknown> | null;
    if (typeof p !== "object" || p === null || !isFraction(p.x) || !isFraction(p.y)) return null;
    // Normalise -0, which JSON can't keep.
    corners.push({ x: p.x + 0, y: p.y + 0 });
  }
  const cal = { widthIn: r.widthIn, heightIn: r.heightIn, corners: corners as Quad };
  return isConvex(cal.corners) ? cal : null;
}

const toPixels = (q: Quad, s: Surface): Quad => q.map((p) => ({ x: p.x * s.width, y: p.y * s.height })) as Quad;

/** A square centred on the screen at 96 CSS pixels per inch, as large as fits up to 10 inches. */
export function defaultCalibration(surface: Surface): Calibration {
  const fit = Math.floor((0.8 * Math.min(surface.width, surface.height)) / UNCALIBRATED_PX_PER_INCH);
  const inches = Math.max(1, Math.min(10, fit));
  const halfW = (inches * UNCALIBRATED_PX_PER_INCH) / 2 / surface.width;
  const halfH = (inches * UNCALIBRATED_PX_PER_INCH) / 2 / surface.height;
  const [l, r, t, b] = [0.5 - halfW, 0.5 + halfW, 0.5 - halfH, 0.5 + halfH].map((v) => Math.min(1, Math.max(0, v))) as [
    number,
    number,
    number,
    number,
  ];
  return {
    widthIn: inches,
    heightIn: inches,
    corners: [
      { x: l, y: t },
      { x: r, y: t },
      { x: r, y: b },
      { x: l, y: b },
    ],
  };
}

/** Move one corner to a point given in fractions of the screen. Off-screen points are clamped; a move that would fold the quad is refused. */
export function moveCorner(cal: Calibration, index: number, to: Point): Calibration {
  if (!(index >= 0 && index < 4)) return cal;
  const corners = cal.corners.map((p, i) => (i === index ? { x: clamp01(to.x), y: clamp01(to.y) } : p)) as Quad;
  return isConvex(corners) ? { ...cal, corners } : cal;
}

/** Nudge one corner by whole device pixels, for fine adjustment with the arrow keys. */
export function nudgeCorner(cal: Calibration, index: number, dx: number, dy: number, surface: Surface): Calibration {
  const p = cal.corners[index];
  if (!p) return cal;
  return moveCorner(cal, index, { x: p.x + dx / (surface.width * surface.scale), y: p.y + dy / (surface.height * surface.scale) });
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v)) + 0;

/** The map from table inches (origin at the rectangle's top-left corner) to the screen, in CSS pixels. */
export function tableToScreen(cal: Calibration, surface: Surface): Matrix {
  return rectToQuad(cal.widthIn, cal.heightIn, toPixels(cal.corners, surface));
}

/** How the table layer is drawn: a canvas covering `box` (in inches) at `pxPerInch`, warped onto the screen by `transform`. */
export type Layer = {
  box: { x: number; y: number; width: number; height: number };
  pxPerInch: number;
  /** Maps the layer canvas's own pixels to screen CSS pixels; apply it with `cssMatrix3d`. */
  transform: Matrix;
};

const MAX_LAYER_PX = 4096;
const MARGIN_IN = 48;

/** Lay out the table layer so it covers the whole screen, sharp enough for the screen's pixels and no larger than a canvas allows. */
/** Where the table screen's corners land on the table, in inches; null if one falls beyond the horizon (the screen then shows table without end). */
export function screenOutline(cal: Calibration, surface: Surface): Quad | null {
  const m = tableToScreen(cal, surface);
  const inv = invert(m);
  const corners = [
    { x: 0, y: 0 },
    { x: surface.width, y: 0 },
    { x: surface.width, y: surface.height },
    { x: 0, y: surface.height },
  ].map((p) => apply(inv, p));
  return corners.every((p) => depth(m, p) > 0 && Number.isFinite(p.x) && Number.isFinite(p.y)) ? (corners as Quad) : null;
}

export function layerFor(cal: Calibration, surface: Surface): Layer {
  const m = tableToScreen(cal, surface);
  const { widthIn: w, heightIn: h } = cal;
  // Cover the whole screen; if it shows table without end, use a fixed margin.
  const outline = screenOutline(cal, surface);
  const xs = outline ? outline.map((p) => p.x) : [-MARGIN_IN, w + MARGIN_IN];
  const ys = outline ? outline.map((p) => p.y) : [-MARGIN_IN, h + MARGIN_IN];
  const x0 = Math.floor(Math.max(-MAX_INCHES, Math.min(...xs)));
  const y0 = Math.floor(Math.max(-MAX_INCHES, Math.min(...ys)));
  const x1 = Math.ceil(Math.min(w + MAX_INCHES, Math.max(...xs)));
  const y1 = Math.ceil(Math.min(h + MAX_INCHES, Math.max(...ys)));
  const box = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };

  // Screen device pixels per inch at the rectangle's centre, so the layer is about as sharp as the screen there.
  const c = apply(m, { x: w / 2, y: h / 2 });
  const dx = apply(m, { x: w / 2 + 1, y: h / 2 });
  const dy = apply(m, { x: w / 2, y: h / 2 + 1 });
  const local = Math.max(Math.hypot(dx.x - c.x, dx.y - c.y), Math.hypot(dy.x - c.x, dy.y - c.y)) * surface.scale;
  const pxPerInch = Math.max(1, Math.min(local, MAX_LAYER_PX / box.width, MAX_LAYER_PX / box.height));

  const layerToTable: Matrix = [1 / pxPerInch, 0, box.x, 0, 1 / pxPerInch, box.y, 0, 0, 1];
  return { box, pxPerInch, transform: multiply(m, layerToTable) };
}
