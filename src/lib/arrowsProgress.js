// Arrows solo progress: level stars and endless clears. localStorage is the
// synchronous read source (works signed out and offline); signed-in players
// also get a mirror at users/{uid}/arrowsSolo so progress follows them across
// devices. Both sides only ever merge upward (best stars, highest counts) —
// see mergeProgress in arrowsLevelsLogic.js.

import { ref, get, set as dbSet } from 'firebase/database'
import { toast } from 'sonner'
import { db } from './firebase'
import { getUid } from './auth'
import { mergeProgress, normalizeProgress, sameProgress } from './arrowsLevelsLogic'

const KEY = 'arrows-solo-v1'
const SEEN_KEY = 'arrows-twists-seen'

export function readArrowsProgress() {
  try { return normalizeProgress(JSON.parse(localStorage.getItem(KEY))) } catch { return normalizeProgress(null) }
}

// A failed account write must not pass silently: the rules once capped level
// keys at l20, so every save past level 20 was rejected without a trace.
// Progress is still safe on the device, so say so once per session and log
// each failure.
let warnedSync = false
function reportSyncError(err) {
  console.warn('Arrows progress did not reach your account:', err)
  if (warnedSync) return
  warnedSync = true
  toast.error('Arrows progress saved on this device only — account sync failed.')
}

// Fire-and-forget mirror, same pattern as profile.js's stats mirror.
function mirror(progress) {
  const uid = getUid()
  if (!db || !uid) return
  dbSet(ref(db, `users/${uid}/arrowsSolo`), { ...progress, updatedAt: Date.now() }).catch(reportSyncError)
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
      await dbSet(ref(db, `users/${uid}/arrowsSolo`), { ...merged, updatedAt: Date.now() }).catch(reportSyncError)
    }
    return merged
  } catch (err) {
    // Reading the account copy failed (offline, most likely): keep playing
    // from the device copy.
    console.warn('Arrows progress could not be read from your account:', err)
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
