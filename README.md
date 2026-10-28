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

Imported maps stay in the library on this laptop (`library/maps` in the app's data folder) and are never shared. Turn on **Test grid** under **Table setup** to check the map's squares line up with the table's.

### Fog (step 5)

A map starts all black on the table. In the bottom toolbar:

1. Tap **Reveal** (R) or **Hide** (H), then pick **Brush** (with a 1″, 2″ or 4″ size), **Outline** (draw a loop round a room) or **Box** (snaps to whole squares). S switches between them.
2. Paint on the map with a finger or the mouse. The table changes when you lift. A second finger, or Esc, cancels the stroke.
3. Hide turns "in view" back to grey with lines ("seen before"). **Party moves on** greys out everything in view; **Reveal all** and **Cover all** sit under the preview.
4. Ctrl+Z or **Undo** takes back the last stroke. **Select** (V) goes back to moving the map.

The picture at the top right is drawn by the same code as the table. Check it matches the table.

## Develop

Node 22.22.0 and npm 10.9.4.

```bash
npm ci
npm start                       # build and run
npm run check                   # format, typecheck, unit tests
xvfb-run -a npm run test:e2e    # end-to-end tests (Linux needs xvfb-run)
npm run dist:win                # Windows zip in release/
```
