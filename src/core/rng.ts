// Test-only concept (D-041): nothing in the app uses this until the generator's design phase.
// Seeded randomness for the map generator (GAME-01): the same seed always gives the same map. Mulberry32.

export type Rng = {
  /** A number in [0, 1). */
  next(): number;
  /** A number in [lo, hi). */
  range(lo: number, hi: number): number;
  /** A whole number in [lo, hi], both ends included. */
  int(lo: number, hi: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
};

export function rng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)] as (typeof items)[number],
  };
}
