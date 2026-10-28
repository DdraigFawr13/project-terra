# Handoff

Updated: 2026-10-28. A fresh session must be able to continue from this file alone. Keep it to 60 lines; finished entries move to [archive/handoff-2026-10.md](archive/handoff-2026-10.md).

## Phase

Building toward session 1 ([PLAN.md](PLAN.md), steps 1–8). Steps 1–4 are merged; step 5, fog, is built on branch `ccr-9aae693d-a3httu` and awaits Morgan's OK on the PR summary (D-018). All tested in the cloud only. The laptop will be an HP Pavilion x360 14" (1920 × 1080 touch, i5-1035G1); Morgan doesn't have it yet, so projected steps stay "built, awaiting Morgan's check" (VER-07).

## Just done

- 2026-10-28 Step 5, fog (D-025), not yet merged. Morgan asked for touch-friendly tools and a freehand brush; approved the [touch sketch](https://claude.ai/artifact/GKdfQJajEesUen1zUCnFhg).
  - Fog ops in map inches on the placed map (`src/core/fog.ts`, save version 4), one undoable `fog` command per stroke.
  - Drawing: `src/renderer/fog-draw.ts` (masks, patch-only redraw, cheap undo of the last stroke) and `table-draw.ts`, shared by the table and the DM's live preview.
  - DM: 56 px bottom tools, brush ring, ghost while painting, whole-map buttons under the preview (`dm-map.ts`, `dm.ts`).
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

## Next

1. **Step 5 PR**: Morgan gets the summary; on approval open the PR from `ccr-9aae693d-a3httu`, merge when green (D-018). Then restart the branch from main.
2. Then step 6, initiative and markers, and step 7, ping, autosave and curtain (PLAN.md).
- **Book library** (separate thread, D-010 changed 2026-10-28). In private repo `project-terra-library`: Phandelver and Below and PHB 2024 as Markdown (PHB lacks subclass features). MM and DMG PDFs come from Drive `_AI_Directories` via drive.usercontent.google.com: MM is a scan with an error-filled OCR layer, DMG is images only. Round 1 answered (form under Planning pages, collection `books1`): next is round 2 or a review page, then extraction. Never use 5e.tools. Book data never enters this public repo.
3. When Morgan has a Windows laptop: run "Build Windows app", then the README checks in order: two windows, calibration with a ruler, map import with the Thundertree photo, then the projector photo. Confirm the built-in screen says "this laptop" (`Display.internal`) and the display scale: a 14" 1080p screen usually defaults to 150%, leaving the DM window about 1280 × 680 (checked in screenshots: the step 5 layout fits). Try fog with a finger.

## Open questions

- Windows SmartScreen warns on the unsigned app ("More info" → "Run anyway"). Recommended: accept for now; code signing costs money.
- Morgan still has to find and set up the projector.
- CI logs warn that the pinned `actions/checkout` and `actions/setup-node` target Node.js 20, which GitHub is retiring. Bump both with the `efficient-github-actions` skill when convenient.

## How to work here

- Read AGENTS.md, then this file, then the DECISIONS index and LESSONS. Local checks: `npm run check` and `xvfb-run -a npm run test:e2e`.
- PRs: summary to Morgan first; after approval, open the PR and squash-merge when green (D-018). After a merge, restart the working branch from main by merging main into it (force-push is blocked in cloud sessions).
- Morgan reads on a phone: short messages, links and taps. Show UI work as screenshots; for design choices, use phone forms (`planning-interview` skill) or a short chat proposal with a recommendation.
- Mockup and screenshot scripts lived in the session scratchpad and are gone; regenerate with Playwright as needed (`_electron.launch`, `xvfb-run`).

## Planning pages (Morgan's answers are saved in each)

- Plan: [round 1](https://claude.ai/artifact/KbAFZXKteAj4mrahwNW2S3), [review](https://claude.ai/artifact/Abqb6FvUU9G1tq3KUYyhBG), [round 2](https://claude.ai/artifact/Y1ync7v4p39K8rmimHFXsb), [round 3](https://claude.ai/artifact/5KrYHjTNJAUPdLi7ppmTdq), [final](https://claude.ai/artifact/VeuLsTvhYKxm3C6d6rVZ5e)
- Book library: [round 1](https://claude.ai/artifact/FUAenSA2tNkCqRnp62DZ2v)
- UI design: [round 1](https://claude.ai/artifact/CXKec4y4K2JBqv6gAC8eyx), [round 2](https://claude.ai/artifact/8dnwH7FRSRMLrYBkuHCtW2), [final](https://claude.ai/artifact/VUP3qZFNYp2gZTPbXch4Re)

## Decisions since the last plan update

- 2026-10-28 D-018 PR workflow; D-019 the repo carries everything; D-020 test upkeep.
- 2026-10-28 D-010 changed: book data goes in the private repo `project-terra-library`, never in this public repo.
- 2026-10-28 D-021 calibration; D-022 UI design step; D-023 UI design; D-024 map import, undo, library; D-025 fog.
