// WAVELENGTH rules — shared by the live room (WavelengthGame.jsx) and the solo
// bot demo (WavelengthDemo.jsx) so scoring, the win target and the spectrum
// rotation can't drift between them. Pure — no DOM/Firebase/React.
import { WAVELENGTH_PAIRS } from './decks/wavelength'
import { avoidList, markSeen, normalizeSeen } from './seenHistory'

// A guess this many points (or fewer) from the target scores the maximum.
export const WAVELENGTH_MAX_SCORE = 50
// Guesses farther than this from the target score nothing.
export const WAVELENGTH_MISS_DISTANCE = 50
// First to this many points clinches the match.
export const WAVELENGTH_WIN_SCORE = 200
export const WAVELENGTH_MIN_PLAYERS = 3
// Per-phase deadlines in the live room (before the room's timer scale): an AFK
// clue-giver or guesser would otherwise stall the round forever.
export const WAVELENGTH_CLUE_MS = 90000
export const WAVELENGTH_GUESS_MS = 60000
// Room seen-history key: `games/{id}/seen/wavelength`.
export const WAVELENGTH_SEEN_KEY = 'wavelength'

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

// Pick the next spectrum index, avoiding every pair already used this match
// (`usedIndices`) as well as the current one, so pairs don't repeat within a
// match, and — given the room's seen history (`seen`, a seenHistory map) —
// pairs this room saw in earlier matches. Once the whole deck has been used,
// the pool resets (still excluding the current index) rather than stalling.
export function nextSpectrumIndex(usedIndices = [], currentIndex = -1, seen = null, rng = Math.random) {
  if (WAVELENGTH_PAIR_COUNT <= 1) return 0
  const used = new Set(usedIndices)
  const exclude = [...used, currentIndex].filter(i => Number.isInteger(i) && i >= 0)
  const avoid = new Set(avoidList(WAVELENGTH_PAIR_COUNT, normalizeSeen(seen), 1, exclude))
  const all = Array.from({ length: WAVELENGTH_PAIR_COUNT }, (_, i) => i)
  const pools = [
    all.filter(i => i !== currentIndex && !used.has(i) && !avoid.has(i)),
    all.filter(i => i !== currentIndex && !used.has(i)),
    all.filter(i => i !== currentIndex),
  ]
  const available = pools.find(p => p.length > 0)
  return available[Math.min(available.length - 1, Math.floor(rng() * available.length))]
}

// `round.usedSpectrums` is written whole, but Firebase can still hand an array
// back as a numeric-keyed object — read it by key so indices never shift.
export function normalizeUsedSpectrums(raw) {
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw)
    .map(([k, v]) => [Number(k), v])
    .filter(([k, v]) => Number.isInteger(k) && Number.isInteger(v) && v >= 0)
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v)
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

// Guessers the reveal must wait for: every seat except the clue-giver that
// isn't explicitly offline (`online === false`). Missing presence counts as
// online so a seat is never skipped before its presence write lands. Returns
// ids in seat order. An empty result means nobody is connected to guess — the
// round should keep waiting rather than reveal into an empty room.
export function onlineGuessers(players, clueGiverId) {
  const map = players || {}
  return seatOrder(map).filter(id => id !== clueGiverId && map[id]?.online !== false)
}

// Next clue-giver after `currentId`, wrapping around the seat order.
export function nextClueGiver(players, currentId) {
  const order = seatOrder(players)
  if (order.length === 0) return null
  const i = order.indexOf(currentId)
  if (i === -1) return order[0]
  return order[(i + 1) % order.length]
}

// Like nextClueGiver, but passes over seats that are explicitly offline, so
// the clue never lands on someone who already left (they'd only be skipped
// again after the deadline). Falls back to plain rotation when nobody else is
// online. `currentId` null/unknown = start from the top of the seat order.
export function nextOnlineClueGiver(players, currentId) {
  const map = players || {}
  const order = seatOrder(map)
  if (order.length === 0) return null
  const i = order.indexOf(currentId)
  for (let step = 1; step <= order.length; step++) {
    const id = order[(i + step + order.length) % order.length]
    if (id !== currentId && map[id]?.online !== false) return id
  }
  return nextClueGiver(map, currentId)
}

// ---------------------------------------------------------------------------
// Round flow — the transitions both the live room and the demo run.
// ---------------------------------------------------------------------------

// A clean clue phase. Everything round-scoped from the previous round is cleared
// (null deletes the key in Firebase).
export function freshRound({ clueGiver, spectrumIndex, usedSpectrums = [] }) {
  return {
    clueGiver: clueGiver ?? null,
    phase: 'clue',
    spectrumIndex,
    usedSpectrums,
    clue: '',
    commitment: null,
    guesses: null,
    reveal: null,
    phaseStartedAt: null,
    cheatDetected: null,
  }
}

