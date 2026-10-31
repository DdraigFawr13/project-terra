// The table's picture in inches: the map with its fog, the 1-inch grid and the calibration rectangle. The table window
// draws it onto its warped layer (D-021); the DM window draws the same picture, unwarped, as its live preview (D-025).
import type { Calibration, Layer } from "../core/calibration.ts";
import type { Chip, DiscColour, PcCondition, Strip } from "../core/fight.ts";
import type { Ink, PlayerDisc, PlayerToken, PlayerView } from "../core/table.ts";
import type { Point } from "../core/homography.ts";
import type { FogPainter } from "./fog-draw.ts";
import { drawSymbol } from "./symbols.ts";

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

/** Pen colours on a projector (D-035). */
const INK_HEX: Record<Ink, string> = { white: "#ffffff", cyan: "#4de1ff", pink: "#ff79d2" };
/** A fading line stays this long, the last FADE_MS of it fading out, in milliseconds (D-035). */
export const SKETCH_MS = 10_000;
const FADE_MS = 3_000;
export const sketchAlpha = (ms: number) => Math.max(0, Math.min(1, (SKETCH_MS - ms) / FADE_MS));

/** A freehand line through `points` (already in the context's units), `inch` units to the inch, with a dark edge so it reads on a light map. */
export function drawLine(ctx: CanvasRenderingContext2D, points: Point[], ink: Ink, inch: number, alpha = 1, dashed = false): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.setLineDash(dashed ? [inch * 0.3, inch * 0.2] : []);
  const path = () => {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  };
  path();
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = Math.max(4, inch * 0.2);
  ctx.stroke();
  path();
  ctx.strokeStyle = INK_HEX[ink];
  ctx.lineWidth = Math.max(2, inch * 0.12);
  ctx.stroke();
  ctx.restore();
}

/** How long a ping lasts on the table, in milliseconds (D-034). */
export const PING_MS = 2000;

/**
 * A ping `ms` milliseconds old at (x, y), `inch` units to the inch: thin white rings spreading out, three in turn and
 * never more than two at once, around a dot that fades (D-034).
 */
