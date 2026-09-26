// Pure PAC MAC simulation — no DOM, no network, no React.
//
// MAZE DUEL: two munchers race for the same pellets on one mirrored maze while
// three AI ghosts hunt whoever is closest. A power pellet frightens the ghosts
// AND turns its eater into a hunter for POWER_S seconds: bump the rival while
// you're powered and you gobble them (+RIVAL_PTS, they respawn). Most points
// when the maze is cleared (or the clock runs out) takes the round.
//
// Host-authoritative in multiplayer. The guest simulates its own muncher
// locally for zero-lag steering and reports its position; `applyRemote()`
// validates and adopts those reports on the host. /demo runs `computeAI()`.

export const MAZE_W = 15
export const MAZE_H = 17
export const CELL_COUNT = MAZE_W * MAZE_H

export const PAC_SPEED = 5.6       // tiles/sec
export const POWER_SPEED = 6.2     // a powered muncher is a touch quicker
export const GHOST_SPEED = 4.7     // ~84% of a muncher: you can outrun a ghost
export const FRIGHT_SPEED = 3.0
export const EATEN_SPEED = 10
export const HOUSE_SPEED = 2.6

export const ROUND_SECONDS = 90
export const MATCH_TARGET = 3
export const PELLET_PTS = 10
export const POWER_PTS = 50
export const GHOST_PTS = [100, 200, 300]
export const RIVAL_PTS = 200
export const POWER_S = 6
export const POWER_WARN_S = 2      // last seconds of power flash as a warning
export const RESPAWN_S = 2
export const SHIELD_S = 1.5        // post-respawn grace: nothing can catch you
export const SCATTER_S = 5
export const CHASE_S = 15
export const HIT_DIST = 0.6
export const TURN_GRACE = 0.3      // a turn pressed just after a junction still takes
export const MAX_REMOTE_JUMP = 3   // tiles a guest report may move its muncher at once
export const WARNING_AT = 10

export const AI_DIFFICULTIES = {
  easy:   { replanMs: 320, mistake: 0.18 },
  normal: { replanMs: 200, mistake: 0.08 },
  hard:   { replanMs: 120, mistake: 0.02 },
}

export const DIR_VEC = {
  up:    { x: 0, y: -1 },
  down:  { x: 0, y: 1 },
  left:  { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}
export const DIRS = ['up', 'left', 'down', 'right']
const VALID_DIRS = new Set(DIRS)
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }

// Original 15×17 maze, mirrored left↔right so both spawns are equally far
// from every pellet, power pellet, tunnel and ghost.
// # wall  . pellet  o power pellet  space empty  H ghost house  - house door
export const MAZE_ROWS = [
  '###############',
  '#o...........o#',
  '#.###.#.#.###.#',
  '#.............#',
  '#.###.#.#.###.#',
  '#.....#.#.....#',
  '###.........###',
  '####.##-##.####',
  '    .#HHH#.    ',
  '####.#####.####',
  '###.........###',
  '#.....#.#.....#',
  '#.##.##.##.##.#',
  '#o.#.......#.o#',
  '#..#.#.#.#.#..#',
  '#....#...#....#',
  '###############',
]

if (MAZE_ROWS.length !== MAZE_H || MAZE_ROWS.some(r => r.length !== MAZE_W)) {
  throw new Error('PAC MAC maze dimensions mismatch')
}

export const CELL = { OPEN: 0, WALL: 1, HOUSE: 2, DOOR: 3 }
const CELLS = new Uint8Array(CELL_COUNT)
const PELLET_TEMPLATE = new Uint8Array(CELL_COUNT) // 1 pellet, 2 power

for (let y = 0; y < MAZE_H; y++) {
  for (let x = 0; x < MAZE_W; x++) {
    const ch = MAZE_ROWS[y][x]
    const i = x + y * MAZE_W
    if (ch === '#') CELLS[i] = CELL.WALL
    else if (ch === 'H') CELLS[i] = CELL.HOUSE
    else if (ch === '-') CELLS[i] = CELL.DOOR
    else if (ch === '.') PELLET_TEMPLATE[i] = 1
    else if (ch === 'o') PELLET_TEMPLATE[i] = 2
  }
}

export const START_PELLETS = PELLET_TEMPLATE.reduce((n, v) => n + (v ? 1 : 0), 0)

