// Test-only concept (D-041): nothing in the app uses this until the generator's design phase.
// Map generator, first concept (PLAN.md "Generator", D-037 item 5): seeded maps for random encounters, with the same
// annotation that map annotation will trace on imported maps: rooms and areas, walls, doors, materials, objects and
// lights. Everything is in inches, 1 square = 1 inch (D-005). Pure and seeded (GAME-01), so tests can generate a map,
// draw it, and check what the wall detector finds against what the generator put there.
import type { Point } from "./homography.ts";
import { rng, type Rng } from "./rng.ts";

export const TERRAINS = ["dungeon", "cave", "ruins", "town"] as const;
export type Terrain = (typeof TERRAINS)[number];
type Material = "stone" | "wood" | "earth" | "water";

export type Segment = { a: Point; b: Point };
export type Wall = Segment & { material: Material };
/** A door across a gap in a wall. A closed door blocks light; an open one, or a broken one, doesn't. */
export type Door = Segment & { open: boolean };
type ThingKind = "pillar" | "statue" | "crate" | "boulder" | "stalagmite" | "rubble" | "tree" | "well";
/** A solid object: a disc of radius `r` inches. Trees also have a canopy, drawn but not blocking. */
export type Thing = { kind: ThingKind; at: Point; r: number; blocksLight: boolean; canopy?: number };
/** Bright light to `brightFt`, then dim light for `dimFt` more (feet, counted on the map's scale). */
export type Light = { kind: "torch" | "campfire" | "fungus" | "lantern" | "hearth"; at: Point; brightFt: number; dimFt: number };
type Area = { kind: "room" | "water" | "road"; outline: Point[]; material: Material };
/** Solid rock (0) or open floor (1), sampled at cell centres. A smooth ground is read between samples (caves). */
export type Ground = { cell: number; cols: number; rows: number; smooth: boolean; v: number[] };

export type GenMap = {
  version: 1;
  terrain: Terrain;
  seed: number;
  width: number;
  height: number;
  feetPerSquare: 5;
  ground: Ground;
  areas: Area[];
  walls: Wall[];
  doors: Door[];
  things: Thing[];
  lights: Light[];
};

const TORCH = { brightFt: 20, dimFt: 20 };

/** A map of `width` × `height` inches (whole numbers). The default fits Morgan's 42 × 24 inch board. */
export function generate(terrain: Terrain, seed: number, width = 36, height = 24): GenMap {
  const r = rng(seed);
  const base = { version: 1 as const, terrain, seed, width, height, feetPerSquare: 5 as const };
  // How many rooms, trees and rocks, compared with a 36 × 24 map.
  const many = (n: number) => Math.max(1, Math.round((n * width * height) / (36 * 24)));
  if (terrain === "dungeon") return { ...base, ...dungeon(r, width, height, many) };
  if (terrain === "cave") return { ...base, ...cave(r, width, height, many) };
  if (terrain === "town") return { ...base, ...town(r, width, height, many) };
  return { ...base, ...ruins(r, width, height, many) };
}

type Many = (n: number) => number;

type Body = Omit<GenMap, "version" | "terrain" | "seed" | "width" | "height" | "feetPerSquare">;

/** Whether the ground at `p` (inches) is open floor. */
export function floorAt(g: Ground, p: Point): boolean {
  const at = (c: number, r: number) => g.v[Math.min(g.rows - 1, Math.max(0, r)) * g.cols + Math.min(g.cols - 1, Math.max(0, c))] ?? 0;
  if (!g.smooth) return at(Math.floor(p.x / g.cell), Math.floor(p.y / g.cell)) >= 0.5;
  const u = p.x / g.cell - 0.5;
  const v = p.y / g.cell - 0.5;
  const c = Math.floor(u);
  const r = Math.floor(v);
  const fu = u - c;
  const fv = v - r;
  const top = at(c, r) * (1 - fu) + at(c + 1, r) * fu;
  const bottom = at(c, r + 1) * (1 - fu) + at(c + 1, r + 1) * fu;
  return top * (1 - fv) + bottom * fv >= 0.5;
}

