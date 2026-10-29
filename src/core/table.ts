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
  tokenLook,
  type CreatureType,
} from "./fight.ts";
import { addFog, parseFog, parseFogOp, type FogOp } from "./fog.ts";
import { mapToTable, type Bounds } from "./map.ts";
import type { Point } from "./homography.ts";

const SAVE_VERSION = 13;
/** Pins on one map at most: plenty for marks, and a stuck pen can't fill the save. */
export const MAX_PINS = 40;

/** A lasting mark on the map (D-034), in the map's own inches so it moves and turns with it. `table`: players see it; else only the DM. */
type Pin = { id: number; x: number; y: number; table: boolean };

/** Pen colours (D-035): white and two that no disc uses, so a line never reads as an enemy group. */
export const INKS = ["white", "cyan", "pink"] as const;
export type Ink = (typeof INKS)[number];
/** Lasting drawings on one map, and points in one line, at most: plenty for paths and areas, and saves stay small. */
export const MAX_DRAWINGS = 100;
export const MAX_LINE_POINTS = 400;
/** A lasting freehand line (D-035), in the map's own inches. `table`: players see it; else only the DM. */
type Drawing = { id: number; ink: Ink; table: boolean; points: Point[] };

const FEET_PER_SQUARE = [5, 10] as const;
export type FeetPerSquare = (typeof FEET_PER_SQUARE)[number];
/** Feet per square from untrusted data; maps from before D-036 are 5 ft. */
export function parseFeetPerSquare(raw: unknown): FeetPerSquare | null {
  if (raw === undefined) return 5;
  return FEET_PER_SQUARE.includes(raw as FeetPerSquare) ? (((raw as number) + 0) as FeetPerSquare) : null;
}

/** A straightened map from the personal library (D-010), placed on the table. Positions are in inches (D-005). */
export type PlacedMap = {
  /** The library file's id. */
  id: string;
  /** The DM's name for it. DM-only: it never goes to the table window. */
  name: string;
  /** The image's extent around its marked rectangle's top-left corner, in inches. */
  bounds: Bounds;
  /** Feet one square stands for (D-036). A square is always 1 inch on the table; later tools (ruler, sizes) count in feet. */
  feetPerSquare: FeetPerSquare;
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
  /** Pins (D-034). A newly placed map has none. */
  pins: Pin[];
  /** Lasting freehand lines (D-035). A newly placed map has none. */
  drawings: Drawing[];
};

/** What a scene keeps besides its name (D-039). The current scene's lives in the state's own `map`, `fight` and `mapLocked`. */
export type SceneContent = { map: PlacedMap | null; fight: Fight | null; mapLocked: boolean };
/**
 * A place prepared for the table (D-039). `parked` holds the content of every scene but the current one, which is the
 * only scene with none. `name` is DM-only, like a map's, and empty until the DM names it (the list shows its map's name).
 * A removed scene waits in the Removed list until the DM empties it.
 */
export type Scene = { id: string; name: string; removed: boolean; parked: SceneContent | null };
/** Scenes at most, the Removed list included: a busy adventure has a few dozen places, and the save stays small. */
const MAX_SCENES = 60;
export const MAX_SCENE_NAME = 60;

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
  /** Every scene in the DM's order (D-039), and which one is on the table. */
  scenes: Scene[];
  scene: string;
  /** The highest scene id number given out, so a removed scene's id is never reused (and its undo steps never apply elsewhere). */
  lastScene: number;
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
  /** A physical mini stands on this disc, or no longer does (D-036). */
  | { type: "discMini"; colour: DiscColour; letter: string; on: boolean }
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
  | { type: "nextTurn" }
  /** A pin where the DM long-pressed with Ping, in map inches (D-034). */
  | { type: "placePin"; x: number; y: number; table: boolean }
  | { type: "removePin"; id: number }
  | { type: "clearPins" }
  /** A lasting line drawn with Draw, in map inches (D-035). Fading lines are moments, like pings, and never come here. */
  | { type: "draw"; ink: Ink; table: boolean; points: Point[] }
  | { type: "removeDrawing"; id: number }
  | { type: "clearDrawings" }
  /** A new, empty scene after the current one, switched to with the curtain down (D-039). */
  | { type: "addScene"; name: string }
  /** Put another scene on the table. The curtain drops in the same step, so the table never shows a frame of it early. */
  | { type: "switchScene"; id: string }
  | { type: "renameScene"; id: string; name: string }
  | { type: "moveScene"; id: string; by: -1 | 1 }
  /** A copy of a scene with everything in it, placed after it. */
  | { type: "copyScene"; id: string }
  /** Move a scene to the Removed list, or back. The current scene can't be removed. */
  | { type: "removeScene"; id: string; on: boolean }
  | { type: "emptyRemoved" };

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
  "discMini",
  "startFight",
  "endFight",
  "initiative",
  "swapTie",
  "nextTurn",
  "placePin",
  "removePin",
  "clearPins",
  "draw",
  "removeDrawing",
  "clearDrawings",
]);

