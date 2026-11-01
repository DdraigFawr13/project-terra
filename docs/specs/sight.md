# Sight

- **Status:** Draft, revised after its fresh-context checks
- **Planned in:** [round 1](https://claude.ai/artifact/LqReE9S5xvJ8YyGR5biVQw), [review and round 2](https://claude.ai/artifact/TuP8RVmukWHzrtxsT8bVoJ) (2026-11-01). **Decisions:** D-040, D-043, D-044, D-045, D-046; new entry at approval.

## Problem

In Morgan's words: "Sight should be dynamic with where the player tokens are and where the light is." The moment it is for: "when players want to try to see around corners or enter a room and maybe there are enemies hiding that they would not see from the doorway." Today Morgan uses the brush or keeps things hidden, and "brushes aren't as immediate as sight and kind of take time and clicks to set up."

## Words used here

- **Fog states** (`FogLevel`, `src/core/fog.ts:41`):
  - **seen**: in view now, drawn clear.
  - **explored**: seen before, drawn dimmed.
  - **unexplored**: never seen, drawn black.
- **Fog ops:**
  - `dimSeen` turns everything seen into explored.
  - An `outline` op in reveal mode makes an area seen. The DM's Uncover tool makes such ops too, so a hand uncover is "seen" until something dims it.
- **Map inches:** positions are in the map's own inches, and one square is 1 inch (D-005, D-036). A range in feet becomes inches by dividing by the map's `feetPerSquare` (5 or 10).
- **Tokens and discs:**
  - A **token** is a player character's marker (D-045). A **disc** is an enemy marker (D-027), shown to players only while its **On table** switch is on.
  - A disc's **centre** is the point it's stored at.
- **Annotation:** a library map's traced walls, pillars and openings (D-044), loaded from the walls file, never part of the table state.
  - Openings come in four kinds: door, secret door, window, opening.
  - Wall pieces are the straight segments that block.
- **DM tools:** Select (move and tap), Uncover and Dim (fog brushes) on the DM map toolbar. **Walls shown** is the DM map's walls switch, off by default (D-044 item 3).
- **Scene terms:** **Mark ready** stores a copy of a scene's content and **Reset** goes back to it (D-039). `SceneContent` is that copy: map, fight, lock and grid (`src/core/table.ts:120`).
- **Problem report:** Table → Problem report, step 7g. It copies the app version, displays and recent errors as text for Morgan to paste to Claude.

## Goals

- When a token moves, sight updates on the table: what the party can see from where its tokens stand, cut off by walls, pillars and closed doors. On a dark scene it is also limited by darkvision and carried light.
- Enemy discs the party can't see stay off the table, turn strip included, so a room entered from the doorway can hide what's in it.
- Doors open and close per scene during play.
- No lag: a re-look for all tokens on the map takes under 16 ms (one frame) on the laptop. It is measured there, not assumed.
- Sight is set per scene and is Off by default. Off behaves exactly as Terra does today.

## Non-goals

- Spells and magic that change vision, such as truesight, Darkness, Light and Dancing Lights (Morgan, round 1).
- Separate views for a split party: one projector shows the union of what the party sees (D-040).
- Walls blocking sound (dropped until something uses sound; changes D-040 item 3).
- Light sources placed on the map, time of day, and cone lights such as a bullseye lantern (Later, D-040 item 5).
- Curtains, bars and low walls (After, review round).
- Blocking movement: Terra never stops a mini.

## Journeys and checks

### J1 Sight follows tokens

- **Given** a lit scene with Sight On, a traced test map with rooms A and B joined by a closed door, and one token in room A
- **When** the DM drags the token across room A and drops it
- **Then** the table's fog is seen in room A and unexplored in room B. A second drop moves "seen" with the token, and room A's old view becomes explored.
- **Check:** unit tests in `src/core/sight.test.ts`: `relook reveals the token's room and not past a closed door`, and `a second relook dims the first view`. e2e `sight follows a token` reads `fogAt` on the table bridge's fog.

### J2 Doors

- **Given** that scene, with Walls shown or Sight On
- **When** the DM taps the door with Select
- **Then** the door opens and is drawn dashed, and sight re-looks so room B is seen.
  - Undo closes it again.
  - Reset puts it back as at Mark ready.
  - A second scene placing the same library map keeps its own door state.
- **Check:** unit tests `doors: open per scene`, `doors: reset restores`, `doors: undo`, `doors: a secret door and a door on the same line don't collide`. e2e `open a door` taps the door's midpoint, using the map-to-screen transform the existing e2e taps use.

### J3 Hidden enemies

- **Given** Sight On, a fight running, and an enemy disc set On table in room B, which is unexplored
- **When** the table renders
- **Then** neither the disc nor its turn-strip chip is in the table window's state, and the DM map draws the disc with a diagonal slash.
  - Once the door opens and a token sees the disc's centre, both appear.
  - When the party moves on and room B is explored but not seen, both disappear again.
- **Check:** unit test `playerViewOf: with Sight on, discs and strip chips show only where the disc centre is seen`. e2e `hidden enemy` asserts that no disc and no strip chip with the disc's colour and letter is in the table bridge state (D-002).

### J4 Dark scene

- **Given** Sight On and dark, a 5 ft-per-square map, a token whose character has darkvision 60 ft, and a token carrying a torch
- **When** a re-look runs
- **Then** the first token sees up to 12 inches. The torch carrier sees up to its torch's bright plus dim radius from the SRD 5.2, divided by 5. Both are cut by walls.
  - A character with darkvision 0 and no light adds no sight on a dark scene.
- **Check:** unit test `dark: sight stops at darkvision and at the light's radius`. The torch radius in the test is copied from the SRD 5.2 text at the start of S4.

### J5 Off

- **Given** a scene with Sight Off (the default, and every scene in an old save)
- **When** tokens move and doors are tapped with Walls shown
- **Then** fog changes only through the DM's own tools, and enemy discs follow On table exactly as today.
- **Check:** unit test `sight off: moving tokens, placing the party and opening doors add no fog ops`. This must fail today only because doors don't exist yet; the token part is a guard. The existing e2e suite stays unchanged and green.

### J6 Speed and fog storage

- **Given** the dense test map (generated in the test, about 2,000 wall pieces) and four tokens
- **When** a re-look runs
- **Then** every outline has at most 1,000 points and its numbers are rounded to hundredths, so `parseFogOp` reads it back unchanged.
- **Check:** unit tests `relook: outlines read back through parseFogOp` and `relook: outlines under the fog cap on the dense map`. Speed is not asserted in tests (flaky on shared runners, VER-04). `npm run bench:sight` prints timings, and the Problem report shows the slowest re-look of the run on the laptop.

## Decisions

From Morgan's answers in the two rounds:

- **Sight follows tokens automatically**, with no tap and no Look button (round 2 q1). D-045's tap on a token still opens its HP pad.
- **A token sees from its centre** (q2). A character without a token on the map adds no sight (q5).
- **One Sight setting per scene:** Off / On / On and dark (q3), Off by default. It replaces a separate Dark switch. Off is today's Terra, so D-046 item 1's "unless the default works untouched" holds.
- **Built before session 1**, Off by default, with rehearsal fixes first (q4). This changes D-003 and PLAN.md's order.
- **An enemy disc shows only while its centre is seen.** Unexplored and explored both hide it (round 1). This changes D-040 item 4, which named never-seen fog only.
- **Doors and secret doors open and close with a tap, per scene** (round 1, review).
- **Darkvision and carried light are per character on the Party sheet** (round 1). A light lights its area for the whole party (review). On one projector the union of each token's own range already shows that area, so no shared-light model is needed.
- **Live sight while dragging is kept only if it fits the speed budget on the laptop.** Morgan's note: "only if we can find a more efficient way".

## Alternatives rejected

- **Look from here on a tap:** Morgan's own test is sight that follows the tokens, and a tap per look fails it whenever the party moves often.
- **A Look button on the HP pad:** two taps per look, which fails the streamlining rule (D-046).
- **Live line-of-sight markers separate from tokens** (D-043's first shape): tokens already exist and are dragged; separate markers would double the drags.
- **A separate Dark switch:** two controls where one does (D-046).
- **Sight always on wherever a map has walls** (critic's suggestion): Morgan chose a per-scene setting that is Off by default (q3, q4), so the rehearsal runs exactly as today.
- **Running the re-look inside `apply`:** `apply` has no walls (`src/core/table.ts:885`), and putting the annotation into the table state would copy it into every save and undo snapshot.
- **Per-character table views:** one projector shows everything to everyone.

## Risks

- **A token not under its mini looks from the wrong place, and players can't unsee what was projected.**
  - Mitigation: Sight is Off by default per scene, Undo restores the fog, and Morgan switches it off for scenes that move too fast to mirror.
- **Each re-look also dims what the DM uncovered by hand.** That is what "the party moves on" means. Accepted, and stated in the walkthrough.
- **A big disc whose centre is behind a wall stays hidden while its edge is in view.** This is Morgan's choice (q2, round 1). There is a test for a size-3 disc.
- **Laptop speed is unknown.** The Problem report gives the slowest re-look; live sight (S5) waits for that number.
- **Old saves:** save version 18 reads versions 1–17 with doors empty, Sight Off, darkvision 0 and light none (GAME-05).
- **The rehearsal finds fixes:** they come first. Each slice merges only when green and leaves Sight Off by default.

## Design

All rules are pure functions in `src/core/`, unit tested (AGENTS.md, GAME-02).

**Faster wall check** (`src/core/wallcheck.ts`)
- `lightFrom` keeps its rays and result: an outline ordered by angle.
- **Index:** a grid of 1-inch cells is built once for the blocking pieces. Each ray walks only the cells it crosses and stops at its first hit.
- **Fewer points:** an outline point is dropped when its neighbours on both sides hit the same wall piece.
- **Prototype, measured in the cloud on generated maps:**
  - 1,974 pieces: 82.9 ms → 3.0 ms, outline 6,366 → 101 points.
  - 316 pieces: 2.8 ms → 0.6 ms.
  - Every old outline point lay on the new outline, checked at four points per map.
- **New `sightFrom(annotation, doors, bounds, p, rangeIn | null): Point[]`**, where `p` and `rangeIn` are in map inches.
  - It uses `blockersFor(annotation, doors)`.
  - Each ray stops at its hit plus ¼ inch, so drawn walls show unbroken. A disc centre at least ½ inch past a wall stays hidden.
  - With `rangeIn`, each ray is clamped to that distance, with arc points every 10° between clamped neighbours.
  - Coordinates are rounded to hundredths. Any outline still over 1,000 points is reduced with Ramer–Douglas–Peucker at 1/32 inch, doubling the tolerance until it fits.
  - A token whose centre lies on a wall line sees both sides of it (tested).
- **Exports:** `blockersFor`, `sightFrom`, and the type `Opening` from `annotation.ts`.

**Doors**
- **State:** `PlacedMap.doors: Record<string, boolean>` (true means open).
  - The key is the opening's kind letter (`d` for a door, `s` for a secret door), then its two ends as stored (hundredths), lower end first by x then y, written as `d:x1,y1,x2,y2`.
  - A door missing from the record uses the library map's `open`. A door redrawn in the editor has new ends, so it starts from its default.
  - Keys that match no opening are ignored. Main drops them when it loads the map's annotation for a re-look.
- **Parsing:** `parsePlacedMap` reads `doors` as at most 5,000 entries (`MAX_ITEMS`), keys up to 80 characters matching `^[ds]:-?[0-9.]+(,-?[0-9.]+){3}$`, and boolean values. A missing record reads as `{}`.
- **Command** `{ type: "door"; key: string; open: boolean }`, undoable. `dmStateOf` keeps `doors`; `playerViewOf` never includes them. The e2e guard at `e2e/app.test.mjs:392` that the table view contains no "door" still holds.
- **Drawing:** the DM map draws closed doors as today and open doors dashed (`src/renderer/walls-draw.ts`).
- **Tapping:**
  - A Select tap is a press and release that moves less than `SLIP_PX`. One that hits no token, disc or pin toggles the nearest door or secret door line within 0.25 map inches, but only while doors are drawn.
  - Doors are drawn while Walls is shown, and always while the scene's Sight isn't Off. In an Off scene with Walls hidden, taps behave exactly as today.
  - No door can be hit until the walls file has loaded (`wallsFor` returns null).

**Sight setting**
- **State:** `Scene.sight: "off" | "on" | "dark"`, default `"off"`. It is not part of `SceneContent`, so Reset leaves it alone.
- **Command** `{ type: "sceneSight"; id: string; sight: "off" | "on" | "dark" }`. It isn't undoable: undo keeps `scenes`, as `main.ts:60` already does.
- **UI:** the scene's "⋯" menu gets `Sight: Off…` (or `On…`, `Dark…`), beside `Curtain: …`. It opens a three-choice form like the curtain form (`src/renderer/dm-scenes.ts`). No new row.
- **Curtains:** `curtainScene` also sets `scene` to the shown scene's id, so `playerViewOf` reads the shown scene's Sight (`src/core/table.ts:450`).

**Re-look** (pure, `src/core/sight.ts`, run by main)
- **Signature key:** `sightKey(state)`, a string built from:
  - the current scene's Sight
  - the map id
  - each token's id and centre
  - the door record
  - which tokens' characters are blinded, incapacitated, paralyzed, petrified, unconscious or down (HP 0)
- **When it runs:** after every command, main compares the key before and after. When it changed and Sight isn't Off, main runs `relook(state, annotation)`.
  - This covers moves, Place party, adding or removing tokens, conditions, HP, doors, switching scenes, Reset and changing Sight.
  - It runs before the undo snapshot and the save, so the command and its re-look are one undo step.
- **What `relook` returns:** the state with a `dimSeen` op and then one `outline` reveal op per seeing token.
  - A seeing token is on the map: its centre lies inside the map's bounds.
  - Its character isn't in the blocking list above.
  - On a dark scene its range is above 0. The range is `max(darkvision ft, light bright+dim ft) / feetPerSquare` inches; a lit scene has no range.
  - If no token sees, `relook` returns the state unchanged, so nothing is dimmed.
- **Annotation cache:** main keeps each library map's annotation, keyed by id, loaded with `loadAnnotation`. The `library:saveWalls` handler (`main.ts:482`) deletes that id from the cache.
- **Timing:** main times each re-look with `performance.now()`. It adds `slowestRelookMs` (this run only, not saved) to `ReportInfo` (`src/core/saves.ts:46`), printed as `Slowest sight update: N ms`.

**Hidden enemies**
- Core helper `discSeen(map, disc, sight)`: true when Sight is Off, or when `fogAt(map.fog, disc centre) === "seen"`.
- `playerViewOf` applies it to `discs`, and passes only seen discs to `stripOf`.
- The DM map draws discs that fail it with a diagonal slash (`src/renderer/dm-map.ts`).

**Party sheet**
- **Fields:** `Character.darkvision: number` (feet, 0–300, rounded to a multiple of 5, default 0) and `Character.light: "none" | "torch" | "lantern"` (the SRD's hooded lantern).
- **Parsing:** `parseCharacterFields` (`src/core/fight.ts:255`) reads them, with defaults when missing.
- **UI:** shown in the party form and on the sheet (`src/renderer/dm-party.ts`) after Speed, as a number box and a three-choice select.
- **Radii:** copied from the SRD 5.2 text at the start of S4, with the source line in a code comment.

**Live while dragging** (S5, built only if the laptop allows)
- While a token is dragged with Sight on, the DM window asks main once per animation frame. Main runs `sightFrom` for the dragged token and sends the outline on `table:sight-live`. The table draws it as uncovered.
- Nothing is stored; the drop runs the normal re-look.
- Built only if the Problem report's slowest re-look on the laptop is under 8 ms with four tokens.

**Saves:** save version 18 (`src/core/table.ts:51`, and the version list at `:1155`).

## Slices

### S1 Faster wall check and doors

- **Morgan tries:** in Thundertree, show Walls, tap a door with Select, and see it go dashed. The walls editor's wall check still shows the same light.
- **Checks that fail now:**
  - `wallcheck.test.ts`: `fast outline matches the reference`. A randomised differential test with a seeded generator compares against the current ray cast, kept in the test file as the reference: every reference point lies on the fast outline within 1e-6 inch, including walls on cell borders.
  - `outline under the fog cap on the dense map`.
  - The J2 unit tests and e2e `open a door`.
- **Files:**
  - `src/core/wallcheck.ts` and the new `wallcheck.test.ts`.
  - `src/core/doors.ts`: keys, defaults and parsing.
  - `src/core/annotation.ts`: export `Opening`.
  - `src/core/table.ts`: `doors`, the door command, save 18.
  - `src/renderer/dm-map.ts`: the tap.
  - `src/renderer/walls-draw.ts`: dashed open doors.
  - `scripts/sight-bench.mjs` and a `bench:sight` script in `package.json`.
  - An e2e test map with two rooms and a door, generated in the test.
- **Waits on:** none

### S2 Sight follows tokens

- **Morgan tries:** set a scene's Sight to On, walk a token from a corridor to a doorway, then open the door.
- **Checks that fail now:** J1, J5, `relook: nothing when no token sees`, `relook: blinded and down tokens add nothing`, `relook: off-map tokens add nothing`, `curtain shows the shown scene's sight`. The Problem report includes the slowest sight update.
- **Files:**
  - `src/core/sight.ts` and its tests.
  - `src/core/table.ts`: `Scene.sight`, `sceneSight`, `curtainScene`.
  - `src/main/main.ts`: the key check, the re-look, the annotation cache, timing.
  - `src/core/saves.ts`: `ReportInfo`.
  - `src/renderer/dm-scenes.ts`: the Sight item.
  - e2e `sight follows a token`.
- **Waits on:** S1

### S3 Hidden enemies

- **Morgan tries:** put a goblin in a dark room during a fight; it and its strip chip appear only when a token sees it.
- **Checks that fail now:** J3, and `size-3 disc hidden while its centre is behind a wall`.
- **Files:** `src/core/table.ts` (`discSeen`, `playerViewOf`), `src/core/fight.ts` (`stripOf` input), `src/renderer/dm-map.ts` (slash), tests, e2e `hidden enemy`.
- **Waits on:** S2

### S4 Dark scenes

- **Morgan tries:** a cave with Sight Dark, one character with darkvision and one with a torch.
- **Checks that fail now:** J4, `parse: darkvision and light`, and `an old save reads darkvision 0 and light none`.
- **Files:** `src/core/fight.ts` (fields, parse), `src/core/sight.ts` (ranges), `src/renderer/dm-party.ts` (form and sheet), tests.
- **Waits on:** S2, and the SRD 5.2 check of torch and hooded lantern radii.

### S5 Live while dragging (built only if the laptop allows)

- **Morgan tries:** drag a token slowly round a corner and watch the table follow.
- **Checks that fail now:** e2e `live sight` sees outlines on `table:sight-live` during a drag, and finds no new fog op until the drop.
- **Files:** `src/main/main.ts`, both preload bridges, `src/renderer/dm-map.ts`, `src/renderer/player.ts`.
- **Waits on:** S2, and the laptop's slowest sight update under 8 ms with four tokens (rehearsal).

## Verification

- Every push: `npm run check`.
- App changes: `xvfb-run -a npm run test:e2e`.
- Speed: `npm run bench:sight` on the cloud and the laptop (not in CI). The laptop number comes from the Problem report.
- End to end: Morgan's table photos for J1–J4 (VER-07).

## Open questions

- Torch and hooded lantern bright and dim radii from the SRD 5.2 text. This is a fact-check before S4, not a decision.
