# PRD: TWIN PATH (inspired by Fireboy & Watergirl and PICO PARK)

## Summary

A real-time co-op platformer for two. Each character is immune to one element and dies in the
other: the Ember (X) walks through heat vents but not frost pools; the Frost (O) the reverse.
Levers, pressure plates and moving platforms only work when someone stands on them, so each
level needs both players to open the way for each other. Both must reach the double door.

- **The twist:** split abilities. You constantly trade places ("you hold the plate, I'll cross
  the vent, then I pull the lever for you"). It is the only action co-op on the shelf.
- Players: 2 (co-op). Category: `reflex`. Netcode: **WebRTC P2P**, the existing realtime stack
  (host-authoritative), not RTDB.
- Effort: **L**. A physics sim, a level format, and 20+ hand-made levels. Build only after the
  turn-based co-op games prove the shelf.

## Rules

1. A level is a tile map (32×18 tiles) with walls, ledges, heat vents (deadly to Frost), frost
   pools (deadly to Ember), neutral goo (deadly to both), plates, levers, gates and platforms.
2. Each player moves left/right and jumps. Characters can stand on each other's heads.
3. A plate is active while any character stands on it; a lever toggles on touch; gates and
   platforms wired to them open or move.
4. Gems of each element are optional collectibles (Ember takes heat gems, Frost frost gems).
5. Dying in the wrong element restarts the level for both (no lives; it is a puzzle).
6. The level is cleared when both stand in the double door. Stars: ★ clear, ★★ all gems,
   ★★★ under the par time.
7. Levels unlock in order; a match is "clear the next level together".

## Data model & architecture

`custom: true, realtime: true, coop: true, hidePlayerCards: true` registry entry
(`gameType: 'twinpath'`), page `src/pages/TwinPathGame.jsx`, sim `src/lib/twinPathLogic.js`,
levels `src/lib/levels/twinPath/*.js` (the `src/lib/levels/arrows` precedent), controls
`src/hooks/useTwinPathControls.js`. Add `'twinpath'` to `COOP_GAMES` in `src/lib/matchRules.js`.

Gameplay does not go through RTDB. Follow the Pong/Sumo pattern (CLAUDE.md "Real-time games"):

- Pure sim: `createState(level)`, fixed-timestep `step(state, inputs, dt)` with AABB tile
  collision, `getOutcome(state)` → `null | 'dead' | 'cleared'`. No DOM, unit-tested.
- Transport: `src/lib/realtime/rtc.js`; X hosts the sim and streams ~30 Hz snapshots, O predicts
  its own character locally and reconciles. Opt into `equalizeHostInput` so the host's
  latency advantage is capped (the Human: Fall Flat complaint).
- Firebase keeps the room: `round: { phase, level, unlocked, bestTimes, result }` plus signaling.
  Everything sits under `round`, so no `FIELD_NULLS` changes; only X writes `round/result` via
  `runTransaction` when the sim reports `cleared`, and a clear adds +1 to both `scores`.
- `SetupChoices` from `TeamRoundShell.jsx` becomes the level picker; `RoundEndActions` handles
  NEXT LEVEL (PLAY AGAIN) / NEW MATCH / SWITCH.

## UI/UX

- **Landscape is preferable** for a platformer; in 390 px portrait, show the level scaled to
  width (~11 px tiles) on top and a control pad below (◀ ▶ and JUMP, 56 px targets). Offer a
  rotate hint but do not require it.
- DOM/CSS arena themed with `--c-*` vars (as the Pong family does), not canvas. Hazards use
  pattern plus glyph, not colour alone: heat vents with "≋" flames, frost pools with "❄" tiles,
  goo with "☠". Ember and Frost carry letter badges E/F.
- Reconnecting overlay and WAIT / CLAIM WIN come from the realtime shell; for coop, replace
  CLAIM WIN with "LEAVE" (coop games never claim wins).
- Sounds: `sounds.step()` for jumps, `sounds.drop()` on plates, `sounds.win()` on clear.

## AI / demo mode

`/demo/twinpath` runs the sim locally with both characters on one device: arrow keys for Ember,
WASD for Frost (the classic couch mode). No bot; a partner AI for platforming puzzles is not
worth its cost.

## Trust model & edge cases

- Host-authoritative sim; a modified host can cheat only its own team.
- Connection failures: the P2P stack fails for 5–10% of pairs on STUN only; TURN via
  `VITE_TURN_*` helps. Show the existing RETRY flow.
- Guest input lag on moving platforms: predict platform motion on the guest from the level data
  (platforms are deterministic), so only character contact needs reconciling.
- Partner leaves mid-level: pause; the other can wait or switch games.

## Testing

Vitest: collision against tile fixtures (floor, wall, ceiling, one-way ledge); element deaths per
character; plate/lever/gate wiring; standing on the partner's head; `getOutcome` cleared only
with both in the door; every shipped level parses and has a reachable door (a BFS over a coarse
reachability graph). E2E: realtime flows are hard to automate; add a smoke spec that loads the
page and the `/demo` sim, and do real two-device testing before shipping.

## Milestones

1. Sim + collision + tests (2 days).
2. Level format, 5 tutorial levels, editor notes (2 days).
3. Realtime page on the Pong stack, prediction for the guest (2 days).
4. 15+ more levels, par times, stars (2–3 days).

## IP notes

Fireboy and Watergirl (Oslo Albet) and PICO PARK (TECOPARK) are brands with distinctive art.
Use TWIN PATH, our own Ember/Frost characters, our own tiles and our own levels. Do not use fire
and water as the element pair, the temple setting, or any level layouts from either series.

## Open questions

- Is portrait play acceptable, or should the page require landscape?
- Ship with a level editor for the captain, or hand-write levels as data files?
