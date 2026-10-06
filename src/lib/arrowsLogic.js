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
//   • double — one C-shaped body with a head at each end, both pointing
//     `dir` (orthogonal). It slides out as one piece, so its route is every
//     cell swept ahead of its body: in front of both heads and inside its curve.
// Any arrow may also be asleep (`sleep`): drawn hollow, it cannot leave until
// an arrow touching it (side by side) has left. Waking only ever happens, so
// the rule below still holds. Three fixed pieces sit between arrows: a mirror
// ('/' or '\\') turns a straight route 90° as it passes, a crate blocks
// routes until its count of arrows have left the board (it only ever opens),
// and a portal ring sends a straight route to its partner ring and carries on
// from there, keeping its heading (`turn`: rotated a quarter clockwise;
// `oneway`: only ring A sends, ring B is just a cell). A board may also be
// shaped (`mask`): a void cell is an edge, so a route that reaches one leaves
// the board.
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

// Endless boards mix in the late mechanics the race tiers leave out: sleeping
// arrows, double arrows, mirrors and crates climb one tier at a time, so hard
// endless has the whole set — and, on top, a classic portal pair and an
// exit-only one. Dims match ARROWS_TIER_SPECS (same easy → hard
// feel), and races keep the mod-free tier specs above.
export const ARROWS_ENDLESS_SPECS = {
  easy: { cols: 7, rows: 9, maxLen: 5, fill: 0.82, deep: 0.3, sleepers: 1, mirrors: 1 },
  medium: { cols: 8, rows: 11, maxLen: 7, fill: 0.84, samples: 9, diag: 0.1, curve: 0.1, bend: 0.9, deep: 0.5, sleepers: 1, doubles: 1, mirrors: 1, crates: 1 },
  hard: { cols: 10, rows: 13, maxLen: 9, fill: 0.86, samples: 11, diag: 0.14, curve: 0.14, bend: 0.9, deep: 0.8, sleepers: 2, doubles: 2, mirrors: 2, crates: 1, portals: ['pair', 'oneway'] },
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

// Endless-select labels (endless boards carry the extra mechanics, races do not).
export const ARROWS_ENDLESS_INFO = {
  easy: { label: 'EASY', blurb: '7×9 · + SLEEPERS & MIRRORS' },
  medium: { label: 'MEDIUM', blurb: '8×11 · + DOUBLES & A CRATE' },
  hard: { label: 'HARD', blurb: '10×13 · EVERY PIECE' },
}

// (dx, dy) in grid space (y grows downward): up, right, down, left, then the
// diagonals up-right, down-right, down-left, up-left.
export const ARROWS_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]]
export const ARROWS_DIR_NAMES = ['up', 'right', 'down', 'left', 'up-right', 'down-right', 'down-left', 'up-left']

export const isDiagonal = (arrow) => arrow.dir >= 4
export const isCurved = (arrow) => arrow.dir < 4 && (arrow.turn === 1 || arrow.turn === -1) && !arrow.double
export const isDouble = (arrow) => arrow.double === true
export const isSleeper = (arrow) => arrow.sleep === true
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

const NO_JUMPS = Object.freeze([])

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

