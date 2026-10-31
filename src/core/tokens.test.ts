import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { cropSquare, initialsOf, parseCharacterFields, parsePcTokens } from "./fight.ts";
import {
  apply,
  defaultState,
  parseCommand,
  parsePlacedMap,
  parseSave,
  playerViewOf,
  serialize,
  UNDOABLE,
  type PlacedMap,
  type TableState,
} from "./table.ts";

const map: PlacedMap = {
  id: "map-1",
  name: "Secret caves",
  bounds: { x: 0, y: 0, width: 20, height: 10 },
  x: 2,
  y: 3,
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
};
const ash = { name: "Ash Vale", ac: 15, hp: 20, hpMax: 20, passive: 12, speed: 30, notes: "Owes the guild money" };
const run = (commands: unknown[], from: TableState = defaultState()) =>
  commands.reduce<TableState>((s, raw) => {
    const c = parseCommand(raw);
    assert.ok(c, JSON.stringify(raw));
    return apply(s, c);
  }, from);
const placed = () =>
  run([
    { type: "placeMap", map },
    { type: "addCharacter", character: ash },
    { type: "token", id: "pc-1", at: { x: 1.2, y: 1.9 } },
  ]);

test("a token lands on a square, one per character, moves, comes off, and undoes as a map change", () => {
  const s = placed();
  assert.deepEqual(s.map!.tokens, [{ id: "pc-1", x: 1.5, y: 1.5 }]);
  const moved = run([{ type: "token", id: "pc-1", at: { x: 4.1, y: 2.1 } }], s);
  assert.deepEqual(moved.map!.tokens, [{ id: "pc-1", x: 4.5, y: 2.5 }]);
  assert.deepEqual(run([{ type: "token", id: "pc-1", at: null }], s).map!.tokens, []);
  // A character who isn't in the party gets no token.
  assert.deepEqual(run([{ type: "token", id: "pc-9", at: { x: 1, y: 1 } }], s).map!.tokens, s.map!.tokens);
  assert.ok(UNDOABLE.has("token"));
  for (const bad of [
    { type: "token", id: "yellow", at: null },
    { type: "token", id: "pc-1", at: { x: "1", y: 1 } },
  ]) {
    assert.equal(parseCommand(bad), null);
  }
});

test("the table gets only what the token shows: no card, no HP, no notes (D-002, D-045)", () => {
  const s = placed();
  const [token] = playerViewOf(s, "window").tokens;
  assert.deepEqual(token, {
    initials: "AV",
    x: map.x + 1.5,
    y: map.y + 1.5,
    tint: 1,
    picture: null,
    farSide: false,
    mini: false,
    turn: false,
    down: false,
    conditions: [],
  });
  const seen = JSON.stringify(playerViewOf(s, "window"));
  for (const secret of ["guild", "Ash Vale", "hpMax", "passive"]) assert.ok(!seen.includes(secret), secret);
});

test("a token shows its picture key, side, mini, conditions, whose turn it is and when they're down", () => {
  const picture = "pic-0123456789abcdef";
  const pc = placed().party[0]!;
  const s = run(
    [
      { type: "updateCharacter", character: { ...pc, picture, farSide: true, mini: true, conditions: ["prone", "stunned"] } },
      { type: "startFight" },
      { type: "initiative", who: "pc-1", init: 12 },
      { type: "nextTurn" },
    ],
    placed(),
  );
  const [token] = playerViewOf(s, "window").tokens;
  assert.equal(token!.picture, `pc/${picture}`);
  assert.deepEqual(
    [token!.farSide, token!.mini, token!.turn, token!.down, token!.conditions],
    [true, true, true, false, ["prone", "stunned"]],
  );
  // Flip letters turns the discs; a character's token keeps facing its own side.
  assert.equal(playerViewOf(run([{ type: "flipLetters", on: true }], s), "window").tokens[0]!.farSide, true);
  const down = run([{ type: "characterHp", id: "pc-1", change: -20 }], s);
  assert.equal(playerViewOf(down, "window").tokens[0]!.down, true);
});

test("removing a character takes their token off the table", () => {
  const s = run([{ type: "removeCharacter", id: "pc-1" }], placed());
  assert.deepEqual(playerViewOf(s, "window").tokens, []);
});

test("tokens survive a save; saves from before them still load", () => {
  const s = placed();
  const loaded = parseSave(serialize(s));
  assert.ok(loaded.ok);
  assert.deepEqual(loaded.state.map!.tokens, s.map!.tokens);
  const old = JSON.parse(serialize(s));
  old.version = 15;
  delete old.map.tokens;
  for (const k of ["picture", "farSide", "mini", "conditions"]) delete old.party[0][k];
  const before = parseSave(JSON.stringify(old));
  assert.ok(before.ok);
  assert.deepEqual(before.state.map!.tokens, []);
  assert.deepEqual([before.state.party[0]!.picture, before.state.party[0]!.conditions], [null, []]);
});

test("damaged token data is refused rather than guessed at", () => {
  assert.equal(
    parsePlacedMap({
      ...map,
      tokens: [
        { id: "pc-1", x: 0.5, y: 0.5 },
        { id: "pc-1", x: 1.5, y: 0.5 },
      ],
    }),
    null,
  );
  assert.equal(parsePcTokens([{ id: "../x", x: 0.5, y: 0.5 }]), null);
  // -0 passes integer checks but JSON saves it as 0 (LESSONS).
  assert.ok(Object.is(parsePcTokens([{ id: "pc-1", x: -0, y: 0.5 }])![0]!.x, 0));
  for (const bad of [
    { picture: "../../secret" },
    { picture: 3 },
    { farSide: "yes" },
    { conditions: ["bored"] },
    { conditions: ["prone", "prone"] },
  ]) {
    assert.equal(parseCharacterFields({ ...ash, ...bad }), null, JSON.stringify(bad));
  }
});

test("initials: first letters of the first and last words", () => {
  assert.deepEqual(["Ash", "Ash Vale", "  ash   of the vale ", "Élan Ñu", ""].map(initialsOf), ["A", "AV", "AV", "ÉÑ", ""]);
});

test("a crop is always square and inside the picture", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 8000 }),
      fc.integer({ min: 1, max: 8000 }),
      fc.double({ min: 1, max: 6, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      (w, h, zoom, cx, cy) => {
        const c = cropSquare(w, h, zoom, cx, cy);
        assert.ok(c.size > 0 && c.size <= Math.min(w, h));
        assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.size <= w + 1e-6 && c.y + c.size <= h + 1e-6);
      },
    ),
  );
});
