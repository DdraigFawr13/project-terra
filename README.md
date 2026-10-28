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
2. Paint on the map with the pen, a finger or the mouse. The table changes when you lift. A second finger, or Esc, cancels the stroke; a palm resting on the screen while the pen draws is ignored. The pen's eraser end hides.
3. Hide turns "in view" back to grey with lines ("seen before"). **Party moves on** greys out everything in view; **Reveal all** and **Cover all** sit under the preview.
4. Ctrl+Z or **Undo** takes back the last stroke. **Select** (V) goes back to moving the map.

The picture at the top right is drawn by the same code as the table. Check it matches the table.

### Initiative, markers and character cards (step 6)

1. **Party** (top bar) opens a window with a tab per character. Tap **+** to add one: name, AC, HP max, speed, passive Perception, and if you like passive Insight and Investigation, spell save DC and notes. To change HP, tap the amount on the number pad, then **Damage**, **Heal** or **Temp HP**. Damage takes temp HP first.
2. **Marker** (M) in the bottom toolbar: pick a colour and a size (1″ Medium, 2″ Large, 3″ Huge, 4″ Gargantuan), then tap the map. Each colour gives letters A, B, C… New discs start hidden: **Hidden** by the colour in the left panel shows them all, and each disc has its own eye in its monster window.
3. Tap a disc with **Select** (V) to open its colour's window. Drag a disc to move it by whole squares. In the window, tap a disc, tap the amount, tap **Damage** or **Heal**. The word on the table follows HP: Bloodied at half or below, Near death at a quarter or below; a disc at 0 leaves the table.
4. **Edit** sets the group's name (only you see it), AC, speed, HP max and notes, and a different HP max for any disc. **Book** shows the stat block: the first time, tap **Import library file…** and pick `data/monsters/mm2024.json` from the private library repo. Only entries checked against the page can be used; picking one fills AC, HP and speed.
5. Drag any window by its title bar; — folds it to a bar and × closes it. Windows reopen where you left them.
6. **Start fight**, then type each roll; one roll per colour. Ties keep the order you typed; ↑ ↓ swap them. **Next turn** (N) moves on and counts rounds. The turn strip runs along both long edges of the table; a hidden colour joins it only when shown.
7. Disc letters read upright from the bottom edge of the picture. If that's the far side of your table, **Flip disc letters** in **Table setup** turns them. Ctrl+Z undoes discs, HP on discs and turns, never a character's HP.

Try a mock round with dice: enter the party, place two colours, link one to its stat block, roll, and press N round the table twice while dealing damage.

## Develop

Node 22.22.0 and npm 10.9.4. On Windows, a version manager such as [fnm](https://github.com/Schniz/fnm) picks up `.nvmrc`; newer Node works but warns.

```bash
npm ci
npm start                       # build and run
npm run check                   # format, typecheck, unit tests
xvfb-run -a npm run test:e2e    # end-to-end tests (Linux needs xvfb-run)
npm run dist:win                # Windows zip in release/
```
