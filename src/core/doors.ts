// Doors and secret doors open and close per scene (D-044 item 4, D-047): a placed map keeps a record of the doors the DM
// has tapped, keyed by kind and ends, and any door missing from it is as the library map has it. DM-only: the record never
// goes to the table window (D-002). Pure.
import { segmentDistance, type Annotation, type Opening } from "./annotation.ts";
import type { Point } from "./homography.ts";

/** Door state per scene: true is open. Keys come from `doorKey`. */
export type Doors = Readonly<Record<string, boolean>>;

/** Records past this many entries take no new key; keys that match no door are never pruned, so this bounds them. */
export const MAX_DOORS = 5000;
const DOOR_KEY = /^[ds]:(-?\d+\.\d\d,){3}-?\d+\.\d\d$/;

const isDoor = (o: Opening): boolean => o.kind === "door" || o.kind === "secret";
const fixed = (v: number): string => (v + 0).toFixed(2);

/**
 * `d` for a door or `s` for a secret door, a colon, then both ends, lower end first by x then y, each to hundredths:
 * `d:3.25,4.00,3.25,5.00`. A door redrawn in the editor has new ends, so it starts from its default again.
 */
export function doorKey(o: Opening): string {
  const [p, q] = o.a.x < o.b.x || (o.a.x === o.b.x && o.a.y <= o.b.y) ? [o.a, o.b] : [o.b, o.a];
  return `${o.kind === "secret" ? "s" : "d"}:${fixed(p.x)},${fixed(p.y)},${fixed(q.x)},${fixed(q.y)}`;
}

export const isDoorKey = (v: unknown): v is string => typeof v === "string" && DOOR_KEY.test(v);

/** Whether a door or secret door is open in this scene: the record's word, else the library map's. */
export function doorOpen(o: Opening, doors: Doors): boolean {
  const key = doorKey(o);
  return Object.hasOwn(doors, key) ? doors[key]! : o.open;
}

/** A saved record: a missing one is empty, and bad entries are dropped while the map is kept. At most MAX_DOORS. */
export function parseDoors(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  let n = 0;
  for (const [key, open] of Object.entries(raw)) {
    if (n >= MAX_DOORS) break;
    if (isDoorKey(key) && typeof open === "boolean") {
      out[key] = open;
      n++;
    }
  }
  return out;
}

/** The record with one door set, or the same record when it is full and the key is new. */
export function setDoor(doors: Record<string, boolean>, key: string, open: boolean): Record<string, boolean> {
  if (!Object.hasOwn(doors, key) && Object.keys(doors).length >= MAX_DOORS) return doors;
  return { ...doors, [key]: open };
}

/** The nearest door or secret door within `reach` inches of p (map inches), for a Select tap; null if none. */
export function doorAt(a: Annotation, p: Point, reach: number): Opening | null {
  let best: Opening | null = null;
  let d = reach;
  for (const o of a.openings) {
    if (!isDoor(o)) continue;
    const e = segmentDistance(p, o.a, o.b);
    if (e <= d) [best, d] = [o, e];
  }
  return best;
}
