// Enemy discs, initiative and character cards (step 6, D-027, D-028). Pure data and functions; `apply` in table.ts calls
// them. Discs live on the placed map in its own inches, like fog, so they move and turn with it.
import type { Point } from "./homography.ts";

/** Strong colours that survive a projector (D-023). A colour is also a group: one name, one eye switch, one initiative. */
export const DISC_COLOURS = ["yellow", "red", "blue", "green", "purple", "orange"] as const;
export type DiscColour = (typeof DISC_COLOURS)[number];
/** Worked out from HP when the disc has an HP max (D-028), otherwise set by hand. Down leaves the table and the strip. */
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
  /** Set by hand; used only while the disc has no HP max. */
  condition: Condition;
  /** Current HP; null means full. */
  hp: number | null;
  /** This disc's own HP max, when it differs from its group's; null uses the group's. */
  hpMax: number | null;
  /** A physical mini stands on it, so its letter moves to a tab below (D-036). */
  mini: boolean;
};
/** What the DM knows about a colour group (D-028). All DM-only. */
export type GroupInfo = {
  /** Such as "Zombies". */
  name: string;
  /** The library stat block it is linked to (`<book>:<id>`), or null. */
  creature: string | null;
  ac: number | null;
  speed: number | null;
  hpMax: number | null;
  notes: string;
  /** The creature-type symbol drawn in the ring once revealed (D-036), or null for a plain letter disc. */
  symbol: CreatureType | null;
  /** The table shows the group's symbol (D-036). Until then its discs are plain letters. */
  revealed: boolean;
  /** The linked stat block has a portrait (D-036): revealed tokens of 2 inches and up show it. */
  hasPortrait: boolean;
  /** Show the portrait on 1-inch tokens too, where by default the symbol reads better (D-036). */
  smallPortrait: boolean;
};
export type Groups = Partial<Record<DiscColour, GroupInfo>>;
export const blankGroup = (): GroupInfo => ({
  name: "",
  creature: null,
  ac: null,
  speed: null,
  hpMax: null,
  notes: "",
  symbol: null,
  revealed: false,
  hasPortrait: false,
  smallPortrait: false,
});

/** The 2024 creature types, each with a symbol drawn in code (D-036). */
export const CREATURE_TYPES = [
  "aberration",
  "beast",
  "celestial",
  "construct",
  "dragon",
  "elemental",
  "fey",
  "fiend",
  "giant",
  "humanoid",
  "monstrosity",
  "ooze",
  "plant",
  "undead",
] as const;
export type CreatureType = (typeof CREATURE_TYPES)[number];
const isCreatureType = (v: unknown): v is CreatureType => CREATURE_TYPES.includes(v as CreatureType);

/** The creature type in a stat block's size-and-type line, such as "Medium Undead, Neutral Evil"; null if none. */
export function creatureTypeOf(kind: string): CreatureType | null {
  for (const w of kind.toLowerCase().match(/[a-z]+/g) ?? []) if (isCreatureType(w)) return w;
  return null;
}

/** A player character's card. DM-only except the name, which goes on the turn strip. */
export type Character = {
  id: string;
  name: string;
  ac: number;
  hp: number;
  hpMax: number;
  /** Damage takes temporary HP first. */
  tempHp: number;
  speed: number;
  passive: number;
  /** Passive Insight and Investigation, and spell save DC; null when not filled in. */
  insight: number | null;
  investigation: number | null;
  spellDc: number | null;
  notes: string;
  /** The picture on their token (D-045), by its id in the app's data folder; null for colour and initials alone. */
  picture: string | null;
  /** Their token faces the far long side of the table, where this player sits (D-045). */
  farSide: boolean;
  /** A physical mini stands on their token, so its initials go on a tab below (D-045). */
  mini: boolean;
  /** Shown on their token as icons (D-045). */
  conditions: PcCondition[];
};
export type CharacterFields = Omit<Character, "id">;

/** The 15 conditions of the SRD 5.2 rules, as a player character can have them. */
export const PC_CONDITIONS = [
  "blinded",
  "charmed",
  "deafened",
  "exhaustion",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
] as const;
export type PcCondition = (typeof PC_CONDITIONS)[number];

/** A character's token on a map (D-045), centred on a square in the map's own inches. Always 1 inch. */
export type PcToken = { id: string; x: number; y: number };

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
/** An optional whole number: missing or null is null; anything else must be in range, or the whole record is refused. */
const optInt = (v: unknown, min: number, max: number): number | null | undefined =>
  v === undefined || v === null ? null : (int(v, min, max) ?? undefined);
export const MAX_HP = 999;
const CREATURE_KEY = /^[A-Za-z0-9]{1,20}:[a-z0-9-]{1,80}$/;
const PICTURE_ID = /^pic-[a-f0-9]{8,32}$/;

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
  // Discs saved before HP existed (save version 5) are full and use their group's HP max.
  const hp = optInt(raw.hp, 0, MAX_HP);
  const hpMax = optInt(raw.hpMax, 1, MAX_HP);
  if (hp === undefined || hpMax === undefined) return null;
  // Discs saved before D-036 have no mini on them.
  const mini = raw.mini ?? false;
  if (typeof mini !== "boolean") return null;
  return { colour, letter, x, y, size, shown, condition, hp, hpMax, mini };
}

