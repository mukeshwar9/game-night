// Two Truths & a Lie — pure rules, no DOM/Firebase/React.
//
// Every round both players write three statements about themselves at the
// same time, mark one as the lie and commit sha256(lieIndex + salt)
// (src/lib/commit.js) so the lie is fixed before anyone guesses but stays
// secret until the reveal. Once both have locked, both guess the other's lie
// at the same time; once both have guessed, each reveals their own lie and
// the other client verifies it against the commitment. Catching the
// opponent's lie scores 1. Both players play every round, so the match is
// only decided after a round: first to the target with the lead.
//
// The page (src/pages/TwoTruthsGame.jsx) wires these helpers to Firebase;
// the round transitions below return the next state (or null to abort) so
// they can run inside runTransaction.
//
// Firebase `round` node:
//   roundNum, phase ('writing' | 'guessing' | 'revealing' | 'done'),
//   startedAt / guessStartedAt / revealStartedAt / doneAt (server ms),
//   entries/{X|O}: { statements[3], commitment, lockedAt },
//   guesses/{X|O}: index of the OPPONENT's statement picked as the lie,
//   reveals/{X|O}: { lieIndex, salt } | { forfeit: true },
//   result: { reason, X: SideResult, O: SideResult }

import { normalizeText } from './textMatchLogic'
import { isBannedWord } from './wordDenylist'

export const STATEMENT_COUNT = 3
export const MIN_STATEMENT_LENGTH = 3
export const MAX_STATEMENT_LENGTH = 80
export const DEFAULT_MATCH_TARGET = 3
// A player who locked may end the round (+1 to them) once the other still
// hasn't locked statements / a guess after these.
export const WRITING_DEADLINE_MS = 180_000
export const GUESSING_DEADLINE_MS = 60_000
// Honest clients reveal automatically within a second of the last guess;
// past this the player who revealed may forfeit the missing reveal.
export const REVEAL_DEADLINE_MS = 20_000
// After a round is scored, either player's client starts the next one after
// this long (NEXT ROUND skips the wait).
export const AUTO_ADVANCE_MS = 8_000

export const SYMBOLS = ['X', 'O']
export const PHASES = ['writing', 'guessing', 'revealing', 'done']

export function otherSymbol(symbol) {
  return symbol === 'X' ? 'O' : 'X'
}

/** Firebase may hand back an array or a numeric-keyed object; always 3 strings. */
export function normalizeStatements(raw) {
  const out = Array(STATEMENT_COUNT).fill('')
  if (!raw || typeof raw !== 'object') return out
  Object.entries(raw).forEach(([k, v]) => {
    const i = parseInt(k, 10)
    if (i >= 0 && i < STATEMENT_COUNT) out[i] = typeof v === 'string' ? v : ''
  })
  return out
}

/** Trim and collapse runs of whitespace (newlines from a textarea included). */
export function cleanStatement(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
}

export function isValidLieIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < STATEMENT_COUNT
}

/** First banned word in a statement, or null. */
export function findBannedWord(text) {
  const words = normalizeText(text).split(' ').filter(Boolean)
  return words.find(w => isBannedWord(w)) ?? null
}

/**
 * Validate three statements. Returns `{ ok: true, statements }` with the
 * cleaned text, or `{ ok: false, error, index }` where `index` is the first
 * offending statement (null when the problem isn't one statement).
 */
