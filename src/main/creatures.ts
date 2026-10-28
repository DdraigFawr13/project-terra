// Stat blocks in the personal library (D-010, D-028). The DM imports a library file from the private repo once; the
// creatures that read are copied to `<app data>/library/creatures/<book>.json` and kept in memory for search. Only the
// DM window's bridge reaches them; the table window never does.
import fs from "node:fs";
import path from "node:path";
import { parseCreature, parseCreatureFile, searchCreatures, type CreatureHit, type StatBlock } from "../core/creatures.ts";

export type ImportResult = { read: number; skipped: number; checked: number };

const MAX_TEXT = 40 * 1024 * 1024;
const dir = (userData: string) => path.join(userData, "library", "creatures");
let all: StatBlock[] | null = null;

/** Every stored creature, read once. Files that can't be read are skipped, never deleted. */
function load(userData: string): StatBlock[] {
  if (all) return all;
  all = [];
  if (!fs.existsSync(dir(userData))) return all;
  for (const f of fs.readdirSync(dir(userData)).filter((f) => f.endsWith(".json"))) {
    try {
      all.push(...(parseCreatureFile(JSON.parse(fs.readFileSync(path.join(dir(userData), f), "utf8")))?.creatures ?? []));
    } catch {
      // Left on disk for inspection.
    }
  }
  return all;
}

/** Store the creatures from a library file's text, replacing earlier copies of the same books. */
export function importCreatures(userData: string, text: unknown): ImportResult {
  if (typeof text !== "string" || text.length > MAX_TEXT) throw new Error("The library file must be a JSON file under 40 MB.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't JSON. Pick a monster file from the library, such as data/monsters/mm2024.json.");
  }
  const file = parseCreatureFile(raw);
  if (!file || !Array.isArray(raw)) throw new Error("No creatures could be read from that file.");
  // Keep each book's raw entries that read, so loading runs the same checks again.
  const byBook = new Map<string, unknown[]>();
  for (const entry of raw) {
    const c = parseCreature(entry);
    if (c) byBook.set(c.book, [...(byBook.get(c.book) ?? []), entry]);
  }
  fs.mkdirSync(dir(userData), { recursive: true });
  for (const [book, entries] of byBook) fs.writeFileSync(path.join(dir(userData), `${book}.json`), JSON.stringify(entries) + "\n");
  all = null;
  return { read: file.creatures.length, skipped: file.skipped, checked: file.creatures.filter((c) => c.checked).length };
}

export const findCreatures = (userData: string, query: unknown): CreatureHit[] =>
  typeof query === "string" ? searchCreatures(load(userData), query.slice(0, 100)) : [];
export const getCreature = (userData: string, key: unknown): StatBlock | null => load(userData).find((c) => c.key === key) ?? null;
export const countCreatures = (userData: string): number => load(userData).length;
