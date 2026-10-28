// Floating windows inside the DM window (D-028): dragged by the title bar with a finger, the pen or the mouse, folded
// to their bar, and reopened where they were left. They stay inside this window, so none can land on the projector.
import { icon } from "./icons.ts";

export type FloatWin = {
  el: HTMLElement;
  body: HTMLElement;
  /** The title area, filled by the owner. */
  title: HTMLElement;
  /** Buttons before fold and close, filled by the owner. */
  actions: HTMLElement;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
};

type Place = { x: number; y: number; folded: boolean };
const layer = () => document.getElementById("floats")!;
let top = 10;

function load(id: string, fallback: Place): Place {
  try {
    const p = JSON.parse(localStorage.getItem(`terra.float.${id}`) ?? "null");
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y, folded: !!p.folded };
  } catch {
    // A missing or unreadable place falls back to the default.
  }
  return fallback;
}
function store(id: string, p: Place): void {
  try {
    localStorage.setItem(`terra.float.${id}`, JSON.stringify(p));
  } catch {
    // Not remembering a place is harmless.
  }
}

export function floatWin(id: string, opts: { width: number; at: { x: number; y: number }; onClose?: () => void }): FloatWin {
  const el = document.createElement("section");
  el.className = "float";
  el.hidden = true;
  el.style.width = `${opts.width}px`;
  el.dataset.float = id;
  const head = document.createElement("header");
  const title = document.createElement("div");
  title.className = "float-title";
  const actions = document.createElement("div");
  actions.className = "float-actions";
  const fold = document.createElement("button");
  fold.type = "button";
  fold.className = "icon";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "icon";
  close.setAttribute("aria-label", "Close");
  close.innerHTML = icon("close");
  head.append(title, actions, fold, close);
  const body = document.createElement("div");
  body.className = "float-body";
  el.append(head, body);
  layer().append(el);

  let place = load(id, { ...opts.at, folded: false });
  /** Keep the title bar on screen, so the window can always be dragged back. */
  function clamp(): void {
    const w = el.offsetWidth || opts.width;
    place.x = Math.max(0, Math.min(window.innerWidth - Math.min(w, 120), place.x));
    place.y = Math.max(0, Math.min(window.innerHeight - 48, place.y));
    el.style.left = `${place.x}px`;
    el.style.top = `${place.y}px`;
  }
  function render(): void {
    el.classList.toggle("folded", place.folded);
    fold.innerHTML = icon(place.folded ? "down" : "minus");
    fold.setAttribute("aria-label", place.folded ? "Unfold" : "Fold");
    clamp();
  }
  const raise = () => (el.style.zIndex = String(++top));
  el.addEventListener("pointerdown", raise);
  fold.addEventListener("click", () => {
    place.folded = !place.folded;
    store(id, place);
    render();
  });
  close.addEventListener("click", () => {
    el.hidden = true;
    opts.onClose?.();
  });

  let drag: { pointer: number; dx: number; dy: number } | null = null;
  head.addEventListener("pointerdown", (e) => {
    if (drag || (e.target as HTMLElement).closest("button, input")) return;
    drag = { pointer: e.pointerId, dx: e.clientX - place.x, dy: e.clientY - place.y };
    head.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
  });
  head.addEventListener("pointermove", (e) => {
    if (drag?.pointer !== e.pointerId) return;
    place.x = e.clientX - drag.dx;
    place.y = e.clientY - drag.dy;
    clamp();
  });
  const end = (e: PointerEvent) => {
    if (drag?.pointer !== e.pointerId) return;
    drag = null;
    el.classList.remove("dragging");
    store(id, place);
  };
  head.addEventListener("pointerup", end);
  head.addEventListener("pointercancel", end);
  window.addEventListener("resize", () => !el.hidden && clamp());

  return {
    el,
    body,
    title,
    actions,
    open: () => {
      const wasHidden = el.hidden;
      el.hidden = false;
      if (wasHidden) place = load(id, place);
      raise();
      render();
    },
    close: () => (el.hidden = true),
    isOpen: () => !el.hidden,
  };
}
