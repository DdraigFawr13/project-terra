// Creature-type symbols for revealed tokens (D-036): one bold shape each, drawn in code by Claude (SAFE-05), so they
// stay readable at about 40 projector pixels to an inch. Each draws in a box from -1 to 1 around the origin.
import type { CreatureType } from "../core/fight.ts";

type Draw = (ctx: CanvasRenderingContext2D, ink: string, ground: string) => void;

const circle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
};
const poly = (ctx: CanvasRenderingContext2D, pts: [number, number][]) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
};

const SYMBOLS: Record<CreatureType, Draw> = {
  // An eye.
  aberration(ctx, ink, ground) {
    ctx.beginPath();
    ctx.moveTo(-0.8, 0);
    ctx.quadraticCurveTo(0, -0.75, 0.8, 0);
    ctx.quadraticCurveTo(0, 0.75, -0.8, 0);
    ctx.fill();
    ctx.fillStyle = ground;
    circle(ctx, 0, 0, 0.26);
    ctx.fillStyle = ink;
    circle(ctx, 0, 0, 0.12);
  },
  // A paw.
  beast(ctx) {
    ctx.beginPath();
    ctx.ellipse(0, 0.3, 0.38, 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const [x, y] of [
      [-0.5, -0.12],
      [-0.18, -0.45],
      [0.18, -0.45],
      [0.5, -0.12],
    ] as const) {
      ctx.beginPath();
      ctx.ellipse(x, y, 0.15, 0.19, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  // A sun.
  celestial(ctx) {
    circle(ctx, 0, 0, 0.32);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const tip = (r: number, da: number): [number, number] => [Math.cos(a + da) * r, Math.sin(a + da) * r];
      poly(ctx, [tip(0.42, -0.2), tip(0.8, 0), tip(0.42, 0.2)]);
    }
  },
  // A cog.
  construct(ctx, _ink, ground) {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.save();
      ctx.rotate(a);
      ctx.fillRect(-0.13, -0.78, 0.26, 0.3);
      ctx.restore();
    }
    circle(ctx, 0, 0, 0.55);
    ctx.fillStyle = ground;
    circle(ctx, 0, 0, 0.2);
  },
  // A horned head in profile.
  dragon(ctx, _ink, ground) {
    poly(ctx, [
      [-0.55, 0.6],
      [-0.5, -0.15],
      [-0.7, -0.7],
      [-0.2, -0.3],
      [0.1, -0.35],
      [0.7, -0.05],
      [0.7, 0.12],
      [0.15, 0.2],
      [0.1, 0.6],
    ]);
    ctx.fillStyle = ground;
    circle(ctx, -0.05, -0.12, 0.08);
  },
  // A flame.
  elemental(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -0.8);
    ctx.bezierCurveTo(0.2, -0.4, 0.62, -0.2, 0.55, 0.25);
    ctx.bezierCurveTo(0.5, 0.6, 0.2, 0.75, 0, 0.75);
    ctx.bezierCurveTo(-0.2, 0.75, -0.5, 0.6, -0.55, 0.25);
    ctx.bezierCurveTo(-0.6, -0.05, -0.35, -0.2, -0.3, -0.45);
    ctx.bezierCurveTo(-0.1, -0.25, -0.05, -0.5, 0, -0.8);
    ctx.fill();
  },
  // A crescent moon.
  fey(ctx, _ink, ground) {
    circle(ctx, 0, 0, 0.65);
    ctx.fillStyle = ground;
    circle(ctx, 0.3, -0.18, 0.55);
  },
  // Two horns.
  fiend(ctx) {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 0.12, 0.55);
      ctx.quadraticCurveTo(s * 0.75, 0.35, s * 0.62, -0.75);
      ctx.quadraticCurveTo(s * 0.5, 0.05, s * 0.08, 0.15);
      ctx.closePath();
      ctx.fill();
    }
  },
  // A club.
  giant(ctx) {
    ctx.save();
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(-0.1, 0.8);
    ctx.lineTo(0.1, 0.8);
    ctx.lineTo(0.28, -0.35);
    ctx.quadraticCurveTo(0.3, -0.85, 0, -0.85);
    ctx.quadraticCurveTo(-0.3, -0.85, -0.28, -0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
  // Head and shoulders.
  humanoid(ctx) {
    circle(ctx, 0, -0.3, 0.3);
    ctx.beginPath();
    ctx.moveTo(-0.62, 0.68);
    ctx.quadraticCurveTo(-0.6, 0.08, 0, 0.08);
    ctx.quadraticCurveTo(0.6, 0.08, 0.62, 0.68);
    ctx.closePath();
    ctx.fill();
  },
  // Three claw marks.
  monstrosity(ctx) {
    for (const dx of [-0.38, 0, 0.38])
      poly(ctx, [
        [dx + 0.2, -0.75],
        [dx + 0.1, -0.75],
        [dx - 0.22, 0.72],
        [dx - 0.1, 0.72],
      ]);
  },
  // A blob with drips.
  ooze(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.7, 0.2);
    ctx.bezierCurveTo(-0.75, -0.55, 0.75, -0.55, 0.7, 0.2);
    ctx.lineTo(0.7, 0.3);
    ctx.lineTo(-0.7, 0.3);
    ctx.closePath();
    ctx.fill();
    for (const [x, len] of [
      [-0.4, 0.35],
      [0.05, 0.5],
      [0.45, 0.28],
    ] as const) {
      ctx.fillRect(x - 0.1, 0.2, 0.2, len);
      circle(ctx, x, 0.2 + len, 0.1);
    }
  },
  // A leaf.
  plant(ctx, _ink, ground) {
    ctx.beginPath();
    ctx.moveTo(-0.55, 0.65);
    ctx.quadraticCurveTo(-0.75, -0.55, 0.65, -0.7);
    ctx.quadraticCurveTo(0.6, 0.6, -0.55, 0.65);
    ctx.fill();
    ctx.strokeStyle = ground;
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    ctx.moveTo(-0.6, 0.7);
    ctx.lineTo(0.35, -0.4);
    ctx.stroke();
  },
  // A skull.
  undead(ctx, _ink, ground) {
    ctx.beginPath();
    ctx.arc(0, -0.15, 0.62, Math.PI * 0.85, Math.PI * 2.15);
    ctx.lineTo(0.38, 0.62);
    ctx.lineTo(-0.38, 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = ground;
    circle(ctx, -0.24, -0.12, 0.17);
    circle(ctx, 0.24, -0.12, 0.17);
    poly(ctx, [
      [0, 0.12],
      [0.09, 0.3],
      [-0.09, 0.3],
    ]);
  },
};

/** Draw a creature-type symbol `r` wide from its centre (x, y) in `ink`, cutting holes in `ground`. */
export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  type: CreatureType,
  x: number,
  y: number,
  r: number,
  ink: string,
  ground: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(r, r);
  ctx.fillStyle = ink;
  SYMBOLS[type](ctx, ink, ground);
  ctx.restore();
}
