import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { defaultCalibration } from "./calibration.ts";
import { blankGroup, creatureTypeOf } from "./fight.ts";
import {
  parsePlacedMap,
  apply,
  defaultState,
  MAX_DRAWINGS,
  MAX_LINE_POINTS,
  MAX_PINS,
  parseCommand,
  parseSave,
  playerViewOf,
  sceneTitle,
  coverOf,
  dmStateOf,
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
  feetPerSquare: 5,
  turns: 0,
  fog: [],
  discs: [],
  groups: {},
  pins: [],
  drawings: [],
  spots: [],
  party: null,
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
    { type: "lockMap", on: false },
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
  const bare = [{ type: "removeMap" }, { type: "curtain", on: false }, { type: "calibrating", on: false }];
  // Placing the map switched the test grid off, so taking it away leaves the title until the DM turns the grid on.
  assert.equal(viewOf(run(bare, s)), "idle");
  assert.equal(viewOf(run([...bare, { type: "testGrid", on: true }], s)), "testGrid");
  assert.equal(viewOf(defaultState()), "testGrid");
  assert.equal(viewOf(run([{ type: "testGrid", on: false }])), "idle");
});

test("the table window gets only the player view: no map name, the calibration for its own screen", () => {
  const s = run([
    { type: "curtain", on: true },
    { type: "playerDisplay", id: 7 },
    { type: "calibrations", value: { "display:7": cal } },
    { type: "placeMap", map },
    { type: "lockMap", on: false },
  ]);
  assert.deepEqual(playerViewOf(s, "display:7"), {
    view: "curtain",
    calibration: cal,
    map: { id: "map-1", bounds: map.bounds, x: 4, y: 5, turns: 0, fog: [] },
    discs: [],
    strip: null,
    flipLetters: false,
    // Placing a map switches the test grid off (D-034).
    grid: false,
    pins: [],
    drawings: [],
    cover: null,
    party: null,
  });
  assert.equal(playerViewOf(s, "window").calibration, null);
  assert.ok(!JSON.stringify(playerViewOf(s, "display:7")).includes("Secret"));
});

test("maps move by whole inches and turn in quarter turns", () => {
  const s = run([
    { type: "placeMap", map },
    { type: "lockMap", on: false },
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
  // A locked map can't be moved, turned or taken off, and the same state comes back so no undo step is kept (D-029).
  const locked = run([{ type: "lockMap", on: true }], s);
  for (const c of [{ type: "moveMap", dx: 1, dy: 0 }, { type: "turnMap" }, { type: "removeMap" }] as const)
    assert.equal(apply(locked, c), locked);
  assert.equal(run([{ type: "lockMap", on: false }, { type: "removeMap" }], locked).map, null);
  // A newly placed map starts locked, so dragging pans the view (D-032).
  assert.equal(
    run(
      [
        { type: "lockMap", on: false },
        { type: "placeMap", map },
      ],
      locked,
    ).mapLocked,
    true,
  );
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
    fc.record({
      type: fc.constant("group"),
      colour: fc.constant("red"),
      info: fc.oneof(
        anyValue,
        fc.record({ name: fc.string(), hpMax: fc.oneof(anyValue, fc.constant(10)), ac: anyValue, notes: fc.string() }),
      ),
    }),
    fc.record({
      type: fc.constantFrom("discHp", "discMax"),
      colour: fc.constant("red"),
      letter: fc.constant("A"),
      change: anyValue,
      hpMax: anyValue,
    }),
    fc.record({ type: fc.constantFrom("characterHp", "tempHp"), id: fc.constant("pc-1"), change: anyValue, tempHp: anyValue }),
    fc.record({ type: fc.constantFrom("flipLetters", "lockMap"), on: anyValue }),
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
      type: fc.constantFrom("addScene", "renameScene"),
      id: fc.constantFrom("scene-1", "scene-2", "x"),
      name: fc.oneof(fc.string(), anyValue),
    }),
    fc.record({
      type: fc.constantFrom("switchScene", "copyScene", "moveScene", "removeScene", "emptyRemoved"),
      id: fc.constantFrom("scene-1", "scene-2", "scene-3", "scene-01"),
      by: fc.constantFrom(-1, 1, -0, 2),
      on: anyValue,
    }),
    fc.record({
      type: fc.constantFrom("sceneCurtain", "markReady"),
      id: fc.constantFrom("scene-1", "scene-2"),
      curtain: fc.oneof(
        anyValue,
        fc.record({
          kind: fc.constantFrom("black", "title", "picture", "scene", "x"),
          text: fc.string(),
          id: fc.constantFrom("pic-0123abcd", "x", "scene-1", "scene-2"),
        }),
      ),
    }),
    fc.record({
      type: fc.constantFrom("resetScene", "saveSpot", "goToSpot", "removeSpot"),
      name: fc.oneof(fc.string(), anyValue),
      id: anyValue,
    }),
    fc.record({ type: fc.constant("linkPin"), id: fc.constantFrom(1, 2, -0), scene: fc.constantFrom("scene-1", "scene-2", null, "x") }),
    fc.record({ type: fc.constant("party"), at: fc.oneof(fc.constant(null), anyValue, fc.record({ x: anyValue, y: anyValue })) }),
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
  // A save from before the lock loads its map locked, as a newly placed map is (D-032).
  assert.deepEqual(parseSave(JSON.stringify(v3)), {
    ok: true,
    state: { ...defaultState(), calibrations: { window: cal }, map, mapLocked: true },
  });
  assert.equal(parseSave(JSON.stringify({ version: 16, curtain: true })).ok, false);
  assert.equal(parseSave(JSON.stringify({ curtain: true })).ok, false);
});

