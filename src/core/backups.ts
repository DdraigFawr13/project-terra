// Earlier saves and the problem report (D-037, step 7g). Pure, so naming, pruning, restoring and the report's text can
// be tested without Electron; the main process does the file work.
import type { DisplayInfo } from "./displays.ts";
import type { TableState } from "./table.ts";

/** How many earlier saves are kept: enough to step back past a bad state found after a restart. */
const KEEP_BACKUPS = 3;
/** While the DM plays, an earlier save is kept this often, if anything changed. */
export const BACKUP_EVERY_MS = 15 * 60_000;

const NAME = /^table-state\.backup-(\d{13})\.json$/;

export const backupName = (now: number): string => `table-state.backup-${now}.json`;

/** When an earlier save was made, from its file name, or null for any other file. */
export function backupTime(name: string): number | null {
  const m = NAME.exec(name);
  return m ? Number(m[1]) : null;
}

/** The earlier saves among a folder's files, newest first. */
export function backupsIn(names: string[]): string[] {
  return names.filter((n) => backupTime(n) !== null).sort((a, b) => backupTime(b)! - backupTime(a)!);
}

/** The earlier saves to delete so only the newest `keep` remain. */
export const toPrune = (names: string[], keep = KEEP_BACKUPS): string[] => backupsIn(names).slice(keep);

/**
 * An earlier save made current. The map, fog, discs, party and fight come back; the switches that describe this room
 * and this laptop stay as they are now, since an older save may come from before the projector was set up.
 */
export function restoredState(current: TableState, earlier: TableState): TableState {
  return {
    ...earlier,
    curtain: current.curtain,
    calibrating: false,
    testGrid: current.testGrid,
    playerDisplayId: current.playerDisplayId,
    calibrations: current.calibrations,
    flipLetters: current.flipLetters,
  };
}

/** One line on what a save holds, to tell earlier saves apart. Never the map's name: the report may be pasted anywhere. */
export function describeSave(s: TableState): string {
  const parts = [s.map ? `a ${Math.round(s.map.bounds.width)} × ${Math.round(s.map.bounds.height)} in map` : "no map"];
  if (s.map) parts.push(`${s.map.discs.length} disc${s.map.discs.length === 1 ? "" : "s"}`);
  parts.push(`${s.party.length} character${s.party.length === 1 ? "" : "s"}`);
  if (s.fight) parts.push(`round ${s.fight.round}`);
  return parts.join(", ");
}

export type Problem = { at: number; text: string };

export type ReportInput = {
  now: number;
  versions: { app: string; electron: string; chrome: string; os: string };
  displays: (DisplayInfo & { scale: number })[];
  placement: { fullscreen: boolean; surfaceKey: string };
  state: TableState;
  backups: number[];
  problems: Problem[];
};

const time = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

/**
 * The problem report as plain text for the DM to paste to Claude: versions, screens, what the table is on, what the
 * save holds and the latest problems. No names, notes or stats: only what helps find a fault.
 */
export function problemReport(r: ReportInput): string {
  const s = r.state;
  const screens = r.displays.map((d) => {
    const tags = [d.internal && "built-in", d.primary && "main"].filter(Boolean).join(", ");
    return `- ${d.label || `Screen ${d.id}`} (id ${d.id}): ${d.width} × ${d.height} at ${Math.round(d.scale * 100)}%${tags ? `, ${tags}` : ""}`;
  });
  return [
    `Project Terra problem report, ${time(r.now)} UTC`,
    `App ${r.versions.app} · Electron ${r.versions.electron} · Chrome ${r.versions.chrome} · ${r.versions.os}`,
    "",
    "Screens:",
    ...(screens.length ? screens : ["- none reported"]),
    `Table window: ${r.placement.fullscreen ? "fullscreen" : "in a window"} (${r.placement.surfaceKey})`,
    `Calibrated for: ${Object.keys(s.calibrations).join(", ") || "nothing yet"}`,
    "",
    `Save: version ${s.version}, ${describeSave(s)}${s.curtain ? ", curtain down" : ""}`,
    `Earlier saves: ${r.backups.length ? r.backups.map(time).join(", ") : "none yet"}`,
    "",
    `Problems (newest last): ${r.problems.length ? "" : "none"}`,
    ...r.problems.map((p) => `- ${time(p.at)} ${p.text}`),
  ].join("\n");
}
