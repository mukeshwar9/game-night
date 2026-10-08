import { describe, it, expect } from 'vitest'
import {
  seededRng,
  randomArrowsSeed,
  tierForRound,
  generateArrowsLevel,
  occupancy,
  arrowAtCell,
  exitCheck,
  applyArrowTap,
  countGone,
  isBoardCleared,
  freeArrows,
  normalizeGone,
  arrowsRoundWinner,
  arrowsMatchWinner,
  isFinalArrowsRound,
  getArrowsMatchEnd,
  arrowsNextRound,
  arrowsFreshState,
  cellCenter,
  slicePolyline,
  leavePose,
  exitVector,
  roundedPathD,
  ARROWS_DIRS,
  ARROWS_LIVES,
  ARROWS_TIERS,
  ARROWS_TIER_SPECS,
  ARROWS_DIFFICULTY_INFO,
  ARROWS_ENDLESS_INFO,
  arrowRoute,
  arrowPose,
  isAwake,
  isDouble,
  isSleeper,
  neighborsOf,
  isBent,
  cornerOccupancy,
  getArrowsDifficulty,
  isCurved,
  isDiagonal,
  levelStats,
  polylineLength,
  routeDistance,
  solveArrows,
  tierForGame,
  turnedDir,
  crateMap,
  mirrorMap,
  portalMap,
  portalRings,
  portalUses,
  slicePolylines,
  tunnelMap,
  tunnelUses,
  voidSet,
  ARROWS_ENDLESS_SPECS,
  ARROWS_TWISTS,
  quarterDir,
} from './arrowsLogic'
import { shapeMask } from './arrowsShapes'

// A hand-built 4×3 board (index: cells tail → head, heading):
//   0: (0,0)→(1,0) right — blocked by arrow 2 one empty cell ahead
//   1: (2,1)→(1,1) left  — free (row 1 is empty to its left)
//   2: (3,2)→(3,1)→(3,0) up — free (its head is on the top edge)
const TINY = {
  cols: 4,
  rows: 3,
  arrows: [
    { cells: [[0, 0], [1, 0]], dir: 1 },
    { cells: [[2, 1], [1, 1]], dir: 3 },
    { cells: [[3, 2], [3, 1], [3, 0]], dir: 0 },
  ],
}
const none = () => [false, false, false]

// Greedy solve: keep clearing any free arrow. Because clearing only frees
// cells, a board is solvable iff greedy clears it.
function greedySolve(level) {
  let gone = level.arrows.map(() => false)
  for (;;) {
    const free = freeArrows(level, gone)
    if (free.length === 0) break
    gone = applyArrowTap(level, gone, ARROWS_LIVES, free[0]).gone
  }
  return gone
}

describe('seededRng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = seededRng(42)
    const b = seededRng(42)
    for (let i = 0; i < 50; i += 1) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    expect(seededRng(1)()).not.toBe(seededRng(2)())
  })

  it('randomArrowsSeed gives a positive integer', () => {
    expect(randomArrowsSeed(() => 0)).toBe(1)
    const s = randomArrowsSeed()
    expect(Number.isInteger(s)).toBe(true)
    expect(s).toBeGreaterThan(0)
  })
})

describe('tierForRound', () => {
  it('maps rounds to easy → medium → hard and clamps', () => {
    expect(tierForRound(0)).toBe('easy')
    expect(tierForRound(1)).toBe('medium')
    expect(tierForRound(2)).toBe('hard')
    expect(tierForRound(9)).toBe('hard')
    expect(tierForRound(undefined)).toBe('easy')
  })
})

describe('race difficulty blurbs', () => {
  for (const tier of ARROWS_TIERS) {
    it(`${tier}: blurb leads with the real board size and differs from endless`, () => {
      const { cols, rows } = ARROWS_TIER_SPECS[tier]
      expect(ARROWS_DIFFICULTY_INFO[tier].blurb.startsWith(`${cols}×${rows}`)).toBe(true)
      expect(ARROWS_DIFFICULTY_INFO[tier].blurb).not.toBe(ARROWS_ENDLESS_INFO[tier].blurb)
      for (const seed of [3, 41, 977]) {
        const level = generateArrowsLevel(seed, tier)
        expect([level.cols, level.rows]).toEqual([cols, rows])
        if (tier === 'easy') expect(level.arrows.some(isDiagonal)).toBe(false)
      }
    })
  }
})

describe('generateArrowsLevel', () => {
  it('is deterministic for a seed + tier', () => {
    expect(generateArrowsLevel(1234, 'medium')).toEqual(generateArrowsLevel(1234, 'medium'))
    expect(generateArrowsLevel(1234, 'medium')).not.toEqual(generateArrowsLevel(1235, 'medium'))
  })

  it('falls back to easy for an unknown tier', () => {
    const level = generateArrowsLevel(7, 'nope')
    expect(level.tier).toBe('easy')
    expect(level.cols).toBe(ARROWS_TIER_SPECS.easy.cols)
  })

  for (const tier of ARROWS_TIERS) {
    it(`${tier}: 80 seeds are well-formed, dense, puzzling and always solvable`, () => {
      const spec = ARROWS_TIER_SPECS[tier]
      for (let s = 1; s <= 80; s += 1) {
        const level = generateArrowsLevel(s * 7919, tier)
        expect(level.cols).toBe(spec.cols)
        expect(level.rows).toBe(spec.rows)
        const seen = new Set()
        let cells = 0
        for (const arrow of level.arrows) {
          expect(arrow.cells.length).toBeGreaterThanOrEqual(2)
          expect(arrow.cells.length).toBeLessThanOrEqual(spec.maxLen)
          arrow.cells.forEach(([x, y], k) => {
            expect(x >= 0 && x < spec.cols && y >= 0 && y < spec.rows).toBe(true)
            const key = `${x},${y}`
            expect(seen.has(key)).toBe(false)
            seen.add(key)
            if (k > 0) {
              // Orthogonal steps, or one diagonal step per cell for a
              // diagonal arrow.
              const [px, py] = arrow.cells[k - 1]
              const step = [x - px, y - py]
              if (isDiagonal(arrow) && !isBent(arrow)) expect(step).toEqual(ARROWS_DIRS[arrow.dir])
              else if (isBent(arrow)) expect(Math.max(Math.abs(step[0]), Math.abs(step[1]))).toBe(1)
              else expect(Math.abs(step[0]) + Math.abs(step[1])).toBe(1)
            }
          })
          // Heading is the last step.
          const [a, b] = arrow.cells.slice(-2)
          expect([b[0] - a[0], b[1] - a[1]]).toEqual(ARROWS_DIRS[arrow.dir])
          cells += arrow.cells.length
        }
        expect(cells / (spec.cols * spec.rows)).toBeGreaterThan(0.6)
        expect(isBoardCleared(level, greedySolve(level))).toBe(true)
        // Not a free-for-all: some arrows must start blocked.
        const free0 = freeArrows(level, level.arrows.map(() => false)).length
        expect(free0).toBeGreaterThan(0)
        expect(free0).toBeLessThan(level.arrows.length)
      }
    }, 20000)
  }

  it('only medium and hard carry twists: diagonals from medium, hooks on hard', () => {
    const count = (tier, pred) => {
      let n = 0
      for (let s = 1; s <= 40; s += 1) n += generateArrowsLevel(s * 31, tier).arrows.filter(pred).length
      return n
    }
    expect(count('easy', isDiagonal) + count('easy', isCurved)).toBe(0)
    expect(count('medium', isDiagonal)).toBeGreaterThan(40)
    expect(count('medium', isCurved)).toBe(0)
    expect(count('hard', isDiagonal)).toBeGreaterThan(40)
    expect(count('hard', isCurved)).toBeGreaterThan(20)
  })

  it('difficulty scales with the tier: more arrows, deeper solves, higher score', () => {
    const avg = (tier, key) => {
      let n = 0
      for (let s = 1; s <= 40; s += 1) n += levelStats(generateArrowsLevel(s * 101, tier))[key]
      return n / 40
    }
    for (const key of ['arrows', 'layers', 'difficulty']) {
      expect(avg('medium', key)).toBeGreaterThan(avg('easy', key))
      expect(avg('hard', key)).toBeGreaterThan(avg('medium', key))
    }
  })

  it('twist arrows are well-formed: no crossing diagonals, hooks with a real turn, routes clear of their own body', () => {
    for (let s = 1; s <= 60; s += 1) {
      const level = generateArrowsLevel(s * 977, 'hard')
      const corners = new Map()
      level.arrows.forEach((arrow, i) => {
        const own = new Set(arrow.cells.map(([x, y]) => y * level.cols + x))
        const route = arrowRoute(level, arrow)
        for (const c of route.cells) expect(own.has(c)).toBe(false)
        if (isDiagonal(arrow)) {
          expect(arrow.cells.length).toBeLessThanOrEqual(isBent(arrow) ? 5 : 4)
          for (let k = 1; k < arrow.cells.length; k += 1) {
            const [px, py] = arrow.cells[k - 1]
            const [x, y] = arrow.cells[k]
            if (px === x || py === y) continue // orthogonal steps cross no corner
            const key = `${Math.max(px, x)},${Math.max(py, y)}`
            expect(corners.has(key)).toBe(false)
            corners.set(key, i)
          }
        }
        if (isCurved(arrow)) {
          // Straight body, and the route actually turns onto a second leg.
          arrow.cells.slice(1).forEach(([x, y], k) => {
            const [px, py] = arrow.cells[k]
            expect([x - px, y - py]).toEqual(ARROWS_DIRS[arrow.dir])
          })
          expect(route.finalDir).toBe(turnedDir(arrow.dir, arrow.turn))
          const [lx, ly] = ARROWS_DIRS[route.finalDir]
          const last = route.cells[route.cells.length - 1]
          const [hx, hy] = arrow.cells[arrow.cells.length - 1]
          const prev = route.cells.length > 1 ? route.cells[route.cells.length - 2] : hy * level.cols + hx
          expect(last - prev).toBe(ly * level.cols + lx)
        }
      })
    }
  })

  it('accepts a custom spec object (solo levels)', () => {
    const spec = { cols: 5, rows: 6, maxLen: 3, fill: 0.7, samples: 3, diag: 0.3, name: 'level-x' }
    const level = generateArrowsLevel(42, spec)
    expect(level).toMatchObject({ cols: 5, rows: 6, tier: 'level-x' })
    expect(level).toEqual(generateArrowsLevel(42, spec))
    expect(solveArrows(level).solvable).toBe(true)
  })

  it('boards grow with the tier', () => {
    const avg = (tier) => {
      let n = 0
      for (let s = 1; s <= 40; s += 1) n += generateArrowsLevel(s, tier).arrows.length
      return n / 40
    }
    expect(avg('medium')).toBeGreaterThan(avg('easy'))
    expect(avg('hard')).toBeGreaterThan(avg('medium'))
  })
})

