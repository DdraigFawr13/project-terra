// Stat blocks from the private library (D-010, D-026, D-028). The DM imports a library file once; the main process keeps
// a checked copy and the DM window shows one stat block at a time. Nothing here ever reaches the table window. Pure.

/** A titled block of rules text: a trait, an action, a reaction. */
type Feature = { name: string; text: string };

export type StatBlock = {
  /** `<book>:<id>`, unique across books. */
  key: string;
  name: string;
  book: string;
  page: number | null;
  /** Size, type and alignment as printed, such as "Medium Undead, Neutral Evil". */
  kind: string;
  ac: number;
  acNote: string | null;
  initiative: string | null;
  hp: number;
  hpFormula: string | null;
  speed: number | null;
  /** The whole speed line, such as "20 ft., Fly 30 ft.". */
  speedText: string;
  abilities: { name: string; score: number; mod: number; save: number }[];
  /** Label and text pairs: skills, resistances, senses, languages, CR. Empty ones are left out. */
  details: [string, string][];
  traits: Feature[];
  actions: Feature[];
  bonusActions: Feature[];
  reactions: Feature[];
  /** `uses`: legendary actions per round, from the stat block's "Uses" line, or null if it gives no number (D-046 pips). */
  legendary: { intro: string; actions: Feature[]; uses: number | null } | null;
  /** Compared word by word against the page (D-026). Only these can be linked to a disc. */
  checked: boolean;
  /** The creature's picture cropped from the book, as a data URL, or null (D-036). Shown to the table only after Reveal. */
  portrait: string | null;
};

/** One row of a search result. */
export type CreatureHit = { key: string; name: string; book: string; cr: string; checked: boolean };

const MAX_CREATURES = 5000;
const ID = /^[a-z0-9-]{1,80}$/;
const BOOK = /^[A-Za-z0-9]{1,20}$/;
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
const SPEEDS = ["fly", "swim", "climb", "burrow"] as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 4000): string | null => (typeof v === "string" && v.length <= max ? v : null);
const num = (v: unknown): number | null => (Number.isInteger(v) && Math.abs(v as number) <= 100000 ? (v as number) + 0 : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length <= 400) : []);
/** A portrait in a library file: a JPEG, PNG or WebP data URL of at most about 400 KB. */
const PORTRAIT = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const portraitOf = (v: unknown): string | null => (typeof v === "string" && v.length <= 550_000 && PORTRAIT.test(v) ? v : null);
const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

function features(v: unknown): Feature[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((f) => {
    const name = isObject(f) ? str(f.name, 200) : null;
    const text = isObject(f) ? str(f.text) : null;
    return name !== null && text !== null ? [{ name, text }] : [];
  });
}