test("pins (D-034): placed in map inches, moved with the map, only table pins reach the players, removed and cleared", () => {
  const s = run([
    { type: "placeMap", map },
    { type: "lockMap", on: false },
    { type: "placePin", x: 1.234, y: 2, table: true },
    { type: "placePin", x: 3, y: 1, table: false },
    { type: "moveMap", dx: 1, dy: 0 },
  ]);
  assert.deepEqual(s.map!.pins, [
    { id: 1, x: 1.23, y: 2, table: true, link: null },
    { id: 2, x: 3, y: 1, table: false, link: null },
  ]);
  // The DM's own pin never goes to the table; the table pin moved with the map.
  assert.deepEqual(playerViewOf(s, "window").pins, [{ x: map.x + 1 + 1.23, y: map.y + 2 }]);
  assert.ok(["placePin", "removePin", "clearPins"].every((t) => UNDOABLE.has(t as Command["type"])));
  const removed = run([{ type: "removePin", id: 1 }], s);
  assert.deepEqual(
    removed.map!.pins.map((p) => p.id),
    [2],
  );
  // A removed pin's id isn't reused while a higher one stands; removing a missing pin changes nothing.
  assert.equal(run([{ type: "placePin", x: 0, y: 0, table: true }], removed).map!.pins[1]!.id, 3);
  assert.equal(run([{ type: "removePin", id: 9 }], s), s);
  assert.deepEqual(run([{ type: "clearPins" }], s).map!.pins, []);
  // No map, no pin; and never more than MAX_PINS.
  assert.equal(run([{ type: "placePin", x: 0, y: 0, table: true }]).map, null);
  const full = run(
    Array.from({ length: MAX_PINS + 3 }, () => ({ type: "placePin", x: 0, y: 0, table: false })),
    s,
  );
  assert.equal(full.map!.pins.length, MAX_PINS);
  assert.equal(parseCommand({ type: "placePin", x: 0, y: 0 }), null);
  // Pins save and load; a version 7 save (no pins) loads with none; a bad pin list keeps the file aside.
  assert.deepEqual(parseSave(serialize(s)), { ok: true, state: s });
  const v7 = JSON.parse(serialize(s));
  v7.version = 7;
  delete v7.map.pins;
  assert.deepEqual((parseSave(JSON.stringify(v7)) as { state: TableState }).state.map!.pins, []);
  v7.map.pins = [
    { id: 1, x: 0, y: 0, table: true },
    { id: 1, x: 1, y: 1, table: true },
  ];
  assert.equal(parseSave(JSON.stringify(v7)).ok, false);
});