describe('board queries', () => {
  it('occupancy and arrowAtCell map cells to remaining arrows', () => {
    const occ = occupancy(TINY, none())
    expect(occ[0]).toBe(0)
    expect(occ[1 * 4 + 2]).toBe(1)
    expect(occ[2 * 4 + 0]).toBe(-1)
    expect(arrowAtCell(TINY, none(), 3, 1)).toBe(2)
    expect(arrowAtCell(TINY, [false, false, true], 3, 1)).toBe(-1)
    expect(arrowAtCell(TINY, none(), -1, 0)).toBe(-1)
    expect(arrowAtCell(TINY, none(), 4, 0)).toBe(-1)
  })

  it('exitCheck reports the blocker and the empty gap before it', () => {
    expect(exitCheck(TINY, none(), 0)).toEqual({ free: false, blocker: 2, gap: 1 })
    expect(exitCheck(TINY, none(), 1)).toEqual({ free: true, blocker: -1, gap: 1 })
    expect(exitCheck(TINY, none(), 2)).toEqual({ free: true, blocker: -1, gap: 0 })
    // Clearing the blocker opens the path.
    expect(exitCheck(TINY, [false, false, true], 0)).toEqual({ free: true, blocker: -1, gap: 2 })
  })

  it('freeArrows lists open arrows only', () => {
    expect(freeArrows(TINY, none())).toEqual([1, 2])
    expect(freeArrows(TINY, [false, false, true])).toEqual([0, 1])
  })
})

describe('applyArrowTap', () => {
  it('clears a free arrow without touching lives', () => {
    const r = applyArrowTap(TINY, none(), 3, 2)
    expect(r.result).toBe('cleared')
    expect(r.gone).toEqual([false, false, true])
    expect(r.lives).toBe(3)
  })

  it('a blocked tap costs a life and leaves the board alone', () => {
    const gone = none()
    const r = applyArrowTap(TINY, gone, 3, 0)
    expect(r).toMatchObject({ result: 'blocked', lives: 2, blocker: 2, gap: 1 })
    expect(r.gone).toBe(gone)
  })

  it('is a no-op for bad index, gone arrow, or no lives', () => {
    expect(applyArrowTap(TINY, none(), 3, -1)).toBeNull()
    expect(applyArrowTap(TINY, none(), 3, 3)).toBeNull()
    expect(applyArrowTap(TINY, [false, false, true], 3, 2)).toBeNull()
    expect(applyArrowTap(TINY, none(), 0, 2)).toBeNull()
    expect(applyArrowTap(null, none(), 3, 0)).toBeNull()
  })

  it('does not mutate the input', () => {
    const gone = none()
    applyArrowTap(TINY, gone, 3, 1)
    expect(gone).toEqual(none())
  })
})

describe('progress helpers', () => {
  it('countGone / isBoardCleared', () => {
    expect(countGone([true, false, true])).toBe(2)
    expect(isBoardCleared(TINY, [true, true, false])).toBe(false)
    expect(isBoardCleared(TINY, [true, true, true])).toBe(true)
  })

  it('normalizeGone maps by explicit key and tolerates junk', () => {
    expect(normalizeGone(null, 3)).toEqual([false, false, false])
    expect(normalizeGone({ 2: true }, 3)).toEqual([false, false, true])
    expect(normalizeGone({ 0: true, 9: true, x: true, 1: false }, 3)).toEqual([true, false, false])
    // Firebase may hand back a sparse array for dense numeric keys.
    expect(normalizeGone([true, undefined, true], 3)).toEqual([true, false, true])
    expect(normalizeGone('nope', 2)).toEqual([false, false])
  })
})

describe('arrowsRoundWinner', () => {
  const base = { total: 10, clearedX: 3, clearedO: 4, livesX: 3, livesO: 3 }
  it('is null mid-race', () => expect(arrowsRoundWinner(base)).toBeNull())
  it('first to clear wins', () => {
    expect(arrowsRoundWinner({ ...base, clearedX: 10 })).toBe('X')
    expect(arrowsRoundWinner({ ...base, clearedO: 10 })).toBe('O')
  })
  it('running out of lives forfeits', () => {
    expect(arrowsRoundWinner({ ...base, livesX: 0 })).toBe('O')
    expect(arrowsRoundWinner({ ...base, livesO: 0 })).toBe('X')
  })
  it('a clear on the last life still counts', () => {
    expect(arrowsRoundWinner({ ...base, clearedX: 10, livesO: 0, livesX: 0 })).toBe('X')
  })
  it('both out: more clears wins, level is a draw', () => {
    expect(arrowsRoundWinner({ ...base, livesX: 0, livesO: 0 })).toBe('O')
    expect(arrowsRoundWinner({ ...base, clearedX: 4, livesX: 0, livesO: 0 })).toBe('draw')
  })
})

describe('match flow', () => {
  it('arrowsMatchWinner: first to 2', () => {
    expect(arrowsMatchWinner({ X: 2, O: 1 })).toBe('X')
    expect(arrowsMatchWinner({ X: 0, O: 2 })).toBe('O')
    expect(arrowsMatchWinner({ X: 1, O: 1 })).toBeNull()
    expect(arrowsMatchWinner(undefined)).toBeNull()
  })

  it('getArrowsMatchEnd closes after the final round', () => {
    expect(isFinalArrowsRound({ arrowsRound: 2 })).toBe(true)
    expect(isFinalArrowsRound({ arrowsRound: 1 })).toBe(false)
    expect(getArrowsMatchEnd({ arrowsRound: 1, status: 'finished', scores: { X: 1, O: 0 } })).toBeNull()
    expect(getArrowsMatchEnd({ arrowsRound: 2, status: 'finished', scores: { X: 1, O: 0 } })).toBe('X')
    expect(getArrowsMatchEnd({ arrowsRound: 2, status: 'finished', scores: { X: 1, O: 1 } })).toBe('draw')
    expect(getArrowsMatchEnd({ arrowsRound: 2, status: 'playing', scores: { X: 1, O: 1 } })).toBeNull()
    expect(getArrowsMatchEnd({ arrowsRound: 0, status: 'finished', scores: { O: 2 } })).toBe('O')
  })

  it('arrowsFreshState starts round 0 with a seed and full lives', () => {
    const s = arrowsFreshState(() => 0.5)
    expect(s).toMatchObject({
      arrowsRound: 0,
      arrowsStartedAt: null,
      arrowsGoneX: null,
      arrowsGoneO: null,
      arrowsLivesX: ARROWS_LIVES,
      arrowsLivesO: ARROWS_LIVES,
    })
    expect(s.arrowsSeed).toBeGreaterThan(0)
  })

  it('arrowsNextRound advances and resets the race', () => {
    const next = arrowsNextRound({ arrowsRound: 0, scores: { X: 1 }, arrowsGoneX: { 1: true } })
    expect(next.arrowsRound).toBe(1)
    expect(next.arrowsGoneX).toBeNull()
    expect(next.arrowsStartedAt).toBeNull()
    expect(next.arrowsLivesX).toBe(ARROWS_LIVES)
  })

  it('arrowsNextRound returns null once the match is over', () => {
    expect(arrowsNextRound({ arrowsRound: 2, scores: { X: 1, O: 1 } })).toBeNull()
    expect(arrowsNextRound({ arrowsRound: 1, scores: { X: 2 } })).toBeNull()
  })
})

describe('geometry', () => {
  it('cellCenter', () => {
    expect(cellCenter([2, 3], 10)).toEqual([25, 35])
  })

  it('slicePolyline cuts by arc length across corners', () => {
    const pts = [[0, 0], [10, 0], [10, 10]]
    expect(slicePolyline(pts, 0, 20)).toEqual([[0, 0], [10, 0], [10, 10]])
    expect(slicePolyline(pts, 5, 15)).toEqual([[5, 0], [10, 0], [10, 5]])
    // Boundaries exactly on a corner never duplicate the corner point.
    expect(slicePolyline(pts, 10, 20)).toEqual([[10, 0], [10, 10]])
    expect(slicePolyline(pts, 0, 10)).toEqual([[0, 0], [10, 0]])
  })

  it('leavePose rests on the cells and slithers along the body', () => {
    const arrow = { cells: [[0, 1], [0, 0], [1, 0]], dir: 1 }
    expect(leavePose(arrow, 10, 0)).toEqual([[5, 15], [5, 5], [15, 5]])
    // Half a cell in: the tail has moved up the first leg, the head right
    // (the old head cell stays as a collinear waypoint).
    expect(leavePose(arrow, 10, 5)).toEqual([[5, 10], [5, 5], [15, 5], [20, 5]])
    // Past the body length the whole snake is straight on its heading.
    const far = leavePose(arrow, 10, 30)
    expect(far).toEqual([[25, 5], [45, 5]])
  })

  it('leavePose keeps the body length constant', () => {
    const arrow = { cells: [[0, 2], [0, 1], [1, 1], [1, 0]], dir: 0 }
    const len = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0)
    for (const t of [0, 3, 10, 17, 40]) expect(len(leavePose(arrow, 10, t))).toBeCloseTo(30)
  })

  it('exitVector handles short input', () => {
    expect(exitVector([])).toEqual({ dx: 0, dy: 0, tip: [0, 0] })
    expect(exitVector([[3, 4]])).toEqual({ dx: 0, dy: 0, tip: [3, 4] })
    expect(exitVector([[0, 0], [0, -5]])).toEqual({ dx: 0, dy: -1, tip: [0, -5] })
  })

  it('roundedPathD rounds corners and insets the tip', () => {
    expect(roundedPathD([[0, 0]], 3)).toBe('')
    expect(roundedPathD([[0, 0], [10, 0]], 3)).toBe('M0 0 L10 0')
    expect(roundedPathD([[0, 0], [10, 0]], 3, 2)).toBe('M0 0 L8 0')
    expect(roundedPathD([[0, 0], [10, 0], [10, 10]], 3)).toBe('M0 0 L7 0 Q10 0 10 3 L10 10')
  })
})

// ── Twists: diagonal and curved arrows ────────────────────────────────────

