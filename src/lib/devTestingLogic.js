// F-51: pure helpers for the same-browser local-multiplayer testing mode.
// No DOM, no Firebase, no React — unit-testable per the game-logic rules.
// The impure wrapper (src/lib/devTesting.js) reads window/localStorage and
// calls these in module initializers.

export const DEV_SLOTS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'spectator']
export const TESTING_PROJECT_ID = 'demo-gamenight-test'
export const TESTING_DB_HOST = '127.0.0.1'
export const TESTING_DB_PORT = 9000
export const TESTING_AUTH_URL = 'http://127.0.0.1:9099'
export const DEV_PLAYER_PARAM = 'devPlayer'
export const SLOT_STORAGE_KEY = 'gn-dev-player'

// Testing mode requires BOTH its dedicated dev flag and a loopback hostname.
// Production builds (no dev mode) and non-loopback hosts never enable it —
// with or without a devPlayer parameter present.
export function isLoopbackHost(hostname) {
  const h = String(hostname || '').toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]'
}

export function testingModeEnabled({ devMode, flag, hostname }) {
  if (!devMode || !flag) return false
  return isLoopbackHost(hostname)
}

export function isValidDevSlot(slot) {
  return DEV_SLOTS.includes(String(slot || '').toLowerCase())
}

// URL slot wins over the tab's stored slot; anything else falls back to the
// stored slot (same-slot navigation away from ?devPlayer= keeps the player).
// An explicit-but-invalid URL parameter is ignored — the stored slot stays
// authoritative, matching how invalid query params are handled elsewhere.
export function resolveDevSlot({ param, stored }) {
  const p = String(param || '').toLowerCase()
  if (isValidDevSlot(p)) return p
  const s = String(stored || '').toLowerCase()
  return isValidDevSlot(s) ? s : null
}

// Slot-namespaced storage key. Empty/absent slot keeps the normal key so
// ordinary development and production builds are byte-identical.
export function namespacedKey(slot, key) {
  const s = String(slot || '').toLowerCase()
  if (!isValidDevSlot(s)) return key
  return `gn-dev-${s}:${key}`
}
