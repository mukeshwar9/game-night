import { WAVELENGTH_PAIRS } from './decks/wavelength'

// A guess this many points (or fewer) from the target scores the maximum.
export const WAVELENGTH_MAX_SCORE = 50
// Guesses farther than this from the target score nothing.
export const WAVELENGTH_MISS_DISTANCE = 50

export const WAVELENGTH_PAIR_COUNT = WAVELENGTH_PAIRS.length

// Wrap a possibly-out-of-range index back onto the deck.
export function getSpectrumPair(spectrumIndex) {
  const i = ((spectrumIndex % WAVELENGTH_PAIR_COUNT) + WAVELENGTH_PAIR_COUNT) % WAVELENGTH_PAIR_COUNT
  return WAVELENGTH_PAIRS[i]
}

// Pick a random spectrum index, optionally avoiding `exclude`.
export function randomSpectrumIndex(exclude = -1) {
  if (WAVELENGTH_PAIR_COUNT <= 1) return 0
  let i = Math.floor(Math.random() * WAVELENGTH_PAIR_COUNT)
  if (i === exclude) i = (i + 1) % WAVELENGTH_PAIR_COUNT
  return i
}

// Hidden target somewhere comfortably inside the dial (8–92) so it's always
// reachable from either side.
export function randomTarget() {
  return 8 + Math.floor(Math.random() * 85)
}

export function clampGuess(value) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return 50
  return Math.max(0, Math.min(100, n))
}

// Closeness score: WAVELENGTH_MAX_SCORE at the bullseye, linearly down to 0 at
// WAVELENGTH_MISS_DISTANCE away, 0 beyond that. Integer points.
export function scoreGuess(guess, target) {
  const dist = Math.abs(clampGuess(guess) - clampGuess(target))
  if (dist >= WAVELENGTH_MISS_DISTANCE) return 0
  const frac = 1 - dist / WAVELENGTH_MISS_DISTANCE
  return Math.round(WAVELENGTH_MAX_SCORE * frac)
}

// Firebase strips empty objects/arrays — normalize whatever it returns for the
// per-player guess map to a plain object keyed by playerId.
export function normalizeGuesses(raw) {
  if (!raw || typeof raw !== 'object') return {}
  return { ...raw }
}

// Seat order is by joinedAt (then playerId as a stable tiebreaker). `players` is
// the playerId-keyed object the orchestrator passes in.
export function seatOrder(players) {
  return Object.values(players || {})
    .filter(p => p && p.playerId)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.playerId).localeCompare(String(b.playerId)))
    .map(p => p.playerId)
}

// Next clue-giver after `currentId`, wrapping around the seat order.
export function nextClueGiver(players, currentId) {
  const order = seatOrder(players)
  if (order.length === 0) return null
  const i = order.indexOf(currentId)
  if (i === -1) return order[0]
  return order[(i + 1) % order.length]
}
