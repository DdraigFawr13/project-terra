// End-to-end: launches the real Electron app and checks the step-1 behaviour.
// Linux needs a display server: run under `xvfb-run -a npm run test:e2e`.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { _electron as electron } from "playwright";

/** The DM window's size on the laptop: 1920 x 1080 at Windows' 150%. */
const LAPTOP = [1280, 680];

/** The Party sheet, from the Fight menu (D-032). */
async function openParty(dm) {
  await dm.click(".menu-btn[data-menu='fight']");
  await dm.click("#partyBtn");
}

async function launch(userData, [width, height] = [1920, 1080]) {
  const app = await electron.launch({ args: ["."], env: { ...process.env, TERRA_USER_DATA: userData } });
  // Wait until both windows exist, then tell them apart by title.
  while (app.windows().length < 2) await app.waitForEvent("window");
  const byTitle = async (t) => {
    for (const w of app.windows()) {
      await w.waitForLoadState("domcontentloaded");
      if ((await w.title()).includes(t)) return w;
    }
    throw new Error(`no window titled ${t}`);
  };
  // The DM window at 1920 x 1080 unless a journey asks for another size: the fight runs at 1280 x 680, the laptop's
  // screen at Windows' 150% (D-038).
  await app.evaluate(
    ({ BrowserWindow }, [w, h]) => {
      for (const b of BrowserWindow.getAllWindows()) if (b.getTitle().includes("(DM)")) b.setContentSize(w, h);
    },
    [width, height],
  );
  const dm = await byTitle("(DM)");
  // Errors in the DM page: a panel that throws can stop the others from showing a new state, and nothing else says so.
  const errors = [];
  dm.on("pageerror", (e) => errors.push(e.message));
  dm.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return { app, dm, table: await byTitle("(Table)"), errors };
}

