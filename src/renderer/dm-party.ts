// The Party window (D-028): a floating window with a tab per character, the numbers the DM checks mid-fight, and a
// number pad for HP and temp HP. An Edit view sets everything else. Cards stay between sessions and outside undo (D-027).
import {
  conditionFromHp,
  initialsOf,
  LIGHTS,
  MAX_PARTY,
  parseCharacterFields,
  PC_CONDITIONS,
  type Character,
  type CharacterFields,
  type Condition,
  type Light,
} from "../core/fight.ts";
import type { Command, TableState } from "../core/table.ts";
import type { DmApi } from "../main/dm-preload.ts";
import { button, el, field, NUMBER, stat, wholeOrNull } from "./dom.ts";
import { cropView } from "./dm-token-crop.ts";
import { sheetWin } from "./panel.ts";
import { numpad } from "./numpad.ts";

const KEYS = ["name", "ac", "hpMax", "speed", "darkvision", "passive", "insight", "investigation", "spellDc", "notes"] as const;
type Draft = Record<(typeof KEYS)[number], string> & { light: Light };
/** The Light choice's words (D-047). */
const LIGHT_WORD: Record<Light, string> = { none: "No light", torch: "Torch", lantern: "Hooded lantern" };
const WORD: Record<Condition, string> = { fine: "Fine", bloodied: "Bloodied", nearDeath: "Near death", down: "Down" };

/** The light a character carries: lights their sight on a dark scene (D-047). */
function lightField(value: Light, onChange: (v: Light) => void): HTMLLabelElement {
  const select = el("select", { "data-key": "pc-light" }, ...LIGHTS.map((l) => el("option", { value: l }, LIGHT_WORD[l])));
  select.value = value;
  select.addEventListener("change", () => onChange(select.value as Light));
  return el("label", {}, "Light", select);
}

