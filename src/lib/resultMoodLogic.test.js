import { describe, it, expect } from 'vitest'
import {
  resultRole, showsWinBurst, classifyLoss, seriesLine, seriesFor, resultMood,
} from './resultMoodLogic'

const BOXES = ['box', 'boxes']

describe('resultRole / showsWinBurst', () => {
  it('maps the four viewers', () => {
    expect(resultRole({ winner: 'X', mySymbol: 'X' })).toBe('winner')
    expect(resultRole({ winner: 'X', mySymbol: 'O' })).toBe('loser')
    expect(resultRole({ winner: 'draw', mySymbol: 'O' })).toBe('draw')
    expect(resultRole({ winner: 'X', mySymbol: null })).toBe('spectator')
    expect(resultRole({ winner: 'draw', mySymbol: undefined })).toBe('spectator')
  })

  it('shows the win burst to the winner only', () => {
    expect(showsWinBurst('winner')).toBe(true)
    for (const r of /** @type {const} */ (['loser', 'draw', 'spectator'])) expect(showsWinBurst(r)).toBe(false)
  })
})

describe('classifyLoss', () => {
  it('is a plain loss when the margin is unknown', () => {
    expect(classifyLoss(null)).toBe('loss')
    expect(classifyLoss(undefined)).toBe('loss')
  })

  it('calls a one-point or tiebreak loss close', () => {
    expect(classifyLoss({ mine: 17, theirs: 19, total: 36 })).toBe('closeLoss')
    expect(classifyLoss({ mine: 3, theirs: 4 })).toBe('closeLoss')
    expect(classifyLoss({ mine: 4, theirs: 4 })).toBe('closeLoss')
  })

  it('reads the gap against a fixed pool', () => {
    // 36 boxes: a gap of 5 (13.9%) is close, 8 (22%) is neither, 11+ is a blowout.
    expect(classifyLoss({ mine: 14, theirs: 19, total: 36 })).toBe('closeLoss')
    expect(classifyLoss({ mine: 11, theirs: 19, total: 36 })).toBe('loss')
    expect(classifyLoss({ mine: 8, theirs: 19, total: 36 })).toBe('bigLoss')
    // 4x4: 9-7 and 9-6 are close, 9-3 is not.
    expect(classifyLoss({ mine: 7, theirs: 9, total: 16 })).toBe('closeLoss')
    expect(classifyLoss({ mine: 3, theirs: 9, total: 16 })).toBe('bigLoss')
  })

  it('reads the gap against what was scored when there is no fixed pool', () => {
    expect(classifyLoss({ mine: 1, theirs: 6 })).toBe('bigLoss')
    expect(classifyLoss({ mine: 4, theirs: 6 })).toBe('loss')
    expect(classifyLoss({ mine: 0, theirs: 0 })).toBe('closeLoss')
  })

  it('does not divide by an empty pool', () => {
    expect(classifyLoss({ mine: 0, theirs: 3, total: 0 })).toBe('loss')
  })
})

describe('seriesLine', () => {
  it('words a lead, a tie and a deficit', () => {
    expect(seriesLine(3, 2)).toBe('YOU LEAD 3–2')
    expect(seriesLine(2, 2)).toBe('TIED 2–2')
    expect(seriesLine(2, 3)).toBe('2–3 · ONE MORE TO TIE?')
    expect(seriesLine(1, 4)).toBe('1–4 IN THIS SERIES')
  })

  it('says nothing before anyone has scored', () => {
    expect(seriesLine(0, 0)).toBeNull()
  })
})

describe('seriesFor', () => {
  it('uses the room scores mid-match, from the viewer\'s seat', () => {
    expect(seriesFor({ mySymbol: 'O', scores: { X: 2, O: 1 } })).toBe('1–2 · ONE MORE TO TIE?')
    expect(seriesFor({ mySymbol: 'X', scores: { X: 2, O: 1 }, headToHead: { myWins: 9, theirWins: 1 } })).toBe('YOU LEAD 2–1')
  })

  it('uses the head-to-head record once the match is decided', () => {
    expect(seriesFor({ mySymbol: 'X', scores: { X: 3, O: 1 }, headToHead: { myWins: 3, theirWins: 2 }, matchOver: true })).toBe('YOU LEAD 3–2')
  })

  it('falls back to the room scores when there is no record yet', () => {
    expect(seriesFor({ mySymbol: 'X', scores: { X: 3, O: 1 }, headToHead: null, matchOver: true })).toBe('YOU LEAD 3–1')
  })

  it('has nothing for a spectator or without scores', () => {
    expect(seriesFor({ mySymbol: null, scores: { X: 1, O: 0 } })).toBeNull()
    expect(seriesFor({ mySymbol: 'X', scores: undefined })).toBeNull()
    expect(seriesFor({ mySymbol: 'X', scores: {} })).toBeNull()
  })
})

describe('resultMood', () => {
  it('keeps today\'s copy for a win, a draw and a spectator', () => {
    expect(resultMood({ winner: 'X', mySymbol: 'X' })).toMatchObject({ mood: 'win', headline: null, positive: null })
    expect(resultMood({ winner: 'draw', mySymbol: 'X' })).toMatchObject({ mood: 'draw', headline: null })
    expect(resultMood({ winner: 'X', mySymbol: null })).toMatchObject({ mood: 'spectator', headline: null })
  })

  it('keeps today\'s copy for a loss when the margin is unknown', () => {
    expect(resultMood({ winner: 'X', mySymbol: 'O' })).toEqual({ role: 'loser', mood: 'loss', headline: null, positive: null })
  })

  it('says SO CLOSE with one honest positive', () => {
    const m = resultMood({ winner: 'X', mySymbol: 'O', margin: { mine: 17, theirs: 19, total: 36, unit: BOXES } })
    expect(m.mood).toBe('closeLoss')
    expect(m.headline).toBe('SO CLOSE.')
    expect(m.positive).toBe('You took 17 boxes, just 2 short.')
  })

  it('says ROUGH ONE for a blowout, leading with the better overall record', () => {
    const margin = { mine: 5, theirs: 19, total: 36, unit: BOXES }
    expect(resultMood({ winner: 'X', mySymbol: 'O', margin, headToHead: { myWins: 4, theirWins: 1 } })).toMatchObject({
      mood: 'bigLoss', headline: 'ROUGH ONE.', positive: 'You still lead 4–1 overall.',
    })
    expect(resultMood({ winner: 'X', mySymbol: 'O', margin }).positive).toBe('You took 5 boxes.')
  })

  it('makes no positive up when nothing true can be said', () => {
    const m = resultMood({ winner: 'X', mySymbol: 'O', margin: { mine: 0, theirs: 20, total: 36, unit: BOXES }, headToHead: { myWins: 0, theirWins: 3 } })
    expect(m.mood).toBe('bigLoss')
    expect(m.positive).toBeNull()
  })

  it('uses the singular for one', () => {
    const m = resultMood({ winner: 'X', mySymbol: 'O', margin: { mine: 1, theirs: 2, unit: BOXES } })
    expect(m.positive).toBe('You took 1 box, just 1 short.')
  })

  it('keeps today\'s headline for a middling loss but may still add a positive', () => {
    const m = resultMood({ winner: 'X', mySymbol: 'O', margin: { mine: 11, theirs: 19, total: 36, unit: BOXES } })
    expect(m).toMatchObject({ mood: 'loss', headline: null, positive: 'You took 11 boxes.' })
  })
})