describe('diagonal arrows', () => {
  // 4×4. A: (0,3)→(1,2) flying up-right; its route is (2,1), (3,0).
  // B: (1,1)→(2,2) flying down-right — its body crosses A's route at the
  // corner between (1,2) and (2,1). C: (3,2)→(3,3) heading down, sitting on
  // B's route.
  const board = () => ({
    cols: 4,
    rows: 4,
    arrows: [
      { cells: [[0, 3], [1, 2]], dir: 4 },
      { cells: [[1, 1], [2, 2]], dir: 5 },
      { cells: [[3, 2], [3, 3]], dir: 2 },
    ],
  })

  it('routes along the diagonal to the edge', () => {
    const level = board()
    expect(arrowRoute(level, level.arrows[0]).cells).toEqual([1 * 4 + 2, 0 * 4 + 3])
    expect(arrowRoute(level, level.arrows[0]).finalDir).toBe(4)
  })

  it('is blocked by a diagonal body crossing its route at a corner', () => {
    const level = board()
    expect(exitCheck(level, [false, false, false], 0)).toEqual({ free: false, blocker: 1, gap: 0 })
    expect(cornerOccupancy(level, [false, false, false]).filter((v) => v !== -1)).toHaveLength(2)
    // B leaves first (its route (3,3) is held by C, so C goes before B).
    expect(exitCheck(level, [false, false, false], 1)).toEqual({ free: false, blocker: 2, gap: 0 })
    expect(exitCheck(level, [false, false, true], 1).free).toBe(true)
    expect(exitCheck(level, [false, true, true], 0)).toEqual({ free: true, blocker: -1, gap: 2 })
  })

  it('is not blocked by cells beside its diagonal', () => {
    const level = {
      cols: 3,
      rows: 3,
      arrows: [
        { cells: [[0, 2], [1, 1]], dir: 4 },
        { cells: [[1, 0], [0, 0]], dir: 3 },
        { cells: [[2, 2], [2, 1]], dir: 0 },
      ],
    }
    // (2,1) and (1,0) flank the corner A crosses, but only (2,0) is on its
    // route, and it is empty.
    expect(exitCheck(level, [false, false, false], 0).free).toBe(true)
  })

  it('a bump travels √2 per diagonal step', () => {
    const level = board()
    expect(routeDistance(level.arrows[0], 1, 10)).toBeCloseTo(10 * Math.SQRT2)
    expect(routeDistance(level.arrows[2], 1.5, 10)).toBe(15)
  })
})

describe('curved arrows', () => {
  // 4×3. A: (0,1)→(1,1) heading right with a clockwise hook: it flies to
  // (3,1), turns down, and runs (3,2) off the board.
  const curved = (turn, extra = []) => ({
    cols: 4,
    rows: 3,
    arrows: [{ cells: [[0, 1], [1, 1]], dir: 1, turn }, ...extra],
  })

  it('routes to the edge, then turns once the way the hook points', () => {
    const cw = curved(1)
    expect(arrowRoute(cw, cw.arrows[0])).toMatchObject({ cells: [6, 7, 11], finalDir: 2 })
    const ccw = curved(-1)
    expect(arrowRoute(ccw, ccw.arrows[0])).toMatchObject({ cells: [6, 7, 3], finalDir: 0 })
    expect(isCurved(cw.arrows[0])).toBe(true)
    expect(isCurved({ cells: [[0, 0], [1, 0]], dir: 1 })).toBe(false)
  })

  it('needs both legs clear', () => {
    // Blocker on the second leg (the edge cell below the turn).
    const legTwo = curved(1, [{ cells: [[2, 2], [3, 2]], dir: 1 }])
    expect(exitCheck(legTwo, [false, false], 0)).toEqual({ free: false, blocker: 1, gap: 2 })
    // The same blocker does not touch the counter-clockwise route.
    const other = curved(-1, [{ cells: [[2, 2], [3, 2]], dir: 1 }])
    expect(exitCheck(other, [false, false], 0).free).toBe(true)
    // Blocker in the first leg.
    const legOne = curved(1, [{ cells: [[2, 0], [2, 1]], dir: 2 }])
    expect(exitCheck(legOne, [false, false], 0)).toEqual({ free: false, blocker: 1, gap: 0 })
  })

  it('a head already on the edge turns straight away', () => {
    const level = { cols: 3, rows: 3, arrows: [{ cells: [[0, 1], [1, 1], [2, 1]], dir: 1, turn: 1 }] }
    expect(arrowRoute(level, level.arrows[0])).toMatchObject({ cells: [8], finalDir: 2 })
  })

  it('leavePose follows the route round the turn', () => {
    const level = curved(1)
    const arrow = level.arrows[0]
    expect(leavePose(arrow, 10, 0, level)).toEqual([[5, 15], [15, 15]])
    // Far along, the snake has turned the corner and runs down.
    const far = leavePose(arrow, 10, 40, level)
    expect(far[far.length - 1][0]).toBeCloseTo(35)
    expect(far[far.length - 1][1]).toBeGreaterThan(25)
    for (const t of [0, 7, 21, 40]) expect(polylineLength(leavePose(arrow, 10, t, level))).toBeCloseTo(10)
  })
})

describe('solveArrows / levelStats', () => {
  it('solves the tiny board in waves', () => {
    const r = solveArrows(TINY)
    expect(r).toMatchObject({ solvable: true, layers: 2, initialFree: 2 })
    expect(r.order).toEqual([1, 2, 0])
  })

  it('detects a deadlock', () => {
    const level = {
      cols: 4,
      rows: 1,
      arrows: [
        { cells: [[0, 0], [1, 0]], dir: 1 },
        { cells: [[3, 0], [2, 0]], dir: 3 },
      ],
    }
    expect(solveArrows(level)).toMatchObject({ solvable: false, layers: 0, initialFree: 0 })
  })

  it('levelStats counts twists and scores deeper boards higher', () => {
    const st = levelStats(TINY)
    expect(st).toMatchObject({ solvable: true, arrows: 3, layers: 2, diagonals: 0, curves: 0 })
    const bigger = levelStats(generateArrowsLevel(5, 'hard'))
    expect(bigger.difficulty).toBeGreaterThan(st.difficulty)
  })
})

describe('room difficulty', () => {
  it('tierForGame: a fixed tier every round, or the easy → hard ramp', () => {
    expect(tierForGame('hard', 0)).toBe('hard')
    expect(tierForGame('easy', 2)).toBe('easy')
    expect(tierForGame('mixed', 1)).toBe('medium')
    expect(tierForGame(undefined, 2)).toBe('hard')
    expect(tierForGame('nope', 0)).toBe('easy')
  })

  it('getArrowsDifficulty defaults to mixed', () => {
    expect(getArrowsDifficulty('medium')).toBe('medium')
    expect(getArrowsDifficulty(null)).toBe('mixed')
    expect(getArrowsDifficulty('insane')).toBe('mixed')
  })
})

describe('curved diagonal arrows', () => {
  // The neck always continues the heading, so the head still points along a
  // diagonal even when the body behind it curls.
  it('the generator makes bent bodies that are well-formed on medium and hard', () => {
    let bent = 0
    let diagonals = 0
    for (const tier of ['medium', 'hard']) {
      for (let s = 1; s <= 60; s += 1) {
        const level = generateArrowsLevel(s * 613, tier)
        const seen = new Set()
        level.arrows.forEach((arrow) => {
          if (!isDiagonal(arrow)) {
            expect(isBent(arrow)).toBe(false)
            return
          }
          diagonals += 1
          const cells = arrow.cells
          // Every step is a king move, none repeats a cell.
          for (let k = 1; k < cells.length; k += 1) {
            expect(Math.max(Math.abs(cells[k][0] - cells[k - 1][0]), Math.abs(cells[k][1] - cells[k - 1][1]))).toBe(1)
          }
          expect(new Set(cells.map((c) => c.join(','))).size).toBe(cells.length)
          // The last step is the heading, so the arrow points where it flies.
          const [dx, dy] = ARROWS_DIRS[arrow.dir]
          const n = cells.length
          expect([cells[n - 1][0] - cells[n - 2][0], cells[n - 1][1] - cells[n - 2][1]]).toEqual([dx, dy])
          if (isBent(arrow)) {
            bent += 1
            expect(n).toBeGreaterThanOrEqual(3)
            expect(n).toBeLessThanOrEqual(5)
          }
          // No two diagonal steps anywhere on the board share a corner.
          for (let k = 1; k < n; k += 1) {
            const [px, py] = cells[k - 1]
            const [x, y] = cells[k]
            if (px === x || py === y) continue
            const key = `${Math.max(px, x)},${Math.max(py, y)}`
            expect(seen.has(key)).toBe(false)
            seen.add(key)
          }
        })
      }
    }
    // Curved bodies are common, not a rarity.
    expect(bent / diagonals).toBeGreaterThan(0.4)
  }, 30000)

  it('easy boards and spec bend: 0 never bend', () => {
    for (let s = 1; s <= 30; s += 1) {
      expect(generateArrowsLevel(s, 'easy').arrows.some(isBent)).toBe(false)
      expect(generateArrowsLevel(s, { cols: 7, rows: 9, maxLen: 5, fill: 0.84, diag: 0.3 }).arrows.some(isBent)).toBe(false)
    }
    expect(generateArrowsLevel(5, { cols: 7, rows: 9, maxLen: 5, fill: 0.84, diag: 0.3, bend: 1 }).arrows.some(isBent)).toBe(true)
  })

  // 4×4. A is a bent diagonal: tail (0,2) → (0,1) orthogonal, then (1,0)
  // diagonal... built here by hand: cells (0,3) → (0,2) → (1,1) → (2,0)?
  // Heading up-right, route is the diagonal ray from the head.
  const bentBoard = () => ({
    cols: 5,
    rows: 5,
    arrows: [
      // A: tail (0,4) → (0,3) → (1,2) → (2,1): up, then two up-right steps.
      { cells: [[0, 4], [0, 3], [1, 2], [2, 1]], dir: 4 },
      // B: sits on A's route cell (3,0).
      { cells: [[3, 0], [4, 0]], dir: 1 },
    ],
  })

  it('isBent tells a curved body from a straight run', () => {
    const level = bentBoard()
    expect(isBent(level.arrows[0])).toBe(true)
    expect(isBent({ cells: [[0, 2], [1, 1], [2, 0]], dir: 4 })).toBe(false)
    expect(isBent({ cells: [[0, 0], [0, 1]], dir: 2 })).toBe(false)
  })

  it('the route is the plain diagonal ray, whatever the body does', () => {
    const level = bentBoard()
    expect(arrowRoute(level, level.arrows[0]).cells).toEqual([0 * 5 + 3])
    expect(arrowRoute(level, level.arrows[0]).finalDir).toBe(4)
    expect(exitCheck(level, [false, false], 0)).toEqual({ free: false, blocker: 1, gap: 0 })
    expect(exitCheck(level, [false, true], 0).free).toBe(true)
  })

  it('orthogonal steps of a bent body cross no corner; diagonal steps do', () => {
    const level = bentBoard()
    // Two diagonal steps → two corners; the orthogonal step adds none.
    expect(cornerOccupancy(level, [false, false]).filter((v) => v !== -1)).toHaveLength(2)
  })

  it('a bent body blocks another diagonal at a diagonal-step corner only', () => {
    // C flies up-right from (0,2) through the corner shared by (1,1)/(0,2)…
    // D's body steps (1,0)→(0,1) down-left across the corner between
    // (0,0),(1,1) lattice point (1,1): C's step (0,2)→(1,1) crosses it too.
    const level = {
      cols: 4,
      rows: 4,
      arrows: [
        { cells: [[2, 3], [2, 2], [1, 1]], dir: 7 }, // up-left: tail below, bent up then up-left? (2,3)→(2,2) up, (2,2)→(1,1) up-left
        { cells: [[0, 1], [1, 0]], dir: 4 }, // diagonal crossing at corner (1,1)
      ],
    }
    expect(isBent(level.arrows[0])).toBe(true)
    // Arrow 0 heads up-left from (1,1) toward (0,0); arrow 1's step
    // (0,1)→(1,0) passes the corner between (0,0) and (1,1) — the route's
    // first corner — so arrow 1's body blocks arrow 0.
    expect(exitCheck(level, [false, false], 0)).toEqual({ free: false, blocker: 1, gap: 0 })
    expect(exitCheck(level, [false, true], 0).free).toBe(true)
  })

  it('leavePose slithers a bent body along its curve and out the diagonal', () => {
    const level = bentBoard()
    const rest = leavePose(level.arrows[0], 10, 0, level)
    expect(rest).toHaveLength(4)
    const len = polylineLength(rest)
    const moved = leavePose(level.arrows[0], 10, 12, level)
    expect(polylineLength(moved)).toBeCloseTo(len)
    // The head keeps flying up-right while the tail still bends behind it.
    const v = exitVector(moved)
    expect(v.dx).toBeCloseTo(Math.SQRT1_2)
    expect(v.dy).toBeCloseTo(-Math.SQRT1_2)
  })

  it('solver stays exact: every generated bent board clears greedily', () => {
    for (const tier of ['medium', 'hard']) {
      for (let s = 1; s <= 80; s += 1) {
        const level = generateArrowsLevel(s * 211, tier)
        const { solvable } = solveArrows(level)
        expect(solvable, `${tier} ${s * 211}`).toBe(true)
        // Clearing the arrows in solver order never taps a blocked arrow.
        let gone = Array(level.arrows.length).fill(false)
        let lives = 3
        for (const i of solveArrows(level).order) {
          const r = applyArrowTap(level, gone, lives, i)
          expect(r.result).toBe('cleared')
          gone = r.gone
        }
        expect(isBoardCleared(level, gone)).toBe(true)
      }
    }
  }, 30000)

  it('clearing an arrow only frees cells and corners (monotone, so nothing dead-ends)', () => {
    const level = generateArrowsLevel(4242, 'hard')
    const n = level.arrows.length
    let gone = Array(n).fill(false)
    let free = new Set(freeArrows(level, gone))
    for (const i of solveArrows(level).order) {
      gone = [...gone]
      gone[i] = true
      const next = new Set(freeArrows(level, gone))
      for (const f of free) if (f !== i) expect(next.has(f)).toBe(true)
      free = next
    }
  })
})

