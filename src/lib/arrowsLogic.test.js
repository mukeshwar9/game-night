import { describe, it, expect } from 'vitest'
import {
  parsePathD,
  getLevel,
  isArrowBlocked,
  getClearableCount,
  countClears,
  normalizeCleared,
  exitVector,
  roundedPathD,
  applyTap,
  getArrowsWinner,
  arrowsNextRound,
  ARROWS_LIVES,
} from './arrowsLogic'
import { ARROWS_LEVELS, ARROWS_TIERS, levelIdsForTier } from './levels/arrows'

// ── Level validation helpers ───────────────────────────────────────────────

// Segment intersection for axis-aligned polylines. Returns true when two
// segments overlap by length > 0 (collinear) or cross at a point strictly
// interior to both. A single shared endpoint — the corner touches the mockup's
// "tight pack" relies on — is NOT a violation.
function segOverlap(a, b) {
  const [p1, p2] = a
  const [q1, q2] = b
  const aVert = p1[0] === p2[0]
  const bVert = q1[0] === q2[0]
  const aHoriz = p1[1] === p2[1]
  const bHoriz = q1[1] === q2[1]

  if (aVert && bVert && p1[0] === q1[0]) {
    const alo = Math.min(p1[1], p2[1]); const ahi = Math.max(p1[1], p2[1])
    const blo = Math.min(q1[1], q2[1]); const bhi = Math.max(q1[1], q2[1])
    return Math.max(alo, blo) < Math.min(ahi, bhi)
  }
  if (aHoriz && bHoriz && p1[1] === q1[1]) {
    const alo = Math.min(p1[0], p2[0]); const ahi = Math.max(p1[0], p2[0])
    const blo = Math.min(q1[0], q2[0]); const bhi = Math.max(q1[0], q2[0])
    return Math.max(alo, blo) < Math.min(ahi, bhi)
  }

  const vert = aVert ? a : bVert ? b : null
  const horiz = aHoriz ? a : bHoriz ? b : null
  if (vert && horiz) {
    const vx = vert[0][0]
    const vlo = Math.min(vert[0][1], vert[1][1]); const vhi = Math.max(vert[0][1], vert[1][1])
    const hy = horiz[0][1]
    const hlo = Math.min(horiz[0][0], horiz[1][0]); const hhi = Math.max(horiz[0][0], horiz[1][0])
    return vx > hlo && vx < hhi && hy > vlo && hy < vhi
  }

  // Diagonals (only hard1 #16 has one) are isolated from every other arrow.
  return false
}

function segmentsOf(pts) {
  const segs = []
  for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]])
  return segs
}

function assertLevelValid(level) {
  const [minX, minY, width, height] = level.viewBox
  const maxX = minX + width
  const maxY = minY + height
  const allSegs = level.arrows.map((arrow) => segmentsOf(parsePathD(arrow.d)))

  level.arrows.forEach((arrow, ai) => {
    const pts = parsePathD(arrow.d)
    expect(pts.length, `${level.id} arrow ${ai} needs >= 2 points`).toBeGreaterThanOrEqual(2)
    for (const [x, y] of pts) {
      expect(x, `${level.id} arrow ${ai} x within viewBox`).toBeGreaterThanOrEqual(minX)
      expect(x, `${level.id} arrow ${ai} x within viewBox`).toBeLessThanOrEqual(maxX)
      expect(y, `${level.id} arrow ${ai} y within viewBox`).toBeGreaterThanOrEqual(minY)
      expect(y, `${level.id} arrow ${ai} y within viewBox`).toBeLessThanOrEqual(maxY)
    }
  })

  for (let i = 0; i < allSegs.length; i++) {
    for (let j = i + 1; j < allSegs.length; j++) {
      for (const sa of allSegs[i]) {
        for (const sb of allSegs[j]) {
          if (segOverlap(sa, sb)) {
            throw new Error(`${level.id}: arrows ${i} and ${j} overlap`)
          }
        }
      }
    }
  }
}

describe('arrows levels', () => {
  it('has 15 levels across three tiers', () => {
    expect(Object.keys(ARROWS_LEVELS).length).toBe(15)
    expect(ARROWS_TIERS).toEqual(['easy', 'medium', 'hard'])
    for (const tier of ARROWS_TIERS) {
      expect(levelIdsForTier(tier).length, `${tier} should have 5 levels`).toBe(5)
    }
  })

  it('every level has the right arrow count and exactly one blocked arrow', () => {
    for (const [id, level] of Object.entries(ARROWS_LEVELS)) {
      const count = level.arrows.length
      if (level.tier === 'easy') expect(count, id).toBe(5)
      if (level.tier === 'medium') expect(count, id).toBe(10)
      if (level.tier === 'hard') expect(count, id).toBe(16)
      const blocked = level.arrows.filter((a) => a.blocked).length
      expect(blocked, `${id} blocked count`).toBe(1)
    }
  })

  it('no two arrows in any level overlap', () => {
    for (const level of Object.values(ARROWS_LEVELS)) assertLevelValid(level)
  })
})

describe('parsePathD', () => {
  it('parses an M/L polyline into points', () => {
    expect(parsePathD('M50 40 L50 100 L70 100 L70 140')).toEqual([
      [50, 40], [50, 100], [70, 100], [70, 140],
    ])
  })

  it('returns [] for empty input', () => {
    expect(parsePathD('')).toEqual([])
  })
})

