// The DM window's only bridge to the main process. The page gets these calls and nothing else.
import { contextBridge, ipcRenderer } from "electron";
import type { Command, FeetPerSquare, Ink, TableState } from "../core/table.ts";
import type { Point } from "../core/homography.ts";
import type { LibraryMap } from "./library.ts";
import type { ImportResult } from "./creatures.ts";
import type { CreatureHit, StatBlock } from "../core/creatures.ts";
import type { Bounds } from "../core/map.ts";
import type { Annotation } from "../core/annotation.ts";
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

export type EarlierSave = { name: string; time: number; summary: string };

const api = {
  getState: (): Promise<TableState> => ipcRenderer.invoke("state:get"),
  /** Resolves once the main process has taken the command; the new state arrives through `onState` first. */
  apply: (command: Command): Promise<void> => ipcRenderer.invoke("state:apply", command),
  undo: (): Promise<void> => ipcRenderer.invoke("state:undo"),
  /** Ping the table at (x, y) in table inches: rings for about 2 seconds, nothing saved (D-034). */
  ping: (x: number, y: number): Promise<void> => ipcRenderer.invoke("table:ping", x, y),
  /** A fading line on the table, in table inches: gone in about 10 seconds, nothing saved (D-035). */
  sketch: (ink: Ink, points: Point[]): Promise<void> => ipcRenderer.invoke("table:sketch", ink, points),
  /** A piece of the laser trail, in table inches (D-046): it fades on the table, nothing saved. */
  laser: (points: Point[]): Promise<void> => ipcRenderer.invoke("table:laser", points),
  canUndo: (): Promise<boolean> => ipcRenderer.invoke("history:get"),
  /** Earlier saves, newest first, with a few words on each (D-037). */
  listSaves: (): Promise<EarlierSave[]> => ipcRenderer.invoke("saves:list"),
  /** Go back to an earlier save; the state now becomes an earlier save first. False if it couldn't be read. */
  restoreSave: (name: string): Promise<boolean> => ipcRenderer.invoke("saves:restore", name),
  /** Copy the problem report to the clipboard, and get its text to show (D-037). */
  problemReport: (): Promise<string> => ipcRenderer.invoke("report:copy"),
  onHistory: (fn: (canUndo: boolean) => void) => ipcRenderer.on("history:changed", (_e, can: boolean) => fn(can)),
  listMaps: (): Promise<LibraryMap[]> => ipcRenderer.invoke("library:list"),
  /** `walls`: from a VTT file (D-044), stored with the map. */
  saveMap: (name: string, png: Uint8Array, bounds: Bounds, feetPerSquare: FeetPerSquare, walls?: Annotation): Promise<LibraryMap> =>
    ipcRenderer.invoke("library:save", name, png, bounds, feetPerSquare, walls),
  /** Store the table's patched copy of a map, or with null go back to the map itself (D-036). */
  savePatch: (id: string, png: Uint8Array | null): Promise<void> => ipcRenderer.invoke("library:patch", id, png),
  /** A map's walls, pillars and openings (D-044); empty if none are traced yet. */
  loadWalls: (id: string): Promise<Annotation> => ipcRenderer.invoke("library:walls", id),
  saveWalls: (id: string, walls: Annotation): Promise<Annotation> => ipcRenderer.invoke("library:saveWalls", id, walls),
  /** Store a curtain picture (D-039); resolves to its id. */
  savePicture: (bytes: Uint8Array): Promise<string> => ipcRenderer.invoke("curtain:save", bytes),
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
