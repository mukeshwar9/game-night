import { describe, it, expect } from 'vitest'
import { startVerbal, answerVerbal, verbalPool, repeatChance, VB_LIVES } from './verbalMemoryLogic'
import { isFamilySafe } from './wordDenylist'
import { mulberry32 } from './detMath'

describe('verbal memory', () => {
  it('draws only everyday, family-safe words', () => {
    expect(verbalPool().length).toBeGreaterThan(300)
    expect(verbalPool().every(isFamilySafe)).toBe(true)
  })
  it('never repeats before three words are seen', () => {
    expect(repeatChance(0)).toBe(0)
    expect(repeatChance(2)).toBe(0)
    expect(repeatChance(3)).toBeGreaterThan(0)
  })
  it('scores right answers, costs a life for wrong ones, and ends at zero lives', () => {
    const r = mulberry32(1)
    let s = startVerbal(r)
    expect(s.isRepeat).toBe(false)
    s = answerVerbal(s, 'new', r)
    expect(s).toMatchObject({ score: 1, lives: VB_LIVES })
    for (let i = 0; i < VB_LIVES; i++) s = answerVerbal(s, s.isRepeat ? 'new' : 'seen', r)
    expect(s.over).toBe(true)
    expect(answerVerbal(s, 'new', r)).toBe(s)
  })
  it('a repeat is always a word that really came up, and the same seed gives the same stream', () => {
    const play = seed => {
      const r = mulberry32(seed)
      let s = startVerbal(r)
      const shown = []
      for (let i = 0; i < 60; i++) {
        if (s.isRepeat) expect(s.seen).toContain(s.current)
        shown.push(s.current)
        s = answerVerbal(s, s.isRepeat ? 'seen' : 'new', r)
      }
      return shown
    }
    expect(play(7)).toEqual(play(7))
  })
})