describe('sleeping arrows', () => {
  // 4×4: arrow 0 points up with a clear path but is asleep; arrow 1 touches
  // it and is free; arrow 2 is free and touches nothing of arrow 0.
  const board = () => ({
    cols: 4, rows: 4,
    arrows: [
      { cells: [[1, 3], [1, 2]], dir: 0, sleep: true },
      { cells: [[2, 2], [3, 2]], dir: 1 },
      { cells: [[2, 0], [3, 0]], dir: 1 },
    ],
  })

  it('waits until an arrow touching it leaves, even with a clear path', () => {
    const level = board()
    expect(neighborsOf(level)[0]).toEqual([1])
    expect(isAwake(level, [false, false, false], 0)).toBe(false)
    const tap = applyArrowTap(level, [false, false, false], 3, 0)
    expect(tap.result).toBe('blocked')
    expect(tap.asleep).toBe(true)
    expect(tap.blocker).toBe(1)
    expect(tap.lives).toBe(2)
    // Clearing an arrow that does not touch it changes nothing.
    expect(exitCheck(level, [false, false, true], 0).free).toBe(false)
    // Its neighbour leaving wakes it.
    expect(isAwake(level, [false, true, false], 0)).toBe(true)
    expect(applyArrowTap(level, [false, true, false], 3, 0).result).toBe('cleared')
  })

  it('still needs a clear route once awake', () => {
    const level = board()
    level.arrows.push({ cells: [[1, 0], [0, 0]], dir: 3 }) // sits on arrow 0's route
    expect(exitCheck(level, [false, true, false, false], 0)).toMatchObject({ free: false, blocker: 3 })
    expect(exitCheck(level, [false, true, false, true], 0).free).toBe(true)
  })

  it('the solver sees through it, and a sleeper with nothing to wake it is a dead end', () => {
    expect(solveArrows(board()).solvable).toBe(true)
    expect(solveArrows(board()).layers).toBe(2)
    const lonely = { cols: 3, rows: 3, arrows: [{ cells: [[1, 2], [1, 1]], dir: 0, sleep: true }] }
    expect(solveArrows(lonely).solvable).toBe(false)
  })

  it('the generator places exactly the sleepers asked for, keeps boards solvable, and draws none by default', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const spec = { cols: 9, rows: 12, maxLen: 7, fill: 0.9, samples: 11, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.5, sleepers: 2, name: 'x' }
      const level = generateArrowsLevel(seed, spec)
      expect(solveArrows(level).solvable, `seed ${seed}`).toBe(true)
      expect(level.arrows.filter(isSleeper).length, `seed ${seed}`).toBeLessThanOrEqual(2)
      const st = levelStats(level)
      expect(st.sleepers).toBe(level.arrows.filter(isSleeper).length)
      expect(generateArrowsLevel(seed, 'hard').arrows.some(isSleeper)).toBe(false)
    }
  })
})

describe('double arrows', () => {
  // 4×5: a C-shaped double arrow with heads at (2,1) and (2,3), both pointing
  // right; arrow 2 sits ahead of the lower head.
  const board = () => ({
    cols: 4, rows: 5,
    arrows: [
      { cells: [[2, 1], [1, 1], [1, 2], [1, 3], [2, 3]], dir: 1, double: true },
      { cells: [[0, 0], [1, 0]], dir: 1 },
      { cells: [[3, 4], [3, 3]], dir: 0 },
    ],
  })
  const idx = (level, x, y) => y * level.cols + x

  it('its route is every cell swept ahead of its body: both heads and inside the curve', () => {
    const level = board()
    const route = arrowRoute(level, level.arrows[0])
    expect([...route.cells].sort((a, b) => a - b)).toEqual([idx(level, 3, 1), idx(level, 2, 2), idx(level, 3, 2), idx(level, 3, 3)].sort((a, b) => a - b))
    expect(isDouble(level.arrows[0])).toBe(true)
    expect(isCurved(level.arrows[0])).toBe(false)
  })

  it('is blocked by anything in front of either head or inside its curve, and leaves whole', () => {
    const level = board()
    const tap = applyArrowTap(level, [false, false, false], 3, 0)
    expect(tap).toMatchObject({ result: 'blocked', blocker: 2, gap: 0 })
    // Something inside the curve blocks it too.
    const inside = board()
    inside.arrows[2] = { cells: [[3, 2], [2, 2]], dir: 3 }
    expect(exitCheck(inside, [false, false, false], 0)).toMatchObject({ free: false, blocker: 2 })
    const cleared = applyArrowTap(level, [false, false, true], 3, 0)
    expect(cleared.result).toBe('cleared')
    expect(cleared.gone).toEqual([true, false, true])
    expect(solveArrows(board()).solvable).toBe(true)
  })

  it('slides out as one rigid piece', () => {
    const arrow = board().arrows[0]
    const rest = arrowPose(arrow, 10, 0)
    const moved = arrowPose(arrow, 10, 7)
    expect(moved).toHaveLength(rest.length)
    moved.forEach(([x, y], k) => {
      expect(x).toBeCloseTo(rest[k][0] + 7)
      expect(y).toBeCloseTo(rest[k][1])
    })
  })

  it('the generator grows exactly the doubles asked for, C-shaped, and boards stay solvable', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const spec = { cols: 9, rows: 12, maxLen: 7, fill: 0.9, samples: 11, diag: 0.16, curve: 0.18, bend: 0.9, deep: 0.5, doubles: 2, name: 'x' }
      const level = generateArrowsLevel(seed, spec)
      expect(solveArrows(level).solvable, `seed ${seed}`).toBe(true)
      const doubles = level.arrows.filter(isDouble)
      expect(doubles.length, `seed ${seed}`).toBe(2)
      for (const d of doubles) {
        expect(d.dir).toBeLessThan(4)
        expect(d.cells.length).toBeGreaterThanOrEqual(4)
        expect(d.cells.length).toBeLessThanOrEqual(7)
        // Both ends are heads pointing `dir`: each end's neighbour sits straight behind it.
        const [dx, dy] = ARROWS_DIRS[d.dir]
        const [a, a1] = d.cells
        const [b, b1] = [d.cells.at(-1), d.cells.at(-2)]
        expect([a[0] - a1[0], a[1] - a1[1]]).toEqual([dx, dy])
        expect([b[0] - b1[0], b[1] - b1[1]]).toEqual([dx, dy])
      }
    }
  })
})