/** A map's discs; null if any is wrong or two share a colour and letter. */
export function parseDiscs(raw: unknown): Disc[] | null {
  if (!Array.isArray(raw) || raw.length > DISC_COLOURS.length * LETTERS.length) return null;
  const discs = raw.map(parseDisc);
  if (discs.some((d) => !d)) return null;
  const keys = new Set(discs.map((d) => `${d!.colour}${d!.letter}`));
  return keys.size === discs.length ? (discs as Disc[]) : null;
}

export function parseGroupInfo(raw: unknown): GroupInfo | null {
  // Save version 5 kept only a name.
  if (typeof raw === "string") raw = { name: raw };
  if (!isObject(raw)) return null;
  const name = text(raw.name ?? "", 40);
  const notes = text(raw.notes ?? "", 2000);
  const creature = raw.creature === undefined || raw.creature === null ? null : raw.creature;
  const ac = optInt(raw.ac, 0, 40);
  const speed = optInt(raw.speed, 0, 999);
  const hpMax = optInt(raw.hpMax, 1, MAX_HP);
  if (name === null || notes === null || ac === undefined || speed === undefined || hpMax === undefined) return null;
  if (creature !== null && (typeof creature !== "string" || !CREATURE_KEY.test(creature))) return null;
  // Groups saved before D-036 have no symbol and aren't revealed.
  const symbol = raw.symbol ?? null;
  const revealed = raw.revealed ?? false;
  const hasPortrait = raw.hasPortrait ?? false;
  const smallPortrait = raw.smallPortrait ?? false;
  if (symbol !== null && !isCreatureType(symbol)) return null;
  if (typeof revealed !== "boolean" || typeof hasPortrait !== "boolean" || typeof smallPortrait !== "boolean") return null;
  return { name, creature, ac, speed, hpMax, notes, symbol, revealed, hasPortrait, smallPortrait };
}

export function parseGroups(raw: unknown): Groups | null {
  if (!isObject(raw)) return null;
  const out: Groups = {};
  for (const c of DISC_COLOURS) {
    if (raw[c] === undefined) continue;
    const info = parseGroupInfo(raw[c]);
    if (!info) return null;
    out[c] = info;
  }
  return out;
}

export function parseCharacterFields(raw: unknown): CharacterFields | null {
  if (!isObject(raw)) return null;
  const name = text(raw.name, 40);
  const notes = text(raw.notes ?? "", 2000);
  const ac = int(raw.ac, 0, 40);
  const hp = int(raw.hp, 0, MAX_HP);
  const hpMax = int(raw.hpMax, 1, MAX_HP);
  // Cards saved before D-028 have no temp HP, Insight, Investigation, save DC or notes.
  const tempHp = raw.tempHp === undefined ? 0 : int(raw.tempHp, 0, MAX_HP);
  const passive = int(raw.passive, 0, 40);
  const speed = int(raw.speed, 0, 999);
  const insight = optInt(raw.insight, 0, 40);
  const investigation = optInt(raw.investigation, 0, 40);
  const spellDc = optInt(raw.spellDc, 0, 40);
  if (!name || notes === null || ac === null || hp === null || hpMax === null || tempHp === null) return null;
  if (passive === null || speed === null || insight === undefined || investigation === undefined || spellDc === undefined) return null;
  // Cards saved before D-045 have no token settings.
  const picture = raw.picture ?? null;
  const farSide = raw.farSide ?? false;
  const mini = raw.mini ?? false;
  const conditions = raw.conditions ?? [];
  if (picture !== null && (typeof picture !== "string" || !PICTURE_ID.test(picture))) return null;
  if (typeof farSide !== "boolean" || typeof mini !== "boolean") return null;
  if (!Array.isArray(conditions) || !conditions.every((v) => PC_CONDITIONS.includes(v)) || new Set(conditions).size !== conditions.length)
    return null;
  return {
    name,
    ac,
    hp: Math.min(hp, hpMax),
    hpMax,
    tempHp,
    speed,
    passive,
    insight,
    investigation,
    spellDc,
    notes,
    picture,
    farSide,
    mini,
    conditions,
  };
}

/** A map's character tokens; null if any is wrong or a character has two. */
export function parsePcTokens(raw: unknown): PcToken[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_PARTY) return null;
  const tokens = raw.map((t): PcToken | null => {
    if (!isObject(t) || typeof t.id !== "string" || !PC_ID.test(t.id)) return null;
    const x = half(t.x);
    const y = half(t.y);
    return x === null || y === null ? null : { id: t.id, x, y };
  });
  if (tokens.some((t) => !t) || new Set(tokens.map((t) => t!.id)).size !== tokens.length) return null;
  return tokens as PcToken[];
}

