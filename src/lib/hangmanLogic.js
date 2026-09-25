export const MAX_WRONG = 6

export function validateWord(raw) {
  if (!raw) return null
  const up = String(raw).toUpperCase().replace(/\s+/g, ' ').trim()
  if (!/^[A-Z]+( [A-Z]+)*$/.test(up)) return null
  const letters = up.replace(/ /g, '').length
  if (letters < 3 || letters > 30) return null
  return up
}

export function wordStructure(word) {
  return String(word).trim().split(' ').filter(Boolean).map(w => w.length)
}

export function applyGuess(word, letter) {
  const positions = []
  for (let i = 0; i < word.length; i++) {
    if (word[i] === letter) positions.push(i)
  }
  return positions
}

// guesses: { LETTER: number[]|false }  (false = miss, array = hit positions)
export function isWordGuessed(word, guesses) {
  const distinct = new Set(word.replace(/ /g, '').split(''))
  for (const letter of distinct) {
    const entry = guesses[letter]
    if (!entry || entry === false || entry === 'pending') return false
    // entry must be a non-empty array
    if (!Array.isArray(entry) || entry.length === 0) return false
  }
  return true
}

export function countWrong(guesses) {
  return Object.values(guesses || {}).filter(v => v === false).length
}

// Normalise a guess entry from Firebase (array or numeric-keyed object) to number[]
function normalizePositions(val) {
  if (!val || val === false || val === 'pending') return val
  if (Array.isArray(val)) return val
  return Object.values(val).map(Number)
}

export function verifyRoundConsistency(word, guesses) {
  for (const [letter, recorded] of Object.entries(guesses || {})) {
    if (recorded === 'pending') continue
    const expected = applyGuess(word, letter)
    if (recorded === false) {
      if (expected.length > 0) return false
    } else {
      const positions = normalizePositions(recorded)
      if (!Array.isArray(positions)) return false
      if (positions.length !== expected.length) return false
      if (!positions.every((p, i) => Number(p) === expected[i])) return false
    }
  }
  return true
}

// Re-derive the round outcome from the revealed word and the recorded guesses,
// independent of the setter-written `result`. Returns 'guessed' | 'hanged' |
// null (guesses don't actually end the round). Mirrors the setter's priority:
// a fully guessed word wins even if the wrong count also reached MAX_WRONG.
export function deriveRoundResult(word, guesses) {
  const normalized = {}
  for (const [letter, val] of Object.entries(guesses || {})) {
    normalized[letter] = normalizePositions(val)
  }
  if (isWordGuessed(word, normalized)) return 'guessed'
  if (countWrong(normalized) >= MAX_WRONG) return 'hanged'
  return null
}

// --- One pending guess at a time -------------------------------------------
//
// The guesser writes `guesses/{L} = 'pending'` and the word-keeper's client
// grades it. Letting several guesses queue up while the keeper's phone slept
// let a guesser tap all 26 letters and win after 20+ misses, because the whole
// batch was graded at once with "guessed" taking priority over "hanged".
// Now only one guess may be pending, and any leftover queue (from an older
// client) is graded in a fixed order that stops the moment the round is
// decided.

export const PENDING = 'pending'

/** Letters still waiting for the word-keeper, in the order they are graded. */
export function pendingLetters(guesses) {
  return Object.keys(guesses || {})
    .filter(letter => guesses[letter] === PENDING)
    .sort()
}

export function hasPendingGuess(guesses) {
  return pendingLetters(guesses).length > 0
}

/** True when the guesser may send `letter` now: a new A–Z letter and nothing pending. */
export function canQueueGuess(guesses, letter) {
  if (!/^[A-Z]$/.test(String(letter ?? ''))) return false
  const g = guesses || {}
  if (g[letter] !== undefined && g[letter] !== null) return false
  return !hasPendingGuess(g)
}

function roundOutcome(word, guesses) {
  if (isWordGuessed(word, guesses)) return 'guessed'
  if (countWrong(guesses) >= MAX_WRONG) return 'hanged'
  return null
}

// Grade every pending guess against `word`, one letter at a time in
// pendingLetters() order, and stop as soon as the round is decided: six misses
// hang her even if a later queued letter would have completed the word.
// Pending letters left after that are discarded (removed from `guesses`).
//
// Returns { guesses, graded, discarded, wrongCount, result, lastGuess } where
// `guesses` is the full record to write back, `result` is
// 'guessed' | 'hanged' | null and `lastGuess` is { letter, hits } for the last
// graded letter (null when nothing was graded).
export function gradePending(word, guesses) {
  const out = {}
  for (const [letter, val] of Object.entries(guesses || {})) {
    if (val === null || val === undefined) continue
    out[letter] = normalizePositions(val)
  }
  const graded = []
  const discarded = []
  let lastGuess = null
  let result = roundOutcome(word, out)
  for (const letter of pendingLetters(out)) {
    if (result) {
      delete out[letter]
      discarded.push(letter)
      continue
    }
    const positions = applyGuess(word, letter)
    out[letter] = positions.length > 0 ? positions : false
    graded.push(letter)
    lastGuess = { letter, hits: positions.length }
    result = roundOutcome(word, out)
  }
  return { guesses: out, graded, discarded, wrongCount: countWrong(out), result, lastGuess }
}

