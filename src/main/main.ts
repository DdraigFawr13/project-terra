// Electron main process: opens the DM window and the player (table) window, keeps the table
// state, and saves it after every change so a crash or restart reopens where it was.
import { app, BrowserWindow, ipcMain, screen, type Display } from "electron";
import fs from "node:fs";
import path from "node:path";
import { playerPlacement, type DisplayInfo } from "../core/displays.ts";
import { applyPatch, defaultState, parseSave, serialize, type TableState } from "../core/table.ts";

// Tests point this at a temporary folder so they never touch real saves.
if (process.env.TERRA_USER_DATA) app.setPath("userData", process.env.TERRA_USER_DATA);

let state: TableState = defaultState();
let dmWindow: BrowserWindow | null = null;
let playerWindow: BrowserWindow | null = null;
let quitting = false;

const savePath = () => path.join(app.getPath("userData"), "table-state.json");

function loadState(): TableState {
  const file = savePath();
  if (!fs.existsSync(file)) return defaultState();
  const parsed = parseSave(fs.readFileSync(file, "utf8"));
  if (parsed.ok) return parsed.state;
  // Keep the unreadable file for inspection instead of overwriting it (GAME-05).
  const kept = file.replace(/\.json$/, `.unreadable-${Date.now()}.json`);
  fs.renameSync(file, kept);
  console.error(`table-state.json could not be read (${parsed.reason}); kept it as ${path.basename(kept)}`);
  return defaultState();
}

let saveTimer: NodeJS.Timeout | undefined;
function saveSoon(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 200);
}
function saveNow(): void {
  clearTimeout(saveTimer);
  const file = savePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Write then rename, so a crash mid-write never leaves a half-written save.
  fs.writeFileSync(file + ".tmp", serialize(state));
  fs.renameSync(file + ".tmp", file);
}

function displayInfo(d: Display): DisplayInfo {
  return { id: d.id, label: d.label, width: d.size.width, height: d.size.height, primary: d.id === screen.getPrimaryDisplay().id };
}
const listDisplays = (): DisplayInfo[] => screen.getAllDisplays().map(displayInfo);

function broadcast(channel: string, payload: unknown): void {
  for (const w of [dmWindow, playerWindow]) if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
}

function tableStatus() {
  const { display, fullscreen } = playerPlacement(listDisplays(), state.playerDisplayId);
  return { displays: listDisplays(), playerDisplayId: display?.id ?? null, fullscreen };
}

/** Put the player window fullscreen on its screen, or in a normal window when only the laptop screen exists. */
function placePlayerWindow(): void {
  if (!playerWindow || playerWindow.isDestroyed()) return;
  const { display, fullscreen } = playerPlacement(listDisplays(), state.playerDisplayId);
  const target = screen.getAllDisplays().find((d) => d.id === display?.id) ?? screen.getPrimaryDisplay();
  playerWindow.setFullScreen(false);
  if (fullscreen) {
    playerWindow.setBounds(target.bounds);
    playerWindow.setFullScreen(true);
  } else {
    playerWindow.setBounds({ x: target.workArea.x + 40, y: target.workArea.y + 40, width: 960, height: 600 });
  }
  broadcast("table:status", tableStatus());
}

function createWindows(): void {
  const webPreferences = { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false };

  dmWindow = new BrowserWindow({ width: 1280, height: 800, title: "Project Terra (DM)", backgroundColor: "#1c2526", webPreferences });
  dmWindow.loadFile(path.join(__dirname, "dm.html"));
  dmWindow.on("closed", () => app.quit());

  playerWindow = new BrowserWindow({
    width: 960,
    height: 600,
    title: "Project Terra (Table)",
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    webPreferences,
  });
  playerWindow.loadFile(path.join(__dirname, "player.html"));
  // The table window only closes with the app, so a stray click can't lose it mid-game.
  playerWindow.on("close", (e) => {
    if (!quitting) e.preventDefault();
  });
  playerWindow.once("ready-to-show", placePlayerWindow);
  playerWindow.webContents.once("did-finish-load", placePlayerWindow);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => dmWindow?.focus());
  app.on("before-quit", () => {
    quitting = true;
    saveNow();
  });
  app.on("window-all-closed", () => app.quit());

  app.whenReady().then(() => {
    state = loadState();
    ipcMain.handle("state:get", () => state);
    ipcMain.handle("table:status", () => tableStatus());
    ipcMain.handle("state:patch", (_e, patch: unknown) => {
      const before = state.playerDisplayId;
      state = applyPatch(state, patch);
      broadcast("state:changed", state);
      saveSoon();
      if (state.playerDisplayId !== before) placePlayerWindow();
      return state;
    });
    screen.on("display-added", placePlayerWindow);
    screen.on("display-removed", placePlayerWindow);
    screen.on("display-metrics-changed", placePlayerWindow);
    createWindows();
  });
}
