// What the table shows. Pure data and functions: no Electron, no clock, no randomness (GAME-01).
// Every change is a command applied by `apply` (D-024), so the same commands always give the same state (GAME-02).
import { parseCalibration, type Calibration } from "./calibration.ts";
import {
  isColour,
  isCondition,
  isLetter,
  isWho,
  MAX_DISC_SIZE,
  MAX_PARTY,
  nextTurn,
  parseCharacterFields,
  parseDiscs,
  parseFight,
  parseGroupInfo,
  parseGroups,
  parseInit,
  parseParty,
  placeDisc,
  sameDisc,
  setInitiative,
  snapDisc,
  stripOf,
  swapTie,
  takesTurns,
  changeCharacterHp,
  changeDiscHp,
  conditionOf,
  MAX_HP,
  type Character,
  type CharacterFields,
  type Condition,
  type Disc,
  type DiscColour,
  type Fight,
  type GroupInfo,
  type Groups,
  type Strip,
  type Who,
} from "./fight.ts";
import { addFog, parseFog, parseFogOp, type FogOp } from "./fog.ts";
import { mapToTable, type Bounds } from "./map.ts";

const SAVE_VERSION = 7;

/** A straightened map from the personal library (D-010), placed on the table. Positions are in inches (D-005). */
export type PlacedMap = {
  /** The library file's id. */
  id: string;
  /** The DM's name for it. DM-only: it never goes to the table window. */
  name: string;
  /** The image's extent around its marked rectangle's top-left corner, in inches. */
  bounds: Bounds;
  /** Where that corner sits on the table, in whole inches, so the map's squares line up with the table grid. */
  x: number;
  y: number;
  /** Quarter turns clockwise around that corner. */
  turns: 0 | 1 | 2 | 3;
  /** Fog strokes and shapes in the map's own inches, oldest first (D-025). A newly placed map starts all black. */
  fog: FogOp[];
  /** Enemy discs in the map's own inches (D-027). A newly placed map has none. */
  discs: Disc[];
  /** What the DM knows about each colour group: name, stat block link, AC, HP max (D-028). DM-only. */
  groups: Groups;
};

export type TableState = {
  version: typeof SAVE_VERSION;
  /** Blank the table while the DM sets up. Wins over everything else. */
  curtain: boolean;
  /** Show the calibration pattern while the DM drags the corners. */
  calibrating: boolean;
  /** Show the 1-inch grid: alone, or over the map to check it lines up. */
  testGrid: boolean;
  /** Display the player window should use; null means pick automatically. */
  playerDisplayId: number | null;
  /** One calibration per table surface (see `surfaceKey` in displays.ts). */
  calibrations: Record<string, Calibration>;
  map: PlacedMap | null;
  /** Character cards, kept between sessions and outside undo (D-027). */
  party: Character[];
  /** Initiative, or null outside a fight. */
  fight: Fight | null;
  /** Turn the discs' single letters half round, when the bottom of the picture is the far side of the table (D-028). */
  flipLetters: boolean;
  /** The highest character id number given out, so a removed character's id is never reused. */
  lastCharacter: number;
  /** The placed map can't be moved, turned or taken off, so a stray drag mid-game can't shift it under the minis (D-029). */
  mapLocked: boolean;
};

export type Command =
  | { type: "curtain"; on: boolean }
  | { type: "calibrating"; on: boolean }
  | { type: "testGrid"; on: boolean }
  | { type: "playerDisplay"; id: number | null }
  | { type: "calibrations"; value: Record<string, Calibration> }
  | { type: "placeMap"; map: PlacedMap }
  | { type: "moveMap"; dx: number; dy: number }
  | { type: "turnMap" }
  | { type: "removeMap" }
  | { type: "lockMap"; on: boolean }
  | { type: "fog"; op: FogOp }
  | { type: "placeDisc"; colour: DiscColour; x: number; y: number; size: number }
  | { type: "moveDisc"; colour: DiscColour; letter: string; x: number; y: number }
  | { type: "removeDisc"; colour: DiscColour; letter: string }
  /** Show or hide one disc, or with no letter the whole colour group (D-006). */
  | { type: "showDiscs"; colour: DiscColour; letter: string | null; on: boolean }
  | { type: "condition"; colour: DiscColour; letter: string; condition: Condition }
  | { type: "group"; colour: DiscColour; info: GroupInfo }
  /** Damage (negative) or healing for one disc (D-028). */
  | { type: "discHp"; colour: DiscColour; letter: string; change: number }
  /** A disc's own HP max; null goes back to its group's. */
  | { type: "discMax"; colour: DiscColour; letter: string; hpMax: number | null }
  | { type: "characterHp"; id: string; change: number }
  | { type: "tempHp"; id: string; tempHp: number }
  | { type: "flipLetters"; on: boolean }
  | { type: "addCharacter"; character: CharacterFields }
  | { type: "updateCharacter"; character: Character }
  | { type: "removeCharacter"; id: string }
  | { type: "startFight" }
  | { type: "endFight" }
  | { type: "initiative"; who: Who; init: number | null }
  | { type: "swapTie"; who: Who; by: -1 | 1 }
  | { type: "nextTurn" };