test("DM controls what the table shows, and it survives a restart", async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "terra-e2e-"));
  let { app, dm, table } = await launch(userData);
  try {
    await dm.waitForSelector("#display option", { state: "attached" });
    assert.match(await dm.textContent("#status"), /No second screen found/);
    await table.waitForFunction(() => document.body.dataset.view === "testGrid");
    // The table window can read the player view and nothing else (no way to the library either), and can't be navigated
    // away (D-002).
    assert.deepEqual(await table.evaluate(() => Object.keys(window.terra).sort()), [
      "getView",
      "onMapPatched",
      "onPing",
      "onSketch",
      "onView",
    ]);
    // A file dropped on a window arrives as a file:// navigation.
    await table.evaluate((url) => (location.href = url), new URL("../package.json", import.meta.url).href);
    await table.waitForTimeout(300);
    assert.match(table.url(), /player\.html$/);

    await dm.click("#curtain");
    await table.waitForFunction(() => document.body.dataset.view === "curtain");
    await dm.click("#curtain");
    await dm.click("#testGrid");
    await table.waitForFunction(() => document.body.dataset.view === "idle");
    await dm.click("#testGrid");

    // Calibrate: drag corner 3 in the DM's preview, and the table's warp follows (D-004).
    assert.equal(await table.getAttribute("body", "data-calibrated"), "false");
    const before = await table.evaluate(() => document.getElementById("layer").style.transform);
    await dm.click("#calibrate");
    await table.waitForFunction(() => document.body.dataset.view === "calibrate");
    // "Start over" saves the default square; then drag its corner 3 to three quarters of the way across the screen.
    await dm.click("#calReset");
    const [from, to] = await dm.evaluate(async () => {
      const [st, s] = [await window.terra.getStatus(), await window.terra.getState()];
      const r = document.getElementById("calPreview").getBoundingClientRect();
      const c = s.calibrations[st.surfaceKey].corners[2];
      return [
        { x: r.left + c.x * r.width, y: r.top + c.y * r.height },
        { x: r.left + r.width * 0.75, y: r.top + r.height * 0.75 },
      ];
    });
    await dm.mouse.move(from.x, from.y);
    await dm.mouse.down();
    await dm.mouse.move(to.x, to.y, { steps: 4 });
    await dm.mouse.up();
    await dm.focus("#calPreview");
    await dm.keyboard.press("Shift+ArrowRight");
    // Wait for the nudge to land: the corner sits right of where the drag left it.
    await dm.waitForFunction(async () => {
      const [st, s] = [await window.terra.getStatus(), await window.terra.getState()];
      const c = s.calibrations[st.surfaceKey]?.corners[2];
      return c && Math.abs(c.y - 0.75) < 0.01 && c.x > 0.751;
    });
    await table.waitForFunction(() => document.body.dataset.calibrated === "true");
    await table.waitForFunction((b) => document.getElementById("layer").style.transform !== b, before);
    await dm.click("#calDone");
    // The first screen's checklist (D-038) ticks Calibrate once this screen has a calibration.
    await dm.locator("#readyCal.done").waitFor();
    await table.waitForFunction(() => document.body.dataset.view === "testGrid");

    // Shortcuts (D-023): Tab folds the side panels when no control has focus, and B blanks the table.
    await dm.evaluate(() => document.activeElement.blur());
    await dm.keyboard.press("Tab");
    assert.equal(await dm.getAttribute("body", "data-panels"), "folded");
    await dm.keyboard.press("b");
    await table.waitForFunction(() => document.body.dataset.view === "curtain");

    // View → Appearance… picks a light look; the table window keeps its own colours (D-033).
    assert.equal(await dm.getAttribute("html", "data-look"), "ember");
    await dm.click(".menu-btn[data-menu='view']");
    await dm.click("#menu >> text=Appearance…");
    await dm.click("#menu >> text=Linen");
    assert.equal(await dm.getAttribute("html", "data-look"), "linen");
    assert.equal(await table.getAttribute("html", "data-look"), null);
    // A crashed table page loads again and shows the table as it was, so the projector isn't left blank (D-029).
    const crashed = new Promise((resolve) => table.once("crash", resolve));
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.getTitle().includes("(Table)"))
        .webContents.forcefullyCrashRenderer(),
    );
    await crashed;
    // Playwright lets go of a crashed page, so ask the main process what the reloaded page shows.
    const reloaded = () =>
      app.evaluate(async ({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((x) => x.getTitle().includes("(Table)"));
        return w.webContents.isCrashed() ? null : w.webContents.executeJavaScript("document.body.dataset.view").catch(() => null);
      });
    for (let tries = 0; (await reloaded()) !== "curtain"; tries++) {
      assert.ok(tries < 50, "the table page didn't come back");
      await new Promise((r) => setTimeout(r, 200));
    }
  } finally {
    await app.close();
  }

  ({ app, dm, table } = await launch(userData));
  try {
    await table.waitForFunction(() => document.body.dataset.view === "curtain");
    assert.equal(await dm.getAttribute("#curtain", "aria-pressed"), "true");
    assert.equal(await dm.getAttribute("#testGrid", "aria-pressed"), "true");
    assert.equal(await table.getAttribute("body", "data-calibrated"), "true");
    assert.match(await dm.textContent("#calState"), /^Calibrated for/);
    assert.equal(await dm.getAttribute("html", "data-look"), "linen");

    // Earlier saves (D-037): the table as it opened was kept, so a change made now can be rolled back after a restart.
    const party = () => dm.evaluate(async () => (await window.terra.getState()).party.length);
    await dm.evaluate(() =>
      window.terra.apply({ type: "addCharacter", character: { name: "Ash", ac: 15, hp: 20, hpMax: 20, passive: 12, speed: 30 } }),
    );
    assert.equal(await party(), 1);
    const goBack = async (summary) => {
      await dm.click(".menu-btn[data-menu='table']");
      await dm.click("#menu >> text=Earlier saves…");
      await dm.click(`#menu >> text=${summary}`);
    };
    await goBack("no map, 0 characters");
    await dm.waitForFunction(async () => (await window.terra.getState()).party.length === 0);
    // Going back keeps the rig as it is (D-037), and the table it left became an earlier save, so it can be taken back.
    await table.waitForFunction(() => document.body.dataset.view === "curtain");
    assert.equal(await table.getAttribute("body", "data-calibrated"), "true");
    await goBack("no map, 1 character");
    await dm.waitForFunction(async () => (await window.terra.getState()).party.length === 1);
    assert.ok(fs.readdirSync(path.join(userData, "earlier-saves")).length <= 3);

    // The problem report is copied for Morgan to paste to Claude, and shown.
    await dm.click(".menu-btn[data-menu='table']");
    await dm.click("#menu >> text=Problem report");
    assert.match(await dm.textContent("#reportText"), /^Project Terra problem report/);
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
    assert.match(copied, /Screens:\n- \d+ /);
    // Only screens and problems: nothing from the game, such as a character's name.
    assert.doesNotMatch(copied, /Ash/);
  } finally {
    await app.close();
  }
});

