# Plan

Approved by Morgan on 2026-10-28 after three planning rounds, a review and a final check. Step 3, UI design, was added at Morgan's request on 2026-10-28 (D-022). Character cards and the library phase were added in the book library interview on 2026-10-28 (D-026). The phases after session 1 were reordered, merged and cut in the plan audit on 2026-10-29 (D-037). The planning pages are linked in [HANDOFF.md](HANDOFF.md). Decisions are in [DECISIONS.md](DECISIONS.md). Sight was added after the Arkenforge research on 2026-10-29 (D-040). The dice roller (DM only), line of sight and the NPC conversation player came back on 2026-10-29 (D-043).

## Goal for session 1

Run the Thundertree fight from Phandelver and Below: The Shattered Obelisk on Morgan's table. There is no fixed date: session 1 happens when steps 4–8 are done (D-003). Hardware (Windows laptop, projector) is expected the week of 2026-11-02. The map comes from Morgan's own copy of the book.

## Build steps to session 1

Each step ends with something Morgan tests. A step is done when its tests pass and, for anything projected, Morgan's photo shows it working.

1. **Two windows.** The app opens the DM window on the laptop and a fullscreen table window on the projector. With only the laptop screen, the table window opens as a normal window for testing. Morgan tests: double-click, and the table window lands on the projector or a TV.
2. **Calibration.** Drag four corners until a projected square matches a ruler (corner-pin warp for the angled projector). Saved, and redone in under a minute. Morgan tests: a photo of a ruler on the projected grid.
3. **UI design.** Decide how the DM window and the table look and feel, through a planning interview with mockups (D-022). Built as movable, dockable windows with five looks (D-031–D-033). Morgan tests: picks from mockups on the phone, then a styled DM window and table test screen in screenshots.
4. **Map import.** Load an image or photo, drag four corners onto a rectangle of known size, and the map comes out straightened in 1-inch squares (D-024). Morgan tests: the Thundertree map photographed from the book.
5. **Fog.** Brush and shapes to reveal; explored areas stay dimmed. The table preview shows what the table shows. Morgan tests: reveal a building and check the table matches the preview.
6. **Initiative, discs and sheets.** Coloured discs with letters; a turn strip on both long edges showing order, current turn and enemy condition in words; a Party sheet and a monster sheet per colour, with HP changed by a number pad and the stat block from the private library (D-027, D-028). Morgan tests: enter the party, then a mock round with dice.
7. **Ping and pins (D-034).** Tap to ping, hold to pin; the app reopens where it was after a crash (autosave and the curtain were built earlier, D-029). Morgan tests: close the app mid-fight and reopen it.
7b. **Freehand drawing (D-035).** Lasting or fading lines that the players or only the DM see. Morgan tests: mark a trap and a path on the projected map, then rub one out.
7c. **Map scale and magnifier (D-036).** Feet per square stored with each map; a magnifier under the dragged corner. Morgan tests: import the Thundertree photo; it comes out 28 × 19 inches at 10 ft a square.
7d. **HP ring (D-036).** DM map only. Morgan tests: damage a monster; the ring drops, the table shows nothing new.
7e. **Patch tool (D-036).** Fill or clone over room numbers on the table's own copy. Morgan tests: paint out Thundertree's numbers; the DM still sees them, the table doesn't.
7f. **Revealed tokens (D-036).** Symbol or portrait in the coloured ring after Reveal; letter badge, or a tab when a mini stands on it. Morgan tests: a photo of the projected table with a mini on one token.
7g. **Rehearsal safety (D-037).** The last 3 saves are kept, so a bad state can be rolled back after a restart (undo lasts one run). Table → Problem report copies the app version, the display list and recent errors as text for Morgan to paste to Claude. Morgan tests: restore an older save; paste a report.
7h. **One panel (D-038).** The docking goes: the map fills the window beside one panel with Setup, Explore and Fight tabs and a table thumbnail; floating tools; bigger headers; Tab folds the panel; its edge drags to resize. Morgan tests: screenshots at laptop size.
7i. **Encounter list (D-038).** Initiative and Groups become one list; the party as a list with HP bars; sheets open in the panel under a pinned turn strip. Morgan tests: a mock round, from screenshots and then on the laptop.
7j. **Words and setup (D-038).** Uncover (U) / Dim (G), On table / Off table, Show picture; full-window calibrate and import; the first-screen checklist. Morgan tests: calibrate on the laptop.
7k. **Scenes (D-039).** Each scene keeps its map, fog, discs, groups, pins, drawings and paused fight; a Scenes list in Setup; one-tap switching that drops the curtain. Needed for session 1. Morgan tests: prepare three scenes, switch with minis on the table, leave a fight half done and come back, close and reopen the app.
7l. **Curtains, spots and reset (D-039).** Black, picture or title curtain per scene; saved spots on big maps; Mark ready and Reset. Morgan tests: a title read from both long sides, a picture in the dark room, jumping between two spots, resetting a scene after a fight.
7m. **World map (D-039).** Link pins, a party marker and the World map curtain. Morgan tests: travel on the world map, then open a battle map from a pin.
8. **Rehearsal.** A full dry run of Thundertree at home, following [REHEARSAL.md](REHEARSAL.md): each part has a pass line and the photo that proves it. Anything that fails is hidden for session 1, not redesigned (D-037).

