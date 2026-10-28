// Projective maps (homographies) for the corner-pin warp (D-004). A 3×3 matrix, row-major, maps a point
// (x, y) to ((a x + b y + c) / w, (d x + e y + f) / w) with w = g x + h y + i.

export type Point = { x: number; y: number };
export type Matrix = [number, number, number, number, number, number, number, number, number];
/** Four corners in order: top left, top right, bottom right, bottom left. */
export type Quad = [Point, Point, Point, Point];

export function apply(m: Matrix, p: Point): Point {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w };
}

/** The w term of `apply`. Points with w ≤ 0 are beyond the horizon and have no place on the screen. */
export function depth(m: Matrix, p: Point): number {
  return m[6] * p.x + m[7] * p.y + m[8];
}

export function multiply(a: Matrix, b: Matrix): Matrix {
  const r = new Array<number>(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!;
  return r as Matrix;
}

export function invert(m: Matrix): Matrix {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const k = 1 / det;
  return [
    A * k,
    (c * h - b * i) * k,
    (b * f - c * e) * k,
    B * k,
    (a * i - c * g) * k,
    (c * d - a * f) * k,
    C * k,
    (b * g - a * h) * k,
    (a * e - b * d) * k,
  ];
}

/** The map that sends the corners of a w × h rectangle at the origin to the quad (Heckbert's square-to-quad). */
export function rectToQuad(w: number, h: number, q: Quad): Matrix {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h2 = (dx1 * dy3 - dx3 * dy1) / den;
  const unitToQuad: Matrix = [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h2 * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h2 * p3.y,
    p0.y,
    g,
    h2,
    1,
  ];
  return multiply(unitToQuad, [1 / w, 0, 0, 0, 1 / h, 0, 0, 0, 1]);
}

/** True when the quad's corners turn the same way at every corner, so the warp is well defined inside it. */
export function isConvex(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % 4]!;
    const c = q[(i + 2) % 4]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (!(Math.abs(cross) > 1e-9)) return false;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

/** The 16 numbers of a CSS `matrix3d()` that applies this map to an element with `transform-origin: 0 0`. */
export function cssMatrix3d(m: Matrix): number[] {
  return [m[0], m[3], 0, m[6], m[1], m[4], 0, m[7], 0, 0, 1, 0, m[2], m[5], 0, m[8]];
}