export type TableView = "curtain" | "calibrate" | "map" | "testGrid" | "idle";

const FIRST_SCENE: Scene = { id: "scene-1", name: "", removed: false, parked: null };

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
    scenes: [FIRST_SCENE],
    scene: FIRST_SCENE.id,
    lastScene: 1,
  };
}

/** A scene's content: the state's own for the current scene, else what is parked. */
export function sceneContent(state: TableState, scene: Scene): SceneContent {
  return scene.parked ?? { map: state.map, fight: state.fight, mapLocked: state.mapLocked };
}

/** What the scene list calls a scene: its name, else its map's, else "Empty scene". DM-only (D-039). */
export function sceneTitle(state: TableState, scene: Scene): string {
  return scene.name || sceneContent(state, scene).map?.name || "Empty scene";
}

/**
 * The state as the DM window gets it: waiting scenes without their fog, discs, groups, pins and drawings. The scene
 * list only shows their names, maps and fights, and every change copies the state into the window (D-029).
 */
export function dmStateOf(state: TableState): TableState {
  const light = (c: SceneContent): SceneContent => ({
    ...c,
    map: c.map && { ...c.map, fog: [], discs: [], groups: {}, pins: [], drawings: [] },
  });
  return { ...state, scenes: state.scenes.map((s) => (s.parked ? { ...s, parked: light(s.parked) } : s)) };
}

/** The scenes in the list, in order, and those in the Removed list. */
export const listedScenes = (state: TableState) => state.scenes.filter((s) => !s.removed);
export const removedScenes = (state: TableState) => state.scenes.filter((s) => s.removed);

export function viewOf(state: TableState): TableView {
  if (state.curtain) return "curtain";
  if (state.calibrating) return "calibrate";
  if (state.map) return "map";
  return state.testGrid ? "testGrid" : "idle";
}

/** A disc as the table draws it: centre in table inches, nothing about its group or condition. */
/**
 * A disc as the players see it. Once the DM taps Reveal, `symbol` is its group's creature-type symbol and `portrait`
 * a key to its picture: the only things from the DM's group info that reach the table, never its name or stats
 * (D-036). `mini`: its letter goes on a tab below, clear of the mini standing on it.
 */
export type PlayerDisc = {
  colour: DiscColour;
  letter: string;
  x: number;
  y: number;
  size: number;
  symbol: CreatureType | null;
  /** The key the table loads the group's portrait by, or null (`tokenLook`). */
  portrait: string | null;
  mini: boolean;
};

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
  /** Pins the players may see, in table inches (D-034); the DM's own pins never come here. */
  pins: Point[];
  /** Lasting lines the players may see, in table inches (D-035). */
  drawings: { ink: Ink; points: Point[] }[];
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
      .map((d) => {
        const look = tokenLook(d, m!.groups);
        return { colour: d.colour, letter: d.letter, ...mapToTable(m!, d), size: d.size, ...look, mini: d.mini };
      }),
    strip: stripOf(state.fight, m?.discs ?? [], m?.groups ?? {}, state.party),
    flipLetters: state.flipLetters,
    grid: state.testGrid,
    pins: (m?.pins ?? []).filter((p) => p.table).map((p) => mapToTable(m!, p)),
    drawings: (m?.drawings ?? []).filter((d) => d.table).map((d) => ({ ink: d.ink, points: d.points.map((p) => mapToTable(m!, p)) })),
  };
}

// ---- Reading untrusted data: commands from the DM window and saved files ----

