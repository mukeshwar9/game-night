// @ts-check
// Arrows — pure game logic. No DOM, no Firebase, no React.
//
// A board is a grid of snake-shaped arrows. Each arrow is a run of adjacent
// cells (tail → head); its heading is the direction of its last step. Tapping
// an arrow sends it sliding out along its exit route — but only when every
// cell on that route is empty. A tap on an arrow whose route is blocked by
// another arrow costs a life and the arrow stays put.
//
// Three kinds of arrow share that one rule; only the route differs:
//   • straight — a snake of orthogonal steps; the route is the straight ray
//     from its head to the board edge.
//   • diagonal — an arrow whose head points along a diagonal (`dir` 4–7); the
//     route is the diagonal ray from its head. Its body is either a straight
//     diagonal run or bent: diagonal and orthogonal steps in a smooth arc,
//     drawn as a curve. The bend only shapes the body behind the neck — the
//     route is the same straight ray either way. Only cells on that diagonal
//     block it, plus another diagonal arrow whose body takes a diagonal step
//     across the route at a cell corner (one arrow can never fly through
//     another's line).
//   • curved — a straight snake with a hook (`turn`: 1 = clockwise, -1 =
//     counter-clockwise). It flies to the board edge along its heading, turns
//     90° once there, and runs along the edge until it leaves. Its route is
//     both legs.
// Every route is fixed by the board geometry, so clearing an arrow only ever
// frees cells: a board can never become unsolvable, and a greedy solver that
// keeps clearing any free arrow decides solvability exactly.
//
// Boards are generated from a numeric seed so both players race an identical
// board without it ever touching Firebase. The generator builds arrows in an
// order where each new arrow's route avoids every earlier arrow, so removing
// them in reverse is always a solution.
//
// The geometry helpers at the bottom (`leavePose`, `roundedPathD`, …) are
// pure too: ArrowsBoard.jsx calls them each animation frame.

export const ARROWS_LIVES = 3
export const ARROWS_MATCH_TARGET = 2
export const ARROWS_MAX_ROUNDS = 3
export const ARROWS_TIERS = ['easy', 'medium', 'hard']

// Grid size, snake length and twists per tier. Widths are capped at 10
// columns so a cell stays ~35px (a comfortable thumb target) on a 390px
// phone. `samples` is how many candidate heads the generator weighs per
// arrow (more = longer routes = fewer arrows free at the start); `diag` and
// `curve` are the chances that a new arrow is diagonal or hooked, and `bend`
// is the chance that a diagonal arrow gets a curved body instead of a
// straight one.
export const ARROWS_TIER_SPECS = {
  easy: { cols: 7, rows: 9, maxLen: 5, fill: 0.84 },
  medium: { cols: 8, rows: 11, maxLen: 7, fill: 0.88, diag: 0.12, bend: 0.9 },
  hard: { cols: 10, rows: 13, maxLen: 9, fill: 0.9, samples: 10, diag: 0.12, curve: 0.1, bend: 0.9 },
}

// Room setting for the race: one tier for every round, or 'mixed' — the
// original easy → medium → hard ramp across the three rounds. The host picks
// it in the waiting room (or between matches); unset means 'mixed'.
export const ARROWS_DIFFICULTIES = ['easy', 'medium', 'hard', 'mixed']
export const ARROWS_DIFFICULTY_INFO = {
  easy: { label: 'EASY', blurb: '7×9 · STRAIGHT ARROWS' },
  medium: { label: 'MEDIUM', blurb: '8×11 · + CURVY DIAGONALS' },
  hard: { label: 'HARD', blurb: '10×13 · + HOOKED TURNS' },
  mixed: { label: 'MIXED', blurb: 'EASY → MEDIUM → HARD' },
}
export const getArrowsDifficulty = (id) => (ARROWS_DIFFICULTIES.includes(id) ? id : 'mixed')

