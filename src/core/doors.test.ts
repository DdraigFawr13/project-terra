import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAnnotation } from "./annotation.ts";
import { doorAt, doorKey, doorOpen, MAX_DOORS, parseDoors, wallAt, wallKey, wallOff } from "./doors.ts";
import { blockIndex, sightFrom } from "./wallcheck.ts";
import { insidePolygon } from "./fog.ts";
import {
  apply,
  defaultState,
  parseCommand,
  parsePlacedMap,
  parseSave,
  playerViewOf,
  UNDOABLE,
  type PlacedMap,
  type TableState,
} from "./table.ts";

const map: PlacedMap = {
  id: "map-hall",
  name: "Hall",
  bounds: { x: 0, y: 0, width: 10, height: 10 },
  x: 0,
  y: 0,
  feetPerSquare: 5,
  turns: 0,
  fog: [],
  discs: [],
  groups: {},
  pins: [],
  drawings: [],
  spots: [],
  party: null,
  tokens: [],
  doors: {},
};
const run = (commands: unknown[], from: TableState = defaultState()) =>
  commands.reduce<TableState>((s, raw) => {
    const c = parseCommand(raw);
    return c ? apply(s, c) : s;
  }, from);
const door = { kind: "door" as const, a: { x: 3.25, y: 5 }, b: { x: 3.25, y: 4 }, open: false };
const KEY = "d:3.25,4.00,3.25,5.00";

test("open per scene", () => {
  assert.equal(doorKey(door), KEY);
  const one = run([
    { type: "placeMap", map },
    { type: "door", key: KEY, open: true },
  ]);
  assert.equal(doorOpen(door, one.map!.doors), true);
  // A second scene placing the same library map keeps its own door state.
  const two = run(
    [
      { type: "addScene", name: "Again" },
      { type: "placeMap", map },
    ],
    one,
  );
  assert.equal(doorOpen(door, two.map!.doors), false);
  const back = run([{ type: "switchScene", id: "scene-1" }], two);
  assert.equal(doorOpen(door, back.map!.doors), true);
  // A door missing from the record starts as the library map has it.
  assert.equal(doorOpen({ ...door, open: true }, {}), true);
  // The table never gets the record (D-002).
  assert.ok(!JSON.stringify(playerViewOf(back, "window")).includes("3.25"));
});

test("reset restores", () => {
  const ready = run([
    { type: "placeMap", map },
    { type: "markReady", id: "scene-1" },
  ]);
  const opened = run([{ type: "door", key: KEY, open: true }], ready);
  assert.deepEqual(run([{ type: "resetScene" }], opened).map!.doors, {});
});

test("undo", () => {
  assert.ok(UNDOABLE.has("door"));
  const before = run([{ type: "placeMap", map }]);
  const after = run([{ type: "door", key: KEY, open: true }], before);
  assert.deepEqual([before.map!.doors, after.map!.doors], [{}, { [KEY]: true }]);
});

test("a secret door and a door on the same line don't collide", () => {
  const secret = { ...door, kind: "secret" as const };
  assert.equal(doorKey(secret), "s:3.25,4.00,3.25,5.00");
  const doors = { [doorKey(secret)]: true };
  assert.deepEqual([doorOpen(secret, doors), doorOpen(door, doors)], [true, false]);
  // A tap finds the nearest door within a quarter inch, of either kind; windows and openings aren't doors.
  const a = emptyAnnotation();
  a.openings.push(
    door,
    { kind: "window", a: { x: 6, y: 4 }, b: { x: 6, y: 5 }, open: false },
    { ...secret, a: { x: 3.5, y: 4 }, b: { x: 3.5, y: 5 } },
  );
  assert.equal(doorAt(a, { x: 3.3, y: 4.5 }, 0.25), a.openings[0]);
  assert.equal(doorAt(a, { x: 3.45, y: 4.5 }, 0.25), a.openings[2]);
  assert.equal(doorAt(a, { x: 6, y: 4.5 }, 0.25), null);
  assert.equal(doorAt(a, { x: 2.9, y: 4.5 }, 0.25), null);
});

