// The table window's only bridge to the main process: it can read the player view and nothing else (D-002).
import { contextBridge, ipcRenderer } from "electron";
import type { Point } from "../core/homography.ts";
import type { Ink, PlayerView } from "../core/table.ts";

const api = {
  getView: (): Promise<PlayerView> => ipcRenderer.invoke("player:get"),
  onView: (fn: (v: PlayerView) => void) => ipcRenderer.on("player:changed", (_e, v: PlayerView) => fn(v)),
  /** A ping where the DM tapped, in table inches (D-034). */
  onPing: (fn: (at: Point) => void) => ipcRenderer.on("player:ping", (_e, at: Point) => fn(at)),
  /** A fading line the DM drew for the players, in table inches (D-035). */
  onSketch: (fn: (s: { ink: Ink; points: Point[] }) => void) =>
    ipcRenderer.on("player:sketch", (_e, s: { ink: Ink; points: Point[] }) => fn(s)),
};

export type PlayerApi = typeof api;
contextBridge.exposeInMainWorld("terra", api);