/** Surface keys as `playerPlacement` makes them. Anything else (such as "__proto__") is dropped. */
const SURFACE_KEY = /^(window|display:-?\d{1,20})$/;
const MAP_ID = /^map-[a-z0-9-]{1,60}$/;
const SCENE_ID = /^scene-\d{1,3}$/;
const isSceneId = (v: unknown): v is string => typeof v === "string" && SCENE_ID.test(v);
const sceneName = (v: unknown): string | null => (typeof v === "string" && v.length <= MAX_SCENE_NAME ? v : null);
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
  // And with no pins before step 7.
  const pins = raw.pins === undefined ? [] : parsePins(raw.pins);
  // And with no drawings before freehand drawing.
  const drawings = raw.drawings === undefined ? [] : parseDrawings(raw.drawings);
  const feetPerSquare = parseFeetPerSquare(raw.feetPerSquare);
  const b = raw.bounds;
  const bounds = { x: inches(b.x), y: inches(b.y), width: inches(b.width, 1), height: inches(b.height, 1) };
  if (typeof id !== "string" || !MAP_ID.test(id) || typeof name !== "string" || name.length > 120) return null;
  if (bounds.x === null || bounds.y === null || bounds.width === null || bounds.height === null) return null;
  if (inches(x) === null || inches(y) === null || !(turns === 0 || turns === 1 || turns === 2 || turns === 3) || !fog) return null;
  if (!discs || !groups || !pins || !drawings || !feetPerSquare) return null;
  const at = { x: inches(x)!, y: inches(y)!, turns: (turns + 0) as PlacedMap["turns"] };
  return { id, name, bounds: bounds as Bounds, feetPerSquare, ...at, fog, discs, groups, pins, drawings };
}

/** A line's points: 2 to MAX_LINE_POINTS, each in reach, rounded to hundredths of an inch. */
export function parseLine(raw: unknown): Point[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_LINE_POINTS) return null;
  const points: Point[] = [];
  for (const p of raw) {
    const at = isObject(p) ? point(p) : null;
    if (!at) return null;
    points.push({ x: hundredths(at.x), y: hundredths(at.y) });
  }
  return points;
}
const isInk = (v: unknown): v is Ink => INKS.includes(v as Ink);

/** Saved drawings: each id once, at most MAX_DRAWINGS, each line readable. */
function parseDrawings(raw: unknown): Drawing[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_DRAWINGS) return null;
  const out: Drawing[] = [];
  for (const d of raw) {
    const r = isObject(d) ? d : {};
    const id = inches(r.id, 1, 99_999);
    const points = parseLine(r.points);
    if (id === null || !points || !isInk(r.ink) || typeof r.table !== "boolean" || out.some((q) => q.id === id)) return null;
    out.push({ id, ink: r.ink, table: r.table, points });
  }
  return out;
}

/** Saved pins: each id once, at most MAX_PINS, each in reach. Anything else and the list isn't read. */
function parsePins(raw: unknown): Pin[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_PINS) return null;
  const pins: Pin[] = [];
  for (const p of raw) {
    const at = isObject(p) ? point(p) : null;
    const id = isObject(p) ? inches(p.id, 1, 99_999) : null;
    if (!at || id === null || typeof (p as Pin).table !== "boolean" || pins.some((q) => q.id === id)) return null;
    pins.push({ id, ...at, table: (p as Pin).table });
  }
  return pins;
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
    case "discMini":
      return isColour(raw.colour) && isLetter(raw.letter) && typeof raw.on === "boolean"
        ? { type: "discMini", colour: raw.colour, letter: raw.letter, on: raw.on }
        : null;
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
    case "placePin": {
      const at = point(raw);
      return at && typeof raw.table === "boolean" ? { type: "placePin", ...at, table: raw.table } : null;
    }
    case "removePin": {
      const id = inches(raw.id, 1, 99_999);
      return id === null ? null : { type: "removePin", id };
    }
    case "clearPins":
      return { type: "clearPins" };
    case "draw": {
      const points = parseLine(raw.points);
      return points && isInk(raw.ink) && typeof raw.table === "boolean" ? { type: "draw", ink: raw.ink, table: raw.table, points } : null;
    }
    case "removeDrawing": {
      const id = inches(raw.id, 1, 99_999);
      return id === null ? null : { type: "removeDrawing", id };
    }
    case "clearDrawings":
    case "emptyRemoved":
      return { type: raw.type };
    case "addScene": {
      const name = sceneName(raw.name);
      return name === null ? null : { type: "addScene", name };
    }
    case "switchScene":
    case "copyScene":
      return isSceneId(raw.id) ? { type: raw.type, id: raw.id } : null;
    case "renameScene": {
      const name = sceneName(raw.name);
      return isSceneId(raw.id) && name !== null ? { type: "renameScene", id: raw.id, name } : null;
    }
    case "moveScene":
      return isSceneId(raw.id) && (raw.by === -1 || raw.by === 1) ? { type: "moveScene", id: raw.id, by: raw.by } : null;
    case "removeScene":
      return isSceneId(raw.id) && typeof raw.on === "boolean" ? { type: "removeScene", id: raw.id, on: raw.on } : null;
    default:
      return null;
  }
}

