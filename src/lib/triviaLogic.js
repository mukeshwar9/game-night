// Pure helpers for TRIVIA BLITZ (Kahoot-style speed trivia). No Firebase, no
// React — unit-tested in triviaLogic.test.js.
//
// Round shape on Firebase (under games/{gameId}/round):
//   { phase: 'question' | 'reveal' | 'end',
//     deckSeed: number,             // set once at match start; same order everywhere
//     qNum: 0..9,                   // index into seededDraw(TRIVIA_DECK, deckSeed)
//     qStartAt: epoch-ms,           // host-written at phase entry (corrected clock)
//     answers: { [uid]: { choice: 0-3, at: epoch-ms } },
//     scored: true,                 // scores + streaks applied once, idempotently
//     streaks: { [uid]: n } }       // carried forward by the scoring step
//
// Top-level key: scores/{uid}. No other new top-level keys.

import { seededShuffle } from './fibbageLogic'

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
// scoreAnswer — speed scoring for ONE answer.
// correct=false → 0. Late beyond the grace window → 0. Otherwise:
//   base + round(speed × timeRemaining/questionMs) + streak bonus.
// Streak bonus: STREAK_STEP × (streak − 1), capped at STREAK_CAP. `streak` is
// the count of consecutive correct answers BEFORE this one.
// ---------------------------------------------------------------------------
export function scoreAnswer(correct, atMs, qStartAtMs, streak = 0) {
  if (!correct) return 0
  if (atMs == null || qStartAtMs == null) return 0
  const elapsed = atMs - qStartAtMs
  if (elapsed > QUESTION_MS + GRACE_MS) return 0 // late — rejected at scoring time
  const remaining = Math.max(0, Math.min(QUESTION_MS, QUESTION_MS - Math.max(0, elapsed)))
  const speed = Math.round((SPEED_POINTS * remaining) / QUESTION_MS)
  const streakBonus = Math.min(STREAK_CAP, STREAK_STEP * Math.max(0, streak - 1))
  return BASE_POINTS + speed + streakBonus
}

// ---------------------------------------------------------------------------
// applyRoundScores — pure, deterministic pass over everyone's answers.
// answers: { [uid]: { choice, at } | undefined }. Missing choice or a wrong
// pick → 0 points and streak reset. Returns { deltas, newStreaks } where
// deltas[uid] may be 0 (explicitly written so reveal UI can show it).
// ---------------------------------------------------------------------------
export function applyRoundScores(answers, question, streaks = {}) {
  const deltas = {}
  const newStreaks = {}
  const uids = new Set([...Object.keys(answers || {}), ...Object.keys(streaks || {})])
  for (const uid of uids) {
    const prevStreak = streaks?.[uid] || 0
    const ans = answers?.[uid]
    // A late answer is not a correct answer: zero points AND streak reset.
    const late = !!ans && ans.at != null && question?.qStartAt != null &&
      (ans.at - question.qStartAt) > QUESTION_MS + GRACE_MS
    const correct = !!ans && !late && ans.choice === question?.answer
    if (!correct) {
      deltas[uid] = 0
      newStreaks[uid] = 0
      continue
    }
    const nextStreak = prevStreak + 1
    deltas[uid] = scoreAnswer(true, ans.at, question.qStartAt, prevStreak)
    newStreaks[uid] = nextStreak
  }
  return { deltas, newStreaks }
}
