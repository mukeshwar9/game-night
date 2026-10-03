import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { isPushSupported, permissionState, pushAvailable, tokenHash, tokenRecord, classifyEnableError } from './push.js'

describe('push helpers', () => {
  it('detects support from navigator + window caps', () => {
    expect(isPushSupported(
      { serviceWorker: {} },
      { PushManager: {}, Notification: {} },
    )).toBe(true)
    expect(isPushSupported({}, {})).toBe(false)
    expect(isPushSupported(null, null)).toBe(false)
  })

  it('reads Notification.permission or unsupported', () => {
    expect(['default', 'granted', 'denied', 'unsupported']).toContain(permissionState())
  })

  it('hashes tokens to 32 hex chars, stable', async () => {
    const a = await tokenHash('fcm-token-abc-1234567890-long-enough-value')
    const b = await tokenHash('fcm-token-abc-1234567890-long-enough-value')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    const c = await tokenHash('different-token-value-1234567890-long')
    expect(c).not.toBe(a)
  })

  it('builds token records, rejects junk', () => {
    expect(tokenRecord('short')).toBe(null)
    expect(tokenRecord(null)).toBe(null)
    const r = tokenRecord('fcm-token-abc-1234567890-long-enough-value', 1234)
    expect(r.token).toContain('fcm-token')
    expect(r.at).toBe(1234)
  })

  it('tags native records with a platform, leaves web records as before, and refuses unknown platforms', () => {
    const token = 'fcm-token-abc-1234567890-long-enough-value'
    expect(tokenRecord(token, 1)).not.toHaveProperty('platform')
    expect(tokenRecord(token, 1, 'ios').platform).toBe('ios')
    expect(tokenRecord(token, 1, 'android').platform).toBe('android')
    expect(tokenRecord(token, 1, 'windows')).toBe(null)
    expect(tokenRecord(token, 1, undefined)).not.toHaveProperty('platform')
  })

  it('is available on native only when NATIVE_PUSH is on, on the web when the browser can', () => {
    expect(pushAvailable({ native: true, nativeEnabled: false, web: true })).toBe(false)
    expect(pushAvailable({ native: true, nativeEnabled: true, web: false })).toBe(true)
    expect(pushAvailable({ native: false, nativeEnabled: true, web: false })).toBe(false)
    expect(pushAvailable({ native: false, nativeEnabled: false, web: true })).toBe(true)
  })

  it('maps enable failures to the toggle branches, hiding nothing new', () => {
    expect(classifyEnableError(new Error('permission-denied'))).toBe('blocked')
    expect(classifyEnableError(new Error('permission-default'))).toBe('blocked')
    expect(classifyEnableError(new Error('no-vapid-key'))).toBe('not-configured')
    expect(classifyEnableError(new Error('no-db'))).toBe('failed')
    expect(classifyEnableError(new Error('no-uid'))).toBe('failed')
    expect(classifyEnableError(new Error('no-token'))).toBe('failed')
    expect(classifyEnableError(new Error('messaging/token-subscribe-failed'))).toBe('failed')
    expect(classifyEnableError(undefined)).toBe('failed')
  })
})

// The FCM worker must not share the Workbox worker's scope (/): a scope holds
// one worker, so sharing it replaced sw.js and dropped push handling on the
// next load. These tests run enablePush / resyncPush against stubbed browser
// and Firebase APIs.
describe('FCM worker registration', () => {
  it('registers under its own scope, never /', async () => {
    vi.resetModules()
    const register = vi.fn().mockResolvedValue({ scope: 'x' })
    const store = {}
    const set = vi.fn().mockResolvedValue()
    vi.stubGlobal('navigator', { serviceWorker: { register, ready: Promise.resolve({}) }, userAgent: 'test' })
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn().mockResolvedValue('granted') })
    vi.stubGlobal('PushManager', function PushManager() {})
    vi.stubGlobal('localStorage', { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v }, removeItem: k => { delete store[k] } })
    vi.stubEnv('VITE_FIREBASE_VAPID_KEY', 'vapid-key')
    vi.doMock('./firebase', () => ({ db: {} }))
    vi.doMock('./auth', () => ({ getUid: () => 'u1' }))
    vi.doMock('firebase/database', () => ({ ref: (_db, path) => path, set, remove: vi.fn() }))
    vi.doMock('firebase/messaging', () => ({ getMessaging: () => ({}), getToken: vi.fn().mockResolvedValue('fcm-token-abc-1234567890-long-enough-value') }))
    const push = await import('./push.js')
    await push.enablePush()
    expect(register).toHaveBeenCalledWith('/firebase-messaging-sw.js', { scope: push.FCM_SW_SCOPE })
    expect(push.FCM_SW_SCOPE).not.toBe('/')
    expect(store['push-enabled']).toBe('1')
    expect(set).toHaveBeenCalledTimes(1)
    expect(set.mock.calls[0][0]).toMatch(/^users\/u1\/fcmTokens\/[0-9a-f]{32}$/)
    expect(set.mock.calls[0][1]).toMatchObject({ token: 'fcm-token-abc-1234567890-long-enough-value' })
    expect(set.mock.calls[0][1]).not.toHaveProperty('platform')

    register.mockClear()
    await push.resyncPush()
    expect(register).toHaveBeenCalledTimes(1)

    register.mockClear()
    delete store['push-enabled']
    await push.resyncPush()
    expect(register).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.resetModules()
  })
})

// The Hosting init script (/__/firebase/init.js) already calls
// firebase.initializeApp(config); a bare second call throws `app/no-options`
// before it ever checks for that existing app, which killed background push.
// The worker must only initialize when no app exists yet.
describe('FCM background worker init', () => {
  it('never double-initializes after the Hosting init script', () => {
    const src = readFileSync(new URL('../../public/firebase-messaging-sw.js', import.meta.url), 'utf8')
    expect(src).toContain("importScripts('/__/firebase/init.js')")
    expect(src).toContain('if (!firebase.apps.length)')
    expect(src.match(/firebase\.initializeApp\(\)/g) || []).toHaveLength(1)
  })
})
