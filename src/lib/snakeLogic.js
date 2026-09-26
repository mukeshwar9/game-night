// @ts-check
// Pure Snake Battle simulation — no DOM, no network, no React. Deterministic
// movement (food spawn uses RNG, but the host is authoritative so the guest
// never simulates). Two snakes duel on a GRID×GRID arena; the last snake
// alive wins the round. Match scoring (first to WIN_SCORE round wins) is
// handled by the page via Firebase `scores`, same as Pong.
//
// Coordinate system: (x, y) with x = column 0..GRID-1 (left→right),
// y = row 0..GRID-1 (top→bottom). Bodies are arrays of {x,y}, head first.

export const GRID = 21
export const WIN_SCORE = 3        // round wins needed to take the match
export const TICK_MS = 120        // sim tick interval (~8 ticks/sec)
export const START_LEN = 3

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
 * Deterministic, seedable PRNG (a Numerical-Recipes-constants LCG) so
 * spawnFood — and therefore createState/tick, which call it — can be
 * reproduced in tests instead of depending on Math.random(). Callers that
 * don't care about reproducibility can omit the seed entirely; every rng
 * param below defaults to Math.random so production behavior is unchanged.
 * @param {number} [seed]
 * @returns {() => number}  a function returning a float in [0, 1)
 */
export function createRng(seed = Date.now()) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 4294967296
  }
}

/**
 * Pick a random free cell for food (not on any snake body).
 * @param {object} snakes  { X: {body}, O: {body} }
 * @param {() => number} [rng]  defaults to Math.random
 * @returns {{x,y}|null}
 */
export function spawnFood(snakes, rng = Math.random) {
  const occupied = new Set()
  for (const side of ['X', 'O']) {
    for (const seg of snakes[side].body) occupied.add(`${seg.x},${seg.y}`)
  }
  const free = []
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y })
    }
  }
  if (!free.length) return null
  return free[Math.floor(rng() * free.length)]
}

/**
 * Build a fresh round state. X spawns left-center heading right; O spawns
 * right-center heading left. Both start with START_LEN segments.
 * @param {() => number} [rng]  defaults to Math.random; pass a seeded rng
 *   (see createRng) for reproducible food placement.
 */
export function createState(rng = Math.random) {
  const cy = Math.floor(GRID / 2)
  const snakes = {
    X: {
      body: Array.from({ length: START_LEN }, (_, i) => ({ x: START_LEN - 1 - i, y: cy })),
      dir: 'right',
      alive: true,
      eaten: 0,
    },
    O: {
      body: Array.from({ length: START_LEN }, (_, i) => ({ x: GRID - START_LEN + i, y: cy })),
      dir: 'left',
      alive: true,
      eaten: 0,
    },
  }
  return { snakes, food: spawnFood(snakes, rng), tick: 0 }
}

/**
 * Advance the simulation by one tick. Pure: never mutates `state`.
 *
 * Both snakes move simultaneously. Movement order for collision checks:
 *   1. Validate direction changes (can't reverse 180°).
 *   2. Compute new heads (walls wrap — exit right, re-enter left, etc.).
 *   3. Eating: does the new head land on food?
 *   4. Body collisions: new head vs own body (excl. tail if not eating) and
 *      vs opponent's body (excl. opponent's tail if not eating).
 *   5. Head-on: both new heads land on the same cell → both die.
 *   6. Move surviving snakes (unshift head; pop tail unless eating).
 *   7. Respawn food if eaten.
 *
 * @param {object} state
 * @param {{X?:string,O?:string}} inputs  intended direction per side ('up'|'down'|'left'|'right'); null/undefined = keep current
 * @param {() => number} [rng]  defaults to Math.random; passed through to spawnFood on a respawn
 * @returns {{ state: object, events: Array<{type:string,by?:string,cause?:string}> }}
 */