/**
 * Commands the DM can take back with Undo. Switches such as the curtain, calibration drags and character cards are not
 * kept, so an undo never takes back typed HP.
 */
export const UNDOABLE: ReadonlySet<Command["type"]> = new Set([
  "placeMap",
  "moveMap",
  "turnMap",
  "removeMap",
  "fog",
  "placeDisc",
  "moveDisc",
  "removeDisc",
  "showDiscs",
  "condition",
  "group",
  "discHp",
  "discMax",
  "startFight",
  "endFight",
  "initiative",
  "swapTie",
  "nextTurn",
]);

export type TableView = "curtain" | "calibrate" | "map" | "testGrid" | "idle";

export function defaultState(): TableState {
  return {
    version: SAVE_VERSION,
    curtain: false,
    calibrating: false,
    testGrid: true,
    playerDisplayId: null,
    calibrations: {},
    map: null,
    party: [],
    fight: null,
    flipLetters: false,
    lastCharacter: 0,
    mapLocked: false,
  };
}

export function viewOf(state: TableState): TableView {
  if (state.curtain) return "curtain";
  if (state.calibrating) return "calibrate";
  if (state.map) return "map";
  return state.testGrid ? "testGrid" : "idle";
}

/** A disc as the table draws it: centre in table inches, nothing about its group or condition. */
export type PlayerDisc = { colour: DiscColour; letter: string; x: number; y: number; size: number };

/** Everything the table window receives. Built field by field, so DM-only data can't leak in by default (D-002). */
export type PlayerView = {
  view: TableView;
  calibration: Calibration | null;
  map: Pick<PlacedMap, "id" | "bounds" | "x" | "y" | "turns" | "fog"> | null;
  /** Shown discs that aren't down. */
  discs: PlayerDisc[];
  strip: Strip | null;
  /** Discs' letters face the far side of the picture (D-028). */
  flipLetters: boolean;
  grid: boolean;
};

/** The player view for the surface the table window is on now. */
export function playerViewOf(state: TableState, surfaceKey: string): PlayerView {
  const m = state.map;
  return {
    view: viewOf(state),
    calibration: state.calibrations[surfaceKey] ?? null,
    map: m && { id: m.id, bounds: m.bounds, x: m.x, y: m.y, turns: m.turns, fog: m.fog },
    discs: (m?.discs ?? [])
      .filter((d) => d.shown && conditionOf(d, m!.groups) !== "down")
      .map((d) => ({ colour: d.colour, letter: d.letter, ...mapToTable(m!, d), size: d.size })),
    strip: stripOf(state.fight, m?.discs ?? [], m?.groups ?? {}, state.party),
    flipLetters: state.flipLetters,
    grid: state.testGrid,
  };
}

// ---- Reading untrusted data: commands from the DM window and saved files ----

/** Surface keys as `playerPlacement` makes them. Anything else (such as "__proto__") is dropped. */
const SURFACE_KEY = /^(window|display:-?\d{1,20})$/;
const MAP_ID = /^map-[a-z0-9-]{1,60}$/;
const REACH_IN = 500;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** A whole number of inches within reach; `+ 0` turns -0 into 0, which is what JSON would save anyway. */
const inches = (v: unknown, min = -REACH_IN, max = REACH_IN): number | null =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) + 0 : null;

function parseCalibrations(raw: unknown): Record<string, Calibration> | null {
  if (!isObject(raw)) return null;
  const out: Record<string, Calibration> = {};
  for (const [key, value] of Object.entries(raw)) {
    const cal = parseCalibration(value);
    if (cal && SURFACE_KEY.test(key)) out[key] = cal;
  }
  return out;
}

