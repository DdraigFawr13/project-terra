// End-to-end: launches the real Electron app and checks the step-1 behaviour.
// Linux needs a display server: run under `xvfb-run -a npm run test:e2e`.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
