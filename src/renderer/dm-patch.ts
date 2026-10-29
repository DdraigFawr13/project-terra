// DM window, patch tool (D-036): paint room numbers out of the table's copy of a map. The DM's own map keeps them.
// Fill swipes over a number and fills it from its edges; Clone copies clean floor the DM tapped. The copy is saved to
// the library beside the map, and the table window's session can only load that copy from then on.
import { cloneMasked, fillMasked, snapOffset, strokeMask } from "../core/patch.ts";
import type { Point } from "../core/homography.ts";
import type { PlacedMap } from "../core/table.ts";
import type { DmApi } from "../main/dm-preload.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const patcher = $<HTMLElement>("patcher");
const scroll = $<HTMLDivElement>("patchScroll");
const canvas = $<HTMLCanvasElement>("patchCanvas");
const status = $<HTMLParagraphElement>("patchStatus");
const undoBtn = $<HTMLButtonElement>("patchUndo");
const saveBtn = $<HTMLButtonElement>("patchSave");
const modeBtns = [...document.querySelectorAll<HTMLButtonElement>("button[data-patch-mode]")];
const brushBtns = [...document.querySelectorAll<HTMLButtonElement>("button[data-patch-brush]")];
const zoomBtns = [...document.querySelectorAll<HTMLButtonElement>("button[data-patch-zoom]")];

type Mode = "fill" | "clone";
/** What a stroke changed, to put back on Undo. */
type Step = { x: number; y: number; before: ImageData };
const MAX_UNDO = 30;

