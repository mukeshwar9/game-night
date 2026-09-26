// SPYFAIR rules — shared by the live room (SpyfairGame.jsx) and the solo bot
// demo (SpyfairDemo.jsx) so the two can't drift: dealing (spy + location +
// roles), the vote tally, round scoring and the match winner all live here.
//
// Pure — no DOM/Firebase/React. Randomness comes in through an `rng`
// parameter (default Math.random); the live dealer's picks must stay secret,
// so they are never derived from a seed other clients could reproduce.
import { SPYFAIR_LOCATIONS } from './decks/spyfair'
import { avoidList, normalizeSeen } from './seenHistory'

export const SPYFAIR_MIN_PLAYERS = 3
// First to this many round points wins the match.
export const SPYFAIR_MATCH_WINS = 3
// Out-of-band questioning time in the live room, before the timer scale.
export const SPYFAIR_QUESTION_SECONDS = 240
// Room seen-history key: `games/{id}/seen/spyfair`.
export const SPYFAIR_SEEN_KEY = 'spyfair'

/**
 * Seat order is stable: players sorted by joinedAt, then playerId as a
 * tiebreak. Returns the player objects.
 */
export function seatOrder(players) {
  return Object.values(players || {})
    .filter(p => p && p.playerId)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.playerId).localeCompare(String(b.playerId)))
}

// Firebase strips empty maps — `votes` reads back undefined until the first vote.
export function normalizeVotes(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  for (const [voter, accused] of Object.entries(raw)) {
    if (accused) out[voter] = accused
  }
  return out
}

/**
 * Tally votes: the most-accused playerId, its count, and whether the top spot
 * is tied (a tie means nobody is convicted).
 */
export function tallyVotes(votes) {
  const counts = {}
  for (const accused of Object.values(votes || {})) {
    if (!accused) continue
    counts[accused] = (counts[accused] || 0) + 1
  }
  let top = null
  let topCount = 0
  let tied = false
  for (const [pid, n] of Object.entries(counts)) {
    if (n > topCount) { top = pid; topCount = n; tied = false }
    else if (n === topCount) { tied = true }
  }
  return { top, topCount, tied }
}

/**
 * The spy is caught only if the group lands a clear (untied) plurality on
 * them. `accused` is null when the vote tied or nobody voted.
 */
export function resolveVote(votes, spyId) {
  const { top, tied } = tallyVotes(votes)
  const spyCaught = !!spyId && !tied && top === spyId
  return { accused: tied ? null : top, spyCaught, spyWon: !spyCaught }
}

/**
 * Round scoring: the spy scores 1 on escape; otherwise every non-spy
 * participant scores 1. Returns a new scores map.
 */
export function scoreRound(scores, participantIds, spyId, spyWon) {
  const next = { ...(scores || {}) }
  if (spyWon) {
    if (spyId) next[spyId] = (next[spyId] || 0) + 1
  } else {
    for (const id of participantIds) {
      if (id === spyId) continue
      next[id] = (next[id] || 0) + 1
    }
  }
  return next
}

/**
 * Everyone who has reached SPYFAIR_MATCH_WINS, in `ids` order. A round can
 * push several players over the line at once — that is a shared victory.
 */
export function matchWinners(ids, scores) {
  return (ids || []).filter(id => (scores?.[id] || 0) >= SPYFAIR_MATCH_WINS)
}

/**
 * The vote resolves on its own once every online seat has voted, with at least
 * two votes cast — a lone survivor of a presence blip can't decide the round
 * alone (the coordinator's RESOLVE VOTE NOW covers that deliberately).
 * `seats` are player objects with `online` presence.
 */
export function allOnlineVoted(seats, votes) {
  const v = votes || {}
  const online = (seats || []).filter(p => p.online !== false)
  return online.length > 0 &&
    online.every(p => v[p.playerId]) &&
    Object.keys(v).length >= 2
}

/**
 * Pick this round's location: never the previous round's, and nothing the room
 * has seen recently (`seen` = the room's seen-history map), falling back to the
 * least recently seen half once the deck is exhausted.
 */
export function pickLocationIndex(seen, prevIndex = null, rng = Math.random) {
  const n = SPYFAIR_LOCATIONS.length
  if (n <= 1) return 0
  const exclude = prevIndex != null && prevIndex >= 0 ? [prevIndex] : []
  const avoid = new Set([...avoidList(n, normalizeSeen(seen), 1, exclude), ...exclude])
  let pool = SPYFAIR_LOCATIONS.map((_, i) => i).filter(i => !avoid.has(i))
  if (pool.length === 0) pool = SPYFAIR_LOCATIONS.map((_, i) => i).filter(i => !exclude.includes(i))
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]
}

