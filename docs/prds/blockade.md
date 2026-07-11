# PRD — Blockade (pawn race + wall-blocking duel)

**One-liner:** race your pawn to the far edge of a 9×9 board while dropping walls to force your
opponent the long way around — the classic abstract-strategy "block your rival's path" game,
built on the registry's `applyMove` shape.

**Trademark note:** the underlying mechanics (grid-race pawn + wall-placement abstract strategy
game) are public domain / not protected; **"Quoridor" is a registered trademark of Gigamic**.
This game ships under the original name **Blockade** and is not affiliated with or endorsed by
Gigamic.

| | |
|---|---|
| `type` | `blockade` |
| Label / badge | `BLOCKADE` / `BK` |
| Category | `board` (2 players + spectators) |
| Integration | **B** — registry + `applyMove`/`boardProps` (dots & boxes / SOS precedent) |
| Network | RTDB, turn-based, honest-client |
| Effort | **M** |
| Priority | matches other registry board games |

---

## 1. Overview and rules

**Board:** a 9×9 grid of cells, indexed `0`–`80` row-major (`cell = row*9 + col`, `row/col` both
`0`–`8`). Row `0` is the top, row `8` is the bottom.

**Pawns:** X starts at cell `76` (row 8, col 4 — bottom center); X's goal is **row 0** (the top
edge — any of the 9 cells in row 0). O starts at cell `4` (row 0, col 4 — top center); O's goal is
**row 8** (the bottom edge). Both players see the same absolute board orientation — there is no
per-seat flip (same precedent as Dots & Boxes / SOS).

**Walls:** each player starts with **10 walls** in reserve. A wall occupies one **slot** in a
128-slot array that sits in the gutters between cells (see §2 for the exact indexing). Placing a
wall permanently blocks movement across the two cell-edges it spans, for both players, for the
rest of the round. Walls are never removed once placed.

**Turn structure:** on your turn you do **exactly one** of:
- **Move your pawn** one step (orthogonal step, straight jump, or diagonal jump — see §4), or
- **Place one wall** (if you have any remaining and a legal slot exists).

`currentTurn` **always flips** after either action — there is no extra-turn rule (unlike Dots &
Boxes/SOS). A player is never without a legal move: the wall-sealing rule (§4) guarantees a path
to your goal always exists, and the first edge of that path is always an unblocked, legal single
step (possibly by jumping/diagonal-jumping around the opponent if they're standing on it) — so
**stalemate/no-legal-move is impossible**, and wall moves are always optional, never mandatory.

**Win condition:** the instant a player's pawn lands on any cell in their goal row (via a move,
straight jump, or diagonal jump), that player wins immediately. **Draws are impossible** — there
is no "board fills up" end state the way there is for Dots & Boxes/SOS. There is no
`winningLine` concept (same as Dots & Boxes/SOS — a single winning cell, not a line, ends the
round).