/** Distance from `p` to the segment a–b. */
export function segDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/** Douglas–Peucker: drop points closer than `tol` to the line their neighbours make. */
export function simplify(line: readonly Point[], tol: number): Point[] {
  if (line.length < 3) return [...line];
  const first = line[0] as Point;
  const last = line[line.length - 1] as Point;
  let worst = 0;
  let at = 0;
  for (let i = 1; i < line.length - 1; i++) {
    const d = segDist(line[i] as Point, first, last);
    if (d > worst) [worst, at] = [d, i];
  }
  if (worst <= tol) return [first, last];
  return [...simplify(line.slice(0, at + 1), tol).slice(0, -1), ...simplify(line.slice(at), tol)];
}

const toSegments = (line: readonly Point[], material: Material): Wall[] =>
  line.slice(1).map((b, i) => ({ a: line[i] as Point, b, material }));

const clearOf = (p: Point, r: number, things: readonly Thing[], gap: number) =>
  things.every((t) => Math.hypot(t.at.x - p.x, t.at.y - p.y) >= t.r + r + gap);

/** Walls along every cell edge with floor on one side only, merged into long straight runs. */
function cellWalls(open: (c: number, r: number) => boolean, cols: number, rows: number): Wall[] {
  const walls: Wall[] = [];
  const run = (edge: (i: number) => boolean, n: number, seg: (i0: number, i1: number) => Segment) => {
    let start = -1;
    for (let i = 0; i <= n; i++) {
      const on = i < n && edge(i);
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        walls.push({ ...seg(start, i), material: "stone" });
        start = -1;
      }
    }
  };
  for (let y = 0; y <= rows; y++)
    run(
      (x) => open(x, y - 1) !== open(x, y),
      cols,
      (x0, x1) => ({ a: { x: x0, y }, b: { x: x1, y } }),
    );
  for (let x = 0; x <= cols; x++)
    run(
      (y) => open(x - 1, y) !== open(x, y),
      rows,
      (y0, y1) => ({ a: { x, y: y0 }, b: { x, y: y1 } }),
    );
  return walls;
}

/** Walls along a straight line from `from` to `to`, cut into one-inch units; units where `keep` is false are gaps. */
function wallRun(from: Point, to: Point, keep: readonly boolean[], material: Material): Wall[] {
  const n = keep.length;
  const p = (t: number) => ({ x: from.x + ((to.x - from.x) * t) / n, y: from.y + ((to.y - from.y) * t) / n });
  const walls: Wall[] = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && keep[i] && start < 0) start = i;
    if ((i === n || !keep[i]) && start >= 0) {
      walls.push({ a: p(start), b: p(i), material });
      start = -1;
    }
  }
  return walls;
}

/** The door across unit `i` of the line from `from` to `to`, `n` units long. */
const doorAt = (from: Point, to: Point, n: number, i: number, open: boolean): Door => {
  const p = (t: number) => ({ x: from.x + ((to.x - from.x) * t) / n, y: from.y + ((to.y - from.y) * t) / n });
  return { a: p(i), b: p(i + 1), open };
};

