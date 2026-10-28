// DM window, maps (step 4, D-024): import a picture, mark a rectangle of known size, straighten it into 1-inch
// squares, and place, move and turn it on the table. Straightening runs here, in the DM window; the main process only
// stores the result in the personal library (D-010). Fog (step 5, D-025) is painted here with Reveal and Hide.
import { defaultCalibration, screenOutline } from "../core/calibration.ts";
import { isConvex, type Point, type Quad } from "../core/homography.ts";
import { MAX_FOG_OPS, MAX_FOG_POINTS, type FogMode, type FogOp, type FogShape } from "../core/fog.ts";
import { parseMarking, placedExtent, planRectify, rectify, tableToMap, type Bounds } from "../core/map.ts";
import type { Command, PlacedMap, TableState } from "../core/table.ts";
import type { DmApi, TableStatus } from "../main/dm-preload.ts";
import { fillFog, type FogPainter } from "./fog-draw.ts";

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
const toolBtns = [...document.querySelectorAll<HTMLButtonElement>("button[data-tool]")];
const drawBtns = [...document.querySelectorAll<HTMLButtonElement>("button[data-draw]")];
const sizeBtns = [...document.querySelectorAll<HTMLButtonElement>("button[data-size]")];
const brushSizes = $<HTMLDivElement>("brushSizes");
const fogBtns = ["fogDim", "fogRevealAll", "fogCoverAll"].map((id) => $<HTMLButtonElement>(id));
const fogHint = $<HTMLParagraphElement>("fogHint");
const FOG_HINT = fogHint.textContent;

/** Outline colour while the marked corners fold over each other. */
const FOLDED = "#ff6b5a";

type Importing = { bitmap: ImageBitmap; corners: Quad; selected: number; busy: boolean };
type Tool = "select" | FogMode;
type DrawWith = "brush" | "outline" | "box";
const DRAW_ORDER: DrawWith[] = ["brush", "outline", "box"];
/** Ghost colours while painting: warm light to reveal, copper to hide. */
const GHOST = { reveal: "rgba(240, 211, 168, 0.5)", hide: "rgba(200, 98, 63, 0.55)" };

/** One finger, pen or mouse painting fog, in map inches. Strokes reach the table only when lifted (D-025). */
type Stroke = { pointer: number; pen: boolean; mode: FogMode; points: Point[] };

