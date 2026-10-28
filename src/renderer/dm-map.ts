// DM window, maps (step 4, D-024): import a picture, mark a rectangle of known size, straighten it into 1-inch
// squares, and place, move and turn it on the table. Straightening runs here, in the DM window; the main process only
// stores the result in the personal library (D-010).
import { defaultCalibration, screenOutline } from "../core/calibration.ts";
import { isConvex, type Point, type Quad } from "../core/homography.ts";
import { parseMarking, placedExtent, planRectify, rectify, type Bounds } from "../core/map.ts";
import type { Command, PlacedMap, TableState } from "../core/table.ts";
import type { DmApi, TableStatus } from "../main/dm-preload.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const emptyMap = $<HTMLElement>("emptyMap");
const importer = $<HTMLElement>("importer");
const mapView = $<HTMLElement>("mapView");
const setupPane = $<HTMLElement>("setupPane");
const setupBtn = $<HTMLButtonElement>("setupBtn");
const fileInput = $<HTMLInputElement>("mapFile");
const library = $<HTMLUListElement>("library");
const importCanvas = $<HTMLCanvasElement>("importCanvas");
const importStatus = $<HTMLParagraphElement>("importStatus");
const nameInput = $<HTMLInputElement>("mapName");
const markW = $<HTMLInputElement>("markW");
const markH = $<HTMLInputElement>("markH");
const mapCanvas = $<HTMLCanvasElement>("mapCanvas");
const undoBtn = $<HTMLButtonElement>("undo");

/** Outline colour while the marked corners fold over each other. */
const FOLDED = "#ff6b5a";

type Importing = { bitmap: ImageBitmap; corners: Quad; selected: number; busy: boolean };

