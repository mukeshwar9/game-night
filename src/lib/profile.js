// No-login local profile: lifetime stats, head-to-head (by opponent name), and a
// recent-rooms list — all in localStorage so they work with zero backend/auth.
// (A future enhancement can mirror these to a stats/{playerId} node once
// anonymous auth + rules land; see README.)

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

// Record one finished MATCH from this browser's perspective. Idempotency is the
// caller's responsibility (call once per match-end transition).
export function recordMatch({ gameType, won, opponentName }) {
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
  const opp = (opponentName || '').trim()
  if (opp) {
    const v = s.vs[opp] || { w: 0, l: 0 }
    v[won ? 'w' : 'l'] += 1
    s.vs[opp] = v
  }
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)) } catch { /* quota */ }
  return s
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