// Unbiased Fisher–Yates with an injected rng.
function shuffle(arr, rng) {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Deal roles: one spy (`forcedSpyId` when given and seated — see pickSpy —
 * else random), and every other id a role from the location (roles repeat
 * only if there are more players than roles).
 *
 * @returns {{ spyId: string|null, roles: Record<string, string|null> }} —
 *   the spy's role is null.
 */
export function assignRoles(ids, locationIndex, rng = Math.random, forcedSpyId = null) {
  const list = [...(ids || [])]
  if (list.length === 0) return { spyId: null, roles: {} }
  const loc = SPYFAIR_LOCATIONS[locationIndex] || SPYFAIR_LOCATIONS[0]
  const spyIdx = Math.floor(rng() * list.length)
  const spyId = forcedSpyId != null && list.includes(forcedSpyId)
    ? forcedSpyId
    : list[Math.min(spyIdx, list.length - 1)]
  const rolePool = shuffle(loc.roles, rng)
  const roles = {}
  let r = 0
  for (const id of list) {
    if (id === spyId) { roles[id] = null; continue }
    roles[id] = rolePool[r % rolePool.length] || 'Local'
    r++
  }
  return { spyId, roles }
}

// ---------------------------------------------------------------------------
// Spy rotation. The room remembers who has been spy this cycle
// (`games/{id}/spyfairRotation: { spied: [uid…], last: uid }`, written only at
// the RESULT, when that round's spy is public anyway). A strict bag ("everyone
// once before anyone twice") would make the last spy of every cycle a
// certainty anyone could work out from earlier results, so the rotation is
// weighted instead: nobody is spy twice in a row (3+ players), and a player
// who hasn't been spy this cycle is SPYFAIR_FRESH_SPY_WEIGHT× as likely as
// one who has. The spy is never a sure thing.
// ---------------------------------------------------------------------------
export const SPYFAIR_FRESH_SPY_WEIGHT = 3

// Firebase returns a list as an array or a numeric-keyed object (and drops it
// when empty) — read it back as a plain array in index order.
export function normalizeSpied(raw) {
  if (!raw || typeof raw !== 'object') return []
  if (Array.isArray(raw)) return raw.filter(v => typeof v === 'string' && v)
  return Object.keys(raw)
    .filter(k => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b))
    .map(k => raw[k])
    .filter(v => typeof v === 'string' && v)
}

/**
 * Pick this round's spy from `ids` given the room rotation
 * (`{ spied, last }`). Weighted — see the note above.
 */
export function pickSpy(ids, rotation, rng = Math.random) {
  const list = [...new Set((ids || []).filter(Boolean))]
  if (list.length === 0) return null
  const last = rotation?.last ?? null
  const spied = normalizeSpied(rotation?.spied).filter(id => list.includes(id))
  const eligible = list.length >= 3 ? list.filter(id => id !== last) : list
  const anyFresh = eligible.some(id => !spied.includes(id))
  const weights = eligible.map(id => (anyFresh && !spied.includes(id) ? SPYFAIR_FRESH_SPY_WEIGHT : 1))
  const total = weights.reduce((a, b) => a + b, 0)
  let roll = rng() * total
  for (let i = 0; i < eligible.length; i++) {
    roll -= weights[i]
    if (roll < 0) return eligible[i]
  }
  return eligible[eligible.length - 1]
}

/**
 * The rotation after `spyId`'s round (call once the spy is public). The cycle
 * restarts once every seated id has been spy.
 */
export function recordSpy(rotation, ids, spyId) {
  const list = (ids || []).filter(Boolean)
  const spied = normalizeSpied(rotation?.spied).filter(id => list.includes(id))
  if (!spyId) return { spied, last: rotation?.last ?? null }
  const next = spied.includes(spyId) ? spied : [...spied, spyId]
  const full = list.length > 0 && list.every(id => next.includes(id))
  return { spied: full ? [] : next, last: spyId }
}

// ---------------------------------------------------------------------------
// The spy's location guess. Once per round, during questioning or the vote,
// the spy may name the location: right wins the round for the spy, wrong
// loses it (every non-spy scores). Guessing ends the round at once — the spy
// has declared themselves, which is exactly what the rules announce.
// ---------------------------------------------------------------------------

/** Normalize `round.spyGuess` ({ by, index }) or null when absent/malformed. */
export function normalizeSpyGuess(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.by !== 'string' || !raw.by) return null
  const index = Number(raw.index)
  if (!Number.isInteger(index) || index < 0 || index >= SPYFAIR_LOCATIONS.length) return null
  return { by: raw.by, index }
}

/**
 * Resolve a round that ended on a spy guess. A guess by anyone other than the
 * real spy is invalid (only a tampered client can send one) → `valid: false`.
 */
export function resolveSpyGuess(guess, spyId, locationIndex) {
  const g = normalizeSpyGuess(guess)
  if (!g || !spyId || g.by !== spyId || locationIndex == null) return { valid: false, spyWon: null, outcome: null }
  const spyWon = g.index === locationIndex
  return { valid: true, spyWon, outcome: spyWon ? 'guessed' : 'wrongGuess' }
}