export function drawPing(ctx: CanvasRenderingContext2D, x: number, y: number, inch: number, ms: number): void {
  const RING_MS = 800;
  for (const start of [0, 600, 1200]) {
    const t = (ms - start) / RING_MS;
    if (t < 0 || t > 1) continue;
    ctx.beginPath();
    ctx.arc(x, y, inch * (0.2 + 1.4 * t), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${(1 - t).toFixed(3)})`;
    ctx.lineWidth = inch * 0.07;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, inch * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 1 - ms / PING_MS).toFixed(3)})`;
  ctx.fill();
}

/**
 * The party marker at (x, y) (D-039): a white banner on a pole over a ringed base, about an inch tall, so it reads as
 * "the party" from either side of the table and never as a pin or a disc.
 */
export function drawParty(ctx: CanvasRenderingContext2D, x: number, y: number, inch: number): void {
  const u = inch;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = "round";
  ctx.lineWidth = u * 0.06;
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(0, u * 0.42, u * 0.3, u * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(-u * 0.035, -u * 0.5, u * 0.07, u * 0.92);
  ctx.strokeRect(-u * 0.035, -u * 0.5, u * 0.07, u * 0.92);
  ctx.beginPath();
  ctx.moveTo(u * 0.035, -u * 0.5);
  ctx.lineTo(u * 0.48, -u * 0.32);
  ctx.lineTo(u * 0.035, -u * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * A pin at (x, y), `inch` units to the inch: a white diamond with a dark edge and a ring, so it shows on light and dark
 * map. `own`: the DM's own pin, drawn hollow in copper on the DM's map only (D-034).
 */
export function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, inch: number, own = false, copper = "#d8653d"): void {
  const r = inch * 0.22;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
  ctx.strokeStyle = own ? copper : "rgba(255,255,255,0.7)";
  ctx.lineWidth = Math.max(1.5, inch * 0.05);
  ctx.setLineDash(own ? [r / 2, r / 3] : []);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = own ? "rgba(0,0,0,0.6)" : "#ffffff";
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.strokeStyle = own ? copper : "#000000";
  ctx.lineWidth = Math.max(1.5, inch * 0.06);
  ctx.strokeRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

/** Discs this big or bigger, in inches, are see-through, so the map shows under a large creature (D-046). */
const SEE_THROUGH_IN = 3;
/** Under a mini: a light centre, so the mini stands out against it (D-046). */
const MINI_GROUND = "#efeadf";

/**
 * A disc centred at (x, y) with diameter `d`, in the context's units, its letter once (D-028: an exception to D-008's
 * text twice). `turn` turns the letter, half a turn when the DM flips the letters to face the far side. With a mini on
 * it the centre is light and the letter goes on a tab; on its colour's turn a bright ring goes round it, clear of the
 * mini's base (D-046).
 */
export function drawDisc(
  ctx: CanvasRenderingContext2D,
  disc: Pick<PlayerDisc, "colour" | "letter"> & Partial<Pick<PlayerDisc, "symbol" | "portrait" | "mini" | "size" | "turn">>,
  x: number,
  y: number,
  d: number,
  turn = 0,
): void {
  const { fill, ink } = DISC_HEX[disc.colour];
  const r = d / 2;
  const revealed = !disc.mini && !!(disc.symbol || disc.portrait);
  // A portrait shows once its picture has arrived; until then, the symbol.
  const picture = revealed && disc.portrait ? portraitImage(disc.portrait) : null;
  if (disc.turn) {
    ctx.beginPath();
    ctx.arc(x, y, r * 1.2, 0, Math.PI * 2);
    ctx.lineWidth = r * 0.24;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
    ctx.stroke();
    ctx.lineWidth = r * 0.14;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }
  const seeThrough = (disc.size ?? 0) >= SEE_THROUGH_IN;
  ctx.globalAlpha = seeThrough ? 0.45 : 1;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.92, 0, Math.PI * 2);
  ctx.fillStyle = disc.mini ? MINI_GROUND : revealed ? TOKEN_GROUND : fill;
  ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(turn);
  if (disc.mini) {
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
    ctx.lineWidth = r * 0.2;
    ctx.strokeStyle = fill;
    ctx.stroke();
  } else if (revealed) {
    // Revealed (D-036): the portrait, or the symbol on a dark ground, inside a ring of the group's colour.
    if (picture) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(picture, -r * 0.92, -r * 0.92, r * 1.84, r * 1.84);
      ctx.restore();
    } else if (disc.symbol) drawSymbol(ctx, disc.symbol, 0, 0, r * 0.58, TOKEN_INK, TOKEN_GROUND);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
    ctx.lineWidth = r * 0.2;
    ctx.strokeStyle = fill;
    ctx.stroke();
  } else {
    ctx.globalAlpha = 1;
    ctx.lineWidth = r * 0.14;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    letterAt(ctx, disc.letter, 0, 0, r * 1.15, ink);
  }
  // The letter is what players call out, so it must stay readable: on a badge inside the ring, or on a tab below the
  // token when a mini stands on it and would cover the badge (D-036). Below means towards the reader, so it turns too.
  const t = Math.max(r * 0.7, 9);
  if (disc.mini) {
    const w = Math.max(r * 1.1, t * 1.2);
    tag(ctx, -w / 2, r * 1.02, w, t * 1.15, fill);
    letterAt(ctx, disc.letter, 0, r * 1.02 + t * 0.58, t, ink);
  } else if (revealed) {
    const bx = r * 0.58;
    ctx.beginPath();
    ctx.arc(bx, bx, r * 0.47, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    letterAt(ctx, disc.letter, bx, bx, r * 0.64, ink);
  }
  ctx.restore();
  // Set before the save, so the restore brings back the see-through alpha: put it right for whatever draws next.
  ctx.globalAlpha = 1;
}

/** Characters' token colours (D-045), kept apart from the six enemy colours: square tiles in these read as the party. */
const TINTS: { fill: string; ink: string }[] = [
  { fill: "#ffffff", ink: "#111111" },
  { fill: "#28d7c8", ink: "#111111" },
  { fill: "#ff5fb4", ink: "#111111" },
  { fill: "#b6f03c", ink: "#111111" },
  { fill: "#7fc4ff", ink: "#111111" },
  { fill: "#d7a6ff", ink: "#111111" },
  { fill: "#ffb48c", ink: "#111111" },
  { fill: "#c9c2a5", ink: "#111111" },
];

/**
 * A character's token centred at (x, y), `w` units wide (D-045): a square tile, so its corners show round a mini's base
 * and it never reads as a round enemy disc. It faces its player's side, whichever way Flip letters has turned the discs.
 * `image` draws in place of the token's own picture, for the crop preview.
 */
export function drawToken(ctx: CanvasRenderingContext2D, t: PlayerToken, x: number, y: number, w: number, image?: CanvasImageSource): void {
  const { fill, ink } = TINTS[t.tint % TINTS.length]!;
  const r = w / 2;
  const edge = w * 0.07;
  const picture = image ?? (t.picture ? portraitImage(t.picture) : null);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t.farSide ? Math.PI : 0);
  if (t.turn) {
    // Whose turn: a bright frame outside the tile, clear of a mini's base.
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = w * 0.09;
    ctx.strokeRect(-r - w * 0.09, -r - w * 0.09, w + w * 0.18, w + w * 0.18);
  }
  ctx.globalAlpha *= t.down ? 0.55 : 1;
  // Under a mini the tile is light, so the mini stands out; the picture would be hidden under its base anyway (D-046).
  ctx.fillStyle = t.mini ? MINI_GROUND : TOKEN_GROUND;
  ctx.fillRect(-r, -r, w, w);
  if (picture && !t.mini) ctx.drawImage(picture, -r + edge, -r + edge, w - edge * 2, w - edge * 2);
  ctx.strokeStyle = fill;
  ctx.lineWidth = edge;
  ctx.strokeRect(-r + edge / 2, -r + edge / 2, w - edge, w - edge);
  // The initials: on a tab below when a mini would cover them, else on the tile, large when there's no picture.
  if (t.mini) {
    const th = w * 0.42;
    tag(ctx, -r, r + w * 0.02, w, th, fill);
    letterAt(ctx, t.initials, 0, r + w * 0.02 + th / 2, th * 0.86, ink);
  } else if (picture) {
    const bh = w * 0.27;
    ctx.fillStyle = fill;
    ctx.fillRect(-r, r - bh, w, bh);
    letterAt(ctx, t.initials, 0, r - bh / 2, bh * 0.92, ink);
  } else letterAt(ctx, t.initials, 0, 0, w * 0.56, "#ffffff");
  if (t.down) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = w * 0.1;
    ctx.beginPath();
    (ctx.moveTo(-r * 0.7, -r * 0.7), ctx.lineTo(r * 0.7, r * 0.7));
    (ctx.moveTo(r * 0.7, -r * 0.7), ctx.lineTo(-r * 0.7, r * 0.7));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Conditions in a row above the tile, clear of a mini: three icons at most, then a mark for more.
  const size = w * 0.36;
  const shown = t.conditions.slice(0, 3);
  shown.forEach((c, i) => {
    const cx = -r + size / 2 + i * (size + w * 0.02);
    drawConditionIcon(ctx, c, cx, -r - size * 0.62, size);
  });
  if (t.conditions.length > shown.length) letterAt(ctx, "+", r - size * 0.1, -r - size * 0.62, size, "#ffffff");
  ctx.restore();
}

/** A condition's icon drawn in code: a white mark on a dark chip, simple enough to read at about 16 projector pixels. */
function drawConditionIcon(ctx: CanvasRenderingContext2D, c: PcCondition, x: number, y: number, size: number): void {
  const u = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = TOKEN_GROUND;
  ctx.fillRect(-u, -u, size, size);
  ctx.scale(u, u);
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.lineWidth = 0.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  const line = (...p: number[]) => {
    ctx.moveTo(p[0]!, p[1]!);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i]!, p[i + 1]!);
  };
  const ring = (cx: number, cy: number, radius: number) => {
    ctx.moveTo(cx + radius, cy);
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  };
  let fillIt = false;
  switch (c) {
    case "blinded": // An eye, struck through.
      ctx.ellipse(0, 0, 0.7, 0.38, 0, 0, Math.PI * 2);
      line(-0.65, 0.65, 0.65, -0.65);
      break;
    case "charmed": // A heart.
      ctx.moveTo(0, 0.7);
      ctx.bezierCurveTo(-1, 0, -0.55, -0.75, 0, -0.25);
      ctx.bezierCurveTo(0.55, -0.75, 1, 0, 0, 0.7);
      fillIt = true;
      break;
    case "deafened": // Sound, struck through.
      ctx.arc(-0.45, 0, 0.45, -0.8, 0.8);
      ctx.moveTo(-0.45 + 0.8 * Math.cos(-0.8), 0.8 * Math.sin(-0.8));
      ctx.arc(-0.45, 0, 0.8, -0.8, 0.8);
      line(-0.65, 0.65, 0.65, -0.65);
      break;
    case "exhaustion": // Bars running down.
      line(-0.55, -0.6, -0.55, 0.6);
      line(0, -0.2, 0, 0.6);
      line(0.55, 0.25, 0.55, 0.6);
      break;
    case "frightened": // An exclamation mark.
      line(0, -0.7, 0, 0.2);
      line(0, 0.62, 0, 0.64);
      break;
    case "grappled": // Two hands closing.
      line(-0.7, -0.5, -0.2, -0.5, -0.2, 0.5, -0.7, 0.5);
      line(0.7, -0.5, 0.2, -0.5, 0.2, 0.5, 0.7, 0.5);
      break;
    case "incapacitated": // No entry.
      ring(0, 0, 0.68);
      line(-0.4, 0, 0.4, 0);
      break;
    case "invisible": // A dashed circle.
      ctx.setLineDash([0.32, 0.3]);
      ring(0, 0, 0.66);
      break;
    case "paralyzed": // A bolt.
      line(0.2, -0.75, -0.35, 0.05, 0.3, 0.05, -0.2, 0.75);
      break;
    case "petrified": // A block of stone.
      line(0, -0.72, 0.65, -0.36, 0.65, 0.36, 0, 0.72, -0.65, 0.36, -0.65, -0.36, 0, -0.72);
      fillIt = true;
      break;
    case "poisoned": // A drop.
      ctx.moveTo(0, -0.75);
      ctx.bezierCurveTo(0.8, 0.15, 0.45, 0.72, 0, 0.72);
      ctx.bezierCurveTo(-0.45, 0.72, -0.8, 0.15, 0, -0.75);
      fillIt = true;
      break;
    case "prone": // Flat on the ground.
      line(-0.7, 0.55, 0.7, 0.55);
      line(0, -0.6, 0, 0.15);
      line(-0.32, -0.15, 0, 0.15, 0.32, -0.15);
      break;
    case "restrained": // Two links of chain.
      ring(-0.3, 0, 0.38);
      ring(0.3, 0, 0.38);
      break;
    case "stunned": // A star.
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 ? 0.34 : 0.78;
        if (i === 0) ctx.moveTo(rad * Math.cos(a), rad * Math.sin(a));
        else ctx.lineTo(rad * Math.cos(a), rad * Math.sin(a));
      }
      ctx.closePath();
      fillIt = true;
      break;
    case "unconscious": // Asleep: a Z.
      line(-0.55, -0.6, 0.55, -0.6, -0.55, 0.6, 0.55, 0.6);
      break;
  }
  if (fillIt) ctx.fill();
  else ctx.stroke();
  ctx.restore();
}

