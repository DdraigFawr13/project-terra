// Earlier saves and the problem report (D-037). Undo lasts one run, so copies of the save are kept to roll a bad state
// back after a restart. Pure: the main process passes in the clock, the file names and what it knows about the laptop.
import type { DisplayInfo } from "./displays.ts";
import type { TableState } from "./table.ts";

/** How many earlier saves are kept. */
const EARLIER_KEPT = 3;
/** While the DM keeps changing things, one earlier save at most this often (ms). One is also taken at every start. */
export const EARLIER_EVERY_MS = 10 * 60_000;

const NAME = /^table-state\.(\d{13})\.json$/;

/** The file name for an earlier save taken at `time` (ms since 1970); names sort by time. */
export const earlierName = (time: number): string => `table-state.${String(Math.trunc(time)).padStart(13, "0")}.json`;

/** When an earlier save was taken, from its file name, or null for any other file. */
export function earlierTime(name: string): number | null {
  const m = NAME.exec(name);
  return m ? Number(m[1]) : null;
}

/** The earlier saves among `names`, newest first. */
export function earlierSaves(names: string[]): string[] {
  return names.filter((n) => earlierTime(n) !== null).sort((a, b) => earlierTime(b)! - earlierTime(a)!);
}

/** Earlier saves to delete so only the newest `EARLIER_KEPT` remain. */
export const earlierToDrop = (names: string[]): string[] => earlierSaves(names).slice(EARLIER_KEPT);

/** Whether a save made at `now` should also be kept as an earlier save; `last` is when the newest was taken. */
export const dueForEarlier = (last: number | null, now: number): boolean => last === null || now - last >= EARLIER_EVERY_MS;

/** A few words on what a save holds, so the DM can tell earlier saves apart in the menu. */
export function describeSave(s: TableState, mapName: string | null): string {
  const parts = [s.map ? (mapName ?? "a map") : "no map"];
  if (s.map) parts.push(count(s.map.discs.length, "disc"));
  if (s.fight) parts.push(`round ${s.fight.round}`);
  parts.push(count(s.party.length, "character"));
  // The map, discs and round are the scene that was on the table; the others are counted (D-039).
  const scenes = s.scenes.filter((sc) => !sc.removed).length;
  if (scenes > 1) parts.push(count(scenes, "scene"));
  return parts.join(", ");
}
const count = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

export type ReportInfo = {
  /** When the report was made, as an ISO time. */
  at: string;
  app: string;
  electron: string;
  chrome: string;
  os: string;
  displays: (DisplayInfo & { scale: number })[];
  /** Which calibration the table uses now, and whether its window is fullscreen. */
  surfaceKey: string;
  fullscreen: boolean;
  calibrated: string[];
  saveBytes: number | null;
  earlier: number;
  notices: string[];
  /** Recent problems, oldest first, each starting with its time. */
  log: string[];
};

/**
 * Plain text for Morgan to paste to Claude, who can't see the laptop. It names screens and problems only: no map,
 * character or monster names, so pasting it shares nothing from the game.
 */
export function problemReport(r: ReportInfo): string {
  const display = (d: ReportInfo["displays"][number]) =>
    `- ${d.id} "${d.label}" ${d.width} × ${d.height} at ${Math.round(d.scale * 100)}%` +
    (d.internal ? ", built-in" : "") +
    (d.primary ? ", main display" : "");
  return [
    `Project Terra problem report, ${r.at}`,
    `App ${r.app}, Electron ${r.electron}, Chrome ${r.chrome}, ${r.os}`,
    "",
    "Screens:",
    ...r.displays.map(display),
    `Table uses ${r.surfaceKey}${r.fullscreen ? ", fullscreen" : ", in a window"}; calibrated for ${r.calibrated.join(", ") || "nothing"}`,
    `Save: ${r.saveBytes === null ? "none yet" : `${r.saveBytes} bytes`}; ${r.earlier} earlier saves`,
    "",
    "Notices:",
    ...(r.notices.length ? r.notices.map((n) => `- ${n}`) : ["- none"]),
    "",
    "Recent problems:",
    ...(r.log.length ? r.log.map((l) => `- ${l}`) : ["- none"]),
  ].join("\n");
}
