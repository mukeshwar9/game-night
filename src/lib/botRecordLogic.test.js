import { describe, it, expect, beforeEach } from 'vitest'
import {
  normalizeBotRecord, addBotResult, easierLevel, formatLevelRecord, describeLevelRecord, readBotRecord, recordBotResult,
} from './botRecordLogic'

describe('addBotResult', () => {
  it('counts wins, losses and draws per level', () => {
    let r = {}
    r = addBotResult(r, 'hard', 'loss')
    r = addBotResult(r, 'hard', 'win')
    r = addBotResult(r, 'hard', 'loss')
    r = addBotResult(r, 'easy', 'draw')
    expect(r).toEqual({ hard: { w: 1, l: 2, d: 0 }, easy: { w: 0, l: 0, d: 1 } })
  })

  it('does not mutate the record it was given', () => {
    const r = { normal: { w: 1, l: 0, d: 0 } }
    addBotResult(r, 'normal', 'win')
    expect(r).toEqual({ normal: { w: 1, l: 0, d: 0 } })
  })
})

describe('easierLevel', () => {
  const levels = ['easy', 'normal', 'hard']
  it('counts a game under the easiest level used', () => {
    expect(easierLevel('hard', 'easy', levels)).toBe('easy')
    expect(easierLevel('easy', 'hard', levels)).toBe('easy')
    expect(easierLevel('normal', 'normal', levels)).toBe('normal')
    expect(easierLevel('normal', 'bogus', levels)).toBe('normal')
  })
})

describe('normalizeBotRecord', () => {
  it('drops junk and keeps only non-negative whole counts', () => {
    expect(normalizeBotRecord({ hard: { w: 2, l: -1, d: 'x' }, easy: null, normal: 5 })).toEqual({ hard: { w: 2, l: 0, d: 0 } })
    expect(normalizeBotRecord(null)).toEqual({})
    expect(normalizeBotRecord('nope')).toEqual({})
  })
})

describe('formatLevelRecord / describeLevelRecord', () => {
  it('reads W–L, adding draws only once there are some', () => {
    expect(formatLevelRecord(undefined)).toBe('')
    expect(formatLevelRecord({ w: 0, l: 0, d: 0 })).toBe('')
    expect(formatLevelRecord({ w: 3, l: 1, d: 0 })).toBe('3–1')
    expect(formatLevelRecord({ w: 3, l: 1, d: 2 })).toBe('3–1–2')
  })

  it('spells the record out for screen readers', () => {
    expect(describeLevelRecord(undefined)).toBe('not played yet')
    expect(describeLevelRecord({ w: 1, l: 2, d: 0 })).toBe('1 win, 2 losses')
    expect(describeLevelRecord({ w: 0, l: 1, d: 1 })).toBe('0 wins, 1 loss, 1 draw')
  })
})

describe('readBotRecord / recordBotResult', () => {
  let store
  beforeEach(() => {
    store = {}
    globalThis.localStorage = {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
    }
  })

  it('keeps a separate record per game', () => {
    recordBotResult('connectfour', 'hard', 'loss')
    recordBotResult('connectfour', 'hard', 'win')
    recordBotResult('reversi', 'easy', 'win')
    expect(readBotRecord('connectfour')).toEqual({ hard: { w: 1, l: 1, d: 0 } })
    expect(readBotRecord('reversi')).toEqual({ easy: { w: 1, l: 0, d: 0 } })
  })

  it('survives corrupt or blocked storage', () => {
    store['bot-record-sos'] = '{not json'
    expect(readBotRecord('sos')).toEqual({})
    globalThis.localStorage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    expect(readBotRecord('sos')).toEqual({})
    expect(recordBotResult('sos', 'normal', 'win')).toEqual({ normal: { w: 1, l: 0, d: 0 } })
  })
})
