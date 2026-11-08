// SKETCH: joining a match already in progress (registry `midJoin`). Pure — no
// Firebase, no React — unit-tested in sketchJoinLogic.test.js.
//
// A visitor who taps JOIN mid-match gets a seat (`players/{uid}`) but is not
// added to the round's drawing `order` at once. Instead:
//   - they GUESS from the next round on: a seated player takes part in a round
//     when their seat's `joinedAt` is no later than that round's `startedAt`
//     (stamped by whoever creates the round);
//   - they DRAW from the next cycle on: when the order wraps, every online
//     seated player missing from it is appended, so they draw once in each
//     cycle that is left. Someone who joins in the last cycle only guesses.
// The match length stays the one snapshotted at START (`round.cycles`, S2),
// so a 2-player match that gains a third player does not shrink from three
// cycles to two.
//
// A seated player who was offline at START (left out of `order`) is treated
// the same way: they guess from the first round and draw from the next cycle.
//
// Extra round keys:
//   startedAt:      server time this round was created
//   matchStartedAt: server time the match's first round was created (carried),
//                   so the podium can tag JOINED LATE

import { nextRoundState, participantGuessers, roundCycles } from './sketchLogic'

const isSeat = (p) => !!p && typeof p === 'object' && !!p.playerId
const finite = (n) => typeof n === 'number' && Number.isFinite(n)

/** Seated uids missing from the drawing order, in join order (joinedAt, then uid). */
export function lateJoiners(players, order) {
  const inOrder = new Set(order || [])
  return Object.entries(players || {})
    .filter(([id, p]) => isSeat(p) && !inOrder.has(id))
    .sort(([a, pa], [b, pb]) => ((pa.joinedAt || 0) - (pb.joinedAt || 0)) || String(a).localeCompare(String(b)))
    .map(([id]) => id)
}

/** Was this seat taken before `round` started? Unknown times count as no. */
export function seatedBeforeRound(seat, round) {
  return isSeat(seat) && finite(seat.joinedAt) && finite(round?.startedAt) && seat.joinedAt <= round.startedAt
}

/**
 * Everyone who guesses this round, for scoring and the GOT IT count: the order
 * minus the artist, then late joiners seated before the round started. Offline
 * players stay in (scores resolve for everyone who took part).
 */
export function roundGuessers(round, players) {
  if (!round) return []
  const fromOrder = participantGuessers(round.order, round.artist)
  const late = lateJoiners(players, round.order)
    .filter(id => id !== round.artist && seatedBeforeRound(players[id], round))
  return [...fromOrder, ...late]
}

/**
 * The guessers the early end waits for: roundGuessers online
 * (`online !== false`), or all of them when none are online, so the all-solved
 * check never waits on nobody.
 */
export function activeRoundGuessers(round, players) {
  const all = roundGuessers(round, players)
  const online = all.filter(id => players?.[id]?.online !== false)
  return online.length > 0 ? online : all
}

/** Does `uid` guess in this round? */
export function guessesThisRound(round, players, uid) {
  return !!uid && roundGuessers(round, players).includes(uid)
}

/**
 * The round after `round`, or `{ finished: true }`. nextRoundState plus: the
 * new round's `startedAt` (`now`, server time), the match start carried on,
 * and, when the order wraps into a new cycle, the online late joiners appended
 * to the order. The caller adds `endsAt` as before.
 */
export function nextSketchRound(round, players, now) {
  const result = nextRoundState(round)
  if (result.finished) return result
  const next = { ...result.round, startedAt: now }
  if (finite(round?.matchStartedAt)) next.matchStartedAt = round.matchStartedAt
  if (next.cycle > (round?.cycle ?? 1)) {
    const joiners = lateJoiners(players, next.order).filter(id => players[id]?.online !== false)
    if (joiners.length) next.order = [...next.order, ...joiners]
  }
  return { finished: false, round: next }
}

/** Did this seat join after the match began? (The podium's JOINED LATE tag.) */
export function joinedLate(seat, round) {
  return isSeat(seat) && finite(seat.joinedAt) && finite(round?.matchStartedAt) && seat.joinedAt > round.matchStartedAt
}

/**
 * The JOIN bar's state for this phone during a match:
 *   null        not shown (in this round already, or not a Sketch match)
 *   'open'      a watcher who may take a seat (JOIN)
 *   'full'      a watcher, room at its cap
 *   'locked'    a watcher, room locked by the host
 *   'waiting'   seated, guesses from the next round
 * `offer` is the room shell's mid-join state for a watcher ('open' | 'full' |
 * 'locked' | null).
 */
export function joinBarState({ round, players, uid, offer = null }) {
  if (!round || !uid) return null
  if (!players?.[uid]) return offer
  if ((round.order || []).includes(uid) || guessesThisRound(round, players, uid)) return null
  return 'waiting'
}

/**
 * The seated late joiner's line: which cycle they first draw in, or that they
 * only guess because this is the last cycle.
 */
export function waitingNote(round) {
  const cycle = round?.cycle ?? 1
  const total = roundCycles(round)
  if (cycle >= total) return { title: "YOU'RE IN — LAST CYCLE, SO YOU GUESS BUT DON'T DRAW", body: 'You guess from the next round.' }
  return { title: "YOU'RE IN", body: `You guess from the next round and draw from cycle ${cycle + 1}.` }
}
