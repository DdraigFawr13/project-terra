# Decisions

Settled rules for this project. Not a changelog: an entry stays while the rule is in force. Change a rule here in the same change that changes the behaviour. Mark ideas Proposed until the owner approves them; mark retired entries SUPERSEDED with a pointer, never delete them.

All entries up to D-017 were approved by Morgan in the planning forms on 2026-10-27/28 (links in HANDOFF.md).

## D-001 A Windows desktop app built with Electron and TypeScript

- **Status:** Accepted (2026-10-28)
- **Decision:** Project Terra is an Electron app written in TypeScript. Morgan starts it by double-clicking a program on a Windows laptop. It works offline and uses no paid services. Step 1 drew with Canvas 2D; maps and fog are Canvas 2D too; the step 5 speed measurement kept Canvas 2D, without PixiJS (D-024, D-025).
- **Why:** Morgan wanted a program to double-click, offline, with a budget under 50 one-off. Electron handles two screens and offline use well, and agents build with it reliably.

## D-002 Two windows: the table shows only the player view

- **Status:** Accepted (2026-10-28)
- **Decision:** The DM window runs on the laptop screen. A separate table window goes fullscreen on the projector and only ever receives what players may see. On the laptop's own screen the table window stays a normal window, so it never covers the DM window.
- **Why:** with one mirrored screen, fog can't hide anything and DM notes or enemy HP would be projected. Morgan kept the separate window in round 2.

## D-003 Session 1 scope

- **Status:** Accepted (2026-10-28); character cards added 2026-10-28 in the book library interview; save rollback and a problem report added by D-037; the one-panel DM window by D-038; scenes by D-039.
- **Decision:** Session 1 needs two windows, calibration, map import, a square grid, manual fog, an initiative tracker with simple markers and character cards, ping, autosave and the curtain, since D-035 freehand drawing, since D-036 map scale, a corner magnifier, the HP ring, the patch tool and revealed tokens, since D-037 keeping the last 3 saves and a problem report, since D-038 the one-panel DM window, and since D-039 scenes (step 7k; steps 7l and 7m too if they are done by then). Everything else waits until after session 1 (PLAN.md). Session 1 has no fixed date: it happens when this list is ready.
- **Why:** 22 features were ranked "Now" against 1–3 months with games monthly or less. Both reviews flagged it, and Morgan cut the list in the review. In the book library interview Morgan first moved six library features into session 1, then kept only character cards after the review showed the cost.

## D-004 Projector rig and calibration

- **Status:** Accepted (2026-10-28)
- **Decision:** Morgan's own projector sits angled from a shelf onto a white mat, in a room that can be fully dark. Calibration is a corner-pin warp: Morgan drags four corners until a projected square matches a ruler. One square is 1 inch. If the angle can't be made to work, the fallback is pointing the projector straight down.
- **Why:** an angled projector distorts squares, and the projector's own keystone loses pixels and leaves squares uneven. 1-inch squares fit standard minis.

## D-005 Positions are stored in inches

- **Status:** Accepted (2026-10-28)
- **Decision:** Positions and sizes are stored in real inches. The square grid is a layer drawn on top.
- **Why:** Morgan wants hex and gridless later. Grid-cell coordinates would force a rewrite.

## D-006 Visibility: one switch per item, plus named groups

- **Status:** Accepted (2026-10-28)
- **Decision:** Every item has an eye switch: on the table, or only the DM sees it. Hidden items look see-through on the DM screen. Items can be put in named groups ("Ambush goblins") that reveal or hide with one tap. There is no stacking order to manage: map, then effects, then markers, then pings.
- **Why:** Roll20's token layers and hiding felt clumsy to Morgan. Layers are fine only if they're this simple.

## D-007 Session 1 fog is revealed by hand

- **Status:** Accepted (2026-10-28). Automatic line of sight cut by D-037; rooms come from map annotation.
- **Decision:** Fog is revealed with a brush and shapes, and by room where the map defines rooms. Explored areas stay dimmed. Automatic line of sight comes after session 1, and only for markers Morgan moves on the laptop.
- **Why:** the app can't see physical minis, so automatic fog would mean mirroring every move on the laptop.

## D-008 Player-facing text faces both long sides

- **Status:** Accepted (2026-10-28). Disc letters are an exception since D-028.
- **Decision:** Any text on the table (turn order, cards, subtitles, labels) appears twice, once facing each long side.
- **Why:** players sit on two opposite sides, so single text is upside down for half the table.

## D-009 Maps come from images and photos

- **Status:** Accepted (2026-10-28)
- **Decision:** Maps are imported from images or photos; Morgan marks one square to set the scale. Morgan can send photos of hand-drawn or book maps to Claude during prep for a clean version. The generator comes after session 1.
- **Why:** Morgan has no Dungeondraft and draws on a mix of grid and plain paper. Book maps often have no grid or an odd scale.

## D-010 Book content lives in the private library repo

- **Status:** Accepted (2026-10-28; changed 2026-10-28, was "the personal library stays on the laptop")
- **Decision:** Data from Morgan's own books (Monster Manual 2024, DMG 2024 and others bought on D&D Beyond or in print) may be extracted by Claude from Morgan's PDFs and committed to the private repo `DdraigFawr13/project-terra-library`. It never goes in `project-terra` (public), its CI logs or artifacts, or any build shared with others. The app reads it into the personal library on the laptop. Only SRD 5.2 content ships in `project-terra`, with its CC-BY-4.0 attribution.
- **Why:** Morgan wants the book monsters and DMG tables in the app without typing them in. Copyright covers copying and sharing whether or not it is commercial, and `project-terra` is public: its files and Actions artifacts are downloadable by others. A private repo keeps the data for Morgan's personal use only.

## D-011 Map art: projector-tuned pencil

- **Status:** Accepted (2026-10-28)
- **Decision:** The first generated style is pencil, with firm dark walls and pencil texture for details, plus a contrast slider. The final call comes after the first test on the table.
- **Why:** Morgan chose pencil but worried it would be too faint when projected.

