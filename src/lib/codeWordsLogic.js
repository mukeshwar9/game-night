// CODE WORDS rules (Codenames-style team word game) — board dealing, the
// secret key, clue validation, guesses, reveals, turn flow and scoring.
// The live room is src/pages/CodeWordsGame.jsx; this module never touches
// Firebase, the DOM or React.
//
// THE KEY (which card is whose) must not sit in the world-readable room node:
//   * A spymaster's client (the dealer) draws a random 128-bit `seed`. The
//     key layout AND one salt per card are derived from it
//     (`layoutFromSeed`, `deriveKey`).
//   * The room gets 25 salted commitments `commits[i] = SHA-256(identity_i +
//     salt_i)` — the src/lib/commit.js format, so `verifyReveal` checks them.
//   * The seed itself reaches the spymasters only inside sealed boxes
//     (src/lib/sealed.js), one per spymaster public key (`game.sealKeys`).
//   * When a guess lands, a key-holding spymaster's client publishes that
//     one card's `{ identity, salt }`; every client verifies it against
//     `commits[i]`. At the end of the board the seed is published so anyone
//     can re-derive and check the whole key.
// See the page header for the remaining trust limits.
import { CODE_WORDS } from './decks/codewords'
import { sha256hex } from './sha256'
import { verifyReveal } from './commit'
import { sealKeyId, staleRecipients } from './sealed'
import { avoidList } from './seenHistory'
import { normalizeArray, normalizeList } from './normalize'
import {
  TEAM_IDS, otherTeam, teamMembers, normalizeTeams, balanceTeams, pickRoleHolders, teamsReady,
} from './teams'
import { isSingleWord, normalizeWord, overlapsWord } from './wordMatch'
import { isDenied } from './moderationDenylist'

export const CW_MIN_PLAYERS = 4
export const CW_MAX_PLAYERS = 8
export const CW_MIN_PER_TEAM = 2
export const CW_SIZE = 25
export const CW_COLS = 5
export const CW_START_CARDS = 9
export const CW_OTHER_CARDS = 8
export const CW_NEUTRAL_CARDS = 7
export const CW_MAX_CLUE_NUMBER = 9
export const CW_CLUE_MAX_LENGTH = 20
// Room seen-history key: `games/{id}/seen/codewords`.
export const CW_SEEN_KEY = 'codewords'

// Card identities: a team id ('A' | 'B'), a neutral bystander, or the assassin.
export const NEUTRAL = 'N'
export const ASSASSIN = 'X'
const IDENTITIES = new Set([...TEAM_IDS, NEUTRAL, ASSASSIN])

// Teams are named and marked by glyph, not by colour: every theme remaps the
// p1/p2 accents, so "RED"/"BLUE" would be wrong on most themes.
export const TEAM_LABEL = { A: 'ALPHA', B: 'BRAVO' }
export const TEAM_GLYPH = { A: '▲', B: '●' }

/** Stable seat order (joinedAt, then uid) → uids. */
export function seatOrder(players) {
  return Object.values(players || {})
    .filter(p => p && p.playerId)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.playerId).localeCompare(String(b.playerId)))
    .map(p => p.playerId)
}

