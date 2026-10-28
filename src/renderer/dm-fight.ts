// DM window, the Initiative and Groups windows (D-027, D-028): initiative and the colour groups. Characters and monster
// details live in sheets (dm-party.ts, dm-monsters.ts). Both are rebuilt from each new state; focus survives the rebuild.
import { conditionOf, DISC_COLOURS, isColour, takesTurns, type DiscColour, type Who } from "../core/fight.ts";
import type { Command, TableState } from "../core/table.ts";
import type { DmApi } from "../main/dm-preload.ts";
import { button, COLOUR_NAME, el, swatch, type Attrs } from "./dom.ts";
import { numpad } from "./numpad.ts";
import { popover } from "./popover.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const roundEl = $<HTMLSpanElement>("round");
const startBtn = $<HTMLButtonElement>("startFight");
const endBtn = $<HTMLButtonElement>("endFight");
const orderEl = $<HTMLOListElement>("order");
const unrolledBox = $<HTMLDivElement>("unrolledBox");
const unrolledEl = $<HTMLUListElement>("unrolled");
const groupsEl = $<HTMLUListElement>("groups");
const groupsEmpty = $<HTMLParagraphElement>("groupsEmpty");
const nextBtn = $<HTMLButtonElement>("nextTurn");
const roundState = $<HTMLSpanElement>("roundState");

/**
 * A box for a roll. Typed with a keyboard, it is sent when the DM leaves it or presses Enter; tapped with the pen or a
 * finger, it opens a number pad beside it instead of the on-screen keyboard (D-032).
 */
function rollBox(value: number | null, attrs: Attrs, who: string, onChange: (v: number | null) => void): HTMLInputElement {
  const input = el("input", { type: "number", inputmode: "none", step: "1", min: "-20", max: "99", ...attrs });
  input.value = value === null ? "" : String(value);
  input.addEventListener("change", () => {
    const v = input.value.trim();
    onChange(v === "" ? null : Number.isInteger(Number(v)) ? Number(v) : null);
  });
  input.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    e.preventDefault();
    const r = input.getBoundingClientRect();
    const acts = [{ label: "Set", kind: "set", className: "primary", zeroOk: true }];
    if (value !== null) acts.push({ label: "Clear", kind: "clear", className: "", zeroOk: true });
    const pad = numpad(
      acts,
      (kind, roll) => {
        p.close();
        onChange(kind === "clear" ? null : Math.max(-20, Math.min(99, roll)));
      },
      { signed: true },
    );
    pad.setTarget(`Initiative: ${who}`);
    const p = popover({ x: r.right, y: r.top + r.height / 2 }, [pad.el]);
    p.el.classList.add("roll-pad");
  });
  return input;
}

