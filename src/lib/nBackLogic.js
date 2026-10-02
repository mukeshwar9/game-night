// @ts-check
// N-Back: a cell of a 3×3 grid lights each step; tap MATCH when it is the same
// cell as the one n steps back. Position-only n-back (after Jaeggi et al., 2008).
// Pure; the board owns the step timer.

export const NB_CELLS = 9
export const NB_LIVES = 3
export const NB_BLOCK = 20     // steps per block
export const NB_MAX_N = 6
// A block with at least this many hits and no more than this many errors raises n
// (starting values, posture B: if under 1 in 4 players ever reach 2-back, ease them).
export const NB_PROMOTE_HITS = 5
export const NB_PROMOTE_ERRORS = 2
const MATCH_RATE = 0.3

function nextCell(seq, n, rand) {
  if (seq.length >= n && rand() < MATCH_RATE) return seq[seq.length - n]
  const avoid = seq.length >= n ? seq[seq.length - n] : -1
  let c = Math.floor(rand() * NB_CELLS)
  if (c === avoid) c = (c + 1 + Math.floor(rand() * (NB_CELLS - 1))) % NB_CELLS
  return c
}

export function startNBack(rand = Math.random) {
  return { n: 1, seq: [nextCell([], 1, rand)], blockStep: 0, hits: 0, errors: 0, lives: NB_LIVES, score: 0, over: false, last: null, promoted: false }
}

/** Is the current (last) cell a match for its n? */
export function isNBackMatch(state) {
  const i = state.seq.length - 1
  return i >= state.n && state.seq[i] === state.seq[i - state.n]
}

/** Close the current step: `pressed` is whether MATCH was tapped during it. */
export function stepNBack(state, pressed, rand = Math.random) {
  if (state.over) return state
  const match = isNBackMatch(state)
  const correct = pressed === match
  const lives = correct ? state.lives : state.lives - 1
  const hits = state.hits + (correct && match ? 1 : 0)
  const errors = state.errors + (correct ? 0 : 1)
  const score = state.score + (correct ? state.n : 0)
  const last = { correct, match, pressed }
  if (lives <= 0) return { ...state, lives: 0, hits, errors, score, over: true, last }
  let { n } = state
  let blockStep = state.blockStep + 1
  let promoted = false
  let h = hits, e = errors
  if (blockStep >= NB_BLOCK) {
    if (h >= NB_PROMOTE_HITS && e <= NB_PROMOTE_ERRORS && n < NB_MAX_N) { n += 1; promoted = true }
    blockStep = 0; h = 0; e = 0
  }
  // A new n starts a fresh history so the first matches are possible straight away.
  const seq = promoted ? [nextCell([], n, rand)] : [...state.seq, nextCell(state.seq, n, rand)]
  return { ...state, n, seq, blockStep, hits: h, errors: e, lives, score, last, promoted }
}
