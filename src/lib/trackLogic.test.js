import { describe, it, expect } from 'vitest'
import {
  EVENTS, EVENT_NAMES, SENTRY_IGNORE_ERRORS, buildEvent, doNotTrack, durationSeconds,
  normalizeMode, posthogOptions, scrubSentryEvent, sentryEnvironment, trackingAllowed,
} from './trackLogic'

describe('event catalogue', () => {
  it('has every starter event, snake_case', () => {
    for (const name of [
      'app_opened', 'game_selected', 'game_started', 'game_finished', 'room_created', 'invite_shared',
      'room_joined', 'sign_in_started', 'sign_in_completed', 'arrows_level_cleared', 'theme_changed', 'error_shown',
    ]) expect(EVENT_NAMES).toContain(name)
    for (const name of EVENT_NAMES) expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/)
  })

  it('keeps property sets small', () => {
    for (const schema of Object.values(EVENTS)) expect(Object.keys(schema).length).toBeLessThanOrEqual(4)
  })
})

describe('buildEvent', () => {
  it('returns null for an unknown event, including inherited names', () => {
    expect(buildEvent('nope', {})).toBeNull()
    expect(buildEvent('constructor', {})).toBeNull()
    expect(buildEvent('__proto__', {})).toBeNull()
  })

  it('keeps the allowed, well-typed properties', () => {
    expect(buildEvent('game_finished', { game: 'tictactoe', mode: 'solo', result: 'win', duration_s: 41.6 }))
      .toEqual({ name: 'game_finished', props: { game: 'tictactoe', mode: 'solo', result: 'win', duration_s: 42 } })
  })

  it('drops properties outside the schema (no name, chat or room id can ride along)', () => {
    const e = buildEvent('room_created', { game: 'pong', mode: 'online', visibility: 'private', name: 'Sam', chat: 'hi', gameId: 'ABC123', email: 'a@b.c' })
    expect(Object.keys(e.props).sort()).toEqual(['game', 'mode', 'visibility'])
  })

  it('drops wrong types and free text', () => {
    const e = buildEvent('arrows_level_cleared', { level: '3', stars: NaN, kind: 'hello world, this is a sentence' })
    expect(e.props).toEqual({})
    expect(buildEvent('game_started', { game: 42, mode: '' }).props).toEqual({})
  })

  it('floors negative numbers and caps string length', () => {
    expect(buildEvent('game_finished', { duration_s: -5 }).props.duration_s).toBe(0)
    expect(buildEvent('theme_changed', { theme: 'a'.repeat(100) }).props.theme).toHaveLength(40)
  })

  it('carries booleans only as booleans', () => {
    expect(buildEvent('app_opened', { platform: 'ios', first_open: true }).props).toEqual({ platform: 'ios', first_open: true })
    expect(buildEvent('app_opened', { first_open: 'yes' }).props).toEqual({})
  })
})

describe('modes and durations', () => {
  it('maps the in-house mode to the product mode', () => {
    expect(normalizeMode('multi')).toBe('online')
    expect(normalizeMode('multi', true)).toBe('party')
    expect(normalizeMode('solo')).toBe('solo')
    expect(normalizeMode('local')).toBe('local')
    expect(normalizeMode('weird')).toBe('online')
  })

  it('computes whole seconds, never negative', () => {
    expect(durationSeconds(1000, 4600)).toBe(4)
    expect(durationSeconds(undefined, 4600)).toBeUndefined()
    expect(durationSeconds(5000, 1000)).toBeUndefined()
  })
})

describe('opt-out', () => {
  it('needs a key, no DNT and no opt-out flag', () => {
    expect(trackingAllowed({ key: '' })).toBe(false)
    expect(trackingAllowed({ key: 'phc_x' })).toBe(true)
    expect(trackingAllowed({ key: 'phc_x', dnt: true })).toBe(false)
    expect(trackingAllowed({ key: 'phc_x', flag: '0' })).toBe(false)
    expect(trackingAllowed({ key: 'phc_x', flag: '1' })).toBe(true)
  })

  it('reads Do Not Track and Global Privacy Control', () => {
    expect(doNotTrack({ doNotTrack: '1' })).toBe(true)
    expect(doNotTrack({ doNotTrack: 'yes' })).toBe(true)
    expect(doNotTrack({ msDoNotTrack: '1' })).toBe(true)
    expect(doNotTrack({}, { doNotTrack: '1' })).toBe(true)
    expect(doNotTrack({ globalPrivacyControl: true })).toBe(true)
    expect(doNotTrack({ doNotTrack: '0' })).toBe(false)
    expect(doNotTrack(null, null)).toBe(false)
  })
})

describe('sentry', () => {
  it('names the environment web, ios or android', () => {
    expect(sentryEnvironment(null)).toBe('web')
    expect(sentryEnvironment(undefined)).toBe('web')
    expect(sentryEnvironment('ios')).toBe('ios')
    expect(sentryEnvironment('android')).toBe('android')
  })

  it('scrubs the user to the uid and strips request details', () => {
    const out = scrubSentryEvent({
      message: 'boom',
      user: { id: 'u1', email: 'a@b.c', username: 'Sam', ip_address: '1.2.3.4' },
      request: { url: 'https://x.web.app/game/ABC?invite=secret#h', cookies: { a: 'b' }, headers: { cookie: 'c' } },
    })
    expect(out.user).toEqual({ id: 'u1' })
    expect(out.request).toEqual({ url: 'https://x.web.app/game/ABC' })
    expect(out.message).toBe('boom')
  })

  it('drops the user when there is no uid', () => {
    expect(scrubSentryEvent({ user: { email: 'a@b.c' } }).user).toBeUndefined()
  })

  it('ignores known noise', () => {
    const hit = (msg) => SENTRY_IGNORE_ERRORS.some(p => (p instanceof RegExp ? p.test(msg) : p === msg))
    expect(hit('Script error.')).toBe(true)
    expect(hit('ResizeObserver loop completed with undelivered notifications.')).toBe(true)
    expect(hit('TypeError: x is undefined')).toBe(false)
  })
})

describe('posthogOptions', () => {
  const o = posthogOptions({ host: 'https://eu.i.posthog.com' })

  it('sends only explicit events', () => {
    expect(o.autocapture).toBe(false)
    expect(o.capture_pageview).toBe(false)
    expect(o.capture_heatmaps).toBe(false)
    expect(o.person_profiles).toBe('identified_only')
  })

  it('masks every input and blocks the chat log in replay', () => {
    expect(o.session_recording.maskAllInputs).toBe(true)
    expect(o.session_recording.blockSelector).toBe('.ph-no-capture')
  })

  it('uses the given host, US by default', () => {
    expect(o.api_host).toBe('https://eu.i.posthog.com')
    expect(posthogOptions({}).api_host).toBe('https://us.i.posthog.com')
  })
})
