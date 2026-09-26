// Pure helpers for TRIVIA BLITZ (Kahoot-style speed trivia). No Firebase, no
// React — unit-tested in triviaLogic.test.js.
//
// Round shape on Firebase (under games/{gameId}/round):
//   { phase: 'question' | 'reveal' | 'end',
//     deckSeed: number,             // set once at match start
//     order: [deckIndex × 10],      // this match's questions (drawMatchOrder), written
//                                   // by the coordinator on Q1 so all clients agree;
//                                   // absent on legacy rounds → seededDraw(deckSeed)
//     qNum: 0..9,                   // index into order
//     qStartAt: epoch-ms,           // coordinator-written at phase entry (corrected clock)
//     answers: { [uid]: { choice: 0-3, at: epoch-ms } },
//     scored: true,                 // scores + streaks applied once, idempotently
//     streaks: { [uid]: n } }       // carried forward by the scoring step
//
// Top-level keys: scores/{uid}; seen/trivia (src/lib/seenHistory.js — room-level
// history so a group avoids repeats across matches); timerScale (read only).

import { seededShuffle, seededRng } from './fibbageLogic'
import { pickFresh } from './seenHistory'
import { scaledMs } from './timerScale'
import { normalizeList } from './normalize'

export { seededShuffle }

// Match length: questions per match.
export const MATCH_QUESTIONS = 10

// Question phase length (ms) on the server-corrected clock.
export const QUESTION_MS = 15000

// Answers arriving after qStartAt + QUESTION_MS + GRACE_MS score zero.
export const GRACE_MS = 1500

// Scoring constants (tunable).
export const BASE_POINTS = 500
export const SPEED_POINTS = 500
export const STREAK_STEP = 100
export const STREAK_CAP = 300

// ---------------------------------------------------------------------------
// seededDraw — match question selection: shuffle the deck by seed, take n,
// then present easy→hard (stable sort by diff so equal tiers keep draw order).
// Deterministic per seed; no repeats within a match.
// ---------------------------------------------------------------------------
export function seededDraw(deck, seed, n = MATCH_QUESTIONS) {
  const shuffled = seededShuffle(deck || [], seed)
  return shuffled
    .slice(0, Math.max(0, n))
    .map((q, i) => ({ q, i }))
    .sort((a, b) => ((a.q?.diff ?? 1) - (b.q?.diff ?? 1)) || (a.i - b.i))
    .map(x => x.q)
}

// ---------------------------------------------------------------------------
// drawMatchOrder — this match's questions as deck indices, avoiding what the
// room has already seen (seen/trivia, src/lib/seenHistory.js) until the deck
// runs out, then presented easy→hard (stable by draw order within a tier).
// Deterministic for (deck, seed, seen): the coordinator draws once and stores
// the result as round.order, so clients never need to recompute it.
// ---------------------------------------------------------------------------
export function drawMatchOrder(deck, seed, seen = null, n = MATCH_QUESTIONS) {
  const size = (deck || []).length
  const rng = seededRng(seed >>> 0)
  const picks = []
  for (let k = 0; k < Math.min(Math.max(0, n), size); k++) {
    picks.push(pickFresh(size, seen, rng, picks))
  }
  return picks
    .map((idx, i) => ({ idx, i }))
    .sort((a, b) => ((deck[a.idx]?.diff ?? 1) - (deck[b.idx]?.diff ?? 1)) || (a.i - b.i))
    .map(x => x.idx)
}

// The match's question objects: from the stored order, or — for a legacy round
// started before order existed — the old seededDraw(deckSeed).
export function matchQuestions(deck, round, n = MATCH_QUESTIONS) {
  const order = orderOf(round, (deck || []).length)
  if (order.length) return order.map(i => deck[i])
  return seededDraw(deck, round?.deckSeed ?? 1, n)
}

// round.order normalized by key (Firebase may return a numeric-keyed object).
export function orderOf(round, deckSize = Infinity) {
  return normalizeList(round?.order).filter(v => Number.isInteger(v) && v >= 0 && v < deckSize)
}

