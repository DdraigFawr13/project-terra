// DM window, the Encounter list (D-038, from D-027 and D-028): the party and the colour groups in one list; in a fight,
// the same rows in turn order with their rolls, and a pinned strip saying whose turn it is. Characters' and monsters'
// details live in sheets (dm-party.ts, dm-monsters.ts). Rebuilt from each new state; focus survives the rebuild.
import {
  conditionFromHp,
  conditionOf,
  DISC_COLOURS,
  isColour,
  nextTurn,
  takesTurns,
  type Character,
  type Condition,
  type DiscColour,
  type Who,
} from "../core/fight.ts";
import type { Command, TableState } from "../core/table.ts";
import type { DmApi } from "../main/dm-preload.ts";
import { button, COLOUR_NAME, el, swatch, type Attrs } from "./dom.ts";
import { numpad } from "./numpad.ts";
import { popover } from "./popover.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const WORD: Record<Condition, string> = { fine: "Fine", bloodied: "Bloodied", nearDeath: "Near death", down: "Down" };
const roundEl = $<HTMLSpanElement>("round");
const startBtn = $<HTMLButtonElement>("startFight");
const endBtn = $<HTMLButtonElement>("endFight");
const orderEl = $<HTMLOListElement>("order");
const unrolledBox = $<HTMLDivElement>("unrolledBox");
const unrolledEl = $<HTMLUListElement>("unrolled");
const emptyEl = $<HTMLParagraphElement>("encounterEmpty");
const stripEl = $<HTMLParagraphElement>("turnStrip");
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
    pad.setTarget("Roll");
    const head = el("header", { class: "pop-head" }, el("b", {}, "Initiative"), el("span", { class: "hp-word" }, who));
    const p = popover({ x: r.right, y: r.top + r.height / 2 }, [head, pad.el]);
    p.el.classList.add("roll-pad");
  });
  return input;
}

type At = { x: number; y: number };

