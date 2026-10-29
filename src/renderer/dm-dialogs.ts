// Two Table-menu dialogs for when something goes wrong (D-037, step 7g): going back to an earlier save, and the problem
// report to paste to Claude. Plain <dialog>s over the whole DM window, so they don't depend on the window layout.
import type { DmApi } from "../main/dm-preload.ts";
import { button, el } from "./dom.ts";

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function initDialogs(terra: DmApi) {
  const dialog = el("dialog", { class: "dialog" });
  document.body.append(dialog);
  const show = (title: string, ...body: Node[]) => {
    dialog.replaceChildren(el("h2", {}, title), ...body);
    if (!dialog.open) dialog.showModal();
  };
  const close = () => dialog.close();

  async function earlierSaves(): Promise<void> {
    const saves = await terra.listBackups();
    const status = el("p", { class: "hint", role: "status" });
    const rows = saves.map((b) =>
      el(
        "li",
        {},
        el("span", {}, el("b", {}, when(b.at)), el("small", {}, b.holds)),
        button("Go back to this", { disabled: b.holds === "can't be read" }, async () => {
          const why = await terra.restoreBackup(b.name);
          if (why) status.textContent = why;
          else close();
        }),
      ),
    );
    show(
      "Go back to an earlier save",
      el(
        "p",
        { class: "hint" },
        "A copy is kept each time the app starts and every 15 minutes of play; the newest 3 stay. Going back keeps what's on the table now as an earlier save too, so you can return to it. Calibration and the screen choice stay as they are.",
      ),
      saves.length ? el("ul", { class: "saves" }, ...rows) : el("p", { class: "empty" }, "No earlier saves yet."),
      status,
      el("div", { class: "row" }, button("Close", {}, close)),
    );
  }

  async function problemReport(): Promise<void> {
    const text = await terra.problemReport();
    const box = el("textarea", { readonly: true, rows: "14", "aria-label": "Problem report" });
    box.value = text;
    const status = el("p", { class: "hint", role: "status" }, "Copy it and paste it to Claude. It holds no names, notes or stats.");
    show(
      "Problem report",
      status,
      box,
      el(
        "div",
        { class: "row" },
        button("Close", {}, close),
        button("Copy", { class: "primary" }, async () => {
          try {
            await navigator.clipboard.writeText(text);
            status.textContent = "Copied.";
          } catch {
            // Select it instead, so Ctrl+C works.
            box.select();
            status.textContent = "Press Ctrl+C to copy the selected text.";
          }
        }),
      ),
    );
  }

  return { earlierSaves, problemReport };
}
