// Movable windows around the map, like an IDE's tool windows (D-031, D-032). A window docks in an area (left, beside
// the map, centre, right, bottom), where windows share a group as tabs and groups stack with dividers between them, or
// floats over the DM window. Drag a window by its bar: the highlighted spot shows where it lands. Three presets (Prep,
// Explore, Fight) each keep their own arrangement; a pinned floating window stays put across them. Everything stays
// inside the DM window, so nothing DM-only can land on the projector (D-002). Layouts are this laptop's own.
import { icon } from "./icons.ts";

type Area = "left" | "mapside" | "center" | "right" | "bottom";
const AREAS: Area[] = ["left", "mapside", "center", "right", "bottom"];
/** Areas whose size the DM drags; the others take what is left (centre) or what they need (beside the map). */
type Sized = "left" | "right" | "bottom";
export type Preset = "prep" | "explore" | "fight";
const PRESETS: Preset[] = ["prep", "explore", "fight"];
type Group = { panels: string[]; active: string; weight: number; folded?: boolean };
type Rect = { x: number; y: number; w: number; h: number };
/** Where a window goes: tabbed with another (`with`, or "sheet" for beside any open sheet), else a new group in `area`. */
export type Home = { area: Area; with: string | null; weight?: number } | { float: Rect };
type Arrangement = { sizes: Record<Sized, number>; areas: Record<Area, Group[]>; floats: Record<string, Rect>; closed: string[] };
type Layout = {
  preset: Preset;
  arrangements: Partial<Record<Preset, Arrangement>>;
  /** Pinned floating windows: above other floating windows, and in place whichever preset is on. */
  pinned: Record<string, Rect>;
  /** Where a closed window last was, to open it there again. */
  homes: Record<string, Home>;
};

export type PanelSpec = {
  id: string;
  /** The tab's label: kept up to date from this element, which the owner fills (a swatch and a name, say). */
  title: HTMLElement;
  /** The window's own buttons, shown in a second row under the tabs while it is the active tab. */
  actions?: HTMLElement;
  content: HTMLElement;
  /** Sheets start closed each run and open beside each other. */
  sheet: boolean;
  /** The map's window never closes, so the middle can't end up empty mid-game. */
  closable?: boolean;
  /** Where it starts in each preset; null means closed there. */
  homes: Record<Preset, Home | null>;
  /** Where it opens in a preset that starts without it. */
  fallback: Home;
};
export type Panel = { open: () => void; close: () => void; isOpen: () => boolean };

const KEY = "terra.layout.v2";
const MIN_SIZE = 180;
const SLIDE_MS = 150;
const blank = (): Arrangement => ({
  sizes: { left: 270, right: 340, bottom: 220 },
  areas: { left: [], mapside: [], center: [], right: [], bottom: [] },
  floats: {},
  closed: [],
});

function loadLayout(): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && raw.arrangements && PRESETS.includes(raw.preset)) return { pinned: {}, homes: {}, ...raw };
  } catch {
    // A missing or unreadable layout starts from the defaults.
  }
  return { preset: "prep", arrangements: {}, pinned: {}, homes: {} };
}