/** Set up the patch tool. `onClose` redraws the map window when the tool closes. */
export function initPatch(terra: DmApi, accent: string, onClose: () => void): { open: (map: PlacedMap) => void; isOpen: () => boolean } {
  /** The table's copy being edited, at the map's full resolution. */
  let work: HTMLCanvasElement | null = null;
  let map: PlacedMap | null = null;
  let mode: Mode = "fill";
  let brushIn = 0.5;
  let zoom = 1;
  /** Clone: the clean floor the DM tapped, in picture pixels. */
  let source: Point | null = null;
  let stroke: { pointer: number; points: Point[]; offset: Point | null } | null = null;
  let undo: Step[] = [];
  let busy = false;

  const isOpen = () => !patcher.hidden;
  /** Picture pixels per screen pixel, and picture pixels per inch. */
  const scale = () => (work ? work.width / canvas.clientWidth : 1);
  const ppi = () => (work && map ? work.width / map.bounds.width : 1);

  function say(text: string): void {
    status.textContent = text;
  }

  function hint(): void {
    if (mode === "fill") say("Swipe over a room number. It fills from the floor around it.");
    else
      say(
        source
          ? "Paint over the number. It copies from whole squares away, so grid lines line up. Tap Clone again to pick other floor."
          : "Tap clean floor next to the number.",
      );
  }

  function draw(): void {
    if (!work) return;
    // Whole map: all of it in view, as wide as the card and no taller than the scroll box allows (60% of the window).
    const fit = Math.min(scroll.clientWidth / work.width, (window.innerHeight * 0.6) / work.height);
    const w = Math.round(work.width * fit * zoom);
    const h = Math.round(work.height * fit * zoom);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d")!;
    const k = (w * dpr) / work.width;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.drawImage(work, 0, 0);
    const r = (brushIn / 2) * ppi();
    if (stroke) {
      ctx.strokeStyle = mode === "fill" ? "rgba(200, 98, 63, 0.6)" : "rgba(240, 211, 168, 0.6)";
      ctx.lineWidth = r * 2;
      ctx.lineCap = ctx.lineJoin = "round";
      ctx.beginPath();
      stroke.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (stroke.points.length === 1) ctx.lineTo(stroke.points[0]!.x + 0.01, stroke.points[0]!.y);
      ctx.stroke();
    }
    if (mode === "clone" && source) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2 / k;
      ctx.beginPath();
      ctx.arc(source.x, source.y, r, 0, Math.PI * 2);
      ctx.moveTo(source.x - r * 1.5, source.y);
      ctx.lineTo(source.x + r * 1.5, source.y);
      ctx.moveTo(source.x, source.y - r * 1.5);
      ctx.lineTo(source.x, source.y + r * 1.5);
      ctx.stroke();
    }
  }

  function setPressed(btns: HTMLButtonElement[], on: (b: HTMLButtonElement) => boolean): void {
    for (const b of btns) b.setAttribute("aria-pressed", String(on(b)));
  }

  async function open(placed: PlacedMap): Promise<void> {
    map = placed;
    patcher.hidden = false;
    undo = [];
    undoBtn.disabled = true;
    source = null;
    say("Loading the map…");
    onClose();
    // Start from what the table gets now, so a second visit carries on from the last patch.
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = `terra-map://${placed.id}/table?open=${Date.now()}`;
    try {
      await img.decode();
    } catch {
      say("The map's picture couldn't be loaded.");
      return;
    }
    work = document.createElement("canvas");
    work.width = img.naturalWidth;
    work.height = img.naturalHeight;
    work.getContext("2d", { willReadFrequently: true })!.drawImage(img, 0, 0);
    hint();
    draw();
  }

  function close(): void {
    patcher.hidden = true;
    work = null;
    map = null;
    stroke = null;
    onClose();
  }

  function at(e: PointerEvent): Point {
    const r = canvas.getBoundingClientRect();
    const k = scale();
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  }

  /** Apply a finished stroke to the copy: fill or clone inside the brushed area, keeping what it covered for Undo. */
  function finish(points: Point[], offset: Point | null): void {
    if (!work) return;
    const r = (brushIn / 2) * ppi();
    // Fill reads the floor around the stroke, so take a margin of a brush width round it.
    const margin = Math.ceil(r * 2) + 2;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x0 = Math.max(0, Math.floor(Math.min(...xs) - r - margin));
    const y0 = Math.max(0, Math.floor(Math.min(...ys) - r - margin));
    const x1 = Math.min(work.width, Math.ceil(Math.max(...xs) + r + margin));
    const y1 = Math.min(work.height, Math.ceil(Math.max(...ys) + r + margin));
    if (x1 <= x0 || y1 <= y0) return;
    const ctx = work.getContext("2d", { willReadFrequently: true })!;
    // Clone reads its source from the whole picture, so its region also covers where the floor comes from.
    const dx = Math.round(offset?.x ?? 0);
    const dy = Math.round(offset?.y ?? 0);
    const sx0 = Math.max(0, Math.min(x0, x0 + dx));
    const sy0 = Math.max(0, Math.min(y0, y0 + dy));
    const sx1 = Math.min(work.width, Math.max(x1, x1 + dx));
    const sy1 = Math.min(work.height, Math.max(y1, y1 + dy));
    const region = ctx.getImageData(sx0, sy0, sx1 - sx0, sy1 - sy0);
    const before = new ImageData(new Uint8ClampedArray(region.data), region.width, region.height);
    const local = points.map((p) => ({ x: p.x - sx0, y: p.y - sy0 }));
    const { mask, rect } = strokeMask(region.width, region.height, local, r);
    const px = { width: region.width, height: region.height, data: region.data };
    if (offset) cloneMasked(px, mask, rect, { x: dx, y: dy });
    else fillMasked(px, mask);
    ctx.putImageData(region, sx0, sy0);
    undo.push({ x: sx0, y: sy0, before });
    if (undo.length > MAX_UNDO) undo.shift();
    undoBtn.disabled = false;
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (!work || stroke || busy || e.button > 0) return;
    const p = at(e);
    if (mode === "clone" && !source) {
      source = p;
      hint();
      draw();
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    // Each clone stroke starts copying from the picked floor, wherever the stroke starts, in whole squares.
    const offset = mode === "clone" && source ? snapOffset({ x: source.x - p.x, y: source.y - p.y }, ppi()) : null;
    stroke = { pointer: e.pointerId, points: [p], offset };
    draw();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!stroke || e.pointerId !== stroke.pointer) return;
    stroke.points.push(at(e));
    draw();
  });
  const end = (e: PointerEvent) => {
    if (!stroke || e.pointerId !== stroke.pointer) return;
    const s = stroke;
    stroke = null;
    if (e.type === "pointerup") finish(s.points, s.offset);
    draw();
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  for (const b of modeBtns)
    b.addEventListener("click", () => {
      mode = b.dataset.patchMode as Mode;
      // Tapping Clone again picks other floor.
      source = null;
      setPressed(modeBtns, (x) => x === b);
      hint();
      draw();
    });
  for (const b of brushBtns)
    b.addEventListener("click", () => {
      brushIn = Number(b.dataset.patchBrush);
      setPressed(brushBtns, (x) => x === b);
      draw();
    });
  for (const b of zoomBtns)
    b.addEventListener("click", () => {
      // Keep the middle of what's in view in the middle.
      const cx = (scroll.scrollLeft + scroll.clientWidth / 2) / canvas.clientWidth;
      const cy = (scroll.scrollTop + scroll.clientHeight / 2) / canvas.clientHeight;
      zoom = Number(b.dataset.patchZoom);
      setPressed(zoomBtns, (x) => x === b);
      draw();
      scroll.scrollLeft = cx * canvas.clientWidth - scroll.clientWidth / 2;
      scroll.scrollTop = cy * canvas.clientHeight - scroll.clientHeight / 2;
    });
  undoBtn.addEventListener("click", () => {
    const step = undo.pop();
    if (!step || !work) return;
    work.getContext("2d")!.putImageData(step.before, step.x, step.y);
    undoBtn.disabled = !undo.length;
    draw();
  });

  async function store(png: Uint8Array | null): Promise<void> {
    if (!map || busy) return;
    busy = true;
    say("Saving…");
    try {
      await terra.savePatch(map.id, png);
      close();
    } catch (e) {
      say(`The patch couldn't be saved: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busy = false;
    }
  }
  saveBtn.addEventListener("click", async () => {
    if (!work) return;
    const blob = await new Promise<Blob | null>((r) => work!.toBlob(r, "image/png"));
    if (blob) await store(new Uint8Array(await blob.arrayBuffer()));
  });
  $<HTMLButtonElement>("patchRemove").addEventListener("click", () => void store(null));
  $<HTMLButtonElement>("patchCancel").addEventListener("click", close);
  window.addEventListener("resize", draw);

  return { open: (m) => void open(m), isOpen };
}