test("lasting drawings (D-035): kept in map inches, only the players' lines reach the table, removed, cleared and saved", () => {
  const line = [
    { x: 0, y: 0 },
    { x: 1.234, y: 1 },
  ];
  const s = run([
    { type: "placeMap", map },
    { type: "draw", ink: "cyan", table: true, points: line },
    { type: "draw", ink: "white", table: false, points: line },
  ]);
  assert.deepEqual(
    s.map!.drawings.map((d) => [d.id, d.ink, d.table, d.points[1]]),
    [
      [1, "cyan", true, { x: 1.23, y: 1 }],
      [2, "white", false, { x: 1.23, y: 1 }],
    ],
  );
  assert.deepEqual(playerViewOf(s, "window").drawings, [
    {
      ink: "cyan",
      points: [
        { x: map.x, y: map.y },
        { x: map.x + 1.23, y: map.y + 1 },
      ],
    },
  ]);
  assert.ok(["draw", "removeDrawing", "clearDrawings"].every((t) => UNDOABLE.has(t as Command["type"])));
  assert.deepEqual(
    run([{ type: "removeDrawing", id: 1 }], s).map!.drawings.map((d) => d.id),
    [2],
  );
  assert.deepEqual(run([{ type: "clearDrawings" }], s).map!.drawings, []);
  // Bad lines are refused: one point, too many points, a disc colour as ink.
  assert.equal(parseCommand({ type: "draw", ink: "white", table: true, points: [line[0]] }), null);
  assert.equal(parseCommand({ type: "draw", ink: "white", table: true, points: Array(MAX_LINE_POINTS + 1).fill(line[0]) }), null);
  assert.equal(parseCommand({ type: "draw", ink: "red", table: true, points: line }), null);
  const full = run(
    Array.from({ length: MAX_DRAWINGS + 2 }, () => ({ type: "draw", ink: "white", table: true, points: line })),
    s,
  );
  assert.equal(full.map!.drawings.length, MAX_DRAWINGS);
  // Saves: drawings round-trip; a version 8 save loads with none.
  assert.deepEqual(parseSave(serialize(s)), { ok: true, state: s });
  const v8 = JSON.parse(serialize(s));
  v8.version = 8;
  delete v8.map.drawings;
  assert.deepEqual((parseSave(JSON.stringify(v8)) as { state: TableState }).state.map!.drawings, []);
});

test("feet per square (D-036): stored with the map, 5 ft for older saves, anything else refused", () => {
  const s = run([{ type: "placeMap", map: { ...map, feetPerSquare: 10 } }]);
  assert.equal(s.map!.feetPerSquare, 10);
  assert.deepEqual(parseSave(serialize(s)), { ok: true, state: s });
  const v9 = JSON.parse(serialize(s));
  v9.version = 9;
  delete v9.map.feetPerSquare;
  assert.equal((parseSave(JSON.stringify(v9)) as { state: TableState }).state.map!.feetPerSquare, 5);
  for (const bad of [7, "10", 0, null]) assert.equal(parsePlacedMap({ ...map, feetPerSquare: bad }), null);
});