## D-012 DM screen layout

- **Status:** Accepted (2026-10-28). Side panels became movable windows in D-031.
- **Decision:** Side panels: initiative and markers on the left, the map in the middle, and on the right a live table preview above the notes. Tools run along the bottom.
- **Why:** Morgan liked side panels most and also wanted to always see what the table shows.

## D-013 Initiative and enemies in session 1

- **Status:** Accepted (2026-10-28). HP on discs moved into session 1 by D-028.
- **Decision:** Enemies in session 1 are coloured discs with a letter; Morgan tracks HP on paper. The turn strip shows turn order, whose turn it is, and enemy condition in words (bloodied, near death), never enemy names. Players roll physical dice.
- **Why:** it keeps session 1 small. After session 1, the library phase links a disc to a stat block and tracks HP on it: tap the disc, type damage or healing, with temp HP, each disc separate. The condition word is then worked out from HP on the DM side, and only the word reaches the table (D-026).

## D-014 Effects spread each round; the DM decides damage

- **Status:** Accepted (2026-10-28)
- **Decision:** Spreading effects (fire, ice, water, lightning, collapse) advance when Morgan advances initiative. They decide what burns or freezes; Morgan decides damage and saves. Maps carry material tags (wood, stone, water) so effects can use them later.
- **Why:** Morgan wants the app to track and Morgan to apply the rules. Advancing per round keeps it predictable at the table.

## D-015 Later and out of scope

- **Status:** Accepted (2026-10-28)
- **Decision:** Remote players, hex and gridless, the encounter tester and camera tracking come last. Paid AI voices, if used, are generated at prep time and saved as files, so play needs nothing online.
- **Why:** remote players need a server, which breaks the simple local setup. Paid voices are usually subscriptions, and the budget is under 50 one-off.

## D-016 Testing and proof

- **Status:** Accepted (2026-10-28)
- **Decision:** Morgan tries each build on the laptop and sends a photo or screenshot; anything projected counts as working only with that evidence. Unit tests use Node's built-in test runner on TypeScript files. End-to-end tests drive the real Electron app with Playwright under Xvfb.
- **Why:** agents can't see the table. vitest 5.0.3 failed to install with npm 10.9.4 ("Cannot read properties of null (reading 'edgesOut')"), and Node 22's built-in runner needs no extra dependency.

## D-017 Phase order after session 1

- **Status:** SUPERSEDED by D-037 (2026-10-29). D-026 had already put the library first without marking this entry.
- **Decision:** Battle drama, then monsters from Morgan's books, the generator, living effects, story tools, and the rest (PLAN.md).
- **Why:** Morgan's dream is epic battle scenes, so the second session should already feel different.

## D-018 Pull requests: summary first, then open and merge

- **Status:** Accepted (2026-10-28)
- **Decision:** Before opening a pull request, the agent stops and gives Morgan a short summary of the changes. Once Morgan approves, the agent opens the PR and merges it when CI is green, with no further approval. Merges are squash merges.
- **Why:** Morgan's instruction on 2026-10-28. Morgan wants to see each change before it goes up, without a second approval step at merge time.

## D-019 The repo carries everything a session needs

- **Status:** Accepted (2026-10-28)
- **Decision:** Sessions may not have access to AI-Master-Instructions. The synced files (rules, agents, the CI skill, the session hook, the sync script) stay committed. The `planning-interview` skill is a project-owned copy of the AI-Master-Instructions v0.4.0 version, in `.claude/skills/planning-interview/`, not listed in `.ai-master.lock`. Before syncing a master version that includes it (v0.4.0 or later), delete this copy, or sync refuses to overwrite it.
- **Why:** Morgan's instruction on 2026-10-28. v0.4.0 isn't tagged yet, so the skill can't be synced the normal way.

## D-020 Test upkeep at the end of each step

- **Status:** Accepted (2026-10-28)
- **Decision:** At the end of each plan step, review every test. Ask: does it guard something Morgan relies on or a settled rule? Is another test already covering it? Can it share setup with a neighbour? Cut or merge what fails those questions, and say so in the commit message. Budgets: the unit suite stays under 2 s and the e2e suite under 60 s locally. A new e2e test needs its own app launch only for a new user journey; otherwise it extends an existing one. Logic is tested in `src/core/`; e2e covers only the wiring between windows, the main process and disk. Use `npm run knip` and `node --test --experimental-test-coverage "src/**/*.test.ts"` in the review to find unused code and untested lines. Never cut a test to get green (VER-01).
- **Why:** Morgan asked on 2026-10-28 that tests stay efficient and are regularly checked for continued need. Each Electron launch costs about 0.5–1.5 s (measured locally), so e2e cost grows with launches, not assertions.

## D-021 How calibration is stored and drawn