export function parsePlacedMap(raw: unknown): PlacedMap | null {
  if (!isObject(raw) || !isObject(raw.bounds)) return null;
  const { id, name, x, y, turns } = raw;
  // Maps saved before fog existed, and maps just placed from the library, start with no fog ops: all black.
  const fog = raw.fog === undefined ? [] : parseFog(raw.fog);
  // Likewise with no discs before step 6.
  const discs = raw.discs === undefined ? [] : parseDiscs(raw.discs);
  const groups = raw.groups === undefined ? {} : parseGroups(raw.groups);
  const b = raw.bounds;
  const bounds = { x: inches(b.x), y: inches(b.y), width: inches(b.width, 1), height: inches(b.height, 1) };
  if (typeof id !== "string" || !MAP_ID.test(id) || typeof name !== "string" || name.length > 120) return null;
  if (bounds.x === null || bounds.y === null || bounds.width === null || bounds.height === null) return null;
  if (inches(x) === null || inches(y) === null || !(turns === 0 || turns === 1 || turns === 2 || turns === 3) || !fog) return null;
  if (!discs || !groups) return null;
  const at = { x: inches(x)!, y: inches(y)!, turns: (turns + 0) as PlacedMap["turns"] };
  return { id, name, bounds: bounds as Bounds, ...at, fog, discs, groups };
}

/** A command from the DM window, or null if any part is wrong. */
export function parseCommand(raw: unknown): Command | null {
  if (!isObject(raw)) return null;
  switch (raw.type) {
    case "curtain":
    case "calibrating":
    case "testGrid":
      return typeof raw.on === "boolean" ? { type: raw.type, on: raw.on } : null;
    case "playerDisplay":
      return raw.id === null
        ? { type: "playerDisplay", id: null }
        : Number.isInteger(raw.id)
          ? { type: "playerDisplay", id: (raw.id as number) + 0 }
          : null;
    case "calibrations": {
      const value = parseCalibrations(raw.value);
      return value && { type: "calibrations", value };
    }
    case "placeMap": {
      const map = parsePlacedMap(raw.map);
      return map && { type: "placeMap", map };
    }
    case "moveMap": {
      const dx = inches(raw.dx, -100, 100);
      const dy = inches(raw.dy, -100, 100);
      return dx === null || dy === null ? null : { type: "moveMap", dx, dy };
    }
    case "turnMap":
    case "removeMap":
      return { type: raw.type };
    case "fog": {
      const op = parseFogOp(raw.op);
      return op && { type: "fog", op };
    }
    case "placeDisc": {
      const size = inches(raw.size, 1, MAX_DISC_SIZE);
      const at = point(raw);
      return isColour(raw.colour) && size !== null && at ? { type: "placeDisc", colour: raw.colour, ...at, size } : null;
    }
    case "moveDisc": {
      const at = point(raw);
      return isColour(raw.colour) && isLetter(raw.letter) && at
        ? { type: "moveDisc", colour: raw.colour, letter: raw.letter, ...at }
        : null;
    }
    case "removeDisc":
      return isColour(raw.colour) && isLetter(raw.letter) ? { type: "removeDisc", colour: raw.colour, letter: raw.letter } : null;
    case "showDiscs":
      return isColour(raw.colour) && (raw.letter === null || isLetter(raw.letter)) && typeof raw.on === "boolean"
        ? { type: "showDiscs", colour: raw.colour, letter: raw.letter, on: raw.on }
        : null;
    case "condition":
      return isColour(raw.colour) && isLetter(raw.letter) && isCondition(raw.condition)
        ? { type: "condition", colour: raw.colour, letter: raw.letter, condition: raw.condition }
        : null;
    case "group": {
      const info = parseGroupInfo(raw.info);
      return isColour(raw.colour) && info && typeof raw.info === "object" ? { type: "group", colour: raw.colour, info } : null;
    }
    case "discHp": {
      const change = change999(raw.change);
      return isColour(raw.colour) && isLetter(raw.letter) && change !== null
        ? { type: "discHp", colour: raw.colour, letter: raw.letter, change }
        : null;
    }
    case "discMax": {
      const hpMax = raw.hpMax === null ? null : inches(raw.hpMax, 1, MAX_HP);
      return isColour(raw.colour) && isLetter(raw.letter) && (raw.hpMax === null || hpMax !== null)
        ? { type: "discMax", colour: raw.colour, letter: raw.letter, hpMax }
        : null;
    }
    case "characterHp": {
      const change = change999(raw.change);
      return isWho(raw.id) && !isColour(raw.id) && change !== null ? { type: "characterHp", id: raw.id, change } : null;
    }
    case "tempHp": {
      const tempHp = inches(raw.tempHp, 0, MAX_HP);
      return isWho(raw.id) && !isColour(raw.id) && tempHp !== null ? { type: "tempHp", id: raw.id, tempHp } : null;
    }
    case "flipLetters":
    case "lockMap":
      return typeof raw.on === "boolean" ? { type: raw.type, on: raw.on } : null;
    case "addCharacter": {
      const character = parseCharacterFields(raw.character);
      return character && { type: "addCharacter", character };
    }
    case "updateCharacter": {
      const [character] = parseParty([raw.character]) ?? [];
      return character ? { type: "updateCharacter", character } : null;
    }
    case "removeCharacter":
      return isWho(raw.id) && !isColour(raw.id) ? { type: "removeCharacter", id: raw.id } : null;
    case "startFight":
    case "endFight":
    case "nextTurn":
      return { type: raw.type };
    case "initiative": {
      if (!isWho(raw.who)) return null;
      if (raw.init === null) return { type: "initiative", who: raw.who, init: null };
      const init = parseInit(raw.init);
      return init === null ? null : { type: "initiative", who: raw.who, init };
    }
    case "swapTie":
      return isWho(raw.who) && (raw.by === -1 || raw.by === 1) ? { type: "swapTie", who: raw.who, by: raw.by } : null;
    default:
      return null;
  }
}

