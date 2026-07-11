// Pure Paint Turf simulation — no DOM, no network, no React. Deterministic
// and unit-testable. The arena is a 20×20 grid of cells (0 neutral / 1 X /
// 2 O). Players move continuously across it; the cell a mover VACATES turns
// their color (paint-on-exit, not paint-on-entry — see the note above
// `step()`, this is the game's one load-bearing deviation from a literal
// reading of the design doc). Standing on the opponent's still-unconverted
// paint slows a mover to ENEMY_SLOW_MULT.
//
// The /demo route runs this directly (loopback vs `computeAI`), and in
// multiplayer the HOST runs it authoritatively and streams packed-grid
// snapshots over the WebRTC data channel — the guest never simulates, so
// cross-client determinism is not required (but is still tested, since the
// guest predicts its own movement locally between snapshots).

export const GRID_W = 20
export const GRID_H = 20
export const CELL_COUNT = GRID_W * GRID_H          // 400
export const BASE_SPEED = 7                         // cells/sec
export const ENEMY_SLOW_MULT = 0.7                  // speed multiplier while standing on
                                                     // enemy-owned (unvacated) paint
export const MATCH_SECONDS = 60                     // round timer
export const WARNING_AT = 10                        // seconds remaining that fire 'warning10s'
export const MATCH_TARGET = 3                       // round wins needed to take the match

// replanMs: how often the *caller* re-invokes computeAI and adopts its new
// direction (the caller owns throttling — computeAI itself is stateless).
// speedCap: baked into the bot's own player via createState({ speedCaps }).
export const AI_DIFFICULTIES = {
  easy:   { replanMs: 800, speedCap: 0.80 },
  normal: { replanMs: 500, speedCap: 0.92 },
  hard:   { replanMs: 350, speedCap: 1.00 },
}