function shuffled(arr, rng) {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Pick 25 distinct board words: never-seen cards first (room seen history),
 * and no two words where one is built on the other ("star" + "starfish"),
 * since a clue could then never legally point at either.
 *
 * @returns {{ words: string[], indices: number[] }}
 */
export function pickBoardWords(seen, rng = Math.random, deck = CODE_WORDS) {
  const all = deck.map((_, i) => i)
  const avoid = new Set(avoidList(deck.length, seen, CW_SIZE))
  const picked = []
  const tryFill = (pool) => {
    for (const i of shuffled(pool, rng)) {
      if (picked.length >= CW_SIZE) return
      if (picked.includes(i)) continue
      if (picked.some(j => overlapsWord(deck[i], deck[j]))) continue
      picked.push(i)
    }
  }
  tryFill(all.filter(i => !avoid.has(i)))
  tryFill(all)
  return { indices: picked, words: picked.map(i => deck[i]) }
}

/** Cards per team for a board: the starting team gets the extra card. */
export function teamTargets(startTeam) {
  return { [startTeam]: CW_START_CARDS, [otherTeam(startTeam)]: CW_OTHER_CARDS }
}

/** A fresh 128-bit key seed (lowercase hex) — dealt only inside sealed boxes. */
export function randomSeed() {
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}

// Deterministic PRNG from the seed (xmur3 → mulberry32). Secrecy never rests
// on this generator: the salts come from SHA-256 of the full seed.
function seededRng(seed) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The 25 card identities for `seed`: 9 starting team, 8 other, 7 neutral, 1 assassin. */
export function layoutFromSeed(seed, startTeam) {
  const other = otherTeam(startTeam)
  const base = [
    ...Array(CW_START_CARDS).fill(startTeam),
    ...Array(CW_OTHER_CARDS).fill(other),
    ...Array(CW_NEUTRAL_CARDS).fill(NEUTRAL),
    ASSASSIN,
  ]
  return shuffled(base, seededRng(String(seed)))
}

/**
 * Everything a key holder needs: identities, per-card salts and the public
 * commitments (`SHA-256(identity + salt)`, the commit.js format).
 */
export async function deriveKey(seed, startTeam) {
  const identities = layoutFromSeed(seed, startTeam)
  const salts = await Promise.all(identities.map((_, i) => sha256hex(`codewords|${seed}|${i}`).then(h => h.slice(0, 32))))
  const commits = await Promise.all(identities.map((t, i) => sha256hex(t + salts[i])))
  return { identities, salts, commits }
}

/** Does a published card reveal match its commitment? */
export function verifyCard(commitHash, identity, salt) {
  if (!commitHash || !IDENTITIES.has(identity) || !salt) return Promise.resolve(false)
  return verifyReveal(commitHash, identity, salt)
}

/** Does `seed` reproduce every published commitment? (end-of-board audit, and
 *  a key holder's sanity check after opening its sealed box) */
export async function verifySeed(seed, startTeam, commits) {
  if (!seed || !Array.isArray(commits) || commits.length !== CW_SIZE) return false
  const derived = await deriveKey(seed, startTeam)
  return derived.commits.every((c, i) => c === commits[i])
}

// ---------------------------------------------------------------------------
// Firebase normalizers
// ---------------------------------------------------------------------------

/** `{ [index]: { t, s, by, team } }`, keyed by explicit index (never Object.values). */
export function normalizeRevealed(raw) {
  const arr = normalizeArray(raw, CW_SIZE, null)
  const out = {}
  arr.forEach((v, i) => {
    if (v && IDENTITIES.has(v.t)) out[i] = { t: v.t, s: v.s ?? '', by: v.by ?? null, team: v.team ?? null }
  })
  return out
}

/** `{ [uid]: cardIndex }` — where each teammate is pointing. */
export function normalizePicks(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [uid, idx] of Object.entries(raw)) {
    const i = Number(idx)
    if (Number.isInteger(i) && i >= 0 && i < CW_SIZE) out[uid] = i
  }
  return out
}

/** The whole `game.round` with defaults — safe to read anywhere in the page. */
export function normalizeRound(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    phase: raw.phase ?? 'lobby',
    board: raw.board ?? 0,
    nonce: raw.nonce ?? '',
    teams: normalizeTeams(raw.teams),
    spymasters: raw.spymasters && typeof raw.spymasters === 'object' ? { ...raw.spymasters } : {},
    startTeam: TEAM_IDS.includes(raw.startTeam) ? raw.startTeam : TEAM_IDS[0],
    turn: TEAM_IDS.includes(raw.turn) ? raw.turn : null,
    words: normalizeArray(raw.words, CW_SIZE, ''),
    commits: normalizeArray(raw.commits, CW_SIZE, ''),
    sealed: raw.sealed && typeof raw.sealed === 'object' ? { ...raw.sealed } : {},
    clue: raw.clue && raw.clue.word ? { ...raw.clue } : null,
    clueLog: normalizeList(raw.clueLog),
    guessesLeft: raw.guessesLeft ?? 0,
    guessesMade: raw.guessesMade ?? 0,
    picks: normalizePicks(raw.picks),
    pending: raw.pending && Number.isInteger(raw.pending.index) ? { ...raw.pending } : null,
    revealed: normalizeRevealed(raw.revealed),
    winner: TEAM_IDS.includes(raw.winner) ? raw.winner : null,
    endReason: raw.endReason ?? null,
    seed: raw.seed ?? null,
    wins: normalizeWins(raw.wins),
  }
}

/** `{ uid: boardsWon }` — the match tally carried from board to board. */
export function normalizeWins(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [uid, n] of Object.entries(raw)) {
    const v = Number(n)
    if (Number.isFinite(v) && v > 0) out[uid] = v
  }
  return out
}

// ---------------------------------------------------------------------------
// Teams & board setup
// ---------------------------------------------------------------------------

/** Enough seats and at least two per team (a spymaster plus a guesser). */
export function canStartBoard(teams, order) {
  return (order || []).length >= CW_MIN_PLAYERS && teamsReady(teams, order, CW_MIN_PER_TEAM)
}

/**
 * The frame of a new board — words, teams, spymasters, starting team — in
 * the 'keying' phase: once the spymasters' public keys are in
 * (`game.sealKeys`), the dealer seals the seed and writes the commitments
 * (see `applyDeal`).
 */
