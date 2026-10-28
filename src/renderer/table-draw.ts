// The table's picture in inches: the map with its fog, the 1-inch grid and the calibration rectangle. The table window
// draws it onto its warped layer (D-021); the DM window draws the same picture, unwarped, as its live preview (D-025).
import type { Calibration, Layer } from "../core/calibration.ts";
import type { Chip, DiscColour, Strip } from "../core/fight.ts";
import type { PlayerDisc, PlayerView } from "../core/table.ts";
import type { FogPainter } from "./fog-draw.ts";

// Plain bold lettering on the table, from the bundled font, so it reads at an angle and upside down (D-023).
export const FONT = `"Source Sans 3", "Segoe UI", system-ui, sans-serif`;
export const ACCENT = "#6cb8a4";

/** Solid strong disc colours with a white rim, readable on a projector (D-023), and the letter colour on each. */
const DISC_HEX: Record<DiscColour, { fill: string; ink: string }> = {
  yellow: { fill: "#ffd400", ink: "#111111" },
  red: { fill: "#e3211b", ink: "#ffffff" },
  blue: { fill: "#1e6bff", ink: "#ffffff" },
  green: { fill: "#169c34", ink: "#ffffff" },
  purple: { fill: "#9338f0", ink: "#ffffff" },
  orange: { fill: "#ff7a00", ink: "#111111" },
};
const CONDITION_WORD = { bloodied: "Bloodied", nearDeath: "Near death" } as const;

/**
 * A disc centred at (x, y) with diameter `d`, in the context's units. On the table its letter is drawn twice, once
 * facing each long side (D-008); `facing` turns the pair when the table's long sides run up and down the picture.
 */
export function drawDisc(
  ctx: CanvasRenderingContext2D,
  disc: Pick<PlayerDisc, "colour" | "letter">,
  x: number,
  y: number,
  d: number,
  look: { bothSides: boolean; facing?: number },
): void {
  const { fill, ink } = DISC_HEX[disc.colour];
  const r = d / 2;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.92, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = r * 0.14;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (!look.bothSides) {
    ctx.font = `700 ${r * 1.15}px ${FONT}`;
    ctx.fillText(disc.letter, x, y + r * 0.06);
    return;
  }
  ctx.font = `700 ${r * 0.8}px ${FONT}`;
  for (const turn of [0, Math.PI]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((look.facing ?? 0) + turn);
    ctx.fillText(disc.letter, 0, r * 0.4);
    ctx.restore();
  }
}

/** Width of one chip at text size `t`, in the context's units. */
function chipWidth(ctx: CanvasRenderingContext2D, chip: Chip, t: number): number {
  const size = chip.current ? t * 1.25 : t;
  ctx.font = `700 ${size}px ${FONT}`;
  const pad = size * 0.6;
  if (chip.kind === "pc") return ctx.measureText(chip.name).width + pad * 2;
  const word = chip.condition ? ctx.measureText(CONDITION_WORD[chip.condition]).width + size * 0.4 : 0;
  return size * 1.5 + word + pad * 2;
}

/**
 * One side's turn strip, along a band `length` long with its outer edge at y = 0 and the reader beyond it: the current
 * turn first, larger and outlined, then as many as fit, then "+N more" (D-023).
 */
function drawStripSide(ctx: CanvasRenderingContext2D, strip: Strip, length: number, t: number): void {
  const gap = t * 0.35;
  const h = t * 2;
  const more = (n: number) => `+${n} more`;
  ctx.font = `700 ${t}px ${FONT}`;
  const roundText = strip.round ? `Round ${strip.round}` : "Initiative";
  let x = gap;
  const lead = ctx.measureText(roundText).width + gap * 2;
  const moreW = ctx.measureText(more(99)).width + gap;
  const widths = strip.chips.map((c) => chipWidth(ctx, c, t));
  let fits = 0;
  let used = lead;
  for (const w of widths) {
    const rest = fits + 1 < widths.length ? moreW : 0;
    if (used + w + gap + rest > length) break;
    used += w + gap;
    fits++;
  }
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `700 ${t}px ${FONT}`;
  ctx.fillText(roundText, x, -h * 0.65);
  x += lead;
  strip.chips.slice(0, fits).forEach((chip, i) => {
    const w = widths[i]!;
    const size = chip.current ? t * 1.25 : t;
    const ch = chip.current ? h * 1.2 : h;
    const top = -h * 0.65 - ch / 2;
    ctx.beginPath();
    ctx.roundRect(x, top, w, ch, ch * 0.25);
    ctx.fillStyle = "rgba(0,0,0,0.82)";
    ctx.fill();
    if (chip.current) {
      ctx.lineWidth = t * 0.16;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    const mid = top + ch / 2;
    if (chip.kind === "pc") ctx.fillText(chip.name, x + size * 0.6, mid);
    else {
      drawDisc(ctx, chip, x + size * 0.6 + size * 0.75, mid, size * 1.5, { bothSides: false });
      if (chip.condition) {
        ctx.font = `700 ${size}px ${FONT}`;
        ctx.textAlign = "left";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(CONDITION_WORD[chip.condition], x + size * 0.6 + size * 1.9, mid);
      }
    }
    x += w + gap;
  });
  if (fits < strip.chips.length) {
    ctx.font = `700 ${t}px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(more(strip.chips.length - fits), x, -h * 0.65);
  }
}

/** The turn strip twice, along both long edges of `area`, each reading from its own side (D-008). `t` is the text size. */
function drawStrip(ctx: CanvasRenderingContext2D, strip: Strip, area: Area, t: number): void {
  const wide = area.width >= area.height;
  const length = wide ? area.width : area.height;
  const ends = wide
    ? [
        { x: area.x, y: area.y + area.height, turn: 0 },
        { x: area.x + area.width, y: area.y, turn: Math.PI },
      ]
    : [
        { x: area.x + area.width, y: area.y + area.height, turn: -Math.PI / 2 },
        { x: area.x, y: area.y, turn: Math.PI / 2 },
      ];
  for (const e of ends) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.turn);
    drawStripSide(ctx, strip, length, t);
    ctx.restore();
  }
}

/** The part of the table the projector reaches, in table inches (`visibleRect`). */
type Area = { x: number; y: number; width: number; height: number };
/** How far to turn text so it faces the table's long sides. */
const facingOf = (area: Area) => (area.width >= area.height ? 0 : Math.PI / 2);

/** Text centred at (x, y) and again rotated half a turn about the centre of `rect`, so both long sides can read it (D-008). */
export function textBothSides(
  ctx: CanvasRenderingContext2D,
  text: string,
  rect: { x: number; y: number; w: number; h: number },
  inset: number,
  size: number,
): void {
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = rect.x + rect.w / 2;
  ctx.fillText(text, cx, rect.y + rect.h - inset, rect.w * 0.9);
  ctx.save();
  ctx.translate(cx, rect.y + inset);
  ctx.rotate(Math.PI);
  ctx.fillText(text, 0, 0, rect.w * 0.9);
  ctx.restore();
}

/** Library map images, loaded once each; `onload` draws again when one arrives. */
export function mapImages(onload: () => void): (id: string) => HTMLImageElement {
  const images = new Map<string, HTMLImageElement>();
  return (id) => {
    let img = images.get(id);
    if (!img) {
      img = new Image();
      img.crossOrigin = "anonymous";
      img.src = `terra-map://${id}/`;
      img.onload = onload;
      images.set(id, img);
    }
    return img;
  };
}

