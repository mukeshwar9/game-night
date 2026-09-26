// HUNCH — a silent co-op card game for two. Level n deals n cards (1–100)
// to each player; with no talking, the pair must play every card onto one
// pile in rising order. A card played while either hand still holds a lower
// one costs a life and discards those lower cards. Clearing a level can earn
// a life or a STEADY (both hold STEADY: each discards their lowest card).
//
// The whole run lives in `games/{id}/round` and every change is one
// runTransaction on the room, so near-simultaneous taps are serialised.
// Hands are plaintext in the room: co-op, so peeking only spoils your own game.
//
// Pure — no DOM, no Firebase, no React.

import { normalizeList } from './normalize'

export const HUNCH_MAX_CARD = 100
export const HUNCH_TARGET_LEVEL = 12
export const HUNCH_START_LIVES = 3
export const HUNCH_START_STEADIES = 1
export const HUNCH_MAX_LIVES = 5
export const HUNCH_MAX_STEADIES = 3
// Two taps that cross in flight: if my card was lost to my partner's
// mistake and my tap lands within this window of theirs, the plays count as
// simultaneous and the life comes back. Server-clock milliseconds.
export const HUNCH_GRACE_MS = 300
// Reward for clearing a level (our own table).
export const HUNCH_REWARDS = { 2: 'steady', 3: 'life', 5: 'steady', 6: 'life', 8: 'steady', 9: 'life' }

const SEATS = ['X', 'O']
const partnerOf = (seat) => (seat === 'X' ? 'O' : 'X')