export function validateStatements(statements) {
  if (!Array.isArray(statements) || statements.length !== STATEMENT_COUNT) {
    return { ok: false, error: `WRITE EXACTLY ${STATEMENT_COUNT} STATEMENTS`, index: null }
  }
  const cleaned = statements.map(cleanStatement)
  for (let i = 0; i < cleaned.length; i++) {
    const s = cleaned[i]
    if (!s) return { ok: false, error: `STATEMENT ${i + 1} IS EMPTY`, index: i }
    if (s.length < MIN_STATEMENT_LENGTH) {
      return { ok: false, error: `STATEMENT ${i + 1} IS TOO SHORT (${MIN_STATEMENT_LENGTH}+ CHARACTERS)`, index: i }
    }
    if (s.length > MAX_STATEMENT_LENGTH) {
      return { ok: false, error: `STATEMENT ${i + 1} IS TOO LONG (${MAX_STATEMENT_LENGTH} MAX)`, index: i }
    }
    if (findBannedWord(s)) {
      return { ok: false, error: `STATEMENT ${i + 1} HAS A WORD THAT ISN'T ALLOWED — REPHRASE IT`, index: i }
    }
  }
  for (let i = 0; i < cleaned.length; i++) {
    for (let j = i + 1; j < cleaned.length; j++) {
      if (normalizeText(cleaned[i]) === normalizeText(cleaned[j])) {
        return { ok: false, error: `STATEMENTS ${i + 1} AND ${j + 1} ARE THE SAME`, index: j }
      }
    }
  }
  return { ok: true, statements: cleaned }
}

/** Statements plus the marked lie, as submitted by LOCK IT IN. */
export function validateEntry(statements, lieIndex) {
  const v = validateStatements(statements)
  if (!v.ok) return v
  if (!isValidLieIndex(lieIndex)) return { ok: false, error: 'MARK WHICH ONE IS THE LIE', index: null }
  return { ok: true, statements: v.statements, lieIndex }
}

// --- Commitment payloads -------------------------------------------------

/** The string committed/revealed for a lie index (sha256(secret + salt)). */
export function lieSecret(lieIndex) {
  return String(lieIndex)
}

/** sessionStorage key for this tab's secret lie in a room. */
export function secretStorageKey(gameId) {
  return `twotruths-${gameId}`
}

/** What the tab stores after committing: tied to the round and the
 * commitment it opens, so a reload in the same tab can still reveal. */
export function buildStoredSecret({ roundNum = null, commitment, lieIndex, salt }) {
  return { roundNum, commitment, lieIndex, salt }
}

/**
 * Parse the stored secret (JSON string or object). Returns `{ lieIndex, salt }`
 * only when it opens `commitment` (when given) — a stale secret from an
 * earlier round or match never reveals into the current one.
 */
export function parseStoredSecret(raw, commitment = null) {
  let value = raw
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw) } catch { return null }
  }
  if (!value || typeof value !== 'object') return null
  const { lieIndex, salt } = value
  if (!isValidLieIndex(lieIndex) || typeof salt !== 'string' || !salt) return null
  if (commitment != null && value.commitment != null && value.commitment !== commitment) return null
  return { lieIndex, salt }
}

// --- Scoring --------------------------------------------------------------

/**
 * Match winner after a round: someone has reached `target` AND leads.
 * A tie at or above the target keeps the match going.
 */
export function getMatchWinner(scores, target = DEFAULT_MATCH_TARGET) {
  const x = scores?.X || 0
  const o = scores?.O || 0
  if (Math.max(x, o) < target || x === o) return null
  return x > o ? 'X' : 'O'
}

// --- Round state ----------------------------------------------------------

function toTime(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.commitment !== 'string' || !raw.commitment) return null
  return {
    statements: normalizeStatements(raw.statements),
    commitment: raw.commitment,
    lockedAt: toTime(raw.lockedAt),
  }
}

function normalizeGuess(raw) {
  return isValidLieIndex(raw) ? raw : null
}

function normalizeReveal(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (raw.forfeit === true) return { forfeit: true }
  return {
    lieIndex: Number.isInteger(raw.lieIndex) ? raw.lieIndex : null,
    salt: typeof raw.salt === 'string' ? raw.salt : '',
  }
}

const FAULTS = new Set(['cheat', 'forfeit', 'noStatements', 'noGuess'])
const REASONS = new Set(['reveal', 'writingTimeout', 'guessingTimeout'])

function normalizeSideResult(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  return {
    points: r.points === 1 ? 1 : 0,
    caught: typeof r.caught === 'boolean' ? r.caught : null,
    guess: normalizeGuess(r.guess),
    lieIndex: normalizeGuess(r.lieIndex),
    fault: FAULTS.has(r.fault) ? r.fault : null,
  }
}

