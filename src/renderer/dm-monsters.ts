// Monster windows (D-028): one floating window per colour group with AC, speed, HP max, each disc's HP and a number pad,
// an Edit view for the group and its discs, and a Book view with the stat block from the private library. DM-only.
import type { CreatureHit, StatBlock } from "../core/creatures.ts";
import {
  blankGroup,
  conditionOf,
  parseGroupInfo,
  discHp,
  discMax,
  type Condition,
  type Disc,
  type DiscColour,
  type GroupInfo,
} from "../core/fight.ts";
import type { Command, TableState } from "../core/table.ts";
import type { DmApi } from "../main/dm-preload.ts";
import { discKey } from "./dm-map.ts";
import { button, COLOUR_NAME, el, field, NUMBER, stat, swatch, wholeOrNull } from "./dom.ts";
import { floatWin, type FloatWin } from "./float-win.ts";
import { numpad, type Numpad } from "./numpad.ts";

const WORD: Record<Condition, string> = { fine: "Fine", bloodied: "Bloodied", nearDeath: "Near death", down: "Down" };
const NEXT_CONDITION: Record<Condition, Condition> = { fine: "bloodied", bloodied: "nearDeath", nearDeath: "down", down: "fine" };

type View = "hp" | "edit" | "book";
type Draft = { info: Record<"name" | "ac" | "speed" | "hpMax" | "notes", string>; discMax: Record<string, string> };
type Panel = {
  win: FloatWin;
  pad: Numpad;
  view: View;
  /** The map this panel's view and draft belong to; another map starts the panel afresh. */
  mapId: string | null;
  draft: Draft | null;
  /** `choosing`: the DM asked to pick a different creature, so the linked one isn't loaded back. `loading`: the key on its way. */
  book: { query: string; hits: CreatureHit[]; block: StatBlock | null; status: string; choosing: boolean; loading: string | null };
};