const EPS = 1e-6
const DIR_VEC = {
  up:    { x: 0, y: -1 },
  down:  { x: 0, y: 1 },
  left:  { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}
const VALID_DIRS = new Set(Object.keys(DIR_VEC))

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/** Cell index for a continuous (x, y) position, defensively clamped so
 * out-of-range or non-finite inputs never produce a negative/overflowing
 * index. */
export function cellIndex(x, y) {
  const cx = clamp(Number.isFinite(x) ? Math.floor(x) : 0, 0, GRID_W - 1)
  const cy = clamp(Number.isFinite(y) ? Math.floor(y) : 0, 0, GRID_H - 1)
  return cx + cy * GRID_W
}

/**
 * Build a fresh simulation state. Both spawn cells are pre-painted so
 * territory is claimed from frame one.
 * @param {{ speedCaps?: { X?: number, O?: number } }} [opts] per-side speed
 *   multiplier baked in permanently — used only by the demo bot to make
 *   itself beatable; multiplayer never sets this (defaults to 1, a no-op).
 */
export function createState(opts = {}) {
  const { speedCaps = {} } = opts
  const grid = new Uint8Array(CELL_COUNT)
  grid[cellIndex(0.5, 0.5)] = 1
  grid[cellIndex(GRID_W - 0.5, GRID_H - 0.5)] = 2
  return {
    grid,
    players: {
      X: { x: 0.5, y: 0.5, dir: 'right', speedCap: speedCaps.X ?? 1 },
      O: { x: GRID_W - 0.5, y: GRID_H - 0.5, dir: 'left', speedCap: speedCaps.O ?? 1 },
    },
    timeLeft: MATCH_SECONDS,
    warned: false,
    ended: false,
  }
}

/**
 * Advance the simulation by one step. Pure: never mutates `state`.
 *
 * Paint-on-exit (the load-bearing deviation): a cell converts to the mover's
 * color when the mover's cell INDEX changes — i.e. the cell they just left,
 * not the one they just entered. This is what makes the enemy-paint slow
 * zone actually last for the whole time a mover's position lies inside it;
 * paint-on-entry would flip the cell the instant it's touched and the slow
 * would only ever be felt for a single sub-step. The speed multiplier for
 * THIS step is always read from the cell the mover is presently standing in
 * (before any mutation this step), so a step that's about to cross INTO a
 * fresh enemy cell still runs at full speed — the slow starts being felt the
 * following step. On the step where the clock hits zero, each player's
 * current (never-vacated) cell is force-painted before computing the final
 * winner, so "wherever you are at the buzzer" still counts.
 *
 * @param {object} state  previous state
 * @param {{X?: 'up'|'down'|'left'|'right', O?: same}} inputs  direction
 *   CHANGES only (matches Tron/Snake) — omit/null keeps the current heading.
 * @param {number} dt  seconds (fixed timestep recommended)
 * @returns {{ state: object, events: Array<{type:string, by?:string, index?:number, from?:string}> }}
 */
export function step(state, inputs, dt) {
  // Once the round has ended, freeze the whole state — a caller whose
  // fixed-timestep accumulator invokes step() again after `ended` flips
  // (e.g. useRealtimeHost's `while (acc >= DT)` loop, which has no `ended`
  // check) must not keep moving players or emitting paint events past the
  // official end of the round.
  if (state.ended) return { state, events: [] }

  const grid = state.grid.slice()
  const events = []
  const players = {}

  // X THEN O, always — deterministic same-frame order for contested cells.
  for (const side of ['X', 'O']) {
    const p = { ...state.players[side] }
    const ownerCode = side === 'X' ? 1 : 2
    const inputDir = inputs?.[side]
    if (VALID_DIRS.has(inputDir)) p.dir = inputDir

    // Speed check uses the PRE-DEPARTURE cell (not the destination).
    const oldIdx = cellIndex(p.x, p.y)
    const curOwner = grid[oldIdx]
    const speedMult = (curOwner !== 0 && curOwner !== ownerCode) ? ENEMY_SLOW_MULT : 1
    const speed = BASE_SPEED * speedMult * (p.speedCap ?? 1)

    const vec = DIR_VEC[p.dir] ?? DIR_VEC.right
    const nx = clamp(p.x + vec.x * speed * dt, 0, GRID_W - EPS)
    const ny = clamp(p.y + vec.y * speed * dt, 0, GRID_H - EPS)
    const newIdx = cellIndex(nx, ny)

    if (newIdx !== oldIdx) {
      // The mover VACATED oldIdx this step — paint it (regardless of which
      // neighbor they exited toward, so a 180° reversal still paints it).
      const prevOwner = grid[oldIdx]
      if (prevOwner !== ownerCode) {
        grid[oldIdx] = ownerCode
        events.push({ type: 'cellPainted', by: side, index: oldIdx })
        if (prevOwner !== 0) {
          events.push({ type: 'cellStolen', by: side, index: oldIdx, from: prevOwner === 1 ? 'X' : 'O' })
        }
      }
    }

    p.x = nx
    p.y = ny
    players[side] = p
  }

  let timeLeft = state.timeLeft
  let warned = state.warned
  let ended = state.ended

  if (!ended) {
    timeLeft = Math.max(0, timeLeft - dt)
    if (!warned && timeLeft <= WARNING_AT) {
      warned = true
      events.push({ type: 'warning10s' })
    }
    if (timeLeft <= 0) {
      ended = true
      // Final-cell fairness: force-paint each player's un-vacated cell.
      for (const side of ['X', 'O']) {
        const ownerCode = side === 'X' ? 1 : 2
        const idx = cellIndex(players[side].x, players[side].y)
        const prevOwner = grid[idx]
        if (prevOwner !== ownerCode) {
          grid[idx] = ownerCode
          events.push({ type: 'cellPainted', by: side, index: idx })
          if (prevOwner !== 0) {
            events.push({ type: 'cellStolen', by: side, index: idx, from: prevOwner === 1 ? 'X' : 'O' })
          }
        }
      }
      events.push({ type: 'timeUp' })
    }
  }

  return { state: { grid, players, timeLeft, warned, ended }, events }
}

/** Painted-cell tally. Accepts either a full sim state ({ grid, ... }) or a
 * raw grid array/Uint8Array directly, so UI code can call `counts(gridProp)`
 * without constructing a fake state wrapper. */
export function counts(stateOrGrid) {
  const grid = stateOrGrid?.grid ?? stateOrGrid
  let x = 0, o = 0, neutral = 0
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === 1) x++
    else if (grid[i] === 2) o++
    else neutral++
  }
  return { X: x, O: o, neutral }
}

/** Round winner once the clock has hit zero, else null. */
export function getWinner(state) {
  if (!state?.ended) return null
  const c = counts(state)
  if (c.X > c.O) return 'X'
  if (c.O > c.X) return 'O'
  return 'draw'
}

// --- 2-bit grid codec: CELL_COUNT (400) packs into 100 bytes, 4 cells/byte.
// byte = cell0 | (cell1<<2) | (cell2<<4) | (cell3<<6). 400 is exactly
// divisible by 4 — no padding cells.

/** @param {Uint8Array} grid length CELL_COUNT, values 0..2 → Uint8Array(100) */
export function packGrid(grid) {
  const packed = new Uint8Array(CELL_COUNT / 4)
  for (let i = 0; i < CELL_COUNT; i += 4) {
    packed[i / 4] = (grid[i] & 3)
      | ((grid[i + 1] & 3) << 2)
      | ((grid[i + 2] & 3) << 4)
      | ((grid[i + 3] & 3) << 6)
  }
  return packed
}

/** Inverse of packGrid. @param {Uint8Array} packed length 100 → Uint8Array(CELL_COUNT) */
export function unpackGrid(packed) {
  const grid = new Uint8Array(CELL_COUNT)
  for (let i = 0; i < CELL_COUNT; i += 4) {
    const b = packed[i / 4]
    grid[i] = b & 3
    grid[i + 1] = (b >> 2) & 3
    grid[i + 2] = (b >> 4) & 3
    grid[i + 3] = (b >> 6) & 3
  }
  return grid
}

