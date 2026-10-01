import { describe, expect, it, vi } from 'vitest'
import { checkMinVersion, openStoreListing, watchMinVersion } from './versionGate'
import { STORE_URLS } from '../versionGateLogic'

const app = (version = '1.0.0') => ({ App: { getInfo: vi.fn(async () => ({ version, build: '1' })) } })
const cfg = { ios: '1.2.0', android: '1.3.0' }

describe('checkMinVersion', () => {
  it('never reads anything on the web', async () => {
    const readConfig = vi.fn()
    expect(await checkMinVersion({ native: false, platform: null, readConfig })).toBe(false)
    expect(await checkMinVersion({ native: true, platform: null, readConfig })).toBe(false)
    expect(readConfig).not.toHaveBeenCalled()
  })

  it('requires an update when the installed version is below the platform minimum', async () => {
    const opts = { native: true, loadApp: async () => app('1.1.0'), readConfig: async () => cfg }
    expect(await checkMinVersion({ ...opts, platform: 'ios' })).toBe(true)
    expect(await checkMinVersion({ ...opts, platform: 'android' })).toBe(true)
  })

  it('does not block a current build', async () => {
    const opts = { native: true, loadApp: async () => app('1.3.0'), readConfig: async () => cfg }
    expect(await checkMinVersion({ ...opts, platform: 'ios' })).toBe(false)
    expect(await checkMinVersion({ ...opts, platform: 'android' })).toBe(false)
  })

  it('does not block when the config is missing or unusable', async () => {
    const base = { native: true, platform: 'ios', loadApp: async () => app('0.0.1') }
    expect(await checkMinVersion({ ...base, readConfig: async () => null })).toBe(false)
    expect(await checkMinVersion({ ...base, readConfig: async () => ({ ios: 'soon' }) })).toBe(false)
    expect(await checkMinVersion({ ...base, readConfig: async () => 'x' })).toBe(false)
  })

  it('does not block when reading fails, times out, or the plugin is missing', async () => {
    const base = { native: true, platform: 'ios', loadApp: async () => app('0.0.1') }
    expect(await checkMinVersion({ ...base, readConfig: async () => { throw new Error('permission_denied') } })).toBe(false)
    expect(await checkMinVersion({ ...base, timeoutMs: 20, readConfig: () => new Promise(() => {}) })).toBe(false)
    expect(await checkMinVersion({ ...base, loadApp: async () => { throw new Error('no plugin') }, readConfig: async () => cfg })).toBe(false)
    expect(await checkMinVersion({ ...base, loadApp: async () => ({ App: { getInfo: async () => { throw new Error('x') } } }), readConfig: async () => cfg })).toBe(false)
  })
})

describe('watchMinVersion', () => {
  function fakeCapacitor() {
    const state = { resume: null, removed: false }
    const App = {
      addListener: vi.fn(async (name, fn) => {
        expect(name).toBe('resume')
        state.resume = fn
        return { remove: async () => { state.removed = true } }
      }),
    }
    return { state, loadApp: async () => ({ App }) }
  }
  const flush = () => new Promise(r => setTimeout(r, 0))

  it('does nothing on the web', async () => {
    const check = vi.fn()
    await watchMinVersion(vi.fn(), { native: false, check })
    expect(check).not.toHaveBeenCalled()
  })

  it('reports immediately when the launch check says update, then stops listening', async () => {
    const { state, loadApp } = fakeCapacitor()
    const onRequired = vi.fn()
    await watchMinVersion(onRequired, { native: true, check: async () => true, loadApp })
    await flush()
    expect(onRequired).toHaveBeenCalledTimes(1)
    // Either never attached (the check won the race) or attached and removed.
    expect(state.resume === null || state.removed).toBe(true)
  })

  it('rechecks on resume, throttled, and reports once a later check fails the build', async () => {
    const { state, loadApp } = fakeCapacitor()
    const onRequired = vi.fn()
    let t = 0
    const answers = [false, false, true]
    const check = vi.fn(async () => answers.shift())
    await watchMinVersion(onRequired, { native: true, check, loadApp, now: () => t, minIntervalMs: 1000 })
    await flush()
    expect(check).toHaveBeenCalledTimes(1)
    t = 500
    state.resume(); await flush()
    expect(check).toHaveBeenCalledTimes(1)
    t = 2000
    state.resume(); await flush()
    expect(check).toHaveBeenCalledTimes(2)
    expect(onRequired).not.toHaveBeenCalled()
    t = 4000
    state.resume(); await flush()
    expect(onRequired).toHaveBeenCalledTimes(1)
    expect(state.removed).toBe(true)
  })

  it('stop() removes the resume listener and silences later results', async () => {
    const { state, loadApp } = fakeCapacitor()
    const onRequired = vi.fn()
    let release
    const check = vi.fn(() => new Promise(r => { release = r }))
    const stop = await watchMinVersion(onRequired, { native: true, check, loadApp })
    stop()
    expect(state.removed).toBe(true)
    release(true)
    await flush()
    expect(onRequired).not.toHaveBeenCalled()
  })

  it('still runs the launch check when resume events are unavailable', async () => {
    const onRequired = vi.fn()
    await watchMinVersion(onRequired, { native: true, check: async () => true, loadApp: async () => { throw new Error('no plugin') } })
    await flush()
    expect(onRequired).toHaveBeenCalledTimes(1)
  })
})

describe('openStoreListing', () => {
  it('navigates to the platform listing', () => {
    const assign = vi.fn()
    expect(openStoreListing('ios', assign)).toBe(true)
    expect(openStoreListing('android', assign)).toBe(true)
    expect(assign.mock.calls).toEqual([[STORE_URLS.ios], [STORE_URLS.android]])
  })

  it('does nothing without a platform', () => {
    const assign = vi.fn()
    expect(openStoreListing(null, assign)).toBe(false)
    expect(assign).not.toHaveBeenCalled()
  })
})
