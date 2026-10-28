// DM window, left panel (step 6, D-027): initiative, the enemy discs by colour group, and the character cards. Every
// control is at least 40 px for a finger or the pen (D-023). The panel is rebuilt from each new state; focus and any
// card being edited survive the rebuild.
import {
  DISC_COLOURS,
  isColour,
  parseCharacterFields,
  takesTurns,
  type Character,
  type Condition,
  type DiscColour,
  type Who,
} from "../core/fight.ts";
import type { Command, TableState } from "../core/table.ts";
import type { DmApi } from "../main/dm-preload.ts";
import { discKey } from "./dm-map.ts";
import { icon, type IconName } from "./icons.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const roundEl = $<HTMLSpanElement>("round");
const startBtn = $<HTMLButtonElement>("startFight");
const endBtn = $<HTMLButtonElement>("endFight");
const orderEl = $<HTMLOListElement>("order");
const unrolledBox = $<HTMLDivElement>("unrolledBox");
const unrolledEl = $<HTMLUListElement>("unrolled");
const groupsEl = $<HTMLDivElement>("groups");
const markersEmpty = $<HTMLParagraphElement>("markersEmpty");
const partyEl = $<HTMLUListElement>("party");
const addBtn = $<HTMLButtonElement>("addCharacter");
const nextBtn = $<HTMLButtonElement>("nextTurn");

const COLOUR_NAME: Record<DiscColour, string> = {
  yellow: "Yellow",
  red: "Red",
  blue: "Blue",
  green: "Green",
  purple: "Purple",
  orange: "Orange",
};
const CONDITION_TEXT: Record<Condition, string> = { fine: "Fine", bloodied: "Bloodied", nearDeath: "Near death", down: "Down" };
/** A tap on the condition steps through these, round and round. */
const NEXT_CONDITION: Record<Condition, Condition> = { fine: "bloodied", bloodied: "nearDeath", nearDeath: "down", down: "fine" };

/** The card fields as typed, kept between rebuilds. */
type Draft = { name: string; ac: string; hpMax: string; passive: string; speed: string };
type Editing = { id: string | null; draft: Draft };

type Attrs = Record<string, string | boolean | undefined>;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "class") e.className = String(v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  e.append(...kids);
  return e;
}
function button(label: string, attrs: Attrs, onClick: () => void, iconName?: IconName): HTMLButtonElement {
  const b = el("button", { type: "button", ...attrs }, label);
  if (iconName) b.insertAdjacentHTML("afterbegin", icon(iconName));
  b.addEventListener("click", onClick);
  return b;
}
/** A whole-number box for a finger or the pen: the number keyboard on touch, sent when the DM leaves it or presses Enter. */
function numberBox(value: number | null, attrs: Attrs, onChange: (v: number | null) => void): HTMLInputElement {
  const input = el("input", { type: "number", inputmode: "numeric", step: "1", ...attrs });
  input.value = value === null ? "" : String(value);
  input.addEventListener("change", () => {
    const v = input.value.trim();
    onChange(v === "" ? null : Number.isInteger(Number(v)) ? Number(v) : null);
  });
  return input;
}
const swatch = (c: DiscColour) => el("span", { class: `swatch ${c}`, "aria-hidden": "true" });

