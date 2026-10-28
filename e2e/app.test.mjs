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
    await dm.click("#curtain");
    await table.waitForFunction(() => document.body.dataset.view === "curtain");
  } finally {
    await app.close();
  }

  ({ app, dm, table } = await launch(userData));
  try {
    await table.waitForFunction(() => document.body.dataset.view === "curtain");
    assert.equal(await dm.getAttribute("#curtain", "aria-pressed"), "true");
    assert.equal(await dm.getAttribute("#testGrid", "aria-pressed"), "false");
  } finally {
    await app.close();
  }
});

test("an unreadable save is kept aside and the app starts fresh", async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "terra-e2e-"));
  fs.writeFileSync(path.join(userData, "table-state.json"), "{ not json");
  const { app, table } = await launch(userData);
  try {
    await table.waitForFunction(() => document.body.dataset.view === "testGrid");
    assert.ok(fs.readdirSync(userData).some((f) => f.startsWith("table-state.unreadable-")));
  } finally {
    await app.close();
  }
});
