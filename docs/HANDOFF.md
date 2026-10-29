# Handoff

Updated: 2026-10-29. A fresh session must be able to continue from this file alone. Keep it to 60 lines; finished entries move to [archive/handoff-2026-10.md](archive/handoff-2026-10.md).

## Phase

Building toward session 1 ([PLAN.md](PLAN.md), steps 1–8). Steps 1–6 are merged, plus hardening (D-029), zoom (D-030), movable windows (D-031), the DM window redesign (D-032, [PR #16](https://github.com/DdraigFawr13/project-terra/pull/16)) the colour round (D-033, [PR #17](https://github.com/DdraigFawr13/project-terra/pull/17)), step 7 (D-034, [PR #18](https://github.com/DdraigFawr13/project-terra/pull/18)) and freehand drawing (D-035, [PR #19](https://github.com/DdraigFawr13/project-terra/pull/19)). Maps and monster tokens approved (D-036): steps 7c–7f before the rehearsal. Tested in the cloud, plus one install test on Morgan's Windows PC (not the laptop, no projector). The laptop will be an HP Pavilion x360 14" (1920 × 1080 touch, i5-1035G1); Morgan doesn't have it yet, so projected steps stay "built, awaiting Morgan's check" (VER-07).

## Just done

- 2026-10-29 Step 7f part 1 (D-036), branch `ccr-1ad8ad88-kn9v60`, not yet in a PR: 14 creature-type symbols drawn in code (`src/renderer/symbols.ts`); `GroupInfo.symbol` and `.revealed` (Reveal button in the monster window; Book linking sets the symbol from the stat block's type, `creatureTypeOf`); `Disc.mini` (Mini on it in the HP pad, command `discMini`); `PlayerDisc.symbol` only after Reveal, never the name; `drawDisc` draws the token, letter on a badge or on a tab below when a mini is on it. Save version 11. Part 2: portraits (per-group switch at 1 inch, portrait from 2 inches) once the art is cropped.
- 2026-10-29 Steps 7d (HP ring) and 7e (patch tool: `src/core/patch.ts`, `dm-patch.ts`, `<id>.table.png`, the table window's own session serving only `tableMapFile`), merged in [PR #21](https://github.com/DdraigFawr13/project-terra/pull/21).
- 2026-10-29 Step 7c (D-036), merged in [PR #20](https://github.com/DdraigFawr13/project-terra/pull/20): import asks 5 or 10 ft a square (`feetPerSquare` on `PlacedMap` and the library JSON, save version 10, older maps read as 5 ft); the map title and library button name 10-ft maps; a 3× magnifier beside the corner being dragged. Tests: 42 unit, 4 e2e (about 13 s).
- 2026-10-29 Maps and tokens planning: rounds 1 and 2 answered; final page approved 2026-10-29 (D-036, PLAN steps 7c–7f). Morgan wants all of it ("We can do it all"): before session 1 feet per square, corner magnifier, HP ring, patch tool, revealed tokens (badge inside the ring, tab below when a mini stands on it; reveal per group); after session 1 snapping, PDF import (pdf.js approved), library maps, map tidy-up (Removed list, groups by adventure). Agreed: size counts in feet on the map's scale, patched maps get a table-only copy, a narrow exception for revealed pictures on the table, down marks change D-027. Asked for creature-type symbols where portraits are too small (mock-up on the final page).
- 2026-10-28 Freehand drawing (D-035), merged in PR #19: Draw tool (D) with who sees, lasting or fading and three colours; lasting lines on the map (`draw`/`removeDrawing`/`clearDrawings`, undoable, save version 9, players' lines only in the player view); fading lines over IPC `table:sketch` → `player:sketch`, drawn on the `#pings` canvas; tap or pen eraser rubs out; Table → Clear drawings.
- 2026-10-28 Step 7 (D-034), merged in PR #18: Ping tool (P; tap pings, hold pins, tap a pin removes it), pings over IPC `table:ping` → `player:ping` drawn on their own warped canvas (`#pings`, `drawPing`), pins on the map (`placePin`/`removePin`/`clearPins`, undoable, save version 8, table pins only in the player view), Table → Clear pins, sheets reopen (`dock.wasOpen`/`forget`), Remove asks first, thinner turn strip, test grid off on placing a map. Fixed a bug from the redesign: with Table setup closed, every state change threw in `renderState` and the table preview stopped updating (LESSONS); the fight journey now fails on any DM page error.
- 2026-10-28 Windows install fixes ([PR #13](https://github.com/DdraigFawr13/project-terra/pull/13)), step 6 ([PR #12](https://github.com/DdraigFawr13/project-terra/pull/12)), step 5 fog ([PR #8](https://github.com/DdraigFawr13/project-terra/pull/8)) and earlier: [archive](archive/handoff-2026-10.md).

## Next

1. Step 7f part 1 built: summary and walkthrough to Morgan, then PR (D-018). Then 7f part 2, portraits (1-inch tokens: symbol by default, portrait per group if Morgan switches it). For 7f art: Morgan sets the MM PDF's Drive file to link sharing; Claude crops the six checked creatures into the private library. Then step 8, rehearsal (needs the laptop and projector). Morgan tests from step 7: close the app mid-fight and reopen it; ping, pins and lines on the projector. Still open from the audit: calibration is keyed to the Windows display id (check with the real projector); unplugging the projector drops the table window over the DM window; no Windows CI run of the app.
- **Book library** (separate thread; D-010, D-026). Data track done 2026-10-28 in private repo `project-terra-library` (attach with add_repo; its README lists every file and how it was checked): 503 MM creatures, 35 Phandelver creatures, 391 PHB spells, 39 DMG treasure tables, 17 Phandelver magic items with placements, MM habitat lists, Lost Mine maps. Only the 6 Thundertree creatures are `pageChecked`. Next: the app's library import (first phase after session 1), then a portrait test before cropping art; DMG traps, hazards, weather and other magic items after session 1. The MM and DMG PDFs lived only in the old container: to re-read pages, Morgan sets Drive `_AI_Directories` files to link sharing, then download via drive.usercontent.google.com (MM id 1lAzOxqwZfoT_STKHNaUQpcshncj_2z7v, DMG id 18XP8iND9a59QWK9Tc3US0KyyPIw-guLg; both domains are allowed in the environment). Never use 5e.tools.
- **Map scale** (for step 4 follow-up): Thundertree is 1 square = 10 ft (28 × 19 squares = 56 × 38 in at 5 ft per inch); Cragmaw Hideout, Redbrand Hideout and Cragmaw Castle are 5 ft. Import (D-024) makes one picture square 1 inch, so it needs a feet-per-square choice. A map bigger than the projected area needs panning or sections (Morgan to measure the table). Where only a keyed DM map exists, Morgan covers the area numbers and legend with hide shapes.
4. When Morgan has a Windows laptop: run "Build Windows app", then the README checks in order: two windows, calibration with a ruler, map import with the Thundertree photo, then the projector photo. Confirm the built-in screen says "this laptop" (`Display.internal`) and the display scale: a 14" 1080p screen usually defaults to 150%, leaving the DM window about 1280 × 680 (checked in screenshots: the step 5 layout fits). Try fog and discs with a finger and the pen; enter the party and run a mock round.

## Open questions

- Button size: Morgan thinks buttons could be a little smaller (2026-10-28), but wants to decide after trying the laptop. Keep D-023's 40 px / 56 px until then.
- Windows SmartScreen warns on the unsigned app ("More info" → "Run anyway"). Recommended: accept for now; code signing costs money.
- Morgan expects the Windows laptop and projector the week of 2026-11-02 (said 2026-10-28), and will measure the projected table area.
- Library loose ends: 4 files damaged in Morgan's map zip (listed in `maps/lmop/README.md`); Wave Echo Cave scale unchecked; Flesh Meld and Nellik DCs don't fit their stats (adventure Markdown only, no page to check); wall spells have no template area; spell class lists include Artificer from the source file.

## How to work here

- Read AGENTS.md, then this file, then the DECISIONS index and LESSONS. Local checks: `npm run check` and `xvfb-run -a npm run test:e2e`.
- PRs: summary to Morgan first; after approval, open the PR and squash-merge when green (D-018). After a merge, restart the working branch from main by merging main into it (force-push is blocked in cloud sessions).
- Morgan reads on a phone: short messages, links and taps. Show UI work as screenshots; for design choices, use phone forms (`planning-interview` skill) or a short chat proposal with a recommendation.
- Mockup and screenshot scripts lived in the session scratchpad and are gone; regenerate with Playwright as needed (`_electron.launch`, `xvfb-run`).

## Planning pages (Morgan's answers are saved in each)

- Plan: [round 1](https://claude.ai/artifact/KbAFZXKteAj4mrahwNW2S3), [review](https://claude.ai/artifact/Abqb6FvUU9G1tq3KUYyhBG), [round 2](https://claude.ai/artifact/Y1ync7v4p39K8rmimHFXsb), [round 3](https://claude.ai/artifact/5KrYHjTNJAUPdLi7ppmTdq), [final](https://claude.ai/artifact/VeuLsTvhYKxm3C6d6rVZ5e)
- Book library: [round 1](https://claude.ai/artifact/FUAenSA2tNkCqRnp62DZ2v), [round 2](https://claude.ai/artifact/FJbNz8xutdeTdynbCB6gQT), [final](https://claude.ai/artifact/DtmiYuaqWcob54HQt5rjpB)
- Step 7: [ping and pins](https://claude.ai/artifact/UmVczUweJXm3EdVEXRJNm7), [walkthrough](https://claude.ai/artifact/AvULjQ6u8VN29LwvytYkoN)
- Drawing: [round 1](https://claude.ai/artifact/3BtQEkjjm5cJ7pCes2r4Uw)
- Maps and tokens: [round 1](https://claude.ai/artifact/XmKuvAKNAt1LjGoYDCV4MR), [round 2](https://claude.ai/artifact/Csn63Q1Sx2BtGEDHESXJLe), [final](https://claude.ai/artifact/FeT13w8okCXeqrcCSjvy4s)
- Colour round: [round 1](https://claude.ai/artifact/BCikF4kJUnR1eN1kHRQBvN), [round 2](https://claude.ai/artifact/QsR6UJcgnXaj39py6Dqjj2), [final](https://claude.ai/artifact/FPq4WeyfgBsefRwU1Vyuap)
- UI review: [round 1](https://claude.ai/artifact/N2LH9mtnUHNT5QydAdB8Zz), [round 2 and draft](https://claude.ai/artifact/To2kRT3RWFcb16mti3cDov)
- UI design: [round 1](https://claude.ai/artifact/CXKec4y4K2JBqv6gAC8eyx), [round 2](https://claude.ai/artifact/8dnwH7FRSRMLrYBkuHCtW2), [final](https://claude.ai/artifact/VUP3qZFNYp2gZTPbXch4Re)

## Decisions since the last plan update

- 2026-10-28 D-035 freehand drawing before session 1; symbols, shapes, labels after.
- 2026-10-28 D-034 ping, pins, reopening sheets, audit leftovers.
- 2026-10-28 D-032 DM window redesign; D-033 looks (three dark, two light, 7:1 contrast).
- 2026-10-28 D-018 PR workflow; D-019 the repo carries everything; D-020 test upkeep.
- 2026-10-28 D-010 changed: book data goes in the private repo `project-terra-library`, never in this public repo.
- 2026-10-28 D-021 calibration; D-022 UI design step; D-023 UI design; D-024 map import, undo, library; D-025 fog.
- 2026-10-28 D-026 book library; D-003 adds character cards, no fixed date; D-013 HP on discs after session 1.
- 2026-10-28 D-027 initiative, markers and character cards.
