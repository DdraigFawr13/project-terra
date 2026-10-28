// Every look in dm.css sets every colour and keeps the contrast Morgan approved (D-033): text and grey text at least
// 7:1 on every surface they sit on, copper and the warning colours at least 4.5:1, a window edge that shows on the gap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DARK_LOOKS, DEFAULT_APPEARANCE, LIGHT_LOOKS, lookOf, parseAppearance } from "./appearance.ts";

const css = readFileSync(new URL("../renderer/dm.css", import.meta.url), "utf8");

/** The colour tokens one look sets, from its `:root[data-look="…"]` block. */
function tokens(look: string): Record<string, string> {
  const block = css.match(new RegExp(`:root\\[data-look="${look}"\\] \\{([^}]*)\\}`))?.[1];
  assert.ok(block, `no block for ${look}`);
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
}
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const NEEDED = [
  "ground",
  "bg",
  "surface",
  "raised",
  "line",
  "frame",
  "ink",
  "muted",
  "accent",
  "accent-ink",
  "focus",
  "ok",
  "warn",
  "danger",
  "danger-ink",
  "notice",
  "current",
  "damage-bg",
  "heal-bg",
  "rim",
];

for (const look of [...DARK_LOOKS, ...LIGHT_LOOKS]) {
  test(`${look}: every colour set, text 7:1, copper and warnings 4.5:1`, () => {
    const t = tokens(look);
    assert.deepEqual(
      NEEDED.filter((k) => !t[k]),
      [],
      "missing tokens",
    );
    const at = (fg: string, bg: string, min: number) =>
      assert.ok(contrast(t[fg]!, t[bg]!) >= min, `${look}: ${fg} on ${bg} is ${contrast(t[fg]!, t[bg]!).toFixed(2)}:1, needs ${min}:1`);
    for (const bg of ["surface", "raised", "bg"]) {
      at("ink", bg, 7);
      at("muted", bg, 7);
      at("accent", bg, 4.5);
      at("warn", bg, 4.5);
      at("danger-ink", bg, 4.5);
      at("notice", bg, 4.5);
    }
    at("accent-ink", "accent", 4.5);
    at("ink", "current", 7);
    at("ink", "damage-bg", 7);
    at("ink", "heal-bg", 7);
    at("focus", "surface", 4.5);
    // A window's edge must show against the gap between windows (D-032).
    at("frame", "ground", 1.8);
  });
}

test("the stored appearance falls back to the defaults, piece by piece", () => {
  assert.deepEqual(parseAppearance(null), DEFAULT_APPEARANCE);
  assert.deepEqual(parseAppearance({ mode: "light", dark: "soot", light: "nope" }), { mode: "light", dark: "soot", light: "parchment" });
  // A light look can't be stored as the dark one.
  assert.deepEqual(parseAppearance({ dark: "linen" }), DEFAULT_APPEARANCE);
  assert.equal(lookOf({ mode: "light", dark: "deepwater", light: "linen" }), "linen");
});
