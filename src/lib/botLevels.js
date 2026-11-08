// @ts-check
// The CPU levels every solo mode offers: the same three names, in the same
// order, on every `CPU` chip row (CpuDifficultyChips). Each game keeps its own
// tuning table in its *Logic.js; this module only names the levels so a page
// can show the picker without importing a game's whole bot.

/** @typedef {'easy' | 'normal' | 'hard'} BotLevel */

/** @type {readonly BotLevel[]} */
export const BOT_LEVEL_IDS = ['easy', 'normal', 'hard']
/** @type {BotLevel} */
export const DEFAULT_BOT_LEVEL = 'normal'

/**
 * Any stored or passed value as a known level; anything else plays NORMAL.
 * @param {unknown} level
 * @returns {BotLevel}
 */
export function normalizeBotLevel(level) {
  return BOT_LEVEL_IDS.find(l => l === level) ?? DEFAULT_BOT_LEVEL
}
