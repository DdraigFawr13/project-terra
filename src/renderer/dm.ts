// DM window: chooses the table screen, switches what the table shows, and calibrates it (D-004). The map comes first,
// beside one panel (D-038) whose thumbnail is a live picture of the table, drawn by the table's own drawing code (D-025).
import { DARK_LOOKS, LIGHT_LOOKS, LOOK_NAME, lookOf, parseAppearance, type Appearance, type Look } from "../core/appearance.ts";
import { defaultCalibration, layerFor, moveCorner, nudgeCorner, visibleRect, type Calibration } from "../core/calibration.ts";
import { describeDisplay } from "../core/displays.ts";
import { playerViewOf, viewOf, type TableState } from "../core/table.ts";
import type { DmApi, EarlierSave, TableStatus } from "../main/dm-preload.ts";
import { initFight } from "./dm-fight.ts";
import { initMaps } from "./dm-map.ts";
import { initMonsters } from "./dm-monsters.ts";
import { initParty } from "./dm-party.ts";
import { initQuickHp } from "./quick-hp.ts";
import { button, el } from "./dom.ts";
import { popover } from "./popover.ts";
import type { DiscColour } from "../core/fight.ts";
import { initPanel, type Tab } from "./panel.ts";
import { FogPainter } from "./fog-draw.ts";
import { icon, type IconName } from "./icons.ts";
import { drawTable, mapImages, onPortraitLoad } from "./table-draw.ts";

// ---- Appearance (D-033): this laptop's own, like the layouts; set first so the window never flashes another look ----
const APPEARANCE_KEY = "terra.appearance.v1";
let appearance: Appearance = parseAppearance(null);
try {
  appearance = parseAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "null"));
} catch {
  // An unreadable choice starts from Ember.
}
document.documentElement.dataset.look = lookOf(appearance);
function setAppearance(a: Appearance): void {
  appearance = a;
  document.documentElement.dataset.look = lookOf(a);
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(a));
  } catch {
    // Not remembering the look is harmless.
  }
}

const bridge = (window as unknown as { terra: DmApi }).terra;
// The bridge copies a state every time it hands one to the page, and with a long fog list that copy is the slow part.
// So the window takes each new state once, here, and every panel listens to this copy (D-029).
const listeners: ((s: TableState) => void)[] = [];
let latest: TableState | null = null;
bridge.onState((s) => {
  latest = s;
  // One panel failing mustn't stop the others, such as the table preview, from showing the new state.
  for (const fn of listeners)
    try {
      fn(s);
    } catch (e) {
      console.error(e);
    }
});
const first = bridge.getState().then((s) => (latest ??= s));
const terra: DmApi = {
  ...bridge,
  onState: (fn) => void listeners.push(fn),
  getState: () => first.then(() => latest!),
};
// Found once, before any window is closed: a closed window's content leaves the page, and getElementById no longer
// finds its buttons (Table setup's Test grid and Flip letters, say). Elements made later are looked up as usual.
const byId = new Map([...document.querySelectorAll<HTMLElement>("[id]")].map((e) => [e.id, e]));
const $ = <T extends HTMLElement>(id: string) => (byId.get(id) ?? document.getElementById(id)) as T;
const statusEl = $<HTMLSpanElement>("status");
const noticeEl = $<HTMLSpanElement>("notice");
const displaySelect = $<HTMLSelectElement>("display");
const testGridBtn = $<HTMLButtonElement>("testGrid");
const curtainBtn = $<HTMLButtonElement>("curtain");
const calibrateBtn = $<HTMLButtonElement>("calibrate");
const calState = $<HTMLParagraphElement>("calState");
const calTools = $<HTMLDivElement>("calTools");
const calWidth = $<HTMLInputElement>("calWidth");
const calHeight = $<HTMLInputElement>("calHeight");
const preview = $<HTMLCanvasElement>("calPreview");
const cornerBtns = [...document.querySelectorAll<HTMLButtonElement>("button.corner")];
const previewText = $<HTMLSpanElement>("previewText");
const tablePreview = $<HTMLCanvasElement>("tablePreview");

