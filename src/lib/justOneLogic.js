// JUST ONE rules (co-op clue game) — card flow, clue validation, duplicate
// cancellation, guess judging and the team score. The live room is
// src/pages/JustOneGame.jsx; this module never touches Firebase/DOM/React.
//
// Each card: one guesser (rotating); everyone else sees the mystery word and
// secretly writes ONE one-word clue. Identical or near-identical clues
// (case, plurals, simple endings — src/lib/wordMatch.js) cancel each other,
// and so does a clue that is the mystery word itself. The guesser sees only
// the surviving clues and gets one guess. 13 cards; a right guess scores 1,
// a pass scores 0, a wrong guess also burns the next card (on the last card
// it costs a point instead).
//
// Secrecy (see the page header for the full model): the mystery word and a
// per-card round key reach the clue-givers only inside sealed boxes
// (src/lib/sealed.js); clues are committed (commit.js format) while writing,
// then re-published encrypted under the round key so clue-givers — never the
// guesser — can compare them. Word, salt and key go public at the result, so
// every client can verify the word commitment and every clue.
import { JUST_ONE_WORDS } from './decks/justone'
import { verifyReveal } from './commit'
import { sealKeyId, staleRecipients } from './sealed'
import { pickFresh } from './seenHistory'
import { normalizeList } from './normalize'
import { nextInRotation } from './teams'
import { isSingleWord, normalizeWord, overlapsWord, sameFamily, stemWord } from './wordMatch'
import { isDenied } from './wordDenylist'

export const JO_MIN_PLAYERS = 3
export const JO_MAX_PLAYERS = 8
export const JO_CARDS = 13
export const JO_CLUE_MAX_LENGTH = 20
// Base phase clocks, before the room timer scale (src/lib/timerScale.js).
export const JO_CLUE_MS = 90_000
export const JO_GUESS_MS = 60_000
// How long the coordinator waits for committed clue-givers to publish their
// encrypted reveal before comparing without them (a lost tab can't reveal).
export const JO_REVEAL_GRACE_MS = 10_000
// Room seen-history key: `games/{id}/seen/justone`.
export const JO_SEEN_KEY = 'justone'

/** Stable seat order (joinedAt, then uid) → uids. */
export function seatOrder(players) {
  return Object.values(players || {})
    .filter(p => p && p.playerId)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.playerId).localeCompare(String(b.playerId)))
    .map(p => p.playerId)
}

/** Next mystery word: fresh for the room, never repeated within a match. */
export function pickWordIndex(seen, usedThisMatch = [], rng = Math.random) {
  return pickFresh(JUST_ONE_WORDS.length, seen, rng, usedThisMatch)
}

/** @returns {string|null} an error for the clue input, or null if it's a legal one-word clue. */
export function clueError(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return 'TYPE A CLUE'
  if (!isSingleWord(text)) return 'ONE WORD ONLY'
  if (normalizeWord(text).length > JO_CLUE_MAX_LENGTH) return 'TOO LONG'
  if (isDenied(text)) return 'PICK ANOTHER WORD'
  return null
}

/**
 * Cancel clues. `clues` is `{ uid: text }` (already verified against the
 * commitments). A clue is removed when it is invalid, is (a form of) the
 * mystery word, or matches another clue once case/plurals/endings are
 * ignored — every copy of a duplicate goes, not just the later ones.
 *
 * @returns {{ survivors: Record<string,string>, cancelled: Record<string,'duplicate'|'invalid'|'mystery'> }}
 */
export function cancelClues(clues, word) {
  const survivors = {}
  const cancelled = {}
  const groups = new Map()
  for (const [uid, text] of Object.entries(clues || {})) {
    if (clueError(text)) { cancelled[uid] = 'invalid'; continue }
    if (word && overlapsWord(text, word)) { cancelled[uid] = 'mystery'; continue }
    const key = stemWord(text)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(uid)
  }
  for (const uids of groups.values()) {
    for (const uid of uids) {
      if (uids.length > 1) cancelled[uid] = 'duplicate'
      else survivors[uid] = String(clues[uid]).trim()
    }
  }
  return { survivors, cancelled }
}

