import { describe, it, expect } from 'vitest'
import { resolveLevelRace, LEVEL_COUNTDOWN_MS } from './levelRaceLogic'

describe('resolveLevelRace', () => {
  it('is pending until both players have an outcome', () => {
    expect(resolveLevelRace({})).toEqual({ type: 'pending' })
    expect(resolveLevelRace({ failO: -1 })).toEqual({ type: 'pending' })
  })
  it('a timed-out level (-1) is a slip like any other', () => {
    expect(resolveLevelRace({ doneX: true, failO: -1 })).toEqual({ type: 'win', winner: 'X' })
  })
  it('breaks a double slip on progress, then time, then replays', () => {
    expect(resolveLevelRace({ failX: 2, failO: 5, progressX: 3, progressO: 1 })).toEqual({ type: 'win', winner: 'X' })
    expect(resolveLevelRace({ failX: 2, failO: 5, timeO: 1 })).toEqual({ type: 'win', winner: 'X' })
    expect(resolveLevelRace({ failX: 2, failO: 5 })).toEqual({ type: 'replay' })
  })
  it('gives both players a lead-in before a level', () => {
    expect(LEVEL_COUNTDOWN_MS).toBeGreaterThanOrEqual(2000)
  })
})