// Icons go in front of each labelled control.
for (const el of document.querySelectorAll<HTMLElement>("[data-icon]"))
  el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon as IconName));
const css = getComputedStyle(document.documentElement);
// The map and the previews are black in every look, so they keep Ember's copper (D-033).
const ACCENT = css.getPropertyValue("--map-accent").trim();
const FOCUS = css.getPropertyValue("--map-focus").trim();
const PREVIEW_TEXT = {
  curtain: "Curtain: the table is blank",
  calibrate: "Calibration pattern",
  map: "",
  testGrid: "Test grid",
  idle: "Title only",
} as const;

let state: TableState | null = null;
let status: TableStatus | null = null;
let selected = 0;
let dragging = false;
/** Calibration changes sent but not yet answered. Echoes of older states are ignored until they are. */
let pending = 0;

/** The calibration for the screen the table is on now, or the uncalibrated default. */
function current(): { cal: Calibration; saved: boolean } | null {
  if (!state || !status) return null;
  const saved = state.calibrations[status.surfaceKey];
  return { cal: saved ?? defaultCalibration(status.surface), saved: !!saved };
}

function saveCalibration(cal: Calibration): void {
  if (!state || !status) return;
  // Show the change at once; the main process echoes the same state back.
  state = { ...state, calibrations: { ...state.calibrations, [status.surfaceKey]: cal } };
  renderCalibration();
  pending++;
  terra.apply({ type: "calibrations", value: state.calibrations }).then(() => {
    if (--pending === 0 && latest) renderState(latest);
  });
}

function renderState(s: TableState): void {
  // While calibration changes are in flight, the local state is newer than any echo.
  if (pending === 0) state = s;
  testGridBtn.setAttribute("aria-pressed", String(s.testGrid));
  curtainBtn.setAttribute("aria-pressed", String(s.curtain));
  calibrateBtn.setAttribute("aria-pressed", String(s.calibrating));
  $<HTMLButtonElement>("flipLetters").setAttribute("aria-pressed", String(s.flipLetters));
  renderCalibration();
  drawTablePreview();
}

/** The table in miniature: the same drawing as the table window, without the projector's warp. */
function drawTablePreview(): void {
  if (!state || !status) return;
  const view = playerViewOf(state, status.surfaceKey);
  previewText.textContent = PREVIEW_TEXT[view.view];
  const mode = view.view === "curtain" || view.view === "idle" ? null : view.view;
  tablePreview.hidden = !mode;
  if (!mode) return;
  const cal = view.calibration ?? defaultCalibration(status.surface);
  const layer = layerFor(cal, status.surface);
  const dpr = window.devicePixelRatio || 1;
  const w = tablePreview.clientWidth;
  const k = w / (layer.box.width * layer.pxPerInch);
  const h = Math.round(layer.box.height * layer.pxPerInch * k);
  tablePreview.style.height = `${h}px`;
  tablePreview.width = Math.round(w * dpr);
  tablePreview.height = Math.round(h * dpr);
  drawTable(
    tablePreview.getContext("2d")!,
    { cal, layer, mode, calibrated: !!view.calibration, view, image: tableImage, fog, area: visibleRect(cal, status.surface) },
    dpr * k,
  );
}

function renderStatus(st: TableStatus): void {
  status = st;
  displaySelect.replaceChildren(
    ...st.displays.map((d) => {
      const o = document.createElement("option");
      o.value = String(d.id);
      o.textContent = describeDisplay(d, st.displays);
      o.selected = d.id === st.playerDisplayId;
      return o;
    }),
  );
  const onScreen = st.displays.find((d) => d.id === st.playerDisplayId);
  statusEl.textContent =
    st.fullscreen && onScreen
      ? `Table window is fullscreen on ${describeDisplay(onScreen, st.displays)}.`
      : st.displays.length > 1
        ? "The table window is in a normal window on this laptop. Pick the projector to make it fullscreen there."
        : "No second screen found. The table window is open on this screen for testing.";
  noticeEl.hidden = !st.notice;
  noticeEl.textContent = st.notice ?? "";
  renderCalibration();
  drawTablePreview();
}