export function initMaps(terra: DmApi, accent: string): { undo: () => void } {
  let state: TableState | null = null;
  let status: TableStatus | null = null;
  let importing: Importing | null = null;
  let setupOpen = false;
  /** While dragging the map: how far it has moved so far, in inches. */
  let drag: { start: Point; dx: number; dy: number } | null = null;
  const images = new Map<string, HTMLImageElement>();

  const run = (c: Command) => terra.apply(c);
  const undo = () => terra.undo();

  function image(id: string): HTMLImageElement {
    let img = images.get(id);
    if (!img) {
      img = new Image();
      img.src = `terra-map://${id}/`;
      img.onload = render;
      images.set(id, img);
    }
    return img;
  }

  async function refreshLibrary(): Promise<void> {
    const maps = await terra.listMaps();
    library.replaceChildren(
      ...maps.map((m) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = `Place “${m.name}”`;
        b.addEventListener("click", () => run({ type: "placeMap", map: { ...m, x: 0, y: 0, turns: 0 } }));
        li.append(b);
        return li;
      }),
    );
  }

  function render(): void {
    const map = state?.map ?? null;
    importer.hidden = !importing;
    mapView.hidden = !!importing || !map;
    emptyMap.hidden = !!importing || !!map;
    setupBtn.hidden = !map || !!importing;
    setupBtn.setAttribute("aria-pressed", String(setupOpen));
    setupPane.hidden = !!importing || (!!map && !setupOpen);
    if (importing) drawImport(importing);
    else if (map) drawMap(map);
  }

  // ---- Import: mark a rectangle on the picture ----

  /** Picture pixels → canvas pixels: the picture fits the card and sits centred in it. */
  function importFit(bitmap: ImageBitmap): { k: number; x0: number } {
    const k = Math.min(importCanvas.clientWidth / bitmap.width, (window.innerHeight * 0.55) / bitmap.height);
    return { k, x0: (importCanvas.clientWidth - bitmap.width * k) / 2 };
  }

  function drawImport(im: Importing): void {
    const { k, x0 } = importFit(im.bitmap);
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(im.bitmap.width * k);
    const h = Math.round(im.bitmap.height * k);
    importCanvas.style.height = `${h}px`;
    importCanvas.width = Math.round(importCanvas.clientWidth * dpr);
    importCanvas.height = Math.round(h * dpr);
    const ctx = importCanvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, importCanvas.clientWidth, h);
    ctx.drawImage(im.bitmap, x0, 0, w, h);
    const pts = im.corners.map((p) => ({ x: x0 + p.x * k, y: p.y * k }));
    ctx.strokeStyle = isConvex(im.corners) ? accent : FOLDED;
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.font = `700 13px "Source Sans 3", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    pts.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
      ctx.fillStyle = i === im.selected ? "#f0d3a8" : accent;
      ctx.fill();
      ctx.fillStyle = "#1a0e09";
      ctx.fillText(String(i + 1), p.x, p.y + 0.5);
    });
  }

  async function startImport(file: File): Promise<void> {
    const bitmap = await createImageBitmap(file);
    const [w, h] = [bitmap.width, bitmap.height];
    // Start with a rectangle in the middle quarter; the DM drags it onto the map's squares.
    const corners: Quad = [
      { x: w * 0.375, y: h * 0.375 },
      { x: w * 0.625, y: h * 0.375 },
      { x: w * 0.625, y: h * 0.625 },
      { x: w * 0.375, y: h * 0.625 },
    ];
    importing = { bitmap, corners, selected: 0, busy: false };
    nameInput.value = file.name.replace(/\.[^.]+$/, "").slice(0, 120);
    importStatus.textContent = "";
    render();
  }

  async function finishImport(): Promise<void> {
    const im = importing;
    if (!im || im.busy) return;
    const { bitmap } = im;
    const marking = parseMarking({ corners: im.corners, widthIn: Number(markW.value), heightIn: Number(markH.value) }, bitmap);
    if (!marking) {
      importStatus.textContent = isConvex(im.corners)
        ? "Width and height must be whole numbers of squares, 1 to 120."
        : "The corners cross over. Drag them so 1, 2, 3, 4 go round the rectangle in order.";
      return;
    }
    im.busy = true;
    importStatus.textContent = "Straightening…";
    // Let the status paint before the pixel work, which can take a second on a large photo.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    try {
      const src = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d")!;
      src.drawImage(bitmap, 0, 0);
      const pixels = src.getImageData(0, 0, bitmap.width, bitmap.height);
      const plan = planRectify(marking, bitmap);
      const out = rectify(pixels, marking, plan);
      const canvas = new OffscreenCanvas(plan.width, plan.height);
      canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(out.data), plan.width, plan.height), 0, 0);
      const png = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
      const entry = await terra.saveMap(nameInput.value, png, plan.bounds);
      importing = null;
      await run({ type: "placeMap", map: { ...entry, x: 0, y: 0, turns: 0 } });
      refreshLibrary();
    } catch (e) {
      im.busy = false;
      importStatus.textContent = `The map couldn't be imported: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  function importPoint(e: PointerEvent, bitmap: ImageBitmap): Point {
    const r = importCanvas.getBoundingClientRect();
    const { k, x0 } = importFit(bitmap);
    return {
      x: Math.min(bitmap.width, Math.max(0, (e.clientX - r.left - x0) / k)),
      y: Math.min(bitmap.height, Math.max(0, (e.clientY - r.top) / k)),
    };
  }

  let draggingCorner = false;
  importCanvas.addEventListener("pointerdown", (e) => {
    if (!importing) return;
    const at = importPoint(e, importing.bitmap);
    const { k } = importFit(importing.bitmap);
    const dist = importing.corners.map((p) => Math.hypot(p.x - at.x, p.y - at.y) * k);
    importing.selected = dist.indexOf(Math.min(...dist));
    if (dist[importing.selected]! <= 24) {
      draggingCorner = true;
      importCanvas.setPointerCapture(e.pointerId);
    }
    render();
  });
  importCanvas.addEventListener("pointermove", (e) => {
    if (!importing || !draggingCorner) return;
    const corners = importing.corners.map((p, i) => (i === importing!.selected ? importPoint(e, importing!.bitmap) : p)) as Quad;
    // Corners move freely; a folded shape shows red and is refused only at "Straighten", so a long drag never sticks.
    importing.corners = corners;
    render();
  });
  const endCorner = () => (draggingCorner = false);
  importCanvas.addEventListener("pointerup", endCorner);
  importCanvas.addEventListener("pointercancel", endCorner);

  // ---- The map on the table ----

  /** Fit the map and the table screen's outline in the canvas: returns inches → canvas pixels. */
  function mapViewport(map: PlacedMap, outline: Quad | null, w: number, h: number) {
    const e: Bounds = placedExtent(map);
    const xs = [e.x, e.x + e.width, ...(outline ?? []).map((p) => p.x)];
    const ys = [e.y, e.y + e.height, ...(outline ?? []).map((p) => p.y)];
    const x0 = Math.min(...xs) - 2;
    const y0 = Math.min(...ys) - 2;
    const s = Math.min(w / (Math.max(...xs) + 2 - x0), h / (Math.max(...ys) + 2 - y0));
    return { s, ox: (w - (Math.max(...xs) + 2 - x0) * s) / 2 - x0 * s, oy: (h - (Math.max(...ys) + 2 - y0) * s) / 2 - y0 * s };
  }

  function drawMap(map: PlacedMap): void {
    $<HTMLHeadingElement>("mapTitle").textContent = map.name;
    const dpr = window.devicePixelRatio || 1;
    const w = mapCanvas.clientWidth;
    const h = mapCanvas.clientHeight;
    mapCanvas.width = Math.round(w * dpr);
    mapCanvas.height = Math.round(h * dpr);
    const ctx = mapCanvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    const cal = status && state ? (state.calibrations[status.surfaceKey] ?? defaultCalibration(status.surface)) : null;
    const outline = cal && status ? screenOutline(cal, status.surface) : null;
    const { s, ox, oy } = mapViewport(map, outline, w, h);
    const shown = drag ? { ...map, x: map.x + drag.dx, y: map.y + drag.dy } : map;

    ctx.save();
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    ctx.translate(shown.x, shown.y);
    ctx.rotate((shown.turns * Math.PI) / 2);
    const img = image(map.id);
    if (img.complete && img.naturalWidth) ctx.drawImage(img, map.bounds.x, map.bounds.y, map.bounds.width, map.bounds.height);
    ctx.restore();

    if (outline) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      outline.forEach((p, i) => (i ? ctx.lineTo(ox + p.x * s, oy + p.y * s) : ctx.moveTo(ox + p.x * s, oy + p.y * s)));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  const inchesAt = (e: PointerEvent): Point => {
    const map = state?.map;
    const r = mapCanvas.getBoundingClientRect();
    if (!map) return { x: 0, y: 0 };
    const cal = status && state ? (state.calibrations[status.surfaceKey] ?? defaultCalibration(status.surface)) : null;
    const { s, ox, oy } = mapViewport(map, cal && status ? screenOutline(cal, status.surface) : null, r.width, r.height);
    return { x: (e.clientX - r.left - ox) / s, y: (e.clientY - r.top - oy) / s };
  };
  mapCanvas.addEventListener("pointerdown", (e) => {
    if (!state?.map) return;
    drag = { start: inchesAt(e), dx: 0, dy: 0 };
    mapCanvas.setPointerCapture(e.pointerId);
  });
  mapCanvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const at = inchesAt(e);
    // The map snaps to whole inches so its squares stay on the table grid.
    drag.dx = Math.round(at.x - drag.start.x);
    drag.dy = Math.round(at.y - drag.start.y);
    render();
  });
  const endDrag = () => {
    if (!drag) return;
    const { dx, dy } = drag;
    drag = null;
    if (dx || dy) run({ type: "moveMap", dx, dy });
    else render();
  };
  mapCanvas.addEventListener("pointerup", endDrag);
  mapCanvas.addEventListener("pointercancel", endDrag);
  const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  mapCanvas.addEventListener("keydown", (e) => {
    const m = ARROWS[e.key];
    if (!m) return;
    e.preventDefault();
    run({ type: "moveMap", dx: m[0], dy: m[1] });
  });
  for (const b of document.querySelectorAll<HTMLButtonElement>("button.move"))
    b.addEventListener("click", () => run({ type: "moveMap", dx: Number(b.dataset.dx), dy: Number(b.dataset.dy) }));
  $<HTMLButtonElement>("turnMap").addEventListener("click", () => run({ type: "turnMap" }));
  $<HTMLButtonElement>("removeMap").addEventListener("click", () => run({ type: "removeMap" }));

  $<HTMLButtonElement>("importMap").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) startImport(file).catch(() => (importStatus.textContent = "That picture couldn't be opened."));
  });
  $<HTMLButtonElement>("importCancel").addEventListener("click", () => {
    importing = null;
    render();
  });
  $<HTMLButtonElement>("importOk").addEventListener("click", () => void finishImport());
  setupBtn.addEventListener("click", () => {
    setupOpen = !setupOpen;
    render();
  });
  undoBtn.addEventListener("click", undo);
  window.addEventListener("resize", render);

  terra.onState((s) => {
    state = s;
    render();
  });
  terra.onStatus((st) => {
    status = st;
    render();
  });
  terra.onHistory((can) => (undoBtn.disabled = !can));
  terra.getState().then((s) => {
    state = s;
    render();
  });
  terra.getStatus().then((st) => {
    status = st;
    render();
  });
  terra.canUndo().then((can) => (undoBtn.disabled = !can));
  refreshLibrary();
  return { undo };
}
