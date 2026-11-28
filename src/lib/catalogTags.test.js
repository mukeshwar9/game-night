import { describe, it, expect } from 'vitest'
import { START_HERE, getStartHere, getCardTag } from './catalogTags'

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
}

describe('getStartHere', () => {
  it('returns the picks in list order and skips games that are not shown', () => {
    const entries = [{ type: 'pong' }, { type: 'tictactoe' }, { type: 'sim' }, { type: 'sketch' }]
    expect(getStartHere(entries).map(e => e.type)).toEqual(['tictactoe', 'sketch', 'pong'])
  })

  it('is empty when none of the picks are shown', () => {
    expect(getStartHere([{ type: 'sim' }])).toEqual([])
  })

  it('has six to eight unique picks, all real registry games', async () => {
    const { GAME_TYPES } = await import('./games')
    expect(START_HERE.length).toBeGreaterThanOrEqual(6)
    expect(START_HERE.length).toBeLessThanOrEqual(8)
    expect(new Set(START_HERE).size).toBe(START_HERE.length)
    const types = new Set(GAME_TYPES.map(t => t.type))
    for (const t of START_HERE) {
      expect(types.has(t)).toBe(true)
      expect(GAME_TYPES.find(g => g.type === t).variantOf).toBeUndefined()
    }
  })
})

describe('getCardTag', () => {
  it('marks a start-here game POPULAR, even when it is also new', () => {
    expect(getCardTag('tictactoe', new Set())).toBe('popular')
    expect(getCardTag('tictactoe', new Set(['tictactoe']))).toBe('popular')
  })

  it('marks a new game NEW', () => {
    expect(getCardTag('sim', new Set(['sim']))).toBe('new')
  })

  it('marks nothing else', () => {
    expect(getCardTag('sim', new Set())).toBeNull()
  })
})
