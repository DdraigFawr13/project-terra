// DM window, maps (step 4, D-024): import a picture, mark a rectangle of known size, straighten it into 1-inch
// squares, and place, move and turn it on the table. Straightening runs here, in the DM window; the main process only
// stores the result in the personal library (D-010). Fog (step 5, D-025) is painted here with Reveal and Hide, and
// enemy discs (step 6, D-027) are placed with Marker and dragged with Select. Ping (step 7, D-034) pings the table with
// a tap and leaves a pin with a long press. Draw (D-035) draws freehand lines, lasting or fading.
import { defaultCalibration, screenOutline } from "../core/calibration.ts";
import { isConvex, type Point, type Quad } from "../core/homography.ts";
import { conditionOf, hpFraction, nextLetter, snapDisc, type Condition, type Disc, type DiscColour } from "../core/fight.ts";
import { MAX_FOG_POINTS, type FogMode, type FogOp, type FogShape } from "../core/fog.ts";
import { mapToTable, parseMarking, placedExtent, planRectify, rectify, tableToMap, type Bounds } from "../core/map.ts";
import { MAX_LINE_POINTS, parseFeetPerSquare, type Command, type Ink, type PlacedMap, type TableState } from "../core/table.ts";
import type { DmApi, TableStatus } from "../main/dm-preload.ts";
import { fillFog, type FogPainter } from "./fog-draw.ts";
import { initPatch } from "./dm-patch.ts";
import { icon } from "./icons.ts";
import { drawDisc, drawLine, drawPin, PING_MS, SKETCH_MS, sketchAlpha } from "./table-draw.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const emptyMap = $<HTMLElement>("emptyMap");
const importer = $<HTMLElement>("importer");
const mapView = $<HTMLElement>("mapView");
const mapActions = $<HTMLElement>("mapActions");
const mapTitle = $<HTMLElement>("mapTitle");
const zoomState = $<HTMLElement>("zoomState");
const fileInput = $<HTMLInputElement>("mapFile");
const library = $<HTMLUListElement>("library");
const importCanvas = $<HTMLCanvasElement>("importCanvas");
const importStatus = $<HTMLParagraphElement>("importStatus");
const nameInput = $<HTMLInputElement>("mapName");
const markW = $<HTMLInputElement>("markW");
const markH = $<HTMLInputElement>("markH");
const markFeet = $<HTMLSelectElement>("markFeet");
const mapCanvas = $<HTMLCanvasElement>("mapCanvas");
const undoBtn = $<HTMLButtonElement>("undo");
const toolBtns = [...document.querySelectorAll<HTMLButtonElement>("button[data-tool]")];
const drawBtns = [...document.querySelectorAll<HTMLButtonElement>("button[data-draw]")];
const sizeBtns = [...document.querySelectorAll<HTMLButtonElement>("button[data-size]")];
const brushSizes = $<HTMLDivElement>("brushSizes");
const brushHead = $<HTMLElement>("brushHead");
/** The options under the main tools, one set for each tool (D-032). */
const fogOpts = $<HTMLDivElement>("fogOpts");
const markerOpts = $<HTMLDivElement>("markerOpts");
const pingOpts = $<HTMLDivElement>("pingOpts");
const pinKindBtns = [...document.querySelectorAll<HTMLButtonElement>("button[data-pin-table]")];
const drawOpts = $<HTMLDivElement>("drawOpts");
const inkTableBtns = [...document.querySelectorAll<HTMLButtonElement>("button[data-ink-table]")];
const inkFadeBtns = [...document.querySelectorAll<HTMLButtonElement>("button[data-ink-fade]")];
const inkBtns = [...document.querySelectorAll<HTMLButtonElement>("button[data-ink]")];
const selectHint = $<HTMLElement>("selectHint");
const colourBtns = [...document.querySelectorAll<HTMLButtonElement>("button[data-colour]")];
const discSizeBtns = [...document.querySelectorAll<HTMLButtonElement>("button[data-disc-size]")];
const fogBtns = ["fogDim", "fogRevealAll", "fogCoverAll"].map((id) => $<HTMLButtonElement>(id));
const lockBtn = $<HTMLButtonElement>("lockMap");
/** Buttons that change where the map is; a locked map keeps them off (D-029). */
const placeBtns = [$<HTMLButtonElement>("turnMap"), $<HTMLButtonElement>("removeMap")];
const zoomLevel = $<HTMLElement>("zoomLevel");

/** Outline colour while the marked corners fold over each other. */
const FOLDED = "#ff6b5a";

