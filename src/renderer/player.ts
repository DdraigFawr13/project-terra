// Player (table) window: draws only what players may see. Text is drawn twice, once facing
// each long side of the table, because players sit on two opposite sides (D-008).
// Table things are drawn in inches on a layer canvas, which a CSS matrix3d warps onto the angled projector (D-004, D-021).
import { defaultCalibration, layerFor, visibleRect, type Calibration, type Surface } from "../core/calibration.ts";
import { cssMatrix3d } from "../core/homography.ts";
import type { PlayerView } from "../core/table.ts";
import type { PlayerApi } from "../main/player-preload.ts";
import { FogPainter } from "./fog-draw.ts";
import { ACCENT, drawTable, FONT, mapImages, textBothSides, type TableMode } from "./table-draw.ts";

const terra = (window as unknown as { terra: PlayerApi }).terra;
const screenCanvas = document.getElementById("table") as HTMLCanvasElement;
const layerCanvas = document.getElementById("layer") as HTMLCanvasElement;
const sctx = screenCanvas.getContext("2d")!;
const lctx = layerCanvas.getContext("2d")!;
const overlayCanvas = document.getElementById("overlay") as HTMLCanvasElement;
const octx = overlayCanvas.getContext("2d")!;
let player: PlayerView | null = null;

const fog = new FogPainter();
const image = mapImages(draw);

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
  if (player) drawTable(lctx, { cal, layer, mode, calibrated, view: player, image, fog, area: visibleRect(cal, surface) }, 1);
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
  overlayCanvas.width = screenCanvas.width;
  overlayCanvas.height = screenCanvas.height;
  octx.setTransform(s.scale, 0, 0, s.scale, 0, 0);
  if (view === "testGrid" || view === "calibrate" || view === "map") {
    const cal = calibration ?? defaultCalibration(s);
    drawLayer(cal, view, !!calibration);
    if (view === "calibrate") drawCornerMarks(cal, s);
  } else if (view === "idle") {
    sctx.fillStyle = "rgba(255,255,255,0.35)";
    textBothSides(sctx, "Project Terra", { x: 0, y: 0, w: s.width, h: s.height }, 33, 22);
  }
}

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
