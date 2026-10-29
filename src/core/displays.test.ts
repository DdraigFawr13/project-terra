import { test } from "node:test";
import assert from "node:assert/strict";
import { choosePlayerDisplay, describeDisplay, laptopDisplay, playerPlacement, type DisplayInfo } from "./displays.ts";

const laptop: DisplayInfo = { id: 1, label: "Built-in", width: 1920, height: 1080, primary: true, internal: true };
const projector: DisplayInfo = { id: 2, label: "Projector", width: 1920, height: 1080, primary: false, internal: false };
const tv: DisplayInfo = { id: 3, label: "TV", width: 3840, height: 2160, primary: false, internal: false };

test("uses the chosen display when it is connected", () => {
  assert.equal(choosePlayerDisplay([laptop, projector, tv], 3), tv);
  assert.equal(choosePlayerDisplay([laptop, projector], 1), laptop);
});

test("falls back to the first screen that isn't the laptop", () => {
  assert.equal(choosePlayerDisplay([laptop, projector, tv], 99), projector);
  assert.equal(choosePlayerDisplay([laptop, projector], null), projector);
  // The picker names the laptop by what it is, and other screens by their own name and size.
  assert.deepEqual(
    [laptop, projector].map((d) => describeDisplay(d, [laptop, projector])),
    ["This laptop, in a window", "Projector (1920 × 1080)"],
  );
});

test("the table window is fullscreen only on a screen that isn't the laptop, with one calibration per projector", () => {
  assert.deepEqual(playerPlacement([laptop, projector], null), { display: projector, fullscreen: true, surfaceKey: "display:2" });
  assert.deepEqual(playerPlacement([laptop, projector], 1), { display: laptop, fullscreen: false, surfaceKey: "window" });
  assert.deepEqual(playerPlacement([laptop], null), { display: null, fullscreen: false, surfaceKey: "window" });
});

test("the laptop is the built-in screen even when Windows makes the projector the main display", () => {
  const mainProjector = { ...projector, primary: true };
  const sideLaptop = { ...laptop, primary: false };
  assert.equal(laptopDisplay([mainProjector, sideLaptop]), sideLaptop);
  assert.deepEqual(playerPlacement([mainProjector, sideLaptop], null), {
    display: mainProjector,
    fullscreen: true,
    surfaceKey: "display:2",
  });
  // With no screen reporting itself as built-in, the main display counts as the laptop.
  const noInternal = [mainProjector, { ...sideLaptop, internal: false }];
  assert.equal(laptopDisplay(noInternal), mainProjector);
});