describe('mirrors', () => {
  // 4×4 with a '/' mirror at (2,2). Arrow 0 heads right into it and bounces
  // up through (2,1), (2,0) and off the top edge.
  const board = (extra = [], m = '/') => ({
    cols: 4,
    rows: 4,
    mirrors: [{ x: 2, y: 2, m }],
    arrows: [{ cells: [[0, 2], [1, 2]], dir: 1 }, ...extra],
  })

  it("'/' and '\\' turn a straight route 90°", () => {
    const slash = board()
    expect(arrowRoute(slash, slash.arrows[0])).toMatchObject({ cells: [10, 6, 2], finalDir: 0, dead: false })
    const back = board([], '\\')
    expect(arrowRoute(back, back.arrows[0])).toMatchObject({ cells: [10, 14], finalDir: 2 })
    // Every heading through '/': up→right, right→up, down→left, left→down.
    const up = { cols: 4, rows: 4, mirrors: [{ x: 1, y: 1, m: '/' }], arrows: [{ cells: [[1, 3], [1, 2]], dir: 0 }] }
    expect(arrowRoute(up, up.arrows[0])).toMatchObject({ cells: [5, 6, 7], finalDir: 1 })
    const left = { cols: 4, rows: 4, mirrors: [{ x: 1, y: 1, m: '/' }], arrows: [{ cells: [[3, 1], [2, 1]], dir: 3 }] }
    expect(arrowRoute(left, left.arrows[0])).toMatchObject({ cells: [5, 9, 13], finalDir: 2 })
    expect(mirrorMap(slash).get(10)).toBe('/')
    expect(mirrorMap({ cols: 4, rows: 4, arrows: [] })).toBeNull()
  })

  it('the mirror itself never blocks; arrows on the bounced leg do', () => {
    const blocked = board([{ cells: [[1, 0], [2, 0]], dir: 1 }])
    expect(exitCheck(blocked, [false, false], 0)).toEqual({ free: false, blocker: 1, gap: 2 })
    // The cell straight past the mirror is no longer on the route.
    const past = board([{ cells: [[3, 3], [3, 2]], dir: 0 }])
    expect(exitCheck(past, [false, false], 0).free).toBe(true)
    // The lesson script: blocked, clear the blocker, then the bounce is open.
    let gone = [false, false]
    const r1 = applyArrowTap(blocked, gone, 3, 0)
    expect(r1).toMatchObject({ result: 'blocked', blocker: 1, lives: 2 })
    gone = applyArrowTap(blocked, gone, 3, 1).gone
    expect(applyArrowTap(blocked, gone, 3, 0).result).toBe('cleared')
  })

  it('a hook still turns at the edge after a bounce', () => {
    const level = { cols: 4, rows: 4, mirrors: [{ x: 2, y: 2, m: '/' }], arrows: [{ cells: [[0, 2], [1, 2]], dir: 1, turn: 1 }] }
    // In, bounce up to the top edge at (2,0), turn clockwise: right along it.
    expect(arrowRoute(level, level.arrows[0])).toMatchObject({ cells: [10, 6, 2, 3], finalDir: 1 })
  })

  it('a diagonal slides along a slanted mirror but dies hitting it face-on; a route that loops is dead', () => {
    // Up-right runs along '/': it passes the tile and carries on.
    const along = { cols: 4, rows: 4, mirrors: [{ x: 2, y: 1, m: '/' }], arrows: [{ cells: [[0, 3], [1, 2]], dir: 4 }] }
    expect(arrowRoute(along, along.arrows[0])).toMatchObject({ cells: [6, 3], finalDir: 4, dead: false })
    expect(exitCheck(along, [false], 0).free).toBe(true)
    // Down-right meets '/' face-on: it would bounce back over itself.
    const diag = { cols: 4, rows: 4, mirrors: [{ x: 2, y: 2, m: '/' }], arrows: [{ cells: [[0, 0], [1, 1]], dir: 5 }] }
    expect(arrowRoute(diag, diag.arrows[0]).dead).toBe(true)
    expect(exitCheck(diag, [false], 0).free).toBe(false)
    // Four mirrors in a ring trap a head that starts inside it: right, down,
    // left, up and back round for ever. (Mirror paths are reversible, so a
    // ray from outside the ring always gets out again.)
    const ring = {
      cols: 6,
      rows: 6,
      mirrors: [{ x: 1, y: 1, m: '/' }, { x: 4, y: 1, m: '\\' }, { x: 4, y: 4, m: '/' }, { x: 1, y: 4, m: '\\' }],
      arrows: [{ cells: [[2, 1], [3, 1]], dir: 1 }],
    }
    expect(arrowRoute(ring, ring.arrows[0]).dead).toBe(true)
    expect(exitCheck(ring, [false], 0)).toMatchObject({ free: false, blocker: -1 })
    expect(solveArrows(ring).solvable).toBe(false)
  })

  it('leavePose turns at the mirror and leaves on the bounced heading', () => {
    const level = board()
    const arrow = level.arrows[0]
    const far = leavePose(arrow, 10, 30, level)
    // After 3 cells the head has turned up at (2,2) and is heading off the top.
    expect(far[far.length - 1][0]).toBeCloseTo(25)
    expect(far[far.length - 1][1]).toBeLessThan(15)
    for (const t of [0, 12, 30]) expect(polylineLength(leavePose(arrow, 10, t, level))).toBeCloseTo(10)
  })

  it('the generator places mirrors off the edge, never under an arrow, and every route is live', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const level = generateArrowsLevel(seed, { cols: 9, rows: 11, maxLen: 6, fill: 0.88, samples: 10, diag: 0.1, curve: 0.1, bend: 0.9, mirrors: 2 })
      expect(level.mirrors.length).toBe(2)
      const occ = occupancy(level, level.arrows.map(() => false))
      for (const m of level.mirrors) {
        expect(m.x).toBeGreaterThan(0)
        expect(m.x).toBeLessThan(level.cols - 1)
        expect(m.y).toBeGreaterThan(0)
        expect(m.y).toBeLessThan(level.rows - 1)
        expect(occ[m.y * level.cols + m.x]).toBe(-1)
      }
      for (const a of level.arrows) expect(arrowRoute(level, a).dead).toBe(false)
      expect(solveArrows(level).solvable).toBe(true)
    }
  })
})

describe('crates', () => {
  // 4×4 with a crate at (2,1) that needs 1 clear. Arrow 0 heads right into it.
  const board = (k = 1) => ({
    cols: 4,
    rows: 4,
    crates: [{ x: 2, y: 1, k }],
    arrows: [
      { cells: [[0, 1], [1, 1]], dir: 1 },
      { cells: [[1, 3], [2, 3]], dir: 1 },
      { cells: [[0, 2], [0, 3]], dir: 2 },
    ],
  })

  it('blocks until that many arrows have left, then opens for good', () => {
    const level = board()
    expect(crateMap(level).get(6)).toBe(1)
    expect(exitCheck(level, [false, false, false], 0)).toEqual({ free: false, blocker: -1, gap: 0, crate: 6 })
    const r1 = applyArrowTap(level, [false, false, false], 3, 0)
    expect(r1).toMatchObject({ result: 'blocked', blocker: -1, crate: 6, lives: 2 })
    // Any clear counts it down.
    const gone = applyArrowTap(level, [false, false, false], 3, 1).gone
    expect(applyArrowTap(level, gone, 3, 0).result).toBe('cleared')
  })

  it('counts clears, not which arrows, and a crate off the route never matters', () => {
    const level = board(2)
    expect(exitCheck(level, [false, true, false], 0).free).toBe(false)
    expect(exitCheck(level, [false, true, true], 0).free).toBe(true)
    expect(exitCheck(level, [false, false, false], 1).free).toBe(true)
  })

  it('reports the gap before the crate like any blocker', () => {
    const level = { cols: 5, rows: 1, crates: [{ x: 3, y: 0, k: 1 }], arrows: [{ cells: [[0, 0], [1, 0]], dir: 1 }] }
    expect(exitCheck(level, [false], 0)).toMatchObject({ free: false, gap: 1, crate: 3 })
  })

  it('the generator gives crates a count that deepens the board and stays solvable', () => {
    for (let seed = 1; seed <= 15; seed += 1) {
      const spec = { cols: 8, rows: 10, maxLen: 6, fill: 0.86, samples: 9, diag: 0.12, curve: 0.1, bend: 0.9 }
      const plain = generateArrowsLevel(seed, spec)
      const level = generateArrowsLevel(seed, { ...spec, crates: 1 })
      // The crate pass draws from its own stream: the arrows are unchanged.
      expect(level.arrows).toEqual(plain.arrows)
      if (!level.crates) continue
      const occ = occupancy(level, level.arrows.map(() => false))
      for (const c of level.crates) {
        expect(occ[c.y * level.cols + c.x]).toBe(-1)
        expect(c.k).toBeGreaterThan(0)
        expect(c.k).toBeLessThan(level.arrows.length)
      }
      expect(solveArrows(level).solvable).toBe(true)
      expect(solveArrows(level).layers).toBeGreaterThan(solveArrows(plain).layers)
    }
  })

  it('clearing only ever frees: mirrors and crates keep the greedy solver exact', () => {
    const level = generateArrowsLevel(77, { cols: 10, rows: 13, maxLen: 8, fill: 0.9, samples: 12, diag: 0.12, curve: 0.15, bend: 0.9, mirrors: 2, crates: 2 })
    const n = level.arrows.length
    let gone = Array(n).fill(false)
    let free = new Set(freeArrows(level, gone))
    for (const i of solveArrows(level).order) {
      gone = [...gone]
      gone[i] = true
      const next = new Set(freeArrows(level, gone))
      for (const f of free) if (f !== i) expect(next.has(f)).toBe(true)
      free = next
    }
    expect(isBoardCleared(level, gone)).toBe(true)
  })

  it('levelStats counts mirrors and crates', () => {
    const level = board()
    expect(levelStats(level)).toMatchObject({ crates: 1, mirrors: 0, solvable: true })
    const m = { cols: 4, rows: 4, mirrors: [{ x: 2, y: 2, m: '/' }], arrows: [{ cells: [[0, 2], [1, 2]], dir: 1 }] }
    expect(levelStats(m)).toMatchObject({ mirrors: 1, crates: 0 })
    // Each piece adds to the score: a mirror 3, a crate 4.
    expect(levelStats(m).difficulty - levelStats({ ...m, mirrors: [] }).difficulty).toBe(3)
  })
})

