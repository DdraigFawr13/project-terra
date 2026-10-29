import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCreatureFile, searchCreatures } from "./creatures.ts";

// A stat block in the library's shape with SRD 5.2 numbers (D-010: tests use SRD creatures only, no book text).
const zombie = {
  id: "zombie",
  name: "Zombie",
  source: { book: "SRD52", page: null },
  size: "Medium",
  type: "Undead",
  tags: [],
  alignment: "Neutral Evil",
  ac: 8,
  acNote: null,
  initiative: { mod: -2, score: 8 },
  hp: { avg: 15, formula: "2d8 + 6" },
  speed: { walk: 20, fly: null, swim: null, climb: null, burrow: null, hover: false },
  abilities: { str: { score: 13, mod: 1, save: 1 }, dex: { score: 6, mod: -2, save: -2 }, con: { score: 16, mod: 3, save: 3 } },
  skills: {},
  immunities: ["Poison"],
  conditionImmunities: ["Exhaustion", "Poisoned"],
  senses: { darkvision: 60, passivePerception: 8 },
  languages: ["Understands Common plus one other language but can't speak"],
  cr: "1/4",
  xp: 50,
  traits: [{ name: "Test trait", text: "Text for the test." }],
  actions: [
    { name: "Slam", text: "Test attack." },
    { name: 7, text: "dropped: name isn't text" },
  ],
  bonusActions: [],
  reactions: [],
  legendary: null,
  checks: { pageChecked: true },
};

test("library stat blocks are read into what the monster window shows; broken ones are counted and left out", () => {
  const file = parseCreatureFile([zombie, { ...zombie, id: "ghoul-x", name: "Unchecked thing", checks: {} }, { name: "no id" }, null]);
  assert.ok(file);
  assert.equal(file.skipped, 2);
  const [z, u] = file.creatures;
  assert.deepEqual(
    [z!.key, z!.kind, z!.ac, z!.hp, z!.hpFormula, z!.speed, z!.speedText, z!.initiative, z!.checked, u!.checked],
    ["SRD52:zombie", "Medium Undead, Neutral Evil", 8, 15, "2d8 + 6", 20, "20 ft.", "-2 (8)", true, false],
  );
  assert.deepEqual(z!.details, [
    ["Immunities", "Poison, Exhaustion, Poisoned"],
    ["Senses", "Darkvision 60 ft., Passive Perception 8"],
    ["Languages", "Understands Common plus one other language but can't speak"],
    ["CR", "1/4 (XP 50)"],
  ]);
  assert.deepEqual(z!.actions, [{ name: "Slam", text: "Test attack." }]);
  // A portrait (D-036) is an image data URL; anything else is left out, so a file can't point the app elsewhere.
  const png = "data:image/png;base64,iVBORw0KGgo=";
  const withArt = ["https://example.com/z.png", "data:text/html;base64,PGI+", png].map(
    (portrait) => parseCreatureFile([{ ...zombie, portrait }])!.creatures[0]!.portrait,
  );
  assert.deepEqual([z!.portrait, ...withArt], [null, null, null, png]);
  assert.equal(parseCreatureFile({ creatures: [] }), null);
  assert.equal(parseCreatureFile([{ name: "no id" }]), null);
  // Search: every word must match; page-checked entries come first.
  assert.deepEqual(
    searchCreatures(file.creatures, "  ").map((h) => [h.name, h.checked, h.cr]),
    [
      ["Zombie", true, "1/4"],
      ["Unchecked thing", false, "1/4"],
    ],
  );
  assert.deepEqual(searchCreatures(file.creatures, "zom").length, 1);
  assert.deepEqual(searchCreatures(file.creatures, "zom thing").length, 0);
});
