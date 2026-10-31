// Drawing traced walls, pillars, openings and rooms (D-044) on the DM's canvases: the walls editor and the DM map's walls
// switch. DM-only: the table window never imports this or gets the data (D-002).
import type { Annotation, OpeningKind } from "../core/annotation.ts";

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

/**
 * Draw an annotation on a context already set to map inches. `px` is screen pixels per inch, so lines keep the same
 * width on screen at any zoom. `faint` draws thinner, for the DM map during play. Rooms are a light wash with their
 * name in the middle; `picked` is the room being renamed in the editor.
 */
export function drawWalls(ctx: CanvasRenderingContext2D, a: Annotation, px: number, faint = false, picked = -1): void {
  const w = (faint ? 2.5 : 3.5) / px;
  ctx.save();
  a.rooms.forEach((room, i) => {
    ctx.fillStyle = i === picked ? PICKED : ROOM;
    ctx.beginPath();
    room.outline.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
  });
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
    if (!room.name) continue;
    const x = room.outline.reduce((s, p) => s + p.x, 0) / room.outline.length;
    const y = room.outline.reduce((s, p) => s + p.y, 0) / room.outline.length;
    ctx.strokeText(room.name, x, y);
    ctx.fillText(room.name, x, y);
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
