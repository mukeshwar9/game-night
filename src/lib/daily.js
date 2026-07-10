// The date /daily shipped — anchors "DAILY #N" so the count matches history.
const EPOCH_KEY = '2026-06-20'

const STREAK_KEY = 'gn-daily-streak'

// Local yyyy-mm-dd for an arbitrary Date, so the puzzle rolls over at the player's midnight.
export function dateKeyFor(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayKey() {
  return dateKeyFor(new Date())
}

function addDays(date, delta) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta)
}

// Stable integer seed derived from the date string — identical for every client today.
export function seedFromDate(date) {
  let h = 0
  for (let i = 0; i < date.length; i++) h = (Math.imul(h, 31) + date.charCodeAt(i)) | 0
  return h >>> 0
}

// 1-indexed day count since EPOCH_KEY, for "DAILY #N" — pure date-string math (UTC ms),
// so it's unaffected by DST shifts in the caller's local time.
export function getDailyNumber(date) {
  const toUTCDays = (key) => {
    const [y, m, d] = key.split('-').map(Number)
    return Date.UTC(y, m - 1, d) / 86_400_000
  }
  return Math.round(toUTCDays(date) - toUTCDays(EPOCH_KEY)) + 1
}

export function storageKey(date) { return `gn-daily-${date}` }

export function readBest(date) {
  try {
    const raw = localStorage.getItem(storageKey(date))
    if (!raw) return null
    const v = JSON.parse(raw)
    return typeof v?.best === 'number' ? v : null
  } catch { return null }
}

export function writeBest(date, score) {
  try { localStorage.setItem(storageKey(date), JSON.stringify({ best: score, at: Date.now() })) }
  catch { /* storage unavailable — best is in-memory only */ }
}

function readStreakRaw() {
  try {
    const raw = localStorage.getItem(STREAK_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    return (typeof v?.count === 'number' && typeof v?.lastDate === 'string') ? v : null
  } catch { return null }
}

function writeStreakRaw(v) {
  try { localStorage.setItem(STREAK_KEY, JSON.stringify(v)) }
  catch { /* storage unavailable — streak is in-memory only */ }
}

// Current streak for display. If the last counted day is neither today nor yesterday,
// the streak has lapsed (a day was missed) — report 0 without touching storage; the
// stored count only resets for real once bumpStreak() runs on the next completion.
export function getStreak(now = new Date()) {
  const raw = readStreakRaw()
  if (!raw) return { count: 0, lastDate: null }
  const today = dateKeyFor(now)
  const yesterday = dateKeyFor(addDays(now, -1))
  if (raw.lastDate !== today && raw.lastDate !== yesterday) return { count: 0, lastDate: raw.lastDate }
  return raw
}

// Call once per genuine daily completion. Same-day calls are idempotent (no-op past the
// first). Consecutive-day completions increment; any gap resets to 1.
export function bumpStreak(now = new Date()) {
  const today = dateKeyFor(now)
  const prev = readStreakRaw()
  if (prev?.lastDate === today) return prev

  const yesterday = dateKeyFor(addDays(now, -1))
  const count = prev?.lastDate === yesterday ? prev.count + 1 : 1
  const next = { count, lastDate: today }
  writeStreakRaw(next)
  return next
}
