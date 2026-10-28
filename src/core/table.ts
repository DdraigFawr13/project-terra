// What the table shows. Pure data and functions: no Electron, no clock, no randomness (GAME-01).
import { parseCalibration, type Calibration } from "./calibration.ts";

const SAVE_VERSION = 2;

export type TableState = {
  version: typeof SAVE_VERSION;
  /** Blank the table while the DM sets up. Wins over everything else. */
  curtain: boolean;
  /** Show the calibration pattern while the DM drags the corners. */
  calibrating: boolean;
  /** Show the 1-inch test grid. */
  testGrid: boolean;
  /** Display the player window should use; null means pick automatically. */
  playerDisplayId: number | null;
  /** One calibration per table surface (see `surfaceKey` in displays.ts). */
  calibrations: Record<string, Calibration>;
};

export type TablePatch = Partial<Omit<TableState, "version">>;

export type TableView = "curtain" | "calibrate" | "testGrid" | "idle";

export function defaultState(): TableState {
  return { version: SAVE_VERSION, curtain: false, calibrating: false, testGrid: true, playerDisplayId: null, calibrations: {} };
}

export function viewOf(state: TableState): TableView {
  if (state.curtain) return "curtain";
  if (state.calibrating) return "calibrate";
  return state.testGrid ? "testGrid" : "idle";
}

/** Everything the table window receives. Built field by field, so DM-only data can't leak in by default (D-002). */
export type PlayerView = { view: TableView; calibration: Calibration | null };

/** The player view for the surface the table window is on now. */
export function playerViewOf(state: TableState, surfaceKey: string): PlayerView {
  return { view: viewOf(state), calibration: state.calibrations[surfaceKey] ?? null };
}

/** Surface keys as `playerPlacement` makes them. Anything else (such as "__proto__") is dropped. */
const SURFACE_KEY = /^(window|display:-?\d{1,20})$/;

function parseCalibrations(raw: unknown): Record<string, Calibration> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const out: Record<string, Calibration> = {};
  for (const [key, value] of Object.entries(raw)) {
    const cal = parseCalibration(value);
    if (cal && SURFACE_KEY.test(key)) out[key] = cal;
  }
  return out;
}

/** Apply a patch from the DM window, ignoring fields with the wrong type. */
export function applyPatch(state: TableState, patch: unknown): TableState {
  if (typeof patch !== "object" || patch === null) return state;
  const p = patch as Record<string, unknown>;
  const next = { ...state };
  if (typeof p.curtain === "boolean") next.curtain = p.curtain;
  if (typeof p.calibrating === "boolean") next.calibrating = p.calibrating;
  if (typeof p.testGrid === "boolean") next.testGrid = p.testGrid;
  // `+ 0` turns -0 into 0, which is what JSON would save anyway.
  if (p.playerDisplayId === null || Number.isInteger(p.playerDisplayId))
    next.playerDisplayId = p.playerDisplayId === null ? null : (p.playerDisplayId as number) + 0;
  const calibrations = parseCalibrations(p.calibrations);
  if (calibrations) next.calibrations = calibrations;
  return next;
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
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "not an object" };
  const version = (raw as { version?: unknown }).version;
  // Version 1 had no calibrations; its fields read the same, and the new ones start at their defaults.
  if (version !== 1 && version !== SAVE_VERSION) {
    return { ok: false, reason: `save version ${String(version)} is newer or unknown (this app reads 1 to ${SAVE_VERSION})` };
  }
  return { ok: true, state: applyPatch(defaultState(), raw) };
}

export function serialize(state: TableState): string {
  return JSON.stringify(state, null, 2) + "\n";
}
