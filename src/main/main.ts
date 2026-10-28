// Electron main process: opens the DM window and the player (table) window, keeps the table
// state, and saves it after every change so a crash or restart reopens where it was.
import { app, BrowserWindow, ipcMain, net, protocol, screen, type Display } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Surface } from "../core/calibration.ts";
import { laptopDisplay, playerPlacement, type DisplayInfo } from "../core/displays.ts";
import {
  apply,
  defaultState,
  dropMissingCharacters,
  parseCommand,
  parseSave,
  playerViewOf,
  serialize,
  UNDOABLE,
  type TableState,
} from "../core/table.ts";
import { countCreatures, findCreatures, getCreature, importCreatures } from "./creatures.ts";
import { listMaps, mapFile, saveMap } from "./library.ts";

/** Undo takes back map, disc and fight changes only: switches like the curtain and the screen choice stay as the DM last set them. */
function keepOnUndo(s: TableState): Partial<TableState> {
  return {
    curtain: s.curtain,
    calibrating: s.calibrating,
    testGrid: s.testGrid,
    playerDisplayId: s.playerDisplayId,
    calibrations: s.calibrations,
    // Character cards are typed, not drawn: an undo of a disc move must not take back HP typed since (D-027).
    party: s.party,
    flipLetters: s.flipLetters,
    lastCharacter: s.lastCharacter,
  };
}

// Tests point this at a temporary folder so they never touch real saves.
if (process.env.TERRA_USER_DATA) app.setPath("userData", process.env.TERRA_USER_DATA);

let state: TableState = defaultState();
let dmWindow: BrowserWindow | null = null;
let playerWindow: BrowserWindow | null = null;
let quitting = false;
/** States before each undoable command, newest last (D-024). Kept for this session only. */
const history: TableState[] = [];
const MAX_HISTORY = 100;
/** A problem the DM should see, such as a save that couldn't be read. The packaged app has no console. */
let notice: string | null = null;

const savePath = () => path.join(app.getPath("userData"), "table-state.json");

function loadState(): TableState {
  const file = savePath();
  if (!fs.existsSync(file)) return defaultState();
  const parsed = parseSave(fs.readFileSync(file, "utf8"));
  if (parsed.ok) return parsed.state;
  // Keep the unreadable file for inspection instead of overwriting it (GAME-05).
  const kept = file.replace(/\.json$/, `.unreadable-${Date.now()}.json`);
  fs.renameSync(file, kept);
  notice = `The last save couldn't be read (${parsed.reason}), so the table started fresh. The old file is kept as ${path.basename(kept)}.`;
  console.error(notice);
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
  return {
    id: d.id,
    label: d.label,
    width: d.size.width,
    height: d.size.height,
    primary: d.id === screen.getPrimaryDisplay().id,
    internal: d.internal,
  };
}
const listDisplays = (): DisplayInfo[] => screen.getAllDisplays().map(displayInfo);

function send(w: BrowserWindow | null, channel: string, payload: unknown): void {
  if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
}

const placement = () => playerPlacement(listDisplays(), state.playerDisplayId);

/** What the table window draws on: its size in CSS pixels and its screen's scaling. */
function surface(): Surface {
  if (!playerWindow || playerWindow.isDestroyed()) return { width: 960, height: 600, scale: 1 };
  const [width, height] = playerWindow.getContentSize() as [number, number];
  return { width, height, scale: screen.getDisplayMatching(playerWindow.getBounds()).scaleFactor };
}

function tableStatus() {
  const { display, fullscreen, surfaceKey } = placement();
  return { displays: listDisplays(), playerDisplayId: display?.id ?? null, fullscreen, surfaceKey, surface: surface(), notice };
}

function sendPlayerView(): void {
  send(playerWindow, "player:changed", playerViewOf(state, placement().surfaceKey));
}

/** Put the player window fullscreen on its screen, or in a normal window when only the laptop screen exists. */
function placePlayerWindow(): void {
  if (!playerWindow || playerWindow.isDestroyed()) return;
  const { display, fullscreen } = placement();
  const target = screen.getAllDisplays().find((d) => d.id === display?.id) ?? screen.getPrimaryDisplay();
  playerWindow.setFullScreen(false);
  if (fullscreen) {
    playerWindow.setBounds(target.bounds);
    playerWindow.setFullScreen(true);
  } else {
    playerWindow.setBounds({ x: target.workArea.x + 40, y: target.workArea.y + 40, width: 960, height: 600 });
  }
  send(dmWindow, "table:status", tableStatus());
  sendPlayerView();
}