/** Right answer, allowing case, plural and simple-ending slips. */
export function isCorrectGuess(guess, word) {
  if (!normalizeWord(guess) || !normalizeWord(word)) return false
  return normalizeWord(guess) === normalizeWord(word) || sameFamily(guess, word)
}

/**
 * Score a finished card. `played` counts cards used up so far (before this
 * one). A wrong guess burns the next card too; on the last card it costs a
 * point instead (never below 0).
 *
 * @returns {{ score: number, played: number }}
 */
export function applyOutcome({ score = 0, played = 0 }, outcome, total = JO_CARDS) {
  let s = score
  let p = played + 1
  if (outcome === 'correct') s += 1
  else if (outcome === 'wrong') {
    if (p < total) p += 1
    else s = Math.max(0, s - 1)
  }
  return { score: s, played: Math.min(p, total) }
}

export const isMatchOver = (played, total = JO_CARDS) => played >= total

/** End-of-match verdict for the team score (after the original's scale). */
export function scoreRating(score) {
  if (score >= 13) return 'PERFECT SCORE!'
  if (score === 12) return 'INCREDIBLE!'
  if (score === 11) return 'AWESOME!'
  if (score >= 9) return 'WOW, NOT BAD AT ALL'
  if (score >= 7) return 'GOOD — KEEP GOING'
  if (score >= 4) return "THAT'S A GOOD START"
  return 'TRY AGAIN!'
}

/** Next guesser after `current` in seat order, skipping offline seats. */
export function nextGuesser(order, current, isOnline = () => true) {
  return nextInRotation(order, current, isOnline) ?? (order || [])[0] ?? null
}

/** Everyone seated except the guesser. */
export function clueGivers(round, order) {
  return (order || []).filter(uid => uid !== round?.guesser)
}

// `sealKeys` below is the room's `{ uid: pub }` map (normalizeSealKeys,
// src/lib/sealed.js).

/** Clue-givers whose sealed box was sealed to their current public key. */
export function wordHolders(round, order, sealKeys) {
  return clueGivers(round, order).filter(uid => {
    const pub = sealKeys?.[uid]
    return !!pub && round?.sealed?.[uid]?.kid === sealKeyId(pub)
  })
}

/** Clue-givers with a published key but no box for it yet (new tab, late key). */
export function giversNeedingSeal(round, order, sealKeys) {
  return staleRecipients(clueGivers(round, order), sealKeys, round?.sealed)
}

/** Deal once every online clue-giver has a key (and at least one does). */
export function readyToDeal(round, order, sealKeys, isOnline = () => true) {
  const givers = clueGivers(round, order)
  const withKey = givers.filter(uid => sealKeys?.[uid])
  return withKey.length > 0 && givers.filter(isOnline).every(uid => sealKeys?.[uid])
}

/** Every online clue-giver has committed a clue (and at least one has). */
export function allCluesIn(round, order, isOnline = () => true) {
  const givers = clueGivers(round, order)
  const committed = givers.filter(uid => round?.clues?.[uid]?.h)
  return committed.length > 0 && givers.filter(isOnline).every(uid => round?.clues?.[uid]?.h)
}

/** Committed clue-givers who haven't published their encrypted reveal yet. */
export function pendingReveals(round) {
  return Object.keys(round?.clues || {}).filter(uid => round.clues[uid]?.h && !round.enc?.[uid])
}

// AAD strings binding a box to its room, card and player.
export const sealContext = (gameId, nonce, uid) => `justone|${gameId}|${nonce}|${uid}`
export const clueContext = (gameId, nonce, uid) => `justone-clue|${gameId}|${nonce}|${uid}`

/** The sealed box payload: mystery word, its commitment salt, the round key. */
export const encodeDeal = ({ word, wordSalt, key }) => JSON.stringify({ w: word, ws: wordSalt, k: key })

export function decodeDeal(text) {
  try {
    const v = JSON.parse(text)
    if (typeof v?.w !== 'string' || typeof v?.ws !== 'string' || typeof v?.k !== 'string') return null
    return { word: v.w, wordSalt: v.ws, key: v.k }
  } catch {
    return null
  }
}