type Rect = { x: number; y: number; w: number; h: number };
const outline = (b: Rect): Point[] => [
  { x: b.x, y: b.y },
  { x: b.x + b.w, y: b.y },
  { x: b.x + b.w, y: b.y + b.h },
  { x: b.x, y: b.y + b.h },
];
const overlaps = (a: Rect, b: Rect, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

// Dungeon: rectangular rooms joined by corridors one or two squares wide, with doors where a narrow corridor meets a room.
function dungeon(r: Rng, cols: number, rows: number, many: Many): Body {
  const v: number[] = new Array(cols * rows).fill(0);
  const open = (c: number, y: number) => c >= 0 && y >= 0 && c < cols && y < rows && v[y * cols + c] === 1;
  const dig = (c: number, y: number) => {
    if (c >= 1 && y >= 1 && c < cols - 1 && y < rows - 1) v[y * cols + c] = 1;
  };
  const rooms: Rect[] = [];
  for (let tries = 0; tries < 300 && rooms.length < many(8); tries++) {
    const w = r.int(4, 9);
    const h = r.int(4, 7);
    const room = { x: r.int(1, cols - w - 1), y: r.int(1, rows - h - 1), w, h };
    if (rooms.every((o) => !overlaps(room, o, 2))) rooms.push(room);
  }
  for (const b of rooms) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) dig(x, y);

  // Join the rooms with a minimum spanning tree on their centres, plus one extra corridor for a loop.
  const centre = (b: Rect) => ({ x: Math.floor(b.x + b.w / 2), y: Math.floor(b.y + b.h / 2) });
  const dist = (a: Rect, b: Rect) => Math.abs(centre(a).x - centre(b).x) + Math.abs(centre(a).y - centre(b).y);
  const links: [Rect, Rect][] = [];
  const joined = new Set([rooms[0] as Rect]);
  while (joined.size < rooms.length) {
    let best: [Rect, Rect] | null = null;
    for (const a of joined) for (const b of rooms) if (!joined.has(b) && (!best || dist(a, b) < dist(...best))) best = [a, b];
    if (!best) break;
    links.push(best);
    joined.add(best[1]);
  }
  if (rooms.length > 3) links.push([r.pick(rooms), r.pick(rooms)]);
  for (const [a, b] of links) {
    const p = centre(a);
    const q = centre(b);
    const wide = r.chance(0.25);
    const corner = r.chance(0.5) ? { x: q.x, y: p.y } : { x: p.x, y: q.y };
    for (const [s, t] of [
      [p, corner],
      [corner, q],
    ] as const) {
      const n = Math.abs(t.x - s.x) + Math.abs(t.y - s.y);
      for (let i = 0; i <= n; i++) {
        const x = s.x + Math.sign(t.x - s.x) * i;
        const y = s.y + Math.sign(t.y - s.y) * i;
        dig(x, y);
        if (wide) dig(x + 1, y + 1);
      }
    }
  }

  // Doors: a corridor exactly one square wide that meets a room's side.
  const doors: Door[] = [];
  const doorCells = new Set<string>();
  for (const b of rooms) {
    const sides = [
      { n: b.w, cell: (i: number) => [b.x + i, b.y - 1], in: [0, 1], edge: (i: number) => [b.x + i, b.y, b.x + i + 1, b.y] },
      { n: b.w, cell: (i: number) => [b.x + i, b.y + b.h], in: [0, -1], edge: (i: number) => [b.x + i, b.y + b.h, b.x + i + 1, b.y + b.h] },
      { n: b.h, cell: (i: number) => [b.x - 1, b.y + i], in: [1, 0], edge: (i: number) => [b.x, b.y + i, b.x, b.y + i + 1] },
      { n: b.h, cell: (i: number) => [b.x + b.w, b.y + i], in: [-1, 0], edge: (i: number) => [b.x + b.w, b.y + i, b.x + b.w, b.y + i + 1] },
    ];
    for (const s of sides)
      for (let i = 0; i < s.n; i++) {
        const [cx, cy] = s.cell(i) as [number, number];
        const [ix, iy] = s.in as [number, number];
        // Along the side, the corridor cell's neighbours must be rock: a one-square mouth.
        if (!open(cx, cy) || open(cx - iy, cy - ix) || open(cx + iy, cy + ix) || !r.chance(0.6)) continue;
        const [x0, y0, x1, y1] = s.edge(i) as [number, number, number, number];
        doors.push({ a: { x: x0, y: y0 }, b: { x: x1, y: y1 }, open: r.chance(0.3) });
        doorCells.add(`${cx + ix},${cy + iy}`);
      }
  }

  const things: Thing[] = [];
  const lights: Light[] = [];
  const nearDoor = (x: number, y: number) => [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => doorCells.has(`${x + dx},${y + dy}`)));
  for (const b of rooms) {
    if (b.w >= 6 && b.h >= 6 && r.chance(0.6))
      for (const [x, y] of [
        [b.x + 1.5, b.y + 1.5],
        [b.x + b.w - 1.5, b.y + 1.5],
        [b.x + 1.5, b.y + b.h - 1.5],
        [b.x + b.w - 1.5, b.y + b.h - 1.5],
      ] as const)
        things.push({ kind: "pillar", at: { x, y }, r: 0.35, blocksLight: true });
    else if (r.chance(0.3)) things.push({ kind: "statue", at: { x: b.x + b.w / 2, y: b.y + b.h / 2 }, r: 0.45, blocksLight: true });
    for (const [x, y] of [
      [b.x, b.y],
      [b.x + b.w - 1, b.y],
      [b.x, b.y + b.h - 1],
      [b.x + b.w - 1, b.y + b.h - 1],
    ] as const) {
      const at = { x: x + 0.5, y: y + 0.5 };
      if (r.chance(0.3) && !nearDoor(x, y) && clearOf(at, 0.33, things, 0.3))
        things.push({ kind: "crate", at, r: 0.33, blocksLight: true });
    }
    if (r.chance(0.65)) {
      const side = r.int(0, 3);
      const at = [
        { x: b.x + b.w / 2, y: b.y + 0.3 },
        { x: b.x + b.w / 2, y: b.y + b.h - 0.3 },
        { x: b.x + 0.3, y: b.y + b.h / 2 },
        { x: b.x + b.w - 0.3, y: b.y + b.h / 2 },
      ][side] as Point;
      lights.push({ kind: "torch", at, ...TORCH });
    }
  }
  return {
    ground: { cell: 1, cols, rows, smooth: false, v },
    areas: rooms.map((b) => ({ kind: "room", outline: outline(b), material: "stone" })),
    walls: cellWalls(open, cols, rows),
    doors,
    things,
    lights,
  };
}