export function initFight(
  terra: DmApi,
  selection: { get: () => string | null; set: (key: string | null) => void },
): { render: () => void; next: () => void } {
  let state: TableState | null = null;
  let editing: Editing | null = null;
  const run = (c: Command) => void terra.apply(c);

  /** A label for an initiative row: the character's name, or the colour group's name and its letters. */
  function whoLabel(s: TableState, who: Who): HTMLElement {
    if (!isColour(who)) return el("span", { class: "who" }, s.party.find((p) => p.id === who)?.name ?? "?");
    const discs = (s.map?.discs ?? []).filter((d) => d.colour === who && d.condition !== "down");
    const hidden = discs.length > 0 && discs.every((d) => !d.shown);
    const name = s.map?.groups[who] ?? COLOUR_NAME[who];
    const letters = discs.map((d) => d.letter).join(" ");
    return el("span", { class: "who" }, swatch(who), `${name} `, el("small", {}, letters + (hidden ? " · hidden" : "")));
  }

  function renderFight(s: TableState): void {
    const f = s.fight;
    startBtn.hidden = !!f;
    endBtn.hidden = !f;
    roundEl.textContent = !f ? "" : f.round ? `Round ${f.round}` : "Type the rolls, then Next turn";
    nextBtn.disabled = !f || f.entries.length === 0;
    if (!f) {
      orderEl.replaceChildren();
      unrolledBox.hidden = true;
      return;
    }
    const discs = s.map?.discs ?? [];
    orderEl.replaceChildren(
      ...f.entries.map((e, i) => {
        const tieUp = f.entries[i - 1]?.init === e.init;
        const tieDown = f.entries[i + 1]?.init === e.init;
        const active = takesTurns(e.who, discs, s.party);
        return el(
          "li",
          {
            class: `entry${e.who === f.current ? " current" : ""}${active ? "" : " out"}`,
            "aria-current": e.who === f.current ? "step" : undefined,
          },
          whoLabel(s, e.who),
          numberBox(e.init, { "data-key": `init-${e.who}`, "aria-label": "Initiative", min: "-20", max: "99" }, (init) =>
            run({ type: "initiative", who: e.who, init }),
          ),
          button(
            "",
            { class: "icon", "aria-label": "Move up (ties only)", disabled: !tieUp },
            () => run({ type: "swapTie", who: e.who, by: -1 }),
            "up",
          ),
          button(
            "",
            { class: "icon", "aria-label": "Move down (ties only)", disabled: !tieDown },
            () => run({ type: "swapTie", who: e.who, by: 1 }),
            "down",
          ),
        );
      }),
    );
    // Everyone who could join: the party, and each colour with a disc that isn't down. One roll per colour (D-027).
    const rolled = new Set(f.entries.map((e) => e.who));
    const waiting = [...s.party.map((p) => p.id), ...DISC_COLOURS.filter((c) => takesTurns(c, discs, s.party))].filter(
      (w) => !rolled.has(w),
    );
    unrolledBox.hidden = waiting.length === 0;
    unrolledEl.replaceChildren(
      ...waiting.map((who) =>
        el(
          "li",
          { class: "entry" },
          whoLabel(s, who),
          numberBox(
            null,
            { "data-key": `init-${who}`, "aria-label": "Initiative roll", placeholder: "Roll", min: "-20", max: "99" },
            (init) => (init === null ? undefined : run({ type: "initiative", who, init })),
          ),
        ),
      ),
    );
  }

  function renderMarkers(s: TableState): void {
    const discs = s.map?.discs ?? [];
    markersEmpty.hidden = discs.length > 0;
    markersEmpty.textContent = s.map
      ? "Pick Marker (M) below, a colour and a size, then tap the map. New discs start hidden."
      : "Place a map first: discs sit on its squares.";
    const picked = selection.get();
    groupsEl.replaceChildren(
      ...DISC_COLOURS.filter((c) => discs.some((d) => d.colour === c)).map((c) => {
        const mine = discs.filter((d) => d.colour === c);
        const allShown = mine.every((d) => d.shown);
        const name = el("input", {
          type: "text",
          maxlength: "40",
          placeholder: `${COLOUR_NAME[c]}: name it (only you see this)`,
          "aria-label": `Name for the ${COLOUR_NAME[c].toLowerCase()} group`,
          "data-key": `name-${c}`,
        });
        name.value = s.map?.groups[c] ?? "";
        name.addEventListener("change", () => run({ type: "nameGroup", colour: c, name: name.value }));
        return el(
          "div",
          { class: "group" },
          el(
            "div",
            { class: "group-head" },
            swatch(c),
            name,
            button(
              allShown ? "Shown" : "Hidden",
              { class: "eye", "aria-pressed": String(allShown), "aria-label": `Show or hide every ${COLOUR_NAME[c].toLowerCase()} disc` },
              () => run({ type: "showDiscs", colour: c, letter: null, on: !allShown }),
              allShown ? "reveal" : "hide",
            ),
          ),
          el(
            "ul",
            { class: "entries" },
            ...mine.map((d) => {
              const key = discKey(d);
              const row = el(
                "li",
                { class: `entry disc${picked === key ? " picked" : ""}${d.condition === "down" ? " out" : ""}`, "data-disc": key },
                button(d.letter, { class: `badge ${c}`, "aria-label": `Pick ${COLOUR_NAME[c]} ${d.letter} on the map` }, () =>
                  selection.set(picked === key ? null : key),
                ),
                button(
                  "",
                  {
                    class: "icon",
                    "aria-pressed": String(d.shown),
                    "aria-label": d.shown ? `${d.letter} is on the table: hide it` : `${d.letter} is hidden: show it`,
                  },
                  () => run({ type: "showDiscs", colour: c, letter: d.letter, on: !d.shown }),
                  d.shown ? "reveal" : "hide",
                ),
                button(
                  CONDITION_TEXT[d.condition],
                  { class: `condition ${d.condition}`, "aria-label": `Condition: ${CONDITION_TEXT[d.condition]}. Tap for the next.` },
                  () => run({ type: "condition", colour: c, letter: d.letter, condition: NEXT_CONDITION[d.condition] }),
                ),
                button(
                  "",
                  { class: "icon", "aria-label": `Take ${COLOUR_NAME[c]} ${d.letter} off the map` },
                  () => run({ type: "removeDisc", colour: c, letter: d.letter }),
                  "close",
                ),
              );
              return row;
            }),
          ),
        );
      }),
    );
    groupsEl.querySelector(".picked")?.scrollIntoView({ block: "nearest" });
  }

  const blankDraft = (): Draft => ({ name: "", ac: "", hpMax: "", passive: "", speed: "30" });
  const draftOf = (c: Character): Draft => ({
    name: c.name,
    ac: String(c.ac),
    hpMax: String(c.hpMax),
    passive: String(c.passive),
    speed: String(c.speed),
  });

  function cardForm(ed: Editing, old: Character | undefined): HTMLElement {
    const field = (label: string, key: keyof Draft, attrs: Attrs) => {
      const input = el("input", { ...attrs, "data-key": `card-${key}` });
      input.value = ed.draft[key];
      input.addEventListener("input", () => (ed.draft[key] = input.value));
      return el("label", { class: key === "name" ? "wide" : undefined }, label, input);
    };
    const num = { type: "number", inputmode: "numeric", step: "1", min: "0" };
    const status = el("p", { class: "hint", role: "status" });
    const save = () => {
      const d = ed.draft;
      const hpMax = d.hpMax.trim() === "" ? NaN : Number(d.hpMax);
      // A new character starts at full HP; an edit keeps the HP they have, within the new maximum.
      const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
      // The same check the main process makes, so the DM hears what's wrong instead of the card silently not saving.
      const fields = parseCharacterFields({
        name: d.name,
        ac: num(d.ac),
        hpMax,
        hp: old ? Math.min(old.hp, hpMax) : hpMax,
        passive: num(d.passive),
        speed: num(d.speed),
      });
      if (!fields) {
        status.textContent = "Check the boxes: a name, and whole numbers (AC 0–40, HP 1–999, Perception 0–40).";
        return;
      }
      editing = null;
      run(old ? { type: "updateCharacter", character: { id: old.id, ...fields } } : { type: "addCharacter", character: fields });
      render();
    };
    const form = el(
      "form",
      { class: "card-form" },
      field("Name", "name", { type: "text", maxlength: "40" }),
      field("AC", "ac", { ...num, max: "40" }),
      field("HP max", "hpMax", { ...num, min: "1", max: "999" }),
      field("Passive Perception", "passive", { ...num, max: "40" }),
      field("Speed (ft)", "speed", { ...num, max: "999" }),
      status,
      el(
        "div",
        { class: "row-buttons" },
        button("Cancel", {}, () => {
          editing = null;
          render();
        }),
        ...(old ? [button("Remove", { class: "danger" }, () => ((editing = null), run({ type: "removeCharacter", id: old.id })))] : []),
        // A submit button, so Enter in any box saves too.
        button("Save", { class: "primary", type: "submit" }, () => undefined),
      ),
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      save();
    });
    return form;
  }

  function renderParty(s: TableState): void {
    const card = (c: Character) => {
      if (editing?.id === c.id) return el("li", { class: "pc editing" }, cardForm(editing, c));
      const setHp = (hp: number | null) =>
        hp !== null && run({ type: "updateCharacter", character: { ...c, hp: Math.max(0, Math.min(c.hpMax, hp)) } });
      return el(
        "li",
        { class: `pc${c.hp === 0 ? " out" : ""}` },
        el(
          "div",
          { class: "pc-head" },
          el("strong", {}, c.name),
          button(
            "",
            { class: "icon", "aria-label": `Edit ${c.name}` },
            () => ((editing = { id: c.id, draft: draftOf(c) }), render()),
            "edit",
          ),
        ),
        el("p", { class: "stats" }, `AC ${c.ac} · Perception ${c.passive} · ${c.speed} ft`),
        el(
          "div",
          { class: "hp" },
          button("", { class: "icon", "aria-label": `${c.name} loses 1 HP` }, () => setHp(c.hp - 1), "minus"),
          numberBox(c.hp, { "data-key": `hp-${c.id}`, "aria-label": `${c.name}'s HP`, min: "0", max: String(c.hpMax) }, setHp),
          el("span", {}, `/ ${c.hpMax} HP`),
          button("", { class: "icon", "aria-label": `${c.name} gains 1 HP` }, () => setHp(c.hp + 1), "plus"),
        ),
      );
    };
    const items = s.party.map(card);
    if (editing?.id === null) items.push(el("li", { class: "pc editing" }, cardForm(editing, undefined)));
    partyEl.replaceChildren(...items);
    addBtn.hidden = editing?.id === null;
    addBtn.disabled = s.party.length >= 12;
  }

  function render(): void {
    if (!state) return;
    // Rebuilding replaces the inputs: keep focus on the same box, so typing or pen input carries on.
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.key;
    renderFight(state);
    renderMarkers(state);
    renderParty(state);
    if (focused) document.querySelector<HTMLElement>(`.side.left [data-key="${focused}"]`)?.focus();
  }

  startBtn.addEventListener("click", () => run({ type: "startFight" }));
  endBtn.addEventListener("click", () => run({ type: "endFight" }));
  nextBtn.addEventListener("click", () => run({ type: "nextTurn" }));
  addBtn.addEventListener("click", () => {
    editing = { id: null, draft: blankDraft() };
    render();
    partyEl.querySelector<HTMLInputElement>('[data-key="card-name"]')?.focus();
  });
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
