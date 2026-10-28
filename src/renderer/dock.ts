// Movable windows around the map, like an IDE's tool windows (D-031). Each window docks in the left, right or bottom
// area, where windows share a group as tabs and groups stack with dividers between them, or floats over the DM window.
// Drag a tab or a floating window's title bar: the highlighted spot shows where it lands. Everything stays inside the
// DM window, so nothing DM-only can land on the projector (D-002). The layout is this laptop's own, kept between runs.
import { icon } from "./icons.ts";

type Area = "left" | "right" | "bottom";
const AREAS: Area[] = ["left", "right", "bottom"];
type Group = { panels: string[]; active: string; weight: number };
type Rect = { x: number; y: number; w: number; h: number };
/** Where a closed window goes back to when it opens again. `with: "sheet"` means beside any open sheet. */
type Home = { area: Area; with: string | null } | { float: Rect };
type Layout = {
  sizes: Record<Area, number>;
  areas: Record<Area, Group[]>;
  floats: Record<string, Rect>;
  closed: string[];
  homes: Record<string, Home>;
};

export type PanelSpec = {
  id: string;
  /** The tab's label: kept up to date from this element, which the owner fills (a swatch and a name, say). */
  title: HTMLElement;
  /** Buttons for the window's own bar, shown while it is the active tab. */
  actions?: HTMLElement;
  content: HTMLElement;
  /** Sheets close; the map's own windows can be closed and opened again from the Windows menu. */
  sheet: boolean;
  /** Where it docks the first time: tabbed with another window, or in a new group in an area. */
  home: Home;
};
export type Panel = { open: () => void; close: () => void; isOpen: () => boolean };

const KEY = "terra.layout.v1";
const MIN_SIZE = 180;
const fresh = (): Layout => ({
  sizes: { left: 270, right: 330, bottom: 220 },
  areas: { left: [], right: [], bottom: [] },
  floats: {},
  closed: [],
  homes: {},
});

function loadLayout(): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && raw.areas && raw.sizes) return { ...fresh(), ...raw };
  } catch {
    // A missing or unreadable layout starts from the default.
  }
  return fresh();
}