export function initMonsters(
  terra: DmApi,
  selection: { get: () => string | null; set: (key: string | null, open?: boolean) => void },
): { show: (colour: DiscColour) => void; render: () => void } {
  let state: TableState | null = null;
  const panels = new Map<DiscColour, Panel>();
  const run = (c: Command) => void terra.apply(c);
  const groupOf = (s: TableState, c: DiscColour): GroupInfo => s.map?.groups[c] ?? blankGroup();
  const discsOf = (s: TableState, c: DiscColour) => (s.map?.discs ?? []).filter((d) => d.colour === c);
  /** The disc the pad acts on: the picked one if it is this colour, else the first that isn't down. */
  function target(s: TableState, c: DiscColour): Disc | null {
    const discs = discsOf(s, c);
    return discs.find((d) => discKey(d) === selection.get()) ?? discs.find((d) => conditionOf(d, s.map!.groups) !== "down") ?? null;
  }

  function panel(c: DiscColour): Panel {
    let p = panels.get(c);
    if (p) return p;
    const i = panels.size;
    const win = floatWin(`monster-${c}`, { width: 380, at: { x: 330 + i * 28, y: 70 + i * 28 } });
    const pad = numpad(
      [
        { label: "− Damage", kind: "damage", className: "damage" },
        { label: "+ Heal", kind: "heal", className: "heal" },
      ],
      (kind, amount) => {
        const d = state && target(state, c);
        if (d) run({ type: "discHp", colour: c, letter: d.letter, change: kind === "damage" ? -amount : amount });
      },
    );
    p = {
      win,
      pad,
      view: "hp",
      draft: null,
      mapId: null,
      book: { query: "", hits: [], block: null, status: "", choosing: false, loading: null },
    };
    panels.set(c, p);
    return p;
  }

  function show(c: DiscColour): void {
    const p = panel(c);
    p.win.open();
    render();
  }

  function renderPanel(s: TableState, c: DiscColour, p: Panel): void {
    const g = groupOf(s, c);
    const discs = discsOf(s, c);
    if (!discs.length && !s.map) return p.win.close();
    // A new map, or an undo of the link, mustn't leave an old draft or stat block showing (D-028).
    if (p.mapId !== (s.map?.id ?? null)) {
      p.mapId = s.map?.id ?? null;
      p.view = "hp";
      p.draft = null;
      p.book = { query: "", hits: [], block: null, status: "", choosing: false, loading: null };
    }
    if (p.book.block && p.book.block.key !== g.creature) p.book.block = null;
    // The Book view shows the linked stat block once the link is in the state, however it got there (Use, undo).
    if (p.view === "book" && g.creature && !p.book.choosing && !p.book.block && p.book.loading !== g.creature) void openBook(c, p, g);
    p.win.title.replaceChildren(swatch(c), el("b", {}, g.name || COLOUR_NAME[c]));
    const tab = (v: View, label: string) =>
      button(label, { "aria-pressed": String(p.view === v) }, () => {
        p.view = p.view === v ? "hp" : v;
        if (p.view === "edit") p.draft = draftOf(g, discs);
        if (p.view === "book") {
          p.book.choosing = false;
          void openBook(c, p, g);
        }
        render();
      });
    p.win.actions.replaceChildren(tab("book", "Book"), tab("edit", "Edit"));
    if (p.view === "edit") return p.win.body.replaceChildren(editView(s, c, p, g, discs));
    if (p.view === "book") return p.win.body.replaceChildren(bookView(c, p, g));

    const init = s.fight?.entries.find((e) => e.who === c)?.init;
    const anyMax = discs.some((d) => discMax(d, s.map!.groups) !== null) || g.hpMax !== null;
    const t = target(s, c);
    p.pad.setTarget(t && discMax(t, s.map!.groups) !== null ? `${COLOUR_NAME[c]} ${t.letter}` : null);
    p.win.body.replaceChildren(
      el(
        "div",
        { class: "stats" },
        stat("AC", g.ac === null ? "—" : String(g.ac)),
        stat("Speed", g.speed === null ? "—" : `${g.speed} ft`),
        stat("HP max", g.hpMax === null ? "—" : String(g.hpMax)),
        stat("Init", init === undefined ? "—" : String(init)),
      ),
      el(
        "ul",
        { class: "hp-rows" },
        ...discs.map((d) => {
          const max = discMax(d, s.map!.groups);
          const hp = discHp(d, s.map!.groups);
          const word = conditionOf(d, s.map!.groups);
          const picked = t && discKey(t) === discKey(d);
          const pick = button(
            "",
            {
              class: `hp-pick${picked ? " picked" : ""} ${word}`,
              "aria-pressed": String(!!picked),
              "aria-label": `Pick ${COLOUR_NAME[c]} ${d.letter}`,
            },
            () => selection.set(discKey(d)),
          );
          pick.append(
            el("span", { class: `badge ${c}` }, d.letter),
            max === null
              ? el("span", { class: "hp-word" }, WORD[word])
              : el(
                  "span",
                  { class: "hp-mid" },
                  el("span", { class: "hp-bar" }, el("i", { class: word, style: `width:${Math.round(((hp ?? 0) / max) * 100)}%` })),
                  el("span", { class: "hp-word" }, WORD[word]),
                ),
            el("span", { class: "hp-num" }, max === null ? "" : `${hp} / ${max}${d.hpMax !== null ? " ✎" : ""}`),
          );
          return el(
            "li",
            {},
            pick,
            // Without an HP max the word is set by hand, as before (D-027).
            ...(max === null
              ? [
                  button(
                    WORD[word],
                    { class: "condition", "aria-label": `Condition of ${d.letter}: ${WORD[word]}. Tap for the next.` },
                    () => run({ type: "condition", colour: c, letter: d.letter, condition: NEXT_CONDITION[d.condition] }),
                  ),
                ]
              : []),
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
          );
        }),
      ),
      anyMax ? p.pad.el : el("p", { class: "hint" }, "No HP yet. Set an HP max with Edit, or pick the creature with Book."),
      ...(g.notes ? [el("p", { class: "notes" }, g.notes)] : []),
    );
  }

  const draftOf = (g: GroupInfo, discs: Disc[]): Draft => ({
    info: { name: g.name, ac: g.ac?.toString() ?? "", speed: g.speed?.toString() ?? "", hpMax: g.hpMax?.toString() ?? "", notes: g.notes },
    discMax: Object.fromEntries(discs.map((d) => [d.letter, d.hpMax?.toString() ?? ""])),
  });

  function editView(s: TableState, c: DiscColour, p: Panel, g: GroupInfo, discs: Disc[]): HTMLElement {
    const d = (p.draft ??= draftOf(g, discs));
    const status = el("p", { class: "hint", role: "status" });
    const save = () => {
      const n = (k: "ac" | "speed" | "hpMax") => (d.info[k].trim() === "" ? null : (wholeOrNull(d.info[k]) ?? NaN));
      // The same checks the main process makes, so a slip is explained and the typing kept.
      const info = parseGroupInfo({ ...g, name: d.info.name, ac: n("ac"), speed: n("speed"), hpMax: n("hpMax"), notes: d.info.notes });
      const own = discs.map((disc) =>
        (d.discMax[disc.letter] ?? "").trim() === "" ? null : (wholeOrNull(d.discMax[disc.letter]!) ?? NaN),
      );
      if (!info || own.some((v) => v !== null && !(v >= 1 && v <= 999))) {
        status.textContent = "Use whole numbers: AC 0–40, speed 0–999 ft, HP max 1–999.";
        return;
      }
      run({ type: "group", colour: c, info });
      for (const [i, disc] of discs.entries()) {
        if (own[i] !== disc.hpMax) run({ type: "discMax", colour: c, letter: disc.letter, hpMax: own[i]! });
      }
      p.view = "hp";
      p.draft = null;
      render();
    };
    const form = el(
      "form",
      { class: "card-form" },
      field("Name (only you see it)", d.info.name, { type: "text", maxlength: "40", "data-key": `g-name-${c}` }, (v) => (d.info.name = v)),
      field("AC", d.info.ac, { ...NUMBER, max: "40" }, (v) => (d.info.ac = v)),
      field("Speed (ft)", d.info.speed, { ...NUMBER, max: "999" }, (v) => (d.info.speed = v)),
      field("HP max", d.info.hpMax, { ...NUMBER, min: "1", max: "999" }, (v) => (d.info.hpMax = v)),
      el("h4", { class: "wide" }, "Each disc"),
      ...discs.map((disc) =>
        el(
          "div",
          { class: "disc-edit wide" },
          el("span", { class: `badge ${c}` }, disc.letter),
          field(
            "Own HP max",
            d.discMax[disc.letter] ?? "",
            { ...NUMBER, min: "1", max: "999", placeholder: g.hpMax === null ? "" : `${g.hpMax}` },
            (v) => (d.discMax[disc.letter] = v),
          ),
          button("Remove", { class: "danger" }, () => {
            // A new disc given this letter later starts without this one's typed HP max.
            delete d.discMax[disc.letter];
            run({ type: "removeDisc", colour: c, letter: disc.letter });
          }),
        ),
      ),
      field("Notes (only you see them)", d.info.notes, { type: "textarea", maxlength: "2000", rows: "3" }, (v) => (d.info.notes = v)),
      status,
      el(
        "div",
        { class: "row-buttons" },
        button("Cancel", {}, () => {
          p.view = "hp";
          p.draft = null;
          render();
        }),
        button("Save", { class: "primary", type: "submit" }, () => undefined),
      ),
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      save();
    });
    return form;
  }

  async function openBook(c: DiscColour, p: Panel, g: GroupInfo): Promise<void> {
    p.book.loading = g.creature;
    p.book.block = g.creature ? await terra.getCreature(g.creature) : null;
    p.book.loading = null;
    if (!p.book.block) {
      p.book.hits = await terra.searchCreatures(p.book.query);
      if (!p.book.hits.length && !p.book.query) p.book.status = (await terra.countCreatures()) ? "" : "empty";
    }
    if (p.view === "book" && panels.get(c) === p) render();
  }

  function bookView(c: DiscColour, p: Panel, g: GroupInfo): HTMLElement {
    const b = p.book;
    if (b.block)
      return el(
        "div",
        { class: "book" },
        statBlock(b.block),
        button("Pick a different creature", {}, () => {
          b.choosing = true;
          b.block = null;
          b.status = "";
          void openBook(c, p, { ...g, creature: null });
        }),
      );
    const file = el("input", { type: "file", accept: "application/json,.json", hidden: true, "data-key": `lib-${c}` });
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        const r = await terra.importCreatures(await f.text());
        b.status = `Imported ${r.read} creatures (${r.checked} checked against the page${r.skipped ? `, ${r.skipped} unreadable left out` : ""}).`;
      } catch (e) {
        b.status = String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
      }
      void openBook(c, p, g);
    });
    const search = el("input", {
      type: "search",
      placeholder: "Search the library",
      "aria-label": "Search the library",
      "data-key": `q-${c}`,
    });
    search.value = b.query;
    search.addEventListener("input", () => {
      b.query = search.value;
      const asked = b.query;
      void terra.searchCreatures(asked).then((hits) => {
        // A slower reply to an earlier search mustn't replace the newer one.
        if (asked !== b.query) return;
        b.hits = hits;
        render();
      });
    });
    const use = (h: CreatureHit) =>
      void terra.getCreature(h.key).then((block) => {
        if (!block || !block.checked) return;
        // Linking fills AC, HP and speed from the stat block; Edit can change them after.
        run({
          type: "group",
          colour: c,
          info: { ...g, name: g.name || block.name, creature: block.key, ac: block.ac, hpMax: block.hp, speed: block.speed },
        });
        b.choosing = false;
      });
    return el(
      "div",
      { class: "book" },
      ...(b.status === "empty"
        ? [
            el(
              "p",
              { class: "hint" },
              "No library yet. Import a monster file from the private library repo, such as data/monsters/mm2024.json.",
            ),
          ]
        : [
            search,
            el(
              "ul",
              { class: "hits" },
              ...b.hits.map((h) =>
                el(
                  "li",
                  {},
                  el("span", {}, h.name, el("small", {}, ` ${h.book} · CR ${h.cr}`)),
                  h.checked
                    ? button("Use", { class: "primary" }, () => use(h))
                    : el("small", { class: "warn" }, "Not checked against the page yet"),
                ),
              ),
            ),
          ]),
      ...(b.status && b.status !== "empty" ? [el("p", { class: "hint", role: "status" }, b.status)] : []),
      button("Import library file…", {}, () => file.click()),
      file,
    );
  }

  function render(): void {
    if (!state) return;
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.key;
    for (const [c, p] of panels) if (p.win.isOpen()) renderPanel(state, c, p);
    if (focused) document.querySelector<HTMLElement>(`#floats [data-key="${focused}"]`)?.focus();
  }

  terra.onState((s) => {
    state = s;
    render();
  });
  terra.getState().then((s) => {
    state = s;
    render();
  });
  return { show, render };
}