describe('portals', () => {
  // 6×4 with a two-way pair: ring A at (2,0), ring B at (2,3). Arrow 0 heads
  // right at row 0 and hops A → B (keeping its heading) along row 3 to the
  // right edge; with `extra` arrows and `portal` tweaks for the variants.
  const board = (extra = [], portal = {}) => ({
    cols: 6,
    rows: 4,
    portals: [{ a: [2, 0], b: [2, 3], c: 0, ...portal }],
    arrows: [{ cells: [[0, 0], [1, 0]], dir: 1 }, ...extra],
  })

  it('a ring sends the route to its partner and keeps the heading', () => {
    const level = board()
    expect(arrowRoute(level, level.arrows[0])).toMatchObject({ cells: [2, 20, 21, 22, 23], jumps: [1], ports: [0], finalDir: 1, dead: false })
    // Two-way: ring B sends to ring A just the same.
    const back = board([{ cells: [[0, 3], [1, 3]], dir: 1 }])
    expect(arrowRoute(back, back.arrows[1])).toMatchObject({ cells: [20, 2, 3, 4, 5], jumps: [1], finalDir: 1 })
    expect(portalMap(level).get(2)).toEqual({ to: 20, turn: false, pair: 0 })
    expect(portalMap(level).get(20)).toEqual({ to: 2, turn: false, pair: 0 })
    expect(portalMap({ cols: 3, rows: 3, arrows: [] })).toBeNull()
    expect([...portalRings(level)].sort((a, b) => a - b)).toEqual([2, 20])
  })

  it('exit-only: only ring A sends, crossing ring B does nothing', () => {
    const level = board([{ cells: [[0, 3], [1, 3]], dir: 1 }], { oneway: true })
    expect(arrowRoute(level, level.arrows[0]).jumps).toEqual([1])
    // Arrow 1 runs over ring B (2,3) and carries straight on.
    expect(arrowRoute(level, level.arrows[1])).toMatchObject({ cells: [20, 21, 22, 23], jumps: [], dead: false })
    expect(portalMap(level).has(20)).toBe(false)
    // ...but both rings still count as rings (no crate or arrow goes there).
    expect(portalRings(level).has(20)).toBe(true)
  })

  it('turning: the route leaves a quarter turn clockwise', () => {
    const level = { cols: 6, rows: 6, portals: [{ a: [2, 0], b: [3, 2], c: 0, turn: true }], arrows: [{ cells: [[0, 0], [1, 0]], dir: 1 }] }
    // Right into A, out of B heading down along column 3.
    expect(arrowRoute(level, level.arrows[0])).toMatchObject({ cells: [2, 15, 21, 27, 33], finalDir: 2, jumps: [1] })
    // Heading up into B comes out of A heading right.
    const up = { ...level, arrows: [{ cells: [[3, 5], [3, 4]], dir: 0 }] }
    expect(arrowRoute(up, up.arrows[0])).toMatchObject({ cells: [21, 15, 2, 3, 4, 5], finalDir: 1 })
  })

  it('every cell of the route counts: blockers before and after the hop block, the straight path does not', () => {
    // The bump gap counts walked cells: a hop covers no distance.
    const after = board([{ cells: [[4, 3], [5, 3]], dir: 1 }])
    expect(exitCheck(after, [false, false], 0)).toEqual({ free: false, blocker: 1, gap: 2 })
    const before = board([{ cells: [[1, 1], [1, 0]], dir: 0 }])
    expect(exitCheck(before, [false, false], 0).free).toBe(true)
    // An arrow standing straight ahead of ring A, where the route no longer goes.
    const straight = board([{ cells: [[3, 0], [4, 0]], dir: 1 }])
    expect(exitCheck(straight, [false, false], 0).free).toBe(true)
    // The lesson script: blocked, clear the blocker, then the hop is open.
    let gone = [false, false]
    expect(applyArrowTap(after, gone, 3, 0)).toMatchObject({ result: 'blocked', blocker: 1, lives: 2 })
    gone = applyArrowTap(after, gone, 3, 1).gone
    expect(applyArrowTap(after, gone, 3, 0).result).toBe('cleared')
  })

  it('a hooked arrow still turns at the edge after a hop', () => {
    const level = { ...board(), arrows: [{ cells: [[0, 0], [1, 0]], dir: 1, turn: 1 }] }
    // Hop to ring B, run to the right edge on row 3, turn clockwise: down is off the board.
    expect(arrowRoute(level, level.arrows[0])).toMatchObject({ cells: [2, 20, 21, 22, 23], finalDir: 2 })
  })

  it('a diagonal hops a portal keeping its slant; doubles cannot use one; a route that loops is dead', () => {
    // Up-right into ring A at (2,2), out of ring B at (3,4), on up-right: (4,3).
    const diag = { cols: 5, rows: 5, portals: [{ a: [2, 2], b: [3, 4], c: 0 }], arrows: [{ cells: [[0, 4], [1, 3]], dir: 4 }] }
    expect(arrowRoute(diag, diag.arrows[0])).toMatchObject({ cells: [12, 23, 19], corners: [20, -1, 28], jumps: [1], finalDir: 4, dead: false })
    // A turning pair turns it a quarter clockwise: up-right becomes down-right.
    // Back into A heading down-right, out of B a quarter on again: down-left.
    const turning = { ...diag, portals: [{ a: [2, 2], b: [1, 1], c: 0, turn: true }] }
    expect(arrowRoute(turning, turning.arrows[0])).toMatchObject({ cells: [12, 6, 12, 6, 10], jumps: [1, 3], finalDir: 6, dead: false })
    const turned = { ...diag, portals: [{ a: [2, 2], b: [1, 0], c: 0, turn: true }] }
    expect(arrowRoute(turned, turned.arrows[0])).toMatchObject({ cells: [12, 1, 7, 13, 19], finalDir: 5, dead: false })
    const double = { cols: 6, rows: 6, portals: [{ a: [4, 2], b: [4, 5], c: 0 }], arrows: [{ cells: [[1, 1], [0, 1], [0, 2], [0, 3], [1, 3]], dir: 1, double: true }] }
    expect(arrowRoute(double, double.arrows[0]).dead).toBe(true)
    // Ring A sits on its own arrow's row, ring B behind it: the route passes
    // over its own head heading right again and re-enters A — it never leaves.
    const loop = { cols: 6, rows: 3, portals: [{ a: [4, 1], b: [0, 1], c: 0 }], arrows: [{ cells: [[2, 1], [3, 1]], dir: 1 }] }
    expect(arrowRoute(loop, loop.arrows[0]).dead).toBe(true)
    expect(solveArrows(loop).solvable).toBe(false)
  })

  it('leavePose pours the snake into one ring and out of the other', () => {
    const level = board()
    const arrow = level.arrows[0]
    // At rest and until the head reaches ring A the pose is one strand.
    expect(leavePose(arrow, 10, 0, level).tails).toBeUndefined()
    expect(leavePose(arrow, 10, 8, level).tails).toBeUndefined()
    // 12 units on: the head is 2 past ring B, the tail still on its way into A.
    const pose = leavePose(arrow, 10, 12, level)
    expect(pose.tails).toHaveLength(1)
    expect(pose.at(-1)[0]).toBeCloseTo(27)
    expect(pose.at(-1)[1]).toBeCloseTo(35)
    expect(pose.tails[0].at(-1)).toEqual([25, 5])
    // The hop covers no distance: the body keeps its length throughout.
    for (const t of [0, 8, 10, 12, 14, 30]) {
      const p = leavePose(arrow, 10, t, level)
      expect(polylineLength(p) + (p.tails ?? []).reduce((sum, strand) => sum + polylineLength(strand), 0), `travel ${t}`).toBeCloseTo(10)
    }
    // The bump distance of a blocked tap matches: walked cells, not the hop.
    expect(routeDistance(arrow, 2, 10)).toBe(20)
  })

  it('slicePolylines slices strands laid end to end with no gap between them', () => {
    const strands = [[[0, 0], [10, 0]], [[50, 50], [50, 60]]]
    expect(slicePolylines(strands, 5, 15)).toEqual([[[5, 0], [10, 0]], [[50, 50], [50, 55]]])
    expect(slicePolylines(strands, 12, 18)).toEqual([[[50, 52], [50, 58]]])
    expect(slicePolylines(strands, 30, 40)).toEqual([])
  })

  it('levelStats weighs a pair and every hop; portalUses counts arrows per pair', () => {
    const level = board()
    expect(portalUses(level)).toEqual([1])
    expect(levelStats(level)).toMatchObject({ portals: 1, hops: 1, solvable: true })
    expect(levelStats(level).difficulty - levelStats({ ...level, portals: undefined }).difficulty).toBe(6)
    const two = { ...level, portals: [...level.portals, { a: [4, 1], b: [4, 2], c: 1 }] }
    expect(portalUses(two)).toEqual([1, 0])
    expect(portalUses({ cols: 3, rows: 3, arrows: [] })).toEqual([])
  })

  it('the generator places portals off the edge and apart, never under an arrow; every route is live and none passes its own head', () => {
    const kinds = [['pair'], ['pair', 'pair', 'pair'], ['oneway', 'pair'], ['turn', 'turn', 'pair'], ['turn', 'pair', 'oneway', 'pair']]
    for (const portals of kinds) {
      for (let seed = 1; seed <= 5; seed += 1) {
        const spec = { cols: 9, rows: 11, maxLen: 7, fill: 0.88, samples: 9, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.5, mirrors: 1, crates: 1, portals }
        const level = generateArrowsLevel(seed, spec)
        expect(level.portals.length, `${portals} seed ${seed}`).toBe(portals.length)
        const occ = occupancy(level, level.arrows.map(() => false))
        const rings = []
        level.portals.forEach((p, i) => {
          expect(p.c).toBe(i)
          expect(!!p.oneway).toBe(portals[i] === 'oneway')
          expect(!!p.turn).toBe(portals[i] === 'turn')
          for (const [x, y] of [p.a, p.b]) {
            expect(x > 0 && x < level.cols - 1 && y > 0 && y < level.rows - 1).toBe(true)
            expect(occ[y * level.cols + x]).toBe(-1)
            rings.push([x, y])
          }
          expect(Math.abs(p.a[0] - p.b[0]) + Math.abs(p.a[1] - p.b[1])).toBeGreaterThanOrEqual(3)
        })
        for (const [i, r] of rings.entries()) {
          for (const q of rings.slice(i + 1)) expect(Math.abs(r[0] - q[0]) + Math.abs(r[1] - q[1])).toBeGreaterThanOrEqual(2)
        }
        for (const m of level.mirrors ?? []) expect(portalRings(level).has(m.y * level.cols + m.x)).toBe(false)
        for (const c of level.crates ?? []) expect(portalRings(level).has(c.y * level.cols + c.x)).toBe(false)
        level.arrows.forEach((a) => {
          const route = arrowRoute(level, a)
          expect(route.dead).toBe(false)
          if (!a.double) expect(route.cells.includes(a.cells.at(-1)[1] * level.cols + a.cells.at(-1)[0])).toBe(false)
        })
        expect(solveArrows(level).solvable, `${portals} seed ${seed}`).toBe(true)
      }
    }
  }, 60000)

  it('a spec without portals generates exactly the board it always did', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const spec = { cols: 9, rows: 11, maxLen: 6, fill: 0.88, samples: 10, diag: 0.1, curve: 0.1, bend: 0.9, mirrors: 1, crates: 1, sleepers: 1 }
      const plain = generateArrowsLevel(seed, spec)
      expect(generateArrowsLevel(seed, { ...spec, portals: [] })).toEqual(plain)
      expect(plain.portals).toBeUndefined()
      expect(plain.mask).toBeUndefined()
    }
  })

  it('clearing only ever frees: portals keep the greedy solver exact', () => {
    const level = generateArrowsLevel(5, { cols: 11, rows: 15, maxLen: 9, fill: 0.92, samples: 14, diag: 0.1, curve: 0.12, bend: 0.9, deep: 1, mirrors: 1, portals: ['turn', 'pair', 'oneway', 'pair'] })
    let gone = Array(level.arrows.length).fill(false)
    let free = new Set(freeArrows(level, gone))
    for (const i of solveArrows(level).order) {
      gone = [...gone]
      gone[i] = true
      const next = new Set(freeArrows(level, gone))
      for (const f of free) if (f !== i) expect(next.has(f)).toBe(true)
      free = next
    }
    expect(isBoardCleared(level, gone)).toBe(true)
  })

  it('par: the solver clears every board with exactly one tap per arrow and no blocked tap', () => {
    for (const portals of [['pair'], ['oneway', 'pair'], ['turn', 'pair']]) {
      const level = generateArrowsLevel(3, { cols: 9, rows: 12, maxLen: 7, fill: 0.88, samples: 10, deep: 0.5, portals })
      let gone = Array(level.arrows.length).fill(false)
      let taps = 0
      for (const i of solveArrows(level).order) {
        const r = applyArrowTap(level, gone, 3, i)
        expect(r.result).toBe('cleared')
        gone = r.gone
        taps += 1
      }
      expect(taps).toBe(level.arrows.length)
      expect(isBoardCleared(level, gone)).toBe(true)
    }
  })
})

