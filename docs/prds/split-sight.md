# PRD: SPLIT SIGHT (inspired by Fireboy & Watergirl, BOKURA, Death Squared)

## Summary

Two explorers on one tile grid, each moving their own token one tile per tap. The catch: your
screen shows only the hazards that are deadly to **your partner**, never your own. You are your
partner's eyes, and they are yours. Pressure plates open doors for each other; both must reach
the exit.

- **The twist:** split screens. Every level needs both players to describe what they see, and
  every step is a small act of trust.
- Players: 2. Category: board (co-op puzzle). Netcode: RTDB, discrete moves.
- Effort: **M–L** (level content: 30+ hand-made levels, or a generator checked by a solver).

## Rules

1. The level is an **8×10** grid. Explorer ◆ belongs to X and explorer ▲ to O. Each moves one
   tile per tap in four directions; explorers cannot share a tile.
2. Hazards come in two kinds: **spikes** are deadly to ◆ and harmless to ▲; **ember** tiles are
   deadly to ▲ and harmless to ◆. X's screen shows only ember (O's danger); O's screen shows only
   spikes (X's danger).
3. Walls, plates, doors and the exit are visible to both.
4. A **plate** opens its linked door while an explorer stands on it; some doors latch open for
   good (shown with a lock glyph).
5. Stepping onto your own deadly hazard ends the attempt: both explorers return to the start
   and the attempt counter goes up. Three attempts per level earn ★★★ on the first, ★★ on the
   second, ★ on the third; a fourth failure still lets you retry with no stars.
6. Both explorers on the exit clears the level. Clearing a level with any stars adds a team
   star (+1 to both scores); the room moves on to the next level.

## Data model & architecture

`custom: true, coop: true` registry entry (`gameType: 'splitsight'`), add to `COOP_GAMES`. Page
`src/pages/SplitSightGame.jsx`; logic `src/lib/splitSightLogic.js` (level parsing, move
legality, plates/doors, hazard death, stars) plus a breadth-first solver over both explorers'
positions and door state, used by tests and by the generator. Levels live in
`src/lib/levels/splitsight/` as small text maps, following the `src/lib/levels/arrows`
precedent, lazy-loaded with the page. State under `round` only:

```
round: {
  phase: 'setup' | 'playing' | 'cleared' | 'done', level,
  pos: { X: { r, c }, O: { r, c } }, latched: { [doorId]: true },
  attempts, stars, lastMove, result
}
```

- Each tap is a `runTransaction` on `round` so the two explorers' moves serialise (a door
  opened by a plate is decided inside the same transaction as the move).
- Hazard layout is part of the level file, so both clients know both hazard sets; the page
  simply renders only the partner's set. That is fine under co-op honour rules.
- Lanterns/Docking pattern: `SetupChoices` picks CONTINUE (next unsolved level) or a chapter;
  `TeamHeader` and `RoundEndActions` come from `TeamRoundShell.jsx`.

## UI/UX

- 390 px portrait: the 8×10 grid at ~42 px tiles on top, a four-way d-pad at the bottom (big
  buttons, also arrow keys through `useGameKeys`).
- Hazards you can see are drawn with a hatched pattern and their own glyph (✶ spikes, ≈ ember)
  plus a label in the legend "DANGER FOR ▲". Nothing is colour-only.
- A **ping** button lets you drop a marker on a tile your partner sees (a pulsing ring) for
  players without voice; rate-limited to one live ping per player.
- Sounds: `sounds.step()` per move, `sounds.wall()` on a blocked move, `sounds.bust()` on a
  hazard death, `sounds.win()` on a clear.

## AI / demo mode

The solver can drive a bot partner for `/demo`: the bot plays its explorer along the solver's
path, waiting for the human's moves where the plan needs them. Good for teaching the "you see
their danger" idea.

## Trust model & edge cases

- Honour system: the full level, including your own hazards, is in the lazy-loaded level file
  and derivable from the room. Peeking only ruins your own puzzle.
- Partner offline: the level waits; no solo takeover.
- A move into a door that a partner is about to open is rejected; the transaction guarantees a
  consistent door state.
- Level progress lives in the room's round (carried across PLAY AGAIN); NEW MATCH restarts at
  level 1.

## Testing (vitest)

`splitSightLogic.test.js`: level parsing; movement, walls and collisions; plate/door timing and
latching; each hazard kills only its owner; attempts and stars; exit clear. A level test runs
the solver on every shipped level and asserts it is solvable **and** that neither explorer can
solve it while ignoring the other's view (no path avoids all hazards for both without
coordination). E2E spec: A steps onto a plate, B walks through the opened door, both see it.

## Milestones

1. Logic + solver + tests + 10 hand-made levels (2 sessions).
2. Page, d-pad, hazard views, ping (1 session).
3. 20 more levels (or a generator using the solver), demo bot (1–2 sessions).

## IP notes

Fireboy & Watergirl (Oslo Albet), BOKURA and Death Squared are protected in their names, art and
level designs. Keep the elements original (not fire and water), use our own art and write every
level ourselves. Do not recreate their levels, characters or temple/robot settings.

## Open questions

- Hand-made levels only, or a generator from the start? Lean: 30 hand-made levels for v1; a
  generator later once the solver is proven.
- Should each explorer see a faint "unknown" shading on tiles their partner has pinged as
  dangerous, or keep the ping purely ephemeral?
