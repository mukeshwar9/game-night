# PRD: Paint Territory

## Summary

A 60-second Splatoon-lite. Two players zip around a 20×20 grid, painting every cell they
cross in their color. Crossing **enemy paint slows you to 70% speed**; repainting it is how
you fight back. When the timer hits zero, the bigger territory wins.

- **The twist:** movement *is* the weapon. There's no shooting — cutting a wide swath
  through the middle of enemy territory both scores and creates slow-zones that trap the
  opponent on your paint.
- Players: 2. Category: reflex. Netcode: **WebRTC P2P host-authoritative** (Pong/Tron
  stack). Effort: **M/L** (the grid-snapshot strategy is the one genuinely new piece).

## Rules

1. Arena: 20×20 cells (400), all neutral at start. Players spawn in opposite corners,
   painting from the first frame.
2. Continuous movement, 4-direction steering with instant turns (Tron-style input feel);
   base speed ~7 cells/s. The cell under a player becomes their color every time they
   enter it (repainting enemy cells allowed and central to play).
3. Speed modifiers: own paint = 100%, neutral = 100%, enemy paint = 70%.
4. Players pass through each other (no collision in v1 — keeps the sim trivial and the
   game about routing, not bumping).
5. Timer: 60 s, counting down on the host sim. At zero: most cells wins;
   equal → `winner: 'draw'`.
6. Live score bar shows the paint split at all times — the game is a constantly visible
   tug-of-war.

## Architecture & data model

`custom: true` (`gameType: 'paint'`, `category: 'reflex'`), page `src/pages/PaintGame.jsx`.

- **Pure sim** `src/lib/paintLogic.js`: `createState()`, `step(state, inputs, dt)` →
  `{ state, events }` (events: cellPainted, cellStolen, tick), `computeAI(state, side,
  difficulty)`, `counts(state)`, `getWinner(state)`. Grid is a `Uint8Array(400)`
  (0 neutral / 1 X / 2 O) internally.
- **Transport — the design decision of this game:** unreliable channel means every
  snapshot must be self-contained (Pong rule). The full grid is 400 cells = **100 bytes at
  2 bits/cell** — small enough to ship in **every** ~30 Hz snapshot alongside
  `{ players, timer, counts }` (~130 B/snapshot ≈ 4 KB/s). **No deltas, no keyframes, no
  desync class of bugs.** Guest predicts its own movement locally (Pong's own-paddle
  pattern) and paints optimistically; host grid overwrites on each snapshot (visually
  invisible in practice — corrections only on contested cells).
- **Firebase keys** (`FIELD_NULLS`): `paintScoreX`, `paintScoreO` (written by the host
  every ~2 s, human-speed, for spectators), `signaling`. No `currentTurn`. At timer zero
  the host runs the standard `winner` transaction (+`scores`), WinEffect, `recordMatch`.

## UI/UX

- `src/components/PaintArena.jsx` — DOM grid of 400 divs (Snake/Tron scale — fine).
  Neutral cells `bg-retro-surface`; painted cells `bg-retro-tint-p1/p2` with brighter
  `bg-retro-p1/p2` for the freshest ~10 cells per player (a glowing "wet paint" trail).
  Update strategy: per-frame, diff previous vs new grid and touch only changed cells'
  classNames (typically < 15/frame).
- Players: chunky glowing squares (`shadow-neon-p1/p2`) that stretch slightly along their
  movement axis. Slowdown state: player blinks dim + tiny drag particles.
- Top bar: the split score bar (p1 color grows from left, p2 from right, contested
  midpoint glows `cta`) + `font-pixel` countdown that flashes at 10 s (`animate-blink`).
- Controls: `usePaintControls` = Tron's input hook pattern (arrows/WASD + swipe on touch).
- Sounds: soft `sounds.move()` tick every ~20 painted cells, `sounds.wall()` when hitting
  the slow-zone, `sounds.bell()` at 10 s warning, standard win/lose/draw. Keep paint audio
  sparse — 60 s of constant painting must not be noisy.

## AI / demo mode

`/demo` → `PaintDemo` vs `computeAI`: greedy region routing — steer toward the largest
reachable neutral/enemy region weighted by distance and slow-zone cost, re-planned every
~500 ms with a reaction handicap; final 10 s switches to stealing the opponent's largest
contiguous region. Difficulty = re-plan rate + speed cap.

## Edge cases

- Full-grid snapshots make dropped packets harmless (self-healing state).
- Guest optimistic painting vs host truth: contested same-frame cells resolve to host
  order; the 1-snapshot flicker is acceptable (documented behavior, invisible in playtests
  at typical RTTs).
- Tab hidden mid-match (host): rAF throttling pauses the sim — same known limitation as
  Pong; the fixed-timestep accumulator prevents physics jumps on resume.
- NAT failure: standard "CONNECTION FAILED / RETRY" surface.
- Draw at 200/200 is real and fine (`winner: 'draw'`).

## Testing (vitest)

Movement/steering on the grid (cell entry paints); speed modifier application; repaint
steal accounting (`counts` invariants: sum ≤ 400, monotonic timer); step determinism
(input script → state hash, host/guest contract); grid pack/unpack (2-bit codec)
round-trip; `getWinner` at timer zero incl. draw; AI never steers off-grid.

## Milestones

1. `paintLogic.js` sim + 2-bit codec + tests (1 day).
2. Arena component + diff-based rendering + controls + demo vs AI (1.5 days).
3. P2P wiring + optimistic-paint prediction + two-device testing (1–1.5 days).
4. Registry, icon, score-bar polish (half day).

## Open questions

- Player collision/bumping (shove on contact) — deferred to v2; changes the sim contract.
- Power-ups (speed pad, paint bomb) — v2; the base loop must prove itself plain first.
- 60 s vs 90 s match length — start 60, tune for "one more game" energy.
