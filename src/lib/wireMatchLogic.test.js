import { describe, expect, it } from 'vitest'
import { MODE_LEVELS, isWireMode, nextWireBomb, normalizeRun } from './wireMatchLogic'

const fresh = { booms: 0, ms: 0 }

describe('nextWireBomb', () => {
  it('starts a fresh match with no mode at level 1 with X as Tech', () => {
    expect(nextWireBomb(null, 42)).toEqual({
      seed: '42', level: 1, bombNo: 1, tech: 'X', phase: 'ready', strikes: 0, mode: null, run: fresh, stats: null,
    })
  })

  it('has the three modes with their level counts', () => {
    expect(MODE_LEVELS).toEqual({ easy: 2, medium: 3, hard: 3 })
    expect(isWireMode('easy')).toBe(true)
    expect(isWireMode('endless')).toBe(false)
    expect(isWireMode(undefined)).toBe(false)
    expect(isWireMode('toString')).toBe(false)
  })

  it('climbs after a defuse below the last level, carrying the run and swapping the Tech', () => {
    const stats = { defused: 1, booms: 0 }
    const run = { booms: 1, ms: 9000 }
    const won = nextWireBomb({ mode: 'medium', level: 1, bombNo: 2, tech: 'X', result: { outcome: 'defused' }, run, stats }, 's')
    expect(won).toMatchObject({ mode: 'medium', level: 2, bombNo: 3, tech: 'O', run, stats })
  })

  it('retries the same level after a boom and counts it in the run', () => {
    const lost = nextWireBomb({ mode: 'hard', level: 2, tech: 'O', result: { outcome: 'boom' }, run: { booms: 1, ms: 300 } }, 's')
    expect(lost).toMatchObject({ mode: 'hard', level: 2, tech: 'X', run: { booms: 2, ms: 300 } })
  })

  it('starts a new run at level 1 of the same mode after MODE CLEARED', () => {
    for (const [mode, last] of Object.entries(MODE_LEVELS)) {
      const next = nextWireBomb({ mode, level: last, result: { outcome: 'defused', cleared: true }, run: { booms: 3, ms: 99 } }, 's')
      expect(next).toMatchObject({ mode, level: 1, run: fresh })
    }
  })

  it('returns to the mode picker for a bomb dealt before modes existed', () => {
    const stats = { streak: 2, best: 2, defused: 2, booms: 0 }
    const next = nextWireBomb({ level: 4, tech: 'X', result: { outcome: 'defused' }, stats }, 's')
    expect(next).toMatchObject({ mode: null, level: 1, run: fresh, stats })
  })

  it('ignores an unknown mode or a level past the mode', () => {
    expect(nextWireBomb({ mode: 'endless', level: 3, result: { outcome: 'defused' } }, 's').mode).toBeNull()
    expect(nextWireBomb({ mode: 'easy', level: 9, result: { outcome: 'boom' } }, 's').level).toBe(2)
  })

  it('normalizes a sparse run', () => {
    expect(normalizeRun(undefined)).toEqual(fresh)
    expect(normalizeRun({ ms: 40 })).toEqual({ booms: 0, ms: 40 })
    expect(normalizeRun({ booms: -2, ms: 'x' })).toEqual(fresh)
  })
})
