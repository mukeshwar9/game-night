// @ts-check
// UPDRAFT room config shared by the registry (games.js), matchRules (and so
// the results Cloud Function) and the pages. Kept apart from updraftLogic.js
// so the entry bundle never carries the tower generator or the sim.

/** Round wins that take a versus match (best of three). */
export const MATCH_TARGET = 2
/** Shared falls a co-op team gets per run. */
export const COOP_LIVES = 3

export const UPDRAFT_MODES = {
  chaos: { id: 'chaos', label: 'CHAOS', blurb: 'PICKUPS SABOTAGE YOUR RIVAL' },
  pure: { id: 'pure', label: 'PURE', blurb: 'JUST THE CLIMB' },
}
export const UPDRAFT_MODE_IDS = /** @type {const} */ (['chaos', 'pure'])
/** The host's lobby pick; anything else (including unset) is the CHAOS default. */
export const getUpdraftMode = (id) => (id === 'pure' ? 'pure' : 'chaos')

export function randomUpdraftSeed() {
  return Math.floor(Math.random() * 2 ** 31)
}

/**
 * Initial `updraft` node. A new seed every round; a versus rematch
 * (previous = this room) keeps the host's mode.
 * @param {any} previous
 * @param {{ coop?: boolean }} [opts]
 */
export function updraftFreshState(previous, { coop = false } = {}) {
  if (coop) return { updraft: { seed: randomUpdraftSeed(), lives: COOP_LIVES } }
  const keep = previous?.gameType === 'updraft' ? previous.updraft?.mode : null
  return { updraft: { seed: randomUpdraftSeed(), mode: getUpdraftMode(keep) } }
}