/** An HP change: a whole number from -999 to 999. */
const change999 = (v: unknown): number | null => inches(v, -MAX_HP, MAX_HP);

/** A point within reach, from a command's `x` and `y`. */
function point(raw: Record<string, unknown>): { x: number; y: number } | null {
  const ok = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= REACH_IN;
  return ok(raw.x) && ok(raw.y) ? { x: (raw.x as number) + 0, y: (raw.y as number) + 0 } : null;
}

/** Change the placed map's discs; with no map, nothing changes. */
function withDiscs(state: TableState, change: (discs: Disc[]) => Disc[]): TableState {
  return state.map ? { ...state, map: { ...state.map, discs: change(state.map.discs) } } : state;
}
const editDisc = (state: TableState, colour: DiscColour, letter: string, edit: (d: Disc) => Disc) =>
  withDiscs(state, (ds) => ds.map((d) => (sameDisc(d, colour, letter) ? edit(d) : d)));
function withFight(state: TableState, change: (f: Fight) => Fight): TableState {
  return state.fight ? { ...state, fight: change(state.fight) } : state;
}

/** The one place the table state changes. */
export function apply(state: TableState, c: Command): TableState {
  switch (c.type) {
    case "curtain":
      return { ...state, curtain: c.on };
    case "calibrating":
      return { ...state, calibrating: c.on };
    case "testGrid":
      return { ...state, testGrid: c.on };
    case "playerDisplay":
      return { ...state, playerDisplayId: c.id };
    case "calibrations":
      return { ...state, calibrations: c.value };
    case "placeMap":
      // A newly placed map is free to be put in place, then locked.
      return { ...state, map: c.map, mapLocked: false };
    case "lockMap":
      return { ...state, mapLocked: c.on };
    case "moveMap": {
      if (!state.map || state.mapLocked) return state;
      const x = inches(state.map.x + c.dx);
      const y = inches(state.map.y + c.dy);
      return x === null || y === null ? state : { ...state, map: { ...state.map, x, y } };
    }
    case "turnMap":
      return state.map && !state.mapLocked
        ? { ...state, map: { ...state.map, turns: ((state.map.turns + 1) % 4) as PlacedMap["turns"] } }
        : state;
    case "removeMap":
      return state.mapLocked ? state : { ...state, map: null };
    case "fog":
      return state.map ? { ...state, map: { ...state.map, fog: addFog(state.map.fog, c.op, state.map.bounds) } } : state;
    case "placeDisc":
      return withDiscs(state, (ds) => placeDisc(ds, c.colour, c, c.size));
    case "moveDisc":
      return editDisc(state, c.colour, c.letter, (d) => ({ ...d, ...snapDisc(c, d.size) }));
    case "removeDisc":
      return withDiscs(state, (ds) => ds.filter((d) => !sameDisc(d, c.colour, c.letter)));
    case "showDiscs":
      return withDiscs(state, (ds) =>
        ds.map((d) => (d.colour === c.colour && (c.letter === null || d.letter === c.letter) ? { ...d, shown: c.on } : d)),
      );
    case "condition":
      return editDisc(state, c.colour, c.letter, (d) => ({ ...d, condition: c.condition }));
    case "group":
      return state.map ? { ...state, map: { ...state.map, groups: { ...state.map.groups, [c.colour]: c.info } } } : state;
    case "discHp":
      return state.map ? editDisc(state, c.colour, c.letter, (d) => changeDiscHp(d, state.map!.groups, c.change)) : state;
    case "discMax":
      return editDisc(state, c.colour, c.letter, (d) => ({ ...d, hpMax: c.hpMax }));
    case "characterHp":
      return { ...state, party: state.party.map((p) => (p.id === c.id ? changeCharacterHp(p, c.change) : p)) };
    case "tempHp":
      return { ...state, party: state.party.map((p) => (p.id === c.id ? { ...p, tempHp: c.tempHp } : p)) };
    case "flipLetters":
      return { ...state, flipLetters: c.on };
    case "addCharacter": {
      if (state.party.length >= MAX_PARTY) return state;
      const n = Math.max(state.lastCharacter, ...state.party.map((p) => Number(p.id.slice(3)))) + 1;
      return n > 999 ? state : { ...state, party: [...state.party, { id: `pc-${n}`, ...c.character }], lastCharacter: n };
    }
    case "updateCharacter":
      return { ...state, party: state.party.map((p) => (p.id === c.character.id ? c.character : p)) };
    case "removeCharacter": {
      const next = { ...state, party: state.party.filter((p) => p.id !== c.id) };
      return withFight(next, (f) => setInitiative(f, c.id, null));
    }
    case "startFight":
      return state.fight ? state : { ...state, fight: { entries: [], current: null, round: 0 } };
    case "endFight":
      return { ...state, fight: null };
    case "initiative":
      return withFight(state, (f) => setInitiative(f, c.who, c.init));
    case "swapTie":
      return withFight(state, (f) => swapTie(f, c.who, c.by));
    case "nextTurn":
      return withFight(state, (f) => nextTurn(f, (who) => takesTurns(who, state.map?.discs ?? [], state.map?.groups ?? {}, state.party)));
  }
}