describe('shaped boards', () => {
  // 5×4: a hole at (2,1) and a notch at the top right.
  const mask = ['####.', '##.##', '#####', '#####']

  it('voidSet lists the void cells, and nothing for a plain rectangle', () => {
    const level = { cols: 5, rows: 4, mask, arrows: [] }
    expect([...voidSet(level)].sort((a, b) => a - b)).toEqual([4, 7])
    expect(voidSet({ cols: 5, rows: 4, arrows: [] })).toBeNull()
    expect(voidSet({ cols: 2, rows: 1, mask: ['##'], arrows: [] })).toBeNull()
  })

  it('a void cell is an edge: a route that reaches one has left the board', () => {
    // Row 1 holds a hole at (2,1): an arrow heading right from (0,1),(1,1) is out at once.
    const level = { cols: 5, rows: 4, mask, arrows: [{ cells: [[0, 1], [1, 1]], dir: 1 }, { cells: [[4, 1], [3, 1]], dir: 3 }] }
    expect(arrowRoute(level, level.arrows[0])).toMatchObject({ cells: [], dead: false })
    expect(exitCheck(level, [false, false], 0).free).toBe(true)
    // Beyond the hole an arrow does not block the route that already left.
    expect(arrowRoute(level, level.arrows[1]).cells).toEqual([])
    // Without the mask both routes run the full row and block each other.
    const plain = { ...level, mask: undefined }
    expect(exitCheck(plain, [false, false], 0)).toMatchObject({ free: false, blocker: 1 })
  })

  it('the outline is an edge for every kind of route', () => {
    // The notch at (4,0): an arrow at (3,1) heading up passes (3,0) then the board edge; one at (3,0) heading right is out.
    const level = { cols: 5, rows: 4, mask, arrows: [{ cells: [[3, 0], [3, 1]], dir: 0 }, { cells: [[2, 0], [3, 0]], dir: 1 }] }
    expect(arrowRoute(level, level.arrows[1]).cells).toEqual([])
    // A hook turns where the board ends: heading right from (0,1),(1,1) it
    // is at the hole at once, turns clockwise there and runs down column 1.
    const hook = { cols: 5, rows: 4, mask, arrows: [{ cells: [[0, 1], [1, 1]], dir: 1, turn: 1 }] }
    expect(arrowRoute(hook, hook.arrows[0])).toMatchObject({ cells: [11, 16], finalDir: 2 })
    // A diagonal ray stops at a void like it does at the edge: (3,1), then the notch at (4,0).
    const diag = { cols: 5, rows: 4, mask, arrows: [{ cells: [[1, 3], [2, 2]], dir: 4 }] }
    expect(arrowRoute(diag, diag.arrows[0]).cells).toEqual([8])
    expect(arrowRoute({ ...diag, mask: undefined }, diag.arrows[0]).cells).toEqual([8, 4])
  })

  it('the generator keeps every arrow, mirror and portal on playable cells', () => {
    for (const shape of ['diamond', 'cross', 'donut', 'heart', 'lantern', 'arrow']) {
      for (let seed = 1; seed <= 6; seed += 1) {
        const spec = { cols: 12, rows: 16, maxLen: 8, fill: 0.9, samples: 10, diag: 0.1, curve: 0.1, bend: 0.9, deep: 0.5, mirrors: 1, crates: 1, portals: ['pair', 'oneway'], mask: shapeMask(shape, 12, 16) }
        const level = generateArrowsLevel(seed, spec)
        expect(level.mask).toBe(spec.mask)
        const voids = voidSet(level)
        const on = ([x, y]) => !voids.has(y * level.cols + x)
        for (const a of level.arrows) {
          expect(a.cells.every(on), `${shape} ${seed}`).toBe(true)
          expect(arrowRoute(level, a).dead).toBe(false)
          for (const c of arrowRoute(level, a).cells) expect(voids.has(c)).toBe(false)
        }
        expect(level.arrows.length).toBeGreaterThan(5)
        expect(level.mirrors.every((m) => on([m.x, m.y]))).toBe(true)
        expect(level.portals.every((p) => on(p.a) && on(p.b))).toBe(true)
        expect((level.crates ?? []).every((c) => on([c.x, c.y]))).toBe(true)
        expect(solveArrows(level).solvable, `${shape} ${seed}`).toBe(true)
      }
    }
  })
})

describe('tunnel floors', () => {
  // 6×4 with a tunnel at (2,1) pointing right (dir 1). Arrow 0 heads right
  // along row 1 and crosses it the allowed way.
  const board = (extra = [], tunnel = {}) => ({
    cols: 6,
    rows: 4,
    tunnels: [{ x: 2, y: 1, dir: 1, ...tunnel }],
    arrows: [{ cells: [[0, 1], [1, 1]], dir: 1 }, ...extra],
  })

  it('a piece crosses a tunnel along the way it points', () => {
    const level = board()
    expect(arrowRoute(level, level.arrows[0])).toMatchObject({ cells: [8, 9, 10, 11], dead: false })
    expect(exitCheck(level, [false], 0).free).toBe(true)
    expect(tunnelMap(level).get(8)).toBe(1)
    expect(tunnelMap({ cols: 3, rows: 3, arrows: [] })).toBeNull()
  })

  it('a piece that meets it any other way hits a wall and can never leave', () => {
    // The tile points left: the same right-heading arrow stops short of it.
    const level = board([], { dir: 3 })
    expect(arrowRoute(level, level.arrows[0])).toMatchObject({ cells: [], dead: true, wall: 8 })
    expect(exitCheck(level, [false], 0)).toEqual({ free: false, blocker: -1, gap: 0, wall: 8 })
    // Heading the opposite way along its axis is the wrong way too.
    const back = { cols: 6, rows: 4, tunnels: [{ x: 2, y: 1, dir: 1 }], arrows: [{ cells: [[5, 1], [4, 1]], dir: 3 }] }
    expect(arrowRoute(back, back.arrows[0])).toMatchObject({ cells: [9], dead: true, wall: 8 })
    // So does a crossing lane: a vertical arrow runs into the right-pointing tile.
    const across = { cols: 6, rows: 4, tunnels: [{ x: 2, y: 1, dir: 1 }], arrows: [{ cells: [[2, 3], [2, 2]], dir: 0 }] }
    expect(arrowRoute(across, across.arrows[0])).toMatchObject({ cells: [], dead: true, wall: 8 })
    // A blocked tap costs a life and the wall is named so the board can show it.
    const tap = applyArrowTap(back, [false], 3, 0)
    expect(tap).toMatchObject({ result: 'blocked', lives: 2, blocker: -1, gap: 1, wall: 8 })
    expect(solveArrows(back).solvable).toBe(false)
  })

  it('a wall rings the wall cell: the bump distance counts the empty cells before it', () => {
    const level = { cols: 6, rows: 4, tunnels: [{ x: 3, y: 1, dir: 3 }], arrows: [{ cells: [[0, 1], [1, 1]], dir: 1 }] }
    expect(exitCheck(level, [false], 0)).toMatchObject({ free: false, gap: 1, wall: 9 })
  })

  it('diagonals cannot cross a tunnel; a hook checks both legs', () => {
    const diag = { cols: 5, rows: 5, tunnels: [{ x: 3, y: 1, dir: 0 }], arrows: [{ cells: [[1, 3], [2, 2]], dir: 4 }] }
    expect(arrowRoute(diag, diag.arrows[0])).toMatchObject({ dead: true, wall: 8 })
    // Up the left column to the edge, then clockwise right along the top row: the tile at (2,0) points right.
    const hook = { cols: 5, rows: 3, tunnels: [{ x: 2, y: 0, dir: 1 }], arrows: [{ cells: [[0, 2], [0, 1]], dir: 0, turn: 1 }] }
    expect(arrowRoute(hook, hook.arrows[0])).toMatchObject({ cells: [0, 1, 2, 3, 4], dead: false, finalDir: 1 })
    // Counter-clockwise it runs the other way along the top row — wrong way, and wrong only after the turn.
    const bad = { ...hook, arrows: [{ cells: [[4, 2], [4, 1]], dir: 0, turn: -1 }] }
    expect(arrowRoute(bad, bad.arrows[0])).toMatchObject({ dead: true, wall: 2 })
  })

  it('a tunnel works with mirrors and portals: the heading that counts is the one it arrives with', () => {
    // A mirror at (3,1) turns a right-heading arrow up; the tile at (3,0) points up.
    const up = { cols: 6, rows: 3, mirrors: [{ x: 3, y: 1, m: '/' }], tunnels: [{ x: 3, y: 0, dir: 0 }], arrows: [{ cells: [[0, 1], [1, 1]], dir: 1 }] }
    expect(arrowRoute(up, up.arrows[0])).toMatchObject({ cells: [8, 9, 3], dead: false })
    const down = { ...up, tunnels: [{ x: 3, y: 0, dir: 2 }] }
    expect(arrowRoute(down, down.arrows[0])).toMatchObject({ dead: true, wall: 3 })
    // A turning portal comes out heading down; a right-pointing tile below it is a wall.
    const ring = { cols: 6, rows: 5, portals: [{ a: [1, 0], b: [4, 1], c: 0, turn: true }], tunnels: [{ x: 4, y: 2, dir: 1 }], arrows: [{ cells: [[0, 0]], dir: 1 }] }
    expect(arrowRoute(ring, ring.arrows[0])).toMatchObject({ dead: true, wall: 16 })
    expect(arrowRoute({ ...ring, tunnels: [{ x: 4, y: 2, dir: 2 }] }, ring.arrows[0])).toMatchObject({ dead: false, cells: [1, 10, 16, 22, 28] })
  })

  it('a double arrow crosses a tunnel only along the way it slides', () => {
    const double = { cells: [[1, 1], [0, 1], [0, 2], [0, 3], [1, 3]], dir: 1, double: true }
    const ok = { cols: 5, rows: 5, tunnels: [{ x: 3, y: 1, dir: 1 }], arrows: [double] }
    expect(arrowRoute(ok, double).dead).toBe(false)
    const bad = { cols: 5, rows: 5, tunnels: [{ x: 3, y: 1, dir: 0 }], arrows: [double] }
    expect(arrowRoute(bad, double).dead).toBe(true)
  })

  it('tunnelUses counts the live routes over each tile; levelStats weighs them', () => {
    const level = board([{ cells: [[0, 2], [1, 2]], dir: 1 }])
    expect(tunnelUses(level)).toEqual([1])
    expect(tunnelUses({ cols: 3, rows: 3, arrows: [] })).toEqual([])
    const bare = { ...level, tunnels: undefined }
    expect(levelStats(level)).toMatchObject({ tunnels: 1, gated: 1 })
    expect(levelStats(level).difficulty).toBe(levelStats(bare).difficulty + 3)
  })

  it('the generator places tunnels off the edge and apart, never under an arrow; every route is live', () => {
    for (let seed = 1; seed <= 8; seed += 1) {
      const spec = { cols: 9, rows: 11, maxLen: 7, fill: 0.88, samples: 9, diag: 0.1, curve: 0.12, bend: 0.9, deep: 0.5, mirrors: 1, crates: 1, portals: ['pair'], tunnels: 3 }
      const level = generateArrowsLevel(seed, spec)
      expect(level.tunnels.length, `seed ${seed}`).toBe(3)
      const occ = occupancy(level, level.arrows.map(() => false))
      level.tunnels.forEach((t, i) => {
        expect(t.x > 0 && t.x < level.cols - 1 && t.y > 0 && t.y < level.rows - 1).toBe(true)
        expect(t.dir >= 0 && t.dir < 4).toBe(true)
        expect(occ[t.y * level.cols + t.x]).toBe(-1)
        for (const u of level.tunnels.slice(i + 1)) expect(Math.abs(t.x - u.x) + Math.abs(t.y - u.y)).toBeGreaterThanOrEqual(3)
        expect(portalRings(level).has(t.y * level.cols + t.x)).toBe(false)
        expect(level.mirrors?.some((m) => m.x === t.x && m.y === t.y) ?? false).toBe(false)
        expect(level.crates?.some((c) => c.x === t.x && c.y === t.y) ?? false).toBe(false)
      })
      for (const a of level.arrows) expect(arrowRoute(level, a).dead).toBe(false)
      expect(solveArrows(level).solvable, `seed ${seed}`).toBe(true)
    }
  }, 60000)

  it('a spec without tunnels generates exactly the board it always did', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const spec = { cols: 9, rows: 11, maxLen: 6, fill: 0.88, samples: 10, diag: 0.1, curve: 0.1, bend: 0.9, mirrors: 1, crates: 1, sleepers: 1, portals: ['pair'] }
      const plain = generateArrowsLevel(seed, spec)
      expect(generateArrowsLevel(seed, { ...spec, tunnels: 0 })).toEqual(plain)
      expect(plain.tunnels).toBeUndefined()
    }
  })

  it('clearing only ever frees: tunnels keep the greedy solver exact, and par is one tap per arrow', () => {
    const level = generateArrowsLevel(5, { cols: 11, rows: 15, maxLen: 9, fill: 0.92, samples: 14, diag: 0.1, curve: 0.12, bend: 0.9, deep: 1, mirrors: 1, portals: ['turn', 'pair'], tunnels: 3 })
    let gone = Array(level.arrows.length).fill(false)
    let free = new Set(freeArrows(level, gone))
    for (const i of solveArrows(level).order) {
      const r = applyArrowTap(level, gone, 3, i)
      expect(r.result).toBe('cleared')
      gone = r.gone
      const next = new Set(freeArrows(level, gone))
      for (const f of free) if (f !== i) expect(next.has(f)).toBe(true)
      free = next
    }
    expect(isBoardCleared(level, gone)).toBe(true)
  })

  it('leavePose slides a piece over a tunnel like any other cell', () => {
    const level = board()
    const pose = leavePose(level.arrows[0], 10, 25, level)
    expect(pose.at(-1)[0]).toBeGreaterThan(pose[0][0])
  })
})

