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

    // Locked, the map stays put: its move buttons are off and a drag on the map moves nothing (D-029).
    await dm.click("#lockMap");
    await dm.waitForSelector("button.move[data-dx='1']:disabled");
    await dm.mouse.move(box.x + 20, box.y + 20);
    await dm.mouse.down();
    await dm.mouse.move(box.x + box.width - 20, box.y + 20, { steps: 4 });
    await dm.mouse.up();
    await dm.click("#lockMap");
    await dm.waitForSelector("button.move[data-dx='1']:enabled");
    assert.equal((await table.evaluate(() => window.terra.getView())).map.x, 0);

    // Zoom (D-030): + zooms about the middle, so a tap there still lands on the same square.
    await dm.click("button[data-tool='marker']");
    const placeAtMiddle = async () => {
      const now = await dm.locator("#mapCanvas").boundingBox();
      await dm.mouse.click(now.x + now.width / 2, now.y + now.height / 2);
      await dm.waitForFunction(async () => (await window.terra.getState()).map.discs.length === 1);
      const { x, y } = (await dm.evaluate(() => window.terra.getState())).map.discs[0];
      await dm.keyboard.press("Control+z");
      await dm.waitForFunction(async () => (await window.terra.getState()).map.discs.length === 0);
      return [x, y];
    };
    const unzoomed = await placeAtMiddle();
    await dm.click("#zoomIn");
    await dm.click("#zoomIn");
    assert.deepEqual(await placeAtMiddle(), unzoomed);
    await dm.click("#zoomFit");
    await dm.click("button[data-tool='select']");
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
};

test("a fight: party and monster windows, discs placed with the pen, HP by number pad, a stat block, and nothing DM-only on the table", async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "terra-e2e-"));
  let { app, dm, table } = await launch(userData);
  try {
    await dm.setInputFiles("#mapFile", { name: "board.png", mimeType: "image/png", buffer: checkerboardPng() });
    await dm.fill("#markW", "2");
    await dm.fill("#markH", "2");
    await dm.click("#importOk");
    await table.waitForFunction(() => document.body.dataset.view === "map");

    // A character in the Party window; damage from the pad takes temp HP first.
    await dm.click("#partyBtn");
    const party = dm.locator(".float[data-float='party']");
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

    // A tap on the disc with Select opens its monster window. Book: import a library file and link the stat block.
    await dm.click("button[data-tool='select']");
    await dm.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const mon = dm.locator(".float[data-float='monster-yellow']");
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

    // Rolls; the hidden disc's colour is in the order but not on the strip until it is shown.
    await dm.click("#startFight");
    await dm.fill('[data-key="init-pc-1"]', "15");
    await dm.press('[data-key="init-pc-1"]', "Enter");
    await dm.fill('[data-key="init-yellow"]', "9");
    await dm.press('[data-key="init-yellow"]', "Enter");
    await dm.waitForFunction(async () => (await window.terra.getState()).fight.entries.length === 2);
    await dm.evaluate(() => document.activeElement.blur());
    await dm.keyboard.press("n");
    await table.waitForFunction(async () => (await window.terra.getView()).strip?.round === 1);
    await dm.click(".group-row .eye");
    await dm.keyboard.press("n");
    await table.waitForFunction(async () => (await window.terra.getView()).strip?.chips[0]?.kind === "enemy");
    const view = await table.evaluate(() => window.terra.getView());
    // 6 of 15 HP: bloodied, worked out from HP. Only the word reaches the table (D-013, D-028).
    assert.equal(view.strip.chips[0].condition, "bloodied");
    // The map's id is random hex, which can hold "ac" by chance; it is checked to be the library id elsewhere.
    const shown = JSON.stringify({ ...view, map: view.map && { ...view.map, id: "" } });
    for (const secret of ["Zombie", "SRD52", "board", "hp", "ac", "passive", "init", "notes"]) assert.ok(!shown.includes(secret), secret);
    // The table window's bridge has no way to the library.
    assert.deepEqual(await table.evaluate(() => Object.keys(window.terra).sort()), ["getView", "onView"]);

    // Drag the disc two squares; Ctrl+Z puts it back and doesn't take back the character's HP.
    const before = (await dm.evaluate(() => window.terra.getState())).map.discs[0];
    await mon.locator("header button[aria-label='Close']").click();
    await dm.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await dm.mouse.down();
    await dm.mouse.move(box.x + box.width / 2 + box.width / 6, box.y + box.height / 2, { steps: 4 });
    await dm.mouse.up();
    await dm.waitForFunction((x) => window.terra.getState().then((s) => s.map.discs[0].x !== x), before.x);
    await dm.keyboard.press("Control+z");
    await dm.waitForFunction((x) => window.terra.getState().then((s) => s.map.discs[0].x === x), before.x);
    assert.equal((await dm.evaluate(() => window.terra.getState())).party[0].hp, 22);
  } finally {
    await app.close();
  }

  // The party and the imported library are kept between sessions.
  ({ app, dm, table } = await launch(userData));
  try {
    await dm.click("#partyBtn");
    await dm.locator(".float[data-float='party'] .tabs [role=tab]", { hasText: "Ash" }).waitFor();
    assert.equal(await dm.evaluate(() => window.terra.countCreatures()), 2);
  } finally {
    await app.close();
  }
});