// Clue reveals are encrypted under the card's round key (encryptWithKey in
// src/lib/sealed.js) and the guesser can see the boxes, so the JSON is
// space-padded to one fixed width (JSON.parse ignores trailing whitespace):
// every legal clue then encrypts to the same ciphertext length.
export const CLUE_REVEAL_WIDTH = 96
export const encodeClue = ({ text, salt }) => JSON.stringify({ t: text, s: salt }).padEnd(CLUE_REVEAL_WIDTH, ' ')

export function decodeClue(raw) {
  try {
    const v = JSON.parse(raw)
    if (typeof v?.t !== 'string' || typeof v?.s !== 'string') return null
    return { text: v.t, salt: v.s }
  } catch {
    return null
  }
}

/**
 * Keep only decrypted clues that match their commitment.
 * @param {Record<string,{h:string}>} commits - `round.clues`
 * @param {Record<string,{text:string,salt:string}|null>} opened
 * @returns {Promise<{ verified: Record<string,string>, bad: string[] }>}
 */
export async function verifyClues(commits, opened) {
  const verified = {}
  const bad = []
  for (const [uid, entry] of Object.entries(opened || {})) {
    const h = commits?.[uid]?.h
    if (!entry || !h) { bad.push(uid); continue }
    if (await verifyReveal(h, entry.text, entry.salt)) verified[uid] = entry.text
    else bad.push(uid)
  }
  return { verified, bad }
}

/** Firebase-safe read of `game.round` with defaults. */
export function normalizeRound(raw) {
  if (!raw || typeof raw !== 'object') return null
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? { ...v } : {})
  return {
    phase: raw.phase ?? 'dealing',
    nonce: raw.nonce ?? '',
    card: raw.card ?? 1,
    played: raw.played ?? 0,
    score: raw.score ?? 0,
    order: normalizeList(raw.order),
    guesser: raw.guesser ?? null,
    sealed: obj(raw.sealed),
    wordCommit: raw.wordCommit ?? null,
    clues: obj(raw.clues),
    enc: obj(raw.enc),
    survivors: raw.survivors == null ? null : obj(raw.survivors),
    cancelledCount: raw.cancelledCount ?? 0,
    guess: raw.guess ?? null,
    outcome: raw.outcome ?? null,
    reveal: raw.reveal ?? null,
    phaseStartedAt: raw.phaseStartedAt ?? null,
    used: normalizeList(raw.used),
    history: normalizeList(raw.history),
  }
}

/** A fresh card in the 'dealing' phase; everything card-specific starts empty. */
export function buildCard({ nonce, card, played, score, order, guesser, used = [], history = [] }) {
  return {
    phase: 'dealing',
    nonce,
    card,
    played,
    score,
    order,
    guesser,
    sealed: null,
    wordCommit: null,
    clues: null,
    enc: null,
    survivors: null,
    cancelledCount: 0,
    guess: null,
    outcome: null,
    reveal: null,
    phaseStartedAt: null,
    used,
    history,
  }
}

/** The card after `round`, or null when the match is over. */
export function nextCard(round, { nonce, isOnline = () => true }) {
  if (isMatchOver(round.played)) return null
  return buildCard({
    nonce,
    card: round.played + 1,
    played: round.played,
    score: round.score,
    order: round.order,
    guesser: nextGuesser(round.order, round.guesser, isOnline),
    used: round.used,
    history: round.history,
  })
}

/**
 * Judge the guess (called by a word holder with the plaintext word): the
 * outcome, the updated score/cards, and the card's line in the history.
 * `guess` null means the guesser passed.
 */
export function judgeCard(round, { word, guess }) {
  const outcome = guess == null ? 'skip' : isCorrectGuess(guess, word) ? 'correct' : 'wrong'
  const { score, played } = applyOutcome(round, outcome)
  return {
    outcome,
    score,
    played,
    over: isMatchOver(played),
    entry: { word, outcome, guesser: round.guesser, guess: guess ?? null },
  }
}

/**
 * Night-scoreboard result: co-op, so every seat shares place 1 and the team
 * score. Empty until the match is over.
 */
export function justOnePlacements(round, seatIds) {
  if (!round || !isMatchOver(round.played)) return []
  return (seatIds || []).map(id => ({ id, place: 1, teamScore: round.score }))
}
