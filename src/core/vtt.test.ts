import { test } from "node:test";
import assert from "node:assert/strict";
import { annotationFile, parseAnnotation } from "./annotation.ts";
import { parseVtt, planVttPicture, type VttMap } from "./vtt.ts";

/** A made-up file in the Universal VTT shape: a room with a doorway, a pillar outline and two lights. */
const file = (over: Record<string, unknown> = {}) => ({
  format: 0.3,
  // An origin off the whole square, so the picture's corner isn't a grid line of the file (LESSONS: annotation).
  resolution: { map_origin: { x: -0.5, y: 0.25 }, map_size: { x: 4.5, y: 3 }, pixels_per_grid: 50 },
  line_of_sight: [
    [
      { x: 0.5, y: 1.25 },
      { x: 3.5, y: 1.25 },
      { x: 3.5, y: 3.25 },
      { x: 2.5, y: 3.25 },
    ],
    [
      { x: 1.5, y: 3.25 },
      { x: -0, y: 3.25 },
    ],
  ],
  objects_line_of_sight: [
    [
      { x: 1, y: 2 },
      { x: 1.5, y: 2 },
      { x: 1.5, y: 2.5 },
      { x: 1, y: 2 },
    ],
  ],
  portals: [
    {
      position: { x: 2, y: 3.25 },
      bounds: [
        { x: 1.5, y: 3.25 },
        { x: 2.5, y: 3.25 },
      ],
      rotation: 0,
      closed: true,
      freestanding: false,
    },
    {
      position: { x: 0, y: 0 },
      bounds: [
        { x: 9, y: -4 },
        { x: 0.5, y: 1.25 },
      ],
      rotation: 0,
      closed: false,
      freestanding: true,
    },
  ],
  environment: { baked_lighting: true, ambient_light: "ffffffff" },
  lights: [{}, {}],
  image: "data:image/png;base64,AAAA",
  ...over,
});

const read = (raw: unknown): VttMap => {
  const v = parseVtt(raw);
  assert.ok(!("error" in v), "error" in v ? v.error : "");
  return v;
};

test("a VTT file becomes walls and doors in the picture's inches, from its corner", () => {
  const v = read(file());
  assert.deepEqual(v.bounds, { x: 0, y: 0, width: 5, height: 3 });
  assert.deepEqual(v.squares, { x: 4.5, y: 3 });
  assert.equal(v.pixelsPerSquare, 50);
  assert.equal(v.image, "AAAA");
  assert.equal(v.lights, 2);
  assert.deepEqual(v.walls.walls, [
    {
      points: [
        { x: 1, y: 1 },
        { x: 4, y: 1 },
        { x: 4, y: 3 },
        { x: 3, y: 3 },
      ],
      closed: false,
    },
    {
      points: [
        { x: 2, y: 3 },
        { x: 0.5, y: 3 },
      ],
      closed: false,
    },
    // An object outline that ends where it starts is a loop.
    {
      points: [
        { x: 1.5, y: 1.75 },
        { x: 2, y: 1.75 },
        { x: 2, y: 2.25 },
      ],
      closed: true,
    },
  ]);
  // Portals are doors, open or closed as in the file; a point off the picture is pulled onto its edge.
  assert.deepEqual(v.walls.openings, [
    { kind: "door", a: { x: 2, y: 3 }, b: { x: 3, y: 3 }, open: false },
    { kind: "door", a: { x: 4.5, y: 0 }, b: { x: 1, y: 1 }, open: true },
  ]);
  assert.deepEqual(parseAnnotation(annotationFile(v.walls), v.bounds), v.walls);
});

test("-0 in a file never reaches the walls", () => {
  const v = read(
    file({
      resolution: { map_size: { x: 2, y: 2 }, pixels_per_grid: 100 },
      line_of_sight: [
        [
          { x: -0, y: 1 },
          { x: 1, y: -0 },
        ],
      ],
      portals: [],
    }),
  );
  const [p, q] = v.walls.walls[0]!.points;
  assert.ok(Object.is(p!.x, 0) && Object.is(q!.y, 0));
});

test("a run longer than a saved wall may hold is split into pieces that share their ends", () => {
  const long = Array.from({ length: 2500 }, (_, i) => ({ x: (i % 2) * 0.5, y: i * 0.01 }));
  const v = read(
    file({
      resolution: { map_size: { x: 30, y: 30 }, pixels_per_grid: 100 },
      line_of_sight: [long],
      objects_line_of_sight: [],
      portals: [],
    }),
  );
  assert.deepEqual(
    v.walls.walls.map((w) => w.points.length),
    [2000, 501],
  );
  assert.deepEqual(v.walls.walls[1]!.points[0], v.walls.walls[0]!.points.at(-1));
});

test("an unusable file says why", () => {
  assert.match((parseVtt({ walls: [] }) as { error: string }).error, /no grid size/);
  assert.match(
    (parseVtt(file({ resolution: { map_size: { x: 121, y: 3 }, pixels_per_grid: 50 } })) as { error: string }).error,
    /1 to 120/,
  );
  assert.match((parseVtt(file({ line_of_sight: [[{ x: 1 }]] })) as { error: string }).error, /wall .* damaged/);
  assert.match((parseVtt(file({ portals: [{ bounds: [{ x: 1, y: 1 }] }] })) as { error: string }).error, /door .* damaged/);
  // A file with no picture of its own is fine: its picture comes beside it.
  assert.equal(read(file({ image: undefined })).image, null);
});

test("the picture is stored about as sharp as it is, padded to whole inches, and must be the file's own", () => {
  const v = read(file());
  assert.deepEqual(planVttPicture(v, { width: 225, height: 150 }), { ppi: 50, width: 250, height: 150, drawWidth: 225, drawHeight: 150 });
  // A sharper picture than the file says is kept sharp, up to 150 pixels an inch.
  assert.equal(planVttPicture(v, { width: 4500, height: 3000 })!.ppi, 150);
  // Another map's picture, a different shape, is refused.
  assert.equal(planVttPicture(v, { width: 300, height: 150 }), null);
  // A big map stays within the canvas limit.
  const big = read(file({ resolution: { map_size: { x: 120, y: 60 }, pixels_per_grid: 140 } }));
  assert.deepEqual(planVttPicture(big, { width: 16800, height: 8400 })!.width, 8192);
});
