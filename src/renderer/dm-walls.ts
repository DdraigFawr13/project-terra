// DM window, walls editor (D-044 steps 2A and 2C): trace walls, pillars, openings and rooms on a library map in the whole window,
// with Cancel and Done (like import, D-038). Pen first: the pen or mouse draws, a finger pans, and a magnifier shows
// where the pen lands. What is traced is saved beside the map in the library and never reaches the table (D-002).
import {
  addFreehand,
  addOpening,
  addPillar,
  addWall,
  countOf,
  emptyAnnotation,
  eraseAt,
  placePoint,
  snapPoint,
  type Annotation,
  type OpeningKind,
} from "../core/annotation.ts";
import type { Point } from "../core/homography.ts";
import { addRoom, findRoom, nextRoomName, removeRoom, renameRoom, roomAt } from "../core/rooms.ts";
import type { LibraryMap } from "../main/library.ts";
import type { DmApi } from "../main/dm-preload.ts";
import { drawWalls, OPENING_STYLE } from "./walls-draw.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const card = $<HTMLElement>("walls");
const scroll = $<HTMLDivElement>("wallsScroll");
const canvas = $<HTMLCanvasElement>("wallsCanvas");
const status = $<HTMLParagraphElement>("wallsStatus");
const count = $<HTMLParagraphElement>("wallsCount");
const heading = $<HTMLHeadingElement>("walls-heading");
const undoBtn = $<HTMLButtonElement>("wallsUndo");
const finishBtn = $<HTMLButtonElement>("wallsFinish");
const doneBtn = $<HTMLButtonElement>("wallsDone");
const cancelBtn = $<HTMLButtonElement>("wallsCancel");
const toolBtns = [...document.querySelectorAll<HTMLButtonElement>("button[data-walls-tool]")];
const zoomBtns = [...document.querySelectorAll<HTMLButtonElement>("button[data-walls-zoom]")];
const roomNameBox = $<HTMLLabelElement>("roomNameBox");
const roomName = $<HTMLInputElement>("roomName");

/** A library map, or the placed map, which carries the same id, name and extent. */
type WallsMap = Pick<LibraryMap, "id" | "name" | "bounds">;
type Tool = "wall" | "freehand" | "pillar" | OpeningKind | "room" | "erase";
const MAX_UNDO = 200;
/** How far, in screen pixels, a tap reaches to join a corner or rub something out: a pen tip is not a pixel. */
const REACH_PX = 14;
/** A pillar tapped without dragging: a 1-inch trunk. */
const TAP_PILLAR_IN = 0.5;

const HINTS: Record<Tool, string> = {
  wall: "Tap each corner. Tap the first corner to close a room, or tap the last one again (or Finish line) to stop.",
  freehand: "Draw along a cave wall. It is smoothed into straight pieces; ends near a corner join it.",
  pillar: "Tap the middle of a pillar, boulder or trunk, and drag out to its edge. A tap alone makes a 1-inch one.",
  door: "Drag across the doorway, from one side of the wall to the other.",
  secret: "Drag across where the secret door is. On the table it looks like wall.",
  window: "Drag along the window. A window blocks nothing by default (D-040).",
  opening: "Drag across an arch or broken wall: it closes a room but blocks nothing.",
  room: "Tap inside a room closed by walls, doors and openings. Tap a room to rename it.",
  erase: "Tap a line or pillar to rub it out, or the inside of a room to forget the room. A long wall loses only the piece you tap.",
};

