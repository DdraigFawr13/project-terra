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
2. In the DM window, press **Calibrate** and enter the rectangle's size.
3. Drag corners 1–4 in the small preview until each lands on its mark on the table. For fine moves, select a corner and use the arrow keys (Shift for bigger steps).
4. Press **Done**, then check one square with the ruler: it should be 1 inch.

Without a projector, the same works on the laptop: hold the ruler against the table window and calibrate it. Each projector keeps its own calibration.

### Import a map (step 4)

1. Press **Import map…** and pick a picture or a phone photo of a map.
2. Drag corners 1–4 onto the corners of a block of grid squares (or any rectangle you know the size of), and enter its size in squares.
3. Press **Straighten and place**. A slanted photo comes out square, with each square 1 inch on the table.
4. Move the map with the arrows or by dragging it (whole inches, so the squares stay on the grid), turn it, or take it off the table. Ctrl+Z undoes map changes.
5. Once it sits right, press **Lock**: a stray drag mid-game can't shift it under the minis. Discs still move.
6. Zoom in to paint fog or place discs precisely: pinch, the mouse wheel, or + and − at the map's corner; **Fit** shows it all. With the map locked, dragging pans.

### The DM window

- **Layouts:** Prep, Explore and Fight at the top switch between arrangements of windows; each remembers how you arrange it, and View > Reset this layout puts it back.
- **Windows:** the map, Tools, Table setup, Initiative, Groups, "On the table now" and the Party and monster sheets. Drag a window by its bar to another edge, beside or into another window, or anywhere else to float it; drag the dividers to resize. Fold a window to its bar; pin a floating one to keep it on top in every layout. The window you last touched has a copper outline. Tab folds the side windows away.
- **Menus:** Table (setup, calibrate, test grid, flip letters, lock, import), Fight (start or end, Party) and View (layouts, windows, fold, reset). Curtain and Next turn stay on the bar; the status bar at the bottom shows the table screen, the round, the zoom and any problem.
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
