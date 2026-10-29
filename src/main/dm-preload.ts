// The DM window's only bridge to the main process. The page gets these calls and nothing else.
import { contextBridge, ipcRenderer } from "electron";
import type { Command, FeetPerSquare, Ink, TableState } from "../core/table.ts";
import type { Point } from "../core/homography.ts";
import type { LibraryMap } from "./library.ts";
import type { ImportResult } from "./creatures.ts";
import type { CreatureHit, StatBlock } from "../core/creatures.ts";
import type { Bounds } from "../core/map.ts";
import type { DisplayInfo } from "../core/displays.ts";
import type { Surface } from "../core/calibration.ts";

export type TableStatus = {
  displays: DisplayInfo[];
  playerDisplayId: number | null;
  fullscreen: boolean;
  /** Which calibration the table uses now (`display:<id>` on a projector, `window` in a normal window). */
  surfaceKey: string;
  surface: Surface;
  /** A problem to show the DM, or null. */
  notice: string | null;
};

/** An earlier save: its file name, when it was kept, and a line on what it holds. */
export type Backup = { name: string; at: number; holds: string };

const api = {
  getState: (): Promise<TableState> => ipcRenderer.invoke("state:get"),
  /** Resolves once the main process has taken the command; the new state arrives through `onState` first. */
  apply: (command: Command): Promise<void> => ipcRenderer.invoke("state:apply", command),
  undo: (): Promise<void> => ipcRenderer.invoke("state:undo"),
  /** Ping the table at (x, y) in table inches: rings for about 2 seconds, nothing saved (D-034). */
  ping: (x: number, y: number): Promise<void> => ipcRenderer.invoke("table:ping", x, y),
  /** A fading line on the table, in table inches: gone in about 10 seconds, nothing saved (D-035). */
  sketch: (ink: Ink, points: Point[]): Promise<void> => ipcRenderer.invoke("table:sketch", ink, points),
  canUndo: (): Promise<boolean> => ipcRenderer.invoke("history:get"),
  /** The earlier saves, newest first (D-037). */
  listBackups: (): Promise<Backup[]> => ipcRenderer.invoke("backups:list"),
  /** Make an earlier save current; resolves with why not, or null. */
  restoreBackup: (name: string): Promise<string | null> => ipcRenderer.invoke("backups:restore", name),
  /** The problem report's text, to copy and paste to Claude (D-037). */
  problemReport: (): Promise<string> => ipcRenderer.invoke("report:get"),
  onHistory: (fn: (canUndo: boolean) => void) => ipcRenderer.on("history:changed", (_e, can: boolean) => fn(can)),
  listMaps: (): Promise<LibraryMap[]> => ipcRenderer.invoke("library:list"),
  saveMap: (name: string, png: Uint8Array, bounds: Bounds, feetPerSquare: FeetPerSquare): Promise<LibraryMap> =>
    ipcRenderer.invoke("library:save", name, png, bounds, feetPerSquare),
  /** Store the table's patched copy of a map, or with null go back to the map itself (D-036). */
  savePatch: (id: string, png: Uint8Array | null): Promise<void> => ipcRenderer.invoke("library:patch", id, png),
  onMapPatched: (fn: (id: string) => void) => ipcRenderer.on("map:patched", (_e, id: string) => fn(id)),
  getStatus: (): Promise<TableStatus> => ipcRenderer.invoke("table:status"),
  importCreatures: (text: string): Promise<ImportResult> => ipcRenderer.invoke("creatures:import", text),
  searchCreatures: (query: string): Promise<CreatureHit[]> => ipcRenderer.invoke("creatures:search", query),
  getCreature: (key: string): Promise<StatBlock | null> => ipcRenderer.invoke("creatures:get", key),
  countCreatures: (): Promise<number> => ipcRenderer.invoke("creatures:count"),
  onState: (fn: (s: TableState) => void): void => void ipcRenderer.on("state:changed", (_e, s: TableState) => fn(s)),
  onStatus: (fn: (s: TableStatus) => void) => ipcRenderer.on("table:status", (_e, s: TableStatus) => fn(s)),
};

export type DmApi = typeof api;
contextBridge.exposeInMainWorld("terra", api);
