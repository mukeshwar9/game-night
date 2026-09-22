// F-51: storage adapter. In dev testing mode every player-specific key is
// namespaced per player slot (`gn-dev-<slot>:<key>`), so same-browser tabs
// playing different slots can't see each other's profile mirrors, stats,
// rooms, favorites, seat records, or hidden-word secrets — and can't inherit
// them from an opener tab either. In every other mode the adapter is a
// transparent pass-through (byte-identical behavior, zero prefix).
//
// Deliberately NOT a monkey-patch of window.localStorage/sessionStorage:
// call sites import these objects explicitly, so normal-mode code paths stay
// auditable. UI/device-level keys (theme, sound settings, scroll position,
// picker state) intentionally stay on raw storage — shared device state.

import { devSlot, isTestingMode } from './devTesting'
import { namespacedKey } from './devTestingLogic'

// No slot → no namespacing even when testing mode is on (launcher page).
const SLOT = isTestingMode ? devSlot : null

// In-memory fallback for non-DOM environments (unit tests) where the global
// storage objects may be undefined — mirrors the per-test stubs' semantics.
function memoryStore() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  }
}

function makeStore(backing) {
  return {
    getItem: (key) => backing.getItem(namespacedKey(SLOT, key)),
    setItem: (key, value) => backing.setItem(namespacedKey(SLOT, key), value),
    removeItem: (key) => backing.removeItem(namespacedKey(SLOT, key)),
  }
}

export const localStore = makeStore(typeof localStorage !== 'undefined' ? localStorage : memoryStore())
export const sessionStore = makeStore(typeof sessionStorage !== 'undefined' ? sessionStorage : memoryStore())