function normalizeResult(raw) {
  if (!raw || typeof raw !== 'object' || !REASONS.has(raw.reason)) return null
  return { reason: raw.reason, X: normalizeSideResult(raw.X), O: normalizeSideResult(raw.O) }
}

function bySymbol(raw, fn) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return { X: fn(src.X), O: fn(src.O) }
}

/**
 * Normalize a `round` read from Firebase. Missing pieces default to a fresh
 * round 1 in 'writing' — including the legacy `{ setter, phase }` shape the
 * room creation / first-mover writes may still produce. A phase whose
 * prerequisites are missing falls back to 'writing' so the room can't stick.
 */
export function normalizeRound(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const roundNum = Number.isInteger(r.roundNum) && r.roundNum >= 1 ? r.roundNum : 1
  const entries = bySymbol(r.entries, normalizeEntry)
  const guesses = bySymbol(r.guesses, normalizeGuess)
  const reveals = bySymbol(r.reveals, normalizeReveal)
  const result = normalizeResult(r.result)
  const bothLocked = !!(entries.X && entries.O)
  let phase = PHASES.includes(r.phase) ? r.phase : 'writing'
  if (phase === 'done' && !result) phase = bothLocked ? 'guessing' : 'writing'
  if ((phase === 'guessing' || phase === 'revealing') && !bothLocked) phase = 'writing'
  if (phase === 'revealing' && !(guesses.X != null && guesses.O != null)) phase = 'guessing'
  return {
    roundNum,
    phase,
    startedAt: toTime(r.startedAt),
    guessStartedAt: toTime(r.guessStartedAt),
    revealStartedAt: toTime(r.revealStartedAt),
    doneAt: toTime(r.doneAt),
    entries,
    guesses,
    reveals,
    result,
  }
}

function compact(value) {
  if (Array.isArray(value)) return value.map(compact)
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const [k, v] of Object.entries(value)) {
    if (v === null || v === undefined) continue
    const c = compact(v)
    if (c && typeof c === 'object' && !Array.isArray(c) && Object.keys(c).length === 0) continue
    out[k] = c
  }
  return out
}

/** A normalized round as written to Firebase (null/empty pieces omitted). */
export function toFirebaseRound(round) {
  return compact(round)
}

/** Fresh 'writing' round. */
export function freshRound(roundNum = 1, startedAt = null) {
  return toFirebaseRound({ roundNum, phase: 'writing', startedAt })
}

/** Anchor the writing clock once per round. Null when already anchored. */
export function anchorRound(round, now) {
  if (round.phase !== 'writing' || round.startedAt != null) return null
  return { ...round, startedAt: now }
}

/** Lock `symbol`'s statements + commitment; both locked → guessing. */
export function lockEntry(round, symbol, { statements, commitment }, now) {
  if (!SYMBOLS.includes(symbol) || round.phase !== 'writing' || round.entries[symbol]) return null
  if (typeof commitment !== 'string' || !commitment) return null
  const v = validateStatements(statements)
  if (!v.ok) return null
  const entries = { ...round.entries, [symbol]: { statements: v.statements, commitment, lockedAt: now } }
  const next = { ...round, entries }
  if (entries.X && entries.O) {
    next.phase = 'guessing'
    next.guessStartedAt = now
  }
  return next
}

/** Lock `symbol`'s guess at the opponent's lie; both guessed → revealing. */
export function lockGuess(round, symbol, index, now) {
  if (!SYMBOLS.includes(symbol) || round.phase !== 'guessing') return null
  if (round.guesses[symbol] != null || !isValidLieIndex(index)) return null
  const guesses = { ...round.guesses, [symbol]: index }
  const next = { ...round, guesses }
  if (guesses.X != null && guesses.O != null) {
    next.phase = 'revealing'
    next.revealStartedAt = now
  }
  return next
}

