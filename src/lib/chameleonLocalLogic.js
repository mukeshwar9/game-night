// One-phone CHAMELEON: the round bookkeeping for /local/chameleon. The rules
// themselves (deal, clue order, outcome, scoring) stay in chameleonLogic.js;
// this module only adds what a shared screen needs — seat names, ids, a fresh
// deal held in memory, and the step that follows a vote. Pure, no DOM.
import {
  CHAMELEON_MIN_PLAYERS, CHAMELEON_MAX_PLAYERS, CHAMELEON_GRID,
  getCard, pickCardIndex, dealChameleon, clueOrder, outcomeOf, scoreRound, matchWinners,
} from './chameleonLogic'

export const LOCAL_NAME_MAX = 12

export const clampLocalCount = (n) => {
  const v = Math.floor(Number(n))
  if (!Number.isFinite(v)) return CHAMELEON_MIN_PLAYERS
  return Math.min(CHAMELEON_MAX_PLAYERS, Math.max(CHAMELEON_MIN_PLAYERS, v))
}

/** A typed name, trimmed and capped; blank falls back to "P<seat>". */
export function cleanLocalName(raw, index) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, LOCAL_NAME_MAX).toUpperCase()
  return name || `P${index + 1}`
}

/**
 * Seats for the table: `[{ id, name }]`. Duplicate names get a seat suffix so
 * the vote buttons and the score list stay distinguishable.
 */
export function buildLocalPlayers(names, count) {
  const n = clampLocalCount(count)
  const seen = new Map()
  const base = Array.from({ length: n }, (_, i) => cleanLocalName(names?.[i], i))
  base.forEach(nm => seen.set(nm, (seen.get(nm) || 0) + 1))
  return base.map((name, i) => ({
    id: `p${i}`,
    name: seen.get(name) > 1 ? `${name.slice(0, LOCAL_NAME_MAX - 2)} ${i + 1}` : name,
  }))
}

/**
 * Deal a round: a topic card (not last round's, nothing recently seen), who the
 * Chameleon is, and the secret word slot. `seen` is the list of card indexes
 * already used this sitting; `prevCardIndex` the previous round's card.
 */
export function dealLocalRound({ players, seen = null, prevCardIndex = null, roundNo = 0, rng = Math.random }) {
  const ids = players.map(p => p.id)
  const cardIndex = pickCardIndex(seen, prevCardIndex, rng)
  const { chameleonId, secretIndex } = dealChameleon(ids, rng)
  return { cardIndex, chameleonId, secretIndex, order: clueOrder(ids, roundNo) }
}

/** The word a non-Chameleon player is told. */
export function secretWordOf(deal) {
  return getCard(deal?.cardIndex)?.words?.[deal?.secretIndex] ?? ''
}

/** What each seat is shown in the private reveal. */
export function secretFor(playerId, deal) {
  if (playerId === deal.chameleonId) return { chameleon: true }
  return { chameleon: false, word: secretWordOf(deal), secretIndex: deal.secretIndex }
}

/**
 * What the table does once it has pointed at someone: a caught Chameleon gets
 * one guess at the word ('guess'); anything else ends the round ('result').
 * `accusedId` null means the table could not agree (a tie), so the Chameleon
 * walks away.
 */
export function nextAfterVote(accusedId, deal) {
  return accusedId && accusedId === deal.chameleonId ? 'guess' : 'result'
}

/** Close a round: outcome, new scores, and any match winners. */
export function settleLocalRound({ players, scores, deal, accusedId, guessIndex = null }) {
  const outcome = outcomeOf({
    accused: accusedId, chameleonId: deal.chameleonId, guessIndex, secretIndex: deal.secretIndex,
  })
  const ids = players.map(p => p.id)
  const next = scoreRound(scores, ids, deal.chameleonId, outcome)
  const delta = {}
  for (const id of ids) delta[id] = (next[id] || 0) - (scores?.[id] || 0)
  return { outcome, scores: next, delta, winners: matchWinners(ids, next) }
}

export { CHAMELEON_GRID }
