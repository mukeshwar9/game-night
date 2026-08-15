// No-login local profile: lifetime stats, head-to-head (keyed by opponent uid,
// falling back to name for legacy/unauthenticated entries), and a recent-rooms
// list — all in localStorage so they work with zero backend/auth. Signed-in
// users additionally get their stats mirrored to users/{uid}/stats (see
// mirrorStats below and statsSync.js) so they carry over across devices;
// localStorage stays the synchronous read source.

import { ref, set as dbSet } from 'firebase/database'
import { db } from './firebase'
import { getUid } from './auth'

const STATS_KEY = 'gn-stats'
const ROOMS_KEY = 'gn-rooms'

const blankStats = () => ({
  games: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0,
  byGame: {}, vs: {},
})

export function getStats() {
  try {
    const s = JSON.parse(localStorage.getItem(STATS_KEY))
    return s && typeof s === 'object' ? { ...blankStats(), ...s } : null
  } catch { return null }
}

export function setStats(s) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)) } catch { /* quota */ }
  return s
}

// Fire-and-forget mirror to Firebase — swallow errors, no-op when signed out
// or db unavailable. Never awaited by callers; localStorage is already durable.
function mirrorStats(stats) {
  const uid = getUid()
  if (!db || !uid) return
  dbSet(ref(db, `users/${uid}/stats`), stats).catch(() => {})
}

// Record one finished MATCH from this browser's perspective. Idempotency is the
// caller's responsibility (call once per match-end transition). `opponentUid`
// keys head-to-head by identity (rename-proof); omit it to fall back to the
// legacy name-keyed entry shape for callers that don't have it yet.
export function recordMatch({ gameType, won, opponentName, opponentUid }) {
  const s = getStats() || blankStats()
  s.games += 1
  if (won) {
    s.wins += 1
    s.streak += 1
    s.bestStreak = Math.max(s.bestStreak, s.streak)
  } else {
    s.losses += 1
    s.streak = 0
  }
  if (gameType) {
    const g = s.byGame[gameType] || { w: 0, l: 0 }
    g[won ? 'w' : 'l'] += 1
    s.byGame[gameType] = g
  }
  const name = (opponentName || '').trim()
  const key = opponentUid || name
  if (key) {
    const v = s.vs[key] || { w: 0, l: 0 }
    v[won ? 'w' : 'l'] += 1
    if (opponentUid && name) v.name = name
    s.vs[key] = v
  }
  setStats(s)
  mirrorStats(s)
  return s
}

// Head-to-head vs a seated opponent (uid-keyed only — no legacy name fallback).
export function getHeadToHead(opponentUid) {
  if (!opponentUid) return null
  const entry = getStats()?.vs?.[opponentUid]
  if (!entry) return null
  const myWins = entry.w || 0
  const theirWins = entry.l || 0
  if (myWins + theirWins === 0) return null
  return { myWins, theirWins }
}

export function formatHeadToHeadLabel(myWins, theirWins) {
  if (myWins > theirWins) return `YOU LEAD ${myWins}–${theirWins}`
  if (theirWins > myWins) return `THEY LEAD ${theirWins}–${myWins}`
  return `SERIES TIED ${myWins}–${theirWins}`
}

export function getRooms() {
  try {
    const list = JSON.parse(localStorage.getItem(ROOMS_KEY))
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

// Remember a room you created or joined so it's one tap to return.
export function recordRoom({ id, gameType, name }) {
  if (!id) return
  let list = getRooms().filter(r => r.id !== id)
  list.unshift({ id, gameType: gameType || null, name: name || null, ts: Date.now() })
  list = list.slice(0, 6)
  try { localStorage.setItem(ROOMS_KEY, JSON.stringify(list)) } catch { /* quota */ }
}

export function forgetRoom(id) {
  try { localStorage.setItem(ROOMS_KEY, JSON.stringify(getRooms().filter(r => r.id !== id))) } catch { /* ignore */ }
}
