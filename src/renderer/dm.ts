// DM window: chooses the table screen and switches what the table shows.
import { describeDisplay } from "../core/displays.ts";
import type { TableState } from "../core/table.ts";
import type { TableStatus } from "../main/preload.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $<HTMLParagraphElement>("status");
const displaySelect = $<HTMLSelectElement>("display");
const testGridBtn = $<HTMLButtonElement>("testGrid");
const curtainBtn = $<HTMLButtonElement>("curtain");

function renderState(s: TableState): void {
  testGridBtn.setAttribute("aria-pressed", String(s.testGrid));
  curtainBtn.setAttribute("aria-pressed", String(s.curtain));
}

function renderStatus(st: TableStatus): void {
  displaySelect.replaceChildren(
    ...st.displays.map((d) => {
      const o = document.createElement("option");
      o.value = String(d.id);
      o.textContent = describeDisplay(d);
      o.selected = d.id === st.playerDisplayId;
      return o;
    }),
  );
  const onScreen = st.displays.find((d) => d.id === st.playerDisplayId);
  statusEl.textContent =
    st.fullscreen && onScreen
      ? `Table window is fullscreen on ${describeDisplay(onScreen)}.`
      : st.displays.length > 1
        ? "The table window is in a normal window on this laptop. Pick the projector to make it fullscreen there."
        : "No second screen found. The table window is open on this screen for testing.";
}

testGridBtn.addEventListener("click", () => window.terra.patch({ testGrid: testGridBtn.getAttribute("aria-pressed") !== "true" }));
curtainBtn.addEventListener("click", () => window.terra.patch({ curtain: curtainBtn.getAttribute("aria-pressed") !== "true" }));
displaySelect.addEventListener("change", () => window.terra.patch({ playerDisplayId: Number(displaySelect.value) }));

window.terra.onState(renderState);
window.terra.onStatus(renderStatus);
window.terra.getState().then(renderState);
window.terra.getStatus().then(renderStatus);