export type TableMode = "calibrate" | "testGrid" | "map";

export type TableScene = {
  cal: Calibration;
  layer: Layer;
  mode: TableMode;
  calibrated: boolean;
  view: PlayerView;
  image: (id: string) => HTMLImageElement;
  fog: FogPainter;
  /** Where the turn strip goes. */
  area: Area;
};

/** Discs over the map, then the turn strip along the edges (D-006: map, effects, markers, pings). */
function drawFight(ctx: CanvasRenderingContext2D, scene: TableScene, X: (inches: number) => number): void {
  const { view, area } = scene;
  const facing = facingOf(area);
  for (const d of view.discs) drawDisc(ctx, d, X(d.x), X(d.y), X(d.size), { bothSides: true, facing });
  if (view.strip) {
    drawStrip(ctx, view.strip, { x: X(area.x), y: X(area.y), width: X(area.width), height: X(area.height) }, X(0.42));
  }
}

/**
 * Draw the table in layer pixels times `scale`, with the layer box's top-left corner at (0, 0). The table window
 * uses scale 1; the DM's preview scales it down to fit its panel.
 */
export function drawTable(ctx: CanvasRenderingContext2D, scene: TableScene, scale: number): void {
  const { cal, layer, mode, view } = scene;
  const ppi = layer.pxPerInch;
  const X = (inches: number) => inches * ppi;
  // Work with the table's origin (the rectangle's top-left corner) at (0, 0).
  ctx.setTransform(scale, 0, 0, scale, -layer.box.x * ppi * scale, -layer.box.y * ppi * scale);
  const { x: bx, y: by, width: bw, height: bh } = layer.box;
  ctx.clearRect(X(bx), X(by), X(bw), X(bh));
  const map = view.map;
  if (mode === "map" && map) {
    const img = scene.image(map.id);
    if (img.complete && img.naturalWidth) {
      ctx.save();
      ctx.translate(X(map.x), X(map.y));
      ctx.rotate((map.turns * Math.PI) / 2);
      ctx.scale(ppi, ppi);
      scene.fog.draw(ctx, img, map.bounds, map.fog, "table");
      ctx.restore();
    }
    // Over a map, the grid is only for checking that the map's squares line up with the table's.
    if (!view.grid) return drawFight(ctx, scene, X);
  }
  ctx.strokeStyle = mode === "map" ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.55)";
  ctx.lineWidth = Math.max(1, ppi / 24);
  ctx.beginPath();
  for (let x = bx; x <= bx + bw; x++) (ctx.moveTo(X(x), X(by)), ctx.lineTo(X(x), X(by + bh)));
  for (let y = by; y <= by + bh; y++) (ctx.moveTo(X(bx), X(y)), ctx.lineTo(X(bx + bw), X(y)));
  ctx.stroke();
  if (mode === "map") return drawFight(ctx, scene, X);

  const calibrating = mode === "calibrate";
  const rect = { x: 0, y: 0, w: X(cal.widthIn), h: X(cal.heightIn) };
  ctx.strokeStyle = calibrating ? ACCENT : "#ffffff";
  ctx.lineWidth = Math.max(2, ppi / 10);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = "#ffffff";
  const size = Math.min(X(0.45), rect.w / 14);
  if (calibrating) {
    textBothSides(ctx, `Calibrating: put corners 1–4 on your ${cal.widthIn} × ${cal.heightIn} inch marks`, rect, X(1.2), size);
  } else {
    const label = scene.calibrated ? `1-inch squares · ${cal.widthIn} × ${cal.heightIn} inch check` : "1-inch squares · not calibrated yet";
    textBothSides(ctx, label, rect, X(1.2), size);
    // A fight can run on the test grid too, before a map is placed.
    drawFight(ctx, scene, X);
  }
}