type Importing = { bitmap: ImageBitmap; corners: Quad; selected: number; busy: boolean };
type Tool = "select" | FogMode | "marker" | "ping" | "draw";
type DrawWith = "brush" | "outline" | "box";
const DRAW_ORDER: DrawWith[] = ["brush", "outline", "box"];
/** Ghost colours while painting: warm light to reveal, copper to hide. */
const GHOST = { reveal: "rgba(240, 211, 168, 0.5)", hide: "rgba(200, 98, 63, 0.55)" };

/** One finger, pen or mouse painting fog, in map inches. Strokes reach the table only when lifted (D-025). */
type Stroke = { pointer: number; pen: boolean; mode: FogMode; points: Point[] };
/** A disc being dragged, or a tap with Marker about to place one; `at` is its snapped centre in map inches. */
type DiscDrag = { pointer: number; pen: boolean; colour: DiscColour; letter: string; from: Point; at: Point };
type Placing = { pointer: number; pen: boolean; at: Point };
/** A press with Ping: a tap pings, holding for LONG_PRESS_MS leaves a pin, a tap on a pin takes it away (D-034). */
type Pressing = { pointer: number; pen: boolean; from: Point; at: Point; pin: number | null; done: boolean; timer: number };
const LONG_PRESS_MS = 500;
/** A press that wanders further than this, in canvas pixels, is a slip, not a tap. */
const SLIP_PX = 14;
/** A line being drawn, in map inches; or, with the pen's eraser, rubbing lines out (D-035). */
type Line = { pointer: number; pen: boolean; from: Point; points: Point[]; eraser: boolean };
/** A line within this many canvas pixels of a tap or the eraser is hit. */
const LINE_HIT_PX = 12;
/** Fingers find a disc within this many pixels of its edge, however small the map draws it (D-027). */
const GRAB_PX = 22;
/** Discs are drawn at least this wide on the DM's map so their letters stay readable. */
const MIN_DISC_PX = 18;

/** HP ring colours by condition: green, amber at Bloodied, red at Near death (D-028, D-036). */
const HP_RING: Record<Condition, string> = { fine: "#3fa34d", bloodied: "#e0a100", nearDeath: "#d64035", down: "#d64035" };

/** How a map's square size reads after its name: 5 ft is the usual, so only 10 ft is named (D-036). */
const feetNote = (feet: number) => (feet === 5 ? "" : ` · ${feet} ft squares`);

/** A disc's key, shared with the side panel's rows. */
export const discKey = (d: { colour: DiscColour; letter: string }) => `${d.colour}-${d.letter}`;

