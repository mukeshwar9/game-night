// @ts-check
// The solo MANCALA bot, pure and tested. NORMAL is the greedy bot the demo has
// always had (best store gain + extra turn + capture, with a little noise).
// EASY plays a random pit most turns; HARD searches a few sows ahead.

import { applyMancalaMove, legalPits, STORE_O, STORE_X } from './mancalaLogic'

/**
 * What each CPU level changes: the share of turns EASY plays a random pit
 * (`randomRate`) and how many sows ahead HARD looks (`depth`; 0 = greedy).
 */
export const MANCALA_BOT_LEVELS = {
  easy:   { randomRate: 0.6, depth: 0 },
  normal: { randomRate: 0,   depth: 0 },
  hard:   { randomRate: 0,   depth: 5 },
}

const WIN = 1000

/** @param {number[]} pits @param {'X'|'O'} symbol */
const storeGap = (pits, symbol) => (symbol === 'O' ? pits[STORE_O] - pits[STORE_X] : pits[STORE_X] - pits[STORE_O])

/**
 * The one-move score the greedy bot ranks pits by.
 * @param {{ pits: number[], extraTurn: boolean, captured: number }} moved
 * @param {'X'|'O'} symbol
 */
function greedyScore(moved, symbol) {
  let score = moved.pits[symbol === 'O' ? STORE_O : STORE_X] * 10
  if (moved.extraTurn) score += 25
  score += moved.captured * 8
  return score
}

/**
 * Alpha-beta over sows. A sow that lands in your own store keeps the move with
 * you, so `side` only flips when it does not. Scored from `me`'s side.
 * @param {number[]} pits
 * @param {'X'|'O'} side  who sows next
 * @param {'X'|'O'} me
 * @param {number} depth
 * @param {number} alpha
 * @param {number} beta
 * @returns {number}
 */
function search(pits, side, me, depth, alpha, beta) {
  const legal = legalPits(pits, side)
  if (depth === 0 || legal.length === 0) return storeGap(pits, me)
  const maximizing = side === me
  let best = maximizing ? -Infinity : Infinity
  for (const pit of legal) {
    const moved = applyMancalaMove(pits, pit, side)
    if (!moved) continue
    let value
    if (moved.result) {
      const gap = storeGap(moved.pits, me)
      value = gap > 0 ? WIN + gap : gap < 0 ? -WIN + gap : 0
    } else {
      const nextSide = moved.extraTurn ? side : side === 'X' ? 'O' : 'X'
      value = search(moved.pits, nextSide, me, depth - 1, alpha, beta)
    }
    if (maximizing) {
      if (value > best) best = value
      if (best > alpha) alpha = best
    } else {
      if (value < best) best = value
      if (best < beta) beta = best
    }
    if (beta <= alpha) break
  }
  return best
}

/**
 * The pit the bot sows, or null when it has no legal pit.
 * @param {number[]} pits
 * @param {'X'|'O'} symbol  the bot's side
 * @param {'easy'|'normal'|'hard'} [level]
 * @param {() => number} [rng]  0..1; injectable so tests are deterministic
 * @returns {number | null}
 */
export function pickMancalaPit(pits, symbol, level = 'normal', rng = Math.random) {
  const legal = legalPits(pits, symbol)
  if (!legal.length) return null
  const tune = MANCALA_BOT_LEVELS[level] ?? MANCALA_BOT_LEVELS.normal

  if (tune.randomRate > 0 && rng() < tune.randomRate) {
    return legal[Math.floor(rng() * legal.length) % legal.length]
  }

  let best = null
  let bestScore = -Infinity
  for (const pit of legal) {
    const moved = applyMancalaMove(pits, pit, symbol)
    if (!moved) continue
    let score
    if (tune.depth > 0) {
      if (moved.result) {
        const gap = storeGap(moved.pits, symbol)
        score = gap > 0 ? WIN + gap : gap < 0 ? -WIN + gap : 0
      } else {
        const nextSide = moved.extraTurn ? symbol : symbol === 'X' ? 'O' : 'X'
        score = search(moved.pits, nextSide, symbol, tune.depth - 1, -Infinity, Infinity)
      }
    } else {
      score = greedyScore(moved, symbol)
    }
    score += rng() * 3 // tie-break noise
    if (score > bestScore) { bestScore = score; best = pit }
  }
  return best
}
