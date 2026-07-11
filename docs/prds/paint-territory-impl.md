# Implementation spec — Paint Turf (`gameType: 'paint'`)

Code-audited delta-spec for `docs/prds/paint-territory.md` ("Paint Territory"). The PRD is the
design intent; this document is the **implementation contract** — where the PRD's pseudo-code
doesn't match the platform's actual realtime stack (or leaves a gameplay-breaking ambiguity
unresolved), this spec wins and the deviation is called out explicitly with a rationale.

Display label is shortened to **PAINT TURF** (13-char cap; "PAINT TERRITORY" is 15 chars). The
internal `gameType` slug stays `paint`, matching the PRD's Firebase key names (`paintScoreX/O`).

Audited against (read end-to-end): `docs/prds/paint-territory.md`; `src/lib/pongLogic.js` +
`.test.js`; `src/lib/realtime/rtc.js`, `useRealtimePeer.js`, `useRealtimeHost.js`,
`useRealtimeGuest.js`, `realtimeStatus.jsx`; `src/pages/SnakeGame.jsx`, `TronGame.jsx`,
`PongGame.jsx`, `SumoGame.jsx` + `SumoDemo.jsx`, `SpaceduelGame.jsx`; `src/hooks/useTronControls.js`,
`useSnakeControls.js`; `src/components/TronArena.jsx`, `SnakeArena.jsx`; `src/lib/tronLogic.js`,
`snakeLogic.js`, `sumoLogic.js`, `spaceduelLogic.js` (computeAI signatures); `src/lib/games.js`,
`src/lib/rules.js`, `src/components/GameIcons.jsx`, `src/pages/Game.jsx`, `src/pages/Demo.jsx`,
`src/lib/sounds.js`, `tailwind.config.js`.

**Key finding that changes the PRD's transport plan:** `rtc.js`'s `send()` always does
`channel.send(JSON.stringify(obj))` and `onmessage` always does `JSON.parse(e.data)` — despite
`channel.binaryType = 'arraybuffer'` being set, there is **no raw-binary send path**; every frame
is a JSON string. The PRD's "100 bytes at 2 bits/cell" plan is therefore correct for the *codec*
but the wire payload must be **base64 text**, not raw bytes — this spec's bandwidth estimate
(~230 B/snapshot, ~7 KB/s) is higher than the PRD's rough "~130 B/snapshot, ~4 KB/s" for exactly
this reason (see Risks §9).

---

## 1. Overview and rules

60-second real-time 1v1. Arena is a 20×20 grid (400 cells, each `neutral(0)` / `X(1)` / `O(2)`).
Players move continuously (not tile-locked) at a base speed of 7 cells/sec, steering in 4
cardinal directions with instant turns (no acceleration/deceleration, no diagonal movement).
Standing on the opponent's paint slows you to 70% speed. When the 60s clock hits zero, whichever
side painted more cells wins the round; equal counts draw. **First to 3 round wins takes the
match** (see rationale below) — the standard `onPlayAgain` (round continue) / `onNewMatch` (reset)
buttons drive this exactly like every other custom game.

### Resolved edge cases (every one the PRD leaves implicit)

1. **Spawn:** X spawns at the corner cell `(0,0)`, center position `(0.5, 0.5)`, initial
   direction `'right'`. O spawns at the opposite corner `(19,19)`, center position
   `(19.5, 19.5)`, initial direction `'left'`. Both spawn cells are **pre-painted** in
   `createState()` (grid[X-spawn]=1, grid[O-spawn]=2) so territory is claimed from frame one,
   satisfying "painting from frame one" without any special-cased first-frame logic in `step()`.

2. **When exactly does a cell convert color? (the load-bearing resolution)** The PRD says "the
   cell under a player becomes their color every time they enter it," which read literally
   (paint-on-entry) **breaks rule 3 entirely**: if entering a cell instantly repaints it to the
   mover's color, the mover only occupies "enemy-colored ground" for a single physics sub-step
   before it flips to their own color — the promised sustained 70%-speed slow zone would be
   imperceptible (a 1-frame stutter, not a felt slowdown). **This spec paints a cell when the
   mover *leaves* it, not when they arrive** — i.e., `step()` detects a cell-index transition and
   repaints the cell just **vacated** (regardless of which neighbor the mover exits toward, so a
   180° reversal out of a cell still paints it). The speed multiplier for the *current* step is
   read from the cell the mover is presently standing in (not yet vacated, so still showing its
   pre-existing owner) — this sustains the 70% slow for the **entire time** the mover's position
   lies inside an unconverted enemy cell, which is the gameplay rule 3 actually promises.
   Visually this is indistinguishable from "paints on entry": the mover's own glowing square is
   always positioned *inside* the cell being crossed, so "my trail catches up behind me" reads
   identically to "the ground changes color as I step on it." The only observable difference is
   the player's **own currently-occupied** cell at any instant may still show the *old* owner
   until they step off it — closed by the force-paint rule in point 3.
3. **Final-cell fairness at time-up:** because painting happens on exit, whichever cell each
   player is standing in **at the exact instant the timer hits 0** was never "left" and would
   never convert. On the step where `timeLeft` reaches 0, `step()` force-paints each player's
   current (un-vacated) cell to their color before computing the final `counts()` — so occupying
   a cell for even an instant at the buzzer still counts it, matching "wherever you are when time
   runs out is yours."
4. **Speed check uses the pre-departure cell, not the destination.** Concretely: at the start of
   a step, read `grid[currentCellIndex]` (before any mutation this step) to pick this step's
   speed multiplier, move, then only *after* moving check whether the cell index changed — if so,
   paint the cell just vacated. This means a step that is about to cross **into** a fresh enemy
   cell still moves at full speed for that step (the slow starts being felt the *following* step,
   once the mover is actually standing inside the enemy cell) — one step (≤1/60s) of anticipatory
   lead-in is imperceptible and avoids any lookahead complexity.
