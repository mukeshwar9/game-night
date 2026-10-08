// @ts-check
// When to ask a guest to SAVE their progress with a real account. Pure: the
// caller supplies the session flag, snooze timestamps and the clock.

export const HOME_MIN_MATCHES = 3
export const HOME_MIN_FRIENDS = 1
export const HOME_MIN_STARS = 20
export const MATCH_END_MIN_MATCHES = 1
export const FRIENDS_MIN_FRIENDS = 1
export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

/** @typedef {'match-end'|'home'|'friends'|'profile'} SaveSurface */
/** @typedef {{ matches?: number, friends?: number, stars?: number }} SaveCounts */

export const SAVE_SURFACES = ['match-end', 'home', 'friends', 'profile']

/** Profile is a place the player chose to visit, so it is not capped or snoozed. */
export function isCappedSurface(surface) {
  return surface !== 'profile'
}

/**
 * @param {{ surface: string, isAnonymous: boolean, canSave: boolean, counts?: SaveCounts,
 *   shownThisSession?: boolean, snoozedUntil?: number, now?: number }} p
 */
export function shouldOfferSave({ surface, isAnonymous, canSave, counts = {}, shownThisSession = false, snoozedUntil = 0, now = Date.now() }) {
  if (!isAnonymous || !canSave) return false
  if (!SAVE_SURFACES.includes(surface)) return false
  const matches = counts.matches || 0
  const friends = counts.friends || 0
  const stars = counts.stars || 0
  if (surface === 'profile') return true
  if (shownThisSession) return false
  if (snoozedUntil && now < snoozedUntil) return false
  if (surface === 'match-end') return matches >= MATCH_END_MIN_MATCHES
  if (surface === 'friends') return friends >= FRIENDS_MIN_FRIENDS
  return matches >= HOME_MIN_MATCHES || friends >= HOME_MIN_FRIENDS || stars >= HOME_MIN_STARS
}

/** Timestamp until which NOT NOW hides a surface. */
export function snoozeUntil(now = Date.now()) {
  return now + SNOOZE_MS
}

/** "3 MATCHES · 1 FRIEND · 24 STARS", zero parts omitted. */
export function saveCountsLine(counts = {}) {
  const part = (n, one, many) => (n > 0 ? `${n} ${n === 1 ? one : many}` : null)
  const parts = [
    part(counts.matches || 0, 'MATCH', 'MATCHES'),
    part(counts.friends || 0, 'FRIEND', 'FRIENDS'),
    part(counts.stars || 0, 'STAR', 'STARS'),
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'YOUR PROFILE, LOOK AND FRIENDS'
}
