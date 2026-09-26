// Pure helpers for FIBBAGE (lie & vote). No Firebase, no React — unit-tested.
//
// Round shape on Firebase (under games/{gameId}/round):
//   { phase:'lying'|'voting'|'reveal',
//     promptIndex: number,                      // deck index = order[num]
//     num: number, order: [deckIndex],          // match position + drawn order (see
//                                               // "Match structure" below)
//     lieStartedAt / voteStartedAt: epoch-ms,   // phase starts; deadlines derive from
//                                               // these × the room timerScale
//     closedAt: epoch-ms,                       // lying closed early (deadline/manual):
//                                               // everyone drops their ballot sub now
//     revealDeadline: epoch-ms,                 // fixed grace for author reveals
//     lies:    { [playerId]: { hash } },        // salted SHA-256 commitment ONLY
//     subs:    { [randomKey]: text },           // anonymised plaintext lies used
//                                               // to build the ballot — deleted the
//                                               // instant `options` is published
//     options: [{ id, text }],                  // shuffled ballot: truth + lies mixed,
//                                               // NO author + NO truth marker (see
//                                               // buildOptions). Indistinguishable ids.
//     votes:   { [playerId]: optionId },
//     reveals: { [playerId]: { text, salt } },  // author->lie map — ONLY written at
//                                               // the reveal phase (never during voting)
//     cheats:  { [playerId]: true },            // reveal failed commitment verification
//     deltas:  { [playerId]: points },          // this prompt's (multiplied) scores
//     scored:  true }                           // scores applied once, idempotently
//
// INFO-LEAK MODEL (why the shapes above are the way they are):
//   * During `voting` the DB must expose the ballot texts (you vote on them) but must
//     NOT expose (1) who wrote each lie or (2) which option is the truth. So `options`
//     carries neither an author (`by`) nor a truth flag, and the author->lie map
//     (`reveals`) is withheld until the `reveal` phase. `subs` is anonymous (random
//     keys, no playerId) and is deleted the moment the ballot is built, so authorship
//     and truth-by-elimination can't be recovered from public state during voting.
//   * RESIDUAL, UNFIXABLE LEAK: the real answer ships in the client bundle
//     (FIBBAGE_FACTS[promptIndex].answer) and promptIndex is public, so a determined
//     player who inspects the JS bundle can always derive the truth. Closing this would
//     require a trusted server to hold the answer — impossible in this serverless,
//     world-readable-node architecture. We only defend against CASUAL/spectator leakage
//     (reading a single Firebase field). See buildOptions / attributeOptions.
//
// Scoring:
//   POINTS_FOR_TRUTH per player who picks the real answer
//   POINTS_PER_FOOL  per player your lie fools (voted for your option)
//   × FINAL_MULTIPLIER on the last prompt of the match (catch-up)

import { pickFresh } from './seenHistory'
import { scaledMs } from './timerScale'
import { normalizeList } from './normalize'

export const POINTS_FOR_TRUTH = 1000
export const POINTS_PER_FOOL = 500

const norm = (s) => String(s ?? '').trim().toLowerCase()

// Seat order is derived from joinedAt (earliest first), tie-broken by playerId
// for a stable, deterministic order across all clients.
export function seatOrder(players) {
  return Object.values(players || {})
    .filter(Boolean)
    .sort((a, b) => (a.joinedAt - b.joinedAt) || String(a.playerId).localeCompare(String(b.playerId)))
    .map(p => p.playerId)
}

