// Enemy discs, initiative and character cards (step 6, D-027). Pure data and functions; `apply` in table.ts calls them.
// Discs live on the placed map in its own inches, like fog, so they move and turn with it.
import type { Point } from "./homography.ts";

/** Strong colours that survive a projector (D-023). A colour is also a group: one name, one eye switch, one initiative. */
export const DISC_COLOURS = ["yellow", "red", "blue", "green", "purple", "orange"] as const;
export type DiscColour = (typeof DISC_COLOURS)[number];
/** Set by hand until discs carry HP (D-013). Down leaves the table and the turn strip. */
const CONDITIONS = ["fine", "bloodied", "nearDeath", "down"] as const;
export type Condition = (typeof CONDITIONS)[number];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const MAX_DISC_SIZE = 4;
export const MAX_PARTY = 12;

export type Disc = {
  colour: DiscColour;
  letter: string;
  /** Centre in map inches: on a square's centre for odd sizes, on a grid corner for even ones. */
  x: number;
  y: number;
  /** Width in inches: 1 for Medium and smaller, 2 Large, 3 Huge, 4 Gargantuan. */
  size: number;
  shown: boolean;
  condition: Condition;
};
/** DM-only names for the colour groups, such as "Ash zombies". */
export type GroupNames = Partial<Record<DiscColour, string>>;

/** A player character's card. DM-only except the name, which goes on the turn strip. */
export type Character = { id: string; name: string; ac: number; hp: number; hpMax: number; passive: number; speed: number };
export type CharacterFields = Omit<Character, "id">;

/** Who an initiative entry is for: a character's id, or a colour, meaning every disc of that colour. */
export type Who = string;
type Entry = { who: Who; init: number };
/** Entries in turn order. `current` is null before the first turn; `round` counts from 1 once turns start. */
export type Fight = { entries: Entry[]; current: Who | null; round: number };

// ---- Reading untrusted data ----

const REACH_IN = 500;
const PC_ID = /^pc-\d{1,3}$/;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const int = (v: unknown, min: number, max: number): number | null =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) + 0 : null;
/** A centre on the half-inch grid within reach. */
const half = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v * 2) && Math.abs(v) <= REACH_IN ? v + 0 : null);
const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim().length <= max ? v.trim() : null);

export const isColour = (v: unknown): v is DiscColour => DISC_COLOURS.includes(v as DiscColour);
export const isLetter = (v: unknown): v is string => typeof v === "string" && v.length === 1 && LETTERS.includes(v);
export const isCondition = (v: unknown): v is Condition => CONDITIONS.includes(v as Condition);
export const isWho = (v: unknown): v is Who => isColour(v) || (typeof v === "string" && PC_ID.test(v));

function parseDisc(raw: unknown): Disc | null {
  if (!isObject(raw)) return null;
  const { colour, letter, shown, condition } = raw;
  const size = int(raw.size, 1, MAX_DISC_SIZE);
  const x = half(raw.x);
  const y = half(raw.y);
  if (!isColour(colour) || !isLetter(letter) || typeof shown !== "boolean" || !isCondition(condition)) return null;
  if (size === null || x === null || y === null) return null;
  return { colour, letter, x, y, size, shown, condition };
}

/** A map's discs; null if any is wrong or two share a colour and letter. */
export function parseDiscs(raw: unknown): Disc[] | null {
  if (!Array.isArray(raw) || raw.length > DISC_COLOURS.length * LETTERS.length) return null;
  const discs = raw.map(parseDisc);
  if (discs.some((d) => !d)) return null;
  const keys = new Set(discs.map((d) => `${d!.colour}${d!.letter}`));
  return keys.size === discs.length ? (discs as Disc[]) : null;
}

export function parseGroupNames(raw: unknown): GroupNames | null {
  if (!isObject(raw)) return null;
  const out: GroupNames = {};
  for (const c of DISC_COLOURS) {
    if (raw[c] === undefined) continue;
    const name = text(raw[c], 40);
    if (name === null) return null;
    if (name) out[c] = name;
  }
  return out;
}

export function parseCharacterFields(raw: unknown): CharacterFields | null {
  if (!isObject(raw)) return null;
  const name = text(raw.name, 40);
  const ac = int(raw.ac, 0, 40);
  const hp = int(raw.hp, 0, 999);
  const hpMax = int(raw.hpMax, 1, 999);
  const passive = int(raw.passive, 0, 40);
  const speed = int(raw.speed, 0, 999);
  if (!name || ac === null || hp === null || hpMax === null || passive === null || speed === null) return null;
  return { name, ac, hp: Math.min(hp, hpMax), hpMax, passive, speed };
}

export function parseParty(raw: unknown): Character[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_PARTY) return null;
  const party = raw.map((c) => {
    const fields = parseCharacterFields(c);
    return fields && isObject(c) && typeof c.id === "string" && PC_ID.test(c.id) ? { id: c.id, ...fields } : null;
  });
  if (party.some((c) => !c) || new Set(party.map((c) => c!.id)).size !== party.length) return null;
  return party as Character[];
}

export const parseInit = (v: unknown): number | null => int(v, -20, 99);