export const SPAWN = {
  X: { x: 2.5, y: 15.5, dir: 'right' },
  O: { x: 12.5, y: 15.5, dir: 'left' },
}
const DOOR_TOP = { x: 7.5, y: 6.5 }     // tile right above the house door
const HOUSE_MID = { x: 7.5, y: 8.5 }

// Three ghosts, three readable personalities (see ghostTarget).
export const GHOSTS = [
  { kind: 'chaser',  x: 7.5, y: 6.5, state: 'roam',  releaseAt: 0 },
  { kind: 'ambush',  x: 6.5, y: 8.5, state: 'house', releaseAt: 1.5 },
  { kind: 'shy',     x: 8.5, y: 8.5, state: 'house', releaseAt: 4 },
]

// ---------------------------------------------------------------------------
// Grid helpers

function wrapTx(tx) {
  return ((tx % MAZE_W) + MAZE_W) % MAZE_W
}

function wrapX(x) {
  if (x < 0) return x + MAZE_W
  if (x >= MAZE_W) return x - MAZE_W
  return x
}

export function cellAt(i) { return CELLS[i] }

export function cellIndex(x, y) {
  const tx = wrapTx(Math.floor(Number.isFinite(x) ? x : 0))
  const ty = Math.min(MAZE_H - 1, Math.max(0, Math.floor(Number.isFinite(y) ? y : 0)))
  return tx + ty * MAZE_W
}

/** Walkable by a roaming actor (munchers and ghosts outside the house). */
export function isOpen(tx, ty) {
  if (ty < 0 || ty >= MAZE_H) return false
  return CELLS[wrapTx(tx) + ty * MAZE_W] === CELL.OPEN
}

function openDir(tx, ty, dir) {
  const v = DIR_VEC[dir]
  return !!v && isOpen(tx + v.x, ty + v.y)
}