function createWindows(): void {
  // Each window gets its own bridge: the table window can only read the player view (D-002).
  const webPreferences = (preload: string) => ({
    preload: path.join(__dirname, preload),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
  });

  // The DM window opens on the laptop's own screen, never on the projector (D-002).
  const laptop = screen.getAllDisplays().find((d) => d.id === laptopDisplay(listDisplays())?.id) ?? screen.getPrimaryDisplay();
  dmWindow = new BrowserWindow({
    x: laptop.workArea.x + 20,
    y: laptop.workArea.y + 20,
    width: Math.min(1280, laptop.workArea.width - 40),
    height: Math.min(800, laptop.workArea.height - 40),
    title: "Project Terra (DM)",
    backgroundColor: "#1c2526",
    webPreferences: webPreferences("dm-preload.cjs"),
  });
  dmWindow.loadFile(path.join(__dirname, "dm.html"));
  dmWindow.on("closed", () => app.quit());

  playerWindow = new BrowserWindow({
    width: 960,
    height: 600,
    title: "Project Terra (Table)",
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    webPreferences: webPreferences("player-preload.cjs"),
  });
  playerWindow.loadFile(path.join(__dirname, "player.html"));
  // The table window only closes with the app, so a stray click can't lose it mid-game.
  playerWindow.on("close", (e) => {
    if (!quitting) e.preventDefault();
  });
  playerWindow.once("ready-to-show", placePlayerWindow);
  // The DM's calibration preview follows the table window's size.
  playerWindow.on("resize", () => send(dmWindow, "table:status", tableStatus()));
  playerWindow.webContents.once("did-finish-load", placePlayerWindow);
}

// Map images reach both windows through terra-map://<id>, which serves only PNGs from the personal library (D-010).
protocol.registerSchemesAsPrivileged([
  { scheme: "terra-map", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

/** Make the new state current: tell both windows, save, and move the table window if its screen changed. */
function commit(next: TableState): void {
  const before = state.playerDisplayId;
  state = next;
  send(dmWindow, "state:changed", state);
  send(dmWindow, "history:changed", history.length > 0);
  sendPlayerView();
  saveSoon();
  if (state.playerDisplayId !== before) placePlayerWindow();
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
  // Pages never navigate or open windows. Without this, a file dropped on the table window would be shown on the projector.
  app.on("web-contents-created", (_e, contents) => {
    contents.on("will-navigate", (e) => e.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
  });

  app.whenReady().then(() => {
    state = loadState();
    ipcMain.handle("state:get", () => state);
    ipcMain.handle("player:get", () => playerViewOf(state, placement().surfaceKey));
    ipcMain.handle("table:status", () => tableStatus());
    ipcMain.handle("state:apply", (_e, raw: unknown) => {
      const command = parseCommand(raw);
      if (!command) return state;
      if (UNDOABLE.has(command.type)) {
        history.push(state);
        if (history.length > MAX_HISTORY) history.shift();
      }
      commit(apply(state, command));
      return state;
    });
    ipcMain.handle("state:undo", () => {
      const previous = history.pop();
      if (previous) commit(dropMissingCharacters({ ...previous, ...keepOnUndo(state) }));
      return state;
    });
    ipcMain.handle("history:get", () => history.length > 0);
    ipcMain.handle("library:list", () => listMaps(app.getPath("userData")));
    ipcMain.handle("library:save", (_e, name: unknown, png: unknown, bounds: unknown) =>
      saveMap(app.getPath("userData"), name, png, bounds),
    );
    // Stat blocks: the DM window only (D-028). The table window's bridge has no channel to these.
    ipcMain.handle("creatures:import", (_e, text: unknown) => importCreatures(app.getPath("userData"), text));
    ipcMain.handle("creatures:search", (_e, query: unknown) => findCreatures(app.getPath("userData"), query));
    ipcMain.handle("creatures:get", (_e, key: unknown) => getCreature(app.getPath("userData"), key));
    ipcMain.handle("creatures:count", () => countCreatures(app.getPath("userData")));
    protocol.handle("terra-map", async (req) => {
      const file = mapFile(app.getPath("userData"), new URL(req.url).hostname);
      if (!file || !fs.existsSync(file)) return new Response("Not found", { status: 404 });
      // Readable by the app's own pages, so a canvas with a map on it can still be read back (the e2e tests do).
      const png = await net.fetch(pathToFileURL(file).toString());
      return new Response(png.body, { headers: { "content-type": "image/png", "access-control-allow-origin": "*" } });
    });
    screen.on("display-added", placePlayerWindow);
    screen.on("display-removed", placePlayerWindow);
    screen.on("display-metrics-changed", placePlayerWindow);
    createWindows();
  });
}
