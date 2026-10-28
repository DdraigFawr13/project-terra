import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatch, defaultState, parseSave, playerViewOf, serialize, viewOf } from "./table.ts";

test("curtain wins over the test grid", () => {
  const s = applyPatch(defaultState(), { testGrid: true, curtain: true });
  assert.equal(viewOf(s), "curtain");
  assert.equal(viewOf(applyPatch(s, { curtain: false })), "testGrid");
  assert.equal(viewOf(applyPatch(s, { curtain: false, testGrid: false })), "idle");
});

test("the table window gets only the player view", () => {
  const s = applyPatch(defaultState(), { curtain: true, playerDisplayId: 7 });
  assert.deepEqual(playerViewOf(s), { view: "curtain" });
});

test("patches with wrong types are ignored", () => {
  const s = applyPatch(defaultState(), { curtain: "yes", testGrid: 1, playerDisplayId: 1.5, version: 99 });
  assert.deepEqual(s, defaultState());
});

test("a saved state round-trips", () => {
  const s = applyPatch(defaultState(), { curtain: true, playerDisplayId: 7 });
  assert.deepEqual(parseSave(serialize(s)), { ok: true, state: s });
});

test("unreadable or unknown saves are reported, not guessed", () => {
  assert.equal(parseSave("{oops").ok, false);
  assert.equal(parseSave("[]").ok, false);
  assert.equal(parseSave(JSON.stringify({ version: 2, curtain: true })).ok, false);
  assert.equal(parseSave(JSON.stringify({ curtain: true })).ok, false);
});
