# Plan

Approved by Morgan on 2026-10-28 after three planning rounds, a review and a final check. Step 3, UI design, was added at Morgan's request on 2026-10-28 (D-022). Character cards and the library phase were added in the book library interview on 2026-10-28 (D-024). The planning pages are linked in [HANDOFF.md](HANDOFF.md). Decisions are in [DECISIONS.md](DECISIONS.md).

## Goal for session 1

Run the Thundertree fight from Phandelver and Below: The Shattered Obelisk on Morgan's table. There is no fixed date: session 1 happens when steps 4–8 are done (D-003). Hardware (Windows laptop, projector) is expected the week of 2026-11-02. The map comes from Morgan's own copy of the book.

## Build steps to session 1

Each step ends with something Morgan tests. A step is done when its tests pass and, for anything projected, Morgan's photo shows it working.

1. **Two windows.** The app opens the DM window on the laptop and a fullscreen table window on the projector. With only the laptop screen, the table window opens as a normal window for testing. Morgan tests: double-click, and the table window lands on the projector or a TV.
2. **Calibration.** Drag four corners until a projected square matches a ruler (corner-pin warp for the angled projector). Saved, and redone in under a minute. Morgan tests: a photo of a ruler on the projected grid.
3. **UI design.** Decide how the DM window and the table look and feel, through a planning interview with mockups (D-022). Settled layout and table rules (D-008, D-012, D-013) stay. Morgan tests: picks from mockups on the phone, then a styled DM window and table test screen in screenshots.
4. **Map import.** Load an image or photo, mark one square, and the map snaps to 1-inch squares. Morgan tests: the Thundertree map photographed from the book.
5. **Fog.** Brush and shapes to reveal; explored areas stay dimmed. The table preview sits at the top of the DM window's right panel. Morgan tests: reveal a building and check the table matches the preview.
6. **Initiative, markers and character cards.** Coloured discs with letters, and a turn strip on both long edges showing order, current turn and enemy condition in words. Character cards hold each player's name, AC, HP, passive Perception and speed, typed in by Morgan (D-024). Morgan tests: enter the party, then a mock round with dice.
7. **Ping, autosave, curtain.** Tap to pulse, long press to pin. The app reopens exactly where it was after a crash. Morgan tests: close the app mid-fight and reopen it.
8. **Rehearsal.** A full dry run of Thundertree at home, then fixes.

## After session 1, in order

1. **Library.** Import the library file from the private repo, monster search, stat block and HP on a disc, portrait reveal, spell lookup, treasure roller (D-024). Room notes, story tracker, Far Realm tracker, encounter builder and item handouts follow it.
2. **Battle drama.** Conditions, light sources, doors, automatic line of sight where Morgan moves markers, spell templates, ruler, weather, the dice roller, scene switching.
3. **Generator.** Ruined town and interiors first in the pencil style, then dungeon and cave. Edit after generating.
4. **Living effects.** Fire first, then ice, water, lightning and collapse, spreading each round.
5. **Story tools.** NPC conversation player, world map linked to battle maps, handouts, item cards, names, loot, ambient sound.
6. **Later.** Remote players, hex and gridless, encounter tester, camera tracking, fantasy icons (D-023).

## How we work

- After each step Morgan gets a short phone message: what changed, what to test, and a link.
- New phases are planned with the `planning-interview` skill in `.claude/skills/planning-interview/`.
- Before each pull request, Morgan gets a summary to approve; after that the PR is opened and merged when green (D-018).
- Decisions go in DECISIONS.md; settled ones aren't reopened without new evidence.
