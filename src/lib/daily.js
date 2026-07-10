// Local yyyy-mm-dd so the puzzle rolls over at the player's midnight.
export function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Stable integer seed derived from the date string — identical for every client today.
export function seedFromDate(date) {
  let h = 0
  for (let i = 0; i < date.length; i++) h = (Math.imul(h, 31) + date.charCodeAt(i)) | 0
  return h >>> 0
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
