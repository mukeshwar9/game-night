import { describe, it, expect } from 'vitest'
import { generateArrowsLevel, isBent, isCurved, isDiagonal, levelStats, solveArrows, ARROWS_TIER_SPECS } from './arrowsLogic'
import {
  ARROWS_LEVEL_COUNT,
  ARROWS_LEVEL_SEEDS,
  ARROWS_LEVEL_SPECS,
  ARROWS_TWIST_TIPS,
  blankProgress,
  endlessLevel,
  getArrowsLevel,
  isLevelUnlocked,
  levelKey,
  levelMeetsIntro,
  levelStars,
  mergeProgress,
  newTwist,
  nextLevel,
  normalizeProgress,
  recordEndlessClear,
  recordLevelResult,
  sameProgress,
  starsFor,
  totalStars,
  twistsIn,
} from './arrowsLevelsLogic'

const levels = Array.from({ length: ARROWS_LEVEL_COUNT }, (_, i) => getArrowsLevel(i + 1))
const stats = levels.map(levelStats)

describe('the 20-level campaign', () => {
  it('has 20 levels, one seed each', () => {
    expect(ARROWS_LEVEL_COUNT).toBe(20)
    expect(ARROWS_LEVEL_SEEDS).toHaveLength(20)
    expect(levels.every(Boolean)).toBe(true)
  })

  it('every level is solvable (independent greedy solver) and fits a phone', () => {
    levels.forEach((level, i) => {
      expect(solveArrows(level).solvable, `level ${i + 1}`).toBe(true)
      expect(level.cols).toBeLessThanOrEqual(10)
      expect(level.arrows.length).toBeGreaterThan(0)
    })
  })

  it('gets steadily harder: difficulty strictly rises, arrows and depth never drop', () => {
    for (let i = 1; i < stats.length; i += 1) {
      expect(stats[i].difficulty, `level ${i + 1}`).toBeGreaterThan(stats[i - 1].difficulty)
      expect(stats[i].arrows, `level ${i + 1}`).toBeGreaterThanOrEqual(stats[i - 1].arrows)
      expect(stats[i].layers, `level ${i + 1}`).toBeGreaterThanOrEqual(stats[i - 1].layers)
    }
    // Even level 1 needs one arrow moved before another.
    expect(stats[0].layers).toBeGreaterThanOrEqual(2)
    expect(stats[19].arrows).toBeGreaterThan(stats[0].arrows * 5)
    expect(stats[19].layers).toBeGreaterThan(stats[0].layers * 4)
  })

  it('introduces diagonals at level 6, curved diagonals at level 8 and hooks at level 11, never earlier', () => {
    levels.forEach((level, i) => {
      const n = i + 1
      const diag = level.arrows.filter(isDiagonal).length
      const curve = level.arrows.filter(isCurved).length
      const bent = level.arrows.filter(isBent).length
      if (n < 8) expect(bent, `level ${n}`).toBe(0)
      if (n >= 8) expect(bent, `level ${n}`).toBeGreaterThan(0)
      if (n < 6) expect(diag, `level ${n}`).toBe(0)
      if (n < 11) expect(curve, `level ${n}`).toBe(0)
    })
    expect(ARROWS_LEVEL_SPECS[5].intro).toBe('diag')
    expect(ARROWS_LEVEL_SPECS[7].intro).toBe('bend')
    expect(ARROWS_LEVEL_SPECS[10].intro).toBe('curve')
    expect(ARROWS_LEVEL_SPECS.filter((s) => s.intro)).toHaveLength(3)
    expect(levels[7].arrows.filter(isBent).length).toBeGreaterThanOrEqual(2)
    expect(levelMeetsIntro(ARROWS_LEVEL_SPECS[7], levels[7])).toBe(true)
    expect(levelMeetsIntro(ARROWS_LEVEL_SPECS[7], levels[5])).toBe(false)
    expect(levels[5].arrows.filter(isDiagonal).length).toBeGreaterThanOrEqual(2)
    expect(levels[10].arrows.filter(isCurved).length).toBeGreaterThanOrEqual(2)
    expect(levelMeetsIntro(ARROWS_LEVEL_SPECS[5], levels[5])).toBe(true)
    expect(levelMeetsIntro(ARROWS_LEVEL_SPECS[5], levels[0])).toBe(false)
  })

  it('getArrowsLevel is stable and bounded', () => {
    expect(getArrowsLevel(3)).toBe(getArrowsLevel(3))
    expect(getArrowsLevel(3)).toEqual(generateArrowsLevel(ARROWS_LEVEL_SEEDS[2], { ...ARROWS_LEVEL_SPECS[2], name: 'level-3' }))
    expect(getArrowsLevel(0)).toBeNull()
    expect(getArrowsLevel(21)).toBeNull()
    expect(getArrowsLevel(1.5)).toBeNull()
  })
})

