// Test-only concept (D-041): nothing in the app uses this until the generator's design phase.
// Wall and object detection, first concept: find the firm dark lines and shapes on a map image and turn them into
// wall segments and solid objects in inches, the annotation map annotation will need (D-037 item 5). Generated maps
// carry the true answer, so tests score what is found against it. Pure: plain RGBA arrays.
import type { Point } from "./homography.ts";
import type { Pixels } from "./map.ts";
import { segDist, simplify, type Segment } from "./mapgen.ts";

/** Closed doors are found as their own list; light and sight treat them as walls. */
export type Found = { walls: Segment[]; doors: Segment[]; things: { at: Point; r: number }[] };

/** Darker than this (0–255 luminance) is ink: a wall or an object. */
const DARK = 100;
/** Lines thinner than twice this (inches) are pencil detail, not walls. */
const THIN_IN = 0.06;
/** Ink this far (inches) from paper is inside an object; walls are thinner. */
const CORE_IN = 0.17;
/** An object wider than 2 squares (this radius, inches) is solid rock; its edge is a wall. */
const MASS_IN = 1;

export function detect(px: Pixels, ppi: number): Found {
  const { width, height } = px;
  const n = width * height;
  const ink = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const lum = 0.3 * (px.data[i * 4] as number) + 0.59 * (px.data[i * 4 + 1] as number) + 0.11 * (px.data[i * 4 + 2] as number);
    ink[i] = lum < DARK ? 1 : 0;
  }
  // Opening: drop thin pencil lines, keep firm ink.
  const toPaper = distanceTo(ink, width, height, 0);
  const thin = THIN_IN * ppi;
  const firm = within(toPaper, (d) => d > thin, thin + 1, width, height);
  for (let i = 0; i < n; i++) firm[i] = firm[i] && ink[i] ? 1 : 0;

  // Objects: ink thicker than any wall, grown back to its full size.
  const core = new Uint8Array(n);
  for (let i = 0; i < n; i++) core[i] = firm[i] && (toPaper[i] as number) > CORE_IN * ppi ? 1 : 0;
  const solid = within(core, (v) => v > 0, CORE_IN * ppi + 1, width, height);
  for (let i = 0; i < n; i++) solid[i] = solid[i] && firm[i] ? 1 : 0;

  const things: Found["things"] = [];
  const wall = new Uint8Array(n);
  for (let i = 0; i < n; i++) wall[i] = firm[i] && !solid[i] ? 1 : 0;
  for (const blob of components(solid, width, height)) {
    const r = Math.sqrt(blob.length / Math.PI) / ppi;
    if (r <= MASS_IN) {
      let sx = 0;
      let sy = 0;
      for (const i of blob) {
        sx += i % width;
        sy += Math.floor(i / width);
      }
      things.push({ at: { x: (sx / blob.length + 0.5) / ppi, y: (sy / blob.length + 0.5) / ppi }, r });
      continue;
    }
    // Solid rock: its edge against the floor is the wall. The image border isn't.
    for (const i of blob) {
      const x = i % width;
      const y = (i - x) / width;
      const edge =
        (x > 0 && !solid[i - 1]) ||
        (x < width - 1 && !solid[i + 1]) ||
        (y > 0 && !solid[i - width]) ||
        (y < height - 1 && !solid[i + width]);
      if (edge) wall[i] = 1;
    }
  }
  thinLines(wall, width, height);
  const walls = trace(wall, width, height).flatMap((line) => {
    const inches = line.map((i) => ({ x: ((i % width) + 0.5) / ppi, y: (Math.floor(i / width) + 0.5) / ppi }));
    const ps = simplify(inches, 0.07);
    const length = ps.slice(1).reduce((s, p, k) => s + Math.hypot(p.x - (ps[k] as Point).x, p.y - (ps[k] as Point).y), 0);
    return length < 0.25 ? [] : ps.slice(1).map((b, k) => ({ a: ps[k] as Point, b }));
  });
  return { walls, doors: findDoors(walls, ink, firm, width, height, ppi), things };
}