test("an unreadable save is kept aside and the app starts fresh", async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "terra-e2e-"));
  fs.writeFileSync(path.join(userData, "table-state.json"), "{ not json");
  const { app, dm, table } = await launch(userData);
  try {
    await table.waitForFunction(() => document.body.dataset.view === "testGrid");
    const kept = fs.readdirSync(userData).find((f) => f.startsWith("table-state.unreadable-"));
    assert.ok(kept);
    // The packaged app has no console, so the DM window says what happened.
    await dm.waitForSelector("#notice:not([hidden])");
    assert.ok((await dm.textContent("#notice")).includes(kept));
  } finally {
    await app.close();
  }
});

/** A PNG checkerboard of 50-pixel squares, 8 × 8, made here so the test needs no image files. */
function checkerboardPng() {
  const size = 400;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const v = (Math.floor(x / 50) + Math.floor(y / 50)) % 2 ? 40 : 230;
      raw.set([v, v, v, 255], y * (size * 4 + 1) + 1 + x * 4);
    }
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length);
    head.write(type, 4, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])));
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("a map picture is straightened, placed, moved and undone, and is still there after a restart", async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "terra-e2e-"));
  let { app, dm, table } = await launch(userData);
  let id;
  try {
    await dm.setInputFiles("#mapFile", { name: "board.png", mimeType: "image/png", buffer: checkerboardPng() });
    await dm.waitForSelector("#importer:not([hidden])");
    // The starting rectangle is the picture's middle quarter: exactly 2 × 2 squares of this board.
    await dm.fill("#markW", "2");
    await dm.fill("#markH", "2");
    await dm.selectOption("#markFeet", "10");
    await dm.click("#importOk");
    await table.waitForFunction(() => document.body.dataset.view === "map");

    // The table gets the map's place and extent but not its name (D-002). The marked block starts 3 squares in.
    const view = await table.evaluate(() => window.terra.getView());
    id = view.map.id;
    assert.deepEqual(
      { ...view.map, id: undefined },
      { id: undefined, bounds: { x: -3, y: -3, width: 8, height: 8 }, x: 0, y: 0, turns: 0, fog: [] },
    );
    assert.ok(!JSON.stringify(view).includes("board"));
    // The picture is in the personal library, and terra-map:// serves only library maps.
    assert.deepEqual(fs.readdirSync(path.join(userData, "library", "maps")).sort(), [`${id}.json`, `${id}.png`]);
    // A 10-ft map (D-036) is still 1 inch a square; the library and the DM's map title remember the feet.
    assert.equal(JSON.parse(fs.readFileSync(path.join(userData, "library", "maps", `${id}.json`), "utf8")).feetPerSquare, 10);
    assert.equal(await dm.textContent("#mapTitle"), "board · 10 ft squares");
    const served = await table.evaluate(async (mapId) => {
      const width = (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img.naturalWidth);
          img.onerror = () => resolve(0);
          img.src = src;
        });
      return [await width(`terra-map://${mapId}/`), await width("terra-map://map-nope/")];
    }, id);
    // 400 × 400 picture at 50 pixels a square, straightened at the same 50 pixels per inch.
    assert.deepEqual(served, [400, 0]);

    // Patch tool (D-036): swipe across the middle and save. The DM still loads the original; the table window, asking
    // for either picture, only ever gets the patched copy.
    await dm.click("#patchMap");
    await dm.waitForFunction(() => document.getElementById("patchStatus").textContent.startsWith("Swipe"));
    const pc = await dm.locator("#patchCanvas").boundingBox();
    await dm.mouse.move(pc.x + pc.width * 0.3, pc.y + pc.height / 2);
    await dm.mouse.down();
    await dm.mouse.move(pc.x + pc.width * 0.7, pc.y + pc.height / 2, { steps: 5 });
    await dm.mouse.up();
    await dm.click("#patchSave");
    await dm.waitForSelector("#patcher", { state: "hidden" });
    assert.ok(fs.existsSync(path.join(userData, "library", "maps", `${id}.table.png`)));
    const fingerprint = (page, src) =>
      page.evaluate(async (s) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = s;
        await img.decode();
        const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height).data.join(",");
      }, src);
    const original = await fingerprint(dm, `terra-map://${id}/?a`);
    const patched = await fingerprint(dm, `terra-map://${id}/table?a`);
    assert.notEqual(original, patched);
    assert.equal(await fingerprint(table, `terra-map://${id}/?b`), patched);
    assert.equal(await fingerprint(table, `terra-map://${id}/table?b`), patched);

    // Fog (D-025): a new map is all black on the table. Paint a box with Uncover, and the table and the DM's preview
    // show the map there; Ctrl+Z covers it again.
    await dm.evaluate(() => window.terra.apply({ type: "testGrid", on: false }));
    const lit = (page, id) =>
      page.evaluate((canvasId) => {
        const c = document.getElementById(canvasId);
        const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) n++;
        return n;
      }, id);
    await table.waitForFunction(async () => (await window.terra.getView()).grid === false);
    assert.equal(await lit(table, "layer"), 0);
    // The fog tools' keys (D-038): G picks Dim, U picks Uncover.
    await dm.evaluate(() => document.activeElement.blur());
    await dm.keyboard.press("g");
    assert.equal(await dm.getAttribute("button[data-tool='hide']", "aria-pressed"), "true");
    await dm.keyboard.press("u");
    assert.equal(await dm.getAttribute("button[data-tool='reveal']", "aria-pressed"), "true");
    await dm.click("button[data-draw='box']");
    const box = await dm.locator("#mapCanvas").boundingBox();
    await dm.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2 - 30);
    await dm.mouse.down();
    await dm.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 30, { steps: 3 });
    await dm.mouse.up();
    await table.waitForFunction(async () => (await window.terra.getView()).map?.fog.length === 1);
    await table.waitForFunction(() => {
      const c = document.getElementById("layer");
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      return d.some((v, i) => i % 4 !== 3 && v > 60);
    });
    assert.ok((await lit(dm, "tablePreview")) > 0);
    await dm.keyboard.press("Control+z");
    await table.waitForFunction(async () => (await window.terra.getView()).map?.fog.length === 0);
    await table.waitForFunction(() => {
      const c = document.getElementById("layer");
      return !c
        .getContext("2d")
        .getImageData(0, 0, c.width, c.height)
        .data.some((v, i) => i % 4 !== 3 && v > 60);
    });
    // Morgan uses a stylus: a palm touching the screen mid-stroke must not cancel the pen's stroke.
    const cdp = await dm.context().newCDPSession(dm);
    const pen = (type, dx) =>
      cdp.send("Input.dispatchMouseEvent", {
        type,
        x: box.x + box.width / 2 + dx,
        y: box.y + box.height / 2,
        pointerType: "pen",
        button: "left",
        buttons: type === "mouseReleased" ? 0 : 1,
        clickCount: 1,
      });
    await dm.click("button[data-draw='brush']");
    await pen("mousePressed", -40);
    await pen("mouseMoved", -20);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + 10, y: box.y + 10 }] });
    await pen("mouseMoved", 0);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await pen("mouseReleased", 20);
    await table.waitForFunction(async () => (await window.terra.getView()).map?.fog[0]?.kind === "brush");
    await dm.keyboard.press("Control+z");
    await dm.click("button[data-tool='select']");

    // A new map starts locked (D-032): Turn is off, and a drag on the map pans the view rather than moving the map.
    await dm.waitForSelector("#turnMap:disabled");
    const dragAcross = async () => {
      await dm.mouse.move(box.x + 20, box.y + 20);
      await dm.mouse.down();
      await dm.mouse.move(box.x + box.width / 2, box.y + 20, { steps: 4 });
      await dm.mouse.up();
    };
    await dragAcross();
    assert.equal((await table.evaluate(() => window.terra.getView())).map.x, 0);
    // Unlocked, a drag moves the map on the table by whole inches, and Ctrl+Z takes it back.
    await dm.click("#lockMap");
    await dm.waitForSelector("#turnMap:enabled");
    await dragAcross();
    await table.waitForFunction(async () => (await window.terra.getView()).map?.x > 0);
    await dm.evaluate(() => document.activeElement.blur());
    await dm.keyboard.press("Control+z");
    await table.waitForFunction(async () => (await window.terra.getView()).map?.x === 0);

    // Zoom (D-030): zooming keeps the square under the pointer where it is, so a tap there lands on the same square.
    await dm.click("button[data-tool='marker']");
    const placeAt = async (x, y) => {
      await dm.mouse.click(x, y);
      await dm.waitForFunction(async () => (await window.terra.getState()).map.discs.length === 1);
      const d = (await dm.evaluate(() => window.terra.getState())).map.discs[0];
      await dm.keyboard.press("Control+z");
      await dm.waitForFunction(async () => (await window.terra.getState()).map.discs.length === 0);
      return [d.x, d.y];
    };
    // A point well inside a square: a few pixels either way still places the same disc.
    const now = await dm.locator("#mapCanvas").boundingBox();
    let spot = null;
    for (const k of [0.5, 0.42, 0.58, 0.35]) {
      const [x, y] = [now.x + now.width * k, now.y + now.height * k];
      const here = await placeAt(x, y);
      if (
        JSON.stringify(await placeAt(x - 4, y - 4)) === JSON.stringify(here) &&
        JSON.stringify(await placeAt(x + 4, y + 4)) === JSON.stringify(here)
      ) {
        spot = { x, y, here };
        break;
      }
    }
    assert.ok(spot, "no point well inside a square");
    await dm.mouse.move(spot.x, spot.y);
    await dm.mouse.wheel(0, -400);
    await dm.waitForTimeout(100);
    assert.deepEqual(await placeAt(spot.x, spot.y), spot.here);
    await dm.click("#zoomIn");
    await dm.click("#zoomFit");
    await dm.click("button[data-tool='select']");

    // Scenes (D-039): a new scene opens empty behind the curtain, and the board waits in the list with its map.
    await dm.click(".side-tabs button[data-tab='setup']");
    await dm.click("#newScene");
    await dm.fill("#sceneName", "Road");
    await dm.press("#sceneName", "Enter");
    await table.waitForFunction(() => document.body.dataset.view === "curtain");
    let s = await dm.evaluate(() => window.terra.getState());
    assert.deepEqual([s.scene, s.map, s.curtain], ["scene-2", null, true]);
    assert.deepEqual(await dm.locator("#sceneList .scene-name").allTextContents(), ["board", "Road"]);
    assert.equal(await dm.textContent("#sceneBtn span"), "Road");
    // Each scene has its own undo steps: the board's placing isn't undone from here.
    await dm.waitForSelector("#undo:disabled");
    // The table window can't load the waiting scene's map, so it can't show a place the players haven't reached.
    const loads = (src) =>
      table.evaluate(
        (u) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = u;
          }),
        src,
      );
    assert.equal(await loads(`terra-map://${id}/table?c`), false);
    // Back to the board from the name above the tabs: everything is where it was, still behind the curtain.
    await dm.click("#sceneBtn");
    await dm.click(".scene-pick button:has-text('board')");
    await dm.waitForFunction(async () => (await window.terra.getState()).scene === "scene-1");
    s = await dm.evaluate(() => window.terra.getState());
    assert.deepEqual([s.map.id, s.curtain, s.scenes[1].parked.map], [id, true, null]);
    assert.equal(await loads(`terra-map://${id}/table?d`), true);
    await dm.waitForSelector("#undo:enabled");
    await dm.evaluate(() => window.terra.apply({ type: "curtain", on: false }));
  } finally {
    await app.close();
  }

  ({ app, dm, table } = await launch(userData));
  try {
    await table.waitForFunction(() => document.body.dataset.view === "map");
    assert.equal((await table.evaluate(() => window.terra.getView())).map.id, id);
    assert.match(await dm.textContent("#mapTitle"), /board/);
    assert.deepEqual(
      (await dm.evaluate(() => window.terra.getState())).scenes.map((sc) => sc.name),
      ["", "Road"],
    );
  } finally {
    await app.close();
  }
});

