// Player (table) window: draws only what players may see. Text is drawn twice, once facing
// each long side of the table, because players sit on two opposite sides (D-008).
import { viewOf, type TableState } from "../core/table.ts";

const canvas = document.getElementById("table") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
// Before calibration (step 2), assume the browser's 96 CSS pixels per inch.
const UNCALIBRATED_PX_PER_INCH = 96;
let state: TableState | null = null;

function textBothSides(text: string, w: number, h: number, size: number): void {
  ctx.font = `600 ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h - size * 1.5);
  ctx.save();
  ctx.translate(w / 2, size * 1.5);
  ctx.rotate(Math.PI);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawTestGrid(w: number, h: number): void {
  const step = UNCALIBRATED_PX_PER_INCH;
  const cx = w / 2;
  const cy = h / 2;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  // Grid lines run outward from the centre so the centre cross is always on a line.
  for (let x = cx % step; x <= w; x += step) (ctx.moveTo(Math.round(x) + 0.5, 0), ctx.lineTo(Math.round(x) + 0.5, h));
  for (let y = cy % step; y <= h; y += step) (ctx.moveTo(0, Math.round(y) + 0.5), ctx.lineTo(w, Math.round(y) + 0.5));
  ctx.stroke();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  ctx.beginPath();
  (ctx.moveTo(cx - step, cy), ctx.lineTo(cx + step, cy), ctx.moveTo(cx, cy - step), ctx.lineTo(cx, cy + step));
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  textBothSides("Project Terra · table test · squares not calibrated yet", w, h, Math.max(16, Math.round(step * 0.3)));
}

function draw(): void {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  const view = state ? viewOf(state) : "curtain";
  document.body.dataset.view = view;
  if (view === "testGrid") drawTestGrid(w, h);
  else if (view === "idle") {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    textBothSides("Project Terra", w, h, 22);
  }
}

window.addEventListener("resize", draw);
window.terra.onState((s) => {
  state = s;
  draw();
});
window.terra.getState().then((s) => {
  state = s;
  draw();
});
draw();
