# Handoff

Updated: 2026-10-28. A fresh session must be able to continue from this file alone. Keep it to 60 lines; finished entries move to [archive/handoff-2026-10.md](archive/handoff-2026-10.md).

## Phase

Building toward session 1 ([PLAN.md](PLAN.md), steps 1–8). Steps 1–5 are merged. Step 6 (initiative, markers, character cards) is built on branch `ccr-4ba1a9a6-bt257p` and waits for Morgan's OK on the PR summary (D-018). All tested in the cloud only. The laptop will be an HP Pavilion x360 14" (1920 × 1080 touch, i5-1035G1); Morgan doesn't have it yet, so projected steps stay "built, awaiting Morgan's check" (VER-07).

## Just done

- 2026-10-28 Step 6, D-027 then redone per D-028 after Morgan's review:
  - Core: `src/core/fight.ts` (discs, groups with AC/HP max/notes, HP per disc, condition from HP, initiative, strip, cards with temp HP and passives), `src/core/creatures.ts` (library stat blocks). Save version 6.
  - Main: `src/main/creatures.ts` stores imported library files in `<userData>/library/creatures/`; DM bridge only.
  - DM: floating windows (`float-win.ts`), number pad (`numpad.ts`), `dm-party.ts`, `dm-monsters.ts` (HP, Edit, Book), left panel `dm-fight.ts`. Undo keeps cards and drops rolls of removed characters.
  - Tests: 30 unit, 4 e2e (about 13 s). Real `mm2024.json` imports: 503 read, 6 checked.
- 2026-10-28 Step 5, fog ([PR #8](https://github.com/DdraigFawr13/project-terra/pull/8)), D-025. Earlier steps: [archive](archive/handoff-2026-10.md).

## Next

1. Step 6 redo per D-028 is built and reviewed; [walkthrough v2](https://claude.ai/artifact/1Fu4eCAzLnKStCU5YwNLwc) sent 2026-10-28. Waiting for Morgan's "go", then open the PR and merge when green (D-018).
2. Then step 7, ping, autosave and curtain (PLAN.md).
- **Book library** (separate thread; D-010, D-026). Data track done 2026-10-28 in private repo `project-terra-library` (attach with add_repo; its README lists every file and how it was checked): 503 MM creatures, 35 Phandelver creatures, 391 PHB spells, 39 DMG treasure tables, 17 Phandelver magic items with placements, MM habitat lists, Lost Mine maps. Only the 6 Thundertree creatures are `pageChecked`. Next: the app's library import (first phase after session 1), then a portrait test before cropping art; DMG traps, hazards, weather and other magic items after session 1. The MM and DMG PDFs lived only in the old container: to re-read pages, Morgan sets Drive `_AI_Directories` files to link sharing, then download via drive.usercontent.google.com (MM id 1lAzOxqwZfoT_STKHNaUQpcshncj_2z7v, DMG id 18XP8iND9a59QWK9Tc3US0KyyPIw-guLg; both domains are allowed in the environment). Never use 5e.tools.
- **Map scale** (for step 4 follow-up): Thundertree is 1 square = 10 ft (28 × 19 squares = 56 × 38 in at 5 ft per inch); Cragmaw Hideout, Redbrand Hideout and Cragmaw Castle are 5 ft. Import (D-024) makes one picture square 1 inch, so it needs a feet-per-square choice. A map bigger than the projected area needs panning or sections (Morgan to measure the table). Where only a keyed DM map exists, Morgan covers the area numbers and legend with hide shapes.
3. When Morgan has a Windows laptop: run "Build Windows app", then the README checks in order: two windows, calibration with a ruler, map import with the Thundertree photo, then the projector photo. Confirm the built-in screen says "this laptop" (`Display.internal`) and the display scale: a 14" 1080p screen usually defaults to 150%, leaving the DM window about 1280 × 680 (checked in screenshots: the step 5 layout fits). Try fog and discs with a finger and the pen; enter the party and run a mock round.

## Open questions

- Button size: Morgan thinks buttons could be a little smaller (2026-10-28), but wants to decide after trying the laptop. Keep D-023's 40 px / 56 px until then.
- Windows SmartScreen warns on the unsigned app ("More info" → "Run anyway"). Recommended: accept for now; code signing costs money.
- Morgan expects the Windows laptop and projector the week of 2026-11-02 (said 2026-10-28), and will measure the projected table area.
- Library loose ends: 4 files damaged in Morgan's map zip (listed in `maps/lmop/README.md`); Wave Echo Cave scale unchecked; Flesh Meld and Nellik DCs don't fit their stats (adventure Markdown only, no page to check); wall spells have no template area; spell class lists include Artificer from the source file.
- CI logs warn that the pinned `actions/checkout` and `actions/setup-node` target Node.js 20, which GitHub is retiring. Bump both with the `efficient-github-actions` skill when convenient.

## How to work here

- Read AGENTS.md, then this file, then the DECISIONS index and LESSONS. Local checks: `npm run check` and `xvfb-run -a npm run test:e2e`.
- PRs: summary to Morgan first; after approval, open the PR and squash-merge when green (D-018). After a merge, restart the working branch from main by merging main into it (force-push is blocked in cloud sessions).
- Morgan reads on a phone: short messages, links and taps. Show UI work as screenshots; for design choices, use phone forms (`planning-interview` skill) or a short chat proposal with a recommendation.
- Mockup and screenshot scripts lived in the session scratchpad and are gone; regenerate with Playwright as needed (`_electron.launch`, `xvfb-run`).

## Planning pages (Morgan's answers are saved in each)

- Plan: [round 1](https://claude.ai/artifact/KbAFZXKteAj4mrahwNW2S3), [review](https://claude.ai/artifact/Abqb6FvUU9G1tq3KUYyhBG), [round 2](https://claude.ai/artifact/Y1ync7v4p39K8rmimHFXsb), [round 3](https://claude.ai/artifact/5KrYHjTNJAUPdLi7ppmTdq), [final](https://claude.ai/artifact/VeuLsTvhYKxm3C6d6rVZ5e)
- Book library: [round 1](https://claude.ai/artifact/FUAenSA2tNkCqRnp62DZ2v), [round 2](https://claude.ai/artifact/FJbNz8xutdeTdynbCB6gQT), [final](https://claude.ai/artifact/DtmiYuaqWcob54HQt5rjpB)
- UI design: [round 1](https://claude.ai/artifact/CXKec4y4K2JBqv6gAC8eyx), [round 2](https://claude.ai/artifact/8dnwH7FRSRMLrYBkuHCtW2), [final](https://claude.ai/artifact/VUP3qZFNYp2gZTPbXch4Re)

## Decisions since the last plan update

- 2026-10-28 D-018 PR workflow; D-019 the repo carries everything; D-020 test upkeep.
- 2026-10-28 D-010 changed: book data goes in the private repo `project-terra-library`, never in this public repo.
- 2026-10-28 D-021 calibration; D-022 UI design step; D-023 UI design; D-024 map import, undo, library; D-025 fog.
- 2026-10-28 D-026 book library; D-003 adds character cards, no fixed date; D-013 HP on discs after session 1.
- 2026-10-28 D-027 initiative, markers and character cards.
