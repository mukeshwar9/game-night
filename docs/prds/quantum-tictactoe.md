# PRD: Quantum Tic-Tac-Toe

## Summary

Tic-tac-toe where every move is placed in **two cells at once** (a "spooky pair" in
superposition). When a chain of spooky marks forms a **cycle**, the board **collapses**:
each mark in the cycle snaps to exactly one of its two cells, chosen by the *opponent* of
the player who closed the cycle. First classical 3-in-a-row after a collapse wins.

- **The twist:** you play the probability graph, not the grid. Forcing your opponent into a
  collapse where *every* branch gives you a line is the signature power move.
- Players: 2. Category: board. Netcode: standard RTDB turn-based, registry `applyMove` +
  a lightweight collapse phase. Effort: **M** (rules-dense, zero new infrastructure).

## Rules

1. On your turn, place your mark with a move number (X1, O2, X3…) into **two different
   cells**. Cells already containing a *classical* mark are off-limits; cells with spooky
   marks are fine (a cell can hold many spooky marks).
2. Spooky marks form a graph: cells = nodes, each move = an edge between its two cells.
   When a move closes a **cycle**, collapse is triggered.
3. **Collapse choice:** the player who did *not* close the cycle picks which of the two
   cells the cycle-closing mark resolves into. That choice forces every other mark in the
   cycle (and any spooky marks dangling off collapsed cells) to resolve deterministically —
   each becomes a classical mark in exactly one cell.
4. After collapse, check for lines of classical marks. One player has a line → they win.
   **Both** complete lines in the same collapse → the line whose *highest move number* is
   **lower** wins (standard Goff tiebreak). No line → play continues on remaining cells.
5. If only one empty/uncollapsed cell remains and no line exists, the game is a draw.
   (The 9th mark is placed classically when only one cell is free.)

## Data model & architecture

Registry entry with `applyMove` + `boardProps` — no custom page.

```
board: string[9]              // classical marks only: '', 'X', 'O' (platform standard)
quantum: [{ cells: [a, b], mark: 'X1' }]   // spooky pairs, append-only until collapse
qphase: 'play' | 'collapse'
collapseChooser: 'X' | 'O'    // set when qphase = 'collapse'
collapseMark: 'X5'            // the cycle-closing mark awaiting the chooser's decision
```

`currentTurn` governs placement turns; during `qphase: 'collapse'` the interaction belongs
to `collapseChooser` regardless of `currentTurn` (the board component gates on it).
`winner`/`winningLine` standard — `winningLine` works because the final marks are classical
`board` entries. All new keys in `FIELD_NULLS`.

`src/lib/quantumTttLogic.js` (pure):

- `findCycle(quantum)` → cycle marks | null (union-find or DFS; deterministic order).
- `collapse(quantum, board, chosenCell)` → `{ board, remainingQuantum }` — resolves the
  whole connected component from the chooser's single decision (propagation is forced).
- `getWinner(board)` + `bothLinesTiebreak(lines, quantum)` (lower max-subscript wins).
- `legalPlacement(board, quantum, cells)`; `mustPlaceClassically(board, quantum)` (one
  free cell rule).

Registry `applyMove` handles both move kinds via the raw `move` payload from the board
component: `{ type: 'place', cells: [a, b] }` and `{ type: 'collapse', cell }` — the same
pattern SOS uses for its letter payload. `boardProps(game)` passes
`{ quantum, qphase, collapseChooser, collapseMark }`.

## UI/UX

- `src/components/QuantumTttBoard.jsx`, `maxWidth: 'max-w-sm'`. Classical marks render like
  regular TTT marks. Spooky marks render as small ghost glyphs with subscripts
  (`text-retro-p1/p2` at 40% opacity, `font-pixel text-[8px]`) stacked in a mini-grid
  within the cell — up to ~4 visible, "+n" overflow.
- Placement is two taps: first tap highlights the cell (`border-retro-cta`), second tap
  elsewhere commits the pair; tapping the first cell again cancels. A faint line connects
  the pair on hover/selection (SVG overlay, `stroke: rgb(var(--c-cta))` at low opacity).
- **Collapse mode is the showpiece:** when a cycle forms, the cycle's cells pulse
  (`win-flash` loop), a banner tells the chooser "CYCLE! CHOOSE WHERE Xn LANDS", and the
  two candidate cells glow. On choice, marks snap to classical one at a time (~120 ms
  stagger, `place-pop`) so the propagation cascade is readable.
- Sounds: `sounds.move(sym)` per placement, `sounds.bell()` on cycle detection,
  `sounds.hit(i)` per snap during collapse, standard win/lose/draw.
- Rules modal is mandatory content for this game (nobody knows the rules) — 3 illustrated
  steps in the existing `RulesModal` format, plus a "WATCH A CYCLE" mini-diagram.

## AI / demo mode

v1 bot is heuristic, not strong (acceptable — the target is teaching the rules): prefer
pairs that (1) threaten two potential lines, (2) touch center, (3) avoid closing cycles
unless simulation of both collapse choices shows at least one winning branch; as
collapse-chooser, pick the branch minimizing opponent immediate lines (1-ply simulation of
both options via `collapse()`).

## Edge cases

- Cycle detection must run after every placement; multiple simultaneous cycles are
  impossible (a single new edge closes at most one independent cycle in this graph).
- Both-lines tiebreak is deterministic from `quantum` subscripts — no ambiguity.
- Spectators during collapse phase see the pulsing cycle but no choice UI.
- Refresh mid-collapse: state is fully in Firebase (`qphase`, `collapseMark`) — resumes
  cleanly; nothing tab-local.

## Testing (vitest)

Cycle detection (triangle, long cycle, no-cycle chains); collapse propagation from each
choice of a crafted cycle (snapshot both resulting boards); dangling-mark resolution;
both-lines tiebreak; one-free-cell classical placement; draw detection; illegal placement
(classical cell, same-cell pair); fuzz: random legal games terminate with valid boards.

## Milestones

1. Logic module + tests (1–1.5 days — the collapse propagation is the hard part).
2. Board component + two-tap placement + collapse UI (1.5 days).
3. Registry, icon, rules modal content, demo bot (1 day).

## Open questions

- Show move subscripts always, or only on long-press ("clean mode")? Start: always — the
  subscripts are load-bearing for the tiebreak rule.
- Bot strength: is 1-ply enough to be fun? Revisit after playtest; a 2-ply search over the
  small graph is cheap if needed.
