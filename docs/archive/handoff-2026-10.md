# Handoff archive, 2026-10

Finished entries moved out of HANDOFF.md (CTX-02). Newest last.

## Just done (archived 2026-10-28)

- 2026-10-28 Planning finished and approved: D-001 to D-017.
- 2026-10-28 Repo set up with AI-Master-Instructions v0.3.0 (core, node-web, game), plus a project-owned copy of the `planning-interview` skill (D-019).
- 2026-10-28 Step 1 ([PR #1](https://github.com/DdraigFawr13/project-terra/pull/1)): Electron app with a DM window and a table window.
  - The table window goes fullscreen only on a screen other than the laptop's.
  - It has a test grid and a curtain, and the DM picks its screen.
  - Saving survives a restart, and an unreadable save is kept aside.
  - Unit and end-to-end tests pass locally and in CI. A Windows zip builds on Linux.
- 2026-10-28 Audit ([AUDIT-2026-10-28.md](AUDIT-2026-10-28.md)): the table window now has its own read-only bridge and gets only `playerViewOf(state)`; windows can't navigate (a dropped file was being opened); an e2e race fixed. Morgan approved: D-020 test upkeep accepted; Electron fuses on; knip in `npm run check`; fast-check for property tests.
- 2026-10-28 Step 2, calibration ([PR #3](https://github.com/DdraigFawr13/project-terra/pull/3), merged):
  - Corner-pin warp: the DM drags four corners (or nudges by one physical pixel) until they sit on a measured rectangle. The table draws in inches on one layer, warped by CSS `matrix3d` (D-021, proposed).
  - One calibration per projector, plus one for the laptop's table window. Save version 2; version 1 saves upgrade.
  - Audit P1 items 1, 2, 5 done: the laptop is the built-in screen (`Display.internal`, unverified on Windows), the DM window opens on it, and an unreadable save shows a notice in the DM window.
  - Fixed a flaky unit test: a display id of -0 didn't survive a save (LESSONS).
  - Tests: 15 unit (0.2 s), 2 e2e journeys (3.1 s). Screenshots of both windows checked. Walkthrough with a simulated mat: https://claude.ai/artifact/Dk2LB8FkDL3Jaj7JExoqfY. After it: corner marks drawn unwarped (constant size, crosshair) and a "Calibrating" status.

## Moved from HANDOFF on 2026-10-28 (step 6)

- 2026-10-28 Step 5, fog (D-025), not yet merged. Morgan asked for touch-friendly tools and a freehand brush; approved the [touch sketch](https://claude.ai/artifact/GKdfQJajEesUen1zUCnFhg).
  - Fog ops in map inches on the placed map (`src/core/fog.ts`, save version 4), one undoable `fog` command per stroke.
  - Drawing: `src/renderer/fog-draw.ts` (masks, patch-only redraw, cheap undo of the last stroke) and `table-draw.ts`, shared by the table and the DM's live preview.
  - DM: 56 px bottom tools, brush ring, ghost while painting, whole-map buttons under the preview (`dm-map.ts`, `dm.ts`). Morgan uses a stylus: palm touches are ignored while the pen draws (e2e-tested with simulated pen and touch), pen hover shows the ring, and the eraser hides (untested: needs a real pen).
  - `terra-map://` now sends CORS headers so canvases with a map stay readable (the e2e test checks pixels).
  - Tests: 23 unit (0.3 s), 3 e2e journeys (about 6 s). Speed: see D-025 item 7.
- 2026-10-28 Step 2, calibration ([PR #3](https://github.com/DdraigFawr13/project-terra/pull/3)): corner-pin warp, one calibration per screen (D-021). [Walkthrough](https://claude.ai/artifact/Dk2LB8FkDL3Jaj7JExoqfY).
- 2026-10-28 Step 3, UI design ([PR #4](https://github.com/DdraigFawr13/project-terra/pull/4), [PR #5](https://github.com/DdraigFawr13/project-terra/pull/5)): interview with mockups; Ember look, Classic layout, folding panels, B and Tab keys (D-022, D-023).
- 2026-10-28 Step 4, map import ([PR #7](https://github.com/DdraigFawr13/project-terra/pull/7)), D-024:
  - Four-corner straightening of pictures and phone photos (`src/core/map.ts`); squashed far edges are left out.
  - Every state change is a `Command` through `apply` in `src/core/table.ts` (save version 3). Map commands undo with Ctrl+Z; history lasts the session.
  - Personal library at `<userData>/library/maps` (PNG + JSON), served only through `terra-map://<id>/` (`src/main/library.ts`).
  - DM import and map views in `src/renderer/dm-map.ts`; the table draws the map on the calibrated inch layer.
  - Tests: 21 unit (0.4 s), 3 e2e journeys (about 6 s).
- 2026-10-28 Windows install test on Morgan's PC (Node 24.22.1, npm 11.19.1), fresh clone of step 5: `npm ci`, unit and e2e tests pass; `dist:win` builds and the packaged exe opens both windows. Fixed in [PR #13](https://github.com/DdraigFawr13/project-terra/pull/13):
  - `npm run check` failed on all 35 files: git's `core.autocrlf=true` checked out CRLF. `.gitattributes` now forces LF (LESSONS).
  - Electron 44.6.0 → 44.10.0 (GHSA-jr5w-w6x2-84p9, high); `npm audit` clean.
  - `actions/checkout` v7.0.1, `setup-node` v7.1.0, `upload-artifact` v7.0.2 (Node 24 runtime).
  - Still open on the PC: Node 24 instead of the pinned 22.22.0 (WEB-01). Works with an EBADENGINE warning.
- 2026-10-28 Step 6 ([PR #12](https://github.com/DdraigFawr13/project-terra/pull/12)), D-027 then redone per D-028 after Morgan's review:
  - Core: `src/core/fight.ts` (discs, groups with AC/HP max/notes, HP per disc, condition from HP, initiative, strip, cards with temp HP and passives), `src/core/creatures.ts` (library stat blocks). Save version 6.
  - Main: `src/main/creatures.ts` stores imported library files in `<userData>/library/creatures/`; DM bridge only.
  - DM: floating windows (`float-win.ts`), number pad (`numpad.ts`), `dm-party.ts`, `dm-monsters.ts` (HP, Edit, Book), left panel `dm-fight.ts`. Undo keeps cards and drops rolls of removed characters.
  - Tests: 30 unit, 4 e2e (about 13 s). Real `mm2024.json` imports: 503 read, 6 checked.
