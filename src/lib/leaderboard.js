// Friends-scoped leaderboard (F-33 v1). One-shot fetch of users/{uid}/stats for
// me + friends — no live subscription, matching the fetchContinueRooms pattern
// in continueRooms.js. Profile info (name/avatar/online) is already loaded by
// the caller (Friends.jsx via subscribeProfile/useAuth) — this module only
// touches stats and returns them unranked/unmerged. rankEntries is pure and
// exported separately for unit testing.

import { ref, get } from 'firebase/database'
import { db } from './firebase'
import { getUid } from './auth'
import { getStats } from './profile'

function winrate(entry) {
  const games = entry.games || 0
  return games > 0 ? (entry.wins || 0) / games : 0
}

// Sort by wins desc, tiebreak winrate desc, then games desc. Ties share a rank
// (1-based, standard competition ranking, e.g. 1, 2, 2, 4).
export function rankEntries(entries) {
  const sorted = [...entries].sort((a, b) => {
    const winsDiff = (b.wins || 0) - (a.wins || 0)
    if (winsDiff) return winsDiff
    const winrateDiff = winrate(b) - winrate(a)
    if (winrateDiff) return winrateDiff
    return (b.games || 0) - (a.games || 0)
  })

  let rank = 0
  let prevKey = null
  return sorted.map((entry, i) => {
    const key = `${entry.wins || 0}|${winrate(entry)}|${entry.games || 0}`
    if (key !== prevKey) { rank = i + 1; prevKey = key }
    return { ...entry, rank }
  })
}

// One-shot fetch of { uid, wins, losses, games } for me + the given friend
// uids. A uid with no stats node (never finished a synced match) comes back
// as zeroes rather than being dropped, so it still ranks (last, via
// rankEntries' tiebreaks). Self falls back to local getStats() when the
// remote mirror is missing — e.g. a guest whose matches never synced.
export async function fetchFriendsLeaderboard(friendUids = []) {
  const me = getUid()
  const uids = [...new Set([me, ...friendUids].filter(Boolean))]
  if (!db || !uids.length) return []

  const results = await Promise.allSettled(uids.map(uid => get(ref(db, `users/${uid}/stats`))))
  return uids.map((uid, i) => {
    const res = results[i]
    let stats = res.status === 'fulfilled' && res.value.exists() ? res.value.val() : null
    if (!stats && uid === me) stats = getStats()
    return {
      uid,
      wins: stats?.wins || 0,
      losses: stats?.losses || 0,
      games: stats?.games || 0,
    }
  })
}