function tileDist2(ax, ay, bx, by) {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

/** Distance between two actors, taking the tunnel wrap into account. */
export function actorDist(a, b) {
  const raw = Math.abs(wrapX(a.x) - wrapX(b.x))
  const dx = Math.min(raw, MAZE_W - raw)
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function rand(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0
  return state.rng / 4294967296
}

// ---------------------------------------------------------------------------
// Movement

/**
 * Slide an actor along the lanes for `speed * dt` tiles. At every tile centre
 * it crosses, `decide(tx, ty, dir)` picks the heading to leave in (ignored if
 * that way is walled). Stops dead against a wall. Pure.
 */
function moveActor(actor, speed, dt, decide) {
  let x = actor.x
  let y = actor.y
  let dir = actor.dir
  let left = Math.max(0, speed) * Math.max(0, dt)
  for (let n = 0; n < 8 && left > 1e-9; n++) {
    const tx = Math.floor(x)
    const ty = Math.floor(y)
    const cx = tx + 0.5
    const cy = ty + 0.5
    if (Math.abs(x - cx) < 1e-6 && Math.abs(y - cy) < 1e-6) {
      x = cx
      y = cy
      const d = decide(tx, ty, dir)
      if (d && d !== dir && openDir(tx, ty, d)) dir = d
      if (!openDir(tx, ty, dir)) break
    }
    const v = DIR_VEC[dir]
    // Signed progress past the current tile's centre along `dir`.
    const off = v.x ? (x - cx) * v.x : (y - cy) * v.y
    if (off >= 0 && !openDir(tx, ty, dir)) { x = cx; y = cy; break }
    const gap = off < 0 ? -off : 1 - off
    const len = Math.min(left, gap)
    x += v.x * len
    y += v.y * len
    left -= len
    if (gap - len < 1e-9) {
      // Landed on a centre: snap away float drift so the check above matches.
      if (v.x) x = Math.round(x - 0.5) + 0.5
      else y = Math.round(y - 0.5) + 0.5
    }
    x = wrapX(x)
  }
  return { x: wrapX(x), y, dir }
}

/**
 * Advance one muncher by `dt` with a queued `want` direction. Reversing is
 * instant; a turn is taken at the next junction, or — if the junction was
 * passed by at most TURN_GRACE tiles — right away (forgiving touch/latency).
 * Pure: returns a new muncher object. Used by the sim and by the guest's
 * local prediction, so both agree exactly.
 */
export function advanceMuncher(p, want, dt) {
  const w = VALID_DIRS.has(want) ? want : p.want
  let { x, y, dir } = p
  if (w && w === OPPOSITE[dir]) {
    dir = w
  } else if (w && w !== dir) {
    const tx = Math.floor(x)
    const ty = Math.floor(y)
    const v = DIR_VEC[dir]
    const off = v.x ? (x - (tx + 0.5)) * v.x : (y - (ty + 0.5)) * v.y
    if (off > 0 && off <= TURN_GRACE && openDir(tx, ty, w)) {
      x = tx + 0.5
      y = ty + 0.5
      dir = w
    }
  }
  const speed = p.power > 0 ? POWER_SPEED : PAC_SPEED
  const moved = moveActor({ x, y, dir }, speed, dt, () => w)
  return { ...p, x: moved.x, y: moved.y, dir: moved.dir, want: w }
}

// ---------------------------------------------------------------------------
// Ghost brains

function phaseAt(clock) {
  const t = clock % (SCATTER_S + CHASE_S)
  return t < SCATTER_S ? 'scatter' : 'chase'
}

function scatterCorner(g, clock) {
  if (g.kind === 'chaser') return { x: MAZE_W, y: -1 }
  if (g.kind === 'ambush') return { x: -1, y: -1 }
  // The shy ghost alternates bottom corners each cycle so neither spawn side
  // (X bottom-left, O bottom-right) is haunted more than the other.
  const cycle = Math.floor(clock / (SCATTER_S + CHASE_S))
  return cycle % 2 === 0 ? { x: -1, y: MAZE_H } : { x: MAZE_W, y: MAZE_H }
}

/** Closest catchable muncher to (gx, gy); exact ties split by the rng. */
export function nearestMuncher(state, gx, gy) {
  let best = null
  let bestD = Infinity
  for (const side of ['X', 'O']) {
    const p = state.players[side]
    if (p.out > 0) continue
    const d = actorDist(p, { x: gx, y: gy })
    if (d < bestD - 1e-9) { bestD = d; best = p }
    else if (Math.abs(d - bestD) <= 1e-9 && best && rand(state) < 0.5) best = p
  }
  return best
}

/**
 * Chase target per personality:
 *  chaser — the nearest muncher's own tile (relentless),
 *  ambush — four tiles ahead of that muncher (cuts you off),
 *  shy    — chases from afar but backs off to its corner inside 5 tiles.
 */
export function ghostTarget(state, g) {
  if (phaseAt(state.clock) === 'scatter') return scatterCorner(g, state.clock)
  const prey = nearestMuncher(state, g.x, g.y)
  if (!prey) return scatterCorner(g, state.clock)
  if (g.kind === 'ambush') {
    const v = DIR_VEC[prey.dir] || DIR_VEC.left
    return { x: prey.x + v.x * 4, y: prey.y + v.y * 4 }
  }
  if (g.kind === 'shy' && actorDist(g, prey) < 5) return scatterCorner(g, state.clock)
  return { x: prey.x, y: prey.y }
}

function ghostOptions(tx, ty, dir) {
  const opts = DIRS.filter(d => d !== OPPOSITE[dir] && openDir(tx, ty, d))
  return opts.length ? opts : DIRS.filter(d => openDir(tx, ty, d))
}

function pickGhostDir(state, g, tx, ty, dir) {
  const options = ghostOptions(tx, ty, dir)
  if (!options.length) return dir
  if (g.fright > 0) return options[Math.floor(rand(state) * options.length)]
  const target = ghostTarget(state, g)
  let best = options[0]
  let bestD = Infinity
  for (const d of options) {
    const v = DIR_VEC[d]
    const dist = tileDist2(tx + v.x + 0.5, ty + v.y + 0.5, target.x, target.y)
    if (dist < bestD) { bestD = dist; best = d }
  }
  return best
}

// BFS first step from (sx, sy) toward (gx, gy) over open tiles.
function bfsStep(sx, sy, gx, gy, fallback) {
  const start = wrapTx(sx) + sy * MAZE_W
  const goal = wrapTx(gx) + gy * MAZE_W
  if (start === goal) return fallback
  const came = new Int16Array(CELL_COUNT).fill(-1)
  came[start] = start
  const q = [start]
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi]
    if (i === goal) break
    const x = i % MAZE_W
    const y = (i - x) / MAZE_W
    for (const d of DIRS) {
      const v = DIR_VEC[d]
      const nx = wrapTx(x + v.x)
      const ny = y + v.y
      if (!isOpen(nx, ny)) continue
      const ni = nx + ny * MAZE_W
      if (came[ni] !== -1) continue
      came[ni] = i
      q.push(ni)
    }
  }
  if (came[goal] === -1) return fallback
  let cur = goal
  while (came[cur] !== start) cur = came[cur]
  return dirBetween(start, cur) || fallback
}

