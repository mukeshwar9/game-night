import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sentryCapacitor = { init: vi.fn() }
const sentryReact = {
  init: vi.fn(), captureException: vi.fn(), setUser: vi.fn(), browserTracingIntegration: vi.fn(() => ({ name: 'tracing' })),
}
vi.mock('@sentry/capacitor', () => sentryCapacitor)
vi.mock('@sentry/react', () => sentryReact)

async function load(dsn) {
  vi.resetModules()
  vi.stubEnv('VITE_SENTRY_DSN', dsn)
  vi.stubEnv('VITE_SENTRY_RELEASE', 'abc123')
  return import('./monitoring')
}
const settle = () => new Promise(resolve => setTimeout(resolve, 30))

// Node test environment: a minimal in-memory localStorage.
function memoryStorage() {
  const m = new Map()
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)) }, removeItem: k => { m.delete(k) }, clear: () => m.clear() }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  sentryCapacitor.init.mockClear()
  Object.values(sentryReact).forEach(f => f.mockClear?.())
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('without a DSN', () => {
  it('is a no-op', async () => {
    const m = await load('')
    m.initMonitoring()
    m.captureError(new Error('x'), { kind: 'boundary' })
    m.setMonitoringUser('u1')
    await settle()
    expect(sentryCapacitor.init).not.toHaveBeenCalled()
    expect(sentryReact.captureException).not.toHaveBeenCalled()
    expect(m.monitoringConfigured).toBe(false)
  })
})

describe('with a DSN', () => {
  it('initialises the Capacitor SDK on the React SDK with release and environment', async () => {
    const m = await load('https://k@o1.ingest.sentry.io/1')
    m.initMonitoring()
    m.initMonitoring()
    await settle()
    expect(sentryCapacitor.init).toHaveBeenCalledTimes(1)
    const [options, sibling] = sentryCapacitor.init.mock.calls[0]
    expect(sibling).toBe(sentryReact.init)
    expect(options).toMatchObject({ dsn: 'https://k@o1.ingest.sentry.io/1', release: 'abc123', environment: 'web', sendDefaultPii: false })
    expect(options.tracePropagationTargets).toEqual([])
    expect(options.beforeSend({ user: { id: 'u1', email: 'a@b.c' } }).user).toEqual({ id: 'u1' })
  })

  it('sends queued errors and the uid once loaded, boundary errors always', async () => {
    const m = await load('https://k@o1.ingest.sentry.io/1')
    m.initMonitoring()
    m.setMonitoringUser('u1')
    m.captureError(new Error('early'), { kind: 'boundary', componentStack: '\n at App', gameType: 'pong' })
    await settle()
    expect(sentryReact.setUser).toHaveBeenCalledWith({ id: 'u1' })
    expect(sentryReact.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { kind: 'boundary', game: 'pong' },
      contexts: { react: { componentStack: '\n at App' } },
    })
  })

  it('leaves window errors to the SDK once it is up (no double report)', async () => {
    const m = await load('https://k@o1.ingest.sentry.io/1')
    m.initMonitoring()
    await settle()
    m.captureError(new Error('late'), { kind: 'error' })
    expect(sentryReact.captureException).not.toHaveBeenCalled()
  })

  it('does not start for an opted-out visitor, and starts when they opt back in', async () => {
    localStorage.setItem('gn-analytics', '0')
    const m = await load('https://k@o1.ingest.sentry.io/1')
    m.initMonitoring()
    await settle()
    expect(sentryCapacitor.init).not.toHaveBeenCalled()
    localStorage.removeItem('gn-analytics')
    m.setMonitoringOptOut(false)
    await settle()
    expect(sentryCapacitor.init).toHaveBeenCalledTimes(1)
  })

  it('does not start under Do Not Track', async () => {
    vi.stubGlobal('navigator', { doNotTrack: '1' })
    const m = await load('https://k@o1.ingest.sentry.io/1')
    m.initMonitoring()
    await settle()
    expect(sentryCapacitor.init).not.toHaveBeenCalled()
  })
})