// Cave: cellular automaton on half-inch cells, kept to its largest open region, smoothed, and traced with marching
// squares into slanted walls.
function cave(r: Rng, width: number, height: number, many: Many): Body {
  const cell = 0.5;
  const cols = width / cell;
  const rows = height / cell;
  const border = (c: number, y: number) => c < 2 || y < 2 || c >= cols - 2 || y >= rows - 2;
  let solid: boolean[] = [];
  for (let y = 0; y < rows; y++) for (let c = 0; c < cols; c++) solid.push(border(c, y) || r.chance(0.45));
  const isSolid = (s: boolean[], c: number, y: number) => c < 0 || y < 0 || c >= cols || y >= rows || (s[y * cols + c] as boolean);
  for (let step = 0; step < 5; step++)
    solid = solid.map((was, i) => {
      const c = i % cols;
      const y = (i - c) / cols;
      if (border(c, y)) return true;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && isSolid(solid, c + dx, y + dy)) n++;
      return n >= 5 ? true : n <= 3 ? false : was;
    });
  // Keep only the largest open region, so every part of the cave can be reached.
  const region = new Int32Array(cols * rows).fill(-1);
  let best = -1;
  let bestSize = 0;
  for (let i = 0; i < solid.length; i++) {
    if (solid[i] || region[i] !== -1) continue;
    const stack = [i];
    region[i] = i;
    let size = 0;
    while (stack.length) {
      const j = stack.pop() as number;
      size++;
      const c = j % cols;
      for (const k of [j - cols, j + cols, c > 0 ? j - 1 : -1, c < cols - 1 ? j + 1 : -1])
        if (k >= 0 && k < solid.length && !solid[k] && region[k] === -1) {
          region[k] = i;
          stack.push(k);
        }
    }
    if (size > bestSize) [best, bestSize] = [i, size];
  }
  const keep = solid.map((s, i) => !s && region[i] === best);
  // Smooth with a 3 × 3 average so the traced walls slant instead of stepping.
  const v = keep.map((_, i) => {
    const c = i % cols;
    const y = (i - c) / cols;
    if (border(c, y)) return 0;
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += keep[(y + dy) * cols + c + dx] ? 1 : 0;
    return sum / 9;
  });
  const ground: Ground = { cell, cols, rows, smooth: true, v };

  const walls = marchingWalls(ground);
  // Clear floor around `p` up to the traced walls, in inches, counted up to 3; 0 on rock. Walls are filed by the
  // squares they cross, so only the walls nearby are measured.
  const cap = 3;
  const filed = new Map<number, Wall[]>();
  for (const w of walls)
    for (let y = Math.floor(Math.min(w.a.y, w.b.y)); y <= Math.floor(Math.max(w.a.y, w.b.y)); y++)
      for (let x = Math.floor(Math.min(w.a.x, w.b.x)); x <= Math.floor(Math.max(w.a.x, w.b.x)); x++)
        filed.set(y * width + x, [...(filed.get(y * width + x) ?? []), w]);
  const room = (p: Point) => {
    if (!floorAt(ground, p)) return 0;
    let best = cap;
    for (let y = Math.floor(p.y) - cap; y <= Math.floor(p.y) + cap; y++)
      for (let x = Math.floor(p.x) - cap; x <= Math.floor(p.x) + cap; x++)
        for (const w of filed.get(y * width + x) ?? []) best = Math.min(best, segDist(p, w.a, w.b));
    return best;
  };
  const spot = () => ({ x: r.range(1, width - 1), y: r.range(1, height - 1) });

  const areas: Area[] = [];
  const things: Thing[] = [];
  // The pool, as a disc that keeps things out of the water.
  const pool: Thing[] = [];
  for (let tries = 0; tries < 200 && areas.length < 1; tries++) {
    const at = spot();
    const size = r.range(1, 1.6);
    if (room(at) < size + 1) continue;
    const points = Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2;
      const d = size * r.range(0.75, 1.1);
      return { x: at.x + Math.cos(a) * d, y: at.y + Math.sin(a) * d };
    });
    areas.push({ kind: "water", outline: points, material: "water" });
    pool.push({ kind: "rubble", at, r: size + 0.3, blocksLight: false });
  }
  const place = (n: number, kind: ThingKind, lo: number, hi: number) => {
    for (let tries = 0, made = 0; tries < 400 && made < n; tries++) {
      const at = spot();
      const size = r.range(lo, hi);
      if (room(at) >= size + 0.6 && clearOf(at, size, [...things, ...pool], 0.9)) {
        things.push({ kind, at, r: size, blocksLight: true });
        made++;
      }
    }
  };
  place(many(r.int(3, 5)), "boulder", 0.5, 0.75);
  place(many(r.int(8, 12)), "stalagmite", 0.25, 0.4);

  const lights: Light[] = [];
  let camp: Point | null = null;
  for (let tries = 0; tries < 300; tries++) {
    const at = spot();
    if (room(at) > 1 && clearOf(at, 0.5, [...things, ...pool], 1) && (!camp || room(at) > room(camp))) camp = at;
  }
  if (camp) lights.push({ kind: "campfire", at: camp, ...TORCH });
  for (let tries = 0, made = 0; tries < 400 && made < many(3); tries++) {
    const at = spot();
    if (room(at) > 0.4 && room(at) < 0.9 && clearOf(at, 0.2, things, 0.3)) {
      lights.push({ kind: "fungus", at, brightFt: 0, dimFt: 10 });
      made++;
    }
  }
  return { ground, areas, walls, doors: [], things, lights };
}

