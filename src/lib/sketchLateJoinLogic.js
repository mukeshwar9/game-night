// @ts-check
// SKETCH join mid-match (S10): a visitor taps JOIN while a match is playing,
// takes their own seat, guesses from the next round and draws from the next
// cycle. Pure: no DOM, Firebase or React; unit-tested in
// sketchLateJoinLogic.test.js.
//
// No new room keys: a late joiner is "seated but not in the round's `order`".
// They take part in a round when they were seated before it started
// (`players/{uid}/joinedAt` ≤ `round.startedAt`, both server time). At each
// cycle wrap, seated players not yet in `order` are appended, so they draw
// once in every remaining cycle. Growing the order needs the match's cycle
// count in the round (`round.cycles`, S2): without it the order stays fixed
// and they only guess (cyclesFor would otherwise change the match length).

/** Seated uids (party rooms key players by uid). */
function seated(players) {
  return Object.entries(players || {})
    .filter(([, p]) => p && typeof p === 'object' && p.playerId)
    .map(([id]) => id)
}

/**
 * Seated players outside the drawing order who were seated before this round
 * started, so they guess (and score) in it. Rounds without `startedAt` (an
 * older coordinator) have none: today's behaviour.
 * @returns {string[]}
 */
export function lateGuessers(round, players) {
  const startedAt = round?.startedAt
  if (!Number.isFinite(startedAt)) return []
  const order = new Set(round?.order || [])
  return seated(players).filter(id => {
    if (order.has(id) || id === round?.artist) return false
    const at = players[id]?.joinedAt
    return Number.isFinite(at) && at <= startedAt
  })
}

/** Everyone who guesses this round: the order minus the artist, plus eligible late joiners. */
export function roundGuessers(round, players) {
  const base = (round?.order || []).filter(id => id !== round?.artist)
  return [...base, ...lateGuessers(round, players)]
}

/** Seated players not in the drawing order (late joiners, or offline at START). */
export function outsideOrder(round, players) {
  const order = new Set(round?.order || [])
  return seated(players).filter(id => !order.has(id))
}

/**
 * The order for the next cycle: today's order with seated players not yet in
 * it appended, in join order — only when the match's cycle count is stored,
 * and only players who are online (an offline seat would stall a turn).
 * @returns {string[]}
 */
export function orderAtWrap(round, players) {
  const order = round?.order || []
  if (!Number.isInteger(round?.cycles)) return order
  const extra = outsideOrder(round, players)
    .filter(id => players[id]?.online !== false)
    .sort((a, b) => (players[a]?.joinedAt ?? 0) - (players[b]?.joinedAt ?? 0) || (a < b ? -1 : 1))
  return extra.length ? [...order, ...extra] : order
}

/** Server time the match started, read from its seed ("<ms>:<random>"), or null. */
export function matchStartedAt(round) {
  const n = Number(String(round?.matchSeed ?? '').split(':')[0])
  return Number.isFinite(n) && n > 0 ? n : null
}

/** True for a player who took their seat after the match started (podium tag). */
export function joinedLate(round, player) {
  const start = matchStartedAt(round)
  return start != null && Number.isFinite(player?.joinedAt) && player.joinedAt > start
}

/**
 * What a seated player who isn't in this round sees instead of the guess box,
 * or null when they're playing it.
 *   cycle/cycles: the round's; canGrow: the round stores its cycle count.
 */
export function lateJoinNotice({ cycle, cycles, canGrow }) {
  if (!canGrow) return "YOU'RE IN · You guess from the next round."
  if (cycle >= cycles) return "YOU'RE IN — LAST CYCLE, SO YOU GUESS BUT DON'T DRAW"
  return `YOU'RE IN · You guess from the next round and draw from cycle ${cycle + 1}.`
}
