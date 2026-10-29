// Draws a generated map (mapgen.ts) as pencil on paper (D-011): firm dark walls and objects, light pencil for grid,
// hatching, water, road and canopies. Also shades a drawn map with a light map (light.ts). Pure: plain RGBA arrays.
import type { Point } from "./homography.ts";
import type { Pixels } from "./map.ts";
import { floorAt, segDist, type GenMap, type Thing } from "./mapgen.ts";
import { rng } from "./rng.ts";

/** Grey levels. Everything darker than DARK is a wall or an object; the detector relies on it (detect.ts). */
const INK = 28;
const FILL = 62;
const PENCIL = 160;
const GRID = 212;
const PAPER = 244;
const ROCK_PAPER = 234;
const WALL_IN = 0.2;

/** "hatch" draws rock as pencil hatching; "solid" fills it black, as many printed maps do. */
export type DrawStyle = "hatch" | "solid";

export function drawMap(m: GenMap, ppi: number, style: DrawStyle = "hatch"): Pixels {
  const width = Math.round(m.width * ppi);
  const height = Math.round(m.height * ppi);
  const g = new Uint8Array(width * height);
  const r = rng(m.seed ^ 0x5eed);
  const hatch = Math.max(3, Math.round(0.22 * ppi));
  // Rock is hatched in a band along the floor, in 1-inch patches that each lean their own way, as drawn by hand.
  const q = 0.25;
  const qc = Math.ceil(m.width / q);
  const qr = Math.ceil(m.height / q);
  const open = Array.from({ length: qc * qr }, (_, i) => floorAt(m.ground, { x: ((i % qc) + 0.5) * q, y: (Math.floor(i / qc) + 0.5) * q }));
  const reach = Array.from({ length: qc * qr }, () => r.range(0.5, 0.9) / q);
  const band = new Uint8Array(qc * qr);
  for (let i = 0; i < band.length; i++) {
    const [c, y] = [i % qc, Math.floor(i / qc)];
    const n = Math.ceil(reach[i] as number);
    for (let dy = -n; dy <= n && !band[i]; dy++)
      for (let dx = -n; dx <= n; dx++)
        if (
          c + dx >= 0 &&
          c + dx < qc &&
          y + dy >= 0 &&
          y + dy < qr &&
          open[(y + dy) * qc + c + dx] &&
          Math.hypot(dx, dy) <= (reach[i] as number)
        ) {
          band[i] = 1;
          break;
        }
  }
  const pc = Math.ceil(m.width);
  const lean = Array.from({ length: pc * Math.ceil(m.height) }, () => r.int(0, 3));
  const stripe = (x: number, y: number, k: number) => [x, x + y, y, x - y + 100000][k] as number;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = { x: (x + 0.5) / ppi, y: (y + 0.5) / ppi };
      const noise = r.int(-5, 5);
      let v: number;
      if (floorAt(m.ground, p)) v = x % ppi < 1 || y % ppi < 1 ? GRID : PAPER + noise;
      else if (style === "solid") v = INK + 10 + noise;
      else if (!band[Math.floor(p.y / q) * qc + Math.floor(p.x / q)]) v = ROCK_PAPER + noise;
      else v = stripe(x, y, lean[Math.floor(p.y) * pc + Math.floor(p.x)] as number) % hatch < 1 ? PENCIL + noise : ROCK_PAPER + noise;
      g[y * width + x] = v;
    }

  const px = (p: Point) => ({ x: p.x * ppi, y: p.y * ppi });
  /** Set every pixel whose centre passes `inside`, within a bounding box in pixels. */
  const paint = (x0: number, y0: number, x1: number, y1: number, inside: (p: Point) => boolean, v: number | (() => number)) => {
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(height - 1, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(width - 1, Math.ceil(x1)); x++)
        if (inside({ x: x + 0.5, y: y + 0.5 })) g[y * width + x] = typeof v === "number" ? v : v();
  };
  const line = (a: Point, b: Point, w: number, v: number) => {
    const [p, q] = [px(a), px(b)];
    const half = Math.max(0.5, (w * ppi) / 2);
    paint(
      Math.min(p.x, q.x) - half,
      Math.min(p.y, q.y) - half,
      Math.max(p.x, q.x) + half,
      Math.max(p.y, q.y) + half,
      (c) => segDist(c, p, q) <= half,
      v,
    );
  };
  const disc = (at: Point, rad: number, v: number) => {
    const c = px(at);
    const rp = rad * ppi;
    paint(c.x - rp, c.y - rp, c.x + rp, c.y + rp, (q) => Math.hypot(q.x - c.x, q.y - c.y) <= rp, v);
  };
  const polygon = (points: readonly Point[], v: number | (() => number)) => {
    const ps = points.map(px);
    const xs = ps.map((p) => p.x);
    const ys = ps.map((p) => p.y);
    paint(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (c) => insidePolygon(c, ps), v);
  };
  const outline = (points: readonly Point[], w: number, v: number) =>
    points.forEach((p, i) => line(p, points[(i + 1) % points.length] as Point, w, v));

  for (const a of m.areas) {
    if (a.kind === "water") {
      const rows = 0.3 * ppi;
      const ps = a.outline.map(px);
      const ys = ps.map((p) => p.y);
      const xs = ps.map((p) => p.x);
      paint(
        Math.min(...xs),
        Math.min(...ys),
        Math.max(...xs),
        Math.max(...ys),
        (c) => insidePolygon(c, ps),
        () => PAPER - 14,
      );
      paint(
        Math.min(...xs),
        Math.min(...ys),
        Math.max(...xs),
        Math.max(...ys),
        (c) => insidePolygon(c, ps) && Math.abs(((c.y + Math.sin(c.x / (0.4 * ppi)) * 0.08 * ppi) % rows) - rows / 2) < 0.6,
        PENCIL + 10,
      );
      outline(a.outline, 0.03, PENCIL - 25);
    } else if (a.kind === "road") {
      polygon(a.outline, () => (r.chance(0.06) ? PENCIL + 20 : PAPER - 6));
      const half = a.outline.length / 2;
      for (const edge of [a.outline.slice(0, half), a.outline.slice(half)])
        edge.slice(1).forEach((p, i) => {
          if (i % 2 === 0) line(edge[i] as Point, p, 0.03, PENCIL - 15);
        });
    } else if (m.terrain === "ruins") {
      // Floorboards inside a ruined building.
      const [lt, , rb] = a.outline as [Point, Point, Point, Point];
      for (let y = lt.y + 0.5; y < rb.y; y += 0.5) line({ x: lt.x, y }, { x: rb.x, y }, 0.02, GRID - 8);
    }
  }
  if (m.terrain === "ruins")
    // Grass ticks on open ground.
    for (let i = 0; i < m.width * m.height * 1.5; i++) {
      const at = { x: r.range(0, m.width), y: r.range(0, m.height) };
      if (m.areas.some((a) => insidePolygon(at, a.outline))) continue;
      line(at, { x: at.x - 0.06, y: at.y - 0.12 }, 0.02, PENCIL + 5);
      line(at, { x: at.x + 0.06, y: at.y - 0.12 }, 0.02, PENCIL + 5);
    }

  for (const t of m.things) if (t.canopy) drawCanopy(t, paint, ppi, r.range(0, 6));
  for (const w of m.walls) line(w.a, w.b, WALL_IN, INK);
  for (const d of m.doors) {
    const dx = d.b.x - d.a.x;
    const dy = d.b.y - d.a.y;
    const len = Math.hypot(dx, dy);
    // An open door is drawn swung most of the way open from its hinge at `a`.
    const turn = d.open ? 1.2 : 0;
    const [ux, uy] = [(dx * Math.cos(turn) - dy * Math.sin(turn)) / len, (dx * Math.sin(turn) + dy * Math.cos(turn)) / len];
    const [nx, ny] = [-uy * 0.13, ux * 0.13];
    const start = { x: d.a.x + ux * 0.06, y: d.a.y + uy * 0.06 };
    const end = { x: d.a.x + ux * (len - 0.06), y: d.a.y + uy * (len - 0.06) };
    const box = [
      { x: start.x + nx, y: start.y + ny },
      { x: end.x + nx, y: end.y + ny },
      { x: end.x - nx, y: end.y - ny },
      { x: start.x - nx, y: start.y - ny },
    ];
    polygon(box, PAPER - 4);
    outline(box, 0.04, INK + 20);
  }
  for (const t of m.things) {
    if (t.kind === "pillar" || t.kind === "tree") disc(t.at, t.r, INK + 10);
    else if (t.kind === "statue") {
      disc(t.at, t.r, INK);
      disc(t.at, t.r * 0.55, FILL + 10);
    } else if (t.kind === "crate") {
      const s = t.r * 0.85;
      const box = [
        { x: t.at.x - s, y: t.at.y - s },
        { x: t.at.x + s, y: t.at.y - s },
        { x: t.at.x + s, y: t.at.y + s },
        { x: t.at.x - s, y: t.at.y + s },
      ];
      polygon(box, FILL);
      outline(box, 0.04, INK);
    } else {
      const n = 9;
      const shape = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const d = t.r * r.range(0.85, 1.05);
        return { x: t.at.x + Math.cos(a) * d, y: t.at.y + Math.sin(a) * d };
      });
      polygon(shape, FILL);
      outline(shape, 0.04, INK);
    }
  }
  // Campfires: a ring of pebbles small enough to be pencil, not objects.
  for (const l of m.lights)
    if (l.kind === "campfire")
      for (let i = 0; i < 8; i++) disc({ x: l.at.x + Math.cos(i * 0.785) * 0.28, y: l.at.y + Math.sin(i * 0.785) * 0.28 }, 0.05, FILL + 30);
  return toPixels(g, width, height);
}