function hashSeed(seed) {
  const text = String(seed ?? '')
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(a) {
  let t = a >>> 0
  return () => {
    t = (t + 0x6D2B79F5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const sortAsc = (cards) => [...cards].sort((a, b) => a - b)

const cleanCards = (raw) => sortAsc(normalizeList(raw)
  .map(Number)
  .filter(n => Number.isInteger(n) && n >= 1 && n <= HUNCH_MAX_CARD))

/**
 * Deal `level` distinct cards to each seat from 1..100, seeded so every
 * client (and a test) derives the same deal from the same seed.
 * @param {number} level
 * @param {string} seed
 * @returns {{ X: number[], O: number[] }}
 */
export function dealLevel(level, seed) {
  const n = Math.max(1, Math.min(HUNCH_TARGET_LEVEL, Math.floor(level) || 1))
  const deck = Array.from({ length: HUNCH_MAX_CARD }, (_, i) => i + 1)
  const rand = mulberry32(hashSeed(`${seed}:${n}`))
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return { X: sortAsc(deck.slice(0, n)), O: sortAsc(deck.slice(n, 2 * n)) }
}

/** A fresh run at level 1. `best` (highest level cleared) carries across PLAY AGAIN. */
export function startRun({ seed, best = 0 }) {
  return {
    phase: 'play',
    seed: String(seed),
    level: 1,
    lives: HUNCH_START_LIVES,
    steadies: HUNCH_START_STEADIES,
    best: Math.max(0, Number(best) || 0),
    hands: dealLevel(1, seed),
    pile: null,
    discards: null,
    steady: { X: false, O: false },
    last: null,
    reward: null,
  }
}

/**
 * Normalise a round read from Firebase: empty arrays come back absent and
 * sparse arrays as numeric-keyed objects.
 * @param {any} raw
 */
export function normalizeHunchRound(raw) {
  if (!raw || typeof raw !== 'object') return null
  const hands = { X: cleanCards(raw.hands?.X), O: cleanCards(raw.hands?.O) }
  const pile = normalizeList(raw.pile).filter(p => p && Number.isInteger(p.card))
  const discards = normalizeList(raw.discards).filter(d => d && Number.isInteger(d.card))
  const last = raw.last && typeof raw.last === 'object'
    ? { ...raw.last, lost: { X: cleanCards(raw.last.lost?.X), O: cleanCards(raw.last.lost?.O) } }
    : null
  return {
    phase: raw.phase || null,
    seed: String(raw.seed ?? ''),
    level: Number(raw.level) || 1,
    lives: Number(raw.lives) || 0,
    steadies: Number(raw.steadies) || 0,
    best: Number(raw.best) || 0,
    hands,
    pile,
    discards,
    steady: { X: raw.steady?.X === true, O: raw.steady?.O === true },
    last,
    reward: raw.reward || null,
  }
}

/** The card on top of the pile, or 0 before the first play. */
export function pileTop(round) {
  const pile = round?.pile || []
  return pile.length ? Math.max(...pile.map(p => p.card)) : 0
}

export function lowestCard(hand) {
  return hand && hand.length ? Math.min(...hand) : null
}

// Firebase drops empty arrays; write null instead so the read side is the
// same either way.
const orNull = (arr) => (arr && arr.length ? arr : null)

function serialize(r) {
  return {
    ...r,
    hands: { X: orNull(r.hands.X), O: orNull(r.hands.O) },
    pile: orNull(r.pile),
    discards: orNull(r.discards),
    last: r.last
      ? { ...r.last, lost: r.last.lost ? { X: orNull(r.last.lost.X), O: orNull(r.last.lost.O) } : null }
      : null,
  }
}

// After any change: out of lives ends the run; two empty hands clear the level.
function settle(r) {
  if (r.lives <= 0) return { ...r, lives: 0, phase: 'lost' }
  if (r.hands.X.length || r.hands.O.length) return r
  const best = Math.max(r.best, r.level)
  if (r.level >= HUNCH_TARGET_LEVEL) return { ...r, best, phase: 'won', reward: null }
  const reward = HUNCH_REWARDS[r.level] || null
  let { lives, steadies } = r
  let granted = null
  if (reward === 'life' && lives < HUNCH_MAX_LIVES) { lives += 1; granted = 'life' }
  if (reward === 'steady' && steadies < HUNCH_MAX_STEADIES) { steadies += 1; granted = 'steady' }
  return { ...r, best, lives, steadies, phase: 'clear', reward: granted }
}

/**
 * `player` taps PLAY intending to play `card` (their lowest as they saw it).
 * Returns the next Firebase-ready round, or null when the tap is stale (the
 * hand changed underneath it) or the round is not in play.
 * @param {any} rawRound
 * @param {{ player: 'X'|'O', card: number, at: number }} play
 */
export function applyPlay(rawRound, { player, card, at }) {
  const r = normalizeHunchRound(rawRound)
  if (!r || r.phase !== 'play' || !SEATS.includes(player)) return null
  const hand = r.hands[player]
  const partner = partnerOf(player)

  if (hand.length && card === lowestCard(hand)) {
    const hands = { ...r.hands, [player]: hand.filter(c => c !== card) }
    const lost = {
      X: hands.X.filter(c => c < card),
      O: hands.O.filter(c => c < card),
    }
    const mistake = lost.X.length + lost.O.length > 0
    const next = {
      ...r,
      hands: { X: hands.X.filter(c => c > card), O: hands.O.filter(c => c > card) },
      pile: [...r.pile, { card, by: player, at }],
      discards: [
        ...r.discards,
        ...SEATS.flatMap(s => lost[s].map(c => ({ card: c, by: s, why: 'mistake' }))),
      ],
      lives: mistake ? r.lives - 1 : r.lives,
      steady: { X: false, O: false },
      last: { kind: mistake ? 'mistake' : 'play', by: player, card, at, lost: mistake ? lost : null },
    }
    return serialize(settle(next))
  }

  // Grace window: my only lost card was knocked out by my partner's play a
  // moment ago — our taps crossed in flight. Undo the mistake: the card goes
  // under theirs on the pile and the life comes back.
  const last = r.last
  if (
    last && last.kind === 'mistake' && last.by === partner
    && Number.isFinite(at) && Number.isFinite(last.at) && at - last.at <= HUNCH_GRACE_MS
    && last.lost[player].length === 1 && last.lost[player][0] === card
    && last.lost[partner].length === 0
  ) {
    const idx = r.pile.findIndex(p => p.card === last.card && p.by === partner)
    if (idx < 0) return null
    const pile = [...r.pile]
    pile.splice(idx, 0, { card, by: player, at })
    const di = r.discards.findIndex(d => d.card === card && d.by === player)
    const discards = di < 0 ? r.discards : r.discards.filter((_, i) => i !== di)
    // Only mid-level: once the mistake ended the level or the run, both
    // screens have already shown that result, so it stands.
    const next = {
      ...r,
      pile,
      discards,
      lives: r.lives + 1,
      last: { kind: 'forgive', by: player, card, at, lost: null },
    }
    return serialize(settle(next))
  }
  return null
}

/**
 * Hold (on=true) or release STEADY. When both seats hold it and a steady is
 * left, each discards their lowest card and one steady is spent.
 * Returns null for a no-op.
 */
export function applySteady(rawRound, { player, on, at }) {
  const r = normalizeHunchRound(rawRound)
  if (!r || r.phase !== 'play' || !SEATS.includes(player)) return null
  if (on && r.steadies <= 0) return null
  if (r.steady[player] === on) return null
  const steady = { ...r.steady, [player]: on }
  if (!(steady.X && steady.O)) return serialize({ ...r, steady })
  const lost = { X: r.hands.X.slice(0, 1), O: r.hands.O.slice(0, 1) }
  const next = {
    ...r,
    hands: { X: r.hands.X.slice(1), O: r.hands.O.slice(1) },
    discards: [
      ...r.discards,
      ...SEATS.flatMap(s => lost[s].map(c => ({ card: c, by: s, why: 'steady' }))),
    ],
    steadies: r.steadies - 1,
    steady: { X: false, O: false },
    last: { kind: 'steady', by: player, card: null, at, lost },
  }
  return serialize(settle(next))
}

/** From a cleared level, deal the next one. Null unless the phase is 'clear'. */
export function nextLevel(rawRound) {
  const r = normalizeHunchRound(rawRound)
  if (!r || r.phase !== 'clear') return null
  const level = r.level + 1
  return serialize({
    ...r,
    phase: 'play',
    level,
    hands: dealLevel(level, r.seed),
    pile: [],
    discards: [],
    steady: { X: false, O: false },
    last: null,
    reward: null,
  })
}

/** True when this transition cleared a level (the team score goes up by one). */
export function clearedLevel(before, after) {
  return before?.phase === 'play' && (after?.phase === 'clear' || after?.phase === 'won')
}

/** True once the run is over (won or out of lives). */
export const isRunOver = (round) => round?.phase === 'won' || round?.phase === 'lost'
