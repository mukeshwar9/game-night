import { describe, it, expect, vi } from 'vitest'
import {
  MAX_REPORTS_PER_SESSION, MSG_MAX, STACK_MAX,
  dayKey, lastDayKeys, buildIdFromUrl, routeKey, shortUserAgent,
  describeError, shouldIgnoreError, buildErrorReport, isTelemetryEnabled, createReporter,
  summarizeErrors,
} from './telemetry'

describe('dayKey / lastDayKeys', () => {
  it('formats the UTC calendar day', () => {
    expect(dayKey(Date.UTC(2026, 8, 26, 23, 59))).toBe('2026-09-26')
    expect(dayKey(Date.UTC(2026, 8, 27, 0, 0))).toBe('2026-09-27')
  })

  it('lists the last n days newest first, across a month boundary', () => {
    expect(lastDayKeys(3, Date.UTC(2026, 9, 1, 12))).toEqual(['2026-10-01', '2026-09-30', '2026-09-29'])
    expect(lastDayKeys(0)).toEqual([])
  })
})

describe('buildIdFromUrl', () => {
  it('extracts the Vite content hash from a bundled chunk URL', () => {
    expect(buildIdFromUrl('https://game-night.web.app/assets/index-BxKq3Z9a.js')).toBe('BxKq3Z9a')
    expect(buildIdFromUrl('https://x.app/assets/lazy-with-retry-Ab_-dEf1.js?v=1')).toBe('Ab_-dEf1')
  })

  it("falls back to 'dev' for unbundled modules", () => {
    expect(buildIdFromUrl('http://localhost:5173/src/lib/telemetry.js')).toBe('dev')
    expect(buildIdFromUrl(undefined)).toBe('dev')
  })
})

describe('routeKey', () => {
  it('collapses random room ids', () => {
    expect(routeKey('/game/AB12CD')).toBe('/game/:id')
    expect(routeKey('/solo/tictactoe')).toBe('/solo/tictactoe')
    expect(routeKey('')).toBe('/')
  })
})

