import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, defaultState, parseCommand, parseSave, playerViewOf, serialize, type PlacedMap, type TableState } from "./table.ts";

const map: PlacedMap = {
  id: "map-1",
  name: "Ruins",
  bounds: { x: 0, y: 0, width: 20, height: 10 },
  x: 2,
  y: 3,
  turns: 0,
  fog: [],
  discs: [],
  groups: {},
};
const run = (commands: unknown[], from: TableState = defaultState()) =>
  commands.reduce<TableState>((s, raw) => {
    const c = parseCommand(raw);
    assert.ok(c, JSON.stringify(raw));
    return apply(s, c);
  }, from);
const card = { ac: 16, hp: 20, hpMax: 24, passive: 13, speed: 30 };

test("discs snap to squares, take the next letter, start hidden, and reach the table only when shown and not down", () => {
  const s = run([
    { type: "placeMap", map },
    { type: "placeDisc", colour: "yellow", x: 4.2, y: 1.9, size: 1 },
    { type: "placeDisc", colour: "yellow", x: 6, y: 6, size: 2 },
    { type: "placeDisc", colour: "red", x: 0.1, y: 0.1, size: 1 },
    { type: "nameGroup", colour: "yellow", name: "Ash zombies" },
  ]);
  assert.deepEqual(
    s.map!.discs.map((d) => [d.colour, d.letter, d.x, d.y, d.size, d.shown]),
    [
      ["yellow", "A", 4.5, 1.5, 1, false],
      ["yellow", "B", 6, 6, 2, false],
      ["red", "A", 0.5, 0.5, 1, false],
    ],
  );
  assert.deepEqual(playerViewOf(s, "window").discs, []);
  // One tap shows a whole colour; a down disc leaves the table; the table gets table inches.
  const shown = run(
    [
      { type: "showDiscs", colour: "yellow", letter: null, on: true },
      { type: "condition", colour: "yellow", letter: "B", condition: "down" },
      { type: "turnMap" },
    ],
    s,
  );
  assert.deepEqual(playerViewOf(shown, "window").discs, [{ colour: "yellow", letter: "A", x: 0.5, y: 7.5, size: 1 }]);
  // A removed letter is given out again.
  const again = run(
    [
      { type: "removeDisc", colour: "yellow", letter: "A" },
      { type: "placeDisc", colour: "yellow", x: 1, y: 1, size: 1 },
    ],
    s,
  );
  assert.deepEqual(
    again.map!.discs.map((d) => d.colour + d.letter),
    ["yellowB", "redA", "yellowA"],
  );
});

test("initiative: ties keep typed order, arrows swap only ties, turns skip the down and count rounds", () => {
  let s = run([
    { type: "placeMap", map },
    { type: "addCharacter", character: { name: "Ash", ...card } },
    { type: "addCharacter", character: { name: "Bryn", ...card } },
    { type: "placeDisc", colour: "yellow", x: 1, y: 1, size: 1 },
    { type: "placeDisc", colour: "red", x: 3, y: 1, size: 1 },
    { type: "startFight" },
    { type: "initiative", who: "pc-1", init: 12 },
    { type: "initiative", who: "yellow", init: 15 },
    { type: "initiative", who: "pc-2", init: 12 },
    { type: "initiative", who: "red", init: 4 },
  ]);
  const order = (t: TableState) => t.fight!.entries.map((e) => e.who);
  assert.deepEqual(order(s), ["yellow", "pc-1", "pc-2", "red"]);
  assert.deepEqual(order(run([{ type: "swapTie", who: "pc-1", by: -1 }], s)), order(s));
  s = run([{ type: "swapTie", who: "pc-1", by: 1 }], s);
  assert.deepEqual(order(s), ["yellow", "pc-2", "pc-1", "red"]);

  const turns = (t: TableState, n: number) => {
    const seen: string[] = [];
    for (let i = 0; i < n; i++) {
      t = run([{ type: "nextTurn" }], t);
      seen.push(`${t.fight!.round}:${t.fight!.current}`);
    }
    return seen;
  };
  assert.deepEqual(turns(s, 5), ["1:yellow", "1:pc-2", "1:pc-1", "1:red", "2:yellow"]);
  // Red is down: its turn is skipped. A character removed from the party leaves the fight.
  s = run(
    [
      { type: "condition", colour: "red", letter: "A", condition: "down" },
      { type: "removeCharacter", id: "pc-2" },
    ],
    s,
  );
  assert.deepEqual(turns(s, 3), ["1:yellow", "1:pc-1", "2:yellow"]);
});

test("the turn strip starts at the current turn and holds only what players may see (D-002, D-026)", () => {
  const s = run([
    { type: "placeMap", map },
    { type: "addCharacter", character: { name: "Ash", ...card } },
    { type: "placeDisc", colour: "yellow", x: 1, y: 1, size: 1 },
    { type: "placeDisc", colour: "yellow", x: 3, y: 1, size: 1 },
    { type: "placeDisc", colour: "red", x: 5, y: 1, size: 1 },
    { type: "nameGroup", colour: "yellow", name: "Secret cultists" },
    { type: "showDiscs", colour: "yellow", letter: "B", on: true },
    { type: "condition", colour: "yellow", letter: "B", condition: "bloodied" },
    { type: "startFight" },
    { type: "initiative", who: "yellow", init: 15 },
    { type: "initiative", who: "pc-1", init: 10 },
    { type: "initiative", who: "red", init: 8 },
    { type: "nextTurn" },
    { type: "nextTurn" },
  ]);
  const view = playerViewOf(s, "window");
  // Red is still hidden, so it isn't on the strip; hidden yellow A isn't either.
  assert.deepEqual(view.strip, {
    round: 1,
    chips: [
      { kind: "pc", name: "Ash", current: true },
      { kind: "enemy", colour: "yellow", letter: "B", condition: "bloodied", current: false },
    ],
  });
  const json = JSON.stringify(view);
  for (const secret of ["Secret", "Ruins", "hp", "ac", "passive", "speed", "init", "shown"]) assert.ok(!json.includes(secret), secret);
});

test("cards and the fight save and load; a hand-edited party or fight that doesn't read keeps the file aside", () => {
  const s = run([
    { type: "addCharacter", character: { name: "Ash", ...card, hp: 99 } },
    { type: "startFight" },
    { type: "initiative", who: "pc-1", init: -0 },
  ]);
  assert.equal(s.party[0]!.hp, 24);
  assert.ok(Object.is(s.fight!.entries[0]!.init, 0));
  assert.deepEqual(parseSave(serialize(s)), { ok: true, state: s });
  const bad = {
    ...s,
    fight: {
      entries: [
        { who: "pc-1", init: 1 },
        { who: "red", init: 5 },
      ],
      current: null,
      round: 0,
    },
  };
  assert.equal(parseSave(JSON.stringify(bad)).ok, false);
  assert.equal(parseSave(JSON.stringify({ ...s, party: [{ ...s.party[0], ac: 99 }] })).ok, false);
});