5. **No wraparound.** Unlike Tron/Snake's toroidal arenas, Paint's 20×20 grid has **hard walls**:
   position is clamped to `[0, GRID_W)` / `[0, GRID_H)` each step (a player pressed into a wall
   just stops advancing on that axis; no bounce, no wrap). The PRD doesn't specify this — bounded
   arenas fit "territory" framing better than wraparound, and Snake/Tron already own the
   wraparound niche.
6. **180° reversals are allowed**, unlike Tron/Snake. There is no trail-collision risk in Paint
   (no body, no death-on-crash), so `usePaintControls` does **not** carry the
   OPPOSITE-direction guard those two hooks have — reversing instantly (dart in, dart back out)
   is a legitimate tactic. `step()` itself never validates direction transitions either way; it
   simply adopts whatever direction is provided as input.
7. **Same-frame contested cells:** each step processes **X's move first, then O's**, both
   mutating the same working `grid` copy in sequence. If both players' moves interact with the
   same cell in the same step, X's effect lands first, O's second (deterministic, not a race) —
   this is the "host order" the PRD's "contested same-frame cells resolve to host order" edge
   case refers to; it's fully specified here rather than left to implementation whim.
8. **Passing through each other:** no collision code exists between `players.X` and `players.O`
   at all — position updates for each side are independent (matches PRD rule 4 exactly, "no
   collision in v1").
9. **Match length — resolved, not left as the PRD's open question.** The PRD lists "60s vs 90s
   match length" as unresolved and doesn't specify round-vs-match structure at all. This spec
   adopts **Snake's precedent** (first to 3 round wins takes the match, `game.scores.X/O`) rather
   than Tron/Sumo/SpaceDuel's single-round-decides-the-match pattern, because Paint's round is a
   deliberate, substantial 60s burst (not an instant-death round) — repeating it 2–3 times for a
   real match has the "one more game" energy the PRD is chasing, exactly like Snake's model.
   Concretely: **`paint` is *not* added to `Game.jsx`'s `SINGLE_ROUND_GAMES` Set**, so its default
   `matchTarget = 3` already applies with zero changes to that file beyond the dispatch branch.
10. **AI event stream is `cellPainted` / `cellStolen` / `warning10s` / `timeUp`** (per this
    audit brief) — the PRD's mention of a generic `'tick'` event is dropped; nothing consumes it
    and the brief's four-event list is authoritative.

---

## 2. Data model

All new state lives in the pure sim (never touches Firebase during play) plus two lightweight
score mirrors, exactly like Snake/Tron/Sumo/SpaceDuel:

| Firebase key | Type | Lifecycle | Writer |
|---|---|---|---|
| `paintScoreX` | number | Reset to `0` by `freshGameState('paint')`. Updated ~every 2s during play (throttled inside the host's `onEvent`) and authoritatively on round end (inside `finishRound`'s `runTransaction`). Read-only for spectators/finished screen. | Host (X) only |
| `paintScoreO` | number | Same as above, O's count. | Host (X) only |
| `signaling` | object | Transient WebRTC offer/answer/ICE exchange. Already a shared key nulled once in `FIELD_NULLS` (no new entry needed). | Both peers, via `rtc.js` |
| `currentTurn` | — | **Omitted (`null`)** — Paint has no turns; `Game.jsx`'s turn-flip move-sound detection stays silent (page drives its own audio, same convention as Pong/Snake/Tron/Sumo/SpaceDuel). | n/a |
| `board`, `boxes`, `round` | — | All `null` — Paint uses none of these. | n/a |
| `scores.X` / `scores.O` | number | Standard match-tally, incremented by the shared `runTransaction` in `finishRound` on every round decision. First to reach `MATCH_TARGET` (3) ends the match. | Standard machinery (unchanged) |

**New top-level keys to add to `FIELD_NULLS`:** `paintScoreX: null, paintScoreO: null,` (that's
the only addition — `signaling` is already shared).

The live grid, player positions/directions, and the 60s countdown **never touch Firebase** —
they exist only in the host's in-memory sim and travel to the guest over the WebRTC data channel,
exactly like Pong's ball/paddles or Snake's snake bodies.

---

## 3. New files

```
src/lib/paintLogic.js
src/lib/paintLogic.test.js
src/hooks/usePaintControls.js
src/components/PaintArena.jsx
src/pages/PaintGame.jsx
src/pages/PaintDemo.jsx
```

### `src/lib/paintLogic.js` — pure sim, no DOM, no network

Constants:

```js
export const GRID_W = 20
export const GRID_H = 20
export const CELL_COUNT = GRID_W * GRID_H          // 400
export const BASE_SPEED = 7                         // cells/sec
export const ENEMY_SLOW_MULT = 0.7                  // speed multiplier while standing on
                                                     // enemy-owned (unvacated) paint
export const MATCH_SECONDS = 60                     // round timer
export const WARNING_AT = 10                        // seconds remaining that fire 'warning10s'
export const MATCH_TARGET = 3                       // round wins needed to take the match
export const AI_DIFFICULTIES = {
  easy:   { replanMs: 800, speedCap: 0.80 },
  normal: { replanMs: 500, speedCap: 0.92 },
  hard:   { replanMs: 350, speedCap: 1.00 },
}
```

Exports (signature — one-line behavior):

- **`createState(opts = {})`** → sim state. `opts.speedCaps?: { X?: number, O?: number }`
  (default `1` each) bakes a permanent per-side speed multiplier into `players[side].speedCap`,
  used **only** by the demo bot to make itself beatable (see §4) — multiplayer never sets this,
  so it's a no-op there. Seeds `grid` with both spawn cells pre-painted (see §1.1). Returns:
  ```js
  {
    grid: Uint8Array(CELL_COUNT),                  // 0 neutral / 1 X / 2 O
    players: {
      X: { x: 0.5, y: 0.5, dir: 'right', speedCap: 1 },
      O: { x: GRID_W - 0.5, y: GRID_H - 0.5, dir: 'left', speedCap: 1 },
    },
    timeLeft: MATCH_SECONDS,
    warned: false,                                  // internal: 'warning10s' fired once
    ended: false,                                   // internal: 'timeUp' fired once
  }
  ```
- **`step(state, inputs, dt)`** → `{ state, events }`. Pure — never mutates `state`. `inputs` is
  `{ X?: 'up'|'down'|'left'|'right', O?: same }`, matching Tron/Snake's convention exactly
  (direction *changes* only; omit/`null` means "keep going the same way"). See §4 for the full
  algorithm. `events` is an array of `{ type, ... }` objects — `type` is one of
  `'cellPainted' | 'cellStolen' | 'warning10s' | 'timeUp'`.
- **`counts(stateOrGrid)`** → `{ X: number, O: number, neutral: number }`. Accepts either a full
  sim state (`{ grid, ... }`) or a raw grid array directly (`grid.grid ?? grid` internally) so UI
  code can call `counts(gridProp)` without constructing a fake state wrapper. `X + O + neutral`
  always equals `CELL_COUNT`.
- **`getWinner(state)`** → `'X' | 'O' | 'draw' | null`. Returns `null` while `state.ended` is
  `false` (round still running); once `ended`, compares `counts(state)`.
- **`cellIndex(x, y)`** → integer cell index, defensively clamped so out-of-range/NaN-adjacent
  floats never produce a negative or overflowing index: `clamp(floor(x), 0, GRID_W-1) +
  clamp(floor(y), 0, GRID_H-1) * GRID_W`.
- **`packGrid(grid)`** → `Uint8Array(CELL_COUNT / 4)` (100 bytes). 2-bit codec, 4 cells/byte:
  `byte = cell0 | (cell1<<2) | (cell2<<4) | (cell3<<6)`. `CELL_COUNT` (400) is exactly divisible
  by 4 — no padding cells.
- **`unpackGrid(packed)`** → `Uint8Array(CELL_COUNT)`. Inverse of `packGrid`.
- **`bytesToBase64(bytes)`** / **`base64ToBytes(str)`** → wire-encoding helpers built on the
  browser/Node-global `btoa`/`atob` (both are plain JS globals, not DOM APIs — available in every
  browser and in Node ≥16, so they work unmodified inside Vitest). `bytesToBase64` converts the
  `Uint8Array` to a binary string via `String.fromCharCode(...bytes)` then `btoa()`; the reverse
  does `atob()` then walks `charCodeAt`. **100 packed bytes → 136 base64 characters** (standard
  padded encoding: `4 * ceil(100/3)`).
- **`computeAI(state, side, difficulty = 'normal')`** → `'up'|'down'|'left'|'right'`. Pure,
  stateless per call (matches Pong/Tron/Snake/Sumo/SpaceDuel precedent — none of those bots carry
  memory between calls either; the *caller* throttles how often it re-invokes the function and
  reuses the last returned direction in between, exactly like `SumoDemo.jsx`'s `aiAt`/`aiInput`
  pattern). Unrecognized `difficulty` falls back to `'normal'`. See §4 for the algorithm.

### `src/hooks/usePaintControls.js`

```js
export function usePaintControls(arenaRef, enabled = true)
```
→ `{ getDir }`, identical in shape and edge-triggered behavior to `useTronControls.js`/
`useSnakeControls.js` (arrow keys + WASD, `e.preventDefault()` on keydown; pointer-down/up swipe
with a 16px threshold on the arena element) **except it deliberately does not carry the
OPPOSITE-direction guard** (no `OPPOSITE[currentDir] === pending` rejection) — see §1.6. Same
edge-triggered "read-and-clear pending direction" contract: `getDir(currentDir)` returns the
newly pressed direction once, then `null` until the next press/swipe.

### `src/components/PaintArena.jsx`

```jsx
const PaintArena = forwardRef(function PaintArena(
  { grid, players, timeLeft, mySide, namesX = 'X', namesO = 'O', overlay, dim = false },
  ref,
) { ... })
export default PaintArena
```
Props:
- `grid: Uint8Array(400) | number[]` — current grid to render (0/1/2 per cell).
- `players: { X: {x,y,dir}, O: {x,y,dir} }` — continuous positions in cell units `[0, GRID_W)` /
  `[0, GRID_H)`.
- `timeLeft: number` — seconds remaining (drives the countdown text + 10s flash).
- `mySide: 'X'|'O'|null`, `namesX`, `namesO`, `overlay`, `dim` — same meaning as every other
  Arena component in the codebase.
- `ref` — forwarded to the arena container div (consumed by `usePaintControls` for swipe
  detection, matching Tron/Snake/Sumo's `arenaRef` pattern).

See §5 for the render/diff algorithm.

### `src/pages/PaintGame.jsx`

```jsx
export default function PaintGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) { ... }
```
Same prop contract as `SumoGame.jsx`/`SpaceduelGame.jsx`/`TronGame.jsx` byte-for-byte (this is
the exact set `Game.jsx`'s custom ladder passes to every custom realtime page). See §5/§6 for the
full wiring.

### `src/pages/PaintDemo.jsx`

```jsx
export default function PaintDemo() { ... }
```
No props (mounted by `Demo.jsx`'s `<active.Component />`), matching `TronDemo.jsx`/
`SumoDemo.jsx` exactly.

---

## 4. Logic details

### `step(state, inputs, dt)` — full algorithm

```
function step(state, inputs, dt):
  grid = state.grid.slice()                 # Uint8Array copy — cheap (400 bytes)
  events = []
  players = {}

  for side in ['X', 'O']:                   # X THEN O, always — deterministic same-frame order
    p = { ...state.players[side] }
    ownerCode = side == 'X' ? 1 : 2
    if inputs[side] is a valid direction string:   # defensive: ignore junk from an honest-but-
      p.dir = inputs[side]                          # buggy peer, same trust tier as every board game

    oldIdx = cellIndex(p.x, p.y)             # cell the mover is CURRENTLY standing in
    curOwner = grid[oldIdx]
    speedMult = (curOwner != 0 and curOwner != ownerCode) ? ENEMY_SLOW_MULT : 1
    speed = BASE_SPEED * speedMult * (p.speedCap ?? 1)

    vec = DIR_VEC[p.dir]                     # up:(0,-1) down:(0,1) left:(-1,0) right:(1,0)
    nx = clamp(p.x + vec.x * speed * dt, 0, GRID_W - EPS)
    ny = clamp(p.y + vec.y * speed * dt, 0, GRID_H - EPS)
    newIdx = cellIndex(nx, ny)

    if newIdx != oldIdx:                     # the mover VACATED oldIdx this step — paint it
      prevOwner = grid[oldIdx]
      if prevOwner != ownerCode:
        grid[oldIdx] = ownerCode
        events.push({ type: 'cellPainted', by: side, index: oldIdx })
        if prevOwner != 0:
          events.push({ type: 'cellStolen', by: side, index: oldIdx,
                        from: prevOwner == 1 ? 'X' : 'O' })

    p.x = nx; p.y = ny
    players[side] = p

  timeLeft = state.timeLeft
  warned = state.warned
  ended = state.ended
  if not ended:
    timeLeft = max(0, timeLeft - dt)
    if not warned and timeLeft <= WARNING_AT:
      warned = true
      events.push({ type: 'warning10s' })
    if timeLeft <= 0:
      ended = true
      for side in ['X', 'O']:                # force-paint each player's un-vacated final cell
        ownerCode = side == 'X' ? 1 : 2
        idx = cellIndex(players[side].x, players[side].y)
        if grid[idx] != ownerCode:
          prevOwner = grid[idx]
          grid[idx] = ownerCode
          events.push({ type: 'cellPainted', by: side, index: idx })
          if prevOwner != 0:
            events.push({ type: 'cellStolen', by: side, index: idx,
                          from: prevOwner == 1 ? 'X' : 'O' })
      events.push({ type: 'timeUp' })

  return { state: { grid, players, timeLeft, warned, ended }, events }
```

`EPS = 1e-6` (keeps `floor(x)` inside `[0, GRID_W)` at the exact wall).

### `computeAI(state, side, difficulty)` — greedy region routing

```
function computeAI(state, side, difficulty = 'normal'):
  cfg = AI_DIFFICULTIES[difficulty] ?? AI_DIFFICULTIES.normal
  me = state.players[side]
  ownerCode = side == 'X' ? 1 : 2
  enemyCode = side == 'X' ? 2 : 1

  if state.timeLeft <= 10:
    target = largestEnemyRegionCentroidCell(state.grid, enemyCode)   # steal mode
    if target == null: target = bestGreedyCell(state.grid, me, ownerCode, enemyCode)
  else:
    target = bestGreedyCell(state.grid, me, ownerCode, enemyCode)

  if target == null: return me.dir             # nothing better — keep current heading

  tx = (target % GRID_W) + 0.5
  ty = floor(target / GRID_W) + 0.5
  dx = tx - me.x; dy = ty - me.y
  return abs(dx) >= abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
```

`bestGreedyCell(grid, me, ownerCode, enemyCode)` — full 400-cell scan (cheap; only called every
`replanMs`, never per-substep):
```
best = null; bestScore = -Infinity
for i in 0..CELL_COUNT-1:
  v = grid[i]
  value = v == ownerCode ? 0 : v == 0 ? 1 : 1.4     # enemy cells score higher (steal value)
  if value == 0: continue
  cx = i % GRID_W + 0.5; cy = floor(i/GRID_W) + 0.5
  dist = abs(cx - me.x) + abs(cy - me.y)             # manhattan
  cost = v == enemyCode ? dist / ENEMY_SLOW_MULT : dist   # crossing enemy paint costs more transit time
  score = value / (cost + 1)
  if score > bestScore: bestScore = score; best = i
return best
```

`largestEnemyRegionCentroidCell(grid, enemyCode)` — 4-connected flood fill (BFS) over all
`enemyCode` cells, tracks the largest component, returns the grid index nearest that component's
centroid (average x/y, rounded, converted back to a cell index via `cellIndex`); returns `null`
if no enemy cells exist (round just started).

**Difficulty knobs** (both applied by the *caller*, not inside `computeAI` — matching the
established Pong/Tron/Snake/Sumo convention where the demo page owns replan-throttling, not the
logic module):
- `replanMs` — how often the caller re-invokes `computeAI` and adopts its new direction (720ms on
  easy down to 350ms on hard acts as the "reaction handicap" — a slower AI literally reacts to a
  changing board slower, no separate handicap constant needed).
- `speedCap` — baked into the bot's own `players.O.speedCap` via
  `createState({ speedCaps: { O: AI_DIFFICULTIES[difficulty].speedCap } })` at demo setup. This is
  the one place `paintLogic.step()`'s otherwise-unused `speedCap` field earns its keep; multiplayer
  never sets it (defaults to `1`, zero behavior change).

### `packGrid` / `unpackGrid` bit layout

```
packGrid(grid):
  packed = Uint8Array(CELL_COUNT / 4)          # 100
  for i in 0, 4, 8, ... CELL_COUNT-4:
    packed[i/4] = (grid[i] & 3) | ((grid[i+1] & 3) << 2)
                | ((grid[i+2] & 3) << 4) | ((grid[i+3] & 3) << 6)
  return packed

unpackGrid(packed):
  grid = Uint8Array(CELL_COUNT)
  for i in 0, 4, 8, ... CELL_COUNT-4:
    b = packed[i/4]
    grid[i]   = b & 3
    grid[i+1] = (b >> 2) & 3
    grid[i+2] = (b >> 4) & 3
    grid[i+3] = (b >> 6) & 3
  return grid
```

---

## 5. UI/UX

### PaintArena rendering strategy — per-frame diff, not full React re-render

Unlike Tron/Snake (which fully re-render all 400 `<div>`s from a `useMemo`-built cell map every
render — fine at their ~8–10 Hz tick rate), Paint's grid changes are pushed at up to ~60 Hz
(host's own render) or ~60 Hz guest rAF, so `PaintArena` renders the 400 cells **once** on mount
(all `bg-retro-surface`) and thereafter mutates only the DOM nodes whose backing cell value
actually changed, via refs — bypassing React's diffing for the grid entirely:

```
cellRefs = useRef(Array(CELL_COUNT).fill(null))     // populated via callback ref per cell div
prevGridRef = useRef(null)                          // last-diffed grid (Uint8Array | null)
freshRef = useRef({ X: [], O: [] })                 // per-owner recency ring buffers, cap 10

useEffect(() => {
  prev = prevGridRef.current
  for i in 0..CELL_COUNT-1:
    if (!prev || prev[i] != grid[i]):
      applyCellClass(i, grid[i], /* fresh */ true)
      if grid[i] != 0:
        owner = grid[i] == 1 ? 'X' : 'O'
        arr = freshRef.current[owner]
        remove i from arr if present; unshift i
        if arr.length > TRAIL_LEN (10):
          dropped = arr.pop()
          if grid[dropped] == (owner=='X'?1:2):      // still owned by this player (not repainted since)
            applyCellClass(dropped, grid[dropped], /* fresh */ false)
  prevGridRef.current = grid.slice()
}, [grid])

applyCellClass(i, value, fresh):
  el = cellRefs.current[i]; if (!el) return
  el.className =
    value == 0 ? 'w-full h-full bg-retro-surface' :
    value == 1 ? (fresh ? 'w-full h-full bg-retro-p1 shadow-neon-p1' : 'w-full h-full bg-retro-tint-p1') :
                 (fresh ? 'w-full h-full bg-retro-p2 shadow-neon-p2' : 'w-full h-full bg-retro-tint-p2')
```

This delivers "neutral `bg-retro-surface`, painted `tint-p1/p2` with a bright fresh-trail
(~last 10 cells/player) via `bg-retro-p1/p2` + `shadow-neon-p1/p2`" using only existing tokens —
the freshness/"wet paint" concept is **entirely a client-side rendering concern** computed from
consecutive grid diffs; it is *not* part of the sim state or wire protocol (cheaper wire payload,
and both host and guest derive an identical trail from the identical grid stream they each see).

### Player squares

Rendered as two absolutely-positioned `<div>`s **outside** the 400-cell grid (so per-frame
position updates never touch grid DOM nodes):
```
style={{
  width: `${100/GRID_W}%`, height: `${100/GRID_H}%`,
  left: `${(x/GRID_W)*100}%`, top: `${(y/GRID_H)*100}%`,
  transform: (dir=='left'||dir=='right') ? 'scaleX(1.15)' : 'scaleY(1.15)',
}}
className={cn(
  'absolute rounded-sm',
  side=='X' ? 'bg-retro-p1 shadow-neon-p1' : 'bg-retro-p2 shadow-neon-p2',
  slowed && 'opacity-60 animate-pulse',
)}
```
`slowed` (per side) is computed fresh each render, client-side only: `grid[cellIndex(x,y)] != 0 &&
grid[cellIndex(x,y)] != ownerCode` — "chunky glowing player squares that stretch slightly along
their movement axis" + "slowdown state: player blinks dim."

### Top bar

- Split score bar: two flex segments, widths `${(counts.X/CELL_COUNT)*100}%` /
  `${(counts.O/CELL_COUNT)*100}%` (`bg-retro-p1` / `bg-retro-p2`), neutral gap between them
  (`bg-retro-structure`); when `abs(counts.X - counts.O) < 20`, add a `shadow-glow-dot` marker at
  the midpoint (the "contested midpoint glows" cue from the PRD).
- Countdown: `font-pixel` seconds remaining (`Math.ceil(timeLeft)`), styled
  `text-retro-p2 animate-pulse` once `timeLeft <= 10` (and `> 0`). **Correction to the PRD:** it
  names an `animate-blink` utility that does not exist in `tailwind.config.js` (no keyframes/
  animation section is defined there at all, and this spec must not edit that file) — use the
  Tailwind-builtin `animate-pulse` instead, already used elsewhere in this codebase (e.g. the
  "OPPONENT IS OFFLINE" banner on every realtime page) for exactly this "flashing" effect.

### Controls / touch

`usePaintControls(arenaRef, enabled)` — arrows/WASD + swipe (16px threshold), no 180°-reversal
guard (§1.6). Arena container: `touch-none` class + `cursor: 'none'` inline style, matching
Tron/Snake/Sumo's arena styling exactly (hides the system cursor/prevents scroll-hijack during
play).

### Sounds (via `src/lib/sounds.js` only)

- `sounds.move(event.by)` every 20th cumulative `cellPainted` event (counted by both host and
  guest independently from the identical broadcast `{t:'e', k:'cellPainted'}` stream — see §6).
  `sounds.move(sym)` already takes a symbol for pitch variance (`'X'` vs `'O'`), a perfect fit.
- `sounds.bell()` once, on `warning10s`.
- `sounds.wall()`, `sounds.hit()`, `sounds.win()/lose()/draw()/matchWin()` — **not used directly
  by the page**; the standard win/lose/draw/matchWin sounds fire from `Game.jsx`'s existing
  central win-effect logic once `status: 'finished'` + `winner` land (same as every other custom
  game — no page-level code needed for those).
- `cellStolen` is **silent** by design (data/event signal only, no distinct sound) — the PRD
  explicitly asks to "keep paint audio sparse."

---

## 6. Integration touchpoints

### `src/lib/games.js`

Add `PaintIcon` to the icon import block (alongside `SpaceDuelIcon`):
```js
import {
  TicTacToeIcon, ConnectFourIcon, HangwomanIcon, DotsAndBoxesIcon, SosIcon,
  SimonIcon, ChimpIcon, NumberMemoryIcon, VisualMemoryIcon, ReactionIcon, AimIcon,
  TypingIcon, MathIcon,
  GomokuIcon, ReversiIcon, OrderChaosIcon, DiceIcon, TwoTruthsIcon, BluffIcon,
  WavelengthIcon, FibbageIcon, SpyfairIcon, PongIcon, SnakeIcon,
  TronIcon, SumoIcon, SpaceDuelIcon, PaintIcon, ChainReactionIcon,
  WordDuelIcon,
} from '../components/GameIcons'
```
Also `import { GRID_W, GRID_H } from './paintLogic'` is **not needed** — `freshGameState` doesn't
touch the grid at all (the sim is entirely in-memory, never written to Firebase).

New `GAME_TYPES` entry (insert immediately after the `spaceduel` entry, before `visualmemory`):
```js
{
  type: 'paint', label: 'PAINT TURF',
  desc: 'claim more turf than they do', Icon: PaintIcon,
  badge: 'PT', maxWidth: 'max-w-md',
  category: 'reflex',
  addedAt: '2026-07-11',
  durationMin: 3, tags: ['quick', 'frantic', 'skill'], solo: true,
  custom: true, realtime: true,
},
```
(`badge: 'PT'` checked against every existing badge in the registry — unique. `label` is 10
characters, well under the 13-char cap.)

`FIELD_NULLS` addition (insert alongside the other realtime score keys, after
`spaceduelHitsX/O`):
```js
paintScoreX: null, paintScoreO: null,
```

`freshGameState()` branch (insert after the `spaceduel` branch, before `aim`):
```js
if (gameType === 'paint') {
  // currentTurn omitted (null) — Paint is real-time with no turns.
  return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
    paintScoreX: 0, paintScoreO: 0 }
}
```

### `src/components/GameIcons.jsx`

Add (insert after `SpaceDuelIcon`, same 24×24 pixel-art style, `currentColor` + opacity steps —
mirrors the existing icons' convention of NOT using `retro-p1`/`retro-p2` directly):
```jsx
export function PaintIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* territory grid — mixed filled/empty cells suggesting a paint battle */}
      <rect x="2"  y="2"  width="5" height="5" fill="currentColor" />
      <rect x="8"  y="2"  width="5" height="5" fill="currentColor" opacity="0.35" />
      <rect x="14" y="2"  width="4" height="5" fill="currentColor" opacity="0.7" />
      <rect x="2"  y="8"  width="5" height="5" fill="currentColor" opacity="0.7" />
      <rect x="8"  y="8"  width="5" height="5" fill="currentColor" opacity="0.5" />
      <rect x="14" y="8"  width="4" height="5" fill="currentColor" opacity="0.35" />
      <rect x="2"  y="14" width="5" height="4" fill="currentColor" opacity="0.35" />
      <rect x="8"  y="14" width="5" height="4" fill="currentColor" opacity="0.7" />
      <rect x="14" y="14" width="4" height="4" fill="currentColor" />
      {/* paint splat drop */}
      <circle cx="19" cy="19" r="2.4" fill="currentColor" />
    </svg>
  )
}
```

### `src/pages/Game.jsx`

Import (alongside the other realtime pages):
```js
import PaintGame from './PaintGame'
```
Dispatch branch — insert right after the `spaceduel` branch, before `wordduel` (identical prop
set to every other realtime custom page):
```jsx
) : game.gameType === 'spaceduel' ? (
  <SpaceduelGame
    gameId={gameId}
    game={game}
    mySymbol={mySeat}
    opponentOnline={opponentOnline}
    onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
    onPlayAgain={activeProposal ? null : () => propose('playAgain')}
    onNewMatch={activeProposal ? null : () => propose('newMatch')}
    proposal={activeProposal}
  />
) : game.gameType === 'paint' ? (
  <PaintGame
    gameId={gameId}
    game={game}
    mySymbol={mySeat}
    opponentOnline={opponentOnline}
    onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
    onPlayAgain={activeProposal ? null : () => propose('playAgain')}
    onNewMatch={activeProposal ? null : () => propose('newMatch')}
    proposal={activeProposal}
  />
) : game.gameType === 'wordduel' ? (
```
**`SINGLE_ROUND_GAMES` (line 51) is left unchanged** — `'paint'` is deliberately *not* added to
it (see §1.9), so the existing `matchTarget = 3` default already applies to both the win-effect
sound/`recordMatch` logic (~line 386) and the standard `matchWinner` calc (~line 1092) with zero
edits to either.

### `src/lib/rules.js`

Add (insert after the `spaceduel` entry):
```js
paint: {
  objective: 'Paint more of the 20×20 arena than your opponent before the 60-second clock runs out.',
  howToPlay: [
    'Steer with arrow keys, WASD, or swipe on touch screens — turns are instant, including full reversals.',
    'The cell you leave turns your color as you move off it — cut a wide swath through the arena to claim it.',
    'Standing on your opponent’s paint slows you to 70% speed until you cross off it — use this to trap them.',
    'Play is real time over a direct peer-to-peer link, so both players must stay connected.',
  ],
  win: 'When the clock hits zero, whoever painted more cells wins the round; equal counts draw. First to 3 round wins takes the match.',
},
```

### `src/pages/Demo.jsx`

Add `PaintIcon` to the icon import list (same block as `TronIcon, SumoIcon, SpaceDuelIcon,
ChainReactionIcon, WordDuelIcon`) and add:
```js
import PaintDemo from './PaintDemo'
```
alongside `import SpaceduelDemo from './SpaceduelDemo'`. Add one line to the `DEMOS` array
(insert after the `spaceduel` line, same "Skill bots" group):
```js
{ type: 'paint',        short: 'PAINT\nTURF',   Icon: PaintIcon,        Component: PaintDemo        },
```

### `src/lib/demoBots.js` — **not applicable**

`demoBots.js`'s `pickBotMove` dispatcher is only consumed by `BotBoardDemo` for standard-registry
board games (`boardSize`/`getMoveIndex`/`getWinner` shape). Paint is `custom: true, realtime:
true` with its own dedicated demo page (`PaintDemo.jsx` calling `computeAI` directly from
`paintLogic.js`), exactly like Tron/Sumo/SpaceDuel/Pong/Snake — none of those touch
`demoBots.js` either. No change needed.

### `database.rules.json` — **not applicable**

Per the platform's non-negotiable checklist: `games/$gameId` is permissive except for `players`;
no new top-level key needs a rule change.

---

## 7. Unit tests (`src/lib/paintLogic.test.js`)

**`createState`**
- Grid is all-neutral except the two spawn cells, which are pre-painted `1` (X) / `2` (O).
- Player positions/directions match the documented spawn corners; `timeLeft === MATCH_SECONDS`;
  `warned === false`, `ended === false`.
- `opts.speedCaps` is honored (`players.O.speedCap` reflects the passed value; omitted defaults
  to `1` for both sides).

**`step` — purity & movement**
- Does not mutate the input `state` (deep-equality snapshot before/after, like `pongLogic.test.js`).
- Moving without crossing a cell boundary fires no events.
- Crossing into a fresh **neutral** cell fires `cellPainted` (correct `by`/`index`), no
  `cellStolen`.
- Crossing into a cell owned by the **other** player fires both `cellPainted` and `cellStolen`
  (correct `from`).
- Crossing back into a cell the mover **already owns** fires no event.
- A 180° reversal is accepted with no special handling/rejection inside `step()`.
- X is always processed before O within a single step (construct a same-cell contest and assert
  the deterministic X-then-O outcome).

**`step` — speed modifier**
- A mover currently standing in an *unvacated* enemy-owned cell moves `ENEMY_SLOW_MULT` as far in
  one step (given equal `dt`) as a control case starting on neutral/own ground.
- The step during which a mover first crosses *into* a fresh enemy cell still uses the
  **pre-crossing** cell's (fast) multiplier — the slow only applies starting the *next* step.
- `speedCap` (from `createState(opts)`) multiplies the effective speed on top of the slow-zone
  multiplier.

**`step` — timer**
- `timeLeft` decreases by `dt` each step while `!ended`.
- `warning10s` fires exactly once, the first step `timeLeft` crosses ≤ `WARNING_AT`; never again
  on subsequent steps.
- `timeUp` fires exactly once when `timeLeft` reaches 0; `ended` becomes (and stays) `true`;
  further `step()` calls after `ended` don't decrement `timeLeft` below 0 or refire `timeUp`.
- On the `timeUp` step, each player's currently-occupied (never-vacated) cell is force-painted to
  their color if not already, with a matching `cellPainted`/`cellStolen` event.

**`counts` / invariants**
- `counts(state)` sums to exactly `CELL_COUNT` for a hand-built mixed grid.
- Accepts a raw grid array directly (`counts(grid)`) as well as a full state object.
- Over a scripted multi-step run, `counts(state).X + counts(state).O` is monotonically
  non-decreasing and never exceeds `CELL_COUNT` (paint is reassigned, never erased to neutral).

**`getWinner`**
- `null` while `!state.ended`, regardless of current counts.
- `'X'` / `'O'` when one side strictly leads after `ended`; `'draw'` on an exact tie.

**Determinism**
- Given an identical starting state and an identical scripted `{X,O}` input sequence over N
  fixed-`dt` steps, two independent replays produce bit-identical resulting grids and positions.

**Codec**
- `unpackGrid(packGrid(grid))` round-trips exactly for: an all-neutral grid, an all-X grid, an
  all-O grid, and a random mixed grid (all 400 indices compared).
- A hand-picked 4-cell pattern (e.g. `[1,2,0,1]`) packs to the exact expected byte value (locks
  the bit layout as a regression guard).
- `base64ToBytes(bytesToBase64(bytes))` round-trips for a 100-byte packed grid; output length
  matches the padded-base64 formula (136 chars for 100 bytes).

**`computeAI`**
- Always returns one of the 4 valid direction strings for a variety of states, including
  degenerate ones (grid entirely neutral, grid entirely enemy-owned, grid evenly split) — never
  `NaN`/`undefined`/an invalid string.
- Unrecognized `difficulty` string falls back to `'normal'` behavior without throwing.
- Run 1000 scripted steps of `state = step(state, { O: computeAI(state, 'O') }, dt)` and assert
  the bot's position never leaves `[0, GRID_W) × [0, GRID_H)` and no value ever becomes `NaN`.
- Final-10s steal mode: construct a state with `timeLeft <= 10` and a clear contiguous enemy
  region on one side of the bot; assert the returned direction points toward that region rather
  than the general greedy target.

**`cellIndex`**
- Boundary correctness: `(0,0) → 0`, `(GRID_W - ε, 0) → GRID_W - 1`,
  `(0, GRID_H - ε) → (GRID_H-1) * GRID_W`.
- Out-of-range/negative inputs clamp into range rather than producing an invalid index.

---

## 8. Manual verification script

Two-browser flow (per `CLAUDE.md`: same-browser tabs share `playerId` — use an incognito/private
window, or a second device, for the second player).

1. Browser A (normal window): create a room, pick **PAINT TURF**. You're X, host.
2. Browser B (incognito window): open the invite link, join as O, guest.
3. Both sides should see the "CONNECTING…" → countdown → live arena sequence
   (`RealtimeOverlay`).
4. Move around with arrows/WASD (or swipe on a touch-emulated device via devtools). Confirm:
   - Your own square leaves a trail of your color behind it as you move (not ahead of it).
   - The score bar at the top updates live and roughly tracks what you're painting.
   - Driving into the opponent's territory visibly slows your square (dim/pulse) until you've
     crossed off the far side, then speed returns to normal on freshly-neutral/your-own ground.
   - A quick double-tap reversal (e.g. right then immediately left) is accepted instantly — no
     lag, no rejection.
5. At the 10-second mark: countdown flashes (`animate-pulse`) and a soft bell sound plays once on
   each client.
6. At 0: arena freezes, finished screen shows each side's final painted-cell count, winner
   highlighted, `GameStatus` shows **NEXT ROUND** (PLAY AGAIN — via `onPlayAgain`, keeping the
   match score) since neither side has 3 round wins yet.
7. Repeat rounds until one side reaches 3 round wins — confirm the button switches to **NEW
   MATCH** (`onNewMatch`) and that accepting it resets `paintScoreX/O` and `scores` to 0/`{}` and
   starts a brand-new grid.
8. Open a third (also-incognito, distinct `playerId`) browser tab on the same room mid-round:
   confirm it renders as a spectator — synced `paintScoreX/O` numbers only, "LIVE GRID IS
   PEER-TO-PEER" messaging, no live positions (matches Snake/Tron/Sumo spectator pattern).
9. From the finished screen, use **SWITCH GAME** to another game type, then switch back to Paint
   Turf — confirm `paintScoreX/O` reset to 0 (FIELD_NULLS working) and a fresh grid/round starts
   clean.
10. Simulate a connection failure (disable Wi-Fi/network briefly on one client mid-handshake, or
    block STUN via devtools network conditions): confirm the "CONNECTION FAILED / RETRY" overlay
    appears and RETRY re-establishes the peer connection.
11. `/demo?type=paint` (or select PAINT TURF from the Demo page's reflex tab): confirm you can
    play solo vs the bot, the bot visibly re-routes toward open/enemy territory, escalates to
    "stealing" your largest contiguous region in the final 10 seconds, and PLAY AGAIN/NEW MATCH
    buttons behave like `SumoDemo`'s.

---

## 9. Risks and mitigations

1. **Bandwidth is higher than the PRD's back-of-envelope estimate.** The PRD assumed ~130
   bytes/snapshot (raw packed bytes) ≈ 4 KB/s at 30 Hz. Because `rtc.js` only supports JSON-string
   frames (see the callout at the top of this spec), the real payload is base64 text plus JSON
   structure: ~136 chars (grid) + ~65 chars (positions/directions/timer) + ~30 chars (JSON
   punctuation/keys) ≈ **~230 bytes/snapshot ≈ ~7 KB/s** at the standard 30 Hz snapshot rate.
   Still trivial for a P2P data channel (Pong/Sumo/SpaceDuel already push comparable or higher
   rates with pickups/effects) — no action needed, just documented so it isn't a surprise later.
2. **`cellPainted`/`cellStolen` events fire often** (up to ~14/s combined at full speed), and
   `useRealtimeHost`'s loop broadcasts an `{t:'e', k:...}` frame for *every* event it sees (no
   batching hook exists to change this without touching shared code, which is out of scope).
   Each frame is tiny (~20 bytes) and the channel is unreliable/unordered by design — dropped
   frames only cost a slightly-off sound-counter cadence on the guest, never a gameplay
   inconsistency (grid state re-syncs fully every snapshot regardless). Accepted.
3. **"Paint on exit, not on entry" is a deliberate, load-bearing deviation from the PRD's literal
   text** (§1.2). Flagged prominently so a future editor doesn't "fix" it back to instant-entry
   painting — doing so would silently delete the slow-zone mechanic that is this game's entire
   hook.
4. **Guest's optimistic local grid** can briefly diverge from host truth on contested crossings;
   corrects itself on the next ~33ms snapshot. Explicitly called out as acceptable in the PRD
   itself ("visually invisible in practice").
5. **Match-length (first-to-3) is a resolved design decision, not literally specified by the
   PRD** (§1.9), which left it as an open question. Flagged here so a reviewer who wanted
   single-round-decides-the-match (Tron/Sumo/SpaceDuel's pattern) can override by adding `'paint'`
   to `SINGLE_ROUND_GAMES` in `Game.jsx` — a one-line change if so.
6. **AI's flood-fill (final-10s steal mode)** is an O(400) BFS run at most every `replanMs`
   (350–800ms) — negligible cost, no perf risk.
7. **NAT traversal failure** — identical residual risk to every other realtime game (~5–10% of
   peer pairs behind symmetric NATs); same documented "CONNECTION FAILED / RETRY" UX, no new
   mitigation needed or possible without a TURN relay (explicitly out of scope platform-wide).
8. **Badge/label collision check** — `PT` and `PAINT TURF` checked against all 31 existing
   registry entries; no collisions. (Note: the existing registry already has an internal
   duplicate — `typing` and `tron` both use badge `'TR'` — pre-existing, not introduced by this
   spec, not this spec's to fix.)