/** Record `symbol`'s reveal: `{ lieIndex, salt }` or `{ forfeit: true }`. */
export function submitReveal(round, symbol, reveal) {
  if (!SYMBOLS.includes(symbol) || round.phase !== 'revealing' || round.reveals[symbol]) return null
  const r = normalizeReveal(reveal)
  if (!r) return null
  return { ...round, reveals: { ...round.reveals, [symbol]: r } }
}

function elapsed(since, now) {
  return since != null ? now - since : -Infinity
}

/** `symbol` locked statements, the opponent didn't, and the writing deadline passed. */
export function canEndWriting(round, symbol, now, deadlineMs = WRITING_DEADLINE_MS) {
  return round.phase === 'writing' && !!round.entries[symbol] && !round.entries[otherSymbol(symbol)] &&
    elapsed(round.startedAt, now) >= deadlineMs
}

/** `symbol` locked a guess, the opponent didn't, and the guessing deadline passed. */
export function canEndGuessing(round, symbol, now, deadlineMs = GUESSING_DEADLINE_MS) {
  return round.phase === 'guessing' && round.guesses[symbol] != null && round.guesses[otherSymbol(symbol)] == null &&
    elapsed(round.guessStartedAt, now) >= deadlineMs
}

/** `symbol` revealed, the opponent hasn't, and the reveal deadline passed. */
export function canForfeitOpponentReveal(round, symbol, now, deadlineMs = REVEAL_DEADLINE_MS) {
  return round.phase === 'revealing' && !!round.reveals[symbol] && !round.reveals[otherSymbol(symbol)] &&
    elapsed(round.revealStartedAt, now) >= deadlineMs
}

/** Stable identity of a reveal, so a verification can be matched to it. */
export function revealKey(reveal) {
  if (!reveal) return ''
  if (reveal.forfeit) return 'forfeit'
  return `${reveal.lieIndex}:${reveal.salt}`
}

/**
 * Check each player's reveal against their commitment (async — sha256).
 * `verify(hash, secret, salt)` is commit.js's `verifyReveal`. A forfeited or
 * missing reveal is never ok. Returns `{ X: { key, ok }, O: { key, ok } }`.
 */
export async function verifyRoundReveals(round, verify) {
  const out = {}
  for (const s of SYMBOLS) {
    const reveal = round.reveals[s]
    const entry = round.entries[s]
    let ok = false
    if (reveal && !reveal.forfeit && entry && isValidLieIndex(reveal.lieIndex) && reveal.salt) {
      ok = !!(await verify(entry.commitment, lieSecret(reveal.lieIndex), reveal.salt))
    }
    out[s] = { key: revealKey(reveal), ok }
  }
  return out
}

/**
 * Score a fully revealed round. `valid` = `{ X: bool, O: bool }` — whether
 * each player's reveal opened their commitment.
 *   - both valid: +1 for catching the opponent's lie;
 *   - a player whose reveal is invalid (cheat) or forfeited gets 0 — their
 *     catch doesn't count — and their opponent gets +1, since the lie that
 *     "fooled" them can't be proven.
 */
export function judgeRound(round, valid) {
  const result = { reason: 'reveal' }
  for (const s of SYMBOLS) {
    const o = otherSymbol(s)
    const guess = round.guesses[s]
    const own = round.reveals[s]
    const oppReveal = round.reveals[o]
    const side = { points: 0, caught: null, guess, lieIndex: valid[s] ? own.lieIndex : null, fault: null }
    if (!valid[s]) {
      side.fault = own?.forfeit || !own ? 'forfeit' : 'cheat'
    } else if (!valid[o]) {
      side.points = 1
    } else {
      side.caught = guess === oppReveal.lieIndex
      side.points = side.caught ? 1 : 0
    }
    result[s] = side
  }
  return result
}

/** Round node → 'done' with `result`. */
function doneRound(round, result, now) {
  return { ...round, phase: 'done', doneAt: now, result }
}

/**
 * Close a fully revealed round. `verification` comes from
 * `verifyRoundReveals` on the same reveals; null (abort) if the phase moved
 * on or the reveals changed since they were verified.
 */
