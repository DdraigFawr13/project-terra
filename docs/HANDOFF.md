# Handoff

Updated: 2026-10-28. A fresh session must be able to continue from this file alone. Keep it to 60 lines; move finished entries to `docs/archive/handoff-YYYY-MM.md`.

## Phase

Building toward session 1 ([PLAN.md](PLAN.md), steps 1–7). Step 1, two windows, is merged. It has not yet been run on Windows. Next is step 2, calibration.

## Just done

- 2026-10-28 Planning finished and approved: D-001 to D-017.
- 2026-10-28 Repo set up with AI-Master-Instructions v0.3.0 (core, node-web, game), plus a project-owned copy of the `planning-interview` skill (D-019).
- 2026-10-28 Step 1 ([PR #1](https://github.com/DdraigFawr13/project-terra/pull/1)): Electron app with a DM window and a table window.
  - The table window goes fullscreen only on a screen other than the laptop's.
  - It has a test grid and a curtain, and the DM picks its screen.
  - Saving survives a restart, and an unreadable save is kept aside.
  - Unit and end-to-end tests pass locally and in CI. A Windows zip builds on Linux.
- 2026-10-28 Morgan set the PR workflow: summary first, then open and merge when green (D-018).

## Next

1. **Step 2: calibration** (PLAN.md step 2, D-004). Morgan's projector sits angled from a shelf.
   - Corner-pin (homography) warp of the table view: Morgan drags four corners until a projected square matches a ruler.
   - Store the result per display, with a version (GAME-05).
   - Make it redoable in under a minute.
   - Account for Windows display scaling: measure in physical pixels, not CSS pixels.
   - Keep the warp maths in `src/core/` with unit tests.
   - It must be testable without the projector: calibrate against a ruler held to the laptop screen.
2. Before step 4, Morgan does the 5-minute laptop test of step 1. See README "Try it on Windows": run the "Build Windows app" workflow, unzip, double-click, Win+P → Extend.
3. Steps 3–5 can be tested on the laptop alone. Calibration needs the projector for its final proof (a photo of a ruler on the grid).

## Open questions

- Windows SmartScreen warns on the unsigned app ("More info" → "Run anyway"). Recommended: accept for now; code signing costs money.
- Morgan still has to find and set up the projector.
- CI logs warn that `actions/checkout` and `actions/setup-node` at the pinned versions target Node.js 20, which GitHub is retiring. They still run. Bump both pins to Node 24 versions when convenient, using the `efficient-github-actions` skill.

## How to work here

- Read AGENTS.md first. Local checks: `npm run check` and `xvfb-run -a npm run test:e2e`.
- Electron 44 downloads its binary on first run, not at `npm install`.
- PRs: summary to Morgan first; after approval, open the PR and squash-merge when green (D-018).
- Morgan reads on a phone. Give links and taps, and short messages: what changed, what to test.

## Planning pages (Morgan's answers are saved in each)

- Round 1: https://claude.ai/artifact/KbAFZXKteAj4mrahwNW2S3
- Review: https://claude.ai/artifact/Abqb6FvUU9G1tq3KUYyhBG
- Round 2: https://claude.ai/artifact/Y1ync7v4p39K8rmimHFXsb
- Round 3: https://claude.ai/artifact/5KrYHjTNJAUPdLi7ppmTdq
- Final check: https://claude.ai/artifact/VeuLsTvhYKxm3C6d6rVZ5e

## Decisions since the last plan update

- 2026-10-28 D-018 PR workflow; D-019 the repo carries everything a session needs.
