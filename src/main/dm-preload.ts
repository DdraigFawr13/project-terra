// The DM window's only bridge to the main process. The page gets these calls and nothing else.
import { contextBridge, ipcRenderer } from "electron";
import type { TablePatch, TableState } from "../core/table.ts";
import type { DisplayInfo } from "../core/displays.ts";

export type TableStatus = { displays: DisplayInfo[]; playerDisplayId: number | null; fullscreen: boolean };

const api = {
  getState: (): Promise<TableState> => ipcRenderer.invoke("state:get"),
  patch: (patch: TablePatch): Promise<TableState> => ipcRenderer.invoke("state:patch", patch),
  getStatus: (): Promise<TableStatus> => ipcRenderer.invoke("table:status"),
  onState: (fn: (s: TableState) => void) => ipcRenderer.on("state:changed", (_e, s: TableState) => fn(s)),
  onStatus: (fn: (s: TableStatus) => void) => ipcRenderer.on("table:status", (_e, s: TableStatus) => fn(s)),
};

export type DmApi = typeof api;
contextBridge.exposeInMainWorld("terra", api);