// --- Advancing, stalls and claims ------------------------------------------
//
// Timers are server-corrected milliseconds (useServerClock). Values are
// starting points to playtest.

/** The round advances on its own this long after the reveal. */
export const AUTO_ADVANCE_MS = 8_000
/** An opponent must be offline this long before a disconnect claim appears. */
export const PRESENCE_GRACE_MS = 10_000
/** The word-keeper never locks a word: the guesser may claim the round. */
export const SETTING_DEADLINE_MS = 120_000
/** A guess waits this long ungraded: the guesser may claim the round. */
export const GRADING_STALL_MS = 60_000
/** No new guess for this long: the word-keeper may claim the round. */
export const GUESSER_IDLE_MS = 60_000

export function otherSymbol(symbol) {
  return symbol === 'X' ? 'O' : 'X'
}

function roundSetter(round) {
  return round?.setter === 'O' ? 'O' : 'X'
}

function stamp(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function earliest(...values) {
  const set = values.filter(v => v !== null)
  return set.length ? Math.min(...set) : null
}

function latest(...values) {
  const set = values.filter(v => v !== null)
  return set.length ? Math.max(...set) : null
}

// The claim `side` ('setter' | 'guesser') could make on this round because
// the other side is stalling. Stalls award the point to the side that isn't
// stalling:
//   - guesser: no word locked SETTING_DEADLINE_MS after setting began, or a
//     guess ungraded for GRADING_STALL_MS;
//   - setter: no new guess for GUESSER_IDLE_MS (counted from the start of
//     guessing or the last grade, never while a guess is pending);
//   - either: the opponent offline for PRESENCE_GRACE_MS (pass the moment
//     they went offline as `opponentOfflineSince`).
// Returns null when there is nothing to claim, else
// { reason: 'no-word'|'grading'|'idle'|'offline', at, ready }.
export function getRoundClaim(round, side, { now, opponentOfflineSince = null } = {}) {
  const phase = round?.phase || 'setting'
  if (phase !== 'setting' && phase !== 'guessing') return null
  if (side !== 'setter' && side !== 'guesser') return null
  const guesses = round?.guesses || {}
  const pending = hasPendingGuess(guesses)

  let timeAt = null
  let timeReason = null
  if (side === 'guesser') {
    if (phase === 'setting') {
      const start = stamp(round?.settingStartedAt)
      timeAt = start === null ? null : start + SETTING_DEADLINE_MS
      timeReason = 'no-word'
    } else if (pending) {
      const start = stamp(round?.pendingAt)
      timeAt = start === null ? null : start + GRADING_STALL_MS
      timeReason = 'grading'
    }
  } else if (phase === 'guessing' && !pending) {
    const start = latest(stamp(round?.guessingStartedAt), stamp(round?.gradedAt))
    timeAt = start === null ? null : start + GUESSER_IDLE_MS
    timeReason = 'idle'
  }

  // The word-keeper has nothing to claim while they still owe a word.
  const offlineApplies = !(side === 'setter' && phase === 'setting')
  const off = offlineApplies ? stamp(opponentOfflineSince) : null
  const offAt = off === null ? null : off + PRESENCE_GRACE_MS

  const at = earliest(timeAt, offAt)
  if (at === null) return null
  const reason = offAt !== null && (timeAt === null || offAt < timeAt) ? 'offline' : timeReason
  return { reason, at, ready: Number(now) >= at }
}

/** Who wins a revealed round: the guesser on a guess or a cheat, else the setter. */
export function revealRoundWinner(round, { cheat = false } = {}) {
  const setter = roundSetter(round)
  if (cheat || round?.cheatDetected) return otherSymbol(setter)
  if (round?.result === 'guessed') return otherSymbol(setter)
  if (round?.result === 'hanged') return setter
  return null
}

// May `side` start the next round from the reveal? The guesser always may
// (their client checks the reveal first). The word-keeper may once the
// guesser's client has verified the reveal or flagged a cheat, or when the
// guesser has gone offline — so a losing or absent guesser can't withhold
// the point.
export function canAdvanceReveal(round, side, { guesserGone = false } = {}) {
  if (round?.phase !== 'reveal') return false
  if (side === 'guesser') return true
  if (side !== 'setter') return false
  return !!(round.verified || round.cheatDetected || guesserGone)
}

/** When the reveal auto-advances (null while unverified, or after a cheat). */
export function autoAdvanceAt(round) {
  if (round?.phase !== 'reveal' || round.cheatDetected || !round.verified) return null
  const at = stamp(round.revealAt)
  return at === null ? null : at + AUTO_ADVANCE_MS
}

// The game-node patch that ends the current round: score `roundWinner`
// ('X' | 'O', or null for no score), hand the word to the other player and
// finish the match when someone reaches `target`.
export function buildNextRound(game, roundWinner, { target = 3 } = {}) {
  const setter = roundSetter(game?.round)
  const scores = { X: Number(game?.scores?.X) || 0, O: Number(game?.scores?.O) || 0 }
  if (roundWinner === 'X' || roundWinner === 'O') scores[roundWinner] += 1
  const next = {
    scores,
    round: { setter: otherSymbol(setter), phase: 'setting', wrongCount: 0 },
    proposal: null,
  }
  const winner = scores.X >= target ? 'X' : scores.O >= target ? 'O' : null
  if (winner) {
    next.status = 'finished'
    next.winner = winner
  }
  return next
}