export function initParty(
  terra: DmApi,
  placeToken: (id: string) => void,
  placeRow: () => void,
  dropToken: (id: string, clientX: number, clientY: number) => boolean,
): { show: (id?: string) => void; roster: HTMLElement } {
  let state: TableState | null = null;
  let tab: string | null = null;
  /** The picture being cropped for a character's token (D-045). */
  let cropping: { id: string; file: File } | null = null;
  /** Says what the next tap on the map does, after Place on map or Place party. */
  let placingHint: string | null = null;
  /** The card being edited (null id: a new one), with what has been typed so far. */
  let editing: { id: string | null; draft: Draft } | null = null;
  /** Remove asks first: a card is outside undo, so a slip would lose it for good (D-027, D-034). */
  let confirmRemove = false;
  const run = (c: Command) => void terra.apply(c);
  const win = sheetWin("party");
  win.title.append(el("b", {}, "Party"));
  const pad = numpad(
    [
      { label: "− Damage", kind: "damage", className: "damage" },
      { label: "+ Heal", kind: "heal", className: "heal" },
      { label: "Temp HP", kind: "temp", className: "temp", zeroOk: true },
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
    darkvision: c?.darkvision.toString() ?? "0",
    light: c?.light ?? "none",
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
      const n = (k: (typeof KEYS)[number]) => (d[k].trim() === "" ? null : (wholeOrNull(d[k]) ?? NaN));
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
        // A blank darkvision box saves 0.
        darkvision: n("darkvision") ?? 0,
        light: d.light,
        passive: n("passive"),
        insight: n("insight"),
        investigation: n("investigation"),
        spellDc: n("spellDc"),
        notes: d.notes,
        picture: old?.picture,
        farSide: old?.farSide,
        mini: old?.mini,
        conditions: old?.conditions,
      });
      if (!fields) {
        status.textContent =
          "Check the boxes: a name, AC 0–40, HP max 1–999, speed, and Perception 0–40. Darkvision, Insight, Investigation and save DC can stay empty.";
        return;
      }
      if (old) run({ type: "updateCharacter", character: { id: old.id, ...fields } });
      else run({ type: "addCharacter", character: fields });
      editing = null;
      render();
    };
    const f = (label: string, k: (typeof KEYS)[number], attrs: Record<string, string>) =>
      field(label, d[k], { ...attrs, "data-key": `pc-${k}` }, (v) => (d[k] = v));
    const form = el(
      "form",
      { class: "card-form" },
      f("Name", "name", { type: "text", maxlength: "40" }),
      f("AC", "ac", { ...(NUMBER as Record<string, string>), max: "40" }),
      f("HP max", "hpMax", { ...(NUMBER as Record<string, string>), min: "1", max: "999" }),
      f("Speed (ft)", "speed", { ...(NUMBER as Record<string, string>), max: "999" }),
      f("Darkvision (ft)", "darkvision", { ...(NUMBER as Record<string, string>), max: "300", step: "5" }),
      lightField(d.light, (v) => (d.light = v)),
      f("Passive Perception", "passive", { ...(NUMBER as Record<string, string>), max: "40" }),
      f("Passive Insight", "insight", { ...(NUMBER as Record<string, string>), max: "40" }),
      f("Passive Investigation", "investigation", { ...(NUMBER as Record<string, string>), max: "40" }),
      f("Spell save DC", "spellDc", { ...(NUMBER as Record<string, string>), max: "40" }),
      f("Notes", "notes", { type: "textarea", maxlength: "2000", rows: "3" }),
      status,
      old && confirmRemove
        ? el(
            "div",
            { class: "row-buttons confirm" },
            el("p", { class: "hint" }, `Remove ${old.name}? This can't be undone.`),
            button("Keep", {}, () => {
              confirmRemove = false;
              render();
            }),
            button("Remove", { class: "danger" }, () => {
              editing = null;
              confirmRemove = false;
              tab = null;
              run({ type: "removeCharacter", id: old.id });
            }),
          )
        : el(
            "div",
            { class: "row-buttons" },
            button("Cancel", {}, () => {
              editing = null;
              render();
            }),
            ...(old
              ? [
                  button("Remove…", { class: "danger" }, () => {
                    confirmRemove = true;
                    render();
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

  /** A character's token: its picture, whether it's on this map, how it stands, and the conditions it shows (D-045). */
  function tokenSection(pc: Character): HTMLElement {
    const edit = (change: Partial<Character>) => run({ type: "updateCharacter", character: { ...pc, ...change } });
    const onMap = !!state?.map?.tokens.some((t) => t.id === pc.id);
    const file = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp", hidden: true, "data-key": "pc-picture-file" });
    file.addEventListener("change", () => {
      const f = file.files?.[0];
      if (!f) return;
      cropping = { id: pc.id, file: f };
      render();
    });
    const toggle = (label: string, on: boolean, change: () => void, key: string) =>
      button(label, { "aria-pressed": String(on), "data-key": key }, change);
    return el(
      "section",
      { class: "token-section" },
      el("h4", {}, "Token"),
      el(
        "div",
        { class: "token-row" },
        pc.picture
          ? el("img", { class: "token-thumb", src: `terra-portrait://pc/${pc.picture}`, alt: `${pc.name}'s token picture` })
          : el("span", { class: "token-thumb none", "aria-hidden": "true" }, initialsOf(pc.name)),
        el(
          "div",
          { class: "token-actions" },
          file,
          button(pc.picture ? "Change picture…" : "Picture…", { "data-key": "pc-picture" }, () => file.click()),
          ...(pc.picture ? [button("No picture", {}, () => edit({ picture: null }))] : []),
          state?.map
            ? button(onMap ? "Take off map" : "Place on map", { "data-key": "pc-place" }, () => {
                if (onMap) return run({ type: "token", id: pc.id, at: null });
                placeToken(pc.id);
                placingHint = "Tap the map where they stand. Drag the token with Select to move it.";
                render();
              })
            : el("small", {}, "Place a map to put this token on it."),
        ),
      ),
      ...(placingHint ? [el("p", { class: "hint", role: "status" }, placingHint)] : []),
      el(
        "div",
        { class: "row-buttons" },
        toggle("Mini on it", pc.mini, () => edit({ mini: !pc.mini }), "pc-mini"),
        toggle(pc.farSide ? "Faces far side" : "Faces near side", pc.farSide, () => edit({ farSide: !pc.farSide }), "pc-side"),
      ),
      el(
        "div",
        { class: "condition-chips", role: "group", "aria-label": "Conditions shown on the token" },
        ...PC_CONDITIONS.map((c) =>
          toggle(
            c[0]!.toUpperCase() + c.slice(1),
            pc.conditions.includes(c),
            () => edit({ conditions: pc.conditions.includes(c) ? pc.conditions.filter((x) => x !== c) : [...pc.conditions, c] }),
            `pc-condition-${c}`,
          ),
        ),
      ),
    );
  }

  function render(): void {
    if (!state || !win.isOpen()) return;
    if (cropping && !state.party.some((c) => c.id === cropping!.id)) cropping = null;
    if (cropping) {
      const { id, file } = cropping;
      const pc = state.party.find((c) => c.id === id)!;
      win.actions.replaceChildren();
      // Rebuilt only once: a state change mustn't drop the crop under the DM's finger.
      if (win.body.dataset.cropping !== id) {
        win.body.dataset.cropping = id;
        win.body.replaceChildren(
          cropView(
            file,
            {
              initials: initialsOf(pc.name),
              tint: Number(pc.id.slice(3)),
              farSide: false,
              mini: false,
              turn: false,
              down: false,
              conditions: [],
            },
            async (bytes) => {
              const picture = await terra.savePicture(bytes);
              const now = state?.party.find((c) => c.id === id);
              cropping = null;
              delete win.body.dataset.cropping;
              if (now) run({ type: "updateCharacter", character: { ...now, picture } });
              render();
            },
            () => {
              cropping = null;
              delete win.body.dataset.cropping;
              render();
            },
          ),
        );
      }
      return;
    }
    const party = state.party;
    if (!party.some((c) => c.id === tab)) tab = party[0]?.id ?? null;
    const pc = party.find((c) => c.id === tab);
    win.actions.replaceChildren(
      // Place party (D-046): one button, then one tap on the map for the whole row.
      ...(state.map && party.length && !editing
        ? [
            button("Place party", { "data-key": "place-party" }, () => {
              placeRow();
              placingHint =
                "Tap where the first one stands; the rest go to their right, in party order. Drag a token with Select to move it.";
              render();
            }),
          ]
        : []),
      ...(pc && !editing
        ? [
            button("Edit", {}, () => {
              editing = { id: pc.id, draft: draftOf(pc) };
              confirmRemove = false;
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
          confirmRemove = false;
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
      const word = conditionFromHp(pc.hp, pc.hpMax);
      win.body.replaceChildren(
        tabs,
        el(
          "div",
          { class: "stats" },
          stat("AC", String(pc.ac)),
          stat("HP", `${pc.hp} / ${pc.hpMax}`),
          stat("Temp", String(pc.tempHp)),
          stat("Speed", `${pc.speed} ft`),
          stat("Darkvision", pc.darkvision ? `${pc.darkvision} ft` : "—"),
          stat("Light", pc.light === "none" ? "—" : LIGHT_WORD[pc.light]),
          stat("Perception", String(pc.passive)),
          stat("Insight", opt(pc.insight)),
          stat("Investig.", opt(pc.investigation)),
          stat("Save DC", opt(pc.spellDc)),
        ),
        // The word beside the bar, so the state never rests on red or green alone (D-033).
        el(
          "span",
          { class: `hp-line ${word}` },
          el("span", { class: "hp-bar" }, el("i", { class: word, style: `width:${Math.round((pc.hp / pc.hpMax) * 100)}%` })),
          el("span", { class: "hp-word" }, WORD[word]),
        ),
        pad.el,
        tokenSection(pc),
        ...(pc.notes ? [el("p", { class: "notes" }, pc.notes)] : []),
      );
      placingHint = null;
    }
    if (focused) win.body.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus();
  }

  /**
   * The party right in Setup (Morgan, 2026-11-07: no Party sheet click to see them): a row per character. A tap opens
   * their card; a drag onto the map puts their token where it's let go (D-045 item 2 still lets Place on map and a tap).
   */
  const roster = el("div", { class: "roster" });
  const DRAG_PX = 6;
  function rosterRow(pc: Character): HTMLElement {
    const onMap = !!state?.map?.tokens.some((t) => t.id === pc.id);
    const row = el(
      "div",
      {
        class: "roster-row",
        role: "button",
        tabindex: "0",
        "data-pc": pc.id,
        title: state?.map ? "Tap to open; drag onto the map to place" : "Tap to open",
      },
      pc.picture
        ? el("img", { class: "roster-thumb", src: `terra-portrait://pc/${pc.picture}`, alt: "", draggable: "false" })
        : el("span", { class: "roster-thumb none", "aria-hidden": "true" }, initialsOf(pc.name)),
      el("span", { class: "roster-name" }, el("b", {}, pc.name), el("small", {}, `AC ${pc.ac} · HP ${pc.hp} / ${pc.hpMax}`)),
      ...(onMap ? [el("span", { class: "roster-on", title: "Their token is on this map" }, "On map")] : []),
    );
    let down: { id: number; x: number; y: number; ghost: HTMLElement | null } | null = null;
    row.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, ghost: null };
      row.setPointerCapture(e.pointerId);
    });
    row.addEventListener("pointermove", (e) => {
      if (!down || down.id !== e.pointerId || !state?.map) return;
      if (!down.ghost && Math.hypot(e.clientX - down.x, e.clientY - down.y) < DRAG_PX) return;
      if (!down.ghost) {
        const face = row.querySelector(".roster-thumb")!.cloneNode(true) as HTMLElement;
        down.ghost = el("div", { class: "roster-ghost", "aria-hidden": "true" }, face);
        document.body.append(down.ghost);
      }
      Object.assign(down.ghost.style, { left: `${e.clientX}px`, top: `${e.clientY}px` });
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (!down || down.id !== e.pointerId) return;
      const dragged = !!down.ghost;
      down.ghost?.remove();
      down = null;
      if (cancelled) return;
      if (dragged) dropToken(pc.id, e.clientX, e.clientY);
      else open(pc.id);
    };
    row.addEventListener("pointerup", (e) => end(e, false));
    row.addEventListener("pointercancel", (e) => end(e, true));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") (e.preventDefault(), open(pc.id));
    });
    return row;
  }
  function renderRoster(): void {
    const party = state?.party ?? [];
    roster.replaceChildren(
      ...(party.length
        ? [
            ...party.map(rosterRow),
            el(
              "p",
              { class: "hint" },
              state?.map ? "Drag someone onto the map to place their token." : "Place a map to put their tokens on it.",
            ),
          ]
        : [el("p", { class: "hint" }, "No one yet. Add each character once; they're kept between sessions.")]),
      button(party.length ? "Edit party…" : "Add a character…", {}, () => open()),
    );
  }
  function open(id?: string): void {
    if (id) tab = id;
    win.open();
    render();
  }

  terra.onState((s) => {
    state = s;
    render();
    renderRoster();
  });
  terra.getState().then((s) => {
    state = s;
    render();
    renderRoster();
  });
  return { show: open, roster };
}