/** The stat block, laid out like the book's, from the library's fields. Text goes in as text, never as markup. */
function statBlock(b: StatBlock): HTMLElement {
  const section = (title: string, items: { name: string; text: string }[], intro?: string) =>
    items.length || intro
      ? [el("h4", {}, title), ...(intro ? [el("p", {}, intro)] : []), ...items.map((f) => el("p", {}, el("b", {}, `${f.name}. `), f.text))]
      : [];
  return el(
    "article",
    { class: "statblock" },
    el("h3", {}, b.name),
    el("p", { class: "kind" }, b.kind),
    el(
      "p",
      {},
      el("b", {}, "AC "),
      `${b.ac}${b.acNote ? ` (${b.acNote})` : ""}`,
      b.initiative ? el("span", {}, el("b", {}, "   Initiative "), b.initiative) : "",
    ),
    el("p", {}, el("b", {}, "HP "), `${b.hp}${b.hpFormula ? ` (${b.hpFormula})` : ""}`),
    el("p", {}, el("b", {}, "Speed "), b.speedText || "—"),
    el(
      "div",
      { class: "abilities" },
      ...b.abilities.map((a) =>
        el(
          "div",
          {},
          el("small", {}, a.name),
          el("b", {}, String(a.score)),
          el("span", {}, `${a.mod >= 0 ? "+" : ""}${a.mod} / ${a.save >= 0 ? "+" : ""}${a.save}`),
        ),
      ),
    ),
    ...b.details.map(([k, v]) => el("p", {}, el("b", {}, `${k} `), v)),
    ...section("Traits", b.traits),
    ...section("Actions", b.actions),
    ...section("Bonus Actions", b.bonusActions),
    ...section("Reactions", b.reactions),
    ...(b.legendary ? section("Legendary Actions", b.legendary.actions, b.legendary.intro) : []),
    el("p", { class: "source" }, `${b.book}${b.page ? `, page ${b.page}` : ""}${b.checked ? " · checked against the page" : ""}`),
  );
}
