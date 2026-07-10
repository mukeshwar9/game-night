// One-time per-session reconciliation between localStorage stats (gn-stats,
// see profile.js) and the Firebase mirror at users/{uid}/stats. Ongoing sync
// after boot happens for free: recordMatch() mirrors every subsequent match.
// Lossy-safe by design — never decreases either side, prefers whichever side
// has played more games; no attempt to merge byGame/vs entry-by-entry.

import { ref, get, set as dbSet } from 'firebase/database'
import { db } from './firebase'
import { getUid } from './auth'
import { getStats, setStats } from './profile'

// Pure decision: given local + remote stats snapshots, which one is more
// advanced and what should happen to reconcile the other side. Exported for
// unit testing without touching Firebase.
export function mergeStats(local, remote) {
  if (!remote) return { stats: local, action: local ? 'upload' : 'none' }
  if (!local) return { stats: remote, action: 'pull' }
  if (remote.games > local.games) return { stats: remote, action: 'pull' }
  if (local.games > remote.games) return { stats: local, action: 'upload' }
  return { stats: local, action: 'none' }
}

let synced = false

// Call once per signed-in session (e.g. from AuthContext's per-uid effect).
export async function syncStatsOnBoot() {
  if (synced) return
  synced = true
  const uid = getUid()
  if (!db || !uid) return
  try {
    const snap = await get(ref(db, `users/${uid}/stats`))
    const remote = snap.exists() ? snap.val() : null
    const local = getStats()
    const { stats, action } = mergeStats(local, remote)
    if (action === 'pull') setStats(stats)
    else if (action === 'upload' && stats) await dbSet(ref(db, `users/${uid}/stats`), stats)
  } catch { /* offline / rules not deployed yet — local stats still work */ }
}