// ---------------------------------------------------------------------------
// Sealed deal (live room). Each participant's role is sealed to their own key
// (src/lib/sealed.js) as one of these plaintexts; sealed.js pads them to one
// length, so ciphertext size can't pick out the spy.
// ---------------------------------------------------------------------------
export const SPYFAIR_PAYLOAD_SPY = 'SPY'
const LOC_PREFIX = 'LOC:'

/** AAD binding a sealed entry to its round and seat (no replay across either). */
export const sealAad = (roundId, uid) => `spyfair|${roundId}|${uid}`

/** The plaintext sealed to `uid`: 'SPY', or `LOC:<index>|<role>`. */
export function spyfairPayload(uid, deal) {
  if (uid === deal?.spyId) return SPYFAIR_PAYLOAD_SPY
  return `${LOC_PREFIX}${deal?.locationIndex}|${deal?.roles?.[uid] || 'Local'}`
}

/**
 * @returns {{ spy: true } | { spy: false, locationIndex: number, role: string } | null}
 *   null for anything malformed (or a location index outside the deck).
 */
export function parseSpyfairPayload(text) {
  if (text === SPYFAIR_PAYLOAD_SPY) return { spy: true }
  if (typeof text !== 'string' || !text.startsWith(LOC_PREFIX)) return null
  const body = text.slice(LOC_PREFIX.length)
  const bar = body.indexOf('|')
  if (bar === -1) return null
  const locationIndex = Number(body.slice(0, bar))
  if (!Number.isInteger(locationIndex) || locationIndex < 0 || locationIndex >= SPYFAIR_LOCATIONS.length) return null
  return { spy: false, locationIndex, role: body.slice(bar + 1) || 'Local' }
}

/**
 * Read the deal back from opened entries (`{ [uid]: parsed payload | null }`)
 * at the reveal. The spy is the entry that says SPY — or, if exactly one
 * participant's entry couldn't be opened (their key never got published) and
 * every opened entry is a location, that participant by elimination.
 * `consistent` is false when entries contradict each other (two spies, two
 * locations): a dealer that tampered with the deal.
 *
 * @returns {{ spyId: string|null, locationIndex: number|null, consistent: boolean, complete: boolean }}
 */
export function readSpyfairDeal(opened, participants = []) {
  let spyId = null
  let locationIndex = null
  let consistent = true
  const openedIds = []
  for (const [id, p] of Object.entries(opened || {})) {
    if (!p) continue
    openedIds.push(id)
    if (p.spy) {
      if (spyId && spyId !== id) consistent = false
      spyId = spyId || id
    } else {
      if (locationIndex != null && locationIndex !== p.locationIndex) consistent = false
      locationIndex = locationIndex ?? p.locationIndex
    }
  }
  if (!spyId) {
    const unopened = (participants || []).filter(id => !openedIds.includes(id))
    if (unopened.length === 1) spyId = unopened[0]
  }
  return { spyId, locationIndex, consistent, complete: spyId != null && locationIndex != null }
}

/**
 * Rounds dealt before sealing kept each role in plaintext `round.private`
 * ({ role: 'SPY'|<role>, location: <name> }). Map them to parsed payloads so
 * a round already in progress when this ships still plays out.
 */
export function legacyOpened(privates) {
  const out = {}
  for (const [uid, v] of Object.entries(privates || {})) {
    if (!v) continue
    if (v.role === 'SPY') { out[uid] = { spy: true }; continue }
    const locationIndex = SPYFAIR_LOCATIONS.findIndex(l => l.name === v.location)
    out[uid] = locationIndex >= 0 ? { spy: false, locationIndex, role: v.role || 'Local' } : null
  }
  return out
}

/**
 * The pre-sealing round shape (plaintext `round.private`): each player's
 * `{ role, location }`, the spy with role 'SPY' and no location. Kept for
 * tests and legacy reads; the live room now seals these instead.
 */
export function privatesFromRoles(roles, spyId, locationIndex) {
  const loc = SPYFAIR_LOCATIONS[locationIndex] || SPYFAIR_LOCATIONS[0]
  const out = {}
  for (const [id, role] of Object.entries(roles || {})) {
    out[id] = id === spyId ? { role: 'SPY', location: '' } : { role: role || 'Local', location: loc.name }
  }
  return out
}

/** The spy's playerId from the private map (role === 'SPY'), or null. */
export function findSpy(privates) {
  for (const [pid, v] of Object.entries(privates || {})) {
    if (v && v.role === 'SPY') return pid
  }
  return null
}

/**
 * Recover the location index from a non-spy's private entry — the result
 * screen's fallback when the dealer lost the committed salt (reload).
 */
export function recoverLocationIndex(privates) {
  const name = Object.values(privates || {}).map(x => x?.location).find(Boolean)
  const idx = SPYFAIR_LOCATIONS.findIndex(l => l.name === name)
  return idx >= 0 ? idx : null
}