function dirBetween(from, to) {
  const fx = from % MAZE_W
  const fy = (from - fx) / MAZE_W
  const tx = to % MAZE_W
  const ty = (to - tx) / MAZE_W
  if (ty === fy - 1 && tx === fx) return 'up'
  if (ty === fy + 1 && tx === fx) return 'down'
  if (ty === fy && wrapTx(tx - fx) === 1) return 'right'
  if (ty === fy && wrapTx(fx - tx) === 1) return 'left'
  return null
}

// Straight-line glide used for the scripted house exit / entry.
function glide(g, target, dist) {
  const dx = target.x - g.x
  const dy = target.y - g.y
  const len = Math.abs(dx) + Math.abs(dy)
  if (len <= dist) return { x: target.x, y: target.y, arrived: true }
  // Horizontal first, then vertical — keeps the path inside the house lanes.
  if (Math.abs(dx) > 1e-6) {
    const step = Math.min(Math.abs(dx), dist)
    const rest = dist - step
    return {
      x: g.x + Math.sign(dx) * step,
      y: g.y + (rest > 0 ? Math.sign(dy) * Math.min(Math.abs(dy), rest) : 0),
      dir: dx > 0 ? 'right' : 'left',
      arrived: false,
    }
  }
  return { x: g.x, y: g.y + Math.sign(dy) * dist, dir: dy > 0 ? 'down' : 'up', arrived: false }
}

export function ghostSpeed(g) {
  if (g.state === 'eaten') return EATEN_SPEED
  if (g.state === 'house' || g.state === 'exit' || g.state === 'enter') return HOUSE_SPEED
  return g.fright > 0 ? FRIGHT_SPEED : GHOST_SPEED
}

function moveGhost(state, g, dt) {
  if (g.state === 'house') {
    if (state.clock >= g.releaseAt) g.state = 'exit'
    return
  }
  if (g.state === 'exit' || g.state === 'enter') {
    const target = g.state === 'exit' ? DOOR_TOP : HOUSE_MID
    // Go through the house middle first on the way out.
    const via = g.state === 'exit' && Math.abs(g.x - HOUSE_MID.x) > 1e-6 ? { x: HOUSE_MID.x, y: g.y } : target
    const r = glide(g, via, ghostSpeed(g) * dt)
    g.x = r.x
    g.y = r.y
    if (r.dir) g.dir = r.dir
    if (r.arrived && via === target) {
      if (g.state === 'exit') {
        g.state = 'roam'
        g.dir = rand(state) < 0.5 ? 'left' : 'right'
      } else {
        g.state = 'exit'
      }
    }
    return
  }
  if (g.state === 'eaten') {
    const moved = moveActor(g, EATEN_SPEED, dt, (tx, ty, dir) => bfsStep(tx, ty, Math.floor(DOOR_TOP.x), Math.floor(DOOR_TOP.y), dir))
    g.x = moved.x
    g.y = moved.y
    g.dir = moved.dir
    // Home once the eyes reach the tile above the door (checked by tile, not
    // by exact position: at EATEN_SPEED one step can skip past the centre).
    if (Math.floor(g.x) === Math.floor(DOOR_TOP.x) && Math.floor(g.y) === Math.floor(DOOR_TOP.y)) {
      g.x = DOOR_TOP.x
      g.y = DOOR_TOP.y
      g.state = 'enter'
      g.fright = 0
    }
    return
  }
  const moved = moveActor(g, ghostSpeed(g), dt, (tx, ty, dir) => pickGhostDir(state, g, tx, ty, dir))
  g.x = moved.x
  g.y = moved.y
  g.dir = moved.dir
}

/** Guest-side extrapolation of a ghost from a snapshot: straight along its heading. */
export function advanceGhostDeadReckon(g, dt) {
  if (g.state !== 'roam' && g.state !== 'eaten') return g
  const moved = moveActor(g, ghostSpeed(g), dt, (_, __, dir) => dir)
  return { ...g, x: moved.x, y: moved.y, dir: moved.dir }
}

// ---------------------------------------------------------------------------
// State