/** An HP change: a whole number from -999 to 999. */
const change999 = (v: unknown): number | null => inches(v, -MAX_HP, MAX_HP);

const hundredths = (v: number) => Math.round(v * 100) / 100 + 0;

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

/** A new scene id, or null when the list is full. */
function newScene(state: TableState): { id: string; lastScene: number } | null {
  const n = state.lastScene + 1;
  return state.scenes.length >= MAX_SCENES || n > 999 ? null : { id: `scene-${n}`, lastScene: n };
}

/** Make `id` the current scene: park the one on the table now and bring the other's content out. */
function switchTo(state: TableState, id: string): TableState {
  const target = state.scenes.find((s) => s.id === id);
  if (!target?.parked || target.removed) return state;
  const here = sceneContent(
    state,
    state.scenes.find((s) => s.id === state.scene)!,
  );
  const scenes = state.scenes.map((s) => (s.id === state.scene ? { ...s, parked: here } : s.id === id ? { ...s, parked: null } : s));
  // A character removed while this scene's fight was paused leaves its turn order now (D-027).
  return dropMissingCharacters({ ...state, ...target.parked, scenes, scene: id, curtain: true });
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
      // A newly placed map starts locked, so dragging pans the view; unlocking it lets it move on the table (D-032). The
      // test grid goes off: over a map it is only for checking the squares line up, and the DM turns it on for that (D-034).
      return { ...state, map: c.map, mapLocked: true, testGrid: false };
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
    case "discMini":
      return editDisc(state, c.colour, c.letter, (d) => ({ ...d, mini: c.on }));
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
    case "placePin": {
      const m = state.map;
      if (!m || m.pins.length >= MAX_PINS) return state;
      // Hundredths of an inch: finer than anyone can place, and saves stay short.
      const pin = { id: Math.max(0, ...m.pins.map((p) => p.id)) + 1, x: hundredths(c.x), y: hundredths(c.y), table: c.table };
      return { ...state, map: { ...m, pins: [...m.pins, pin] } };
    }
    case "removePin":
      return state.map?.pins.some((p) => p.id === c.id)
        ? { ...state, map: { ...state.map, pins: state.map.pins.filter((p) => p.id !== c.id) } }
        : state;
    case "clearPins":
      return state.map?.pins.length ? { ...state, map: { ...state.map, pins: [] } } : state;
    case "draw": {
      const m = state.map;
      if (!m || m.drawings.length >= MAX_DRAWINGS) return state;
      const line = { id: Math.max(0, ...m.drawings.map((d) => d.id)) + 1, ink: c.ink, table: c.table, points: c.points };
      return { ...state, map: { ...m, drawings: [...m.drawings, line] } };
    }
    case "removeDrawing":
      return state.map?.drawings.some((d) => d.id === c.id)
        ? { ...state, map: { ...state.map, drawings: state.map.drawings.filter((d) => d.id !== c.id) } }
        : state;
    case "clearDrawings":
      return state.map?.drawings.length ? { ...state, map: { ...state.map, drawings: [] } } : state;
    case "addScene": {
      const made = newScene(state);
      if (!made) return state;
      const at = state.scenes.findIndex((s) => s.id === state.scene) + 1;
      const empty: SceneContent = { map: null, fight: null, mapLocked: false };
      const scenes = state.scenes.toSpliced(at, 0, { id: made.id, name: c.name, removed: false, parked: empty });
      return switchTo({ ...state, scenes, lastScene: made.lastScene }, made.id);
    }
    case "switchScene":
      return switchTo(state, c.id);
    case "renameScene":
      return state.scenes.some((s) => s.id === c.id)
        ? { ...state, scenes: state.scenes.map((s) => (s.id === c.id ? { ...s, name: c.name } : s)) }
        : state;
    case "moveScene": {
      // Past the neighbour in the list; scenes in the Removed list keep their places.
      const listed = listedScenes(state);
      const i = listed.findIndex((s) => s.id === c.id);
      const other = listed[i + c.by];
      if (i < 0 || !other) return state;
      const [a, b] = [state.scenes.indexOf(listed[i]!), state.scenes.indexOf(other)];
      const scenes = [...state.scenes];
      [scenes[a], scenes[b]] = [scenes[b]!, scenes[a]!];
      return { ...state, scenes };
    }
    case "copyScene": {
      const source = state.scenes.find((s) => s.id === c.id);
      const made = newScene(state);
      if (!source || source.removed || !made) return state;
      const name = `${sceneTitle(state, source)} copy`.slice(0, MAX_SCENE_NAME);
      const copy = { id: made.id, name, removed: false, parked: sceneContent(state, source) };
      return { ...state, scenes: state.scenes.toSpliced(state.scenes.indexOf(source) + 1, 0, copy), lastScene: made.lastScene };
    }
    case "removeScene":
      return c.id !== state.scene && state.scenes.some((s) => s.id === c.id && s.removed !== c.on)
        ? { ...state, scenes: state.scenes.map((s) => (s.id === c.id ? { ...s, removed: c.on } : s)) }
        : state;
    case "emptyRemoved":
      return state.scenes.some((s) => s.removed) ? { ...state, scenes: listedScenes(state) } : state;
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

/** A parked scene's content from a save, through the same parsers as the current one; null if any part is wrong. */
function parseContent(raw: unknown): SceneContent | null {
  if (!isObject(raw) || typeof raw.mapLocked !== "boolean") return null;
  const map = raw.map === null ? null : parsePlacedMap(raw.map);
  const fight = raw.fight === null ? null : parseFight(raw.fight);
  if ((raw.map !== null && !map) || (raw.fight !== null && !fight)) return null;
  return { map, fight, mapLocked: raw.mapLocked };
}

/** The saved scene list: each id once, and exactly one scene with no parked content, the current one. */
function parseScenes(raw: unknown, current: unknown): Scene[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_SCENES) return null;
  const scenes: Scene[] = [];
  for (const s of raw) {
    if (!isObject(s) || !isSceneId(s.id) || typeof s.removed !== "boolean" || scenes.some((q) => q.id === s.id)) return null;
    const name = sceneName(s.name);
    const parked = s.parked === null ? null : parseContent(s.parked);
    if (name === null || (s.parked !== null && !parked)) return null;
    scenes.push({ id: s.id, name, removed: s.removed, parked });
  }
  const here = scenes.filter((s) => !s.parked);
  return here.length === 1 && here[0]!.id === current && !here[0]!.removed ? scenes : null;
}

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
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, SAVE_VERSION].includes(raw.version as number)) {
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
    // After the map, which places it locked and switches the test grid off.
    { type: "lockMap", on: raw.mapLocked },
    { type: "testGrid", on: raw.testGrid },
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
  // Saves before scenes (D-039) hold one map: it becomes the first scene. Scenes hold prepared places, so a bad list
  // keeps the whole file aside rather than dropping them.
  const scenes = raw.scenes === undefined ? state.scenes : parseScenes(raw.scenes, raw.scene);
  if (!scenes) return { ok: false, reason: "the scenes can't be read" };
  const numbers = scenes.map((s) => Number(s.id.slice(6)));
  const saved = Number.isInteger(raw.lastScene) && (raw.lastScene as number) <= 999 ? (raw.lastScene as number) + 0 : 0;
  const lastScene = Math.max(saved, ...numbers);
  const scene = scenes.find((s) => !s.parked)!.id;
  return { ok: true, state: { ...state, party, fight, lastCharacter, scenes, scene, lastScene } };
}

/** Compact JSON: with fog, an indented save is about three times bigger and slower to write after every change. */
export function serialize(state: TableState): string {
  return JSON.stringify(state) + "\n";
}
