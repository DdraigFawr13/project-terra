// Draws a map with its fog (D-025), for the table window, the DM's table preview and the DM's map view. The fog list
// is replayed into two masks, seen and explored, at a modest resolution in the map's own inches; the map image itself
// keeps its full detail. Both windows use this one file, so the preview can't drift from the table.
import type { FogOp, FogShape } from "../core/fog.ts";
import type { Bounds } from "../core/map.ts";

/** Mask pixels per inch. Soft edges a twentieth of an inch wide don't show on a projector. */
const MASK_PPI = 24;
const MAX_MASK_SIDE = 4096;
/** Hatching on explored-but-not-seen areas (D-023): a line every half inch. */
const HATCH_IN = 0.5;

type Canvas = OffscreenCanvas;
type Ctx = OffscreenCanvasRenderingContext2D;
/** A rectangle of mask pixels. */
type Rect = { x: number; y: number; w: number; h: number };

const union = (a: Rect | null, b: Rect): Rect => {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/** How a look draws: the table hides what players haven't seen; the DM sees through fog, dimmed. */
export type FogLook = "table" | "dm";

export class FogPainter {
  private bounds: Bounds | null = null;
  private ppi = MASK_PPI;
  private seen: Canvas | null = null;
  private explored: Canvas | null = null;
  /** How many ops the masks hold, and the last of them as text, to tell an added op from an undo or a fresh list. */
  private done = 0;
  private lastOp = "";
  /** The latest op's area and the op before it, so the usual undo (of that op) replays only that area. */
  private latest: { area: Rect; lastOp: string } | null = null;
  /** Layers built from the masks, each with the part that changed since it was last brought up to date. */
  private layers = new Map<string, { canvas: Canvas; dirty: Rect | null }>();

  /** Bring the masks up to date with the fog list: draw only the new ops when the list has grown. */
  private sync(bounds: Bounds, fog: readonly FogOp[]): void {
    const sameBounds =
      this.bounds &&
      this.bounds.x === bounds.x &&
      this.bounds.y === bounds.y &&
      this.bounds.width === bounds.width &&
      this.bounds.height === bounds.height;
    const grown = sameBounds && fog.length >= this.done && (this.done === 0 || JSON.stringify(fog[this.done - 1]) === this.lastOp);
    if (grown && fog.length === this.done) return;
    const undone = this.latest;
    if (sameBounds && undone && fog.length === this.done - 1 && (fog.length ? JSON.stringify(fog[fog.length - 1]) : "") === undone.lastOp) {
      // Undo of the latest op: replay the list again, but only inside the area that op covered.
      const a = undone.area;
      const masks = [this.inches(this.seen!), this.inches(this.explored!)];
      for (const ctx of masks) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.beginPath();
        ctx.rect(a.x, a.y, a.w, a.h);
        ctx.clip();
        ctx.clearRect(a.x, a.y, a.w, a.h);
        ctx.setTransform(this.ppi, 0, 0, this.ppi, -bounds.x * this.ppi, -bounds.y * this.ppi);
      }
      for (const op of fog) paint(op, masks[0]!, masks[1]!, bounds);
      for (const ctx of masks) ctx.restore();
      this.done = fog.length;
      this.lastOp = undone.lastOp;
      this.latest = null;
      for (const l of this.layers.values()) l.dirty = union(l.dirty, a);
      return;
    }
    if (!grown) {
      this.bounds = { ...bounds };
      this.ppi = Math.min(MASK_PPI, MAX_MASK_SIDE / Math.max(bounds.width, bounds.height));
      const w = Math.max(1, Math.round(bounds.width * this.ppi));
      const h = Math.max(1, Math.round(bounds.height * this.ppi));
      this.seen = new OffscreenCanvas(w, h);
      this.explored = new OffscreenCanvas(w, h);
      this.done = 0;
    }
    const seen = this.inches(this.seen!);
    const explored = this.inches(this.explored!);
    let changed: Rect | null = null;
    const adding = fog.slice(this.done);
    this.latest = grown && adding.length === 1 ? { area: this.area(adding[0]!), lastOp: this.lastOp } : null;
    for (const op of adding) {
      paint(op, seen, explored, bounds);
      changed = union(changed, this.area(op));
    }
    this.done = fog.length;
    this.lastOp = fog.length ? JSON.stringify(fog[fog.length - 1]) : "";
    // New masks need new layers; an added op only redraws its own patch of each layer.
    if (!grown) this.layers.clear();
    else for (const l of this.layers.values()) l.dirty = union(l.dirty, changed!);
  }

  /** The mask pixels an op can change, with a pixel to spare for soft edges. */
  private area(op: FogOp): Rect {
    const all = { x: 0, y: 0, w: this.seen!.width, h: this.seen!.height };
    if (!("mode" in op)) return all;
    const pts = op.kind === "box" ? [op, { x: op.x + op.width, y: op.y + op.height }] : op.points;
    const pad = op.kind === "brush" ? op.r : 0;
    const k = this.ppi;
    const x0 = Math.floor((Math.min(...pts.map((p) => p.x)) - pad - this.bounds!.x) * k) - 2;
    const y0 = Math.floor((Math.min(...pts.map((p) => p.y)) - pad - this.bounds!.y) * k) - 2;
    const x1 = Math.ceil((Math.max(...pts.map((p) => p.x)) + pad - this.bounds!.x) * k) + 2;
    const y1 = Math.ceil((Math.max(...pts.map((p) => p.y)) + pad - this.bounds!.y) * k) + 2;
    // Kept within the masks, and at least a pixel, so a stroke past the map's edge stays a valid area.
    const x = Math.max(0, Math.min(all.w - 1, x0));
    const y = Math.max(0, Math.min(all.h - 1, y0));
    return { x, y, w: Math.max(1, Math.min(all.w, x1) - x), h: Math.max(1, Math.min(all.h, y1) - y) };
  }

  /** A mask's context set up to draw in map inches. */
  private inches(c: Canvas): Ctx {
    const ctx = c.getContext("2d")!;
    ctx.setTransform(this.ppi, 0, 0, this.ppi, -this.bounds!.x * this.ppi, -this.bounds!.y * this.ppi);
    return ctx;
  }

  /** A mask-sized layer: `build` paints it and cuts it by the masks. After a fog change only the changed patch is rebuilt. */
  private layer(name: string, build: (ctx: Ctx, w: number, h: number) => void): Canvas {
    let l = this.layers.get(name);
    if (!l) {
      l = { canvas: new OffscreenCanvas(this.seen!.width, this.seen!.height), dirty: null };
      build(l.canvas.getContext("2d")!, l.canvas.width, l.canvas.height);
      this.layers.set(name, l);
    } else if (l.dirty) {
      const ctx = l.canvas.getContext("2d")!;
      const d = l.dirty;
      ctx.save();
      ctx.beginPath();
      ctx.rect(d.x, d.y, d.w, d.h);
      ctx.clip();
      ctx.clearRect(d.x, d.y, d.w, d.h);
      build(ctx, l.canvas.width, l.canvas.height);
      ctx.restore();
      l.dirty = null;
    }
    return l.canvas;
  }

  /** Cut a layer to (explored or everything) minus seen, or to never explored. */
  private cut(ctx: Ctx, keep: "notSeen" | "exploredNotSeen" | "unexplored"): void {
    if (keep === "exploredNotSeen") {
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(this.explored!, 0, 0);
    }
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(keep === "unexplored" ? this.explored! : this.seen!, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }

  private hatch(ctx: Ctx, w: number, h: number, style: string): void {
    const step = HATCH_IN * this.ppi;
    ctx.strokeStyle = style;
    ctx.lineWidth = Math.max(1, this.ppi / 12);
    ctx.beginPath();
    for (let d = -h; d < w; d += step) (ctx.moveTo(d, h), ctx.lineTo(d + h, 0));
    ctx.stroke();
  }

  /**
   * Draw the map image and its fog. `ctx` must already be set up in map inches (placed and turned), so the fog turns
   * with the map.
   */
  draw(ctx: CanvasRenderingContext2D, img: CanvasImageSource, bounds: Bounds, fog: readonly FogOp[], look: FogLook): void {
    this.sync(bounds, fog);
    const { x, y, width, height } = bounds;
    ctx.drawImage(img, x, y, width, height);
    if (look === "table") {
      // Explored but not seen now: the map in grey, darkened, with lines over it. Never explored: black.
      const grey = this.layer("grey", (c, w, h) => {
        c.fillStyle = "#808080";
        c.fillRect(0, 0, w, h);
        this.cut(c, "exploredNotSeen");
      });
      const dim = this.layer("dim", (c, w, h) => {
        c.fillStyle = "rgba(0, 0, 0, 0.55)";
        c.fillRect(0, 0, w, h);
        this.hatch(c, w, h, "rgba(255, 255, 255, 0.28)");
        this.cut(c, "exploredNotSeen");
      });
      const black = this.layer("black", (c, w, h) => {
        c.fillStyle = "#000";
        c.fillRect(0, 0, w, h);
        this.cut(c, "unexplored");
      });
      ctx.save();
      ctx.globalCompositeOperation = "saturation";
      ctx.drawImage(grey, x, y, width, height);
      ctx.restore();
      ctx.drawImage(dim, x, y, width, height);
      ctx.drawImage(black, x, y, width, height);
    } else {
      // The DM sees the whole map: a tint where players can't see now, darker where they've never been.
      const notSeen = this.layer("dmNotSeen", (c, w, h) => {
        c.fillStyle = "rgba(0, 0, 0, 0.4)";
        c.fillRect(0, 0, w, h);
        this.cut(c, "notSeen");
      });
      const never = this.layer("dmNever", (c, w, h) => {
        c.fillStyle = "rgba(0, 0, 0, 0.3)";
        c.fillRect(0, 0, w, h);
        this.cut(c, "unexplored");
      });
      ctx.drawImage(notSeen, x, y, width, height);
      ctx.drawImage(never, x, y, width, height);
    }
  }
}

/** Fill an op's area in map inches: brush strokes as thick round lines, the rest even-odd (the rule `fogAt` uses). */
export function fillFog(ctx: CanvasRenderingContext2D | Ctx, op: FogShape): void {
  ctx.beginPath();
  if (op.kind === "brush") {
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.lineWidth = op.r * 2;
    op.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (op.points.length === 1) ctx.lineTo(op.points[0]!.x + 0.001, op.points[0]!.y);
    ctx.stroke();
    return;
  }
  if (op.kind === "box") ctx.rect(op.x, op.y, op.width, op.height);
  else op.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill("evenodd");
}

function paint(op: FogOp, seen: Ctx, explored: Ctx, b: Bounds): void {
  const all = (ctx: Ctx, on: boolean) => (on ? ctx.fillRect(b.x, b.y, b.width, b.height) : ctx.clearRect(b.x, b.y, b.width, b.height));
  for (const ctx of [seen, explored]) ctx.fillStyle = ctx.strokeStyle = "#fff";
  switch (op.kind) {
    case "revealAll":
      return (all(seen, true), all(explored, true));
    case "coverAll":
      return (all(seen, false), all(explored, false));
    case "dimSeen":
      return all(seen, false);
  }
  if (op.mode === "reveal") {
    fillFog(seen, op);
    fillFog(explored, op);
  } else {
    seen.globalCompositeOperation = "destination-out";
    fillFog(seen, op);
    seen.globalCompositeOperation = "source-over";
  }
}