export function initMaps(
  terra: DmApi,
  accent: string,
  fog: FogPainter,
  image: (id: string) => HTMLImageElement,
  selection: {
    get: () => string | null;
    set: (key: string | null, open?: boolean) => void;
    /** A tap on a disc: its HP pad opens beside it (D-032). `at` is in window coordinates. */
    tap: (colour: DiscColour, letter: string, at: Point) => void;
  },
): { undo: () => void; render: () => void; cancel: () => boolean; shortcut: (key: string) => boolean } {
  let state: TableState | null = null;
  let status: TableStatus | null = null;
  let importing: Importing | null = null;
  /** While dragging the map: how far it has moved so far, in inches. */
  let drag: { pointer: number; pen: boolean; start: Point; dx: number; dy: number } | null = null;
  let tool: Tool = "select";
  let drawWith: DrawWith = "brush";
  let brushIn = 2;
  let stroke: Stroke | null = null;
  let discDrag: DiscDrag | null = null;
  let placing: Placing | null = null;
  let pressing: Pressing | null = null;
  /** Whether a new pin is one the players see. */
  let pinTable = true;
  let line: Line | null = null;
  let ink: Ink = "white";
  let inkTable = true;
  let inkFade = false;
  /** Fading lines the DM drew, in map inches, shown here as on the table until they fade. */
  let fading: { ink: Ink; table: boolean; points: Point[]; start: number }[] = [];
  let fadeTimer = 0;
  let colour: DiscColour = "yellow";
  let discSize = 1;
  /** Where the mouse or a hovering pen is over the map, in map inches, to show the brush ring. Fingers have no hover. */
  let hover: Point | null = null;
  /** Fingers on the map now, where they are in canvas pixels: a second one cancels the stroke and pinches the view. */
  const touches = new Map<number, Point>();
  /** Two fingers zooming and panning: their spread and midpoint at the last move. */
  let pinch: { dist: number; mid: Point } | null = null;
  /** Panning the zoomed view by dragging: Select on a locked map, or the middle mouse button. Canvas pixels. */
  let pan: { pointer: number; last: Point } | null = null;
  /** The DM's own view of the map (D-030): zoom past fitting the whole map, and the table point at the canvas centre. */
  let zoom = 1;
  let centre: Point | null = null;
  let viewOf: string | null = null;
  const MAX_ZOOM = 8;

  const patch = initPatch(terra, accent, () => render());
  $<HTMLButtonElement>("patchMap").addEventListener("click", () => state?.map && patch.open(state.map));
  const run = (c: Command) => terra.apply(c);
  const undo = () => terra.undo();

  async function refreshLibrary(): Promise<void> {
    const maps = await terra.listMaps();
    library.replaceChildren(
      ...maps.map((m) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = `Place “${m.name}”${feetNote(m.feetPerSquare)}`;
        b.addEventListener("click", () =>
          run({ type: "placeMap", map: { ...m, x: 0, y: 0, turns: 0, fog: [], discs: [], groups: {}, pins: [], drawings: [] } }),
        );
        li.append(b);
        return li;
      }),
    );
  }

  function render(): void {
    const map = state?.map ?? null;
    // The patch tool (D-036) takes the map window's place while it is open.
    const patching = patch.isOpen();
    importer.hidden = !importing;
    mapView.hidden = !!importing || !map || patching;
    emptyMap.hidden = !!importing || !!map;
    // The map window's own buttons (its second row) and its tab name follow the map (D-032).
    mapActions.hidden = !map || !!importing || patching;
    const title = map ? map.name + feetNote(map.feetPerSquare) : "Map";
    if (mapTitle.textContent !== title) mapTitle.textContent = title;
    zoomState.textContent = map && !importing && zoom > 1 ? `Zoom ${Math.round(zoom * 100)}%` : "";
    zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
    renderTools(!!map && !importing && !patching);
    if (importing) drawImport(importing);
    else if (map && !patching) drawMap(map);
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
    if (draggingCorner) drawLoupe(ctx, im, pts[im.selected]!, k, importCanvas.clientWidth, h);
  }

  /** A magnifier beside the corner being dragged (D-036), so a finger or the pen doesn't hide where it lands. */
  function drawLoupe(ctx: CanvasRenderingContext2D, im: Importing, at: Point, k: number, w: number, h: number): void {
    const R = 64;
    const ZOOM = 3;
    const GAP = 84;
    // Up and to the left of the corner by default; the first side that fits inside the picture wins.
    const spots = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].map(([dx, dy]) => ({ x: at.x + dx! * GAP, y: at.y + dy! * GAP }));
    const c = spots.find((q) => q.x >= R && q.x <= w - R && q.y >= R && q.y <= h - R) ?? spots[0]!;
    const corner = im.corners[im.selected]!;
    const half = R / (k * ZOOM);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im.bitmap, corner.x - half, corner.y - half, half * 2, half * 2, c.x - R, c.y - R, R * 2, R * 2);
    ctx.strokeStyle = isConvex(im.corners) ? accent : FOLDED;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(c.x - R, c.y);
    ctx.lineTo(c.x + R, c.y);
    ctx.moveTo(c.x, c.y - R);
    ctx.lineTo(c.x, c.y + R);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(c.x, c.y, R, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#f0d3a8";
    ctx.stroke();
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
      const entry = await terra.saveMap(nameInput.value, png, plan.bounds, parseFeetPerSquare(Number(markFeet.value)) ?? 5);
      importing = null;
      await run({ type: "placeMap", map: { ...entry, x: 0, y: 0, turns: 0, fog: [], discs: [], groups: {}, pins: [], drawings: [] } });
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
  const endCorner = () => {
    if (!draggingCorner) return;
    draggingCorner = false;
    render();
  };
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

  function outlineNow(): Quad | null {
    const cal = status && state ? (state.calibrations[status.surfaceKey] ?? defaultCalibration(status.surface)) : null;
    return cal && status ? screenOutline(cal, status.surface) : null;
  }

  /** Inches → canvas pixels for the DM's view: the fit view, zoomed about the chosen centre. A new map starts fitted. */
  function viewport(map: PlacedMap, w: number, h: number) {
    if (viewOf !== map.id) [viewOf, zoom, centre] = [map.id, 1, null];
    const fit = mapViewport(map, outlineNow(), w, h);
    if (zoom === 1) return fit;
    const s = fit.s * zoom;
    const c = centre ?? { x: (w / 2 - fit.ox) / fit.s, y: (h / 2 - fit.oy) / fit.s };
    return { s, ox: w / 2 - c.x * s, oy: h / 2 - c.y * s };
  }

  /** Keep the view's centre over what the fitted view shows, so the map can't be panned out of sight. */
  function setCentre(c: Point, map: PlacedMap, w: number, h: number): void {
    const fit = mapViewport(map, outlineNow(), w, h);
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    centre = { x: clamp(c.x, -fit.ox / fit.s, (w - fit.ox) / fit.s), y: clamp(c.y, -fit.oy / fit.s, (h - fit.oy) / fit.s) };
  }

  /** Zoom by `factor`, keeping the table point under `at` (canvas pixels) where it is. */
  function zoomAt(factor: number, at: Point): void {
    const map = state?.map;
    if (!map) return;
    const [w, h] = [mapCanvas.clientWidth, mapCanvas.clientHeight];
    const v = viewport(map, w, h);
    const p = { x: (at.x - v.ox) / v.s, y: (at.y - v.oy) / v.s };
    zoom = Math.min(MAX_ZOOM, Math.max(1, zoom * factor));
    if (zoom === 1) centre = null;
    else {
      const s = mapViewport(map, outlineNow(), w, h).s * zoom;
      setCentre({ x: p.x - (at.x - w / 2) / s, y: p.y - (at.y - h / 2) / s }, map, w, h);
    }
    render();
  }

  /** Move the zoomed view by canvas pixels, the way a finger drags it. */
  function panBy(dx: number, dy: number): void {
    const map = state?.map;
    if (!map || zoom === 1) return;
    const [w, h] = [mapCanvas.clientWidth, mapCanvas.clientHeight];
    const v = viewport(map, w, h);
    setCentre({ x: (w / 2 - v.ox - dx) / v.s, y: (h / 2 - v.oy - dy) / v.s }, map, w, h);
    render();
  }

  const canvasPoint = (e: PointerEvent | WheelEvent): Point => {
    const r = mapCanvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function drawMap(map: PlacedMap): void {
    const locked = !!state?.mapLocked;
    lockBtn.setAttribute("aria-pressed", String(locked));
    lockBtn.innerHTML = `${icon(locked ? "lock" : "unlock")}${locked ? "Locked" : "Lock"}`;
    for (const b of placeBtns) b.disabled = locked;
    lockBtn.title = locked
      ? "Locked: dragging pans the view. Unlock to move the map on the table."
      : "Unlocked: dragging moves the map on the table. Lock it to pan by dragging.";
    const dpr = window.devicePixelRatio || 1;
    const w = mapCanvas.clientWidth;
    const h = mapCanvas.clientHeight;
    mapCanvas.width = Math.round(w * dpr);
    mapCanvas.height = Math.round(h * dpr);
    const ctx = mapCanvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    const outline = outlineNow();
    const { s, ox, oy } = viewport(map, w, h);
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
    if (hover && !stroke && (tool === "reveal" || tool === "hide") && drawWith === "brush") {
      ctx.strokeStyle = tool === "reveal" ? "#f0d3a8" : accent;
      ctx.lineWidth = 2 / s;
      ctx.beginPath();
      ctx.arc(hover.x, hover.y, brushIn / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    drawDiscs(ctx, shown, s, ox, oy);
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

  /** A thin ring round a disc that empties clockwise from the top as it takes damage (D-036). DM map only (D-002). */
  function hpRing(ctx: CanvasRenderingContext2D, c: Point, w: number, full: number, condition: Condition): void {
    const lw = Math.max(4, w * 0.12);
    const r = w / 2 + lw / 2 + 1;
    ctx.lineWidth = lw;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = HP_RING[condition];
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, -Math.PI / 2, -Math.PI / 2 + full * Math.PI * 2);
    ctx.stroke();
  }

  /** Discs drawn upright in canvas pixels: see-through when hidden (D-006), faint and crossed when down. */
  function drawDiscs(ctx: CanvasRenderingContext2D, map: PlacedMap, s: number, ox: number, oy: number): void {
    const px = (p: Point) => {
      const t = mapToTable(map, p);
      return { x: ox + t.x * s, y: oy + t.y * s };
    };
    const draw = (d: Pick<Disc, "colour" | "letter" | "size"> & Partial<Pick<Disc, "mini">>, at: Point, alpha: number) => {
      const c = px(at);
      const w = Math.max(d.size * s, MIN_DISC_PX);
      ctx.globalAlpha = alpha;
      // As the players see it: a revealed group's symbol, the letter on a tab when a mini stands on it (D-036).
      const g = map.groups[d.colour];
      drawDisc(ctx, { ...d, symbol: g?.revealed ? g.symbol : null }, c.x, c.y, w);
      ctx.globalAlpha = 1;
      return { c, w };
    };
    // Lines under the discs (D-006, D-035): the DM's own dashed, fading ones as the table shows them now.
    const canvasLine = (pts: Point[]) => pts.map(px);
    for (const l of map.drawings) drawLine(ctx, canvasLine(l.points), l.ink, Math.max(s, 20), 1, !l.table);
    const now = performance.now();
    for (const l of fading) drawLine(ctx, canvasLine(l.points), l.ink, Math.max(s, 20), sketchAlpha(now - l.start), !l.table);
    if (line && !line.eraser) drawLine(ctx, canvasLine(line.points), ink, Math.max(s, 20), 1, !inkTable);
    const picked = selection.get();
    for (const d of map.discs) {
      const moving = discDrag && discKey(discDrag) === discKey(d);
      const down = conditionOf(d, map.groups) === "down";
      const { c, w } = draw(d, moving ? discDrag!.at : d, down ? 0.3 : d.shown ? 1 : 0.45);
      const full = down ? null : hpFraction(d, map.groups);
      if (full !== null) hpRing(ctx, c, w, full, conditionOf(d, map.groups));
      if (down) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        (ctx.moveTo(c.x - w / 3, c.y - w / 3), ctx.lineTo(c.x + w / 3, c.y + w / 3));
        (ctx.moveTo(c.x + w / 3, c.y - w / 3), ctx.lineTo(c.x - w / 3, c.y + w / 3));
        ctx.stroke();
      }
      if (picked === discKey(d)) {
        ctx.strokeStyle = "#f0d3a8";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(c.x, c.y, w / 2 + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Pins over the discs, as on the table (D-006): the DM's own are hollow copper. Never smaller than a fingertip.
    for (const p of map.pins) {
      const c = px(p);
      drawPin(ctx, c.x, c.y, Math.max(s, 26), !p.table, accent);
    }
    // Where a tap with Marker will put the next disc: under the finger, or under the hovering pen or mouse.
    const ghost = placing?.at ?? (tool === "marker" && hover && !discDrag ? snapDisc(hover, discSize) : null);
    if (ghost && nextLetter(map.discs, colour)) draw({ colour, letter: nextLetter(map.discs, colour)!, size: discSize }, ghost, 0.5);
  }

  /**
   * The disc under a pointer, the nearest. Select reaches GRAB_PX past a disc's edge, for a finger; Marker only the
   * disc itself, so a tap beside a disc places a new one.
   */
  function discAt(e: PointerEvent, grab: number): Disc | null {
    const map = state?.map;
    if (!map) return null;
    const r = mapCanvas.getBoundingClientRect();
    const { s, ox, oy } = viewport(map, r.width, r.height);
    const p = canvasPoint(e);
    let best: { d: Disc; dist: number } | null = null;
    for (const d of map.discs) {
      const t = mapToTable(map, d);
      const dist = Math.hypot(ox + t.x * s - p.x, oy + t.y * s - p.y);
      const reach = Math.max(d.size * s, MIN_DISC_PX) / 2 + grab;
      if (dist <= reach && (!best || dist < best.dist)) best = { d, dist };
    }
    return best?.d ?? null;
  }

  /** The pin under a pointer, within a finger's reach, or null. */
  function pinAt(e: PointerEvent): number | null {
    const map = state?.map;
    if (!map) return null;
    const r = mapCanvas.getBoundingClientRect();
    const { s, ox, oy } = viewport(map, r.width, r.height);
    const p = canvasPoint(e);
    let best: { id: number; dist: number } | null = null;
    for (const pin of map.pins) {
      const t = mapToTable(map, pin);
      const dist = Math.hypot(ox + t.x * s - p.x, oy + t.y * s - p.y);
      if (dist <= Math.max(s, 26) * 0.45 + GRAB_PX && (!best || dist < best.dist)) best = { id: pin.id, dist };
    }
    return best?.id ?? null;
  }

  /** The lasting line under a pointer, or null: the nearest within LINE_HIT_PX of any of its segments. */
  function lineAt(e: PointerEvent): number | null {
    const map = state?.map;
    if (!map) return null;
    const r = mapCanvas.getBoundingClientRect();
    const { s, ox, oy } = viewport(map, r.width, r.height);
    const p = canvasPoint(e);
    const toCanvas = (q: Point) => {
      const t = mapToTable(map, q);
      return { x: ox + t.x * s, y: oy + t.y * s };
    };
    let best: { id: number; dist: number } | null = null;
    for (const l of map.drawings) {
      const pts = l.points.map(toCanvas);
      for (let i = 1; i < pts.length; i++) {
        const dist = segmentDistance(p, pts[i - 1]!, pts[i]!);
        if (dist <= LINE_HIT_PX && (!best || dist < best.dist)) best = { id: l.id, dist };
      }
    }
    return best?.id ?? null;
  }

  /** Keep the DM's map drawing while a fading line fades, then drop it. */
  function tickFading(): void {
    const now = performance.now();
    fading = fading.filter((l) => now - l.start < SKETCH_MS);
    render();
    clearTimeout(fadeTimer);
    if (!fading.length) return;
    const fadesIn = Math.min(...fading.map((l) => SKETCH_MS - 3000 - (now - l.start)));
    fadeTimer = window.setTimeout(tickFading, Math.max(120, fadesIn));
  }

  /** The DM's own sight of a ping: rings over the map for as long as the table shows them, faint while the curtain is down. */
  function showPing(at: Point): void {
    const mark = document.createElement("span");
    mark.className = "ping-mark";
    mark.classList.toggle("muted", !!state?.curtain);
    Object.assign(mark.style, { left: `${at.x}px`, top: `${at.y}px` });
    mapCanvas.parentElement!.append(mark);
    setTimeout(() => mark.remove(), PING_MS);
  }

  const inchesAt = (e: PointerEvent): Point => {
    const map = state?.map;
    const r = mapCanvas.getBoundingClientRect();
    if (!map) return { x: 0, y: 0 };
    const { s, ox, oy } = viewport(map, r.width, r.height);
    const p = canvasPoint(e);
    return { x: (p.x - ox) / s, y: (p.y - oy) / s };
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

  /** Esc or a second finger: drop the stroke, drag or placement before it reaches the table. */
  function cancel(): boolean {
    if (!stroke && !drag && !discDrag && !placing && !pan && !pressing && !line) return false;
    line = null;
    if (pressing) clearTimeout(pressing.timer);
    pressing = null;
    stroke = null;
    drag = null;
    discDrag = null;
    placing = null;
    pan = null;
    render();
    return true;
  }
  /** Whether a gesture is under way, and whether the pen is making it (then touches are a resting palm). */
  const busy = () => !!(stroke || drag || discDrag || placing || pan || pressing || line);
  const penBusy = () => !!(stroke?.pen || drag?.pen || discDrag?.pen || placing?.pen || pressing?.pen || line?.pen);

  mapCanvas.addEventListener("pointerdown", (e) => {
    if (!state?.map) return;
    // A palm resting on the screen while the pen draws is ignored; a second finger cancels a finger's stroke.
    if (e.pointerType === "touch") {
      if (penBusy()) return;
      touches.set(e.pointerId, canvasPoint(e));
      if (touches.size > 1) {
        // Two fingers: drop what the first one started, and pinch to zoom and pan instead (D-030).
        cancel();
        mapCanvas.setPointerCapture(e.pointerId);
        const [a, b] = [...touches.values()];
        pinch =
          touches.size === 2 ? { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 } } : null;
        return;
      }
    }
    // The middle mouse button pans the zoomed view, whatever the tool.
    if (e.pointerType === "mouse" && e.button === 1) {
      e.preventDefault();
      pan = { pointer: e.pointerId, last: canvasPoint(e) };
      mapCanvas.setPointerCapture(e.pointerId);
      return;
    }
    // The pen wins over a palm that landed first: drop the touch's gesture and start the pen's (D-027).
    if (e.pointerType === "pen" && busy() && !penBusy()) cancel();
    if (busy()) return;
    mapCanvas.setPointerCapture(e.pointerId);
    const pen = e.pointerType === "pen";
    if (tool === "select" || tool === "marker") {
      const hit = discAt(e, tool === "select" ? GRAB_PX : 0);
      if (hit) {
        const from = { x: hit.x, y: hit.y };
        discDrag = { pointer: e.pointerId, pen, colour: hit.colour, letter: hit.letter, from, at: from };
        render();
        return;
      }
    }
    if (tool === "select") {
      // A locked map stays put: a drag that misses every disc pans the zoomed view instead.
      if (!state.mapLocked) drag = { pointer: e.pointerId, pen, start: inchesAt(e), dx: 0, dy: 0 };
      else pan = { pointer: e.pointerId, last: canvasPoint(e) };
      return;
    }
    if (tool === "marker") {
      placing = { pointer: e.pointerId, pen, at: snapDisc(mapInchesAt(e)!, discSize) };
      render();
      return;
    }
    if (tool === "draw") {
      // The pen's eraser end (or eraser button) rubs out lines, as it hides fog with Reveal and Hide (D-025).
      const eraser = e.pointerType === "pen" && (e.button === 5 || (e.buttons & 32) !== 0);
      line = { pointer: e.pointerId, pen, from: canvasPoint(e), points: [mapInchesAt(e)!], eraser };
      if (eraser) eraseAt(e);
      render();
      return;
    }
    if (tool === "ping") {
      const from = canvasPoint(e);
      const pin = pinAt(e);
      const at = mapInchesAt(e)!;
      const p: Pressing = { pointer: e.pointerId, pen, from, at, pin, done: false, timer: 0 };
      // Holding still leaves a pin; on a pin, holding does nothing more than a tap.
      if (pin === null)
        p.timer = window.setTimeout(() => {
          if (pressing !== p) return;
          p.done = true;
          void run({ type: "placePin", ...p.at, table: pinTable });
        }, LONG_PRESS_MS);
      pressing = p;
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
    if (e.pointerType === "touch" && touches.has(e.pointerId)) {
      touches.set(e.pointerId, canvasPoint(e));
      if (pinch && touches.size === 2) {
        const [a, b] = [...touches.values()];
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
        if (pinch.dist > 0) zoomAt(dist / pinch.dist, mid);
        panBy(mid.x - pinch.mid.x, mid.y - pinch.mid.y);
        pinch = { dist, mid };
        return;
      }
    }
    if (pan?.pointer === e.pointerId) {
      const p = canvasPoint(e);
      panBy(p.x - pan.last.x, p.y - pan.last.y);
      pan.last = p;
      return;
    }
    if (line?.pointer === e.pointerId) {
      if (line.eraser) return eraseAt(e);
      const at = mapInchesAt(e)!;
      const last = line.points[line.points.length - 1]!;
      // A point every tenth of an inch is smooth enough; a very long line stops growing at its limit.
      if (Math.hypot(at.x - last.x, at.y - last.y) >= 0.1 && line.points.length < MAX_LINE_POINTS) line.points.push(at);
      render();
      return;
    }
    if (pressing?.pointer === e.pointerId) {
      const p = canvasPoint(e);
      if (!pressing.done && Math.hypot(p.x - pressing.from.x, p.y - pressing.from.y) > SLIP_PX) cancel();
      return;
    }
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
    if (discDrag?.pointer === e.pointerId) {
      const disc = state!.map!.discs.find((d) => discKey(d) === discKey(discDrag!));
      discDrag.at = snapDisc(at, disc?.size ?? 1);
      render();
      return;
    }
    if (placing?.pointer === e.pointerId) placing.at = snapDisc(at, discSize);
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
  /** Lifting a disc drops it where it was dragged; lifting without a move picks it in the side panel. */
  function endDisc(keep: boolean): void {
    const d = discDrag!;
    discDrag = null;
    const moved = d.at.x !== d.from.x || d.at.y !== d.from.y;
    if (keep && moved) void run({ type: "moveDisc", colour: d.colour, letter: d.letter, ...d.at });
    if (keep) selection.set(discKey(d));
    // A tap opens the disc's HP pad beside it; a drag only moves it.
    if (keep && !moved && state?.map) {
      const r = mapCanvas.getBoundingClientRect();
      const { s, ox, oy } = viewport(state.map, r.width, r.height);
      const t = mapToTable(state.map, d.from);
      selection.tap(d.colour, d.letter, { x: r.left + ox + t.x * s, y: r.top + oy + t.y * s });
    }
    render();
  }
  /** The pen's eraser over a lasting line takes it away. */
  function eraseAt(e: PointerEvent): void {
    const id = lineAt(e);
    if (id !== null) void run({ type: "removeDrawing", id });
  }
  /** Lifting the pen: a tap on a line rubs it out; a line is kept, or sent to fade (D-035). */
  function endLine(e: PointerEvent, keep: boolean): void {
    const l = line!;
    line = null;
    const p = canvasPoint(e);
    const tap = Math.hypot(p.x - l.from.x, p.y - l.from.y) <= SLIP_PX && l.points.length < 3;
    if (!keep || l.eraser || !state?.map) return render();
    if (tap) {
      eraseAt(e);
      return render();
    }
    if (l.points.length < 2) return render();
    if (!inkFade) void run({ type: "draw", ink, table: inkTable, points: l.points });
    else {
      if (inkTable)
        void terra.sketch(
          ink,
          l.points.map((q) => mapToTable(state!.map!, q)),
        );
      fading.push({ ink, table: inkTable, points: l.points, start: performance.now() });
      tickFading();
    }
    render();
  }
  function endPlacing(keep: boolean): void {
    const p = placing!;
    placing = null;
    const letter = state?.map ? nextLetter(state.map.discs, colour) : null;
    if (keep && letter) {
      void run({ type: "placeDisc", colour, ...p.at, size: discSize });
      selection.set(discKey({ colour, letter }));
    }
    render();
  }
  const endPointer = (e: PointerEvent, keep: boolean) => {
    touches.delete(e.pointerId);
    // The finger left after a pinch stays inert until it lifts too.
    if (touches.size < 2) pinch = null;
    if (e.pointerType === "touch") hover = null;
    if (pan?.pointer === e.pointerId) {
      pan = null;
      return;
    }
    if (discDrag?.pointer === e.pointerId) return endDisc(keep);
    if (placing?.pointer === e.pointerId) return endPlacing(keep);
    if (line?.pointer === e.pointerId) return endLine(e, keep);
    if (pressing?.pointer === e.pointerId) {
      const p = pressing;
      clearTimeout(p.timer);
      pressing = null;
      if (!keep || p.done || !state?.map) return;
      if (p.pin !== null) void run({ type: "removePin", id: p.pin });
      else {
        const t = mapToTable(state.map, p.at);
        void terra.ping(t.x, t.y);
        showPing(p.from);
      }
      return;
    }
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
    if (e.pointerType !== "touch" && hover && !busy()) {
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
    brushSizes.hidden = brushHead.hidden = drawWith !== "brush";
    // Only the options for the tool picked show under the main tools.
    fogOpts.hidden = !on || (tool !== "reveal" && tool !== "hide");
    markerOpts.hidden = !on || tool !== "marker";
    pingOpts.hidden = !on || tool !== "ping";
    drawOpts.hidden = !on || tool !== "draw";
    press(inkTableBtns, (b) => (b.dataset.inkTable === "true") === inkTable);
    press(inkFadeBtns, (b) => (b.dataset.inkFade === "true") === inkFade);
    press(inkBtns, (b) => b.dataset.ink === ink);
    press(pinKindBtns, (b) => (b.dataset.pinTable === "true") === pinTable);
    selectHint.hidden = !on || tool !== "select";
    press(colourBtns, (b) => b.dataset.colour === colour);
    press(discSizeBtns, (b) => Number(b.dataset.discSize) === discSize);
    fogBtns.forEach((b) => (b.disabled = !on));
    mapCanvas.dataset.tool = tool;
  }
  function setTool(t: Tool): void {
    tool = t;
    render();
  }
  /** Picking how to draw, or a brush size, also picks Reveal if the map was on Select. */
  function setDraw(d: DrawWith): void {
    drawWith = d;
    if (tool === "select" || tool === "marker") tool = "reveal";
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
  colourBtns.forEach((b) =>
    b.addEventListener("click", () => {
      colour = b.dataset.colour as DiscColour;
      render();
    }),
  );
  const pick = (bs: HTMLButtonElement[], set: (b: HTMLButtonElement) => void) =>
    bs.forEach((b) =>
      b.addEventListener("click", () => {
        set(b);
        render();
      }),
    );
  pick(inkTableBtns, (b) => (inkTable = b.dataset.inkTable === "true"));
  pick(inkFadeBtns, (b) => (inkFade = b.dataset.inkFade === "true"));
  pick(inkBtns, (b) => (ink = b.dataset.ink as Ink));
  pinKindBtns.forEach((b) =>
    b.addEventListener("click", () => {
      pinTable = b.dataset.pinTable === "true";
      render();
    }),
  );
  discSizeBtns.forEach((b) =>
    b.addEventListener("click", () => {
      discSize = Number(b.dataset.discSize);
      render();
    }),
  );
  const fogAll: FogOp[] = [{ kind: "dimSeen" }, { kind: "revealAll" }, { kind: "coverAll" }];
  fogBtns.forEach((b, i) => b.addEventListener("click", () => run({ type: "fog", op: fogAll[i]! })));

  /** V, R, H, M, P and D pick the tool; S steps through brush, outline and box. Returns whether the key was used. */
  function shortcut(key: string): boolean {
    if (!state?.map || importing) return false;
    const k = key.toLowerCase();
    if (k === "v") setTool("select");
    else if (k === "r") setTool("reveal");
    else if (k === "h") setTool("hide");
    else if (k === "m") setTool("marker");
    else if (k === "p") setTool("ping");
    else if (k === "d") setTool("draw");
    else if (k === "s") setDraw(DRAW_ORDER[(DRAW_ORDER.indexOf(drawWith) + 1) % DRAW_ORDER.length]!);
    else return false;
    return true;
  }

  const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  mapCanvas.addEventListener("keydown", (e) => {
    const m = ARROWS[e.key];
    if (!m || state?.mapLocked) return;
    e.preventDefault();
    run({ type: "moveMap", dx: m[0], dy: m[1] });
  });
  $<HTMLButtonElement>("turnMap").addEventListener("click", () => run({ type: "turnMap" }));
  $<HTMLButtonElement>("removeMap").addEventListener("click", () => run({ type: "removeMap" }));
  lockBtn.addEventListener("click", () => run({ type: "lockMap", on: !state?.mapLocked }));
  // Zoom (D-030): the mouse wheel about the pointer; + and - about the middle; Fit shows the whole map again.
  mapCanvas.addEventListener(
    "wheel",
    (e) => {
      if (!state?.map) return;
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0015), canvasPoint(e));
    },
    { passive: false },
  );
  const middle = () => ({ x: mapCanvas.clientWidth / 2, y: mapCanvas.clientHeight / 2 });
  $<HTMLButtonElement>("zoomIn").addEventListener("click", () => zoomAt(1.5, middle()));
  $<HTMLButtonElement>("zoomOut").addEventListener("click", () => zoomAt(1 / 1.5, middle()));
  $<HTMLButtonElement>("zoomFit").addEventListener("click", () => {
    [zoom, centre] = [1, null];
    render();
  });

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

/** Distance from `p` to the segment from `a` to `b`. */
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
