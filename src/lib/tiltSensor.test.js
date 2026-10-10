import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The sensor module is a singleton, so each test loads a fresh copy against a fake window.
function fakeWindow({ coarse = true, hasApi = true, permission = null } = {}) {
  const handlers = new Map()
  vi.stubGlobal('matchMedia', () => ({ matches: coarse }))
  vi.stubGlobal('addEventListener', (type, fn) => handlers.set(type, fn))
  vi.stubGlobal('removeEventListener', (type) => handlers.delete(type))
  vi.stubGlobal('screen', { orientation: { angle: 0 } })
  if (hasApi) {
    const api = function DeviceOrientationEvent() {}
    if (permission) api.requestPermission = vi.fn(async () => permission)
    vi.stubGlobal('DeviceOrientationEvent', api)
  } else vi.stubGlobal('DeviceOrientationEvent', undefined)
  return { fire: (beta, gamma) => handlers.get('deviceorientation')?.({ beta, gamma }), handlers }
}
const load = async () => { vi.resetModules(); return import('./tiltSensor') }

describe('tilt sensor', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('a desktop (no touch screen) is unsupported and never listens', async () => {
    const w = fakeWindow({ coarse: false })
    const t = await load()
    expect(t.tiltSupported()).toBe(false)
    t.startTilt()
    expect(t.getTiltStatus()).toBe('unsupported')
    expect(w.handlers.size).toBe(0)
  })

  it('an Android phone listens at once and goes live on the first reading, which sets the tilt state', async () => {
    const w = fakeWindow()
    const t = await load()
    const seen = vi.fn()
    t.subscribeTilt(seen)
    t.startTilt()
    expect(t.getTiltStatus()).toBe('waiting')
    w.fire(90, 0)
    expect(t.getTiltStatus()).toBe('live')
    expect(seen).toHaveBeenCalled()
    w.fire(60, 90)
    expect(t.tiltState().raw).toBeCloseTo(30, 3)
    t.recenterTilt()
    expect(t.tiltState().neutral).toBeCloseTo(30, 3)
    t.stopTilt()
    expect(w.handlers.size).toBe(0)
    expect(t.getTiltStatus()).toBe('idle')
  })

  it('a phone that never sends a reading falls back to unsupported', async () => {
    const w = fakeWindow()
    const t = await load()
    t.startTilt()
    w.fire(null, null)
    expect(t.getTiltStatus()).toBe('waiting')
    vi.advanceTimersByTime(t.WAIT_MS + 10)
    expect(t.getTiltStatus()).toBe('unsupported')
  })

  it('iOS waits for a tap: granted starts listening, denied falls back', async () => {
    const w = fakeWindow({ permission: 'granted' })
    let t = await load()
    t.startTilt()
    expect(t.getTiltStatus()).toBe('prompt')
    expect(w.handlers.size).toBe(0)
    expect(await t.requestTilt()).toBe(true)
    expect(t.getTiltStatus()).toBe('waiting')
    w.fire(80, 10)
    expect(t.getTiltStatus()).toBe('live')

    fakeWindow({ permission: 'denied' })
    t = await load()
    t.startTilt()
    expect(await t.requestTilt()).toBe(false)
    expect(t.getTiltStatus()).toBe('denied')
  })

  it('a refused or throwing permission request is denied, not a crash', async () => {
    fakeWindow({ permission: 'granted' })
    const t = await load()
    globalThis.DeviceOrientationEvent.requestPermission = vi.fn(async () => { throw new Error('not allowed') })
    t.startTilt()
    expect(await t.requestTilt()).toBe(false)
    expect(t.getTiltStatus()).toBe('denied')
  })
})
