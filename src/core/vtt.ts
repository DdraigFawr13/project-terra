// Universal VTT import (D-044 item 5): a .dd2vtt or .uvtt file, or a library VTT file with its picture, becomes a new
// library map with its walls and doors. The file says its own grid, so there are no corners to mark: one square is one
// inch (D-005) and the picture's top-left corner is the map's (0, 0). Pure, so it is tested without a browser.
import { addOpening, addWall, emptyAnnotation, MAX_ITEMS, MAX_POINTS, type Annotation } from "./annotation.ts";
import type { Point } from "./homography.ts";
import type { Bounds } from "./map.ts";

/**
 * `squares`: the picture's size in squares, which may be fractional; `bounds` rounds it up to whole inches, and the
 * picture is drawn from (0, 0) at its own size. `image`: the picture inside the file as base64, or null for a library
 * file that comes with its picture. `lights`: how many lights the file has, left out until light sources (Later).
 */
export type VttMap = {
  squares: { x: number; y: number };
  bounds: Bounds;
  pixelsPerSquare: number;
  image: string | null;
  walls: Annotation;
  lights: number;
};

const MAX_SQUARES = 120;
const MAX_PPI = 150;
const MIN_PPI = 10;
const MAX_SIDE_PX = 8192;
/** How far the picture's shape may differ from the file's grid before it is taken for the wrong picture. */
const SHAPE_SLACK = 0.02;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function vec(raw: unknown): Point | null {
  if (!isObject(raw)) return null;
  const [x, y] = [num(raw.x), num(raw.y)];
  return x === null || y === null ? null : { x, y };
}

/**
 * Read a VTT file's JSON. Walls and object outlines (`line_of_sight`, `objects_line_of_sight`) become walls, and every
 * portal a door, open or closed as the file has it: portals carry no door, window or secret type, so the DM changes
 * windows by hand. Points off the picture are pulled onto its edge. Returns a reason when the file can't be used.
 */
export function parseVtt(raw: unknown): VttMap | { error: string } {
  const res = isObject(raw) && isObject(raw.resolution) ? raw.resolution : null;
  const size = res ? vec(res.map_size) : null;
  const ppg = res ? num(res.pixels_per_grid) : null;
  if (!isObject(raw) || !res || !size || !ppg)
    return { error: "This isn't a VTT map file: it has no grid size (resolution.map_size and pixels_per_grid)." };
  if (size.x <= 0 || size.y <= 0 || Math.ceil(size.x) > MAX_SQUARES || Math.ceil(size.y) > MAX_SQUARES || ppg <= 0)
    return { error: `The map must be 1 to ${MAX_SQUARES} squares each way.` };
  const origin = res.map_origin === undefined ? { x: 0, y: 0 } : vec(res.map_origin);
  if (!origin) return { error: "The file's map origin is damaged." };
  const bounds: Bounds = { x: 0, y: 0, width: Math.ceil(size.x), height: Math.ceil(size.y) };
  // The file's points count squares from its origin; ours count inches from the picture's corner.
  const at = (p: Point): Point => ({
    x: Math.min(size.x, Math.max(0, p.x - origin.x)),
    y: Math.min(size.y, Math.max(0, p.y - origin.y)),
  });

  let walls = emptyAnnotation();
  const lines = [raw.line_of_sight, raw.objects_line_of_sight].flatMap((l) => (Array.isArray(l) ? l : []));
  for (const line of lines) {
    if (!Array.isArray(line)) return { error: "A wall in the file is damaged." };
    const ps = line.map(vec);
    if (!ps.every((p): p is Point => !!p)) return { error: "A wall in the file is damaged." };
    // A run longer than a saved wall may hold goes in as pieces that share their ends.
    for (let i = 0; i < ps.length - 1; i += MAX_POINTS - 1) walls = addWall(walls, ps.slice(i, i + MAX_POINTS).map(at));
  }
  for (const portal of Array.isArray(raw.portals) ? raw.portals : []) {
    const ends = isObject(portal) && Array.isArray(portal.bounds) ? portal.bounds.map(vec) : [];
    if (ends.length !== 2 || !ends[0] || !ends[1]) return { error: "A door in the file is damaged." };
    walls = addOpening(walls, "door", at(ends[0]), at(ends[1]), portal.closed === false);
  }
  if (walls.walls.length + walls.pillars.length + walls.openings.length > MAX_ITEMS)
    return { error: `The file has more than ${MAX_ITEMS} walls and doors.` };

  const image = typeof raw.image === "string" && raw.image ? raw.image.replace(/^data:[^,]*,/, "") : null;
  const lights = Array.isArray(raw.lights) ? raw.lights.length : 0;
  return { squares: size, bounds, pixelsPerSquare: ppg, image, walls, lights };
}

/** How the stored PNG is laid out: `width` × `height` pixels for the map's bounds, the picture drawn at `drawWidth` × `drawHeight` from the top-left. */
export type VttPlan = { ppi: number; width: number; height: number; drawWidth: number; drawHeight: number };

/**
 * Lay out a VTT map's picture: about as sharp as the picture, within canvas limits. Null when the picture's shape
 * doesn't match the file's grid, which means it is another map's picture.
 */
export function planVttPicture(v: VttMap, picture: { width: number; height: number }): VttPlan | null {
  const want = v.squares.x / v.squares.y;
  if (Math.abs(picture.width / picture.height - want) / want > SHAPE_SLACK) return null;
  const source = picture.width / v.squares.x;
  const ppi = Math.max(MIN_PPI, Math.min(MAX_PPI, source, MAX_SIDE_PX / v.bounds.width, MAX_SIDE_PX / v.bounds.height));
  return {
    ppi,
    width: Math.round(v.bounds.width * ppi),
    height: Math.round(v.bounds.height * ppi),
    drawWidth: Math.round(v.squares.x * ppi),
    drawHeight: Math.round(v.squares.y * ppi),
  };
}
