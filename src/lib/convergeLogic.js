// CONVERGE — a co-op word game for two. Both players lock in any word at
// the same time; both are revealed together. Then each types a word that
// bridges the last two revealed words, and so on, until both type the same
// word. Fewer steps earn more stars; after CONVERGE_MAX_STEPS steps the
// chain is lost. A match is CONVERGE_CHAINS chains.
//
// The match lives in `games/{id}/round`; each lock is one runTransaction on
// the room. The partner's locked word sits in the room until both are in —
// the page hides it (co-op: peeking only spoils your own game).
//
// Pure — no DOM, no Firebase, no React.

import { normalizeList } from './normalize'
import { matchKey } from './textMatchLogic'
import { isBannedWord } from './wordDenylist'

export const CONVERGE_CHAINS = 5
export const CONVERGE_MAX_STEPS = 8
export const CONVERGE_MIN_LEN = 2
export const CONVERGE_MAX_LEN = 16

const SEATS = ['X', 'O']

/** Stars for a chain that converged on step `steps` (1-based). */
export function starsFor(steps) {
  if (steps <= 2) return 3
  if (steps <= 4) return 2
  return 1
}

/** Upper-case, letters only — how a word is stored and shown. */
export function cleanWord(text) {
  return String(text ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, CONVERGE_MAX_LEN)
}

/** Two words converge when they share a comparison key (case, plurals). */
export function sameWord(a, b) {
  const ka = matchKey(a)
  return ka.length > 0 && ka === matchKey(b)
}

export function startMatch({ seed, best = 0 }) {
  return {
    phase: 'write',
    seed: String(seed),
    chainNo: 1,
    chain: null,
    pending: null,
    stars: 0,
    best: Math.max(0, Number(best) || 0),
    results: null,
    last: null,
  }
}

/**
 * Normalise a round read from Firebase (empty arrays come back absent,
 * sparse ones as numeric-keyed objects).
 * @param {any} raw
 */
export function normalizeConvergeRound(raw) {
  if (!raw || typeof raw !== 'object') return null
  const chain = normalizeList(raw.chain)
    .filter(p => p && typeof p.X === 'string' && typeof p.O === 'string')
  const results = normalizeList(raw.results).filter(r => r && typeof r === 'object')
  const pending = {
    X: typeof raw.pending?.X === 'string' && raw.pending.X ? raw.pending.X : null,
    O: typeof raw.pending?.O === 'string' && raw.pending.O ? raw.pending.O : null,
  }
  return {
    phase: raw.phase || null,
    seed: String(raw.seed ?? ''),
    chainNo: Number(raw.chainNo) || 1,
    chain,
    pending,
    stars: Number(raw.stars) || 0,
    best: Number(raw.best) || 0,
    results,
    last: raw.last && typeof raw.last === 'object' ? raw.last : null,
  }
}

/**
 * Why `word` can't be locked in, or null when it can. A word already said
 * in this chain (by either player, any plural) can't be used again.
 */
export function wordProblem(word, round) {
  const w = cleanWord(word)
  if (w.length < CONVERGE_MIN_LEN) return 'TYPE A WORD'
  if (isBannedWord(w)) return 'PICK ANOTHER WORD'
  const used = (round?.chain || []).flatMap(p => [p.X, p.O])
  if (used.some(u => sameWord(u, w))) return 'ALREADY SAID THIS CHAIN'
  return null
}

const orNull = (arr) => (arr && arr.length ? arr : null)

function serialize(r) {
  return {
    ...r,
    chain: orNull(r.chain),
    results: orNull(r.results),
    pending: r.pending && (r.pending.X || r.pending.O) ? r.pending : null,
  }
}

/**
 * `player` locks in `word`. When the partner is already locked in, the pair
 * is revealed: a match ends the chain (converged), the last allowed step
 * without one loses it. Returns the next round, or null for an invalid or
 * stale lock (already locked, wrong phase, bad word).
 * @param {any} rawRound
 * @param {{ player: 'X'|'O', word: string, at?: number }} lock
 */
export function lockWord(rawRound, { player, word, at = 0 }) {
  const r = normalizeConvergeRound(rawRound)
  if (!r || r.phase !== 'write' || !SEATS.includes(player)) return null
  if (r.pending[player]) return null
  if (wordProblem(word, r)) return null
  const w = cleanWord(word)
  const pending = { ...r.pending, [player]: w }
  if (!pending.X || !pending.O) return serialize({ ...r, pending })

  const chain = [...r.chain, { X: pending.X, O: pending.O }]
  const steps = chain.length
  const converged = sameWord(pending.X, pending.O)
  if (!converged && steps < CONVERGE_MAX_STEPS) {
    return serialize({ ...r, chain, pending: null, last: { kind: 'reveal', steps, at } })
  }
  const stars = converged ? starsFor(steps) : 0
  const result = { chainNo: r.chainNo, steps, stars, converged, word: converged ? pending.X : null }
  const total = r.stars + stars
  const matchOver = r.chainNo >= CONVERGE_CHAINS
  return serialize({
    ...r,
    chain,
    pending: null,
    stars: total,
    best: matchOver ? Math.max(r.best, total) : r.best,
    results: [...r.results, result],
    phase: matchOver ? 'done' : 'chainEnd',
    last: { kind: converged ? 'converged' : 'lost', steps, at },
  })
}

/** Take back a locked word before the partner locks theirs. */
export function unlockWord(rawRound, { player }) {
  const r = normalizeConvergeRound(rawRound)
  if (!r || r.phase !== 'write' || !r.pending[player]) return null
  return serialize({ ...r, pending: { ...r.pending, [player]: null } })
}

/** Start the next chain after one ended. Null unless the phase is 'chainEnd'. */
export function nextChain(rawRound) {
  const r = normalizeConvergeRound(rawRound)
  if (!r || r.phase !== 'chainEnd') return null
  return serialize({ ...r, phase: 'write', chainNo: r.chainNo + 1, chain: [], pending: null, last: null })
}

/** True when this transition converged a chain (the team score goes up by one). */
export function convergedNow(before, after) {
  return before?.phase === 'write' && after?.last?.kind === 'converged'
}

export const maxStars = () => CONVERGE_CHAINS * 3
