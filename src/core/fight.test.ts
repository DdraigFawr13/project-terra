import { test } from "node:test";
import assert from "node:assert/strict";
import { blankGroup, conditionOf } from "./fight.ts";
import {
  apply,
  defaultState,
  dropMissingCharacters,
  parseCommand,
  parseSave,
  playerViewOf,
  serialize,
  type PlacedMap,
  type TableState,
} from "./table.ts";

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
const yellowB = (t: TableState) => t.map!.discs.find((d) => d.colour === "yellow" && d.letter === "B")!;

test("discs snap to squares, take the next letter, start hidden, and reach the table only when shown and not down", () => {
  const s = run([
    { type: "placeMap", map },
    { type: "lockMap", on: false },
    { type: "placeDisc", colour: "yellow", x: 4.2, y: 1.9, size: 1 },
    { type: "placeDisc", colour: "yellow", x: 6, y: 6, size: 2 },
    { type: "placeDisc", colour: "red", x: 0.1, y: 0.1, size: 1 },
    { type: "group", colour: "yellow", info: { ...blankGroup(), name: "Zombies" } },
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
    { type: "lockMap", on: false },
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
    { type: "lockMap", on: false },
    { type: "addCharacter", character: { name: "Ash", ...card } },
    { type: "placeDisc", colour: "yellow", x: 1, y: 1, size: 1 },
    { type: "placeDisc", colour: "yellow", x: 3, y: 1, size: 1 },
    { type: "placeDisc", colour: "red", x: 5, y: 1, size: 1 },
    { type: "group", colour: "yellow", info: { ...blankGroup(), name: "Secret cultists", creature: "MM2024:cultist", ac: 12, hpMax: 9 } },
    { type: "showDiscs", colour: "yellow", letter: "B", on: true },
    { type: "discHp", colour: "yellow", letter: "B", change: -5 },
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
  for (const secret of ["Secret", "Ruins", "cultist", "MM2024", "hp", "ac", "passive", "speed", "init", "shown", "notes"])
    assert.ok(!json.includes(secret), secret);
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

test("HP: the condition word follows HP once there is an HP max; damage takes temp HP first (D-028)", () => {
  let s = run([
    { type: "placeMap", map },
    { type: "lockMap", on: false },
    { type: "placeDisc", colour: "yellow", x: 1, y: 1, size: 1 },
    { type: "placeDisc", colour: "yellow", x: 3, y: 1, size: 1 },
    { type: "discHp", colour: "yellow", letter: "B", change: -5 },
    { type: "condition", colour: "yellow", letter: "A", condition: "bloodied" },
  ]);
  // No HP max yet: damage changes nothing and the hand-set word stands.
  assert.equal(yellowB(s).hp, null);
  assert.equal(conditionOf(s.map!.discs[0]!, s.map!.groups), "bloodied");
  s = run(
    [
      { type: "group", colour: "yellow", info: { ...blankGroup(), hpMax: 20 } },
      { type: "discMax", colour: "yellow", letter: "B", hpMax: 40 },
    ],
    s,
  );
  const word = (t: TableState) => conditionOf(yellowB(t), t.map!.groups);
  assert.equal(conditionOf(s.map!.discs[0]!, s.map!.groups), "fine");
  const steps: [number, string][] = [
    [-20, "bloodied"],
    [-10, "nearDeath"],
    [-999, "down"],
    [999, "fine"],
  ];
  for (const [change, expected] of steps) {
    s = run([{ type: "discHp", colour: "yellow", letter: "B", change }], s);
    assert.equal(word(s), expected, String(change));
  }
  // Back to full is stored as "full", so the disc follows a later change to its HP max.
  assert.equal(yellowB(s).hp, null);

  let pc = run([
    { type: "addCharacter", character: { name: "Ash", ...card } },
    { type: "tempHp", id: "pc-1", tempHp: 5 },
  ]);
  pc = run([{ type: "characterHp", id: "pc-1", change: -8 }], pc);
  assert.deepEqual([pc.party[0]!.tempHp, pc.party[0]!.hp], [0, 17]);
  pc = run([{ type: "characterHp", id: "pc-1", change: 100 }], pc);
  assert.deepEqual([pc.party[0]!.tempHp, pc.party[0]!.hp], [0, 24]);
  // A removed character's id is never given out again, and an undo that brings back their roll drops it.
  pc = run([{ type: "startFight" }, { type: "initiative", who: "pc-1", init: 12 }], pc);
  const rolled = pc;
  pc = run(
    [
      { type: "removeCharacter", id: "pc-1" },
      { type: "addCharacter", character: { name: "Bryn", ...card } },
    ],
    pc,
  );
  assert.equal(pc.party[0]!.id, "pc-2");
  const undone = dropMissingCharacters({ ...rolled, party: pc.party, lastCharacter: pc.lastCharacter });
  assert.deepEqual(undone.fight!.entries, []);
});

test("a version 5 save upgrades: group names become group info, discs and cards gain their new fields", () => {
  const disc = { colour: "yellow", letter: "A", x: 0.5, y: 0.5, size: 1, shown: true, condition: "fine" };
  const v5 = {
    version: 5,
    map: { ...map, discs: [disc], groups: { yellow: "Zombies" } },
    party: [{ id: "pc-1", name: "Ash", ...card }],
    fight: null,
  };
  const loaded = parseSave(JSON.stringify(v5));
  assert.ok(loaded.ok);
  assert.deepEqual(loaded.state.map!.groups, { yellow: { ...blankGroup(), name: "Zombies" } });
  assert.deepEqual(loaded.state.map!.discs, [{ ...disc, hp: null, hpMax: null }]);
  assert.deepEqual(loaded.state.party[0], {
    id: "pc-1",
    name: "Ash",
    ...card,
    tempHp: 0,
    insight: null,
    investigation: null,
    spellDc: null,
    notes: "",
  });
});
