// Drawing traced walls, pillars, openings, rooms and areas (D-044) on the DM's canvases: the walls editor and the DM map's walls
// switch. DM-only: the table window never imports this or gets the data (D-002).
import type { Annotation, Material, OpeningKind } from "../core/annotation.ts";
import type { Point } from "../core/homography.ts";

/** Colour and dash per opening kind, so each reads apart at a glance on dark and light maps. */
export const OPENING_STYLE: Record<OpeningKind, { colour: string; dash: number[]; label: string }> = {
  door: { colour: "#e0873c", dash: [], label: "Door" },
  secret: { colour: "#c77dde", dash: [0.2, 0.12], label: "Secret door" },
  window: { colour: "#6cc4e8", dash: [0.12, 0.08], label: "Window" },
  opening: { colour: "#b9c2a3", dash: [0.05, 0.12], label: "Opening" },
};
const WALL = "#ffd36b";
const HALO = "rgba(12, 8, 6, 0.85)";
const ROOM = "rgba(255, 211, 107, 0.12)";
const PICKED = "rgba(255, 211, 107, 0.3)";
/** Each material's tint, and its word for labels and the editor's buttons. */
export const MATERIAL_STYLE: Record<Material, { colour: string; label: string }> = {
  stone: { colour: "#a9a69c", label: "Stone" },
  wood: { colour: "#c0884e", label: "Wood" },
  earth: { colour: "#94704b", label: "Earth" },
  grass: { colour: "#79b85a", label: "Grass" },
  water: { colour: "#4f93d6", label: "Water" },
  ice: { colour: "#bfe7f4", label: "Ice" },
};
/** Difficult terrain: diagonal hatching in a warning colour. */
const DIFFICULT = "#ff8a5c";

/** The room or area picked in the editor, drawn brighter. */
export type Picked = { kind: "room" | "area"; i: number } | null;

function outlinePath(ctx: CanvasRenderingContext2D, ps: readonly Point[]): void {
  ctx.beginPath();
  ps.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

/** Areas (D-044 item 7): a tint for the material, hatching for difficult terrain, and a dashed edge. */
function drawAreas(ctx: CanvasRenderingContext2D, a: Annotation, px: number, picked: Picked): void {
  a.areas.forEach((area, i) => {
    const colour = area.material ? MATERIAL_STYLE[area.material].colour : DIFFICULT;
    outlinePath(ctx, area.outline);
    if (area.material) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (area.difficult) {
      ctx.save();
      ctx.clip();
      const xs = area.outline.map((p) => p.x);
      const ys = area.outline.map((p) => p.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      ctx.strokeStyle = DIFFICULT;
      ctx.lineWidth = 1.5 / px;
      ctx.beginPath();
      for (let d = x0 - (y1 - y0); d < x1; d += 0.25) {
        ctx.moveTo(d, y1);
        ctx.lineTo(d + (y1 - y0), y0);
      }
      ctx.stroke();
      ctx.restore();
      outlinePath(ctx, area.outline);
    }
    const on = picked?.kind === "area" && picked.i === i;
    ctx.strokeStyle = colour;
    ctx.lineWidth = (on ? 3.5 : 2) / px;
    ctx.setLineDash(on ? [] : [6 / px, 4 / px]);
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

/**
 * Draw an annotation on a context already set to map inches. `px` is screen pixels per inch, so lines keep the same
 * width on screen at any zoom. `faint` draws thinner, for the DM map during play. Rooms are a light wash with their
 * name in the middle, areas a tint or hatching; `picked` is what the editor has picked.
 */
export function drawWalls(ctx: CanvasRenderingContext2D, a: Annotation, px: number, faint = false, picked: Picked = null): void {
  const w = (faint ? 2.5 : 3.5) / px;
  ctx.save();
  a.rooms.forEach((room, i) => {
    ctx.fillStyle = picked?.kind === "room" && picked.i === i ? PICKED : ROOM;
    outlinePath(ctx, room.outline);
    ctx.fill();
  });
  drawAreas(ctx, a, px, picked);
  ctx.lineCap = ctx.lineJoin = "round";
  // A dark halo under every line keeps it readable over any art.
  for (const pass of ["halo", "line"] as const) {
    const halo = pass === "halo";
    ctx.lineWidth = halo ? w + 3 / px : w;
    ctx.setLineDash([]);
    ctx.strokeStyle = halo ? HALO : WALL;
    ctx.beginPath();
    for (const wall of a.walls) {
      wall.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (wall.closed) ctx.closePath();
    }
    for (const c of a.pillars) {
      ctx.moveTo(c.at.x + c.r, c.at.y);
      ctx.arc(c.at.x, c.at.y, c.r, 0, Math.PI * 2);
    }
    ctx.stroke();
    for (const o of a.openings) {
      const style = OPENING_STYLE[o.kind];
      ctx.strokeStyle = halo ? HALO : style.colour;
      ctx.lineWidth = halo ? w * 1.6 + 3 / px : w * 1.6;
      ctx.setLineDash(halo ? [] : style.dash);
      ctx.beginPath();
      ctx.moveTo(o.a.x, o.a.y);
      ctx.lineTo(o.b.x, o.b.y);
      ctx.stroke();
    }
  }
  // Room names over everything, at a size that reads at any zoom, centred on the room's corners.
  ctx.font = `700 ${14 / px}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3 / px;
  ctx.strokeStyle = HALO;
  ctx.fillStyle = WALL;
  for (const room of a.rooms) {
    const x = room.outline.reduce((s, p) => s + p.x, 0) / room.outline.length;
    const y = room.outline.reduce((s, p) => s + p.y, 0) / room.outline.length;
    // The material goes under the name, in the editor only: the DM map stays quiet during play.
    const lines = [room.name, !faint && room.material ? MATERIAL_STYLE[room.material].label.toLowerCase() : ""].filter(Boolean);
    lines.forEach((text, n) => {
      const ty = y + (n - (lines.length - 1) / 2) * (16 / px);
      ctx.strokeText(text, x, ty);
      ctx.fillText(text, x, ty);
    });
  }
  if (!faint) {
    // Corners as small dots, so the DM can see where a new line will join.
    ctx.fillStyle = WALL;
    const r = 3 / px;
    ctx.beginPath();
    for (const wall of a.walls)
      for (const p of wall.points) {
        ctx.moveTo(p.x + r, p.y);
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      }
    ctx.fill();
  }
  ctx.restore();
}
