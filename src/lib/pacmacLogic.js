// Pure PAC MAC simulation — no DOM, no network, no React. Two munchers race
// for shared pellets on an original maze while four AI ghosts hunt both.
// Host-authoritative in multiplayer; /demo runs this vs computeAI.

export const MAZE_W = 19
export const MAZE_H = 19
export const CELL_COUNT = MAZE_W * MAZE_H
export const SPEED = 5.2                  // muncher tiles/sec
export const GHOST_SPEED = 5.45
export const FRIGHT_SPEED = 3.9
export const EATEN_SPEED = 8
export const MATCH_SECONDS = 90
export const MATCH_TARGET = 3
export const PELLET_PTS = 10
export const POWER_PTS = 50
export const GHOST_PTS = [200, 400, 800, 1600]
export const FRIGHT_S = 6
export const RESPAWN_S = 2.2
export const SCATTER_S = 7
export const CHASE_S = 20
export const HIT_DIST = 0.5
export const WARNING_AT = 10

export const AI_DIFFICULTIES = {
  easy:   { replanMs: 700 },
  normal: { replanMs: 420 },
  hard:   { replanMs: 280 },
}

const EPS = 0.04
const DIR_VEC = {
  up:    { x: 0, y: -1 },
  down:  { x: 0, y: 1 },
  left:  { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}
const VALID_DIRS = new Set(Object.keys(DIR_VEC))
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }
const DIRS = ['up', 'down', 'left', 'right']

// Original 19×19 maze. # wall  . pellet  o power  H ghost-only  space empty.
export const MAZE_ROWS = [
  '###################',
  '#o.....#...#.....o#',
  '#.###.#.#.#.#.###.#',
  '#.#.....#.#.....#.#',
  '#.#.###.#.#.###.#.#',
  '#.......#.#.......#',
  '###.#.#######.#.###',
  '#...#....#....#...#',
  '#.###.##   ##.###.#',
  '     .# HHH #.     ',
  '#.###.##   ##.###.#',
  '#...#....#....#...#',
  '###.#.#######.#.###',
  '#.......#.#.......#',
  '#.#.###.#.#.###.#.#',
  '#.#.....#.#.....#.#',
  '#.###.#.#.#.#.###.#',
  '#o.....#...#.....o#',
  '###################',
]

if (MAZE_ROWS.length !== MAZE_H || MAZE_ROWS.some(r => r.length !== MAZE_W)) {
  throw new Error('PAC MAC maze dimensions mismatch')
}

const WALLS = new Uint8Array(CELL_COUNT)   // 1 wall, 2 house
const PELLET_TEMPLATE = new Uint8Array(CELL_COUNT) // 1 pellet, 2 power
let PELLET_START_COUNT = 0

for (let y = 0; y < MAZE_H; y++) {
  for (let x = 0; x < MAZE_W; x++) {
    const ch = MAZE_ROWS[y][x]
    const i = x + y * MAZE_W
    if (ch === '#') WALLS[i] = 1
    else if (ch === 'H') WALLS[i] = 2
    else if (ch === '.') { PELLET_TEMPLATE[i] = 1; PELLET_START_COUNT++ }
    else if (ch === 'o') { PELLET_TEMPLATE[i] = 2; PELLET_START_COUNT++ }
  }
}

export const START_PELLETS = PELLET_START_COUNT

const SPAWN = {
  X: { x: 3.5, y: 17.5, dir: 'right' },
  O: { x: 15.5, y: 17.5, dir: 'left' },
}
const HOUSE = { x: 9.5, y: 9.5 }
const GHOST_SPAWNS = [
  { x: 9.5, y: 8.5, dir: 'left',  corner: { x: 1.5, y: 1.5 } },
  { x: 8.5, y: 9.5, dir: 'up',    corner: { x: 17.5, y: 1.5 } },
  { x: 9.5, y: 9.5, dir: 'up',    corner: { x: 1.5, y: 17.5 } },
  { x: 10.5, y: 9.5, dir: 'up',   corner: { x: 17.5, y: 17.5 } },
]