describe('getLevel', () => {
  it('attaches parsed points and falls back to easy1 on unknown id', () => {
    const level = getLevel('medium1')
    expect(level.arrows[0].points).toEqual([[40, 40], [40, 140], [80, 140], [80, 100], [60, 100], [60, 60], [40, 60]])
    expect(getLevel('nope').id).toBe('easy1')
  })
})

describe('isArrowBlocked / getClearableCount / countClears', () => {
  const level = getLevel('easy1')
  it('reads the static blocked flag', () => {
    expect(isArrowBlocked(level, 0)).toBe(false)
    expect(isArrowBlocked(level, 1)).toBe(true)
  })
  it('counts clearable arrows (total minus blocked)', () => {
    expect(getClearableCount(level)).toBe(4)
  })
  it('counts clears per player', () => {
    expect(countClears(['X', 'O', '', 'X', 'O'])).toEqual({ X: 2, O: 2 })
  })
})

describe('normalizeCleared', () => {
  it('normalizes sparse objects and filters junk', () => {
    expect(normalizeCleared({ 0: 'X', 2: 'O', 3: 'junk' }, 4)).toEqual(['X', '', 'O', ''])
    expect(normalizeCleared(null, 3)).toEqual(['', '', ''])
    expect(normalizeCleared(['X', 'O'], 3)).toEqual(['X', 'O', ''])
  })
})

describe('exitVector', () => {
  it('returns the unit direction of the last segment', () => {
    expect(exitVector([[0, 0], [0, 10]])).toEqual({ dx: 0, dy: 1, tip: [0, 10] })
    expect(exitVector([[0, 0], [10, 0]])).toEqual({ dx: 1, dy: 0, tip: [10, 0] })
  })
})

describe('roundedPathD', () => {
  it('returns a straight line for two points', () => {
    expect(roundedPathD([[0, 0], [10, 0]])).toBe('M0 0 L10 0')
  })
  it('rounds an interior corner with a quadratic', () => {
    const d = roundedPathD([[0, 0], [10, 0], [10, 10]])
    expect(d.startsWith('M0 0')).toBe(true)
    expect(d).toContain('Q10 0')
  })
  it('insets the tip when requested', () => {
    const d = roundedPathD([[0, 0], [0, 20]], 8, 4.2)
    expect(d).toBe('M0 0 L0 15.8')
  })
})

describe('applyTap', () => {
  const level = getLevel('easy1') // 5 arrows: index 0 valid, index 1 blocked, 4 clearable
  const lives = { X: ARROWS_LIVES, O: ARROWS_LIVES }

  it('clears a valid arrow without changing lives', () => {
    const res = applyTap(level, ['', '', '', '', ''], lives, 0, 'X')
    expect(res.tap).toEqual({ index: 0, by: 'X', result: 'cleared' })
    expect(res.cleared[0]).toBe('X')
    expect(res.lives).toEqual(lives)
  })

  it('costs a life on a blocked arrow and keeps it uncleared', () => {
    const res = applyTap(level, ['', '', '', '', ''], lives, 1, 'X')
    expect(res.tap).toEqual({ index: 1, by: 'X', result: 'blocked' })
    expect(res.cleared[1]).toBe('')
    expect(res.lives.X).toBe(2)
  })

  it('rejects a cleared arrow, out-of-lives taps, and bad indices', () => {
    expect(applyTap(level, ['X', '', '', '', ''], lives, 0, 'O')).toBeNull()
    expect(applyTap(level, ['', '', '', '', ''], { X: 0, O: 3 }, 0, 'X')).toBeNull()
    expect(applyTap(level, ['', '', '', '', ''], lives, -1, 'X')).toBeNull()
    expect(applyTap(level, ['', '', '', '', ''], lives, 99, 'X')).toBeNull()
  })
})

describe('getArrowsWinner', () => {
  const level = getLevel('easy1') // 4 clearable

  it('is null while clearable arrows remain and players have lives', () => {
    expect(getArrowsWinner(level, ['X', '', '', '', ''], 3, 3)).toBeNull()
  })

  it('awards the player with more clears when the board is exhausted', () => {
    expect(getArrowsWinner(level, ['X', '', 'X', 'X', 'X'], 3, 3)).toBe('X')
  })

  it('draws on equal clears', () => {
    expect(getArrowsWinner(level, ['X', '', 'X', 'O', 'O'], 3, 3)).toBe('draw')
  })

  it('resolves when both players are out of lives', () => {
    expect(getArrowsWinner(level, ['X', '', '', '', 'O'], 0, 0)).toBe('draw')
  })
})

describe('arrowsNextRound', () => {
  it('advances easy → medium → hard and then ends', () => {
    const r1 = arrowsNextRound({ arrowsRound: 0 })
    expect(r1.arrowsRound).toBe(1)
    expect(levelIdsForTier('medium')).toContain(r1.arrowsLevel)
    expect(r1.arrowsCleared).toBeNull()
    expect(r1.arrowsLivesX).toBe(ARROWS_LIVES)

    const r2 = arrowsNextRound({ arrowsRound: 1 })
    expect(r2.arrowsRound).toBe(2)
    expect(levelIdsForTier('hard')).toContain(r2.arrowsLevel)

    expect(arrowsNextRound({ arrowsRound: 2 })).toBeNull()
  })
})
