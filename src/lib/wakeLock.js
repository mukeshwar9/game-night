// @ts-check
// Keeps the screen on while a match is live. Without it a phone auto-locks
// while a player waits out a long opponent turn; locking backgrounds the app,
// and the native shell then drops the database connection, so the player
// shows as away to everyone else (src/lib/native/shell.js).
//
// Uses the Screen Wake Lock API, which Safari/WKWebView (16.4+) and Chrome's
// Android web view both expose. The browser releases the lock whenever the
// page is hidden, so it is taken again each time the page comes back.

/**
 * @param {{ active: boolean, visible: boolean, supported: boolean }} s
 * @returns {boolean} whether a lock should be held right now
 */
export function shouldHoldWakeLock({ active, visible, supported }) {
  return supported && active && visible
}

/**
 * The side-effecting part, with its environment injected so tests can drive it.
 * @param {{ nav?: any, doc?: any }} [env]
 */
export function createWakeLockController({
  nav = typeof navigator === 'undefined' ? undefined : navigator,
  doc = typeof document === 'undefined' ? undefined : document,
} = {}) {
  const supported = typeof nav?.wakeLock?.request === 'function'
  let active = false
  /** @type {any} */
  let sentinel = null
  let pending = false

  async function sync() {
    const want = shouldHoldWakeLock({ active, visible: doc?.visibilityState !== 'hidden', supported })
    if (want && !sentinel && !pending) {
      pending = true
      try {
        const lock = await nav.wakeLock.request('screen')
        pending = false
        if (!active) { lock.release().catch(() => {}); return }
        sentinel = lock
        // The browser drops the lock on its own when the page hides.
        lock.addEventListener?.('release', () => { if (sentinel === lock) sentinel = null })
      } catch {
        // Refused (battery saver, no user activation yet): try again on the
        // next visibility change.
        pending = false
      }
    } else if (!want && sentinel) {
      const lock = sentinel
      sentinel = null
      lock.release().catch(() => {})
    }
  }

  const onVisibility = () => { sync() }
  doc?.addEventListener?.('visibilitychange', onVisibility)

  return {
    supported,
    /** @param {boolean} next */
    setActive(next) {
      active = !!next
      return sync()
    },
    held: () => !!sentinel,
    dispose() {
      doc?.removeEventListener?.('visibilitychange', onVisibility)
      active = false
      return sync()
    },
  }
}