/** Set up the walls editor. `onClose(id)` tells the DM map which map's walls may have changed. */
export function initWalls(terra: DmApi, accent: string, onClose: (id: string | null) => void) {
  let map: WallsMap | null = null;
  let img: HTMLImageElement | null = null;
  let ann: Annotation = emptyAnnotation();
  let undo: Annotation[] = [];
  let changed = false;
  let tool: Tool = "wall";
  let zoom = 1;
  /** The run of wall, or the room outline, being tapped out. */
  let draft: Point[] = [];
  /** The room whose name the name box shows, or -1. */
  let picked = -1;
  /** What the pen is doing now: drawing freehand, dragging a pillar or an opening. Map inches. */
  let press: { pointer: number; from: Point; points: Point[] } | null = null;
  /** Where the pen or mouse is, for the line to the next corner and the magnifier. Map inches. */
  let hover: Point | null = null;
  let pan: { pointer: number; x: number; y: number } | null = null;
  let cancelArmed = false;
  let busy = false;

  const isOpen = () => !card.hidden;
  /** Screen pixels per map inch. */
  const pxPerIn = () => (map ? canvas.clientWidth / map.bounds.width : 1);
  const reach = () => REACH_PX / pxPerIn();

  function say(text: string): void {
    status.textContent = text;
  }

  function showCount(): void {
    const c = countOf(ann);
    count.textContent = `${c.walls} wall ${c.walls === 1 ? "piece" : "pieces"}, ${c.pillars} ${c.pillars === 1 ? "pillar" : "pillars"}, ${c.openings} ${c.openings === 1 ? "opening" : "openings"}, ${c.rooms} ${c.rooms === 1 ? "room" : "rooms"}${changed ? " · not saved yet" : ""}`;
  }

  function commit(next: Annotation): void {
    if (next === ann) return;
    undo.push(ann);
    if (undo.length > MAX_UNDO) undo.shift();
    ann = next;
    changed = true;
    cancelArmed = false;
    undoBtn.disabled = false;
    showCount();
  }

  /** Show the name box for a room, or hide it (-1). */
  function pick(i: number): void {
    picked = i;
    roomNameBox.hidden = i < 0;
    if (i >= 0) roomName.value = ann.rooms[i]?.name ?? "";
  }

  /** Add a room from an outline, named with the next free number, and show its name box. */
  function keepRoom(outline: Point[]): void {
    const next = addRoom(ann, outline, nextRoomName(ann));
    if (!next) return say("A room can't overlap another room. Rub out the other room first, or draw inside the gap.");
    commit(next);
    pick(ann.rooms.length - 1);
    say(`Room ${ann.rooms.at(-1)!.name} added. Change its name above, or tap inside the next room.`);
  }

  /** End the run being tapped out, keeping it if it has a piece; a room outline needs three corners. */
  function finishDraft(): void {
    if (tool === "room") {
      if (draft.length >= 3) keepRoom(draft);
    } else if (draft.length >= 2) commit(addWall(ann, draft));
    draft = [];
    finishBtn.disabled = true;
    draw();
  }

  function at(e: PointerEvent): Point {
    const r = canvas.getBoundingClientRect();
    const b = map!.bounds;
    return { x: b.x + ((e.clientX - r.left) / r.width) * b.width, y: b.y + ((e.clientY - r.top) / r.height) * b.height };
  }

  function draw(): void {
    if (!map || !img) return;
    const b = map.bounds;
    const fit = Math.min(scroll.clientWidth / b.width, scroll.clientHeight / b.height);
    const w = Math.round(b.width * fit * zoom);
    const h = Math.round(b.height * fit * zoom);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d")!;
    const k = (w / b.width) * dpr;
    ctx.setTransform(k, 0, 0, k, -b.x * k, -b.y * k);
    ctx.drawImage(img, b.x, b.y, b.width, b.height);
    const px = w / b.width;
    drawWalls(ctx, ann, px, false, picked);
    drawPending(ctx, px);
    if (press || (hover && draft.length)) drawLoupe(ctx, k, dpr);
  }

  /** What isn't committed yet: the run being tapped out, a freehand line, a pillar or opening being dragged. */
  function drawPending(ctx: CanvasRenderingContext2D, px: number): void {
    ctx.save();
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.lineWidth = 3 / px;
    ctx.strokeStyle = accent;
    ctx.setLineDash([6 / px, 4 / px]);
    ctx.beginPath();
    if (draft.length) {
      draft.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (hover) {
        const next = placePoint(ann, hover, reach(), draft);
        ctx.lineTo(next.x, next.y);
      }
    }
    if (press && tool === "freehand") press.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (press && tool === "pillar" && hover) {
      const r = Math.max(0.125, Math.hypot(hover.x - press.from.x, hover.y - press.from.y));
      ctx.moveTo(press.from.x + r, press.from.y);
      ctx.arc(press.from.x, press.from.y, r, 0, Math.PI * 2);
    }
    if (press && tool in OPENING_STYLE && hover) {
      const end = placePoint(ann, hover, reach());
      ctx.strokeStyle = OPENING_STYLE[tool as OpeningKind].colour;
      ctx.moveTo(press.from.x, press.from.y);
      ctx.lineTo(end.x, end.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // Where the next tap lands.
    if (hover && (tool === "wall" || tool in OPENING_STYLE || (tool === "room" && draft.length))) {
      const p = placePoint(ann, hover, reach(), draft);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 / px, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** A magnifier above the pen (below it near the top), so the pen tip doesn't hide where the corner lands (D-036). */
  function drawLoupe(ctx: CanvasRenderingContext2D, k: number, dpr: number): void {
    if (!hover || !img || !map) return;
    const R = 64 * dpr;
    const ZOOM = 3;
    const sx = (hover.x - map.bounds.x) * k;
    const sy = (hover.y - map.bounds.y) * k;
    const cy = sy - 2 * R - 40 * dpr > 0 ? sy - R - 40 * dpr : sy + R + 40 * dpr;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.arc(sx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#000";
    ctx.fill();
    const kk = k * ZOOM;
    ctx.setTransform(kk, 0, 0, kk, sx - hover.x * kk, cy - hover.y * kk);
    ctx.drawImage(img, map.bounds.x, map.bounds.y, map.bounds.width, map.bounds.height);
    const px = kk / dpr;
    drawWalls(ctx, ann, px, false, picked);
    drawPending(ctx, px);
    ctx.restore();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(sx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function setTool(t: Tool): void {
    finishDraft();
    tool = t;
    if (t !== "room") pick(-1);
    for (const b of toolBtns) b.setAttribute("aria-pressed", String(b.dataset.wallsTool === t));
    say(HINTS[t]);
    draw();
  }

  async function open(m: WallsMap): Promise<void> {
    map = m;
    card.hidden = false;
    heading.textContent = `Walls: ${m.name}`;
    undo = [];
    draft = [];
    pick(-1);
    changed = false;
    cancelArmed = false;
    undoBtn.disabled = true;
    finishBtn.disabled = true;
    say("Loading the map…");
    onClose(null);
    const pic = new Image();
    pic.src = `terra-map://${m.id}/?walls=${Date.now()}`;
    try {
      [ann] = await Promise.all([terra.loadWalls(m.id), pic.decode()]);
    } catch {
      say("The map or its walls couldn't be loaded.");
      return;
    }
    img = pic;
    showCount();
    setTool(tool);
  }

  function close(): void {
    const id = map?.id ?? null;
    card.hidden = true;
    map = null;
    img = null;
    press = null;
    hover = null;
    onClose(id);
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (!map || !img || busy || e.button > 0) return;
    canvas.setPointerCapture(e.pointerId);
    // A finger pans; the pen and the mouse draw (D-044).
    if (e.pointerType === "touch") {
      pan = { pointer: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    if (press) return;
    const p = at(e);
    hover = p;
    const from = tool === "pillar" ? snapPoint(p) : tool in OPENING_STYLE ? placePoint(ann, p, reach()) : p;
    press = { pointer: e.pointerId, from, points: [p] };
    draw();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pan && e.pointerId === pan.pointer) {
      scroll.scrollLeft -= e.clientX - pan.x;
      scroll.scrollTop -= e.clientY - pan.y;
      pan = { ...pan, x: e.clientX, y: e.clientY };
      return;
    }
    if (!map || e.pointerType === "touch") return;
    hover = at(e);
    if (press && e.pointerId === press.pointer) press.points.push(hover);
    draw();
  });
  canvas.addEventListener("pointerleave", (e) => {
    if (e.pointerType !== "touch" && !press) {
      hover = null;
      draw();
    }
  });
  const end = (e: PointerEvent) => {
    if (pan && e.pointerId === pan.pointer) pan = null;
    if (!press || e.pointerId !== press.pointer || !map) return;
    const s = press;
    press = null;
    if (e.type === "pointerup") release(s, at(e));
    draw();
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  /** The pen lifted at `p` after pressing at `s.from`. */
  function release(s: { from: Point; points: Point[] }, p: Point): void {
    if (tool === "wall") {
      const q = placePoint(ann, p, reach(), draft);
      const last = draft.at(-1);
      if (last && last.x === q.x && last.y === q.y) return finishDraft();
      draft.push(q);
      finishBtn.disabled = draft.length < 2;
      const first = draft[0]!;
      if (draft.length > 3 && first.x === q.x && first.y === q.y) finishDraft();
    } else if (tool === "room") placeRoom(p);
    else if (tool === "freehand") commit(addFreehand(ann, s.points));
    else if (tool === "pillar") {
      const r = Math.hypot(p.x - s.from.x, p.y - s.from.y);
      commit(addPillar(ann, s.from, r < reach() ? TAP_PILLAR_IN : r));
    } else if (tool === "erase") {
      const next = eraseAt(ann, p, reach());
      const room = roomAt(ann, p);
      if (next !== ann) commit(next);
      else if (room >= 0) {
        say(`Room ${ann.rooms[room]!.name} forgotten. Its walls stay.`);
        commit(removeRoom(ann, room));
      } else say("Nothing to rub out there. Tap right on a line or a pillar's edge.");
    } else {
      const to = placePoint(ann, p, reach());
      const next = addOpening(ann, tool, s.from, to);
      if (next === ann) say("Drag across the gap, from one side to the other.");
      else commit(next);
    }
  }

  /**
   * A tap with Room: inside a room, pick it to rename; inside walls, find the room there; where the walls leak, start
   * an outline instead, tapped corner by corner and closed on its first corner (D-044 item 6).
   */
  function placeRoom(p: Point): void {
    if (draft.length) {
      const q = placePoint(ann, p, reach(), draft);
      const first = draft[0]!;
      if (draft.length >= 3 && first.x === q.x && first.y === q.y) return finishDraft();
      draft.push(q);
      finishBtn.disabled = draft.length < 3;
      return;
    }
    const inside = roomAt(ann, p);
    if (inside >= 0) {
      pick(inside);
      return say(`Room ${ann.rooms[inside]!.name}: change its name above. Rub out forgets a room.`);
    }
    const found = findRoom(ann, map!.bounds, p);
    if ("outline" in found) return keepRoom(found.outline);
    if (found.error === "wall") return say("That's on a line. Tap inside the room.");
    draft = [placePoint(ann, p, reach())];
    say(
      "That area isn't closed: there's a gap, or it reaches the map's edge. Tap its corners to draw the room, and tap the first corner to close it.",
    );
  }
  roomName.addEventListener("change", () => {
    if (picked < 0 || !ann.rooms[picked]) return;
    const next = renameRoom(ann, picked, roomName.value);
    if (next.rooms[picked]!.name !== ann.rooms[picked]!.name) commit(next);
    roomName.value = ann.rooms[picked]!.name;
    draw();
  });
  // Enter in the name box keeps the name and goes back to the map.
  roomName.addEventListener("keydown", (e) => e.key === "Enter" && roomName.blur());

  for (const b of toolBtns) b.addEventListener("click", () => setTool(b.dataset.wallsTool as Tool));
  for (const b of zoomBtns)
    b.addEventListener("click", () => {
      // Keep the middle of what's in view in the middle.
      const cx = (scroll.scrollLeft + scroll.clientWidth / 2) / canvas.clientWidth;
      const cy = (scroll.scrollTop + scroll.clientHeight / 2) / canvas.clientHeight;
      zoom = Number(b.dataset.wallsZoom);
      for (const z of zoomBtns) z.setAttribute("aria-pressed", String(z === b));
      draw();
      scroll.scrollLeft = cx * canvas.clientWidth - scroll.clientWidth / 2;
      scroll.scrollTop = cy * canvas.clientHeight - scroll.clientHeight / 2;
    });
  finishBtn.addEventListener("click", finishDraft);
  function stepBack(): void {
    // A run being tapped out loses its last corner first.
    if (draft.length) {
      draft.pop();
      finishBtn.disabled = draft.length < 2;
      return draw();
    }
    const prev = undo.pop();
    if (!prev) return;
    ann = prev;
    pick(-1);
    changed = true;
    undoBtn.disabled = !undo.length;
    showCount();
    draw();
  }
  undoBtn.addEventListener("click", stepBack);
  document.addEventListener("keydown", (e) => {
    // Typing a room's name keeps the box's own Ctrl+Z.
    if (!isOpen() || e.target === roomName) return;
    if (e.key === "Escape") finishDraft();
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      stepBack();
    }
  });
  doneBtn.addEventListener("click", async () => {
    if (!map || busy) return;
    finishDraft();
    busy = true;
    say("Saving…");
    try {
      if (changed) await terra.saveWalls(map.id, ann);
      close();
    } catch (e) {
      say(`The walls couldn't be saved: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busy = false;
    }
  });
  cancelBtn.addEventListener("click", () => {
    // Tracing a map takes a while, so throwing it away takes a second tap.
    if ((changed || draft.length) && !cancelArmed) {
      cancelArmed = true;
      return say("Tap Cancel again to throw away what you traced since opening. Done keeps it.");
    }
    close();
  });
  window.addEventListener("resize", () => isOpen() && draw());

  return { open: (m: WallsMap) => void open(m), isOpen };
}
