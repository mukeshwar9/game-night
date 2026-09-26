# PRD: SPLIT PICTURE (co-op nonogram)

## Summary

A 10×10 picture-logic puzzle solved by two people who each hold half the clues. The row
reader (X) sees only the row clues; the column reader (O) sees only the column clues.
Both paint the same shared grid. Wrong cells cost shared lives; a solved grid reveals a pixel
picture.

- **The twist:** the earlier Nonogram Duet mock gave both players every clue, so one player could
  solve it alone. Splitting the clues makes each player blind on one axis, so every deduction
  needs your partner's half: "row 3 is a single 8, so columns 2 to 9 all get something?"
- Players: 2 (co-op). Category: `board` (puzzle). Netcode: RTDB, one transaction per cell.
- Effort: **S–M**. Puzzles are generated and checked by a line solver, so there is no art cost.

## Rules

1. The grid is 10×10 (EASY 8×8, HARD 12×12). Each row has a clue for its runs of filled cells
   (e.g. "3 1 2"); each column likewise.
2. X sees row clues only; O sees column clues only. Both see the shared grid and every mark.
3. On your own time (no turns), tap a cell to FILL or long-press / toggle to mark it EMPTY (✕).
4. A FILL on a cell that should be empty, or an ✕ on a cell that should be filled, costs one of
   3 shared lives and the cell is set to its true value with a "mistake" badge.
5. The team wins when every filled cell of the solution is filled. It loses at 0 lives.
6. Every puzzle has exactly one solution reachable by line logic alone (no guessing needed),
   verified at generation time.

## Data model & architecture

`custom: true, coop: true, hidePlayerCards: true` registry entry (`gameType: 'splitpicture'`),
page `src/pages/SplitPictureGame.jsx`, logic `src/lib/splitPictureLogic.js`, solver
`src/lib/nonogramSolver.js`. Add `'splitpicture'` to `COOP_GAMES` in `src/lib/matchRules.js`.

State under `round` only (no `FIELD_NULLS` or rules changes):

```
round: {
  phase: 'setup' | 'playing' | 'done',
  size: 8 | 10 | 12, seed,
  solution: string,          // '1'/'0' row-major; plaintext, co-op honour system
  cells: string,             // '' | 'F' | 'X' per cell, row-major, fixed length (never null)
  mistakes: number[],        // cell indexes set by a wrong move
  lives: 0..3,
  result: { outcome, at } | null,
}
```

Store `cells` as a fixed-length string (or `string[]` of `''`) per the firebase rules: never
`null` for empty, normalise on read. The page deals in a `runTransaction` on first view after
`SetupChoices` (EASY / NORMAL / HARD); each tap is its own transaction through `applyMark`, so
two simultaneous taps on different cells both land and two on the same cell resolve once.
A solve adds +1 to both `scores`. Reuse `TeamRoundShell.jsx`.

**Generator.** Seeded random fill at ~55% density, then run the line solver (per-line
left-most/right-most overlap plus iterate-to-fixpoint). Reject grids the line solver cannot
fully determine and redraw (cap 200 attempts, then fall back to a small curated set of pixel
pictures in `src/lib/levels/splitPicture.js`). Optionally bias the random fill with symmetry so
results look like pictures rather than noise. Clues are derived from the solution; they are not
stored.

## UI/UX

- 390 px portrait: a 10×10 grid of 30 px cells fits in 358 px with a 40 px clue gutter on your
  axis only. X's gutter is on the left (row clues); O's is on top (column clues). The missing
  axis shows "?" chips so it is obvious what your partner sees.
- FILL/✕ mode toggle as two large buttons at the bottom (FILL ■ / MARK ✕); filled cells use
  `bg-retro-text`, marks a "✕" glyph; mistakes add a "!" corner badge in `retro-danger`. Never
  colour alone.
- Partner cursor: the last cell your partner touched pulses for 1 s (`retro-p2` ring for O,
  `retro-p1` for X, plus their seat letter).
- Solved: the grid fades to the picture with a short `sounds.win()`.
- A "line done" tick appears on your clue when the line matches, which is information for you
  only; your partner sees their own.

## AI / demo mode

`/demo/splitpicture` pairs you with a bot that owns the other axis and plays one line-solver
deduction every 3–5 s from its half of the clues plus the shared grid. That is exactly the
solver in `nonogramSolver.js`, restricted to one axis.

## Trust model & edge cases

- The solution is in the world-readable room; a curious player can cheat only their own team.
- Simultaneous taps: per-cell transactions; a tap on an already-set cell is a no-op.
- Partner offline: the grid stays open; a solo player can still finish with half the clues if
  they are clever. No CLAIM WIN.
- Accessibility: every cell is a button with an aria label "Row r, column c, filled / marked
  empty / unknown"; the grid is reachable by arrow keys via `useGameKeys`.

## Testing

Vitest: clue derivation; line solver on hand fixtures (single run, gaps, full, empty,
contradiction); generator always returns a uniquely line-solvable grid for 200 seeds; `applyMark`
lives, mistakes and win detection; `cells` normalisation from sparse objects. E2E
(`tests/e2e/split-picture.spec.js`): X fills a cell, O sees it; a wrong fill costs a life on both
clients.

## Milestones

1. Solver + generator + tests (1 day).
2. Page, split gutters, mark modes, partner pulse (1 day).
3. Registry, icon, rules text, e2e, demo bot (half day).

## IP notes

"Picross" is a Nintendo trademark and "Illust Logic"/"Griddlers" are brands; "nonogram" is
generic. Use SPLIT PICTURE and "picture logic" in copy. Do not copy puzzle sets from Picross
titles or puzzle books; generated puzzles and our own curated pixel pictures only.

## Open questions

- Should lives exist at all, or should wrong marks just be undoable (a calmer mode)? Lean: lives
  in NORMAL/HARD, unlimited in EASY.
- A daily puzzle from `seedFromDate()` so friends can compare times?