/** Closed doors: mapdraw.ts draws one as a pencil rectangle across a gap in a wall, so look from each wall end or
 * junction for a wall 0.6–1.5 inches away with thin (not firm) ink along both sides of the line between, paper down
 * its middle and paper beyond it. An open door is drawn swung out of its gap, so the gap stays open. */
function findDoors(walls: readonly Segment[], ink: Uint8Array, firm: Uint8Array, width: number, height: number, ppi: number): Segment[] {
  const key = (p: Point) => `${Math.round(p.x * ppi)},${Math.round(p.y * ppi)}`;
  const ends = [...new Map(walls.flatMap((w) => [w.a, w.b]).map((p) => [key(p), p])).values()];
  const pixel = (p: Point) => {
    const x = Math.floor(p.x * ppi);
    const y = Math.floor(p.y * ppi);
    return x >= 0 && y >= 0 && x < width && y < height ? y * width + x : -1;
  };
  const paper = (p: Point) => {
    const i = pixel(p);
    return i >= 0 && !ink[i];
  };
  const pencil = (p: Point) =>
    [-1, 0, 1].some((dy) =>
      [-1, 0, 1].some((dx) => {
        const i = pixel({ x: p.x + dx / ppi, y: p.y + dy / ppi });
        return i >= 0 && ink[i] === 1;
      }),
    );
  /** How well a door from a to b fits the drawing, 0 to 1. */
  const fit = (a: Point, b: Point) => {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const [ux, uy] = [(b.x - a.x) / d, (b.y - a.y) / d];
    const along = (t: number, off: number) => ({ x: a.x + ux * d * t - uy * off, y: a.y + uy * d * t + ux * off });
    const share = (test: (t: number) => boolean) => {
      let n = 0;
      for (let k = 2; k <= 8; k++) if (test(k / 10)) n++;
      return n / 7;
    };
    const sides = Math.min(
      share((t) => pencil(along(t, 0.13))),
      share((t) => pencil(along(t, -0.13))),
    );
    const middle = share((t) => paper(along(t, 0)));
    const beyond = Math.min(
      share((t) => paper(along(t, 0.32))),
      share((t) => paper(along(t, -0.32))),
    );
    return sides >= 0.7 && middle >= 0.8 && beyond >= 0.7 ? sides : 0;
  };
  const doors: Segment[] = [];
  for (const a of ends) {
    // Where to look: other wall ends and junctions (a wall straight on past the gap is parallel to the ray, so rays
    // miss it), and the first wall each of 72 rays meets.
    const targets = ends.filter((b) => b !== a);
    for (let k = 0; k < 72; k++) {
      const [dx, dy] = [Math.cos((k / 72) * Math.PI * 2), Math.sin((k / 72) * Math.PI * 2)];
      let t = Infinity;
      for (const w of walls) {
        const ex = w.b.x - w.a.x;
        const ey = w.b.y - w.a.y;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const ax = w.a.x - a.x;
        const ay = w.a.y - a.y;
        const s = (ax * ey - ay * ex) / den;
        const u = (ax * dy - ay * dx) / den;
        if (s > 0.3 && s < t && u >= 0 && u <= 1) t = s;
      }
      if (Number.isFinite(t)) targets.push({ x: a.x + dx * t, y: a.y + dy * t });
    }
    let best: { b: Point; score: number; d: number } | null = null;
    for (const b of targets) {
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < 0.6 || d > 1.5) continue;
      const score = fit(a, b);
      if (score > 0 && (!best || score > best.score || (score === best.score && d < best.d))) best = { b, score, d };
    }
    if (!best) continue;
    const mid = { x: (a.x + best.b.x) / 2, y: (a.y + best.b.y) / 2 };
    if (doors.every((o) => Math.hypot((o.a.x + o.b.x) / 2 - mid.x, (o.a.y + o.b.y) / 2 - mid.y) > 0.4)) doors.push({ a, b: best.b });
  }
  return doors;
}