describe('shortUserAgent', () => {
  it('names browser major version and OS', () => {
    expect(shortUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'))
      .toBe('Chrome 128 · macOS')
    expect(shortUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'))
      .toBe('Safari 17 · iOS')
    expect(shortUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0'))
      .toBe('Edge 128 · Windows')
    expect(shortUserAgent('Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0')).toBe('Firefox 130 · Android')
    expect(shortUserAgent('')).toBe('Other · Other')
  })
})

describe('describeError', () => {
  it('handles Errors, named errors, strings, objects and nothing', () => {
    const e = new TypeError('x is undefined')
    expect(describeError(e).msg).toBe('TypeError: x is undefined')
    expect(describeError(e).stack).toContain('x is undefined')
    expect(describeError(new Error('plain')).msg).toBe('plain')
    expect(describeError('boom')).toEqual({ msg: 'boom', stack: '' })
    expect(describeError({ code: 7 })).toEqual({ msg: '{"code":7}', stack: '' })
    expect(describeError({ message: 'shaped' }).msg).toBe('shaped')
    expect(describeError(undefined)).toEqual({ msg: '', stack: '' })
  })
})

describe('shouldIgnoreError', () => {
  it('drops known noise', () => {
    expect(shouldIgnoreError('Script error.')).toBe(true)
    expect(shouldIgnoreError('')).toBe(true)
    expect(shouldIgnoreError('ResizeObserver loop completed with undelivered notifications.')).toBe(true)
    expect(shouldIgnoreError('AbortError: The user aborted a request.')).toBe(true)
    expect(shouldIgnoreError('oops', 'at foo (chrome-extension://abc/content.js:1:1)')).toBe(true)
  })

  it('keeps real errors', () => {
    expect(shouldIgnoreError('TypeError: cannot read properties of null', 'at Board (/assets/index-x.js:1:1)')).toBe(false)
  })
})

describe('buildErrorReport', () => {
  it('truncates free text and omits empty optional keys', () => {
    const report = buildErrorReport({
      msg: 'm'.repeat(MSG_MAX + 50),
      stack: 's'.repeat(STACK_MAX + 50),
      kind: 'weird',
      route: '/game/:id',
      build: 'BxKq3Z9a',
      ua: 'Chrome 128 · macOS',
      at: 5,
    })
    expect(report.msg).toHaveLength(MSG_MAX)
    expect(report.stack).toHaveLength(STACK_MAX)
    expect(report.kind).toBe('error')
    expect(report).not.toHaveProperty('gameType')
    expect(report).not.toHaveProperty('uid')
    expect(Object.values(report)).not.toContain(undefined)
  })

  it('keeps gameType, uid and a known kind', () => {
    const report = buildErrorReport({ msg: 'x', kind: 'boundary', gameType: 'sos', uid: 'u1', at: 1 })
    expect(report).toMatchObject({ kind: 'boundary', gameType: 'sos', uid: 'u1', route: '/', build: 'dev' })
    expect(report).not.toHaveProperty('stack')
  })
})

describe('isTelemetryEnabled', () => {
  it('is on only for production builds off the emulator, unless overridden', () => {
    expect(isTelemetryEnabled({ prod: true, emulator: false })).toBe(true)
    expect(isTelemetryEnabled({ prod: false, emulator: false })).toBe(false)
    expect(isTelemetryEnabled({ prod: true, emulator: true })).toBe(false)
    expect(isTelemetryEnabled({ prod: false, emulator: true, override: '1' })).toBe(true)
    expect(isTelemetryEnabled({ prod: true, emulator: false, override: '0' })).toBe(false)
  })
})

function memoryStorage() {
  const data = new Map()
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) }
}

describe('createReporter', () => {
  it('sends a report and dedupes identical messages', async () => {
    const send = vi.fn()
    const r = createReporter({ send, storage: memoryStorage() })
    expect(r.report(new Error('boom'), { kind: 'error' })).toBe(true)
    expect(r.report(new Error('boom'), { kind: 'error' })).toBe(false)
    await Promise.resolve()
    await Promise.resolve()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toMatchObject({ msg: 'boom', kind: 'error' })
  })

  it('caps reports per session, and the cap survives a new reporter on the same storage', () => {
    const storage = memoryStorage()
    const r = createReporter({ send: () => {}, storage })
    for (let i = 0; i < MAX_REPORTS_PER_SESSION; i++) expect(r.report(`error ${i}`)).toBe(true)
    expect(r.report('one too many')).toBe(false)
    const afterReload = createReporter({ send: () => {}, storage })
    expect(afterReload.report('fresh message')).toBe(false)
  })

  it('does nothing when disabled or for ignored noise', () => {
    const send = vi.fn()
    expect(createReporter({ send, enabled: false }).report('boom')).toBe(false)
    expect(createReporter({ send }).report('Script error.')).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('never throws, even when send throws or storage is broken', async () => {
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    const r = createReporter({ send: () => { throw new Error('offline') }, storage: broken })
    expect(() => r.report('boom')).not.toThrow()
    expect(r.report('boom 2')).toBe(true)
    await Promise.resolve()
  })

  it('appends the React component stack to the stack', async () => {
    const send = vi.fn()
    createReporter({ send }).report(new Error('render'), { kind: 'boundary', componentStack: '\n    at Board' })
    await Promise.resolve()
    await Promise.resolve()
    expect(send.mock.calls[0][0].stack).toContain('at Board')
  })
})

describe('summarizeErrors', () => {
  const byDay = {
    '2026-09-26': {
      a: { msg: 'boom', at: 30, gameType: 'sos', route: '/game/:id', build: 'B1' },
      b: { msg: 'boom', at: 10, gameType: 'sos' },
      c: { msg: 'other', at: 20 },
      junk: 'not a report',
    },
    '2026-09-25': {
      d: { msg: 'boom', at: 5, gameType: 'pong' },
      e: { at: 1 },
    },
    '2026-09-24': null,
  }

  it('counts totals, per game and per message', () => {
    const s = summarizeErrors(byDay)
    expect(s.total).toBe(4)
    expect(s.byGame).toEqual([
      { gameType: 'sos', count: 2 },
      { gameType: 'none', count: 1 },
      { gameType: 'pong', count: 1 },
    ])
    expect(s.byMessage[0]).toMatchObject({ msg: 'boom', count: 3, lastAt: 30, route: '/game/:id', build: 'B1', gameType: 'sos' })
    expect(s.byMessage[1]).toMatchObject({ msg: 'other', count: 1 })
  })

  it('lists the newest reports first, capped', () => {
    expect(summarizeErrors(byDay, 2).recent.map(r => r.id)).toEqual(['a', 'c'])
  })

  it('handles an empty node', () => {
    expect(summarizeErrors(undefined)).toEqual({ total: 0, byGame: [], byMessage: [], recent: [] })
  })
})
