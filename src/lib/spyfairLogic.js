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
 * Deal roles: one random spy, and every other id a role from the location
 * (roles repeat only if there are more players than roles).
 *
 * @returns {{ spyId: string|null, roles: Record<string, string|null> }} —
 *   the spy's role is null.
 */
export function assignRoles(ids, locationIndex, rng = Math.random) {
  const list = [...(ids || [])]
  if (list.length === 0) return { spyId: null, roles: {} }
  const loc = SPYFAIR_LOCATIONS[locationIndex] || SPYFAIR_LOCATIONS[0]
  const spyIdx = Math.floor(rng() * list.length)
  const spyId = list[Math.min(spyIdx, list.length - 1)]
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

/**
 * The live room's per-player private map: each player sees only their own
 * `{ role, location }` — the spy gets role 'SPY' and no location.
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