export function parseFight(raw: unknown): Fight | null {
  if (!isObject(raw) || !Array.isArray(raw.entries) || raw.entries.length > MAX_PARTY + DISC_COLOURS.length) return null;
  const entries = raw.entries.map((e) =>
    isObject(e) && isWho(e.who) && parseInit(e.init) !== null ? { who: e.who, init: e.init as number } : null,
  );
  const round = int(raw.round, 0, 9999);
  if (entries.some((e) => !e) || round === null) return null;
  const list = entries as Entry[];
  if (new Set(list.map((e) => e.who)).size !== list.length) return null;
  // Entries are kept in turn order; a list out of order would put a later insert in the wrong place.
  if (list.some((e, i) => i > 0 && e.init > list[i - 1]!.init)) return null;
  const current = raw.current === null ? null : list.some((e) => e.who === raw.current) ? (raw.current as Who) : undefined;
  if (current === undefined) return null;
  return { entries: list.map((e) => ({ who: e.who, init: e.init + 0 })), current, round };
}

// ---- Discs ----

/** The centre a disc of this size snaps to near `p`: its edges on the map's 1-inch grid lines. */
export function snapDisc(p: Point, size: number): Point {
  return { x: Math.round(p.x - size / 2) + size / 2 + 0, y: Math.round(p.y - size / 2) + size / 2 + 0 };
}

/** The first letter its colour doesn't use yet, or null when all 26 are taken. */
export function nextLetter(discs: readonly Disc[], colour: DiscColour): string | null {
  const used = new Set(discs.filter((d) => d.colour === colour).map((d) => d.letter));
  return [...LETTERS].find((l) => !used.has(l)) ?? null;
}

/** A new disc starts hidden and fine (D-027), so an ambush can be set up before the players arrive. */
export function placeDisc(discs: readonly Disc[], colour: DiscColour, at: Point, size: number): Disc[] {
  const letter = nextLetter(discs, colour);
  if (!letter) return [...discs];
  return [...discs, { colour, letter, ...snapDisc(at, size), size, shown: false, condition: "fine" }];
}

export const sameDisc = (d: Disc, colour: DiscColour, letter: string) => d.colour === colour && d.letter === letter;

/** Whether a colour or character still takes turns: a colour needs a disc that isn't down. */
export function takesTurns(who: Who, discs: readonly Disc[], party: readonly Character[]): boolean {
  return isColour(who) ? discs.some((d) => d.colour === who && d.condition !== "down") : party.some((c) => c.id === who);
}

// ---- Initiative ----

/** Set or clear a roll. A new roll goes after every entry with the same or a higher roll, so ties keep typed order. */
export function setInitiative(fight: Fight, who: Who, init: number | null): Fight {
  const at = fight.entries.findIndex((e) => e.who === who);
  const entries = fight.entries.filter((e) => e.who !== who);
  let current = fight.current;
  // Taking out the creature whose turn it is hands the turn to the one after it.
  if (init === null && current === who) current = fight.entries[at + 1]?.who ?? entries[0]?.who ?? null;
  if (init !== null) {
    const i = entries.findIndex((e) => e.init < init);
    entries.splice(i === -1 ? entries.length : i, 0, { who, init });
  }
  return { ...fight, entries, current };
}

/** Swap an entry with its neighbour, only when both rolled the same: that is how ties are settled. */
export function swapTie(fight: Fight, who: Who, by: -1 | 1): Fight {
  const i = fight.entries.findIndex((e) => e.who === who);
  const j = i + by;
  const a = fight.entries[i];
  const b = fight.entries[j];
  if (!a || !b || a.init !== b.init) return fight;
  const entries = [...fight.entries];
  [entries[i], entries[j]] = [b, a];
  return { ...fight, entries };
}

/** The next turn, skipping anyone who no longer takes turns; the round counts up each time the order wraps. */
export function nextTurn(fight: Fight, active: (who: Who) => boolean): Fight {
  const n = fight.entries.length;
  let i = fight.current === null ? -1 : fight.entries.findIndex((e) => e.who === fight.current);
  let round = Math.max(1, fight.round);
  for (let step = 0; step < n; step++) {
    i++;
    if (i >= n) {
      i = 0;
      round++;
    }
    const who = fight.entries[i]!.who;
    if (active(who)) return { ...fight, current: who, round };
  }
  return fight;
}

// ---- The turn strip on the table (D-013, D-023) ----

export type Chip =
  | { kind: "pc"; name: string; current: boolean }
  | { kind: "enemy"; colour: DiscColour; letter: string; condition: "bloodied" | "nearDeath" | null; current: boolean };
export type Strip = { round: number; chips: Chip[] };

/**
 * What the table's turn strip shows, starting with the current turn. Built from player-safe fields only: names for
 * characters; colour, letter and condition for discs that are shown and not down. No HP, no AC, no group names (D-002).
 */
export function stripOf(fight: Fight | null, discs: readonly Disc[], party: readonly Character[]): Strip | null {
  if (!fight || fight.entries.length === 0) return null;
  const start = Math.max(
    0,
    fight.entries.findIndex((e) => e.who === fight.current),
  );
  const order = [...fight.entries.slice(start), ...fight.entries.slice(0, start)];
  const chips = order.flatMap(({ who }): Chip[] => {
    const current = who === fight.current;
    if (!isColour(who)) {
      const pc = party.find((c) => c.id === who);
      return pc ? [{ kind: "pc", name: pc.name, current }] : [];
    }
    return discs
      .filter((d): d is Disc & { condition: Exclude<Condition, "down"> } => d.colour === who && d.shown && d.condition !== "down")
      .sort((a, b) => a.letter.localeCompare(b.letter))
      .map((d) => ({
        kind: "enemy",
        colour: d.colour,
        letter: d.letter,
        condition: d.condition === "fine" ? null : d.condition,
        current,
      }));
  });
  return { round: fight.round, chips };
}