test("bad keys are dropped on load", () => {
  const raw = {
    ...map,
    doors: {
      [KEY]: true,
      "d:1,2,3,4": true,
      "x:1.00,2.00,3.00,4.00": false,
      "s:1.00,2.00,3.00,4.00": "yes",
      "s:-1.00,2.00,3.00,4.00": false,
    },
  };
  assert.deepEqual(parsePlacedMap(raw)!.doors, { [KEY]: true, "s:-1.00,2.00,3.00,4.00": false });
  // Maps saved before doors (save version 17) load with none.
  const { doors: _, ...old } = map;
  assert.deepEqual(parsePlacedMap(old)!.doors, {});
  const saved = parseSave(JSON.stringify({ ...defaultState(), version: 17, map: old }));
  assert.ok(saved.ok && saved.state.version === 18 && Object.keys(saved.state.map!.doors).length === 0);
  // A command with a bad key or value does nothing.
  assert.equal(parseCommand({ type: "door", key: "d:1,2,3,4", open: true }), null);
  assert.equal(parseCommand({ type: "door", key: KEY, open: 1 }), null);
});

test("no new key past 5,000", () => {
  const key = (n: number) => `d:${n}.00,0.00,${n}.00,1.00`;
  const doors = Object.fromEntries(Array.from({ length: MAX_DOORS }, (_, n) => [key(n), true]));
  assert.equal(Object.keys(parsePlacedMap({ ...map, doors: { ...doors, [key(MAX_DOORS)]: true } })!.doors).length, MAX_DOORS);
  const full = run([{ type: "placeMap", map: { ...map, doors } }]);
  assert.equal(run([{ type: "door", key: key(MAX_DOORS), open: true }], full), full);
  // A door already in the record still opens and closes.
  assert.equal(run([{ type: "door", key: key(0), open: false }], full).map!.doors[key(0)], false);
});

test("a wall line switches off and on per scene, as a door, and sight passes it while off (Morgan, 2026-11-07)", () => {
  const a = emptyAnnotation();
  a.walls.push({
    points: [
      { x: 5, y: 0 },
      { x: 5, y: 10 },
    ],
    closed: false,
  });
  const w = a.walls[0]!;
  assert.equal(wallKey(w), "w:5.00,0.00,5.00,10.00,2");
  // The record keeps a wall key like a door key; anything else that only looks like one is dropped.
  assert.deepEqual(parseDoors({ [wallKey(w)]: true, "w:5,0": true, "w:5.00,0.00,5.00,10.00": true }), { [wallKey(w)]: true });
  // A tap finds the wall within reach, and misses beyond it.
  assert.equal(wallAt(a, { x: 5.1, y: 4 }, 0.12), w);
  assert.equal(wallAt(a, { x: 5.2, y: 4 }, 0.12), null);
  const bounds = { x: 0, y: 0, width: 10, height: 10 };
  const seesPast = (doors: Record<string, boolean>) =>
    insidePolygon({ x: 8, y: 5 }, sightFrom(blockIndex(a, doors, bounds), { x: 2, y: 5 }, null));
  assert.equal(wallOff(w, {}), false);
  assert.equal(seesPast({}), false);
  assert.equal(wallOff(w, { [wallKey(w)]: true }), true);
  assert.equal(seesPast({ [wallKey(w)]: true }), true);
  // Through the door command, as a tap sends it: the scene keeps it, and Undo takes it back.
  let s = apply(defaultState(), parseCommand({ type: "placeMap", map })!);
  s = apply(s, parseCommand({ type: "door", key: wallKey(w), open: true })!);
  assert.equal(s.map!.doors[wallKey(w)], true);
  s = apply(s, parseCommand({ type: "door", key: wallKey(w), open: false })!);
  assert.equal(wallOff(w, s.map!.doors), false);
});
