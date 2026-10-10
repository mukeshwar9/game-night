// A rider's own SIDE KICK choices, kept on this device: which camera and how to
// steer. One small store shared by the solo page, the online lobby, the HUD
// switch and the controls, so changing it anywhere changes it everywhere.

export const PREFS_KEY = 'sidekick-prefs'
export const CAMERAS = ['chase', 'first']
export const STEER_MODES = ['tilt', 'touch']
export const CAMERA_LABEL = { chase: 'CHASE', first: 'FIRST PERSON' }
/** Tilt is the default; phones without a usable sensor, or that refuse it, steer by touch instead. */
export const DEFAULT_PREFS = Object.freeze({ cam: 'chase', steer: 'tilt' })

/** Whatever was stored (or nothing) as a valid prefs object. */
export function normalizePrefs(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  return {
    cam: CAMERAS.includes(o.cam) ? o.cam : DEFAULT_PREFS.cam,
    steer: STEER_MODES.includes(o.steer) ? o.steer : DEFAULT_PREFS.steer,
  }
}

export function readPrefs(storage = globalThis.localStorage) {
  try { return normalizePrefs(JSON.parse(storage?.getItem(PREFS_KEY) || 'null')) } catch { return { ...DEFAULT_PREFS } }
}

export function writePrefs(prefs, storage = globalThis.localStorage) {
  try { storage?.setItem(PREFS_KEY, JSON.stringify(normalizePrefs(prefs))) } catch { /* storage unavailable: the choice lasts for this visit */ }
}

let current = null
const listeners = new Set()

export function getPrefs() {
  if (!current) current = readPrefs()
  return current
}

export function setPrefs(patch) {
  const next = normalizePrefs({ ...getPrefs(), ...patch })
  if (next.cam === current.cam && next.steer === current.steer) return current
  current = next
  writePrefs(next)
  for (const fn of listeners) fn()
  return next
}

export function subscribePrefs(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Test hook: forget the cached value so the next read goes to storage again. */
export function resetPrefsCache() {
  current = null
}
