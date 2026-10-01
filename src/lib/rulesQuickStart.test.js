import { describe, it, expect } from 'vitest'
import { GAME_RULES } from './rules'
import { firstSentence, quickStart, wordCount, LONG_RULES_WORDS } from './rulesQuickStart'

describe('firstSentence', () => {
  it('keeps just the first sentence', () => {
    expect(firstSentence('Tap a cell. Then tap again.')).toBe('Tap a cell.')
  })
  it('does not split on a decimal or an inline abbreviation without a space', () => {
    expect(firstSentence('Costs 1.5 points each time you act.')).toBe('Costs 1.5 points each time you act.')
  })
  it('trims a very long sentence at a word boundary', () => {
    const long = `${'word '.repeat(60)}end.`
    const out = firstSentence(long)
    expect(out.length).toBeLessThanOrEqual(150)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('quickStart', () => {
  it('flags only the long rule sets', () => {
    expect(quickStart(GAME_RULES.tictactoe).long).toBe(false)
    expect(quickStart(GAME_RULES.wirecrossed).long).toBe(true)
  })
  it('gives up to three bullets', () => {
    expect(quickStart(GAME_RULES.wirecrossed).bullets).toHaveLength(3)
    expect(quickStart({ objective: 'x', howToPlay: ['One.'], win: 'y' }).bullets).toEqual(['One.'])
  })
  it('counts words across objective, steps and win', () => {
    expect(wordCount({ objective: 'a b', howToPlay: ['c d e'], win: 'f' })).toBe(6)
    expect(LONG_RULES_WORDS).toBeGreaterThan(0)
  })
})
