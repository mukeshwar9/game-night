// @ts-check
// Solo runs for the three 5-letter word games. One engine, three shapes, no
// opponent: each mode is a score to beat on your own.
//   wordrace  SPRINT  3 minutes on the clock; solve as many words as you can.
//   wordduel  SET     5 words; fewer guesses on each word earns more points.
//   wordcoop  STREAK  keep solving; the run ends on the first word you miss.
// Pure: the page owns the board, keyboard and clock.

import { MAX_GUESSES } from './wordduelLogic'

export const SPRINT_MS = 180_000
export const SET_WORDS = 5

/**
 * @typedef {'wordrace' | 'wordduel' | 'wordcoop'} WordSoloMode
 * @typedef {{ word: string, solved: boolean, guesses: number }} WordResult
 */

/** @type {Record<WordSoloMode, { name: string, unit: string, unitOne: string, how: string[] }>} */
export const WORD_SOLO_MODES = {
  wordrace: {
    name: 'SPRINT',
    unit: 'WORDS',
    unitOne: 'WORD',
    how: [`SOLVE AS MANY WORDS AS YOU CAN IN ${SPRINT_MS / 60_000} MINUTES`, `${MAX_GUESSES} GUESSES A WORD · A MISS JUST MOVES ON`],
  },
  wordduel: {
    name: 'FIVE-WORD SET',
    unit: 'POINTS',
    unitOne: 'POINT',
    how: [`${SET_WORDS} WORDS · SOLVE EACH IN ${MAX_GUESSES} GUESSES OR FEWER`, 'FEWER GUESSES = MORE POINTS'],
  },
  wordcoop: {
    name: 'STREAK',
    unit: 'WORDS',
    unitOne: 'WORD',
    how: ['SOLVE WORD AFTER WORD', `${MAX_GUESSES} GUESSES A WORD · THE FIRST MISS ENDS THE RUN`],
  },
}

/** @param {string} mode @returns {mode is WordSoloMode} */
export const isWordSoloMode = (mode) => Object.prototype.hasOwnProperty.call(WORD_SOLO_MODES, mode)

/** Points for one word in the SET: 6 on the first guess down to 1 on the last, 0 for a miss. */
export function setPoints(/** @type {WordResult} */ r) {
  return r.solved ? Math.max(0, MAX_GUESSES + 1 - r.guesses) : 0
}

/**
 * The run's score so far.
 * @param {WordSoloMode} mode
 * @param {WordResult[]} results finished words, in order
 */
export function runScore(mode, results) {
  if (mode === 'wordduel') return results.reduce((sum, r) => sum + setPoints(r), 0)
  return results.filter(r => r.solved).length
}

/**
 * Whether the run has ended.
 * @param {WordSoloMode} mode
 * @param {{ results: WordResult[], elapsedMs?: number }} state
 */
export function runOver(mode, { results, elapsedMs = 0 }) {
  if (mode === 'wordrace') return elapsedMs >= SPRINT_MS
  if (mode === 'wordduel') return results.length >= SET_WORDS
  return results.length > 0 && !results[results.length - 1].solved
}

/** The best score a mode can reach (for the end card). */
export function maxScore(/** @type {WordSoloMode} */ mode) {
  return mode === 'wordduel' ? SET_WORDS * MAX_GUESSES : null
}

/**
 * A fresh answer that has not been served this visit; once the list is used
 * up it starts over rather than failing.
 * @param {string[]} answerList
 * @param {string[]} used
 * @param {() => number} [rand]
 */
export function pickSoloWord(answerList, used = [], rand = Math.random) {
  const usedSet = new Set(used.map(w => w.toLowerCase()))
  const fresh = answerList.filter(w => !usedSet.has(w.toLowerCase()))
  const pool = fresh.length ? fresh : answerList
  if (!pool.length) return ''
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]
}

/**
 * Pluralised unit for a score.
 * @param {WordSoloMode} mode
 * @param {number} score
 */
export function scoreUnit(mode, score) {
  const m = WORD_SOLO_MODES[mode]
  return score === 1 ? m.unitOne : m.unit
}