export function initFight(terra: DmApi, openGroup: (c: DiscColour) => void): { render: () => void; next: () => void } {
  let state: TableState | null = null;
  const run = (c: Command) => void terra.apply(c);

  /** Who a roll is for, in words: the character's name, or the colour group's name. */
  const whoName = (s: TableState, who: Who): string =>
    isColour(who) ? s.map?.groups[who]?.name || COLOUR_NAME[who] : (s.party.find((p) => p.id === who)?.name ?? "?");

  /** A label for an initiative row: the character's name, or the colour group's name and its letters. */
  function whoLabel(s: TableState, who: Who): HTMLElement {
    if (!isColour(who)) return el("span", { class: "who" }, s.party.find((p) => p.id === who)?.name ?? "?");
    const groups = s.map?.groups ?? {};
    const discs = (s.map?.discs ?? []).filter((d) => d.colour === who && conditionOf(d, groups) !== "down");
    const hidden = discs.length > 0 && discs.every((d) => !d.shown);
    const letters = discs.map((d) => d.letter).join(" ");
    return el(
      "span",
      { class: "who" },
      swatch(who),
      `${groups[who]?.name || COLOUR_NAME[who]} `,
      el("small", {}, letters + (hidden ? " · hidden" : "")),
    );
  }

  function renderFight(s: TableState): void {
    const f = s.fight;
    startBtn.hidden = !!f;
    endBtn.hidden = !f;
    roundEl.textContent = !f ? "" : f.round ? `Round ${f.round}` : "Enter the rolls, then Next turn";
    roundState.textContent = f?.round ? `Round ${f.round}` : "";
    nextBtn.disabled = !f || f.entries.length === 0;
    if (!f) {
      orderEl.replaceChildren();
      unrolledBox.hidden = true;
      return;
    }
    const discs = s.map?.discs ?? [];
    const groups = s.map?.groups ?? {};
    orderEl.replaceChildren(
      ...f.entries.map((e, i) => {
        const tieUp = f.entries[i - 1]?.init === e.init;
        const tieDown = f.entries[i + 1]?.init === e.init;
        const current = e.who === f.current;
        return el(
          "li",
          {
            class: `entry${current ? " current" : ""}${takesTurns(e.who, discs, groups, s.party) ? "" : " out"}`,
            "aria-current": current ? "step" : undefined,
          },
          whoLabel(s, e.who),
          rollBox(e.init, { "data-key": `init-${e.who}`, "aria-label": "Initiative" }, whoName(s, e.who), (init) =>
            run({ type: "initiative", who: e.who, init }),
          ),
          // Arrows only for ties: they settle who goes first between equal rolls (D-027).
          ...(tieUp || tieDown
            ? [
                button(
                  "",
                  { class: "icon", "aria-label": "Move up", disabled: !tieUp },
                  () => run({ type: "swapTie", who: e.who, by: -1 }),
                  "up",
                ),
                button(
                  "",
                  { class: "icon", "aria-label": "Move down", disabled: !tieDown },
                  () => run({ type: "swapTie", who: e.who, by: 1 }),
                  "down",
                ),
              ]
            : []),
        );
      }),
    );
    // Everyone who could join: the party, and each colour with a disc that isn't down. One roll per colour (D-027).
    const rolled = new Set(f.entries.map((e) => e.who));
    const waiting = [...s.party.map((p) => p.id), ...DISC_COLOURS.filter((c) => takesTurns(c, discs, groups, s.party))].filter(
      (w) => !rolled.has(w),
    );
    unrolledBox.hidden = waiting.length === 0;
    unrolledEl.replaceChildren(
      ...waiting.map((who) =>
        el(
          "li",
          { class: "entry" },
          whoLabel(s, who),
          rollBox(null, { "data-key": `init-${who}`, "aria-label": "Initiative roll", placeholder: "Roll" }, whoName(s, who), (init) =>
            init === null ? undefined : run({ type: "initiative", who, init }),
          ),
        ),
      ),
    );
  }

  function renderGroups(s: TableState): void {
    const discs = s.map?.discs ?? [];
    groupsEmpty.hidden = discs.length > 0;
    groupsEmpty.textContent = s.map
      ? "Pick Marker (M) below, a colour and a size, then tap the map. New discs start hidden."
      : "Place a map first: discs sit on its squares.";
    groupsEl.replaceChildren(
      ...DISC_COLOURS.filter((c) => discs.some((d) => d.colour === c)).map((c) => {
        const mine = discs.filter((d) => d.colour === c);
        const hidden = mine.filter((d) => !d.shown).length;
        const open = button("", { class: "group-open", "aria-label": `Open the ${COLOUR_NAME[c].toLowerCase()} group` }, () =>
          openGroup(c),
        );
        open.append(
          swatch(c),
          el(
            "span",
            {},
            s.map?.groups[c]?.name || COLOUR_NAME[c],
            el("small", {}, `${mine.map((d) => d.letter).join(" ")}${hidden ? ` · ${hidden} hidden` : ""}`),
          ),
        );
        return el(
          "li",
          { class: "entry group-row" },
          open,
          button(
            hidden ? "Hidden" : "Shown",
            { class: "eye", "aria-pressed": String(!hidden), "aria-label": `Show or hide every ${COLOUR_NAME[c].toLowerCase()} disc` },
            () => run({ type: "showDiscs", colour: c, letter: null, on: !!hidden }),
            hidden ? "hide" : "reveal",
          ),
        );
      }),
    );
  }

  function render(): void {
    if (!state) return;
    // Rebuilding replaces the inputs: keep focus on the same box, so typing or pen input carries on.
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.key;
    renderFight(state);
    renderGroups(state);
    if (focused) document.querySelector<HTMLElement>(`#initiativePanel [data-key="${focused}"]`)?.focus();
  }

  startBtn.addEventListener("click", () => run({ type: "startFight" }));
  endBtn.addEventListener("click", () => run({ type: "endFight" }));
  nextBtn.addEventListener("click", () => run({ type: "nextTurn" }));
  terra.onState((s) => {
    state = s;
    render();
  });
  terra.getState().then((s) => {
    state = s;
    render();
  });
  return {
    render,
    next: () => {
      if (!nextBtn.disabled) run({ type: "nextTurn" });
    },
  };
}
