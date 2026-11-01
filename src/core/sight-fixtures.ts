// Test-only (like D-041's concept files): a dense generated map for the Sight wall-check tests and `npm run bench:sight`.
// Nothing in the app imports this; mapgen.test.ts checks that. The layout follows the Sight spec's prototype
// (docs/specs/sight.md, "Test fixture").
import type { Annotation } from "./annotation.ts";
import type { Point } from "./homography.ts";
import type { Bounds } from "./map.ts";

const WIDTH = 42;
const HEIGHT = 24;
/** Each wall between two rooms has a door this wide in its middle. */
const DOOR_IN = 0.8;
const PILLAR_R = 0.4;

const r2 = (v: number): number => Math.round(v * 100) / 100 + 0;
const p = (x: number, y: number): Point => ({ x: r2(x), y: r2(y) });

/**
 * A 42 × 24 inch map split into `cols` × `rows` rooms. Every wall between two rooms is two pieces with a door between
 * them, every other door open; `pillars` round pillars sit at (1 + (k·7.3 mod 40), 1 + (k·3.7 mod 22)). No outer walls:
 * the map edge closes it. `denseRooms(20, 12, 60)` gives 2,080 blocking pieces (896 walls, 224 closed doors, 960 pillar sides), about the
 * prototype's 1,974.
 */
export function denseRooms(cols: number, rows: number, pillars: number): { annotation: Annotation; bounds: Bounds; points: Point[] } {
  const a: Annotation = { walls: [], pillars: [], openings: [], rooms: [], areas: [] };
  const [w, h] = [WIDTH / cols, HEIGHT / rows];
  let k = 0;
  /** One wall between rooms, from (x0, y0) along (dx, dy) for `len` inches, with its door in the middle. */
  const edge = (x0: number, y0: number, dx: number, dy: number, len: number) => {
    const at = (t: number) => p(x0 + dx * t, y0 + dy * t);
    const [d0, d1] = [(len - DOOR_IN) / 2, (len + DOOR_IN) / 2];
    a.walls.push({ points: [at(0), at(d0)], closed: false }, { points: [at(d1), at(len)], closed: false });
    a.openings.push({ kind: "door", a: at(d0), b: at(d1), open: k++ % 2 === 0 });
  };
  for (let i = 1; i < cols; i++) for (let j = 0; j < rows; j++) edge(i * w, j * h, 0, 1, h);
  for (let j = 1; j < rows; j++) for (let i = 0; i < cols; i++) edge(i * w, j * h, 1, 0, w);
  for (let n = 0; n < pillars; n++) a.pillars.push({ at: p(1 + ((n * 7.3) % 40), 1 + ((n * 3.7) % 22)), r: PILLAR_R });
  return {
    annotation: a,
    bounds: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    points: [p(21.3, 12.2), p(3.1, 2.7), p(39.4, 20.6), p(10.05, 17.9)],
  };
}
