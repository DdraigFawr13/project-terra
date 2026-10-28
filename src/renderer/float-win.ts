// Sheets for the Party and the monster groups (D-028, D-031): windows in the dock (dock.ts), opened from the Fight
// menu, a group or a disc's HP pad, and closed when done. They open as tabs together on the right, and move like any window.
import type { initDock } from "./dock.ts";

export type FloatWin = {
  body: HTMLElement;
  /** The title area, filled by the owner; the window's tab shows it. */
  title: HTMLElement;
  /** Buttons on the window's bar, filled by the owner. */
  actions: HTMLElement;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
};

let dock: ReturnType<typeof initDock> | null = null;
/** The DM window hands over its dock before any sheet is made. */
export const useDock = (d: ReturnType<typeof initDock>) => void (dock = d);
/** Whether the sheet `id` was open when the DM window last closed (D-034), and dropping it if it won't be made now. */
export const wasOpen = (id: string) => dock!.wasOpen(`sheet:${id}`);
export const forgetSheet = (id: string) => dock!.forget(`sheet:${id}`);

export function floatWin(id: string): FloatWin {
  const div = (cls: string) => {
    const el = document.createElement("div");
    el.className = cls;
    return el;
  };
  const [title, actions, body] = [div("float-title"), div("float-actions"), div("float-body")];
  // Sheets open together as tabs, beside whichever sheet is already open, else in a new group on the right.
  const home = { area: "right", with: "sheet" } as const;
  const panel = dock!.add({
    id: `sheet:${id}`,
    title,
    actions,
    content: body,
    sheet: true,
    homes: { prep: home, explore: home, fight: home },
    fallback: home,
  });
  return { body, title, actions, ...panel };
}
