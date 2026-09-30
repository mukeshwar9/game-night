// @ts-check
// Hand-off from native events (a tapped notification, an opened invite link)
// to react-router. Those events can arrive before the router has mounted —
// a cold start from a notification fires its tap listener during boot — so
// the latest request is kept until a navigator subscribes.

/** @type {string | null} */
let pending = null
/** @type {Set<(path: string) => void>} */
const listeners = new Set()

/** Ask the app to open an in-app path such as `/game/abc`. */
export function requestNavigate(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return
  if (listeners.size === 0) { pending = path; return }
  listeners.forEach(fn => fn(path))
}

/**
 * Subscribe the router's navigate(). Delivers a request that arrived before
 * anyone was listening. Returns an unsubscribe function.
 * @param {(path: string) => void} fn
 */
export function onNavigateRequest(fn) {
  listeners.add(fn)
  if (pending) {
    const path = pending
    pending = null
    fn(path)
  }
  return () => { listeners.delete(fn) }
}
