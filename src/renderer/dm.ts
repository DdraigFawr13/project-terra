// DM window: chooses the table screen, switches what the table shows, and calibrates it (D-004). The right panel
// shows a live picture of the table, drawn by the table's own drawing code (D-025).
import { defaultCalibration, layerFor, moveCorner, nudgeCorner, type Calibration } from "../core/calibration.ts";
import { describeDisplay } from "../core/displays.ts";
import { playerViewOf, viewOf, type TableState } from "../core/table.ts";
import type { DmApi, TableStatus } from "../main/dm-preload.ts";
import { initMaps } from "./dm-map.ts";
import { FogPainter } from "./fog-draw.ts";
import { icon, type IconName } from "./icons.ts";
import { drawTable, mapImages } from "./table-draw.ts";

const terra = (window as unknown as { terra: DmApi }).terra;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $<HTMLParagraphElement>("status");
const noticeEl = $<HTMLParagraphElement>("notice");
const displaySelect = $<HTMLSelectElement>("display");
const testGridBtn = $<HTMLButtonElement>("testGrid");
const curtainBtn = $<HTMLButtonElement>("curtain");
const calibrateBtn = $<HTMLButtonElement>("calibrate");
const calState = $<HTMLParagraphElement>("calState");
const calTools = $<HTMLDivElement>("calTools");
const calWidth = $<HTMLInputElement>("calWidth");
const calHeight = $<HTMLInputElement>("calHeight");
const preview = $<HTMLCanvasElement>("calPreview");
const cornerBtns = [...document.querySelectorAll<HTMLButtonElement>("button.corner")];
const panelsBtn = $<HTMLButtonElement>("panels");
const previewText = $<HTMLSpanElement>("previewText");
const tablePreview = $<HTMLCanvasElement>("tablePreview");

// Icons go in front of each labelled control.
for (const el of document.querySelectorAll<HTMLElement>("[data-icon]"))
  el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon as IconName));
const css = getComputedStyle(document.documentElement);
const ACCENT = css.getPropertyValue("--accent").trim();
const FOCUS = css.getPropertyValue("--focus").trim();
const PREVIEW_TEXT = {
  curtain: "Curtain: the table is blank",
  calibrate: "Calibration pattern",
  map: "",
  testGrid: "Test grid",
  idle: "Title only",
} as const;

let state: TableState | null = null;
let status: TableStatus | null = null;
let selected = 0;
let dragging = false;
/** Calibration changes sent but not yet answered. Echoes of older states are ignored until they are. */
let pending = 0;

/** The calibration for the screen the table is on now, or the uncalibrated default. */
function current(): { cal: Calibration; saved: boolean } | null {
  if (!state || !status) return null;
  const saved = state.calibrations[status.surfaceKey];
  return { cal: saved ?? defaultCalibration(status.surface), saved: !!saved };
}

function saveCalibration(cal: Calibration): void {
  if (!state || !status) return;
  // Show the change at once; the main process echoes the same state back.
  state = { ...state, calibrations: { ...state.calibrations, [status.surfaceKey]: cal } };
  renderCalibration();
  pending++;
  terra.apply({ type: "calibrations", value: state.calibrations }).then((s) => {
    if (--pending === 0) renderState(s);
  });
}

function renderState(s: TableState): void {
  // While calibration changes are in flight, the local state is newer than any echo.
  if (pending === 0) state = s;
  testGridBtn.setAttribute("aria-pressed", String(s.testGrid));
  curtainBtn.setAttribute("aria-pressed", String(s.curtain));
  calibrateBtn.setAttribute("aria-pressed", String(s.calibrating));
  renderCalibration();
  drawTablePreview();
}

