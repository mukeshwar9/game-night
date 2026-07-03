# PRD — Checkers (English draughts)

**One-liner:** the classic 8×8 jump-and-capture game with forced captures and multi-jumps —
the most-requested missing board classic. Fits the registry via `applyMove`; the new interaction
is select-piece-then-select-destination, handled inside the board component.

| | |
|---|---|
| `type` | `checkers` |
| Label / badge | `CHECKERS` / `CK` |
| Category | `board` (2 players + spectators) |
| Integration | **B** — registry + `applyMove` (multi-jump = extra-turn mechanic, dots & boxes precedent) |
| Network | RTDB, turn-based |
| Effort | **M** — the heaviest board logic on this list |
| Priority | P3 |

## Game rules (English draughts / American checkers)

- 8×8, play on dark squares only; 12 men each on the first three rows. X moves "up" the board
  (decreasing row), O "down". X moves first.
- **Men** move one square diagonally forward; capture by jumping an adjacent enemy piece into
  the empty square beyond (forward only for men).
- **Forced capture:** if any capture is available, a capture **must** be played (any one of them
  — no maximum-capture rule).
- **Multi-jump:** after a capture, if the *same piece* can capture again, it **must** continue.
  `currentTurn` stays with the mover between segments (dots & boxes extra-turn precedent).
- **Kings:** a man reaching the far row is crowned and the move **ends immediately** (no
  continuing a jump chain after crowning). Kings move/capture diagonally both directions,
  one square (no flying kings).
- **Win:** opponent has no pieces or no legal move. **Draw:** 80 plies (40 moves each) with no
  capture and no crowning.

## Data model

- `board: string[64]` row-major, values `'' | 'X' | 'O' | 'XK' | 'OK'` (multi-char cell strings
  are fine in Firebase; light squares stay `''` forever). Add a `normalizeCheckersBoard(b)`
  (64-length array-or-object tolerance, `normalizeBoard` pattern).
- Two new top-level keys (added to `FIELD_NULLS`):

```
checkersJumpFrom:   number | null   // mid-multi-jump: the square the moving piece stands on;
                                    // locks the next move to that piece
checkersNoProgress: number          // plies since last capture/crowning → draw at 80
```

- `freshGameState('checkers')` → initial 24-piece board, `currentTurn: 'X'`, both keys
  null/0.

## Registry entry

```js
{
  type: 'checkers', label: 'CHECKERS', desc: '8 × 8', Icon: CheckersIcon,
  badge: 'CK', maxWidth: 'max-w-md', category: 'board',
  boardSize: 0,                              // board shipped via freshGameState, moves are {from,to}
  getMoveIndex: (board, move) => (move && board[move.to] === '' ? move.to : -1),
  BoardComponent: CheckersBoard,
  applyMove: ({ board, game, move, symbol }) => {
    const applied = applyCheckersMove(
      normalizeCheckersBoard(board ?? game.board), move, symbol,
      game.checkersJumpFrom ?? null, game.checkersNoProgress ?? 0)
    if (!applied) return null
    return {
      updates: {
        board: applied.board,
        checkersJumpFrom: applied.continueFrom,          // null unless chain continues
        checkersNoProgress: applied.noProgress,
        currentTurn: applied.continueFrom ? symbol : (symbol === 'X' ? 'O' : 'X'),
      },
      result: applied.result,   // null | { winner: 'X'|'O'|'draw' }
    }
  },
  boardProps: (game) => ({ jumpFrom: game.checkersJumpFrom ?? null }),
}
```

`applyCheckersMove` is the single validator: rejects non-captures when captures exist, enforces
`jumpFrom` lock, applies crowning-ends-move, updates the no-progress counter, and detects
no-pieces / no-moves / draw results. The board component *suggests* legal moves for UX; the
`applyMove` hook *re-validates authoritatively* — they share the same exported move-generation
functions so they can't disagree.

## Board component — `src/components/CheckersBoard.jsx`

- Selection is local state: tap your piece → legal destinations highlight → tap destination →
  `onMove({ from, to })`. Tap elsewhere deselects.
- **Forced-capture affordance:** when captures exist, only capturing pieces are selectable and
  they pulse (`retro-cta` glow); a "CAPTURE AVAILABLE" hint on first occurrence. Mid-chain,
  selection is locked to `jumpFrom` (the piece is already lit).
- Pieces: pixel-art discs in `retro-p1`/`retro-p2`; kings get a crown pixel-glyph + subtle glow.
  Captured pieces animate off with the standard effect timing.
- **Perspective:** O should see their pieces at the bottom. `boardProps(game)` can't know the
  viewer, so this needs `Game.jsx` to pass the viewer's `symbol` to every `BoardComponent` — a
  one-line generic change that also unblocks mancala's flip. **Do this here** (checkers without
  the flip is genuinely disorienting); mancala then inherits it.
- Draw counter surfaced quietly ("MOVES TO DRAW: 12") only when `noProgress ≥ 60`.

## Files

| File | Contents |
|---|---|
| `src/lib/checkersLogic.js` | `initialBoard`, `normalizeCheckersBoard`, `legalMoves(board, symbol, jumpFrom)` (men/kings, captures-forced), `applyCheckersMove`, `getCheckersWinner` |
| `src/lib/checkersLogic.test.js` | the biggest suite on this list — see Testing |
| `src/components/CheckersBoard.jsx` | selection, highlights, perspective flip |
| Registration | registry entry, icon; + the generic `symbol` prop threading in `Game.jsx` |

## Edge cases

- Multi-jump where a *different* piece could also capture: locked to `jumpFrom` piece — correct
  per rules (continuation is mandatory for the moving piece).
- Crowning mid-chain: move ends, turn flips even if the new king could jump.
- No legal moves but pieces remain (blocked): loss for the blocked player — checked in
  `getCheckersWinner` after every move.
- Spectator/turn safety: `applyMove` rejects everything not from the current mover
  (standard `Game.jsx` gating) and everything violating `jumpFrom`.

## Testing

- Unit: man move gen (forward-only, blocked); king move gen; capture detection; forced-capture
  filtering (non-capture rejected when capture exists); multi-jump chains (double, triple,
  branching — any branch allowed); crowning ends chain; `jumpFrom` lock (moving another piece
  rejected); no-progress counter reset on capture/crowning, draw at 80; blocked-player loss;
  full-game fixture (a known short game replayed move-by-move).
- Manual: two-browser game with a multi-jump; perspective flip; forced-capture UX; draw-counter
  display.

## Stretch

Flying-kings variant (international rules, `variantOf`); move-list/replay; simple demo-mode AI
(material + mobility minimax, depth 6 is trivially fast at this branching factor).
