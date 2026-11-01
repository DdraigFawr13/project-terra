# Sight

- **Status:** Draft, revised after two passes of fresh-context checks
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
- **Then** the table's fog is seen in room A and unexplored in room B. A second drop moves "seen" with the token, and room A's old view becomes explored. Only `sightFrom`'s reveal and `dimSeen` change the fog.
- **Check:** unit tests in `src/core/sight.test.ts`: `relook reveals the token's room and not past a closed door`, and `a second relook dims the first view`. e2e `sight follows a token` reads `fogAt` on the table bridge's fog.

### J2 Doors

- **Given** that scene, with Walls shown or Sight On
- **When** the DM taps the door with Select
- **Then** the door opens and is drawn dashed, and sight re-looks so room B is seen.
  - Undo closes it again.
  - Reset puts it back as at Mark ready.
  - A second scene placing the same library map keeps its own door state.
- **Check:** unit tests in `src/core/doors.test.ts` (S1). e2e `open a door` taps the door's midpoint, using the map-to-screen transform the existing e2e taps use.

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
- **Check:** unit test `afterCommand: nothing with Sight off` (S2). The existing e2e suite stays unchanged and green.

### J6 Speed and fog storage

- **Given** the dense test map (generated in the test, about 2,000 wall pieces) and four tokens
- **When** a re-look runs
- **Then** every outline has at most 1,000 points and its numbers are rounded to hundredths, so `parseFogOp` reads it back unchanged.
- **Check:** S1's `fast outline has under 1,000 points…` and S2's `outlines read back through parseFogOp unchanged`. Speed is not asserted in tests (flaky on shared runners, VER-04). `npm run bench:sight` prints timings, and the Problem report shows the slowest re-look of the run on the laptop.

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
  - Mitigation: Sight is Off by default per scene, and Undo restores the fog (main records an undo step for every re-look). Morgan switches Sight off for scenes that move too fast to mirror.
- **Each re-look also dims what the DM uncovered by hand.** That is what "the party moves on" means. Accepted, and stated in the walkthrough.
- **A big disc whose centre is behind a wall stays hidden while its edge is in view.** This is Morgan's choice (q2, round 1). There is a test for a size-3 disc.
- **Laptop speed is unknown.** The Problem report gives the slowest re-look; live sight (S5) waits for that number.
- **Old saves:** save version 18 reads versions 1–17 with doors empty, Sight Off, darkvision 0 and light none (GAME-05).
- **The rehearsal finds fixes:** they come first. Each slice merges only when green and leaves Sight Off by default.

## Design

All rules are pure functions in `src/core/`, unit tested (AGENTS.md, GAME-02).