/** The table in miniature: the same drawing as the table window, without the projector's warp. */
function drawTablePreview(): void {
  if (!state || !status) return;
  const view = playerViewOf(state, status.surfaceKey);
  previewText.textContent = PREVIEW_TEXT[view.view];
  const mode = view.view === "curtain" || view.view === "idle" ? null : view.view;
  tablePreview.hidden = !mode;
  if (!mode) return;
  const cal = view.calibration ?? defaultCalibration(status.surface);
  const layer = layerFor(cal, status.surface);
  const dpr = window.devicePixelRatio || 1;
  const w = tablePreview.clientWidth;
  const k = w / (layer.box.width * layer.pxPerInch);
  const h = Math.round(layer.box.height * layer.pxPerInch * k);
  tablePreview.style.height = `${h}px`;
  tablePreview.width = Math.round(w * dpr);
  tablePreview.height = Math.round(h * dpr);
  drawTable(tablePreview.getContext("2d")!, { cal, layer, mode, calibrated: !!view.calibration, view, image, fog }, dpr * k);
}

function renderStatus(st: TableStatus): void {
  status = st;
  displaySelect.replaceChildren(
    ...st.displays.map((d) => {
      const o = document.createElement("option");
      o.value = String(d.id);
      o.textContent = describeDisplay(d, st.displays);
      o.selected = d.id === st.playerDisplayId;
      return o;
    }),
  );
  const onScreen = st.displays.find((d) => d.id === st.playerDisplayId);
  statusEl.textContent =
    st.fullscreen && onScreen
      ? `Table window is fullscreen on ${describeDisplay(onScreen, st.displays)}.`
      : st.displays.length > 1
        ? "The table window is in a normal window on this laptop. Pick the projector to make it fullscreen there."
        : "No second screen found. The table window is open on this screen for testing.";
  noticeEl.hidden = !st.notice;
  noticeEl.textContent = st.notice ?? "";
  renderCalibration();
  drawTablePreview();
}

function renderCalibration(): void {
  const c = current();
  if (!c || !state || !status) return;
  const where = status.fullscreen ? "this projector" : "the table window on this laptop (for testing with a ruler on the screen)";
  calState.textContent = state.calibrating
    ? `Calibrating ${where}. Press Done when all four corners sit on their marks.`
    : c.saved
      ? `Calibrated for ${where} with a ${c.cal.widthIn} × ${c.cal.heightIn} inch rectangle.`
      : `Not calibrated for ${where} yet. Squares are close to 1 inch only on a normal screen.`;
  calTools.hidden = !state.calibrating;
  if (calTools.hidden) return;
  if (document.activeElement !== calWidth) calWidth.value = String(c.cal.widthIn);
  if (document.activeElement !== calHeight) calHeight.value = String(c.cal.heightIn);
  cornerBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(i === selected)));
  drawPreview(c.cal);
}

