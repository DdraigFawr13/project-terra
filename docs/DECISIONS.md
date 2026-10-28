# Decisions

Settled rules for this project. Not a changelog: an entry stays while the rule is in force. Change a rule here in the same change that changes the behaviour. Mark ideas Proposed until the owner approves them; mark retired entries SUPERSEDED with a pointer, never delete them.

All entries up to D-017 were approved by Morgan in the planning forms on 2026-10-27/28 (links in HANDOFF.md).

## D-001 A Windows desktop app built with Electron and TypeScript

- **Status:** Accepted (2026-10-28)
- **Decision:** Project Terra is an Electron app written in TypeScript. Morgan starts it by double-clicking a program on a Windows laptop. It works offline and uses no paid services. Map drawing moves to WebGL (PixiJS) when maps arrive; step 1 draws its test grid with Canvas 2D.
- **Why:** Morgan wanted a program to double-click, offline, with a budget under 50 one-off. Electron handles two screens and offline use well, and agents build with it reliably.

## D-002 Two windows: the table shows only the player view

- **Status:** Accepted (2026-10-28)
- **Decision:** The DM window runs on the laptop screen. A separate table window goes fullscreen on the projector and only ever receives what players may see. On the laptop's own screen the table window stays a normal window, so it never covers the DM window.
- **Why:** with one mirrored screen, fog can't hide anything and DM notes or enemy HP would be projected. Morgan kept the separate window in round 2.

## D-003 Session 1 scope

- **Status:** Accepted (2026-10-28)
- **Decision:** Session 1 needs two windows, calibration, map import, a square grid, manual fog, an initiative tracker with simple markers, ping, autosave and the curtain. Everything else waits until after session 1 (PLAN.md).
- **Why:** 22 features were ranked "Now" against 1–3 months with games monthly or less. Both reviews flagged it, and Morgan cut the list in the review.

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

- **Status:** Accepted (2026-10-28)
- **Decision:** Fog is revealed with a brush and shapes, and by room where the map defines rooms. Explored areas stay dimmed. Automatic line of sight comes after session 1, and only for markers Morgan moves on the laptop.
- **Why:** the app can't see physical minis, so automatic fog would mean mirroring every move on the laptop.

## D-008 Player-facing text faces both long sides

- **Status:** Accepted (2026-10-28)
- **Decision:** Any text on the table (turn order, cards, subtitles, labels) appears twice, once facing each long side.
- **Why:** players sit on two opposite sides, so single text is upside down for half the table.

## D-009 Maps come from images and photos

- **Status:** Accepted (2026-10-28)
- **Decision:** Maps are imported from images or photos; Morgan marks one square to set the scale. Morgan can send photos of hand-drawn or book maps to Claude during prep for a clean version. The generator comes after session 1.
- **Why:** Morgan has no Dungeondraft and draws on a mix of grid and plain paper. Book maps often have no grid or an odd scale.

## D-010 The personal library stays on the laptop

- **Status:** Accepted (2026-10-28)
- **Decision:** Monsters and maps from Morgan's own books (bought on D&D Beyond and in print) go into a personal library in the app's data folder on the laptop. They never go in the repo or in a shared build. Monsters come in by pasting a stat block or typing into a form. Only SRD 5.2 content ships with the app, with its CC-BY-4.0 attribution.
- **Why:** Morgan owns the books for personal use; that content isn't licensed for redistribution. Morgan might share the app someday.

## D-011 Map art: projector-tuned pencil

- **Status:** Accepted (2026-10-28)
- **Decision:** The first generated style is pencil, with firm dark walls and pencil texture for details, plus a contrast slider. The final call comes after the first test on the table.
- **Why:** Morgan chose pencil but worried it would be too faint when projected.

## D-012 DM screen layout

- **Status:** Accepted (2026-10-28)
- **Decision:** Side panels: initiative and markers on the left, the map in the middle, and on the right a live table preview above the notes. Tools run along the bottom.
- **Why:** Morgan liked side panels most and also wanted to always see what the table shows.

## D-013 Initiative and enemies in session 1

- **Status:** Accepted (2026-10-28)
- **Decision:** Enemies in session 1 are coloured discs with a letter; Morgan tracks HP on paper. The turn strip shows turn order, whose turn it is, and enemy condition in words (bloodied, near death), never enemy names. Players roll physical dice.
- **Why:** it keeps session 1 small. Full tokens with HP come in the battle drama phase.

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

- **Status:** Accepted (2026-10-28)
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
