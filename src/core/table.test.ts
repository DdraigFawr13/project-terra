import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { defaultCalibration } from "./calibration.ts";
import { applyPatch, defaultState, parseSave, playerViewOf, serialize, viewOf } from "./table.ts";

const cal = defaultCalibration({ width: 1920, height: 1080, scale: 1 });

test("curtain wins over calibration, which wins over the test grid", () => {
  const s = applyPatch(defaultState(), { testGrid: true, calibrating: true, curtain: true });
  assert.equal(viewOf(s), "curtain");
  assert.equal(viewOf(applyPatch(s, { curtain: false })), "calibrate");
  assert.equal(viewOf(applyPatch(s, { curtain: false, calibrating: false })), "testGrid");
  assert.equal(viewOf(applyPatch(s, { curtain: false, calibrating: false, testGrid: false })), "idle");
});

test("the table window gets only the player view, with the calibration for the screen it is on", () => {
  const s = applyPatch(defaultState(), { curtain: true, playerDisplayId: 7, calibrations: { "display:7": cal } });
  assert.deepEqual(playerViewOf(s, "display:7"), { view: "curtain", calibration: cal });
  assert.deepEqual(playerViewOf(s, "window"), { view: "curtain", calibration: null });
});

test("patches with wrong types are ignored", () => {
  const s = applyPatch(defaultState(), { curtain: "yes", testGrid: 1, playerDisplayId: 1.5, version: 99, calibrations: [cal] });
  assert.deepEqual(s, defaultState());
  // A broken calibration is dropped; the good ones in the same patch are kept.
  const t = applyPatch(defaultState(), { calibrations: { window: cal, "display:2": { ...cal, widthIn: -1 } } });
  assert.deepEqual(t.calibrations, { window: cal });
  assert.deepEqual(applyPatch(defaultState(), JSON.parse(`{"calibrations":{"__proto__":${JSON.stringify(cal)}}}`)).calibrations, {});
});

test("any series of patches, valid or not, leaves a state that saves and loads unchanged", () => {
  const anyValue = fc.oneof(fc.boolean(), fc.integer(), fc.double(), fc.constant(-0), fc.string(), fc.constant(null));
  const key = fc.oneof(fc.string(), fc.constantFrom("window", "display:2", "__proto__"));
  const calibrations = fc.oneof(anyValue, fc.dictionary(key, fc.oneof(fc.constant(cal), anyValue)));
  const patch = fc.record(
    { curtain: anyValue, calibrating: anyValue, testGrid: anyValue, playerDisplayId: anyValue, version: anyValue, calibrations },
    { requiredKeys: [] },
  );
  fc.assert(
    fc.property(fc.array(patch), (patches) => {
      const s = patches.reduce(applyPatch, defaultState());
      assert.deepEqual(parseSave(serialize(s)), { ok: true, state: s });
    }),
  );
});

test("a version 1 save upgrades; unreadable or unknown saves are reported, not guessed", () => {
  const v1 = { version: 1, curtain: true, testGrid: false, playerDisplayId: 3 };
  assert.deepEqual(parseSave(JSON.stringify(v1)), {
    ok: true,
    state: { ...defaultState(), curtain: true, testGrid: false, playerDisplayId: 3 },
  });
  assert.equal(parseSave("{oops").ok, false);
  assert.equal(parseSave("[]").ok, false);
  assert.equal(parseSave(JSON.stringify({ version: 3, curtain: true })).ok, false);
  assert.equal(parseSave(JSON.stringify({ curtain: true })).ok, false);
});