export function tick(state, inputs = {}, rng = Math.random) {
  const s = {
    snakes: {
      X: { ...state.snakes.X, body: state.snakes.X.body.map(c => ({ ...c })) },
      O: { ...state.snakes.O, body: state.snakes.O.body.map(c => ({ ...c })) },
    },
    food: state.food ? { ...state.food } : null,
    tick: state.tick + 1,
  }
  const events = []

  // 1. Apply direction changes (ignore 180° reversals).
  for (const side of ['X', 'O']) {
    const inp = inputs?.[side]
    if (inp && DIRS[inp] && OPPOSITE[s.snakes[side].dir] !== inp) {
      s.snakes[side].dir = inp
    }
  }

  // 2. Compute new heads for alive snakes (wrap around walls).
  const newHeads = {}
  for (const side of ['X', 'O']) {
    const snake = s.snakes[side]
    if (!snake.alive) continue
    const d = DIRS[snake.dir]
    newHeads[side] = { x: wrap(snake.body[0].x + d.x), y: wrap(snake.body[0].y + d.y) }
  }

  // 3. Eating?
  const eating = {}
  for (const side of ['X', 'O']) {
    if (!s.snakes[side].alive) continue
    eating[side] = !!(s.food && eq(newHeads[side], s.food))
  }

  // 4. Body collisions (self + other). Check against the FROZEN pre-tick
  //    state (`state`, not `s`) for both sides before applying either
  //    verdict — mutating `s.snakes[side].alive` mid-loop (as this used to)
  //    made X's collision result visible to O's check (and vice versa)
  //    depending on iteration order, which meant which side got the
  //    tail-vacate exemption in a same-tick double-kill was order-dependent
  //    (host-favoring, since X is always evaluated first). Reading only
  //    from `state` — and writing verdicts into `dies` — makes the outcome
  //    independent of which side is evaluated first.
  const dies = { X: false, O: false }
  for (const side of ['X', 'O']) {
    const frozen = state.snakes[side]
    if (!frozen.alive) continue
    const h = newHeads[side]

    // Own body (exclude tail if not eating, since it vacates).
    const ownBody = eating[side] ? frozen.body : frozen.body.slice(0, -1)
    if (ownBody.some(seg => eq(h, seg))) {
      dies[side] = true
      events.push({ type: 'die', by: side, cause: 'self' })
      continue
    }

    // Other snake's body, read from the frozen pre-tick state. Always
    // check — even dead snakes' bodies linger as obstacles. Exclude the
    // other's tail only if it was alive AND not eating (a moving,
    // non-growing snake vacates its tail cell) — evaluated from the SAME
    // pre-tick snapshot regardless of which side is checked first.
    const other = side === 'X' ? 'O' : 'X'
    const otherFrozen = state.snakes[other]
    const otherBody = (otherFrozen.alive && !eating[other])
      ? otherFrozen.body.slice(0, -1)
      : otherFrozen.body
    if (otherBody.some(seg => eq(h, seg))) {
      dies[side] = true
      events.push({ type: 'die', by: side, cause: 'other' })
    }
  }
  for (const side of ['X', 'O']) {
    if (dies[side]) s.snakes[side].alive = false
  }

  // 5. Head-on: both new heads land on the same cell.
  if (s.snakes.X.alive && s.snakes.O.alive && eq(newHeads.X, newHeads.O)) {
    s.snakes.X.alive = false
    s.snakes.O.alive = false
    events.push({ type: 'die', by: 'X', cause: 'headon' })
    events.push({ type: 'die', by: 'O', cause: 'headon' })
  }

  // 6. Move surviving snakes.
  for (const side of ['X', 'O']) {
    const snake = s.snakes[side]
    if (!snake.alive) continue
    snake.body.unshift(newHeads[side])
    if (eating[side]) {
      snake.eaten += 1
      events.push({ type: 'eat', by: side })
    } else {
      snake.body.pop()
    }
  }

  // 7. Respawn food if eaten (by any snake that ate this tick).
  if (eating.X || eating.O) {
    s.food = spawnFood(s.snakes, rng)
  }

  return { state: s, events }
}

/**
 * Round result: who won this round?
 * @returns {'X'|'O'|'draw'|null}  null = round still in progress
 */
export function getWinner(state) {
  const xAlive = state.snakes.X.alive
  const oAlive = state.snakes.O.alive
  if (xAlive && oAlive) return null
  if (!xAlive && !oAlive) return 'draw'
  return xAlive ? 'X' : 'O'
}

const OPP_DIRS = { up: 'down', down: 'up', left: 'right', right: 'left' }

/**
 * Heuristic AI for the /demo route. Greedy + safety-seeking:
 *   1. Try each non-reversing direction.
 *   2. Simulate the head one step (walls wrap); discard moves that hit
 *      either body, or the opponent's head-on collision cell.
 *   3. Among safe moves, prefer the one minimizing toroidal distance to food.
 *   4. If no safe move, fall back to current direction (death is inevitable).
 *
 * @param {object} state
 * @param {'X'|'O'} side  which snake the AI controls
 * @returns {'up'|'down'|'left'|'right'}  chosen direction
 */
export function computeAI(state, side) {
  const snake = state.snakes[side]
  const cur = snake.dir
  const other = state.snakes[side === 'X' ? 'O' : 'X']
  const head = snake.body[0]
  const food = state.food

  const isOccupied = (cell, excludeOwnTail, excludeOtherTail) => {
    const own = excludeOwnTail ? snake.body.slice(0, -1) : snake.body
    if (own.some(s => eq(s, cell))) return true
    const opp = excludeOtherTail ? other.body.slice(0, -1) : other.body
    if (opp.some(s => eq(s, cell))) return true
    return false
  }

  const candidates = ['up', 'down', 'left', 'right'].filter(d => d !== OPP_DIRS[cur])
  let best = cur
  let bestScore = -Infinity

  for (const dir of candidates) {
    const d = DIRS[dir]
    const next = { x: wrap(head.x + d.x), y: wrap(head.y + d.y) }
    // A move is safe if the new head doesn't collide with either body.
    // Both snakes vacate their tails on a normal (non-eating) move.
    if (isOccupied(next, true, true)) continue
    // Head-on: skip moves that land on the opponent's predicted next head
    // (only when the opponent is alive — a dead snake's head stays put).
    if (other.alive) {
      const od = DIRS[other.dir]
      const otherNext = { x: wrap(other.body[0].x + od.x), y: wrap(other.body[0].y + od.y) }
      if (eq(next, otherNext)) continue
    }
    // Score: closer to food is better (toroidal Manhattan distance, negated).
    let score = 0
    if (food) {
      const dx = Math.min(Math.abs(next.x - food.x), GRID - Math.abs(next.x - food.x))
      const dy = Math.min(Math.abs(next.y - food.y), GRID - Math.abs(next.y - food.y))
      score = -(dx + dy)
    }
    if (score > bestScore) { bestScore = score; best = dir }
  }

  return best
}
