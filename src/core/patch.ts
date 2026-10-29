// Patch tool (D-036): paint room numbers out of the table's copy of a map, so the DM keeps a keyed map and the players
// see clean floor. Two ways: fill a swiped area from its edges, or clone clean floor over it. Pure: works on plain RGBA
// arrays, so it is tested without a browser.
import type { Point } from "./homography.ts";
import type { Pixels } from "./map.ts";

/** Which pixels a stroke covers: 1 inside, 0 outside, one byte per pixel. */
export type Mask = { width: number; height: number; data: Uint8Array };

/** A pixel rectangle: what a stroke touched, so the caller can redraw or undo only that part. */
export type Rect = { x: number; y: number; width: number; height: number };

/** The pixels within `radius` of a stroke through `points` (pixel coordinates), and the rectangle around them. */
export function strokeMask(width: number, height: number, points: readonly Point[], radius: number): { mask: Mask; rect: Rect } {
  const data = new Uint8Array(width * height);
  const r = Math.max(0.5, radius);
  // Stamp a disc every half radius along each segment, so fast strokes leave no gaps.
  const stamps: Point[] = [];
  points.forEach((p, i) => {
    const q = points[i - 1];
    if (!q) return stamps.push(p);
    const n = Math.max(1, Math.ceil(Math.hypot(p.x - q.x, p.y - q.y) / (r / 2)));
    for (let k = 1; k <= n; k++) stamps.push({ x: q.x + ((p.x - q.x) * k) / n, y: q.y + ((p.y - q.y) * k) / n });
  });
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  for (const s of stamps) {
    const top = Math.max(0, Math.floor(s.y - r));
    const bottom = Math.min(height - 1, Math.ceil(s.y + r));
    const left = Math.max(0, Math.floor(s.x - r));
    const right = Math.min(width - 1, Math.ceil(s.x + r));
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++)
        if ((x + 0.5 - s.x) ** 2 + (y + 0.5 - s.y) ** 2 <= r * r) {
          data[y * width + x] = 1;
          [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
        }
  }
  const rect = x1 < 0 ? { x: 0, y: 0, width: 0, height: 0 } : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  return { mask: { width, height, data }, rect };
}

/**
 * Fill the masked pixels from the edges inward: each pass sets every masked pixel that touches known ones to their
 * average, until none is left. Good on plain floor; on tiles or grass it smears, which is what Clone is for.
 */
export function fillMasked(px: Pixels, mask: Mask): void {
  const { width, height, data } = px;
  const known = new Uint8Array(width * height);
  let todo: number[] = [];
  for (let i = 0; i < known.length; i++) {
    if (mask.data[i]) todo.push(i);
    else known[i] = 1;
  }
  while (todo.length) {
    const next: number[] = [];
    const ready: [number, number[]][] = [];
    for (const i of todo) {
      const x = i % width;
      const y = (i - x) / width;
      const sum = [0, 0, 0, 0];
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((dx || dy) && nx >= 0 && ny >= 0 && nx < width && ny < height && known[ny * width + nx]) {
            const o = (ny * width + nx) * 4;
            for (let k = 0; k < 4; k++) sum[k]! += data[o + k]!;
            n++;
          }
        }
      if (n) ready.push([i, sum.map((v) => v / n)]);
      else next.push(i);
    }
    // A mask covering the whole picture has no edge to fill from: leave it as it is.
    if (!ready.length) return;
    // Set this ring only after reading it, so the fill grows evenly from every side.
    for (const [i, c] of ready) {
      c.forEach((v, k) => (data[i * 4 + k] = v));
      known[i] = 1;
    }
    todo = next;
  }
}

/** Copy pixels from `offset` away onto the masked ones, as a clone brush does. Sources off the picture are skipped. */
export function cloneMasked(px: Pixels, mask: Mask, rect: Rect, offset: Point): void {
  const { width, height, data } = px;
  const dx = Math.round(offset.x);
  const dy = Math.round(offset.y);
  // Read from a copy, so a stroke that overlaps its own source doesn't copy what it just painted.
  const src = data.slice();
  for (let y = rect.y; y < rect.y + rect.height; y++)
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const sx = x + dx;
      const sy = y + dy;
      if (!mask.data[y * width + x] || sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const o = (y * width + x) * 4;
      const s = (sy * width + sx) * 4;
      for (let k = 0; k < 4; k++) data[o + k] = src[s + k]!;
    }
}

/**
 * A clone offset in whole squares (`ppi` pixels each): every map is straightened to 1-inch squares, so copying floor
 * from whole squares away keeps the grid lines lined up. Floor picked within half a square still copies from one away.
 */
export function snapOffset(offset: Point, ppi: number): Point {
  const x = Math.round(offset.x / ppi);
  const y = Math.round(offset.y / ppi);
  if (x || y) return { x: x * ppi + 0, y: y * ppi + 0 };
  return Math.abs(offset.x) >= Math.abs(offset.y) ? { x: (offset.x < 0 ? -1 : 1) * ppi, y: 0 } : { x: 0, y: (offset.y < 0 ? -1 : 1) * ppi };
}
