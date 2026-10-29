// Scenes (D-039): the places the DM has prepared, listed in Setup, and the current scene's name above the tabs, which
// switches scenes in one tap. Switching drops the curtain in the same step, so the DM lifts it when the new scene is ready.
import {
  listedScenes,
  removedScenes,
  sceneContent,
  sceneTitle,
  MAX_SCENE_NAME,
  MAX_SPOT_NAME,
  MAX_TITLE,
  type Command,
  type Scene,
  type TableState,
} from "../core/table.ts";
import type { DmApi } from "../main/dm-preload.ts";
import { button, el } from "./dom.ts";
import { popover } from "./popover.ts";

export function initScenes(terra: DmApi, sceneBtn: HTMLButtonElement, spotsBtn: HTMLButtonElement): { section: HTMLElement } {
  let state: TableState | null = null;
  const run = (c: Command) => void terra.apply(c);
  const list = el("ol", { id: "sceneList", class: "entries", "aria-label": "Scenes" });
  const removedBox = el("details", { id: "removedScenes", class: "removed-scenes" });
  const section = el(
    "section",
    { class: "side-sec", "aria-labelledby": "scenes-heading" },
    el("h3", { id: "scenes-heading" }, "Scenes"),
    list,
    button("New scene", { id: "newScene" }, () => nameForm(null, list), "plus"),
    removedBox,
    el("p", { class: "hint" }, "Tap a scene to put it on the table. The curtain drops; lift it (B) when the scene is ready."),
  );

  const at = (b: HTMLElement) => {
    const r = b.getBoundingClientRect();
    return { x: r.left - 300, y: r.top + r.height / 2 };
  };

  /** What a scene's row says under its name: its map, and a fight waiting in it. */
  function note(s: TableState, scene: Scene): string {
    const c = sceneContent(s, scene);
    const parts = [c.map ? (scene.name ? c.map.name : "") : "No map yet"];
    if (c.fight) parts.push(scene.parked ? `fight paused, round ${c.fight.round}` : `fight, round ${c.fight.round}`);
    return parts.filter(Boolean).join(" · ");
  }

  /** Name a new scene (scene null), or rename one. Enter saves (LESSONS: a form needs a submit button). */
  function nameForm(scene: Scene | null, from: HTMLElement): void {
    const input = el("input", { id: "sceneName", type: "text", maxlength: String(MAX_SCENE_NAME), placeholder: "Such as Forest road" });
    input.value = scene?.name ?? "";
    const form = el(
      "form",
      { class: "pop-body" },
      el("label", { class: "wide" }, scene ? "Scene name" : "Name the new scene", input),
      el("button", { type: "submit", class: "primary" }, scene ? "Save" : "Add and show it"),
      el("p", { class: "hint" }, scene ? "Only you see scene names." : "It opens empty behind the curtain: place a map from your library."),
    );
    const pop = popover(at(from), [form]);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = input.value.trim();
      run(scene ? { type: "renameScene", id: scene.id, name } : { type: "addScene", name });
      pop.close();
    });
    input.focus();
  }

  function more(scene: Scene, from: HTMLElement, first: boolean, last: boolean): void {
    const isCurrent = !scene.parked;
    const pick = (c: Command) => () => {
      run(c);
      pop.close();
    };
    const pop = popover(at(from), [
      el("header", { class: "pop-head" }, el("b", {}, state ? sceneTitle(state, scene) : "")),
      el(
        "div",
        { class: "pop-body scene-actions" },
        button("Rename", {}, () => nameForm(scene, from), "edit"),
        button("Copy", {}, pick({ type: "copyScene", id: scene.id }), "copy"),
        button("Move up", { disabled: first }, pick({ type: "moveScene", id: scene.id, by: -1 }), "up"),
        button("Move down", { disabled: last }, pick({ type: "moveScene", id: scene.id, by: 1 }), "down"),
        button(`Curtain: ${scene.curtain.kind}…`, {}, () => curtainForm(scene, from), "curtain"),
        button(
          "Mark ready",
          { title: "Keep a copy of this scene as it is now, to reset to later" },
          pick({ type: "markReady", id: scene.id }),
          "ready",
        ),
        button("Reset to ready…", { disabled: !isCurrent || !scene.ready }, () => confirmReset(from), "reset"),
        button("Remove", { disabled: isCurrent }, pick({ type: "removeScene", id: scene.id, on: true }), "trash"),
        el(
          "p",
          { class: "hint" },
          [
            scene.ready ? "A ready copy is kept." : "No ready copy yet.",
            isCurrent ? "The scene on the table can't be removed: switch to another first." : "Reset works on the scene on the table.",
          ].join(" "),
        ),
      ),
    ]);
  }

  /** What the table shows when the DM switches to this scene (D-039): black, a title, or a picture. B is always black. */
  function curtainForm(scene: Scene, from: HTMLElement): void {
    const text = el("input", { id: "curtainTitle", type: "text", maxlength: String(MAX_TITLE), placeholder: "Such as The forest road" });
    text.value = scene.curtain.kind === "title" ? scene.curtain.text : "";
    const file = el("input", { id: "curtainFile", type: "file", accept: "image/png,image/jpeg,image/webp", hidden: true });
    const status = el("p", { class: "hint", role: "status" }, "Players see this until you lift the curtain. Scene names never show.");
    const set = (curtain: Scene["curtain"]) => {
      run({ type: "sceneCurtain", id: scene.id, curtain });
      pop.close();
    };
    const form = el(
      "form",
      { class: "pop-body scene-actions" },
      el("label", { class: "wide" }, "A title, shown facing both long sides", text),
      el("button", { type: "submit", class: "primary" }, "Use this title"),
      button("Choose a picture…", {}, () => file.click(), "picture"),
      button("Black", { "aria-pressed": String(scene.curtain.kind === "black") }, () => set({ kind: "black" })),
      file,
      status,
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const t = text.value.trim();
      set(t ? { kind: "title", text: t } : { kind: "black" });
    });
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (!f) return;
      status.textContent = "Saving the picture…";
      try {
        set({ kind: "picture", id: await terra.savePicture(new Uint8Array(await f.arrayBuffer())) });
      } catch {
        status.textContent = "That picture couldn't be used: pick a PNG, JPEG or WebP under 32 MB.";
      }
    });
    const pop = popover(at(from), [
      el("header", { class: "pop-head" }, el("b", {}, `Curtain for ${state ? sceneTitle(state, scene) : ""}`)),
      form,
    ]);
  }

  function confirmReset(from: HTMLElement): void {
    const pop = popover(at(from), [
      el("header", { class: "pop-head" }, el("b", {}, "Reset to ready")),
      el("p", { class: "hint" }, "Put the fog, discs, pins, drawings and fight back as they were at Mark ready? Undo takes it back."),
      el(
        "div",
        { class: "row" },
        button("Keep", {}, () => pop.close()),
        button("Reset", { class: "danger" }, () => {
          run({ type: "resetScene" });
          pop.close();
        }),
      ),
    ]);
  }

  // Saved spots on the map bar (D-039): slide a big map to a place under the projector, even when it is locked.
  spotsBtn.addEventListener("click", () => {
    const map = state?.map;
    if (!map) return;
    const name = el("input", { id: "spotName", type: "text", maxlength: String(MAX_SPOT_NAME), placeholder: "Such as Bridge" });
    const form = el(
      "form",
      { class: "pop-body" },
      el("label", { class: "wide" }, "Save where the map is now", name),
      el("button", { type: "submit", class: "primary" }, "Save spot"),
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      run({ type: "saveSpot", name: name.value.trim() || `Spot ${map.spots.length + 1}` });
      pop.close();
    });
    const r = spotsBtn.getBoundingClientRect();
    const pop = popover({ x: r.left, y: r.bottom + 140 }, [
      el("header", { class: "pop-head" }, el("b", {}, "Spots on this map")),
      el(
        "ul",
        { class: "entries", "aria-label": "Spots" },
        ...map.spots.map((spot) =>
          el(
            "li",
            { class: "entry" },
            button(spot.name, { class: "who", title: "Slide the map here" }, () => {
              run({ type: "goToSpot", id: spot.id });
              pop.close();
            }),
            button(
              "",
              { class: "icon", "aria-label": `Remove ${spot.name}` },
              () => {
                run({ type: "removeSpot", id: spot.id });
                pop.close();
              },
              "trash",
            ),
          ),
        ),
      ),
      map.spots.length ? el("span") : el("p", { class: "hint" }, "Drag the map where you want it (unlock it first), then save the spot."),
      form,
    ]);
    name.focus();
  });

  function confirmEmpty(from: HTMLElement, n: number): void {
    const pop = popover(at(from), [
      el("header", { class: "pop-head" }, el("b", {}, "Delete removed scenes")),
      el("p", { class: "hint" }, `Delete ${n} removed scene${n === 1 ? "" : "s"} for good? This can't be undone.`),
      el(
        "div",
        { class: "row" },
        button("Keep", {}, () => pop.close()),
        button("Delete", { class: "danger" }, () => {
          run({ type: "emptyRemoved" });
          pop.close();
        }),
      ),
    ]);
  }

  function render(s: TableState): void {
    state = s;
    spotsBtn.textContent = s.map?.spots.length ? `Spots (${s.map.spots.length})` : "Spots";
    const listed = listedScenes(s);
    const here = s.scenes.find((sc) => sc.id === s.scene)!;
    sceneBtn.querySelector("span")!.textContent = sceneTitle(s, here);
    list.replaceChildren(
      ...listed.map((scene, i) => {
        const current = scene.id === s.scene;
        const name = button("", { class: "who", "aria-current": current ? "true" : undefined }, () => {
          if (!current) run({ type: "switchScene", id: scene.id });
        });
        const small = [current ? "On the table" : "", note(s, scene)].filter(Boolean).join(" · ");
        name.append(el("span", { class: "scene-name" }, sceneTitle(s, scene)), el("small", {}, small));
        const menu = button("", { class: "icon", "aria-label": `More for ${sceneTitle(s, scene)}` }, () =>
          more(scene, menu, i === 0, i === listed.length - 1),
        );
        menu.textContent = "⋯";
        return el("li", { class: current ? "entry current" : "entry" }, name, menu);
      }),
    );
    const removed = removedScenes(s);
    removedBox.hidden = removed.length === 0;
    const empty = button("Delete them for good", { class: "danger" }, () => confirmEmpty(empty, removed.length), "trash");
    removedBox.replaceChildren(
      el("summary", {}, `Removed (${removed.length})`),
      el(
        "ul",
        { class: "entries", "aria-label": "Removed scenes" },
        ...removed.map((scene) =>
          el(
            "li",
            { class: "entry out" },
            el("span", { class: "who" }, sceneTitle(s, scene)),
            button("Bring back", {}, () => run({ type: "removeScene", id: scene.id, on: false }), "undo"),
          ),
        ),
      ),
      empty,
    );
  }

  // The scene name above the tabs: a tap lists the scenes to switch to, without leaving the tab in use.
  sceneBtn.addEventListener("click", () => {
    if (!state) return;
    const s = state;
    const r = sceneBtn.getBoundingClientRect();
    const pop = popover({ x: r.left - 300, y: r.bottom + 120 }, [
      el("header", { class: "pop-head" }, el("b", {}, "Put a scene on the table")),
      el(
        "div",
        { class: "pop-body scene-pick" },
        ...listedScenes(s).map((scene) =>
          button(sceneTitle(s, scene), { "aria-pressed": String(scene.id === s.scene), class: "scene-choice" }, () => {
            if (scene.id !== s.scene) run({ type: "switchScene", id: scene.id });
            pop.close();
          }),
        ),
        button("New scene…", {}, () => nameForm(null, sceneBtn), "plus"),
      ),
    ]);
  });

  terra.onState(render);
  void terra.getState().then(render);
  return { section };
}