function drawCanopy(
  t: Thing,
  paint: (x0: number, y0: number, x1: number, y1: number, inside: (p: Point) => boolean, v: number) => void,
  ppi: number,
  phase: number,
) {
  const c = { x: t.at.x * ppi, y: t.at.y * ppi };
  const big = (t.canopy as number) * ppi;
  const edge = (q: Point) => {
    const a = Math.atan2(q.y - c.y, q.x - c.x);
    return big * (1 + 0.07 * Math.sin(9 * a + phase));
  };
  paint(
    c.x - big * 1.1,
    c.y - big * 1.1,
    c.x + big * 1.1,
    c.y + big * 1.1,
    (q) => Math.abs(Math.hypot(q.x - c.x, q.y - c.y) - edge(q)) < 0.7,
    PENCIL - 20,
  );
}

function insidePolygon(p: Point, ps: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const a = ps[i] as Point;
    const b = ps[j] as Point;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Grey to a warm paper tone. */
function toPixels(g: Uint8Array, width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < g.length; i++) {
    const v = g[i] as number;
    data[i * 4] = v + 4;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v - 10;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** Shade a drawn map at night: `level` per pixel is 1 in bright light, 0.5 in dim light and 0 in darkness. */
export function shade(base: Pixels, level: Float32Array): Pixels {
  const data = new Uint8ClampedArray(base.data.length);
  for (let i = 0; i < level.length; i++) {
    const l = level[i] as number;
    const k = 0.16 + 0.84 * l;
    data[i * 4] = (base.data[i * 4] as number) * k;
    data[i * 4 + 1] = (base.data[i * 4 + 1] as number) * k * (1 - 0.06 * l);
    data[i * 4 + 2] = (base.data[i * 4 + 2] as number) * k * (1 - 0.2 * l);
    data[i * 4 + 3] = 255;
  }
  return { width: base.width, height: base.height, data };
}
