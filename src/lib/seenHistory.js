// Per-room "seen" history for party-game decks (Spyfair locations, Wavelength
// spectra, Sketch words), so a group that keeps one room open all evening
// doesn't get the same card twice until the deck runs out.
//
// Stored at `games/{id}/seen/{gameType}` as `{ [deckIndex]: seq }`, where `seq`
// is a monotonic recency counter (higher = seen more recently). Keyed by deck
// index, so decks must stay APPEND-ONLY: never reorder or delete entries, or
// old history points at the wrong cards. New cards appended to a deck are
// simply unseen. A map (not an array) keeps writes per-key and dedup free, and
// the node is capped at the deck size because re-seeing a card overwrites its
// seq instead of adding an entry.
//
// Once every card has been seen, selection falls back to the least recently
// seen half of the deck, so the cycle restarts without an immediate repeat.
//
// Deliberately NOT in games.js FIELD_NULLS: it outlives NEW MATCH and game
// switches, which is the point.
//
// Pure — no DOM/Firebase/React. Selection takes an `rng` so callers can pass a
// seeded generator when every client must agree on the pick.

/**
 * Normalize whatever Firebase returned into `{ [index]: seq }`. Firebase may
 * hand a numeric-keyed map back as a (sparse) array, so read by key.
 */
export function normalizeSeen(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw)) {
    const i = Number(k)
    const seq = Number(v)
    if (!Number.isInteger(i) || i < 0 || v == null || !Number.isFinite(seq)) continue
    out[i] = seq
  }
  return out
}

function nextSeq(seen) {
  let max = 0
  for (const v of Object.values(seen)) if (v > max) max = v
  return max + 1
}

/**
 * Record `indices` as seen, most recent last. Returns a new map.
 */
export function markSeen(seen, indices) {
  const next = normalizeSeen(seen)
  let seq = nextSeq(next)
  for (const i of indices || []) {
    if (Number.isInteger(i) && i >= 0) next[i] = seq++
  }
  return next
}

/**
 * Multi-path patch for `update()`: `{ 'seen/<type>/<index>': seq }` for each
 * index, continuing the recency counter of `seen`.
 */
export function seenPatch(gameType, seen, indices) {
  const before = normalizeSeen(seen)
  const after = markSeen(before, indices)
  const patch = {}
  for (const i of indices || []) {
    if (after[i] != null) patch[`seen/${gameType}/${i}`] = after[i]
  }
  return patch
}

/**
 * Deck indices a picker should avoid. While at least `minFresh` never-seen
 * cards remain (not counting `exclude`), that is every seen card; once the
 * deck is (nearly) exhausted it is only the most recently seen half.
 *
 * @returns {number[]} ascending indices, all `< deckSize`.
 */
export function avoidList(deckSize, seen, minFresh = 1, exclude = []) {
  const s = normalizeSeen(seen)
  const ex = new Set(exclude)
  const seenIdx = Object.keys(s).map(Number).filter(i => i < deckSize)
  let freshCount = 0
  for (let i = 0; i < deckSize; i++) if (s[i] == null && !ex.has(i)) freshCount++
  if (freshCount >= minFresh) return seenIdx.sort((a, b) => a - b)
  const newestFirst = [...seenIdx].sort((a, b) => s[b] - s[a] || a - b)
  return newestFirst.slice(0, Math.floor(seenIdx.length / 2)).sort((a, b) => a - b)
}

/**
 * Pick one deck index: never-seen first, then the least recently seen half,
 * never anything in `exclude` unless the deck leaves no other choice.
 *
 * @returns {number|null} null only for an empty deck.
 */
export function pickFresh(deckSize, seen, rng = Math.random, exclude = []) {
  if (!(deckSize > 0)) return null
  const ex = new Set(exclude)
  const avoid = new Set(avoidList(deckSize, seen, 1, exclude))
  const all = Array.from({ length: deckSize }, (_, i) => i)
  const pools = [
    all.filter(i => !ex.has(i) && !avoid.has(i)),
    all.filter(i => !ex.has(i)),
    all,
  ]
  const pool = pools.find(p => p.length > 0)
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]
}