/** A library entry in the private library's shape, with SRD 5.2 numbers and no book text (D-010). */
const srdZombie = {
  id: "zombie",
  name: "Zombie",
  source: { book: "SRD52", page: null },
  size: "Medium",
  type: "Undead",
  alignment: "Neutral Evil",
  ac: 8,
  initiative: { mod: -2, score: 8 },
  hp: { avg: 15, formula: "2d8 + 6" },
  speed: { walk: 20 },
  cr: "1/4",
  actions: [{ name: "Slam", text: "Test attack." }],
  checks: { pageChecked: true },
  // A generated picture, not book art (D-010).
  portrait: `data:image/png;base64,${checkerboardPng().toString("base64")}`,
};

test("a fight: party and monster windows, discs placed with the pen, HP by number pad, a stat block, and nothing DM-only on the table", async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "terra-e2e-"));
  let { app, dm, table, errors } = await launch(userData, LAPTOP);
  try {
    await dm.setInputFiles("#mapFile", { name: "board.png", mimeType: "image/png", buffer: checkerboardPng() });
    await dm.fill("#markW", "2");
    await dm.fill("#markH", "2");
    await dm.click("#importOk");
    await table.waitForFunction(() => document.body.dataset.view === "map");

    // The Fight layout (D-032), then a character in the Party sheet, from the Fight menu; damage takes temp HP first.
    await dm.click("[data-tab='fight']");
    await dm.locator("#startFight").waitFor();
    await openParty(dm);
    const party = dm.locator("[data-float='party']");
    await party.locator("[aria-label='Add a character']").click();
    await dm.fill('[data-key="pc-name"]', "Ash");
    await dm.fill('[data-key="pc-ac"]', "16");
    await dm.fill('[data-key="pc-hpMax"]', "24");
    await dm.fill('[data-key="pc-passive"]', "13");
    await dm.press('[data-key="pc-passive"]', "Enter");
    await party.locator(".tabs [role=tab]").waitFor();
    const pad = async (win, keys, act) => {
      for (const k of keys) await win.locator(`.k.digit[aria-label='${k}']`).click();
      await win.locator(`.k.${act}`).click();
    };
    await pad(party, "3", "temp");
    await pad(party, "5", "damage");
    await dm.waitForFunction(async () => {
      const p = (await window.terra.getState()).party[0];
      return p?.hp === 22 && p.tempHp === 0;
    });

    // Marker with the pen: a palm touching the screen mid-tap doesn't cancel it. The disc starts hidden.
    await dm.click("button[data-tool='marker']");
    const box = await dm.locator("#mapCanvas").boundingBox();
    const cdp = await dm.context().newCDPSession(dm);
    const pen = (type) =>
      cdp.send("Input.dispatchMouseEvent", {
        type,
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        pointerType: "pen",
        button: "left",
        buttons: type === "mouseReleased" ? 0 : 1,
        clickCount: 1,
      });
    await pen("mousePressed");
    // Two contact points: without the palm rule, a second finger cancels what is under way.
    const palm = [
      { x: box.x + 10, y: box.y + 10, id: 1 },
      { x: box.x + 30, y: box.y + 20, id: 2 },
    ];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: palm });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await pen("mouseReleased");
    await dm.waitForFunction(async () => (await window.terra.getState()).map.discs.length === 1);
    assert.deepEqual((await table.evaluate(() => window.terra.getView())).discs, []);

    // A tap on the disc with Select opens its HP pad beside it (D-032); Sheet opens the monster sheet. Book: import a
    // library file and link the stat block.
    await dm.click("button[data-tool='select']");
    await dm.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await dm.click(".quick-hp button.sheet");
    const mon = dm.locator("[data-float='monster-yellow']");
    await mon.locator("button", { hasText: "Book" }).click();
    await mon.locator("input[type=file]").setInputFiles({
      name: "library.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify([srdZombie, { ...srdZombie, id: "unchecked", name: "Zombie twin", checks: {} }])),
    });
    await mon.locator(".hits .warn").waitFor();
    await mon.locator(".hits button", { hasText: "Use" }).click();
    await mon.locator(".statblock h3", { hasText: "Zombie" }).waitFor();
    assert.deepEqual(
      await dm.evaluate(async () => {
        const g = (await window.terra.getState()).map.groups.yellow;
        return [g.creature, g.ac, g.hpMax, g.speed, g.name];
      }),
      ["SRD52:zombie", 8, 15, 20, "Zombie"],
    );
    await mon.locator("button", { hasText: "Book" }).click();
    await pad(mon, "9", "damage");
    await dm.waitForFunction(async () => (await window.terra.getState()).map.discs[0].hp === 6);

    // Rolls; the hidden disc's colour is in the order but not on the strip until it is shown. Back from the sheet to the
    // Fight tab's lists (D-038).
    await dm.click(".sheet-back");
    await dm.click("#startFight");
    // With the pen, a roll box opens a number pad instead of the on-screen keyboard (D-032).
    const roll = await dm.locator('[data-key="init-pc-1"]').boundingBox();
    for (const type of ["mousePressed", "mouseReleased"])
      await cdp.send("Input.dispatchMouseEvent", {
        type,
        x: roll.x + roll.width / 2,
        y: roll.y + roll.height / 2,
        pointerType: "pen",
        button: "left",
        buttons: type === "mousePressed" ? 1 : 0,
        clickCount: 1,
      });
    const rollPad = dm.locator(".roll-pad");
    for (const k of "15") await rollPad.locator(`.k.digit[aria-label='${k}']`).click();
    await rollPad.locator(".k.act", { hasText: "Set" }).click();
    await dm.waitForFunction(async () => (await window.terra.getState()).fight.entries[0]?.init === 15);
    await dm.fill('[data-key="init-yellow"]', "9");
    await dm.press('[data-key="init-yellow"]', "Enter");
    await dm.waitForFunction(async () => (await window.terra.getState()).fight.entries.length === 2);
    await dm.evaluate(() => document.activeElement.blur());
    await dm.keyboard.press("n");
    await table.waitForFunction(async () => (await window.terra.getView()).strip?.round === 1);
    await dm.click(".group-row .eye");
    await dm.keyboard.press("n");
    await table.waitForFunction(async () => (await window.terra.getView()).strip?.chips[0]?.kind === "enemy");
    // The Encounter list (D-038): the turn strip says whose turn it is, and a character's name opens its HP pad.
    await dm.locator("#turnStrip", { hasText: "Zombie now" }).waitFor();
    await dm.locator("#order button.who", { hasText: "Ash" }).click();
    await pad(dm.locator(".quick-hp"), "1", "damage");
    await dm.waitForFunction(async () => (await window.terra.getState()).party[0].hp === 21);
    await dm.locator("#order", { hasText: "21/24" }).waitFor();
    await dm.keyboard.press("Escape");
    const view = await table.evaluate(() => window.terra.getView());
    // 6 of 15 HP: bloodied, worked out from HP. Only the word reaches the table (D-013, D-028).
    assert.equal(view.strip.chips[0].condition, "bloodied");
    // The map's id is random hex, which can hold "ac" by chance; it is checked to be the library id elsewhere.
    const shown = JSON.stringify({ ...view, map: view.map && { ...view.map, id: "" } });
    for (const secret of ["Zombie", "SRD52", "board", "hp", "ac", "passive", "init", "notes"]) assert.ok(!shown.includes(secret), secret);
    // Show picture (D-036, D-038): linking the zombie chose its symbol; one tap shows it on the table, still without its name. Mini
    // on it, from the disc's HP pad, tells the table to put the letter on a tab.
    await dm.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await dm.click(".quick-hp button.sheet");
    // The strip stays pinned above an open sheet, so whose turn it is never goes out of sight.
    assert.ok(await dm.locator("#turnStrip").isVisible());
    await mon.locator("button", { hasText: "Show picture" }).click();
    await table.waitForFunction(async () => (await window.terra.getView()).discs[0]?.symbol === "undead");
    await dm.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await dm.click(".quick-hp button.mini");
    await table.waitForFunction(async () => (await window.terra.getView()).discs[0]?.mini === true);
    assert.ok(!JSON.stringify(await table.evaluate(() => window.terra.getView())).includes("Zombie"));
    // Portraits (D-036): the test zombie carries a generated picture. A 1-inch token shows the symbol until the DM asks
    // for the portrait there too; then the table loads it by the key it was given, and no other key finds anything.
    assert.equal((await table.evaluate(() => window.terra.getView())).discs[0].portrait, null);
    await dm.evaluate(async () => {
      const g = (await window.terra.getState()).map.groups.yellow;
      await window.terra.apply({ type: "group", colour: "yellow", info: { ...g, smallPortrait: true } });
    });
    await table.waitForFunction(async () => !!(await window.terra.getView()).discs[0]?.portrait);
    const key = (await table.evaluate(() => window.terra.getView())).discs[0].portrait;
    const loads = (src) =>
      table.evaluate(
        (s) =>
          new Promise((res) => {
            const img = new Image();
            img.onload = () => res(img.naturalWidth);
            img.onerror = () => res(0);
            img.src = s;
          }),
        src,
      );
    assert.deepEqual(
      [
        await loads(`terra-portrait://${key}`),
        await loads("terra-portrait://yellow/other"),
        await loads("terra-portrait://book/SRD52%3Azombie"),
      ],
      [400, 0, 0],
    );

    // Ping (D-034): a tap pings the table; holding leaves a pin the players see; a tap on the pin takes it away.
    await dm.keyboard.press("p");
    const spot = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.3 };
    const pinged = table.evaluate(() => new Promise((resolve) => window.terra.onPing(resolve)));
    await dm.mouse.click(spot.x, spot.y);
    const at = await pinged;
    assert.ok(Number.isFinite(at.x) && Number.isFinite(at.y));
    await dm.mouse.move(spot.x, spot.y);
    await dm.mouse.down();
    await dm.waitForFunction(async () => (await window.terra.getState()).map.pins.length === 1);
    await dm.mouse.up();
    await table.waitForFunction(async () => (await window.terra.getView()).pins.length === 1);
    await dm.mouse.click(spot.x, spot.y);
    await table.waitForFunction(async () => (await window.terra.getView()).pins.length === 0);
    // Draw (D-035): a lasting line reaches the table and a tap on it rubs it out; a fading line goes to the table only as a moment.
    await dm.keyboard.press("d");
    const stroke = async () => {
      await dm.mouse.move(spot.x, spot.y);
      await dm.mouse.down();
      await dm.mouse.move(spot.x + 120, spot.y + 40, { steps: 8 });
      await dm.mouse.up();
    };
    await stroke();
    await table.waitForFunction(async () => (await window.terra.getView()).drawings.length === 1);
    await dm.mouse.click(spot.x + 60, spot.y + 20);
    await table.waitForFunction(async () => (await window.terra.getView()).drawings.length === 0);
    await dm.click("button[data-ink-fade=true]");
    const sketched = table.evaluate(() => new Promise((resolve) => window.terra.onSketch(resolve)));
    await stroke();
    assert.ok((await sketched).points.length >= 2);
    assert.equal((await dm.evaluate(() => window.terra.getState())).map.drawings.length, 0);
    await dm.keyboard.press("v");

    // Drag the disc two squares; Ctrl+Z puts it back and doesn't take back the character's HP.
    const before = (await dm.evaluate(() => window.terra.getState())).map.discs[0];
    await dm.click(".sheet-back");
    await dm.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await dm.mouse.down();
    await dm.mouse.move(box.x + box.width / 2 + box.width / 6, box.y + box.height / 2, { steps: 4 });
    await dm.mouse.up();
    await dm.waitForFunction((x) => window.terra.getState().then((s) => s.map.discs[0].x !== x), before.x);
    await dm.keyboard.press("Control+z");
    await dm.waitForFunction((x) => window.terra.getState().then((s) => s.map.discs[0].x === x), before.x);
    assert.equal((await dm.evaluate(() => window.terra.getState())).party[0].hp, 21);
    // The Fight tab takes Table setup out of the page; its buttons must still follow the state (they once threw on every
    // change). The Party sheet is left open, to open again next time (D-034).
    assert.deepEqual(errors, []);
    await openParty(dm);
  } finally {
    await app.close();
  }

  // The party and the imported library are kept between sessions, and the Party sheet open at the end opens again (D-034).
  ({ app, dm, table } = await launch(userData));
  try {
    const party = dm.locator("[data-float='party']");
    await party.locator(".tabs [role=tab]", { hasText: "Ash" }).waitFor();
    // Remove asks first; Keep keeps the card.
    await party.locator("button", { hasText: "Edit" }).click();
    await party.locator("button", { hasText: "Remove…" }).click();
    await party.locator(".confirm .hint", { hasText: "Remove Ash?" }).waitFor();
    await party.locator(".confirm button", { hasText: "Keep" }).click();
    assert.equal((await dm.evaluate(() => window.terra.getState())).party.length, 1);
    assert.equal(await dm.evaluate(() => window.terra.countCreatures()), 2);
  } finally {
    await app.close();
  }
});
