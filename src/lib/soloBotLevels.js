// @ts-check
// CPU levels for the small solo skill-race bots (Reaction Time, Aim Trainer,
// Typing Race, Mental Math, Trivia Blitz). Each bot is a stopwatch, not a simulation, so a
// level is just its numbers: how fast it answers and how often it is right.
// NORMAL in every table is the bot these demos had before levels existed.

/** @typedef {'easy' | 'normal' | 'hard'} Level */
/** @typedef {[number, number]} Range */

/** Reaction Time: the bot's time per round, in ms (uniform in the range). */
export const REACTION_BOT_MS = /** @type {Record<Level, Range>} */ ({
  easy:   [260, 520],
  normal: [180, 380],
  hard:   [140, 260],
})

/** Aim Trainer: the gap between the bot's hits, in ms (uniform in the range). */
export const AIM_BOT_GAP_MS = /** @type {Record<Level, Range>} */ ({
  easy:   [600, 1050],
  normal: [400, 750],
  hard:   [280, 520],
})

/** Typing Race: the bot's speed in words per minute, typed without a slip. */
export const TYPING_BOT_WPM = /** @type {Record<Level, number>} */ ({
  easy:   35,
  normal: 55,
  hard:   80,
})

/** Mental Math: the bot's answer delay (ms, uniform) and how often it is right. */
export const MATH_BOT = /** @type {Record<Level, { delayMs: Range, accuracy: number }>} */ ({
  easy:   { delayMs: [1800, 4200], accuracy: 0.5 },
  normal: { delayMs: [1000, 3000], accuracy: 0.7 },
  hard:   { delayMs: [700, 2000],  accuracy: 0.9 },
})

/**
 * Trivia Blitz: the chance each bot answers right, by the question's
 * difficulty (1 easy .. 3 hard).
 */
export const TRIVIA_BOT_ACCURACY = /** @type {Record<Level, Record<number, number>>} */ ({
  easy:   { 1: 0.55, 2: 0.35, 3: 0.2 },
  normal: { 1: 0.75, 2: 0.55, 3: 0.4 },
  hard:   { 1: 0.92, 2: 0.8,  3: 0.65 },
})

/**
 * Any stored or passed value as a level in the tables; unknown plays NORMAL.
 * @param {unknown} level
 * @returns {Level}
 */
const levelOf = (level) => (level === 'easy' || level === 'hard' ? level : 'normal')

/**
 * A whole-number draw from a [low, high] range.
 * @param {Range} range
 * @param {() => number} [rng]  0..1; injectable so tests are deterministic
 */
export function rollBetween(range, rng = Math.random) {
  return Math.round(range[0] + rng() * (range[1] - range[0]))
}

/** @param {unknown} level */
export const reactionBotMs = (level) => REACTION_BOT_MS[levelOf(level)]
/** @param {unknown} level */
export const aimBotGapMs = (level) => AIM_BOT_GAP_MS[levelOf(level)]
/** @param {unknown} level */
export const typingBotWpm = (level) => TYPING_BOT_WPM[levelOf(level)]
/**
 * @param {unknown} level
 * @param {number} diff  the question's difficulty, 1..3
 */
export const triviaBotAccuracy = (level, diff) => TRIVIA_BOT_ACCURACY[levelOf(level)][diff] ?? 0.5
/** @param {unknown} level */
export const mathBot = (level) => MATH_BOT[levelOf(level)]
