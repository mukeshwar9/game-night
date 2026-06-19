// Pure helpers for FIBBAGE (lie & vote). No Firebase, no React — unit-tested.
// Round shape on Firebase (under games/{gameId}/round):
//   { phase:'lying'|'voting'|'reveal',
//     promptIndex: number,
//     lies:    { [playerId]: text },          // submitted fake answers
//     options: [{ id, text, by }],            // shuffled real + fakes (by=null for truth)
//     votes:   { [playerId]: optionId } }
//
// Scoring:
//   POINTS_FOR_TRUTH per player who picks the real answer
//   POINTS_PER_FOOL  per player your lie fools (voted for your option)

export const POINTS_FOR_TRUTH = 1000
export const POINTS_PER_FOOL = 500
export const TRUTH_ID = 'truth'

// Seat order is derived from joinedAt (earliest first), tie-broken by playerId
// for a stable, deterministic order across all clients.
export function seatOrder(players) {
  return Object.values(players || {})
    .filter(Boolean)
    .sort((a, b) => (a.joinedAt - b.joinedAt) || String(a.playerId).localeCompare(String(b.playerId)))
    .map(p => p.playerId)
}

// Deterministic 32-bit string hash → used to seed shuffles so every client
// orders options identically without extra Firebase writes.
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

// Build the voting options from the real answer + submitted lies.
// Duplicate lies (case-insensitive match to the truth or to each other) are
// merged so two players who happen to write the same text share one option and
// both get fooler credit. The list is deterministically shuffled by `seed`.
// Returns [{ id, text, by }] where `by` is the playerId who wrote a lie, or
// null for the truth. Merged-lie options keep `by` as an array of playerIds.
export function buildOptions(answer, lies, seed) {
  const norm = (s) => String(s).trim().toLowerCase()
  const truthNorm = norm(answer)

  // Group lies by normalized text; drop any lie identical to the truth
  // (its author gets no credit and it must not duplicate the truth option).
  const groups = new Map()
  for (const [playerId, text] of Object.entries(lies || {})) {
    const key = norm(text)
    if (!key || key === truthNorm) continue
    if (!groups.has(key)) groups.set(key, { text: String(text).trim(), by: [] })
    groups.get(key).by.push(playerId)
  }

  const options = [{ id: TRUTH_ID, text: String(answer), by: null }]
  let i = 0
  for (const { text, by } of groups.values()) {
    options.push({ id: `lie-${i++}`, text, by })
  }

  return seededShuffle(options, seed)
}

// Compute per-player score deltas for a completed round.
// votes: { [voterId]: optionId }, options from buildOptions.
// Returns { [playerId]: deltaPoints } including 0 entries are omitted.
export function scoreRound(options, votes) {
  const deltas = {}
  const add = (id, pts) => { deltas[id] = (deltas[id] || 0) + pts }

  const byOption = new Map(options.map(o => [o.id, o]))

  for (const [voterId, optionId] of Object.entries(votes || {})) {
    const opt = byOption.get(optionId)
    if (!opt) continue
    if (opt.id === TRUTH_ID || opt.by === null) {
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

// True once every non-author player who can vote has voted.
// A player may not vote for their own lie, but everyone (including lie authors)
// must cast a vote. eligibleIds = seat order of connected players.
export function allVoted(eligibleIds, votes) {
  const v = votes || {}
  return eligibleIds.length > 0 && eligibleIds.every(id => v[id] != null)
}

// True once every eligible player has submitted a lie.
export function allLied(eligibleIds, lies) {
  const l = lies || {}
  return eligibleIds.length > 0 && eligibleIds.every(id => l[id] != null)
}
