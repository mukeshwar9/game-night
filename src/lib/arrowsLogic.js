// @ts-check
// Arrows — pure game logic. No DOM, no Firebase, no React.
//
// A board is a grid of snake-shaped arrows. Each arrow is a run of adjacent
// cells (tail → head); its heading is the direction of its last step. Tapping
// an arrow sends it sliding out along its heading — but only when every cell
// between its head and the board edge is empty. A tap on an arrow whose path
// is blocked by another arrow costs a life and the arrow stays put.
//
// Boards are generated from a numeric seed so both players race an identical
// board without it ever touching Firebase. The generator builds arrows in an
// order where each new arrow's exit ray avoids every earlier arrow, so
// removing them in reverse is always a solution — and because clearing an
// arrow only ever frees cells, a board can never become unsolvable.
//
// The geometry helpers at the bottom (`leavePose`, `roundedPathD`, …) are
// pure too: ArrowsBoard.jsx calls them each animation frame.

export const ARROWS_LIVES = 3
export const ARROWS_MATCH_TARGET = 2
export const ARROWS_MAX_ROUNDS = 3
export const ARROWS_TIERS = ['easy', 'medium', 'hard']

// Grid size and snake length per tier. Widths are capped at 10 columns so a
// cell stays ~35px (a comfortable thumb target) on a 390px phone.
export const ARROWS_TIER_SPECS = {
  easy: { cols: 7, rows: 9, maxLen: 5, fill: 0.84 },
  medium: { cols: 8, rows: 11, maxLen: 7, fill: 0.88 },
  hard: { cols: 10, rows: 13, maxLen: 9, fill: 0.9 },
}

// up, right, down, left — (dx, dy) in grid space (y grows downward).
export const ARROWS_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]
export const ARROWS_DIR_NAMES = ['up', 'right', 'down', 'left']

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

// Try to grow one arrow with its head at `head` pointing `dir`. The body walks
// backwards from the head, never into an occupied cell or into its own exit
// ray (an arrow may not block itself). Returns cell indexes tail → head, or
// null when the neck cell is unavailable.
function growArrow(spec, occ, head, dir, rng) {
  const { cols, rows, maxLen } = spec
  const hx = head % cols
  const hy = Math.floor(head / cols)
  const banned = new Set(rayCells(cols, rows, hx, hy, dir))
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

// Deterministically generate the board for `seed` at `tier`.
// Returns { seed, tier, cols, rows, arrows: [{ cells: [[x, y], …], dir }] }.
export function generateArrowsLevel(seed, tier = 'easy') {
  const spec = ARROWS_TIER_SPECS[tier] ?? ARROWS_TIER_SPECS.easy
  const { cols, rows, fill } = spec
  const rng = seededRng(seed)
  const occ = new Int16Array(cols * rows).fill(-1)
  const arrows = []
  let filled = 0
  let fails = 0
  const goal = Math.floor(cols * rows * fill)

  while (filled < goal && fails < 600) {
    const empty = []
    for (let i = 0; i < occ.length; i += 1) if (occ[i] === -1) empty.push(i)
    if (empty.length === 0) break
    // Sample a few candidate heads and keep the one with the longest exit
    // ray: long rays get crossed by later arrows, which is what makes a board
    // a puzzle instead of a free-for-all.
    let path = null
    let dir = -1
    let best = -1
    for (let k = 0; k < 8; k += 1) {
      const head = empty[Math.floor(rng() * empty.length)]
      const hx = head % cols
      const hy = Math.floor(head / cols)
      for (const d of shuffled([0, 1, 2, 3], rng)) {
        const ray = rayCells(cols, rows, hx, hy, d)
        if (ray.length <= best) continue
        // The exit ray must avoid every earlier arrow — that is what keeps
        // the board solvable (later arrows leave first).
        if (ray.some((c) => occ[c] !== -1)) continue
        const grown = growArrow(spec, occ, head, d, rng)
        if (grown) { path = grown; dir = d; best = ray.length }
      }
    }
    if (!path) { fails += 1; continue }
    const index = arrows.length
    for (const c of path) occ[c] = index
    filled += path.length
    arrows.push({ cells: path.map((c) => [c % cols, Math.floor(c / cols)]), dir })
  }

  return { seed, tier: ARROWS_TIER_SPECS[tier] ? tier : 'easy', cols, rows, arrows }
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

// Which remaining arrow sits on cell (x, y)? -1 when empty or off-board.
export function arrowAtCell(level, gone, x, y) {
  if (x < 0 || x >= level.cols || y < 0 || y >= level.rows) return -1
  return occupancy(level, gone)[y * level.cols + x]
}

// Path check for arrow `index`: { free, blocker, gap } where `gap` is the
// number of empty cells between its head and the first blocker (or the edge).
export function exitCheck(level, gone, index) {
  const arrow = level.arrows[index]
  const occ = occupancy(level, gone)
  const [hx, hy] = arrow.cells[arrow.cells.length - 1]
  const ray = rayCells(level.cols, level.rows, hx, hy, arrow.dir)
  for (let k = 0; k < ray.length; k += 1) {
    if (occ[ray[k]] !== -1) return { free: false, blocker: occ[ray[k]], gap: k }
  }
  return { free: true, blocker: -1, gap: ray.length }
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
  const out = []
  level.arrows.forEach((_, i) => {
    if (!gone[i] && exitCheck(level, gone, i).free) out.push(i)
  })
  return out
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
// runs straight out along its heading. travel = 0 is the resting pose.
export function leavePose(arrow, size, travel) {
  const pts = arrow.cells.map((c) => cellCenter(c, size))
  const length = (pts.length - 1) * size
  const [dx, dy] = ARROWS_DIRS[arrow.dir]
  const head = pts[pts.length - 1]
  const reach = travel + size
  pts.push([head[0] + dx * reach, head[1] + dy * reach])
  return slicePolyline(pts, travel, travel + length)
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
