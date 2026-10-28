// The Party window (D-028): a floating window with a tab per character, the numbers the DM checks mid-fight, and a
// number pad for HP and temp HP. An Edit view sets everything else. Cards stay between sessions and outside undo (D-027).
import { MAX_PARTY, parseCharacterFields, type Character, type CharacterFields } from "../core/fight.ts";
import type { Command, TableState } from "../core/table.ts";
import type { DmApi } from "../main/dm-preload.ts";
import { button, el, field, NUMBER, stat, wholeOrNull } from "./dom.ts";
import { floatWin } from "./float-win.ts";
import { numpad } from "./numpad.ts";

const KEYS = ["name", "ac", "hpMax", "speed", "passive", "insight", "investigation", "spellDc", "notes"] as const;
type Draft = Record<(typeof KEYS)[number], string>;

export function initParty(terra: DmApi): { show: () => void } {
  let state: TableState | null = null;
  let tab: string | null = null;
  /** The card being edited (null id: a new one), with what has been typed so far. */
  let editing: { id: string | null; draft: Draft } | null = null;
  const run = (c: Command) => void terra.apply(c);
  const win = floatWin("party", { width: 400, at: { x: 860, y: 70 } });
  win.title.append(el("b", {}, "Party"));
  const pad = numpad(
    [
      { label: "− Damage", kind: "damage", className: "damage" },
      { label: "+ Heal", kind: "heal", className: "heal" },
      { label: "Temp HP", kind: "temp", className: "temp" },
    ],
    (kind, amount) => {
      if (!tab) return;
      if (kind === "temp") run({ type: "tempHp", id: tab, tempHp: amount });
      else run({ type: "characterHp", id: tab, change: kind === "damage" ? -amount : amount });
    },
  );

  const draftOf = (c?: Character): Draft => ({
    name: c?.name ?? "",
    ac: c?.ac.toString() ?? "",
    hpMax: c?.hpMax.toString() ?? "",
    speed: c?.speed.toString() ?? "30",
    passive: c?.passive.toString() ?? "",
    insight: c?.insight?.toString() ?? "",
    investigation: c?.investigation?.toString() ?? "",
    spellDc: c?.spellDc?.toString() ?? "",
    notes: c?.notes ?? "",
  });

  function editView(old: Character | undefined): HTMLElement {
    const d = editing!.draft;
    const status = el("p", { class: "hint", role: "status" });
    const save = () => {
      const n = (k: keyof Draft) => (d[k].trim() === "" ? null : (wholeOrNull(d[k]) ?? NaN));
      const hpMax = n("hpMax");
      // The same checks the main process makes, so a slip is explained instead of the card silently not saving.
      const fields: CharacterFields | null = parseCharacterFields({
        name: d.name,
        ac: n("ac"),
        hpMax,
        // A new character starts at full HP; an edit keeps their HP within the new maximum.
        hp: old ? Math.min(old.hp, hpMax ?? 0) : hpMax,
        tempHp: old?.tempHp ?? 0,
        speed: n("speed"),
        passive: n("passive"),
        insight: n("insight"),
        investigation: n("investigation"),
        spellDc: n("spellDc"),
        notes: d.notes,
      });
      if (!fields) {
        status.textContent =
          "Check the boxes: a name, AC 0–40, HP max 1–999, speed, and Perception 0–40. Insight, Investigation and save DC can stay empty.";
        return;
      }
      if (old) run({ type: "updateCharacter", character: { id: old.id, ...fields } });
      else run({ type: "addCharacter", character: fields });
      editing = null;
      render();
    };
    const f = (label: string, k: keyof Draft, attrs: Record<string, string>) =>
      field(label, d[k], { ...attrs, "data-key": `pc-${k}` }, (v) => (d[k] = v));
    const form = el(
      "form",
      { class: "card-form" },
      f("Name", "name", { type: "text", maxlength: "40" }),
      f("AC", "ac", { ...(NUMBER as Record<string, string>), max: "40" }),
      f("HP max", "hpMax", { ...(NUMBER as Record<string, string>), min: "1", max: "999" }),
      f("Speed (ft)", "speed", { ...(NUMBER as Record<string, string>), max: "999" }),
      f("Passive Perception", "passive", { ...(NUMBER as Record<string, string>), max: "40" }),
      f("Passive Insight", "insight", { ...(NUMBER as Record<string, string>), max: "40" }),
      f("Passive Investigation", "investigation", { ...(NUMBER as Record<string, string>), max: "40" }),
      f("Spell save DC", "spellDc", { ...(NUMBER as Record<string, string>), max: "40" }),
      f("Notes", "notes", { type: "textarea", maxlength: "2000", rows: "3" }),
      status,
      el(
        "div",
        { class: "row-buttons" },
        button("Cancel", {}, () => {
          editing = null;
          render();
        }),
        ...(old
          ? [
              button("Remove", { class: "danger" }, () => {
                editing = null;
                tab = null;
                run({ type: "removeCharacter", id: old.id });
              }),
            ]
          : []),
        button("Save", { class: "primary", type: "submit" }, () => undefined),
      ),
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      save();
    });
    return form;
  }

  function render(): void {
    if (!state || !win.isOpen()) return;
    const party = state.party;
    if (!party.some((c) => c.id === tab)) tab = party[0]?.id ?? null;
    const pc = party.find((c) => c.id === tab);
    win.actions.replaceChildren(
      ...(pc && !editing
        ? [
            button("Edit", {}, () => {
              editing = { id: pc.id, draft: draftOf(pc) };
              render();
            }),
          ]
        : []),
    );
    const tabs = el(
      "div",
      { class: "tabs", role: "tablist" },
      ...party.map((c) =>
        button(c.name, { role: "tab", "aria-selected": String(c.id === tab), class: c.hp === 0 ? "out" : undefined }, () => {
          tab = c.id;
          editing = null;
          render();
        }),
      ),
      button(
        "",
        { class: "icon", "aria-label": "Add a character", disabled: party.length >= MAX_PARTY },
        () => {
          editing = { id: null, draft: draftOf() };
          render();
        },
        "plus",
      ),
    );
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.key;
    if (editing) win.body.replaceChildren(tabs, editView(party.find((c) => c.id === editing!.id)));
    else if (!pc) win.body.replaceChildren(tabs, el("p", { class: "hint" }, "No characters yet. Tap + to add one."));
    else {
      pad.setTarget(pc.name);
      const opt = (v: number | null) => (v === null ? "—" : String(v));
      win.body.replaceChildren(
        tabs,
        el(
          "div",
          { class: "stats" },
          stat("AC", String(pc.ac)),
          stat("HP", `${pc.hp} / ${pc.hpMax}`),
          stat("Temp", String(pc.tempHp)),
          stat("Speed", `${pc.speed} ft`),
          stat("Perception", String(pc.passive)),
          stat("Insight", opt(pc.insight)),
          stat("Investig.", opt(pc.investigation)),
          stat("Save DC", opt(pc.spellDc)),
        ),
        el(
          "span",
          { class: "hp-bar wide" },
          el("i", {
            class: pc.hp * 2 <= pc.hpMax ? (pc.hp * 4 <= pc.hpMax ? "nearDeath" : "bloodied") : "fine",
            style: `width:${Math.round((pc.hp / pc.hpMax) * 100)}%`,
          }),
        ),
        pad.el,
        ...(pc.notes ? [el("p", { class: "notes" }, pc.notes)] : []),
      );
    }
    if (focused) win.body.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus();
  }

  terra.onState((s) => {
    state = s;
    render();
  });
  terra.getState().then((s) => {
    state = s;
    render();
  });
  return {
    show: () => {
      win.open();
      render();
    },
  };
}