/** Revealed groups' portraits (D-036), loaded once each by the key the table was given; listeners redraw on arrival. */
const portraits = new Map<string, HTMLImageElement>();
const portraitListeners: (() => void)[] = [];
export const onPortraitLoad = (fn: () => void) => void portraitListeners.push(fn);

function portraitImage(key: string): HTMLImageElement | null {
  let img = portraits.get(key);
  if (!img) {
    img = new Image();
    img.src = `terra-portrait://${key}`;
    img.onload = () => portraitListeners.forEach((fn) => fn());
    portraits.set(key, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** A revealed token's ground and symbol colours: dark and light, readable under any disc colour's ring. */
const TOKEN_GROUND = "#1d2124";
const TOKEN_INK = "#f3efe2";

function letterAt(ctx: CanvasRenderingContext2D, letter: string, x: number, y: number, size: number, ink: string): void {
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.fillText(letter, x, y + size * 0.05);
}

/** A rounded tab with a white edge, for a letter beside a token. */
function tag(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h * 0.3);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1, h * 0.08);
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
}

/** Width of one chip at text size `t`, in the context's units. */
function chipWidth(ctx: CanvasRenderingContext2D, chip: Chip, t: number): number {
  const size = chip.current ? t * 1.25 : t;
  ctx.font = `700 ${size}px ${FONT}`;
  const pad = size * 0.6;
  if (chip.kind === "pc") return ctx.measureText(chip.name).width + pad * 2;
  const word = chip.condition ? ctx.measureText(CONDITION_WORD[chip.condition]).width + size * 0.4 : 0;
  return size * 1.3 + word + pad * 2;
}

/**
 * One side's turn strip, along a band `length` long with its outer edge at y = 0 and the reader beyond it: the current
 * turn first, larger and outlined, then as many as fit, then "+N more" (D-023).
 */
function drawStripSide(ctx: CanvasRenderingContext2D, strip: Strip, length: number, t: number): void {
  const gap = t * 0.35;
  // Chips just taller than their text: the strip covers about 0.75 inch of map, down from about 1 inch (D-034).
  const h = t * 1.45;
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
    const ch = chip.current ? h * 1.15 : h;
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
      drawDisc(ctx, chip, x + size * 0.6 + size * 0.65, mid, size * 1.3);
      if (chip.condition) {
        ctx.font = `700 ${size}px ${FONT}`;
        ctx.textAlign = "left";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(CONDITION_WORD[chip.condition], x + size * 0.6 + size * 1.7, mid);
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

/** Library map images, loaded once each; `onload` draws again when one arrives. `reload` fetches a patched map anew (D-036). */
export type MapImages = ((id: string) => HTMLImageElement) & { reload: (id: string) => void };

/** `copy`: "table" for what the table gets (a patched map's clean copy), "" for the map as imported. */
export function mapImages(onload: () => void, copy: "" | "table" = ""): MapImages {
  const images = new Map<string, HTMLImageElement>();
  let loads = 0;
  const get = (id: string) => {
    let img = images.get(id);
    if (!img) {
      img = new Image();
      img.crossOrigin = "anonymous";
      // A new query each load, so a reload never gets the browser's copy of the old picture.
      img.src = `terra-map://${id}/${copy}?n=${loads++}`;
      img.onload = onload;
      images.set(id, img);
    }
    return img;
  };
  return Object.assign(get, {
    reload: (id: string) => {
      if (images.delete(id)) onload();
    },
  });
}

/** Curtain pictures (D-039), loaded once each. A picture that fails is forgotten, so the next draw asks again. */
export function pictureImages(onload: () => void): (id: string) => HTMLImageElement {
  const images = new Map<string, HTMLImageElement>();
  return (id) => {
    let img = images.get(id);
    if (!img) {
      img = new Image();
      img.crossOrigin = "anonymous";
      img.src = `terra-curtain://${id}/`;
      img.onload = onload;
      img.onerror = () => images.delete(id);
      images.set(id, img);
    }
    return img;
  };
}

/** `cover`: a scene's own curtain, a title or a picture (D-039). */
export type TableMode = "calibrate" | "testGrid" | "map" | "cover";

export type TableScene = {
  cal: Calibration;
  layer: Layer;
  mode: TableMode;
  calibrated: boolean;
  view: PlayerView;
  image: (id: string) => HTMLImageElement;
  fog: FogPainter;
  /** Where the turn strip goes, and the part of the table the projector reaches. */
  area: Area;
  /** Curtain pictures, for the cover mode. */
  picture?: (id: string) => HTMLImageElement;
};

/** A scene's curtain over the part of the table the projector reaches: its picture fitted whole, or its title twice. */
function drawCover(ctx: CanvasRenderingContext2D, scene: TableScene, X: (inches: number) => number): void {
  const { area, view } = scene;
  const rect = { x: X(area.x), y: X(area.y), w: X(area.width), h: X(area.height) };
  const cover = view.cover;
  if (cover && "picture" in cover) {
    const img = scene.picture?.(cover.picture);
    if (!img?.complete || !img.naturalWidth) return;
    const k = Math.min(rect.w / img.naturalWidth, rect.h / img.naturalHeight);
    const [w, h] = [img.naturalWidth * k, img.naturalHeight * k];
    ctx.drawImage(img, rect.x + (rect.w - w) / 2, rect.y + (rect.h - h) / 2, w, h);
  } else if (cover) {
    // Once facing each long side (D-008), a third of the way in from each.
    ctx.fillStyle = "#ffffff";
    textBothSides(ctx, cover.title, rect, rect.h * 0.3, Math.min(X(1.1), rect.h / 6));
  }
}

/** Discs over the map, then the turn strip along the edges (D-006: map, effects, markers, pings). */
function drawFight(ctx: CanvasRenderingContext2D, scene: TableScene, X: (inches: number) => number): void {
  const { view, area } = scene;
  // Lines under the discs, as effects are (D-006).
  for (const l of view.drawings)
    drawLine(
      ctx,
      l.points.map((p) => ({ x: X(p.x), y: X(p.y) })),
      l.ink,
      X(1),
    );
  for (const d of view.discs) drawDisc(ctx, d, X(d.x), X(d.y), X(d.size), view.flipLetters ? Math.PI : 0);
  for (const t of view.tokens) drawToken(ctx, t, X(t.x), X(t.y), X(1));
  for (const p of view.pins) drawPin(ctx, X(p.x), X(p.y), X(1));
  if (view.party) drawParty(ctx, X(view.party.x), X(view.party.y), X(1));
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
  if (mode === "cover") return drawCover(ctx, scene, X);
  const map = view.map;
  if (mode === "map" && map) {
    const img = scene.image(map.id);
    if (img.complete && img.naturalWidth) {
      ctx.save();
      ctx.translate(X(map.x), X(map.y));
      ctx.rotate((map.turns * Math.PI) / 2);
      ctx.scale(ppi, ppi);
      // Map brightness (D-046): set once at the rehearsal, for this projector and room.
      if (view.brightness !== 1) ctx.filter = `brightness(${view.brightness})`;
      scene.fog.draw(ctx, img, map.bounds, map.fog, "table");
      ctx.restore();
    }
    // Over a map the grid is the scene's own (D-046): players may use it, and it checks the squares line up.
    if (!view.grid) return drawFight(ctx, scene, X);
  }
  ctx.beginPath();
  for (let x = bx; x <= bx + bw; x++) (ctx.moveTo(X(x), X(by)), ctx.lineTo(X(x), X(by + bh)));
  for (let y = by; y <= by + bh; y++) (ctx.moveTo(X(bx), X(y)), ctx.lineTo(X(bx + bw), X(y)));
  const line = Math.max(1, ppi / 24);
  if (mode === "map") {
    // Over a map, a dark edge under each line keeps it readable on light and dark art alike (D-046).
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = line * 3;
    ctx.stroke();
  }
  ctx.strokeStyle = mode === "map" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.55)";
  ctx.lineWidth = line;
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
