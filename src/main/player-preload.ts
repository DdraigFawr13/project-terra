// The table window's only bridge to the main process: it can read the player view and nothing else (D-002).
import { contextBridge, ipcRenderer } from "electron";
import type { PlayerView } from "../core/table.ts";

const api = {
  getView: (): Promise<PlayerView> => ipcRenderer.invoke("player:get"),
  onView: (fn: (v: PlayerView) => void) => ipcRenderer.on("player:changed", (_e, v: PlayerView) => fn(v)),
};

export type PlayerApi = typeof api;
contextBridge.exposeInMainWorld("terra", api);