- **Status:** Accepted (2026-10-28), approved by Morgan with the step 2 pull request after a walkthrough (https://claude.ai/artifact/Dk2LB8FkDL3Jaj7JExoqfY).
- **Decision:** Calibration stores the measured rectangle's size in whole inches and where its four corners land, as fractions (0–1) of the table screen. There is one calibration per table surface: `display:<id>` for each projector, and `window` for the table window on the laptop (for ruler tests on the laptop screen). Everything on the table is drawn in inches on one layer canvas, and a single CSS `matrix3d` warp puts that layer onto the screen. Corners are dragged in the DM window; arrow keys move one physical pixel.
- **Why:** fractions of the screen don't change with resolution or Windows display scaling, so no conversion between CSS and physical pixels can go wrong. Drawing in inches keeps D-005, and maps, fog and markers in steps 4–6 get the warp for free instead of each doing its own maths. The table window stays read-only (D-002): only the DM window changes the calibration.

## D-022 UI design is a plan step before map import

- **Status:** Accepted (2026-10-28)
- **Decision:** Step 3 of the session 1 plan is UI design: how the DM window and the table look and feel, decided with the `planning-interview` skill and mockups before more screens are built. Map import, fog, initiative, ping and rehearsal become steps 4–8.
- **Why:** Morgan's instruction on 2026-10-28, after step 2 merged. Steps 4–6 each add DM controls and table visuals; deciding the look first means building them once.

## D-023 UI design

- **Status:** Accepted (2026-10-28), approved by Morgan in the UI design interview; control sizes changed by D-031, colours by D-033, the R and H shortcuts by D-038, the per-scene curtain by D-039 ([round 1](https://claude.ai/artifact/CXKec4y4K2JBqv6gAC8eyx), [round 2](https://claude.ai/artifact/8dnwH7FRSRMLrYBkuHCtW2), [final](https://claude.ai/artifact/VUP3qZFNYp2gZTPbXch4Re)).
- **Decision:**
  - DM window: the "Ember" look. Dark warm brown, a copper-red highlight (not amber, so it can't be mistaken for the yellow enemy disc), Alegreya SC for headings only, and Source Sans 3 for everything else. Both fonts are bundled (SIL OFL), so the app looks the same on any laptop and works offline.
  - Layout: D-012 with the "Classic" sizes (left about 290 px, right about 340 px). The side panels fold away with a button or Tab. Tools run along the bottom with icons, names and keys.
  - Icons: Lucide line icons for now. Fantasy icons later.
  - Controls: every button and row is at least 40 px tall, for both touch and mouse. Shortcuts: B curtain, N next turn, V select, R reveal, S shape, H hide, M marker, P ping, Ctrl+Z undo, Esc cancel, Tab panels. Shortcuts never fire while typing, and Tab folds the panels only when no control has focus.
  - Table: plain bold lettering (Source Sans 3), twice per D-008. The turn strip is one chip per creature, with the current turn larger and outlined, and enemies shown with their disc colour and condition in words. When the chips don't fit, show the current turn and those after it that fit, then "+N more". Enemy discs are solid strong colours (yellow kept) with a white rim. Areas explored but not currently seen are grey and hatched.
  - Between scenes: a black curtain for session 1. A per-scene choice comes with scene switching after session 1.
  - Step 3 builds the styled shell: theme, fonts, layout with empty panels, toolbar, folding, and the curtain and next-turn keys. Steps 4–6 fill it.
- **Why:** Morgan wants a clean tool with a light fantasy touch that reads fast mid-fight, in a dark room, on a 1080p laptop with mouse and touch. On a projector, strong colours and plain bold text survive best.

## D-024 Map import, undo and the library

- **Status:** Accepted (2026-10-28), Morgan chose all five recommendations in chat.
- **Decision:**
  1. Import straightens: the DM drags four corners onto a rectangle of known size on the picture (for example 8 × 6 grid squares), the same gesture as calibration. One square becomes 1 inch (D-005). The picture is straightened once at import; the parts of a slanted photo squashed more than 4 times are left out.
  2. Imported maps go to the personal library, `<app data>/library/maps/` on the laptop, as a straightened PNG plus a JSON file with its name and extent (D-010). Saves hold only the map's id and place. Windows load maps through `terra-map://<id>/`, which serves only library files.
  3. The table window gets the whole map image. From step 5, fog is drawn over the hidden parts. The map's name stays DM-only.
  4. Every change is a command applied by one function in `src/core/table.ts`. Map commands (place, move, turn, take off) can be undone with Ctrl+Z or the Undo button; switches such as the curtain, and calibration, are not part of undo. The undo history lasts for the session.
  5. Maps are drawn with Canvas 2D on the calibrated table layer (D-021). PixiJS is reconsidered at step 5, with a speed measurement, before adding it (SAFE-03).
- **Why:** a phone photo of a book page is never square on, so one marked square can't fix it; four corners fix scale and slant together and reuse the calibration maths. Commands give undo and replayable, testable state (GAME-02, GAME-06). Sending only revealed parts to the table would be slower and more work; Morgan accepted fog over the whole map.

## D-025 Fog

- **Status:** Accepted (2026-10-28), Morgan approved the touch sketch ([fog controls](https://claude.ai/artifact/GKdfQJajEesUen1zUCnFhg)) in chat; the two open points took the recommended defaults. Item 5's op limit changed by D-029: long fog lists are baked, never refused. Item 8 changed by D-037: rooms come from map annotation, not only the generator. Tool names and keys changed by D-038 (Uncover U, Dim G).
- **Decision:**
  1. Three states on the table: never seen is black; seen before is the map in grey, darkened, with a line every half inch; in view now is the map itself (D-023). The DM sees the whole map, tinted where players can't see now and darker where they've never been.
  2. Touch first. The bottom tools are 56 px buttons: Select (V), Reveal (R), Hide (H); draw with Brush (1, 2 or 4 inches), Outline (a freehand loop that fills) or Box (snaps to whole squares), with S stepping through them; Undo. Under the preview: "Party moves on" (in view becomes seen before), Reveal all and Cover all. One finger, the pen or the mouse paints; a second finger or Esc cancels the stroke. Morgan uses a stylus: touches are ignored while the pen draws (a resting palm), a hovering pen shows the brush ring, and the pen's eraser hides.
  3. Hide turns in view back into seen before, never black. Cover all and Undo cover the black case.
  4. A stroke reaches the table when the finger lifts, as one fog command that Undo takes back (D-024).
  5. Fog is the list of strokes and shapes on the placed map, in the map's own inches, so it moves and turns with the map. A placed map starts all black; taking it off drops its fog. Points are kept to hundredths of an inch; at most 2,000 ops per map and 1,000 points per op. Save version 4; older saves load with all-black fog.
  6. The DM's live preview at the top of the right panel is drawn by the table's own drawing code (`src/renderer/table-draw.ts`), without the projector's warp.
  7. Canvas 2D stays; PixiJS is not added. Measured on a cloud machine with no GPU, on an 80 × 60 inch map with 500 strokes: a new stroke redraws the table in about 30 ms and the DM map in about 20 ms; Undo of the last stroke about 47 ms; loading the map with all 500 strokes about 0.2–0.3 s.
  8. Rooms that reveal with one tap (D-007) wait for maps that know their rooms (the generator). Outline covers them until then.
- **Why:** Morgan runs the game on a 14-inch touch laptop (HP Pavilion x360, 1920 × 1080) with a stylus, so the tools must work with a finger or a pen, without keys or modifiers. Lifting before sending lets the DM cancel a slip before players see it, and makes each stroke one undo step. Storing strokes rather than pixels keeps saves small and replayable (GAME-02, GAME-06).

## D-026 Book library: data track and first features

- **Status:** Accepted (2026-10-28), approved by Morgan in the book library interview ([round 1](https://claude.ai/artifact/FUAenSA2tNkCqRnp62DZ2v), [round 2](https://claude.ai/artifact/FJbNz8xutdeTdynbCB6gQT), [review and approval](https://claude.ai/artifact/DtmiYuaqWcob54HQt5rjpB)).
- **Decision:**
  - Data is extracted now, in the private repo only (D-010), alongside the app work: every Monster Manual 2024 creature with habitat, treasure, a short lore summary in Claude's words, encounter tables by habitat and cropped art; the Phandelver and Below creatures and its magic items; PHB spells; DMG treasure tables. DMG traps, hazards, weather and the other magic items come after session 1. Subclasses: SRD for now; Morgan adds the rest later.
  - Every stat block carries a "checked against the page" mark. Only checked entries can be linked to a disc; unchecked ones show a warning in the DM window. Session 1's creatures are all checked.
  - Monster Manual entries are transcribed from page images, with the scan's text and arithmetic checks as cross-checks (pilot: 3 of 20 entries came clean from the scan's text alone). DMG tables are read twice and compared.
  - The app gets an import button that loads a library file from the private repo.
  - After session 1, first phase: import, monster search, a stat block and HP per disc (D-013), portraits shown in the DM window and revealed to the table per monster by a tap, spell lookup, and a treasure roller on the DMG tables with seeded dice (GAME-01). Items not yet extracted show name and rarity only.
  - Character cards (name, AC, HP, passive Perception, speed), typed in by Morgan, are in session 1 (D-003). Full character sheets are a later phase.
  - The table window never receives library data. A test asserts the player view holds no monster, HP or library fields.
- **Why:** Morgan wants the books in the app without typing. The review showed the cost of putting the library in session 1, so Morgan kept only the cards there. The scan's text needed image fixes in 17 of 20 pilot entries, and wrong text such as an immunity can't be caught by arithmetic, hence the checked mark.

## D-027 Initiative, markers and character cards

- **Status:** Accepted (2026-10-28), Morgan took all five recommendations in chat ("Go") and asked that everything works with touch and a stylus. Items 3, 4 and 6 changed by D-028.
- **Decision:**
  1. Enemy discs: Marker (M), pick a colour and a size (1 to 4 inches), tap the map. A disc snaps to the squares and takes the next free letter of its colour. Six strong colours, yellow kept. Select drags a disc. Players have no discs: they use their minis. Discs live on the placed map in its inches, like fog, so they move and turn with it, and taking the map off drops them.
  2. New discs start hidden. A colour is a group, with a DM-only name and one eye switch; each disc also has its own (D-006).
  3. Condition by hand until HP on discs (D-013): fine, bloodied, near death, down. A down disc leaves the table and the turn strip.
  4. Character cards in the left panel: name, AC, HP (current and max, with − and +), passive Perception, speed. Typed once, kept between sessions. DM-only: the table gets names on the turn strip.
  5. Initiative: the DM types each roll; one roll per colour. Ties keep the typed order, and ↑ ↓ swap tied entries only. N or Next turn moves on and counts rounds; entries whose discs are all down are skipped. A hidden enemy's chips reach the strip only once it is revealed. The strip runs along both long edges of the projected area (D-008, D-023).
  6. Touch and stylus: every control is at least 40 px, the bottom tools 56 px; a disc can be grabbed within 22 px of its edge however small it is drawn; a resting palm is ignored while the pen moves a disc or places one.
  7. Disc, condition and fight changes undo with Ctrl+Z (D-024). Character cards are not part of undo, so an undo never takes back typed HP. Save version 5.
- **Why:** session 1 needs enemies the players can name ("I attack B") without giving away an ambush or HP (D-002, D-013). Colour as the group keeps hiding to one tap without a separate group editor (WS-05). Morgan runs the game on a touch laptop with a pen (D-025).

## D-028 Step 6 redo: floating windows, monster HP and stat blocks

- **Status:** Accepted (2026-10-28), from Morgan's review of step 6 and the [sketch](https://claude.ai/artifact/7RHmUtvNBaQGqk7sw95thk): floating windows, party and monster windows, per-disc editing, then "go with recommended for the rest". Changes D-027 items 3, 4 and 6, brings HP on discs (D-013) and the library stat block (D-026) into session 1, and makes disc letters an exception to D-008. Items 1 and 7 changed by D-031: sheets are dockable windows, and controls are smaller.
- **Decision:**
  1. Character cards and monster info move out of the left panel into floating windows inside the DM window: dragged by the title bar, folded to a bar, closed, and reopened where they were left. They never become OS windows, so none can land on the projector. The left panel keeps initiative and the colour groups, with more room.
  2. A Party window with a tab per character: name, AC, HP, temp HP, speed, passive Perception, Insight and Investigation, spell save DC (optional) and notes. Damage takes temp HP first.
  3. A monster window per colour: AC, speed and HP max for the group, a different HP max for any disc, HP per disc, notes. The condition word comes from HP: Bloodied at half or below (2024 rules), Near death at a quarter or below (Claude's proposal, accepted), Down at 0. Without an HP max the manual condition of D-027 stays.
  4. HP changes with a number pad: pick a disc or character, tap the amount, tap Damage or Heal. The engine applies the change (GAME-02).
  5. Book: the monster window shows the stat block from the private library (D-010). The DM imports a library file once; it is copied to `<app data>/library/creatures/`. Only page-checked entries can be linked (D-026); linking fills AC, HP and speed. The table window never receives library data.
  6. Disc letters are drawn once, upright from the bottom edge of the projected picture, with a Flip switch in Table setup. The turn strip keeps its two copies (D-008).
  7. Button sizes stay at D-023's 40 px and 56 px until Morgan tries the laptop.
- **Why:** Morgan found the panel crowded and typing HP not touch friendly, and wants the Monster Manual entry at the table. Floating windows inside the DM window keep DM-only data off the projector (D-002). The six Thundertree creatures are already page-checked, so the stat block costs about one step, not the whole library phase (estimate).

## D-029 Hardening before step 7

- **Status:** Accepted (2026-10-28). Morgan asked for an adversarial audit of the app as built, then said "go with your recommendations" for the fixes that need no design choices. Changes D-025 item 5.
- **Decision:**
  1. Fog never stops taking strokes. A list of 500 ops is baked into one `base` op before the next: seen and explored for each cell at 24 cells per inch (the renderer's mask resolution, so the table looks the same), stored as run lengths. Baking reads the same as replaying the ops at every cell centre (a property test checks it). The 2,000-op limit now only bounds untrusted lists. Save version 7.
  2. Each change reaches the DM window once: the window takes each new state from the bridge in one place and hands it to every panel, and `apply` and `undo` no longer send the state back. Saves are compact JSON.
  3. The app keeps the display awake (`powerSaveBlocker`, "prevent-display-sleep") so Windows can't switch off the projector or sleep the laptop mid-session.
  4. Lock map: a switch beside the map's name. A locked map can't be moved, turned or taken off; Select still drags discs. A newly placed map starts unlocked (since D-032: locked). Like the curtain, the lock is outside undo, and a command a lock refuses leaves no undo step.
  5. A failed save never crashes the app: renames retry briefly (on Windows a scanner or indexer can hold the file), then the DM sees a notice and the save is tried again every 2 seconds; the last good save stays on disk. A window whose page crashes reloads itself, up to three times a minute. An unreadable save that Windows won't move is copied aside instead.
- **Why:** measured on Morgan's PC (Ryzen 7 5800X3D) with fog at the old 2,000-op limit: every change took about 400 ms, as the state was copied once per panel, and the save was 5.9 MB; past the limit new strokes were dropped with only a hint in the right panel. Now: about 9 ms for an HP change and 25 ms for a stroke, about 0.2 s once per 500 strokes to bake, and a 39 KB save. Zoom on the DM map and the floating windows covering the table preview change how the DM screen works, so they go through the planning interview first.

## D-030 Zoom on the DM map

- **Status:** Accepted (2026-10-28), Morgan chose "Pinch + buttons" in the audit follow-up.
- **Decision:** The DM's map view zooms from fitting the whole map up to 8 times: pinch with two fingers (which also pans), the mouse wheel about the pointer, and + / − / Fit buttons over the map's corner. With the map locked, dragging with Select pans; the middle mouse button pans with any tool. Zooming keeps the square under the pointer where it is. The view is the DM's own: it never reaches the table or the save, and a newly placed map starts fitted.
- **Why:** at the laptop's 1280 × 680 a 40 × 28 inch map drew about 11 pixels per inch, too small to paint fog along a wall by finger or pen. Two fingers already cancel a stroke (D-025), so a pinch fits the same gesture.

## D-031 Movable windows and smaller controls

- **Status:** Accepted (2026-10-28). Morgan asked for windows that move "like Visual Studio" and for buttons "smaller by a bit", since a stylus doesn't need big targets. Changes D-012 (fixed side panels), D-023 (40 px controls, 56 px tools) and D-028 items 1 and 7 (floating sheets, button sizes). Items 1–3 SUPERSEDED by D-038 (one panel, no docking); item 4's sizes stand.
- **Decision:**
  1. The map stays in the middle. Initiative, Groups, "On the table now" (with the whole-map fog buttons), the Party sheet and each monster sheet are windows. A window docks in the left, right or bottom area, where windows share a group as tabs and groups stack with dividers; or it floats over the DM window and is sized from its corner. Drag a tab or a floating title bar: a highlight shows where it lands (an area's edge, beside or into a group, or floating).
  2. Areas and groups resize by dragging the dividers. Tab (or Panels) folds every docked window away. The Windows menu shows or hides the map's windows and resets the layout. Sheets close when done and open where they were last, as tabs beside any open sheet by default.
  3. The layout is kept on this laptop (browser storage); it is not part of the table's save. Everything stays inside the DM window, so nothing DM-only can reach the projector (D-002).
  4. Sizes: 32 px buttons, 36 px list rows, 44 px bottom tools, 14 px text.
- **Why:** Morgan's instruction on 2026-10-28, after the audit showed the old floating windows covering the map and the table preview. Docking keeps both in view by default, and Morgan can arrange the rest. At 1920 × 1080 (the size the tests now run at) the map fills most of the window and a monster sheet fits without scrolling.

## D-032 DM window redesign

- **Status:** Accepted (2026-10-28), from the UI review ([round 1](https://claude.ai/artifact/N2LH9mtnUHNT5QydAdB8Zz), [round 2 and draft](https://claude.ai/artifact/To2kRT3RWFcb16mti3cDov)): "Approved with the changes I wrote". Builds on D-031; changes D-023 (top bar, bottom tools) and D-028 (a tap on a disc). Items 1–5 SUPERSEDED by D-038; items 6–10 stand.
- **Decision:** all of it before step 7 (Morgan: "we have time to do all of these").
  1. Window look: framed windows on a dark ground with a 6–8 px gap, slightly rounded corners; the window last touched has a copper outline. Headers: see D-033. A window slides into place in about 0.15 s when it docks or floats.
  2. Window bars: grab a window anywhere on its bar that isn't a button; its own buttons sit in a second row under the tabs, so tab names stay whole; a window folds to its bar; a floating window can be pinned, staying above other floating windows and in place when presets change.
  3. Tools: one Tools window, docked as a strip directly beside the map by default, or floated as a palette.
  4. The map is a window: it moves and tabs but never closes; its own buttons (Lock, Turn, Take off, and zoom: − / % / + / Fit) are its second row. Table setup is a window too. A newly placed map starts locked, so a drag pans the view; unlocked, a drag moves it on the table (changes D-029 item 4). The arrow buttons are gone: Morgan pans and zooms by dragging, two fingers and the wheel; the arrow keys still nudge an unlocked map.
  5. Presets: Prep, Explore and Fight, each remembering its own arrangement; Reset puts one back.
  6. Menus on the top bar (Table, Fight, View); Curtain and Next turn stay as buttons. A status bar at the bottom: saved, table screen, round, zoom, notices.
  7. A tap on a disc opens a small HP pad beside it (amount, Damage, Heal, Sheet); dragging still moves it.
  8. Initiative rolls with a number pad (no on-screen keyboard).
  9. Unbuilt features are hidden (Ping, the scene name) until they work.
  10. Later: a compact/comfortable switch and a shortcut sheet. The colour round is D-033.
- **Why:** Morgan found the movable windows blended in and wanted the DM window rethought around them, from a stylus on a 14-inch screen.

## D-033 Looks: three dark, two light, high contrast

- **Status:** Accepted (2026-10-28), from the colour round ([round 1](https://claude.ai/artifact/BCikF4kJUnR1eN1kHRQBvN), [round 2](https://claude.ai/artifact/QsR6UJcgnXaj39py6Dqjj2), [final](https://claude.ai/artifact/FPq4WeyfgBsefRwU1Vyuap)): "Approved, start building". Changes D-023 (the Ember colours) and D-032 items 1 and 10.
- **Decision:**
  1. Looks for the DM window: dark Ember (the default: a deeper, near-black brown), Deep water (dark teal-grey) and Soot (near-neutral black); light Parchment (the default) and Linen (pale warm grey). Copper-red stays the highlight in every look (D-023). Cut: Midnight and Moonlit paper.
  2. View → Appearance… picks Dark or Light, and the dark and light look; picking a look switches to its mode. The choice stays on this laptop, like the layouts. No keyboard shortcut (Morgan: the menu is enough).
  3. Contrast: text and grey text at least 7:1 on every surface in every look; copper, warning and notice colours at least 4.5:1; a unit test (`src/core/looks.test.ts`) checks every look. Light looks keep full contrast, since Morgan uses them at the desk and in a bright room.
  4. Headers: a line under every window header, and the window in use has a copper header as well as its copper outline. A floating window is copper only while in use.
  5. HP keeps green, orange and red, always with a sign or word: Damage and Heal carry − and +, and the Party sheet shows its condition word beside the bar.
  6. The map, calibration and table previews stay black in every look, since they show the table; the table window never changes (D-023).
- **Why:** Morgan liked the deeper Ember best but asked for several looks to choose from, dark and light, and wanted to switch between them. 7:1 suits reading at a glance in a dim room or in daylight. The line under each header plus the copper header makes the window in use easy to find without colouring every header.

## D-034 Ping, pins and reopening (step 7)

- **Status:** Accepted (2026-10-28), from the [step 7 form](https://claude.ai/artifact/UmVczUweJXm3EdVEXRJNm7). D-039 adds link pins, which a tap with Select opens. Builds PLAN.md step 7. Two behaviours change: sheets no longer start closed each run, and placing a map switches the test grid off.
- **Decision:**
  1. Ping: a Ping tool (P). A tap pings the table: thin white rings, at most two at once, for about 2 seconds, around a fading dot. Pings are moments: never saved or undone, and not shown while the curtain is down. The DM sees the rings over the map too, faint under the curtain.
  2. Pins: holding still with Ping for half a second leaves a pin; a tap on a pin takes it away; Table → Clear pins removes them all; Ctrl+Z undoes all three. A pin is a white diamond with a ring. Under Ping, "Players see" or "Only me" sets who sees new pins; the DM's own pins are hollow copper on the DM's map and never reach the table window (D-002). Pins live on the map in its inches, like discs, at most 40. Save version 8; older saves load with no pins.
  3. Reopening: the Party and monster sheets open when the DM window closed open again where they were; a monster sheet whose colour has no discs left is dropped. Docked windows such as Initiative already kept their place.
  4. From the audit: Remove on a character card asks first ("Remove Ash? This can't be undone.", Keep or Remove). The turn strip covers about 0.75 inch of map instead of about 1 inch (chips just taller than their text, same text size). Placing a map switches the test grid off. The placeholders were already hidden by D-032.
  5. Not in step 7: Morgan also asked for marks, symbols and freehand drawing on the map. Settled in D-035.
- **Why:** rings read from every side of the table without covering the minis or pointing one way (D-008); white stands apart from the six disc colours. A separate tool keeps a tap with Select for a disc's HP pad and a drag for panning (D-032). Pins in undo match discs and fog.

## D-035 Freehand drawing before session 1; symbols, shapes and labels after

- **Status:** Accepted (2026-10-28), from the [drawing form](https://claude.ai/artifact/3BtQEkjjm5cJ7pCes2r4Uw). Adds freehand drawing to session 1 (D-003).
- **Decision:**
  1. A Draw tool (D). Lines are drawn with the pen, a finger or the mouse, for paths, areas and where traps are.
  2. Under Draw: who sees new lines (players, or only the DM: dashed on the DM's map and never sent to the table, D-002); how long (lasting, or fading after about 10 seconds, the last 3 fading out); colour: white, cyan or pink, none of them a disc colour.
  3. Lasting lines live on the map in its inches, like pins: undoable, saved (save version 9), at most 100 lines of up to 400 points. A fading line is a moment, like a ping: drawn on the table, never saved, and gone under the curtain.
  4. Rubbing out: a tap on a line, or the pen's eraser over it; Table → Clear drawings removes them all.
  5. After session 1: symbols (X, skull, fire, star/treasure, danger/trap, door), shapes (a line with its length, a circle) and labels written twice (D-008). Shapes join the ruler and spell templates in Battle drama (PLAN.md).
- **Why:** Morgan wants to mark traps, paths and areas at the table, and chose freehand now and the rest later, so session 1 isn't pushed back far. The same two switches as pins (who sees, how long) keep one rule for marks on the map.


## D-036 Maps and monster tokens

- **Status:** Accepted (2026-10-29), approved by Morgan in the maps and tokens interview ([round 1](https://claude.ai/artifact/XmKuvAKNAt1LjGoYDCV4MR), [round 2](https://claude.ai/artifact/Csn63Q1Sx2BtGEDHESXJLe), [final](https://claude.ai/artifact/FeT13w8okCXeqrcCSjvy4s)). Adds four pieces to session 1 (D-003); changes D-024, D-026, D-027 and D-028 as listed. D-039 brings saved spots forward into scenes.
- **Decision:**
  1. Before session 1, in order: (a) feet per square (5 or 10) asked at import and stored on each map, while 1 square stays 1 inch on the table, plus a magnifier under a corner while it is dragged; (b) an HP ring round each disc on the DM map only, green to amber to red; (c) a patch tool: swipe to fill a room number from its edges, or clone clean floor over it; (d) revealed tokens.
  2. Patched maps: the table gets its own patched copy, and the main process checks which window asks before serving a map, so the table can never load the numbered original. A test proves it.
  3. Revealed tokens: one tap on Reveal shows a group's picture in its coloured ring. 1-inch tokens show a creature-type symbol by default, and a group can be switched to its portrait; 2 inches and up show the portrait. Symbols are drawn in code by Claude (SAFE-05) and follow the stat block's creature type, or are picked for an unlinked group. The letter sits on a badge inside the ring, or on a tab below the token when the disc is marked "Mini on it". Portrait art comes from the private library file (cropped by Claude; Morgan may touch it up), or from a picture Morgan picks.
  4. Exception to D-026 and D-028: the table window may receive the picture or symbol of a revealed group, never its name, stats or notes, and nothing before Reveal. The player-view test checks exactly that.
  5. After session 1, at the start of the library phase: corner snapping to grid lines; PDF page import with pdf.js (Apache 2.0, approved under SAFE-03); library maps that arrive ready to place; map library tidy-up (rename, thumbnails, groups by adventure set at import, a Removed list Morgan empties); a down monster leaves a faded, crossed-out mark until cleared, and still leaves the turn strip (changes D-027 item 3); place a group by count; size from the stat block counted in feet on the map's scale (Large is 1 inch on a 10-ft map); monster search. Saved spots on big maps: later. Big maps are dragged, as now.
  6. If the laptop arrives first, the rehearsal (step 8) runs with what is ready; the rest lands before session 1.
- **Why:** Thundertree is a 10-ft map and a keyed DM map, so it needs the scale setting and a way to hide room numbers without hiding the floor. Morgan wants monsters to look like monsters and chose to build it all. The review measured a 1-inch token at about 40 projector pixels (estimate), where a portrait blurs, so symbols are the default there and the table photo decides (VER-07).

## D-037 Plan audit: scenes and map annotation first, merges and cuts

- **Status:** Accepted (2026-10-29). Morgan asked for an adversarial audit of the plan, then said "do what you recommend". Supersedes D-017; changes D-003, D-007 and D-025 item 8. D-039 moves scenes (item 4) before session 1.
- **Decision:**
  1. Before the rehearsal (step 7g): keep the last 3 saves so a bad state can be rolled back after a restart, and a Table → Problem report that copies the app version, displays and recent errors as text. Built: an earlier save is copied into `<app data>/earlier-saves/` when the app starts and at most every 10 minutes while things change, skipped when it matches the newest, so restarts can't push good saves out with copies of a bad one. Table → Earlier saves… lists them with time, map, discs, round and party size; going back first keeps the table as it is now as an earlier save, clears undo, and keeps the screens, calibration, curtain and letter flip as they are. The report holds screens, the table's surface, save size, notices and the last 50 problems (main-process problems and page console errors), never the game's contents; it is copied and shown in a pop-up.
  2. The rehearsal follows `docs/REHEARSAL.md`, with a pass line and evidence for each part. Anything that fails is hidden for session 1, not redesigned.
  3. After session 1, in order: scenes, map annotation, library, battle drama, living effects, story tools, generator, later (PLAN.md).
  4. Scenes: a scene keeps a map with its fog, discs, pins, drawings and fight. Scene switching, the per-scene curtain, saved spots and the world map join it.
  5. Map annotation: rooms, walls, doors and materials traced on imported maps. One-tap room reveal, doors, room notes and living effects' materials use it; the generator produces the same annotation.
  6. Merges: monster search and spell lookup become one book search; place by count and size from the stat block join it as "adding monsters"; the map follow-ups become map intake; ruler, shapes with lengths and spell templates become one measure tool; map symbols reuse the token symbols; down marks join conditions, which gain durations and concentration counted on Next turn; the encounter builder and encounter tester are one; item handouts appear once, in story tools; room notes, story tracker and Far Realm tracker move to story tools; weather becomes an optional layer of living effects.
  7. Cuts: automatic line of sight (replaced by a light-radius fog shape; camera tracking stays in Later as the only route to it), the dice roller, the name and loot generators, and the NPC conversation player until it is defined.
- **Why:** the state holds one map, and taking it off drops its fog, discs, pins and drawings (`src/core/table.ts`), so a session with two locations would lose prep. One-tap rooms, doors, room notes and material tags all needed map structure that only the generator would supply, while Morgan's maps come from the book. Automatic line of sight had nothing to see from: it was limited to markers the DM moves (D-007), and players have no discs (D-027). Players roll real dice (D-013). Several items were listed twice across phases. The rehearsal had no pass criteria, and the audit's save rotation and problem report were never built.

## D-038 DM window: the map first, one panel, one word per idea

- **Status:** Accepted (2026-10-29), from the [usability audit](https://claude.ai/artifact/R1TJm1AfCyvqSuktZjiSyD) and the layout interview ([round 1](https://claude.ai/artifact/BLvKT9sMLPEecrEdGC5dKX), [review and final](https://claude.ai/artifact/GwwNfsNY3ssddwUbF5tr98)): "Approved, start building". Supersedes D-031 items 1–3 and D-032 items 1–5; changes D-023 and D-025 (tool names and keys) and D-034 item 3 (how sheets reopen). Built in steps 7h–7j (PRs #27, #28 and the 7j PR).
- **Decision:**
  1. The map fills the DM window beside one panel on the right (Morgan holds the pen in the right hand). The tools stand in a column on the map's left edge, inside the map's frame, so they never cover it. The docked and floating windows, presets and View → Edit layout go. The panel's edge drags to resize it, and its width is remembered; Tab folds it away. The stored layout gets a new key.
  2. The panel has tabs: Setup (table screen, Calibrate, map library, party roster), Explore (the fog buttons, groups with On table / Off table switches) and Fight (the Encounter list in turn order). During a fight a turn strip (round, whose turn, who is next) is pinned above every tab and sheet. Start fight switches to Fight, End fight back to Explore. A thumbnail of the table sits at the top of every tab, and holding it shows it big.
  3. One Encounter list replaces Initiative and Groups. The party shows as a list with HP bars; tapping a name opens the same HP pad as tapping a disc. Sheets open in the panel below the turn strip, with Back, one at a time; the panel reopens the tab and sheet that were open.
  4. Words: the fog tools are Uncover (U) and Dim (G); the whole-map buttons are Dim what's in view, Uncover all and Cover all. Discs are On table / Off table, a switch with the word on it. A group's art button is Show picture. Each idea gets its own icon.
  5. Calibrate and map import use the whole window, with Cancel and Done fixed at the bottom. The empty map shows a checklist: table screen, calibrate, import a map, add the party; each step ticks itself.
  6. Window headers grow to 13–14 px in sentence case. One end-to-end journey runs the DM window at 1280 × 680; the suite stays under 60 s (D-020).
  7. Built after step 7g and before the rehearsal, as three steps (PLAN.md 7h–7j). The rehearsal waits until they are done.
- **Why:** At the laptop's 1280 × 680 the docked windows left the map about 30% of the screen and discs about 18 px across, the tool options were icons with names only in tooltips a pen never shows, and "Reveal" and "Hide" each meant three things. A sheet replacing the list would hide the turn order mid-fight, hence the pinned strip. The rehearsal should test the screen session 1 uses.

## D-039 Scenes before session 1

- **Status:** Accepted (2026-10-29), approved by Morgan in the scenes interview ([round 1](https://claude.ai/artifact/Y3uEnGfJziZzL4rDMKDhHg), [review](https://claude.ai/artifact/FwVL85QKKZwQoRzDg93s8s), [final](https://claude.ai/artifact/Vyme4FqB9tfjD2U6WNhQVR)): "Approved, start building". Changes D-003 (scenes join session 1), D-037 item 3 (scenes move before session 1), D-023 (the curtain per scene), D-034 item 2 (link pins) and D-036 item 5 (saved spots now).
- **Decision:**
  1. A scene holds a library map with its place, turn and lock on the table, fog, discs, groups, pins, drawings, a paused fight, saved spots, its curtain kind and the DM zoom. One library map can be in several scenes. The party, calibrations, Flip letters and the B curtain are shared. Old saves upgrade: the placed map becomes the first scene, named after the map (save version 13).
  2. Switching scenes is one command that also drops the black curtain; it is not undoable. Pings and fading lines end. Each scene keeps its own undo history for the run. A fight stays with its scene, paused; several scenes may each hold one, and the turn strip shows only the current scene's.
  3. The table window may load only the current scene's map and curtain picture; scene names, link targets, other scenes and reset copies never reach it (D-002). The player-view test covers several scenes. B and the Curtain button always mean black; a scene's curtain kind shows only on switching to it.
  4. Step 7k (needed for session 1): scenes keep everything; a Scenes list in Setup (add from a library map, rename, reorder, copy, delete to a Removed list emptied by hand); the current scene's name at the top of the panel switches in one tap; earlier saves count their scenes. When removing library maps arrives (D-036 item 5), a map a scene uses can't be removed. Built in step 7k: waiting scenes reach the DM window without their fog, discs, groups, pins and drawings (`dmStateOf`), and each scene's DM zoom is kept for the run.
  5. Step 7l: curtain kinds black, a chosen picture, or a title (player-facing text shown twice, D-008, separate from the DM-only name); saved spots (drag, Save spot, name; a tap slides the map there on the grid, even when locked); Mark ready and Reset (everything as it was at Mark ready). Saves stay one file: measure write time with 20 scenes on a production build and split only if it is slow. Built in step 7l (save version 14): pictures are kept in `<app data>/library/curtains/`, and the table may load only the picture its curtain shows now. Measured 2026-10-29 in the cloud container (the laptop's speed is not known): 20 used scenes with ready copies made an 8.3 MB save taking about 160 ms, 126 ms of it building the text and 19 ms writing; reusing unchanged scenes' text brought it to about 36 ms, so the save stays one file. An extreme case, 20 scenes each full of long lines: 42.5 MB, about 240 ms.
  6. Step 7m: the world map is a scene with its own fog; link pins open a scene with a Select tap (Ping still removes; link pins start Only me); a party marker the DM drags, which players see and which stays between visits; a World map curtain kind showing the world map's player view.
  7. Later: scenes grouped by adventure (Soon); editing a scene while another is on the table. The rehearsal gains a step: switch scenes with minis on the map. Table size is planned as 24 × 42 squares (a 2 × 3.5 ft board) until the rehearsal measures it.
- **Why:** session 1 uses 2 or 3 places, and today taking a map off loses its fog, discs, pins and drawings. Eight pieces were marked Now; the review staged them so only step 7k holds session 1 back. A two-step switch could flash the next scene, and the table window could load any library map by id, so both close here. A picture under B would project art in a hurry, so B stays black.
