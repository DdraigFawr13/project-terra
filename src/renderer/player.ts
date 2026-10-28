// Player (table) window: draws only what players may see. Text is drawn twice, once facing
// each long side of the table, because players sit on two opposite sides (D-008).
// Table things are drawn in inches on a layer canvas, which a CSS matrix3d warps onto the angled projector (D-004, D-021).
import { defaultCalibration, layerFor, type Calibration, type Surface } from "../core/calibration.ts";
import { cssMatrix3d } from "../core/homography.ts";
import type { PlayerView } from "../core/table.ts";
import type { PlayerApi } from "../main/player-preload.ts";

const terra = (window as unknown as { terra: PlayerApi }).terra;
const screenCanvas = document.getElementById("table") as HTMLCanvasElement;
const layerCanvas = document.getElementById("layer") as HTMLCanvasElement;
const sctx = screenCanvas.getContext("2d")!;
const lctx = layerCanvas.getContext("2d")!;
const overlayCanvas = document.getElementById("overlay") as HTMLCanvasElement;
const octx = overlayCanvas.getContext("2d")!;
let player: PlayerView | null = null;

// Plain bold lettering on the table, from the bundled font, so it reads at an angle and upside down (D-023).
const FONT = `"Source Sans 3", "Segoe UI", system-ui, sans-serif`;
const ACCENT = "#6cb8a4";

/** Text centred at (x, y) and again rotated half a turn about the centre of `rect`, so both long sides can read it. */
function textBothSides(
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

function surfaceNow(): Surface {
  return { width: window.innerWidth, height: window.innerHeight, scale: window.devicePixelRatio || 1 };
}

/** Draw the 1-inch grid and the measured rectangle on the layer, then warp the layer onto the screen. */
function drawTable(cal: Calibration, calibrating: boolean, calibrated: boolean): void {
  const layer = layerFor(cal, surfaceNow());
  const ppi = layer.pxPerInch;
  layerCanvas.width = Math.round(layer.box.width * ppi);
  layerCanvas.height = Math.round(layer.box.height * ppi);
  layerCanvas.style.width = `${layerCanvas.width}px`;
  layerCanvas.style.height = `${layerCanvas.height}px`;
  layerCanvas.style.transform = `matrix3d(${cssMatrix3d(layer.transform).join(",")})`;
  layerCanvas.hidden = false;

  // Work in layer pixels with the table's origin (the rectangle's top-left corner) at (0, 0).
  const ctx = lctx;
  const X = (inches: number) => inches * ppi;
  ctx.setTransform(1, 0, 0, 1, -layer.box.x * ppi, -layer.box.y * ppi);
  ctx.clearRect(X(layer.box.x), X(layer.box.y), layerCanvas.width, layerCanvas.height);
  const { x: bx, y: by, width: bw, height: bh } = layer.box;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = Math.max(1, ppi / 24);
  ctx.beginPath();
  for (let x = bx; x <= bx + bw; x++) (ctx.moveTo(X(x), X(by)), ctx.lineTo(X(x), X(by + bh)));
  for (let y = by; y <= by + bh; y++) (ctx.moveTo(X(bx), X(y)), ctx.lineTo(X(bx + bw), X(y)));
  ctx.stroke();

  const rect = { x: 0, y: 0, w: X(cal.widthIn), h: X(cal.heightIn) };
  ctx.strokeStyle = calibrating ? ACCENT : "#ffffff";
  ctx.lineWidth = Math.max(2, ppi / 10);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = "#ffffff";
  const size = Math.min(X(0.45), rect.w / 14);
  if (calibrating) {
    ctx.fillStyle = "#ffffff";
    textBothSides(ctx, `Calibrating: put corners 1–4 on your ${cal.widthIn} × ${cal.heightIn} inch marks`, rect, X(1.2), size);
  } else {
    const label = calibrated ? `1-inch squares · ${cal.widthIn} × ${cal.heightIn} inch check` : "1-inch squares · not calibrated yet";
    textBothSides(ctx, label, rect, X(1.2), size);
  }
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
  if (view === "testGrid" || view === "calibrate") {
    const cal = calibration ?? defaultCalibration(s);
    drawTable(cal, view === "calibrate", !!calibration);
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
