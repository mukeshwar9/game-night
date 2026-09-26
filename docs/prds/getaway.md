# PRD: GETAWAY (inspired by Magic Maze)

## Summary

Two thieves on one tile map. Neither player controls a thief: each player owns some **moves**
and applies them to **both** pawns. One of you moves pawns north and east and opens doors; the
other moves them south and west and uses vents. Each thief must grab their own loot, then both
reach the exit before a 3-minute clock runs out. Silence is the rule; the only signal is a NUDGE
button.

- **The twist:** interlocking controls plus silence. Nothing moves without both players, and the
  real-time pressure makes it impossible for one person to take charge.
- Players: 2. Category: reflex (co-op). Netcode: RTDB — moves are one tile per tap, so they are
  discrete and latency-tolerant; no WebRTC needed.
- Effort: **M** (map generator with a solver is most of it).

## Rules

1. The map is a grid of **9×11** tiles built from templates: floor, wall, door, vent pair, loot
   (one per thief, marked with the thief's glyph), hourglass, exit.
2. **Commander (X)** owns: move north, move east, open door (adjacent). **Engineer (O)** owns:
   move south, move west, use vent (teleport to the paired vent). Roles swap every heist.
3. Select which pawn to act on (either player may select either pawn); a tap applies that
   move to that pawn by one tile. Pawns cannot share a tile or pass walls/closed doors.
4. The clock starts at **3:00**. Stepping a pawn onto an **hourglass** tile flips it: the clock
   gains **+60 s**, capped at 3:00; each hourglass works once.
5. Each thief must stand on their own loot once (it is then collected). After both loots are
   collected, both pawns must reach the exit tile(s).
6. No typed chat during a heist. The **NUDGE** button flashes your partner's screen with a pulse
   (rate-limited to once every 2 s). Emotes are allowed only while the clock is flipping at an
   hourglass (the classic "talk while the sand turns" window, with our own timing).
7. Escape before 0:00 to win a team star (+1 to both scores). The heist ladder then unlocks a
   bigger map.

## Data model & architecture

`custom: true, coop: true` registry entry (`gameType: 'getaway'`), add to `COOP_GAMES`. Page
`src/pages/GetawayGame.jsx`; logic `src/lib/getawayLogic.js` (map generation from seed,
breadth-first solver over both pawns plus collected flags, move legality, hourglass and win
rules). State under `round` only:

```
round: {
  phase: 'setup' | 'playing' | 'done', seed, level,
  pawns: { a: { r, c, loot }, b: { r, c, loot } }, doors: { [id]: open },
  hourglasses: { [id]: used }, endsAt, owner: { X: 'NE', O: 'SW' },
  nudge: { X: at, O: at }, result
}
```

- Each tap is a small `runTransaction` on `round` (legal-move check inside) so two near-
  simultaneous taps on the same pawn serialise instead of desyncing.
- `endsAt` is a server-clock deadline (`useServerClock`); any client may finish the round when
  the deadline passes (transaction guard).
- Needs the platform `quiet` flag (hide typed chat during `playing`); until it lands the page
  shows a "no talking" banner.
- Lanterns/Docking pattern: `SetupChoices` picks the heist size, the pick generates a solver-
  checked map in a transaction; `TeamHeader` and `RoundEndActions` from `TeamRoundShell.jsx`.

## UI/UX

- 390 px portrait: map on top (9 columns at ~38 px), clock in the header status pill, and at the
  bottom only **your** controls: two big direction arrows plus your special (DOOR or VENT), and
  a pawn toggle (◆ thief / ▲ thief) — both thieves are distinguished by glyph and colour.
- Walls, doors (open/closed), vents (paired by number), loot, hourglass and exit each have a
  distinct glyph; nothing relies on colour alone.
- NUDGE is a wide button that makes the partner's screen border pulse `retro-cta` and plays
  `sounds.go()`.
- Sounds: `sounds.step()` per move, `sounds.bell()` on an hourglass, `sounds.win()` on escape,
  `sounds.buzz()` at 0:00.

## AI / demo mode

A bot partner that follows the solver's plan and applies only its own moves, with a 400–900 ms
reaction delay, makes a good `/demo` for learning the controls.

## Trust model & edge cases

- Honour system; the room is world-readable and the map is public anyway.
- Partner offline: the clock pauses (store remaining ms, clear `endsAt`), resumes on return.
- Generator must reject maps the solver can't clear within the clock budget at a nominal 1.5
  taps per second.
- A nudge storm is prevented by the 2 s client limit plus a transaction check on `nudge/{seat}`.

## Testing (vitest)

`getawayLogic.test.js`: map generation is deterministic per seed; every generated map is
solvable; move ownership (X cannot move south); walls, doors, vents and pawn collision;
hourglass cap and single use; loot and exit win; clock expiry. E2E spec: two players, A moves a
pawn east, B moves it south, both see the pawn at the new tile.

## Milestones

1. Tile templates, generator and solver with tests (1–2 sessions).
2. Page with moves, pawn toggle and clock (1 session).
3. Doors, vents, hourglasses, NUDGE, demo bot (1 session).

## IP notes

Magic Maze is Kasper Lapp's design (Sit Down!). Use our own heist theme, our own tile art and
our own rules text. Do not use the Magic Maze name, its fantasy-mall setting, its hero
characters (mage, barbarian, elf, dwarf) or its tile illustrations.

## Open questions

- Should roles own two directions each (as specced) or split into four for 2P with one extra
  special? Playtest; two each may be too easy.
- Is the emote window during hourglass flips enough signal, or should NUDGE carry a direction?