export function finishRevealedRound(round, verification, now) {
  if (round.phase !== 'revealing' || !round.reveals.X || !round.reveals.O) return null
  for (const s of SYMBOLS) {
    if (!verification?.[s] || verification[s].key !== revealKey(round.reveals[s])) return null
  }
  const valid = { X: !!verification.X.ok, O: !!verification.O.ok }
  return doneRound(round, judgeRound(round, valid), now)
}

/**
 * End a stalled writing/guessing round for `symbol` (who locked in) once the
 * deadline passed: +1 to them, 0 to the player who never locked. Null when
 * not allowed.
 */
export function endStalledRound(round, symbol, now, {
  writingDeadlineMs = WRITING_DEADLINE_MS, guessingDeadlineMs = GUESSING_DEADLINE_MS,
} = {}) {
  const o = otherSymbol(symbol)
  if (canEndWriting(round, symbol, now, writingDeadlineMs)) {
    return doneRound(round, {
      reason: 'writingTimeout',
      [symbol]: { points: 1, caught: null, guess: null, lieIndex: null, fault: null },
      [o]: { points: 0, caught: null, guess: null, lieIndex: null, fault: 'noStatements' },
    }, now)
  }
  if (canEndGuessing(round, symbol, now, guessingDeadlineMs)) {
    return doneRound(round, {
      reason: 'guessingTimeout',
      [symbol]: { points: 1, caught: null, guess: round.guesses[symbol], lieIndex: null, fault: null },
      [o]: { points: 0, caught: null, guess: null, lieIndex: null, fault: 'noGuess' },
    }, now)
  }
  return null
}

/** Scores after a round's result. */
export function applyRoundScores(scores, result) {
  return {
    X: (scores?.X || 0) + (result?.X?.points || 0),
    O: (scores?.O || 0) + (result?.O?.points || 0),
  }
}

/** Game patch for a round that just ended: scores, round, maybe match end. */
function settledGame(game, doneRoundState, matchTarget) {
  const scores = applyRoundScores(game.scores, doneRoundState.result)
  const next = { ...game, scores, round: toFirebaseRound(doneRoundState) }
  const winner = getMatchWinner(scores, matchTarget)
  if (winner) {
    next.status = 'finished'
    next.winner = winner
  }
  return next
}

/**
 * Transaction body for the whole game node: close the revealed round, add
 * the points and finish the match if decided. Null (abort) when the game
 * isn't playing or the round can't close with this verification.
 */
export function settleRevealedGame(game, verification, { now, matchTarget = DEFAULT_MATCH_TARGET } = {}) {
  if (!game || game.status !== 'playing') return null
  const done = finishRevealedRound(normalizeRound(game.round), verification, now)
  return done ? settledGame(game, done, matchTarget) : null
}

/** Transaction body: `symbol` ends a stalled writing/guessing round. */
export function settleStalledGame(game, symbol, { now, matchTarget = DEFAULT_MATCH_TARGET, ...deadlines } = {}) {
  if (!game || game.status !== 'playing') return null
  const done = endStalledRound(normalizeRound(game.round), symbol, now, deadlines)
  return done ? settledGame(game, done, matchTarget) : null
}

/** Server time the scored round auto-advances at, or null. */
export function autoAdvanceAt(round, delayMs = AUTO_ADVANCE_MS) {
  return round.phase === 'done' && round.doneAt != null ? round.doneAt + delayMs : null
}

/**
 * Transaction body: start round `expectedRoundNum + 1` after a finished
 * round. Guarded on the round number so NEXT ROUND from both players (or a
 * double tap) advances once.
 */
export function advanceGame(game, expectedRoundNum, now) {
  if (!game || game.status !== 'playing') return null
  const round = normalizeRound(game.round)
  if (round.phase !== 'done' || round.roundNum !== expectedRoundNum) return null
  return { ...game, round: freshRound(round.roundNum + 1, now), proposal: null }
}