/** Trace the 0.5 level of a smooth ground with marching squares, chain the pieces into lines and simplify them. */
function marchingWalls(g: Ground): Wall[] {
  const val = (c: number, y: number) => g.v[y * g.cols + c] ?? 0;
  const pos = (c: number, y: number) => ({ x: (c + 0.5) * g.cell, y: (y + 0.5) * g.cell });
  const cross = (c0: number, y0: number, c1: number, y1: number): Point => {
    const a = val(c0, y0);
    const b = val(c1, y1);
    const t = (0.5 - a) / (b - a);
    const p = pos(c0, y0);
    const q = pos(c1, y1);
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
  };
  const pieces: [Point, Point][] = [];
  for (let y = 0; y < g.rows - 1; y++)
    for (let c = 0; c < g.cols - 1; c++) {
      const corners = [val(c, y), val(c + 1, y), val(c + 1, y + 1), val(c, y + 1)];
      const inside = corners.map((x) => x >= 0.5);
      // Edges: 0 top, 1 right, 2 bottom, 3 left; each crossing edge gets a point.
      const edges = [
        () => cross(c, y, c + 1, y),
        () => cross(c + 1, y, c + 1, y + 1),
        () => cross(c, y + 1, c + 1, y + 1),
        () => cross(c, y, c, y + 1),
      ];
      const crossing = [inside[0] !== inside[1], inside[1] !== inside[2], inside[2] !== inside[3], inside[3] !== inside[0]];
      const hit = [0, 1, 2, 3].filter((e) => crossing[e]);
      if (hit.length === 2) pieces.push([(edges[hit[0] as number] as () => Point)(), (edges[hit[1] as number] as () => Point)()]);
      else if (hit.length === 4) {
        // A saddle: the centre's average decides which corners join.
        const centreIn = corners.reduce((s, x) => s + x, 0) / 4 >= 0.5;
        const joinTopLeft = centreIn !== inside[0];
        const [e0, e1, e2, e3] = edges as [() => Point, () => Point, () => Point, () => Point];
        if (joinTopLeft) pieces.push([e3(), e0()], [e1(), e2()]);
        else pieces.push([e0(), e1()], [e2(), e3()]);
      }
    }
  // Chain the pieces end to end; shared points are equal to the bit, since both cells interpolate the same edge.
  const key = (p: Point) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
  const at = new Map<string, number[]>();
  pieces.forEach(([p, q], i) => {
    for (const k of [key(p), key(q)]) at.set(k, [...(at.get(k) ?? []), i]);
  });
  const used = new Set<number>();
  const walls: Wall[] = [];
  for (let i = 0; i < pieces.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const [p, q] = pieces[i] as [Point, Point];
    const line = [p, q];
    for (const forward of [true, false]) {
      for (;;) {
        const end = forward ? (line[line.length - 1] as Point) : (line[0] as Point);
        const next = (at.get(key(end)) ?? []).find((j) => !used.has(j));
        if (next === undefined) break;
        used.add(next);
        const [a, b] = pieces[next] as [Point, Point];
        const far = key(a) === key(end) ? b : a;
        if (forward) line.push(far);
        else line.unshift(far);
      }
    }
    walls.push(...toSegments(simplify(line, 0.06), "stone"));
  }
  return walls;
}

