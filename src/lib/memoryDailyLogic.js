// @ts-check
// DAILY MEMORY: one seeded memory run a day, the same deal for everyone, one
// attempt, compared with friends. Pure helpers; the page (DailyMemory.jsx) and
// the Firebase mirror (memoryProgress.js) do the I/O.
import { mulberry32 } from './detMath'
import { seedFromDate, getDailyNumber } from './daily'

// The game of the day rotates through the four memory solo runs.
export const DAILY_MEMORY_GAMES = ['visualmemory', 'chimp', 'simon', 'numbermemory']

/** @param {string} dateKey yyyy-mm-dd (UTC, from daily.js todayKey) */
export function dailyMemoryGame(dateKey) {
  const n = getDailyNumber(dateKey)
  return DAILY_MEMORY_GAMES[((n % DAILY_MEMORY_GAMES.length) + DAILY_MEMORY_GAMES.length) % DAILY_MEMORY_GAMES.length]
}

// The day's random stream: identical on every device for the same date and game,
// so everyone starts from the same pattern, sequence, layout or number.
/** @param {string} dateKey @param {string} type */
export function dailyMemoryRand(dateKey, type) {
  return mulberry32((seedFromDate(`${dateKey}:memory:${type}`) ^ 0x9e3779b9) >>> 0)
}

// Unit shown next to a score, per game.
export const DAILY_MEMORY_UNITS = { visualmemory: 'LEVELS', chimp: 'NUMBERS', simon: 'PADS', numbermemory: 'DIGITS' }

// Best scores per memory game, merged upward (device and account copies).
/** @param {Record<string, number>|null|undefined} a @param {Record<string, number>|null|undefined} b */
export function mergeBests(a, b) {
  /** @type {Record<string, number>} */
  const out = {}
  for (const src of [a, b]) {
    for (const [k, v] of Object.entries(src ?? {})) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = Math.max(out[k] ?? 0, Math.floor(v))
    }
  }
  return out
}

// Today's board: highest score first, earlier finish breaking ties; `me` flags the viewer.
/**
 * @param {Array<{ uid: string, score: number, at?: number, name?: string }>} entries
 * @param {string|null} myUid
 */
export function rankDailyEntries(entries, myUid) {
  return [...entries]
    .filter(e => e && typeof e.score === 'number')
    .sort((x, y) => y.score - x.score || (x.at ?? 0) - (y.at ?? 0))
    .map((e, i) => ({ ...e, rank: i + 1, me: e.uid === myUid }))
}