function newPlayer(side) {
  const s = SPAWN[side]
  return { x: s.x, y: s.y, dir: s.dir, want: s.dir, out: 0, shield: 0, power: 0, combo: 0, life: 0 }
}

/** @param {{ rng?: number }} [opts] */
export function createState(opts = {}) {
  return {
    pellets: PELLET_TEMPLATE.slice(),
    pelletsLeft: START_PELLETS,
    players: { X: newPlayer('X'), O: newPlayer('O') },
    ghosts: GHOSTS.map((g, id) => ({
      id, kind: g.kind, x: g.x, y: g.y, dir: 'left', state: g.state, releaseAt: g.releaseAt, fright: 0,
    })),
    scoreX: 0,
    scoreO: 0,
    timeLeft: ROUND_SECONDS,
    clock: 0,
    warned: false,
    ended: false,
    rng: (opts.rng ?? 1) >>> 0,
  }
}

export function pelletsLeft(state) {
  return state.pelletsLeft
}

const other = (side) => (side === 'X' ? 'O' : 'X')

function knockOut(p) {
  p.out = RESPAWN_S
  p.power = 0
  p.combo = 0
  p.life += 1
}

// Eat whatever is on tile `idx` for `side`. Copy-on-write pellets so the
// array identity only changes when something was actually eaten (lets the
// renderer memoize the pellet layer).
function eatAt(next, side, idx, events) {
  const kind = next.pellets[idx]
  if (!kind) return
  if (next.pellets === next._srcPellets) next.pellets = next.pellets.slice()
  next.pellets[idx] = 0
  next.pelletsLeft -= 1
  const key = side === 'X' ? 'scoreX' : 'scoreO'
  if (kind === 2) {
    next[key] += POWER_PTS
    const p = next.players[side]
    p.power = POWER_S
    p.combo = 0
    for (const g of next.ghosts) {
      if (g.state === 'eaten' || g.state === 'enter') continue
      g.fright = POWER_S
      if (g.state === 'roam') g.dir = OPPOSITE[g.dir]
    }
    events.push({ type: 'power', by: side })
  } else {
    next[key] += PELLET_PTS
    events.push({ type: 'pellet', by: side })
  }
}

// Tiles between two positions on the lane grid (L-shaped if they differ on
// both axes), used to credit pellets a guest report skipped over.
function pathCells(ax, ay, bx, by) {
  const out = []
  const sx = Math.floor(ax)
  const sy = Math.floor(ay)
  const ex = Math.floor(bx)
  const ey = Math.floor(by)
  let dx = ex - sx
  if (Math.abs(dx) > MAZE_W / 2) dx -= Math.sign(dx) * MAZE_W
  const dy = ey - sy
  const tryPath = (hFirst) => {
    const cells = []
    let x = sx
    let y = sy
    const stepX = () => { for (let i = 0; i < Math.abs(dx); i++) { x = wrapTx(x + Math.sign(dx)); cells.push([x, y]) } }
    const stepY = () => { for (let i = 0; i < Math.abs(dy); i++) { y += Math.sign(dy); cells.push([x, y]) } }
    if (hFirst) { stepX(); stepY() } else { stepY(); stepX() }
    return cells.every(([cx, cy]) => isOpen(cx, cy)) ? cells : null
  }
  const cells = tryPath(true) || tryPath(false) || []
  for (const [x, y] of cells) out.push(x + y * MAZE_W)
  return out
}

/**
 * Adopt a guest's self-reported muncher position ({x, y, dir, want, life}).
 * Rejected when stale (a different life), off the lanes, or a jump longer
 * than MAX_REMOTE_JUMP — the guest then resyncs from the next snapshot.
 * Mutates `next` (a step-local copy). Returns true when applied.
 */
function applyRemote(next, side, rep, events) {
  const p = next.players[side]
  if (p.out > 0 || !rep || rep.life !== p.life) return false
  const { x, y } = rep
  if (!Number.isFinite(x) || !Number.isFinite(y) || y < 0 || y >= MAZE_H) return false
  const wx = wrapX(x)
  const onLaneX = Math.abs(wx - Math.floor(wx) - 0.5) < 0.02
  const onLaneY = Math.abs(y - Math.floor(y) - 0.5) < 0.02
  if (!onLaneX && !onLaneY) return false
  if (!isOpen(Math.floor(wx), Math.floor(y))) return false
  if (actorDist(p, { x: wx, y }) > MAX_REMOTE_JUMP) return false
  for (const idx of pathCells(p.x, p.y, wx, y)) eatAt(next, side, idx, events)
  p.x = wx
  p.y = y
  if (VALID_DIRS.has(rep.dir)) p.dir = rep.dir
  if (VALID_DIRS.has(rep.want)) p.want = rep.want
  return true
}

