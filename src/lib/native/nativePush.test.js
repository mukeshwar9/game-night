import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Native push against a stubbed @capacitor-firebase/messaging plugin, stubbed
// Firebase and the real push.js / pushRouteLogic.js / navigation.js.
const TOKEN = 'fcm-native-token-abc-1234567890-long-enough'
const TOKEN2 = 'fcm-native-token-xyz-0987654321-long-enough'

let store, set, remove, fm, listeners, nav

async function load({ platform = 'ios', nativePush = true, perm = 'granted', uid = 'u1' } = {}) {
  vi.resetModules()
  store = {}
  set = vi.fn().mockResolvedValue()
  remove = vi.fn().mockResolvedValue()
  listeners = {}
  nav = []
  fm = {
    requestPermissions: vi.fn().mockImplementation(async () => ({ receive: perm })),
    checkPermissions: vi.fn().mockImplementation(async () => ({ receive: perm })),
    getToken: vi.fn().mockResolvedValue({ token: TOKEN }),
    deleteToken: vi.fn().mockResolvedValue(),
    createChannel: vi.fn().mockResolvedValue(),
    addListener: vi.fn().mockImplementation(async (name, fn) => { listeners[name] = fn; return { remove() {} } }),
  }
  vi.stubGlobal('localStorage', { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v }, removeItem: k => { delete store[k] } })
  vi.doMock('../platform', () => ({ isNative: true, nativePlatform: platform }))
  vi.doMock('../features', () => ({ NATIVE_PUSH: nativePush }))
  vi.doMock('../firebase', () => ({ db: {} }))
  vi.doMock('../auth', () => ({ getUid: () => uid }))
  vi.doMock('firebase/database', () => ({ ref: (_db, path) => path, set, remove }))
  vi.doMock('@capacitor-firebase/messaging', () => ({ FirebaseMessaging: fm }))
  const push = await import('../push.js')
  const native = await import('./nativePush.js')
  const navigation = await import('./navigation.js')
  navigation.onNavigateRequest(p => nav.push(p))
  return { push, native }
}

const recordPath = async (push, token) => `users/u1/fcmTokens/${await push.tokenHash(token)}`

beforeEach(() => { vi.unstubAllGlobals() })
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('enablePush on native', () => {
  it('asks for permission, gets the token and stores it with the platform', async () => {
    const { push } = await load({ platform: 'android' })
    expect(await push.enablePush()).toBe(TOKEN)
    expect(fm.requestPermissions).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith(await recordPath(push, TOKEN), expect.objectContaining({ token: TOKEN, platform: 'android' }))
    expect(store['push-enabled']).toBe('1')
  })

  it('writes platform ios on iOS and creates no channel there', async () => {
    const { push } = await load({ platform: 'ios' })
    await push.enablePush()
    expect(set.mock.calls[0][1].platform).toBe('ios')
    expect(fm.createChannel).not.toHaveBeenCalled()
  })

  it('creates the heads-up invites channel on Android', async () => {
    const { push } = await load({ platform: 'android' })
    await push.enablePush()
    expect(fm.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 'invites', importance: 4 }))
  })

  it.each(['denied', 'prompt'])('throws permission-* and stores nothing when the result is %s', async (perm) => {
    const { push } = await load({ perm })
    await expect(push.enablePush()).rejects.toThrow(/^permission-(denied|default)$/)
    expect(fm.getToken).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
    expect(store['push-enabled']).toBeUndefined()
  })

  it('throws unsupported while NATIVE_PUSH is off, without touching the plugin', async () => {
    const { push } = await load({ nativePush: false })
    await expect(push.enablePush()).rejects.toThrow('unsupported')
    expect(fm.requestPermissions).not.toHaveBeenCalled()
  })

  it('throws no-token when the plugin returns an empty token, and never writes a null record', async () => {
    const { push } = await load()
    fm.getToken.mockResolvedValue({ token: '' })
    await expect(push.enablePush()).rejects.toThrow('no-token')
    expect(set).not.toHaveBeenCalled()
  })
})

