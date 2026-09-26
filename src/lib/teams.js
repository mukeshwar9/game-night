// Team primitive for party games (Code Words first; any later team game can
// reuse it): assign seats to teams, keep them balanced as people join or
// leave, shuffle, and rotate a per-team role (spymaster, clue-giver…) or a
// per-room one (Just One's guesser).
//
// A team assignment is a plain `{ [uid]: teamId }` map so it can live in
// Firebase as-is. `order` is always the room's stable seat order (uids sorted
// by joinedAt) — every client passes the same order, so every client derives
// the same teams and the same next role holder.
//
// Pure — no DOM/Firebase/React. Randomness comes in through `rng`.

export const TEAM_IDS = ['A', 'B']

/** Keep only entries whose team is one of `teamIds` (Firebase may hand back junk). */
export function normalizeTeams(raw, teamIds = TEAM_IDS) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [uid, team] of Object.entries(raw)) {
    if (teamIds.includes(team)) out[uid] = team
  }
  return out
}

/** `{ [teamId]: count }` for the given assignment (only `teamIds` are counted). */
export function teamSizes(teams, teamIds = TEAM_IDS) {
  const sizes = Object.fromEntries(teamIds.map(t => [t, 0]))
  for (const team of Object.values(teams || {})) if (team in sizes) sizes[team]++
  return sizes
}

/** Members of `team`, in seat order. */
export function teamMembers(teams, team, order) {
  return (order || []).filter(uid => teams?.[uid] === team)
}

/** The other team of a two-team game. */
export function otherTeam(team, teamIds = TEAM_IDS) {
  return team === teamIds[0] ? teamIds[1] : teamIds[0]
}

const smallest = (sizes, teamIds) =>
  teamIds.reduce((best, t) => (sizes[t] < sizes[best] ? t : best), teamIds[0])
const largest = (sizes, teamIds) =>
  teamIds.reduce((best, t) => (sizes[t] > sizes[best] ? t : best), teamIds[0])

/**
 * Reconcile an assignment with the current seats: departed uids are dropped,
 * newcomers join the smallest team (ties go to the earlier team id), and if
 * the teams still differ by more than one, the latest-seated members of the
 * biggest team move to the smallest. Existing members otherwise stay put, so
 * a hand-tuned split survives a late joiner.
 */
export function balanceTeams(order, existing = {}, teamIds = TEAM_IDS) {
  const seats = [...(order || [])]
  const current = normalizeTeams(existing, teamIds)
  const out = {}
  for (const uid of seats) if (current[uid]) out[uid] = current[uid]
  for (const uid of seats) {
    if (out[uid]) continue
    out[uid] = smallest(teamSizes(out, teamIds), teamIds)
  }
  for (;;) {
    const sizes = teamSizes(out, teamIds)
    const big = largest(sizes, teamIds)
    const small = smallest(sizes, teamIds)
    if (sizes[big] - sizes[small] <= 1) break
    const mover = [...teamMembers(out, big, seats)].pop()
    out[mover] = small
  }
  return out
}

/** A fresh random balanced split (team sizes differ by at most one). */
export function shuffleTeams(order, teamIds = TEAM_IDS, rng = Math.random) {
  const seats = [...(order || [])]
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[seats[i], seats[j]] = [seats[j], seats[i]]
  }
  // Randomize which team gets the odd player too.
  const offset = Math.floor(rng() * teamIds.length) % teamIds.length
  const out = {}
  seats.forEach((uid, i) => { out[uid] = teamIds[(i + offset) % teamIds.length] })
  return out
}

/** Move one seat to `team` (a manual host swap). Returns a new map. */
export function moveToTeam(teams, uid, team) {
  return { ...(teams || {}), [uid]: team }
}

/** True when every team has at least `minPerTeam` members among `order`. */
export function teamsReady(teams, order, minPerTeam = 2, teamIds = TEAM_IDS) {
  return teamIds.every(t => teamMembers(teams, t, order).length >= minPerTeam)
}

/**
 * The next id after `current` in `order` that passes `isEligible`, wrapping
 * around. When `current` isn't in `order` (or is null) the search starts
 * from the top. Returns null if nobody is eligible. `current` itself is only
 * returned when it is the sole eligible id.
 */
export function nextInRotation(order, current, isEligible = () => true) {
  const list = [...(order || [])]
  if (list.length === 0) return null
  const start = list.indexOf(current)
  for (let step = 1; step <= list.length; step++) {
    const idx = start < 0 ? step - 1 : (start + step) % list.length
    if (isEligible(list[idx])) return list[idx]
  }
  return null
}

/**
 * One role holder per team (e.g. spymasters).
 *
 * @param {Record<string,string>} teams - `{ uid: teamId }`
 * @param {string[]} order - seat order
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.previous] - last holders `{ teamId: uid }`
 * @param {boolean} [opts.rotate=false] - true: hand the role to the next
 *   member after the previous holder; false: keep the previous holder when
 *   they're still on the team and eligible.
 * @param {(uid: string) => boolean} [opts.isEligible] - e.g. online players only;
 *   falls back to any member when nobody on the team is eligible.
 * @returns {Record<string,string|null>} `{ teamId: uid|null }`
 */
export function pickRoleHolders(teams, order, { previous = {}, rotate = false, isEligible = () => true } = {}, teamIds = TEAM_IDS) {
  const out = {}
  for (const team of teamIds) {
    const members = teamMembers(teams, team, order)
    const prev = previous?.[team]
    const prevIsMember = members.includes(prev)
    if (!rotate && prevIsMember && isEligible(prev)) { out[team] = prev; continue }
    // Rotating, or the previous holder left / went offline: the next eligible
    // member after them (from the top when there was no previous holder).
    const pick = nextInRotation(members, prevIsMember ? prev : null, isEligible)
    out[team] = pick ?? members[0] ?? null
  }
  return out
}
