// Electron main process: opens the DM window and the player (table) window, keeps the table
// state, and saves it after every change so a crash or restart reopens where it was.
import { app, BrowserWindow, clipboard, ipcMain, net, powerSaveBlocker, protocol, screen, session, type Display } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Surface } from "../core/calibration.ts";
import { laptopDisplay, playerPlacement, type DisplayInfo } from "../core/displays.ts";
import {
  apply,
  coverOf,
  defaultState,
  dmStateOf,
  dropMissingCharacters,
  parseCommand,
  parseSave,
  INKS,
  parseLine,
  playerViewOf,
  serialize,
  viewOf,
  UNDOABLE,
  type TableState,
} from "../core/table.ts";
import { isColour, tokenLook } from "../core/fight.ts";
import { describeSave, dueForEarlier, earlierName, earlierSaves, earlierTime, earlierToDrop, problemReport } from "../core/saves.ts";
import { countCreatures, findCreatures, getCreature, importCreatures } from "./creatures.ts";
import { listMaps, mapFile, saveMap, savePatch, tableMapFile } from "./library.ts";
import { pictureFile, savePicture } from "./curtains.ts";

/** Going back to an earlier save keeps the rig as it is now: the screens, the calibration and the curtain (D-037). */
function keepOnRestore(s: TableState): Partial<TableState> {
  return {
    curtain: s.curtain,
    cover: s.cover,
    calibrating: s.calibrating,
    testGrid: s.testGrid,
    playerDisplayId: s.playerDisplayId,
    calibrations: s.calibrations,
    flipLetters: s.flipLetters,
  };
}

/** Undo takes back map, disc and fight changes only: switches like the curtain and the screen choice stay as the DM last set them. */
function keepOnUndo(s: TableState): Partial<TableState> {
  return {
    curtain: s.curtain,
    cover: s.cover,
    calibrating: s.calibrating,
    testGrid: s.testGrid,
    playerDisplayId: s.playerDisplayId,
    calibrations: s.calibrations,
    // Character cards are typed, not drawn: an undo of a disc move must not take back HP typed since (D-027).
    party: s.party,
    flipLetters: s.flipLetters,
    lastCharacter: s.lastCharacter,
    mapLocked: s.mapLocked,
    // Each scene has its own undo steps (D-039): an undo here leaves the other scenes, and the list, as they are.
    scenes: s.scenes,
    scene: s.scene,
    lastScene: s.lastScene,
  };
}

// Tests point this at a temporary folder so they never touch real saves.
if (process.env.TERRA_USER_DATA) app.setPath("userData", process.env.TERRA_USER_DATA);

let state: TableState = defaultState();
let dmWindow: BrowserWindow | null = null;
let playerWindow: BrowserWindow | null = null;
let quitting = false;
/** States before each undoable command, newest last (D-024), one list per scene (D-039). Kept for this session only. */
const histories = new Map<string, TableState[]>();
function history(): TableState[] {
  let h = histories.get(state.scene);
  if (!h) histories.set(state.scene, (h = []));
  return h;
}
const MAX_HISTORY = 100;
/** A problem the DM should see, such as a save that couldn't be read. The packaged app has no console. */
let notice: string | null = null;
/** Why the last save failed, until one succeeds again. */
let saveProblem: string | null = null;

const savePath = () => path.join(app.getPath("userData"), "table-state.json");
const earlierDir = () => path.join(app.getPath("userData"), "earlier-saves");

/** Recent problems for the problem report (D-037), newest last. The packaged app has no console to read them from. */
const problems: string[] = [];
function logProblem(text: string): void {
  console.error(text);
  problems.push(`${new Date().toISOString()} ${text}`);
  if (problems.length > 50) problems.shift();
}

/** When the newest earlier save was taken this run, or null before the first. */
let lastEarlier: number | null = null;
/**
 * Copy the save as it is on disk now into the earlier saves, keeping the newest three (D-037). A copy identical to the
 * newest one is skipped, so restarting the app a few times can't push the good saves out with copies of a bad one.
 */
function keepEarlier(): void {
  const file = savePath();
  if (!fs.existsSync(file)) return;
  try {
    const dir = earlierDir();
    fs.mkdirSync(dir, { recursive: true });
    const now = Date.now();
    lastEarlier = now;
    const newest = earlierSaves(fs.readdirSync(dir))[0];
    const text = fs.readFileSync(file);
    if (newest && fs.readFileSync(path.join(dir, newest)).equals(text)) return;
    fs.writeFileSync(path.join(dir, earlierName(now)), text);
    for (const old of earlierToDrop(fs.readdirSync(dir))) fs.rmSync(path.join(dir, old), { force: true });
  } catch (e) {
    // An earlier save is a spare: failing to make one never stops the game.
    logProblem(`An earlier save couldn't be kept (${(e as NodeJS.ErrnoException).code ?? (e as Error).message}).`);
  }
}

