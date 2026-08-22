# Turn-based strategy games — review

Games owned: Tic Tac Toe + 4×4, Ultimate TTT, Connect Four (+5-in-row, +big-board, +Pop), Gomoku, Reversi, Order and Chaos, Hex, Dots and Boxes (6×6+4×4), SOS, Chain Reaction, Blockade, Battleship, Mancala (uncommitted, read-only).

`npm test` on the full suite: 2 files fail (`mancalaLogic.test.js`, and its cascade shows up in the full run) — all other suites for games in this set pass.

## Ranked findings

| # | Game | Finding | Severity | Effort |
|---|------|---------|----------|--------|
| 1 | Mancala (uncommitted) | `normalizePits()` reindexes sparse Firebase objects by array position instead of original key — silently corrupts pit state | broken | small |
| 2 | Tic Tac Toe 4×4 | Solo bot uses the 3×3 win-checker against a 16-cell board — never correctly wins/blocks, and has zero test coverage | broken | small |
| 3 | Reversi | No pass mechanism — a player with zero legal moves (opponent still has some) can't move and `currentTurn` never advances; game freezes | broken | medium |
| 4 | Mancala (uncommitted) | Shipped test suite is red: 11 of 16 tests fail against an implementation that appears to be correct — fixtures don't account for captures/end-sweeps the code correctly triggers mid-move | weak | medium |
| 5 | Hex | No swap/pie rule; Hex is a proven first-player win with perfect play on any board size | weak | small |
| 6 | Gomoku | Freestyle rules, no opening restriction (no swap2) — black has the well-documented advantage in unrestricted 5-in-a-row | polish | small |
| 7 | Ultimate TTT | Undecided-meta-board tie-break awards the game to whoever won more mini-boards, diverging from the traditional "draw" ruling | polish | small (confirm intent) |
| 8 | Reversi / Hex / Connect Four / Gomoku / Order & Chaos | Player state shown by disc/stone color only, no glyph — a color-only distinction (TTT/SOS use X/O/S letters, these don't) | polish | small |
| 9 | demoBots.test.js | Zero coverage for `botUltimate`, `botHex`, `botBlockade`, pop-specific pop-out behavior, and the `tictactoe4`/`connectfour5` dispatch paths — is exactly how #2 went unnoticed | polish (coverage) | small |

## Detail

### 1. Mancala — `normalizePits` corrupts sparse Firebase reads (broken, small)
`src/lib/mancalaLogic.js:21-24`:
```js
export function normalizePits(raw) {
  const arr = Array.isArray(raw) ? raw : Object.values(raw ?? {})
  return Array.from({ length: PIT_COUNT }, (_, i) => Number(arr[i]) || 0)
}
```
`Object.values({0:5, 13:2})` returns `[5, 2]` — numeric-key order, not padded by key. The function then reads `arr[i]` as if that were pit `i`, so a value that belongs at pit 13 lands at pit 1 instead. Every other normalizer in this codebase (`normalizeBoard` in `gameLogic.js:21-29`, `normalizeUWon` in `ultimateTttLogic.js:93-101`) does this correctly via `Object.entries` + `parseInt(k)`. Mancala's copy diverges and is wrong. Proven directly by the module's own test (`mancalaLogic.test.js:22`), which fails against the current code. Fix: mirror the `normalizeBoard` pattern.

### 2. Tic Tac Toe 4×4 bot never wins or blocks correctly (broken, small)
`src/lib/demoBots.js:532`: `case 'tictactoe4': return botTicTacToe(game, botSymbol)`. `botTicTacToe` (`demoBots.js:75-99`) calls `getWinner` imported from `./gameLogic` (`demoBots.js:7`) — the 3×3 checker with `WINNING_LINES` capped at index 8 (`gameLogic.js:1-15`). Against a 16-cell 4×4 board this only ever evaluates the first 9 cells, so the bot's win-check and block-check are silently wrong for any position touching cells 9-15, and its "prefer center" opening (`center = [4]`, `corners = [0,2,6,8]`) targets 3×3 geometry, not the real 4×4 centers (5,6,9,10). There is also no `tictactoe4Logic.test.js` file at all — the win-detector itself (`getTicTacToe4Winner`, correct on inspection) and the bot are both untested. `demoBots.test.js` has no `tictactoe4` describe block either. Fix: pass `getTicTacToe4Winner` and the real board size/geometry through a small wrapper, the way `botConnectFour` takes a `config`.

### 3. Reversi has no pass — game can freeze (broken, medium)
`src/lib/reversiLogic.js` correctly implements "no legal moves for either side ends the game" (`getReversiWinner`, `hasAnyMove`) — the rule the task flagged to check closely, and it's right. But nothing calls it proactively. The only place `hasAnyMove`/`getReversiWinner` run is inside `applyMove` (`games.js:477-487`), i.e. after a move is submitted. If it becomes player A's turn and A has zero legal moves while B still does, `ReversiBoard.jsx` (`hints = legalMoves(...)`, `isClickable = !disabled && isHint`) renders zero clickable cells for A, and there is no auto-pass, no pass button, and no code path anywhere (`grep` across `Game.jsx`/`ReversiBoard.jsx` for `legalMoves`/`pass` outside the two files above turns up nothing) that flips `currentTurn` to B in that state. The game stalls indefinitely. Fix: add a `boardProps`/effect that auto-passes (advance `currentTurn` without a move) when `legalMoves(board, currentTurn).length === 0` and the game isn't over.

### 4. Mancala's own test suite is red (weak, medium)
Ran `npx vitest run src/lib/mancalaLogic.test.js`: 11/16 fail. Traced several by hand and with a scratch script — the implementation's behavior in each traced case matches real Kalah rules (e.g. `mancalaLogic.test.js:51-57` expects "pits 3,4 get one each" from playing pit 2 with 2 seeds, but the fixture happens to leave pit 4 empty with a non-empty opposite pit, which is a legitimate capture under the rule the code implements — the code captures, correctly, and the test's expectation is simply wrong for that board). Same pattern in the "skips the opponent/own store" and "extra turn" tests (`:58-92`) — fixtures trigger unintended captures/sweeps the authors didn't account for, or in one case (`:86-92`) use a seed count that can't geometrically reach the store at all. This doesn't mean the logic is bug-free (see #1), but as committed, `npm test` would report this module broken even though the sowing/capture/extra-turn/end-sweep code is sound wherever I traced it. Worth fixing the fixtures before this ships, since a red suite here will mask a real regression later.

