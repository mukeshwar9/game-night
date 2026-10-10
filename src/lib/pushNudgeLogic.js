// @ts-check
// When to ask for notifications in context (the waiting room, the Friends
// page) instead of only from the toggle buried in Profile. Pure.

// A NOT NOW keeps that spot quiet for this long.
export const NUDGE_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000

/**
 * `available`: push can work here (pushAvailable()). `enabled`: already on.
 * `permission`: 'granted' | 'denied' | 'default' | 'unsupported'.
 * `dismissedAt`: the last NOT NOW for this spot.
 * @param {{ available: boolean, enabled: boolean, permission: string, dismissedAt?: number | null, now?: number }} s
 */
export function shouldShowPushNudge({ available, enabled, permission, dismissedAt = null, now = Date.now() }) {
  if (!available || enabled) return false
  // Denied is the toggle's job (it links to settings); unsupported is final.
  if (permission === 'denied' || permission === 'unsupported') return false
  return !(typeof dismissedAt === 'number' && now - dismissedAt < NUDGE_SNOOZE_MS)
}