// (dx, dy) in grid space (y grows downward): up, right, down, left, then the
// diagonals up-right, down-right, down-left, up-left.
export const ARROWS_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]
export const ARROWS_DIR_NAMES = ['up', 'right', 'down', 'left', 'up-right', 'down-right', 'down-left', 'up-left']

export const isDiagonal = (arrow) => arrow.dir >= 4
export const isCurved = (arrow) => arrow.dir < 4 && (arrow.turn === 1 || arrow.turn === -1)
// A diagonal arrow whose body is not one straight diagonal run: at least one
// step of it differs from the heading.
export const isBent = (arrow) => {
  if (arrow.dir < 4) return false
  const [dx, dy] = ARROWS_DIRS[arrow.dir]
  for (let k = 1; k < arrow.cells.length; k += 1) {
    if (arrow.cells[k][0] - arrow.cells[k - 1][0] !== dx || arrow.cells[k][1] - arrow.cells[k - 1][1] !== dy) return true
  }
  return false
}
// The heading a curved arrow takes after its turn at the edge.
export const turnedDir = (dir, turn) => (dir + (turn === 1 ? 1 : 3)) % 4

// Small, fast, deterministic PRNG (mulberry32). Same seed → same sequence on
// every client.
export function seededRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomArrowsSeed(rng = Math.random) {
  return Math.floor(rng() * 2147483647) + 1
}

export function tierForRound(round) {
  return ARROWS_TIERS[Math.min(Math.max(round ?? 0, 0), ARROWS_TIERS.length - 1)]
}

// The tier a race round plays at for a room difficulty. Rooms without one
// (older rooms, or 'mixed') ramp easy → medium → hard by round.
export function tierForGame(difficulty, round) {
  return ARROWS_TIER_SPECS[difficulty] ? difficulty : tierForRound(round)
}