// ── Endless twists: diagonals with mods, flat mirrors, bank / glide / elbow / swerve ──

describe('endless twists', () => {
  const at = (level, i) => arrowRoute(level, level.arrows[i])

  it('quarterDir turns any heading a quarter', () => {
    expect([0, 1, 2, 3].map((d) => quarterDir(d, 1))).toEqual([1, 2, 3, 0])
    expect([4, 5, 6, 7].map((d) => quarterDir(d, 1))).toEqual([5, 6, 7, 4])
    expect([4, 5, 6, 7].map((d) => quarterDir(d, -1))).toEqual([7, 4, 5, 6])
  })

  it('a flat mirror bounces a diagonal like a ball; a straight arrow runs along it or dies face-on', () => {
    const level = (m) => ({
      cols: 5,
      rows: 5,
      mirrors: [{ x: 3, y: 1, m }],
      arrows: [
        { cells: [[0, 4], [1, 3]], dir: 4 },
        { cells: [[0, 1], [1, 1]], dir: 1 },
        { cells: [[3, 3], [3, 2]], dir: 0 },
      ],
    })
    // '-' flips the up/down half: up-right leaves down-right.
    expect(at(level('-'), 0)).toMatchObject({ cells: [12, 8, 14], corners: [20, 15, 16], finalDir: 5, dead: false })
    // '|' flips the left/right half: up-right leaves up-left.
    expect(at(level('|'), 0)).toMatchObject({ cells: [12, 8, 2], finalDir: 7, dead: false })
    expect(at(level('-'), 1)).toMatchObject({ cells: [7, 8, 9], finalDir: 1, dead: false })
    expect(at(level('-'), 2).dead).toBe(true)
    expect(at(level('|'), 2)).toMatchObject({ cells: [8, 3], finalDir: 0, dead: false })
  })

  it('a slanted tunnel lets a diagonal cross only its way', () => {
    const level = (dir) => ({ cols: 5, rows: 5, tunnels: [{ x: 2, y: 2, dir }], arrows: [{ cells: [[0, 4], [1, 3]], dir: 4 }] })
    expect(at(level(4), 0)).toMatchObject({ cells: [12, 8, 4], dead: false })
    expect(at(level(5), 0)).toMatchObject({ dead: true, wall: 12 })
    expect(tunnelUses(level(4))).toEqual([1])
  })

  it('a bank bounces once off the frame; a corner shot or a void just leaves', () => {
    const level = { cols: 5, rows: 5, arrows: [{ cells: [[1, 4], [2, 3]], dir: 4, twist: 'bank' }, { cells: [[2, 2], [3, 1]], dir: 4, twist: 'bank' }] }
    expect(at(level, 0)).toMatchObject({ cells: [13, 9, 3], corners: [21, 16, 10], finalDir: 7, twistAt: 2, dead: false })
    expect(at(level, 1)).toMatchObject({ cells: [4], twistAt: -1, dead: false })
    const shaped = { ...level, mask: ['####.', '#####', '#####', '#####', '#####'], arrows: [level.arrows[1]] }
    expect(at(shaped, 0)).toMatchObject({ cells: [], twistAt: -1, dead: false })
  })

  it('a glide slides along the wall it meets', () => {
    const level = { cols: 5, rows: 5, arrows: [{ cells: [[1, 4], [2, 3]], dir: 4, twist: 'glide' }, { cells: [[0, 2], [1, 1]], dir: 4, twist: 'glide' }] }
    // Right wall: slides up. Top wall: slides right.
    expect(at(level, 0)).toMatchObject({ cells: [13, 9, 4], finalDir: 0, twistAt: 2 })
    expect(at(level, 1)).toMatchObject({ cells: [2, 3, 4], finalDir: 1, twistAt: 1 })
  })

  it('an elbow turns after its cells; a hook only at the edge', () => {
    const arrow = (extra) => ({ cells: [[0, 4], [0, 3]], dir: 0, turn: 1, ...extra })
    const level = { cols: 5, rows: 5, arrows: [arrow({ twist: 'elbow', n: 1 }), arrow({ twist: 'elbow', n: 2 }), arrow({})] }
    expect(at(level, 0)).toMatchObject({ cells: [10, 11, 12, 13, 14], finalDir: 1, twistAt: 1 })
    expect(at(level, 1)).toMatchObject({ cells: [10, 5, 6, 7, 8, 9], finalDir: 1, twistAt: 2 })
    expect(at(level, 2)).toMatchObject({ cells: [10, 5, 0, 1, 2, 3, 4], finalDir: 1 })
    expect(isCurved(level.arrows[0])).toBe(false)
    expect(isCurved(level.arrows[2])).toBe(true)
  })

  it('a swerve jogs one lane through a cell corner, and a diagonal body on that corner blocks it', () => {
    const swerve = { cells: [[0, 4], [0, 3]], dir: 0, turn: 1, twist: 'swerve', n: 1 }
    const open = { cols: 5, rows: 5, arrows: [swerve] }
    expect(at(open, 0)).toMatchObject({ cells: [10, 6, 1], corners: [-1, 13, -1], finalDir: 0, twistAt: 1 })
    const crossed = { cols: 5, rows: 5, arrows: [swerve, { cells: [[0, 1], [1, 2]], dir: 5 }] }
    expect(exitCheck(crossed, [false, false], 0)).toMatchObject({ free: false, blocker: 1, gap: 1 })
    expect(solveArrows(crossed)).toMatchObject({ solvable: true, layers: 2 })
  })

  it('the generator builds every twist only when asked, each one really twisting', () => {
    const spec = { ...ARROWS_ENDLESS_SPECS.medium, name: 'test' }
    const seen = Object.fromEntries(ARROWS_TWISTS.map((t) => [t, 0]))
    for (let s = 1; s <= 12; s += 1) {
      const level = generateArrowsLevel(s * 977, spec)
      expect(solveArrows(level).solvable).toBe(true)
      for (const a of level.arrows) {
        if (!a.twist) continue
        seen[a.twist] += 1
        const route = arrowRoute(level, a)
        expect(route.dead).toBe(false)
        expect(route.twistAt).toBeGreaterThanOrEqual(0)
        expect(route.twistAt).toBeLessThan(route.cells.length)
        expect(isDiagonal(a)).toBe(a.twist === 'bank' || a.twist === 'glide')
        if (a.twist === 'elbow' || a.twist === 'swerve') expect([1, 2]).toContain(a.n)
      }
      expect(levelStats(level).twists).toBe(level.arrows.filter((a) => a.twist).length)
    }
    for (const t of ARROWS_TWISTS) expect(seen[t], t).toBeGreaterThan(0)
    // The race tiers never draw an endless twist or a flat mirror.
    for (const tier of ARROWS_TIERS) {
      for (let s = 1; s <= 6; s += 1) expect(generateArrowsLevel(s, tier).arrows.some((a) => a.twist)).toBe(false)
    }
  })
})
