// WAVELENGTH rules — shared by the live room (WavelengthGame.jsx) and the solo
// bot demo (WavelengthDemo.jsx) so scoring, the win target, the clue rules and
// the spectrum rotation can't drift between them. Pure — no DOM/Firebase/React.
import { WAVELENGTH_PAIRS } from './decks/wavelength'
import { avoidList, markSeen, normalizeSeen } from './seenHistory'
import { matchKey, normalizeText } from './textMatchLogic'
import { isBannedWord } from './wordDenylist'

// A guess this many points (or fewer) from the target scores the maximum.
export const WAVELENGTH_MAX_SCORE = 50
// Guesses farther than this from the target score nothing.
export const WAVELENGTH_MISS_DISTANCE = 50
// First to this many points ends the match (highest score wins — matchWinners).
export const WAVELENGTH_WIN_SCORE = 200
export const WAVELENGTH_MIN_PLAYERS = 3
// Per-phase deadlines in the live room (before the room's timer scale): an AFK
// clue-giver or guesser would otherwise stall the round forever. Starting
// values — tune in playtests.
export const WAVELENGTH_CLUE_MS = 90_000
export const WAVELENGTH_GUESS_MS = 60_000
export const WAVELENGTH_CLUE_MAX_LENGTH = 24
// Room seen-history key: `games/{id}/seen/wavelength`. It outlives NEW MATCH,
// so a new match opens on a pair the room hasn't just played.
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

// Firebase returns a list as an array or a numeric-keyed object (and drops it
// when empty) — read it back as integers in key order, never Object.values.
export function normalizeIndexList(raw) {
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw)
    .map(([k, v]) => [Number(k), Number(v)])
    .filter(([k, v]) => Number.isInteger(k) && Number.isInteger(v) && v >= 0)
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v)
}

// `round.usedSpectrums` is written whole, but Firebase can still hand an array
// back as a numeric-keyed object — read it by key so indices never shift.
export const normalizeUsedSpectrums = normalizeIndexList

/**
 * Next spectrum. Prefers a pair not used this match (`used`), not the current
 * one, and not seen recently by this room — `seen` is the room's seenHistory
 * map (`games/{id}/seen/wavelength`); `recent` is an optional extra list of
 * indices to avoid. Falls back to "not used this match", then to "anything but
 * the current pair", so it never stalls on an empty pool.
 */
export function pickSpectrumIndex({ used = [], recent = [], seen = null, current = -1, rng = Math.random } = {}) {
  if (WAVELENGTH_PAIR_COUNT <= 1) return 0
  const usedSet = new Set(normalizeIndexList(used))
  const exclude = [...usedSet, current].filter(i => Number.isInteger(i) && i >= 0)
  const avoid = new Set([
    ...normalizeIndexList(recent),
    ...avoidList(WAVELENGTH_PAIR_COUNT, normalizeSeen(seen), 1, exclude),
  ])
  const all = Array.from({ length: WAVELENGTH_PAIR_COUNT }, (_, i) => i)
  const pools = [
    all.filter(i => i !== current && !usedSet.has(i) && !avoid.has(i)),
    all.filter(i => i !== current && !usedSet.has(i)),
    all.filter(i => i !== current),
  ]
  const pool = pools.find(p => p.length > 0)
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]
}

// Positional form of pickSpectrumIndex (used this match, current, room seen map).
export function nextSpectrumIndex(usedIndices = [], currentIndex = -1, seen = null, rng = Math.random) {
  return pickSpectrumIndex({ used: usedIndices, current: currentIndex, seen, rng })
}

// Hidden target somewhere comfortably inside the dial (8–92) so it's always
// reachable from either side.
export function randomTarget() {
  return 8 + Math.floor(Math.random() * 85)
}

// The clue-giver's hidden target lives only in their own sessionStorage as
// `{ target, salt?, hash? }` (salt/hash appear once it has been committed).
// Returns that entry normalised, or null when it is missing or corrupt.
export function parseStoredTarget(raw) {
  if (raw == null || raw === '') return null
  let value = raw
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw) } catch { return null }
  }
  if (!value || typeof value !== 'object') return null
  const target = Number(value.target)
  if (!Number.isInteger(target) || target < 0 || target > 100) return null
  return {
    target,
    salt: typeof value.salt === 'string' && value.salt ? value.salt : null,
    hash: typeof value.hash === 'string' && value.hash ? value.hash : null,
  }
}

// The target for the round the clue-giver is about to clue: the stored one if
// there is one (so a reload mid-clue keeps the same target), otherwise a fresh
// roll. `fresh` tells the caller it must store it before showing it.
export function storedOrNewTarget(raw, makeTarget = randomTarget) {
  const stored = parseStoredTarget(raw)
  if (stored) return { ...stored, fresh: false }
  return { target: makeTarget(), salt: null, hash: null, fresh: true }
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
// Clue rules
// ---------------------------------------------------------------------------

const POLE_SUFFIXES = ['s', 'es', 'er', 'est', 'ly', 'ness', 'ed', 'ing', 'y']

// Base forms a clue key may inflect from ("hotter" → "hot", "happiest" →
// "happy", "larger" → "large"), so a pole word can't sneak in inflected.
function clueStems(key) {
  const out = new Set([key])
  for (const suf of POLE_SUFFIXES) {
    if (key.length <= suf.length + 2 || !key.endsWith(suf)) continue
    const base = key.slice(0, -suf.length)
    out.add(base)
    out.add(base + 'e')
    if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) out.add(base.slice(0, -1))
    if (base.endsWith('i')) out.add(base.slice(0, -1) + 'y')
  }
  return out
}

