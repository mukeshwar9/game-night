// Pure helpers for SKETCH (draw & guess). No Firebase, no React — unit-tested.
//
// Round shape on Firebase (under games/{gameId}/round):
//   { phase:       'choosing' | 'drawing' | 'reveal',
//     cycle:       number,               // 1-indexed; bumps when the seat order wraps
//     artist:      uid,
//     order:       [uid, ...],           // fixed snapshot from startRound, never mutated
//     used:        [number, ...],        // deck indices already offered this match (any tier)
//     options:     [number, number, number] | null,  // 3 deck indices; null until artist publishes
//     commitment:  { hash, salt } | null,             // set when artist picks a word
//     wordPattern: string,               // e.g. "5" or "3 3"; '' until artist picks
//     endsAt:      epoch-ms,             // current phase's deadline
//     strokes:     { [pushId]: { c, w, p } },         // artist-only writes
//     chat:        { [pushId]: { uid, text } },       // wrong guesses only
//     correct:     { [uid]: { at } },                 // uid's own write, once
//     scored:      boolean }             // true once this round's deltas were applied
//
// TRUST MODEL: the artist's client computes commit(normalize(word)) and publishes both
// `hash` AND `salt` immediately (not withheld until reveal). Combined with the public
// `options` (3 candidate deck indices), this means ANY client can derive the chosen word
// by hashing each candidate against the public hash — including the artist after a
// reload, with no artist-only word storage at all. See deriveWord() below and the
// caveat comment in src/lib/decks/sketch.js for the accepted residual leak this implies.

// Re-exported, not duplicated — mulberry32 stays private to fibbageLogic.js (not
// exported); pickOptions only needs seededShuffle.
export { seatOrder, hashString, seededShuffle } from './fibbageLogic'
import { seededShuffle } from './fibbageLogic'
import { verifyReveal } from './commit'

// ---- Tunable constants -----------------------------------------------------
export const CHOOSE_MS = 15000
export const DRAW_MS = 75000
export const REVEAL_MS = 6000
export const SKIP_CHOOSING_GRACE_MS = 5000
export const ARTIST_OFFLINE_DRAWING_MS = 10000

export const ARTIST_PTS_PER_CORRECT = 25
export const GUESSER_BASE_PTS = 100
export const GUESSER_STEP_PTS = 10
export const GUESSER_FLOOR_PTS = 50

export const SOLO_GUESSER_BASE_PTS = 50   // 2-player (exactly 1 guesser) variant
export const SOLO_GUESSER_BONUS_MAX = 50
export const SOLO_ARTIST_DIVISOR = 2

// ---- normalize(str) -> string -----------------------------------------------
// lowercase, trim, collapse internal whitespace to single spaces, then STRIP
// (delete, not replace-with-space) any character that isn't a Unicode letter,
// digit, or space — so "Writer's Block" -> "writers block" (apostrophe just
// disappears, doesn't fracture the word into extra tokens).
export function normalize(str) {
  return String(str ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, '') // strip punctuation, KEEP spaces already there
}

// ---- wordPattern(word) -> string --------------------------------------------
// Space-separated token lengths of the RAW word (whitespace-split, no
// punctuation stripping): "hot dog" -> "3 3", "sunglasses" -> "10",
// "writer's block" -> "9 5" (apostrophe counts toward its token's length here
// — this is the PUBLIC blank-pattern, deliberately unrelated to normalize()).
export function wordPattern(word) {
  return String(word ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.length)
    .join(' ')
}

// ---- quantize(fraction) -> int 0-255, dequantize(int) -> fraction 0-1 ------
// fraction is a pointer position as a 0..1 fraction of the canvas's width or
// height. Roundtrip-safe for every integer 0..255.
export function quantize(fraction) {
  return Math.max(0, Math.min(255, Math.round(fraction * 255)))
}
export function dequantize(q) {
  return q / 255
}

// ---- pickOptions(deck, seed, used = []) -> [i, j, k] ------------------------
// One deck index per tier (1, 2, 3), deterministic from `seed`, excluding any
// index already in `used`. Falls back to any other unused/unchosen index if a
// tier's pool is empty; falls back to full reuse (ignoring `used`) only if the
// ENTIRE deck has been exhausted (should never happen in practice with a
// ~250-word deck).
export function pickOptions(deck, seed, used = []) {
  const usedSet = new Set(used)
  const byTier = { 1: [], 2: [], 3: [] }
  deck.forEach((entry, i) => { if (!usedSet.has(i) && byTier[entry.tier]) byTier[entry.tier].push(i) })

  const pickFrom = (indices, offset) =>
    indices.length === 0 ? null : seededShuffle(indices, seed + offset)[0]

  const chosen = []
  const chosenSet = new Set()
  ;[1, 2, 3].forEach((tier, offset) => {
    const pool = byTier[tier].filter(i => !chosenSet.has(i))
    let pick = pickFrom(pool, offset)
    if (pick == null) {
      // tier pool exhausted (or all its unused words already chosen for this
      // set) — fall back to ANY unused, unchosen index from any tier.
      const fallback = deck.map((_, i) => i).filter(i => !usedSet.has(i) && !chosenSet.has(i))
      pick = pickFrom(fallback, offset + 10)
    }
    if (pick == null) {
      // Entire deck used this match (only possible in an extremely long
      // match) — allow reuse, ignoring `used`, still avoiding a dup within
      // THIS options set.
      const anyPool = deck.map((_, i) => i).filter(i => !chosenSet.has(i))
      pick = pickFrom(anyPool, offset + 20)
    }
    if (pick != null) { chosen.push(pick); chosenSet.add(pick) }
  })
  return chosen
}

