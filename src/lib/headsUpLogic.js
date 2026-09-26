// HEADS UP rules — charades for a video call. Each turn one guesser sees only
// a timer and GOT IT / PASS; everyone else sees the prompt and acts or
// describes it. Guesser order, dealing, card results, scoring and the match
// winner live here; the page (HeadsUpGame.jsx) wires them to Firebase and the
// sealed per-player delivery (src/lib/sealed.js).
//
// Pure — no DOM/Firebase/React. Randomness comes in through an `rng`
// parameter (default Math.random); the dealt hand must stay secret from the
// guesser, so it is never derived from a seed other clients could reproduce.
import { HEADSUP_PROMPTS, HEADSUP_CATEGORIES } from './decks/headsup'
import { normalizeSeen } from './seenHistory'
import { pickCoordinator } from './coordinator'

export const HU_MIN_PLAYERS = 3
export const HU_MAX_PLAYERS = 8
// Base turn length, before the room's timer scale.
export const HU_TURN_SECONDS = 60
// Cards sealed per turn — more than anyone clears in a (relaxed) turn; with
// timers off the turn ends when the hand runs out.
export const HU_TURN_CARDS = 60
// Room seen-history key: `games/{id}/seen/headsup`.
export const HU_SEEN_KEY = 'headsup'
export const HU_MIXED = 'mixed'
export const HU_GOT = 'G'
export const HU_PASS = 'P'

/**
 * Seat order is stable: players sorted by joinedAt, then playerId as a
 * tiebreak. Returns playerIds.
 */
export function seatOrder(players) {
  return Object.values(players || {})
    .filter(p => p && p.playerId)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.playerId).localeCompare(String(b.playerId)))
    .map(p => p.playerId)
}

/** Guessing turns each player gets: two in a small group, one from 5 players up. */
export function turnsPerPlayer(n) {
  return n <= 4 ? 2 : 1
}

export function totalTurns(n) {
  return n * turnsPerPlayer(n)
}

export function guesserForTurn(order, turnNo) {
  const list = order || []
  if (list.length === 0 || !(turnNo >= 0)) return null
  return list[turnNo % list.length]
}

/**
 * The first turn at or after `from` whose guesser is online — offline players
 * lose their turn instead of stalling the room. null once the match's turns
 * are used up. `isOnline(id)` is the caller's presence check.
 */
export function nextTurnNo(order, from, total, isOnline = () => true) {
  for (let t = Math.max(0, from); t < total; t++) {
    const id = guesserForTurn(order, t)
    if (id && isOnline(id)) return t
  }
  return null
}

/**
 * The dealer for a turn: the first ONLINE player in seat order other than the
 * guesser — the dealing client knows the hand, so it must never be the
 * guesser's. `players` is the room's uid-keyed players node (presence on
 * `players[uid].online`); every client computes the same dealer.
 */
export function pickDealer(order, guesserId, players) {
  return pickCoordinator((order || []).filter(id => id !== guesserId), players, { ordered: true })
}

export function normalizeCategory(raw) {
  return HEADSUP_CATEGORIES.some(c => c.id === raw) ? raw : HU_MIXED
}

export function categoryLabel(id) {
  return HEADSUP_CATEGORIES.find(c => c.id === id)?.label || 'MIXED'
}

/** Deck indices in a category (every index for MIXED). */
export function categoryIndices(category) {
  const cat = normalizeCategory(category)
  const out = []
  HEADSUP_PROMPTS.forEach((p, i) => { if (cat === HU_MIXED || p.cat === cat) out.push(i) })
  return out
}

// Unbiased Fisher–Yates with an injected rng.
function shuffle(arr, rng) {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Deal a turn's hand: up to `count` distinct prompt indices from the
 * category — never-seen prompts first (shuffled), then previously seen ones,
 * least recently seen first. `seen` is the room's seen-history map.
 */
export function dealHand(category, seen, count = HU_TURN_CARDS, rng = Math.random) {
  const s = normalizeSeen(seen)
  const pool = categoryIndices(category)
  const fresh = shuffle(pool.filter(i => s[i] == null), rng)
  const stale = shuffle(pool.filter(i => s[i] != null), rng).sort((a, b) => s[a] - s[b])
  return [...fresh, ...stale].slice(0, Math.max(0, count))
}

/** Sealed payload ⇄ hand. */
export function packHand(indices) {
  return JSON.stringify(indices || [])
}

export function unpackHand(text) {
  try {
    const arr = JSON.parse(text)
    if (!Array.isArray(arr)) return null
    return arr.filter(i => Number.isInteger(i) && i >= 0 && i < HEADSUP_PROMPTS.length)
  } catch {
    return null
  }
}

export function promptText(index) {
  return HEADSUP_PROMPTS[index]?.text ?? null
}

/**
 * Card results are one string, a character per card in order: 'G' (GOT IT)
 * or 'P' (PASS). A string can't come back from Firebase as a sparse array,
 * and its length IS the index of the card on screen.
 */
export function normalizeResults(raw) {
  return typeof raw === 'string' ? raw.replace(/[^GP]/g, '') : ''
}

/**
 * Record GOT IT / PASS on card `cardIndex`. Returns the new results string,
 * or null when the tap is stale (someone already answered that card) or the
 * hand is used up — so two teammates tapping at once score the card once.
 */
export function applyCardResult(results, cardIndex, result, handSize = HU_TURN_CARDS) {
  const r = normalizeResults(results)
  if (result !== HU_GOT && result !== HU_PASS) return null
  if (cardIndex !== r.length || r.length >= handSize) return null
  return r + result
}

export function countGot(results) {
  return [...normalizeResults(results)].filter(c => c === HU_GOT).length
}

export function handExhausted(results, handSize) {
  return normalizeResults(results).length >= handSize
}

/** Turn scoring: the guesser banks one point per GOT IT. Returns a new map. */
export function scoreTurn(scores, guesserId, results) {
  const next = { ...(scores || {}) }
  if (!guesserId) return next
  next[guesserId] = (next[guesserId] || 0) + countGot(results)
  return next
}

/**
 * Match winners: the top scorers among `ids` (ties share the win). Empty when
 * nobody scored.
 */
export function matchWinners(ids, scores) {
  const list = ids || []
  let top = 0
  for (const id of list) top = Math.max(top, scores?.[id] || 0)
  if (top <= 0) return []
  return list.filter(id => (scores?.[id] || 0) === top)
}
