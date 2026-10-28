// A small pop-up beside what the DM tapped (D-032): a disc's HP pad, an initiative roll. It stays inside the DM window,
// closes with Esc, its × or a tap elsewhere, and only one is open at a time.

let open: { el: HTMLElement; close: () => void } | null = null;

export function popover(
  at: { x: number; y: number },
  content: HTMLElement[],
  onClose?: () => void,
): { el: HTMLElement; close: () => void } {
  open?.close();
  const el = document.createElement("section");
  el.className = "pop";
  el.setAttribute("role", "dialog");
  const x = document.createElement("button");
  x.type = "button";
  x.className = "pop-close";
  x.textContent = "×";
  x.setAttribute("aria-label", "Close");
  el.append(x, ...content);
  document.getElementById("floats")!.append(el);
  // Beside the tap, kept on screen.
  const r = el.getBoundingClientRect();
  const left = Math.min(window.innerWidth - r.width - 8, Math.max(8, at.x + 16));
  const top = Math.min(window.innerHeight - r.height - 8, Math.max(8, at.y - r.height / 2));
  Object.assign(el.style, { left: `${left}px`, top: `${top}px` });

  const outside = (e: PointerEvent) => {
    if (!el.contains(e.target as Node)) close();
  };
  const esc = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  function close(): void {
    if (open?.el !== el) return;
    open = null;
    el.remove();
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", esc, true);
    onClose?.();
  }
  x.addEventListener("click", close);
  // From the next tap on: the tap that opened it mustn't close it.
  setTimeout(() => {
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", esc, true);
  });
  open = { el, close };
  return open;
}
