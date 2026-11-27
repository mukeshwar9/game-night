import { describe, it, expect } from 'vitest'
import { sentenceCase } from './sentenceCase'

describe('sentenceCase', () => {
  it('lowers capitals and raises the first letter', () => {
    expect(sentenceCase('FIRST TO 7 · POWER-UPS')).toBe('First to 7 · power-ups')
    expect(sentenceCase('60S CLOCK · MOST POINTS WINS')).toBe('60s clock · most points wins')
  })
  it('copes with empty input', () => {
    expect(sentenceCase('')).toBe('')
    expect(sentenceCase(null)).toBe('')
    expect(sentenceCase(undefined)).toBe('')
  })
})
