import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const posthog = { init: vi.fn(), capture: vi.fn(), identify: vi.fn(), reset: vi.fn(), opt_out_capturing: vi.fn(), opt_in_capturing: vi.fn() }
vi.mock('posthog-js/dist/module.full.no-external.js', () => ({ default: posthog }))
vi.mock('./games', () => ({ getGameConfig: (type) => (type === 'codewords' ? { nPlayer: true } : {}) }))

// KEY is read when the module loads, so each case sets the env and re-imports.
async function load(env = {}) {
  vi.resetModules()
  vi.stubEnv('VITE_POSTHOG_KEY', env.key ?? '')
  vi.stubEnv('VITE_POSTHOG_HOST', env.host ?? '')
  vi.stubEnv('VITE_SENTRY_DSN', '')
  return import('./track')
}

const flush = async () => {
  await vi.advanceTimersByTimeAsync(5000)
  await vi.dynamicImportSettled?.()
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

// Node test environment: a minimal in-memory localStorage.
function memoryStorage() {
  const m = new Map()
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)) }, removeItem: k => { m.delete(k) }, clear: () => m.clear() }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.useFakeTimers()
  Object.values(posthog).forEach(f => f.mockClear())
  vi.stubGlobal('window', globalThis)
  vi.stubGlobal('requestIdleCallback', undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('without a PostHog key', () => {
  it('is a no-op and loads nothing', async () => {
    const t = await load()
    t.initTracking()
    t.track('app_opened', { platform: 'web' })
    t.trackGameStarted('tictactoe', 'solo')
    t.trackRoomCreated('tictactoe', 'private')
    t.identifyUser({ uid: 'u1', isAnonymous: true })
    await flush()
    expect(posthog.init).not.toHaveBeenCalled()
    expect(posthog.capture).not.toHaveBeenCalled()
    expect(posthog.identify).not.toHaveBeenCalled()
    expect(t.trackingConfigured).toBe(false)
  })
})

describe('with a key', () => {
  it('starts PostHog once, after the first render, and flushes queued events', async () => {
    const t = await load({ key: 'phc_test', host: 'https://eu.i.posthog.com' })
    t.track('app_opened', { platform: 'ios', first_open: true })
    expect(posthog.init).not.toHaveBeenCalled()
    t.initTracking()
    t.initTracking()
    await flush()
    expect(posthog.init).toHaveBeenCalledTimes(1)
    const [key, options] = posthog.init.mock.calls[0]
    expect(key).toBe('phc_test')
    expect(options.api_host).toBe('https://eu.i.posthog.com')
    expect(options.autocapture).toBe(false)
    expect(options.session_recording.maskAllInputs).toBe(true)
    expect(posthog.capture).toHaveBeenCalledWith('app_opened', { platform: 'ios', first_open: true })
  })

  it('sends the event shape: allowed properties only, unknown events dropped', async () => {
    const t = await load({ key: 'phc_test' })
    t.initTracking()
    await flush()
    t.track('theme_changed', { theme: 'matcha', displayName: 'Sam' })
    t.track('not_an_event', { a: 1 })
    expect(posthog.capture).toHaveBeenCalledTimes(1)
    expect(posthog.capture).toHaveBeenCalledWith('theme_changed', { theme: 'matcha' })
  })

  it('identifies by uid only, flagging guests', async () => {
    const t = await load({ key: 'phc_test' })
    t.identifyUser({ uid: 'u1', isAnonymous: true })
    t.initTracking()
    await flush()
    expect(posthog.identify).toHaveBeenCalledWith('u1', { is_anonymous: true, platform: 'web' })
    t.identifyUser({ uid: 'u1', isAnonymous: false })
    expect(posthog.identify).toHaveBeenLastCalledWith('u1', { is_anonymous: false, platform: 'web' })
    t.identifyUser(null)
    expect(posthog.reset).toHaveBeenCalled()
  })

  it('reports game start and finish with mode, result and duration', async () => {
    const t = await load({ key: 'phc_test' })
    t.initTracking()
    await flush()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    t.trackGameStarted('codewords', 'multi')
    await flush()
    vi.setSystemTime(new Date('2026-01-01T00:02:30Z'))
    t.trackGameFinished('codewords', 'multi', 'win')
    await flush()
    expect(posthog.capture).toHaveBeenCalledWith('game_started', { game: 'codewords', mode: 'party' })
    expect(posthog.capture).toHaveBeenCalledWith('game_finished', { game: 'codewords', mode: 'party', result: 'win', duration_s: 150 })
  })

  it('tracks a 2-player room as online', async () => {
    const t = await load({ key: 'phc_test' })
    t.initTracking()
    await flush()
    t.trackRoomCreated('tictactoe', 'public')
    t.trackRoomJoined('tictactoe', 'link')
    await flush()
    expect(posthog.capture).toHaveBeenCalledWith('room_created', { game: 'tictactoe', mode: 'online', visibility: 'public' })
    expect(posthog.capture).toHaveBeenCalledWith('room_joined', { game: 'tictactoe', mode: 'online', via: 'link' })
  })
})

describe('opt-out', () => {
  it('does nothing when the visitor opted out', async () => {
    localStorage.setItem('gn-analytics', '0')
    const t = await load({ key: 'phc_test' })
    t.initTracking()
    t.track('app_opened', {})
    await flush()
    expect(posthog.init).not.toHaveBeenCalled()
    expect(t.trackingOptedOut()).toBe(true)
  })

  it('does nothing under Do Not Track', async () => {
    vi.stubGlobal('navigator', { doNotTrack: '1' })
    const t = await load({ key: 'phc_test' })
    t.initTracking()
    await flush()
    expect(posthog.init).not.toHaveBeenCalled()
    expect(t.trackingActive()).toBe(false)
  })

  it('stops capturing when switched off after start, and resumes when switched on', async () => {
    const t = await load({ key: 'phc_test' })
    t.initTracking()
    await flush()
    t.setTrackingOptOut(true)
    expect(posthog.opt_out_capturing).toHaveBeenCalled()
    expect(localStorage.getItem('gn-analytics')).toBe('0')
    t.track('theme_changed', { theme: 'matcha' })
    expect(posthog.capture).not.toHaveBeenCalled()
    t.setTrackingOptOut(false)
    expect(posthog.opt_in_capturing).toHaveBeenCalled()
    t.track('theme_changed', { theme: 'matcha' })
    expect(posthog.capture).toHaveBeenCalledTimes(1)
  })
})
