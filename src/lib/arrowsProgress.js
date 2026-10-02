// Arrows solo progress: level stars and endless clears. localStorage is the
// synchronous read source (works signed out and offline); signed-in players
// also get a mirror at users/{uid}/arrowsSolo so progress follows them across
// devices. Both sides only ever merge upward (best stars, highest counts) —
// see mergeProgress in arrowsLevelsLogic.js.

import { ref, get, set as dbSet } from 'firebase/database'
import { db } from './firebase'
import { getUid } from './auth'
import { mergeProgress, normalizeProgress, sameProgress } from './arrowsLevelsLogic'

const KEY = 'arrows-solo-v1'
const SEEN_KEY = 'arrows-twists-seen'

export function readArrowsProgress() {
  try { return normalizeProgress(JSON.parse(localStorage.getItem(KEY))) } catch { return normalizeProgress(null) }
}

// Fire-and-forget mirror, same pattern as profile.js's stats mirror.
function mirror(progress) {
  const uid = getUid()
  if (!db || !uid) return
  dbSet(ref(db, `users/${uid}/arrowsSolo`), { ...progress, updatedAt: Date.now() }).catch(() => {})
}

export function saveArrowsProgress(progress) {
  const p = normalizeProgress(progress)
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* private mode */ }
  mirror(p)
  return p
}

// Pull the account copy, merge both ways and return the merged progress.
// Offline or signed out, it simply returns the device copy.
export async function syncArrowsProgress() {
  const local = readArrowsProgress()
  const uid = getUid()
  if (!db || !uid) return local
  try {
    const snap = await get(ref(db, `users/${uid}/arrowsSolo`))
    const remote = snap.exists() ? snap.val() : null
    const merged = mergeProgress(local, remote)
    if (!sameProgress(merged, local)) {
      try { localStorage.setItem(KEY, JSON.stringify(merged)) } catch { /* private mode */ }
    }
    if (!remote || !sameProgress(merged, remote)) {
      await dbSet(ref(db, `users/${uid}/arrowsSolo`), { ...merged, updatedAt: Date.now() })
    }
    return merged
  } catch {
    return local
  }
}

// Twists whose one-line tutorial this device has already shown.
export function readSeenTwists() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY)) || {} } catch { return {} }
}

export function markTwistSeen(twist) {
  const seen = { ...readSeenTwists(), [twist]: true }
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)) } catch { /* private mode */ }
  return seen
}