// ---- nextArtist(order, artist) -> uid ---------------------------------------
// Next uid in `order` after `artist`, wrapping to order[0]. Falls back to
// order[0] if `artist` isn't found in `order` (defensive).
export function nextArtist(order, artist) {
  const idx = order.indexOf(artist)
  if (idx === -1 || order.length === 0) return order[0] ?? null
  return order[(idx + 1) % order.length]
}

// ---- cyclesFor(playerCount) -> number ---------------------------------------
// 3 when playerCount === 2, else 2.
export function cyclesFor(playerCount) {
  return playerCount === 2 ? 3 : 2
}

// ---- matchOver(order, artist, cycle) -> boolean -----------------------------
// True when the round that just finished (this artist, this cycle) was the
// LAST round of the match: artist is the last seat in `order` AND
// cycle >= cyclesFor(order.length).
export function matchOver(order, artist, cycle) {
  const idx = order.indexOf(artist)
  return idx === order.length - 1 && cycle >= cyclesFor(order.length)
}

// ---- nextRoundState(round) -> { finished: true } | { finished: false, round } --
// Pure computation of the next round's seed object given the round that just
// ended (used for BOTH a normal reveal-expiry advance AND a void/skip). Caller
// adds `endsAt: now() + CHOOSE_MS` before writing `round` (this function does
// not touch wall-clock time). `used` carries forward round.used + round.options
// (the 3 offered candidates, whether or not the chosen one was ever confirmed).
export function nextRoundState(round) {
  const { order, artist, cycle, used, options } = round
  const carryUsed = [...(used || []), ...(options || [])]
  if (matchOver(order, artist, cycle)) return { finished: true }
  const idx = order.indexOf(artist)
  const wraps = idx === order.length - 1
  return {
    finished: false,
    round: {
      phase: 'choosing',
      cycle: cycle + (wraps ? 1 : 0),
      artist: nextArtist(order, artist),
      order,
      used: carryUsed,
      options: null,
      commitment: null,
      wordPattern: '',
      strokes: null,
      fills: null,
      chat: null,
      correct: null,
      scored: false,
      // caller adds: endsAt: now() + CHOOSE_MS
    },
  }
}

// ---- activeGuessers(players, order, artist) -> uid[] ------------------------
// order minus artist, filtered to online (players[id]?.online !== false);
// falls back to the full guesser list if NONE are online (so the early-end
// check never permanently excludes everyone — the endsAt timeout is the real
// safety net regardless of this fallback).
export function activeGuessers(players, order, artist) {
  const guessers = order.filter(id => id !== artist)
  const online = guessers.filter(id => players?.[id]?.online !== false)
  return online.length > 0 ? online : guessers
}

// ---- roundDeltas({ guesserIds, correct, artistId, endsAt }) -> { [uid]: pts } --
// Branches on guesserIds.length:
//   0 guessers: {} (shouldn't happen; defensive)
//   1 guesser (2-player variant): if they didn't guess, {} (0/0). Otherwise
//     ratio = clamp01((endsAt - correct[uid].at) / DRAW_MS)
//     guesserPts = SOLO_GUESSER_BASE_PTS + round(SOLO_GUESSER_BONUS_MAX * ratio)
//     artist gets floor(guesserPts / SOLO_ARTIST_DIVISOR)
//   2+ guessers: rank everyone with a `correct` entry by `at` ascending (tie
//     -> uid string compare ascending), award
//     max(GUESSER_FLOOR_PTS, GUESSER_BASE_PTS - i*GUESSER_STEP_PTS) by rank i
//     (0-indexed); artist gets ARTIST_PTS_PER_CORRECT * (number who guessed
//     correctly). If nobody guessed correctly, {} (artist also gets 0).
// Missing keys in the returned object mean "+0" — caller merges additively.
export function roundDeltas({ guesserIds, correct, artistId, endsAt }) {
  const deltas = {}
  const n = guesserIds.length
  if (n === 0) return deltas
  if (n === 1) {
    const uid = guesserIds[0]
    const c = correct?.[uid]
    if (!c) return deltas
    const ratio = Math.max(0, Math.min(1, (endsAt - c.at) / DRAW_MS))
    const guesserPts = SOLO_GUESSER_BASE_PTS + Math.round(SOLO_GUESSER_BONUS_MAX * ratio)
    deltas[uid] = guesserPts
    deltas[artistId] = (deltas[artistId] || 0) + Math.floor(guesserPts / SOLO_ARTIST_DIVISOR)
    return deltas
  }
  const ranked = guesserIds
    .filter(uid => correct?.[uid])
    .sort((a, b) => (correct[a].at - correct[b].at) || String(a).localeCompare(String(b)))
  if (ranked.length === 0) return deltas
  ranked.forEach((uid, i) => {
    deltas[uid] = Math.max(GUESSER_FLOOR_PTS, GUESSER_BASE_PTS - i * GUESSER_STEP_PTS)
  })
  deltas[artistId] = (deltas[artistId] || 0) + ARTIST_PTS_PER_CORRECT * ranked.length
  return deltas
}

// ---- deriveWord(deckWords, options, commitment) -> Promise<string | null> ---
// For each candidate index in `options`, hash deckWords[i].word (normalized)
// against commitment via verifyReveal(commitment.hash, normalize(word),
// commitment.salt); returns the first match, or null if none verify (should
// never happen with consistent data).
export async function deriveWord(deckWords, options, commitment) {
  if (!commitment?.hash || !commitment?.salt) return null
  for (const i of options || []) {
    const word = deckWords[i]?.word
    if (word == null) continue
    if (await verifyReveal(commitment.hash, normalize(word), commitment.salt)) return word
  }
  return null
}
