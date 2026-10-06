import { describe, it, expect } from 'vitest'
import { playsDailyPath, summarizePlays, PLAY_MODES, PLAY_COUNTERS, FUNNEL_STEPS, funnelUpdate, summarizeFunnel, bootBucket, bootDailyPath } from './analytics'

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

describe('funnelUpdate', () => {
  const touch = { source: 'instagram', campaign: 'launch1' }
  it('writes the counter and the once-per-account mark in one patch', () => {
    const patch = funnelUpdate({ day: '2026-09-30', touch, uid: 'u1', step: 'landed' })
    expect(Object.keys(patch)).toEqual(['funnelDaily/2026-09-30/instagram/launch1/landed', 'funnelSeen/u1/landed'])
    expect(patch['funnelSeen/u1/landed']).toBe(true)
  })
  it('uses a dash when there is no campaign', () => {
    const patch = funnelUpdate({ day: '2026-09-30', touch: { source: 'direct', campaign: '' }, uid: 'u1', step: 'named' })
    expect(Object.keys(patch)[0]).toBe('funnelDaily/2026-09-30/direct/-/named')
  })
  it('refuses unknown steps, bad days, bad sources and missing uid', () => {
    expect(funnelUpdate({ day: '2026-09-30', touch, uid: 'u1', step: 'joined' })).toBeNull()
    expect(funnelUpdate({ day: 'today', touch, uid: 'u1', step: 'landed' })).toBeNull()
    expect(funnelUpdate({ day: '2026-09-30', touch: { source: 'A B' }, uid: 'u1', step: 'landed' })).toBeNull()
    expect(funnelUpdate({ day: '2026-09-30', touch, uid: '', step: 'landed' })).toBeNull()
    expect(funnelUpdate({ day: '2026-09-30', touch: null, uid: 'u1', step: 'landed' })).toBeNull()
  })
  it('covers the five launch funnel steps', () => {
    expect(FUNNEL_STEPS).toEqual(['landed', 'named', 'started', 'finished', 'shared'])
  })
})

describe('summarizeFunnel', () => {
  it('sums days per source and campaign, most landings first', () => {
    const rows = summarizeFunnel({
      '2026-09-29': { instagram: { launch1: { landed: 10, named: 6, started: 4 } }, direct: { '-': { landed: 2 } } },
      '2026-09-30': { instagram: { launch1: { landed: 5, named: 3, finished: 1, shared: 1 } } },
    })
    expect(rows).toEqual([
      { source: 'instagram', campaign: 'launch1', landed: 15, named: 9, started: 4, finished: 1, shared: 1 },
      { source: 'direct', campaign: '', landed: 2, named: 0, started: 0, finished: 0, shared: 0 },
    ])
  })
  it('tolerates empty and malformed input', () => {
    expect(summarizeFunnel(null)).toEqual([])
    expect(summarizeFunnel({ d: null, e: { x: 'bad' } })).toEqual([])
  })
})

describe('bootBucket / bootDailyPath', () => {
  it('buckets a native cold start by how long the splash stayed up', () => {
    expect(bootBucket(400)).toBe('lt1s')
    expect(bootBucket(1500)).toBe('lt2s')
    expect(bootBucket(3999)).toBe('lt4s')
    expect(bootBucket(5000)).toBe('lt6s')
    expect(bootBucket(9000)).toBe('slow')
    expect(bootBucket(NaN)).toBeNull()
  })

  it('only writes for the two app platforms on a real day', () => {
    expect(bootDailyPath('2026-10-06', 'ios', 800)).toBe('bootDaily/2026-10-06/ios/lt1s')
    expect(bootDailyPath('2026-10-06', 'android', 7000)).toBe('bootDaily/2026-10-06/android/slow')
    expect(bootDailyPath('2026-10-06', 'web', 800)).toBeNull()
    expect(bootDailyPath('today', 'ios', 800)).toBeNull()
  })
})
