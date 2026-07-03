# PRD — Hex

**One-liner:** the classic 11×11 connection game — X connects left↔right, O connects top↕bottom,
no draws possible. Deepest strategy per line of code available; a pure standard-registry add.

| | |
|---|---|
| `type` | `hex` |
| Label / badge | `HEX` / `HX` |
| Category | `board` (2 players + spectators) |
| Integration | **A** — standard registry entry, zero `Game.jsx` changes |
| Network | RTDB, standard turn-based |
| Effort | **S** |
| Priority | **P1** — cheapest add on the list |

## Game rules

- 11×11 rhombus of hexagonal cells (`board: string[121]`, row-major, `''|'X'|'O'`).
- Players alternate placing one stone on any empty cell; stones never move or get captured.
- **X wins** by forming an unbroken chain of X stones connecting the **left and right** edges;
  **O wins** connecting **top and bottom**. Every filled board has exactly one winner — draws are
  mathematically impossible.
- Adjacency: 6 neighbors — for cell `(r, c)`: `(r, c±1)`, `(r±1, c)`, `(r-1, c+1)`, `(r+1, c-1)`.

## Registry entry

```js
{
  type: 'hex', label: 'HEX', desc: '11 × 11', Icon: HexIcon,
  badge: 'HX', maxWidth: 'max-w-md', category: 'board',
  boardSize: 121,
  getMoveIndex: (board, i) => (board[i] ? -1 : i),
  getWinner: getHexWinner,
  BoardComponent: HexBoard,
}
```

`freshGameState` needs **no new branch** — the default tail
(`board: Array(121).fill(''), currentTurn: 'X'`) is exactly right. **No new Firebase keys, no
`FIELD_NULLS` changes.**

## Logic — `src/lib/hexLogic.js`

- `getHexWinner(board)`: after normalizing, BFS/DFS from a virtual left-edge node over X stones
  toward the right edge (and the transpose for O). Returns `null` while unresolved, else
  `{ winner, winningLine }` where `winningLine` is the **full connecting path** (variable length,
  11–40+ cells).
  - `winningLine` is documented as `number[3]` for TTT-likes, but it flows opaquely from
    `getWinner` → Firebase → `BoardComponent`; gomoku already returns 5 cells. Verify once in
    `Game.jsx` that nothing assumes length 3, then highlight the whole path — a lit-up snake
    across the board is the game's best moment.
  - Return a *shortest* path (BFS parent chain) so the highlight looks intentional.
- `neighbors(i)` helper exported for tests.
- No `applyMove` needed — pure place-symbol → flip-turn → check-winner.

## Board component — `src/components/HexBoard.jsx`

- CSS hexagons (`clip-path: polygon(…)`) in 11 rows, each row offset half a cell → rhombus.
  Slight negative vertical margin so hexes tessellate.
- **Edge ownership must be legible:** left/right board borders glow `retro-p1`, top/bottom glow
  `retro-p2`; corner cells belong to both. A one-line hint under the board on first render:
  "CONNECT YOUR EDGES".
- Stones: filled hex + `shadow-neon-p1/p2`; last move gets the standard pulse; winning path gets
  `text-glow`/brightness lift.
- Mobile: 11 columns of ~28 px hexes fit `max-w-md`; tap targets are the full hex.

## Fairness note

First player has a proven winning strategy in theory and a real practical edge. The classical fix
is the **swap (pie) rule** — O may steal X's first move. That breaks the standard place-only move
shape, so it is **stretch, not v1** (implementable later as an `applyMove` variant with a
one-time `swap` action, connectfourpop precedent). V1 ships without it; at casual level the edge
is minor, and the platform convention (creator = X moves first) is unchanged.

## Testing

- `getHexWinner`: no winner on empty/partial boards; X left-right chain detected (straight,
  zigzag, corner-hugging); O top-bottom; **X chain touching top+bottom is NOT a win for X**
  (edge-direction correctness — the classic bug); full-board always has a winner (fuzz: random
  fill 500 boards, assert winner ≠ null); returned path is connected, on-color, edge-to-edge.
- `neighbors`: interior 6, edges 4, corners 2–3; no wraparound (the second classic bug:
  `(r, 10)` must not neighbor `(r+1, 0)`).
- Manual: one full game in two browsers; win-path highlight; theme sweep.

## Stretch

Swap rule; 13×13 size variant (`variantOf` pattern, like Ultimate TTT); move-hint heatmap in
demo mode vs a Monte-Carlo bot.
