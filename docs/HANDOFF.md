# Handoff

Updated: 2026-10-28. A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Building toward session 1 ([PLAN.md](PLAN.md), steps 1–8). Steps 1 (two windows) and 2 (calibration, [PR #3](https://github.com/DdraigFawr13/project-terra/pull/3)) are merged; the plan change is [PR #4](https://github.com/DdraigFawr13/project-terra/pull/4) and tested in the cloud. Neither has run on Windows: Morgan can't test on a Windows computer for now (2026-10-28), so steps stay "built, awaiting Morgan's check" (VER-07). Next is step 3, UI design (D-022), then step 4, map import.

## Just done

- 2026-10-28 Planning finished and approved: D-001 to D-017.
- 2026-10-28 Repo set up with AI-Master-Instructions v0.3.0 (core, node-web, game), plus a project-owned copy of the `planning-interview` skill (D-019).
- 2026-10-28 Step 1 ([PR #1](https://github.com/DdraigFawr13/project-terra/pull/1)): Electron app with a DM window and a table window.
  - The table window goes fullscreen only on a screen other than the laptop's.
  - It has a test grid and a curtain, and the DM picks its screen.
  - Saving survives a restart, and an unreadable save is kept aside.
  - Unit and end-to-end tests pass locally and in CI. A Windows zip builds on Linux.
- 2026-10-28 Morgan set the PR workflow: summary first, then open and merge when green (D-018).
- 2026-10-28 Audit ([AUDIT-2026-10-28.md](AUDIT-2026-10-28.md)): the table window now has its own read-only bridge and gets only `playerViewOf(state)`; windows can't navigate (a dropped file was being opened); an e2e race fixed. Morgan approved: D-020 test upkeep accepted; Electron fuses on; knip in `npm run check`; fast-check for property tests.
- 2026-10-28 Step 2, calibration ([PR #3](https://github.com/DdraigFawr13/project-terra/pull/3), merged):
  - Corner-pin warp: the DM drags four corners (or nudges by one physical pixel) until they sit on a measured rectangle. The table draws in inches on one layer, warped by CSS `matrix3d` (D-021, proposed).
  - One calibration per projector, plus one for the laptop's table window. Save version 2; version 1 saves upgrade.
  - Audit P1 items 1, 2, 5 done: the laptop is the built-in screen (`Display.internal`, unverified on Windows), the DM window opens on it, and an unreadable save shows a notice in the DM window.
  - Fixed a flaky unit test: a display id of -0 didn't survive a save (LESSONS).
  - Tests: 15 unit (0.2 s), 2 e2e journeys (3.1 s). Screenshots of both windows checked. Walkthrough with a simulated mat: https://claude.ai/artifact/Dk2LB8FkDL3Jaj7JExoqfY. After it: corner marks drawn unwarped (constant size, crosshair) and a "Calibrating" status.

## Next

0. **Step 3: UI design** (D-022). Round 1 answered (collection `uiround1`): decide everything from mockups; dark, clean tool with a light fantasy touch, balanced density, shortcuts alongside buttons, mouse and touch; table: plain bold lettering, minimal strip, strong colours; likes Foundry, Owlbear Rodeo, Dungeon Alchemist, BG3. Round 2 (mockups, collection `uiround2`) is out. When Morgan says "UI round 2 done", read it, then the final check page, then record decisions. Mockup sources: scratchpad `ui2/` (lost with the container; regenerate if needed).
1. **Step 4: map import** (PLAN.md step 4, D-009, D-010). Design first: decide the state model (audit P1 item 4: commands with `apply(state, command)` in `src/core/`, giving undo and a determinism test), and where the personal library lives on the laptop. Draw maps on the table layer in inches (D-021). Testable in the cloud with a sample SRD or self-made image; never commit book maps.
2. When Morgan has a Windows laptop: the 5-minute step 1 test (README "Try it on Windows"), then calibration with a ruler on the laptop screen, then the projector photo. Check `Display.internal` on that laptop (the built-in screen must say "this laptop" in the screen list).
3. Steps 3–6 can be built and tested without Windows; their projected proof waits for Morgan's photos.
## Open questions

- Windows SmartScreen warns on the unsigned app ("More info" → "Run anyway"). Recommended: accept for now; code signing costs money.
- Morgan still has to find and set up the projector, and has no Windows computer to test on for now.
- CI logs warn that `actions/checkout` and `actions/setup-node` at the pinned versions target Node.js 20, which GitHub is retiring. They still run. Bump both pins to Node 24 versions when convenient, using the `efficient-github-actions` skill.

## How to work here

- Read AGENTS.md first. Local checks: `npm run check` and `xvfb-run -a npm run test:e2e`.
- Electron 44 downloads its binary on first run, not at `npm install`.
- PRs: summary to Morgan first; after approval, open the PR and squash-merge when green (D-018).
- Morgan reads on a phone. Give links and taps, and short messages: what changed, what to test.

## Planning pages (Morgan's answers are saved in each)

- UI design round 1: https://claude.ai/artifact/CXKec4y4K2JBqv6gAC8eyx
- UI design round 2: https://claude.ai/artifact/8dnwH7FRSRMLrYBkuHCtW2

- Round 1: https://claude.ai/artifact/KbAFZXKteAj4mrahwNW2S3
- Review: https://claude.ai/artifact/Abqb6FvUU9G1tq3KUYyhBG
- Round 2: https://claude.ai/artifact/Y1ync7v4p39K8rmimHFXsb
- Round 3: https://claude.ai/artifact/5KrYHjTNJAUPdLi7ppmTdq
- Final check: https://claude.ai/artifact/VeuLsTvhYKxm3C6d6rVZ5e

## Decisions since the last plan update

- 2026-10-28 D-018 PR workflow; D-019 the repo carries everything a session needs.
- 2026-10-28 D-020 test upkeep at the end of each step (accepted).
- 2026-10-28 D-021 calibration storage and warp (accepted); D-022 UI design becomes step 3.
