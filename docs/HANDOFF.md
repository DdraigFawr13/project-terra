# Handoff

Updated: 2026-11-06. A fresh session must be able to continue from this file alone. Keep it to 60 lines; finished entries move to [archive/handoff-2026-10.md](archive/handoff-2026-10.md).

## Phase

Building toward session 1 ([PLAN.md](PLAN.md)). Everything before the rehearsal is built and merged: steps 1–7m, map annotation 2A–2D (D-044, #36, #37, #40, #41), character tokens (#38) and the Wants batches (D-046): 7n fewer taps (#39), 7o table looks (#42), and 8b fewer drags (#43), the post-rehearsal batch built early at Morgan's request. Left before session 1: step 8, the rehearsal, which needs the laptop and projector (an HP Pavilion x360 14", 1920 × 1080 touch; arrived, runs Ubuntu 26.04 with GNOME on Wayland, D-049). Tested in the cloud only, plus one old install test on Morgan's Windows PC, so every step since #38 is "built, awaiting Morgan's check" (VER-07).

## Just done (earlier: [November](archive/handoff-2026-11.md), [October](archive/handoff-2026-10.md))

- 2026-11-06 Native Wayland can't place the table window: in a headless GNOME Shell 50.1 with two virtual monitors (1920×1080 primary, 1280×800 second), Electron 44 under `--ozone-platform=wayland` went fullscreen on the primary every time, with `setBounds` + `setFullScreen`, with `x`/`y` + `fullscreen` in the constructor, and with `requestFullscreen({ screen })` (Window Management API). Rig: `dbus-run-session`, `gnome-shell --headless --wayland --no-x11 --wayland-display <name> --virtual-monitor 1920x1080 --virtual-monitor 1280x800`, then read `getScreenDetails().currentScreen` and `innerWidth` in the table window. Virtual monitors, not a real HDMI output.

## Next

0. **Pen blocker (2026-11-06, found on the laptop):** under XWayland (`--ozone-platform=x11`, D-049 item 2) the pen only reaches Electron as a hovering mouse; no press ever arrives, so the pen can't draw. Under `--ozone-platform=wayland` a probe got the pen fully (`pointerType` pen, presses, eraser as buttons 32; pressure 0), but native Wayland puts the table window on the wrong screen (Just done), so XWayland stays. Next: find an XWayland pen fix; it needs Morgan at the laptop with the pen. Confirm the Wayland placement result once with a real second screen if one is to hand. The laptop has main from c7cea2f (everything through #54); rerun `npm run install:linux` there for #56. Then Morgan's checks, each from its walkthrough: 7n mock round (if the sheet on turn gets in the way, take it out, D-046 item 2); 8b on the laptop with the pen; 2B import Sleeping Giant and Thundertree; 2D tag a building as wood and find a gap with the wall check.
0a. On hold until Morgan says go: monster portraits for Shattered Obelisk chapters 1–4 ([token choices](https://claude.ai/artifact/XmWb3JnJY8eECwx12SkgmF)). Art order: book art, freely licensed art, a look-alike stand-in, then OpenArt with a price first. The adventure's image files aren't in the library, and art of unclear rights isn't copied from the web. Re-read the book as the library README says; the creature list has to be rebuilt.
0b. Book maps still untraced (trace each before it is played, with the private library's `tools/trace/`): Cragmaw Hideout, Wave Echo Cave, Cragmaw Castle and Redbrand Hideout (keyed handouts only). Secret door marks on a map are patched out of the table copy (D-044 item 6).
1. Step 8, rehearsal, when the laptop and projector arrive: follow [REHEARSAL.md](REHEARSAL.md). Confirm the built-in screen shows as "This laptop, in a window", that the table window goes fullscreen on the projector under XWayland, and the pen and touch (untested on Linux). The display runs at 200%, not the expected 150%. Re-import `data/monsters/mm2024.json` from the private library on the laptop. Set the map brightness. Uncover Thundertree room by room (2C).
2. Morgan's photos decide (VER-07): letters, symbols and portraits readable from the players' seats; 7o's turn ring, light under minis, grid and see-through big discs; the 8b laser; HP ring, patched Thundertree, ping, pins and lines; close the app mid-fight and reopen it; Sight S1–S4 on the projected table: **deferred by Morgan** (2026-11-01), not a blocker for merging. Dark is settled: "Keep Dark as built"; from S4 it limits sight by darkvision and light.
3. Still open: calibration keyed to the display id (X11 output ids under XWayland); unplugging the projector drops the table window over the DM window; no Windows CI run of the app (REHEARSAL.md part 4). Retyping the current turn higher still lets Next turn repeat those it jumped (left as is, D-046 covers lower only). The e2e group move uses a 700 ms hold; watch for flakes.
4. After session 1 (PLAN.md): the scenes leftovers, then Sight (doors opening and closing, kept per scene; Look from here; line of sight; more wall kinds), then the library.
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
- Keep Terra streamlined (D-046): no new permanent panel row, no per-scene setting unless the default works untouched; every review, adversarial ones included, checks for added steps and friction. Prefer defaults and automatic behaviour over new buttons, settings or prompts.
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
- Map annotation (D-044): [round 1](https://claude.ai/artifact/J5kSTU4AS96zwhwsbcudg7), [review](https://claude.ai/artifact/6hkYeaHBJGvFxnrwyQvoTH); walkthroughs [2A](https://claude.ai/artifact/TU2tssgbPPxX2b1wWV2iw4), [2B](https://claude.ai/artifact/X81467bZw6GvVZASdDAwJ1), [2C](https://claude.ai/artifact/LRwk3KouSwJgHT1Z3HQVBL), [2D](https://claude.ai/artifact/GfJhC7fU8n1hbDdVLY4LB4)
- UI design: [round 1](https://claude.ai/artifact/CXKec4y4K2JBqv6gAC8eyx), [round 2](https://claude.ai/artifact/8dnwH7FRSRMLrYBkuHCtW2), [final](https://claude.ai/artifact/VUP3qZFNYp2gZTPbXch4Re)
- Sight (first `write-spec` trial; answers become `docs/specs/sight.md`): [round 1](https://claude.ai/artifact/LqReE9S5xvJ8YyGR5biVQw), [review and round 2](https://claude.ai/artifact/TuP8RVmukWHzrtxsT8bVoJ). Morgan chose to start before session 1, off by default (D-003 and PLAN.md change at approval). Spec [docs/specs/sight.md](specs/sight.md) approved 2026-11-01 ([approval page](https://claude.ai/artifact/FUdEiS1qeb8WyNhaiJVYsi), D-047); S1 merged (#47); S2 merged (#49); S3 merged (#50); S4 approved and merging; S5 waits on the laptop's Problem report number
- Similar apps: [research](https://claude.ai/artifact/EMsAgY1w1Ls7oyMGWDs6Ma), [Wants review](https://claude.ai/artifact/P9egMjv9LBUoNJEPdEWBRq); walkthrough [7n](https://claude.ai/artifact/5HEw43sGzb9wD9EqQutMMG), [7o](https://claude.ai/artifact/3QxHHycZtP7LD6gMQVFqpx), [8b](https://claude.ai/artifact/AbXWHvY9C1t7XMwpV2hJYY)

## Decisions since the last plan update

- 2026-11-05 D-049 the DM laptop runs Linux: built there with `npm run install:linux`, started through XWayland; changes D-001.
- 2026-11-02 D-048 Cover brush (back to black) and Eraser (lines and pins, one undo per swipe); changes D-025 item 3.
- 2026-11-01 D-047 Sight: follows tokens, per-scene setting Off by default, built before session 1 behind rehearsal fixes.
- 2026-10-31 D-046 streamlining rule; the Wants placed as steps 7n, 7o and 8b and in later phases. D-044 item 6 changed: the room grow is even past secret doors.
- 2026-10-30 D-045 player character tokens, per character, dragged by the DM; changes D-027 item 1.
