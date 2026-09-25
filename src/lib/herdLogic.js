// Pure helpers for HERD MIND (majority-matching party game). No Firebase, no
// React — unit-tested in herdLogic.test.js.
//
// Round shape on Firebase (under games/{gameId}/round):
//   { phase: 'answering' | 'reveal',
//     promptIndex: number,          // index into seededShuffle(HERD_PROMPTS, deckSeed)
//     deckSeed: number,             // set once at match start; same order on every client
//   answers: { [uid]: { commit } },// salted SHA-256 commitment — plaintext is
//                                   // tab-local until reveal (reveals/{uid})
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
import { matchKey } from './textMatchLogic'

// Points needed to win the match — but never while holding the Cow.
export const HERD_TARGET = 8

// Answering phase length (ms), measured on the server-corrected clock.
export const ANSWER_MS = 45000

export { seededShuffle }

// ---------------------------------------------------------------------------
// normalizeAnswer — the grouping key every client groups with. Delegates to the
// shared textMatchLogic.matchKey so answers players would call "the same" land
// in one group: case, accents, punctuation, a leading article, "&" → "and",
// spaces/hyphens and English plurals (dogs, cherries, tomatoes, glasses) all
// fold. Deterministic by construction: same input → same key everywhere.
// The key is for comparison only — never display it (see groupAnswers.display).
// ---------------------------------------------------------------------------
export function normalizeAnswer(answer) {
  return matchKey(answer)
}

// How a raw answer counts as "the same spelling" when picking what to display:
// trimmed, whitespace collapsed, case-insensitive.
function spellingKey(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

// The spelling to show for a group: the most common raw spelling among its
// answers; ties go to the spelling submitted first. `texts` is in submission
// order.
export function displaySpelling(texts) {
  const counts = new Map()
  const firstSeen = new Map()
  texts.forEach((t, i) => {
    const k = spellingKey(t)
    if (!k) return
    counts.set(k, (counts.get(k) || 0) + 1)
    if (!firstSeen.has(k)) firstSeen.set(k, { i, text: String(t).trim().replace(/\s+/g, ' ') })
  })
  let best = null
  for (const [k, n] of counts) {
    const cand = { n, ...firstSeen.get(k) }
    if (!best || cand.n > best.n || (cand.n === best.n && cand.i < best.i)) best = cand
  }
  return best ? best.text : ''
}

// ---------------------------------------------------------------------------
// groupAnswers — exact-match grouping on the normalized key.
// answers: { [uid]: text }. Blank/whitespace answers are non-answers: excluded
// from grouping AND from cow logic (empty ≠ singleton).
// submitOrder (optional): uids in the order they answered — decides which
// spelling a group displays on a tie. Uids not listed follow in key order.
// Returns [{ norm, display, members: [uid] }] sorted biggest-first; equal sizes
// break ties alphabetically by norm so EVERY client derives an identical order.
// Members are sorted lexicographically for the same reason.
// ---------------------------------------------------------------------------
export function groupAnswers(answers, submitOrder = null) {
  const entries = Object.entries(answers || {})
  if (Array.isArray(submitOrder) && submitOrder.length) {
    const rank = new Map(submitOrder.map((uid, i) => [uid, i]))
    const at = uid => (rank.has(uid) ? rank.get(uid) : submitOrder.length)
    entries.sort((a, b) => at(a[0]) - at(b[0]))
  }
  const byNorm = new Map()
  for (const [uid, text] of entries) {
    const norm = normalizeAnswer(text)
    if (!norm) continue // non-answer
    if (!byNorm.has(norm)) byNorm.set(norm, { members: [], texts: [] })
    const g = byNorm.get(norm)
    g.members.push(uid)
    g.texts.push(text)
  }
  return [...byNorm.entries()]
    .map(([norm, g]) => ({ norm, display: displaySpelling(g.texts), members: g.members.sort() }))
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

// ---------------------------------------------------------------------------
// Commit-reveal (anti-peek): during 'answering' clients publish only
// answers/{uid} = { commit } — a salted SHA-256 of the answer, so a player
// watching network traffic learns nothing until the phase flips. At reveal,
// each client publishes its own { text, salt } to reveals/{uid}; scoring runs
// after a short grace so slow/tab-closed players simply count as non-answers.
// ---------------------------------------------------------------------------

// How long after the reveal opens clients may still publish their plaintext.
export const REVEAL_GRACE_MS = 4000

// True once every eligible seat holds a commitment ({ commit }) — or a legacy
// plaintext string, so rounds written before commit-reveal still resolve.
export function allCommitted(eligibleIds, answers) {
  const a = answers || {}
  return eligibleIds.length > 0 &&
    eligibleIds.every(id => !!a[id] && (!!a[id].commit || typeof a[id] === 'string'))
}

// Derive the scorable text per uid from reveals + verification results. Only
// uids whose reveal VERIFIED against their commitment (verifiedUids — the
// async sha check lives in the caller via commit.verifyReveal) contribute,
// and blanks are dropped like any other non-answer.
export function collectRevealedTexts(reveals, verifiedUids) {
  const ok = verifiedUids instanceof Set ? verifiedUids : new Set(verifiedUids || [])
  const out = {}
  for (const [uid, rev] of Object.entries(reveals || {})) {
    if (!ok.has(uid)) continue
    const text = String(rev?.text ?? '').trim()
    if (text) out[uid] = text
  }
  return out
}
