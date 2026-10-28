# Agent instructions

Project Terra is a projected tabletop battle map for Morgan's in-person D&D 5e (2024) games. A Windows laptop runs it: Morgan controls it from the laptop screen, and a projector shows the player view on the table, where players move physical minis.

Shared rules come from AI-Master-Instructions and load through CLAUDE.md (`.claude/master/RULES.md`). This file holds only what is specific to this project. Keep it under 80 lines.

## Read first

1. `docs/HANDOFF.md`: current state and next step.
2. `docs/DECISIONS.md`: settled rules. Don't reopen them.
3. `docs/LESSONS.md`: entries for the area you are about to work in.
4. `docs/PLAN.md`: the approved plan. Open the section for the current step.

## Code layout

- `src/core/`: pure logic (no Electron, no DOM, no clock, no `Math.random`), unit tested next to the code (`*.test.ts`).
- `src/main/`: Electron main process and the preload bridge, the only way pages reach the main process.
- `src/renderer/`: the DM window (`dm.*`) and the table window (`player.*`).
- `e2e/`: end-to-end tests that launch the real app with Playwright.

## Local checks (run before pushing)

- Every push: `npm run check` (format, typecheck, unit tests).
- App changes: `xvfb-run -a npm run test:e2e` (builds, then drives both windows).
- UI changes: look at a screenshot of both windows before calling it done (VER-06).

## What CI runs

- **CI** (`ci.yml`): `npm run check`, the sync drift check and the end-to-end tests on every PR update and main push. Markdown-only changes skip it.
- **Build Windows app** (`build-windows.yml`): manual only. Produces the zip Morgan tests on the laptop. Run it when a step is ready for Morgan to try, not on every change (CI-04).

## Project rules

- The table window gets only what players may see. DM-only data (hidden items, notes, enemy HP) never crosses into the table window's renderer. Why: anything sent there can end up projected (D-002).
- Content from Morgan's own books (stat blocks, adventure maps) stays in the personal library on the laptop and is never committed. Only SRD 5.2 content ships, with attribution (D-010).
- Store positions and sizes in inches. The grid is drawn on top, so hex and gridless can come later (D-005).
- Player-facing text appears twice, once facing each long side of the table (D-008).
- Anything projected counts as working only with Morgan's photo of the table (VER-07, D-016).
- Saves carry a version, and an unreadable save is kept aside, never overwritten (GAME-05).

## Overrides

Master rules this project deliberately changes. Each line names the rule id and the reason; the same entry is in `.ai-master.json` "overrides".

- None.