### 5. Hex — no swap rule (weak, small)
`src/lib/hexLogic.js`'s win detection is exactly right — BFS connectivity from edge to edge, not a line scan, and correctly has no draw branch. That's the hard part, done well. But Hex is a solved first-player win at every board size with perfect play, and there's no pie/swap rule anywhere (`grep -i swap|pie` across `hexLogic.js`, `games.js`, pages: nothing). For a bot opponent this barely matters, but for two humans playing repeatedly it's a real fairness gap. Standard fix: let O "swap" X's first move (take over as X) instead of moving normally.

### 6. Gomoku — no opening restriction (polish, small)
`gomokuLogic.js` deliberately allows overlines (6+ still wins — confirmed intentional by its own test at `gomokuLogic.test.js:66-72`), which is a legitimate freestyle-rules choice. But freestyle Gomoku with no opening rule (no swap2, no forbidden first moves) gives black/first-mover a large, well-established edge. Not incorrect, just worth the captain knowing it's the more first-mover-skewed of the "near-solved" games in this set, alongside Hex and Connect Four (all missing any swap mechanism).

### 7. Ultimate TTT — meta-tiebreak is a house rule (polish, small/confirm)
`ultimateTttLogic.js:43-48`: when every mini-board is decided with no line across the meta-board, the winner is whoever won *more* mini-boards outright (majority), rather than a draw. This is a documented, deliberate, tested choice (`ultimateTttLogic.test.js:81-88`), not a bug — flagging only because it's a meaningful deviation from the traditional ruling (draw) that changes how often the game ends decisively, and the captain may want to confirm that's the intended feel rather than an oversight from an earlier draft.

