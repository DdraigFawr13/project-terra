// Cropping a picture for a character's token (D-045): drag and zoom in a square frame, with the token beside it at the
// size it will have on the table. The crop is saved as a square picture, so the table never has to squash one.
import { cropSquare } from "../core/fight.ts";
import type { PlayerToken } from "../core/table.ts";
import { button, el } from "./dom.ts";
import { drawToken } from "./table-draw.ts";

/** Pixels of the saved picture's side: enough for a 2-inch look, small enough to draw at once. */
const SAVED_PX = 512;
const FRAME_PX = 240;
/** Token previews in CSS pixels: about as on the table at 1080p (45 px an inch), and doubled to judge the crop. */
const PREVIEWS = [45, 90];
const MAX_ZOOM = 6;

export function cropView(
  file: File,
  look: Omit<PlayerToken, "picture" | "x" | "y">,
  done: (picture: Uint8Array) => Promise<void>,
  cancel: () => void,
): HTMLElement {
  const status = el("p", { class: "hint", role: "status" }, "Drag to move the picture. Keep the head and hair in the frame.");
  const frame = el("canvas", { class: "crop-frame", width: String(FRAME_PX), height: String(FRAME_PX), "aria-label": "Picture to crop" });
  const previews = PREVIEWS.map((px) => el("canvas", { width: String(px + 8), height: String(px + 8), "data-px": String(px) }));
  const zoomBox = el("input", { type: "range", min: "1", max: String(MAX_ZOOM), step: "0.05", value: "1", "aria-label": "Zoom" });
  const save = button("Use this picture", { class: "primary", disabled: true }, () => void finish());
  const img = new Image();
  const url = URL.createObjectURL(file);
  let zoom = 1;
  let cx = 0.5;
  let cy = 0.5;
  let drag: { pointer: number; x: number; y: number; cx: number; cy: number } | null = null;

  const crop = () => cropSquare(img.naturalWidth, img.naturalHeight, zoom, cx, cy);
  /** The crop drawn square, onto a new canvas of this size. */
  function cropped(px: number): HTMLCanvasElement {
    const c = crop();
    const out = el("canvas", { width: String(px), height: String(px) });
    out.getContext("2d")!.drawImage(img, c.x, c.y, c.size, c.size, 0, 0, px, px);
    return out;
  }
  function paint(): void {
    frame.getContext("2d")!.drawImage(cropped(FRAME_PX), 0, 0);
    const picture = cropped(SAVED_PX);
    for (const p of previews) {
      const px = Number(p.dataset.px);
      const ctx = p.getContext("2d")!;
      ctx.clearRect(0, 0, p.width, p.height);
      drawToken(
        ctx,
        { ...look, picture: "preview", x: 0, y: 0, farSide: false, mini: false, conditions: [] },
        p.width / 2,
        p.height / 2,
        px,
        picture,
      );
    }
  }
  async function finish(): Promise<void> {
    save.disabled = true;
    status.textContent = "Saving the picture…";
    const blob = await new Promise<Blob | null>((ok) => cropped(SAVED_PX).toBlob(ok, "image/webp", 0.9));
    if (!blob) {
      status.textContent = "That picture couldn't be saved. Try another file.";
      save.disabled = false;
      return;
    }
    URL.revokeObjectURL(url);
    await done(new Uint8Array(await blob.arrayBuffer()));
  }

  img.onload = () => {
    URL.revokeObjectURL(url);
    save.disabled = false;
    paint();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    status.textContent = "That file couldn't be read: pick a PNG, JPEG or WebP.";
  };
  img.src = url;

  zoomBox.addEventListener("input", () => {
    zoom = Number(zoomBox.value);
    if (img.naturalWidth) paint();
  });
  frame.addEventListener("pointerdown", (e) => {
    frame.setPointerCapture(e.pointerId);
    drag = { pointer: e.pointerId, x: e.clientX, y: e.clientY, cx, cy };
  });
  frame.addEventListener("pointermove", (e) => {
    if (drag?.pointer !== e.pointerId || !img.naturalWidth) return;
    const c = crop();
    // One frame's width of drag moves the picture by one crop's width.
    const per = c.size / frame.getBoundingClientRect().width;
    cx = Math.min(1, Math.max(0, drag.cx - ((e.clientX - drag.x) * per) / img.naturalWidth));
    cy = Math.min(1, Math.max(0, drag.cy - ((e.clientY - drag.y) * per) / img.naturalHeight));
    paint();
  });
  frame.addEventListener("pointerup", () => (drag = null));
  frame.addEventListener("pointercancel", () => (drag = null));

  return el(
    "div",
    { class: "token-crop" },
    frame,
    el("div", { class: "token-previews" }, ...previews, el("small", {}, "About as on the table, then twice that.")),
    el("label", {}, "Zoom", zoomBox),
    status,
    el(
      "div",
      { class: "row-buttons" },
      button("Cancel", {}, () => {
        URL.revokeObjectURL(url);
        cancel();
      }),
      save,
    ),
  );
}
