// Pure Tron Light Cycles simulation — no DOM, no network, no React. Two
// cycles duel on a GRID×GRID toroidal arena; trails are permanent (never
// vacate). A cycle dies if its head lands on any occupied cell (its own
// trail, the opponent's trail) or on the opponent's head (head-on). Last
// alive wins; both dead in the same tick → draw. Single round decides the
// match (no WIN_SCORE — finishing handled by the page via Firebase scores).
//
// Coordinate system: (x, y) with x = column 0..GRID-1 (left→right),
// y = row 0..GRID-1 (top→bottom). Bodies are arrays of {x,y}, head first.

export const GRID = 31
export const TICK_MS = 100

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }

const eq = (a, b) => a.x === b.x && a.y === b.y
const wrap = (n) => ((n % GRID) + GRID) % GRID

/**
 * Build a fresh round state. X spawns left-center heading right; O spawns
 * right-center heading left. Each body starts as a single head cell; the
 * trail grows by one every tick (length = tick count + 1).
 */
export function createState() {
  const cy = Math.floor(GRID / 2)
  return {
    cycles: {
      X: { body: [{ x: 1, y: cy }], dir: 'right', alive: true },
      O: { body: [{ x: GRID - 2, y: cy }], dir: 'left', alive: true },
    },
    tick: 0,
  }
}

/**
 * Advance the simulation by one tick. Pure: never mutates `state`.
 *
 *   1. Validate direction changes (can't reverse 180°).
 *   2. Compute new heads for alive cycles (walls wrap — toroidal).
 *   3. Trail collision: new head vs any occupied cell of either cycle.
 *      The own moving head (body[0]) is NOT a wall, so exclude it when
 *      checking self-collision on the move-ahead.
 *   4. Head-on: both new heads land on the same cell → both die.
 *   5. Move surviving cycles: unshift head, never pop (trail is permanent).
 *
 * @param {object} state
 * @param {{X?:string,O?:string}} inputs  intended direction per side; null/undefined = keep current
 * @returns {{ state: object, events: Array<{type:string,by:string,cause:string}> }}
 */
export function tick(state, inputs = {}) {
  const s = {
    cycles: {
      X: { ...state.cycles.X, body: state.cycles.X.body.map(c => ({ ...c })) },
      O: { ...state.cycles.O, body: state.cycles.O.body.map(c => ({ ...c })) },
    },
    tick: state.tick + 1,
  }
  const events = []

  // 1. Apply direction changes (ignore 180° reversals).
  for (const side of ['X', 'O']) {
    const inp = inputs?.[side]
    if (inp && DIRS[inp] && OPPOSITE[s.cycles[side].dir] !== inp) {
      s.cycles[side].dir = inp
    }
  }

  // 2. Compute new heads for alive cycles (wrap around walls).
  const newHeads = {}
  for (const side of ['X', 'O']) {
    const c = s.cycles[side]
    if (!c.alive) continue
    const d = DIRS[c.dir]
    newHeads[side] = { x: wrap(c.body[0].x + d.x), y: wrap(c.body[0].y + d.y) }
  }

  // 3. Trail collision: new head vs any occupied cell. The own head (body[0])
  //    is the moving cell, so exclude it from the self check. Trails never
  //    vacate, so we never exclude a tail.
  for (const side of ['X', 'O']) {
    const c = s.cycles[side]
    if (!c.alive) continue
    const h = newHeads[side]
    const other = side === 'X' ? 'O' : 'X'

    // Own trail (exclude body[0], the moving head).
    const ownTrail = c.body.slice(1)
    if (ownTrail.some(seg => eq(h, seg))) {
      c.alive = false
      events.push({ type: 'die', by: side, cause: 'self' })
      continue
    }

    // Opponent's entire trail (no exclusion — trails never vacate).
    if (s.cycles[other].body.some(seg => eq(h, seg))) {
      c.alive = false
      events.push({ type: 'die', by: side, cause: 'other' })
    }
  }

  // 4. Head-on: both new heads land on the same cell.
  if (s.cycles.X.alive && s.cycles.O.alive && eq(newHeads.X, newHeads.O)) {
    s.cycles.X.alive = false
    s.cycles.O.alive = false
    events.push({ type: 'die', by: 'X', cause: 'headon' })
    events.push({ type: 'die', by: 'O', cause: 'headon' })
  }

  // 5. Move surviving cycles: unshift head, never pop (trail grows each tick).
  for (const side of ['X', 'O']) {
    const c = s.cycles[side]
    if (!c.alive) continue
    c.body.unshift(newHeads[side])
  }

  return { state: s, events }
}

/**
 * Round result: who won this round?
 * @returns {'X'|'O'|'draw'|null}  null = round still in progress
 */
export function getWinner(state) {
  const xAlive = state.cycles.X.alive
  const oAlive = state.cycles.O.alive
  if (xAlive && oAlive) return null
  if (!xAlive && !oAlive) return 'draw'
  return xAlive ? 'X' : 'O'
}

/**
 * Reaction-handicapped AI for the /demo route. One-step lookahead: among
 * non-reversing moves whose next toroidal cell is free of any trail of
 * EITHER cycle, pick the one minimizing toroidal Manhattan distance to
 * the opponent's head (cycle toward the opponent). If no safe move,
 * keep current direction (death is inevitable). Beatable.
 *
 * @param {object} state
 * @param {'X'|'O'} side  which cycle the AI controls
 * @returns {'up'|'down'|'left'|'right'}  chosen direction
 */
export function computeAI(state, side) {
  const c = state.cycles[side]
  const cur = c.dir
  const other = state.cycles[side === 'X' ? 'O' : 'X']
  const head = c.body[0]
  const oppHead = other.body[0]

  const occupied = (cell) => {
    if (c.body.slice(1).some(s => eq(s, cell))) return true
    if (other.body.some(s => eq(s, cell))) return true
    return false
  }

  const torMan = (a, b) => {
    const dx = Math.min(Math.abs(a.x - b.x), GRID - Math.abs(a.x - b.x))
    const dy = Math.min(Math.abs(a.y - b.y), GRID - Math.abs(a.y - b.y))
    return dx + dy
  }

  const candidates = ['up', 'down', 'left', 'right'].filter(d => d !== OPPOSITE[cur])
  let best = cur
  let bestDist = Infinity

  for (const dir of candidates) {
    const d = DIRS[dir]
    const next = { x: wrap(head.x + d.x), y: wrap(head.y + d.y) }
    if (occupied(next)) continue
    const dist = torMan(next, oppHead)
    if (dist < bestDist) { bestDist = dist; best = dir }
  }

  return best
}