/** Chamfer (3-4) distance in pixels from each pixel to the nearest pixel whose mask value is `target`. */
function distanceTo(mask: Uint8Array, width: number, height: number, target: number): Float32Array {
  const d = new Float32Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] === target ? 0 : 1e9;
  const big = 1e9;
  const get = (j: number) => d[j] ?? big;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const up =
        y > 0 ? Math.min(get(i - width) + 3, x > 0 ? get(i - width - 1) + 4 : big, x < width - 1 ? get(i - width + 1) + 4 : big) : big;
      d[i] = Math.min(get(i), x > 0 ? get(i - 1) + 3 : big, up);
    }
  for (let y = height - 1; y >= 0; y--)
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      const down =
        y < height - 1
          ? Math.min(get(i + width) + 3, x < width - 1 ? get(i + width + 1) + 4 : big, x > 0 ? get(i + width - 1) + 4 : big)
          : big;
      d[i] = Math.min(get(i), x < width - 1 ? get(i + 1) + 3 : big, down);
    }
  for (let i = 0; i < d.length; i++) d[i] = (d[i] as number) / 3;
  return d;
}

/** Pixels within `r` pixels of a pixel whose value passes `test`. */
function within(values: Float32Array | Uint8Array, test: (v: number) => boolean, r: number, width: number, height: number): Uint8Array {
  const set = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) set[i] = test(values[i] as number) ? 1 : 0;
  const d = distanceTo(set, width, height, 1);
  for (let i = 0; i < d.length; i++) set[i] = (d[i] as number) <= r ? 1 : 0;
  return set;
}

/** 8-connected groups of set pixels, as lists of pixel indices. */
function components(mask: Uint8Array, width: number, height: number): number[][] {
  const seen = new Uint8Array(mask.length);
  const out: number[][] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    const blob: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop() as number;
      blob.push(j);
      const x = j % width;
      const y = (j - x) / width;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const k = j + dy * width + dx;
          if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height && mask[k] && !seen[k]) {
            seen[k] = 1;
            stack.push(k);
          }
        }
    }
    out.push(blob);
  }
  return out;
}

/** The 8 neighbours of pixel `i` that lie on the image, clockwise from the top. */
function around(i: number, width: number, height: number): number[] {
  const x = i % width;
  const y = (i - x) / width;
  const out: number[] = [];
  for (const [dx, dy] of [
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
  ] as const)
    if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) out.push(i + dy * width + dx);
  return out;
}

/** Zhang–Suen thinning, in place: thick lines become one pixel wide along their middle. */
function thinLines(m: Uint8Array, width: number, height: number) {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < width && y < height ? (m[y * width + x] as number) : 0);
  let live: number[] = [];
  for (let i = 0; i < m.length; i++) if (m[i]) live.push(i);
  const p = new Array<number>(8);
  for (let changed = true; changed;) {
    changed = false;
    for (const pass of [0, 1]) {
      const drop: number[] = [];
      for (const i of live) {
        const x = i % width;
        const y = (i - x) / width;
        [p[0], p[1], p[2], p[3]] = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1)];
        [p[4], p[5], p[6], p[7]] = [at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
        let b = 0;
        let a = 0;
        for (let k = 0; k < 8; k++) {
          b += p[k] as number;
          if (!p[k] && p[(k + 1) % 8]) a++;
        }
        if (b < 2 || b > 6 || a !== 1) continue;
        const [p2, , p4, , p6, , p8] = p as [number, number, number, number, number, number, number, number];
        if (pass === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
        drop.push(i);
      }
      for (const i of drop) m[i] = 0;
      if (drop.length) {
        changed = true;
        live = live.filter((i) => m[i]);
      }
    }
  }
}