// Ruins at night: a road through open ground, three or four roofless buildings with broken stone walls, trees,
// boulders and a campfire.
function ruins(r: Rng, width: number, height: number, many: Many): Body {
  const cols = width;
  const rows = height;
  const ground: Ground = { cell: 1, cols, rows, smooth: false, v: new Array(cols * rows).fill(1) };
  const mid = r.range(0.4, 0.6) * height;
  const wave = r.range(1, 2.5);
  const phase = r.range(0, Math.PI * 2);
  const roadY = (x: number) => mid + wave * Math.sin(phase + (x / width) * Math.PI * 2);
  const roadHalf = 1.25;
  const xs = Array.from({ length: 19 }, (_, i) => (i / 18) * width);
  const areas: Area[] = [
    {
      kind: "road",
      outline: [...xs.map((x) => ({ x, y: roadY(x) - roadHalf })), ...xs.reverse().map((x) => ({ x, y: roadY(x) + roadHalf }))],
      material: "earth",
    },
  ];
  const offRoad = (b: Rect, gap: number) => {
    for (let x = b.x - gap; x <= b.x + b.w + gap; x += 0.5) {
      const y = roadY(x);
      if (y + roadHalf + gap > b.y && y - roadHalf - gap < b.y + b.h) return false;
    }
    return true;
  };

  const buildings: Rect[] = [];
  for (let tries = 0; tries < 400 && buildings.length < many(4); tries++) {
    const w = r.int(6, 9);
    const h = r.int(5, 7);
    const b = { x: r.int(1, cols - w - 1), y: r.int(1, rows - h - 1), w, h };
    if (offRoad(b, 1) && buildings.every((o) => !overlaps(b, o, 3))) buildings.push(b);
  }

  const walls: Wall[] = [];
  const doors: Door[] = [];
  const things: Thing[] = [];
  const lights: Light[] = [];
  for (const b of buildings) {
    const facesRoad = roadY(b.x + b.w / 2) > b.y + b.h ? 1 : 0; // 1: the road is below, so the door is in the bottom side
    const corners = outline(b);
    for (let side = 0; side < 4; side++) {
      const from = corners[side] as Point;
      const to = corners[(side + 1) % 4] as Point;
      const n = Math.round(Math.hypot(to.x - from.x, to.y - from.y));
      const keep = new Array(n).fill(true);
      const doorSide = facesRoad ? 2 : 0;
      if (side === doorSide) {
        const d = r.int(1, n - 2);
        keep[d] = false;
        if (r.chance(0.5)) doors.push(doorAt(from, to, n, d, false));
      } else if (r.chance(0.6)) {
        const len = r.int(1, 2);
        const start = r.int(1, n - 1 - len);
        for (let i = start; i < start + len; i++) keep[i] = false;
      }
      walls.push(...wallRun(from, to, keep, "stone"));
    }
    for (let tries = 0, made = 0, want = r.int(1, 3); tries < 60 && made < want; tries++) {
      const at = { x: r.range(b.x + 1, b.x + b.w - 1), y: r.range(b.y + 1, b.y + b.h - 1) };
      const size = r.range(0.3, 0.45);
      if (clearOf(at, size, things, 0.5)) {
        things.push({ kind: "rubble", at, r: size, blocksLight: true });
        made++;
      }
    }
    if (r.chance(0.5)) lights.push({ kind: "torch", at: { x: b.x + 0.4, y: b.y + b.h / 2 }, ...TORCH });
  }
  areas.push(...buildings.map((b): Area => ({ kind: "room", outline: outline(b), material: "wood" })));

  const inBuilding = (p: Point, gap: number) =>
    buildings.some((b) => p.x > b.x - gap && p.x < b.x + b.w + gap && p.y > b.y - gap && p.y < b.y + b.h + gap);
  const onRoad = (p: Point, gap: number) => Math.abs(p.y - roadY(p.x)) < roadHalf + gap;
  for (let tries = 0, made = 0, want = many(r.int(14, 20)); tries < 600 && made < want; tries++) {
    const at = { x: r.range(1, width - 1), y: r.range(1, height - 1) };
    const size = r.range(0.3, 0.45);
    if (!inBuilding(at, 1.2) && !onRoad(at, 0.8) && clearOf(at, size, things, 1.6)) {
      things.push({ kind: "tree", at, r: size, blocksLight: true, canopy: r.range(1.2, 1.8) });
      made++;
    }
  }
  for (let tries = 0, made = 0, want = many(r.int(4, 7)); tries < 400 && made < want; tries++) {
    const at = { x: r.range(1, width - 1), y: r.range(1, height - 1) };
    const size = r.range(0.4, 0.75);
    if (!inBuilding(at, 0.8) && !onRoad(at, 0.3) && clearOf(at, size, things, 0.8)) {
      things.push({ kind: "boulder", at, r: size, blocksLight: true });
      made++;
    }
  }
  for (let tries = 0; tries < 300; tries++) {
    const x = r.range(3, width - 3);
    const at = { x, y: roadY(x) + (r.chance(0.5) ? -1 : 1) * (roadHalf + 1.2) };
    if (!inBuilding(at, 1) && clearOf(at, 0.5, things, 1.5)) {
      lights.push({ kind: "campfire", at, ...TORCH });
      break;
    }
  }
  return { ground, areas, walls, doors, things, lights };
}

