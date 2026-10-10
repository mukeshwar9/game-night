// Storage side of playerCacheLogic.js: which uid the synced per-player
// localStorage caches belong to. Every upload of a cache to users/{uid} must
// check cacheBelongsTo(uid) first, so one account's data never overwrites another's.
import { CACHE_OWNER_KEY, decideCacheOwner, isSyncedCacheKey } from './playerCacheLogic'

export function getCacheOwner() {
  try { return localStorage.getItem(CACHE_OWNER_KEY) } catch { return null }
}

export function cacheBelongsTo(uid) {
  return !!uid && getCacheOwner() === uid
}

function clearSyncedCaches() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && isSyncedCacheKey(k)) keys.push(k)
    }
    keys.forEach(k => localStorage.removeItem(k))
  } catch { /* storage unavailable */ }
}

// Run when a uid becomes current, BEFORE any sync or mirror. Returns the decision.
export function ensureCacheOwner(uid) {
  const decision = decideCacheOwner(getCacheOwner(), uid)
  if (decision === 'reset') clearSyncedCaches()
  if (decision === 'reset' || decision === 'adopt') {
    try { localStorage.setItem(CACHE_OWNER_KEY, uid) } catch { /* storage unavailable */ }
  }
  return decision
}
