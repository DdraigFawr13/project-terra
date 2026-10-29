# Handoff

Updated: 2026-10-29. A fresh session must be able to continue from this file alone. Keep it to 60 lines; finished entries move to [archive/handoff-2026-10.md](archive/handoff-2026-10.md).

## Phase

Building toward session 1 ([PLAN.md](PLAN.md)). Steps 1–7j are all merged: maps and monster tokens (D-036, PRs #20–#23), the usability audit fixes (#25), rehearsal safety (7g, D-037, #26) and the one-panel DM window (7h–7j, D-038, #27, #28 and the 7j PR). Feature freeze until the rehearsal: only fixes and what it turns up (audit recommendation). Left: step 8, the rehearsal, which needs the laptop and projector. Tested in the cloud, plus one install test on Morgan's Windows PC (not the laptop, no projector). The laptop will be an HP Pavilion x360 14" (1920 × 1080 touch, i5-1035G1), expected the week of 2026-11-02, so projected steps stay "built, awaiting Morgan's check" (VER-07).

## Just done

- 2026-10-29 Step 7j (D-038), PR after #28: fog tools Uncover (U, sun icon) and Dim (G, cloud; internal ids stay `reveal`/`hide`); Dim what's in view, Uncover all; On table / Off table switches (`role=switch`); Show picture (picture icon). Calibrate (`#calTools`), import and patch are `.full-step` overlays over `.work` with their buttons at the foot; canvases fit the room left (`stage-frame`). The empty map shows a checklist (`renderReady` in dm.ts) that ticks itself. D-038 steps 7h–7j all built.
- 2026-10-29 Step 7i (D-038), [PR #28](https://github.com/DdraigFawr13/project-terra/pull/28): `#encounterPanel` replaces Initiative and Groups (`dm-fight.ts`): party rows with a thin HP bar and numbers (tap the name: `quick.showCharacter`, a pad with Damage, Heal, Temp HP), group rows with per-disc conditions; in a fight the same rows in turn order; `#turnStrip` pinned above tabs and sheets (next from `nextTurn`).
- 2026-10-29 Step 7g, rehearsal safety (D-037): `src/core/saves.ts` (earlier save names, pruning to 3, every 10 min, `describeSave`, `problemReport`); main keeps an earlier save at start (skipped when identical to the newest) and every 10 minutes in `<app data>/earlier-saves/`, `saves:list`/`saves:restore` (keeps the rig, clears undo, keeps the current state first), `report:copy` (clipboard); a problem log of main problems and page console errors. Table → Earlier saves… and Problem report. Tests: 50 unit, 4 e2e (about 14 s; the fight journey runs at 1280 × 680).
- 2026-10-29 Layout interview approved (D-038; pages below). Usability audit ([page with screenshots](https://claude.ai/artifact/R1TJm1AfCyvqSuktZjiSyD)) and its small fixes, [PR #25](https://github.com/DdraigFawr13/project-terra/pull/25): tool buttons show a short name under the icon (colours two to a row; at 760 px tall or less disc sizes drop the size word); the projector's edge on the DM map is pale with a "Table" tag; the Marker preview hides over a placed disc; one hint in a monster sheet for missing HP or symbol (why Reveal is grey), condition word no longer shown twice; locked-map buttons say why; the screen picker names the laptop "This laptop, in a window".
- Earlier: [archive](archive/handoff-2026-10.md).

## Next

1. Step 8, rehearsal, when the laptop and projector arrive: follow [REHEARSAL.md](REHEARSAL.md). Confirm the built-in screen shows as "This laptop, in a window" and the display scale (14" 1080p usually defaults to 150%, a DM window of about 1280 × 680). On the laptop, re-import `data/monsters/mm2024.json` from the private library so the portraits arrive.
2. Morgan's photos decide (VER-07): letters, symbols and portraits readable from the players' seats (whether 1-inch portraits are worth switching on); HP ring, patched Thundertree, ping, pins and lines on the projector; close the app mid-fight and reopen it.
3. Still open: calibration keyed to the Windows display id; unplugging the projector drops the table window over the DM window; no Windows CI run of the app (REHEARSAL.md part 4). From step 7g: the fight journey's "fading line saves nothing" check failed 1 in 40 local runs (main 0 in 14), cause not found (VER-04).
4. After session 1 (PLAN.md, D-037): scenes, then map annotation, then the library.

- **Book library** (private repo `project-terra-library`; attach with add_repo; D-010, D-026): 503 MM creatures (6 page-checked, 4 with portraits), 35 Phandelver creatures, 391 PHB spells, 39 DMG treasure tables, 17 magic items, MM habitat lists, Lost Mine maps. How to re-read the book PDFs (Drive files, PDF page = book page + 3 for the MM) is in that repo's README, never here: this repo is public. Never use 5e.tools; book content never goes in this repo, its CI or PR text.

## Open questions

- Button size: Morgan thinks buttons could be a little smaller (2026-10-28), but wants to decide after trying the laptop. Keep D-023's 40 px / 56 px until then.
- Windows SmartScreen warns on the unsigned app ("More info" → "Run anyway"). Recommended: accept for now; code signing costs money.
- Morgan will measure the projected table area; a map bigger than it is dragged under the projector (D-036; saved spots later).
- Library loose ends: portraits could be touched up on Morgan's PC (320 × 320 in `mm2024.json`); 4 files damaged in Morgan's map zip (listed in `maps/lmop/README.md`); Wave Echo Cave scale unchecked; Flesh Meld and Nellik DCs don't fit their stats (adventure Markdown only, no page to check); wall spells have no template area; spell class lists include Artificer from the source file.

## How to work here

- Read AGENTS.md, then this file, then the DECISIONS index and LESSONS. Local checks: `npm run check` and `xvfb-run -a npm run test:e2e`.
- PRs: summary to Morgan first; after approval, open the PR and squash-merge when green (D-018). After a merge, restart the working branch from main by merging main into it (force-push is blocked in cloud sessions).
- Morgan reads on a phone: short messages, links and taps. Show UI work as screenshots; for design choices, use phone forms (`planning-interview` skill) or a short chat proposal with a recommendation.
- One building session at a time, or say which step each owns: on 2026-10-29 two sessions both built step 7g from HANDOFF's next step (#26 kept).
- Mockup and screenshot scripts lived in the session scratchpad and are gone; regenerate with Playwright as needed (`_electron.launch`, `xvfb-run`).

## Planning pages (Morgan's answers are saved in each)

- Plan: [round 1](https://claude.ai/artifact/KbAFZXKteAj4mrahwNW2S3), [review](https://claude.ai/artifact/Abqb6FvUU9G1tq3KUYyhBG), [round 2](https://claude.ai/artifact/Y1ync7v4p39K8rmimHFXsb), [round 3](https://claude.ai/artifact/5KrYHjTNJAUPdLi7ppmTdq), [final](https://claude.ai/artifact/VeuLsTvhYKxm3C6d6rVZ5e)
- Book library: [round 1](https://claude.ai/artifact/FUAenSA2tNkCqRnp62DZ2v), [round 2](https://claude.ai/artifact/FJbNz8xutdeTdynbCB6gQT), [final](https://claude.ai/artifact/DtmiYuaqWcob54HQt5rjpB)
- Step 7: [ping and pins](https://claude.ai/artifact/UmVczUweJXm3EdVEXRJNm7), [walkthrough](https://claude.ai/artifact/AvULjQ6u8VN29LwvytYkoN); drawing: [round 1](https://claude.ai/artifact/3BtQEkjjm5cJ7pCes2r4Uw)
- Maps and tokens: [round 1](https://claude.ai/artifact/XmKuvAKNAt1LjGoYDCV4MR), [round 2](https://claude.ai/artifact/Csn63Q1Sx2BtGEDHESXJLe), [final](https://claude.ai/artifact/FeT13w8okCXeqrcCSjvy4s); walkthroughs [7c](https://claude.ai/artifact/GuZPyDEcUYn3a39Pi4c3yS), [7d](https://claude.ai/artifact/TQtL6Ppu1RbrFmRSWD9JP4), [7e](https://claude.ai/artifact/Eh33N18ox92qNRVneknqAP), [7f symbols](https://claude.ai/artifact/7eBVJoSdZwqBzqnRfs8EuE), [7f portraits](https://claude.ai/artifact/XHcP3dV3A3jozaXnnHXvkc), [7g](https://claude.ai/artifact/HCoeyogKMsC5aEeFT2g1HR)
- Colour round: [round 1](https://claude.ai/artifact/BCikF4kJUnR1eN1kHRQBvN), [round 2](https://claude.ai/artifact/QsR6UJcgnXaj39py6Dqjj2), [final](https://claude.ai/artifact/FPq4WeyfgBsefRwU1Vyuap)
- UI review: [round 1](https://claude.ai/artifact/N2LH9mtnUHNT5QydAdB8Zz), [round 2 and draft](https://claude.ai/artifact/To2kRT3RWFcb16mti3cDov)
- Layout (D-038): [audit](https://claude.ai/artifact/R1TJm1AfCyvqSuktZjiSyD), [round 1](https://claude.ai/artifact/BLvKT9sMLPEecrEdGC5dKX), [review and final](https://claude.ai/artifact/GwwNfsNY3ssddwUbF5tr98); walkthroughs [7h](https://claude.ai/artifact/HCcL6eoXmhosQL5A2t11jb), [7i](https://claude.ai/artifact/CchqNxcz6BnFCVMR5YQHoD), [7j](https://claude.ai/artifact/Uo1wgbKJo7vunUAN9UKWhz)
- UI design: [round 1](https://claude.ai/artifact/CXKec4y4K2JBqv6gAC8eyx), [round 2](https://claude.ai/artifact/8dnwH7FRSRMLrYBkuHCtW2), [final](https://claude.ai/artifact/VUP3qZFNYp2gZTPbXch4Re)

## Decisions since the last plan update

- 2026-10-29 D-038 DM window: the map first, one panel with tabs, Encounter list, Uncover/Dim and On/Off table; steps 7h–7j before the rehearsal.
- 2026-10-29 D-037 plan audit: scenes and map annotation first, merges and cuts; supersedes D-017.
- 2026-10-29 D-036 maps and monster tokens: feet per square, magnifier, HP ring, patch tool, revealed tokens before session 1; the rest after.
- 2026-10-28 D-035 freehand drawing before session 1; symbols, shapes, labels after.
- 2026-10-28 D-034 ping, pins, reopening sheets, audit leftovers.
- 2026-10-28 D-032 DM window redesign; D-033 looks (three dark, two light, 7:1 contrast).
- 2026-10-28 D-018 PR workflow; D-019 the repo carries everything; D-020 test upkeep; D-010 changed: book data goes in the private repo `project-terra-library`, never here.