export function buildBoard({ board, nonce, teams, spymasters, startTeam, words, wins = null }) {
  return {
    phase: 'keying',
    board,
    nonce,
    teams,
    spymasters,
    startTeam,
    turn: null,
    words,
    commits: null,
    sealed: null,
    clue: null,
    clueLog: null,
    guessesLeft: 0,
    guessesMade: 0,
    picks: null,
    pending: null,
    revealed: null,
    winner: null,
    endReason: null,
    seed: null,
    wins,
  }
}

/**
 * Spymasters for the next board: teams re-balanced for anyone who joined,
 * the role rotated to each team's next (online) member, and the other team
 * starting. For the first board, `previous` is empty.
 */
export function nextBoardSetup({ order, teams, spymasters = {}, startTeam = null, isOnline = () => true, rotate = true }) {
  const balanced = balanceTeams(order, teams)
  const holders = pickRoleHolders(balanced, order, { previous: spymasters, rotate, isEligible: isOnline })
  return {
    teams: balanced,
    spymasters: holders,
    startTeam: startTeam ? otherTeam(startTeam) : TEAM_IDS[0],
  }
}

export const isSpymaster = (round, uid) =>
  !!uid && TEAM_IDS.some(t => round?.spymasters?.[t] === uid)

export const spymasterIds = (round) =>
  TEAM_IDS.map(t => round?.spymasters?.[t]).filter(Boolean)

/**
 * Deal is possible once the dealer and every online spymaster have a
 * published public key. `sealKeys` is the room's `{ uid: pub }` map
 * (normalizeSealKeys in src/lib/sealed.js).
 */
export function readyToDeal(round, sealKeys, isOnline = () => true) {
  const sms = spymasterIds(round)
  if (sms.length === 0) return false
  const withKey = sms.filter(uid => sealKeys?.[uid])
  return withKey.length > 0 && sms.filter(isOnline).every(uid => sealKeys?.[uid])
}

/** Spymasters whose sealed box was sealed to their current public key. */
export function keyHolders(round, sealKeys) {
  return spymasterIds(round).filter(uid => {
    const pub = sealKeys?.[uid]
    return !!pub && round.sealed?.[uid]?.kid === sealKeyId(pub)
  })
}

/** Spymasters with a published key but no box for it yet (new tab, late key). */
export function spymastersNeedingSeal(round, sealKeys) {
  return staleRecipients(spymasterIds(round), sealKeys, round.sealed)
}

/** AAD binding a sealed seed to its room, board and recipient. */
export const sealContext = (gameId, round, uid) => `codewords|${gameId}|${round.nonce}|${uid}`

/** keying → clue: commitments + sealed boxes land, the starting team clues. */
export function applyDeal(round, { commits, sealed }) {
  if (!round || round.phase !== 'keying') return null
  return { ...round, phase: 'clue', turn: round.startTeam, commits, sealed }
}

// ---------------------------------------------------------------------------
// Clues
// ---------------------------------------------------------------------------

/**
 * @returns {string|null} an error message for the spymaster, or null if OK.
 */
export function validateClue(word, number, boardWords) {
  const raw = String(word ?? '').trim()
  if (!raw) return 'TYPE A CLUE'
  if (!isSingleWord(raw)) return 'ONE WORD ONLY'
  if (normalizeWord(raw).length > CW_CLUE_MAX_LENGTH) return 'TOO LONG'
  if (isDenied(raw)) return 'PICK ANOTHER WORD'
  if ((boardWords || []).some(w => w && overlapsWord(raw, w))) return "THAT'S ON THE BOARD"
  const n = Number(number)
  if (!Number.isInteger(n) || n < 1 || n > CW_MAX_CLUE_NUMBER) return `PICK A NUMBER 1–${CW_MAX_CLUE_NUMBER}`
  return null
}

/** The turn's spymaster gives a clue: clue → guess, with number + 1 guesses. */
export function applyClue(round, { uid, word, number }) {
  if (!round || round.phase !== 'clue' || !round.turn) return null
  if (round.spymasters?.[round.turn] !== uid) return null
  if (validateClue(word, number, round.words)) return null
  const clue = { word: String(word).trim().toUpperCase(), number: Number(number), team: round.turn, by: uid }
  return {
    ...round,
    phase: 'guess',
    clue,
    clueLog: [...(round.clueLog || []), { word: clue.word, number: clue.number, team: clue.team }],
    guessesLeft: clue.number + 1,
    guessesMade: 0,
    picks: null,
    pending: null,
  }
}

// ---------------------------------------------------------------------------
// Guesses & reveals
// ---------------------------------------------------------------------------

