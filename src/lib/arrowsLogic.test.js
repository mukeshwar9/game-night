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
} from './arrowsLogic'

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
              const [px, py] = arrow.cells[k - 1]
              expect(Math.abs(px - x) + Math.abs(py - y)).toBe(1)
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