function shuffled(list, rng) {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Cells strictly ahead of (x, y) along `dir`, up to the board edge.
function rayCells(cols, rows, x, y, dir) {
  const [dx, dy] = ARROWS_DIRS[dir]
  const out = []
  let cx = x + dx
  let cy = y + dy
  while (cx >= 0 && cx < cols && cy >= 0 && cy < rows) {
    out.push(cy * cols + cx)
    cx += dx
    cy += dy
  }
  return out
}

// Index of the lattice point shared by the four cells around a diagonal step
// between cells a and b — two diagonal lines through the same corner cross.
// Corners live on a (cols + 1) × (rows + 1) lattice.
function cornerOf(cols, a, b) {
  const ax = a % cols
  const ay = Math.floor(a / cols)
  const bx = b % cols
  const by = Math.floor(b / cols)
  return Math.max(ay, by) * (cols + 1) + Math.max(ax, bx)
}

// Is the step between adjacent cells a and b diagonal (not orthogonal)?
function isDiagStep(cols, a, b) {
  return a % cols !== b % cols && Math.floor(a / cols) !== Math.floor(b / cols)
}

// The exit route of an arrow whose head is cell `head`: { cells, corners,
// finalDir }. `cells` lists, in travel order, every cell the head passes on
// its way off the board; `corners[k]` is the lattice corner crossed just
// before cells[k] (diagonal routes only, else -1); `finalDir` is the heading
// it leaves the board on.
function routeFrom(cols, rows, head, dir, turn) {
  const hx = head % cols
  const hy = Math.floor(head / cols)
  let cells = rayCells(cols, rows, hx, hy, dir)
  let finalDir = dir
  if (dir < 4 && (turn === 1 || turn === -1)) {
    const pivot = cells.length ? cells[cells.length - 1] : head
    finalDir = turnedDir(dir, turn)
    cells = [...cells, ...rayCells(cols, rows, pivot % cols, Math.floor(pivot / cols), finalDir)]
  }
  const corners = dir >= 4
    ? cells.map((c, k) => cornerOf(cols, k === 0 ? head : cells[k - 1], c))
    : cells.map(() => -1)
  return { cells, corners, finalDir }
}

// Routes are pure functions of board size + arrow, cached per arrow object.
const routeCache = new WeakMap()

export function arrowRoute(level, arrow) {
  const hit = routeCache.get(arrow)
  if (hit && hit.cols === level.cols && hit.rows === level.rows) return hit.route
  const [hx, hy] = arrow.cells[arrow.cells.length - 1]
  const route = routeFrom(level.cols, level.rows, hy * level.cols + hx, arrow.dir, arrow.turn)
  routeCache.set(arrow, { cols: level.cols, rows: level.rows, route })
  return route
}

function routeBlocked(route, occ, corners) {
  for (let k = 0; k < route.cells.length; k += 1) {
    if (route.corners[k] >= 0 && corners[route.corners[k]] !== -1) return true
    if (occ[route.cells[k]] !== -1) return true
  }
  return false
}

// Try to grow one orthogonal arrow with its head at `head` pointing `dir`.
// The body walks backwards from the head, never into an occupied cell or into
// its own exit route (an arrow may not block itself). Returns cell indexes
// tail → head, or null when the neck cell is unavailable.
function growArrow(spec, occ, head, dir, rng, banned) {
  const { cols, rows, maxLen } = spec
  const hx = head % cols
  const hy = Math.floor(head / cols)
  const [dx, dy] = ARROWS_DIRS[dir]
  const nx = hx - dx
  const ny = hy - dy
  if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return null
  const neck = ny * cols + nx
  if (occ[neck] !== -1 || banned.has(neck)) return null

  const target = 2 + Math.floor(rng() * (maxLen - 1))
  const path = [head, neck]
  const used = new Set(path)
  // Backward heading = opposite of the exit direction.
  let back = (dir + 2) % 4
  while (path.length < target) {
    const cur = path[path.length - 1]
    const cx = cur % cols
    const cy = Math.floor(cur / cols)
    const straight = rng() < 0.45
    const order = straight
      ? [back, ...shuffled([(back + 1) % 4, (back + 3) % 4], rng)]
      : [...shuffled([(back + 1) % 4, (back + 3) % 4], rng), back]
    let placed = false
    for (const d of order) {
      const [ddx, ddy] = ARROWS_DIRS[d]
      const x = cx + ddx
      const y = cy + ddy
      if (x < 0 || x >= cols || y < 0 || y >= rows) continue
      const c = y * cols + x
      if (occ[c] !== -1 || banned.has(c) || used.has(c)) continue
      path.push(c)
      used.add(c)
      back = d
      placed = true
      break
    }
    if (!placed) break
  }
  return path.reverse()
}

// A curved arrow is a straight run (2–3 cells) so its hook reads cleanly.
function growStraight(spec, occ, head, dir, rng, banned) {
  const { cols, rows } = spec
  const [dx, dy] = ARROWS_DIRS[dir]
  const target = 2 + Math.floor(rng() * 2)
  const path = [head]
  let x = head % cols
  let y = Math.floor(head / cols)
  while (path.length < target) {
    x -= dx
    y -= dy
    if (x < 0 || x >= cols || y < 0 || y >= rows) break
    const c = y * cols + x
    if (occ[c] !== -1 || banned.has(c)) break
    path.push(c)
  }
  return path.length >= 2 ? path.reverse() : null
}

// A diagonal arrow is a straight diagonal run (2–4 cells). Its body may not
// cross another diagonal body at a cell corner.
function growDiagonal(spec, occ, corners, head, dir, rng, banned) {
  const { cols, rows, maxLen } = spec
  const [dx, dy] = ARROWS_DIRS[dir]
  const target = 2 + Math.floor(rng() * (Math.min(maxLen, 4) - 1))
  const path = [head]
  let x = head % cols
  let y = Math.floor(head / cols)
  while (path.length < target) {
    x -= dx
    y -= dy
    if (x < 0 || x >= cols || y < 0 || y >= rows) break
    const c = y * cols + x
    if (occ[c] !== -1 || banned.has(c)) break
    if (corners[cornerOf(cols, c, path[path.length - 1])] !== -1) break
    path.push(c)
  }
  return path.length >= 2 ? path.reverse() : null
}

// The eight headings in clockwise order (up, up-right, right, …) so a body
// can turn by ±45° per step and read as a smooth arc.
const DIR_RING = [0, 4, 1, 5, 2, 6, 3, 7]
const RING_POS = DIR_RING.reduce((acc, d, i) => { acc[d] = i; return acc }, /** @type {number[]} */ ([]))

// A curved-body diagonal arrow: the neck sits straight behind the head (so the
// head still points along its diagonal), then the body walks backwards,
// turning ±45° per step in one sense so it curls like a hook or a spiral
// instead of zig-zagging. Orthogonal and diagonal steps mix. The body may not
// cross itself, an earlier diagonal body, or its own exit route at a cell
// corner (`routeCorners`). Returns cells tail → head, or null when no bend
// fits (callers fall back to a straight run).
function growBentDiagonal(spec, occ, corners, head, dir, rng, banned, routeCorners) {
  const { cols, rows, maxLen } = spec
  const cap = Math.min(maxLen, 5)
  if (cap < 3) return null
  const target = 3 + Math.floor(rng() * (cap - 2))
  const sense = rng() < 0.5 ? 1 : -1
  const path = [head]
  const used = new Set(path)
  const own = new Set()
  const room = (x, y) => x >= 0 && x < cols && y >= 0 && y < rows
  let x = head % cols
  let y = Math.floor(head / cols)
  let back = (RING_POS[dir] + 4) % 8
  let bent = false
  for (let step = 0; path.length < target; step += 1) {
    // The neck must continue the heading; later steps prefer to keep turning.
    const turns = step === 0 ? [0] : rng() < 0.7 ? [sense, 0] : [0, sense]
    let placed = false
    for (const t of turns) {
      const pos = (back + t + 8) % 8
      const [sx, sy] = ARROWS_DIRS[DIR_RING[pos]]
      const nx = x + sx
      const ny = y + sy
      if (!room(nx, ny)) continue
      const c = ny * cols + nx
      if (occ[c] !== -1 || banned.has(c) || used.has(c)) continue
      if (sx !== 0 && sy !== 0) {
        const corner = cornerOf(cols, path[path.length - 1], c)
        if (corners[corner] !== -1 || own.has(corner) || routeCorners.has(corner)) continue
        own.add(corner)
      }
      path.push(c)
      used.add(c)
      if (t !== 0) bent = true
      back = pos
      x = nx
      y = ny
      placed = true
      break
    }
    if (!placed) break
  }
  return bent && path.length >= 3 ? path.reverse() : null
}

// Normalise a tier name or a custom spec object (the solo levels pass one)
// into a full generator spec.
function resolveSpec(tier) {
  if (tier && typeof tier === 'object') {
    return { samples: 8, diag: 0, curve: 0, bend: 0, ...tier, name: tier.name ?? 'custom' }
  }
  const name = ARROWS_TIER_SPECS[tier] ? tier : 'easy'
  return { samples: 8, diag: 0, curve: 0, bend: 0, ...ARROWS_TIER_SPECS[name], name }
}

// Deterministically generate the board for `seed` at `tier` (a tier name or
// a spec object like ARROWS_TIER_SPECS' entries).
// Returns { seed, tier, cols, rows, arrows: [{ cells: [[x, y], …], dir, turn? }] }.
/**
 * @param {number} seed
 * @param {string | Record<string, any>} [tier]
 */
export function generateArrowsLevel(seed, tier = 'easy') {
  const spec = resolveSpec(tier)
  const { cols, rows, fill, samples, diag, curve, bend } = spec
  const rng = seededRng(seed)
  const occ = new Int16Array(cols * rows).fill(-1)
  const corners = new Int16Array((cols + 1) * (rows + 1)).fill(-1)
  const arrows = []
  // Boards without twists draw no extra random numbers, so their seeds keep
  // producing the same boards they always did.
  const twisty = diag + curve > 0
  let filled = 0
  let fails = 0
  const goal = Math.floor(cols * rows * fill)

  while (filled < goal && fails < 600) {
    const empty = []
    for (let i = 0; i < occ.length; i += 1) if (occ[i] === -1) empty.push(i)
    if (empty.length === 0) break
    let kind = 'straight'
    if (twisty) {
      const r = rng()
      kind = r < diag ? 'diag' : r < diag + curve ? 'curve' : 'straight'
    }
    // Sample a few candidate heads and keep the one with the longest exit
    // route: long routes get crossed by later arrows, which is what makes a
    // board a puzzle instead of a free-for-all.
    let pick = null
    let best = -1
    for (let k = 0; k < samples; k += 1) {
      const head = empty[Math.floor(rng() * empty.length)]
      const dirs = kind === 'diag' ? [4, 5, 6, 7] : [0, 1, 2, 3]
      for (const d of shuffled(dirs, rng)) {
        const turn = kind === 'curve' ? (rng() < 0.5 ? 1 : -1) : undefined
        const route = routeFrom(cols, rows, head, d, turn)
        if (route.cells.length <= best) continue
        // A curve must have somewhere to run after its turn (not a corner),
        // or its hook would mean nothing.
        if (kind === 'curve' && route.cells.length === rayCells(cols, rows, head % cols, Math.floor(head / cols), d).length) continue
        // The exit route must avoid every earlier arrow — that is what keeps
        // the board solvable (later arrows leave first).
        if (routeBlocked(route, occ, corners)) continue
        const banned = new Set(route.cells)
        let grown = null
        if (kind === 'diag') {
          if (bend > 0 && rng() < bend) {
            const routeCorners = new Set(route.corners.filter((c) => c >= 0))
            for (let tries = 0; tries < 4 && !grown; tries += 1) {
              grown = growBentDiagonal(spec, occ, corners, head, d, rng, banned, routeCorners)
            }
          }
          grown ??= growDiagonal(spec, occ, corners, head, d, rng, banned)
        } else {
          grown = kind === 'curve'
            ? growStraight(spec, occ, head, d, rng, banned)
            : growArrow(spec, occ, head, d, rng, banned)
        }
        if (grown) { pick = { path: grown, dir: d, turn }; best = route.cells.length }
      }
    }
    if (!pick) { fails += 1; continue }
    const index = arrows.length
    const { path } = pick
    for (const c of path) occ[c] = index
    if (pick.dir >= 4) {
      for (let k = 1; k < path.length; k += 1) {
        if (isDiagStep(cols, path[k - 1], path[k])) corners[cornerOf(cols, path[k - 1], path[k])] = index
      }
    }
    filled += path.length
    const arrow = { cells: path.map((c) => [c % cols, Math.floor(c / cols)]), dir: pick.dir }
    if (pick.turn) arrow.turn = pick.turn
    arrows.push(arrow)
  }

  return { seed, tier: spec.name, cols, rows, arrows }
}

// Cell → arrow-index map of the arrows still on the board (-1 = empty).
export function occupancy(level, gone) {
  const occ = new Int16Array(level.cols * level.rows).fill(-1)
  level.arrows.forEach((a, i) => {
    if (gone[i]) return
    for (const [x, y] of a.cells) occ[y * level.cols + x] = i
  })
  return occ
}

// Lattice-corner → arrow-index map of the diagonal body steps still on the
// board (-1 = none). Orthogonal steps of a bent body cross no corner.
export function cornerOccupancy(level, gone) {
  const { cols } = level
  const map = new Int16Array((cols + 1) * (level.rows + 1)).fill(-1)
  level.arrows.forEach((a, i) => {
    if (gone[i] || a.dir < 4) return
    for (let k = 1; k < a.cells.length; k += 1) {
      const [px, py] = a.cells[k - 1]
      const [x, y] = a.cells[k]
      if (px !== x && py !== y) map[cornerOf(cols, py * cols + px, y * cols + x)] = i
    }
  })
  return map
}

// Which remaining arrow sits on cell (x, y)? -1 when empty or off-board.
export function arrowAtCell(level, gone, x, y) {
  if (x < 0 || x >= level.cols || y < 0 || y >= level.rows) return -1
  return occupancy(level, gone)[y * level.cols + x]
}

function checkAgainst(level, occ, corners, index) {
  const route = arrowRoute(level, level.arrows[index])
  for (let k = 0; k < route.cells.length; k += 1) {
    const corner = route.corners[k]
    if (corner >= 0 && corners[corner] !== -1 && corners[corner] !== index) {
      return { free: false, blocker: corners[corner], gap: k }
    }
    const owner = occ[route.cells[k]]
    if (owner !== -1) return { free: false, blocker: owner, gap: k }
  }
  return { free: true, blocker: -1, gap: route.cells.length }
}

// Route check for arrow `index`: { free, blocker, gap } where `gap` is the
// number of empty route cells between its head and the first blocker (or
// the edge).
export function exitCheck(level, gone, index) {
  return checkAgainst(level, occupancy(level, gone), cornerOccupancy(level, gone), index)
}

// Apply a tap on arrow `index`. Returns null for a no-op (bad index, arrow
// already gone, or no lives left); otherwise the new { gone, lives } plus the
// tap result ('cleared' | 'blocked') and, when blocked, the blocker + gap.
export function applyArrowTap(level, gone, lives, index) {
  if (!level || index < 0 || index >= level.arrows.length) return null
  if (gone[index] || lives <= 0) return null
  const check = exitCheck(level, gone, index)
  if (!check.free) {
    return { gone, lives: lives - 1, result: 'blocked', blocker: check.blocker, gap: check.gap }
  }
  const next = [...gone]
  next[index] = true
  return { gone: next, lives, result: 'cleared', blocker: -1, gap: check.gap }
}

export function countGone(gone) {
  let n = 0
  for (const g of gone) if (g) n += 1
  return n
}

export function isBoardCleared(level, gone) {
  return countGone(gone) >= level.arrows.length
}

// Arrows whose exit path is currently open (hint / bot helper).
export function freeArrows(level, gone) {
  const occ = occupancy(level, gone)
  const corners = cornerOccupancy(level, gone)
  const out = []
  level.arrows.forEach((_, i) => {
    if (!gone[i] && checkAgainst(level, occ, corners, i).free) out.push(i)
  })
  return out
}

// Solve a board greedily: clear every free arrow, repeat. Clearing only ever
// frees cells, so this decides solvability exactly. `layers` is how many
// such waves the board takes — its depth, the best single measure of how
// much look-ahead a board demands; `initialFree` is how many arrows are open
// at the start (fewer = harder to find a first move).
export function solveArrows(level) {
  const n = level.arrows.length
  let gone = Array(n).fill(false)
  const waves = []
  for (;;) {
    const free = freeArrows(level, gone)
    if (free.length === 0) break
    waves.push(free)
    gone = gone.slice()
    for (const i of free) gone[i] = true
  }
  return {
    solvable: countGone(gone) === n,
    layers: waves.length,
    initialFree: waves[0]?.length ?? 0,
    order: waves.flat(),
  }
}

// Summary used to rank boards by difficulty (solo levels, tests).
export function levelStats(level) {
  const { solvable, layers, initialFree } = solveArrows(level)
  const n = level.arrows.length
  const diagonals = level.arrows.filter(isDiagonal).length
  const curves = level.arrows.filter(isCurved).length
  const bent = level.arrows.filter(isBent).length
  // Arrow count and depth carry most of the weight; a scarce opening and
  // every twist arrow (two routes to read instead of one) add a little.
  const openness = n > 0 ? initialFree / n : 1
  const difficulty = Math.round(n * 2 + layers * 6 + (1 - openness) * 20 + diagonals * 2 + bent + curves * 3)
  return { solvable, arrows: n, layers, initialFree, diagonals, bent, curves, difficulty }
}

// Firebase stores each player's cleared arrows as a map { "12": true }; it
// deletes empty maps and may return an array for dense keys. Map by explicit
// key so a sparse read never shifts an index.
export function normalizeGone(raw, size) {
  const arr = Array(size).fill(false)
  if (!raw || typeof raw !== 'object') return arr
  for (const [k, v] of Object.entries(raw)) {
    const i = parseInt(k, 10)
    if (v && i >= 0 && i < size) arr[i] = true
  }
  return arr
}

// Round result in the race: the first player to clear their board wins; a
// player who runs out of lives loses. `null` while the round is still live.
// Clears are checked before lives so a last-tap clear always counts.
export function arrowsRoundWinner({ total, clearedX, clearedO, livesX, livesO }) {
  if (clearedX >= total) return 'X'
  if (clearedO >= total) return 'O'
  if (livesX <= 0 && livesO <= 0) return clearedX === clearedO ? 'draw' : clearedX > clearedO ? 'X' : 'O'
  if (livesX <= 0) return 'O'
  if (livesO <= 0) return 'X'
  return null
}

// ── Match flow ─────────────────────────────────────────────────────────────

// First to ARROWS_MATCH_TARGET round wins.
export function arrowsMatchWinner(scores) {
  const x = scores?.X || 0
  const o = scores?.O || 0
  if (x >= ARROWS_MATCH_TARGET) return 'X'
  if (o >= ARROWS_MATCH_TARGET) return 'O'
  return null
}

export function isFinalArrowsRound(game) {
  return (game?.arrowsRound ?? 0) >= ARROWS_MAX_ROUNDS - 1
}

// Conclusive match end for a game object: someone hit the target, or the
// final round finished (higher score wins, level scores draw). Returns
// 'X' | 'O' | 'draw' | null while the match is still live.
export function getArrowsMatchEnd(game) {
  const target = arrowsMatchWinner(game?.scores)
  if (target) return target
  if (isFinalArrowsRound(game) && game?.status === 'finished') {
    const x = game?.scores?.X || 0
    const o = game?.scores?.O || 0
    if (x === o) return 'draw'
    return x > o ? 'X' : 'O'
  }
  return null
}

function roundFields(round, rng) {
  return {
    arrowsRound: round,
    arrowsSeed: randomArrowsSeed(rng),
    arrowsStartedAt: null,
    arrowsGoneX: null,
    arrowsGoneO: null,
    arrowsLivesX: ARROWS_LIVES,
    arrowsLivesO: ARROWS_LIVES,
  }
}

// Config hook for Game.jsx's applyPlayAgain: advance easy → medium → hard.
// Returns null when the match is over (callers start a new match instead).
export function arrowsNextRound(game, rng = Math.random) {
  if (arrowsMatchWinner(game?.scores)) return null
  const round = (game?.arrowsRound ?? 0) + 1
  if (round >= ARROWS_MAX_ROUNDS) return null
  return roundFields(round, rng)
}

// Fresh round-0 state fragment (used by freshGameState in games.js).
export function arrowsFreshState(rng = Math.random) {
  return roundFields(0, rng)
}

// ── Geometry (board units: one cell = `size`) ──────────────────────────────

export function cellCenter([x, y], size) {
  return [x * size + size / 2, y * size + size / 2]
}

// Arc-length slice of a polyline between distances `from` and `to`.
export function slicePolyline(points, from, to) {
  const out = []
  let walked = 0
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1])
    const s0 = walked
    const s1 = walked + seg
    walked = s1
    if (seg === 0 || s1 <= from || s0 >= to) continue
    const lerp = (s) => {
      const t = (s - s0) / seg
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    if (out.length === 0) out.push(lerp(Math.max(from, s0)))
    out.push(lerp(Math.min(to, s1)))
  }
  return out
}

