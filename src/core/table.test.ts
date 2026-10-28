import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { defaultCalibration } from "./calibration.ts";
import {
  apply,
  defaultState,
  parseCommand,
  parseSave,
  playerViewOf,
  serialize,
  UNDOABLE,
  viewOf,
  type Command,
  type PlacedMap,
  type TableState,
} from "./table.ts";

const cal = defaultCalibration({ width: 1920, height: 1080, scale: 1 });
const map: PlacedMap = {
  id: "map-1",
  name: "Secret caves (DM only)",
  bounds: { x: -2, y: -3, width: 30, height: 20 },
  x: 4,
  y: 5,
  turns: 0,
  fog: [],
  discs: [],
  groups: {},
};
const run = (commands: unknown[], from: TableState = defaultState()) =>
  commands.reduce<TableState>((s, raw) => {
    const c = parseCommand(raw);
    return c ? apply(s, c) : s;
  }, from);

test("curtain wins over calibration, then the map, then the test grid", () => {
  const s = run([
    { type: "calibrating", on: true },
    { type: "curtain", on: true },
    { type: "placeMap", map },
  ]);
  assert.equal(viewOf(s), "curtain");
  assert.equal(viewOf(run([{ type: "curtain", on: false }], s)), "calibrate");
  assert.equal(
    viewOf(
      run(
        [
          { type: "curtain", on: false },
          { type: "calibrating", on: false },
        ],
        s,
      ),
    ),
    "map",
  );
  assert.equal(viewOf(run([{ type: "removeMap" }, { type: "curtain", on: false }, { type: "calibrating", on: false }], s)), "testGrid");
  assert.equal(viewOf(defaultState()), "testGrid");
  assert.equal(viewOf(run([{ type: "testGrid", on: false }])), "idle");
});

test("the table window gets only the player view: no map name, the calibration for its own screen", () => {
  const s = run([
    { type: "curtain", on: true },
    { type: "playerDisplay", id: 7 },
    { type: "calibrations", value: { "display:7": cal } },
    { type: "placeMap", map },
  ]);
  assert.deepEqual(playerViewOf(s, "display:7"), {
    view: "curtain",
    calibration: cal,
    map: { id: "map-1", bounds: map.bounds, x: 4, y: 5, turns: 0, fog: [] },
    discs: [],
    strip: null,
    grid: true,
  });
  assert.equal(playerViewOf(s, "window").calibration, null);
  assert.ok(!JSON.stringify(playerViewOf(s, "display:7")).includes("Secret"));
});

test("maps move by whole inches and turn in quarter turns", () => {
  const s = run([
    { type: "placeMap", map },
    { type: "moveMap", dx: -1, dy: 2 },
    { type: "turnMap" },
    { type: "turnMap" },
    { type: "turnMap" },
    { type: "turnMap" },
    { type: "turnMap" },
  ]);
  assert.deepEqual(s.map, { ...map, x: 3, y: 7, turns: 1 });
  assert.equal(parseCommand({ type: "moveMap", dx: 0.5, dy: 0 }), null);
  // Fog is kept in map inches, so it moves and turns with the map; a fog command with no map changes nothing.
  const reveal = { kind: "box", mode: "reveal", x: 0, y: 0, width: 2, height: 2 } as const;
  const fogged = run([{ type: "fog", op: reveal }, { type: "moveMap", dx: 3, dy: 0 }, { type: "turnMap" }], s);
  assert.deepEqual(fogged.map!.fog, [reveal]);
  assert.deepEqual(playerViewOf(fogged, "window").map!.fog, [reveal]);
  assert.ok(UNDOABLE.has("fog"));
  assert.deepEqual(run([{ type: "fog", op: reveal }]), defaultState());
  // Moving or turning with no map changes nothing.
  assert.deepEqual(run([{ type: "moveMap", dx: 1, dy: 1 }, { type: "turnMap" }]), defaultState());
});

test("commands with wrong parts are refused", () => {
  const bad = [
    { type: "curtain", on: "yes" },
    { type: "testGrid", on: 1 },
    { type: "playerDisplay", id: 1.5 },
    { type: "calibrations", value: [cal] },
    { type: "placeMap", map: { ...map, id: "../../etc/passwd" } },
    { type: "placeMap", map: { ...map, turns: 4 } },
    { type: "placeMap", map: { ...map, bounds: { ...map.bounds, width: 0 } } },
    { type: "explode" },
    { type: "placeDisc", colour: "black", x: 1, y: 1, size: 1 },
    { type: "placeDisc", colour: "red", x: 1, y: 1, size: 5 },
    { type: "moveDisc", colour: "red", letter: "a", x: 1, y: 1 },
    { type: "condition", colour: "red", letter: "A", condition: "dead" },
    { type: "initiative", who: "red", init: 2.5 },
    { type: "initiative", who: "pc-x", init: 2 },
    { type: "swapTie", who: "red", by: 2 },
    { type: "addCharacter", character: { name: "", ac: 15, hp: 10, hpMax: 10, passive: 12, speed: 30 } },
    { type: "addCharacter", character: { name: "Ash", ac: 15, hp: 10, hpMax: 0, passive: 12, speed: 30 } },
    null,
  ];
  for (const c of bad) assert.equal(parseCommand(c), null, JSON.stringify(c));
  // A broken calibration is dropped; the good ones in the same command are kept, and odd keys like __proto__ go.
  const t = run([
    JSON.parse(
      `{"type":"calibrations","value":{"window":${JSON.stringify(cal)},"display:2":{"widthIn":-1},"__proto__":${JSON.stringify(cal)}}}`,
    ),
  ]);
  assert.deepEqual(t.calibrations, { window: cal });
});

