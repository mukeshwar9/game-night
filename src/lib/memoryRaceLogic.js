// @ts-check
// Shared room logic for the memory duels added in the memory-shelf build (Verbal
// Memory, N-Back, Cup Shuffle, What Changed?, Lost & Found, Name Tags) and the
// co-op Split Signal. Everything lives under one room node, `mem`:
//
//   level race (one deal per level, both play it):
//     mem = { level, seed, startAt, X: { done, fail, progress, time }, O: { … } }
//   score race (one seeded stream, both play until out of lives):
//     mem = { seed, startAt, X: { score, lives, over }, O: { … } }
//
// Deals are seeded (`seed` + level) so both players get the same one; like Pairs'
// deck the seed sits in the room in the clear (honest-client tier, documented).
import { resolveLevelRace } from './levelRaceLogic'
import { mulberry32 } from './detMath'

export const MEM_LIVES = 3

/** A random source for one level of a room (or a solo run), from its seed. */
export function levelRand(seed, level) {
  return mulberry32(((seed >>> 0) ^ Math.imul(level + 1, 0x9e3779b1)) >>> 0)
}

/** A fresh 32-bit seed. */
export function newSeed(rand = Math.random) {
  return Math.floor(rand() * 0xffffffff) >>> 0
}

const seat = (mem, k) => (mem && mem[k]) || {}

/** Level race outcome for the current level of `mem` (see resolveLevelRace). */
export function memLevelOutcome(mem) {
  const x = seat(mem, 'X'), o = seat(mem, 'O')
  return resolveLevelRace({
    doneX: !!x.done, doneO: !!o.done,
    failX: x.fail ?? null, failO: o.fail ?? null,
    progressX: x.progress ?? 0, progressO: o.progress ?? 0,
    timeX: x.time ?? 0, timeO: o.time ?? 0,
  })
}

/** The patch that starts `level` (advance or replay) — times carry over. */
export function memLevelPatch(mem, level, startAt, seed) {
  const keep = k => ({ done: false, fail: null, progress: 0, time: seat(mem, k).time ?? 0 })
  return { level, seed, startAt, X: keep('X'), O: keep('O') }
}

/** A fresh level-race room node. */
export function memLevelStart(level, seed) {
  return { level, seed, startAt: null, X: { done: false, fail: null, progress: 0, time: 0 }, O: { done: false, fail: null, progress: 0, time: 0 } }
}

/** A fresh score-race room node. */
export function memStreamStart(seed) {
  return { seed, startAt: null, X: { score: 0, lives: MEM_LIVES, over: false }, O: { score: 0, lives: MEM_LIVES, over: false } }
}

/**
 * Score race outcome: pending until both are out; then the higher score wins.
 * @returns {{ type: 'pending' } | { type: 'win', winner: 'X'|'O' } | { type: 'draw' }}
 */
export function memStreamOutcome(mem) {
  const x = seat(mem, 'X'), o = seat(mem, 'O')
  if (!x.over || !o.over) return { type: 'pending' }
  if ((x.score ?? 0) === (o.score ?? 0)) return { type: 'draw' }
  return { type: 'win', winner: (x.score ?? 0) > (o.score ?? 0) ? 'X' : 'O' }
}

// ── Solo level runs (MemoryRunSolo) ──
// A run climbs levels; a slip costs one of MEM_LIVES and pauses on the mistake until
// the player continues with a fresh deal of the same level. `attempt` changes the
// deal after a slip; `seed` makes the whole run reproducible (DAILY, tests).

export function startLevelRun(seed) {
  return { level: 1, attempt: 0, lives: MEM_LIVES, cleared: 0, over: false, paused: false, seed }
}

/** The random source for the run's current deal. */
export function levelRunRand(state) {
  return levelRand((state.seed + Math.imul(state.attempt, 0x85ebca6b)) >>> 0, state.level)
}

export function levelRunDone(state) {
  if (state.over || state.paused) return state
  return { ...state, level: state.level + 1, attempt: 0, cleared: state.level }
}

export function levelRunFail(state) {
  if (state.over || state.paused) return state
  const lives = state.lives - 1
  return lives <= 0 ? { ...state, lives: 0, over: true } : { ...state, lives, paused: true }
}

export function levelRunContinue(state) {
  if (!state.paused || state.over) return state
  return { ...state, paused: false, attempt: state.attempt + 1 }
}