/**
 * After an undo that kept today's party: drop initiative entries for characters who are no longer in it, handing on
 * the turn if it was theirs (D-027: cards are outside undo, the fight is not).
 */
export function dropMissingCharacters(state: TableState): TableState {
  const gone = (state.fight?.entries ?? []).filter((e) => !isColour(e.who) && !state.party.some((p) => p.id === e.who));
  return gone.reduce((s, e) => withFight(s, (f) => setInitiative(f, e.who, null)), state);
}

export type ParsedSave = { ok: true; state: TableState } | { ok: false; reason: string };

/** Read a saved state. Older versions upgrade here; anything unreadable is reported, never guessed (GAME-05). */
export function parseSave(text: string): ParsedSave {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }
  if (!isObject(raw)) return { ok: false, reason: "not an object" };
  // Older versions read the same; fields they lack (calibrations, map, a map's fog and discs, party, fight) start at their defaults.
  if (![1, 2, 3, 4, 5, 6, SAVE_VERSION].includes(raw.version as number)) {
    return { ok: false, reason: `save version ${String(raw.version)} is newer or unknown (this app reads 1 to ${SAVE_VERSION})` };
  }
  // Each field goes through the same checks as a command, so a hand-edited save can't hold what the DM couldn't set.
  const fields: unknown[] = [
    { type: "curtain", on: raw.curtain },
    { type: "calibrating", on: raw.calibrating },
    { type: "testGrid", on: raw.testGrid },
    { type: "playerDisplay", id: raw.playerDisplayId },
    { type: "calibrations", value: raw.calibrations },
    { type: "placeMap", map: raw.map },
    // After the map, which places it unlocked.
    { type: "lockMap", on: raw.mapLocked },
    { type: "flipLetters", on: raw.flipLetters },
  ];
  const state = fields.reduce<TableState>((s, f) => {
    const c = parseCommand(f);
    return c ? apply(s, c) : s;
  }, defaultState());
  // Character cards and the fight have no command that sets them whole; they get the same checks through their parsers.
  // A typed party is never dropped quietly: a bad one keeps the whole file aside (GAME-05).
  const party = raw.party === undefined ? [] : parseParty(raw.party);
  const fight = raw.fight === undefined || raw.fight === null ? null : parseFight(raw.fight);
  if (!party) return { ok: false, reason: "the character cards can't be read" };
  // The map now carries typed group info and HP too, so it isn't dropped quietly either.
  if (raw.map != null && !state.map) return { ok: false, reason: "the map, its fog or its discs can't be read" };
  if (fight === null && raw.fight != null) return { ok: false, reason: "the initiative order can't be read" };
  const lastCharacter =
    Number.isInteger(raw.lastCharacter) && (raw.lastCharacter as number) >= 0 && (raw.lastCharacter as number) <= 999
      ? (raw.lastCharacter as number) + 0
      : 0;
  return { ok: true, state: { ...state, party, fight, lastCharacter } };
}

/** Compact JSON: with fog, an indented save is about three times bigger and slower to write after every change. */
export function serialize(state: TableState): string {
  return JSON.stringify(state) + "\n";
}
