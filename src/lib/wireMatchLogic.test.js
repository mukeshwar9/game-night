import { describe, expect, it } from 'vitest'
import { nextWireBomb, WIRE_MAX_LEVEL } from './wireMatchLogic'

describe('nextWireBomb', () => {
  it('starts a fresh match at level 1 with X as Tech', () => {
    expect(nextWireBomb(null, 42)).toEqual({ seed: '42', level: 1, bombNo: 1, tech: 'X', phase: 'ready', strikes: 0, stats: null })
  })

  it('climbs after a defuse, holds after a boom, and swaps the Tech', () => {
    const stats = { streak: 1, best: 1, defused: 1, booms: 0 }
    const won = nextWireBomb({ level: 2, bombNo: 2, tech: 'X', result: { outcome: 'defused' }, stats }, 's')
    expect(won).toMatchObject({ level: 3, bombNo: 3, tech: 'O', stats })
    const lost = nextWireBomb({ level: 2, tech: 'O', result: { outcome: 'boom' } }, 's')
    expect(lost).toMatchObject({ level: 2, tech: 'X' })
    expect(nextWireBomb({ level: WIRE_MAX_LEVEL, result: { outcome: 'defused' } }, 's').level).toBe(WIRE_MAX_LEVEL)
  })
})
