import { test } from "node:test";
import assert from "node:assert/strict";
import { addOpening, addWall, annotationFile, emptyAnnotation, parseAnnotation, type Annotation } from "./annotation.ts";
import { addArea, areaAt, freehandOutline, removeArea, setRoomMaterial, tagArea } from "./areas.ts";
import { insidePolygon } from "./fog.ts";
import type { Point } from "./homography.ts";
import { addRoom } from "./rooms.ts";
import { lightFrom } from "./wallcheck.ts";

const bounds = { x: 0, y: 0, width: 20, height: 10 };
const square = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

test("areas overlap rooms, take a material, difficult terrain or both, and the last drawn is found first", () => {
  let a = addRoom(emptyAnnotation(), square(2, 2, 8, 8), "1")!;
  a = setRoomMaterial(a, 0, "wood");
  a = addArea(a, square(3, 3, 6, 6), { material: "stone", difficult: false })!;
  a = addArea(a, square(4, 4, 5, 5), { material: null, difficult: true })!;
  assert.equal(a.rooms[0]!.material, "wood");
  assert.equal(areaAt(a, { x: 4.5, y: 4.5 }), 1);
  assert.equal(areaAt(a, { x: 3.5, y: 3.5 }), 0);
  assert.equal(areaAt(a, { x: 7, y: 7 }), -1);
  a = tagArea(a, 0, { material: "ice", difficult: true });
  assert.deepEqual([a.areas[0]!.material, a.areas[0]!.difficult], ["ice", true]);
  assert.equal(addArea(a, square(1, 1, 2, 2).slice(0, 2), { material: null, difficult: true }), null);
  assert.equal(removeArea(a, 1).areas.length, 1);
  // Drawn freehand round a pond and back to the start: one closed outline, without the start twice.
  const pond = freehandOutline([...square(10, 2, 14, 6), { x: 10, y: 2 }]);
  assert.equal(pond.length, 4);
});

test("areas and room materials save and load; older files load without them; a made-up material is refused", () => {
  let a = addRoom(emptyAnnotation(), square(2, 2, 8, 8), "Hall")!;
  a = setRoomMaterial(a, 0, "stone");
  a = addArea(a, square(3, 3, 6, 6), { material: "water", difficult: true })!;
  const file = JSON.parse(JSON.stringify(annotationFile(a)));
  assert.equal(file.version, 3);
  assert.deepEqual(parseAnnotation(file, bounds), a);
  const v2 = { version: 2, walls: [], pillars: [], openings: [], rooms: [{ outline: file.rooms[0].outline, name: "Hall" }] };
  const old = parseAnnotation(v2, bounds)!;
  assert.deepEqual([old.rooms[0]!.material, old.areas], [null, []]);
  assert.equal(parseAnnotation({ ...file, areas: [{ ...file.areas[0], material: "lava" }] }, bounds), null);
  assert.equal(parseAnnotation({ ...file, rooms: [{ ...file.rooms[0], material: undefined }] }, bounds), null);
});

test("the wall check: light stays inside closed walls and doors, and leaks through a gap, an open door or a window", () => {
  const walls = (a: Annotation) =>
    addWall(a, [
      { x: 6, y: 4 },
      { x: 6, y: 6 },
      { x: 2, y: 6 },
      { x: 2, y: 2 },
      { x: 6, y: 2 },
      { x: 6, y: 3 },
    ]);
  const from = { x: 4, y: 4 };
  const leaks = (a: Annotation) => lightFrom(a, bounds, from).some((p) => p.x > 6.01);
  const closed = addOpening(walls(emptyAnnotation()), "door", { x: 6, y: 3 }, { x: 6, y: 4 });
  assert.equal(leaks(closed), false);
  assert.ok(insidePolygon({ x: 5.9, y: 5.9 }, lightFrom(closed, bounds, from)));
  assert.equal(leaks(addOpening(walls(emptyAnnotation()), "secret", { x: 6, y: 3 }, { x: 6, y: 4 })), false);
  assert.equal(leaks(addOpening(walls(emptyAnnotation()), "door", { x: 6, y: 3 }, { x: 6, y: 4 }, true)), true);
  assert.equal(leaks(addOpening(walls(emptyAnnotation()), "window", { x: 6, y: 3 }, { x: 6, y: 4 })), true);
  assert.equal(leaks(walls(emptyAnnotation())), true);
  // With nothing traced, light fills the map out to a little past its edge.
  const open = lightFrom(emptyAnnotation(), bounds, from);
  assert.ok(insidePolygon({ x: 20.5, y: 10.5 }, open) && !insidePolygon({ x: 21.5, y: 5 }, open));
});