// The arrow's body as a polyline after sliding `travel` units along its own
// path — the tail follows the head through every bend, then the whole snake
// runs out along its route (straight, diagonal, or to the edge and round the
// turn for a curved arrow). travel = 0 is the resting pose. Without `level`
// the route is taken as the straight ray along the arrow's heading.
export function leavePose(arrow, size, travel, level = null) {
  const pts = arrow.cells.map((c) => cellCenter(c, size))
  const length = polylineLength(pts)
  let dir = arrow.dir
  if (level) {
    const route = arrowRoute(level, arrow)
    for (const c of route.cells) pts.push(cellCenter([c % level.cols, Math.floor(c / level.cols)], size))
    dir = route.finalDir
  }
  const [vx, vy] = ARROWS_DIRS[dir]
  const norm = Math.hypot(vx, vy)
  const end = pts[pts.length - 1]
  const reach = travel + size
  pts.push([end[0] + (vx / norm) * reach, end[1] + (vy / norm) * reach])
  return slicePolyline(pts, travel, travel + length)
}

export function polylineLength(points) {
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  }
  return total
}

// Distance (board units) the head travels to cover `steps` cells of its
// route — fractional steps run part-way along the next leg. Blocked-tap
// bumps use it so a diagonal arrow (√2 per step) bumps as far as a straight
// one in cells.
export function routeDistance(arrow, steps, size) {
  const step = arrow.dir >= 4 ? size * Math.SQRT2 : size
  return Math.max(0, steps) * step
}

