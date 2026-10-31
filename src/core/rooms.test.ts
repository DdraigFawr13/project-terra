import { test } from "node:test";
import assert from "node:assert/strict";
import { addOpening, addWall, annotationFile, emptyAnnotation, parseAnnotation, type Annotation } from "./annotation.ts";
import { fogAt, insidePolygon } from "./fog.ts";
import type { Point } from "./homography.ts";
import { addRoom, findRoom, nextRoomName, removeRoom, renameRoom, roomAt, roomUncover } from "./rooms.ts";

const bounds = { x: 0, y: 0, width: 20, height: 10 };
const box = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
  { x: x0, y: y0 },
];
/** Two rooms side by side, 2–8 and 8–14 across, 2–8 down, sharing the wall at x = 8; a door into the right one. */
function building(): Annotation {
  let a = addWall(emptyAnnotation(), box(2, 2, 14, 8));
  a = addWall(a, [
    { x: 8, y: 2 },
    { x: 8, y: 8 },
  ]);
  return addOpening(a, "door", { x: 14, y: 4 }, { x: 14, y: 5 });
}
const found = (a: Annotation, p: Point): Point[] => {
  const f = findRoom(a, bounds, p);
  assert.ok("outline" in f, JSON.stringify(f));
  return f.outline;
};

test("a tap inside walls finds the room; a gap leaks; a tap in a room or on a wall says so", () => {
  const a = building();
  const left = found(a, { x: 5, y: 5 });
  // Just inside the walls, as a rectangle.
  assert.equal(left.length, 4);
  for (const p of left) {
    assert.ok(Math.abs(p.x - 2) < 0.2 || Math.abs(p.x - 8) < 0.2, JSON.stringify(p));
    assert.ok(Math.abs(p.y - 2) < 0.2 || Math.abs(p.y - 8) < 0.2, JSON.stringify(p));
  }
  // The door closes the right room like a wall (D-044: openings close rooms).
  assert.ok(insidePolygon({ x: 13.5, y: 4.5 }, found(a, { x: 11, y: 5 })));
  // Without the door, the gap leaks to the map's edge.
  const gap = addWall(emptyAnnotation(), [
    { x: 14, y: 5 },
    { x: 14, y: 8 },
    { x: 2, y: 8 },
    { x: 2, y: 2 },
    { x: 14, y: 2 },
    { x: 14, y: 4 },
  ]);
  assert.deepEqual(findRoom(gap, bounds, { x: 5, y: 5 }), { error: "leak" });
  assert.deepEqual(findRoom(a, bounds, { x: 8, y: 5 }), { error: "wall" });
  const named = addRoom(a, left, nextRoomName(a))!;
  assert.deepEqual(findRoom(named, bounds, { x: 5, y: 5 }), { error: "room" });
  assert.equal(roomAt(named, { x: 5, y: 5 }), 0);
  assert.equal(roomAt(named, { x: 11, y: 5 }), -1);
});

test("rooms don't overlap; names start at the next free number and can be changed; a room can be removed", () => {
  let a = addRoom(building(), box(2, 2, 8, 8).slice(0, 4), "1")!;
  assert.equal(addRoom(a, box(6, 3, 10, 6).slice(0, 4), "x"), null);
  assert.equal(addRoom(a, box(3, 3, 4, 4).slice(0, 4), "x"), null);
  // Sharing a wall is fine.
  a = addRoom(a, box(8, 2, 14, 8).slice(0, 4), nextRoomName(a))!;
  assert.deepEqual(
    a.rooms.map((r) => r.name),
    ["1", "2"],
  );
  a = renameRoom(a, 0, "  Kitchen  ");
  assert.equal(a.rooms[0]!.name, "Kitchen");
  assert.equal(nextRoomName(a), "1");
  assert.deepEqual(
    removeRoom(a, 0).rooms.map((r) => r.name),
    ["2"],
  );
});

test("uncovering a room grows past its walls but never into the next room, and stops short of a secret door", () => {
  let a = building();
  a = addOpening(a, "secret", { x: 2, y: 4 }, { x: 2, y: 5 });
  a = addRoom(a, found(a, { x: 5, y: 5 }), "1")!;
  a = addRoom(a, found(a, { x: 11, y: 5 }), "2")!;
  const op = roomUncover(a, 0, "reveal")!;
  assert.equal(op.kind, "outline");
  const fog = [op];
  const at = (x: number, y: number) => fogAt(fog, { x, y });
  assert.equal(at(5, 5), "seen");
  // The walls show: the grow reaches past the top wall and out to the left, away from the secret door.
  assert.equal(at(5, 1.7), "seen");
  assert.equal(at(1.7, 7), "seen");
  assert.equal(at(5, 1.3), "unexplored");
  // Not into the right room, and not over the secret door's paint.
  assert.equal(at(8.4, 5), "unexplored");
  assert.equal(at(1.8, 4.5), "unexplored");
  // Dim is the same area.
  assert.equal(roomUncover(a, 0, "hide")!.mode, "hide");
  assert.equal(roomUncover(a, 5, "reveal"), null);
});

test("rooms save and load; a version 1 file loads with none", () => {
  const a = addRoom(building(), box(2, 2, 8, 8).slice(0, 4), "Hall")!;
  const file = JSON.parse(JSON.stringify(annotationFile(a)));
  assert.equal(file.version, 2);
  assert.deepEqual(parseAnnotation(file, bounds), a);
  const old = { version: 1, walls: file.walls, pillars: [], openings: file.openings };
  assert.deepEqual(parseAnnotation(old, bounds)!.rooms, []);
  assert.equal(parseAnnotation({ ...file, rooms: [{ outline: file.rooms[0].outline.slice(0, 2), name: "x" }] }, bounds), null);
  assert.equal(parseAnnotation({ ...file, rooms: [{ outline: file.rooms[0].outline, name: "x".repeat(41) }] }, bounds), null);
});
