import { test } from "node:test";
import assert from "node:assert/strict";
import { blockers, lightMap } from "./light.ts";
import type { Door, Thing, Wall } from "./mapgen.ts";

const PPI = 4;
const size = { width: 30 * PPI, height: 20 * PPI };
/** A 10 × 10 inch room from (5, 5), with a one-inch doorway in its right wall at y 9–10. */
const room: Wall[] = [
  { a: { x: 5, y: 5 }, b: { x: 15, y: 5 } },
  { a: { x: 5, y: 15 }, b: { x: 15, y: 15 } },
  { a: { x: 5, y: 5 }, b: { x: 5, y: 15 } },
  { a: { x: 15, y: 5 }, b: { x: 15, y: 9 } },
  { a: { x: 15, y: 10 }, b: { x: 15, y: 15 } },
].map((s) => ({ ...s, material: "stone" }));
const torch = { kind: "torch" as const, at: { x: 10, y: 9.5 }, brightFt: 20, dimFt: 20 };
const at = (level: Float32Array, x: number, y: number) => level[Math.floor(y * PPI) * size.width + Math.floor(x * PPI)];

function lit(doors: Door[], things: Thing[] = []) {
  return lightMap(size, PPI, 5, [torch], blockers({ walls: room, doors, things }));
}

test("a torch lights 4 squares bright and 4 more dim (at 5 ft a square), and walls stop it", () => {
  const level = lit([]);
  assert.equal(at(level, 12, 9.5), 1);
  assert.equal(at(level, 10, 14.2), 0.5);
  assert.equal(at(level, 10, 16), 0, "behind the bottom wall");
  // Through the doorway the light carries on.
  assert.equal(at(level, 16, 9.5), 0.5);
  assert.equal(at(level, 16, 12), 0, "outside, beside the doorway");
});

test("a closed door blocks light, an open one doesn't; a pillar casts a shadow", () => {
  const door = { a: { x: 15, y: 9 }, b: { x: 15, y: 10 } };
  assert.equal(at(lit([{ ...door, open: false }]), 16, 9.5), 0);
  assert.equal(at(lit([{ ...door, open: true }]), 16, 9.5), 0.5);
  const pillar: Thing = { kind: "pillar", at: { x: 10, y: 8 }, r: 0.5, blocksLight: true };
  const level = lit([], [pillar]);
  assert.equal(at(level, 10, 6), 0, "behind the pillar");
  assert.equal(at(level, 12, 7.5), 1, "beside its shadow");
});
