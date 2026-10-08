// @ts-check
// Pure decisions for the per-player localStorage caches that have a server copy
// under users/{uid} (stats, match history, Arrows stars, memory bests, daily
// memory attempts). A cache-owner marker records which uid those caches belong
// to, so they are never uploaded over, or inherited by, a different account.

export const CACHE_OWNER_KEY = 'gn-cache-owner'
export const PENDING_MERGE_KEY = 'gn-pending-guest-merge'

// Keys/prefixes of the synced caches. Deliberately NOT here: localStorage-only
// data with no server copy (birdseye progress, solo bests other than memory,
// daily streak, favourites, prefs, theme, font, name/avatar mirrors handled by
// social.js). Clearing those would destroy data that cannot be recovered.
const EXACT_KEYS = ['gn-stats', 'gn-matches', 'arrows-solo-v1']
const PREFIXES = ['memory-solo-best-', 'gn-daily-memory-']

/** @param {string} key */
export function isSyncedCacheKey(key) {
  return EXACT_KEYS.includes(key) || PREFIXES.some(p => key.startsWith(p))
}

/**
 * 'keep'  — caches already belong to this uid.
 * 'adopt' — no owner recorded (legacy install): keep caches, record owner.
 * 'reset' — caches belong to another uid: clear them, record the new owner.
 * @param {string|null|undefined} ownerUid
 * @param {string|null|undefined} currentUid
 * @returns {'keep'|'adopt'|'reset'|null} null when there is no current uid
 */
export function decideCacheOwner(ownerUid, currentUid) {
  if (!currentUid) return null
  if (!ownerUid) return 'adopt'
  return ownerUid === currentUid ? 'keep' : 'reset'
}

/**
 * Parse a stashed guest-merge record; null unless both fields are non-empty strings.
 * @param {string|null|undefined} raw
 * @returns {{ guestUid: string, guestIdToken: string }|null}
 */
export function parsePendingMerge(raw) {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    if (v && typeof v.guestUid === 'string' && v.guestUid && typeof v.guestIdToken === 'string' && v.guestIdToken) {
      return { guestUid: v.guestUid, guestIdToken: v.guestIdToken }
    }
  } catch { /* malformed */ }
  return null
}

/**
 * A merge is only worth calling for a permanent account that differs from the guest.
 * @param {{ guestUid: string }|null} pending
 * @param {string|null} currentUid
 * @param {boolean} permanent
 */
export function shouldMergeGuest(pending, currentUid, permanent) {
  return !!pending && !!currentUid && permanent && pending.guestUid !== currentUid
}
