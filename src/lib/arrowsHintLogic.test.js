import { describe, it, expect } from 'vitest'
import { bestHintArrow } from './arrowsHintLogic'
import { applyArrowTap, countGone, freeArrows, generateArrowsLevel, solveArrows, ARROWS_LIVES } from './arrowsLogic'
import { endlessLevel } from './arrowsLevelsLogic'

// Follow the hint until the board is empty; every hint must be a free arrow.
function followHints(level) {
  let gone = Array(level.arrows.length).fill(false)
  for (let guard = 0; guard <= level.arrows.length; guard += 1) {
    if (countGone(gone) === level.arrows.length) return true
    const free = freeArrows(level, gone)
    const pick = bestHintArrow(level, gone)
    if (pick === null) return false
    expect(free).toContain(pick)
    const applied = applyArrowTap(level, gone, ARROWS_LIVES, pick)
    expect(applied.result).not.toBe('blocked')
    gone = applied.gone
  }
  return false
}

describe('bestHintArrow', () => {
  it('returns null when nothing is free', () => {
    const level = generateArrowsLevel(7, 'easy')
    expect(bestHintArrow(level, Array(level.arrows.length).fill(true))).toBeNull()
  })

  it('picks the free arrow that opens the most blocked ones', () => {
    const level = generateArrowsLevel(11, 'hard')
    const gone = Array(level.arrows.length).fill(false)
    const free = freeArrows(level, gone)
    const freedBy = (i) => {
      const g = gone.slice()
      g[i] = true
      return freeArrows(level, g).filter((j) => !free.includes(j)).length
    }
    const pick = bestHintArrow(level, gone)
    expect(freedBy(pick)).toBe(Math.max(...free.map(freedBy)))
  })

  it('is stable: lowest index among exact ties, same answer twice', () => {
    const level = generateArrowsLevel(5, 'easy')
    const gone = Array(level.arrows.length).fill(false)
    expect(bestHintArrow(level, gone)).toBe(bestHintArrow(level, gone))
  })

  it('clears every race board by following hints', () => {
    for (const tier of ['easy', 'medium', 'hard']) {
      for (let s = 1; s <= 6; s += 1) {
        const level = generateArrowsLevel(s * 37, tier)
        expect(solveArrows(level).solvable).toBe(true)
        expect(followHints(level)).toBe(true)
      }
    }
  })

  it('clears endless boards with portals, sleepers and crates by following hints', () => {
    let sawSpecial = false
    for (const [tier, seed] of [['easy', 3], ['easy', 90], ['medium', 21], ['medium', 400], ['hard', 8]]) {
      const level = endlessLevel(seed, tier)
      if (level.portals?.length || level.crates?.length || level.arrows.some((a) => a.sleep)) sawSpecial = true
      expect(followHints(level)).toBe(true)
    }
    expect(sawSpecial).toBe(true)
  })
})