test("revealed tokens (D-036): the table gets a group's symbol only after Reveal, never its name; Mini on it moves the letter", () => {
  const zombies = { ...blankGroup(), name: "Secret zombies", symbol: creatureTypeOf("Medium Undead, Neutral Evil") };
  const s = run([
    { type: "placeMap", map },
    { type: "group", colour: "yellow", info: zombies },
    { type: "placeDisc", colour: "yellow", x: 1, y: 1, size: 1 },
    { type: "showDiscs", colour: "yellow", letter: null, on: true },
  ]);
  const disc = (st: TableState) => playerViewOf(st, "window").discs[0]!;
  assert.deepEqual([disc(s).symbol, disc(s).mini], [null, false]);
  const s2 = run(
    [
      { type: "group", colour: "yellow", info: { ...zombies, revealed: true } },
      { type: "discMini", colour: "yellow", letter: "A", on: true },
    ],
    s,
  );
  assert.deepEqual([disc(s2).symbol, disc(s2).mini], ["undead", true]);
  assert.ok(!JSON.stringify(playerViewOf(s2, "window")).includes("Secret"));
  // Portraits: on 2-inch tokens once the linked creature has one; on 1-inch tokens only when the DM asks.
  const linked = { ...zombies, revealed: true, creature: "MM2024:zombie", hasPortrait: true };
  const s3 = run(
    [
      { type: "group", colour: "yellow", info: linked },
      { type: "placeDisc", colour: "yellow", x: 5, y: 5, size: 2 },
      { type: "showDiscs", colour: "yellow", letter: null, on: true },
    ],
    s2,
  );
  const [small, big] = playerViewOf(s3, "window").discs;
  assert.equal(small!.portrait, null);
  assert.match(big!.portrait!, /^yellow\/[a-z0-9]+$/);
  assert.ok(!big!.portrait!.includes("zombie"));
  const s4 = run([{ type: "group", colour: "yellow", info: { ...linked, smallPortrait: true } }], s3);
  assert.equal(playerViewOf(s4, "window").discs[0]!.portrait, big!.portrait);
  assert.equal(parseCommand({ type: "group", colour: "yellow", info: { ...zombies, symbol: "zombie" } }), null);
  assert.deepEqual(parseSave(serialize(s2)), { ok: true, state: s2 });
});

test("scenes (D-039): each keeps its own map, discs and paused fight; switching drops the curtain", () => {
  const cave = run([
    { type: "placeMap", map },
    { type: "placeDisc", colour: "red", x: 1, y: 1, size: 1 },
    { type: "placePin", x: 2, y: 2, table: true },
    { type: "addCharacter", character: { name: "Ash", ac: 15, hp: 20, hpMax: 20, passive: 12, speed: 30 } },
    { type: "startFight" },
    { type: "initiative", who: "pc-1", init: 14 },
    { type: "initiative", who: "red", init: 9 },
    { type: "nextTurn" },
  ]);
  const s = run([{ type: "addScene", name: "Road" }], cave);
  // A new scene is empty and on the table, behind the curtain; the cave waits with everything in it.
  assert.equal(s.scene, "scene-2");
  assert.deepEqual([s.map, s.fight, s.mapLocked, s.curtain], [null, null, false, true]);
  assert.deepEqual(s.scenes[0]!.parked, { map: cave.map, fight: cave.fight, mapLocked: true });
  // The party is shared: HP changed on the road is the same Ash back in the cave.
  const back = run(
    [
      { type: "characterHp", id: "pc-1", change: -5 },
      { type: "curtain", on: false },
      { type: "switchScene", id: "scene-1" },
    ],
    s,
  );
  assert.deepEqual([back.map, back.fight, back.curtain, back.party[0]!.hp], [cave.map, cave.fight, true, 15]);
  assert.deepEqual(back.scenes[1]!.parked, { map: null, fight: null, mapLocked: false });
  // A character removed while the fight waits leaves its turn order on the way back (D-027).
  const gone = run(
    [
      { type: "removeCharacter", id: "pc-1" },
      { type: "switchScene", id: "scene-1" },
    ],
    s,
  );
  assert.deepEqual(
    gone.fight!.entries.map((e) => e.who),
    ["red"],
  );
  // Nothing from a waiting scene reaches the table window (D-002).
  const road = run(
    [
      { type: "renameScene", id: "scene-1", name: "Goblin ambush" },
      { type: "curtain", on: false },
    ],
    s,
  );
  const view = JSON.stringify(playerViewOf(road, "window"));
  assert.ok(!view.includes("map-1") && !view.includes("Goblin") && !view.includes("Secret"));
  assert.deepEqual([playerViewOf(road, "window").discs, playerViewOf(road, "window").pins], [[], []]);
});

