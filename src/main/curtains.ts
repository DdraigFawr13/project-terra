// Curtain pictures (D-039): location art the DM picks for a scene's curtain. Like maps, they stay in the app's data
// folder on the laptop, never in the repo. Scenes refer to them by id only.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MAX_BYTES = 32 * 1024 * 1024;
const PICTURE_ID = /^pic-[a-f0-9]{8,32}$/;
/** The picture types a browser draws, told apart by their first bytes rather than a file name. */
const TYPES = [
  {
    ext: "png",
    mime: "image/png",
    magic: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { ext: "jpg", mime: "image/jpeg", magic: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "webp", mime: "image/webp", magic: (b: Buffer) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
];

const dirOf = (userData: string) => path.join(userData, "library", "curtains");

/** Store a picture and return its id. Refuses anything that isn't a PNG, JPEG or WebP under 32 MB. */
export function savePicture(userData: string, bytes: unknown): string {
  const b = bytes instanceof Uint8Array && bytes.byteLength <= MAX_BYTES ? Buffer.from(bytes) : null;
  const type = b && TYPES.find((t) => t.magic(b));
  if (!b || !type) throw new Error("The picture must be a PNG, JPEG or WebP under 32 MB.");
  const id = `pic-${randomBytes(8).toString("hex")}`;
  fs.mkdirSync(dirOf(userData), { recursive: true });
  fs.writeFileSync(path.join(dirOf(userData), `${id}.${type.ext}`), b);
  return id;
}

/** A stored picture's file and type, or null for an id this folder couldn't have made or doesn't hold. */
export function pictureFile(userData: string, id: string): { file: string; mime: string } | null {
  if (!PICTURE_ID.test(id)) return null;
  for (const t of TYPES) {
    const file = path.join(dirOf(userData), `${id}.${t.ext}`);
    if (fs.existsSync(file)) return { file, mime: t.mime };
  }
  return null;
}