/** A guesser (on-turn team, not its spymaster) — may point at / guess cards. */
export function isOnTurnGuesser(round, uid) {
  return !!round && round.phase === 'guess' && !!uid &&
    round.teams?.[uid] === round.turn && round.spymasters?.[round.turn] !== uid
}

export function canGuess(round, uid, index) {
  return isOnTurnGuesser(round, uid) && !round.pending &&
    Number.isInteger(index) && index >= 0 && index < CW_SIZE && !round.revealed?.[index]
}

/** Lock in a guess: it waits as `pending` until a key holder reveals the card. */
export function applyGuess(round, { uid, index }) {
  if (!canGuess(round, uid, index)) return null
  const picks = { ...(round.picks || {}) }
  delete picks[uid]
  return { ...round, pending: { index, by: uid, team: round.turn }, picks }
}

/** Codenames rule: a team must make at least one guess before passing. */
export function canPass(round, uid) {
  return isOnTurnGuesser(round, uid) && !round.pending && (round.guessesMade || 0) >= 1
}

/** Hand the turn to the other team's spymaster. */
export function endTurn(round) {
  return {
    ...round,
    phase: 'clue',
    turn: otherTeam(round.turn),
    clue: null,
    guessesLeft: 0,
    guessesMade: 0,
    picks: null,
    pending: null,
  }
}

/** Cards still hidden per team. */
export function remainingCards(round) {
  const targets = teamTargets(round.startTeam)
  const out = { ...targets }
  for (const r of Object.values(round.revealed || {})) {
    if (r && r.t in out) out[r.t]--
  }
  return out
}

/**
 * Resolve the pending guess with the card's identity (published by a key
 * holder together with its salt, which every client checks against
 * `commits[index]`).
 *
 * @returns {{ round: object, outcome: 'hit'|'miss'|'assassin'|'win' } | null}
 *   null when there is no matching pending guess (already resolved).
 */
export function applyReveal(round, { index, identity, salt }) {
  const pending = round?.pending
  if (!pending || pending.index !== index || round.revealed?.[index] || !IDENTITIES.has(identity)) return null
  const team = pending.team
  const revealed = { ...(round.revealed || {}), [index]: { t: identity, s: salt, by: pending.by, team } }
  const next = { ...round, revealed, pending: null, guessesMade: (round.guessesMade || 0) + 1 }

  const over = (winner, endReason) => ({
    round: { ...next, phase: 'over', winner, endReason, clue: null, picks: null, guessesLeft: 0 },
    outcome: endReason === 'assassin' ? 'assassin' : 'win',
  })

  if (identity === ASSASSIN) return over(otherTeam(team), 'assassin')
  const left = remainingCards(next)
  // A team wins the moment its last card is uncovered — even by the rivals.
  const done = TEAM_IDS.find(t => left[t] <= 0)
  if (done) return over(done, 'cards')

  if (identity === team) {
    const guessesLeft = (round.guessesLeft || 0) - 1
    if (guessesLeft <= 0) return { round: endTurn({ ...next, guessesLeft: 0 }), outcome: 'hit' }
    return { round: { ...next, guessesLeft }, outcome: 'hit' }
  }
  return { round: endTurn(next), outcome: 'miss' }
}

// ---------------------------------------------------------------------------
// Scoring & results
// ---------------------------------------------------------------------------

/**
 * The room's `scores` for a finished board: 1 for every member of the
 * winning team, 0 for the rest. Per board, not cumulative — each board is
 * one match for the night scoreboard (src/lib/nightLogic.js ranks a finished
 * party room by `scores`); the running tally lives in `round.wins`.
 */
export function boardScores(round) {
  const out = {}
  if (!round?.winner) return out
  for (const [uid, team] of Object.entries(round.teams || {})) out[uid] = team === round.winner ? 1 : 0
  return out
}

/** The match tally after a finished board: +1 board won per winning member. */
export function tallyWins(wins, round) {
  const next = { ...(wins || {}) }
  if (!round?.winner) return next
  for (const [uid, team] of Object.entries(round.teams || {})) {
    if (team === round.winner) next[uid] = (next[uid] || 0) + 1
  }
  return next
}

/**
 * Night-scoreboard placements for a finished board: the winning team all
 * place 1, the other team 2. Empty until the board is over.
 */
export function codeWordsPlacements(round) {
  if (!round?.winner) return []
  return Object.entries(round.teams || {}).map(([id, team]) => ({ id, place: team === round.winner ? 1 : 2 }))
}

/** Members of each team in seat order (UI helper). */
export function rosters(round, order) {
  return Object.fromEntries(TEAM_IDS.map(t => [t, teamMembers(round?.teams || {}, t, order)]))
}
