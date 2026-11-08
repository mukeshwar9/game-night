import { describe, expect, it } from 'vitest'
import { BOT_LEVEL_IDS, DEFAULT_BOT_LEVEL, normalizeBotLevel } from './botLevels'
import { BOT_DIFFICULTIES, DEFAULT_BOT_DIFFICULTY } from './demoBots'

describe('botLevels', () => {
  it('names the three levels, easiest first', () => {
    expect(BOT_LEVEL_IDS).toEqual(['easy', 'normal', 'hard'])
  })

  it('matches the board-game demos so every CPU row reads the same', () => {
    expect([...BOT_LEVEL_IDS]).toEqual(BOT_DIFFICULTIES)
    expect(DEFAULT_BOT_LEVEL).toBe(DEFAULT_BOT_DIFFICULTY)
  })

  it('reads an unknown level as NORMAL', () => {
    expect(normalizeBotLevel('hard')).toBe('hard')
    expect(normalizeBotLevel('insane')).toBe('normal')
    expect(normalizeBotLevel(undefined)).toBe('normal')
  })
})
