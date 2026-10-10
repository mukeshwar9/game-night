import { describe, it, expect } from 'vitest'
import { dealWhatChanged, wcCount, wcSide, wcStudyMs } from './whatChangedLogic'
import { mulberry32 } from './detMath'

describe('what changed', () => {
  it('grows the board and the object count with the level', () => {
    expect(wcSide(1)).toBe(4)
    expect(wcSide(8)).toBe(5)
    expect(wcCount(1)).toBe(4)
    expect(wcCount(30)).toBe(21)
    expect(wcStudyMs(1)).toBeLessThan(wcStudyMs(10))
  })
  it('changes exactly what it says, and only that', () => {
    for (let seed = 1; seed < 200; seed++) {
      const d = dealWhatChanged(1 + (seed % 12), mulberry32(seed))
      const diff = d.before.map((f, i) => (f !== d.after[i] ? i : -1)).filter(i => i >= 0)
      if (d.change.type === 'move') {
        expect(diff.sort()).toEqual([...d.change.cells].sort())
      } else {
        expect(diff).toEqual(d.change.cells)
        if (d.change.type === 'gone') expect(d.after[diff[0]]).toBe('')
        else expect(d.before).not.toContain(d.after[diff[0]])
      }
    }
  })
  it('deals the same board for the same seed', () => {
    expect(dealWhatChanged(4, mulberry32(2))).toEqual(dealWhatChanged(4, mulberry32(2)))
  })
})
