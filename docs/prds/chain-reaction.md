# PRD: Chain Reaction

## Summary

Turn-based territory game on a 6×8 grid. Players place orbs in cells they own (or empty
cells); when a cell reaches **critical mass** it explodes, sending one orb to each
orthogonal neighbor and **converting those cells to the exploder's color** — which can push
neighbors past critical mass and cascade. One well-placed orb can flip the entire board.

- **The twist:** the most dramatic comeback mechanic in any grid game — you are never safely
  ahead, and endgames detonate in huge chain cascades.
- Players: 2 (X and O). Category: board. Netcode: standard RTDB turn-based via the registry.
- Effort: **S** — pure `applyMove` game, no new infrastructure.

## Rules

1. Players alternate placing one orb per turn. Legal cells: empty, or already owned by the
   mover. You may never add to an opponent cell.
2. Critical mass = number of orthogonal neighbors: corner cells 2, edge cells 3, interior 4.
3. When a cell reaches critical mass it explodes: its count resets to
   `count − criticalMass`, and each orthogonal neighbor gains one orb **and converts to the
   exploder's color**. Explosions resolve breadth-first; cascades continue until stable.
4. **Win:** after both players have moved at least once, a player with zero orbs on the
   board loses immediately (checked after cascade settles). No draw is possible.
5. Cascade guard: resolution stops immediately once the opponent owns zero orbs (prevents
   the theoretical infinite cascade on a saturated board).

## Data model & architecture

Registry entry with `applyMove` + standard fields — no custom page, `Game.jsx` unchanged.

- `board: string[48]` — 6 cols × 8 rows, row-major. Cell encoding: `''` empty, `'X3'` /
  `'O1'` etc. (owner char + orb count). Stays inside the platform's string-array convention.
- `currentTurn` flips every move (no extra-turn rule). `winner: 'X'|'O'` — never `'draw'`.
- No `winningLine`. No new `FIELD_NULLS` keys beyond the standard set (board is reused).

`src/lib/chainReactionLogic.js` (pure, vitest-tested):

- `criticalMass(index)` — 2/3/4 by position.
- `applyPlacement(board, index, symbol)` → `{ board, steps }` where `steps` is the ordered
  list of explosion waves (`[{ exploded: [indices], converted: [indices] }]`) — the client
  replays `steps` for animation; Firebase only ever stores the settled board.
- `getWinner(board, moveCount)` — zero-orb check gated on `moveCount >= 2`.
- `legalMoves(board, symbol)`, `orbCounts(board)`.

Registry `applyMove({ board, game, index, symbol })` calls `applyPlacement`, returns
`{ updates: { board, currentTurn: flip }, result }`.

## UI/UX

- `src/components/ChainReactionBoard.jsx`, `maxWidth: 'max-w-sm'`. Cells are buttons in a
  6-wide CSS grid; orbs render as 1–3 small circles (`bg-retro-p1`/`bg-retro-p2`,
  `shadow-glow-dot`), count ≥ critical−1 gets a pulsing wobble (reuse `pong-ball-pulse`).
- **Cascade animation is the product.** On receiving a new board, the client recomputes
  `steps` locally from (previous board + last move — store `lastMove: index` in updates)
  and replays waves at ~140 ms/wave: exploding cells flash (`win-flash`), converted cells
  pop (`place-pop`). Input is locked during replay.
- Sounds: `sounds.drop()` per placement, `sounds.hit(waveIndex)` per cascade wave
  (escalating pitch with streak — already supported), `sounds.win()`/`lose()` at the end.
- Ownership tint: cell background `bg-retro-tint-p1`/`tint-p2` so territory reads at a glance.

## AI / demo mode

`computeAiMove(board, symbol)` greedy heuristic, in this order: (1) any move whose cascade
captures the opponent's whole board; (2) move that captures the most opponent orbs
(simulate one ply with `applyPlacement`); (3) build cells adjacent to opponent
near-critical cells last (avoid feeding); (4) prefer corners/edges early. Add to
`/demo` via the existing demo-bot dispatch (`src/lib/demoBots.js`).

## Edge cases

- Board full but nobody at zero: impossible — placement always triggers at least one
  explosion on a saturated board, which converts cells; the zero-check ends it.
- Replay determinism: `steps` must be derived, never stored — two clients replaying the
  same (board, move) must produce identical waves (BFS order fixed: ascending cell index).
- Spectators replay the same animation from `lastMove` — no special casing.

## Testing (vitest)

Critical mass by position; simple explosion; conversion; two-wave cascade; cascade
BFS-order determinism (fixed expected `steps` for a crafted board); win detection gated on
both-moved; cascade guard (opponent-zero stops resolution); illegal move rejection
(opponent cell); full-board sanity fuzz (500 random games terminate).

## Milestones

1. Logic module + tests (half day).
2. Board component + cascade replay animation (1 day).
3. Registry entry, icon, AI bot, demo (half day).

## Open questions

- Grid size 6×8 vs 5×6 for small phones — start 6×8, revisit after a playtest.
- v2: 3–4 player free-for-all (the rules generalize; needs n-player seat plumbing).