test("scene list (D-039): names, order, copies and the Removed list", () => {
  const s = run([
    { type: "placeMap", map },
    { type: "addScene", name: "" },
    { type: "addScene", name: "Road" },
  ]);
  // An unnamed scene goes by its map's name, or says it is empty.
  assert.deepEqual(
    s.scenes.map((sc) => sceneTitle(s, sc)),
    [map.name, "Empty scene", "Road"],
  );
  const copied = run(
    [
      { type: "copyScene", id: "scene-1" },
      { type: "moveScene", id: "scene-3", by: -1 },
    ],
    s,
  );
  assert.deepEqual(
    copied.scenes.map((sc) => sc.id),
    ["scene-1", "scene-4", "scene-3", "scene-2"],
  );
  assert.equal(sceneTitle(copied, copied.scenes[1]!), `${map.name} copy`);
  assert.deepEqual(copied.scenes[1]!.parked!.map, map);
  // The scene on the table can't be removed; others go to the Removed list and come back, or are emptied for good.
  assert.equal(run([{ type: "removeScene", id: "scene-3", on: true }], copied), copied);
  const removed = run([{ type: "removeScene", id: "scene-1", on: true }], copied);
  assert.equal(run([{ type: "switchScene", id: "scene-1" }], removed), removed);
  assert.deepEqual(run([{ type: "removeScene", id: "scene-1", on: false }], removed), copied);
  const emptied = run([{ type: "emptyRemoved" }], removed);
  assert.deepEqual(
    emptied.scenes.map((sc) => sc.id),
    ["scene-4", "scene-3", "scene-2"],
  );
  // Ids are never reused, so a scene's undo steps can't land in another.
  assert.equal(run([{ type: "addScene", name: "" }], emptied).scene, "scene-5");
});

test("saves before scenes upgrade to one scene; a damaged scene list keeps the file aside", () => {
  const v12 = { ...defaultState(), version: 12, map, scenes: undefined, scene: undefined, lastScene: undefined };
  const parsed = parseSave(JSON.stringify(v12));
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.state.scenes, [
    { id: "scene-1", name: "", removed: false, parked: null, curtain: { kind: "black" }, ready: null },
  ]);
  const two = run([
    { type: "placeMap", map },
    { type: "addScene", name: "Road" },
  ]);
  const bad = (change: (raw: Record<string, unknown>) => void) => {
    const raw = JSON.parse(serialize(two)) as Record<string, unknown>;
    change(raw);
    return parseSave(JSON.stringify(raw)).ok;
  };
  assert.equal(
    bad(() => {}),
    true,
  );
  assert.equal(
    bad((r) => (r.scene = "scene-1")),
    false,
  );
  assert.equal(
    bad((r) => ((r.scenes as { parked: unknown }[])[0]!.parked = null)),
    false,
  );
  assert.equal(
    bad((r) => ((r.scenes as { parked: { map: unknown } }[])[0]!.parked.map = { id: "nope" })),
    false,
  );
});

test("a scene's own curtain (D-039): shown after a switch, never under B; title and picture only, never the name", () => {
  const s = run([
    { type: "renameScene", id: "scene-1", name: "Goblin ambush" },
    { type: "sceneCurtain", id: "scene-1", curtain: { kind: "title", text: "The forest road" } },
    { type: "addScene", name: "Mill" },
    { type: "sceneCurtain", id: "scene-2", curtain: { kind: "picture", id: "pic-0123abcd" } },
    { type: "switchScene", id: "scene-1" },
  ]);
  assert.deepEqual(playerViewOf(s, "window").cover, { title: "The forest road" });
  assert.ok(!JSON.stringify(playerViewOf(s, "window")).includes("Goblin"));
  assert.deepEqual(coverOf(run([{ type: "switchScene", id: "scene-2" }], s)), { picture: "pic-0123abcd" });
  // Lifting it ends the scene's curtain; B brings back plain black.
  assert.equal(
    coverOf(
      run(
        [
          { type: "curtain", on: false },
          { type: "curtain", on: true },
        ],
        s,
      ),
    ),
    null,
  );
  assert.equal(coverOf(run([{ type: "curtain", on: true }], s)), null);
  assert.equal(run([{ type: "sceneCurtain", id: "scene-1", curtain: { kind: "title", text: "x".repeat(81) } }], s), s);
});

