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

