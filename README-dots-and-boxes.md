# Dots and Boxes — design notes (shipped)

## Overview

The fourth game type on the platform (React + Vite + Firebase RTDB, no backend), alongside tictactoe, connectfour, and hangwoman. Players take turns drawing edges on a dot grid; completing a box claims it and grants an extra turn; most boxes wins the round. Rounds feed the existing first-to-3 match system.

Rules as built: **4×4 boxes** (5×5 dots, 40 edges, 16 boxes) and **early clinch** — a round ends as soon as one player owns 9 boxes (majority); 8–8 with all boxes claimed is a draw.

The room/invite/presence/score/win-effect layer is game-agnostic, and `Game.jsx` has no per-game branches. Dots and Boxes doesn't fit the registry's standard place-symbol → flip-turn → check-winner shape (extra turn on box completion, a second `boxes` array, winner computed from boxes), so it shipped with two new **optional registry hooks** — `applyMove` and `boardProps` — rather than per-game branches in `Game.jsx`. Any future non-standard game can use the same hooks.

## Data model (Firebase `games/{gameId}`)

- `gameType: 'dotsandboxes'`
- `board: string[40]` — edges, `''`/`'X'`/`'O'` (keeps the platform's empty-string convention so `normalizeBoard` works). Horizontal edges 0–19: `row*4+col` (rows 0–4, cols 0–3). Vertical edges 20–39: `20 + row*5 + col` (rows 0–3, cols 0–4).
- `boxes: string[16]` — box ownership, `''`/`'X'`/`'O'`. Stored, not derived: ownership depends on who drew each box's *last* edge.
- `currentTurn` does **not** flip when the move completes ≥1 box (extra turn).
- `winner` is set with no `winningLine` (`Game.jsx` guards `result.line?.length`).

## Implementation map

### `src/lib/dotsAndBoxesLogic.js`
Pure logic, no DOM or Firebase:
```js
export const DB_SIZE = 4, DB_EDGE_COUNT = 40, DB_BOX_COUNT = 16
export const hEdgeIndex = (row, col) => row * 4 + col
export const vEdgeIndex = (row, col) => 20 + row * 5 + col
export function edgesOfBox(b)   // [top, bottom, left, right]
export function boxesOfEdge(e)  // 1–2 adjacent box indices (border edges → 1, interior → 2)
export function applyEdgeMove(edges, boxes, edgeIndex, symbol)
  // pure; null if out of range or occupied
  // → { edges, boxes, completedBoxes: number[] } — completed boxes assigned to symbol
export function getDotsAndBoxesWinner(boxes)
  // x>=9 → {winner:'X'}; o>=9 → {winner:'O'}; all 16 claimed → {winner:'draw'}; else null
```

### `src/lib/dotsAndBoxesLogic.test.js`
Vitest suite covering: index helpers and box/edge adjacency (every box appears in `boxesOfEdge(e)` for each of its 4 edges; 64 total incidences); `applyEdgeMove` immutability, occupied/out-of-range rejection, **last-edge-wins ownership** (3 edges by X, 4th by O → O owns), **double completion** (one shared interior edge completes 2 boxes, both to the mover); clinch at 9, 8–8 full-board draw, and a full-game simulation driving every move through `applyEdgeMove` with the extra-turn rule.

### `src/components/DotsAndBoxesBoard.jsx`
Props `{ board, boxes, onMove, disabled, currentTurn }`, following the `ConnectFourBoard.jsx` patterns (X=`retro-p1` / O=`retro-p2` — cyan/pink in the default theme). A 9×9 CSS grid renders dots, edges, and boxes from one loop. Each edge is a thin visible line inside a **32px touch target** (the button overflows the 14px cross-axis track). Claimed boxes get an owner-tinted background and a glowing owner letter entering via the `box-claim` keyframe (`src/index.css`). A box-count bar (`X n — n O`) sits under the grid.

### `src/lib/games.js` — registry entry + hooks
The `dotsandboxes` entry supplies `boardSize: DB_EDGE_COUNT`, the occupied-edge `getMoveIndex`, `DotsAndBoxesBoard`, badge `DB`, icon/desc, and the two hooks:
- `applyMove({ board, game, index, symbol })` → builds the full Firebase patch via `applyEdgeMove` (`board`, `boxes`, and a `currentTurn` that stays on `symbol` when ≥1 box completed) plus the result from `getDotsAndBoxesWinner(boxes)`. When this hook is present, `Game.jsx` delegates the entire move to it.
- `boardProps(game)` → `{ boxes: normalizeBoard(game.boxes, DB_BOX_COUNT) }`, spread onto the board component.

`freshGameState('dotsandboxes')` returns full empty `board`/`boxes` arrays; **all other game types return `boxes: null`** so switching away from dots deletes the stale node (same pattern as hangwoman's `round`).

### `src/pages/Game.jsx` — generic plumbing only
`handleMove` delegates to `cfg.applyMove` when present. The opponent-move sound can't use turn-flip detection (extra turns don't flip), so for `applyMove` games it fires when the filled-edge count increases on someone else's turn, tracked via a `prevFilledCount` ref. No `dotsandboxes` string appears in the file.

### `src/pages/Demo.jsx`
A local hot-seat `DotsAndBoxesDemo` (no Firebase) at `/demo` — handy for single-tab testing of extra turns and double-box completions.

### Home screen / switcher
No per-game UI code: the icon lives in `src/components/GameIcons.jsx`, and the registry entry's `Icon`/`desc` drive both the home-screen grid and the end-of-game **SWITCH GAME** picker through the shared `GamePicker` component. (The original plan called for a hand-added card in `Home.jsx`; that step was obsoleted by the `GamePicker` refactor.)

## Edge cases covered

- One edge completing **two** boxes → both to mover, one extra turn.
- Last move completes a box and ends the round → box assigned before winner computed.
- Game-switch away from dots → `boxes: null` cleanup in `freshGameState`.
- Play again / new match → `boxes` reset via the `freshGameState` spread.
- Spectators: edges disabled via `canMove`, silent sounds, SPECTATING label — all generic.
- Races: same last-write-wins `update()` pattern as TTT/CF; the occupied-edge guard absorbs double-taps.

## Manual test checklist

1. `npm test` and `npm run lint` pass.
2. `/demo` route: extra turn on box completion, double-box edge, clinch at 9 ends the round.
3. Two-tab run: create a DOTS & BOXES game, join from a second tab; verify turns, extra turns, opponent move sounds during chains, box counts, win/draw + score increment, PLAY AGAIN (boxes cleared), NEW MATCH, switch dots→tictactoe→dots (no stale `boxes`), third tab spectates.
