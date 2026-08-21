# PRD — Connect Four 5

**One-liner:** gravity Connect Four on a 9×7 grid — first **five** of your colour in a line
wins. Same board shell as classic C4; a `variantOf: 'connectfour'` mode, not a new catalog tile.

| | |
|---|---|
| `type` | `connectfour5` |
| Label / badge | `C4 FIVE` / `C5` |
| Category | `board` (2 players + spectators) |
| Integration | **A** — `boardSize` + `getMoveIndex` + `getWinner` + `ConnectFourBoard`. No `applyMove`. No `Game.jsx` changes. |
| Network | RTDB, turn-based, honest-client |
| Effort | **S** |
| Priority | P2 — first extra C4 size/run mode (Pop Out already exists) |
| `addedAt` | `2026-08-15` |

This spec is implementation-ready: no open design decisions.

---

## Game rules

- **Board:** 9 columns × 7 rows = 63 cells. Indexing is **row-major**, same as live C4:
  `index = row * 9 + col`, row 0 = **top**. A full column is `board[col] !== ''` (top cell occupied).
- **Turn:** drop one disc of your colour into a column. It falls to the lowest empty cell.
  No pop, no extra turn.
- **Win:** first contiguous **5** of your colour horizontally, vertically, or diagonally.
  Four in a row does **not** win.
- **Draw:** all 63 cells filled with no 5.
- **Match:** first to 3 round wins (not in `SINGLE_ROUND_GAMES`).

## Data model

No new Firebase keys. Reuses classic C4 fields with a longer `board`:

```
board: string[63]          // '' | 'X' | 'O'
currentTurn: 'X' | 'O'
winner: 'X' | 'O' | 'draw' // absent until finished
winningLine: number[5]     // absent until a win; gomoku already returns 5 cells
lastMove: number | null
```

`FIELD_NULLS` unchanged. `freshGameState('connectfour5')` uses the generic tail
(`board: Array(cfg.boardSize).fill(''), currentTurn: 'X'`). No dedicated branch.

## Registry

Add `classicLabel` / `classicBlurb` on the **base** `connectfour` entry (Dots & Boxes / Chain
Reaction pattern) so VariantChooser does not fall back to a generic `CLASSIC`:

```js
// on connectfour:
classicLabel: '7×6',
classicBlurb: 'Seven columns, four in a row. The original.',

{
  type: 'connectfour5', label: 'C4 FIVE', desc: 'five in a row on 9×7',
  Icon: ConnectFourIcon, badge: 'C5', maxWidth: 'max-w-lg',
  category: 'board', addedAt: '2026-08-15',
  durationMin: 5, tags: ['thinky'], solo: true,
  variantOf: 'connectfour', variantLabel: '9×7 · 5',
  variantBlurb: '9×7 grid. Five in a row wins. Four does not.',
  boardSize: 63,
  getMoveIndex: (board, col) => getConnectFourDrop(board, col, CF5),
  getWinner: (board) => getConnectFourWinner(board, CF5),
  BoardComponent: ConnectFourBoard,
  boardProps: () => ({ cols: 9, rows: 7 }),
}
```

Reuse `ConnectFourIcon`. No new icon.

`CF5 = { cols: 9, rows: 7, winRun: 5 }`. Classic C4 and Pop Out keep `{ cols: 7, rows: 6, winRun: 4 }`
as the default so existing call sites stay valid.

## Logic — parameterize `src/lib/connectFourLogic.js`

Do **not** add a second file or a second indexing scheme. Export a small config (or optional
third-arg defaults) and keep the existing DIRECTIONS scan:

- `getConnectFourDrop(board, col, { cols, rows })` — walk from the bottom row up
  (`for row = rows-1 … 0`, index `row * cols + col`). Return `-1` if `col` out of range or
  the column is full.
- `getConnectFourWinner(board, { cols, rows, winRun })` — same four DIRECTIONS as today;
  require `line.length === winRun`; reject a step that leaves the board or wraps a row
  (`c` jumps by more than 1 on a non-vertical step). Full board with no run → `{ winner: 'draw', line: [] }`.

Pop Out (`connectfourpop`) stays on 7×6 / run 4. Do not pass `cols: 9` into pop mode.

## Board — `src/components/ConnectFourBoard.jsx`

Today the grid hardcodes `CF_COLS` / `CF_ROWS`. Add `cols` / `rows` props defaulting to 7 / 6.

- `gridTemplateColumns: repeat(cols, 1fr)` (already a style; swap the constant).
- `colFull = !!board[col]` still holds for any `cols` while row 0 is the top.
- `maxWidth: 'max-w-lg'` in the registry so 9 discs stay ≥ ~44 px on a phone.
- Hover / last-move ring / win scale unchanged. `popMode` UI only when `popMode` is true
  (this variant never sets it).

Sounds: existing `sounds.move` on drop (standard `Game.jsx` filled-count path). Win/lose free.

## Files

| File | Change |
|---|---|
| `src/lib/connectFourLogic.js` | Optional `{ cols, rows, winRun }` on drop + winner; export `CF5_*` constants |
| `src/lib/connectFourLogic.test.js` | 9×7 / run-5 cases (keep existing 7×6 cases) |
| `src/components/ConnectFourBoard.jsx` | `cols`/`rows` props, default classic |
| `src/lib/games.js` | Variant row + `classicLabel` on `connectfour` |
| `src/lib/rules.js` | `connectfour5` entry (coverage test requires every type) |
| `src/lib/demoBots.js` | `case 'connectfour5'` — same column picker with `cols = 9` |
| `src/pages/Demo.jsx` | Bot tile next to C4 / Pop Out |
| `src/lib/games.test.js` | `freshGameState('connectfour5').board.length === 63` |

No `Game.jsx`, no `FIELD_NULLS`, no `database.rules.json`, no new icon.

## Edge cases

- Four in a row on 9×7 is **not** a win (the classic bug if `winRun` is forgotten).
- Diagonal that would wrap across the right edge of a row must not count (same bug as a naive
  `i + (cols+1)*k` scan). Use the live C4 bound check, not a new wrap heuristic.
- Full column: `getMoveIndex` returns `-1`; the board button for that column is disabled.
- Switching from `connectfour5` → `connectfour` / Pop Out: `FIELD_NULLS` + new `board` length
  from `freshGameState` already replaces the 63-cell array.

## Testing

- Unit: horiz 5 wins; horiz 4 does not; vert 5; both diagonals; full-board draw; drop into
  empty / partly filled / full column; out-of-range col → `-1`; classic 7×6 / run 4 still
  passes existing tests.
- Manual: two-browser (incognito) drop + win highlight of 5; theme sweep; phone tap targets
  on 9 columns; VariantChooser shows `7×6` and `9×7 · 5`.

## Stretch

8×8 run-5; wrap-around columns; Pop Out on 9×7 (`connectfour5pop`) — not v1.