/** The earlier saves, newest first, with a few words on each for the menu. */
function listEarlier(): { name: string; time: number; summary: string }[] {
  const dir = earlierDir();
  if (!fs.existsSync(dir)) return [];
  const maps = new Map(listMaps(app.getPath("userData")).map((m) => [m.id, m.name]));
  return earlierSaves(fs.readdirSync(dir)).map((name) => {
    const parsed = parseSave(fs.readFileSync(path.join(dir, name), "utf8"));
    const summary = parsed.ok ? describeSave(parsed.state, maps.get(parsed.state.map?.id ?? "") ?? null) : "can't be read";
    return { name, time: earlierTime(name)!, summary };
  });
}

function loadState(): TableState {
  const file = savePath();
  if (!fs.existsSync(file)) return defaultState();
  const parsed = parseSave(fs.readFileSync(file, "utf8"));
  if (parsed.ok) return parsed.state;
  // Keep the unreadable file for inspection instead of overwriting it (GAME-05). If Windows won't let it move, copy it.
  const kept = file.replace(/\.json$/, `.unreadable-${Date.now()}.json`);
  try {
    fs.renameSync(file, kept);
  } catch {
    fs.copyFileSync(file, kept);
  }
  notice = `The last save couldn't be read (${parsed.reason}), so the table started fresh. The old file is kept as ${path.basename(kept)}.`;
  logProblem(notice);
  return defaultState();
}

let saveTimer: NodeJS.Timeout | undefined;
function saveSoon(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 200);
}
/** Rename, retrying briefly: on Windows a virus scanner or the search indexer can hold the file for a moment. */
function renameWithRetry(from: string, to: string): void {
  for (let attempt = 1; ; attempt++) {
    try {
      return fs.renameSync(from, to);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (attempt >= 5 || !["EPERM", "EBUSY", "EACCES"].includes(code ?? "")) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30 * attempt);
    }
  }
}
function saveNow(): void {
  clearTimeout(saveTimer);
  const file = savePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Write then rename, so a crash mid-write never leaves a half-written save.
    fs.writeFileSync(file + ".tmp", serialize(state));
    renameWithRetry(file + ".tmp", file);
    if (dueForEarlier(lastEarlier, Date.now())) keepEarlier();
    if (saveProblem) {
      saveProblem = null;
      send(dmWindow, "table:status", tableStatus());
    }
  } catch (e) {
    // Never crash the app over a save: tell the DM and try again shortly. The last good save stays on disk.
    const first = !saveProblem;
    const reason = (e as NodeJS.ErrnoException).code ?? (e as Error).message;
    const repeat = saveProblem;
    saveProblem = `The table couldn't be saved (${reason}). Trying again; the last good save is kept.`;
    if (saveProblem !== repeat) logProblem(saveProblem);
    if (first) send(dmWindow, "table:status", tableStatus());
    if (!quitting) saveTimer = setTimeout(saveNow, 2000);
  }
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
  const shown = [notice, saveProblem].filter(Boolean).join(" ") || null;
  return { displays: listDisplays(), playerDisplayId: display?.id ?? null, fullscreen, surfaceKey, surface: surface(), notice: shown };
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
    // Its own session, whose terra-map:// serves only what the table may show (D-036).
    webPreferences: { ...webPreferences("player-preload.cjs"), partition: TABLE_PARTITION },
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
  for (const w of [dmWindow, playerWindow]) {
    reloadIfGone(w);
    // A page's errors go in the problem report too.
    const title = w.getTitle();
    w.webContents.on("console-message", (e) => {
      if (e.level === "error") logProblem(`${title}: ${e.message} (${path.basename(e.sourceId)}:${e.lineNumber})`);
    });
  }
}

/** A window whose page crashes loads again and asks for the state, so the projector isn't left blank mid-game. */
function reloadIfGone(w: BrowserWindow): void {
  const crashes: number[] = [];
  w.webContents.on("render-process-gone", (_e, details) => {
    if (details.reason === "clean-exit" || quitting || w.isDestroyed()) return;
    logProblem(`${w.getTitle()} crashed (${details.reason}); reloading.`);
    // Give up after three crashes in a minute rather than loop.
    const now = Date.now();
    crashes.push(now);
    if (crashes.filter((t) => now - t < 60_000).length <= 3) w.webContents.reload();
  });
}

const TABLE_PARTITION = "table";

/** A library PNG for terra-map://, never cached, so a new patch shows at once. */
/** A curtain picture for terra-curtain://<id>, with its own type (D-039). */
async function servePicture(id: string): Promise<Response> {
  const pic = pictureFile(app.getPath("userData"), id);
  if (!pic) return new Response("Not found", { status: 404 });
  const body = await net.fetch(pathToFileURL(pic.file).toString());
  return new Response(body.body, {
    headers: { "content-type": pic.mime, "access-control-allow-origin": "*", "cache-control": "no-store" },
  });
}

