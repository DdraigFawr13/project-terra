// End-to-end: launches the real Electron app and checks the step-1 behaviour.
// Linux needs a display server: run under `xvfb-run -a npm run test:e2e`.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { _electron as electron } from "playwright";
import { defaultCalibration, visibleRect } from "../src/core/calibration.ts";
import { fillTable } from "../src/core/map.ts";

/** The DM window's size on the laptop: 1920 x 1080 at Windows' 150%. */
const LAPTOP = [1280, 680];

/**
 * Wait until `fn`, run in the page, resolves truthy. Playwright's waitForFunction counts a promise as truthy at once, so
 * an async check (one reading the state over the bridge) never waited there (LESSONS). Polls every 50 ms for 10 s.
 */
async function until(page, fn, arg) {
  const end = Date.now() + 10_000;
  while (!(await page.evaluate(fn, arg))) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${String(fn).slice(0, 120)}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

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
    await until(dm, async () => {
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
    await until(dm, async () => (await window.terra.getState()).party.length === 0);
    // Going back keeps the rig as it is (D-037), and the table it left became an earlier save, so it can be taken back.
    await table.waitForFunction(() => document.body.dataset.view === "curtain");
    assert.equal(await table.getAttribute("body", "data-calibrated"), "true");
    await goBack("no map, 1 character");
    await until(dm, async () => (await window.terra.getState()).party.length === 1);
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

    // Walls editor (D-044): from the map bar (the library has it too, with no map placed), tap four corners and the first again for a closed room, drag a door
    // across one wall, Done. The walls are saved beside the map; the DM map shows them with its switch, and the table
    // window has no way to get them (D-002).
    await dm.click("#editWalls");
    await dm.waitForFunction(() => document.getElementById("wallsStatus").textContent.startsWith("Tap each corner"));
    const wc = await dm.locator("#wallsCanvas").boundingBox();
    const tap = (fx, fy) => dm.mouse.click(wc.x + wc.width * fx, wc.y + wc.height * fy);
    // The map is 8 inches across from -3: 0.2 is -1.4 inches, snapped to -1.5; 0.8 is 3.4, snapped to 3.5.
    for (const [fx, fy] of [
      [0.2, 0.2],
      [0.8, 0.2],
      [0.8, 0.8],
      [0.2, 0.8],
      [0.2, 0.2],
    ])
      await tap(fx, fy);
    await dm.click("button[data-walls-tool='door']");
    await dm.mouse.move(wc.x + wc.width * 0.4, wc.y + wc.height * 0.2);
    await dm.mouse.down();
    await dm.mouse.move(wc.x + wc.width * 0.6, wc.y + wc.height * 0.2, { steps: 3 });
    await dm.mouse.up();
    // Rooms (D-044 step 2C): a tap inside the walls and the door finds the room, named 1; the name box renames it.
    await dm.click("button[data-walls-tool='room']");
    await tap(0.5, 0.5);
    assert.equal(await dm.inputValue("#roomName"), "1");
    await dm.fill("#roomName", "Hall");
    await dm.press("#roomName", "Enter");
    assert.equal(await dm.textContent("#wallsCount"), "4 wall pieces, 0 pillars, 1 opening, 1 room · not saved yet");
    await dm.click("#wallsDone");
    await dm.waitForSelector("#walls", { state: "hidden" });
    const saved = JSON.parse(fs.readFileSync(path.join(userData, "library", "maps", `${id}.walls.json`), "utf8"));
    assert.deepEqual(saved.walls, [
      {
        points: [
          { x: -1.5, y: -1.5 },
          { x: 3.5, y: -1.5 },
          { x: 3.5, y: 3.5 },
          { x: -1.5, y: 3.5 },
        ],
        closed: true,
      },
    ]);
    assert.deepEqual(saved.openings, [{ kind: "door", a: { x: 0.25, y: -1.5 }, b: { x: 1.75, y: -1.5 }, open: false }]);
    assert.deepEqual(
      saved.rooms.map((r) => [r.name, r.outline.length]),
      [["Hall", 4]],
    );
    assert.equal(await table.evaluate(() => typeof window.terra.loadWalls), "undefined");
    assert.ok(!JSON.stringify(await table.evaluate(() => window.terra.getView())).includes("door"));
    const wallPixels = () =>
      dm.evaluate(() => {
        const c = document.getElementById("mapCanvas");
        const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && Math.abs(d[i + 1] - 211) < 12 && Math.abs(d[i + 2] - 107) < 16) n++;
        return n;
      });
    assert.equal(await wallPixels(), 0);
    await dm.click("#wallsMap");
    await until(dm, () => {
      const c = document.getElementById("mapCanvas");
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 240 && Math.abs(d[i + 1] - 211) < 12 && Math.abs(d[i + 2] - 107) < 16) return true;
      return false;
    });
    assert.ok((await wallPixels()) > 100);
    await dm.click("#wallsMap");

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
    await until(table, async () => (await window.terra.getView()).grid === false);
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
    await until(table, async () => (await window.terra.getView()).map?.fog.length === 1);
    await table.waitForFunction(() => {
      const c = document.getElementById("layer");
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      return d.some((v, i) => i % 4 !== 3 && v > 60);
    });
    assert.ok((await lit(dm, "tablePreview")) > 0);
    await dm.keyboard.press("Control+z");
    await until(table, async () => (await window.terra.getView()).map?.fog.length === 0);
    // A tap inside the traced room uncovers the whole room as one outline; a drag still paints (D-044 item 6).
    await dm.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await until(table, async () => (await window.terra.getView()).map?.fog[0]?.kind === "outline");
    assert.ok(!JSON.stringify(await table.evaluate(() => window.terra.getView())).includes("Hall"));
    await dm.keyboard.press("Control+z");
    await until(table, async () => (await window.terra.getView()).map?.fog.length === 0);
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
    await until(table, async () => (await window.terra.getView()).map?.fog[0]?.kind === "brush");
    await dm.keyboard.press("Control+z");
    // Uncover all takes a hold while the players can see the map (D-046): a tap only says so.
    await dm.click(".side-tabs button[data-tab='explore']");
    await dm.click("#fogRevealAll");
    await dm.locator("#fogRevealAll", { hasText: "Hold to uncover all" }).waitFor();
    assert.equal(await dm.evaluate(async () => (await window.terra.getState()).map.fog.length), 0);
    await dm.hover("#fogRevealAll");
    await dm.mouse.down();
    await until(dm, async () => (await window.terra.getState()).map.fog[0]?.kind === "revealAll");
    await dm.mouse.up();
    await dm.keyboard.press("Control+z");
    await until(dm, async () => (await window.terra.getState()).map.fog.length === 0);
    await dm.click(".side-tabs button[data-tab='setup']");
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
    await until(table, async () => (await window.terra.getView()).map?.x > 0);
    await dm.evaluate(() => document.activeElement.blur());
    await dm.keyboard.press("Control+z");
    await until(table, async () => (await window.terra.getView()).map?.x === 0);

    // Zoom (D-030): zooming keeps the square under the pointer where it is, so a tap there lands on the same square.
    await dm.click("button[data-tool='marker']");
    const placeAt = async (x, y) => {
      await dm.mouse.click(x, y);
      await until(dm, async () => (await window.terra.getState()).map.discs.length === 1);
      const d = (await dm.evaluate(() => window.terra.getState())).map.discs[0];
      await dm.keyboard.press("Control+z");
      await until(dm, async () => (await window.terra.getState()).map.discs.length === 0);
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
    await until(dm, async () => (await window.terra.getState()).scene === "scene-1");
    s = await dm.evaluate(() => window.terra.getState());
    assert.deepEqual([s.map.id, s.curtain, s.scenes[1].parked.map], [id, true, null]);
    assert.equal(await loads(`terra-map://${id}/table?d`), true);
    await dm.waitForSelector("#undo:enabled");

    // A scene's own curtain (D-039): the Road shows a picture when switched to, and the table may load only that
    // picture, only while it shows. B means black again.
    const pic = await dm.evaluate((bytes) => window.terra.savePicture(new Uint8Array(bytes)), [...checkerboardPng()]);
    await dm.evaluate((id) => window.terra.apply({ type: "sceneCurtain", id: "scene-2", curtain: { kind: "picture", id } }), pic);
    await dm.evaluate(() => window.terra.apply({ type: "switchScene", id: "scene-2" }));
    await until(table, async () => (await window.terra.getView()).cover?.picture?.startsWith("pic-"));
    assert.equal(await loads(`terra-curtain://${pic}/?a`), true);
    await table.waitForFunction(() => {
      const c = document.getElementById("layer");
      return (
        !c.hidden &&
        c
          .getContext("2d")
          .getImageData(0, 0, c.width, c.height)
          .data.some((v, i) => i % 4 !== 3 && v > 60)
      );
    });
    await dm.keyboard.press("b");
    await dm.keyboard.press("b");
    await until(table, async () => (await window.terra.getView()).cover === null);
    assert.equal(await loads(`terra-curtain://${pic}/?b`), false);

    // Saved spots: back on the board, save where the map is, move it, and the spot slides it back though it is locked.
    await dm.evaluate(() => window.terra.apply({ type: "switchScene", id: "scene-1" }));
    await dm.click("#spotsMap");
    await dm.fill("#spotName", "Gate");
    await dm.press("#spotName", "Enter");
    await dm.evaluate(async () => {
      await window.terra.apply({ type: "lockMap", on: false });
      await window.terra.apply({ type: "moveMap", dx: 6, dy: 0 });
      await window.terra.apply({ type: "lockMap", on: true });
    });
    await until(dm, async () => (await window.terra.getState()).map.x === 6);
    await dm.click("#spotsMap");
    await dm.click(".pop button.who:has-text('Gate')");
    await until(dm, async () => (await window.terra.getState()).map.x === 0);

    // The world map (D-039): with the board as the Road's curtain, the table shows the board as its players know it,
    // party marker and all, and may load its picture only while it does.
    await dm.evaluate(async () => {
      await window.terra.apply({ type: "party", at: { x: 1, y: 1 } });
      await window.terra.apply({ type: "sceneCurtain", id: "scene-2", curtain: { kind: "scene", id: "scene-1" } });
      await window.terra.apply({ type: "switchScene", id: "scene-2" });
    });
    await until(table, async () => !!(await window.terra.getView()).party);
    const world = await table.evaluate(() => window.terra.getView());
    assert.deepEqual([world.view, world.map.id, world.strip], ["map", id, null]);
    assert.equal(await loads(`terra-map://${id}/table?e`), true);
    // B lifts the curtain, then drops plain black.
    await dm.keyboard.press("b");
    await dm.keyboard.press("b");
    await until(table, async () => (await window.terra.getView()).view === "curtain");
    assert.equal(await loads(`terra-map://${id}/table?f`), false);
    await dm.evaluate(() => window.terra.apply({ type: "switchScene", id: "scene-1" }));
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
    // Fill the table (D-039): a picture with no squares is sized and placed to fill what the projector reaches.
    await dm.evaluate(() => window.terra.apply({ type: "addScene", name: "Region" }));
    await dm.setInputFiles("#mapFile", { name: "region.png", mimeType: "image/png", buffer: checkerboardPng() });
    await dm.waitForSelector("#importer:not([hidden])");
    await dm.click("#importFill");
    await until(dm, async () => !!(await window.terra.getState()).map);
    const [s2, status] = await dm.evaluate(async () => [await window.terra.getState(), await window.terra.getStatus()]);
    const filled = s2.map;
    const cal = s2.calibrations[status.surfaceKey] ?? defaultCalibration(status.surface);
    const fit = fillTable({ width: 400, height: 400 }, visibleRect(cal, status.surface));
    assert.deepEqual(
      [filled.bounds, filled.x, filled.y, filled.turns],
      [{ x: 0, y: 0, width: fit.widthIn, height: fit.heightIn }, fit.x, fit.y, fit.turns],
    );

    // VTT import (D-044): a library VTT file with no picture inside asks for its picture, then needs no corners. Its
    // walls and doors are stored with the new map, from the picture's corner, and never reach the table (D-002).
    const vtt = {
      format: 0.3,
      resolution: { map_origin: { x: -0.5, y: 0 }, map_size: { x: 4, y: 4 }, pixels_per_grid: 100 },
      line_of_sight: [
        [
          { x: 0.5, y: 1 },
          { x: 1.5, y: 1 },
        ],
        [
          { x: 2.5, y: 1 },
          { x: 3.5, y: 1 },
        ],
      ],
      portals: [
        {
          bounds: [
            { x: 1.5, y: 1 },
            { x: 2.5, y: 1 },
          ],
          closed: false,
        },
      ],
      lights: [{}],
    };
    await dm.setInputFiles("#mapFile", { name: "Hall.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(vtt)) });
    await dm.waitForSelector("#importer:not([hidden])");
    assert.equal(await dm.textContent("#import-heading"), "Import a VTT map");
    assert.equal(await dm.textContent("#importOk"), "Choose picture…");
    assert.ok(await dm.locator("#markW").isHidden());
    await dm.setInputFiles("#vttPicture", { name: "hall.png", mimeType: "image/png", buffer: checkerboardPng() });
    await dm.waitForFunction(() => document.getElementById("importOk").textContent === "Import and place");
    assert.equal(
      await dm.textContent("#importStatus"),
      "4 × 4 squares from the file · 2 wall pieces, 1 door (1 open). Windows come in as doors: change them in Walls. 1 light left out until light sources.",
    );
    await dm.click("#importOk");
    await until(dm, async () => (await window.terra.getState()).map?.name === "Hall");
    const hall = (await dm.evaluate(() => window.terra.getState())).map;
    assert.deepEqual(hall.bounds, { x: 0, y: 0, width: 4, height: 4 });
    const hallWalls = JSON.parse(fs.readFileSync(path.join(userData, "library", "maps", `${hall.id}.walls.json`), "utf8"));
    assert.deepEqual(
      [hallWalls.walls.map((w) => w.points), hallWalls.openings],
      [
        [
          [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
          ],
          [
            { x: 3, y: 1 },
            { x: 4, y: 1 },
          ],
        ],
        [{ kind: "door", a: { x: 2, y: 1 }, b: { x: 3, y: 1 }, open: true }],
      ],
    );
    await until(table, async (hallId) => (await window.terra.getView()).map?.id === hallId, hall.id);
    assert.ok(!JSON.stringify(await table.evaluate(() => window.terra.getView())).includes("door"));
    // A .dd2vtt carries its picture inside it, so it goes straight to Import.
    const dd2vtt = { ...vtt, image: checkerboardPng().toString("base64") };
    await dm.setInputFiles("#mapFile", { name: "Inn.dd2vtt", mimeType: "", buffer: Buffer.from(JSON.stringify(dd2vtt)) });
    await dm.waitForFunction(() => document.getElementById("importOk").textContent === "Import and place");
    await dm.click("#importCancel");
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

test("a character's token (D-045): crop a picture, place it, drag it, and only its picture reaches the table", async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "terra-e2e-"));
  const { app, dm, table, errors } = await launch(userData, LAPTOP);
  try {
    await dm.setInputFiles("#mapFile", { name: "board.png", mimeType: "image/png", buffer: checkerboardPng() });
    await dm.fill("#markW", "2");
    await dm.fill("#markH", "2");
    await dm.click("#importOk");
    await table.waitForFunction(() => document.body.dataset.view === "map");
    await dm.evaluate(() =>
      window.terra.apply({ type: "addCharacter", character: { name: "Ash Vale", ac: 15, hp: 20, hpMax: 20, passive: 12, speed: 30 } }),
    );
    await openParty(dm);
    const party = dm.locator("[data-float='party']");

    // Pick a picture, crop it, and it's saved square on the card, with a picture id the table can't guess.
    await party
      .locator('[data-key="pc-picture-file"]')
      .setInputFiles({ name: "ash.png", mimeType: "image/png", buffer: checkerboardPng() });
    await party.locator(".crop-frame").waitFor();
    await party.getByRole("button", { name: "Use this picture" }).click();
    await until(dm, async () => (await window.terra.getState()).party[0].picture !== null);
    const picture = await dm.evaluate(async () => (await window.terra.getState()).party[0].picture);

    // Before the token is on the table, the table can't load the picture. Each try asks the route afresh: a page keeps
    // an image it has already loaded under the same address.
    const load = (key) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth);
        img.onerror = () => resolve(0);
        img.src = `terra-portrait://${key}?try=${performance.now()}`;
      });
    assert.equal(await table.evaluate(load, `pc/${picture}`), 0);

    // Place on map, then a tap puts it on a square; the table's view holds nothing else from the card.
    await party.locator('[data-key="pc-place"]').click();
    const box = await dm.locator("#mapCanvas").boundingBox();
    await dm.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await until(dm, async () => (await window.terra.getState()).map.tokens.length === 1);
    const [before] = await dm.evaluate(async () => (await window.terra.getState()).map.tokens);
    assert.equal((before.x * 2) % 2, 1);
    assert.equal(await table.evaluate(load, `pc/${picture}`), 512);
    assert.equal(await table.evaluate(load, `pc/pic-0000000000000000`), 0);

    // Select drags it; a drag doesn't move the map or open its HP pad.
    await dm.click("button[data-tool='select']");
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await dm.mouse.move(at.x, at.y);
    await dm.mouse.down();
    await dm.mouse.move(at.x + 80, at.y, { steps: 4 });
    await dm.mouse.up();
    await until(dm, async (x) => (await window.terra.getState()).map.tokens[0].x !== x, before.x);

    // Conditions and the mini switch save on the card; Take off map stops the picture reaching the table.
    await party.locator('[data-key="pc-condition-prone"]').click();
    await party.locator('[data-key="pc-mini"]').click();
    await until(dm, async () => {
      const p = (await window.terra.getState()).party[0];
      return p.mini && p.conditions.includes("prone");
    });
    await party.locator('[data-key="pc-place"]').click();
    await until(dm, async () => (await window.terra.getState()).map.tokens.length === 0);
    assert.equal(await table.evaluate(load, `pc/${picture}`), 0);
    assert.deepEqual(errors, []);
  } finally {
    await app.close();
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

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
    await until(dm, async () => {
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
    await until(dm, async () => (await window.terra.getState()).map.discs.length === 1);
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
    await until(dm, async () => (await window.terra.getState()).map.discs[0].hp === 6);

    // Rolls; the hidden disc's colour is in the order but not on the strip until it is shown. Back from the sheet to the
    // Fight tab's lists (D-038). Start fight goes back to Select from Ping (D-046).
    await dm.click(".sheet-back");
    await dm.keyboard.press("p");
    await dm.click("#startFight");
    assert.equal(await dm.getAttribute("button[data-tool='select']", "aria-pressed"), "true");
    // With the pen, a roll box opens a number pad instead of the on-screen keyboard (D-032). After Set it stays open
    // for the next one without a roll, and closes when everyone has one (D-046).
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
    await rollPad.locator(".pop-head", { hasText: "Ash" }).waitFor();
    for (const k of "15") await rollPad.locator(`.k.digit[aria-label='${k}']`).click();
    await rollPad.locator(".k.act", { hasText: "Set" }).click();
    await rollPad.locator(".pop-head", { hasText: "Zombie" }).waitFor();
    await rollPad.locator(".k.digit[aria-label='9']").click();
    await rollPad.locator(".k.act", { hasText: "Set" }).click();
    await rollPad.waitFor({ state: "detached" });
    await until(dm, async () => (await window.terra.getState()).fight.entries.map((e) => e.init).join() === "15,9");
    await dm.keyboard.press("n");
    await until(table, async () => (await window.terra.getView()).strip?.round === 1);
    await dm.click(".group-row .eye");
    await dm.keyboard.press("n");
    await until(table, async () => (await window.terra.getView()).strip?.chips[0]?.kind === "enemy");
    // The zombies are linked to a monster, so their sheet opens on their turn and closes on the next (D-046). The turn
    // strip stays pinned above it, saying whose turn it is.
    await dm.locator("#turnStrip", { hasText: "Zombie now" }).waitFor();
    await mon.waitFor();
    await dm.keyboard.press("n");
    await mon.waitFor({ state: "detached" });
    // The Encounter list (D-038): a character's name opens its HP pad.
    await dm.locator("#order button.who", { hasText: "Ash" }).click();
    await pad(dm.locator(".quick-hp"), "1", "damage");
    await until(dm, async () => (await window.terra.getState()).party[0].hp === 21);
    await dm.locator("#order", { hasText: "21/24" }).waitFor();
    await dm.keyboard.press("Escape");
    const view = await table.evaluate(() => window.terra.getView());
    // 6 of 15 HP: bloodied, worked out from HP. Only the word reaches the table (D-013, D-028).
    assert.equal(view.strip.chips.find((c) => c.kind === "enemy").condition, "bloodied");
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
    await until(table, async () => (await window.terra.getView()).discs[0]?.symbol === "undead");
    await dm.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await dm.click(".quick-hp button.mini");
    await until(table, async () => (await window.terra.getView()).discs[0]?.mini === true);
    assert.ok(!JSON.stringify(await table.evaluate(() => window.terra.getView())).includes("Zombie"));
    // Portraits (D-036): the test zombie carries a generated picture. A 1-inch token shows the symbol until the DM asks
    // for the portrait there too; then the table loads it by the key it was given, and no other key finds anything.
    assert.equal((await table.evaluate(() => window.terra.getView())).discs[0].portrait, null);
    await dm.evaluate(async () => {
      const g = (await window.terra.getState()).map.groups.yellow;
      await window.terra.apply({ type: "group", colour: "yellow", info: { ...g, smallPortrait: true } });
    });
    await until(table, async () => !!(await window.terra.getView()).discs[0]?.portrait);
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
    await until(dm, async () => (await window.terra.getState()).map.pins.length === 1);
    await dm.mouse.up();
    await until(table, async () => (await window.terra.getView()).pins.length === 1);
    await dm.mouse.click(spot.x, spot.y);
    await until(table, async () => (await window.terra.getView()).pins.length === 0);
    // Draw (D-035): a lasting line reaches the table and a tap on it rubs it out; a fading line goes to the table only as a moment.
    await dm.keyboard.press("d");
    const stroke = async () => {
      await dm.mouse.move(spot.x, spot.y);
      await dm.mouse.down();
      await dm.mouse.move(spot.x + 120, spot.y + 40, { steps: 8 });
      await dm.mouse.up();
    };
    await stroke();
    await until(table, async () => (await window.terra.getView()).drawings.length === 1);
    await dm.mouse.click(spot.x + 60, spot.y + 20);
    await until(table, async () => (await window.terra.getView()).drawings.length === 0);
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