/**
 * Advance the simulation. Pure: never mutates `state`.
 * `inputs[side]` is either a direction string (queue a turn) or, for a
 * remote-authoritative guest, a position report `{x, y, dir, want, life}`.
 */
export function step(state, inputs, dt) {
  if (state.ended) return { state, events: [] }
  const events = []
  const next = {
    ...state,
    _srcPellets: state.pellets,
    players: { X: { ...state.players.X }, O: { ...state.players.O } },
    ghosts: state.ghosts.map(g => ({ ...g })),
  }

  next.clock = state.clock + dt
  next.timeLeft = Math.max(0, state.timeLeft - dt)
  if (!state.warned && next.timeLeft <= WARNING_AT) {
    next.warned = true
    events.push({ type: 'warn' })
  }

  // 1. Munchers: timers, respawn, steering, movement.
  const arrived = {}
  for (const side of ['X', 'O']) {
    const p = next.players[side]
    const input = inputs?.[side]
    if (p.out > 0) {
      p.out = Math.max(0, p.out - dt)
      if (p.out === 0) {
        const s = SPAWN[side]
        Object.assign(p, { x: s.x, y: s.y, dir: s.dir, want: s.dir, shield: SHIELD_S })
        events.push({ type: 'respawn', by: side })
      }
      continue
    }
    p.shield = Math.max(0, p.shield - dt)
    p.power = Math.max(0, p.power - dt)
    if (input && typeof input === 'object') applyRemote(next, side, input, events)
    const want = typeof input === 'string' ? input : p.want
    Object.assign(p, advanceMuncher(p, want, dt))
    arrived[side] = cellIndex(p.x, p.y)
  }

  // 2. Pellets. A same-tick tie on one tile goes to a fair coin, not to
  // whichever side iterates first (that would be a structural host edge).
  const tie = arrived.X != null && arrived.X === arrived.O && next.pellets[arrived.X]
  const first = tie && rand(next) < 0.5 ? 'O' : 'X'
  for (const side of [first, other(first)]) {
    if (arrived[side] != null) eatAt(next, side, arrived[side], events)
  }

  // 3. Ghosts.
  for (const g of next.ghosts) {
    if (g.fright > 0) g.fright = Math.max(0, g.fright - dt)
    moveGhost(next, g, dt)
  }

  // 4. Collisions: ghosts first, then muncher-vs-muncher.
  for (const g of next.ghosts) {
    if (g.state !== 'roam' && g.state !== 'exit') continue
    const hits = ['X', 'O'].filter(side => {
      const p = next.players[side]
      return p.out === 0 && actorDist(p, g) < HIT_DIST
    })
    if (!hits.length) continue
    if (g.fright > 0) {
      const side = hits.length === 2 ? (rand(next) < 0.5 ? 'X' : 'O') : hits[0]
      const p = next.players[side]
      next[side === 'X' ? 'scoreX' : 'scoreO'] += GHOST_PTS[Math.min(p.combo, GHOST_PTS.length - 1)]
      p.combo += 1
      g.state = 'eaten'
      g.fright = 0
      events.push({ type: 'eatGhost', by: side })
    } else {
      for (const side of hits) {
        const p = next.players[side]
        if (p.shield > 0) continue
        knockOut(p)
        events.push({ type: 'die', by: side })
      }
    }
  }

  const X = next.players.X
  const O = next.players.O
  if (X.out === 0 && O.out === 0 && actorDist(X, O) < HIT_DIST) {
    const hunter = X.power > 0 && O.power <= 0 ? 'X' : O.power > 0 && X.power <= 0 ? 'O' : null
    const prey = hunter && next.players[other(hunter)]
    if (hunter && prey.shield <= 0) {
      next[hunter === 'X' ? 'scoreX' : 'scoreO'] += RIVAL_PTS
      knockOut(prey)
      events.push({ type: 'eatRival', by: hunter })
    }
  }

  if (next.pelletsLeft <= 0 || next.timeLeft <= 0) {
    next.ended = true
    events.push({ type: 'end' })
  }

  delete next._srcPellets
  return { state: next, events }
}

