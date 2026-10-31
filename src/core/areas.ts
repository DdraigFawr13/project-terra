// Areas (D-044 step 2D): outlines that may overlap rooms, tagged with a material, difficult terrain, or both, for the
// DM map only and for living effects later (D-014). Pure.
import { pt, smooth, type Annotation, type Material } from "./annotation.ts";
import { insidePolygon } from "./fog.ts";
import type { Point } from "./homography.ts";

export type Tag = { material: Material | null; difficult: boolean };

/** Add an area, or null if its outline has fewer than three corners. */
export function addArea(a: Annotation, outline: readonly Point[], tag: Tag): Annotation | null {
  const ps = outline.map(pt);
  return ps.length < 3 ? null : { ...a, areas: [...a.areas, { outline: ps, ...tag }] };
}

/** An outline drawn freehand (a pond, a patch of rubble), smoothed into straight pieces and closed. */
export function freehandOutline(drawn: readonly Point[]): Point[] {
  const ps = smooth(drawn);
  const [first, last] = [ps[0], ps.at(-1)];
  return first && last && first.x === last.x && first.y === last.y ? ps.slice(0, -1) : ps;
}

/** The area a point is in, the last drawn first since it draws on top, or -1. */
export function areaAt(a: Annotation, p: Point): number {
  return a.areas.findLastIndex((area) => insidePolygon(p, area.outline));
}

export function tagArea(a: Annotation, i: number, tag: Tag): Annotation {
  return { ...a, areas: a.areas.map((area, k) => (k === i ? { ...area, ...tag } : area)) };
}

export function removeArea(a: Annotation, i: number): Annotation {
  return { ...a, areas: a.areas.filter((_, k) => k !== i) };
}

export function setRoomMaterial(a: Annotation, i: number, material: Material | null): Annotation {
  return { ...a, rooms: a.rooms.map((r, k) => (k === i ? { ...r, material } : r)) };
}