// Cells strictly ahead of (x, y) along `dir`, up to the board edge (or the
// first void cell of a shaped board, which is an edge too).
function rayCells(cols, rows, x, y, dir, voids = null) {
  const [dx, dy] = ARROWS_DIRS[dir]
  const out = []
  let cx = x + dx
  let cy = y + dy
  while (cx >= 0 && cx < cols && cy >= 0 && cy < rows) {
    if (voids?.has(cy * cols + cx)) break
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

// Mirrors: a fixed '/' or '\\' tile turns a straight route 90° as it passes.
// '/' swaps up↔right and down↔left; '\\' swaps right↔down and up↔left.
const MIRROR_TURN = { '/': [1, 0, 3, 2], '\\': [3, 2, 1, 0] }

// A ray from `start` along `dir`, bouncing off mirrors (a Map of cell →
// '/' | '\\') and hopping through portals (a Map of ring cell → { to, turn,
// pair }; the ray lands on the partner ring and carries on from it, rotated a
// quarter clockwise when `turn`). The edge of the board, or a void cell, ends
// the ray. A ray that would loop for ever, or a diagonal ray that meets a
// mirror or a portal, is dead: that arrow can never leave, and the generator
// never builds one. `jumps[n]` is the index in `cells` of the n-th landing
// ring (the cell before it is the ring it entered), `ports[n]` its pair.
function traceRay(cols, rows, start, dir, mirrors, portals = null, voids = null) {
  const out = []
  const jumps = []
  const ports = []
  let x = start % cols
  let y = Math.floor(start / cols)
  let d = dir
  const seen = new Set()
  for (;;) {
    const [dx, dy] = ARROWS_DIRS[d]
    x += dx
    y += dy
    if (x < 0 || x >= cols || y < 0 || y >= rows) return { cells: out, dir: d, dead: false, jumps, ports }
    const c = y * cols + x
    if (voids?.has(c)) return { cells: out, dir: d, dead: false, jumps, ports }
    out.push(c)
    const m = mirrors?.get(c)
    const p = m ? null : portals?.get(c)
    if (m || p) {
      if (d >= 4) return { cells: out, dir: d, dead: true, jumps, ports }
      const key = c * 4 + d
      if (seen.has(key)) return { cells: out, dir: d, dead: true, jumps, ports }
      seen.add(key)
      if (m) {
        d = MIRROR_TURN[m][d]
      } else {
        x = p.to % cols
        y = Math.floor(p.to / cols)
        jumps.push(out.length)
        ports.push(p.pair)
        out.push(p.to)
        if (p.turn) d = turnedDir(d, 1)
      }
    }
  }
}

// The exit route of an arrow whose head is cell `head`: { cells, corners,
// finalDir, dead, jumps, ports }. `cells` lists, in travel order, every cell
// the head passes on its way off the board; `corners[k]` is the lattice
// corner crossed just before cells[k] (diagonal routes only, else -1);
// `finalDir` is the heading it leaves the board on. With mirrors, a straight
// route turns at each one, with portals it hops from ring to ring (`jumps`
// marks the landings, see traceRay), and a hooked arrow still turns once at
// the edge after any bounce or hop; `dead` marks a route that can never leave.
function routeFrom(cols, rows, head, dir, turn, mirrors = null, portals = null, voids = null) {
  if (mirrors?.size || portals?.size) {
    const first = traceRay(cols, rows, head, dir, mirrors, portals, voids)
    let cells = first.cells
    let finalDir = first.dir
    let dead = first.dead
    let jumps = first.jumps
    let ports = first.ports
    if (!dead && dir < 4 && (turn === 1 || turn === -1)) {
      const pivot = cells.length ? cells[cells.length - 1] : head
      const second = traceRay(cols, rows, pivot, turnedDir(first.dir, turn), mirrors, portals, voids)
      jumps = [...jumps, ...second.jumps.map((j) => j + cells.length)]
      ports = [...ports, ...second.ports]
      cells = [...cells, ...second.cells]
      finalDir = second.dir
      dead = second.dead
    }
    const corners = dir >= 4
      ? cells.map((c, k) => cornerOf(cols, k === 0 ? head : cells[k - 1], c))
      : cells.map(() => -1)
    return { cells, corners, finalDir, dead, jumps, ports }
  }
  const hx = head % cols
  const hy = Math.floor(head / cols)
  let cells = rayCells(cols, rows, hx, hy, dir, voids)
  let finalDir = dir
  if (dir < 4 && (turn === 1 || turn === -1)) {
    const pivot = cells.length ? cells[cells.length - 1] : head
    finalDir = turnedDir(dir, turn)
    cells = [...cells, ...rayCells(cols, rows, pivot % cols, Math.floor(pivot / cols), finalDir, voids)]
  }
  const corners = dir >= 4
    ? cells.map((c, k) => cornerOf(cols, k === 0 ? head : cells[k - 1], c))
    : cells.map(() => -1)
  return { cells, corners, finalDir, dead: false, jumps: NO_JUMPS, ports: NO_JUMPS }
}

// A double arrow's route: every cell swept ahead of its body along `dir`,
// minus its own cells, in body order. `dist[k]` is the number of empty cells
// between that cell and the body on its lane (the bump distance). A double
// arrow cannot bounce or hop, so a mirror or a portal ring anywhere in that
// area makes it dead.
function doubleRoute(cols, rows, cellIdx, dir, mirrors = null, portals = null, voids = null) {
  const own = new Set(cellIdx)
  const at = new Map()
  const cells = []
  const dist = []
  let dead = false
  for (const c of cellIdx) {
    let lastOwn = -1
    rayCells(cols, rows, c % cols, Math.floor(c / cols), dir, voids).forEach((rc, k) => {
      if (own.has(rc)) { lastOwn = k; return }
      const gap = k - lastOwn - 1
      if (at.has(rc)) {
        dist[at.get(rc)] = Math.min(dist[at.get(rc)], gap)
        return
      }
      at.set(rc, cells.length)
      cells.push(rc)
      dist.push(gap)
      if (mirrors?.has(rc) || portals?.has(rc)) dead = true
    })
  }
  return { cells, corners: cells.map(() => -1), finalDir: dir, dead, dist, jumps: NO_JUMPS, ports: NO_JUMPS }
}

// Grow a double arrow from head A at `head` pointing `dir`: a prong of 1–2
// cells behind each head, joined by a spine 1–2 cells long on one side.
// Returns cell indexes A → B, or null when it does not fit.
function growDouble(spec, occ, head, dir, rng) {
  const { cols, rows } = spec
  const arm = 1 + Math.floor(rng() * 2)
  const gap = 1 + Math.floor(rng() * 2)
  const side = rng() < 0.5 ? 1 : 3
  const [dx, dy] = ARROWS_DIRS[dir]
  const [px, py] = ARROWS_DIRS[(dir + side) % 4]
  let x = head % cols
  let y = Math.floor(head / cols)
  const out = [[x, y]]
  for (let k = 0; k < arm; k += 1) { x -= dx; y -= dy; out.push([x, y]) }
  for (let k = 0; k < gap; k += 1) { x += px; y += py; out.push([x, y]) }
  for (let k = 0; k < arm; k += 1) { x += dx; y += dy; out.push([x, y]) }
  const idx = []
  for (const [u, v] of out) {
    if (u < 0 || v < 0 || u >= cols || v >= rows) return null
    const c = v * cols + u
    if (occ[c] !== -1) return null
    idx.push(c)
  }
  return idx
}

// Cell → '/' | '\\' for a level's mirrors (null without any), cached per
// mirror list.
const mirrorCache = new WeakMap()
export function mirrorMap(level) {
  if (!level.mirrors?.length) return null
  let map = mirrorCache.get(level.mirrors)
  if (!map || map.cols !== level.cols) {
    map = new Map(level.mirrors.map((m) => [m.y * level.cols + m.x, m.m]))
    map.cols = level.cols
    mirrorCache.set(level.mirrors, map)
  }
  return map
}

// Cell → count for a level's crates (null without any).
export function crateMap(level) {
  if (!level.crates?.length) return null
  return new Map(level.crates.map((c) => [c.y * level.cols + c.x, c.k]))
}

// Ring cell → { to, turn, pair } for the rings that send (null without any
// portals). A two-way pair sends from both rings; a `oneway` pair only from
// ring A, so crossing its ring B does nothing. Cached per portal list.
const portalCache = new WeakMap()
export function portalMap(level) {
  if (!level.portals?.length) return null
  let map = portalCache.get(level.portals)
  if (!map || map.cols !== level.cols) {
    map = new Map()
    level.portals.forEach((p, pair) => {
      const a = p.a[1] * level.cols + p.a[0]
      const b = p.b[1] * level.cols + p.b[0]
      const turn = p.turn === true
      map.set(a, { to: b, turn, pair })
      if (!p.oneway) map.set(b, { to: a, turn, pair })
    })
    map.cols = level.cols
    portalCache.set(level.portals, map)
  }
  return map
}

// Every ring cell of a level's portals, senders and exit-only rings alike.
export function portalRings(level) {
  const out = new Set()
  for (const p of level.portals ?? []) {
    out.add(p.a[1] * level.cols + p.a[0])
    out.add(p.b[1] * level.cols + p.b[0])
  }
  return out
}

// Void cells of a shaped board: `mask` is one string per row, '#' for a
// playable cell and '.' for a void (null for a plain rectangle). A void is an
// edge: a route that reaches one has left the board. Cached per mask.
const voidCache = new WeakMap()
export function voidSet(level) {
  if (!level.mask) return null
  let set = voidCache.get(level.mask)
  if (!set) {
    set = new Set()
    level.mask.forEach((row, y) => {
      for (let x = 0; x < level.cols; x += 1) if (row[x] !== '#') set.add(y * level.cols + x)
    })
    voidCache.set(level.mask, set)
  }
  return set.size ? set : null
}

// Routes are pure functions of board size, shape, fixed pieces and the arrow,
// cached per arrow object.
const routeCache = new WeakMap()

export function arrowRoute(level, arrow) {
  const hit = routeCache.get(arrow)
  if (
    hit && hit.cols === level.cols && hit.rows === level.rows &&
    hit.mirrors === level.mirrors && hit.portals === level.portals && hit.mask === level.mask
  ) return hit.route
  const [hx, hy] = arrow.cells[arrow.cells.length - 1]
  const mirrors = mirrorMap(level)
  const portals = portalMap(level)
  const voids = voidSet(level)
  const route = arrow.double
    ? doubleRoute(level.cols, level.rows, arrow.cells.map(([x, y]) => y * level.cols + x), arrow.dir, mirrors, portals, voids)
    : routeFrom(level.cols, level.rows, hy * level.cols + hx, arrow.dir, arrow.turn, mirrors, portals, voids)
  routeCache.set(arrow, { cols: level.cols, rows: level.rows, mirrors: level.mirrors, portals: level.portals, mask: level.mask, route })
  return route
}

// Generator occupancy markers: a mirror or portal ring (no arrow may sit on
// it, but routes pass through it) and a void cell of a shaped board (nothing
// is ever placed there, and routes stop before it).
const MIRROR = -2
const VOID = -3

function routeBlocked(route, occ, corners) {
  if (route.dead) return true
  for (let k = 0; k < route.cells.length; k += 1) {
    if (route.corners[k] >= 0 && corners[route.corners[k]] !== -1) return true
    if (occ[route.cells[k]] !== -1 && occ[route.cells[k]] !== MIRROR) return true
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
    return { samples: 8, diag: 0, curve: 0, bend: 0, deep: 0, sleepers: 0, doubles: 0, ...tier, name: tier.name ?? 'custom' }
  }
  const name = ARROWS_TIER_SPECS[tier] ? tier : 'easy'
  return { samples: 8, diag: 0, curve: 0, bend: 0, deep: 0, sleepers: 0, doubles: 0, ...ARROWS_TIER_SPECS[name], name }
}

// Arrows touching each arrow side by side at the start (cached per level).
// A sleeping arrow wakes once any of them has left.
const neighborCache = new WeakMap()
export function neighborsOf(level) {
  const hit = neighborCache.get(level)
  if (hit) return hit
  const occ = occupancy(level, Array(level.arrows.length).fill(false))
  const nb = level.arrows.map((a, i) => {
    const set = new Set()
    for (const [x, y] of a.cells) {
      for (const [dx, dy] of ARROWS_DIRS.slice(0, 4)) {
        const u = x + dx
        const v = y + dy
        if (u < 0 || v < 0 || u >= level.cols || v >= level.rows) continue
        const o = occ[v * level.cols + u]
        if (o !== -1 && o !== i) set.add(o)
      }
    }
    return [...set]
  })
  neighborCache.set(level, nb)
  return nb
}

// Is arrow `index` awake? Arrows that never slept always are.
export function isAwake(level, gone, index) {
  if (!level.arrows[index].sleep) return true
  return neighborsOf(level)[index].some((j) => gone?.[j])
}

// The greedy wave (1-based) each arrow leaves in; 0 if it never does.
function wavesOf(level) {
  const wave = Array(level.arrows.length).fill(0)
  let gone = Array(level.arrows.length).fill(false)
  for (let w = 1; ; w += 1) {
    const free = freeArrows(level, gone)
    if (!free.length) break
    gone = gone.slice()
    for (const i of free) { gone[i] = true; wave[i] = w }
  }
  return wave
}

// Put up to `count` arrows to sleep. Each pick looks free early but every
// arrow touching it leaves later than it otherwise would, so it really has
// to wait; it is kept only while the solver still clears the board.
function placeSleepers(level, count, rng) {
  const nb = neighborsOf(level)
  for (let n = 0; n < count; n += 1) {
    const wave = wavesOf(level)
    const cands = level.arrows.map((_, i) => i)
      .filter((i) => !level.arrows[i].sleep && nb[i].length > 0)
      .map((i) => ({ i, gain: Math.min(...nb[i].map((j) => wave[j])) + 1 - wave[i] }))
      .filter((c) => c.gain > 0)
    cands.sort((p, q) => q.gain - p.gain || rng() - 0.5)
    let done = false
    for (const { i } of cands.slice(0, 8)) {
      level.arrows[i].sleep = true
      if (solveArrows(level).solvable) { done = true; break }
      delete level.arrows[i].sleep
    }
    if (!done) break
  }
}

// Mirrors go down before any arrow, on interior cells, away from each other.
// Like sleepers and crates they draw from the second random stream, so a spec
// without them generates exactly the board it always did.
function placeMirrors(spec, occ, rng) {
  const { cols, rows, mirrors = 0 } = spec
  const out = []
  for (let tries = 0; out.length < mirrors && tries < 400; tries += 1) {
    const x = 1 + Math.floor(rng() * (cols - 2))
    const y = 1 + Math.floor(rng() * (rows - 2))
    if (out.some((m) => Math.abs(m.x - x) + Math.abs(m.y - y) < 3) || occ[y * cols + x] !== -1) continue
    const m = rng() < 0.5 ? '/' : '\\'
    out.push({ x, y, m })
    occ[y * cols + x] = MIRROR
  }
  return out
}

// Portals go down right after the mirrors, before any arrow, on interior
// cells: `spec.portals` lists one kind per pair — 'pair' (two-way), 'oneway'
// (only ring A sends) or 'turn' (the route leaves a quarter turn clockwise).
// The two rings of a pair sit far apart (so the hop saves real distance) and
// no two rings touch. Like mirrors they draw from the second random stream,
// so a spec without portals generates exactly the board it always did.
function placePortals(spec, occ, rng) {
  const { cols, rows, portals: kinds = [] } = spec
  const out = []
  const rings = []
  const far = (u, v) => rings.every((r) => Math.abs(r[0] - u) + Math.abs(r[1] - v) >= 2)
  kinds.forEach((kind, c) => {
    const pick = () => {
      for (let tries = 0; tries < 200; tries += 1) {
        const x = 1 + Math.floor(rng() * (cols - 2))
        const y = 1 + Math.floor(rng() * (rows - 2))
        if (occ[y * cols + x] === -1 && far(x, y)) return [x, y]
      }
      return null
    }
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const sep = Math.max(3, Math.floor((cols + rows) / 3) - attempt)
      const a = pick()
      if (!a) continue
      rings.push(a)
      const b = pick()
      if (!b || Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < sep) { rings.pop(); continue }
      rings.push(b)
      const portal = { a, b, c }
      if (kind === 'oneway') portal.oneway = true
      if (kind === 'turn') portal.turn = true
      out.push(portal)
      occ[a[1] * cols + a[0]] = MIRROR
      occ[b[1] * cols + b[0]] = MIRROR
      return
    }
  })
  return out
}

// Crates: an empty cell that several routes cross becomes a crate that stays
// solid until `k` arrows have left the board. Each crate takes the count that
// deepens the board most while the solver still clears it; the first two
// must add depth, a third may only hold it.
function placeCrates(level, count, rng) {
  const n = level.arrows.length
  level.crates = []
  for (let c = 0; c < count; c += 1) {
    const occ = occupancy(level, Array(n).fill(false))
    const crossing = new Map()
    level.arrows.forEach((a) => {
      for (const cell of arrowRoute(level, a).cells) if (occ[cell] === -1) crossing.set(cell, (crossing.get(cell) ?? 0) + 1)
    })
    const mirrors = mirrorMap(level)
    const rings = portalRings(level)
    const taken = new Set(level.crates.map((k) => k.y * level.cols + k.x))
    const cells = [...crossing.entries()].filter(([cell, k]) => k >= 2 && !mirrors?.has(cell) && !rings.has(cell) && !taken.has(cell))
    cells.sort((a, b) => b[1] - a[1] || rng() - 0.5)
    let best = null
    const before = solveArrows(level).layers
    for (const [cell] of cells.slice(0, 8)) {
      for (const k of [Math.round(n * 0.6), Math.round(n * 0.45), Math.round(n * 0.3), Math.round(n * 0.2)]) {
        const crate = { x: cell % level.cols, y: Math.floor(cell / level.cols), k }
        level.crates.push(crate)
        const st = solveArrows(level)
        level.crates.pop()
        const need = level.crates.length >= 2 ? before : before + 1
        if (st.solvable && st.layers >= need && (!best || st.layers > best.layers)) best = { crate, layers: st.layers }
        if (st.solvable && st.layers > before) break
      }
    }
    if (!best) break
    level.crates.push(best.crate)
  }
  if (!level.crates.length) delete level.crates
}

// Deterministically generate the board for `seed` at `tier` (a tier name or
// a spec object like ARROWS_TIER_SPECS' entries).
// Returns { seed, tier, cols, rows, arrows: [{ cells: [[x, y], …], dir, turn?, sleep?, double? }],
// mirrors?: [{ x, y, m }], crates?: [{ x, y, k }] }.
// Spec knobs beyond the race tiers (solo levels 21+): `deep` biases head
// picks toward long chains of arrows waiting on each other, `doubles` grows
// that many double arrows, `sleepers` puts that many arrows to sleep,
// `mirrors` and `crates` place that many of each (solo levels 41+).
/**
 * @param {number} seed
 * @param {string | Record<string, any>} [tier]
 */
export function generateArrowsLevel(seed, tier = 'easy') {
  const spec = resolveSpec(tier)
  const { cols, rows, fill, samples, diag, curve, bend, deep } = spec
  const rng = seededRng(seed)
  // Sleepers draw from a second stream so the main one stays untouched.
  const rng2 = seededRng(seed ^ 0x5bd1e995)
  // deep: cell -> arrows whose route crosses it, and each arrow's chain depth
  // (the longest run of earlier arrows that will wait on it).
  const routeOwners = Array.from({ length: cols * rows }, () => [])
  const downOf = []
  const nDoubles = spec.doubles
  let doublesLeft = nDoubles
  const occ = new Int16Array(cols * rows).fill(-1)
  // A shaped board: void cells hold the VOID marker, so nothing is placed on
  // them and no empty-cell scan ever lists them.
  const shaped = spec.mask ? { cols, mask: spec.mask } : null
  const voids = shaped ? voidSet(shaped) : null
  if (voids) for (const c of voids) occ[c] = VOID
  const mirrorList = spec.mirrors ? placeMirrors(spec, occ, rng2) : []
  const mirrors = mirrorList.length ? new Map(mirrorList.map((m) => [m.y * cols + m.x, m.m])) : null
  const portalList = spec.portals?.length ? placePortals(spec, occ, rng2) : []
  const portals = portalList.length ? portalMap({ cols, portals: portalList }) : null
  const corners = new Int16Array((cols + 1) * (rows + 1)).fill(-1)
  const arrows = []
  // Boards without twists draw no extra random numbers, so their seeds keep
  // producing the same boards they always did.
  const twisty = diag + curve > 0
  let filled = 0
  let fails = 0
  const goal = Math.floor((cols * rows - (voids?.size ?? 0) - mirrorList.length - portalList.length * 2) * fill)

  while (filled < goal && fails < 600) {
    const empty = []
    for (let i = 0; i < occ.length; i += 1) if (occ[i] === -1) empty.push(i)
    if (empty.length === 0) break
    let kind = 'straight'
    if (twisty) {
      const r = rng()
      kind = r < diag ? 'diag' : r < diag + curve ? 'curve' : 'straight'
    }
    // Double arrows come at fixed points in the fill, so a level gets exactly
    // spec.doubles of them when they fit. Like any arrow, a double's whole
    // route must avoid every earlier arrow.
    if (doublesLeft > 0 && filled >= (goal * (nDoubles - doublesLeft + 1)) / (nDoubles + 2)) {
      let dpick = null
      let dbest = -1
      for (let k = 0; k < samples * 2; k += 1) {
        const head = empty[Math.floor(rng() * empty.length)]
        for (const d of shuffled([0, 1, 2, 3], rng)) {
          const body = growDouble(spec, occ, head, d, rng)
          if (!body) continue
          const route = doubleRoute(cols, rows, body, d, mirrors, portals, voids)
          if (routeBlocked(route, occ, corners)) continue
          let down = 1
          if (deep) for (const c of body) for (const j of routeOwners[c]) down = Math.max(down, downOf[j] + 1)
          const score = route.cells.length + deep * 8 * down
          if (score > dbest) { dpick = { body, d, route, down }; dbest = score }
        }
      }
      if (dpick) {
        const index = arrows.length
        for (const c of dpick.body) occ[c] = index
        filled += dpick.body.length
        if (deep) {
          downOf.push(dpick.down)
          for (const c of dpick.route.cells) routeOwners[c].push(index)
        }
        arrows.push({ cells: dpick.body.map((c) => [c % cols, Math.floor(c / cols)]), dir: dpick.d, double: true })
        doublesLeft -= 1
        continue
      }
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
        const route = routeFrom(cols, rows, head, d, turn, mirrors, portals, voids)
        if (route.dead) continue
        // A route that hops through a portal can come back round over its own
        // head; the body is kept out of the route below, the head must be too.
        if (portals && route.cells.includes(head)) continue
        if (!deep && route.cells.length <= best) continue
        // A curve must have somewhere to run after its turn (not a corner),
        // or its hook would mean nothing.
        if (kind === 'curve' && !mirrors && !portals && route.cells.length === rayCells(cols, rows, head % cols, Math.floor(head / cols), d, voids).length) continue
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
        if (grown && deep) {
          let down = 1
          for (const c of grown) for (const j of routeOwners[c]) down = Math.max(down, downOf[j] + 1)
          const score = route.cells.length + deep * 8 * down
          if (score > best) { pick = { path: grown, dir: d, turn, down, route }; best = score }
        } else if (grown) { pick = { path: grown, dir: d, turn, route }; best = route.cells.length }
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
    if (deep) {
      downOf.push(pick.down)
      for (const c of pick.route.cells) routeOwners[c].push(index)
    }
    const arrow = { cells: path.map((c) => [c % cols, Math.floor(c / cols)]), dir: pick.dir }
    if (pick.turn) arrow.turn = pick.turn
    arrows.push(arrow)
  }

  const level = { seed, tier: spec.name, cols, rows, arrows }
  if (spec.mask) level.mask = spec.mask
  if (mirrorList.length) level.mirrors = mirrorList
  if (portalList.length) level.portals = portalList
  if (spec.sleepers) placeSleepers(level, spec.sleepers, rng2)
  if (spec.crates) placeCrates(level, spec.crates, rng2)
  return level
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

// Empty cells the head walks before route cell `k`: a double arrow's lane
// distance, else the cell index less the landings before it (a hop from ring
// to ring covers no distance, so the landing ring costs nothing).
function routeGap(route, k) {
  if (route.dist) return route.dist[k]
  let hops = 0
  for (const j of route.jumps) if (j <= k) hops += 1
  return k - hops
}

function checkAgainst(level, occ, corners, index, gone) {
  const arrow = level.arrows[index]
  const route = arrowRoute(level, arrow)
  if (route.dead) return { free: false, blocker: -1, gap: 0 }
  if (arrow.sleep && !isAwake(level, gone, index)) {
    return { free: false, blocker: neighborsOf(level)[index][0] ?? -1, gap: 0, asleep: true }
  }
  const crates = crateMap(level)
  const cleared = crates && gone ? countGone(gone) : 0
  for (let k = 0; k < route.cells.length; k += 1) {
    const corner = route.corners[k]
    if (corner >= 0 && corners[corner] !== -1 && corners[corner] !== index) {
      return { free: false, blocker: corners[corner], gap: routeGap(route, k) }
    }
    const cell = route.cells[k]
    const owner = occ[cell]
    if (owner !== -1) return { free: false, blocker: owner, gap: routeGap(route, k) }
    if (crates?.has(cell) && cleared < crates.get(cell)) {
      return { free: false, blocker: -1, gap: routeGap(route, k), crate: cell }
    }
  }
  return { free: true, blocker: -1, gap: route.dist ? route.cells.length : routeGap(route, route.cells.length) }
}

// Route check for arrow `index`: { free, blocker, gap } where `gap` is the
// number of empty route cells between its head and the first blocker (or
// the edge). A crate still standing on the route reports `crate` (its cell)
// with no blocking arrow.
export function exitCheck(level, gone, index) {
  return checkAgainst(level, occupancy(level, gone), cornerOccupancy(level, gone), index, gone)
}

// Apply a tap on arrow `index`. Returns null for a no-op (bad index, arrow
// already gone, or no lives left); otherwise the new { gone, lives } plus the
// tap result ('cleared' | 'blocked') and, when blocked, the blocker + gap
// (`asleep` when it was a sleeping arrow that no neighbour has woken yet).
export function applyArrowTap(level, gone, lives, index) {
  if (!level || index < 0 || index >= level.arrows.length) return null
  if (gone[index] || lives <= 0) return null
  const check = exitCheck(level, gone, index)
  if (!check.free) {
    const out = { gone, lives: lives - 1, result: 'blocked', blocker: check.blocker, gap: check.gap, asleep: !!check.asleep }
    if (check.crate != null) out.crate = check.crate
    return out
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
    if (!gone[i] && checkAgainst(level, occ, corners, i, gone).free) out.push(i)
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

// How many arrows route through each portal pair (index = pair), counting an
// arrow once per pair however many times it hops. Dead routes never count.
export function portalUses(level) {
  const uses = (level.portals ?? []).map(() => 0)
  if (!uses.length) return uses
  for (const arrow of level.arrows) {
    const route = arrowRoute(level, arrow)
    if (route.dead) continue
    for (const pair of new Set(route.ports)) uses[pair] += 1
  }
  return uses
}

// Summary used to rank boards by difficulty (solo levels, tests).
export function levelStats(level) {
  const { solvable, layers, initialFree } = solveArrows(level)
  const n = level.arrows.length
  const diagonals = level.arrows.filter(isDiagonal).length
  const curves = level.arrows.filter(isCurved).length
  const bent = level.arrows.filter(isBent).length
  const sleepers = level.arrows.filter((a) => a.sleep).length
  const doubles = level.arrows.filter(isDouble).length
  const mirrors = level.mirrors?.length ?? 0
  const crates = level.crates?.length ?? 0
  const portals = level.portals?.length ?? 0
  // Every arrow that hops through a portal has a route to trace across the
  // board instead of along a line.
  const hops = portals ? portalUses(level).reduce((sum, u) => sum + u, 0) : 0
  // Arrow count and depth carry most of the weight; a scarce opening and
  // every twist arrow (two routes to read instead of one) add a little.
  const openness = n > 0 ? initialFree / n : 1
  const difficulty = Math.round(n * 2 + layers * 6 + (1 - openness) * 20 + diagonals * 2 + bent + curves * 3 + sleepers * 3 + doubles * 4 + mirrors * 3 + crates * 4 + portals * 4 + hops * 2)
  return { solvable, arrows: n, layers, initialFree, diagonals, bent, curves, sleepers, doubles, mirrors, crates, portals, hops, difficulty }
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
// Through a portal the snake pours into one ring and out of the other, so the
// pose can be several strands: the array returned is the strand holding the
// head, and the strands behind it hang off it as `.tails` (each ends at the
// ring it is entering). A hop covers no distance along the path.
export function leavePose(arrow, size, travel, level = null) {
  const pts = arrow.cells.map((c) => cellCenter(c, size))
  const length = polylineLength(pts)
  let dir = arrow.dir
  let landings = []
  if (level) {
    const route = arrowRoute(level, arrow)
    const base = pts.length
    for (const c of route.cells) pts.push(cellCenter([c % level.cols, Math.floor(c / level.cols)], size))
    landings = route.jumps.map((k) => base + k)
    dir = route.finalDir
  }
  const [vx, vy] = ARROWS_DIRS[dir]
  const norm = Math.hypot(vx, vy)
  const end = pts[pts.length - 1]
  const reach = travel + size
  pts.push([end[0] + (vx / norm) * reach, end[1] + (vy / norm) * reach])
  if (!landings.length) return slicePolyline(pts, travel, travel + length)
  const strands = []
  let from = 0
  for (const at of landings) {
    strands.push(pts.slice(from, at))
    from = at
  }
  strands.push(pts.slice(from))
  const slices = slicePolylines(strands, travel, travel + length)
  const head = slices.pop() ?? []
  if (slices.length) head.tails = slices
  return head
}

// slicePolyline over several strands laid end to end: the arc length is the
// sum of the strands, with no distance between one strand's end and the next
// one's start. Returns the non-empty slices, in order.
export function slicePolylines(strands, from, to) {
  const out = []
  let offset = 0
  for (const strand of strands) {
    const len = polylineLength(strand)
    const piece = slicePolyline(strand, from - offset, to - offset)
    if (piece.length) out.push(piece)
    offset += len
  }
  return out
}

// The arrow's pose after sliding `travel` units: a double arrow moves as one
// rigid piece along its heading; every other arrow slithers (leavePose).
export function arrowPose(arrow, size, travel, level = null) {
  if (!arrow.double) return leavePose(arrow, size, travel, level)
  const [dx, dy] = ARROWS_DIRS[arrow.dir]
  return arrow.cells.map((c) => {
    const [x, y] = cellCenter(c, size)
    return [x + dx * travel, y + dy * travel]
  })
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
