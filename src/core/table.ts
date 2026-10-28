// What the table shows. Pure data and functions: no Electron, no clock, no randomness (GAME-01).
// Every change is a command applied by `apply` (D-024), so the same commands always give the same state (GAME-02).
import { parseCalibration, type Calibration } from "./calibration.ts";
import type { Bounds } from "./map.ts";

const SAVE_VERSION = 3;

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
  | { type: "removeMap" };

/** Commands the DM can take back with Undo. Switches such as the curtain, and calibration drags, are not kept. */
export const UNDOABLE: ReadonlySet<Command["type"]> = new Set(["placeMap", "moveMap", "turnMap", "removeMap"]);

export type TableView = "curtain" | "calibrate" | "map" | "testGrid" | "idle";

export function defaultState(): TableState {
  return { version: SAVE_VERSION, curtain: false, calibrating: false, testGrid: true, playerDisplayId: null, calibrations: {}, map: null };
}

export function viewOf(state: TableState): TableView {
  if (state.curtain) return "curtain";
  if (state.calibrating) return "calibrate";
  if (state.map) return "map";
  return state.testGrid ? "testGrid" : "idle";
}

/** Everything the table window receives. Built field by field, so DM-only data can't leak in by default (D-002). */
export type PlayerView = {
  view: TableView;
  calibration: Calibration | null;
  map: Omit<PlacedMap, "name"> | null;
  grid: boolean;
};

/** The player view for the surface the table window is on now. */
export function playerViewOf(state: TableState, surfaceKey: string): PlayerView {
  const m = state.map;
  return {
    view: viewOf(state),
    calibration: state.calibrations[surfaceKey] ?? null,
    map: m && { id: m.id, bounds: m.bounds, x: m.x, y: m.y, turns: m.turns },
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
  const b = raw.bounds;
  const bounds = { x: inches(b.x), y: inches(b.y), width: inches(b.width, 1), height: inches(b.height, 1) };
  if (typeof id !== "string" || !MAP_ID.test(id) || typeof name !== "string" || name.length > 120) return null;
  if (bounds.x === null || bounds.y === null || bounds.width === null || bounds.height === null) return null;
  if (inches(x) === null || inches(y) === null || !(turns === 0 || turns === 1 || turns === 2 || turns === 3)) return null;
  return { id, name, bounds: bounds as Bounds, x: inches(x)!, y: inches(y)!, turns: (turns + 0) as PlacedMap["turns"] };
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
    default:
      return null;
  }
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
      return { ...state, map: c.map };
    case "moveMap": {
      if (!state.map) return state;
      const x = inches(state.map.x + c.dx);
      const y = inches(state.map.y + c.dy);
      return x === null || y === null ? state : { ...state, map: { ...state.map, x, y } };
    }
    case "turnMap":
      return state.map ? { ...state, map: { ...state.map, turns: ((state.map.turns + 1) % 4) as PlacedMap["turns"] } } : state;
    case "removeMap":
      return { ...state, map: null };
  }
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
  // Versions 1 and 2 read the same; fields they lack (calibrations, map) start at their defaults.
  if (raw.version !== 1 && raw.version !== 2 && raw.version !== SAVE_VERSION) {
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
  ];
  const state = fields.reduce<TableState>((s, f) => {
    const c = parseCommand(f);
    return c ? apply(s, c) : s;
  }, defaultState());
  return { ok: true, state };
}

export function serialize(state: TableState): string {
  return JSON.stringify(state, null, 2) + "\n";
}
