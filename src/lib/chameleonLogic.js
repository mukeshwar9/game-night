// CHAMELEON rules — social deduction around a public 4×4 topic card. Everyone
// but the Chameleon knows which of the 16 words is secret; each player gives
// one clue in turn, then the group votes. A caught Chameleon can still steal
// the round by naming the secret word. Dealing, clue order and validation,
// the vote, the outcome and scoring live here; ChameleonGame.jsx wires them
// to Firebase and the sealed per-player delivery (src/lib/sealed.js).
//
// Pure — no DOM/Firebase/React. Randomness comes in through an `rng`
// parameter (default Math.random); the deal must stay secret, so it is never
// derived from a seed other clients could reproduce.
import { CHAMELEON_CARDS } from './decks/chameleon'
import { avoidList, normalizeSeen } from './seenHistory'
import { isDenied } from './wordDenylist'

export const CHAMELEON_MIN_PLAYERS = 3
export const CHAMELEON_MAX_PLAYERS = 8
// First to this many points wins the match.
export const CHAMELEON_MATCH_POINTS = 5
export const CHAMELEON_GRID = 16
// Room seen-history key: `games/{id}/seen/chameleon`.
export const CHAMELEON_SEEN_KEY = 'chameleon'
export const CLUE_MAX_LEN = 24
// Round points (the published Chameleon scoring).
export const POINTS_ESCAPED = 2 // Chameleon not caught
export const POINTS_STOLEN = 1 // caught, but named the secret word
export const POINTS_CAUGHT = 2 // every other player, when caught and wrong

// Sealed payloads. Both are padded to the same length before sealing.
export const PAYLOAD_CHAMELEON = 'CHAMELEON'
const WORD_PREFIX = 'WORD:'

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

export function getCard(index) {
  return CHAMELEON_CARDS[index] || null
}

/**
 * This round's topic card: never the previous round's, and nothing the room
 * has seen recently, falling back to the least recently seen half once the
 * deck is exhausted.
 */
export function pickCardIndex(seen, prevIndex = null, rng = Math.random) {
  const n = CHAMELEON_CARDS.length
  if (n <= 1) return 0
  const exclude = prevIndex != null && prevIndex >= 0 ? [prevIndex] : []
  const avoid = new Set([...avoidList(n, normalizeSeen(seen), 1, exclude), ...exclude])
  let pool = CHAMELEON_CARDS.map((_, i) => i).filter(i => !avoid.has(i))
  if (pool.length === 0) pool = CHAMELEON_CARDS.map((_, i) => i).filter(i => !exclude.includes(i))
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]
}

/** Deal: one random Chameleon among `ids` and a random secret word slot. */
export function dealChameleon(ids, rng = Math.random) {
  const list = [...(ids || [])]
  if (list.length === 0) return { chameleonId: null, secretIndex: null }
  const chameleonId = list[Math.min(list.length - 1, Math.floor(rng() * list.length))]
  const secretIndex = Math.min(CHAMELEON_GRID - 1, Math.floor(rng() * CHAMELEON_GRID))
  return { chameleonId, secretIndex }
}

/** The plaintext sealed to `id`: the Chameleon learns only that they are it. */
export function payloadFor(id, deal) {
  return id === deal?.chameleonId ? PAYLOAD_CHAMELEON : `${WORD_PREFIX}${deal?.secretIndex}`
}

/**
 * @returns {{ chameleon: true } | { chameleon: false, secretIndex: number } | null}
 */
export function parsePayload(text) {
  if (text === PAYLOAD_CHAMELEON) return { chameleon: true }
  if (typeof text === 'string' && text.startsWith(WORD_PREFIX)) {
    const n = Number(text.slice(WORD_PREFIX.length))
    if (Number.isInteger(n) && n >= 0 && n < CHAMELEON_GRID) return { chameleon: false, secretIndex: n }
  }
  return null
}

/**
 * Check a set of opened entries (`{ [uid]: parsed payload }`): who the
 * Chameleon is and what the secret was, once known. `consistent` is false if
 * the opened entries contradict each other (two Chameleons, or two different
 * secret words) — a dealer that tampered with the deal.
 */
export function readDeal(opened) {
  let chameleonId = null
  let secretIndex = null
  let consistent = true
  for (const [id, p] of Object.entries(opened || {})) {
    if (!p) continue
    if (p.chameleon) {
      if (chameleonId && chameleonId !== id) consistent = false
      chameleonId = chameleonId || id
    } else {
      if (secretIndex != null && secretIndex !== p.secretIndex) consistent = false
      secretIndex = secretIndex ?? p.secretIndex
    }
  }
  return { chameleonId, secretIndex, consistent }
}

/** Clue order: the seat list rotated so a different player leads each round. */
export function clueOrder(ids, roundNo = 0) {
  const list = [...(ids || [])]
  if (list.length === 0) return list
  const k = ((roundNo % list.length) + list.length) % list.length
  return [...list.slice(k), ...list.slice(0, k)]
}

