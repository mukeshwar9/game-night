// Per-device personal best for the solo memory runs (localStorage; every access is
// wrapped because storage can be blocked or throw in private windows).
const key = type => `memory-solo-best-${type}`

export function readSoloBest(type) {
  try { return Number(localStorage.getItem(key(type))) || 0 } catch { return 0 }
}

// Stores `score` if it beats the saved best; returns true when it did.
export function recordSoloBest(type, score) {
  if (!(score > readSoloBest(type))) return false
  try { localStorage.setItem(key(type), String(score)) } catch { /* private mode */ }
  return true
}

// Lowest-is-best variant (Minigolf strokes). 0 / missing means no best yet.
export function readSoloLow(key) {
  try { return Number(localStorage.getItem(`solo-low-${key}`)) || 0 } catch { return 0 }
}

// Stores `score` if it is lower than the saved best (or there is none);
// returns true when it did.
export function recordSoloLow(key, score) {
  const best = readSoloLow(key)
  if (best && !(score < best)) return false
  try { localStorage.setItem(`solo-low-${key}`, String(score)) } catch { /* private mode */ }
  return true
}
