import { describe, it, expect } from 'vitest'
import { playsDailyPath, summarizePlays, PLAY_MODES, PLAY_COUNTERS } from './analytics'

describe('playsDailyPath', () => {
  it('builds the day-first counter path', () => {
    expect(playsDailyPath('2026-09-26', 'tictactoe', 'multi', 'started'))
      .toBe('playsDaily/2026-09-26/tictactoe/multi/started')
    expect(playsDailyPath('2026-09-26', 'connectfour', 'solo', 'abandoned'))
      .toBe('playsDaily/2026-09-26/connectfour/solo/abandoned')
  })

  it('rejects anything that could escape the counter tree', () => {
    expect(playsDailyPath('2026-09-26', 'tic/tac', 'multi', 'started')).toBeNull()
    expect(playsDailyPath('2026-09-26', '', 'multi', 'started')).toBeNull()
    expect(playsDailyPath('today', 'sos', 'multi', 'started')).toBeNull()
    expect(playsDailyPath('2026-09-26', 'sos', 'online', 'started')).toBeNull()
    expect(playsDailyPath('2026-09-26', 'sos', 'multi', 'won')).toBeNull()
  })

  it('accepts every mode and counter', () => {
    for (const mode of PLAY_MODES) {
      for (const counter of PLAY_COUNTERS) {
        expect(playsDailyPath('2026-01-01', 'pong', mode, counter)).toBe(`playsDaily/2026-01-01/pong/${mode}/${counter}`)
      }
    }
  })
})

describe('summarizePlays', () => {
  it('sums days and modes per game, most-started first', () => {
    const rows = summarizePlays({
      '2026-09-26': {
        sos: { multi: { started: 2, finished: 3 }, solo: { started: 1 } },
        pong: { multi: { started: 5, abandoned: 1 } },
      },
      '2026-09-25': {
        sos: { multi: { started: 4, finished: 1, abandoned: 2 } },
      },
    })
    expect(rows).toEqual([
      { type: 'sos', started: 7, finished: 4, abandoned: 2 },
      { type: 'pong', started: 5, finished: 0, abandoned: 1 },
    ])
  })

  it('ignores junk values and empty input', () => {
    expect(summarizePlays(null)).toEqual([])
    expect(summarizePlays({ d: null, e: { sos: 'x', gomoku: { multi: { started: 'lots', finished: 2 } } } }))
      .toEqual([{ type: 'gomoku', started: 0, finished: 2, abandoned: 0 }])
  })
})
