import { describe, expect, it } from 'vitest'
import { getQuickEmotes, normalizeEmoteUsage, recordEmoteUsage } from './emoteUsage'

describe('normalizeEmoteUsage', () => {
  it('drops malformed and unused entries', () => {
    expect(normalizeEmoteUsage({
      '😂': { count: 3, lastUsed: 20 },
      '🔥': { count: 0, lastUsed: 30 },
      bad: null,
      old: { count: '4', lastUsed: 10 },
    })).toEqual({ '😂': { count: 3, lastUsed: 20 } })
  })
})

describe('recordEmoteUsage', () => {
  it('increments count and updates recency', () => {
    expect(recordEmoteUsage({ '😂': { count: 2, lastUsed: 10 } }, '😂', 30)).toEqual({
      '😂': { count: 3, lastUsed: 30 },
    })
  })

  it('does not mutate input usage', () => {
    const usage = { '😂': { count: 1, lastUsed: 10 } }
    recordEmoteUsage(usage, '🔥', 20)
    expect(usage).toEqual({ '😂': { count: 1, lastUsed: 10 } })
  })
})

describe('getQuickEmotes', () => {
  it('uses defaults before any emoji is used', () => {
    expect(getQuickEmotes({}, ['🔥', '😂', '😭'], 3)).toEqual(['🔥', '😂', '😭'])
  })

  it('puts frequent emojis first and recent emojis next', () => {
    const usage = {
      '😂': { count: 8, lastUsed: 10 },
      '🔥': { count: 4, lastUsed: 20 },
      '😭': { count: 1, lastUsed: 40 },
      '👏': { count: 1, lastUsed: 30 },
    }
    expect(getQuickEmotes(usage, ['😎', '💀', '🤫'], 4)).toEqual(['😂', '🔥', '😭', '👏'])
  })

  it('fills unused slots with defaults without duplicates', () => {
    expect(getQuickEmotes({ '😂': { count: 1, lastUsed: 10 } }, ['🔥', '😂', '😭'], 4)).toEqual([
      '😂', '🔥', '😭',
    ])
  })
})
