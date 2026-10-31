// Player (table) window: draws only what players may see. Text is drawn twice, once facing
// each long side of the table, because players sit on two opposite sides (D-008).
// Table things are drawn in inches on a layer canvas, which a CSS matrix3d warps onto the angled projector (D-004, D-021).
import { defaultCalibration, layerFor, visibleRect, type Calibration, type Surface } from "../core/calibration.ts";
import { cssMatrix3d } from "../core/homography.ts";
import type { PlayerView } from "../core/table.ts";
import type { PlayerApi } from "../main/player-preload.ts";
import { FogPainter } from "./fog-draw.ts";
import {
  ACCENT,
  drawLine,
  drawLaser,
  drawPing,
  drawTable,
  FONT,
  mapImages,
  onPortraitLoad,
  pictureImages,
  PING_MS,
  SKETCH_MS,
  sketchAlpha,
  textBothSides,
  type TableMode,
} from "./table-draw.ts";
import type { Ink } from "../core/table.ts";
import type { Layer } from "../core/calibration.ts";
import type { Point } from "../core/homography.ts";

const terra = (window as unknown as { terra: PlayerApi }).terra;
const screenCanvas = document.getElementById("table") as HTMLCanvasElement;
const layerCanvas = document.getElementById("layer") as HTMLCanvasElement;
const sctx = screenCanvas.getContext("2d")!;
const lctx = layerCanvas.getContext("2d")!;
const overlayCanvas = document.getElementById("overlay") as HTMLCanvasElement;
const octx = overlayCanvas.getContext("2d")!;
/** Pings get their own warped canvas, so their rings animate without redrawing the map and its fog (D-034). */
const pingCanvas = document.getElementById("pings") as HTMLCanvasElement;
const pctx = pingCanvas.getContext("2d")!;
let pingLayer: Layer | null = null;
let pings: { at: Point; start: number }[] = [];
/** Fading lines (D-035), drawn on the same canvas as pings. */
let sketches: { ink: Ink; points: Point[]; start: number }[] = [];
/** The laser trail (D-046), piece by piece, each fading on its own. */
let lasers: { points: Point[]; start: number }[] = [];
const LASER_MS = 1200;
let animating = false;
let player: PlayerView | null = null;

const fog = new FogPainter();
const image = mapImages(draw);
const picture = pictureImages(draw);
onPortraitLoad(draw);
terra.onMapPatched(image.reload);

function surfaceNow(): Surface {
  return { width: window.innerWidth, height: window.innerHeight, scale: window.devicePixelRatio || 1 };
}

/** Size the layer canvas to the table's box in inches, warp it onto the screen, and draw the table on it. */
function drawLayer(cal: Calibration, mode: TableMode, calibrated: boolean): void {
  const surface = surfaceNow();
  const layer = layerFor(cal, surface);
  const ppi = layer.pxPerInch;
  layerCanvas.width = Math.round(layer.box.width * ppi);
  layerCanvas.height = Math.round(layer.box.height * ppi);
  layerCanvas.style.width = `${layerCanvas.width}px`;
  layerCanvas.style.height = `${layerCanvas.height}px`;
  layerCanvas.style.transform = `matrix3d(${cssMatrix3d(layer.transform).join(",")})`;
  layerCanvas.hidden = false;
  pingLayer = mode === "map" ? layer : null;
  pingCanvas.width = layerCanvas.width;
  pingCanvas.height = layerCanvas.height;
  pingCanvas.style.cssText = layerCanvas.style.cssText;
  pingCanvas.hidden = !pingLayer;
  if (player) drawTable(lctx, { cal, layer, mode, calibrated, view: player, image, fog, area: visibleRect(cal, surface), picture }, 1);
}

/**
 * The numbered corners, drawn unwarped on top so they keep the same size on screen however far a corner is from its
 * mark. A ring with a cross marks the exact point; the number sits just outside the rectangle.
 */