test("saved spots (D-039) slide even a locked map, on whole inches; Mark ready and Reset put a scene back", () => {
  const s = run([
    { type: "placeMap", map },
    { type: "saveSpot", name: "Gate" },
    { type: "lockMap", on: false },
    { type: "moveMap", dx: 20, dy: 0 },
    { type: "turnMap" },
    { type: "lockMap", on: true },
    { type: "saveSpot", name: "Tower" },
  ]);
  assert.deepEqual(s.map!.spots, [
    { id: 1, name: "Gate", x: 4, y: 5, turns: 0 },
    { id: 2, name: "Tower", x: 24, y: 5, turns: 1 },
  ]);
  const gate = run([{ type: "goToSpot", id: 1 }], s);
  assert.deepEqual([gate.map!.x, gate.map!.y, gate.map!.turns, gate.mapLocked], [4, 5, 0, true]);
  assert.deepEqual(
    run([{ type: "removeSpot", id: 1 }], s).map!.spots.map((p) => p.name),
    ["Tower"],
  );
  // Reset goes back to the copy kept at Mark ready, fight and all.
  const ready = run([{ type: "markReady", id: "scene-1" }], s);
  const played = run(
    [{ type: "placeDisc", colour: "red", x: 1, y: 1, size: 1 }, { type: "startFight" }, { type: "fog", op: { kind: "revealAll" } }],
    ready,
  );
  const reset = run([{ type: "resetScene" }], played);
  assert.deepEqual([reset.map, reset.fight], [s.map, null]);
  assert.equal(run([{ type: "resetScene" }], s), s);
  // The DM window gets waiting scenes and ready copies without their contents.
  const away = dmStateOf(run([{ type: "addScene", name: "" }], played));
  assert.deepEqual([away.scenes[0]!.parked!.map!.discs, away.scenes[0]!.ready!.map!.spots], [[], []]);
});

test("the world map (D-039): link pins, the party marker, and the world map as another scene's curtain", () => {
  const world = { ...map, id: "map-world", name: "The region (DM)" };
  const s = run([
    { type: "placeMap", map: world },
    { type: "renameScene", id: "scene-1", name: "World" },
    { type: "fog", op: { kind: "revealAll" } },
    { type: "placePin", x: 3, y: 3, table: true },
    { type: "placePin", x: 6, y: 3, table: true },
    { type: "linkPin", id: 1, scene: "scene-2" },
    { type: "party", at: { x: 1.234, y: 2 } },
    { type: "addScene", name: "Secret cave" },
    { type: "placeMap", map },
    { type: "sceneCurtain", id: "scene-2", curtain: { kind: "scene", id: "scene-1" } },
    { type: "switchScene", id: "scene-1" },
    { type: "switchScene", id: "scene-2" },
  ]);
  // A linked pin is the DM's own until they say otherwise; the link never reaches the table.
  const pins = s.scenes[0]!.parked!.map!.pins;
  assert.deepEqual(
    pins.map((p) => [p.link, p.table]),
    [
      ["scene-2", false],
      [null, true],
    ],
  );
  // Behind the cave's curtain, the table shows the world as the players know it, party marker and all.
  const view = playerViewOf(s, "window");
  assert.deepEqual([view.view, view.map?.id, view.party, view.pins.length, view.strip], ["map", "map-world", { x: 5.23, y: 7 }, 1, null]);
  assert.ok(!JSON.stringify(view).includes("Secret") && !JSON.stringify(view).includes("scene-"));
  // Lifting the curtain shows the cave; B is plain black.
  assert.equal(playerViewOf(run([{ type: "curtain", on: false }], s), "window").map?.id, "map-1");
  assert.equal(playerViewOf(run([{ type: "curtain", on: true }], s), "window").view, "curtain");
  // A removed world map can't be shown.
  assert.equal(playerViewOf(run([{ type: "removeScene", id: "scene-1", on: true }], s), "window").view, "curtain");
  assert.equal(run([{ type: "party", at: null }], s).map!.party, null);
  // The DM window's thumbnail draws the same: the world comes whole while it is the curtain.
  assert.deepEqual(playerViewOf(dmStateOf(s), "window"), view);
});