/**
 * First round of a match: the first online seat gives the first clue, on a
 * spectrum the room hasn't seen. Returns the round and the updated seen map.
 */
export function firstRound(players, seen = null, rng = Math.random) {
  const spectrumIndex = nextSpectrumIndex([], -1, seen, rng)
  return {
    round: freshRound({ clueGiver: nextOnlineClueGiver(players, null), spectrumIndex }),
    seen: markSeen(seen, [spectrumIndex]),
  }
}

/**
 * Rotate to the next clue-giver on a fresh spectrum — after a reveal, and for
 * every skip (AFK or offline clue-giver, lost secret). Returns the new round
 * and the updated seen map.
 */
export function rotateRound(players, round, seen = null, rng = Math.random) {
  const used = normalizeUsedSpectrums(round?.usedSpectrums)
  const current = Number.isInteger(round?.spectrumIndex) ? round.spectrumIndex : -1
  const spectrumIndex = nextSpectrumIndex(used, current, seen, rng)
  return {
    round: freshRound({
      clueGiver: nextOnlineClueGiver(players, round?.clueGiver),
      spectrumIndex,
      usedSpectrums: current >= 0 ? [...used, current] : used,
    }),
    seen: markSeen(seen, [spectrumIndex]),
  }
}

/** Points each guesser earns this round (guessers who never locked in: none). */
export function roundDeltas(guesses, guesserIds, target) {
  const deltas = {}
  for (const id of guesserIds || []) {
    const g = guesses?.[id]
    if (g != null) deltas[id] = scoreGuess(g, target)
  }
  return deltas
}

/** New scores map with `deltas` added. */
export function addScores(scores, deltas) {
  const next = { ...(scores || {}) }
  for (const [id, pts] of Object.entries(deltas || {})) next[id] = (next[id] || 0) + pts
  return next
}

/** First seat (in `order`) at or past the win score, or null. */
export function findClincher(order, scores) {
  return (order || []).find(id => (scores?.[id] || 0) >= WAVELENGTH_WIN_SCORE) ?? null
}

// Put a wavelength seen map back into the room's `seen` node.
function withSeen(game, seen) {
  return { ...(game.seen || {}), [WAVELENGTH_SEEN_KEY]: seen }
}

/**
 * Reveal -> next round, as a pure transform of the whole room node (run it
 * inside a transaction). Guessers score by closeness — unless the clue-giver's
 * commitment didn't match, which voids the round — the clue-giver scores
 * nothing, and the first seat past the win score ends the match. Returns null
 * when the room isn't in a revealed round (already advanced).
 */
export function advanceAfterReveal(game, rng = Math.random) {
  const r = game?.round
  if (!r || r.phase !== 'reveal' || !r.reveal) return null
  const order = seatOrder(game.players)
  const guesserIds = order.filter(id => id !== r.clueGiver)
  const deltas = r.cheatDetected ? {} : roundDeltas(normalizeGuesses(r.guesses), guesserIds, r.reveal.target)
  const scores = addScores(game.scores, deltas)
  const clinch = r.cheatDetected ? null : findClincher(order, scores)
  if (clinch) return { ...game, scores, status: 'finished', winner: clinch, proposal: null }
  const next = rotateRound(game.players, r, game.seen?.[WAVELENGTH_SEEN_KEY], rng)
  return { ...game, scores, proposal: null, round: next.round, seen: withSeen(game, next.seen) }
}

/**
 * Skip the current round without scoring (AFK or offline clue-giver, lost
 * secret): the clue passes to the next seat on a fresh spectrum. Pure transform
 * of the whole room node; null when there is no round.
 */
export function skipRound(game, rng = Math.random) {
  const r = game?.round
  if (!r) return null
  const next = rotateRound(game.players, r, game.seen?.[WAVELENGTH_SEEN_KEY], rng)
  return { ...game, proposal: null, round: next.round, seen: withSeen(game, next.seen) }
}

/**
 * Lobby -> first round, as a pure transform of the whole room node. Null when
 * the match is already running, is over (NEW MATCH resets scores first), or
 * there aren't enough players.
 */
export function beginMatch(game, now, rng = Math.random) {
  if (!game || game.status === 'playing' || game.status === 'finished') return null
  if (seatOrder(game.players).length < WAVELENGTH_MIN_PLAYERS) return null
  const first = firstRound(game.players, game.seen?.[WAVELENGTH_SEEN_KEY], rng)
  return {
    ...game,
    status: 'playing',
    winner: null,
    proposal: null,
    lastActivityAt: now,
    round: first.round,
    seen: withSeen(game, first.seen),
  }
}
