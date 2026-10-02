// @ts-check
// The player's record against each CPU level of a solo game: wins, losses and
// draws per difficulty, so "is HARD rigged?" has an answer on screen. Kept per
// device in localStorage (every access is wrapped: storage can be blocked or
// throw in private windows); the record is a convenience, not an account stat.

/** @typedef {{ w: number, l: number, d: number }} LevelRecord */
/** @typedef {Record<string, LevelRecord>} BotRecord */

const key = (/** @type {string} */ type) => `bot-record-${type}`

const count = (/** @type {unknown} */ n) => (Number.isInteger(n) && /** @type {number} */ (n) > 0 ? /** @type {number} */ (n) : 0)

/**
 * Whatever storage held, as a clean record (unknown shapes read as empty).
 * @param {unknown} raw
 * @returns {BotRecord}
 */
export function normalizeBotRecord(raw) {
  /** @type {BotRecord} */
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [level, r] of Object.entries(raw)) {
    if (!r || typeof r !== 'object') continue
    const row = /** @type {Record<string, unknown>} */ (r)
    out[level] = { w: count(row.w), l: count(row.l), d: count(row.d) }
  }
  return out
}

/**
 * The record after one finished game at `level`, from the player's side.
 * @param {BotRecord} record
 * @param {string} level
 * @param {'win' | 'loss' | 'draw'} outcome
 * @returns {BotRecord}
 */
export function addBotResult(record, level, outcome) {
  const row = record[level] ?? { w: 0, l: 0, d: 0 }
  const field = outcome === 'win' ? 'w' : outcome === 'loss' ? 'l' : 'd'
  return { ...record, [level]: { ...row, [field]: row[field] + 1 } }
}

/**
 * Short on-screen form: "3–1", or "3–1–2" once there are draws; '' when the
 * level has never been played.
 * @param {LevelRecord | undefined} row
 */
export function formatLevelRecord(row) {
  if (!row || row.w + row.l + row.d === 0) return ''
  return row.d ? `${row.w}–${row.l}–${row.d}` : `${row.w}–${row.l}`
}

/**
 * Screen-reader form: "3 wins, 1 loss, 2 draws".
 * @param {LevelRecord | undefined} row
 */
export function describeLevelRecord(row) {
  if (!row || row.w + row.l + row.d === 0) return 'not played yet'
  const part = (/** @type {number} */ n, /** @type {string} */ one, /** @type {string} */ many) => `${n} ${n === 1 ? one : many}`
  return [part(row.w, 'win', 'wins'), part(row.l, 'loss', 'losses'), row.d ? part(row.d, 'draw', 'draws') : null]
    .filter(Boolean).join(', ')
}

/**
 * The level a game counts under when the player switched levels mid-game:
 * the easiest one used, so a win can't be moved onto HARD at the last move.
 * `levels` is ordered easiest first.
 * @param {string} a
 * @param {string} b
 * @param {string[]} levels
 */
export function easierLevel(a, b, levels) {
  return levels.indexOf(b) !== -1 && levels.indexOf(b) < levels.indexOf(a) ? b : a
}

/**
 * @param {string} type
 * @returns {BotRecord}
 */
export function readBotRecord(type) {
  try { return normalizeBotRecord(JSON.parse(localStorage.getItem(key(type)) || '{}')) } catch { return {} }
}

/**
 * Adds one result and stores it; returns the new record (also when storage
 * is unavailable, so the screen still updates for this visit).
 * @param {string} type
 * @param {string} level
 * @param {'win' | 'loss' | 'draw'} outcome
 * @returns {BotRecord}
 */
export function recordBotResult(type, level, outcome) {
  const next = addBotResult(readBotRecord(type), level, outcome)
  try { localStorage.setItem(key(type), JSON.stringify(next)) } catch { /* private mode */ }
  return next
}