function renderCalibration(): void {
  const c = current();
  if (!c || !state || !status) return;
  const where = status.fullscreen ? "this projector" : "the table window on this laptop (for testing with a ruler on the screen)";
  calState.textContent = state.calibrating
    ? `Calibrating ${where}. Press Done when all four corners sit on their marks.`
    : c.saved
      ? `Calibrated for ${where} with a ${c.cal.widthIn} × ${c.cal.heightIn} inch rectangle.`
      : `Not calibrated for ${where} yet. Squares are close to 1 inch only on a normal screen.`;
  calTools.hidden = !state.calibrating;
  if (calTools.hidden) return;
  if (document.activeElement !== calWidth) calWidth.value = String(c.cal.widthIn);
  if (document.activeElement !== calHeight) calHeight.value = String(c.cal.heightIn);
  cornerBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(i === selected)));
  drawPreview(c.cal);
}

/** The table screen in miniature: its outline, the four corners and the rectangle between them. */
function drawPreview(cal: Calibration): void {
  if (!status) return;
  const dpr = window.devicePixelRatio || 1;
  const w = preview.clientWidth;
  const h = Math.round((w * status.surface.height) / status.surface.width);
  preview.style.height = `${h}px`;
  preview.width = Math.round(w * dpr);
  preview.height = Math.round(h * dpr);
  const ctx = preview.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  const pts = cal.corners.map((p) => ({ x: p.x * w, y: p.y * h }));
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.font = `700 13px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  pts.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
    ctx.fillStyle = i === selected ? FOCUS : ACCENT;
    ctx.fill();
    ctx.fillStyle = "#0f1617";
    ctx.fillText(String(i + 1), p.x, p.y + 0.5);
  });
}

const fractionAt = (e: PointerEvent) => {
  const r = preview.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
};

preview.addEventListener("pointerdown", (e) => {
  const c = current();
  if (!c) return;
  const r = preview.getBoundingClientRect();
  const at = fractionAt(e);
  // Pick the nearest corner, in preview pixels.
  const dist = c.cal.corners.map((p) => Math.hypot((p.x - at.x) * r.width, (p.y - at.y) * r.height));
  const nearest = dist.indexOf(Math.min(...dist));
  selected = nearest;
  if (dist[nearest]! <= 24) {
    dragging = true;
    preview.setPointerCapture(e.pointerId);
  }
  renderCalibration();
});
preview.addEventListener("pointermove", (e) => {
  const c = current();
  if (dragging && c) saveCalibration(moveCorner(c.cal, selected, fractionAt(e)));
});
const endDrag = () => {
  dragging = false;
};
preview.addEventListener("pointerup", endDrag);
preview.addEventListener("pointercancel", endDrag);

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
preview.addEventListener("keydown", (e) => {
  const c = current();
  if (!c || !status) return;
  if (["1", "2", "3", "4"].includes(e.key)) {
    selected = Number(e.key) - 1;
    renderCalibration();
    return;
  }
  const move = ARROWS[e.key];
  if (!move) return;
  e.preventDefault();
  const step = e.shiftKey ? 10 : 1;
  saveCalibration(nudgeCorner(c.cal, selected, move[0] * step, move[1] * step, status.surface));
});

cornerBtns.forEach((b, i) =>
  b.addEventListener("click", () => {
    selected = i;
    renderCalibration();
    preview.focus();
  }),
);

function sizeChanged(): void {
  const c = current();
  const w = Number(calWidth.value);
  const h = Number(calHeight.value);
  if (!c || !Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 120 || h > 120) return;
  saveCalibration({ ...c.cal, widthIn: w, heightIn: h });
}
calWidth.addEventListener("change", sizeChanged);
calHeight.addEventListener("change", sizeChanged);

$<HTMLButtonElement>("calReset").addEventListener("click", () => status && saveCalibration(defaultCalibration(status.surface)));
$<HTMLButtonElement>("calDone").addEventListener("click", () => terra.apply({ type: "calibrating", on: false }));
calibrateBtn.addEventListener("click", () =>
  terra.apply({ type: "calibrating", on: calibrateBtn.getAttribute("aria-pressed") !== "true" }),
);
const toggleCurtain = () => terra.apply({ type: "curtain", on: curtainBtn.getAttribute("aria-pressed") !== "true" });
/** Tab, or View > Fold the panel: the panel folds away, so the map has the whole window. */
function togglePanels(): void {
  document.body.dataset.panels = document.body.dataset.panels === "folded" ? "open" : "folded";
  renderCalibration();
  maps.render();
  drawTablePreview();
}

testGridBtn.addEventListener("click", () => terra.apply({ type: "testGrid", on: testGridBtn.getAttribute("aria-pressed") !== "true" }));
curtainBtn.addEventListener("click", toggleCurtain);

// One fog painter and one image cache serve the map view and the preview.
const fog = new FogPainter();
const image = mapImages(() => {
  maps.render();
  drawTablePreview();
});
// The preview shows what the table gets: a patched map's clean copy (D-036).
const tableImage = mapImages(drawTablePreview, "table");
terra.onMapPatched(tableImage.reload);
onPortraitLoad(() => {
  maps.render();
  drawTablePreview();
});
// The disc picked on the map or in its monster sheet, highlighted in both. A tap on a disc opens its HP pad (D-032).
let picked: string | null = null;
const selection = {
  get: () => picked,
  set: (key: string | null, open = false) => {
    picked = key;
    maps.render();
    if (key && open) monsters.show(key.split("-")[0] as DiscColour);
    else monsters.render();
  },
  tap: (colour: DiscColour, letter: string, at: { x: number; y: number }) => quick.show(colour, letter, at),
};

// The panel's tabs (D-038). A section can be in more than one tab: the Encounter list is in Explore and Fight.
let afterLayout = () => {};
const section = (title: string, ...kids: HTMLElement[]) => el("section", { class: "side-sec" }, el("h3", {}, title), ...kids);
const encounterSec = section("Encounter", $("encounterPanel"));
const partySec = section(
  "Party",
  el("p", { class: "hint" }, "Names, AC, HP and passives, typed in once and kept between sessions."),
  button("Party sheet", {}, () => party.show()),
);
const panel = initPanel(
  {
    setup: [$("setupPanel"), partySec],
    explore: [section("Fog", $("fogPanel")), encounterSec],
    fight: [encounterSec],
  },
  () => afterLayout(),
);
const maps = initMaps(terra, ACCENT, fog, image, selection);
afterLayout = () => {
  maps.render();
  drawTablePreview();
  renderCalibration();
};
// The map and the panel change size when the panel's edge moves or it folds: draw them again at their new size.
new ResizeObserver(() => afterLayout()).observe($("mapCanvas"));
new ResizeObserver(() => drawTablePreview()).observe($("preview"));
new ResizeObserver(() => renderCalibration()).observe($("setupPanel"));

// Start fight switches the panel to Fight, End fight back to Explore (D-038).
let fighting: boolean | null = null;
void terra.getState().then((s) => (fighting ??= !!s.fight));
terra.onState((s) => {
  if (fighting !== null && !!s.fight !== fighting) panel.show(s.fight ? "fight" : "explore");
  fighting = !!s.fight;
});

const monsters = initMonsters(terra, selection);
const quick = initQuickHp(terra, monsters.show, () => party.show());
const fight = initFight(terra, monsters.show, (id, at) => quick.showCharacter(id, at));
const party = initParty(terra);
const flipBtn = $<HTMLButtonElement>("flipLetters");
flipBtn.addEventListener("click", () => terra.apply({ type: "flipLetters", on: flipBtn.getAttribute("aria-pressed") !== "true" }));

// ---- Menus (D-032) ----

type Item = { text: string; act: () => void; checked?: boolean; disabled?: boolean; id?: string } | { label: string } | "-";
const pressed = (id: string) => $(id).getAttribute("aria-pressed") === "true";
/** What each menu offers, worked out when it opens so ticks match the table now. */
function menuItems(name: string): Item[] {
  if (name === "table")
    return [
      { text: "Table setup", act: () => panel.show("setup") },
      {
        text: "Calibrate…",
        act: () => {
          panel.show("setup");
          if (!pressed("calibrate")) calibrateBtn.click();
        },
      },
      "-",
      { text: "Test grid", checked: pressed("testGrid"), act: () => testGridBtn.click() },
      { text: "Flip disc letters", checked: pressed("flipLetters"), act: () => flipBtn.click() },
      { text: "Lock map", checked: pressed("lockMap"), disabled: !latest?.map, act: () => $("lockMap").click() },
      { text: "Clear pins", disabled: !latest?.map?.pins.length, act: () => void terra.apply({ type: "clearPins" }) },
      { text: "Clear drawings", disabled: !latest?.map?.drawings.length, act: () => void terra.apply({ type: "clearDrawings" }) },
      "-",
      {
        text: "Import map…",
        act: () => {
          $<HTMLInputElement>("mapFile").click();
        },
      },
      "-",
      { text: "Earlier saves…", act: () => void showEarlier() },
      { text: "Problem report", act: () => void showReport() },
    ];
  if (name === "saves")
    return earlier.length
      ? [
          { label: "Go back to an earlier save; the table now is kept as one" },
          ...earlier.map((e) => ({ text: `${whenSaved(e.time)}: ${e.summary}`, act: () => void restore(e.name) })),
        ]
      : [{ label: "No earlier saves yet" }];
  if (name === "fight")
    return [
      latest?.fight
        ? { text: "End fight", act: () => $("endFight").click() }
        : {
            text: "Start fight",
            act: () => {
              panel.show("fight");
              $("startFight").click();
            },
          },
      { text: "Party", id: "partyBtn", act: party.show },
    ];
  if (name === "appearance") {
    const a = appearance;
    // Picking a look also switches to its mode, so the pick shows at once.
    const look = (l: Look, next: Appearance) => ({ text: LOOK_NAME[l], checked: a[next.mode] === l, act: () => setAppearance(next) });
    return [
      { label: "Mode" },
      { text: "Dark", checked: a.mode === "dark", act: () => setAppearance({ ...a, mode: "dark" }) },
      { text: "Light", checked: a.mode === "light", act: () => setAppearance({ ...a, mode: "light" }) },
      "-",
      { label: "Dark look" },
      ...DARK_LOOKS.map((l) => look(l, { ...a, mode: "dark", dark: l })),
      "-",
      { label: "Light look" },
      ...LIGHT_LOOKS.map((l) => look(l, { ...a, mode: "light", light: l })),
    ];
  }
  return [
    { text: "Setup", checked: panel.tab() === "setup", act: () => panel.show("setup") },
    { text: "Explore", checked: panel.tab() === "explore", act: () => panel.show("explore") },
    { text: "Fight", checked: panel.tab() === "fight", act: () => panel.show("fight") },
    "-",
    { text: "Fold the panel (Tab)", checked: document.body.dataset.panels === "folded", act: togglePanels },
    "-",
    // Opens in place of this menu, so the View menu stays short enough for the laptop screen.
    {
      text: "Appearance…",
      act: () =>
        openMenu(
          menuBtns.find((b) => b.dataset.menu === "view")!,
          "appearance",
        ),
    },
  ];
}
// ---- Earlier saves and the problem report (D-037) ----

let earlier: EarlierSave[] = [];
const tableMenuBtn = () => menuBtns.find((b) => b.dataset.menu === "table")!;
/** "Thu 19:42": the weekday tells today's saves from last session's. */
const whenSaved = (t: number) => new Date(t).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
async function showEarlier(): Promise<void> {
  earlier = await terra.listSaves();
  // Opens in place of the Table menu, like Appearance… in View.
  openMenu(tableMenuBtn(), "saves");
}
function besideTableMenu(content: HTMLElement[]): void {
  const r = tableMenuBtn().getBoundingClientRect();
  popover({ x: r.left, y: r.bottom + 200 }, content);
}
async function restore(name: string): Promise<void> {
  if (!(await terra.restoreSave(name))) besideTableMenu([el("p", { class: "hint" }, "That save couldn't be read.")]);
}
async function showReport(): Promise<void> {
  const text = await terra.problemReport();
  besideTableMenu([
    el("h3", { class: "pop-head" }, "Problem report"),
    el("p", { class: "hint" }, "Copied. Paste it to Claude."),
    el("pre", { id: "reportText", class: "report-text" }, text),
  ]);
}

const menuEl = $<HTMLDivElement>("menu");
const menuBtns = [...document.querySelectorAll<HTMLButtonElement>(".menu-btn")];
function closeMenu(): void {
  menuEl.hidden = true;
  for (const b of menuBtns) b.setAttribute("aria-expanded", "false");
}
function openMenu(btn: HTMLButtonElement, name = btn.dataset.menu!): void {
  const items = menuItems(name).map((it) => {
    if (it === "-") return Object.assign(document.createElement("hr"), { className: "menu-sep" });
    if ("label" in it) return Object.assign(document.createElement("div"), { className: "menu-label", textContent: it.label });
    const b = Object.assign(document.createElement("button"), { type: "button", textContent: it.text, disabled: !!it.disabled });
    if (it.id) b.id = it.id;
    b.setAttribute("role", it.checked === undefined ? "menuitem" : "menuitemcheckbox");
    if (it.checked !== undefined) b.setAttribute("aria-checked", String(it.checked));
    b.addEventListener("click", () => {
      closeMenu();
      it.act();
    });
    return b;
  });
  menuEl.replaceChildren(...items);
  const r = btn.getBoundingClientRect();
  Object.assign(menuEl.style, { left: `${r.left}px`, top: `${r.bottom + 4}px` });
  menuEl.hidden = false;
  for (const b of menuBtns) b.setAttribute("aria-expanded", String(b === btn));
}
for (const b of menuBtns)
  b.addEventListener("click", () => (menuEl.hidden || b.getAttribute("aria-expanded") !== "true" ? openMenu(b) : closeMenu()));
document.addEventListener("pointerdown", (e) => {
  if (!menuEl.hidden && !(e.target as HTMLElement).closest("#menu, .menu-btn")) closeMenu();
});
window.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement;
  if (t.closest("input, textarea, select, [contenteditable]")) return;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    maps.undo();
    return;
  }
  if (e.ctrlKey || e.altKey || e.metaKey || t.closest("input, textarea, select, [contenteditable]")) return;
  if (e.key === "Tab" && !e.shiftKey && (t === document.body || t === document.documentElement)) {
    e.preventDefault();
    togglePanels();
  } else if (e.key === "b" || e.key === "B") toggleCurtain();
  // A held N would skip turns.
  else if ((e.key === "n" || e.key === "N") && !e.repeat) fight.next();
  else if (e.key === "Escape") {
    closeMenu();
    maps.cancel();
  } else maps.shortcut(e.key);
});
displaySelect.addEventListener("change", () => terra.apply({ type: "playerDisplay", id: Number(displaySelect.value) }));
window.addEventListener("resize", () => {
  renderCalibration();
  drawTablePreview();
});

terra.onState(renderState);
terra.onStatus(renderStatus);
terra.getState().then(renderState);
terra.getStatus().then(renderStatus);