// Town at night: two streets crossing at a market square with a well and stalls, houses packed along the streets
// with one-square alleys between them, each house walled all round with its door on the street, the bigger ones split
// into two rooms. Lanterns light the streets; some houses have a hearth.
function town(r: Rng, width: number, height: number, many: Many): Body {
  const ground: Ground = { cell: 1, cols: width, rows: height, smooth: false, v: new Array(width * height).fill(1) };
  const street = 3;
  const hy = r.int(Math.floor(height * 0.35), Math.ceil(height * 0.55) - street);
  const vx = r.int(Math.floor(width * 0.3), Math.ceil(width * 0.6) - street);
  const across: Rect = { x: 0, y: hy, w: width, h: street };
  const down: Rect = { x: vx, y: 0, w: street, h: height };
  const square: Rect = { x: vx - 3, y: hy - 3, w: street + 6, h: street + 6 };
  const open = [across, down, square];
  const areas: Area[] = [
    { kind: "road", outline: outline(across), material: "stone" },
    // Ordered so the outline's two halves are the street's long edges, which are drawn dashed.
    {
      kind: "road",
      outline: [
        { x: vx, y: 0 },
        { x: vx, y: height },
        { x: vx + street, y: height },
        { x: vx + street, y: 0 },
      ],
      material: "stone",
    },
    { kind: "road", outline: outline(square), material: "stone" },
  ];

  const houses: Rect[] = [];
  for (let tries = 0; tries < 3000 && houses.length < many(16); tries++) {
    const w = r.int(4, 7);
    const h = r.int(4, 6);
    const b = { x: r.int(1, width - w - 1), y: r.int(1, height - h - 1), w, h };
    if (open.every((o) => !overlaps(b, o, 0.5)) && houses.every((o) => !overlaps(b, o, 0.5))) houses.push(b);
  }

  const walls: Wall[] = [];
  const doors: Door[] = [];
  const things: Thing[] = [];
  const lights: Light[] = [];
  const gapTo = (b: Rect, o: Rect, side: number) =>
    [b.y - (o.y + o.h), o.x - (b.x + b.w), o.y - (b.y + b.h), b.x - (o.x + o.w)][side] as number;
  for (const b of houses) {
    // The door goes in the side nearest a street.
    const facing = (side: number) =>
      Math.min(
        ...open.map((o) => {
          const along = side % 2 === 0 ? o.x < b.x + b.w && b.x < o.x + o.w : o.y < b.y + b.h && b.y < o.y + o.h;
          const gap = gapTo(b, o, side);
          return along && gap >= 0 ? gap : Infinity;
        }),
      );
    const doorSide = [0, 1, 2, 3].reduce((best, side) => (facing(side) < facing(best) ? side : best), 0);
    const corners = outline(b);
    for (let side = 0; side < 4; side++) {
      const from = corners[side] as Point;
      const to = corners[(side + 1) % 4] as Point;
      const n = Math.round(Math.hypot(to.x - from.x, to.y - from.y));
      const keep = new Array<boolean>(n).fill(true);
      if (side === doorSide) {
        const d = r.int(1, n - 2);
        keep[d] = false;
        doors.push(doorAt(from, to, n, d, r.chance(0.2)));
      }
      walls.push(...wallRun(from, to, keep, "wood"));
    }
    // A house 6 or more squares wide is split into two rooms, with a door between them.
    let split = 0;
    if (b.w >= 6) {
      split = b.x + Math.floor(b.w / 2);
      const from = { x: split, y: b.y };
      const to = { x: split, y: b.y + b.h };
      const keep = new Array<boolean>(b.h).fill(true);
      const d = r.int(1, b.h - 2);
      keep[d] = false;
      doors.push(doorAt(from, to, b.h, d, r.chance(0.5)));
      walls.push(...wallRun(from, to, keep, "wood"));
      areas.push({ kind: "room", outline: outline({ ...b, w: split - b.x }), material: "wood" });
      areas.push({ kind: "room", outline: outline({ ...b, x: split, w: b.x + b.w - split }), material: "wood" });
    } else areas.push({ kind: "room", outline: outline(b), material: "wood" });
    // A table in a corner away from the doors, and maybe a hearth on the back wall.
    const table = { x: b.x + 1.5, y: b.y + 1.5 };
    if (r.chance(0.6) && Math.abs(table.x - split) > 1.2 && doors.every((d) => Math.hypot(d.a.x - table.x, d.a.y - table.y) > 1.6))
      things.push({ kind: "crate", at: table, r: 0.4, blocksLight: true });
    if (r.chance(0.45)) lights.push({ kind: "hearth", at: { x: b.x + b.w - 0.6, y: b.y + b.h / 2 }, brightFt: 10, dimFt: 10 });
  }

  // The square: a well in the middle and market stalls round it.
  const mid = { x: vx + street / 2, y: hy + street / 2 };
  things.push({ kind: "well", at: mid, r: 0.6, blocksLight: true });
  for (let i = 0, want = r.int(3, 5); i < want; i++) {
    const a = r.range(0, Math.PI * 2);
    const at = { x: mid.x + Math.cos(a) * 3.2, y: mid.y + Math.sin(a) * 3.2 };
    if (clearOf(at, 0.4, things, 0.6)) things.push({ kind: "crate", at, r: 0.4, blocksLight: true });
  }
  // Lanterns at the square's corners and every 9 inches along the streets, on the street's edge.
  for (const [dx, dy] of [
    [-2.6, -2.6],
    [2.6, -2.6],
    [-2.6, 2.6],
    [2.6, 2.6],
  ] as const)
    lights.push({ kind: "lantern", at: { x: mid.x + dx, y: mid.y + dy }, ...TORCH });
  for (let x = 4.5; x < width; x += 9)
    if (x < square.x - 1 || x > square.x + square.w + 1) lights.push({ kind: "lantern", at: { x, y: hy + 0.3 }, ...TORCH });
  for (let y = 4.5; y < height; y += 9)
    if (y < square.y - 1 || y > square.y + square.h + 1) lights.push({ kind: "lantern", at: { x: vx + 0.3, y }, ...TORCH });

  // A few trees where there's room.
  const near = (p: Point, gap: number) =>
    [...open, ...houses].some((b) => p.x > b.x - gap && p.x < b.x + b.w + gap && p.y > b.y - gap && p.y < b.y + b.h + gap);
  for (let tries = 0, made = 0, want = many(r.int(3, 6)); tries < 400 && made < want; tries++) {
    const at = { x: r.range(1, width - 1), y: r.range(1, height - 1) };
    const size = r.range(0.3, 0.4);
    if (!near(at, 1) && clearOf(at, size, things, 1.6)) {
      things.push({ kind: "tree", at, r: size, blocksLight: true, canopy: r.range(1, 1.4) });
      made++;
    }
  }
  return { ground, areas, walls, doors, things, lights };
}
