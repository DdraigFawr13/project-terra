// Draws generated test maps (src/core/mapgen.ts) to PNG with their annotation, a lit night view and what the wall
// detector finds, and prints the detector's scores. Usage: node scripts/maps.mjs <out dir> [ppi] [seed]
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { TERRAINS, generate } from "../src/core/mapgen.ts";
import { drawMap, shade } from "../src/core/mapdraw.ts";
import { blockers, lightMap } from "../src/core/light.ts";
import { detect, scoreThings, scoreWalls } from "../src/core/detect.ts";

const [out = "maps-out", ppiArg = "40", seedArg = "1"] = process.argv.slice(2);
const ppi = Number(ppiArg);
const seed = Number(seedArg);
fs.mkdirSync(out, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
function png({ width, height, data }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** The drawn map, faded, with the found walls in red, closed doors in green and objects in blue. */
function overlay(base, found) {
  const { width, height } = base;
  const data = new Uint8ClampedArray(base.data);
  for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) data[i + k] = 255 - (255 - data[i + k]) * 0.35;
  const dot = (x, y, rgb) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (Math.round(y) * width + Math.round(x)) * 4;
    data.set(rgb, i);
  };
  for (const w of found.walls) {
    const n = Math.ceil(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) * ppi * 2);
    for (let k = 0; k <= n; k++)
      for (const [ox, oy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ])
        dot((w.a.x + ((w.b.x - w.a.x) * k) / n) * ppi + ox, (w.a.y + ((w.b.y - w.a.y) * k) / n) * ppi + oy, [210, 30, 30]);
  }
  for (const d of found.doors)
    for (let k = 0; k <= 40; k++)
      for (const o of [-2, -1, 0, 1, 2]) {
        const [ux, uy] = [d.b.x - d.a.x, d.b.y - d.a.y];
        const len = Math.hypot(ux, uy);
        dot((d.a.x + (ux * k) / 40) * ppi - (uy / len) * o, (d.a.y + (uy * k) / 40) * ppi + (ux / len) * o, [20, 150, 60]);
      }
  for (const t of found.things)
    for (let a = 0; a < 360; a += 2)
      for (const o of [0, 1])
        dot(
          t.at.x * ppi + Math.cos((a * Math.PI) / 180) * (t.r * ppi + o),
          t.at.y * ppi + Math.sin((a * Math.PI) / 180) * (t.r * ppi + o),
          [30, 80, 220],
        );
  return { width, height, data };
}

/** A small flame at each light. */
function flames(px, lights) {
  for (const l of lights)
    for (let y = -0.12 * ppi; y <= 0.12 * ppi; y++)
      for (let x = -0.12 * ppi; x <= 0.12 * ppi; x++)
        if (Math.hypot(x, y) <= 0.12 * ppi)
          px.data.set([235, 120, 20], (Math.round(l.at.y * ppi + y) * px.width + Math.round(l.at.x * ppi + x)) * 4);
  return px;
}

for (const terrain of TERRAINS) {
  const map = generate(terrain, seed);
  const t0 = performance.now();
  const base = drawMap(map, ppi);
  const t1 = performance.now();
  const found = detect(base, ppi);
  const t2 = performance.now();
  const lit = flames(shade(base, lightMap(base, ppi, map.feetPerSquare, map.lights, blockers(map))), map.lights);
  const litFound = flames(
    shade(
      base,
      lightMap(
        base,
        ppi,
        map.feetPerSquare,
        map.lights,
        blockers({
          walls: found.walls,
          doors: found.doors.map((d) => ({ ...d, open: false })),
          things: found.things.map((t) => ({ ...t, blocksLight: true })),
        }),
      ),
    ),
    map.lights,
  );
  const t3 = performance.now();
  const name = `${terrain}-${seed}`;
  fs.writeFileSync(path.join(out, `${name}.png`), png(base));
  fs.writeFileSync(path.join(out, `${name}-lit.png`), png(lit));
  fs.writeFileSync(path.join(out, `${name}-lit-detected.png`), png(litFound));
  fs.writeFileSync(path.join(out, `${name}-detected.png`), png(overlay(base, found)));
  const { ground, ...annotation } = map;
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(annotation, null, 1));
  const w = scoreWalls(map.walls, found.walls);
  const t = scoreThings(map.things, found.things);
  const mid = (d) => ({ at: { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 } });
  const closed = map.doors.filter((d) => !d.open);
  const dr = scoreThings(closed.map(mid), found.doors.map(mid));
  const pct = (v) => `${Math.round(v * 100)}%`;
  console.log(
    `${name}: ${map.walls.length} walls, ${map.doors.length} doors, ${map.things.length} objects, ${map.lights.length} lights.` +
      ` Walls found ${pct(w.recall)}, precision ${pct(w.precision)}; objects found ${pct(t.recall)}, precision ${pct(t.precision)};` +
      ` closed doors ${closed.length}, found ${pct(dr.recall)}, precision ${pct(dr.precision)}.` +
      ` Draw ${Math.round(t1 - t0)} ms, detect ${Math.round(t2 - t1)} ms, light ${Math.round(t3 - t2)} ms.`,
  );
}
