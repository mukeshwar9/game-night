// Pure helpers for HERD MIND (majority-matching party game). No Firebase, no
// React — unit-tested in herdLogic.test.js.
//
// Round shape on Firebase (under games/{gameId}/round):
//   { phase: 'answering' | 'reveal',
//     promptIndex: number,          // index into seededShuffle(HERD_PROMPTS, deckSeed)
//     deckSeed: number,             // set once at match start; same order on every client
//     answers: { [uid]: string },   // plaintext; hidden by the UI until reveal
//     endsAt: epoch-ms,             // answering deadline (server-corrected clock)
//     scored: true }                // scores + cow applied once, idempotently
//
// Top-level keys on games/{gameId}:
//   scores/{uid}: number            // 1 point per winning-group member per round
//   herdCow: uid | null             // the Pink Cow holder — persists across rounds,
//                                   // so it lives OUTSIDE round and must be added to
//                                   // FIELD_NULLS in src/lib/games.js when registered.
//
// Scoring: every member of the largest normalized-answer group(s) scores 1 point;
// ties → ALL tied groups score. The Pink Cow goes to a player who is the ONLY
// singleton while everyone else grouped. The Cow holder cannot win the match.

import { seededShuffle } from './fibbageLogic'

// Points needed to win the match — but never while holding the Cow.
export const HERD_TARGET = 8

// Answering phase length (ms), measured on the server-corrected clock.
export const ANSWER_MS = 45000

export { seededShuffle }

// ---------------------------------------------------------------------------
// normalizeAnswer — the plural-folding normalizer every client groups with.
// Deterministic by construction: same input → same output everywhere.
// ---------------------------------------------------------------------------

// Lowercase → trim → strip punctuation → collapse whitespace → naive plural
// fold: drop ONE trailing 's' only when ALL guards pass:
//   1. the word does not end in 'ss'      ('chess', 'class', 'bus' stay whole —
//                                          a min-stem/vowel guard alone CANNOT
//                                          save 'chess': 'ches' is 4 chars with
//                                          a vowel, so the ss-guard is required)
//   2. the stem is at least 4 chars       ('bus'→'bu', 'lens'→'len' rejected)
//   3. the stem contains a vowel          ('rhythms' keeps its s)
// So 'tacos' == 'taco' but 'chess' != 'ches'. Exact heuristic is unit-tested
// and easy to tune (see docs/prds/herd-mind.md).
export function normalizeAnswer(answer) {
  let s = String(answer ?? '').toLowerCase().trim()
  s = s.replace(/[^\p{L}\p{N}\s]/gu, '') // strip punctuation (keep letters/digits/spaces)
  s = s.replace(/\s+/g, ' ').trim() // collapse whitespace runs
  if (s.endsWith('s') && !s.endsWith('ss')) {
    const stem = s.slice(0, -1)
    if (stem.length >= 4 && /[aeiou]/.test(stem)) s = stem
  }
  return s
}

// ---------------------------------------------------------------------------
// groupAnswers — exact-match grouping on the normalized form.
// answers: { [uid]: text }. Blank/whitespace answers are non-answers: excluded
// from grouping AND from cow logic (empty ≠ singleton).
// Returns [{ norm, members: [uid] }] sorted biggest-first; equal sizes break
// ties alphabetically by norm so EVERY client derives an identical order.
// Members are sorted lexicographically for the same reason.
// ---------------------------------------------------------------------------
export function groupAnswers(answers) {
  const byNorm = new Map()
  for (const [uid, text] of Object.entries(answers || {})) {
    const norm = normalizeAnswer(text)
    if (!norm) continue // non-answer
    if (!byNorm.has(norm)) byNorm.set(norm, [])
    byNorm.get(norm).push(uid)
  }
  return [...byNorm.entries()]
    .map(([norm, members]) => ({ norm, members: members.sort() }))
    .sort((a, b) => (b.members.length - a.members.length) || a.norm.localeCompare(b.norm))
}

// ---------------------------------------------------------------------------
// scoreGroups — every member of the largest group(s) gets 1 point.
// Ties at the top → all tied groups score. Groups of 1 never score, so an
// all-unique round scores nobody. Returns { pointUids: [uid] } (empty array
// when nobody scores).
// ---------------------------------------------------------------------------
export function scoreGroups(groups) {
  const max = groups?.[0]?.members.length ?? 0
  if (max < 2) return { pointUids: [] }
  const pointUids = []
  for (const g of groups || []) {
    if (g.members.length < max) break // sorted biggest-first
    pointUids.push(...g.members)
  }
  return { pointUids }
}

// ---------------------------------------------------------------------------
// nextCow — the Pink Cow matrix.
// The Cow transfers ONLY when exactly ONE player matched nobody (a single
// singleton while at least one real group exists). Otherwise it stays put:
//   * zero singletons (everyone matched)  → stays
//   * two or more singletons              → stays (rule requires EXACTLY one)
//   * all answers unique                  → stays (nobody "matched nobody alone")
// Non-answers never take the Cow: they are absent from `groups`, and the
// `answeredUids` check is a second defensive gate.
// Returns { cow: uid|null, transferred: boolean } — `transferred` is false when
// the sole singleton already held the Cow (they keep it).
// ---------------------------------------------------------------------------
export function nextCow(groups, currentCow = null, answeredUids = []) {
  const answered = answeredUids instanceof Set ? answeredUids : new Set(answeredUids || [])
  const singletons = (groups || []).filter(
    g => g.members.length === 1 && (!answered.size || answered.has(g.members[0])),
  )
  const hasGroup = (groups || []).some(g => g.members.length >= 2)
  if (singletons.length === 1 && hasGroup) {
    const uid = singletons[0].members[0]
    return { cow: uid, transferred: uid !== currentCow }
  }
  return { cow: currentCow ?? null, transferred: false }
}

// ---------------------------------------------------------------------------
// getMatchWinner — first player to reach `target` points WHILE NOT holding the
// Cow. Reaching 8 WITH the Cow blocks: play continues until they shed it.
// Iterates Object key order (stable insertion order; the host applies the win
// once via the standard finish flow, so ordering ambiguity never matters).
// Returns the winner uid or null.
// ---------------------------------------------------------------------------
export function getMatchWinner(scoresByUid, cowUid = null, target = HERD_TARGET) {
  for (const [uid, score] of Object.entries(scoresByUid || {})) {
    if (uid === cowUid) continue // can't win with the Cow
    if ((score || 0) >= target) return uid
  }
  return null
}

// ---------------------------------------------------------------------------
// Seat order — joinedAt ascending, playerId as stable tiebreaker (same rule as
// fibbageLogic/wavelengthLogic; kept local so this module is self-contained).
// ---------------------------------------------------------------------------
export function seatOrder(players) {
  return Object.values(players || {})
    .filter(Boolean)
    .sort((a, b) => (a.joinedAt - b.joinedAt) || String(a.playerId).localeCompare(String(b.playerId)))
    .map(p => p.playerId)
}

// True once every eligible seat has submitted a non-blank answer. Blank strings
// count as unanswered (defensive — the UI refuses to submit them anyway).
export function allAnswered(eligibleIds, answers) {
  const a = answers || {}
  return eligibleIds.length > 0 && eligibleIds.every(id => String(a[id] ?? '').trim() !== '')
}