export function initDock(onLayout: () => void) {
  const work = document.getElementById("work")!;
  const floats = document.getElementById("floats")!;
  const specs = new Map<string, PanelSpec>();
  /** Each window's frame on screen: its bar, its second row and its content. */
  const frames = new Map<string, HTMLElement>();
  const layout = loadLayout();
  // Sheets open last time open again where they were (D-034): each shows once its owner makes it. The owner forgets
  // one it won't make, such as the sheet of a colour with no discs left.
  const sheetIds = (a: Arrangement) => [
    ...AREAS.flatMap((area) => (a.areas[area] ?? []).flatMap((g) => g.panels)),
    ...Object.keys(a.floats),
  ];
  const restored = new Set(
    [...Object.values(layout.arrangements).flatMap((a) => sheetIds(a!)), ...Object.keys(layout.pinned)].filter((id) =>
      id.startsWith("sheet:"),
    ),
  );
  let dragging = false;
  let top = 20;
  /** The window last touched: outlined in copper (D-032). */
  let focus: string | null = null;
  /** The window that just docked or floated: it slides in. */
  let arrived: string | null = null;

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(layout));
    } catch {
      // Not remembering the layout is harmless.
    }
  };

  /** The arrangement for the preset on now, built from each window's home the first time it is used. */
  function now(): Arrangement {
    let a = layout.arrangements[layout.preset];
    if (!a) {
      a = blank();
      layout.arrangements[layout.preset] = a;
      for (const s of specs.values()) if (!s.sheet) settle(s, a);
    }
    return a;
  }

  /** Give a window its place in an arrangement that doesn't know it yet. */
  function settle(s: PanelSpec, a: Arrangement): void {
    if (where(s.id, a) || a.closed.includes(s.id)) return;
    const home = s.homes[layout.preset];
    if (home) place(s.id, home, a);
    else a.closed.push(s.id);
  }

  type Where = { area: Area; g: Group } | { float: Rect } | { pinned: Rect };
  function where(id: string, a: Arrangement = now()): Where | null {
    for (const area of AREAS) for (const g of a.areas[area]) if (g.panels.includes(id)) return { area, g };
    if (a.floats[id]) return { float: a.floats[id]! };
    return layout.pinned[id] ? { pinned: layout.pinned[id]! } : null;
  }
  const isOpen = (id: string) => where(id) !== null;

  /** Take a window out of an arrangement's docked groups and floats (not the pinned ones), dropping empty groups. */
  function unplace(id: string, a: Arrangement): void {
    delete a.floats[id];
    for (const area of AREAS) {
      for (const g of a.areas[area]) {
        g.panels = g.panels.filter((p) => p !== id);
        if (g.active === id) g.active = g.panels[0] ?? "";
      }
      a.areas[area] = a.areas[area].filter((g) => g.panels.length > 0);
    }
  }

  /** Take a window out of wherever it is, remembering that spot. */
  function detach(id: string): void {
    const a = now();
    const w = where(id, a);
    if (!w) return;
    if ("pinned" in w) {
      layout.homes[id] = { float: w.pinned };
      delete layout.pinned[id];
      return;
    }
    layout.homes[id] = "float" in w ? { float: w.float } : { area: w.area, with: w.g.panels.find((p) => p !== id) ?? null };
    unplace(id, a);
  }

  function place(id: string, home: Home, a: Arrangement = now()): void {
    if ("float" in home) {
      a.floats[id] = home.float;
      return;
    }
    const sheet = home.with === "sheet" ? [...specs.keys()].find((s) => s.startsWith("sheet:") && s !== id && where(s, a)) : null;
    const near = sheet ? where(sheet, a) : home.with && home.with !== "sheet" ? where(home.with, a) : null;
    if (near && "g" in near) {
      near.g.panels.push(id);
      near.g.active = id;
    } else a.areas[home.area].push({ panels: [id], active: id, weight: home.weight ?? 1 });
  }

  // ---- Drawing ----

  function tabLabel(id: string): Node[] {
    return [...specs.get(id)!.title.childNodes].map((n) => n.cloneNode(true));
  }

  /** A window button on a bar; `kind` (fold, pin, pop, close) lets a narrow window show only some of them. */
  function button(kind: string, name: Parameters<typeof icon>[0], label: string, press: () => void, pressed?: boolean): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `icon win-${kind}`;
    b.setAttribute("aria-label", label);
    b.title = label;
    if (pressed !== undefined) b.setAttribute("aria-pressed", String(pressed));
    b.innerHTML = icon(name);
    b.addEventListener("click", press);
    return b;
  }

  /** A window's frame: a bar of tabs and window buttons (grab it anywhere else to move), its own buttons, its content. */
  function frame(id: string, tabs: string[], g: Group | null, pinned = false): HTMLElement {
    const spec = specs.get(id)!;
    const f = document.createElement("section");
    f.className = "dock-frame";
    f.dataset.panel = id;
    f.dataset.float = id.replace(/^sheet:/, "");
    f.classList.toggle("is-active", focus === id);
    f.classList.toggle("folded", !!g?.folded);
    if (arrived === id) f.classList.add("arrive");
    f.addEventListener("pointerdown", () => setFocus(id), { capture: true });

    const bar = document.createElement("div");
    bar.className = "dock-bar";
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
      grab(b, t, () => {
        if (g) {
          g.active = t;
          g.folded = false;
        }
        focus = t;
        save();
        render();
      });
      strip.append(b);
    }
    const tools = document.createElement("div");
    tools.className = "dock-tools";
    if (g)
      tools.append(
        button("fold", g.folded ? "down" : "minus", g.folded ? "Unfold" : "Fold to the bar", () => {
          g.folded = !g.folded;
          save();
          render();
        }),
      );
    else
      tools.append(
        button(
          "pin",
          "pin",
          pinned ? "Unpin" : "Pin: keep on top and in place across layouts",
          () => {
            const r = pinned ? layout.pinned[id]! : now().floats[id]!;
            detach(id);
            if (pinned) now().floats[id] = r;
            else layout.pinned[id] = r;
            save();
            render();
          },
          pinned,
        ),
      );
    tools.append(
      button("pop", g ? "popOut" : "dockIn", g ? "Float this window" : "Dock this window", () => {
        const r = f.getBoundingClientRect();
        detach(id);
        if (g)
          now().floats[id] = {
            x: Math.max(20, r.left - 30),
            y: Math.max(60, r.top - 20),
            w: Math.max(300, r.width),
            h: Math.max(260, r.height),
          };
        else place(id, dockHome(id));
        arrived = id;
        save();
        render();
      }),
    );
    if (spec.closable !== false) tools.append(button("close", "close", "Close", () => api(id).close()));
    bar.append(strip, tools);
    // The bar's empty space moves the window too: the biggest target for a pen (D-032).
    grab(bar, id, () => undefined);

    const body = document.createElement("div");
    body.className = "dock-body";
    body.append(spec.content);
    f.append(bar);
    if (spec.actions) {
      const row = document.createElement("div");
      row.className = "dock-actions";
      row.append(spec.actions);
      f.append(row);
    }
    f.append(body);
    frames.set(id, f);
    return f;
  }

  /** Where a floating window docks when its dock button is pressed: where it last docked, or its home. */
  function dockHome(id: string): Home {
    const h = layout.homes[id];
    const s = specs.get(id)!;
    return h && !("float" in h) ? h : (s.homes[layout.preset] ?? s.fallback);
  }

  function setFocus(id: string): void {
    if (focus === id) return;
    focus = id;
    for (const f of document.querySelectorAll<HTMLElement>(".dock-frame")) f.classList.toggle("is-active", f.dataset.panel === id);
  }

  function render(): void {
    if (dragging) return;
    frames.clear();
    const a = now();
    for (const area of AREAS) {
      const el = work.querySelector<HTMLElement>(`.dock-area[data-area="${area}"]`)!;
      const groups = a.areas[area].filter((g) => g.panels.some((p) => specs.has(p)));
      el.replaceChildren();
      groups.forEach((g, i) => {
        if (!specs.has(g.active)) g.active = g.panels.find((p) => specs.has(p))!;
        if (i > 0) el.append(splitter(area, groups[i - 1]!, g));
        const box = frame(g.active, g.panels, g);
        box.classList.add("dock-group");
        box.style.flexGrow = String(g.weight);
        el.append(box);
      });
      if (area === "left" || area === "right" || area === "bottom")
        work.style.setProperty(`--${area}-w`, groups.length ? `${a.sizes[area]}px` : "0px");
      work.dataset[`${area}Empty`] = String(!groups.length);
    }
    const floating = (rects: Record<string, Rect>, pinned: boolean) =>
      Object.entries(rects)
        .filter(([id]) => specs.has(id))
        .map(([id, r]) => {
          const f = frame(id, [id], null, pinned);
          f.classList.add("dock-float");
          f.classList.toggle("pinned", pinned);
          const raise = () => (f.style.zIndex = String((pinned ? 1000 : 0) + ++top));
          Object.assign(f.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
          raise();
          f.addEventListener("pointerdown", raise);
          // Remember a size the DM drags with the corner.
          new ResizeObserver(() => {
            const store = pinned ? layout.pinned : now().floats;
            if (dragging || !store[id]) return;
            store[id] = { ...store[id]!, w: f.offsetWidth, h: f.offsetHeight };
            save();
          }).observe(f);
          return f;
        });
    floats.querySelectorAll(".dock-float").forEach((f) => f.remove());
    floats.append(...floating(a.floats, false), ...floating(layout.pinned, true));
    if (arrived) {
      const done = frames.get(arrived);
      setTimeout(() => done?.classList.remove("arrive"), SLIDE_MS + 50);
    }
    arrived = null;
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-preset]"))
      b.setAttribute("aria-pressed", String(b.dataset.preset === layout.preset));
    onLayout();
  }

  // ---- Resizing: the edges of the areas, and the dividers between groups ----

  function splitter(area: Area, before: Group, after: Group): HTMLElement {
    const s = document.createElement("div");
    const across = area === "bottom";
    s.className = `group-split ${across ? "across" : "down"}`;
    s.addEventListener("pointerdown", (e) => {
      s.setPointerCapture(e.pointerId);
      const [x, y] = [s.previousElementSibling as HTMLElement, s.nextElementSibling as HTMLElement];
      const total = across ? x.offsetWidth + y.offsetWidth : x.offsetHeight + y.offsetHeight;
      const start = across ? e.clientX : e.clientY;
      const first = across ? x.offsetWidth : x.offsetHeight;
      const sum = before.weight + after.weight;
      const move = (m: PointerEvent) => {
        const size = Math.min(total - 60, Math.max(60, first + (across ? m.clientX : m.clientY) - start));
        before.weight = (sum * size) / total;
        after.weight = sum - before.weight;
        x.style.flexGrow = String(before.weight);
        y.style.flexGrow = String(after.weight);
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
    const area = s.dataset.split as Sized;
    s.addEventListener("pointerdown", (e) => {
      s.setPointerCapture(e.pointerId);
      const start = area === "bottom" ? e.clientY : e.clientX;
      const first = now().sizes[area];
      const move = (m: PointerEvent) => {
        const d = (area === "bottom" ? m.clientY : m.clientX) - start;
        const max = (area === "bottom" ? window.innerHeight : window.innerWidth) * 0.6;
        now().sizes[area] = Math.round(Math.min(max, Math.max(MIN_SIZE, first + (area === "left" ? d : -d))));
        work.style.setProperty(`--${area}-w`, `${now().sizes[area]}px`);
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

  // ---- Moving windows: drag a tab or a bar ----

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
    const c = work.querySelector<HTMLElement>('.dock-area[data-area="center"]')!.getBoundingClientRect();
    const a = now();
    const edge = 48;
    const inside = y > w.top && y < w.bottom;
    const strip = (area: Sized): Rect =>
      area === "left"
        ? { x: w.left, y: w.top, w: Math.max(a.sizes.left, 200), h: w.height }
        : area === "right"
          ? { x: w.right - Math.max(a.sizes.right, 200), y: w.top, w: Math.max(a.sizes.right, 200), h: w.height }
          : { x: c.left, y: w.bottom - Math.max(a.sizes.bottom, 160), w: c.width, h: Math.max(a.sizes.bottom, 160) };
    if (inside && x < w.left + edge) return { drop: { kind: "area", area: "left" }, rect: strip("left") };
    if (inside && x > w.right - edge) return { drop: { kind: "area", area: "right" }, rect: strip("right") };
    if (x > c.left && x < c.right && y > w.bottom - edge && y < w.bottom)
      return { drop: { kind: "area", area: "bottom" }, rect: strip("bottom") };
    // Directly beside the map: a narrow strip along the centre's left edge, for the Tools window above all.
    if (inside && x > c.left - 12 && x < c.left + edge && !a.areas.mapside.length)
      return { drop: { kind: "area", area: "mapside" }, rect: { x: c.left, y: c.top, w: 120, h: c.height } };
    for (const area of AREAS)
      for (const g of a.areas[area]) {
        const el = frames.get(g.active);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
        if (g.panels.length === 1 && g.panels[0] === id) return { drop: { kind: "float", x, y }, rect: null };
        const across = area === "bottom";
        const t = across ? (x - r.left) / r.width : (y - r.top) / r.height;
        if (t < 0.25 && area !== "center")
          return {
            drop: { kind: "group", area, g, at: "before" },
            rect: across ? { x: r.left, y: r.top, w: r.width / 2, h: r.height } : { x: r.left, y: r.top, w: r.width, h: r.height / 2 },
          };
        if (t > 0.75 && area !== "center")
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
    const wasPinned = !!layout.pinned[id];
    detach(id);
    const a = now();
    const rect = (x: number, y: number) => ({
      x: Math.max(0, x - 60),
      y: Math.max(0, y - 16),
      w: Math.max(300, size.w),
      h: Math.max(240, size.h),
    });
    if (d.kind === "float") (wasPinned ? layout.pinned : a.floats)[id] = rect(d.x, d.y);
    else if (d.kind === "area") a.areas[d.area].push({ panels: [id], active: id, weight: 1 });
    else if (d.at === "tab") {
      d.g.panels.push(id);
      d.g.active = id;
      d.g.folded = false;
    } else {
      const list = a.areas[d.area];
      const i = list.indexOf(d.g);
      list.splice(d.at === "before" ? i : i + 1, 0, { panels: [id], active: id, weight: d.g.weight });
    }
    arrived = id;
  }

  /** A press on `handle` that moves window `id` once it travels a few pixels; a press that doesn't move is a tap. */
  function grab(handle: HTMLElement, id: string, tap: () => void): void {
    handle.addEventListener("pointerdown", (e) => {
      const t = e.target as HTMLElement;
      // On a bar, only its empty space grabs: its tabs grab their own window, and its buttons press.
      if (e.button !== 0 || t.closest(".dock-tools") || (handle.classList.contains("dock-bar") && t.closest("button"))) return;
      e.stopPropagation();
      const start = { x: e.clientX, y: e.clientY };
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
        const a = now();
        a.closed = a.closed.filter((c) => c !== id);
        if (!where(id)) {
          const s = specs.get(id)!;
          place(id, layout.homes[id] ?? s.homes[layout.preset] ?? s.fallback);
          arrived = id;
        }
        // Opening a window brings it to the front: its tab, unfolded, or its floating window.
        const w = where(id);
        if (w && "g" in w) {
          w.g.active = id;
          w.g.folded = false;
        }
        focus = id;
        save();
        render();
      },
      close: () => {
        detach(id);
        if (!specs.get(id)!.sheet) now().closed.push(id);
        save();
        render();
      },
      isOpen: () => isOpen(id),
    };
  }

  return {
    add(spec: PanelSpec): Panel {
      specs.set(spec.id, spec);
      // A window the arrangement doesn't know yet (a new one, or every window on first run) goes to its home.
      if (!spec.sheet) settle(spec, now());
      // A renamed group relabels its tab in place: rebuilding the layout would move the content and drop the focus.
      new MutationObserver(() => {
        for (const t of document.querySelectorAll<HTMLElement>(`.dock-tab[data-tab="${CSS.escape(spec.id)}"]`))
          t.replaceChildren(...tabLabel(spec.id));
      }).observe(spec.title, { childList: true, subtree: true, characterData: true });
      render();
      return api(spec.id);
    },
    /** The map's own windows, for the View menu: id, name, whether each is open and whether it can close. */
    list: () =>
      [...specs.values()]
        .filter((s) => !s.sheet)
        .map((s) => ({ id: s.id, name: s.title.textContent ?? s.id, open: isOpen(s.id), closable: s.closable !== false })),
    toggle: (id: string) => (isOpen(id) ? api(id).close() : api(id).open()),
    /** Whether a sheet was open when the DM window last closed. */
    wasOpen: (id: string) => restored.has(id),
    /** Drop a sheet that was open last time but won't be made now, so it can't pop up later by surprise. */
    forget: (id: string) => {
      restored.delete(id);
      for (const a of Object.values(layout.arrangements)) unplace(id, a!);
      delete layout.pinned[id];
      save();
    },
    open: (id: string) => api(id).open(),
    preset: () => layout.preset,
    usePreset: (p: Preset) => {
      if (p === layout.preset) return;
      layout.preset = p;
      // Pinned windows stay where they are: the new arrangement mustn't place them a second time.
      const a = now();
      for (const id of Object.keys(layout.pinned)) unplace(id, a);
      save();
      render();
    },
    /** Put the preset on now back as it started. */
    reset: () => {
      delete layout.arrangements[layout.preset];
      save();
      render();
    },
  };
}
