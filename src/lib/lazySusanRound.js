// lazySusanRound.js — the part of LAZY SUSAN the registry needs at start-up:
// seat limits, targets and the fresh round object. Kept apart from
// lazySusanLogic.js so the entry bundle does not carry the whole sim.

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 4
/** Points that win, by player count (starting values, see docs/LAZY-SUSAN.md). */
export const TARGETS = { 2: 15, 3: 12, 4: 10 }
export const DEFAULT_TWISTS = { turn: true, chili: true, last: true }

export const targetFor = (n) => TARGETS[Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.round(n) || MIN_PLAYERS))]

/**
 * A fresh match. `seats` is uid[] in seat order; `startAt` is server ms.
 * @param {string[]} seats
 * @param {number} seed
 * @param {number} startAt
 * @param {{ turn?: boolean, chili?: boolean, last?: boolean }} [twists]
 */
export function createRound(seats, seed, startAt, twists = DEFAULT_TWISTS) {
  const order = seats.slice(0, MAX_PLAYERS)
  return {
    lsSeats: order,
    lsSeed: seed | 0,
    lsStart: startAt,
    lsTarget: targetFor(order.length),
    lsTwists: { turn: twists.turn !== false, chili: twists.chili !== false, last: twists.last !== false },
  }
}