// Unit exit vector + tip of a polyline's last segment. A single point (or
// nothing) reports a zero vector tipped at that point.
export function exitVector(points) {
  if (!points || points.length < 2) {
    const tip = points?.length === 1 ? [...points[0]] : [0, 0]
    return { dx: 0, dy: 0, tip }
  }
  const a = points[points.length - 2]
  const b = points[points.length - 1]
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  return { dx: dx / len, dy: dy / len, tip: b }
}

// Round every interior corner of a polyline to `radius` and pull the tip back
// by `tipInset` so a filled arrowhead can cover the end cleanly.
export function roundedPathD(points, radius, tipInset = 0) {
  if (!points || points.length < 2) return ''
  const pts = points.map((p) => [...p])
  if (tipInset > 0) {
    const a = pts[pts.length - 2]
    const b = pts[pts.length - 1]
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const inset = Math.min(tipInset, seg * 0.9)
    pts[pts.length - 1] = [b[0] - ((b[0] - a[0]) / seg) * inset, b[1] - ((b[1] - a[1]) / seg) * inset]
  }
  const f = (n) => Math.round(n * 100) / 100
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 1; i < pts.length - 1; i += 1) {
    const prev = pts[i - 1]
    const curr = pts[i]
    const next = pts[i + 1]
    const v1x = curr[0] - prev[0]
    const v1y = curr[1] - prev[1]
    const v2x = next[0] - curr[0]
    const v2y = next[1] - curr[1]
    const len1 = Math.hypot(v1x, v1y) || 1
    const len2 = Math.hypot(v2x, v2y) || 1
    const r = Math.min(radius, len1 / 2, len2 / 2)
    d += ` L${f(curr[0] - (v1x / len1) * r)} ${f(curr[1] - (v1y / len1) * r)}`
    d += ` Q${f(curr[0])} ${f(curr[1])} ${f(curr[0] + (v2x / len2) * r)} ${f(curr[1] + (v2y / len2) * r)}`
  }
  const last = pts[pts.length - 1]
  d += ` L${f(last[0])} ${f(last[1])}`
  return d
}
