// @ts-check
// Home's JUMP BACK IN rail. Rooms already remember themselves (profile.js
// recordRoom) and finished matches land in stats.byGame, but a solo or
// pass-and-play session leaves neither behind — analytics.recordPlay only
// bumps remote counters — so after three /solo games the rail stayed empty.
// recordRecentPlay keeps a small local list for those modes; buildRecentPlays
// merges it with the room list into one newest-first rail.

const RECENT_KEY = 'gn-recent-plays'
export const MAX_RECENT = 8
export const RECENT_MODES = ['solo', 'local', 'multi']

/**
 * @typedef {{ type: string, mode: string, ts: number | null }} RecentPlay
 */

/**
 * Put `entry` at the front, dropping any older entry for the same game.
 * @param {RecentPlay[]} list
 * @param {RecentPlay} entry
 * @param {number} [max]
 * @returns {RecentPlay[]}
 */
export function pushRecent(list, entry, max = MAX_RECENT) {
  return [entry, ...list.filter(e => e.type !== entry.type)].slice(0, max)
}

/**
 * One newest-first list, one entry per game. `plays` are recordRecentPlay
 * entries, `rooms` profile.js getRooms() entries ({ gameType, ts }), and
 * `statsTypes` the games with a recorded match (no timestamp, so they only
 * fill leftover slots, in the order given). Unknown types are dropped.
 * @param {{ plays?: any[], rooms?: any[], statsTypes?: string[], known: Set<string>, limit?: number }} input
 * @returns {RecentPlay[]}
 */
export function buildRecentPlays({ plays = [], rooms = [], statsTypes = [], known, limit = 6 }) {
  /** @type {RecentPlay[]} */
  const dated = []
  for (const p of plays) {
    if (p && typeof p.type === 'string' && typeof p.ts === 'number') dated.push({ type: p.type, mode: p.mode, ts: p.ts })
  }
  for (const r of rooms) {
    if (r && typeof r.gameType === 'string') dated.push({ type: r.gameType, mode: 'multi', ts: typeof r.ts === 'number' ? r.ts : 0 })
  }
  dated.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))

  const seen = new Set()
  /** @type {RecentPlay[]} */
  const out = []
  const add = (/** @type {RecentPlay} */ e) => {
    if (out.length >= limit || seen.has(e.type) || !known.has(e.type)) return
    seen.add(e.type)
    out.push(e)
  }
  dated.forEach(add)
  statsTypes.forEach(type => add({ type, mode: 'multi', ts: null }))
  return out
}

/**
 * Short relative time for the rail: "just now", "5m ago", "2h ago", "3d ago".
 * @param {number | null | undefined} ts
 * @param {number} now
 * @returns {string}
 */
export function formatAgo(ts, now) {
  if (typeof ts !== 'number' || !ts) return ''
  const mins = Math.floor(Math.max(0, now - ts) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/**
 * How the game was last played, as the rail's sub-line.
 * @param {string} mode
 */
export function modeLabel(mode) {
  if (mode === 'solo') return 'vs CPU'
  if (mode === 'local') return 'same device'
  return 'online'
}

/** @returns {RecentPlay[]} */
export function getRecentPlays() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || 'null')
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

/**
 * Remember that this browser just opened `gameType` in `mode`. Call it
 * wherever analytics.recordPlay is called.
 * @param {string} gameType
 * @param {string} mode
 */
export function recordRecentPlay(gameType, mode) {
  if (!gameType || !RECENT_MODES.includes(mode)) return
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(pushRecent(getRecentPlays(), { type: gameType, mode, ts: Date.now() })))
  } catch { /* storage unavailable — the rail just stays shorter */ }
}