// Wire-encoding helpers: rtc.js only ever sends JSON strings (no raw-binary
// send path), so the packed grid travels as base64 text. btoa/atob are plain
// JS globals (not DOM APIs) — available in every browser and in Node ≥16, so
// they work unmodified inside Vitest.

/** @param {Uint8Array} bytes → base64 string */
export function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes))
}

/** @param {string} str base64 → Uint8Array */
export function base64ToBytes(str) {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// --- AI: greedy region routing + final-10s largest-enemy-region steal ---

// Full 400-cell scan — cheap; only called every `replanMs` (350–800ms), never
// per-substep. Scores every non-owned cell by (value / (transit cost + 1)):
// enemy cells score higher (steal value) but cost more to reach because
// crossing enemy paint slows the trip.
function bestGreedyCell(grid, me, ownerCode, enemyCode) {
  let best = null
  let bestScore = -Infinity
  for (let i = 0; i < CELL_COUNT; i++) {
    const v = grid[i]
    const value = v === ownerCode ? 0 : v === 0 ? 1 : 1.4
    if (value === 0) continue
    const cx = (i % GRID_W) + 0.5
    const cy = Math.floor(i / GRID_W) + 0.5
    const dist = Math.abs(cx - me.x) + Math.abs(cy - me.y)          // manhattan
    const cost = v === enemyCode ? dist / ENEMY_SLOW_MULT : dist    // crossing enemy paint costs more transit time
    const score = value / (cost + 1)
    if (score > bestScore) { bestScore = score; best = i }
  }
  return best
}

// 4-connected flood fill (BFS) over all enemy-owned cells; returns the grid
// index nearest the largest component's centroid, or null if no enemy cells
// exist yet (round just started).
function largestEnemyRegionCentroidCell(grid, enemyCode) {
  const visited = new Uint8Array(CELL_COUNT)
  let bestSize = 0
  let bestCentroid = null

  for (let start = 0; start < CELL_COUNT; start++) {
    if (grid[start] !== enemyCode || visited[start]) continue
    const queue = [start]
    visited[start] = 1
    let qi = 0, sumX = 0, sumY = 0, size = 0
    while (qi < queue.length) {
      const idx = queue[qi++]
      const cx = idx % GRID_W
      const cy = Math.floor(idx / GRID_W)
      sumX += cx; sumY += cy; size++
      const neighbors = []
      if (cx > 0) neighbors.push(idx - 1)
      if (cx < GRID_W - 1) neighbors.push(idx + 1)
      if (cy > 0) neighbors.push(idx - GRID_W)
      if (cy < GRID_H - 1) neighbors.push(idx + GRID_W)
      for (const n of neighbors) {
        if (grid[n] === enemyCode && !visited[n]) {
          visited[n] = 1
          queue.push(n)
        }
      }
    }
    if (size > bestSize) {
      bestSize = size
      bestCentroid = { x: sumX / size, y: sumY / size }
    }
  }

  if (!bestCentroid) return null
  const cx = clamp(Math.round(bestCentroid.x), 0, GRID_W - 1)
  const cy = clamp(Math.round(bestCentroid.y), 0, GRID_H - 1)
  return cx + cy * GRID_W
}

/**
 * Heuristic AI steering (pure, stateless per call — matches Pong/Tron/Snake/
 * Sumo/SpaceDuel precedent; the *caller* throttles how often it re-invokes
 * this and reuses the last direction in between). In the final 10 seconds it
 * switches to routing toward the opponent's largest contiguous region
 * (steal mode) instead of the general greedy target.
 *
 * `difficulty` is accepted for API symmetry with AI_DIFFICULTIES (and so an
 * unrecognized value can never throw), but the replanMs/speedCap knobs it
 * configures are applied by the *caller* (see AI_DIFFICULTIES) — this
 * function's own routing heuristic doesn't otherwise vary by difficulty.
 *
 * @param {object} state
 * @param {'X'|'O'} side
 * @param {'easy'|'normal'|'hard'} [difficulty]
 * @returns {'up'|'down'|'left'|'right'}
 */
export function computeAI(state, side, difficulty = 'normal') { // eslint-disable-line no-unused-vars
  const me = state.players[side]
  const ownerCode = side === 'X' ? 1 : 2
  const enemyCode = side === 'X' ? 2 : 1

  let target
  if (state.timeLeft <= 10) {
    target = largestEnemyRegionCentroidCell(state.grid, enemyCode)
    if (target == null) target = bestGreedyCell(state.grid, me, ownerCode, enemyCode)
  } else {
    target = bestGreedyCell(state.grid, me, ownerCode, enemyCode)
  }

  if (target == null) return me.dir   // nothing better — keep current heading

  const tx = (target % GRID_W) + 0.5
  const ty = Math.floor(target / GRID_W) + 0.5
  const dx = tx - me.x
  const dy = ty - me.y
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
}
