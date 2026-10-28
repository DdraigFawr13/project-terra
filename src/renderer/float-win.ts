// Sheets for the Party and the monster groups (D-028, D-030). They dock as tabs in the right panel, under the table
// preview, so they never cover the map or the preview. Pop-out floats one inside the DM window: dragged by its title
// bar with a finger, the pen or the mouse, folded to its bar, and reopened where it was left. They never become OS
// windows, so none can land on the projector.
import { icon } from "./icons.ts";

export type FloatWin = {
  el: HTMLElement;
  body: HTMLElement;
  /** The title area, filled by the owner. Docked, it becomes the sheet's tab. */
  title: HTMLElement;
  /** Buttons before pop-out, fold and close, filled by the owner. */
  actions: HTMLElement;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
};

type Place = { x: number; y: number; folded: boolean; docked: boolean };
type Sheet = { id: string; el: HTMLElement; title: HTMLElement; place: () => Place; opened: () => boolean };

const layer = () => document.getElementById("floats")!;
const dock = () => document.getElementById("dock")!;
let top = 10;
/** Every sheet, in the order they were made, and the docked one on show. */
const sheets: Sheet[] = [];
let active: string | null = null;

function load(id: string, fallback: Place): Place {
  try {
    const p = JSON.parse(localStorage.getItem(`terra.float.${id}`) ?? "null");
    // Places saved before docking existed float as they did.
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y, folded: !!p.folded, docked: p.docked ?? true };
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

/** The dock's tabs: one per open docked sheet, showing a copy of its title. Only the active sheet's body shows. */
function renderDock(): void {
  const open = sheets.filter((s) => s.opened() && s.place().docked);
  if (!open.some((s) => s.id === active)) active = open[open.length - 1]?.id ?? null;
  for (const s of open) s.el.hidden = s.id !== active;
  document.getElementById("dockEmpty")!.hidden = open.length > 0;
  document.getElementById("dockTabs")!.replaceChildren(
    ...open.map((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(s.id === active));
      b.dataset.tab = s.id;
      b.append(...[...s.title.childNodes].map((n) => n.cloneNode(true)));
      b.addEventListener("click", () => {
        active = s.id;
        renderDock();
      });
      return b;
    }),
  );
}

/** Scroll the right panel so the sheet tabs sit just under the pinned table preview. */
function showDock(): void {
  const tabs = document.getElementById("dockTabs")!;
  const panel = tabs.closest<HTMLElement>(".side")!;
  const pinned = panel.querySelector<HTMLElement>(".sticky-preview")?.offsetHeight ?? 0;
  panel.scrollTo({ top: tabs.offsetTop - pinned - 8 });
}

export function floatWin(id: string, opts: { width: number; at: { x: number; y: number }; onClose?: () => void }): FloatWin {
  const el = document.createElement("section");
  el.className = "float";
  el.hidden = true;
  el.dataset.float = id;
  const head = document.createElement("header");
  const title = document.createElement("div");
  title.className = "float-title";
  const actions = document.createElement("div");
  actions.className = "float-actions";
  const iconButton = (cls: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `icon ${cls}`;
    return b;
  };
  const pop = iconButton("pop");
  const fold = iconButton("fold");
  const close = iconButton("close");
  close.setAttribute("aria-label", "Close");
  close.innerHTML = icon("close");
  head.append(title, actions, pop, fold, close);
  const body = document.createElement("div");
  body.className = "float-body";
  el.append(head, body);

  let place = load(id, { ...opts.at, folded: false, docked: true });
  let opened = false;
  sheets.push({ id, el, title, place: () => place, opened: () => opened });
  // A renamed group renames its tab.
  new MutationObserver(() => place.docked && opened && renderDock()).observe(title, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  /** Keep the title bar on screen, so the window can always be dragged back. */
  function clamp(): void {
    if (place.docked) return;
    const w = el.offsetWidth || opts.width;
    place.x = Math.max(0, Math.min(window.innerWidth - Math.min(w, 120), place.x));
    place.y = Math.max(0, Math.min(window.innerHeight - 48, place.y));
    el.style.left = `${place.x}px`;
    el.style.top = `${place.y}px`;
    // A window dragged low scrolls inside instead of running off the bottom of the screen.
    body.style.maxHeight = `${Math.max(160, window.innerHeight - place.y - 64)}px`;
  }
  function render(): void {
    el.classList.toggle("docked", place.docked);
    el.classList.toggle("folded", place.folded && !place.docked);
    (place.docked ? dock() : layer()).append(el);
    el.style.width = place.docked ? "" : `${opts.width}px`;
    body.style.maxHeight = "";
    pop.innerHTML = icon(place.docked ? "popOut" : "dockIn");
    pop.setAttribute("aria-label", place.docked ? "Pop out" : "Put back in the side panel");
    fold.innerHTML = icon(place.folded ? "down" : "minus");
    fold.setAttribute("aria-label", place.folded ? "Unfold" : "Fold");
    if (!place.docked) el.hidden = !opened;
    clamp();
    renderDock();
  }
  const raise = () => (el.style.zIndex = String(++top));
  el.addEventListener("pointerdown", raise);
  fold.addEventListener("click", () => {
    place.folded = !place.folded;
    store(id, place);
    render();
  });
  pop.addEventListener("click", () => {
    place.docked = !place.docked;
    if (place.docked) active = id;
    store(id, place);
    render();
    raise();
  });
  const shut = () => {
    opened = false;
    el.hidden = true;
    renderDock();
  };
  close.addEventListener("click", () => {
    shut();
    opts.onClose?.();
  });

  let drag: { pointer: number; dx: number; dy: number } | null = null;
  head.addEventListener("pointerdown", (e) => {
    if (place.docked || drag || e.button !== 0 || (e.target as HTMLElement).closest("button, input")) return;
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
  head.addEventListener("lostpointercapture", end);
  window.addEventListener("resize", () => !el.hidden && clamp());

  return {
    el,
    body,
    title,
    actions,
    open: () => {
      if (!opened) place = load(id, place);
      opened = true;
      // Opening a docked sheet brings its tab to the front.
      if (place.docked) active = id;
      raise();
      render();
      // After the owner has filled the sheet, so there is something to scroll to.
      if (place.docked) requestAnimationFrame(showDock);
    },
    close: shut,
    isOpen: () => opened,
  };
}
