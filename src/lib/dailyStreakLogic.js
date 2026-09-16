// Pure streak/history math for the daily challenge. No DOM/React/Firebase —
// operates entirely on a `history` map of { 'YYYY-MM-DD': score } and plain
// date strings. Date arithmetic is done via Date.UTC on split y/m/d
// components (never `new Date(dateString)`), matching src/lib/daily.js's
// pattern — this keeps every calculation timezone-safe regardless of the
// caller's local offset.

function toUTCms(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUTCms(ms) {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function addDaysToKey(dateStr, delta) {
  return fromUTCms(toUTCms(dateStr) + delta * 86_400_000)
}

// Consecutive run of played days ending today (or, if today hasn't been
// played yet, ending yesterday — the streak is still "alive" until a full
// day is missed). Returns 0 for empty history or a lapsed streak.
export function getCurrentStreak(history, today) {
  if (!history || typeof history !== 'object') return 0

  let cursor = today
  if (!(cursor in history)) {
    cursor = addDaysToKey(today, -1)
    if (!(cursor in history)) return 0
  }

  let count = 0
  while (cursor in history) {
    count++
    cursor = addDaysToKey(cursor, -1)
  }
  return count
}

// Longest consecutive run anywhere in the history, regardless of whether it
// touches today.
export function getBestStreak(history) {
  if (!history || typeof history !== 'object') return 0
  const dates = Object.keys(history).sort() // 'YYYY-MM-DD' sorts lexically == chronologically
  if (dates.length === 0) return 0

  let best = 1
  let run = 1
  for (let i = 1; i < dates.length; i++) {
    if (addDaysToKey(dates[i - 1], 1) === dates[i]) {
      run++
    } else {
      run = 1
    }
    best = Math.max(best, run)
  }
  return best
}

// Oldest-to-newest array of the 7 days ending today, for a compact history
// strip. `score` is null on unplayed days (0 is a legitimate played score).
export function getLast7Days(history, today) {
  const safeHistory = history && typeof history === 'object' ? history : {}
  const days = []
  for (let i = 6; i >= 0; i--) {
    const date = addDaysToKey(today, -i)
    const played = date in safeHistory
    days.push({ date, played, score: played ? safeHistory[date] : null })
  }
  return days
}
