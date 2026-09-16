// One-time per-session reconciliation between localStorage stats (gn-stats,
// see profile.js) and the Firebase mirror at users/{uid}/stats. Ongoing sync
// after boot happens for free: recordMatch() mirrors every subsequent match.
// Lossy-safe by design — never decreases either side, prefers whichever side
// has played more games; no attempt to merge byGame/vs entry-by-entry.

import { ref, get, set as dbSet } from 'firebase/database'
import { db } from './firebase'
import { getUid } from './auth'
import { getStats, setStats, getMatches, setMatches } from './profile'

const MAX_MATCHES = 50

// Firebase returns either a real array or a numeric-keyed object depending on
// sparsity (see firebase-rules.md) — normalize by explicit key, never
// Object.values, which silently compacts gaps and can shift entries.
function normalizeMatchList(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (raw && typeof raw === 'object') {
    return Object.keys(raw)
      .sort((a, b) => Number(a) - Number(b))
      .map(k => raw[k])
      .filter(Boolean)
  }
  return []
}

// Pure decision: union local + remote match-history lists, dedupe by ts
// (+opponentUid tiebreak, so two matches finishing in the same millisecond
// against different opponents both survive), sort newest-first, cap at 50.
// Mirrors mergeStats' { list, action } shape: 'pull' when the merged list
// differs from local (local needs updating), 'upload' when it differs from
// remote (remote needs updating), 'none' when both already match.
export function mergeMatches(local, remote) {
  const localList = normalizeMatchList(local)
  const remoteList = normalizeMatchList(remote)

  const byKey = new Map()
  for (const m of [...localList, ...remoteList]) {
    const key = `${m.ts}|${m.opponentUid || ''}`
    if (!byKey.has(key)) byKey.set(key, m)
  }
  const list = [...byKey.values()]
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, MAX_MATCHES)

  const sameAsLocal = JSON.stringify(list) === JSON.stringify(localList)
  const sameAsRemote = JSON.stringify(list) === JSON.stringify(remoteList)
  const action = !sameAsLocal ? 'pull' : !sameAsRemote ? 'upload' : 'none'
  return { list, action }
}

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

  try {
    const matchesSnap = await get(ref(db, `users/${uid}/matches`))
    const remoteMatches = matchesSnap.exists() ? matchesSnap.val() : null
    const localMatches = getMatches()
    const { list, action } = mergeMatches(localMatches, remoteMatches)
    if (action === 'pull') setMatches(list)
    else if (action === 'upload') await dbSet(ref(db, `users/${uid}/matches`), list)
  } catch { /* offline / rules not deployed yet — local matches still work */ }
}
