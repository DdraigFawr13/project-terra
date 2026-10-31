# Project Terra

A projected tabletop battle map for in-person D&D. The DM runs it from a Windows laptop; a projector shows the player view on the table, where players move physical minis.

- Plan: [docs/PLAN.md](docs/PLAN.md)
- Current state: [docs/HANDOFF.md](docs/HANDOFF.md)
- Decisions: [docs/DECISIONS.md](docs/DECISIONS.md)

## Try it on Windows

1. On GitHub, open **Actions → Build Windows app → Run workflow**.
2. When it finishes (a few minutes), open the run and download the zip under **Artifacts**.
3. Unzip it and double-click `Project Terra.exe`. Windows may warn that the app is unrecognised: choose **More info → Run anyway**.

With a projector or TV plugged in, the table window goes fullscreen on it. Windows must be set to **Extend** (press Win+P), not Duplicate; in Duplicate mode the app sees only one screen. With only the laptop screen, the table window opens as a normal window.

### Calibrate (step 2)

1. With a ruler, mark a rectangle on the mat (a coin or tape at each corner), for example 10 × 10 inches.
2. In the DM window, press **Calibrate** (on the first screen's checklist, in Setup, or Table → Calibrate…). It fills the window. Enter the rectangle's size.
3. Drag corners 1–4 in the preview until each lands on its mark on the table. For fine moves, select a corner and use the arrow keys (Shift for bigger steps).
4. Press **Done**, then check one square with the ruler: it should be 1 inch.

Without a projector, the same works on the laptop: hold the ruler against the table window and calibrate it. Each projector keeps its own calibration.

### Import a map (step 4)

1. Press **Import map…** and pick a picture or a phone photo of a map.
2. Drag corners 1–4 onto the corners of a block of grid squares (or any rectangle you know the size of), and enter its size in squares.
3. Press **Straighten and place**. A slanted photo comes out square, with each square 1 inch on the table.
4. A new map starts **locked**: dragging pans the view. To line it up under the projector, press **Lock** to unlock it, drag it into place (whole inches, so the squares stay on the grid), **Turn** it if needed, and lock it again. Ctrl+Z undoes map changes.
5. Zoom in to paint fog or place discs precisely: pinch, the mouse wheel, or − and + in the map's button row; **Fit** shows it all. Two fingers or a drag pan.

### When something goes wrong (step 7g)

- **Table → Earlier saves…** goes back to how the table was when the app last opened, or up to about 10 minutes ago (three are kept). The table as it is now is kept as an earlier save first, so going back can be taken back. Screens, calibration and the curtain stay as they are.
- **Table → Problem report** copies a short report (screens, saves, recent errors; nothing from the game). Paste it to Claude.

### The DM window

- **The map and one panel (D-038):** the map fills the window, with its tools on its left edge. The panel on the right shows a thumbnail of what the table shows (hold it to see it big), then three tabs: **Setup** (table screen, calibration, the Party sheet), **Explore** (fog for the whole map, the Encounter list) and **Fight** (the Encounter list). Start fight switches to Fight, End fight back to Explore.
- **Encounter list:** the party (each with a thin HP bar and numbers; tap a name for an HP pad with Damage, Heal and Temp HP) and the colour groups (tap for the sheet). In a fight the same rows run in turn order with their rolls, and a strip pinned at the top says the round, whose turn it is and who is next, even while a sheet is open.
- **First screen:** with no map yet, a checklist shows what to do: table screen, calibrate, import a map, add the party. Each step ticks itself off.
- **Map tools (D-038):** Select (V), Uncover (U) and Dim (G) for fog, Marker (M), Ping (P) and Draw (D); S steps through brush, outline and box. Each tool shows its name under its icon.
- **Words:** **On table / Off table** says whether a group's or a disc's discs are on the table; **Show picture** puts a group's symbol or portrait on its tokens; the fog buttons are **Dim what's in view**, **Uncover all** and **Cover all**.
- **Sheets:** the Party and monster sheets open in the panel in place of the tab's lists; **Back** returns to the lists. One sheet shows at a time, and the one open when the app closes opens again.
- **Panel size:** drag the panel's edge to make it wider or narrower (or focus the edge and use the arrow keys); the width is remembered. Tab folds the panel away so the map has the whole window.
- **Menus:** Table (setup, calibrate, test grid, flip letters, lock, import, earlier saves, problem report), Fight (start or end, Party) and View (the panel's tabs, fold, appearance). Curtain and Next turn stay on the bar; the status bar at the bottom shows the table screen, the round, the zoom and any problem.
- **Player tokens (D-045):** on the Party sheet, **Picture…** crops a picture for a character, and **Place on map** then a tap puts their token down. Select drags it; a tap opens their HP pad. **Mini on it** moves the initials to a tab, **Faces near/far side** turns it to its player, and the conditions you tick show as icons. Players see no HP, name or notes on it.
- **HP from the disc:** tap a disc with Select for a small pad beside it: the amount, Damage or Heal, or Sheet for the whole group. With the pen, a tap on an initiative box opens a number pad too.

## Develop

Node 22.22.0 and npm 10.9.4. On Windows, a version manager such as [fnm](https://github.com/Schniz/fnm) picks up `.nvmrc`; newer Node works but warns.

```bash
npm ci
npm start                       # build and run
npm run check                   # format, typecheck, unit tests
xvfb-run -a npm run test:e2e    # end-to-end tests (Linux needs xvfb-run)
npm run dist:win                # Windows zip in release/
```