## After session 1, in order

1. **Scenes.** Moved before session 1 as steps 7k–7m (D-039). Left here: scenes grouped by adventure, and editing a scene while another is on the table.
2. **Map annotation.** Trace rooms, walls, doors, windows and materials on an imported map. Each wall, door or window blocks light, sight and sound separately, so sight and sound need no second pass (D-040). It brings one-tap room reveal (D-007, D-025), doors, room notes and the material tags living effects need (D-014). The generator later produces the same annotation.
3. **Sight (D-040).**
   - Enemy discs in never-seen fog stay off the table: the player view leaves them out (D-002), and the DM map marks them hidden by fog. This only hides; it never shows a disc set Off table.
   - Doors open and close on annotated maps.
   - Look from here: tap where a mini stands, and the table uncovers what can be seen from there, cut off by walls and closed doors and, on a dark map, by the light range (torch, darkvision). One ordinary Uncover per tap. Replaces the light-radius fog shape.
   - Line of sight (D-043): a marker per character that Morgan moves on the laptop, and the table uncovers what it sees as it moves. About 3 steps (estimate); its shape is settled in the Sight interview.
4. **Library.** Already built: library import, stat block and HP per disc, portraits (D-028, D-036). Still to build:
   - Map intake: corner snapping, PDF page import (pdf.js), library maps ready to place, map library tidy-up (D-036).
   - Book search: one search over creatures, spells and items.
   - Adding monsters: pick from the search, place a group by count, sized from the stat block in feet on the map's scale (D-036).
   - Treasure roller on the DMG tables with seeded dice (GAME-01).
   - Encounter builder, which also tests an encounter (merged with the old "encounter tester").
5. **Battle drama.**
   - Measure: one tool for the ruler, a line with its length, a circle and spell templates.
   - Map marks: symbols (reusing the token symbols) and labels written twice (D-008, D-035).
   - Conditions: on discs and characters, with durations and concentration that count down on Next turn; down marks (D-036) are one of them.
   - Dice roller for the DM only (D-043): rolls never reach the table; seeded dice (GAME-01). Plain first, animated later.
6. **Living effects.** Fire first, then ice, water, lightning and collapse, spreading each round on annotated materials (D-014). Weather is an optional ambient layer here.
7. **Story tools.** Room notes, story tracker, Far Realm tracker, handouts and item cards, ambient sound.
8. **Generator.** Ruined town and interiors first in the pencil style, then dungeon and cave, with annotation. Edit after generating. Moved below story tools: Morgan runs a published adventure whose maps come from the book (D-037). A test-only concept (seeded maps, detection, lighting) exists; its findings feed this design (D-041).
9. **Later.** Remote players, hex and gridless, camera tracking (the only route to sight that follows the minis by itself), fantasy icons (D-023). From the Arkenforge research (D-040): light sources on the map and a time-of-day tint, each after a projector photo. NPC conversation player (D-043): show an NPC's picture on the table and play audio recorded for them at prep; Next shows the next NPC and plays their clip.

Cut in the plan audit (D-037): the name and loot generators (Claude does them at prep; loot is the treasure roller). The dice roller, line of sight and the NPC conversation player came back with D-043.

## How we work

- After each step Morgan gets a short phone message: what changed, what to test, and a link.
- New phases are planned with the `planning-interview` skill in `.claude/skills/planning-interview/`.
- Before each pull request, Morgan gets a summary to approve; after that the PR is opened and merged when green (D-018).
- Decisions go in DECISIONS.md; settled ones aren't reopened without new evidence.