/** Follow one-pixel lines from end to end (or junction to junction, or round a loop), as lists of pixel indices. */
function trace(m: Uint8Array, width: number, height: number): number[][] {
  const next = (i: number) => around(i, width, height).filter((k) => m[k]);
  // A pixel is on a plain line when the ring of its 8 neighbours changes from empty to set exactly twice. Counting
  // neighbours instead would call every step of a slanted line a junction.
  const crossings = (i: number) => {
    const x = i % width;
    const y = (i - x) / width;
    const ring = [
      [0, -1],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
    ].map(([dx, dy]) => {
      const [u, v] = [x + (dx as number), y + (dy as number)];
      return u >= 0 && v >= 0 && u < width && v < height ? (m[v * width + u] as number) : 0;
    });
    let a = 0;
    for (let k = 0; k < 8; k++) if (!ring[k] && ring[(k + 1) % 8]) a++;
    return a;
  };
  const node = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) if (m[i]) node[i] = crossings(i) === 2 ? 0 : 1;
  const used = new Uint8Array(m.length);
  const touching = (a: number, b: number) =>
    Math.abs((a % width) - (b % width)) <= 1 && Math.abs(Math.floor(a / width) - Math.floor(b / width)) <= 1;
  const lines: number[][] = [];
  const walk = (from: number, step: number) => {
    const line = [from, step];
    let [prev, cur] = [from, step];
    while (!node[cur]) {
      used[cur] = 1;
      const ahead = next(cur).filter((k) => k !== prev && (node[k] || !used[k]));
      // Step away from where we came from, so a slanted line's corner pixels are cut, not followed.
      const go = ahead.find((k) => !touching(k, prev)) ?? ahead[0];
      if (go === undefined) break;
      line.push(go);
      [prev, cur] = [cur, go];
    }
    lines.push(line);
  };
  for (let i = 0; i < m.length; i++) if (m[i] && node[i]) for (const k of next(i)) if (!used[k] && !node[k]) walk(i, k);
  // Whatever is left is a closed loop.
  for (let i = 0; i < m.length; i++) if (m[i] && !used[i] && !node[i]) walk(i, next(i)[0] as number);
  return lines;
}

/** How much of the true walls was found (recall) and how much of what was found is a true wall (precision), by length. */
export function scoreWalls(truth: readonly Segment[], found: readonly Segment[], tol = 0.25): { recall: number; precision: number } {
  const share = (from: readonly Segment[], to: readonly Segment[]) => {
    // Each target's box, grown by the tolerance, rules most targets out before the exact distance.
    const boxes = to.map((t) => [
      Math.min(t.a.x, t.b.x) - tol,
      Math.min(t.a.y, t.b.y) - tol,
      Math.max(t.a.x, t.b.x) + tol,
      Math.max(t.a.y, t.b.y) + tol,
    ]);
    const near = (p: Point) =>
      to.some((t, i) => {
        const [x0, y0, x1, y1] = boxes[i] as number[];
        return (
          p.x >= (x0 as number) && p.x <= (x1 as number) && p.y >= (y0 as number) && p.y <= (y1 as number) && segDist(p, t.a, t.b) <= tol
        );
      });
    let hit = 0;
    let all = 0;
    for (const s of from) {
      const n = Math.max(1, Math.ceil(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / 0.1));
      for (let k = 0; k <= n; k++) {
        all++;
        if (near({ x: s.a.x + ((s.b.x - s.a.x) * k) / n, y: s.a.y + ((s.b.y - s.a.y) * k) / n })) hit++;
      }
    }
    return all ? hit / all : 1;
  };
  return { recall: share(truth, found), precision: share(found, truth) };
}

/** How many true objects were found within `tol` inches of their centre, and how many found objects are real. */
export function scoreThings(
  truth: readonly { at: Point }[],
  found: readonly { at: Point }[],
  tol = 0.3,
): { recall: number; precision: number } {
  const near = (a: { at: Point }, b: { at: Point }) => Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y) <= tol;
  return {
    recall: truth.length ? truth.filter((t) => found.some((f) => near(t, f))).length / truth.length : 1,
    precision: found.length ? found.filter((f) => truth.some((t) => near(t, f))).length / found.length : 1,
  };
}