// Every key a clue must not match for this pair: each pole as a whole
// ("hardworking") and each of its words of 3+ letters ("hard", "working").
function poleKeys(pair) {
  const keys = new Set()
  for (const pole of [pair?.left, pair?.right]) {
    if (!pole) continue
    const whole = matchKey(pole)
    if (whole) keys.add(whole)
    for (const word of normalizeText(pole).split(' ')) {
      const k = matchKey(word)
      if (k.length >= 3) keys.add(k)
    }
  }
  return keys
}

/**
 * Check a clue-giver's clue against the house rules: one word (hyphens are
 * fine), at most WAVELENGTH_CLUE_MAX_LENGTH characters, no digits, not either
 * dial word of the current pair (or an inflection of it), and nothing on the
 * banned-word list. Returns `{ ok: true, clue }` (upper-cased, trimmed) or
 * `{ ok: false, error }` with a short on-screen reason.
 */
export function validateClue(raw, pair) {
  const clue = String(raw ?? '').trim()
  if (!clue) return { ok: false, error: 'TYPE A CLUE' }
  if (/\s/.test(clue)) return { ok: false, error: 'ONE WORD ONLY' }
  if (clue.length > WAVELENGTH_CLUE_MAX_LENGTH) return { ok: false, error: 'TOO LONG' }
  if (/\d/.test(clue)) return { ok: false, error: 'NO NUMBERS' }
  const key = matchKey(clue)
  if (!key) return { ok: false, error: 'USE LETTERS' }
  if (isBannedWord(key) || isBannedWord(normalizeText(clue))) return { ok: false, error: 'PICK ANOTHER WORD' }
  const poles = poleKeys(pair)
  for (const stem of clueStems(key)) {
    if (poles.has(stem)) return { ok: false, error: "CAN'T USE THE DIAL WORDS" }
  }
  return { ok: true, clue: clue.toUpperCase() }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * The clue-giver's share of a round: the rounded mean of the guessers' scores
 * (only guessers who actually locked a guess count, so an AFK guesser doesn't
 * drag the clue-giver down). No guesses → 0.
 */
export function clueGiverScore(guesserScores) {
  const list = (Array.isArray(guesserScores) ? guesserScores : Object.values(guesserScores || {}))
    .map(Number)
    .filter(Number.isFinite)
  if (list.length === 0) return 0
  return Math.round(list.reduce((sum, n) => sum + n, 0) / list.length)
}

/**
 * Points earned this round, keyed by playerId: every seated guesser who
 * guessed gets `scoreGuess`, and the clue-giver (if still seated and at least
 * one guess landed) gets `clueGiverScore` of those guesser scores.
 */
export function roundDeltas({ guesses, target, clueGiver, seatIds }) {
  const deltas = {}
  const g = guesses || {}
  for (const id of seatIds || []) {
    if (id === clueGiver) continue
    if (g[id] != null) deltas[id] = scoreGuess(g[id], target)
  }
  const guesserPoints = Object.values(deltas)
  if (clueGiver && (seatIds || []).includes(clueGiver) && guesserPoints.length > 0) {
    deltas[clueGiver] = clueGiverScore(guesserPoints)
  }
  return deltas
}

/** New scores map with `deltas` added. */
export function addScores(scores, deltas) {
  const next = { ...(scores || {}) }
  for (const [id, pts] of Object.entries(deltas || {})) next[id] = (next[id] || 0) + pts
  return next
}

/**
 * Who has won the match. Nobody until someone reaches `target`; then the
 * highest score among `ids` wins, and an exact tie at the top is shared
 * (co-winners) — never broken by seat order. Returns ids in `ids` order.
 */
export function matchWinners(scores, ids, target = WAVELENGTH_WIN_SCORE) {
  const list = ids || []
  const score = id => Number(scores?.[id]) || 0
  const top = list.reduce((max, id) => Math.max(max, score(id)), -Infinity)
  if (!(top >= target)) return []
  return list.filter(id => score(id) === top)
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
  const spectrumIndex = pickSpectrumIndex({ seen, rng })
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
  const spectrumIndex = pickSpectrumIndex({ used, current, seen, rng })
  return {
    round: freshRound({
      clueGiver: nextOnlineClueGiver(players, round?.clueGiver),
      spectrumIndex,
      usedSpectrums: current >= 0 ? [...used, current] : used,
    }),
    seen: markSeen(seen, [spectrumIndex]),
  }
}

// Put a wavelength seen map back into the room's `seen` node.
function withSeen(game, seen) {
  return { ...(game.seen || {}), [WAVELENGTH_SEEN_KEY]: seen }
}

/**
 * Reveal -> next round, as a pure transform of the whole room node (run it
 * inside a transaction). Guessers score by closeness and the clue-giver scores
 * their rounded mean — unless the clue-giver's commitment didn't match, which
 * voids the round. Once someone reaches the win score the match ends: the
 * highest score wins, and an exact tie is shared (`winner` is written only for
 * a sole winner; co-winners are derived from the scores). Returns null when the
 * room isn't in a revealed round (already advanced).
 */
export function advanceAfterReveal(game, rng = Math.random) {
  const r = game?.round
  if (!r || r.phase !== 'reveal' || !r.reveal) return null
  const order = seatOrder(game.players)
  const deltas = r.cheatDetected
    ? {}
    : roundDeltas({ guesses: normalizeGuesses(r.guesses), target: r.reveal.target, clueGiver: r.clueGiver, seatIds: order })
  const scores = addScores(game.scores, deltas)
  const winners = r.cheatDetected ? [] : matchWinners(scores, order)
  if (winners.length > 0) {
    return {
      ...game, scores, status: 'finished',
      winner: winners.length === 1 ? winners[0] : null,
      proposal: null,
    }
  }
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
