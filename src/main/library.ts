// The personal library (D-010): maps imported from Morgan's own books and photos live in the app's data folder on
// the laptop, never in the repo or a shared build. Each map is a straightened PNG plus a small JSON file with its
// name, extent and feet per square. Saves refer to maps by id only.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ANNOTATION_VERSION, annotationFile, emptyAnnotation, parseAnnotation, type Annotation } from "../core/annotation.ts";
import type { Bounds } from "../core/map.ts";
import { parsePlacedMap, type FeetPerSquare } from "../core/table.ts";

/** `patched`: the table has its own copy with room numbers painted out (D-036). */
export type LibraryMap = { id: string; name: string; bounds: Bounds; feetPerSquare: FeetPerSquare; patched: boolean };

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

/**
 * The file the table window gets for a map: its patched copy if there is one, else the map itself (D-036). The table's
 * session serves only this, so once a map is patched the table can't load the numbered original.
 */
export function tableMapFile(userData: string, id: string): string | null {
  const file = mapFile(userData, id);
  if (!file) return null;
  const copy = file.replace(/\.png$/, ".table.png");
  return fs.existsSync(copy) ? copy : file;
}

/** Store the table's patched copy of a map, or with null remove it so the table gets the map itself again. */
export function savePatch(userData: string, id: unknown, png: unknown): void {
  const file = typeof id === "string" ? mapFile(userData, id) : null;
  if (!file || !fs.existsSync(file)) throw new Error("That map isn't in the library.");
  const copy = file.replace(/\.png$/, ".table.png");
  if (png === null) return fs.rmSync(copy, { force: true });
  if (!isPng(png)) throw new Error("The patched map must be a PNG under 64 MB.");
  // Write beside it and rename, so the table never reads half a file.
  fs.writeFileSync(`${copy}.tmp`, png);
  fs.renameSync(`${copy}.tmp`, copy);
}

const isPng = (png: unknown): png is Uint8Array =>
  png instanceof Uint8Array && png.byteLength <= MAX_BYTES && Buffer.from(png.subarray(0, 8)).equals(PNG_SIGNATURE);

/**
 * Store a straightened map. Refuses anything that isn't a PNG of sensible size, or has a bad name or extent. `walls`
 * come with a VTT import (D-044); they are checked before anything is written, so a bad file leaves no half a map.
 */
export function saveMap(
  userData: string,
  name: unknown,
  png: unknown,
  bounds: unknown,
  feetPerSquare: unknown,
  walls?: unknown,
): LibraryMap {
  if (!isPng(png)) throw new Error("The map image must be a PNG under 64 MB.");
  const id = `map-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const cleanName = typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : "Untitled map";
  // Reuse the table's own checks for the id, name, extent and feet per square.
  const checked = parsePlacedMap({ id, name: cleanName, bounds, feetPerSquare, x: 0, y: 0, turns: 0 });
  if (!checked) throw new Error("The map's size or name is not usable.");
  const traced =
    walls == null
      ? null
      : parseAnnotation(walls && typeof walls === "object" ? { ...walls, version: ANNOTATION_VERSION } : walls, checked.bounds);
  if (walls != null && !traced) throw new Error("The walls couldn't be saved: some of them are outside the map or damaged.");
  const entry: LibraryMap = { id, name: checked.name, bounds: checked.bounds, feetPerSquare: checked.feetPerSquare, patched: false };
  const dir = mapsDir(userData);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.png`), png);
  if (traced) fs.writeFileSync(path.join(dir, `${id}.walls.json`), JSON.stringify(annotationFile(traced)) + "\n");
  // Whether it is patched comes from the files on disk, never from the JSON.
  const { patched: _, ...stored } = entry;
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(stored, null, 2) + "\n");
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
        maps.push({
          id: checked.id,
          name: checked.name,
          bounds: checked.bounds,
          feetPerSquare: checked.feetPerSquare,
          patched: fs.existsSync(path.join(dir, `${checked.id}.table.png`)),
        });
    } catch {
      // An unreadable entry stays on disk for inspection and is left out of the list.
    }
  }
  return maps.sort((a, b) => b.id.localeCompare(a.id));
}

/** The map's bounds from its library entry, or null if the id or entry isn't usable. */
function entryBounds(userData: string, id: unknown): { file: string; bounds: Bounds } | null {
  const png = typeof id === "string" ? mapFile(userData, id) : null;
  if (!png || !fs.existsSync(png)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(png.replace(/\.png$/, ".json"), "utf8"));
    const checked = parsePlacedMap({ ...raw, x: 0, y: 0, turns: 0 });
    return checked ? { file: png.replace(/\.png$/, ".walls.json"), bounds: checked.bounds } : null;
  } catch {
    return null;
  }
}

/**
 * A map's walls, pillars and openings (D-044), or an empty annotation if it has none yet. DM-only: the table window's
 * bridge has no channel to this. A file that can't be read is set aside as `.bad.json`, never written over (GAME-05).
 */
export function loadAnnotation(userData: string, id: unknown): Annotation {
  const entry = entryBounds(userData, id);
  if (!entry || !fs.existsSync(entry.file)) return emptyAnnotation();
  let parsed: Annotation | null = null;
  try {
    parsed = parseAnnotation(JSON.parse(fs.readFileSync(entry.file, "utf8")), entry.bounds);
  } catch {
    parsed = null;
  }
  if (parsed) return parsed;
  fs.renameSync(entry.file, entry.file.replace(/\.json$/, `.bad-${Date.now()}.json`));
  return emptyAnnotation();
}

/** Store a map's annotation; refused whole if any part of it is unusable for that map. */
export function saveAnnotation(userData: string, id: unknown, raw: unknown): Annotation {
  const entry = entryBounds(userData, id);
  if (!entry) throw new Error("That map isn't in the library.");
  const checked = parseAnnotation(raw && typeof raw === "object" ? { ...raw, version: ANNOTATION_VERSION } : raw, entry.bounds);
  if (!checked) throw new Error("The walls couldn't be saved: some of them are outside the map or damaged.");
  fs.writeFileSync(`${entry.file}.tmp`, JSON.stringify(annotationFile(checked)) + "\n");
  fs.renameSync(`${entry.file}.tmp`, entry.file);
  return checked;
}
