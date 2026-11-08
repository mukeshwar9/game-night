// A rider's own SIDE KICK choices, kept on this device: which camera, how to
// steer and how to kick. One small store shared by the solo page, the online lobby, the HUD
// switch and the controls, so changing it anywhere changes it everywhere.

export const PREFS_KEY = 'sidekick-prefs'
export const CAMERAS = ['chase', 'first']
export const STEER_MODES = ['tilt', 'touch']
export const KICK_MODES = ['auto', 'two']
export const CAMERA_LABEL = { chase: 'CHASE', first: 'FIRST PERSON' }
export const KICK_LABEL = { auto: 'ONE BUTTON', two: 'KICK L / R' }
/**
 * Tilt is the default; phones without a usable sensor, or that refuse it, steer by touch instead.
 * One self-aiming KICK button is the default; `two` is the old KICK L / KICK R pair. A saved
 * choice from before the setting existed has no `kick` and reads as the default.
 */
export const DEFAULT_PREFS = Object.freeze({ cam: 'chase', steer: 'tilt', kick: 'auto' })

/** Whatever was stored (or nothing) as a valid prefs object. */
export function normalizePrefs(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  return {
    cam: CAMERAS.includes(o.cam) ? o.cam : DEFAULT_PREFS.cam,
    steer: STEER_MODES.includes(o.steer) ? o.steer : DEFAULT_PREFS.steer,
    kick: KICK_MODES.includes(o.kick) ? o.kick : DEFAULT_PREFS.kick,
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
  if (next.cam === current.cam && next.steer === current.steer && next.kick === current.kick) return current
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