// Firebase strips empty maps — clues/votes read back undefined until the first write.
function normalizeStringMap(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' && v) out[k] = v
  }
  return out
}

export const normalizeClues = normalizeStringMap
export const normalizeVotes = normalizeStringMap

/**
 * Whose clue is due: the first player in `order` without a clue who is still
 * online. Offline players are skipped so a dropped phone can't stall the
 * round. null when every online player has given a clue.
 */
export function currentClueGiver(order, clues, isOnline = () => true) {
  const c = clues || {}
  for (const id of order || []) {
    if (!c[id] && isOnline(id)) return id
  }
  return null
}

/** Clues are done once nobody online still owes one (and at least one clue exists). */
export function cluesDone(order, clues, isOnline = () => true) {
  return Object.keys(clues || {}).length > 0 && currentClueGiver(order, clues, isOnline) == null
}

/**
 * Validate a typed clue: 1–24 characters of letters/digits/spaces/'-, no
 * denylisted word, and — for a player who knows it — not the secret word.
 *
 * @returns {{ ok: true, clue: string } | { ok: false, error: string }}
 */
export function validateClue(raw, secretWord = null) {
  const clue = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!clue) return { ok: false, error: 'TYPE A CLUE FIRST' }
  if (clue.length > CLUE_MAX_LEN) return { ok: false, error: `KEEP IT UNDER ${CLUE_MAX_LEN + 1} LETTERS` }
  if (!/^[\p{L}\p{N}' -]+$/u.test(clue)) return { ok: false, error: 'LETTERS AND NUMBERS ONLY' }
  if (clue.split(/[\s'-]+/).some(w => w && isDenied(w))) return { ok: false, error: 'PICK A FRIENDLIER CLUE' }
  if (secretWord) {
    const fold = (s) => String(s).toUpperCase().replace(/[^\p{L}\p{N}]/gu, '')
    if (fold(clue) === fold(secretWord) || clue.toUpperCase().split(/[\s'-]+/).includes(String(secretWord).toUpperCase())) {
      return { ok: false, error: "DON'T SAY THE SECRET WORD" }
    }
  }
  return { ok: true, clue }
}

/**
 * Tally votes: the most-accused id, its count, and whether the top spot is
 * tied.
 */
export function tallyVotes(votes) {
  const counts = {}
  for (const accused of Object.values(votes || {})) {
    if (!accused) continue
    counts[accused] = (counts[accused] || 0) + 1
  }
  let top = null
  let topCount = 0
  let tied = false
  for (const [id, n] of Object.entries(counts)) {
    if (n > topCount) { top = id; topCount = n; tied = false } else if (n === topCount) { tied = true }
  }
  return { top, topCount, tied }
}

/** The accused player, or null when the vote tied or nobody voted (a tie lets the Chameleon slip away). */
export function resolveAccused(votes) {
  const { top, tied } = tallyVotes(votes)
  return tied ? null : top
}

/**
 * The vote resolves on its own once every ONLINE participant has voted, with
 * at least two votes cast. `players` is the room's uid-keyed players node.
 */
export function allOnlineVoted(ids, players, votes) {
  const v = votes || {}
  const online = (ids || []).filter(id => players?.[id]?.online !== false)
  return online.length > 0 && online.every(id => v[id]) && Object.keys(v).length >= 2
}

/**
 * Round outcome:
 *   'escaped' — the vote missed the Chameleon (or tied),
 *   'stolen'  — caught, but the Chameleon named the secret word,
 *   'caught'  — caught and the guess was wrong (or never made).
 */
export function outcomeOf({ accused, chameleonId, guessIndex, secretIndex }) {
  if (!accused || accused !== chameleonId) return 'escaped'
  return guessIndex != null && guessIndex === secretIndex ? 'stolen' : 'caught'
}

/** Round scoring. Returns a new scores map. */
export function scoreRound(scores, participantIds, chameleonId, outcome) {
  const next = { ...(scores || {}) }
  if (!chameleonId) return next
  if (outcome === 'escaped') next[chameleonId] = (next[chameleonId] || 0) + POINTS_ESCAPED
  else if (outcome === 'stolen') next[chameleonId] = (next[chameleonId] || 0) + POINTS_STOLEN
  else if (outcome === 'caught') {
    for (const id of participantIds || []) {
      if (id !== chameleonId) next[id] = (next[id] || 0) + POINTS_CAUGHT
    }
  }
  return next
}

/**
 * Everyone who has reached CHAMELEON_MATCH_POINTS, in `ids` order — a round
 * can push several players over the line at once (a shared victory).
 */
export function matchWinners(ids, scores) {
  return (ids || []).filter(id => (scores?.[id] || 0) >= CHAMELEON_MATCH_POINTS)
}