export function initDock(onLayout: () => void) {
  const work = document.getElementById("work")!;
  const floats = document.getElementById("floats")!;
  const specs = new Map<string, PanelSpec>();
  /** Each window's frame: its bar (tab strip when docked, title bar when floating) and its content. */
  const frames = new Map<string, HTMLElement>();
  let layout = loadLayout();
  // Sheets start closed each run, as before, but remember where they were.
  for (const a of AREAS) layout.areas[a] = layout.areas[a].map((g) => ({ ...g, panels: g.panels.filter((p) => !p.startsWith("sheet:")) }));
  layout.floats = Object.fromEntries(Object.entries(layout.floats).filter(([id]) => !id.startsWith("sheet:")));
  let dragging = false;
  let top = 20;

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(layout));
    } catch {
      // Not remembering the layout is harmless.
    }
  };

  const where = (id: string): { area: Area; g: Group } | { float: Rect } | null => {
    for (const area of AREAS) for (const g of layout.areas[area]) if (g.panels.includes(id)) return { area, g };
    return layout.floats[id] ? { float: layout.floats[id]! } : null;
  };
  const isOpen = (id: string) => where(id) !== null;

  /** Take a window out of wherever it is, remembering that spot, and drop groups left empty. */
  function detach(id: string): void {
    const w = where(id);
    if (!w) return;
    if ("float" in w) {
      layout.homes[id] = { float: w.float };
      delete layout.floats[id];
      return;
    }
    const other = w.g.panels.find((p) => p !== id) ?? null;
    layout.homes[id] = { area: w.area, with: other };
    w.g.panels = w.g.panels.filter((p) => p !== id);
    if (w.g.active === id) w.g.active = w.g.panels[0] ?? "";
    layout.areas[w.area] = layout.areas[w.area].filter((g) => g.panels.length > 0);
  }

  function place(id: string, home: Home): void {
    if ("float" in home) {
      layout.floats[id] = home.float;
      return;
    }
    const sheet = home.with === "sheet" ? [...specs.keys()].find((s) => s.startsWith("sheet:") && s !== id && isOpen(s)) : null;
    const near = sheet ? where(sheet) : home.with && home.with !== "sheet" ? where(home.with) : null;
    if (near && "g" in near) {
      near.g.panels.push(id);
      near.g.active = id;
    } else layout.areas[home.area].push({ panels: [id], active: id, weight: 1 });
  }

  // ---- Drawing the areas ----

  function tabLabel(id: string): Node[] {
    return [...specs.get(id)!.title.childNodes].map((n) => n.cloneNode(true));
  }

  function bar(id: string, tabs: string[], g: Group | null): HTMLElement {
    const head = document.createElement("div");
    head.className = "dock-bar";
    const strip = document.createElement("div");
    strip.className = "dock-tabs";
    strip.setAttribute("role", "tablist");
    for (const t of tabs) {
      if (!specs.has(t)) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dock-tab";
      b.setAttribute("role", "tab");
      b.dataset.tab = t;
      b.setAttribute("aria-selected", String(t === id));
      b.append(...tabLabel(t));
      startDrag(b, t, () => {
        if (g) g.active = t;
        save();
        render();
      });
      strip.append(b);
    }
    const spec = specs.get(id)!;
    const tools = document.createElement("div");
    tools.className = "dock-tools";
    if (spec.actions) tools.append(spec.actions);
    const pop = button(g ? "popOut" : "dockIn", g ? "Float this window" : "Dock this window", () => {
      detach(id);
      if (g) {
        const r = frames.get(id)!.getBoundingClientRect();
        layout.floats[id] = {
          x: Math.max(20, r.left - 30),
          y: Math.max(60, r.top - 20),
          w: Math.max(300, r.width),
          h: Math.max(260, r.height),
        };
      } else place(id, dockHome(id));
      save();
      render();
    });
    const close = button("close", "Close", () => api(id).close());
    tools.append(pop, close);
    head.append(strip, tools);
    return head;
  }

  /** Where a floating window docks when its dock button is pressed: where it last docked, or its first home. */
  function dockHome(id: string): Home {
    const h = layout.homes[id];
    return h && !("float" in h) ? h : specs.get(id)!.home;
  }

  function button(name: Parameters<typeof icon>[0], label: string, press: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "icon";
    b.setAttribute("aria-label", label);
    b.title = label;
    b.innerHTML = icon(name);
    b.addEventListener("click", press);
    return b;
  }

  /** The frame for a window: its bar above its content. The content element moves between frames as it is docked. */
  function frame(id: string, tabs: string[], g: Group | null): HTMLElement {
    const f = document.createElement("section");
    f.className = "dock-frame";
    f.dataset.float = id.replace(/^sheet:/, "");
    const body = document.createElement("div");
    body.className = "dock-body";
    body.append(specs.get(id)!.content);
    f.append(bar(id, tabs, g), body);
    frames.set(id, f);
    return f;
  }

  function render(): void {
    if (dragging) return;
    frames.clear();
    for (const area of AREAS) {
      const el = work.querySelector<HTMLElement>(`.dock-area[data-area="${area}"]`)!;
      const groups = layout.areas[area].filter((g) => g.panels.some((p) => specs.has(p)));
      el.replaceChildren();
      groups.forEach((g, i) => {
        if (!specs.has(g.active)) g.active = g.panels.find((p) => specs.has(p))!;
        if (i > 0) el.append(splitter(area, groups[i - 1]!, g));
        const box = frame(g.active, g.panels, g);
        box.classList.add("dock-group");
        box.style.flexGrow = String(g.weight);
        el.append(box);
      });
      work.style.setProperty(`--${area}-w`, groups.length ? `${layout.sizes[area]}px` : "0px");
      work.dataset[`${area}Empty`] = String(!groups.length);
    }
    floats.replaceChildren(
      ...Object.entries(layout.floats)
        .filter(([id]) => specs.has(id))
        .map(([id, r]) => {
          const f = frame(id, [id], null);
          f.classList.add("dock-float");
          Object.assign(f.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, zIndex: String(++top) });
          f.addEventListener("pointerdown", () => (f.style.zIndex = String(++top)));
          // Remember a size the DM drags with the corner.
          new ResizeObserver(() => {
            if (dragging || !layout.floats[id]) return;
            layout.floats[id] = { ...layout.floats[id]!, w: f.offsetWidth, h: f.offsetHeight };
            save();
          }).observe(f);
          return f;
        }),
    );
    onLayout();
  }

  // ---- Resizing: the edges of the areas, and the dividers between groups ----

  function splitter(area: Area, before: Group, after: Group): HTMLElement {
    const s = document.createElement("div");
    s.className = `group-split ${area === "bottom" ? "across" : "down"}`;
    s.addEventListener("pointerdown", (e) => {
      s.setPointerCapture(e.pointerId);
      const [a, b] = [s.previousElementSibling as HTMLElement, s.nextElementSibling as HTMLElement];
      const across = area === "bottom";
      const total = across ? a.offsetWidth + b.offsetWidth : a.offsetHeight + b.offsetHeight;
      const start = across ? e.clientX : e.clientY;
      const first = across ? a.offsetWidth : a.offsetHeight;
      const sum = before.weight + after.weight;
      const move = (m: PointerEvent) => {
        const size = Math.min(total - 60, Math.max(60, first + (across ? m.clientX : m.clientY) - start));
        before.weight = (sum * size) / total;
        after.weight = sum - before.weight;
        a.style.flexGrow = String(before.weight);
        b.style.flexGrow = String(after.weight);
      };
      const up = () => {
        s.removeEventListener("pointermove", move);
        save();
        onLayout();
      };
      s.addEventListener("pointermove", move);
      s.addEventListener("pointerup", up, { once: true });
    });
    return s;
  }

  for (const s of work.querySelectorAll<HTMLElement>(".area-split")) {
    const area = s.dataset.split as Area;
    s.addEventListener("pointerdown", (e) => {
      s.setPointerCapture(e.pointerId);
      const start = area === "bottom" ? e.clientY : e.clientX;
      const first = layout.sizes[area];
      const move = (m: PointerEvent) => {
        const d = (area === "bottom" ? m.clientY : m.clientX) - start;
        const max = (area === "bottom" ? window.innerHeight : window.innerWidth) * 0.6;
        layout.sizes[area] = Math.round(Math.min(max, Math.max(MIN_SIZE, first + (area === "left" ? d : -d))));
        work.style.setProperty(`--${area}-w`, `${layout.sizes[area]}px`);
      };
      const up = () => {
        s.removeEventListener("pointermove", move);
        save();
        onLayout();
      };
      s.addEventListener("pointermove", move);
      s.addEventListener("pointerup", up, { once: true });
    });
  }

  // ---- Moving windows: drag a tab or a floating title bar ----

  type Drop =
    | { kind: "area"; area: Area }
    | { kind: "group"; area: Area; g: Group; at: "before" | "after" | "tab" }
    | { kind: "float"; x: number; y: number };
  const preview = document.createElement("div");
  preview.className = "drop-preview";
  preview.hidden = true;
  document.body.append(preview);

  /** Where a window dropped at (x, y) would go, and the rectangle to highlight. */
  function dropAt(x: number, y: number, id: string): { drop: Drop; rect: Rect | null } {
    const w = work.getBoundingClientRect();
    const edge = 48;
    const inside = y > w.top && y < w.bottom;
    const strip = (area: Area): Rect =>
      area === "left"
        ? { x: w.left, y: w.top, w: Math.max(layout.sizes.left, 200), h: w.height }
        : area === "right"
          ? { x: w.right - Math.max(layout.sizes.right, 200), y: w.top, w: Math.max(layout.sizes.right, 200), h: w.height }
          : { x: w.left, y: w.bottom - Math.max(layout.sizes.bottom, 160), w: w.width, h: Math.max(layout.sizes.bottom, 160) };
    if (inside && x < w.left + edge) return { drop: { kind: "area", area: "left" }, rect: strip("left") };
    if (inside && x > w.right - edge) return { drop: { kind: "area", area: "right" }, rect: strip("right") };
    if (x > w.left && x < w.right && y > w.bottom - edge && y < w.bottom)
      return { drop: { kind: "area", area: "bottom" }, rect: strip("bottom") };
    for (const area of AREAS)
      for (const g of layout.areas[area]) {
        const el = frames.get(g.active);
        if (!el || !el.classList.contains("dock-group")) continue;
        const r = el.getBoundingClientRect();
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
        if (g.panels.length === 1 && g.panels[0] === id) return { drop: { kind: "float", x, y }, rect: null };
        const across = area === "bottom";
        const t = across ? (x - r.left) / r.width : (y - r.top) / r.height;
        if (t < 0.25)
          return {
            drop: { kind: "group", area, g, at: "before" },
            rect: across ? { x: r.left, y: r.top, w: r.width / 2, h: r.height } : { x: r.left, y: r.top, w: r.width, h: r.height / 2 },
          };
        if (t > 0.75)
          return {
            drop: { kind: "group", area, g, at: "after" },
            rect: across
              ? { x: r.left + r.width / 2, y: r.top, w: r.width / 2, h: r.height }
              : { x: r.left, y: r.top + r.height / 2, w: r.width, h: r.height / 2 },
          };
        return { drop: { kind: "group", area, g, at: "tab" }, rect: { x: r.left, y: r.top, w: r.width, h: r.height } };
      }
    return { drop: { kind: "float", x, y }, rect: null };
  }

  function drop(id: string, d: Drop, size: { w: number; h: number }): void {
    detach(id);
    if (d.kind === "float")
      layout.floats[id] = { x: Math.max(0, d.x - 60), y: Math.max(0, d.y - 16), w: Math.max(300, size.w), h: Math.max(240, size.h) };
    else if (d.kind === "area") layout.areas[d.area].push({ panels: [id], active: id, weight: 1 });
    else if (d.at === "tab") {
      d.g.panels.push(id);
      d.g.active = id;
    } else {
      const list = layout.areas[d.area];
      const i = list.indexOf(d.g);
      list.splice(d.at === "before" ? i : i + 1, 0, { panels: [id], active: id, weight: d.g.weight });
    }
  }

  /** A press on `handle` that moves a window once it travels a few pixels; a press that doesn't move is a tap. */
  function startDrag(handle: HTMLElement, id: string, tap: () => void): void {
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest(".dock-tools")) return;
      const start = { x: e.clientX, y: e.clientY };
      // An inactive tab has no frame of its own: measure the one it sits in.
      const f = handle.closest<HTMLElement>(".dock-frame")!;
      const size = { w: f.offsetWidth, h: f.offsetHeight };
      let moved = false;
      let target: Drop | null = null;
      handle.setPointerCapture(e.pointerId);
      const move = (m: PointerEvent) => {
        if (!moved && Math.hypot(m.clientX - start.x, m.clientY - start.y) < 8) return;
        if (!moved) {
          moved = dragging = true;
          f.classList.add("dock-moving");
        }
        const { drop: d, rect } = dropAt(m.clientX, m.clientY, id);
        target = d;
        preview.hidden = false;
        const r = rect ?? { x: m.clientX - 60, y: m.clientY - 16, w: Math.max(300, size.w), h: Math.max(240, size.h) };
        Object.assign(preview.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
        preview.classList.toggle("floating", !rect);
      };
      const end = (cancelled: boolean) => {
        handle.removeEventListener("pointermove", move);
        preview.hidden = true;
        f.classList.remove("dock-moving");
        dragging = false;
        if (!moved) return cancelled || tap();
        if (target && !cancelled) drop(id, target, size);
        save();
        render();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", () => end(false), { once: true });
      handle.addEventListener("pointercancel", () => end(true), { once: true });
    });
  }

  // ---- Windows ----

  function api(id: string): Panel {
    return {
      open: () => {
        layout.closed = layout.closed.filter((c) => c !== id);
        const w = where(id);
        if (!w) place(id, layout.homes[id] ?? specs.get(id)!.home);
        // Opening a window brings it to the front: its tab, or its floating window.
        const now = where(id);
        if (now && "g" in now) now.g.active = id;
        save();
        render();
        frames.get(id)?.scrollIntoView({ block: "nearest" });
      },
      close: () => {
        detach(id);
        if (!specs.get(id)!.sheet) layout.closed.push(id);
        save();
        render();
      },
      isOpen: () => isOpen(id),
    };
  }

  return {
    add(spec: PanelSpec): Panel {
      specs.set(spec.id, spec);
      // A window the saved layout doesn't know yet (a new one, or every window on first run) goes to its home.
      if (!spec.sheet && !isOpen(spec.id) && !layout.closed.includes(spec.id)) place(spec.id, spec.home);
      // A renamed group relabels its tab in place: rebuilding the layout would move the content and drop the focus.
      new MutationObserver(() => {
        for (const t of document.querySelectorAll<HTMLElement>(`.dock-tab[data-tab="${CSS.escape(spec.id)}"]`))
          t.replaceChildren(...tabLabel(spec.id));
      }).observe(spec.title, { childList: true, subtree: true, characterData: true });
      render();
      return api(spec.id);
    },
    /** The map's own windows, for the Windows menu: id, name and whether it is open. */
    list: () =>
      [...specs.values()].filter((s) => !s.sheet).map((s) => ({ id: s.id, name: s.title.textContent ?? s.id, open: isOpen(s.id) })),
    toggle: (id: string) => (isOpen(id) ? api(id).close() : api(id).open()),
    reset: () => {
      layout = fresh();
      for (const s of specs.values()) if (!s.sheet) place(s.id, s.home);
      save();
      render();
    },
  };
}
