// The personal library (D-010): maps imported from Morgan's own books and photos live in the app's data folder on
// the laptop, never in the repo or a shared build. Each map is a straightened PNG plus a small JSON file with its
// name, extent and feet per square. Saves refer to maps by id only.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Bounds } from "../core/map.ts";
import { parsePlacedMap, type FeetPerSquare } from "../core/table.ts";

export type LibraryMap = { id: string; name: string; bounds: Bounds; feetPerSquare: FeetPerSquare };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_BYTES = 64 * 1024 * 1024;
const MAP_ID = /^map-[a-z0-9-]{1,60}$/;

function mapsDir(userData: string): string {
  return path.join(userData, "library", "maps");
}

/** The PNG file for a map id, or null if the id isn't one this library could have made. */
export function mapFile(userData: string, id: string): string | null {
  return MAP_ID.test(id) ? path.join(mapsDir(userData), `${id}.png`) : null;
}

/** Store a straightened map. Refuses anything that isn't a PNG of sensible size, or has a bad name or extent. */
export function saveMap(userData: string, name: unknown, png: unknown, bounds: unknown, feetPerSquare: unknown): LibraryMap {
  if (!(png instanceof Uint8Array) || png.byteLength > MAX_BYTES || !Buffer.from(png.subarray(0, 8)).equals(PNG_SIGNATURE)) {
    throw new Error("The map image must be a PNG under 64 MB.");
  }
  const id = `map-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const cleanName = typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : "Untitled map";
  // Reuse the table's own checks for the id, name, extent and feet per square.
  const checked = parsePlacedMap({ id, name: cleanName, bounds, feetPerSquare, x: 0, y: 0, turns: 0 });
  if (!checked) throw new Error("The map's size or name is not usable.");
  const entry: LibraryMap = { id, name: checked.name, bounds: checked.bounds, feetPerSquare: checked.feetPerSquare };
  const dir = mapsDir(userData);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.png`), png);
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(entry, null, 2) + "\n");
  return entry;
}

/** Every map in the library, newest first. Files that can't be read are skipped, never deleted. */
export function listMaps(userData: string): LibraryMap[] {
  const dir = mapsDir(userData);
  if (!fs.existsSync(dir)) return [];
  const maps: LibraryMap[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const checked = parsePlacedMap({ ...raw, x: 0, y: 0, turns: 0 });
      if (checked && fs.existsSync(path.join(dir, `${checked.id}.png`)))
        maps.push({ id: checked.id, name: checked.name, bounds: checked.bounds, feetPerSquare: checked.feetPerSquare });
    } catch {
      // An unreadable entry stays on disk for inspection and is left out of the list.
    }
  }
  return maps.sort((a, b) => b.id.localeCompare(a.id));
}
