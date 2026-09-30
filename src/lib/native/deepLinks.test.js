import { describe, expect, it, vi } from 'vitest'
import { initDeepLinks } from './deepLinks'

const ORIGINS = ['https://game-night-91464.web.app']

// A fake @capacitor/app: records the appUrlOpen handler and a launch URL.
function fakeApp({ launchUrl, throwOnLaunch = false } = {}) {
  const state = { handler: null, removed: false }
  const App = {
    addListener: vi.fn(async (name, fn) => {
      expect(name).toBe('appUrlOpen')
      state.handler = fn
      return { remove: async () => { state.removed = true } }
    }),
    getLaunchUrl: vi.fn(async () => {
      if (throwOnLaunch) throw new Error('nope')
      return launchUrl ? { url: launchUrl } : undefined
    }),
  }
  return { App, state, loadApp: async () => ({ App }) }
}

describe('initDeepLinks', () => {
  it('does nothing on the web', async () => {
    const { loadApp } = fakeApp()
    const loader = vi.fn(loadApp)
    await initDeepLinks({ native: false, loadApp: loader, navigate: vi.fn() })
    expect(loader).not.toHaveBeenCalled()
  })

  it('navigates to the path of an opened link and ignores foreign or static links', async () => {
    const { loadApp, state } = fakeApp()
    const navigate = vi.fn()
    const stop = await initDeepLinks({ native: true, origins: ORIGINS, loadApp, navigate })
    state.handler({ url: 'https://game-night-91464.web.app/game/abc?x=1' })
    state.handler({ url: 'https://evil.example/game/abc' })
    state.handler({ url: 'https://game-night-91464.web.app/privacy' })
    state.handler({ url: 'gamenight://daily' })
    state.handler({})
    expect(navigate.mock.calls).toEqual([['/game/abc?x=1'], ['/daily']])
    stop()
  })

  it('opens the cold-start launch URL, once even if appUrlOpen repeats it', async () => {
    const { loadApp, state } = fakeApp({ launchUrl: 'https://game-night-91464.web.app/game/launch' })
    const navigate = vi.fn()
    const stop = await initDeepLinks({ native: true, origins: ORIGINS, loadApp, navigate, now: () => 1000 })
    expect(navigate).toHaveBeenCalledWith('/game/launch')
    state.handler({ url: 'https://game-night-91464.web.app/game/launch' })
    expect(navigate).toHaveBeenCalledTimes(1)
    stop()
  })

  it('survives a failing plugin and a failing launch URL', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(initDeepLinks({ native: true, origins: ORIGINS, loadApp: async () => { throw new Error('no plugin') }, navigate: vi.fn() })).resolves.toBeTypeOf('function')
    const { loadApp } = fakeApp({ throwOnLaunch: true })
    const stop = await initDeepLinks({ native: true, origins: ORIGINS, loadApp, navigate: vi.fn() })
    expect(stop).toBeTypeOf('function')
    stop()
    warn.mockRestore()
  })

  it('is idempotent until stopped, and stop removes the listener', async () => {
    const a = fakeApp()
    const stop = await initDeepLinks({ native: true, origins: ORIGINS, loadApp: a.loadApp, navigate: vi.fn() })
    const b = fakeApp()
    await initDeepLinks({ native: true, origins: ORIGINS, loadApp: b.loadApp, navigate: vi.fn() })
    expect(b.App.addListener).not.toHaveBeenCalled()
    stop()
    await Promise.resolve()
    expect(a.state.removed).toBe(true)
  })
})