**Faster wall check** (`src/core/wallcheck.ts`)
- **Index:** `blockIndex(annotation, doors, bounds)` puts the blocking pieces from `blockersFor(annotation, doors)` into a grid of 1-inch cells. One re-look builds it once and shares it across all tokens; main keeps it with the cached annotation until the door record or the walls file changes. Each ray walks only the cells it crosses (a DDA grid walk) and stops at its first hit.
- **`lightFrom`** (the editor's wall check) keeps its rays and its result: an outline ordered by angle. It uses the index and drops a point only when it and both its neighbours hit the same wall piece, so the point lies mid-way along that piece.
- **Prototype, measured in the cloud on generated maps:**
  - 1,974 pieces: 82.9 ms → 3.0 ms per outline, 6,366 → 101 points.
  - 316 pieces: 2.8 ms → 0.6 ms.
  - At four points per map, every old outline point lay on the new outline.
- **`sightFrom(index, p, rangeIn | null): Point[]`**, where `p` and `rangeIn` are in map inches. In order:
  1. Cast a ray toward every blocker corner and just either side of it, finding the first hit distance d.
  2. With `rangeIn`, clamp d to `rangeIn`.
  3. Only if the ray stopped at a piece (not at the range), extend it by ¼ inch, so drawn walls show unbroken. A disc centre at least ½ inch past a wall stays hidden.
  4. Drop mid-piece points as `lightFrom` does.
  5. Add arc points every 10° between neighbours that both stopped at the range.
  6. Round to hundredths with `+ 0` (no `-0`).
  7. If over 1,000 points, reduce with Ramer–Douglas–Peucker at 1/32 inch, doubling the tolerance until it fits.
  8. Return `[]` if fewer than 3 points remain.
- A token whose centre lies on a wall line sees both sides of it (tested; D-045 snapping makes it rare).
- **Exports:** `blockersFor`, `blockIndex`, `sightFrom`, and the type `Opening` from `annotation.ts`.
- **Test fixture:** `src/core/sight-fixtures.ts`, test-only like D-041's files, and covered by its "nothing in the app imports these" test. It exports `denseRooms(cols, rows, pillars)`, the prototype's layout:
  - a 42 × 24 inch map split into a grid of rooms with door gaps, half the doors open
  - pillars of radius 0.4 at `(1 + (k·7.3 mod 40), 1 + (k·3.7 mod 22))`
  - `denseRooms(20, 12, 60)` gives about 1,974 pieces
  - the four test points `(21.3, 12.2)`, `(3.1, 2.7)`, `(39.4, 20.6)`, `(10.05, 17.9)`

  The bench imports it too, since Node runs the TypeScript directly.

**Doors** (`src/core/doors.ts`)
- **Key:** `doorKey(opening)` is `d` (door) or `s` (secret door), a colon, then the two ends, lower end first by x then y. Each number is written `(v + 0).toFixed(2)`, giving for example `d:3.25,4.00,3.25,5.00`.
- **State:** `PlacedMap.doors: Record<string, boolean>` (true means open). A door missing from the record uses the library map's `open`. A door redrawn in the editor has new ends, so it starts from its default. Keys that match no opening are ignored and never pruned; the cap bounds them.
- **Parsing:** `parsePlacedMap` reads `doors` with a missing record as `{}`. It drops any entry whose key isn't a well-formed key (`^[ds]:(-?\d+\.\d\d,){3}-?\d+\.\d\d$`) or whose value isn't boolean, keeping the map. It keeps at most 5,000 entries.
- **Command** `{ type: "door"; key: string; open: boolean }`, undoable. It is ignored when the record already holds 5,000 entries and the key is new.
- **Visibility:** `dmStateOf` keeps `doors`; `playerViewOf` never includes them. The e2e guards at `e2e/app.test.mjs:392` and `:722` still hold.
- **Drawing** (`src/renderer/walls-draw.ts`):
  - `drawWalls` gets a `doors` argument and a `doorsOnly` flag.
  - A door or secret door whose effective state is open is drawn in its own colour with dots (`dash: [0.06, 0.18]` inches). Closed ones are drawn as today.
  - With `doorsOnly`, only door and secret-door lines are drawn. `dm-map.ts` uses that whenever the scene's Sight isn't Off and Walls is hidden.
- **Tapping** (`src/renderer/dm-map.ts`):
  - The Select press handler records the press's pixel point when it starts a map drag or pan.
  - On release, if the pointer moved `<= SLIP_PX` and the press hit no party marker, token, disc or pin, it tests the door lines that are drawn (Walls shown, or Sight not Off). The nearest door or secret door within 0.25 map inches toggles with a `door` command, and no `moveMap` is sent for that press.
  - With no walls file loaded yet (`wallsFor` returns null) there is nothing to hit. In an Off scene with Walls hidden, taps behave exactly as today.

**Sight setting**
- **State:** `Scene.sight: "off" | "on" | "dark"`, default `"off"`, and in every `Scene` literal (`table.ts:311`, `:1029`, `:1139`). It isn't part of `SceneContent`, so Reset leaves it alone. `copyScene` copies it.
- **Command** `{ type: "sceneSight"; id: string; sight }`. It isn't in `UNDOABLE`, because `scenes` survive undo (`main.ts:60`).
- **Menu:** the scene's "⋯" menu (`src/renderer/dm-scenes.ts`) gets `Sight: Off…` (or `On…`, `Dark…`) with the existing eye icon, below `Curtain: …`. It opens a form titled "Sight" with three choices, the current one pressed:
  - "Off: fog changes only when you paint it."
  - "On: the table shows what the tokens can see."
  - "On, dark: as On, limited by darkvision and light."

  When the map has no traced walls, the form adds: "This map has no traced walls, so Sight won't change the fog here."
- **Curtains:** `curtainScene` also sets `scene: other.id`, so `playerViewOf` reads the shown scene's Sight (`table.ts:450`).

**Re-look** (`src/core/sight.ts`, pure, called by main)
- **Signature key:** `sightKey(state)`, built from:
  - the current scene's id and Sight
  - the map id and `feetPerSquare`
  - each token's id and centre
  - the door record
  - each token's character darkvision and light
  - which tokens' characters are blinded, incapacitated, paralyzed, petrified, stunned, unconscious or down (HP 0). Stunned is included because the SRD 5.2 Stunned condition includes Incapacitated; checked against the SRD text at S2.
- **`afterCommand(prev, next, command, annotation)`** returns `next` unchanged when any of these holds:
  - the current scene's Sight is Off
  - the command is `switchScene` or `resetScene`, which bring a scene back as it was (D-039)
  - `sightKey` didn't change
  - the annotation has no walls, pillars or doors (`blockersFor` gives only the map-edge box)

  Otherwise it returns `relook(next, index)`.
- **`relook(state, index)`:**
  - Adds a `dimSeen` op through `addFog`.
  - Then, for each seeing token, adds one `outline` reveal op through `addFog` (so the list bakes at 500 ops). A seeing token has its centre inside the map's bounds, isn't blocked by the condition list above, and on a dark scene has a range above 0.
  - The range is `max(darkvision ft, light bright+dim ft) / feetPerSquare` inches on a dark scene, and none on a lit scene.
  - Empty outlines are skipped.
  - When no token sees, only the `dimSeen` is added: the party has moved on.
- **Main** (`src/main/main.ts`), in `state:apply`:
  - Computes `next = afterCommand(state, apply(state, command), command, annotation)`.
  - When `afterCommand` changed the state and the command isn't in `UNDOABLE`, main records an undo step from the state before the command. So switching Sight on, a condition or an HP change can be undone back to the earlier fog.
  - `state:undo` restores a snapshot and runs no re-look.
  - Main caches each library map's annotation by id, loaded with `loadAnnotation`; `library:saveWalls` (`main.ts:482`) deletes that id.
  - Main times each `afterCommand` call that re-looks with `performance.now()`.
- **Problem report:** `ReportInfo.slowestRelookMs: number | null` (this run only, not saved). It prints `Slowest sight update: 4.2 ms` with one decimal, or `Slowest sight update: none yet`.

**Hidden enemies**
- `discSeen(map, disc, sight)` in `src/core/table.ts`: true when Sight is Off, otherwise `fogAt(map.fog, disc centre) === "seen"`.
- `playerViewOf` keeps a disc only if it passes today's filter and `discSeen`, and passes only those discs to `stripOf`. Turn-strip chips and turn rings therefore follow.
- The DM map draws a disc that is On table but fails `discSeen` with a diagonal slash in the warning colour. Discs that are Off table keep today's 45% look and get no slash.

**Party sheet**
- `Character.darkvision: number` (feet, 0–300, default 0) and `Character.light: "none" | "torch" | "lantern"`, read by `parseCharacterFields` (`src/core/fight.ts:255`) with defaults when missing. Darkvision is rounded to the nearest multiple of 5 and clamped.
- In `src/renderer/dm-party.ts` they are added after Speed in the form and on the sheet:
  - "Darkvision (ft)": a number box; a blank box saves 0.
  - "Light": a select with "No light", "Torch" and "Hooded lantern".
- Radii are copied from the SRD 5.2 text at the start of S4, with the source line in a code comment.

**Live while dragging** (S5, built only if the laptop allows)
- While a token is dragged with Sight on, the DM window asks main once per animation frame.
- Main runs `sightFrom` for the dragged token. Only when `viewOf(state) === "map"`, like pings (`main.ts:456`), it sends the outline on `table:sight-live`. The table draws it as uncovered.
- Nothing is stored; the drop runs the normal re-look.
- Built only if the Problem report's slowest sight update on the laptop is under 8 ms with four tokens.

**Saves:** save version 18 (`src/core/table.ts:51`, and the version list at `:1155`) reads versions 1–17 with the defaults above.

## Slices

### S1 Faster wall check and doors

- **Morgan tries:** in Thundertree, show Walls, tap a door with Select, and see it go dotted. The walls editor's wall check still shows the same light.
- **Checks that fail now:**
  - In `src/core/wallcheck.test.ts`, with the current ray cast kept in the test as the reference:
    - `fast outline agrees with the reference`: seeded random walls, including walls on cell borders, at 50 points. Every reference point lies on the fast outline within 1e-6 inch.
    - `fast outline has under 1,000 points and fewer than the reference on denseRooms(20, 12, 60)`.
  - In `src/core/doors.test.ts`: `open per scene`, `reset restores`, `undo`, `a secret door and a door on the same line don't collide`, `bad keys are dropped on load`, `no new key past 5,000`.
  - e2e `open a door`: the map comes from a generated VTT file, imported the way the existing VTT test does (`e2e/app.test.mjs:665-720`). The door's screen point is found the way that test finds positions (`:525-537`).
- **Files:**
  - `src/core/wallcheck.ts`, `wallcheck.test.ts`, `sight-fixtures.ts`.
  - `src/core/doors.ts`, `doors.test.ts`.
  - `src/core/annotation.ts`: export `Opening`.
  - `src/core/table.ts`: `doors`, the door command, save 18.
  - `src/renderer/dm-map.ts`, `src/renderer/walls-draw.ts`.
  - `scripts/sight-bench.mjs` and a `bench:sight` script in `package.json`, which times `afterCommand` with `apply`, `addFog` and `playerViewOf` included.
  - `e2e/app.test.mjs`.
- **Waits on:** none

### S2 Sight follows tokens

- **Morgan tries:** set a scene's Sight to On, walk a token from a corridor to a doorway, then open the door.
- **Checks that fail now:** in `src/core/sight.test.ts`:
  - J1's two tests.
  - `afterCommand: nothing with Sight off`.
  - `nothing on a map without walls`.
  - `nothing after switchScene or resetScene`.
  - `relook: blinded, stunned and down tokens add nothing`.
  - `off-map tokens add nothing`.
  - `no seeing token only dims`.
  - `a darkvision edit re-looks on a dark scene`.
  - `outlines read back through parseFogOp unchanged`.
  - `1,000 re-looks keep the fog list under MAX_FOG_OPS and the save round-trips`.

  Plus e2e `sight follows a token`, and the Problem report line `Slowest sight update`.
- **Files:**
  - `src/core/sight.ts`, `sight.test.ts`.
  - `src/core/table.ts`: `Scene.sight`, `sceneSight`, `curtainScene`.
  - `src/main/main.ts`: `afterCommand`, the undo step, the annotation and index cache, timing.
  - `src/core/saves.ts`: `ReportInfo`.
  - `src/renderer/dm-scenes.ts`: the menu item and the form.
  - `src/renderer/dm-map.ts`: `doorsOnly`.
  - `e2e/app.test.mjs`.
- **Waits on:** S1

### S3 Hidden enemies

- **Morgan tries:** put a goblin in a dark room during a fight; it and its strip chip appear only when a token sees it.
- **Checks that fail now:** J3's unit test, `a size-3 disc is hidden while its centre is behind a wall`, `a curtain scene with Sight on hides its unseen discs`, and e2e `hidden enemy`.
- **Files:** `src/core/table.ts` (`discSeen`, `playerViewOf`), `src/renderer/dm-map.ts` (the slash), tests, `e2e/app.test.mjs`.
- **Waits on:** S2

### S4 Dark scenes

- **Morgan tries:** a cave with Sight Dark, one character with darkvision and one with a torch.
- **Checks that fail now:** J4, `parse: darkvision and light`, and `an old save reads darkvision 0 and light none`.
- **Files:** `src/core/fight.ts` (fields, parse), `src/core/sight.ts` (ranges), `src/renderer/dm-party.ts`, tests.
- **Waits on:** S2, and the SRD 5.2 check of torch and hooded lantern radii.

### S5 Live while dragging (built only if the laptop allows)

- **Morgan tries:** drag a token slowly round a corner and watch the table follow.
- **Checks that fail now:**
  - e2e `live sight` sees outlines on `table:sight-live` during a drag and none while the curtain is down.
  - No new fog op is added until the drop.
- **Files:** `src/main/main.ts`, both preload bridges, `src/renderer/dm-map.ts`, `src/renderer/player.ts`.
- **Waits on:** S2, and the laptop's slowest sight update under 8 ms with four tokens (rehearsal).

## Verification

- Every push: `npm run check`.
- App changes: `xvfb-run -a npm run test:e2e`.
- Speed: `npm run bench:sight` on the cloud and the laptop (not in CI). The laptop number comes from the Problem report.
- End to end: Morgan's table photos for J1–J4 (VER-07).

## Open questions

- Torch and hooded lantern bright and dim radii from the SRD 5.2 text. This is a fact-check before S4, not a decision.