describe('twist tutorials', () => {
  it('twistsIn / newTwist report the first twist not yet taught', () => {
    expect(twistsIn(levels[0])).toEqual([])
    expect(twistsIn(levels[5])).toEqual(['diag'])
    expect(twistsIn(levels[7])).toEqual(['diag', 'bend'])
    expect(twistsIn(levels[10])).toEqual(['diag', 'bend', 'curve'])
    expect(newTwist(levels[10], {})).toBe('diag')
    expect(newTwist(levels[10], { diag: true })).toBe('bend')
    expect(newTwist(levels[10], { diag: true, bend: true })).toBe('curve')
    expect(newTwist(levels[10], { diag: true, bend: true, curve: true })).toBeNull()
    expect(newTwist(levels[0], null)).toBeNull()
    for (const t of ['diag', 'bend', 'curve']) expect(ARROWS_TWIST_TIPS[t]).toMatch(/^NEW · /)
  })
})

describe('endless boards', () => {
  it('serve unlimited, distinct, solvable boards at each tier', () => {
    for (const tier of ['easy', 'medium', 'hard']) {
      const seen = new Set()
      for (let s = 1; s <= 40; s += 1) {
        const level = endlessLevel(s * 65537, tier)
        expect(level.cols).toBe(ARROWS_TIER_SPECS[tier].cols)
        expect(solveArrows(level).solvable).toBe(true)
        seen.add(JSON.stringify(level.arrows))
      }
      expect(seen.size).toBe(40)
    }
  })

  it('falls back to easy for an unknown tier', () => {
    expect(endlessLevel(9, 'insane').cols).toBe(ARROWS_TIER_SPECS.easy.cols)
  })
})

describe('stars', () => {
  it('3 for a clean clear, one fewer per mistake, hints cap at 2, out of lives = 0', () => {
    expect(starsFor({ mistakes: 0 })).toBe(3)
    expect(starsFor({ mistakes: 1 })).toBe(2)
    expect(starsFor({ mistakes: 2 })).toBe(1)
    expect(starsFor({ mistakes: 3 })).toBe(0)
    expect(starsFor({ mistakes: 0, hints: 1 })).toBe(2)
    expect(starsFor({ mistakes: 2, hints: 4 })).toBe(1)
    expect(starsFor()).toBe(3)
  })
})

describe('progress', () => {
  it('level 1 is open; each clear opens the next', () => {
    let p = blankProgress()
    expect(isLevelUnlocked(p, 1)).toBe(true)
    expect(isLevelUnlocked(p, 2)).toBe(false)
    expect(nextLevel(p)).toBe(1)
    p = recordLevelResult(p, 1, 2)
    expect(isLevelUnlocked(p, 2)).toBe(true)
    expect(isLevelUnlocked(p, 3)).toBe(false)
    expect(nextLevel(p)).toBe(2)
    expect(isLevelUnlocked(p, 0)).toBe(false)
    expect(isLevelUnlocked(p, 21)).toBe(false)
  })

  it('keeps the best stars and ignores failures and bad levels', () => {
    let p = recordLevelResult(blankProgress(), 4, 3)
    p = recordLevelResult(p, 4, 1)
    expect(levelStars(p, 4)).toBe(3)
    expect(recordLevelResult(p, 5, 0)).toEqual(p)
    expect(recordLevelResult(p, 21, 3)).toEqual(p)
    expect(levelStars(recordLevelResult(p, 6, 9), 6)).toBe(3)
  })

  it('counts endless clears per tier', () => {
    let p = recordEndlessClear(blankProgress(), 'hard')
    p = recordEndlessClear(p, 'hard')
    p = recordEndlessClear(p, 'nope')
    expect(p.endless).toEqual({ easy: 0, medium: 0, hard: 2 })
  })

  it('normalizeProgress sanitises junk from storage or Firebase', () => {
    expect(normalizeProgress(null)).toEqual(blankProgress())
    expect(normalizeProgress('x')).toEqual(blankProgress())
    expect(normalizeProgress({
      levels: { l1: '3', l2: 7, l3: 0, l21: 3, 4: 2, l5: 2.6 },
      endless: { easy: -4, medium: '2', hard: 'x', insane: 9 },
      junk: true,
    })).toEqual({ levels: { l1: 3, l2: 3, l5: 2 }, endless: { easy: 0, medium: 2, hard: 0 } })
  })

  it('merges device and account copies without losing either side', () => {
    const a = { levels: { l1: 3, l2: 1 }, endless: { easy: 5, medium: 0, hard: 0 } }
    const b = { levels: { l2: 2, l3: 1 }, endless: { easy: 2, medium: 1, hard: 0 } }
    const m = mergeProgress(a, b)
    expect(m).toEqual({ levels: { l1: 3, l2: 2, l3: 1 }, endless: { easy: 5, medium: 1, hard: 0 } })
    expect(mergeProgress(b, a)).toEqual(m)
    expect(mergeProgress(m, null)).toEqual(m)
    expect(sameProgress(m, { ...m, updatedAt: 5 })).toBe(true)
    expect(sameProgress(m, a)).toBe(false)
    expect(totalStars(m)).toBe(6)
  })

  it('nextLevel sticks at 20 once everything is cleared', () => {
    let p = blankProgress()
    for (let n = 1; n <= 20; n += 1) p = recordLevelResult(p, n, 1)
    expect(nextLevel(p)).toBe(20)
    expect(levelKey(7)).toBe('l7')
  })
})