/** The table screen in miniature: its outline, the four corners and the rectangle between them. */
function drawPreview(cal: Calibration): void {
  if (!status) return;
  const dpr = window.devicePixelRatio || 1;
  const w = preview.clientWidth;
  const h = Math.round((w * status.surface.height) / status.surface.width);
  preview.style.height = `${h}px`;
  preview.width = Math.round(w * dpr);
  preview.height = Math.round(h * dpr);
  const ctx = preview.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  const pts = cal.corners.map((p) => ({ x: p.x * w, y: p.y * h }));
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.font = `700 13px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  pts.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
    ctx.fillStyle = i === selected ? FOCUS : ACCENT;
    ctx.fill();
    ctx.fillStyle = "#0f1617";
    ctx.fillText(String(i + 1), p.x, p.y + 0.5);
  });
}

const fractionAt = (e: PointerEvent) => {
  const r = preview.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
};

preview.addEventListener("pointerdown", (e) => {
  const c = current();
  if (!c) return;
  const r = preview.getBoundingClientRect();
  const at = fractionAt(e);
  // Pick the nearest corner, in preview pixels.
  const dist = c.cal.corners.map((p) => Math.hypot((p.x - at.x) * r.width, (p.y - at.y) * r.height));
  const nearest = dist.indexOf(Math.min(...dist));
  selected = nearest;
  if (dist[nearest]! <= 24) {
    dragging = true;
    preview.setPointerCapture(e.pointerId);
  }
  renderCalibration();
});
preview.addEventListener("pointermove", (e) => {
  const c = current();
  if (dragging && c) saveCalibration(moveCorner(c.cal, selected, fractionAt(e)));
});
const endDrag = () => {
  dragging = false;
};
preview.addEventListener("pointerup", endDrag);
preview.addEventListener("pointercancel", endDrag);

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
preview.addEventListener("keydown", (e) => {
  const c = current();
  if (!c || !status) return;
  if (["1", "2", "3", "4"].includes(e.key)) {
    selected = Number(e.key) - 1;
    renderCalibration();
    return;
  }
  const move = ARROWS[e.key];
  if (!move) return;
  e.preventDefault();
  const step = e.shiftKey ? 10 : 1;
  saveCalibration(nudgeCorner(c.cal, selected, move[0] * step, move[1] * step, status.surface));
});

cornerBtns.forEach((b, i) =>
  b.addEventListener("click", () => {
    selected = i;
    renderCalibration();
    preview.focus();
  }),
);

function sizeChanged(): void {
  const c = current();
  const w = Number(calWidth.value);
  const h = Number(calHeight.value);
  if (!c || !Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 120 || h > 120) return;
  saveCalibration({ ...c.cal, widthIn: w, heightIn: h });
}
calWidth.addEventListener("change", sizeChanged);
calHeight.addEventListener("change", sizeChanged);

$<HTMLButtonElement>("calReset").addEventListener("click", () => status && saveCalibration(defaultCalibration(status.surface)));
$<HTMLButtonElement>("calDone").addEventListener("click", () => terra.apply({ type: "calibrating", on: false }));
calibrateBtn.addEventListener("click", () =>
  terra.apply({ type: "calibrating", on: calibrateBtn.getAttribute("aria-pressed") !== "true" }),
);
const toggleCurtain = () => terra.apply({ type: "curtain", on: curtainBtn.getAttribute("aria-pressed") !== "true" });
function togglePanels(): void {
  const open = panelsBtn.getAttribute("aria-pressed") !== "true";
  panelsBtn.setAttribute("aria-pressed", String(open));
  document.body.dataset.panels = open ? "open" : "folded";
  panelsBtn.querySelector("svg")?.remove();
  panelsBtn.insertAdjacentHTML("afterbegin", icon(open ? "panelsClose" : "panelsOpen"));
  renderCalibration();
  maps.render();
  drawTablePreview();
}

testGridBtn.addEventListener("click", () => terra.apply({ type: "testGrid", on: testGridBtn.getAttribute("aria-pressed") !== "true" }));
curtainBtn.addEventListener("click", toggleCurtain);
panelsBtn.addEventListener("click", togglePanels);

// Shortcuts (D-023). They never fire while typing, and Tab folds the panels only when no control has focus, so
// Tab still moves between controls.
// One fog painter and one image cache serve the map view and the preview.
const fog = new FogPainter();
const image = mapImages(() => {
  maps.render();
  drawTablePreview();
});
const maps = initMaps(terra, ACCENT, fog, image);
window.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement;
  if (t.closest("input, textarea, select, [contenteditable]")) return;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    maps.undo();
    return;
  }
  if (e.ctrlKey || e.altKey || e.metaKey || t.closest("input, textarea, select, [contenteditable]")) return;
  if (e.key === "Tab" && !e.shiftKey && (t === document.body || t === document.documentElement)) {
    e.preventDefault();
    togglePanels();
  } else if (e.key === "b" || e.key === "B") toggleCurtain();
  else if (e.key === "Escape") maps.cancel();
  else maps.shortcut(e.key);
});
displaySelect.addEventListener("change", () => terra.apply({ type: "playerDisplay", id: Number(displaySelect.value) }));
window.addEventListener("resize", () => {
  renderCalibration();
  drawTablePreview();
});

terra.onState(renderState);
terra.onStatus(renderStatus);
terra.getState().then(renderState);
terra.getStatus().then(renderStatus);
