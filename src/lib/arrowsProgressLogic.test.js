import { describe, expect, it } from 'vitest'
import {
  ARROWS_LEVEL_COUNT,
  blankProgress,
  chapterGoal,
  isLevelUnlocked,
  mergeProgress,
  nextLevel,
  normalizeProgress,
  recordLevelResult,
  totalStars,
} from './arrowsProgressLogic.js'

describe('arrowsProgressLogic', () => {
  it('starts blank with level 1 open and the rest locked', () => {
    const p = blankProgress()
    expect(totalStars(p)).toBe(0)
    expect(isLevelUnlocked(p, 1)).toBe(true)
    expect(isLevelUnlocked(p, 2)).toBe(false)
    expect(nextLevel(p)).toBe(1)
  })

  it('keeps the best stars on a replay and unlocks the next level', () => {
    let p = recordLevelResult(blankProgress(), 1, 3)
    p = recordLevelResult(p, 1, 1)
    expect(p.levels.l1).toBe(3)
    expect(isLevelUnlocked(p, 2)).toBe(true)
    expect(nextLevel(p)).toBe(2)
  })

  it('merges device and account progress upward only', () => {
    const a = recordLevelResult(blankProgress(), 1, 2)
    const b = recordLevelResult(recordLevelResult(blankProgress(), 1, 3), 2, 1)
    expect(mergeProgress(a, b).levels).toEqual({ l1: 3, l2: 1 })
  })

  it('drops junk and out-of-range keys on read', () => {
    const p = normalizeProgress({ levels: { l1: 9, l999: 3, x: 2 }, endless: { easy: -4, hard: 2.9 } })
    expect(p.levels).toEqual({ l1: 3 })
    expect(p.endless).toEqual({ easy: 0, medium: 0, hard: 2 })
    expect(ARROWS_LEVEL_COUNT).toBe(170)
  })

  it('scores a chapter against its gold target', () => {
    const chapter = { from: 1, to: 10 }
    let p = blankProgress()
    for (let n = 1; n <= 8; n += 1) p = recordLevelResult(p, n, 3)
    expect(chapterGoal(p, chapter)).toMatchObject({ got: 24, max: 30, gold: 24, isGold: true, toGold: 0 })
  })
})
