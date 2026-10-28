// The table's picture in inches: the map with its fog, the 1-inch grid and the calibration rectangle. The table window
// draws it onto its warped layer (D-021); the DM window draws the same picture, unwarped, as its live preview (D-025).
import type { Calibration, Layer } from "../core/calibration.ts";
import type { PlayerView } from "../core/table.ts";
import type { FogPainter } from "./fog-draw.ts";

// Plain bold lettering on the table, from the bundled font, so it reads at an angle and upside down (D-023).
export const FONT = `"Source Sans 3", "Segoe UI", system-ui, sans-serif`;
export const ACCENT = "#6cb8a4";

/** Text centred at (x, y) and again rotated half a turn about the centre of `rect`, so both long sides can read it (D-008). */
export function textBothSides(
  ctx: CanvasRenderingContext2D,
  text: string,
  rect: { x: number; y: number; w: number; h: number },
  inset: number,
  size: number,
): void {
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = rect.x + rect.w / 2;
  ctx.fillText(text, cx, rect.y + rect.h - inset, rect.w * 0.9);
  ctx.save();
  ctx.translate(cx, rect.y + inset);
  ctx.rotate(Math.PI);
  ctx.fillText(text, 0, 0, rect.w * 0.9);
  ctx.restore();
}

/** Library map images, loaded once each; `onload` draws again when one arrives. */
export function mapImages(onload: () => void): (id: string) => HTMLImageElement {
  const images = new Map<string, HTMLImageElement>();
  return (id) => {
    let img = images.get(id);
    if (!img) {
      img = new Image();
      img.crossOrigin = "anonymous";
      img.src = `terra-map://${id}/`;
      img.onload = onload;
      images.set(id, img);
    }
    return img;
  };
}

export type TableMode = "calibrate" | "testGrid" | "map";

export type TableScene = {
  cal: Calibration;
  layer: Layer;
  mode: TableMode;
  calibrated: boolean;
  view: PlayerView;
  image: (id: string) => HTMLImageElement;
  fog: FogPainter;
};

/**
 * Draw the table in layer pixels times `scale`, with the layer box's top-left corner at (0, 0). The table window
 * uses scale 1; the DM's preview scales it down to fit its panel.
 */
export function drawTable(ctx: CanvasRenderingContext2D, scene: TableScene, scale: number): void {
  const { cal, layer, mode, view } = scene;
  const ppi = layer.pxPerInch;
  const X = (inches: number) => inches * ppi;
  // Work with the table's origin (the rectangle's top-left corner) at (0, 0).
  ctx.setTransform(scale, 0, 0, scale, -layer.box.x * ppi * scale, -layer.box.y * ppi * scale);
  const { x: bx, y: by, width: bw, height: bh } = layer.box;
  ctx.clearRect(X(bx), X(by), X(bw), X(bh));
  const map = view.map;
  if (mode === "map" && map) {
    const img = scene.image(map.id);
    if (img.complete && img.naturalWidth) {
      ctx.save();
      ctx.translate(X(map.x), X(map.y));
      ctx.rotate((map.turns * Math.PI) / 2);
      ctx.scale(ppi, ppi);
      scene.fog.draw(ctx, img, map.bounds, map.fog, "table");
      ctx.restore();
    }
    // Over a map, the grid is only for checking that the map's squares line up with the table's.
    if (!view.grid) return;
  }
  ctx.strokeStyle = mode === "map" ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.55)";
  ctx.lineWidth = Math.max(1, ppi / 24);
  ctx.beginPath();
  for (let x = bx; x <= bx + bw; x++) (ctx.moveTo(X(x), X(by)), ctx.lineTo(X(x), X(by + bh)));
  for (let y = by; y <= by + bh; y++) (ctx.moveTo(X(bx), X(y)), ctx.lineTo(X(bx + bw), X(y)));
  ctx.stroke();
  if (mode === "map") return;

  const calibrating = mode === "calibrate";
  const rect = { x: 0, y: 0, w: X(cal.widthIn), h: X(cal.heightIn) };
  ctx.strokeStyle = calibrating ? ACCENT : "#ffffff";
  ctx.lineWidth = Math.max(2, ppi / 10);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = "#ffffff";
  const size = Math.min(X(0.45), rect.w / 14);
  if (calibrating) {
    textBothSides(ctx, `Calibrating: put corners 1–4 on your ${cal.widthIn} × ${cal.heightIn} inch marks`, rect, X(1.2), size);
  } else {
    const label = scene.calibrated ? `1-inch squares · ${cal.widthIn} × ${cal.heightIn} inch check` : "1-inch squares · not calibrated yet";
    textBothSides(ctx, label, rect, X(1.2), size);
  }
}