describe('resyncPush on native', () => {
  it('re-gets and rewrites the token for someone who turned it on and still has permission', async () => {
    const { push } = await load({ platform: 'ios' })
    store['push-enabled'] = '1'
    await push.resyncPush()
    expect(fm.requestPermissions).not.toHaveBeenCalled()
    expect(set).toHaveBeenCalledWith(await recordPath(push, TOKEN), expect.objectContaining({ platform: 'ios' }))
  })

  it('does nothing when notifications were never enabled', async () => {
    const { push } = await load()
    await push.resyncPush()
    expect(fm.getToken).not.toHaveBeenCalled()
  })

  it('does nothing without permission, and never prompts', async () => {
    const { push } = await load({ perm: 'denied' })
    store['push-enabled'] = '1'
    await push.resyncPush()
    expect(fm.getToken).not.toHaveBeenCalled()
    expect(fm.requestPermissions).not.toHaveBeenCalled()
  })

  it('does nothing while NATIVE_PUSH is off', async () => {
    const { push } = await load({ nativePush: false })
    store['push-enabled'] = '1'
    await push.resyncPush()
    expect(fm.checkPermissions).not.toHaveBeenCalled()
  })

  it('never throws, even if the plugin does', async () => {
    const { push } = await load()
    store['push-enabled'] = '1'
    fm.getToken.mockRejectedValue(new Error('apns'))
    await expect(push.resyncPush()).resolves.toBeUndefined()
  })

  it('retires the previous token record when the token changed', async () => {
    const { push } = await load()
    store['push-enabled'] = '1'
    store['push-native-token'] = TOKEN2
    await push.resyncPush()
    expect(remove).toHaveBeenCalledWith(await recordPath(push, TOKEN2))
    expect(store['push-native-token']).toBe(TOKEN)
  })
})

describe('disablePush on native', () => {
  it('deletes the token and removes its record, clearing the flag first', async () => {
    const { push } = await load()
    await push.enablePush()
    let flagDuringDelete = 'unset'
    fm.deleteToken.mockImplementation(async () => { flagDuringDelete = store['push-enabled'] })
    await push.disablePush(null)
    expect(flagDuringDelete).toBeUndefined()
    expect(fm.deleteToken).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith(await recordPath(push, TOKEN))
    expect(store['push-enabled']).toBeUndefined()
    expect(store['push-native-token']).toBeUndefined()
  })

  it('still clears the flag if the plugin fails', async () => {
    const { push } = await load()
    store['push-enabled'] = '1'
    fm.getToken.mockRejectedValue(new Error('x'))
    fm.deleteToken.mockRejectedValue(new Error('x'))
    await expect(push.disablePush(TOKEN)).resolves.toBeUndefined()
    expect(store['push-enabled']).toBeUndefined()
    expect(remove).toHaveBeenCalledWith(await recordPath(push, TOKEN))
  })
})

describe('checkPushPermission', () => {
  it.each([['granted', 'granted'], ['denied', 'denied'], ['prompt', 'default'], ['prompt-with-rationale', 'default']])('maps %s to %s', async (receive, expected) => {
    const { push } = await load({ perm: receive })
    expect(await push.checkPushPermission()).toBe(expected)
  })

  it('reports unsupported while NATIVE_PUSH is off', async () => {
    const { push } = await load({ nativePush: false })
    expect(await push.checkPushPermission()).toBe('unsupported')
  })
})

describe('initNativePush', () => {
  it('routes a tapped invite to its room', async () => {
    const { native } = await load()
    await native.initNativePush()
    listeners.notificationActionPerformed({ actionId: 'tap', notification: { data: { gameId: 'ABC123', url: '/game/ABC123', kind: 'invite' } } })
    expect(nav).toEqual(['/game/ABC123'])
  })

  it('ignores taps that carry no valid room or an off-site path', async () => {
    const { native } = await load()
    await native.initNativePush()
    const tap = (data) => listeners.notificationActionPerformed({ actionId: 'tap', notification: { data } })
    tap({ url: '/' })
    tap({ url: 'https://evil.example/game/ABC' })
    tap({ gameId: '../admin' })
    tap(undefined)
    listeners.notificationActionPerformed(undefined)
    expect(nav).toEqual([])
  })

  it('is idempotent: one listener per event however often it runs', async () => {
    const { native, push } = await load()
    await native.initNativePush()
    await native.initNativePush()
    store['push-enabled'] = '1'
    await push.resyncPush()
    expect(fm.addListener.mock.calls.map(c => c[0]).sort()).toEqual(['notificationActionPerformed', 'tokenReceived'])
  })

  it('rewrites the record when FCM rotates the token, but only while notifications are on', async () => {
    const { native, push } = await load({ platform: 'android' })
    await native.initNativePush()
    listeners.tokenReceived({ token: TOKEN })
    await new Promise(r => setTimeout(r, 0))
    expect(set).not.toHaveBeenCalled()
    store['push-enabled'] = '1'
    listeners.tokenReceived({ token: TOKEN })
    await vi.waitFor(() => expect(set).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ platform: 'android' })))
    expect(set.mock.calls[0][0]).toBe(await recordPath(push, TOKEN))
    listeners.tokenReceived({})
    listeners.tokenReceived(undefined)
  })

  it('never throws when the plugin is missing', async () => {
    const { native } = await load()
    fm.addListener.mockRejectedValue(new Error('not implemented'))
    await expect(native.initNativePush()).resolves.toBeUndefined()
  })
})
