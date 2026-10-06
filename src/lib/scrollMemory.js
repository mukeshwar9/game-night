// @ts-check
// Scroll positions per history entry, so going back lands where the player
// left the page (as a native navigation stack does) instead of at the top.
// Pure: the App wires it to window scroll and react-router's navigation type.

/**
 * Where to scroll after a route change: a back/forward step (POP) returns to
 * the saved offset of the entry it lands on; anything else starts at the top.
 * @param {'POP' | 'PUSH' | 'REPLACE'} navigationType
 * @param {number | undefined} saved
 */
export function scrollTargetFor(navigationType, saved) {
  return navigationType === 'POP' && typeof saved === 'number' && saved > 0 ? saved : 0
}

/** Remembers the last `max` entries' offsets, oldest dropped first. */
export function createScrollMemory(max = 50) {
  /** @type {Map<string, number>} */
  const offsets = new Map()
  return {
    /** @param {string} key @param {number} y */
    save(key, y) {
      if (!key) return
      offsets.delete(key)
      offsets.set(key, Math.max(0, Math.round(y)))
      while (offsets.size > max) offsets.delete(offsets.keys().next().value)
    },
    /** @param {string} key */
    get: (key) => offsets.get(key),
    size: () => offsets.size,
  }
}
