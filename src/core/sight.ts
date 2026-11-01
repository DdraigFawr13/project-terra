// Sight follows tokens (D-047, docs/specs/sight.md "Re-look"). With a scene's Sight on, a command that changes where the
// tokens stand, the doors, or who can see is followed by a re-look: everything seen becomes explored, then each seeing
// token's view is revealed. Main runs it, because the walls live in the library, not the table state. Pure.
import type { Annotation } from "./annotation.ts";
import type { Doors } from "./doors.ts";
import { addFog } from "./fog.ts";
import type { Point } from "./homography.ts";
import type { Bounds } from "./map.ts";
import { sightOf, type Command, type TableState } from "./table.ts";
import { blockIndex, sightFrom } from "./wallcheck.ts";

type Index = ReturnType<typeof blockIndex>;

/**
 * Conditions that stop a character seeing. Stunned is included because the SRD 5.2 Stunned condition gives the
 * Incapacitated condition (checked against the SRD 5.2 text at S2).
 */
const UNSEEING = new Set(["blinded", "incapacitated", "paralyzed", "petrified", "stunned", "unconscious"]);

/** The current map's tokens, each with whether its character can see now (not blinded and the like, not down). */
function lookers(state: TableState): { id: string; at: Point; sees: boolean }[] {
  return (state.map?.tokens ?? []).flatMap((t) => {
    const pc = state.party.find((p) => p.id === t.id);
    if (!pc) return [];
    const sees = pc.hp > 0 && !pc.conditions.some((c) => UNSEEING.has(c));
    return [{ id: t.id, at: { x: t.x, y: t.y }, sees }];
  });
}

const inside = (p: Point, b: Bounds): boolean => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;

/**
 * Everything a re-look depends on, as text: the scene and its Sight, the map and its feet per square, each token's
 * centre, the door record, and which tokens' characters can't see. A command that leaves it alone needs no re-look.
 * Darkvision and carried light join it in S4, with the dark ranges (build decision, Morgan 2026-11-01).
 */
export function sightKey(state: TableState): string {
  const m = state.map;
  return JSON.stringify([
    state.scene,
    sightOf(state),
    m?.id ?? null,
    m?.feetPerSquare ?? null,
    lookers(state).map((t) => [t.id, t.at.x, t.at.y, t.sees]),
    m?.doors ?? null,
  ]);
}

/** Whether a walls file has anything that blocks: walls, pillars, or doors and secret doors. Rooms and areas don't. */
const blocksAnything = (a: Annotation | null): boolean =>
  !!a && (a.walls.length > 0 || a.pillars.length > 0 || a.openings.some((o) => o.kind === "door" || o.kind === "secret"));

/**
 * The state after `command` took `prev` to `next`, with Sight's re-look when one is due. `next` unchanged when the
 * scene's Sight is Off, after switchScene or resetScene (they bring a scene back as it was, D-039), when nothing Sight
 * depends on changed, or on a map with no traced walls. `indexFor` lets main reuse the wall index it keeps.
 */
export function afterCommand(
  prev: TableState,
  next: TableState,
  command: Command,
  annotation: Annotation | null,
  indexFor: (a: Annotation, doors: Doors, b: Bounds) => Index = blockIndex,
): TableState {
  const m = next.map;
  if (!m || sightOf(next) === "off") return next;
  if (command.type === "switchScene" || command.type === "resetScene") return next;
  if (sightKey(prev) === sightKey(next)) return next;
  if (!annotation || !blocksAnything(annotation)) return next;
  return relook(next, indexFor(annotation, m.doors, m.bounds));
}

/**
 * The party moves on: a `dimSeen`, then one reveal outline per seeing token on the map, through `addFog`. Packing a
 * long list happens in the background (D-047 item 8). On a dark scene, sight is unlimited until S4 adds the ranges.
 */
export function relook(state: TableState, index: Index): TableState {
  const m = state.map;
  if (!m) return state;
  let fog = addFog(m.fog, { kind: "dimSeen" }, m.bounds);
  for (const t of lookers(state)) {
    if (!t.sees || !inside(t.at, m.bounds)) continue;
    const points = sightFrom(index, t.at, null);
    if (points.length) fog = addFog(fog, { kind: "outline", mode: "reveal", points }, m.bounds);
  }
  return { ...state, map: { ...m, fog } };
}