test("the same commands give the same state, and any state saves and loads unchanged (GAME-05, GAME-06)", () => {
  const anyValue = fc.oneof(
    fc.boolean(),
    fc.integer({ min: -600, max: 600 }),
    fc.double(),
    fc.constant(-0),
    fc.string(),
    fc.constant(null),
  );
  const command = fc.oneof(
    fc.record({ type: fc.constantFrom("curtain", "calibrating", "testGrid"), on: anyValue }),
    fc.record({ type: fc.constant("playerDisplay"), id: anyValue }),
    fc.record({
      type: fc.constant("calibrations"),
      value: fc.oneof(anyValue, fc.dictionary(fc.constantFrom("window", "display:2", "x"), fc.oneof(fc.constant(cal), anyValue))),
    }),
    fc.record({
      type: fc.constant("placeMap"),
      map: fc.oneof(
        anyValue,
        fc.record({ x: anyValue, y: anyValue, turns: anyValue }).map((m) => ({ ...map, ...m })),
      ),
    }),
    fc.record({ type: fc.constant("moveMap"), dx: anyValue, dy: anyValue }),
    fc.record({ type: fc.constantFrom("turnMap", "removeMap") }),
    fc.record({ type: fc.constant("placeDisc"), colour: fc.constantFrom("red", "yellow"), x: anyValue, y: anyValue, size: anyValue }),
    fc.record({ type: fc.constant("moveDisc"), colour: fc.constant("red"), letter: fc.constantFrom("A", "B"), x: anyValue, y: anyValue }),
    fc.record({
      type: fc.constantFrom("removeDisc", "condition", "showDiscs"),
      colour: fc.constant("red"),
      letter: fc.constantFrom("A", null),
      condition: fc.constantFrom("down", "bloodied", "x"),
      on: anyValue,
    }),
    fc.record({ type: fc.constant("nameGroup"), colour: fc.constant("red"), name: fc.oneof(fc.string(), anyValue) }),
    fc.record({
      type: fc.constant("addCharacter"),
      character: fc.record({
        name: fc.constantFrom("Ash", " "),
        ac: anyValue,
        hp: anyValue,
        hpMax: anyValue,
        passive: anyValue,
        speed: anyValue,
      }),
    }),
    fc.record({
      type: fc.constant("updateCharacter"),
      character: fc.record({
        id: fc.constantFrom("pc-1", "pc-2"),
        name: fc.constant("Bo"),
        ac: fc.constant(12),
        hp: anyValue,
        hpMax: fc.constant(9),
        passive: fc.constant(10),
        speed: fc.constant(30),
      }),
    }),
    fc.record({ type: fc.constant("removeCharacter"), id: fc.constantFrom("pc-1", "red") }),
    fc.record({ type: fc.constantFrom("startFight", "endFight", "nextTurn") }),
    fc.record({
      type: fc.constant("initiative"),
      who: fc.constantFrom("pc-1", "pc-2", "red", "yellow"),
      init: fc.oneof(anyValue, fc.integer({ min: -2, max: 3 })),
    }),
    fc.record({ type: fc.constant("swapTie"), who: fc.constantFrom("pc-1", "red"), by: fc.constantFrom(-1, 1, -0) }),
    fc.record({
      type: fc.constant("fog"),
      op: fc.oneof(
        anyValue,
        fc.record({ kind: fc.constantFrom("revealAll", "dimSeen", "coverAll") }),
        fc.record({
          kind: fc.constant("brush"),
          mode: fc.constantFrom("reveal", "hide"),
          r: fc.oneof(fc.constant(1), anyValue),
          points: fc.array(fc.record({ x: anyValue, y: anyValue }), { minLength: 1, maxLength: 4 }),
        }),
      ),
    }),
  );
  fc.assert(
    fc.property(fc.array(command, { maxLength: 40 }), (commands: unknown[]) => {
      const s = run(commands);
      assert.deepEqual(run(commands), s);
      assert.deepEqual(parseSave(serialize(s)), { ok: true, state: s });
    }),
  );
});

test("older saves upgrade; unreadable or unknown saves are reported, not guessed", () => {
  const v1 = { version: 1, curtain: true, testGrid: false, playerDisplayId: 3 };
  assert.deepEqual(parseSave(JSON.stringify(v1)), {
    ok: true,
    state: { ...defaultState(), curtain: true, testGrid: false, playerDisplayId: 3 },
  });
  const v2 = { version: 2, curtain: false, calibrating: false, testGrid: true, playerDisplayId: null, calibrations: { window: cal } };
  assert.deepEqual(parseSave(JSON.stringify(v2)), { ok: true, state: { ...defaultState(), calibrations: { window: cal } } });
  assert.equal(parseSave("{oops").ok, false);
  assert.equal(parseSave("[]").ok, false);
  // A version 3 map has no fog: it loads all black.
  const v3 = { ...v2, version: 3, map: { id: "map-1", name: map.name, bounds: map.bounds, x: 4, y: 5, turns: 0 } };
  assert.deepEqual(parseSave(JSON.stringify(v3)), { ok: true, state: { ...defaultState(), calibrations: { window: cal }, map } });
  assert.equal(parseSave(JSON.stringify({ version: 6, curtain: true })).ok, false);
  assert.equal(parseSave(JSON.stringify({ curtain: true })).ok, false);
});
