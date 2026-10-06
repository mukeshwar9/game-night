import { describe, it, expect, vi } from 'vitest'
import { createWakeLockController, shouldHoldWakeLock } from './wakeLock'

function fakeEnv() {
  const listeners = new Set()
  const doc = {
    visibilityState: 'visible',
    addEventListener: (_t, fn) => listeners.add(fn),
    removeEventListener: (_t, fn) => listeners.delete(fn),
    fire() { listeners.forEach(fn => fn()) },
  }
  const locks = []
  const nav = {
    wakeLock: {
      request: vi.fn(async () => {
        const lock = { released: false, release: vi.fn(async () => { lock.released = true }), addEventListener: (_t, fn) => { lock.onRelease = fn } }
        locks.push(lock)
        return lock
      }),
    },
  }
  return { doc, nav, locks }
}

describe('shouldHoldWakeLock', () => {
  it('holds only while a match is live, the page is visible and the API exists', () => {
    expect(shouldHoldWakeLock({ active: true, visible: true, supported: true })).toBe(true)
    expect(shouldHoldWakeLock({ active: false, visible: true, supported: true })).toBe(false)
    expect(shouldHoldWakeLock({ active: true, visible: false, supported: true })).toBe(false)
    expect(shouldHoldWakeLock({ active: true, visible: true, supported: false })).toBe(false)
  })
})

describe('createWakeLockController', () => {
  it('takes the lock when a match starts and releases it when it ends', async () => {
    const { doc, nav, locks } = fakeEnv()
    const c = createWakeLockController({ nav, doc })
    await c.setActive(true)
    expect(nav.wakeLock.request).toHaveBeenCalledWith('screen')
    expect(c.held()).toBe(true)
    await c.setActive(false)
    expect(locks[0].released).toBe(true)
    expect(c.held()).toBe(false)
  })

  it('takes the lock again when the page comes back, since the browser dropped it on hide', async () => {
    const { doc, nav, locks } = fakeEnv()
    const c = createWakeLockController({ nav, doc })
    await c.setActive(true)
    // The browser releases the lock when the app is backgrounded.
    doc.visibilityState = 'hidden'
    locks[0].onRelease()
    doc.fire()
    expect(c.held()).toBe(false)
    doc.visibilityState = 'visible'
    doc.fire()
    await Promise.resolve(); await Promise.resolve()
    expect(nav.wakeLock.request).toHaveBeenCalledTimes(2)
    expect(c.held()).toBe(true)
  })

  it('does nothing where the API is missing, and survives a refused request', async () => {
    const none = createWakeLockController({ nav: {}, doc: fakeEnv().doc })
    await none.setActive(true)
    expect(none.held()).toBe(false)
    const { doc } = fakeEnv()
    const refused = createWakeLockController({ nav: { wakeLock: { request: () => Promise.reject(new Error('NotAllowedError')) } }, doc })
    await expect(refused.setActive(true)).resolves.toBeUndefined()
    expect(refused.held()).toBe(false)
  })

  it('releases on dispose', async () => {
    const { doc, nav, locks } = fakeEnv()
    const c = createWakeLockController({ nav, doc })
    await c.setActive(true)
    await c.dispose()
    expect(locks[0].released).toBe(true)
  })
})
