// Small helpers for building the DM window's panels and floating windows in code.
import type { DiscColour } from "../core/fight.ts";
import { icon, type IconName } from "./icons.ts";

export type Attrs = Record<string, string | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "class") e.className = String(v);
    // The CSP refuses style attributes, but not styles set from script (an HP bar's width, say).
    else if (k === "style") e.style.cssText = String(v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  e.append(...kids);
  return e;
}

export function button(label: string, attrs: Attrs, onClick: () => void, iconName?: IconName): HTMLButtonElement {
  const b = el("button", { type: "button", ...attrs }, label);
  if (iconName) b.insertAdjacentHTML("afterbegin", icon(iconName));
  b.addEventListener("click", onClick);
  return b;
}

/** A labelled box for setup-time editing. Number boxes bring up the number keyboard on touch. */
export function field(label: string, value: string, attrs: Attrs, onInput: (v: string) => void): HTMLLabelElement {
  const input = attrs.type === "textarea" ? el("textarea", { ...attrs, type: undefined }) : el("input", attrs);
  input.value = value;
  input.addEventListener("input", () => onInput(input.value));
  return el("label", { class: attrs.type === "textarea" || attrs.type === "text" ? "wide" : undefined }, label, input);
}
export const NUMBER: Attrs = { type: "number", inputmode: "numeric", step: "1", min: "0" };
/** A whole number from a box, or null when empty or not whole. */
export const wholeOrNull = (v: string): number | null => (v.trim() === "" || !Number.isInteger(Number(v)) ? null : Number(v));

export const COLOUR_NAME: Record<DiscColour, string> = {
  yellow: "Yellow",
  red: "Red",
  blue: "Blue",
  green: "Green",
  purple: "Purple",
  orange: "Orange",
};
export const swatch = (c: DiscColour) => el("span", { class: `swatch ${c}`, "aria-hidden": "true" });
/** One figure in a stats grid. */
export const stat = (label: string, value: string) => el("div", { class: "stat" }, el("small", {}, label), el("b", {}, value));