// Deterministic 32-bit string hash → used to seed shuffles so the ballot order is
// reproducible/testable.
export function hashString(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Mulberry32 PRNG — small, fast, deterministic from a numeric seed.
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A seeded () => [0, 1) generator, for picks every client (or a replay) must
// reproduce from the stored seed.
export function seededRng(seed) {
  return mulberry32(seed)
}

// Fisher-Yates shuffle driven by a deterministic seed. Returns a new array.
export function seededShuffle(arr, seed) {
  const out = [...arr]
  const rand = mulberry32(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Normalize an "object that might be a Firebase numeric-keyed object or absent"
// into a plain object. Firebase deletes empty objects, so reads may be null.
export function normalizeMap(raw) {
  if (!raw) return {}
  return { ...raw }
}

// Build the ANONYMISED voting ballot from the real answer + the pool of plaintext
// lies (`texts`, an array — the values of the anonymous `subs` node).
//
// The returned options are deliberately indistinguishable:
//   - the truth is mixed in as just another `{ id, text }` (NO truth flag), and
//   - NO `by`/author field is attached.
// Ids are positional (`opt-N`) AFTER the shuffle, so the id encodes only a random
// ballot position and never who wrote the option or whether it's the truth.
//
// Duplicate lies (case-insensitive) collapse to a single option; a lie equal to the
// truth is dropped (its author earns no credit and it must not duplicate the truth).
// Authorship + truth are recovered separately at reveal time via attributeOptions().
export function buildOptions(answer, texts, seed) {
  const truthNorm = norm(answer)
  const seen = new Set([truthNorm])
  const items = [String(answer).trim()] // truth is one of the items; the shuffle hides it
  for (const t of texts || []) {
    const k = norm(t)
    if (!k || seen.has(k)) continue
    seen.add(k)
    items.push(String(t).trim())
  }
  return seededShuffle(items, seed).map((text, i) => ({ id: `opt-${i}`, text }))
}

// Recover the answer key from the anonymised ballot at REVEAL time.
// Given the public `options`, the true `answer`, and the verified author->lie map
// `revealedLies` ({ [playerId]: text }), returns rich options
//   [{ id, text, by }]
// where the truth option has `by: null` and each lie option has `by: [playerId, …]`.
// This is the shape scoreRound() consumes. Matching is by normalized text, so merged
// duplicate lies credit every author and a lie that equals the truth earns nobody.
export function attributeOptions(options, answer, revealedLies) {
  const truthNorm = norm(answer)
  const authorsByText = new Map()
  for (const [pid, text] of Object.entries(revealedLies || {})) {
    const k = norm(text)
    if (!k || k === truthNorm) continue // a lie equal to the truth earns no credit
    if (!authorsByText.has(k)) authorsByText.set(k, [])
    authorsByText.get(k).push(pid)
  }
  return (options || []).map(o => {
    const k = norm(o.text)
    if (k === truthNorm) return { ...o, by: null }
    return { ...o, by: authorsByText.get(k) || [] }
  })
}

// Compute per-player score deltas for a completed round.
// options: rich options from attributeOptions (truth has by === null).
// votes: { [voterId]: optionId }. Entries that resolve to 0 are omitted.
export function scoreRound(options, votes) {
  const deltas = {}
  const add = (id, pts) => { deltas[id] = (deltas[id] || 0) + pts }

  const byOption = new Map((options || []).map(o => [o.id, o]))

  for (const [voterId, optionId] of Object.entries(votes || {})) {
    const opt = byOption.get(optionId)
    if (!opt) continue
    if (opt.by === null) {
      // Voter found the truth.
      add(voterId, POINTS_FOR_TRUTH)
    } else {
      // Voter was fooled — credit every author of this (possibly merged) lie,
      // but never let a player score for being fooled by their own lie.
      const authors = Array.isArray(opt.by) ? opt.by : [opt.by]
      for (const authorId of authors) {
        if (authorId !== voterId) add(authorId, POINTS_PER_FOOL)
      }
    }
  }

  return deltas
}

// True once every eligible player who can vote has voted.
// eligibleIds = seat order of connected players.
export function allVoted(eligibleIds, votes) {
  const v = votes || {}
  return eligibleIds.length > 0 && eligibleIds.every(id => v[id] != null)
}

// True once every eligible player has submitted a lie.
export function allLied(eligibleIds, lies) {
  const l = lies || {}
  return eligibleIds.length > 0 && eligibleIds.every(id => l[id] != null)
}

// True once every eligible player has published their reveal (author->lie) at the
// reveal phase — the gate the host waits on before verifying + scoring.
export function allRevealed(eligibleIds, reveals) {
  const r = reveals || {}
  return eligibleIds.length > 0 && eligibleIds.every(id => r[id] != null)
}

// ---------------------------------------------------------------------------
// Match structure (fixed length, catch-up final) + deck order.
//
// A match is MATCH_PROMPTS prompts. Their order is drawn once per match by the
// coordinator (drawPromptOrder, seeded, avoiding the room's `seen/fibbage`
// history from src/lib/seenHistory.js) and stored as round.order, with
// round.num = 0-based position and round.promptIndex = order[num] (the deck
// index, kept so session keys and ballot seeds are unchanged). Every client
// reads the stored order, so nobody has to recompute it.
// ---------------------------------------------------------------------------

export const MATCH_PROMPTS = 5

// The final prompt is worth double — the cheap catch-up that keeps a trailing
// player in it until the end.
export const FINAL_MULTIPLIER = 2

// After the coordinator closes lying early (deadline / manual), how long players
// get to drop their anonymous ballot submission before the ballot is built.
export const SUB_GRACE_MS = 4000

export function drawPromptOrder(deckSize, seed, seen = null, n = MATCH_PROMPTS) {
  const rng = seededRng(seed >>> 0)
  const picks = []
  for (let k = 0; k < Math.min(Math.max(0, n), Math.max(0, deckSize)); k++) {
    picks.push(pickFresh(deckSize, seen, rng, picks))
  }
  return picks
}

// round.order read by key (Firebase may hand back a numeric-keyed object).
export function promptOrderOf(round, deckSize = Infinity) {
  return normalizeList(round?.order).filter(v => Number.isInteger(v) && v >= 0 && v < deckSize)
}

export function promptMultiplier(num, total = MATCH_PROMPTS) {
  return total > 0 && num === total - 1 ? FINAL_MULTIPLIER : 1
}

export function applyMultiplier(deltas, multiplier = 1) {
  const out = {}
  for (const [id, pts] of Object.entries(deltas || {})) out[id] = pts * multiplier
  return out
}

// What NEXT PROMPT does to the current round:
//   { finished: true }            — that was the last prompt of the order
//   { round: {...} }              — the next prompt's fresh round
//   { round: { phase: 'lying' } } — legacy round without an order: the
//                                   coordinator draws a fresh order next
export function nextPromptRound(round, deckSize, startedAt) {
  const order = promptOrderOf(round, deckSize)
  if (!order.length) return { round: { phase: 'lying' } }
  const next = (round?.num ?? 0) + 1
  if (next >= order.length) return { finished: true }
  return {
    round: {
      phase: 'lying',
      deckSeed: round?.deckSeed ?? null,
      order,
      num: next,
      promptIndex: order[next],
      lieStartedAt: startedAt ?? null,
    },
  }
}

// Phase deadline under the room timer scale (src/lib/timerScale.js). Prefers
// the phase's start stamp; a round that only carries a legacy absolute 1×
// deadline is converted back to its start first. null = no deadline.
export function phaseDeadline(startedAt, legacyDeadline, baseMs, timerScale) {
  const ms = scaledMs(baseMs, timerScale)
  if (ms == null) return null
  if (startedAt != null) return startedAt + ms
  if (legacyDeadline != null) return legacyDeadline - baseMs + ms
  return null
}

// Liars whose author→lie reveal hasn't landed yet — the only reveals scoring
// needs to wait for (a seat that never lied has nothing to reveal).
export function pendingLiars(lies, reveals) {
  const r = reveals || {}
  return Object.keys(lies || {}).filter(id => r[id] == null)
}

// Everyone tied on the top score (empty when nobody scored).
export function matchChampions(scores, seatIds) {
  const ids = seatIds || Object.keys(scores || {})
  const top = Math.max(0, ...ids.map(id => scores?.[id] || 0))
  if (top <= 0) return []
  return ids.filter(id => (scores?.[id] || 0) === top)
}