// ---------------------------------------------------------------------------
// Catch-up: the match's final question is worth double, so a trailing player
// always has a live shot. Applied to the whole delta (base + speed + streak).
// ---------------------------------------------------------------------------
export const FINAL_MULTIPLIER = 2

export function questionMultiplier(qNum, total = MATCH_QUESTIONS) {
  return qNum === total - 1 ? FINAL_MULTIPLIER : 1
}

// ---------------------------------------------------------------------------
// Timer scale (src/lib/timerScale.js): 1 = 15 s questions, 2 = 30 s, 0 = no
// deadline. The speed bonus is measured against the scaled window; with timers
// off it uses the base window and nothing is ever "late".
// ---------------------------------------------------------------------------
export function scoringWindow(timerScale) {
  const ms = scaledMs(QUESTION_MS, timerScale)
  return ms == null
    ? { windowMs: QUESTION_MS, noDeadline: true }
    : { windowMs: ms, noDeadline: false }
}

// Question deadline on the corrected clock, or null when timers are off.
export function questionDeadline(qStartAt, timerScale) {
  const ms = scaledMs(QUESTION_MS, timerScale)
  return ms == null || qStartAt == null ? null : qStartAt + ms
}

// ---------------------------------------------------------------------------
// scoreAnswer — speed scoring for ONE answer.
// correct=false → 0. Late beyond the grace window → 0. Otherwise:
//   (base + round(speed × timeRemaining/windowMs) + streak bonus) × multiplier.
// Streak bonus: STREAK_STEP × (streak − 1), capped at STREAK_CAP. `streak` is
// the count of consecutive correct answers BEFORE this one.
// opts: { windowMs = QUESTION_MS, noDeadline = false, multiplier = 1 }.
// ---------------------------------------------------------------------------
export function scoreAnswer(correct, atMs, qStartAtMs, streak = 0, opts = {}) {
  const { windowMs = QUESTION_MS, noDeadline = false, multiplier = 1 } = opts
  if (!correct) return 0
  if (atMs == null || qStartAtMs == null) return 0
  const elapsed = atMs - qStartAtMs
  if (!noDeadline && elapsed > windowMs + GRACE_MS) return 0 // late — rejected at scoring time
  const remaining = Math.max(0, Math.min(windowMs, windowMs - Math.max(0, elapsed)))
  const speed = Math.round((SPEED_POINTS * remaining) / windowMs)
  const streakBonus = Math.min(STREAK_CAP, STREAK_STEP * Math.max(0, streak - 1))
  return (BASE_POINTS + speed + streakBonus) * multiplier
}

// ---------------------------------------------------------------------------
// applyRoundScores — pure, deterministic pass over everyone's answers.
// answers: { [uid]: { choice, at } | undefined }. Missing choice or a wrong
// pick → 0 points and streak reset. Returns { deltas, newStreaks } where
// deltas[uid] may be 0 (explicitly written so reveal UI can show it).
// opts: as scoreAnswer (window, deadline, multiplier).
// ---------------------------------------------------------------------------
export function applyRoundScores(answers, question, streaks = {}, opts = {}) {
  const { windowMs = QUESTION_MS, noDeadline = false } = opts
  const deltas = {}
  const newStreaks = {}
  const uids = new Set([...Object.keys(answers || {}), ...Object.keys(streaks || {})])
  for (const uid of uids) {
    const prevStreak = streaks?.[uid] || 0
    const ans = answers?.[uid]
    // A late answer is not a correct answer: zero points AND streak reset.
    const late = !noDeadline && !!ans && ans.at != null && question?.qStartAt != null &&
      (ans.at - question.qStartAt) > windowMs + GRACE_MS
    const correct = !!ans && !late && ans.choice === question?.answer
    if (!correct) {
      deltas[uid] = 0
      newStreaks[uid] = 0
      continue
    }
    const nextStreak = prevStreak + 1
    deltas[uid] = scoreAnswer(true, ans.at, question.qStartAt, prevStreak, opts)
    newStreaks[uid] = nextStreak
  }
  return { deltas, newStreaks }
}
