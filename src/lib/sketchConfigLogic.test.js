import { describe, it, expect } from 'vitest'
import {
  DRAW_CHOICES, DRAW_TIME_CHOICES, HINT_CHOICES, DEFAULT_DRAW_S, DEFAULT_HINTS,
  defaultDraws, normalizeSketchConfig, withSetup, drawsFor, roundSetup, estimateMinutes,
  setupSummary, setupFooter, roundCycles, roundDrawBase, roundHintCount,
} from './sketchConfigLogic'
import { nextRoundState, nextHintToPublish, planHints, matchOver } from './sketchLogic'

describe('normalizeSketchConfig', () => {
  it('falls back to today\'s match for a room with no setup', () => {
    expect(normalizeSketchConfig(undefined)).toEqual({ draws: null, drawS: 75, hints: 2 })
    expect([DEFAULT_DRAW_S, DEFAULT_HINTS]).toEqual([75, 2])
  })

  it('keeps only the offered choices', () => {
    expect(normalizeSketchConfig({ v: 1, draws: 3, drawS: 45, hints: 0 })).toEqual({ draws: 3, drawS: 45, hints: 0 })
    expect(normalizeSketchConfig({ draws: 4, drawS: 50, hints: 3 })).toEqual({ draws: null, drawS: 75, hints: 2 })
    expect(normalizeSketchConfig({ draws: '2', drawS: '60' })).toEqual({ draws: null, drawS: 75, hints: 2 })
    expect(DRAW_CHOICES).toEqual([1, 2, 3])
    expect(DRAW_TIME_CHOICES).toEqual([45, 60, 75, 90, 120])
    expect(HINT_CHOICES).toEqual([0, 1, 2])
  })
})

describe('withSetup', () => {
  it('writes the full versioned value after one change', () => {
    expect(withSetup(null, 'drawS', 90)).toEqual({ v: 1, drawS: 90, hints: 2 })
    expect(withSetup({ v: 1, drawS: 90, hints: 2 }, 'draws', 1)).toEqual({ v: 1, draws: 1, drawS: 90, hints: 2 })
    expect(withSetup({ v: 1, draws: 1, drawS: 90, hints: 2 }, 'hints', 0)).toEqual({ v: 1, draws: 1, drawS: 90, hints: 0 })
  })
})

describe('draws', () => {
  it('defaults to twice, three times with 2 players', () => {
    expect(defaultDraws(2)).toBe(3)
    expect(defaultDraws(5)).toBe(2)
    expect(drawsFor(null, 2)).toBe(3)
    expect(drawsFor({ draws: 1 }, 2)).toBe(1)
  })
})

describe('roundSetup', () => {
  it('is what START copies into the round', () => {
    expect(roundSetup({ v: 1, draws: 1, drawS: 120, hints: 1 }, 6)).toEqual({ cycles: 1, drawBase: 120000, hintCount: 1 })
    expect(roundSetup(null, 2)).toEqual({ cycles: 3, drawBase: 75000, hintCount: 2 })
  })
})

describe('estimateMinutes', () => {
  it('is players × draws × (draw time + 15 s)', () => {
    expect(estimateMinutes({ players: 4, draws: 2, drawS: 75 })).toBe(12)
    expect(estimateMinutes({ players: 8, draws: 2, drawS: 75 })).toBe(24)
    expect(estimateMinutes({ players: 4, draws: 2, drawS: 75, timerScale: 2 })).toBe(22)
    expect(estimateMinutes({ players: 2, draws: 1, drawS: 45, timerScale: 0 })).toBeNull()
  })
})

describe('copy', () => {
  it('summarises the setup on one line', () => {
    expect(setupSummary(null, 4)).toBe('2 DRAWS · 75 S · 2 HINTS')
    expect(setupSummary({ draws: 1, drawS: 45, hints: 1 }, 4)).toBe('1 DRAW · 45 S · 1 HINT')
    expect(setupSummary({ hints: 0 }, 2)).toBe('3 DRAWS · 75 S · NO HINTS')
  })

  it('estimates the match, or says what the timers do', () => {
    expect(setupFooter({ players: 4, draws: 2, drawS: 75 })).toBe('ABOUT 12 MIN WITH 4 PLAYERS')
    expect(setupFooter({ players: 4, draws: 2, drawS: 75, timerScale: 2 })).toBe('ABOUT 22 MIN WITH 4 PLAYERS · 75 S × 2 = 150 S A DRAWING')
    expect(setupFooter({ players: 4, draws: 2, drawS: 75, timerScale: 0 })).toBe('TIMERS ARE OFF — THE HOST ENDS EACH DRAWING')
  })
})

describe('reading a round', () => {
  it('uses the round\'s snapshot, else today\'s rules', () => {
    expect(roundCycles({ cycles: 1, order: ['a', 'b'] })).toBe(1)
    expect(roundCycles({ order: ['a', 'b'] })).toBe(3)
    expect(roundCycles({ order: ['a', 'b', 'c'] })).toBe(2)
    expect(roundDrawBase({ drawBase: 45000 })).toBe(45000)
    expect(roundDrawBase({ drawBase: 1 })).toBe(75000)
    expect(roundDrawBase({})).toBe(75000)
    expect(roundHintCount({ hintCount: 0 })).toBe(0)
    expect(roundHintCount({})).toBe(2)
  })
})

describe('a match with a setup (sketchLogic)', () => {
  const base = { order: ['a', 'b', 'c'], used: [], options: [1, 2, 3], matchSeed: 's' }

  it('ends after the chosen number of draws', () => {
    expect(nextRoundState({ ...base, artist: 'c', cycle: 1, cycles: 1 })).toEqual({ finished: true })
    expect(nextRoundState({ ...base, artist: 'c', cycle: 1 }).finished).toBe(false)
    expect(matchOver(['a', 'b'], 'b', 2, 2)).toBe(true)
  })

  it('carries the setup from round to round', () => {
    const next = nextRoundState({ ...base, artist: 'a', cycle: 1, cycles: 3, drawBase: 45000, hintCount: 1 })
    expect(next.round).toMatchObject({ cycles: 3, drawBase: 45000, hintCount: 1 })
  })

  it('publishes only as many hints as the match allows', () => {
    const word = 'watermelon'
    const round = { phase: 'drawing', drawStartedAt: 0, drawMs: 100000 }
    expect(planHints(word, 7, 1)).toHaveLength(1)
    expect(planHints(word, 7)).toHaveLength(2)
    expect(nextHintToPublish({ word, seed: 7, round: { ...round, hintCount: 0 }, published: [], now: 99999 })).toBeNull()
    const one = { ...round, hintCount: 1 }
    const first = nextHintToPublish({ word, seed: 7, round: one, published: [], now: 99999 })
    expect(first.n).toBe(0)
    expect(nextHintToPublish({ word, seed: 7, round: one, published: [first], now: 99999 })).toBeNull()
    expect(nextHintToPublish({ word, seed: 7, round, published: [first], now: 99999 }).n).toBe(1)
  })
})
