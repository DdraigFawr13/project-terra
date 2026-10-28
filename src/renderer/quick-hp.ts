// HP from the disc (D-032): a tap on a disc opens a small pad beside it, with the amount, Damage and Heal, and Sheet for
// the group's full sheet. Without an HP max it offers the condition word instead, as the sheet does (D-027).
import { conditionOf, discHp, discMax, type Condition, type DiscColour } from "../core/fight.ts";
import type { TableState } from "../core/table.ts";
import type { DmApi } from "../main/dm-preload.ts";
import { COLOUR_NAME, el, swatch } from "./dom.ts";
import { numpad } from "./numpad.ts";
import { popover } from "./popover.ts";

const WORD: Record<Condition, string> = { fine: "Fine", bloodied: "Bloodied", nearDeath: "Near death", down: "Down" };
const NEXT: Record<Condition, Condition> = { fine: "bloodied", bloodied: "nearDeath", nearDeath: "down", down: "fine" };

export function initQuickHp(terra: DmApi, openSheet: (c: DiscColour) => void) {
  let state: TableState | null = null;
  let shown: { colour: DiscColour; letter: string; head: HTMLElement; body: HTMLElement; close: () => void } | null = null;
  const pad = numpad(
    [
      { label: "− Damage", kind: "damage", className: "damage" },
      { label: "+ Heal", kind: "heal", className: "heal" },
    ],
    (kind, amount) => {
      if (shown)
        void terra.apply({ type: "discHp", colour: shown.colour, letter: shown.letter, change: kind === "damage" ? -amount : amount });
    },
  );

  /** The pad's heading and body for the disc as it is now; it closes if the disc is gone. */
  function render(): void {
    if (!shown || !state) return;
    const { colour, letter } = shown;
    const map = state.map;
    const d = map?.discs.find((x) => x.colour === colour && x.letter === letter);
    if (!map || !d) return shown.close();
    const max = discMax(d, map.groups);
    const word = conditionOf(d, map.groups);
    const name = `${map.groups[colour]?.name || COLOUR_NAME[colour]} ${letter}`;
    shown.head.replaceChildren(
      swatch(colour),
      el("b", {}, name),
      el("span", { class: `hp-word ${word}` }, max === null ? WORD[word] : `${discHp(d, map.groups)} / ${max} · ${WORD[word]}`),
    );
    pad.setTarget(max === null ? null : name);
    const sheet = el("button", { type: "button", class: "sheet" }, "Sheet");
    sheet.addEventListener("click", () => {
      shown?.close();
      openSheet(colour);
    });
    if (max !== null) shown.body.replaceChildren(pad.el, sheet);
    else {
      const next = el("button", { type: "button", class: "condition" }, `Condition: ${WORD[d.condition]}`);
      next.addEventListener("click", () => void terra.apply({ type: "condition", colour, letter, condition: NEXT[d.condition] }));
      shown.body.replaceChildren(el("p", { class: "hint" }, "No HP max yet: set one in the sheet, or step the condition."), next, sheet);
    }
  }

  terra.onState((s) => {
    state = s;
    render();
  });
  void terra.getState().then((s) => (state = s));

  return {
    /** Open the pad for a disc, beside the point (in window coordinates) where it was tapped. */
    show(colour: DiscColour, letter: string, at: { x: number; y: number }): void {
      const head = el("header", { class: "pop-head" });
      const body = el("div", { class: "pop-body" });
      const p = popover(at, [head, body], () => (shown = null));
      p.el.classList.add("quick-hp");
      shown = { colour, letter, head, body, close: p.close };
      render();
    },
  };
}
