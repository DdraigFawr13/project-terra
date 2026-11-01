# Sight

- **Status:** Draft
- **Planned in:** [round 1](https://claude.ai/artifact/LqReE9S5xvJ8YyGR5biVQw), [review and round 2](https://claude.ai/artifact/TuP8RVmukWHzrtxsT8bVoJ) (2026-11-01). **Decisions:** D-040, D-043, D-044; new entry at approval.

## Problem

In Morgan's words: "Sight should be dynamic with where the player tokens are and where the light is." The moment it is for: "when players want to try to see around corners or enter a room and maybe there are enemies hiding that they would not see from the doorway." Today Morgan uses the brush or keeps things hidden, and "brushes aren't as immediate as sight and kind of take time and clicks to set up."

## Goals

- Dropping a character token reveals on the table what the party can see from where its tokens stand, cut off by walls, pillars and closed doors, and on a dark scene by darkvision and carried light.
- Enemy discs the party can't see stay off the table, so a room entered from the doorway can hide what's in it.
- Doors open and close per scene during play.
- No lag: a re-look finishes within one frame (16 ms) on the laptop with every token on the densest traced map. Measured on the laptop, not assumed.
- Sight can be switched off per scene. Off behaves exactly as Terra does today.

## Non-goals

- Spells and magic that change vision (truesight, Darkness, Light, Dancing Lights): Morgan, round 1.
- Separate views for a split party: one projector shows the union of what the party sees (D-040).
- Walls blocking sound (dropped until something uses sound; changes D-040 item 3).
- Light sources placed on the map, time of day, cone lights such as a bullseye lantern (Later, D-040 item 5).
- Curtains, bars and low walls (After, review round).
- Blocking movement: Terra never stops a mini from moving.

## Journeys and checks

### J1 Sight on drop

- **Given** a lit scene with Sight On, a traced map with two rooms joined by a closed door, and one character token in room A
- **When** the DM drags the token across room A and drops it
- **Then** the table shows room A seen and room B never seen. **Check:** core unit test `sight: a drop reveals the token's room and not past the closed door`; e2e `sight on drop` reads the table window's fog state.

### J2 Doors

- **Given** that scene
- **When** the DM, with Select, taps the door on the DM map
- **Then** the door opens, sight re-looks, and room B is seen from the token. Undo closes it. Reset puts it back as it was at Mark ready, and a second scene using the same library map keeps its own door state. **Check:** unit tests `doors: open per scene`, `doors: reset restores`, `doors: undo`; e2e `open a door`.

### J3 Hidden enemies

- **Given** Sight On and an enemy disc set On table in room B, room B never seen
- **When** the table renders
- **Then** the disc is not in the table window's state at all, and the DM map draws it at 40% opacity. After the door opens and the token sees its centre, it appears. When the party moves on and room B is dimmed, it disappears again. **Check:** unit test `playerViewOf: enemies show only where their centre is seen`; e2e `hidden enemy` asserts the disc id is absent from the table bridge state (D-002).

### J4 Dark scene

- **Given** Sight On and dark, a token whose character has darkvision 60 ft on a 5 ft-per-square map, and a second token carrying a torch
- **When** a token is dropped
- **Then** the first token reveals up to 12 inches (60 ft) and the torch carrier up to its torch's bright-plus-dim radius from the SRD, each cut by walls. **Check:** unit test `dark: sight stops at darkvision and light radius`.

### J5 Off

- **Given** a scene with Sight Off (the default, and every scene in an old save)
- **When** tokens are dropped and doors tapped
- **Then** fog changes only by the DM's own brush and shapes, and enemy discs follow their On table switch as today. Doors still open and close (they cost nothing while Off). **Check:** unit test `sight off: drops change no fog`; the existing e2e suite stays green unchanged.

### J6 Speed

- **Given** the densest map in the tests (about 2,000 wall pieces) and four tokens
- **When** a re-look runs
- **Then** it computes in under 16 ms in CI, and every outline has at most 1,000 points. **Check:** `node scripts/sight-bench.mjs` prints the time per token and fails over 16 ms for four tokens; unit test `wallcheck: outline under the fog cap`.

## Decisions

- Sight follows tokens on drop, not with a tap or a Look button (round 2 q1; D-045's tap still opens the HP pad).
- A token sees from its centre (q2). A character without a token on the map adds no sight (q5).
- One Sight control per scene: Off / On / On and dark (q3). It replaces a separate Dark switch.
- Build before session 1, off by default; rehearsal fixes come first (q4; changes D-003 and PLAN.md's order).
- An enemy disc shows only while its centre is in seen fog; never-seen and dimmed both hide it (round 1).
- Doors and secret doors open and close with a tap, per scene (round 1, review).
- Darkvision and carried light are per character on the Party sheet (round 1). A carried light lights its area for the whole party (review). On one projector that equals the union of each token's own range, so no shared-light model is needed.
- Live sight while dragging is kept only if it fits the speed budget on the laptop (Morgan's notes: "only if we can find a more efficient way").

## Alternatives rejected

- **Look from here on a tap:** rejected because Morgan's own test is sight that follows the tokens, and a tap per look fails it. It would fail whenever the party moves often.
- **A Look button on the HP pad:** two taps per look. It fails the streamlining rule (D-046).
- **Live line-of-sight markers separate from tokens** (D-043's first shape): rejected because tokens already exist (D-045) and the DM already drags them. Separate markers would mean a second drag per mini.
- **A separate Dark switch:** two controls where one does the job (D-046).
- **Per-character table views:** one projector shows everything to everyone.
- **A shared-light model** (light from one carrier lit for everyone, intersected with each viewer's sight): it gives the same union on one projector at more cost. It would only matter with per-player views.

## Risks

- **A token not under its mini looks from the wrong place, and an uncover can't be taken back from the players' memory.** → Sight is per scene and off by default; Undo restores the fog; Morgan switches it off for scenes that move too fast to mirror.
- **Laptop speed is unknown.** → J6 in CI, plus the slowest re-look time in the Problem report (step 7g), so the rehearsal measures it with no new UI. Live sight (S5) waits for that number.
- **A dimSeen on every drop also dims areas Morgan uncovered by hand.** → That is what "the party moves on" means; with Sight Off nothing changes. Stated in the walkthrough.
- **Old saves.** → Save version 18 reads 1–17 with doors empty, Sight Off, darkvision 0, light none (GAME-05).
- **The rehearsal finds fixes.** → They come first; each slice merges only when green and leaves Sight Off by default.

## Design

All logic is in `src/core/`, pure and unit tested (AGENTS.md).

- **Faster wall check** (`src/core/wallcheck.ts`):
  - Keep `lightFrom`'s rays and its result shape. Add a grid index of 1-inch cells built once per annotation and door state. Each ray walks only the cells it crosses (a DDA grid walk) and stops at the first hit.
  - Drop outline points that lie between two points on the same wall piece.
  - Prototype, measured in the cloud on synthetic maps: 1,974 pieces went from 82.9 ms to 3.0 ms, outline 6,366 to 101 points; 316 pieces went from 2.8 to 0.6 ms. At four test points each, every old outline point lies on the new outline.
  - Then add `sightFrom(annotation, doors, bounds, p, rangeIn | null)`: `lightFrom` with the given door state, and when `rangeIn` is set, each ray clamped to that distance, with arc points every 10° between clamped neighbours.
  - Any outline still over 1,000 points is reduced with Ramer–Douglas–Peucker at 1/32 inch, doubling the tolerance until it fits.
- **Doors:**
  - `PlacedMap.doors: Record<string, boolean>`. The key is a door's two ends rounded to 1/8 inch, `"x1,y1,x2,y2"`, with the ends in sorted order. The value is open.
  - A door missing from the record uses the library map's `open`. Moving a door in the editor resets it to that default.
  - Because doors live on `PlacedMap`, scenes, Mark ready, Reset, undo and saves carry them with no extra code.
  - New command `{ type: "door"; key: string; open: boolean }`, undoable. The wall check and sight read the door state through one helper, `blockersFor(annotation, doors)`.
- **Tapping a door:** with Select, a tap within 1/4 inch of a door or secret door line on the DM map sends the door command. The nearest line wins. It doesn't apply while the Uncover or Dim brush is active. The walls switch doesn't need to be on. The DM map draws doors only while walls are shown, as today.
- **Sight control:**
  - `Scene.sight: "off" | "on" | "dark"`, default `"off"`. It is not part of `SceneContent`, so Reset leaves it alone.
  - In Setup → Scenes, each scene's row gets one button showing `Sight: Off`, `Sight: On` or `Sight: Dark`. Tapping it cycles Off → On → Dark → Off. It adds no new row (D-046).
  - Switching to On or Dark runs a re-look.
- **Re-look** (a pure function in `src/core/sight.ts`, applied inside the command reducer so it saves and undoes with the command that caused it):
  - It runs after a `token` command that places or moves a token, after a `door` command, and after switching Sight on, when the current scene's Sight isn't Off.
  - It appends a `dimSeen` op, then one `outline` reveal op per token on the map whose character isn't Blinded, Incapacitated, Paralyzed, Petrified or Unconscious.
  - Each outline is `sightFrom` from the token's centre. On a dark scene the range is `max(darkvision ft, light bright+dim ft) / feetPerSquare` inches; on a lit scene there is no range.
  - Fog baking at 500 ops is unchanged.
- **Hidden enemies:** `playerViewOf` keeps a disc only if it passes today's filter and, when Sight isn't Off, `fogAt(map.fog, centre) === "seen"`. The DM map draws filtered-out discs at 40% opacity.
- **Party sheet:** `Character.darkvision: number` (feet, 0–300, step 5, default 0) and `Character.light: "none" | "torch" | "lantern"`. Both are shown on the character's tab under Speed. Light radii are copied from the SRD 5.2 equipment text before S4 is built; the values aren't checked yet.
- **Live while dragging (S5, gated):**
  - While a token is dragged with Sight on, the DM window computes `sightFrom` outlines at most once per animation frame and sends them on a new `table:sight-live` channel. The table draws them as uncovered over the fog.
  - Nothing is stored. The drop commits the normal re-look.
  - Built only if the Problem report's slowest re-look on the laptop stays under 8 ms with four tokens.
- **Save version 18.** It reads versions 1–17 with the new fields at their defaults.

## Slices

### S1 Faster wall check and doors

- **Morgan tries:** in Thundertree, tap a door with Select to open it; the walls editor's wall check still matches; it feels instant.
- **Checks that fail now:**
  - `wallcheck: same outline as before on the 2D fixtures`
  - `wallcheck: outline under the fog cap`
  - `doors: open per scene`, `doors: reset restores`, `doors: undo`
  - e2e `open a door`
  - `scripts/sight-bench.mjs` under 16 ms
- **Files:**
  - `src/core/wallcheck.ts`: grid index, trimming, `blockersFor`, `sightFrom`.
  - `src/core/doors.ts`: door keys and the default lookup.
  - `src/core/table.ts`: `doors` on PlacedMap, the door command, save 18.
  - `src/renderer/dm-map.ts`: tap to toggle.
  - `src/renderer/dm-walls.ts`: the editor uses the door defaults.
  - `scripts/sight-bench.mjs`: the timing check.
  - Tests next to each file. `e2e/` gets a door journey.
- **Waits on:** none

### S2 Sight on drop (lit scenes)

- **Morgan tries:** switch a scene's Sight to On, walk a token from a corridor to a doorway, then open the door.
- **Checks that fail now:** J1, J5, `sight: dimSeen then one reveal per token`, `sight: blinded tokens add nothing`; the Problem report shows the slowest re-look.
- **Files:**
  - `src/core/sight.ts`: re-look.
  - `src/core/table.ts`: `Scene.sight`, wiring the re-look into the reducer.
  - `src/renderer/dm-scenes.ts`: the Sight button.
  - The Problem report code: the slowest re-look time.
  - Tests. e2e `sight on drop`.
- **Waits on:** S1

### S3 Hidden enemies

- **Morgan tries:** put a goblin in a dark room; it appears only when a token sees it.
- **Checks that fail now:** J3.
- **Files:**
  - `src/core/table.ts` (`playerViewOf`).
  - `src/renderer/dm-map.ts`: 40% drawing.
  - Tests. e2e `hidden enemy`.
- **Waits on:** S2

### S4 Dark scenes

- **Morgan tries:** a cave set to Sight: Dark, with one character with darkvision and one with a torch.
- **Checks that fail now:** J4, `parse: darkvision and light`, an old save reads them as 0 and none.
- **Files:**
  - `src/core/fight.ts`: Character fields.
  - `src/core/sight.ts`: ranges.
  - The Party sheet renderer: two fields.
  - `src/core/table.ts`: parse.
  - Tests.
- **Waits on:** S2, plus the SRD 5.2 check of torch and lantern radii.

### S5 Live while dragging (gated)

- **Morgan tries:** drag a token slowly round a corner and watch the table follow.
- **Checks that fail now:** e2e `live sight` sees outlines on `table:sight-live` during a drag; nothing is saved until the drop.
- **Files:** `src/main/` (the channel), the preload bridges, `src/renderer/dm-map.ts`, `src/renderer/player.ts`.
- **Waits on:** S2, and the laptop's re-look time under 8 ms with four tokens (rehearsal).

## Verification

- Every push: `npm run check`.
- App changes: `xvfb-run -a npm run test:e2e`. S1 adds `node scripts/sight-bench.mjs` to `npm run check`.
- End to end: Morgan's table photos for J1–J4 at the rehearsal or after (VER-07); the laptop's slowest re-look comes from the Problem report.

## Open questions

- Torch and lantern bright and dim radii, from the SRD 5.2 text (fact-check before S4, not a decision).
