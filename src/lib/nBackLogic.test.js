import { describe, it, expect } from 'vitest'
import { startNBack, stepNBack, isNBackMatch, NB_BLOCK, NB_LIVES, NB_CELLS } from './nBackLogic'
import { mulberry32 } from './detMath'

describe('n-back', () => {
  it('scores a correct MATCH and a correct pass, and costs a life for a wrong one', () => {
    const r = mulberry32(3)
    let s = startNBack(r)
    for (let i = 0; i < 40 && !s.over; i++) {
      const before = s
      s = stepNBack(s, isNBackMatch(s), r)
      expect(s.lives).toBe(before.lives)
      expect(s.score).toBeGreaterThan(before.score)
    }
    const wrong = stepNBack(s, !isNBackMatch(s), r)
    expect(wrong.lives).toBe(s.lives - 1)
  })
  it('a perfect block raises n', () => {
    const r = mulberry32(5)
    let s = startNBack(r)
    for (let i = 0; i < NB_BLOCK; i++) s = stepNBack(s, isNBackMatch(s), r)
    expect(s.n).toBe(2)
    expect(s.promoted).toBe(true)
  })
  it('ends after three errors and stays on the grid', () => {
    const r = mulberry32(9)
    let s = startNBack(r)
    for (let i = 0; i < NB_LIVES; i++) s = stepNBack(s, !isNBackMatch(s), r)
    expect(s.over).toBe(true)
    expect(s.seq.every(c => c >= 0 && c < NB_CELLS)).toBe(true)
  })
  it('the same seed plays the same stream', () => {
    const run = () => { const r = mulberry32(11); let s = startNBack(r); for (let i = 0; i < 30; i++) s = stepNBack(s, isNBackMatch(s), r); return s.seq }
    expect(run()).toEqual(run())
  })
})
