import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAnnotation, type Annotation } from "./annotation.ts";
import { fogAt, MAX_FOG_OPS, parseFogOp, type FogOp } from "./fog.ts";
import { afterCommand, relook, sightKey } from "./sight.ts";
import { denseRooms } from "./sight-fixtures.ts";
import { apply, defaultState, parseCommand, parseSave, serialize, type Command, type PlacedMap, type TableState } from "./table.ts";
import { blockersFor, blockIndex } from "./wallcheck.ts";

/**
 * Rooms A (x 0–10) and B (x 10–20), 10 inches high, joined by a closed door from (10, 4) to (10, 6). The map edge
 * closes them.
 */
const rooms: Annotation = {
  ...emptyAnnotation(),
  walls: [
    {
      points: [
        { x: 10, y: 0 },
        { x: 10, y: 4 },
      ],
      closed: false,
    },
    {
      points: [
        { x: 10, y: 6 },
        { x: 10, y: 10 },
      ],
      closed: false,
    },
  ],
  openings: [{ kind: "door", a: { x: 10, y: 4 }, b: { x: 10, y: 6 }, open: false }],
};
const map: PlacedMap = {
  id: "map-rooms",
  name: "Two rooms",
  bounds: { x: 0, y: 0, width: 20, height: 10 },
  feetPerSquare: 5,
  x: 0,
  y: 0,
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
const A = { x: 3, y: 3 };
const B = { x: 15, y: 5 };
const hero = { name: "Ash", ac: 15, hp: 10, hpMax: 10, passive: 12, speed: 30 };

const run = (commands: unknown[], from: TableState = defaultState()): TableState =>
  commands.reduce<TableState>((s, raw) => {
    const c = parseCommand(raw);
    assert.ok(c, `parses: ${JSON.stringify(raw)}`);
    return apply(s, c);
  }, from);

/** A command applied with the re-look after it, as main does. */
function step(s: TableState, raw: unknown, ann: Annotation | null = rooms): TableState {
  const c = parseCommand(raw) as Command;
  assert.ok(c, `parses: ${JSON.stringify(raw)}`);
  return afterCommand(s, apply(s, c), c, ann);
}

/** The rooms map with Sight on and one character, without a token yet. */
const ready = (sight: "off" | "on" | "dark" = "on") =>
  run([
    { type: "placeMap", map },
    { type: "sceneSight", id: "scene-1", sight },
    { type: "addCharacter", character: hero },
  ]);
const ops = (s: TableState) => s.map!.fog;

test("relook reveals the token's room and not past a closed door", () => {
  const s = run([{ type: "token", id: "pc-1", at: { x: 4.5, y: 5.5 } }], ready());
  const next = relook(s, blockIndex(rooms, s.map!.doors, s.map!.bounds));
  assert.equal(fogAt(ops(next), A), "seen");
  assert.equal(fogAt(ops(next), B), "unexplored");
  assert.deepEqual(
    ops(next).map((op) => op.kind),
    ["dimSeen", "outline"],
  );
});

test("a second relook dims the first view", () => {
  let s = step(ready(), { type: "token", id: "pc-1", at: { x: 4.5, y: 5.5 } });
  const first = ops(s).length;
  assert.equal(fogAt(ops(s), A), "seen");
  // The door opens, then the token walks into room B.
  s = step(s, { type: "door", key: "d:10.00,4.00,10.00,6.00", open: true });
  s = step(s, { type: "token", id: "pc-1", at: { x: 16.5, y: 5.5 } });
  assert.equal(fogAt(ops(s), B), "seen");
  assert.equal(fogAt(ops(s), { x: 3, y: 1 }), "explored", "room A's corner, out of view through the door");
  // Only `dimSeen` and reveal outlines were added.
  assert.ok(
    ops(s)
      .slice(first)
      .every((op) => op.kind === "dimSeen" || (op.kind === "outline" && op.mode === "reveal")),
  );
});

test("afterCommand: nothing with Sight off", () => {
  const s = ready("off");
  const c: Command = { type: "token", id: "pc-1", at: { x: 4.5, y: 5.5 } };
  const next = apply(s, c);
  assert.equal(afterCommand(s, next, c, rooms), next);
  const door: Command = { type: "door", key: "d:10.00,4.00,10.00,6.00", open: true };
  const opened = apply(next, door);
  assert.equal(afterCommand(next, opened, door, rooms), opened);
});

test("nothing on a map without walls", () => {
  const s = ready();
  const c: Command = { type: "token", id: "pc-1", at: { x: 4.5, y: 5.5 } };
  const next = apply(s, c);
  assert.equal(afterCommand(s, next, c, emptyAnnotation()), next);
  assert.equal(afterCommand(s, next, c, null), next, "no walls file at all");
  // Rooms and areas alone block nothing.
  const roomsOnly = { ...emptyAnnotation(), rooms: [{ outline: [A, B, { x: 3, y: 9 }], name: "1", material: null }] };
  assert.equal(afterCommand(s, next, c, roomsOnly), next);
  // The S1 build decision's reading: none of these has a blocking piece.
  for (const a of [emptyAnnotation(), roomsOnly]) assert.deepEqual(blockersFor(a, {}), []);
});

test("nothing after switchScene or resetScene", () => {
  let s = run([{ type: "markReady", id: "scene-1" }], ready());
  s = step(s, { type: "token", id: "pc-1", at: { x: 4.5, y: 5.5 } });
  const reset: Command = { type: "resetScene" };
  const back = apply(s, reset);
  assert.notEqual(sightKey(back), sightKey(s));
  assert.equal(afterCommand(s, back, reset, rooms), back);
  const other = run([{ type: "addScene", name: "Elsewhere" }], s);
  const sw: Command = { type: "switchScene", id: "scene-1" };
  const returned = apply(other, sw);
  assert.equal(afterCommand(other, returned, sw, rooms), returned);
});

test("relook: blinded, stunned and down tokens add nothing", () => {
  let s = run(
    [
      { type: "placeMap", map },
      { type: "sceneSight", id: "scene-1", sight: "on" },
      { type: "addCharacter", character: { ...hero, conditions: ["blinded"] } },
      { type: "addCharacter", character: { ...hero, name: "Bo", conditions: ["stunned"] } },
      { type: "addCharacter", character: { ...hero, name: "Cy", hp: 0 } },
    ],
    defaultState(),
  );
  s = run(
    [
      { type: "token", id: "pc-1", at: { x: 2.5, y: 2.5 } },
      { type: "token", id: "pc-2", at: { x: 4.5, y: 5.5 } },
      { type: "token", id: "pc-3", at: { x: 15.5, y: 5.5 } },
    ],
    s,
  );
  const next = relook(s, blockIndex(rooms, {}, map.bounds));
  assert.deepEqual(ops(next), [{ kind: "dimSeen" }]);
});

test("off-map tokens add nothing", () => {
  const s = run([{ type: "token", id: "pc-1", at: { x: 30.5, y: 5.5 } }], ready());
  const next = relook(s, blockIndex(rooms, {}, map.bounds));
  assert.deepEqual(ops(next), [{ kind: "dimSeen" }]);
});

test("no seeing token only dims", () => {
  const s = ready("off");
  const next = step(s, { type: "sceneSight", id: "scene-1", sight: "on" });
  assert.deepEqual(ops(next), [{ kind: "dimSeen" }]);
});

test("outlines read back through parseFogOp unchanged", () => {
  const { annotation, bounds, points } = denseRooms(20, 12, 60);
  let s = run([
    { type: "placeMap", map: { ...map, bounds } },
    { type: "sceneSight", id: "scene-1", sight: "on" },
  ]);
  for (const [n, at] of points.entries()) {
    s = run([{ type: "addCharacter", character: { ...hero, name: `Hero ${n + 1}` } }], s);
    s = step(s, { type: "token", id: `pc-${n + 1}`, at }, annotation);
  }
  const outlines = ops(s).filter((op) => op.kind === "outline");
  assert.ok(outlines.length >= 4);
  for (const op of outlines) {
    assert.ok(op.points.length <= 1000);
    assert.deepEqual(parseFogOp(JSON.parse(JSON.stringify(op))), op);
  }
});

test("1,000 re-looks keep the fog list under MAX_FOG_OPS and the save round-trips", () => {
  // A 2-inch closet, so the fallback bake (the cost of this test) covers few cells.
  const closet: Annotation = {
    ...emptyAnnotation(),
    walls: [
      {
        points: [
          { x: 1, y: 1 },
          { x: 3, y: 1 },
          { x: 3, y: 3 },
          { x: 1, y: 3 },
        ],
        closed: true,
      },
    ],
  };
  let s = step(ready(), { type: "token", id: "pc-1", at: { x: 1.5, y: 1.5 } }, closet);
  let longest = 0;
  for (let k = 0; k < 1000; k++) {
    s = step(s, { type: "token", id: "pc-1", at: k % 2 ? { x: 1.5, y: 1.5 } : { x: 2.5, y: 2.5 } }, closet);
    longest = Math.max(longest, ops(s).length);
  }
  assert.ok(longest < MAX_FOG_OPS, `longest list ${longest}`);
  // With no packs landing, the 1,900 fallback baked the list at least once.
  assert.ok(ops(s).some((op: FogOp) => op.kind === "base"));
  const back = parseSave(serialize(s));
  assert.ok(back.ok);
  assert.deepEqual(back.state.map!.fog, ops(s));
  assert.equal(back.state.scenes[0]!.sight, "on");
});
