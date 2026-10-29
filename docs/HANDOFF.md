# Handoff

Updated: 2026-10-29. A fresh session must be able to continue from this file alone. Keep it to 60 lines; finished entries move to [archive/handoff-2026-10.md](archive/handoff-2026-10.md).

## Phase

Building toward session 1 ([PLAN.md](PLAN.md)). Steps 1–7f are all merged, the last being maps and monster tokens (D-036, steps 7c–7f, PRs #20–#23). Left: step 7g, rehearsal safety (D-037), then step 8, the rehearsal, which needs the laptop and projector. Tested in the cloud, plus one install test on Morgan's Windows PC (not the laptop, no projector). The laptop will be an HP Pavilion x360 14" (1920 × 1080 touch, i5-1035G1), expected the week of 2026-11-02, so projected steps stay "built, awaiting Morgan's check" (VER-07).

## Just done

- 2026-10-29 Plan audit (D-037): after session 1 now starts with scenes and map annotation; library, battle drama and story tools merged and trimmed; automatic line of sight, dice roller, name and loot generators and NPC conversation player cut; generator moved below story tools. New step 7g and a rehearsal script, [REHEARSAL.md](REHEARSAL.md). D-017 superseded.
- 2026-10-29 Step 7f part 2, portraits (D-036), [PR #23](https://github.com/DdraigFawr13/project-terra/pull/23): library entries may carry `portrait` (image data URL, checked in `parseCreature`); `GroupInfo.hasPortrait` (set when linking) and `.smallPortrait` (Edit: "Portrait on 1-inch tokens too"); `tokenLook` gives a revealed disc's symbol and portrait key (`<colour>/<hash>`, never the name), portrait on 2-inch and up or when switched on; `terra-portrait://` serves it only while revealed and the key matches (the DM session also serves `book/<key>` for the Book preview). Save version 12. Library [PR #1](https://github.com/DdraigFawr13/project-terra-library/pull/1): portraits for zombie, cultist, needle blight and young green dragon (wyrmling art, dark ground); twig blight and giant spider have no art in the book and keep their symbol. Sources in the library's `data/monsters/README.md`.
- 2026-10-29 Step 7f part 1 ([PR #22](https://github.com/DdraigFawr13/project-terra/pull/22)): 14 creature-type symbols drawn in code (`src/renderer/symbols.ts`), Reveal per group, Mini on it (letter on a tab), the table gets the symbol only after Reveal. Save version 11.
- 2026-10-29 Steps 7d HP ring and 7e patch tool ([PR #21](https://github.com/DdraigFawr13/project-terra/pull/21)): the table window has its own session (`partition: "table"`) whose `terra-map://` serves only `tableMapFile` (the patched `<id>.table.png` when there is one). Step 7c ([PR #20](https://github.com/DdraigFawr13/project-terra/pull/20)): feet per square on each map (save version 10) and a corner magnifier.
- 2026-10-29 Maps and tokens planning approved (D-036; pages below). Tests now: 46 unit (about 1 s), 4 e2e (about 15 s).

## Next

1. Step 7g (D-037): keep the last 3 saves with a way to roll back, and Table → Problem report. Can be built before the laptop arrives.
2. Step 8, rehearsal, when the laptop and projector arrive: follow [REHEARSAL.md](REHEARSAL.md). Confirm the built-in screen says "this laptop" and the display scale (14" 1080p usually defaults to 150%, a DM window of about 1280 × 680). On the laptop, re-import `data/monsters/mm2024.json` from the private library so the portraits arrive.
3. Morgan's photos decide (VER-07): letters, symbols and portraits readable from the players' seats (whether 1-inch portraits are worth switching on); HP ring, patched Thundertree, ping, pins and lines on the projector; close the app mid-fight and reopen it.
4. Still open from the audit (checked in REHEARSAL.md part 4): calibration keyed to the Windows display id; unplugging the projector drops the table window over the DM window; no Windows CI run of the app.
5. After session 1 (PLAN.md, D-037): scenes, then map annotation, then the library.

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
- Mockup and screenshot scripts lived in the session scratchpad and are gone; regenerate with Playwright as needed (`_electron.launch`, `xvfb-run`).

## Planning pages (Morgan's answers are saved in each)

- Plan: [round 1](https://claude.ai/artifact/KbAFZXKteAj4mrahwNW2S3), [review](https://claude.ai/artifact/Abqb6FvUU9G1tq3KUYyhBG), [round 2](https://claude.ai/artifact/Y1ync7v4p39K8rmimHFXsb), [round 3](https://claude.ai/artifact/5KrYHjTNJAUPdLi7ppmTdq), [final](https://claude.ai/artifact/VeuLsTvhYKxm3C6d6rVZ5e)
- Book library: [round 1](https://claude.ai/artifact/FUAenSA2tNkCqRnp62DZ2v), [round 2](https://claude.ai/artifact/FJbNz8xutdeTdynbCB6gQT), [final](https://claude.ai/artifact/DtmiYuaqWcob54HQt5rjpB)
- Step 7: [ping and pins](https://claude.ai/artifact/UmVczUweJXm3EdVEXRJNm7), [walkthrough](https://claude.ai/artifact/AvULjQ6u8VN29LwvytYkoN); drawing: [round 1](https://claude.ai/artifact/3BtQEkjjm5cJ7pCes2r4Uw)
- Maps and tokens: [round 1](https://claude.ai/artifact/XmKuvAKNAt1LjGoYDCV4MR), [round 2](https://claude.ai/artifact/Csn63Q1Sx2BtGEDHESXJLe), [final](https://claude.ai/artifact/FeT13w8okCXeqrcCSjvy4s); walkthroughs [7c](https://claude.ai/artifact/GuZPyDEcUYn3a39Pi4c3yS), [7d](https://claude.ai/artifact/TQtL6Ppu1RbrFmRSWD9JP4), [7e](https://claude.ai/artifact/Eh33N18ox92qNRVneknqAP), [7f symbols](https://claude.ai/artifact/7eBVJoSdZwqBzqnRfs8EuE), [7f portraits](https://claude.ai/artifact/XHcP3dV3A3jozaXnnHXvkc)
- Colour round: [round 1](https://claude.ai/artifact/BCikF4kJUnR1eN1kHRQBvN), [round 2](https://claude.ai/artifact/QsR6UJcgnXaj39py6Dqjj2), [final](https://claude.ai/artifact/FPq4WeyfgBsefRwU1Vyuap)
- UI review: [round 1](https://claude.ai/artifact/N2LH9mtnUHNT5QydAdB8Zz), [round 2 and draft](https://claude.ai/artifact/To2kRT3RWFcb16mti3cDov)
- UI design: [round 1](https://claude.ai/artifact/CXKec4y4K2JBqv6gAC8eyx), [round 2](https://claude.ai/artifact/8dnwH7FRSRMLrYBkuHCtW2), [final](https://claude.ai/artifact/VUP3qZFNYp2gZTPbXch4Re)

## Decisions since the last plan update

- 2026-10-29 D-037 plan audit: scenes and map annotation first, merges and cuts; supersedes D-017.
- 2026-10-29 D-036 maps and monster tokens: feet per square, magnifier, HP ring, patch tool, revealed tokens before session 1; the rest after.
- 2026-10-28 D-035 freehand drawing before session 1; symbols, shapes, labels after.
- 2026-10-28 D-034 ping, pins, reopening sheets, audit leftovers.
- 2026-10-28 D-032 DM window redesign; D-033 looks (three dark, two light, 7:1 contrast).
- 2026-10-28 D-018 PR workflow; D-019 the repo carries everything; D-020 test upkeep; D-010 changed: book data goes in the private repo `project-terra-library`, never here.
- 2026-10-28 D-021 calibration; D-022 UI design step; D-023 UI design; D-024 map import, undo, library; D-025 fog.
- 2026-10-28 D-026 book library; D-003 adds character cards, no fixed date; D-013 HP on discs after session 1; D-027 initiative, markers and cards.
