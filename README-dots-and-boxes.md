# Dots and Boxes — implementation plan (not yet built)

## Context

The platform (React + Vite + Firebase RTDB, no backend) currently offers tictactoe, connectfour, and hangwoman. This plan adds a fourth game type, **Dots and Boxes**: players take turns drawing edges on a dot grid; completing a box claims it and grants an extra turn; most boxes wins the round. Rounds feed the existing first-to-3 match system.

Decided rules: **4×4 boxes** (5×5 dots, 40 edges, 16 boxes) and **early clinch** — a round ends as soon as one player owns 9 boxes (majority); 8–8 with all boxes claimed is a draw.

The room/invite/presence/score/win-effect layer is game-agnostic. The codebase has a game registry (`src/lib/games.js`: `GAME_TYPES` + `freshGameState`) used by `Home.jsx` creation, `Game.jsx` resets, and the `GameSwitcher` — Dots and Boxes plugs into all of these.

## Data model (Firebase `games/{gameId}`)

- `gameType: 'dotsandboxes'`
- `board: string[40]` — edges, `''`/`'X'`/`'O'` (keeps the platform's empty-string convention so `normalizeBoard` works). Horizontal edges 0–19: `row*4+col` (rows 0–4, cols 0–3). Vertical edges 20–39: `20 + row*5 + col` (rows 0–3, cols 0–4).
- `boxes: string[16]` — box ownership, `''`/`'X'`/`'O'`. Must be stored (not derived): ownership depends on who drew each box's *last* edge.
- `currentTurn` does **not** flip when the move completes ≥1 box (extra turn).
- `winner` set with no `winningLine` (Game.jsx already guards `result.line?.length`).

## Files

### 1. New `src/lib/dotsAndBoxesLogic.js`
```js
export const DB_SIZE = 4, DB_EDGE_COUNT = 40, DB_BOX_COUNT = 16
export const hEdgeIndex = (row, col) => row * 4 + col
export const vEdgeIndex = (row, col) => 20 + row * 5 + col
export function edgesOfBox(b)   // [top, bottom, left, right] = [hEdge(r,c), hEdge(r+1,c), vEdge(r,c), vEdge(r,c+1)]
export function boxesOfEdge(e)  // 1–2 adjacent box indices (border edges → 1, interior → 2)
export function applyEdgeMove(edges, boxes, edgeIndex, symbol)
  // pure; null if out of range or occupied
  // → { edges, boxes, completedBoxes: number[] } — completed boxes assigned to symbol
export function getDotsAndBoxesWinner(boxes)
  // x>=9 → {winner:'X'}; o>=9 → {winner:'O'}; all 16 claimed → {winner:'draw'}; else null
```

### 2. New `src/lib/dotsAndBoxesLogic.test.js` (vitest, style of `hangmanLogic.test.js`)
- Index helpers: `hEdgeIndex(4,3)===19`, `vEdgeIndex(3,4)===39`; `edgesOfBox(0)===[0,4,20,21]`, `edgesOfBox(15)===[15,19,38,39]`.
- `boxesOfEdge`: border H/V → 1 box (edge 0→[0], edge 19→[15], edge 20→[0]); interior → 2 (edge 5→[1,5], edge 26→[4,5]).
- Adjacency property: every box appears in `boxesOfEdge(e)` for each of its 4 edges; total incidences = 64.
- `applyEdgeMove`: places symbol, no input mutation; null on occupied/−1/40; no completion → `completedBoxes: []`; 4th edge completes box for mover; **last edge wins ownership** (3 edges by X, 4th by O → O owns); **double completion** (shared interior edge completes 2 boxes, both to mover); pre-claimed box not re-claimed.
- `getDotsAndBoxesWinner`: null on empty / partial / 8–7; clinch at 9 for X and O; 8–8 full → draw; result has no `line` property.
- Full-game simulation: drive all moves through `applyEdgeMove` with the extra-turn rule; assert counts sum to 16 and winner matches.

### 3. New `src/components/DotsAndBoxesBoard.jsx`
Props `{ board, boxes, onMove, disabled, currentTurn }`. Follow `ConnectFourBoard.jsx` patterns (container, hovered state, X=cyan / O=pink).

- Container: `bg-retro-surface border-2 border-retro-border rounded p-3`, inner 9×9 CSS grid, `aspect-square`, both templates `14px repeat(4, minmax(0,1fr) 14px)`. On a 360px phone box tracks ≈ 57px.
- Render 81 cells in one loop (`gr=⌊i/9⌋`, `gc=i%9`), auto-placement:
  - even/even → dot (`w-2 h-2 rounded-sm bg-retro-dim`, centered)
  - even row/odd col → horizontal edge `hEdgeIndex(gr/2, (gc-1)/2)`
  - odd row/even col → vertical edge `vEdgeIndex((gr-1)/2, gc/2)`
  - odd/odd → box `((gr-1)/2)*4 + (gc-1)/2`
- Edge = `relative` cell wrapper + absolutely positioned button overflowing the 14px cross-axis by 9px each side (`-top-[9px] -bottom-[9px]` for H; mirrored for V) → **32px touch target** while the visible line stays 6px thick (`z-10`, `aria-label`). Colors: claimed → `bg-retro-cyan shadow-neon-cyan` / pink equivalent; hovered+enabled → `currentTurn`-colored at /40; empty → `bg-retro-border/50`.
- Box cell: owner-tinted background (`bg-retro-cyan/15` etc.) + owner letter in `font-pixel` with glow, entering via `box-claim` animation.
- Below the grid: box-count bar `X n — n O` in `font-pixel text-[10px]` (cyan/pink).

### 4. `src/index.css` — add keyframe
```css
@keyframes box-claim { 0% { transform: scale(0.4); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
```

### 5. `src/lib/games.js`
- `GAME_TYPES` += `{ type: 'dotsandboxes', label: 'DOTS & BOXES' }` (GameSwitcher picks it up automatically).
- `freshGameState`: dotsandboxes → `{ board: Array(40).fill(''), boxes: Array(16).fill(''), currentTurn: 'X', round: null }`; **all other types get `boxes: null`** so switching away from dots deletes the stale node (same pattern as `round: null`).

### 6. `src/pages/Game.jsx`
- Imports: `DotsAndBoxesBoard`; `{ DB_EDGE_COUNT, DB_BOX_COUNT, applyEdgeMove, getDotsAndBoxesWinner }`. New ref `prevEdgeCount = useRef(0)`.
- **`handleMove`** (src/pages/Game.jsx:197): after the three guards, early-return branch for dotsandboxes — normalize `board`(40) and `boxes`(16), `applyEdgeMove(...)`, return if null, `sounds.move(mySymbol)`, write `{ board, boxes, currentTurn: completedBoxes.length ? mySymbol : flipped }`; if `getDotsAndBoxesWinner(boxes)` → `winner`, `status:'finished'`, increment `scores/{winner}` unless draw (no `winningLine`).
- **Reset handlers** (src/pages/Game.jsx:238,251): replace the duplicated `boardSize`/`Array(...).fill('')` in `handlePlayAgain`/`handleNewMatch` with `...freshGameState(game.gameType)` — resets `boxes` for dots; `handleSwitchGame` already spreads it.
- **Sounds effect** (src/pages/Game.jsx:183–191): turn-flip detection misses chained extra-turn moves. For dotsandboxes, instead fire `sounds.move(prevTurn.current)` when filled-edge count increased AND `prevTurn.current && prevTurn.current !== mySymbol.current` (skip own moves — sound already played locally; spectators stay silent as today). Keep the existing turn-flip rule for other types only (mutually exclusive, no double-fire). Update `prevEdgeCount` each run; play-again (40→0) can't fire due to strict `>`.
- **Render** (src/pages/Game.jsx:298): `isDots` flag; `boardSize = isDots ? DB_EDGE_COUNT : ...`; `boxes = isDots ? normalizeBoard(game.boxes, DB_BOX_COUNT) : null`; header badge `DB` next to C4/HW; board ternary renders `<DotsAndBoxesBoard board boxes onMove disabled={!canMove} currentTurn />`; GameStatus/spectator/disconnect lines unchanged. Container stays `max-w-sm`.

### 7. `src/pages/Home.jsx`
Add 4th `GAMES` card `{ type: 'dotsandboxes', label: 'DOTS & BOXES', desc: '4 × 4', icon: <svg…dots+partial edges+one filled box…> }` — makes the grid an even 2×2. `createGame` already spreads `freshGameState(gameType)`, so no creation logic change.

### 8. `src/pages/Demo.jsx`
Add a `DotsAndBoxesDemo` section (pattern of the local TTT demo): local `edges`/`boxes`/`currentTurn`/`status`/`winner` state, hot-seat `handleMove` applying the extra-turn rule, renders `DotsAndBoxesBoard` + `GameStatus` with reset. Doubles as single-tab manual testing of extra turns and double-box completion.

### 9. `CLAUDE.md`
Data-model section: add `"dotsandboxes"` to `gameType`, document `board: string[40]` edge indexing + `boxes: string[16]`, the extra-turn rule, early-clinch end condition, and absent `winningLine`. Fix the stale "There are no automated tests" line (`npm run test` runs vitest).

## Edge cases covered
- One edge completing **two** boxes → both to mover, one extra turn.
- Last move completes box and ends round → box assigned before winner computed.
- Game-switch away from dots → `boxes: null` cleanup in `freshGameState`.
- Play again / new match → `boxes` reset via `freshGameState` spread.
- Spectators: edges disabled via `canMove`, silent sounds, SPECTATING label — all generic.
- Races: same last-write-wins `update()` pattern as TTT/CF; occupied-edge guard absorbs double-taps.

## Verification
1. `npm run test` — new logic tests pass (plus existing).
2. `npm run lint`.
3. `npm run dev`, open `/demo` — play the local Dots and Boxes demo: extra turn on box completion, double-box edge, clinch at 9 ends the round.
4. Two-tab run: create DOTS & BOXES game, join from second tab; verify turns, extra turns, opponent move sounds during chains, box counts, win/draw + score increment, PLAY AGAIN (boxes cleared), NEW MATCH, switch dots→tictactoe→dots (no stale `boxes`), third tab spectates.
