# PRD — Tic Tac Toe 4×4

**One-liner:** 4×4 tic-tac-toe — 16 cells, first **four** of your mark in a line wins. Same
`Board` component with a `cols` prop; `variantOf: 'tictactoe'` (Ultimate stays the other mode).

| | |
|---|---|
| `type` | `tictactoe4` |
| Label / badge | `TTT 4×4` / `TT4` |
| Category | `board` (2 players + spectators) |
| Integration | **A** — `boardSize: 16` + `getMoveIndex` + `getWinner` + `Board`. No `applyMove`. No `Game.jsx` changes. |
| Network | RTDB, turn-based, honest-client |
| Effort | **S** |
| Priority | P2 |
| `addedAt` | `2026-08-15` |

This spec is implementation-ready: no open design decisions.

---

## Game rules

- **Board:** 4×4 = 16 cells, row-major indices 0–15.
- **Turn:** place your mark (`X` / `O`) on an empty cell.
- **Win:** four contiguous of your mark in a row, column, or diagonal. **Three does not win.**
- **Winning lines** (10):

```
rows:  [0,1,2,3] [4,5,6,7] [8,9,10,11] [12,13,14,15]
cols:  [0,4,8,12] [1,5,9,13] [2,6,10,14] [3,7,11,15]
diags: [0,5,10,15] [3,6,9,12]
```

- **Draw:** board full, no 4. Match: first to 3 round wins.

Perfect play on 4-in-a-row / 4×4 is draw-heavy. That is accepted for v1 (3×3 is already
solved; this is for humans).

## Data model

Standard 2P board keys. No new Firebase keys. `FIELD_NULLS` unchanged.

```
board: string[16]          // '' | 'X' | 'O'
currentTurn: 'X' | 'O'
winner: 'X' | 'O' | 'draw' // absent until finished
winningLine: number[4]     // absent until a win; Board already uses .includes(i)
lastMove: number | null
```

`freshGameState('tictactoe4')` uses the generic tail (`boardSize: 16`). No dedicated branch.

## Registry

On base `tictactoe`:

```js
classicLabel: '3×3',
classicBlurb: 'Three in a row on a 3×3. The original.',
```

```js
{
  type: 'tictactoe4', label: 'TTT 4×4', desc: 'four in a row on 4×4',
  Icon: TicTacToeIcon, badge: 'TT4', maxWidth: 'max-w-sm',
  category: 'board', addedAt: '2026-08-15',
  durationMin: 3, tags: ['quick', 'thinky'], solo: true,
  variantOf: 'tictactoe', variantLabel: '4×4',
  variantBlurb: '16 cells. Four in a row wins. Three does not.',
  boardSize: 16,
  getMoveIndex: (board, i) => (board[i] ? -1 : i),
  getWinner: getTicTacToe4Winner,
  BoardComponent: Board,
  boardProps: () => ({ cols: 4 }),
}
```

Reuse `TicTacToeIcon`. No new icon. Ultimate TTT remains `variantOf: 'tictactoe'`; chooser lists
`3×3`, `ULTIMATE`, `4×4`.

## Logic — `src/lib/tictactoe4Logic.js`

Keep [`src/lib/gameLogic.js`](../../src/lib/gameLogic.js) 3×3 `getWinner` untouched (Ultimate and
bots import it). New small module:

- `TTT4_CELL_COUNT = 16`
- `TTT4_WIN_LINES` — the 10 lines above
- `getTicTacToe4Winner(board)` → `{ winner, line }` | `{ winner: 'draw', line: [] }` | `null`

Same return shape as `getWinner` so `Game.jsx`'s standard place → flip → `getWinner` path works
with no `applyMove`.

## Board — `src/components/Board.jsx`

Today: hardcoded `grid-cols-3` and `max-w-[300px]`. Add `cols = 3`.

- Layout: `style={{ gridTemplateColumns: \`repeat(${cols}, 1fr)\` }}` (do not build
  `grid-cols-${cols}` — Tailwind will not see a dynamic class).
- 3×3 keeps `max-w-[300px] sm:max-w-[360px]`; 4×4 uses `max-w-sm` (registry `maxWidth` already
  `max-w-sm`) so cells stay tappable.
- `Cell` already handles `isWinning` / `isLastMove` regardless of line length.

Default `cols={3}` so every existing `<Board>` caller stays 3×3 if `boardProps` is omitted.

## Files

| File | Change |
|---|---|
| `src/lib/tictactoe4Logic.js` | lines + `getTicTacToe4Winner` |
| `src/lib/tictactoe4Logic.test.js` | see Testing |
| `src/components/Board.jsx` | `cols` prop, default 3 |
| `src/lib/games.js` | Variant row + `classicLabel` on `tictactoe` |
| `src/lib/rules.js` | `tictactoe4` entry |
| `src/lib/demoBots.js` | `case 'tictactoe4'` — empty-cell picker (win/block using `TTT4_WIN_LINES` if cheap; random legal is enough for v1) |
| `src/pages/Demo.jsx` | Tile next to TTT / Ultimate |
| `src/lib/games.test.js` | `freshGameState('tictactoe4').board.length === 16` |
| `src/lib/gameSuggestions.test.js` | `suggestGames('tictactoe')` already prefers `variantOf` siblings — assert `tictactoe4` appears |

No `Game.jsx`, no `FIELD_NULLS`, no new icon.

## Edge cases

- Three in a row on 4×4 is **not** a win.
- Occupied cell: `getMoveIndex` returns `-1`.
- `winningLine` length 4: `Board` / `Cell` use `includes`, not a hard-coded 3.
- Switching to 3×3 / Ultimate: `freshGameState` replaces `board` length (9 vs 16 vs 81).

## Testing

- Unit: each row / col / both diags win; a 3-in-a-row setup is not a win; full board draw;
  empty board `null`.
- Manual: two-browser (incognito) 4×4 place + win ring; 3×3 still 3-col grid (no layout
  regression); VariantChooser `3×3` / `ULTIMATE` / `4×4`; theme sweep.

## Stretch

Misère 3×3 (complete a line and you lose); 4×4 with 3-in-a-row (first-player steamroll — skip).
