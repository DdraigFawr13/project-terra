// The DM window's looks (D-033): three dark and two light. Dark or Light flips between the dark look and the light look
// the DM picked, so one tap swaps them. The table window never changes (D-023). Kept on this laptop, like the layouts.

export const DARK_LOOKS = ["ember", "deepwater", "soot"] as const;
export const LIGHT_LOOKS = ["parchment", "linen"] as const;
type DarkLook = (typeof DARK_LOOKS)[number];
type LightLook = (typeof LIGHT_LOOKS)[number];
export type Look = DarkLook | LightLook;
export type Appearance = { mode: "dark" | "light"; dark: DarkLook; light: LightLook };

export const LOOK_NAME: Record<Look, string> = {
  ember: "Ember",
  deepwater: "Deep water",
  soot: "Soot",
  parchment: "Parchment",
  linen: "Linen",
};

export const DEFAULT_APPEARANCE: Appearance = { mode: "dark", dark: "ember", light: "parchment" };

/** A stored appearance, with anything missing or unknown taken from the defaults. */
export function parseAppearance(raw: unknown): Appearance {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    mode: r.mode === "light" ? "light" : "dark",
    dark: DARK_LOOKS.includes(r.dark as DarkLook) ? (r.dark as DarkLook) : DEFAULT_APPEARANCE.dark,
    light: LIGHT_LOOKS.includes(r.light as LightLook) ? (r.light as LightLook) : DEFAULT_APPEARANCE.light,
  };
}

/** The look on screen now. */
export const lookOf = (a: Appearance): Look => (a.mode === "dark" ? a.dark : a.light);
