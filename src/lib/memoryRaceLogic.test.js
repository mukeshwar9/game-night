import { describe, it, expect } from 'vitest'
import {
  levelRand, newSeed, memLevelOutcome, memLevelPatch, memLevelStart, memStreamStart, memStreamOutcome, MEM_LIVES,
} from './memoryRaceLogic'

describe('memory race rooms', () => {
  it('seeds the same stream for the same seed and level only', () => {
    const a = levelRand(42, 3), b = levelRand(42, 3), c = levelRand(42, 4)
    const take = r => [r(), r(), r()]
    expect(take(a)).toEqual(take(b))
    expect(take(c)).not.toEqual(take(levelRand(42, 3)))
    expect(newSeed(() => 0.5)).toBe(2147483647)
  })
  it('resolves a level race from the mem node', () => {
    const mem = memLevelStart(1, 7)
    expect(memLevelOutcome(mem)).toEqual({ type: 'pending' })
    expect(memLevelOutcome({ ...mem, X: { done: true }, O: { fail: 2 } })).toEqual({ type: 'win', winner: 'X' })
    expect(memLevelOutcome({ ...mem, X: { fail: 0, progress: 1 }, O: { fail: 2, progress: 1, time: 5 } })).toEqual({ type: 'win', winner: 'X' })
  })
  it('a new level clears outcomes and keeps clear times', () => {
    const patch = memLevelPatch({ X: { done: true, time: 900 }, O: { done: true, time: 1200 } }, 2, 5000, 99)
    expect(patch).toEqual({ level: 2, seed: 99, startAt: 5000, X: { done: false, fail: null, progress: 0, time: 900 }, O: { done: false, fail: null, progress: 0, time: 1200 } })
  })
  it('a score race waits for both and compares scores', () => {
    const mem = memStreamStart(5)
    expect(mem.X.lives).toBe(MEM_LIVES)
    expect(memStreamOutcome({ ...mem, X: { over: true, score: 9 } })).toEqual({ type: 'pending' })
    expect(memStreamOutcome({ X: { over: true, score: 9 }, O: { over: true, score: 12 } })).toEqual({ type: 'win', winner: 'O' })
    expect(memStreamOutcome({ X: { over: true, score: 4 }, O: { over: true, score: 4 } })).toEqual({ type: 'draw' })
  })
})

import { startLevelRun, levelRunDone, levelRunFail, levelRunContinue, levelRunRand } from './memoryRaceLogic'

describe('solo level runs', () => {
  it('climbs on a clear and scores cleared levels', () => {
    let s = startLevelRun(5)
    s = levelRunDone(levelRunDone(s))
    expect(s).toMatchObject({ level: 3, cleared: 2, lives: MEM_LIVES })
  })
  it('a slip pauses with one life gone; continuing re-deals the same level', () => {
    const s = levelRunFail(startLevelRun(5))
    expect(s).toMatchObject({ paused: true, lives: MEM_LIVES - 1, level: 1 })
    expect(levelRunDone(s)).toBe(s)
    const c = levelRunContinue(s)
    expect(c).toMatchObject({ paused: false, attempt: 1, level: 1 })
    const a = levelRunRand(startLevelRun(5))(), b = levelRunRand(c)()
    expect(a).not.toBe(b)
  })
  it('ends when the last life goes', () => {
    let s = startLevelRun(1)
    for (let i = 0; i < MEM_LIVES; i++) s = levelRunContinue(levelRunFail(s))
    expect(s.over).toBe(true)
  })
})
