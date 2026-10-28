import { test } from "node:test";
import assert from "node:assert/strict";
import { choosePlayerDisplay, playerPlacement, type DisplayInfo } from "./displays.ts";

const laptop: DisplayInfo = { id: 1, label: "Built-in", width: 1920, height: 1080, primary: true };
const projector: DisplayInfo = { id: 2, label: "Projector", width: 1920, height: 1080, primary: false };
const tv: DisplayInfo = { id: 3, label: "TV", width: 3840, height: 2160, primary: false };

test("uses the chosen display when it is connected", () => {
  assert.equal(choosePlayerDisplay([laptop, projector, tv], 3), tv);
  assert.equal(choosePlayerDisplay([laptop, projector], 1), laptop);
});

test("falls back to the first screen that isn't the laptop", () => {
  assert.equal(choosePlayerDisplay([laptop, projector, tv], 99), projector);
  assert.equal(choosePlayerDisplay([laptop, projector], null), projector);
});

test("the table window is fullscreen only on a screen that isn't the laptop", () => {
  assert.deepEqual(playerPlacement([laptop, projector], null), { display: projector, fullscreen: true });
  assert.deepEqual(playerPlacement([laptop, projector], 1), { display: laptop, fullscreen: false });
  assert.deepEqual(playerPlacement([laptop], null), { display: null, fullscreen: false });
});
