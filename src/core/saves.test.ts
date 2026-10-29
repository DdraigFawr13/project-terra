import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeSave,
  dueForEarlier,
  earlierName,
  earlierSaves,
  earlierTime,
  earlierToDrop,
  EARLIER_EVERY_MS,
  problemReport,
} from "./saves.ts";
import { defaultState } from "./table.ts";

test("earlier saves are named by time, kept newest first, and only the newest 3 stay", () => {
  const t = 1_761_700_000_000;
  assert.equal(earlierTime(earlierName(t)), t);
  const names = [
    earlierName(t),
    "table-state.json",
    earlierName(t + 3),
    "table-state.unreadable-5.json",
    earlierName(t + 1),
    earlierName(t + 2),
  ];
  assert.deepEqual(earlierSaves(names), [earlierName(t + 3), earlierName(t + 2), earlierName(t + 1), earlierName(t)]);
  assert.deepEqual(earlierToDrop(names), [earlierName(t)]);
  // The current save and kept unreadable files are never earlier saves, so never deleted.
  assert.equal(earlierTime("table-state.json"), null);
  assert.equal(earlierTime("table-state.unreadable-1761700000000.json"), null);
});

test("an earlier save is due at the first save of a run, then once every 10 minutes", () => {
  assert.equal(dueForEarlier(null, 5), true);
  assert.equal(dueForEarlier(1000, 1000 + EARLIER_EVERY_MS - 1), false);
  assert.equal(dueForEarlier(1000, 1000 + EARLIER_EVERY_MS), true);
});

test("a save is described by its map, discs, round and party", () => {
  const s = defaultState();
  assert.equal(describeSave(s, null), "no map, 0 characters");
  const placed = {
    ...s,
    map: { discs: [{}] } as unknown as NonNullable<typeof s.map>,
    fight: { entries: [], current: null, round: 3 },
    party: [{}] as unknown as typeof s.party,
  };
  assert.equal(describeSave(placed, "Thundertree"), "Thundertree, 1 disc, round 3, 1 character");
  assert.equal(describeSave(placed, null), "a map, 1 disc, round 3, 1 character");
  const scenes = { ...placed, scenes: [...placed.scenes, { id: "scene-2", name: "", removed: false, parked: null }] };
  assert.equal(describeSave(scenes, null), "a map, 1 disc, round 3, 1 character, 2 scenes");
});

test("the problem report lists screens, the table's surface, saves, notices and problems", () => {
  const text = problemReport({
    at: "2026-10-29T19:42:00.000Z",
    app: "0.1.0",
    electron: "44.10.0",
    chrome: "140",
    os: "Windows 10.0.26100",
    displays: [
      { id: 1, label: "Built-in", width: 1280, height: 720, primary: true, internal: true, scale: 1.5 },
      { id: 2, label: "EPSON", width: 1920, height: 1080, primary: false, internal: false, scale: 1 },
    ],
    surfaceKey: "display:2",
    fullscreen: true,
    calibrated: ["display:2"],
    saveBytes: 39000,
    earlier: 2,
    notices: [],
    log: ["2026-10-29T19:40:00.000Z table crashed (oom); reloading."],
  });
  assert.match(text, /^Project Terra problem report, 2026-10-29T19:42/);
  assert.match(text, /- 1 "Built-in" 1280 × 720 at 150%, built-in, main display\n- 2 "EPSON" 1920 × 1080 at 100%\n/);
  assert.match(text, /Table uses display:2, fullscreen; calibrated for display:2/);
  assert.match(text, /Save: 39000 bytes; 2 earlier saves/);
  assert.match(text, /Notices:\n- none/);
  assert.match(text, /Recent problems:\n- 2026-10-29T19:40:00.000Z table crashed/);
});
