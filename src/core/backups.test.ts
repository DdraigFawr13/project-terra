import { test } from "node:test";
import assert from "node:assert/strict";
import { backupName, backupsIn, problemReport, restoredState, toPrune } from "./backups.ts";
import { defaultState } from "./table.ts";

test("earlier saves: named by time, newest first, only the newest 3 kept; other files are never touched", () => {
  const names = [1, 4, 2, 3].map((n) => backupName(1_790_000_000_000 + n));
  const all = [...names, "table-state.json", "table-state.unreadable-1.json", "table-state.backup-1.json"];
  assert.deepEqual(
    backupsIn(all),
    [4, 3, 2, 1].map((n) => backupName(1_790_000_000_000 + n)),
  );
  assert.deepEqual(toPrune(all), [backupName(1_790_000_000_001)]);
});

test("restoring an earlier save brings back the game but keeps this room's screen and calibration", () => {
  const cal = { corners: [], width: 10, height: 5 } as never;
  const now = { ...defaultState(), curtain: true, playerDisplayId: 7, calibrations: { "display:7": cal }, lastCharacter: 2 };
  const earlier = { ...defaultState(), calibrating: true, party: [{ id: "pc-1" }] as never, lastCharacter: 1 };
  const back = restoredState(now, earlier);
  assert.deepEqual(
    [back.curtain, back.calibrating, back.playerDisplayId, back.calibrations, back.party, back.lastCharacter],
    [true, false, 7, { "display:7": cal }, earlier.party, 1],
  );
});

test("the problem report says what helps find a fault, and no map name", () => {
  const state = { ...defaultState(), map: { name: "Secret Lair", bounds: { x: 0, y: 0, width: 28, height: 19 }, discs: [] } as never };
  const text = problemReport({
    now: Date.UTC(2026, 10, 2, 19, 30),
    versions: { app: "0.1.0", electron: "44", chrome: "140", os: "Windows 10.0.26100" },
    displays: [{ id: 1, label: "", width: 1920, height: 1080, primary: true, internal: true, scale: 1.5 }],
    placement: { fullscreen: false, surfaceKey: "window" },
    state,
    backups: [],
    problems: [{ at: Date.UTC(2026, 10, 2, 19, 29), text: "The table couldn't be saved (EBUSY)." }],
  });
  assert.match(text, /Screen 1 \(id 1\): 1920 × 1080 at 150%, built-in, main/);
  assert.match(text, /a 28 × 19 in map, 0 discs, 0 characters/);
  assert.match(text, /2026-11-02 19:29:00 The table couldn't be saved/);
  assert.ok(!text.includes("Secret Lair"));
});
