// What the table shows. Pure data and functions: no Electron, no clock, no randomness (GAME-01).

const SAVE_VERSION = 1;

export type TableState = {
  version: typeof SAVE_VERSION;
  /** Blank the table while the DM sets up. Wins over everything else. */
  curtain: boolean;
  /** Show the projector test grid (uncalibrated until step 2). */
  testGrid: boolean;
  /** Display the player window should use; null means pick automatically. */
  playerDisplayId: number | null;
};

export type TablePatch = Partial<Omit<TableState, "version">>;

export type TableView = "curtain" | "testGrid" | "idle";

export function defaultState(): TableState {
  return { version: SAVE_VERSION, curtain: false, testGrid: true, playerDisplayId: null };
}

export function viewOf(state: TableState): TableView {
  if (state.curtain) return "curtain";
  return state.testGrid ? "testGrid" : "idle";
}

/** Everything the table window receives. Built field by field, so DM-only data can't leak in by default (D-002). */
export type PlayerView = { view: TableView };

export function playerViewOf(state: TableState): PlayerView {
  return { view: viewOf(state) };
}

/** Apply a patch from the DM window, ignoring fields with the wrong type. */
export function applyPatch(state: TableState, patch: unknown): TableState {
  if (typeof patch !== "object" || patch === null) return state;
  const p = patch as Record<string, unknown>;
  const next = { ...state };
  if (typeof p.curtain === "boolean") next.curtain = p.curtain;
  if (typeof p.testGrid === "boolean") next.testGrid = p.testGrid;
  if (p.playerDisplayId === null || Number.isInteger(p.playerDisplayId)) next.playerDisplayId = p.playerDisplayId as number | null;
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
  if (version !== SAVE_VERSION) {
    return { ok: false, reason: `save version ${String(version)} is not ${SAVE_VERSION}` };
  }
  return { ok: true, state: applyPatch(defaultState(), raw) };
}

export function serialize(state: TableState): string {
  return JSON.stringify(state, null, 2) + "\n";
}
