# Handoff

Updated: 2026-10-29. A fresh session must be able to continue from this file alone. Keep it to 60 lines; finished entries move to [archive/handoff-2026-10.md](archive/handoff-2026-10.md).

## Phase

Building toward session 1 ([PLAN.md](PLAN.md)). Steps 1–7j are all merged: maps and monster tokens (D-036, PRs #20–#23), the usability audit fixes (#25), rehearsal safety (7g, D-037, #26) and the one-panel DM window (7h–7j, D-038, #27, #28 and the 7j PR). Morgan lifted the feature freeze for scenes (D-039). Left: step 8, the rehearsal, which needs the laptop and projector. While waiting, Morgan asked to start map annotation (D-044, PLAN.md 2A–2D); step 2A, the walls editor, is being built on branch `annotation-a`. Tested in the cloud, plus one install test on Morgan's Windows PC (not the laptop, no projector). The laptop will be an HP Pavilion x360 14" (1920 × 1080 touch, i5-1035G1), expected the week of 2026-11-02, so projected steps stay "built, awaiting Morgan's check" (VER-07).

## Just done ([earlier](archive/handoff-2026-10.md))

- 2026-10-30 Player character tokens (D-045), branch `pc-tokens`: a character's token on a map (`tokens` on `PlacedMap`, `token` command, `tokenView`, save version 16), a square tile with picture, colour, initials and condition icons (`drawToken`), side and mini per character, crop in `dm-token-crop.ts`, controls on the Party sheet. Awaits Morgan's table photo (VER-07).
- 2026-10-29 Step 2A (D-044), [walkthrough](https://claude.ai/artifact/TU2tssgbPPxX2b1wWV2iw4), branch `annotation-a`, awaiting Morgan's OK for the PR: the walls editor (`dm-walls.ts`, `#walls`; Edit walls on the map bar, Walls on each library row with no map placed), pure rules in `src/core/annotation.ts` (¼-inch snap, ⅛-inch join, freehand smoothing, rub out splits a run), saved as `<map>.walls.json` beside the map (`library:walls` / `library:saveWalls`, DM bridge only; a damaged file is set aside), a Walls switch on the DM map (`walls-draw.ts`). The table window gets none of it (e2e checks). No save version change: walls live in the library, not the save. Screenshots from a generated test map (D-041).
- 2026-10-29 Step 7m (D-039), [walkthrough](https://claude.ai/artifact/VjjZsMpVUkiZcojpUkqRx8), approved by Morgan: another scene as a curtain (the world map, `curtainScene` in table.ts), link pins (`linkPin`, a Select tap opens `pinMenu` in dm-scenes.ts), the party marker (`party` on a map; `#partyMap`, Select drags it). Save version 15. Fill the table in import (D-042; `fillTable`), and a fix so a whole-picture mark no longer adds an inch (`planRectify`). The e2e suite's 34 async waits never waited (LESSONS); they now use `until`.
- 2026-10-29 Map generator concept (D-041, testing only until its design phase; tests in `mapgen.test.ts`), outside the app: `src/core/mapgen.ts` (seeded dungeon, cave, ruins, town; walls, doors, objects, lights, areas, in inches), `mapdraw.ts` (pencil), `detect.ts` (walls and objects from a picture), `light.ts` (bright and dim light with shadows), `scripts/maps.mjs <dir> [ppi] [seed]` (PNG plus data). [Test run page](https://claude.ai/artifact/Gs8EnBJbwqFJghRbyVyu64). Detector: 100% of walls, objects and closed doors on generated maps from 20 ppi (closed doors block light; walls and objects from 12 ppi); on 5 painted Lost Mine battle maps scored against their VTT walls, 23–99% found but 4–35% of finds real, so not for real maps. Unit suite 1.8–2.0 s, at its budget. PR opened with Morgan's OK. Fits D-040: `light.ts`'s wall-cut shape is what Look from here needs; map light sources stay in Later there, so this is a test concept only. Not planned yet: the generator phase still needs its interview.

## Next

0. Map annotation (D-044): 2A walls editor, then 2B VTT import and prep tracing (the private library's `maps/lmop/vtt/` has 10 maps with walls), 2C rooms, 2D areas and the wall check. Each step gets a walkthrough and Morgan's OK before its PR (D-018).
1. Step 8, rehearsal, when the laptop and projector arrive: follow [REHEARSAL.md](REHEARSAL.md). Confirm the built-in screen shows as "This laptop, in a window" and the display scale (14" 1080p usually defaults to 150%, a DM window of about 1280 × 680). On the laptop, re-import `data/monsters/mm2024.json` from the private library so the portraits arrive.
2. Morgan's photos decide (VER-07): letters, symbols and portraits readable from the players' seats (whether 1-inch portraits are worth switching on); HP ring, patched Thundertree, ping, pins and lines on the projector; close the app mid-fight and reopen it.
3. Still open: calibration keyed to the Windows display id; unplugging the projector drops the table window over the DM window; no Windows CI run of the app (REHEARSAL.md part 4). From step 7g: the "fading line saves nothing" check failed 1 in 40 local runs; likely cause found in step 7m (async waits that never waited, LESSONS), 5 of 5 clean runs since; watch for it.
4. After session 1 (PLAN.md, D-037, D-040): the scenes leftovers, map annotation, then sight, then the library.
- **Book library** (private repo `project-terra-library`; attach with add_repo; D-010, D-026): 503 MM creatures (6 page-checked, 4 with portraits), 35 Phandelver creatures, 391 PHB spells, 39 DMG treasure tables, 17 magic items, MM habitat lists, Lost Mine maps. How to re-read the book PDFs (Drive files, PDF page = book page + 3 for the MM) is in that repo's README, never here: this repo is public. Never use 5e.tools; book content never goes in this repo, its CI or PR text.

## Open questions

- Button size: Morgan thinks buttons could be a little smaller (2026-10-28), but wants to decide after trying the laptop. Keep D-023's 40 px / 56 px until then.
- Windows SmartScreen warns on the unsigned app ("More info" → "Run anyway"). Recommended: accept for now; code signing costs money.
- Table area: plan for a 2 × 3.5 ft board (24 × 42 in), Morgan 2026-10-29; the projected area is measured at the rehearsal. A map bigger than it is dragged under the projector (D-036; saved spots with scenes).
- Library loose ends: portraits could be touched up on Morgan's PC (320 × 320 in `mm2024.json`); 4 files damaged in Morgan's map zip (listed in `maps/lmop/README.md`); Wave Echo Cave scale unchecked; Flesh Meld and Nellik DCs don't fit their stats (adventure Markdown only, no page to check); wall spells have no template area; spell class lists include Artificer from the source file.

## How to work here

- Read AGENTS.md, then this file, then the DECISIONS index and LESSONS. Local checks: `npm run check` and `xvfb-run -a npm run test:e2e`.
- PRs: summary to Morgan first; after approval, open the PR and squash-merge when green (D-018). After a merge, restart the working branch from main by merging main into it (force-push is blocked in cloud sessions).
- Morgan reads on a phone: short messages, links and taps. Show UI work as screenshots; for design choices, use phone forms (`planning-interview` skill) or a short chat proposal with a recommendation.
- One building session at a time, or say which step each owns: on 2026-10-29 two sessions both built step 7g from HANDOFF's next step (#26 kept).
- Screenshot scripts live in the session scratchpad and are lost with it; regenerate with Playwright (`_electron.launch`, `xvfb-run`). A fresh container may lack the Electron binary and its download can fail through the proxy: curl the release zip, check it against `node_modules/electron/checksums.json`, unzip into `node_modules/electron/dist` and write `path.txt` (`electron`).

## Planning pages (Morgan's answers are saved in each)

- Plan: [round 1](https://claude.ai/artifact/KbAFZXKteAj4mrahwNW2S3), [review](https://claude.ai/artifact/Abqb6FvUU9G1tq3KUYyhBG), [round 2](https://claude.ai/artifact/Y1ync7v4p39K8rmimHFXsb), [round 3](https://claude.ai/artifact/5KrYHjTNJAUPdLi7ppmTdq), [final](https://claude.ai/artifact/VeuLsTvhYKxm3C6d6rVZ5e)
- Book library: [round 1](https://claude.ai/artifact/FUAenSA2tNkCqRnp62DZ2v), [round 2](https://claude.ai/artifact/FJbNz8xutdeTdynbCB6gQT), [final](https://claude.ai/artifact/DtmiYuaqWcob54HQt5rjpB)
- Step 7: [ping and pins](https://claude.ai/artifact/UmVczUweJXm3EdVEXRJNm7), [walkthrough](https://claude.ai/artifact/AvULjQ6u8VN29LwvytYkoN); drawing: [round 1](https://claude.ai/artifact/3BtQEkjjm5cJ7pCes2r4Uw)
- Maps and tokens: [round 1](https://claude.ai/artifact/XmKuvAKNAt1LjGoYDCV4MR), [round 2](https://claude.ai/artifact/Csn63Q1Sx2BtGEDHESXJLe), [final](https://claude.ai/artifact/FeT13w8okCXeqrcCSjvy4s); walkthroughs [7c](https://claude.ai/artifact/GuZPyDEcUYn3a39Pi4c3yS), [7d](https://claude.ai/artifact/TQtL6Ppu1RbrFmRSWD9JP4), [7e](https://claude.ai/artifact/Eh33N18ox92qNRVneknqAP), [7f symbols](https://claude.ai/artifact/7eBVJoSdZwqBzqnRfs8EuE), [7f portraits](https://claude.ai/artifact/XHcP3dV3A3jozaXnnHXvkc), [7g](https://claude.ai/artifact/HCoeyogKMsC5aEeFT2g1HR)
- Colour round: [round 1](https://claude.ai/artifact/BCikF4kJUnR1eN1kHRQBvN), [round 2](https://claude.ai/artifact/QsR6UJcgnXaj39py6Dqjj2), [final](https://claude.ai/artifact/FPq4WeyfgBsefRwU1Vyuap)
- UI review: [round 1](https://claude.ai/artifact/N2LH9mtnUHNT5QydAdB8Zz), [round 2 and draft](https://claude.ai/artifact/To2kRT3RWFcb16mti3cDov)
- Layout (D-038): [audit](https://claude.ai/artifact/R1TJm1AfCyvqSuktZjiSyD), [round 1](https://claude.ai/artifact/BLvKT9sMLPEecrEdGC5dKX), [review and final](https://claude.ai/artifact/GwwNfsNY3ssddwUbF5tr98); walkthroughs [7h](https://claude.ai/artifact/HCcL6eoXmhosQL5A2t11jb), [7i](https://claude.ai/artifact/CchqNxcz6BnFCVMR5YQHoD), [7j](https://claude.ai/artifact/Uo1wgbKJo7vunUAN9UKWhz)
- Map annotation (D-044): [round 1](https://claude.ai/artifact/J5kSTU4AS96zwhwsbcudg7), [review](https://claude.ai/artifact/6hkYeaHBJGvFxnrwyQvoTH)
- UI design: [round 1](https://claude.ai/artifact/CXKec4y4K2JBqv6gAC8eyx), [round 2](https://claude.ai/artifact/8dnwH7FRSRMLrYBkuHCtW2), [final](https://claude.ai/artifact/VUP3qZFNYp2gZTPbXch4Re)

## Decisions since the last plan update

- 2026-10-30 D-045 player character tokens, per character, dragged by the DM; changes D-027 item 1.
- 2026-10-29 D-044 map annotation: walls, openings (door, secret door, window, opening), rooms with one-tap uncover, areas, VTT import; four steps 2A–2D.
- 2026-10-29 D-043 back from the cuts: a DM-only dice roller (Battle drama), line of sight with character markers (Sight), the NPC conversation player defined (Later).
- 2026-10-29 D-042 pictures with no squares fill the table, turned if bigger, never stretched; Turn turns about the middle.
- 2026-10-29 D-040 sight: Look from here replaces the light-radius shape, after map annotation ([Arkenforge report](https://claude.ai/artifact/Bq9i76akbah11aL3TyoZ3K)); D-039 scenes before session 1 (steps 7k–7m, B stays black).
- 2026-10-29 D-038 DM window: the map first, one panel with tabs, Encounter list, Uncover/Dim and On/Off table; steps 7h–7j before the rehearsal.
- 2026-10-29 D-037 plan audit: scenes and map annotation first, merges and cuts; supersedes D-017.
- 2026-10-29 D-036 maps and monster tokens: feet per square, magnifier, HP ring, patch tool, revealed tokens before session 1; the rest after.
- 2026-10-28 D-035 freehand drawing; D-034 ping and pins; D-032 DM window redesign; D-033 looks; D-018 PR workflow; D-019 the repo carries everything; D-020 test upkeep; D-010: book data only in `project-terra-library`.