/** One creature from a library file, or null if it lacks what the window needs. Odd optional parts are left out. */
export function parseCreature(raw: unknown): StatBlock | null {
  if (!isObject(raw) || !isObject(raw.source) || !isObject(raw.hp)) return null;
  const id = raw.id;
  const book = raw.source.book;
  const name = str(raw.name, 120);
  // The same limits a colour group's AC and HP max have, so linking never fails (D-028).
  const ac = num(raw.ac) !== null && num(raw.ac)! >= 0 && num(raw.ac)! <= 40 ? num(raw.ac) : null;
  const hp = num(raw.hp.avg) !== null && num(raw.hp.avg)! >= 1 && num(raw.hp.avg)! <= 999 ? num(raw.hp.avg) : null;
  if (typeof id !== "string" || !ID.test(id) || typeof book !== "string" || !BOOK.test(book) || !name || ac === null || hp === null)
    return null;
  const speed = isObject(raw.speed) ? raw.speed : {};
  const walk = num(speed.walk) !== null && num(speed.walk)! >= 0 && num(speed.walk)! <= 999 ? num(speed.walk) : null;
  const speedText = [
    walk === null ? null : `${walk} ft.`,
    ...SPEEDS.map((k) => (num(speed[k]) === null ? null : `${k[0]!.toUpperCase()}${k.slice(1)} ${num(speed[k])} ft.`)),
    speed.hover === true ? "(hover)" : null,
  ]
    .filter(Boolean)
    .join(", ");
  const abilities = isObject(raw.abilities) ? raw.abilities : {};
  const init = isObject(raw.initiative) ? raw.initiative : {};
  const senses = isObject(raw.senses) ? raw.senses : {};
  const skills = isObject(raw.skills) ? raw.skills : {};
  const sensesText = [
    ...["darkvision", "blindsight", "tremorsense", "truesight"].map((k) =>
      num(senses[k]) === null ? null : `${k[0]!.toUpperCase()}${k.slice(1)} ${num(senses[k])} ft.`,
    ),
    num(senses.passivePerception) === null ? null : `Passive Perception ${num(senses.passivePerception)}`,
  ].filter(Boolean);
  const cr = str(raw.cr, 10);
  const xp = num(raw.xp);
  const details: [string, string][] = [
    [
      "Skills",
      Object.entries(skills)
        .flatMap(([k, v]) => (num(v) === null ? [] : [`${k} ${signed(num(v)!)}`]))
        .join(", "),
    ],
    ["Vulnerabilities", strs(raw.vulnerabilities).join(", ")],
    ["Resistances", strs(raw.resistances).join(", ")],
    ["Immunities", [...strs(raw.immunities), ...strs(raw.conditionImmunities)].join(", ")],
    ["Gear", strs(raw.gear).join(", ")],
    ["Senses", sensesText.join(", ")],
    ["Languages", strs(raw.languages).join(", ")],
    ["CR", cr ? `${cr}${xp === null ? "" : ` (XP ${xp.toLocaleString("en-US")})`}` : ""],
  ];
  const legendary = isObject(raw.legendary)
    ? {
        intro: [str(raw.legendary.uses, 100) && `Uses: ${raw.legendary.uses}.`, str(raw.legendary.intro)].filter(Boolean).join(" "),
        actions: features(raw.legendary.actions),
        // "3", or "3 (4 in Lair)": the first number is the count outside a lair.
        uses: Number(/^\s*(\d)/.exec(String(raw.legendary.uses ?? ""))?.[1] ?? NaN) || null,
      }
    : null;
  const tags = strs(raw.tags);
  const kind = [str(raw.size, 60), str(raw.type, 60), tags.length ? `(${tags.join(", ")})` : null].filter(Boolean).join(" ");
  const alignment = str(raw.alignment, 60);
  return {
    key: `${book}:${id}`,
    name,
    book,
    page: isObject(raw.source) ? num(raw.source.page) : null,
    kind: alignment ? `${kind}, ${alignment}` : kind,
    ac,
    acNote: str(raw.acNote, 200),
    initiative: num(init.mod) === null ? null : `${signed(num(init.mod)!)}${num(init.score) === null ? "" : ` (${num(init.score)})`}`,
    hp,
    hpFormula: str(raw.hp.formula, 60),
    speed: walk,
    speedText,
    abilities: ABILITIES.flatMap((k) => {
      const a = abilities[k];
      const score = isObject(a) ? num(a.score) : null;
      return isObject(a) && score !== null
        ? [{ name: k.toUpperCase(), score, mod: num(a.mod) ?? 0, save: num(a.save) ?? num(a.mod) ?? 0 }]
        : [];
    }),
    details: details.filter(([, v]) => v),
    traits: features(raw.traits),
    actions: features(raw.actions),
    bonusActions: features(raw.bonusActions),
    reactions: features(raw.reactions),
    legendary,
    checked: isObject(raw.checks) && raw.checks.pageChecked === true,
    portrait: portraitOf(raw.portrait),
  };
}

/** A whole library file: the creatures that read, and how many didn't. */
export function parseCreatureFile(raw: unknown): { creatures: StatBlock[]; skipped: number } | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_CREATURES) return null;
  const creatures = raw.map(parseCreature).filter((c): c is StatBlock => !!c);
  return creatures.length ? { creatures, skipped: raw.length - creatures.length } : null;
}

/** Library rows whose name contains every word typed, page-checked first, then by name. At most `limit`. */
export function searchCreatures(all: readonly StatBlock[], query: string, limit = 30): CreatureHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return all
    .filter((c) => words.every((w) => c.name.toLowerCase().includes(w)))
    .sort((a, b) => Number(b.checked) - Number(a.checked) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((c) => ({
      key: c.key,
      name: c.name,
      book: c.book,
      cr: c.details.find(([k]) => k === "CR")?.[1].split(" ")[0] ?? "",
      checked: c.checked,
    }));
}