async function serveMap(file: string | null): Promise<Response> {
  if (!file || !fs.existsSync(file)) return new Response("Not found", { status: 404 });
  // Readable by the app's own pages, so a canvas with a map on it can still be read back (the e2e tests and patching do).
  const png = await net.fetch(pathToFileURL(file).toString());
  const headers = { "content-type": "image/png", "access-control-allow-origin": "*", "cache-control": "no-store" };
  return new Response(png.body, { headers });
}

// Map images reach both windows through terra-map://<id>, which serves only PNGs from the personal library (D-010).
protocol.registerSchemesAsPrivileged([
  { scheme: "terra-map", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: "terra-portrait", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: "terra-curtain", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

/**
 * terra-portrait://<colour>/<tag>: a revealed group's picture (D-036). It is looked up in the state at the moment of
 * asking, so it answers only while the group is revealed and the key matches what the table was told to show; before
 * Reveal, or for any other key, there is nothing to load.
 */
function servePortrait(url: string): Response {
  const u = new URL(url);
  const colour = u.hostname;
  const map = state.map;
  if (!map || !isColour(colour)) return new Response("Not found", { status: 404 });
  // A 2-inch disc always shows its group's portrait once revealed, so this is the key the table can have been given.
  const disc = { colour, letter: "A", x: 0, y: 0, size: 2, shown: true, condition: "fine", hp: null, hpMax: null, mini: false } as const;
  const want = tokenLook(disc, map.groups).portrait;
  const g = map.groups[colour];
  const portrait = want === `${colour}${u.pathname}` && g?.creature ? getCreature(app.getPath("userData"), g.creature)?.portrait : null;
  return portraitResponse(portrait);
}

/** A library portrait's data URL as an image response, or not found. */
function portraitResponse(portrait: string | null | undefined): Response {
  const m = portrait?.match(/^data:(image\/[a-z]+);base64,(.*)$/);
  if (!m) return new Response("Not found", { status: 404 });
  const headers = { "content-type": m[1]!, "access-control-allow-origin": "*", "cache-control": "no-store" };
  return new Response(Buffer.from(m[2]!, "base64"), { headers });
}

/** Make the new state current: tell both windows, save, and move the table window if its screen changed. */
function commit(next: TableState): void {
  const before = state.playerDisplayId;
  state = next;
  send(dmWindow, "state:changed", dmStateOf(state));
  send(dmWindow, "history:changed", history().length > 0);
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
    // The table as it opened is an earlier save, so a bad change made now can be rolled back after another restart.
    keepEarlier();
    ipcMain.handle("state:get", () => dmStateOf(state));
    ipcMain.handle("player:get", () => playerViewOf(state, placement().surfaceKey));
    ipcMain.handle("table:status", () => tableStatus());
    // Neither returns the state: `commit` has already sent it, and with a long fog list each copy costs (D-029).
    ipcMain.handle("state:apply", (_e, raw: unknown) => {
      const command = parseCommand(raw);
      if (!command) return;
      const next = apply(state, command);
      // A command that changes nothing, such as moving a locked map, leaves no undo step behind.
      if (next === state) return;
      if (UNDOABLE.has(command.type)) {
        const h = history();
        h.push(state);
        if (h.length > MAX_HISTORY) h.shift();
      }
      commit(next);
    });
    ipcMain.handle("state:undo", () => {
      const previous = history().pop();
      if (previous) commit(dropMissingCharacters({ ...previous, ...keepOnUndo(state) }));
    });
    ipcMain.handle("history:get", () => history().length > 0);
    // Earlier saves (D-037): going back keeps the state now as an earlier save first, so it can be taken back too.
    ipcMain.handle("saves:list", () => listEarlier());
    ipcMain.handle("saves:restore", (_e, name: unknown) => {
      if (typeof name !== "string" || earlierTime(name) === null) return false;
      const file = path.join(earlierDir(), name);
      if (!fs.existsSync(file)) return false;
      const parsed = parseSave(fs.readFileSync(file, "utf8"));
      if (!parsed.ok) return false;
      saveNow();
      keepEarlier();
      // Undo steps belong to the state being left.
      histories.clear();
      // A character id given out since stays used, so it never names someone else (a sheet left open, say).
      const lastCharacter = Math.max(state.lastCharacter, parsed.state.lastCharacter);
      commit({ ...parsed.state, ...keepOnRestore(state), lastCharacter });
      return true;
    });
    ipcMain.handle("report:copy", () => {
      const { fullscreen, surfaceKey } = placement();
      const file = savePath();
      const text = problemReport({
        at: new Date().toISOString(),
        app: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        os: `${process.platform} ${process.getSystemVersion()}`,
        displays: screen.getAllDisplays().map((d) => ({ ...displayInfo(d), scale: d.scaleFactor })),
        surfaceKey,
        fullscreen,
        calibrated: Object.keys(state.calibrations),
        saveBytes: fs.existsSync(file) ? fs.statSync(file).size : null,
        earlier: listEarlier().length,
        notices: [notice, saveProblem].filter((n): n is string => !!n),
        log: problems,
      });
      clipboard.writeText(text);
      return text;
    });
    // A ping is a moment, not a change: it goes to the table and is never saved or undone (D-034). The curtain hides it.
    ipcMain.handle("table:ping", (_e, x: unknown, y: unknown) => {
      const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 500;
      if (ok(x) && ok(y) && viewOf(state) === "map") send(playerWindow, "player:ping", { x: x + 0, y: y + 0 });
    });
    // A fading line is a moment too: drawn on the table, gone in about 10 seconds, never saved (D-035).
    ipcMain.handle("table:sketch", (_e, ink: unknown, raw: unknown) => {
      const points = parseLine(raw);
      if (points && INKS.includes(ink as (typeof INKS)[number]) && viewOf(state) === "map")
        send(playerWindow, "player:sketch", { ink, points });
    });
    ipcMain.handle("library:list", () => listMaps(app.getPath("userData")));
    ipcMain.handle("library:save", (_e, name: unknown, png: unknown, bounds: unknown, feet: unknown) =>
      saveMap(app.getPath("userData"), name, png, bounds, feet),
    );
    ipcMain.handle("curtain:save", (_e, bytes: unknown) => savePicture(app.getPath("userData"), bytes));
    ipcMain.handle("library:patch", (_e, id: unknown, png: unknown) => {
      savePatch(app.getPath("userData"), id, png);
      // Both windows drop the old picture and load the new copy.
      for (const w of [dmWindow, playerWindow]) send(w, "map:patched", id);
    });
    // Stat blocks: the DM window only (D-028). The table window's bridge has no channel to these.
    ipcMain.handle("creatures:import", (_e, text: unknown) => importCreatures(app.getPath("userData"), text));
    ipcMain.handle("creatures:search", (_e, query: unknown) => findCreatures(app.getPath("userData"), query));
    ipcMain.handle("creatures:get", (_e, key: unknown) => getCreature(app.getPath("userData"), key));
    ipcMain.handle("creatures:count", () => countCreatures(app.getPath("userData")));
    // The DM's window: terra-map://<id>/ is the map as imported, terra-map://<id>/table what the table gets.
    protocol.handle("terra-map", (req) => {
      const url = new URL(req.url);
      const dir = app.getPath("userData");
      return serveMap(url.pathname === "/table" ? tableMapFile(dir, url.hostname) : mapFile(dir, url.hostname));
    });
    // The DM's window may also preview any library creature's picture: terra-portrait://book/<key>.
    protocol.handle("terra-portrait", (req) => {
      const u = new URL(req.url);
      if (u.hostname !== "book") return servePortrait(req.url);
      return portraitResponse(getCreature(app.getPath("userData"), decodeURIComponent(u.pathname.slice(1)))?.portrait);
    });
    // The table's window: only the table's copy, so a patched map's numbers never reach it, and only of the map on the
    // table now, so it can't load a scene the players haven't reached (D-039).
    session.fromPartition(TABLE_PARTITION).protocol.handle("terra-map", (req) => {
      const id = new URL(req.url).hostname;
      // The map the table shows now: the current scene's, or the world map under its curtain (D-039).
      return serveMap(id === playerViewOf(state, "window").map?.id ? tableMapFile(app.getPath("userData"), id) : null);
    });
    session.fromPartition(TABLE_PARTITION).protocol.handle("terra-portrait", (req) => servePortrait(req.url));
    // Curtain pictures (D-039): the DM's window may load any of them; the table only the one its curtain shows now.
    protocol.handle("terra-curtain", (req) => servePicture(new URL(req.url).hostname));
    session.fromPartition(TABLE_PARTITION).protocol.handle("terra-curtain", (req) => {
      const id = new URL(req.url).hostname;
      const cover = coverOf(state);
      return cover && "picture" in cover && cover.picture === id ? servePicture(id) : new Response("Not found", { status: 404 });
    });
    // A quiet stretch of role-play mustn't let Windows switch off the projector or put the laptop to sleep (D-029).
    powerSaveBlocker.start("prevent-display-sleep");
    screen.on("display-added", placePlayerWindow);
    screen.on("display-removed", placePlayerWindow);
    screen.on("display-metrics-changed", placePlayerWindow);
    createWindows();
  });
}
