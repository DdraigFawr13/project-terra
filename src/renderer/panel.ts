// The DM window's one panel beside the map (D-038): the table thumbnail on top, then Setup, Explore and Fight tabs. A
// sheet (the Party, a monster group) opens in the panel in place of the tab's lists, with Back. The panel's width, its
// tab and the open sheet are kept on this laptop, so the window reopens as it was (D-034); none of it is in the save.

export type Tab = "setup" | "explore" | "fight";
const TABS: Tab[] = ["setup", "explore", "fight"];

/** A sheet's parts, filled by its owner: what the panel shows while it is open. */
export type Sheet = {
  body: HTMLElement;
  title: HTMLElement;
  actions: HTMLElement;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
};

type Kept = { width: number; tab: Tab; sheet: string | null };
// A new key: an arrangement kept by the docked windows (D-031) means nothing here.
const KEY = "terra.panel.v1";
const MIN_W = 260;
const DEFAULT_W = 320;
const maxW = () => Math.max(MIN_W, Math.min(640, Math.round(window.innerWidth * 0.5)));

function load(): Kept {
  const kept: Kept = { width: DEFAULT_W, tab: "setup", sheet: null };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (Number.isFinite(raw.width)) kept.width = raw.width;
    if (TABS.includes(raw.tab)) kept.tab = raw.tab;
    if (typeof raw.sheet === "string") kept.sheet = raw.sheet;
  } catch {
    // A missing or unreadable panel state starts from the defaults.
  }
  return kept;
}

const side = () => document.getElementById("side")!;
const kept = load();
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Not remembering the panel is harmless.
  }
};
const sheets = new Map<string, { title: HTMLElement; actions: HTMLElement; body: HTMLElement }>();
let openSheet: string | null = null;
let onChange = () => {};

/** Show one sheet in the panel, or none: the tab's lists come back. */
function showSheet(id: string | null): void {
  openSheet = id;
  kept.sheet = id;
  save();
  const box = document.getElementById("sheet")!;
  const parts = id ? sheets.get(id) : undefined;
  box.hidden = !parts;
  document.getElementById("sideBody")!.hidden = !!parts;
  if (parts) {
    box.dataset.float = id!;
    box.querySelector(".sheet-title")!.replaceChildren(parts.title);
    box.querySelector(".sheet-actions")!.replaceChildren(parts.actions);
    box.querySelector(".sheet-body")!.replaceChildren(parts.body);
  } else delete box.dataset.float;
  onChange();
}

/**
 * A sheet that opens in the panel. One shows at a time: opening another replaces it. A sheet open when the DM window
 * last closed opens again as soon as its owner makes it.
 */
export function sheetWin(id: string): Sheet {
  const div = (cls: string) => Object.assign(document.createElement("div"), { className: cls });
  const parts = { title: div("float-title"), actions: div("float-actions"), body: div("float-body") };
  sheets.set(id, parts);
  const sheet: Sheet = {
    ...parts,
    open: () => showSheet(id),
    close: () => {
      if (openSheet === id) showSheet(null);
    },
    isOpen: () => openSheet === id,
  };
  if (kept.sheet === id) showSheet(id);
  return sheet;
}
/** Whether the sheet `id` was open when the DM window last closed (D-034). */
export const wasOpen = (id: string) => kept.sheet === id;
/** Drop a sheet that won't be made, such as the sheet of a colour with no discs left. */
export function forgetSheet(id: string): void {
  if (kept.sheet !== id) return;
  kept.sheet = null;
  save();
}

/**
 * Set up the panel. `lists` gives each tab its sections, in order; a section can be in more than one tab and moves to
 * the tab on show. `changed` runs whenever the panel's size or contents change, so canvases can redraw.
 */
export function initPanel(lists: Record<Tab, HTMLElement[]>, changed: () => void) {
  onChange = changed;
  const body = document.getElementById("sideBody")!;
  const tabBtns = [...document.querySelectorAll<HTMLButtonElement>("[data-tab]")];
  const setWidth = (w: number) => {
    kept.width = Math.round(Math.min(maxW(), Math.max(MIN_W, w)));
    side().style.width = `${kept.width}px`;
  };

  function show(tab: Tab): void {
    kept.tab = tab;
    save();
    for (const b of tabBtns) b.setAttribute("aria-selected", String(b.dataset.tab === tab));
    body.replaceChildren(...lists[tab]);
    // Picking a tab while a sheet is open goes back to the tab.
    if (openSheet) showSheet(null);
    else onChange();
  }
  for (const b of tabBtns) b.addEventListener("click", () => show(b.dataset.tab as Tab));
  document.querySelector(".sheet-back")!.addEventListener("click", () => showSheet(null));

  // The panel's edge drags to resize it (D-038); the width is remembered.
  const split = document.getElementById("panelSplit")!;
  split.addEventListener("pointerdown", (e) => {
    split.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = kept.width;
    const move = (m: PointerEvent) => {
      setWidth(startW - (m.clientX - startX));
      onChange();
    };
    const end = () => {
      split.removeEventListener("pointermove", move);
      save();
    };
    split.addEventListener("pointermove", move);
    split.addEventListener("lostpointercapture", end, { once: true });
  });
  // Arrow keys move the edge too, for a keyboard.
  split.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setWidth(kept.width + (e.key === "ArrowLeft" ? 20 : -20));
    save();
    onChange();
  });
  window.addEventListener("resize", () => setWidth(kept.width));

  // Holding the thumbnail shows the table big, for a closer look; letting go puts it back.
  const preview = document.getElementById("preview")!;
  preview.addEventListener("pointerdown", (e) => {
    preview.setPointerCapture(e.pointerId);
    preview.classList.add("big");
    onChange();
  });
  preview.addEventListener("lostpointercapture", () => {
    preview.classList.remove("big");
    onChange();
  });

  setWidth(kept.width);
  show(kept.tab);
  return { show, tab: () => kept.tab };
}