export function initFight(
  terra: DmApi,
  openGroup: (c: DiscColour) => void,
  openCharacter: (id: string, at: At) => void,
): { render: () => void; next: () => void } {
  let state: TableState | null = null;
  const run = (c: Command) => void terra.apply(c);

  /** Who a roll is for, in words: the character's name, or the colour group's name. */
  const whoName = (s: TableState, who: Who): string =>
    isColour(who) ? s.map?.groups[who]?.name || COLOUR_NAME[who] : (s.party.find((p) => p.id === who)?.name ?? "?");

  /** A character's row: the name (tap for the HP pad) and a thin HP bar with the numbers. */
  function pcCells(pc: Character): HTMLElement[] {
    const word = conditionFromHp(pc.hp, pc.hpMax);
    const name = button(pc.name, { class: "who", "aria-label": `${pc.name}: HP pad` }, () => {
      const r = name.getBoundingClientRect();
      openCharacter(pc.id, { x: r.left, y: r.top + r.height / 2 });
    });
    return [
      name,
      el(
        "span",
        { class: "hp-line", title: `${pc.hp} of ${pc.hpMax} HP${pc.tempHp ? `, ${pc.tempHp} temporary` : ""}` },
        el("span", { class: "hp-bar thin" }, el("i", { class: word, style: `width:${Math.round((pc.hp / pc.hpMax) * 100)}%` })),
        el("small", {}, `${pc.hp}/${pc.hpMax}${pc.tempHp ? ` +${pc.tempHp}` : ""}`),
      ),
    ];
  }

  /** A group's row: its colour and name (tap for the sheet), each disc's letter with any condition, and show or hide. */
  function groupCells(s: TableState, c: DiscColour): HTMLElement[] {
    const groups = s.map?.groups ?? {};
    const mine = (s.map?.discs ?? []).filter((d) => d.colour === c);
    const hidden = mine.filter((d) => !d.shown).length;
    const letters = mine.map((d) => {
      const word = conditionOf(d, groups);
      return word === "fine" ? d.letter : `${d.letter} ${WORD[word].toLowerCase()}`;
    });
    const open = button("", { class: "group-open", "aria-label": `Open the ${COLOUR_NAME[c].toLowerCase()} group` }, () => openGroup(c));
    open.append(
      swatch(c),
      el("span", {}, groups[c]?.name || COLOUR_NAME[c], el("small", {}, `${letters.join(" · ")}${hidden ? ` · ${hidden} hidden` : ""}`)),
    );
    return [
      open,
      button(
        hidden ? "Hidden" : "Shown",
        { class: "eye", "aria-pressed": String(!hidden), "aria-label": `Show or hide every ${COLOUR_NAME[c].toLowerCase()} disc` },
        () => run({ type: "showDiscs", colour: c, letter: null, on: !!hidden }),
        hidden ? "hide" : "reveal",
      ),
    ];
  }

  /** The cells for anyone in the list, a character or a colour group. */
  function cellsOf(s: TableState, who: Who): HTMLElement[] {
    if (isColour(who)) return groupCells(s, who);
    const pc = s.party.find((p) => p.id === who);
    return pc ? pcCells(pc) : [el("span", { class: "who" }, "?")];
  }

  /** The colours with discs on the map, in the usual order. */
  const coloursOf = (s: TableState) => DISC_COLOURS.filter((c) => (s.map?.discs ?? []).some((d) => d.colour === c));

  function renderStrip(s: TableState): void {
    const f = s.fight;
    stripEl.hidden = !f?.round || !f.current;
    if (!f?.round || !f.current) return;
    const discs = s.map?.discs ?? [];
    const groups = s.map?.groups ?? {};
    const next = nextTurn(f, (w) => takesTurns(w, discs, groups, s.party)).current;
    stripEl.replaceChildren(
      el("span", {}, `Round ${f.round}`),
      el("b", {}, `${whoName(s, f.current)} now`),
      ...(next && next !== f.current ? [el("span", {}, `${whoName(s, next)} next`)] : []),
    );
  }

  function renderFight(s: TableState): void {
    const f = s.fight;
    startBtn.hidden = !!f;
    endBtn.hidden = !f;
    // Once turns start, the pinned strip says the round.
    roundEl.textContent = f && !f.round ? "Enter the rolls, then Next turn" : "";
    roundState.textContent = f?.round ? `Round ${f.round}` : "";
    nextBtn.disabled = !f || f.entries.length === 0;
    renderStrip(s);
    const colours = coloursOf(s);
    emptyEl.hidden = s.party.length > 0 || colours.length > 0;
    emptyEl.textContent = s.map
      ? "Add the party in Setup, and place discs with Marker (M): a colour and a size, then tap the map. New discs start hidden."
      : "Add the party in Setup, and place a map: discs sit on its squares.";
    if (!f) {
      // Out of a fight: the party, then the groups.
      orderEl.replaceChildren(
        ...s.party.map((pc) => el("li", { class: "entry" }, ...pcCells(pc))),
        ...colours.map((c) => el("li", { class: "entry group-row" }, ...groupCells(s, c))),
      );
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
            class: `entry${isColour(e.who) ? " group-row" : ""}${current ? " current" : ""}${takesTurns(e.who, discs, groups, s.party) ? "" : " out"}`,
            "aria-current": current ? "step" : undefined,
          },
          rollBox(e.init, { "data-key": `init-${e.who}`, "aria-label": "Initiative" }, whoName(s, e.who), (init) =>
            run({ type: "initiative", who: e.who, init }),
          ),
          ...cellsOf(s, e.who),
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
          { class: `entry${isColour(who) ? " group-row" : ""}` },
          rollBox(null, { "data-key": `init-${who}`, "aria-label": "Initiative roll", placeholder: "Roll" }, whoName(s, who), (init) =>
            init === null ? undefined : run({ type: "initiative", who, init }),
          ),
          ...cellsOf(s, who),
        ),
      ),
    );
  }

  function render(): void {
    if (!state) return;
    // Rebuilding replaces the inputs: keep focus on the same box, so typing or pen input carries on.
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.key;
    renderFight(state);
    if (focused) document.querySelector<HTMLElement>(`#encounterPanel [data-key="${focused}"]`)?.focus();
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