### 8. Color-only player distinction in several boards (polish, small)
`ReversiBoard.jsx` (plain colored circles, `bg-retro-p1`/`bg-retro-p2`, no glyph), and similarly Hex, Connect Four family, Gomoku, and Order & Chaos's non-letter placements render pieces distinguished by color only. Tic Tac Toe, Ultimate TTT, and SOS use letter glyphs (X/O, S/O) so they're fine. Not blocking, but worth a shared fix (a subtle shape or icon difference) for colorblind accessibility within actual play, not just the shell.

### 9. Bot test coverage gaps (polish)
`demoBots.test.js` has no `describe` blocks for `ultimatettt`, `hex`, `blockade`, or connectfour5/pop-specific pop behavior, and none for `tictactoe4` — which is exactly how finding #2 shipped undetected. `botUltimate` and `botHex` read correctly on inspection (they use the right helpers/config), so this is a coverage gap, not a known bug, for those three.

## Genuinely good, no notes beyond the above

- **Hex** — win detection is the one to point to as the reference implementation: real connectivity BFS, not a line scan, exactly as the task asked to check.
- **Order and Chaos** — correct rules (Order/X wins on any 5-in-a-row of either letter, Chaos/O wins on a full board with none), well tested.
- **Dots and Boxes** (both 6×6 and 4×4) — extra-turn-on-completion correctly implemented and tested for both sizes.
- **SOS** — extra-turn-on-scoring correctly implemented; uses the "general" (fill-the-board, most sequences wins) variant deliberately, well tested.
- **Chain Reaction** — chain/capture rules correct, has a wave-count safety cap against runaway cascades, well tested.
- **Blockade** (Quoridor) — wall placement correctly checks *both* players retain a path to their goal row before allowing it (exactly the "can't wall a player in" case the task flagged), well tested.
- **Battleship / commit.js** — the commit-reveal scheme is sound: random 16-byte salt defeats precomputation, the commitment covers the full serialized fleet, and `verifyTranscript` re-grades every shot sequentially against the revealed fleet so a defender can't retroactively claim a different outcome. The one residual risk (a dishonest defender can lie about hit/miss until reveal) is explicitly documented as an accepted trade-off in the file's own header comment, not an oversight.
- **Connect Four family** (classic, 5-in-a-row, Pop Out) — win-scan is correct for both run lengths, Pop Out's house rule ("mover wins on double-completion") is documented and tested, all pass.
- **Tic Tac Toe (3×3)** and **Gomoku**'s win logic — correct, well tested.
- **Mancala** (uncommitted) — the sowing/skip-store/extra-turn/capture/end-sweep logic itself, traced by hand against several test fixtures, matches real Kalah(6,4) rules correctly wherever checked; the only real bug found is #1 (`normalizePits`), and the failing suite (#4) is a test-fixture problem, not an implementation problem, as far as I could verify by tracing.

## Test coverage gaps (summary)
- `tictactoe4Logic.js` has no test file at all.
- `demoBots.test.js` has no coverage for `tictactoe4`, `connectfour5`, `ultimatettt`, `hex`, or `blockade` bot paths.
- `mancalaLogic.test.js` (uncommitted) is currently red — see finding #4.

## Could not assess by reading
- Runtime game-feel (turn feedback pacing, animation timing, whether a move visually reads clearly) — requires running the app in a browser, which this review was told not to do.
- Whether Firebase `runTransaction` actually prevents two simultaneous moves from both landing (race condition) in practice — this is shared infra across all games/reviewers, not per-game logic, and needs live/network testing to verify rather than static reading.
- Disconnect-mid-turn behavior — handled by the shared presence/session layer (`Game.jsx`, outside this set's per-game logic files); nothing game-specific stood out in the logic modules I own, but I did not trace the shared reconnect path itself.
- Actual empirical balance/depth of Blockade and Order & Chaos (no established solved-game literature to check against, unlike Hex/Gomoku/Connect Four) — assessed only by rules-correctness reading, not by play-testing or search.

## Shell note (out of scope, one line)
Nothing new found outside the two existing UX audits.
