// Two Truths & a Lie — pure rules, no DOM/Firebase/React.
//
// A player writes three statements about themselves, marks one as the lie
// and commits sha256(lieIndex + salt) (src/lib/commit.js) so the lie is
// fixed before anyone guesses but stays secret until the reveal. The page
// (src/pages/TwoTruthsGame.jsx) wires these helpers to Firebase.

import { normalizeText } from './textMatchLogic'
import { isBannedWord } from './wordDenylist'

export const STATEMENT_COUNT = 3
export const MIN_STATEMENT_LENGTH = 3
export const MAX_STATEMENT_LENGTH = 80
export const DEFAULT_MATCH_TARGET = 3
// The writer never locks in — the waiting player may end the round after this.
export const WRITING_DEADLINE_MS = 180_000

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

/** What the tab stores after committing: tied to the commitment it opens. */
export function buildStoredSecret({ commitment, lieIndex, salt }) {
  return { commitment, lieIndex, salt }
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
 * Winner of a storyteller/guesser round: the guesser scores for finding the
 * lie, otherwise the storyteller scores for fooling them.
 */
export function storytellerRoundWinner({ setter, guess, lieIndex }) {
  const s = setter === 'O' ? 'O' : 'X'
  return guess === lieIndex ? otherSymbol(s) : s
}

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