export function getWinner(state) {
  if (!state.ended) return null
  if (state.scoreX > state.scoreO) return 'X'
  if (state.scoreO > state.scoreX) return 'O'
  return 'draw'
}

// ---------------------------------------------------------------------------
// Demo bot

// Multi-source BFS: distance (in tiles) from any source to every open tile.
function distanceMap(sources, maxDepth = Infinity) {
  const dist = new Int16Array(CELL_COUNT).fill(-1)
  const q = []
  for (const i of sources) {
    if (dist[i] === -1) { dist[i] = 0; q.push(i) }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi]
    if (dist[i] >= maxDepth) continue
    const x = i % MAZE_W
    const y = (i - x) / MAZE_W
    for (const d of DIRS) {
      const v = DIR_VEC[d]
      const nx = wrapTx(x + v.x)
      const ny = y + v.y
      if (!isOpen(nx, ny)) continue
      const ni = nx + ny * MAZE_W
      if (dist[ni] !== -1) continue
      dist[ni] = dist[i] + 1
      q.push(ni)
    }
  }
  return dist
}

/**
 * Demo bot: step toward the nearest goal (prey when powered or ghosts are
 * frightened, else pellets) while keeping away from anything that can catch
 * it. `mistake` (0–1) occasionally picks a random legal direction.
 */
export function computeAI(state, side, { mistake = 0 } = {}) {
  const me = state.players[side]
  if (me.out > 0) return me.dir
  const rival = state.players[other(side)]
  const tx = Math.floor(me.x)
  const ty = Math.floor(me.y)
  const options = DIRS.filter(d => openDir(tx, ty, d))
  if (!options.length) return me.dir
  const r = { rng: (state.rng ^ Math.floor(state.clock * 997)) >>> 0 }
  if (mistake > 0 && rand(r) < mistake) return options[Math.floor(rand(r) * options.length)]

  const dangers = []
  const prey = []
  for (const g of state.ghosts) {
    if (g.state !== 'roam' && g.state !== 'exit') continue
    const idx = cellIndex(g.x, g.y)
    if (g.fright > 1) prey.push(idx)
    else dangers.push(idx)
  }
  if (rival.out === 0) {
    if (rival.power > 0.5 && me.power <= 0) dangers.push(cellIndex(rival.x, rival.y))
    else if (me.power > 1 && rival.power <= 0 && rival.shield <= 0) prey.push(cellIndex(rival.x, rival.y))
  }

  const danger = distanceMap(dangers, 8)
  let goals = prey
  if (!goals.length) {
    goals = []
    // With a hunter close by, only power pellets count as goals.
    const here = danger[cellIndex(me.x, me.y)]
    const scared = here !== -1 && here <= 4
    for (let i = 0; i < CELL_COUNT; i++) {
      if (state.pellets[i] === 2 || (!scared && state.pellets[i] === 1)) goals.push(i)
    }
    if (!goals.length) for (let i = 0; i < CELL_COUNT; i++) if (state.pellets[i]) goals.push(i)
  }
  const goal = distanceMap(goals)

  let best = options[0]
  let bestScore = -Infinity
  for (const d of options) {
    const v = DIR_VEC[d]
    const ni = wrapTx(tx + v.x) + (ty + v.y) * MAZE_W
    const g = goal[ni] === -1 ? 99 : goal[ni]
    const dd = danger[ni] === -1 ? 99 : danger[ni]
    let score = -g
    if (dd <= 3) score -= (4 - dd) * 25
    if (d === me.dir) score += 0.5 // mild momentum: avoid dithering on ties
    if (score > bestScore) { bestScore = score; best = d }
  }
  return best
}

// ---------------------------------------------------------------------------
// Wire helpers

/** 2-bit pack: 0 empty / 1 pellet / 2 power. */
export function packPellets(pellets) {
  const packed = new Uint8Array(Math.ceil(CELL_COUNT / 4))
  for (let i = 0; i < CELL_COUNT; i++) packed[i >> 2] |= (pellets[i] & 3) << ((i & 3) * 2)
  return packed
}

export function unpackPellets(packed) {
  const pellets = new Uint8Array(CELL_COUNT)
  for (let i = 0; i < CELL_COUNT; i++) pellets[i] = ((packed[i >> 2] || 0) >> ((i & 3) * 2)) & 3
  return pellets
}

export function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes))
}

export function base64ToBytes(str) {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