**Match/score:** standard platform machinery — each round win increments `scores/{winner}`; first
to 3 round wins takes the match (`GameStatus`'s existing `MATCH_WINS = 3`). Nothing custom needed.

---

## 2. Data model

All new keys are **top-level** under `games/{gameId}` (not nested — matches the dots-and-boxes/SOS
pattern of using `board` + a few sibling keys, not a `round` sub-node).

| Key | Type | Lifecycle | Written by |
|---|---|---|---|
| `board` | `string[128]` | `''` empty · `'X'`/`'O'` = **placed by** that player. Wall slot ownership only (rendering color) — walls never move once placed. Index scheme: see below. | `applyMove` (wall moves only; pawn moves never touch `board`) |
| `blockadePawnX` | `int` (cell 0–80) | X's pawn cell index. Starts `76`. | `applyMove` (pawn moves for X) |
| `blockadePawnO` | `int` (cell 0–80) | O's pawn cell index. Starts `4`. | `applyMove` (pawn moves for O) |
| `blockadeWallsX` | `int` (0–10) | X's remaining wall count. Starts `10`, decrements by 1 on each of X's legal wall placements. | `applyMove` (wall moves for X) |
| `blockadeWallsO` | `int` (0–10) | O's remaining wall count. Starts `10`. | `applyMove` (wall moves for O) |
| `currentTurn` | `"X"\|"O"` | Existing generic key. Always flips after any legal move (pawn or wall). | `applyMove` |
| `winner` | `"X"\|"O"` | Existing generic key. Set the instant a pawn reaches its goal row. Never `"draw"`. | `Game.jsx` (standard `handleMove` path, from `applyMove`'s `result`) |
| `boxes` | `null` | Existing generic key, unused by Blockade (always `null`, exactly like Reversi/Gomoku/Chain Reaction). | `freshGameState` |

**New keys to add to `FIELD_NULLS`** (`src/lib/games.js`) so switching away from Blockade clears
them: `blockadePawnX`, `blockadePawnO`, `blockadeWallsX`, `blockadeWallsO`. (`board` and
`currentTurn` are already generic keys handled by every game's `freshGameState` branch — no new
`FIELD_NULLS` entry needed for them.)

### Wall slot indexing (`board: string[128]`)

Two slot families, 64 each (an 8×8 grid of "gutter intersections" — one fewer than the 9×9 cell
grid in each dimension, same as Quoridor's classic 8×8 wall grid):

```
Horizontal slot: h(r, c) = r*8 + c              r, c ∈ [0, 7]   → indices 0–63
Vertical slot:   v(r, c) = 64 + r*8 + c          r, c ∈ [0, 7]   → indices 64–127
```

- `h(r, c)` blocks **vertical** movement (between cell-row `r` and `r+1`) and physically spans
  **cell columns `c` and `c+1`** — i.e. it blocks the two edges (r,c)↔(r+1,c) and
  (r,c+1)↔(r+1,c+1).
- `v(r, c)` blocks **horizontal** movement (between cell-col `c` and `c+1`) and physically spans
  **cell rows `r` and `r+1`** — i.e. it blocks the two edges (r,c)↔(r,c+1) and
  (r+1,c)↔(r+1,c+1).

This 2-cell span (not 1-cell, unlike Dots & Boxes edges) is the source of the wall **conflict
matrix** and the **edge-blocked** lookup in §4 — both are derived directly from this definition,
not independently invented, so keep them in sync if this indexing ever changes.

---

## 3. New files

### `src/lib/blockadeLogic.js`

Pure logic, no DOM, no network. Complete export list:

| Export | Signature | Behavior |
|---|---|---|
| `BK_SIZE` | `9` | Grid dimension (cells per side). |
| `BK_CELL_COUNT` | `81` | Total cells (`BK_SIZE ** 2`). |
| `BK_WALL_SLOT_COUNT` | `128` | Total wall slots (`64 h + 64 v`). |
| `BK_WALLS_PER_PLAYER` | `10` | Starting wall reserve. |
| `BK_START_X` | `76` | X's starting cell. |
| `BK_START_O` | `4` | O's starting cell. |
| `hSlot` | `(r, c) => number` | `r*8 + c`. |
| `vSlot` | `(r, c) => number` | `64 + r*8 + c`. |
| `decodeSlot` | `(slot) => { orientation: 'h'\|'v', r, c }` | Inverse of `hSlot`/`vSlot`. |
| `cellAt` | `(r, c) => number` | `r*9+c`, or `-1` if `r`/`c` outside `[0,8]`. |
| `orthogonalNeighbors` | `(cell) => number[]` | Up to 4 in-bounds orthogonal neighbor cells (no diagonals, no wall awareness). |
| `isEdgeBlocked` | `(walls, cellA, cellB) => boolean` | True if a wall blocks direct movement between two **orthogonally-adjacent** cells; `true` (treated as blocked) if the cells aren't orthogonally adjacent. |
| `legalPawnMoves` | `(pawns, walls, symbol) => number[]` | All legal destination cells for `symbol`'s pawn this turn — orthogonal steps, straight jump, diagonal jumps (§4 algorithm). `pawns = { X: cell, O: cell }`. |
| `wallConflictSlots` | `(slot) => number[]` | The other slot indices that physically overlap `slot` (§4 conflict matrix) — used for placement legality and for tests. |
| `isWallPlacementValid` | `(walls, wallsRemaining, slot) => boolean` | Cheap check only: slot in range, slot empty, `wallsRemaining > 0`, no conflict-matrix overlap. **Does not** run the path-sealing BFS. |
| `shortestPathToGoal` | `(walls, fromCell, goalRow) => { distance: number, path: number[] }` | BFS shortest path (steps) from `fromCell` to the nearest cell in `goalRow`, ignoring pawn occupancy (walls only). `distance: Infinity, path: []` if unreachable. |
| `hasPathToGoal` | `(walls, fromCell, goalRow) => boolean` | `shortestPathToGoal(...).distance !== Infinity`. |
| `isWallMoveLegal` | `(walls, pawns, wallsRemaining, slot, symbol) => boolean` | Full wall-placement legality: `isWallPlacementValid` **and** both pawns retain `hasPathToGoal` after the tentative placement. This is the single source of truth — used by `applyWallMove` **and** by `BlockadeBoard`'s live preview, so preview and enforcement can never drift apart. |
| `applyPawnMove` | `({ walls, pawns, symbol, to }) => { winner: 'X'\|'O'\|null } \| null` | `null` if `to` isn't in `legalPawnMoves(pawns, walls, symbol)`. Otherwise reports whether this move wins (lands on `symbol`'s goal row). Caller (the registry glue) is responsible for actually writing the new pawn position. |
| `applyWallMove` | `({ walls, pawns, wallsRemaining, symbol, slot }) => { walls: string[] } \| null` | `null` if `!isWallMoveLegal(...)`. Otherwise returns the new 128-length wall array with `slot` set to `symbol`. Does not mutate the input array. |
| `computeBotMove` | `(game, symbol) => { type: 'pawn', to } \| { type: 'wall', slot }` | Casual `/demo` bot heuristic (§4). `game` must have `.board`, `.blockadePawnX/O`, `.blockadeWallsX/O` (same shape as Firebase/registry state — works unchanged against the `BotBoardDemo` harness's local game object). Never returns an illegal move. |

### `src/lib/blockadeLogic.test.js`

Vitest suite — see §7 for the enumerated case list.

### `src/components/BlockadeBoard.jsx`

**Props contract:**

```
BlockadeBoard({ board, pawns, walls, onMove, disabled, currentTurn })

board:       string[128]              // wall slot ownership, '' | 'X' | 'O'
pawns:       { X: number, O: number }  // pawn cell indices 0-80
walls:       { X: number, O: number }  // walls remaining per player
onMove:      (payload) => void         // payload: { type: 'pawn', to } | { type: 'wall', slot }
disabled:    boolean                   // true when it isn't the local viewer's turn (or round over)
currentTurn: 'X' | 'O'                 // when !disabled, this IS the local viewer's symbol
                                        // (Game.jsx invariant — same as every other board)
```

`winningLine` is passed by `Game.jsx` to every `BoardComponent` but is **not** part of this
contract — Blockade ignores it, exactly like `DotsAndBoxesBoard`/`SosBoard` (neither of which
declares it as a prop either).

Full interaction/rendering spec is in §5.

---

## 4. Logic details

### 4.1 `isEdgeBlocked` — the core primitive

Given two orthogonally-adjacent cells, is movement between them blocked by a wall?

```js
function isEdgeBlocked(walls, cellA, cellB) {
  const rA = Math.floor(cellA / 9), cA = cellA % 9
  const rB = Math.floor(cellB / 9), cB = cellB % 9

  if (rA === rB && Math.abs(cA - cB) === 1) {
    // horizontally adjacent — blocked by a VERTICAL wall at this row-gap's column
    const r = rA, c = Math.min(cA, cB)
    if (r <= 7 && walls[vSlot(r, c)]) return true
    if (r >= 1 && walls[vSlot(r - 1, c)]) return true
    return false
  }
  if (cA === cB && Math.abs(rA - rB) === 1) {
    // vertically adjacent — blocked by a HORIZONTAL wall at this column-gap's row
    const c = cA, r = Math.min(rA, rB)
    if (c <= 7 && walls[hSlot(r, c)]) return true
    if (c >= 1 && walls[hSlot(r, c - 1)]) return true
    return false
  }
  return true // not orthogonally adjacent at all — treat as impassable
}
```

Why two slots are checked per direction: a wall physically spans **2 cell-widths** (§2), so the
single edge between (say) column `c` and `c+1` sits under **both** `v(r,c)` (which spans columns
`c..c+1`) **and** `v(r-1,c)` (which spans the same columns one row up) if `r` is in the middle of
the wall's span rather than at its start. Either slot being occupied blocks the edge.

### 4.2 `legalPawnMoves` — steps, straight jump, diagonal jump

```js
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]] // up, down, left, right

function legalPawnMoves(pawns, walls, symbol) {
  const opp = symbol === 'X' ? 'O' : 'X'
  const mine = pawns[symbol]
  const oppCell = pawns[opp]
  const r0 = Math.floor(mine / 9), c0 = mine % 9
  const moves = new Set()

  for (const [dr, dc] of DIRS) {
    const adj = cellAt(r0 + dr, c0 + dc)
    if (adj === -1) continue
    if (isEdgeBlocked(walls, mine, adj)) continue

    if (adj !== oppCell) {
      moves.add(adj)               // plain orthogonal step
      continue
    }

    // adjacent cell holds the opponent's pawn — try the straight jump
    const ar = Math.floor(adj / 9), ac = adj % 9
    const far = cellAt(ar + dr, ac + dc)
    if (far !== -1 && !isEdgeBlocked(walls, adj, far)) {
      moves.add(far)                // straight jump over the opponent
      continue
    }

    // straight jump blocked (board edge OR a wall) — diagonals around the opponent
    const perpDirs = dr !== 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]
    for (const [pdr, pdc] of perpDirs) {
      const diag = cellAt(ar + pdr, ac + pdc)
      if (diag !== -1 && !isEdgeBlocked(walls, adj, diag)) {
        moves.add(diag)             // diagonal jump
      }
    }
  }

  return [...moves]
}
```

Notes:
- The plain step onto the opponent's cell is **never** added directly — only the far/diagonal
  cells reachable by jumping are legal when the opponent occupies an adjacent cell.
- With only 2 pawns on the board, a diagonal target can never itself be occupied — no extra
  occupancy check is needed there.
- This ignores nothing about board bounds or walls — every candidate is re-checked against
  `isEdgeBlocked` individually, including the second leg of a jump.

### 4.3 Wall conflict matrix

```js
function wallConflictSlots(slot) {
  const { orientation, r, c } = decodeSlot(slot)
  const out = []
  if (orientation === 'h') {
    if (c - 1 >= 0) out.push(hSlot(r, c - 1))
    if (c + 1 <= 7) out.push(hSlot(r, c + 1))
    out.push(vSlot(r, c))
  } else {
    if (r - 1 >= 0) out.push(vSlot(r - 1, c))
    if (r + 1 <= 7) out.push(vSlot(r + 1, c))
    out.push(hSlot(r, c))
  }
  return out
}
```

`h(r,c)` conflicts with `h(r,c-1)` and `h(r,c+1)` (both physically overlap one of `h(r,c)`'s two
spanned columns) and with `v(r,c)` (a vertical wall at the same intersection would cross it at the
center point). Symmetric for `v(r,c)`.

```js
function isWallPlacementValid(walls, wallsRemaining, slot) {
  if (slot < 0 || slot >= 128) return false
  if (walls[slot]) return false
  if (wallsRemaining <= 0) return false
  return !wallConflictSlots(slot).some(s => walls[s])
}
```

### 4.4 Path-sealing BFS

```js
function shortestPathToGoal(walls, fromCell, goalRow) {
  const visited = new Array(81).fill(false)
  const parent = new Array(81).fill(-1)
  visited[fromCell] = true
  const queue = [fromCell]
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]
    if (Math.floor(cur / 9) === goalRow) {
      const path = []
      for (let n = cur; n !== -1; n = parent[n]) path.unshift(n)
      return { distance: path.length - 1, path }
    }
    for (const n of orthogonalNeighbors(cur)) {
      if (!visited[n] && !isEdgeBlocked(walls, cur, n)) {
        visited[n] = true
        parent[n] = cur
        queue.push(n)
      }
    }
  }
  return { distance: Infinity, path: [] }
}

const hasPathToGoal = (walls, fromCell, goalRow) =>
  shortestPathToGoal(walls, fromCell, goalRow).distance !== Infinity
```

**Deliberately ignores pawn occupancy** — only walls block this graph. This is the standard
Quoridor-family implementation choice: the jump/diagonal-jump rules guarantee a pawn can always
maneuver around the other pawn, so "is there a route to the goal" is purely a walls-only
reachability question. This same graph is reused for the bot's distance heuristic (§4.6).

```js
function isWallMoveLegal(walls, pawns, wallsRemaining, slot, symbol) {
  if (!isWallPlacementValid(walls, wallsRemaining, slot)) return false
  const trial = [...walls]
  trial[slot] = symbol
  return hasPathToGoal(trial, pawns.X, 0) && hasPathToGoal(trial, pawns.O, 8)
}
```

Both pawns are checked — **including the placer's own pawn** — not just the opponent's.

### 4.5 Move appliers

```js
function applyPawnMove({ walls, pawns, symbol, to }) {
  const legal = legalPawnMoves(pawns, walls, symbol)
  if (!legal.includes(to)) return null
  const goalRow = symbol === 'X' ? 0 : 8
  const winner = Math.floor(to / 9) === goalRow ? symbol : null
  return { winner }
}

function applyWallMove({ walls, pawns, wallsRemaining, symbol, slot }) {
  if (!isWallMoveLegal(walls, pawns, wallsRemaining, slot, symbol)) return null
  const next = [...walls]
  next[slot] = symbol
  return { walls: next }
}
```

Neither mutates its input array.

### 4.6 `computeBotMove` — casual `/demo` heuristic

```js
function computeBotMove(game, symbol) {
  const walls = game.board || Array(128).fill('')
  const pawns = { X: game.blockadePawnX ?? 76, O: game.blockadePawnO ?? 4 }
  const wallsRemaining = { X: game.blockadeWallsX ?? 10, O: game.blockadeWallsO ?? 10 }
  const opp = symbol === 'X' ? 'O' : 'X'
  const myGoal = symbol === 'X' ? 0 : 8
  const oppGoal = opp === 'X' ? 0 : 8

  const myDist = shortestPathToGoal(walls, pawns[symbol], myGoal).distance
  const oppDist = shortestPathToGoal(walls, pawns[opp], oppGoal).distance

  function bestStep() {
    const legal = legalPawnMoves(pawns, walls, symbol)
    if (!legal.length) return null // mathematically unreachable (see §1) — defensive only
    let best = legal[0], bestD = Infinity
    for (const to of legal) {
      const d = shortestPathToGoal(walls, to, myGoal).distance
      if (d < bestD) { bestD = d; best = to }
    }
    return { type: 'pawn', to: best }
  }

  // Ahead or tied on distance, or out of walls: just walk your shortest path.
  // (A move landing on the goal row has distance 0 post-move, so this also
  // naturally prefers an immediate winning step over any other option.)
  if (wallsRemaining[symbol] <= 0 || myDist <= oppDist) return bestStep()

  // Behind — look for a wall that hurts the opponent's path more than it hurts ours.
  const oppPath = shortestPathToGoal(walls, pawns[opp], oppGoal).path
  const candidates = new Set()
  for (const cell of oppPath) for (const slot of slotsNearCell(cell)) candidates.add(slot)

  let bestSlot = null, bestGain = 0
  for (const slot of candidates) {
    if (!isWallMoveLegal(walls, pawns, wallsRemaining[symbol], slot, symbol)) continue
    const trial = [...walls]; trial[slot] = symbol
    const newOppDist = shortestPathToGoal(trial, pawns[opp], oppGoal).distance
    const newMyDist = shortestPathToGoal(trial, pawns[symbol], myGoal).distance
    const gain = (newOppDist - oppDist) - (newMyDist - myDist)
    if (gain > bestGain) { bestGain = gain; bestSlot = slot }
  }

  return bestSlot !== null ? { type: 'wall', slot: bestSlot } : bestStep()
}

// The up-to-8 wall slots whose 2×2 footprint touches this cell's corners —
// a cheap proxy for "walls that could plausibly block movement near here".
function slotsNearCell(cell) {
  const r = Math.floor(cell / 9), c = cell % 9
  const slots = []
  for (const dr of [-1, 0]) {
    for (const dc of [-1, 0]) {
      const rr = r + dr, cc = c + dc
      if (rr >= 0 && rr <= 7 && cc >= 0 && cc <= 7) { slots.push(hSlot(rr, cc)); slots.push(vSlot(rr, cc)) }
    }
  }
  return slots
}
```

Every wall candidate is re-validated through `isWallMoveLegal` (including the BFS sealing check)
before it's ever returned, and every pawn candidate comes straight out of `legalPawnMoves` — so
`computeBotMove` can never return an illegal move by construction.

---

## 5. UI/UX

### Layout

Standard board chrome, matching Dots & Boxes/SOS: `bg-retro-surface border-2 border-retro-border
rounded p-3`, wrapped at `max-w-md mx-auto` (registry `maxWidth`). Below the board: a wall-count
chip bar, then the MOVE/WALL mode toggle (SOS's S/O toggle precedent).

### Grid geometry

The board is a CSS grid of **17×17 tracks** — 9 "cell" tracks (`minmax(0,1fr)`) interleaved with 8
thin "groove" tracks (`6px`), exactly the same idea as `DotsAndBoxesBoard`'s dot/box interleave,
generalized so a wall spans **3** tracks (cell, groove, cell) instead of DB's 1-track edges:

```
gridTemplateColumns: 'repeat(8, minmax(0,1fr) 6px) minmax(0,1fr)'   // and identical for rows
```

Track index for cell coordinate `k` (0–8) is `2k`; the groove track between cell `k` and `k+1` is
`2k+1`. CSS grid lines are 1-indexed (track `t` spans line `t+1` to `t+2`):

- **Cell `(r,c)`**: `gridRow: '${2r+1} / ${2r+2}'`, `gridColumn: '${2c+1} / ${2c+2}'`
- **Horizontal wall `h(r,c)`** (`r,c` 0–7): `gridRow: '${2r+2} / ${2r+3}'` (the single groove-row
  between cell-row `r`/`r+1`), `gridColumn: '${2c+1} / ${2c+4}'` (spans cell `c`, the groove, cell
  `c+1`)
- **Vertical wall `v(r,c)`** (`r,c` 0–7): `gridRow: '${2r+1} / ${2r+4}'` (spans cell `r`, the
  groove, cell `r+1`), `gridColumn: '${2c+2} / ${2c+3}'` (the single groove-column between
  cell-col `c`/`c+1`)

Because the wall's long axis is already spanned via `gridRow`/`gridColumn`, only the **thin axis**
needs the DB-style negative-inset enlargement for a comfortable tap target: a horizontal wall's
hit element gets `absolute -top-[8px] -bottom-[8px] left-0 right-0`; a vertical wall's gets
`absolute top-0 bottom-0 -left-[8px] -right-[8px]` (mirrors `DotsAndBoxesBoard`'s
`-top-[9px]-bottom-[9px]` / `-left-[9px]-right-[9px]` technique exactly, just axis-matched to our
slot orientation).

### Cells (pawn layer)

- Goal-row hint: row `0` cells get a faint `bg-retro-p1/5` tint (X's finish line); row `8` cells
  get `bg-retro-p2/5` (O's finish line). All other cells transparent.
- A pawn renders as a filled disc (~60% of the cell) centered in its cell: `bg-retro-p1
  shadow-neon-p1` for X, `bg-retro-p2 shadow-neon-p2` for O.
- **MOVE mode, my turn** (`mode==='move' && !disabled`): compute
  `legalPawnMoves(pawns, board, currentTurn)` once per render. Cells in that set render as
  `<button>`s styled like `ReversiBoard`'s legal-move hint —
  `hover:bg-retro-p1/15 hover:border-retro-p1/40 cursor-pointer` when `currentTurn==='X'`
  (mirrored `p2` for O) — `onClick={() => onMove({ type: 'pawn', to: cellIndex })}`.
- **WALL mode, or not my turn:** cells render as plain non-interactive `<div>`s (no `onClick`) —
  a wrapping container gets `pointer-events-none` while `mode==='wall'` as defense-in-depth so a
  stray tap can never fall through to a cell handler.

### Wall slots (groove layer)

- **Occupied** (`board[slot]` truthy): always renders as a solid bar — `bg-retro-p1
  shadow-neon-p1` or `bg-retro-p2 shadow-neon-p2` matching the placer — in **both** modes,
  `pointer-events-none` (can't reclick a placed wall).
- **Empty, MOVE mode:** a faint static groove line (`bg-retro-border/30`), `pointer-events-none` —
  purely decorative board texture, not interactive.
- **Empty, WALL mode:** interactive `<button>`. Two-tap confirm (required so mobile users get a
  chance to review before committing a wall):
  - Local state `pendingWallSlot: number | null` (default `null`).
  - Tap when `pendingWallSlot !== slot`: `setPendingWallSlot(slot)` — enters preview, does **not**
    call `onMove` yet.
  - Tap when `pendingWallSlot === slot` (i.e. tapping the same previewed slot again): calls
    `onMove({ type: 'wall', slot })` and immediately `setPendingWallSlot(null)` (optimistic clear,
    don't wait for the round-trip).
  - **Preview styling**, computed via `isWallMoveLegal(board, pawns, walls[currentTurn], slot,
    currentTurn)` (the same predicate `applyWallMove` itself uses — never invents a separate
    check): legal → `bg-retro-cta/40 border border-retro-cta shadow-neon-cta`; illegal → dim,
    `bg-retro-dim/20 border border-retro-dim opacity-50 cursor-not-allowed` (substituting a dim
    treatment for the literal "red" cue mentioned in design notes — the theme palette has no
    semantic danger/red token, and `cursor-not-allowed` already routes through the platform's
    existing pixel-art "no" cursor, which is exactly this kind of "disallowed" affordance).
  - **Desktop bonus:** `onMouseEnter`/`onMouseLeave` set a separate `hoverSlot` state that renders
    the identical preview styling without requiring a click — purely an added affordance; touch
    devices have no hover and rely on the tap-tap flow.
  - Tapping any **other** empty slot while one is pending **moves** the preview there (does not
    confirm the old one) — `setPendingWallSlot(newSlot)`.
  - `pendingWallSlot` (and `hoverSlot`) reset to `null` via `useEffect(() => { setPendingWallSlot(null) }, [currentTurn])`
    (covers both "I just moved" and "opponent just moved"), and also whenever `mode` switches away
    from `'wall'`.
  - Illegal-preview taps are still allowed to complete the two-tap confirm and call `onMove` —
    the preview is informational only; authoritative rejection happens in `applyMove` (honest-client
    tier, same as every other board game — no special-casing needed here).

### Mode toggle (SOS S/O precedent)

```jsx
<div className="flex items-center justify-center gap-3">
  {['move', 'wall'].map(m => (
    <button
      key={m}
      aria-label={`mode-${m}`}
      disabled={disabled}
      onClick={() => !disabled && setMode(m)}
      className={cn(
        'px-4 py-2 font-pixel text-[10px] rounded border-2 uppercase transition-all duration-100 active:scale-95',
        mode === m
          ? 'border-retro-cta text-retro-cta shadow-neon-cta'
          : 'border-retro-border text-retro-dim hover:border-retro-cta/50',
        disabled && 'opacity-50 cursor-default',
      )}
    >
      {m.toUpperCase()}
    </button>
  ))}
</div>
```

Switching modes resets `pendingWallSlot`/`hoverSlot` to `null`.

### Wall-count chip bar

Below the board, a row per player: label + 10 small pixel chips, filled while `index < remaining`:

```jsx
<div className="flex items-center justify-center gap-4 font-pixel text-[10px]">
  <span className="text-retro-p1 text-glow-p1">X</span>
  <div className="flex gap-[2px]">
    {Array.from({ length: 10 }, (_, i) => (
      <div key={i} className={cn('w-1.5 h-3 rounded-[1px]',
        i < walls.X ? 'bg-retro-p1 shadow-neon-p1' : 'bg-retro-border/30')} />
    ))}
  </div>
  <span className="text-retro-dim">—</span>
  <div className="flex gap-[2px]">
    {Array.from({ length: 10 }, (_, i) => (
      <div key={i} className={cn('w-1.5 h-3 rounded-[1px]',
        i < walls.O ? 'bg-retro-p2 shadow-neon-p2' : 'bg-retro-border/30')} />
    ))}
  </div>
  <span className="text-retro-p2 text-glow-p2">O</span>
</div>
```

### Mobile/touch

Discrete tap targets only (no drag gestures), so no `touch-action` override is needed (matches
Dots & Boxes/SOS — neither sets it). The negative-inset hit-area enlargement (§ Grid geometry)
is specifically there to make the thin groove axis comfortably tappable on a phone.

### Theming

Every color is a `retro-*`/`--c-*` token already in use elsewhere on this page (`retro-p1/p2/cta`,
`retro-dim`, `retro-border`, `text-glow-*`, `shadow-neon-*`). No hex anywhere, no `<canvas>`.

---

## 6. Integration touchpoints

Everything below is copy-pasteable. No `Game.jsx` changes are needed (Blockade is integration
type B, not a custom page — same as Dots & Boxes/SOS/Mancala).

### `src/lib/games.js` — imports

Add near the other board-component/logic imports:

```js
import BlockadeBoard from '../components/BlockadeBoard'
```

```js
import {
  BK_CELL_COUNT,
  BK_WALL_SLOT_COUNT,
  BK_WALLS_PER_PLAYER,
  BK_START_X,
  BK_START_O,
  applyPawnMove,
  applyWallMove,
} from './blockadeLogic'
```

Add `BlockadeIcon` to the existing `import { ... } from '../components/GameIcons'` list.

### `src/lib/games.js` — `GAME_TYPES` entry

Append to the `board`-category cluster (e.g. immediately after the `chainreaction` entry):

```js
  {
    type: 'blockade', label: 'BLOCKADE',
    desc: 'race across, wall them off', Icon: BlockadeIcon,
    badge: 'BK', maxWidth: 'max-w-md',
    category: 'board',
    addedAt: '2026-07-11',
    durationMin: 10, tags: ['thinky'], solo: true,
    boardSize: BK_WALL_SLOT_COUNT,
    getMoveIndex: (board, move) => {
      if (!move || typeof move !== 'object') return -1
      if (move.type === 'pawn') {
        return Number.isInteger(move.to) && move.to >= 0 && move.to < BK_CELL_COUNT ? move.to : -1
      }
      if (move.type === 'wall') {
        if (!Number.isInteger(move.slot) || move.slot < 0 || move.slot >= BK_WALL_SLOT_COUNT) return -1
        return board[move.slot] ? -1 : BK_CELL_COUNT + move.slot
      }
      return -1
    },
    BoardComponent: BlockadeBoard,
    applyMove: ({ board, game, move, symbol }) => {
      const pawns = { X: game.blockadePawnX ?? BK_START_X, O: game.blockadePawnO ?? BK_START_O }
      const wallsRemaining = {
        X: game.blockadeWallsX ?? BK_WALLS_PER_PLAYER,
        O: game.blockadeWallsO ?? BK_WALLS_PER_PLAYER,
      }
      const opp = symbol === 'X' ? 'O' : 'X'

      if (move?.type === 'pawn') {
        const applied = applyPawnMove({ walls: board, pawns, symbol, to: move.to })
        if (!applied) return null
        return {
          updates: { [`blockadePawn${symbol}`]: move.to, currentTurn: opp },
          result: applied.winner ? { winner: applied.winner } : null,
        }
      }
      if (move?.type === 'wall') {
        const applied = applyWallMove({
          walls: board, pawns, wallsRemaining: wallsRemaining[symbol], symbol, slot: move.slot,
        })
        if (!applied) return null
        return {
          updates: {
            board: applied.walls,
            [`blockadeWalls${symbol}`]: wallsRemaining[symbol] - 1,
            currentTurn: opp,
          },
          result: null,
        }
      }
      return null
    },
    boardProps: (game) => ({
      pawns: { X: game.blockadePawnX ?? BK_START_X, O: game.blockadePawnO ?? BK_START_O },
      walls: { X: game.blockadeWallsX ?? BK_WALLS_PER_PLAYER, O: game.blockadeWallsO ?? BK_WALLS_PER_PLAYER },
    }),
  },
```

### `src/lib/games.js` — `FIELD_NULLS` additions

Add inside the `FIELD_NULLS` object (e.g. after `crLastMove: null,`):

```js
  blockadePawnX: null, blockadePawnO: null,
  blockadeWallsX: null, blockadeWallsO: null,
```

### `src/lib/games.js` — `freshGameState()` branch

Add alongside the other per-game branches (e.g. immediately after the `chainreaction` branch):

```js
  if (gameType === 'blockade') {
    return { ...FIELD_NULLS, boxes: null, round: null,
      board: Array(BK_WALL_SLOT_COUNT).fill(''), currentTurn: 'X',
      blockadePawnX: BK_START_X, blockadePawnO: BK_START_O,
      blockadeWallsX: BK_WALLS_PER_PLAYER, blockadeWallsO: BK_WALLS_PER_PLAYER }
  }
```

### `src/components/GameIcons.jsx` — new icon

```jsx
export function BlockadeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* 3x3 grid */}
      <line x1="8" y1="2" x2="8" y2="22" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <line x1="16" y1="2" x2="16" y2="22" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <line x1="2" y1="16" x2="22" y2="16" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      {/* wall segment blocking the path between the two pawns */}
      <rect x="7" y="7" width="10" height="2" fill="currentColor" />
      {/* opponent pawn, top */}
      <circle cx="12" cy="5" r="2.5" fill="currentColor" opacity="0.5" />
      {/* my pawn, bottom */}
      <circle cx="12" cy="19" r="2.5" fill="currentColor" />
    </svg>
  )
}
```

### `src/lib/rules.js` — new entry

Add after the `chainreaction` entry (before `wordduel`):

```js
  blockade: {
    objective: 'Race your pawn to the far edge of the board before your opponent — or wall them off their path.',
    howToPlay: [
      'On your turn, either step your pawn one square (up, down, left, or right) or place one of your 10 walls in a gap between squares.',
      'A wall blocks movement across it for both players — plan your own route as you cut off theirs.',
      'If your pawn and your opponent’s are adjacent, you may jump straight over them; if that jump is blocked, you may hop diagonally around them instead.',
      'A wall can never be placed if it would seal either player’s pawn off from their goal row completely — there must always be a path for both.',
    ],
    win: 'First pawn to reach the far edge wins. X starts at the bottom and aims for the top row; O starts at the top and aims for the bottom row.',
  },
```

### `src/pages/Demo.jsx` — bot demo wiring

Add `BlockadeIcon` to the `import { ... } from '../components/GameIcons'` list, then add a row to
the `DEMOS` array's "vs-AI board games" cluster (e.g. right after the `chainreaction` row):

```js
  { type: 'blockade', short: 'BLOCKADE', Icon: BlockadeIcon, Component: () => <BotBoardDemo type="blockade" /> },
```

No other `Demo.jsx` changes — `BotBoardDemo` is fully generic and drives Blockade the same way it
drives every other registry board game.

### `src/lib/demoBots.js` — bot dispatch

Add the import:

```js
import { computeBotMove as botBlockade } from './blockadeLogic'
```

Add one case to the `pickBotMove` switch:

```js
    case 'blockade':      return botBlockade(game, botSymbol)
```

---

## 7. Unit tests (`src/lib/blockadeLogic.test.js`)

- **Slot indexing helpers**
  - `hSlot`/`vSlot` produce the documented ranges (`h` in `0–63`, `v` in `64–127`); spot-check a
    few `(r,c)` pairs against hand-computed values (mirrors `dotsAndBoxesLogic.test.js`'s
    `hEdgeIndex`/`vEdgeIndex` cases).
  - `decodeSlot` round-trips `hSlot`/`vSlot` for a range of `(r,c)` including the 0 and 7
    boundaries.
  - `cellAt` returns `-1` for every out-of-bounds `(r,c)` and the correct index otherwise;
    `orthogonalNeighbors` returns exactly 2/3/4 neighbors for corner/edge/interior cells.
- **Wall conflict matrix**
  - `wallConflictSlots(h(r,c))` includes `v(r,c)` always; includes `h(r,c-1)`/`h(r,c+1)` only when
    in range (test both a boundary case, `c=0` and `c=7`, and an interior case).
  - Symmetric cases for `vSlot`.
  - `isWallPlacementValid` rejects: out-of-range slot, already-occupied slot, `wallsRemaining <= 0`,
    and each conflict-matrix overlap individually; accepts a clean non-conflicting slot with
    `wallsRemaining > 0`.
- **`isEdgeBlocked`**
  - Unblocked adjacent pair → `false`.
  - Each of the 4 wall placements that can block a given edge (both `v` slots for a horizontal
    pair, both `h` slots for a vertical pair) individually → `true`.
  - Non-adjacent (or diagonal) cell pair → `true` (treated as impassable).
- **Jump + diagonal-jump cases** (`legalPawnMoves`)
  - No opponent nearby → plain orthogonal steps only, walls correctly exclude blocked directions.
  - Opponent directly adjacent, straight jump unblocked and in-bounds → only the far cell is
    legal (not the opponent's own cell, not the diagonals).
  - Opponent adjacent, straight jump blocked by a wall behind them → both diagonals legal (when
    unblocked).
  - Opponent adjacent, straight jump blocked by the board edge (opponent standing on the far row/
    col) → both diagonals legal.
  - Opponent adjacent, straight jump blocked, **one** diagonal additionally blocked by a wall →
    only the other diagonal is legal.
  - Opponent adjacent, straight jump blocked, **both** diagonals blocked by walls → zero legal
    moves in that direction (but other directions unaffected).
- **Seal rejection via BFS**
  - A wall placement that would leave the placer's own path unblocked but seals the
    **opponent's** last route to their goal row → `isWallMoveLegal` returns `false`.
  - Symmetric case: seals the placer's own last route → also `false`.
  - A wall placement that narrows but doesn't fully close a path → `true`.
  - `shortestPathToGoal` returns the correct `distance` on an open board (Manhattan distance to
    the nearest goal-row cell) and correctly increases after a wall forces a detour.
- **Win detection**
  - `applyPawnMove` reports `winner: symbol` exactly when `to`'s row equals that symbol's goal row
    (`0` for X, `8` for O), for cells across the whole goal row, not just the center.
  - `applyPawnMove` reports `winner: null` for any non-goal-row destination.
  - `applyPawnMove` returns `null` (illegal) when `to` isn't in `legalPawnMoves`.
- **`applyMove` full contract** (testing `applyPawnMove`/`applyWallMove` directly)
  - Illegal pawn move (not in `legalPawnMoves`) → `null`.
  - Illegal wall move (occupied/conflict/no-walls-remaining/sealing) → `null`, one case per
    reason.
  - Legal pawn move → return shape is exactly `{ winner: 'X'|'O'|null }`.
  - Legal wall move → return shape is exactly `{ walls: string[128] }`, input array not mutated,
    `walls[slot] === symbol`.
- **Bot sanity** (`computeBotMove`)
  - Run several hundred random-ish mid-game board states (walls scattered, pawns placed) for both
    symbols: assert the returned move is always a member of `legalPawnMoves(...)` (pawn type) or
    passes `isWallMoveLegal(...)` (wall type) — i.e. never illegal.
  - Construct a board where the bot's pawn is one legal step away from its goal row → bot returns
    that winning pawn move (not a wall move), even when it still has walls remaining.
  - Bot with `0` walls remaining never returns a `wall` move.

---

## 8. Manual verification script

Two-player flows need a **second browser identity** — same-browser tabs share `playerId`
(`localStorage`), so open the second seat in a private/incognito window (or a second browser
profile). A genuine third **spectator** identity likewise needs its own private window/profile
(a same-browser third tab would just reclaim an already-claimed seat, not spectate).

1. **Create & join.** Browser A: Home → Blockade → create room (becomes X). Browser B
   (incognito): open the invite link → joins as O. Confirm both pawns render at the documented
   start cells (X bottom-center, O top-center) and `MOVE` mode is selected by default.
2. **Basic pawn moves.** X steps forward (toward row 0) a few times; confirm the move highlight
   only shows on X's turn in Browser A, turn flips to O in both browsers immediately after each
   move, and O's legal-destination highlight appears in Browser B on its turn.
3. **Wall placement + two-tap confirm.** On O's turn, switch to `WALL` mode, tap an empty groove
   (expect `cta` glow if legal), tap it again to confirm; verify the wall renders solid
   (`O`-colored) in **both** browsers, O's wall-chip count drops from 10 to 9, and it's X's turn
   again. Tap a different groove first (confirms the preview *moves*, doesn't place two walls).
4. **Jump + diagonal jump.** Maneuver the two pawns into orthogonal adjacency (walk one toward the
   other over several turns). Confirm: (a) with a clear lane behind the opponent, the only
   available "forward" destination is the straight-jump cell, not the opponent's own cell; (b)
   place a wall directly behind the opponent (or maneuver adjacency against the board edge) and
   confirm the straight jump disappears and both diagonal cells light up instead (fewer if a
   diagonal is itself walled).
5. **Seal rejection.** Attempt to complete a wall "cage" that would fully block the opponent's (or
   your own) path to their goal row. Confirm the second confirming tap does nothing — no wall
   appears, no crash, no error toast (matches the platform's honest-client convention: illegal
   moves silently no-op, same as every other board game).
6. **Win.** Walk a pawn onto any cell of its goal row. Confirm immediate round end,
   `scores/{winner}` increments, `GameStatus`'s win banner appears in both browsers, no
   `winningLine`-related console errors.
7. **Play Again vs. New Match.** Use `onPlayAgain` (NEXT ROUND) — confirm pawns/walls/board reset
   to start state but `scores` is preserved; then `onNewMatch` — confirm `scores` also resets.
8. **Switch game.** From the end-of-round screen, switch to a different registry game and back to
   Blockade; confirm (optionally via the Firebase console) that `blockadePawnX/O` and
   `blockadeWallsX/O` are absent while the other game is active, and a fresh Blockade start state
   reappears on switching back.
9. **Spectator.** From a third private window (distinct uid), open the room after both seats are
   claimed; confirm read-only rendering (no mode toggle interactivity / moves are rejected) and
   live updates as X/O play.
10. **Mobile.** Using a real phone or responsive dev tools with touch emulation: confirm the
    two-tap wall flow works with touch taps (no drag gestures needed), grooves are comfortably
    tappable despite their thin visual footprint, and the mode toggle/cells are large enough to
    hit reliably at `max-w-md` width.
11. **`/demo` bot.** Visit `/demo`, select Blockade, play a full round against the bot as X.
    Confirm the bot (O) always makes a legal move, occasionally places walls when behind, and
    correctly takes a winning step instead of a wall move when one is available.

---

## 9. Risks and mitigations

- **Jump/diagonal-jump logic is the trickiest part of Quoridor to get right.** Mitigated by the
  exhaustive case list in §7 (every combination of straight-jump-open / blocked-by-wall /
  blocked-by-edge / diagonal-partially-blocked) and by centralizing all of it in one
  `legalPawnMoves` function reused by both the registry `applyMove` and the board's UI hints — no
  parallel/divergent implementation anywhere.
- **Sealing check must never be skippable.** Mitigated by funneling both the authoritative
  `applyWallMove` path and the board's client-side *preview* through the exact same
  `isWallMoveLegal` predicate — there is no second, looser check anywhere that could drift out of
  sync and let a sealing wall slip through client-side while looking legal in the preview.
- **Honest-client trust only.** `applyMove` runs locally on the mover's own client before writing
  to Firebase — a modified client could bypass it and write an illegal pawn/wall state directly.
  This is the same accepted **honest-client** trust tier as every other board game on the platform
  (README's Trust Models §1) — not a Blockade-specific gap.
- **No literal "red" token for the illegal wall-preview cue.** Resolved (§5) by using a dim/opacity
  treatment plus the existing `cursor-not-allowed` → pixel-art "no" cursor, rather than
  hardcoding a new color — stays within the "no hardcoded hex" rule without inventing a new
  semantic token for a single use.
- **Bot heuristic is greedy, single-wall-lookahead only** (no multi-wall combos, no minimax/deeper
  search). Acceptable for a casual `/demo` opponent — consistent with the platform's other bots
  (Reversi/Gomoku/Chain Reaction are all greedy heuristics, not full search), and `computeBotMove`
  is provably never illegal regardless of how weak its strategy is.
- **128-length wall array plus 4 extra top-level ints** is a slightly larger per-move payload than
  the simplest registry games, but is in the same size class as Dots & Boxes's 40-length edge
  array and well within normal RTDB write limits — not a real risk.

---

## Open questions

None — every design decision needed to implement this (indexing scheme, jump/diagonal rules, wall
conflict matrix, sealing check, bot heuristic, UI interaction model, color treatment for the
"illegal" preview) is resolved above.