function drawCornerMarks(cal: Calibration, s: Surface): void {
  const pts = cal.corners.map((p) => ({ x: p.x * s.width, y: p.y * s.height }));
  const mid = { x: pts.reduce((a, p) => a + p.x, 0) / 4, y: pts.reduce((a, p) => a + p.y, 0) / 4 };
  const r = Math.max(14, Math.min(s.width, s.height) * 0.025);
  octx.lineWidth = Math.max(2, r / 7);
  octx.font = `700 ${Math.round(r * 1.1)}px ${FONT}`;
  octx.textAlign = "center";
  octx.textBaseline = "middle";
  pts.forEach((p, i) => {
    octx.strokeStyle = ACCENT;
    octx.beginPath();
    octx.arc(p.x, p.y, r, 0, Math.PI * 2);
    (octx.moveTo(p.x - r * 1.6, p.y), octx.lineTo(p.x + r * 1.6, p.y), octx.moveTo(p.x, p.y - r * 1.6), octx.lineTo(p.x, p.y + r * 1.6));
    octx.stroke();
    const d = Math.hypot(p.x - mid.x, p.y - mid.y) || 1;
    const lx = p.x + ((p.x - mid.x) / d) * r * 2.6;
    const ly = p.y + ((p.y - mid.y) / d) * r * 2.6;
    octx.fillStyle = ACCENT;
    octx.beginPath();
    octx.arc(lx, ly, r * 0.95, 0, Math.PI * 2);
    octx.fill();
    octx.fillStyle = "#0f1617";
    octx.fillText(String(i + 1), lx, ly + 1);
  });
}

function draw(): void {
  const s = surfaceNow();
  screenCanvas.width = Math.round(s.width * s.scale);
  screenCanvas.height = Math.round(s.height * s.scale);
  sctx.setTransform(s.scale, 0, 0, s.scale, 0, 0);
  sctx.fillStyle = "#000000";
  sctx.fillRect(0, 0, s.width, s.height);
  const view = player?.view ?? "curtain";
  const calibration = player?.calibration ?? null;
  document.body.dataset.view = view;
  document.body.dataset.calibrated = String(!!calibration);
  layerCanvas.hidden = true;
  pingCanvas.hidden = true;
  pingLayer = null;
  overlayCanvas.width = screenCanvas.width;
  overlayCanvas.height = screenCanvas.height;
  octx.setTransform(s.scale, 0, 0, s.scale, 0, 0);
  // Under the curtain, a scene's own title or picture (D-039); with none, the curtain stays black.
  const mode = view === "curtain" ? (player?.cover ? "cover" : null) : view === "idle" ? null : view;
  if (mode) {
    const cal = calibration ?? defaultCalibration(s);
    drawLayer(cal, mode, !!calibration);
    if (view === "calibrate") drawCornerMarks(cal, s);
  } else if (view === "idle") {
    sctx.fillStyle = "rgba(255,255,255,0.35)";
    textBothSides(sctx, "Project Terra", { x: 0, y: 0, w: s.width, h: s.height }, 33, 22);
  }
}

function drawPings(now: number): void {
  pings = pings.filter((p) => now - p.start < PING_MS);
  sketches = sketches.filter((s) => now - s.start < SKETCH_MS);
  lasers = lasers.filter((s) => now - s.start < LASER_MS);
  const l = pingLayer;
  pctx.setTransform(1, 0, 0, 1, 0, 0);
  pctx.clearRect(0, 0, pingCanvas.width, pingCanvas.height);
  // The curtain or calibration ends them: they were moments on the map.
  if (!l) pings = sketches = lasers = [];
  const px = (p: Point) => ({ x: (p.x - l!.box.x) * l!.pxPerInch, y: (p.y - l!.box.y) * l!.pxPerInch });
  for (const s of sketches) drawLine(pctx, s.points.map(px), s.ink, l!.pxPerInch, sketchAlpha(now - s.start));
  for (const s of lasers) drawLaser(pctx, s.points.map(px), l!.pxPerInch, 1 - (now - s.start) / LASER_MS);
  for (const p of pings) {
    const at = px(p.at);
    drawPing(pctx, at.x, at.y, l!.pxPerInch, now - p.start);
  }
  animating = pings.length + sketches.length + lasers.length > 0;
  if (animating) requestAnimationFrame(drawPings);
}
function animate(): void {
  if (animating) return;
  animating = true;
  requestAnimationFrame(drawPings);
}
terra.onPing((at) => {
  pings.push({ at, start: performance.now() });
  animate();
});
terra.onLaser((points) => {
  lasers.push({ points, start: performance.now() });
  animate();
});
terra.onSketch((s) => {
  sketches.push({ ...s, start: performance.now() });
  animate();
});

window.addEventListener("resize", draw);
function show(v: PlayerView): void {
  player = v;
  draw();
}
terra.onView(show);
terra.getView().then(show);
draw();
// Canvas text doesn't wait for web fonts: load the bundled one, then draw again.
document.fonts.load(`700 20px ${FONT}`).then(draw);
