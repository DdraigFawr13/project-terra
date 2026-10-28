// End-to-end: launches the real Electron app and checks the step-1 behaviour.
// Linux needs a display server: run under `xvfb-run -a npm run test:e2e`.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { _electron as electron } from "playwright";

async function launch(userData) {
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
  return { app, dm: await byTitle("(DM)"), table: await byTitle("(Table)") };
}

test("DM controls what the table shows, and it survives a restart", async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "terra-e2e-"));
  let { app, dm, table } = await launch(userData);
  try {
    await dm.waitForSelector("#display option", { state: "attached" });
    assert.match(await dm.textContent("#status"), /No second screen found/);
    await table.waitForFunction(() => document.body.dataset.view === "testGrid");
    // The table window can read the player view and nothing else, and can't be navigated away (D-002).
    assert.deepEqual(await table.evaluate(() => Object.keys(window.terra).sort()), ["getView", "onView"]);
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
    await table.waitForFunction(() => document.body.dataset.view === "testGrid");

    // Shortcuts (D-023): Tab folds the side panels when no control has focus, and B blanks the table.
    await dm.evaluate(() => document.activeElement.blur());
    await dm.keyboard.press("Tab");
    assert.equal(await dm.getAttribute("body", "data-panels"), "folded");
    await dm.keyboard.press("b");
    await table.waitForFunction(() => document.body.dataset.view === "curtain");
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

    // Fog (D-025): a new map is all black on the table. Paint a box with Reveal, and the table and the DM's preview
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
    await dm.click("button[data-tool='reveal']");
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

    // Move right by one inch, then take it back with Ctrl+Z.
    await dm.click("button.move[data-dx='1']");
    await table.waitForFunction(async () => (await window.terra.getView()).map?.x === 1);
    await dm.evaluate(() => document.activeElement.blur());
    await dm.keyboard.press("Control+z");
    await table.waitForFunction(async () => (await window.terra.getView()).map?.x === 0);
  } finally {
    await app.close();
  }

  ({ app, dm, table } = await launch(userData));
  try {
    await table.waitForFunction(() => document.body.dataset.view === "map");
    assert.equal((await table.evaluate(() => window.terra.getView())).map.id, id);
    assert.match(await dm.textContent("#mapTitle"), /board/);
  } finally {
    await app.close();
  }
});

test("a fight: cards, discs placed with the pen, initiative and the turn strip, with nothing DM-only on the table", async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "terra-e2e-"));
  let { app, dm, table } = await launch(userData);
  try {
    await dm.setInputFiles("#mapFile", { name: "board.png", mimeType: "image/png", buffer: checkerboardPng() });
    await dm.fill("#markW", "2");
    await dm.fill("#markH", "2");
    await dm.click("#importOk");
    await table.waitForFunction(() => document.body.dataset.view === "map");

    // A character card, typed in the side panel.
    await dm.click("#addCharacter");
    await dm.fill('[data-key="card-name"]', "Ash");
    await dm.fill('[data-key="card-ac"]', "16");
    await dm.fill('[data-key="card-hpMax"]', "24");
    await dm.fill('[data-key="card-passive"]', "13");
    await dm.press('[data-key="card-speed"]', "Enter");
    await dm.waitForSelector(".pc strong");
    await dm.click(".pc .hp button >> nth=0");
    await dm.waitForFunction(async () => (await window.terra.getState()).party[0]?.hp === 23);

    // Marker with the pen: a palm touching the screen mid-tap doesn't cancel it. The disc starts hidden.
    await dm.click("button[data-tool='marker']");
    const box = await dm.locator("#mapCanvas").boundingBox();
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
    await pen("mousePressed", 0);
    // Two contact points: without the palm rule, a second finger cancels what is under way.
    const palm = [
      { x: box.x + 10, y: box.y + 10, id: 1 },
      { x: box.x + 30, y: box.y + 20, id: 2 },
    ];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: palm });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await pen("mouseReleased", 0);
    await dm.waitForFunction(async () => (await window.terra.getState()).map.discs.length === 1);
    await dm.fill('[data-key="name-yellow"]', "Secret cultists");
    await dm.press('[data-key="name-yellow"]', "Enter");
    assert.deepEqual((await table.evaluate(() => window.terra.getView())).discs, []);

    // Rolls: the hidden disc's colour is in the order but not on the strip until it is shown.
    await dm.click("#startFight");
    await dm.fill('[data-key="init-pc-1"]', "15");
    await dm.press('[data-key="init-pc-1"]', "Enter");
    await dm.fill('[data-key="init-yellow"]', "9");
    await dm.press('[data-key="init-yellow"]', "Enter");
    await dm.waitForFunction(async () => (await window.terra.getState()).fight.entries.length === 2);
    await dm.evaluate(() => document.activeElement.blur());
    await dm.keyboard.press("n");
    const strip = async () => (await table.evaluate(() => window.terra.getView())).strip;
    await table.waitForFunction(async () => (await window.terra.getView()).strip?.round === 1);
    assert.deepEqual((await strip()).chips, [{ kind: "pc", name: "Ash", current: true }]);
    await dm.click(".group .eye");
    await dm.keyboard.press("n");
    await table.waitForFunction(async () => (await window.terra.getView()).strip?.chips[0]?.kind === "enemy");
    const view = await table.evaluate(() => window.terra.getView());
    assert.equal(view.discs.length, 1);
    for (const secret of ["Secret", "board", "hp", "ac", "passive", "init"]) assert.ok(!JSON.stringify(view).includes(secret), secret);

    // Drag the disc two squares with Select; Ctrl+Z puts it back and doesn't take back the HP typed before it.
    await dm.click("button[data-tool='select']");
    const before = (await dm.evaluate(() => window.terra.getState())).map.discs[0];
    const step = await dm.evaluate(() => {
      const c = document.getElementById("mapCanvas");
      return c.getBoundingClientRect().width;
    });
    await dm.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await dm.mouse.down();
    await dm.mouse.move(box.x + box.width / 2 + step / 6, box.y + box.height / 2, { steps: 4 });
    await dm.mouse.up();
    await dm.waitForFunction((x) => window.terra.getState().then((s) => s.map.discs[0].x !== x), before.x);
    await dm.keyboard.press("Control+z");
    await dm.waitForFunction((x) => window.terra.getState().then((s) => s.map.discs[0].x === x), before.x);
    assert.equal((await dm.evaluate(() => window.terra.getState())).party[0].hp, 23);
  } finally {
    await app.close();
  }

  // The party is kept between sessions.
  ({ app, dm, table } = await launch(userData));
  try {
    await dm.waitForSelector(".pc strong");
    assert.equal(await dm.textContent(".pc strong"), "Ash");
  } finally {
    await app.close();
  }
});