export function initMaps(
  terra: DmApi,
  accent: string,
  fog: FogPainter,
  image: (id: string) => HTMLImageElement,
): { undo: () => void; render: () => void; cancel: () => boolean; shortcut: (key: string) => boolean } {
  let state: TableState | null = null;
  let status: TableStatus | null = null;
  let importing: Importing | null = null;
  let setupOpen = false;
  /** While dragging the map: how far it has moved so far, in inches. */
  let drag: { pointer: number; start: Point; dx: number; dy: number } | null = null;
  let tool: Tool = "select";
  let drawWith: DrawWith = "brush";
  let brushIn = 2;
  let stroke: Stroke | null = null;
  /** Where the mouse or a hovering pen is over the map, in map inches, to show the brush ring. Fingers have no hover. */
  let hover: Point | null = null;
  /** Fingers on the map now: a second one cancels the stroke. */
  const touches = new Set<number>();

  const run = (c: Command) => terra.apply(c);
  const undo = () => terra.undo();

  async function refreshLibrary(): Promise<void> {
    const maps = await terra.listMaps();
    library.replaceChildren(
      ...maps.map((m) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = `Place “${m.name}”`;
        b.addEventListener("click", () => run({ type: "placeMap", map: { ...m, x: 0, y: 0, turns: 0, fog: [] } }));
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
    renderTools(!!map && !importing);
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
      await run({ type: "placeMap", map: { ...entry, x: 0, y: 0, turns: 0, fog: [] } });
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
    if (img.complete && img.naturalWidth) fog.draw(ctx, img, map.bounds, map.fog, "dm");
    const ghost = stroke && strokeOp(stroke);
    if (ghost) {
      ctx.fillStyle = ctx.strokeStyle = GHOST[ghost.mode];
      fillFog(ctx, ghost);
    }
    if (hover && !stroke && tool !== "select" && drawWith === "brush") {
      ctx.strokeStyle = tool === "reveal" ? "#f0d3a8" : accent;
      ctx.lineWidth = 2 / s;
      ctx.beginPath();
      ctx.arc(hover.x, hover.y, brushIn / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
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
  const mapInchesAt = (e: PointerEvent): Point | null => (state?.map ? tableToMap(state.map, inchesAt(e)) : null);

  /** The fog op a stroke makes so far, or null if it doesn't make one yet. */
  function strokeOp(st: Stroke): FogShape | null {
    const { mode } = st;
    const pts = st.points;
    if (drawWith === "brush") return { kind: "brush", mode, r: brushIn / 2, points: pts };
    if (drawWith === "outline") return pts.length >= 3 ? { kind: "outline", mode, points: pts } : null;
    // A box snaps outwards to whole squares of the map, at least one square.
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    const x = Math.floor(Math.min(a.x, b.x));
    const y = Math.floor(Math.min(a.y, b.y));
    const width = Math.max(1, Math.ceil(Math.max(a.x, b.x)) - x);
    const height = Math.max(1, Math.ceil(Math.max(a.y, b.y)) - y);
    return { kind: "box", mode, x, y, width, height };
  }

  function sendStroke(st: Stroke): void {
    const op = strokeOp(st);
    if (op) void run({ type: "fog", op });
  }

  /** Esc or a second finger: drop the stroke before it reaches the table. */
  function cancel(): boolean {
    if (!stroke && !drag) return false;
    stroke = null;
    drag = null;
    render();
    return true;
  }

  mapCanvas.addEventListener("pointerdown", (e) => {
    if (!state?.map) return;
    // A palm resting on the screen while the pen draws is ignored; a second finger cancels a finger's stroke.
    if (e.pointerType === "touch") {
      if (stroke?.pen) return;
      touches.add(e.pointerId);
      if (touches.size > 1) {
        cancel();
        return;
      }
    }
    if (stroke || drag) return;
    mapCanvas.setPointerCapture(e.pointerId);
    if (tool === "select") {
      drag = { pointer: e.pointerId, start: inchesAt(e), dx: 0, dy: 0 };
      return;
    }
    const at = mapInchesAt(e)!;
    // A pen's eraser end (or eraser button) hides, whichever of Reveal or Hide is picked.
    const eraser = e.pointerType === "pen" && (e.button === 5 || (e.buttons & 32) !== 0);
    stroke = { pointer: e.pointerId, pen: e.pointerType === "pen", mode: eraser ? "hide" : tool, points: [at] };
    hover = e.pointerType === "touch" ? null : at;
    render();
  });
  mapCanvas.addEventListener("pointermove", (e) => {
    if (drag?.pointer === e.pointerId) {
      const at = inchesAt(e);
      // The map snaps to whole inches so its squares stay on the table grid.
      drag.dx = Math.round(at.x - drag.start.x);
      drag.dy = Math.round(at.y - drag.start.y);
      render();
      return;
    }
    const at = mapInchesAt(e);
    if (!at) return;
    if (e.pointerType !== "touch") hover = at;
    if (stroke?.pointer === e.pointerId) {
      const last = stroke.points[stroke.points.length - 1]!;
      // Keep points about a quarter of the brush apart: smooth enough, and saves stay small.
      const gap = drawWith === "brush" ? Math.max(0.1, brushIn / 8) : 0.1;
      if (drawWith === "box") stroke.points = [stroke.points[0]!, at];
      else if (Math.hypot(at.x - last.x, at.y - last.y) >= gap) stroke.points.push(at);
      if (stroke.points.length >= MAX_FOG_POINTS) {
        // A very long stroke goes to the table in parts; an outline stops growing at its limit.
        if (drawWith === "brush") {
          sendStroke(stroke);
          stroke = { ...stroke, points: [at] };
        } else stroke.points.length = MAX_FOG_POINTS;
      }
    }
    if (tool !== "select") render();
  });
  const endPointer = (e: PointerEvent, keep: boolean) => {
    touches.delete(e.pointerId);
    if (e.pointerType === "touch") hover = null;
    if (drag?.pointer === e.pointerId) {
      const { dx, dy } = drag;
      drag = null;
      if (keep && (dx || dy)) run({ type: "moveMap", dx, dy });
      else render();
      return;
    }
    if (stroke?.pointer !== e.pointerId) return;
    const st = stroke;
    stroke = null;
    if (keep) sendStroke(st);
    render();
  };
  mapCanvas.addEventListener("pointerup", (e) => endPointer(e, true));
  mapCanvas.addEventListener("pointercancel", (e) => endPointer(e, false));
  mapCanvas.addEventListener("pointerleave", (e) => {
    if (e.pointerType !== "touch" && hover && !stroke) {
      hover = null;
      render();
    }
  });

  // ---- Fog tools (D-025): big buttons for touch, with the D-023 keys alongside ----

  function renderTools(on: boolean): void {
    if (!on) tool = "select";
    const press = (bs: HTMLButtonElement[], pressed: (b: HTMLButtonElement) => boolean) =>
      bs.forEach((b) => {
        b.disabled = !on;
        b.setAttribute("aria-pressed", String(pressed(b)));
      });
    press(toolBtns, (b) => b.dataset.tool === tool);
    press(drawBtns, (b) => b.dataset.draw === drawWith);
    press(sizeBtns, (b) => Number(b.dataset.size) === brushIn);
    brushSizes.classList.toggle("off", drawWith !== "brush");
    fogBtns.forEach((b) => (b.disabled = !on));
    const full = (state?.map?.fog.length ?? 0) >= MAX_FOG_OPS;
    fogHint.textContent = full
      ? `The fog holds ${MAX_FOG_OPS} strokes, its most. Use Reveal all or Cover all to start it afresh.`
      : FOG_HINT;
    mapCanvas.dataset.tool = tool;
  }
  function setTool(t: Tool): void {
    tool = t;
    render();
  }
  /** Picking how to draw, or a brush size, also picks Reveal if the map was on Select. */
  function setDraw(d: DrawWith): void {
    drawWith = d;
    if (tool === "select") tool = "reveal";
    render();
  }
  toolBtns.forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool as Tool)));
  drawBtns.forEach((b) => b.addEventListener("click", () => setDraw(b.dataset.draw as DrawWith)));
  sizeBtns.forEach((b) =>
    b.addEventListener("click", () => {
      brushIn = Number(b.dataset.size);
      setDraw("brush");
    }),
  );
  const fogAll: FogOp[] = [{ kind: "dimSeen" }, { kind: "revealAll" }, { kind: "coverAll" }];
  fogBtns.forEach((b, i) => b.addEventListener("click", () => run({ type: "fog", op: fogAll[i]! })));

  /** V, R, H pick the tool; S steps through brush, outline and box. Returns whether the key was used. */
  function shortcut(key: string): boolean {
    if (!state?.map || importing) return false;
    const k = key.toLowerCase();
    if (k === "v") setTool("select");
    else if (k === "r") setTool("reveal");
    else if (k === "h") setTool("hide");
    else if (k === "s") setDraw(DRAW_ORDER[(DRAW_ORDER.indexOf(drawWith) + 1) % DRAW_ORDER.length]!);
    else return false;
    return true;
  }

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
  return { undo, render, cancel, shortcut };
}