export function cellIndex(x, y) {
  const tx = wrapTx(Math.floor(Number.isFinite(x) ? x : 0))
  const ty = clampInt(Math.floor(Number.isFinite(y) ? y : 0), 0, MAZE_H - 1)
  return tx + ty * MAZE_W
}

export function isWall(tx, ty, ghost = false) {
  const x = wrapTx(tx)
  if (ty < 0 || ty >= MAZE_H) return true
  const w = WALLS[x + ty * MAZE_W]
  if (w === 1) return true
  if (w === 2 && !ghost) return true
  return false
}

export function wallAt(i) { return WALLS[i] }

function wrapTx(tx) {
  const w = MAZE_W
  return ((tx % w) + w) % w
}

function wrapX(x) {
  if (x < 0) return x + MAZE_W
  if (x >= MAZE_W) return x - MAZE_W
  return x
}

function clampInt(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

function openAhead(tx, ty, dir, ghost) {
  const v = DIR_VEC[dir]
  return !isWall(tx + v.x, ty + v.y, ghost)
}

function distToNextCenter(x, y, dir) {
  const v = DIR_VEC[dir]
  if (v.x > 0) {
    const frac = x - Math.floor(x)
    const target = frac < 0.5 - EPS ? Math.floor(x) + 0.5 : Math.floor(x) + 1.5
    return target - x
  }
  if (v.x < 0) {
    const frac = x - Math.floor(x)
    const target = frac > 0.5 + EPS ? Math.floor(x) + 0.5 : Math.floor(x) - 0.5
    return x - target
  }
  if (v.y > 0) {
    const frac = y - Math.floor(y)
    const target = frac < 0.5 - EPS ? Math.floor(y) + 0.5 : Math.floor(y) + 1.5
    return target - y
  }
  const frac = y - Math.floor(y)
  const target = frac > 0.5 + EPS ? Math.floor(y) + 0.5 : Math.floor(y) - 0.5
  return y - target
}

function nearCenter(x, y) {
  const fx = wrapX(x) - Math.floor(wrapX(x))
  const fy = y - Math.floor(y)
  return Math.abs(fx - 0.5) <= EPS && Math.abs(fy - 0.5) <= EPS
}

/**
 * Steer + slide one actor. Reverse is always legal. Other turns only at tile
 * centers, and only into an open tile. Pure: returns a new actor object.
 */
export function advanceActor(actor, want, speed, dt, ghost) {
  let x = actor.x
  let y = actor.y
  let dir = actor.dir
  let left = Math.max(0, speed) * Math.max(0, dt)
  for (let n = 0; n < 8 && left > 1e-6; n++) {
    x = wrapX(x)
    const tx = Math.floor(x)
    const ty = Math.floor(y)
    const cx = tx + 0.5
    const cy = ty + 0.5

    if (nearCenter(x, y)) {
      x = cx
      y = cy
      const tryDir = VALID_DIRS.has(want) ? want : dir
      if (openAhead(tx, ty, tryDir, ghost)) dir = tryDir
      else if (!openAhead(tx, ty, dir, ghost)) {
        return { ...actor, x: wrapX(x), y, dir, want: VALID_DIRS.has(want) ? want : actor.want }
      }
    } else if (VALID_DIRS.has(want) && OPPOSITE[dir] === want) {
      dir = want
    }

    // Hard stop before wall — don't step into blocked tile even if gap math overshoots
    if (!openAhead(tx, ty, dir, ghost)) {
      // clamp to just before wall entry (0.49 inside current tile)
      const vCheck = DIR_VEC[dir]
      if (vCheck.x > 0) x = Math.min(x, cx + 0.49)
      else if (vCheck.x < 0) x = Math.max(x, cx - 0.49)
      else if (vCheck.y > 0) y = Math.min(y, cy + 0.49)
      else if (vCheck.y < 0) y = Math.max(y, cy - 0.49)
      return { ...actor, x: wrapX(x), y, dir, want: VALID_DIRS.has(want) ? want : actor.want }
    }

    const v = DIR_VEC[dir]
    const gap = distToNextCenter(x, y, dir)
    const step = Math.min(left, Math.max(gap, 1e-6))
    x = wrapX(x + v.x * step)
    y += v.y * step
    left -= step
  }
  return {
    ...actor,
    x: wrapX(x),
    y,
    dir,
    want: VALID_DIRS.has(want) ? want : actor.want,
  }
}

function copyPlayer(p) {
  return { x: p.x, y: p.y, dir: p.dir, want: p.want, dead: p.dead, combo: p.combo }
}

function copyGhost(g) {
  return {
    x: g.x, y: g.y, dir: g.dir, mode: g.mode,
    corner: g.corner, frightLeft: g.frightLeft,
  }
}

function nextPhase(clock) {
  // scatter 7s, chase 20s, repeat
  const cycle = SCATTER_S + CHASE_S
  const t = clock % cycle
  return t < SCATTER_S ? 'scatter' : 'chase'
}

function ghostSpeed(g) {
  if (g.mode === 'eaten') return EATEN_SPEED
  if (g.mode === 'frightened') return FRIGHT_SPEED
  return GHOST_SPEED
}

function pickGhostDir(state, g, target) {
  const tx = Math.floor(wrapX(g.x))
  const ty = Math.floor(g.y)
  const ghost = true
  let options = DIRS.filter(d => d !== OPPOSITE[g.dir] && openAhead(tx, ty, d, ghost))
  if (options.length === 0) options = DIRS.filter(d => openAhead(tx, ty, d, ghost))
  if (options.length === 0) return g.dir

  if (g.mode === 'frightened') {
    const r = rand(state)
    return options[Math.floor(r * options.length)]
  }

  let best = options[0]
  let bestD = Infinity
  for (const d of options) {
    const v = DIR_VEC[d]
    const nx = wrapTx(tx + v.x) + 0.5
    const ny = ty + v.y + 0.5
    const dist = Math.abs(nx - target.x) + Math.abs(ny - target.y)
    if (dist < bestD) { bestD = dist; best = d }
  }
  return best
}

function nearestMuncher(state, gx, gy) {
  let best = state.players.X
  let bestD = Infinity
  for (const side of ['X', 'O']) {
    const p = state.players[side]
    if (p.dead > 0) continue
    const d = Math.abs(wrapX(p.x) - gx) + Math.abs(p.y - gy)
    if (d < bestD) { bestD = d; best = p }
  }
  return best
}

function rand(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0
  return state.rng / 4294967296
}

function countPellets(pellets) {
  let n = 0
  for (let i = 0; i < pellets.length; i++) if (pellets[i]) n++
  return n
}

export function pelletsLeft(state) {
  return countPellets(state.pellets)
}

/**
 * @param {{ rng?: number }} [opts]
 */
export function createState(opts = {}) {
  const pellets = PELLET_TEMPLATE.slice()
  return {
    pellets,
    players: {
      X: { ...SPAWN.X, want: 'right', dead: 0, combo: 0 },
      O: { ...SPAWN.O, want: 'left', dead: 0, combo: 0 },
    },
    ghosts: GHOST_SPAWNS.map(s => ({
      x: s.x, y: s.y, dir: s.dir, mode: 'scatter',
      corner: s.corner, frightLeft: 0,
    })),
    scoreX: 0,
    scoreO: 0,
    timeLeft: MATCH_SECONDS,
    phaseClock: 0,
    warned: false,
    ended: false,
    rng: opts.rng ?? 1,
  }
}

function frightenAll(ghosts) {
  return ghosts.map(g => {
    if (g.mode === 'eaten') return copyGhost(g)
    return {
      ...copyGhost(g),
      mode: 'frightened',
      frightLeft: FRIGHT_S,
      dir: OPPOSITE[g.dir] && openAhead(Math.floor(g.x), Math.floor(g.y), OPPOSITE[g.dir], true)
        ? OPPOSITE[g.dir]
        : g.dir,
    }
  })
}

/**
 * Advance the simulation. Pure: never mutates `state`.
 * @param {object} state
 * @param {{X?: string, O?: string}} inputs  direction changes; omit keeps want
 * @param {number} dt seconds
 */
export function step(state, inputs, dt) {
  if (state.ended) return { state, events: [] }
  const events = []
  const next = {
    ...state,
    pellets: state.pellets.slice(),
    players: { X: copyPlayer(state.players.X), O: copyPlayer(state.players.O) },
    ghosts: state.ghosts.map(copyGhost),
    rng: state.rng,
  }

  const timeLeft = Math.max(0, state.timeLeft - dt)
  next.timeLeft = timeLeft
  next.phaseClock = state.phaseClock + dt
  if (!state.warned && timeLeft <= WARNING_AT && state.timeLeft > WARNING_AT) {
    next.warned = true
    events.push({ type: 'go' })
  }

  const phase = nextPhase(next.phaseClock)

  for (const side of ['X', 'O']) {
    const p = next.players[side]
    const inputDir = inputs?.[side]
    if (VALID_DIRS.has(inputDir)) p.want = inputDir

    if (p.dead > 0) {
      p.dead = Math.max(0, p.dead - dt)
      if (p.dead === 0) {
        const spawn = SPAWN[side]
        p.x = spawn.x
        p.y = spawn.y
        p.dir = spawn.dir
        p.want = spawn.dir
        p.combo = 0
      }
      continue
    }

    const moved = advanceActor(p, p.want, SPEED, dt, false)
    p.x = moved.x
    p.y = moved.y
    p.dir = moved.dir
    p.want = moved.want

    const idx = cellIndex(p.x, p.y)
    const kind = next.pellets[idx]
    if (kind) {
      next.pellets[idx] = 0
      if (kind === 2) {
        next[`score${side}`] += POWER_PTS
        p.combo = 0
        next.ghosts = frightenAll(next.ghosts)
        events.push({ type: 'power', by: side })
      } else {
        next[`score${side}`] += PELLET_PTS
        events.push({ type: 'pellet', by: side })
      }
    }
  }

  for (let i = 0; i < next.ghosts.length; i++) {
    const g = next.ghosts[i]
    if (g.mode === 'frightened') {
      g.frightLeft = Math.max(0, g.frightLeft - dt)
      if (g.frightLeft === 0) g.mode = phase
    } else if (g.mode !== 'eaten') {
      g.mode = phase
    }

    let target
    if (g.mode === 'eaten') target = HOUSE
    else if (g.mode === 'scatter') target = g.corner
    else if (g.mode === 'frightened') target = g.corner
    else {
      const prey = nearestMuncher(next, g.x, g.y)
      target = { x: prey.x, y: prey.y }
    }

    const atHome = Math.abs(g.x - HOUSE.x) < 0.2 && Math.abs(g.y - HOUSE.y) < 0.2
    if (g.mode === 'eaten' && atHome) {
      g.mode = phase
      g.x = HOUSE.x
      g.y = HOUSE.y
    }

    const want = nearCenter(g.x, g.y) ? pickGhostDir(next, g, target) : g.dir
    const moved = advanceActor(g, want, ghostSpeed(g), dt, true)
    g.x = moved.x
    g.y = moved.y
    g.dir = moved.dir
  }

  for (const side of ['X', 'O']) {
    const p = next.players[side]
    if (p.dead > 0) continue
    for (const g of next.ghosts) {
      const dx = Math.min(Math.abs(wrapX(p.x) - wrapX(g.x)), MAZE_W - Math.abs(wrapX(p.x) - wrapX(g.x)))
      const dy = Math.abs(p.y - g.y)
      if (dx * dx + dy * dy > HIT_DIST * HIT_DIST) continue
      if (g.mode === 'eaten') continue
      if (g.mode === 'frightened') {
        const pts = GHOST_PTS[Math.min(p.combo, GHOST_PTS.length - 1)]
        p.combo += 1
        next[`score${side}`] += pts
        g.mode = 'eaten'
        g.frightLeft = 0
        events.push({ type: 'eatGhost', by: side })
      } else {
        p.dead = RESPAWN_S
        p.combo = 0
        events.push({ type: 'die', by: side })
        break
      }
    }
  }

  const left = countPellets(next.pellets)
  if (left === 0 || timeLeft <= 0) {
    next.ended = true
    events.push({ type: 'go' })
  }

  return { state: next, events }
}

export function getWinner(state) {
  if (!state.ended) return null
  if (state.scoreX > state.scoreO) return 'X'
  if (state.scoreO > state.scoreX) return 'O'
  return 'draw'
}

/**
 * Demo bot. Flee nearby hunters, chase frightened ghosts, else BFS to pellet.
 */
export function computeAI(state, side) {
  const me = state.players[side]
  if (me.dead > 0) return me.dir
  const tx = Math.floor(wrapX(me.x))
  const ty = Math.floor(me.y)

  let nearestGhost = null
  let huntD = Infinity
  let frightNear = null
  let frightD = Infinity
  for (const g of state.ghosts) {
    const d = Math.abs(wrapX(g.x) - me.x) + Math.abs(g.y - me.y)
    if (g.mode === 'frightened') {
      if (d < frightD) { frightNear = g; frightD = d }
    } else if (g.mode !== 'eaten' && d < huntD) {
      nearestGhost = g
      huntD = d
    }
  }

  let target
  if (nearestGhost && huntD < 4.5) {
    target = {
      x: me.x + (me.x - nearestGhost.x),
      y: me.y + (me.y - nearestGhost.y),
    }
  } else if (frightNear && frightD < 8) {
    target = { x: frightNear.x, y: frightNear.y }
  } else {
    const pelletDir = bfsPelletDir(state, tx, ty, me.dir)
    if (pelletDir) return pelletDir
    return me.dir
  }

  let best = me.dir
  let bestD = Infinity
  for (const d of DIRS) {
    if (!openAhead(tx, ty, d, false)) continue
    const v = DIR_VEC[d]
    const nx = wrapTx(tx + v.x) + 0.5
    const ny = ty + v.y + 0.5
    const dist = Math.abs(nx - target.x) + Math.abs(ny - target.y)
    if (dist < bestD) { bestD = dist; best = d }
  }
  return best
}

function bfsPelletDir(state, sx, sy, fallback) {
  const start = sx + sy * MAZE_W
  const q = [start]
  const came = new Int32Array(CELL_COUNT).fill(-2)
  came[start] = -1
  let qi = 0
  let found = -1
  while (qi < q.length) {
    const i = q[qi++]
    if (state.pellets[i]) { found = i; break }
    const x = i % MAZE_W
    const y = Math.floor(i / MAZE_W)
    for (const d of DIRS) {
      const v = DIR_VEC[d]
      const nx = wrapTx(x + v.x)
      const ny = y + v.y
      if (isWall(nx, ny, false)) continue
      const ni = nx + ny * MAZE_W
      if (came[ni] !== -2) continue
      came[ni] = i
      q.push(ni)
    }
  }
  if (found < 0) return fallback
  let cur = found
  let prev = came[cur]
  if (prev === -1) return fallback
  while (prev !== start && prev !== -1) {
    cur = prev
    prev = came[cur]
  }
  const cx = cur % MAZE_W
  const cy = Math.floor(cur / MAZE_W)
  if (wrapTx(cx - sx) === 1 || (sx === MAZE_W - 1 && cx === 0)) return 'right'
  if (wrapTx(sx - cx) === 1 || (sx === 0 && cx === MAZE_W - 1)) return 'left'
  if (cy === sy - 1) return 'up'
  if (cy === sy + 1) return 'down'
  return fallback
}

/** 2-bit pack: 0 empty / 1 pellet / 2 power. CELL_COUNT padded to multiple of 4. */
export function packPellets(pellets) {
  const n = Math.ceil(CELL_COUNT / 4)
  const packed = new Uint8Array(n)
  for (let i = 0; i < CELL_COUNT; i += 4) {
    packed[i / 4] = (pellets[i] & 3)
      | (((pellets[i + 1] || 0) & 3) << 2)
      | (((pellets[i + 2] || 0) & 3) << 4)
      | (((pellets[i + 3] || 0) & 3) << 6)
  }
  return packed
}

export function unpackPellets(packed) {
  const pellets = new Uint8Array(CELL_COUNT)
  for (let i = 0; i < CELL_COUNT; i += 4) {
    const b = packed[i / 4] || 0
    pellets[i] = b & 3
    if (i + 1 < CELL_COUNT) pellets[i + 1] = (b >> 2) & 3
    if (i + 2 < CELL_COUNT) pellets[i + 2] = (b >> 4) & 3
    if (i + 3 < CELL_COUNT) pellets[i + 3] = (b >> 6) & 3
  }
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