/** One or two letters for a token: the first letters of the first and last words of the name. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = (w: string | undefined) => (w ? Array.from(w)[0]!.toUpperCase() : "");
  return first(words[0]) + (words.length > 1 ? first(words[words.length - 1]) : "");
}

/**
 * The square of a picture a token shows (D-045): as large as the picture allows at zoom 1, smaller as `zoom` grows,
 * centred on (cx, cy) as fractions of its width and height, and kept inside the picture. All in the picture's pixels.
 */
export function cropSquare(width: number, height: number, zoom: number, cx: number, cy: number): { x: number; y: number; size: number } {
  const size = Math.min(width, height) / Math.max(1, zoom);
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  return { x: clamp(cx * width - size / 2, width - size), y: clamp(cy * height - size / 2, height - size), size };
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
  return [...discs, { colour, letter, ...snapDisc(at, size), size, shown: false, condition: "fine", hp: null, hpMax: null, mini: false }];
}

export const sameDisc = (d: Disc, colour: DiscColour, letter: string) => d.colour === colour && d.letter === letter;

// ---- HP (D-028) ----

/** A disc's HP max: its own, else its group's, else unknown. */
export const discMax = (d: Disc, groups: Groups): number | null => d.hpMax ?? groups[d.colour]?.hpMax ?? null;
/** A disc's HP now, or null while its HP max is unknown. */
export function discHp(d: Disc, groups: Groups): number | null {
  const max = discMax(d, groups);
  return max === null ? null : Math.min(d.hp ?? max, max);
}

/** How full a disc's HP is, 0 to 1, for the DM map's HP ring (D-036); null without an HP max. */
export function hpFraction(d: Disc, groups: Groups): number | null {
  const max = discMax(d, groups);
  const hp = discHp(d, groups);
  return max === null || hp === null ? null : Math.max(0, hp) / max;
}

/** The condition word from HP: Bloodied at half, Near death at a quarter, Down at 0 (D-028). */
export function conditionFromHp(hp: number, max: number): Condition {
  if (hp <= 0) return "down";
  if (hp * 4 <= max) return "nearDeath";
  if (hp * 2 <= max) return "bloodied";
  return "fine";
}

/** A disc's condition word: from HP when the HP max is known, else as set by hand. */
export function conditionOf(d: Disc, groups: Groups): Condition {
  const max = discMax(d, groups);
  const hp = discHp(d, groups);
  return max === null || hp === null ? d.condition : conditionFromHp(hp, max);
}

/** Damage (a negative change) or healing, kept between 0 and the HP max. Unknown HP max: no change. */
export function changeDiscHp(d: Disc, groups: Groups, change: number): Disc {
  const max = discMax(d, groups);
  const hp = discHp(d, groups);
  if (max === null || hp === null) return d;
  const next = Math.max(0, Math.min(max, hp + change)) + 0;
  // Full is stored as null, so a disc at full HP follows a later change to its HP max.
  return { ...d, hp: next === max ? null : next };
}

/** Damage takes temporary HP first, then HP down to 0; healing raises HP up to the max and never adds temporary HP. */
export function changeCharacterHp(c: Character, change: number): Character {
  if (change >= 0) return { ...c, hp: Math.min(c.hpMax, c.hp + change) };
  const fromTemp = Math.min(c.tempHp, -change);
  return { ...c, tempHp: c.tempHp - fromTemp, hp: Math.max(0, c.hp + change + fromTemp) + 0 };
}

/** Whether a colour or character still takes turns: a colour needs a disc that isn't down. */
export function takesTurns(who: Who, discs: readonly Disc[], groups: Groups, party: readonly Character[]): boolean {
  return isColour(who) ? discs.some((d) => d.colour === who && conditionOf(d, groups) !== "down") : party.some((c) => c.id === who);
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
export function stripOf(fight: Fight | null, discs: readonly Disc[], groups: Groups, party: readonly Character[]): Strip | null {
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
      .filter((d) => d.colour === who && d.shown && conditionOf(d, groups) !== "down")
      .sort((a, b) => a.letter.localeCompare(b.letter))
      .map((d) => {
        const condition = conditionOf(d, groups);
        return {
          kind: "enemy" as const,
          colour: d.colour,
          letter: d.letter,
          condition: condition === "bloodied" || condition === "nearDeath" ? condition : null,
          current,
        };
      });
  });
  return { round: fight.round, chips };
}

/**
 * What a disc shows the players (D-036): nothing extra until its group is revealed; then the group's symbol, and the
 * portrait of its linked creature on tokens 2 inches and up, or on 1-inch ones when the DM asks. `portrait` is an
 * opaque key (`<colour>/<tag>`) the table loads the picture by; the tag changes when the linked creature does, and it
 * never spells the creature's name.
 */
export function tokenLook(d: Disc, groups: Groups): { symbol: CreatureType | null; portrait: string | null } {
  const g = groups[d.colour];
  if (!g?.revealed) return { symbol: null, portrait: null };
  const portrait = g.hasPortrait && g.creature && (d.size >= 2 || g.smallPortrait) ? `${d.colour}/${hashTag(g.creature)}` : null;
  return { symbol: g.symbol, portrait };
}

/** A short hash (FNV-1a) of a creature key, so a changed link loads a new picture. */
function hashTag(key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}
