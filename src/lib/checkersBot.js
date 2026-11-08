// @ts-check
// The solo CHECKERS bot, pure and tested. NORMAL is the greedy bot the demo has
// always had (most captures, then crowning, steering clear of squares X can
// jump back to). EASY plays a random legal move most turns; HARD searches a few
// plies ahead on material.

import { applyCheckersMove, getLegalMoves, normalizeCheckers } from './checkersLogic'

/**
 * What each CPU level changes: the share of turns EASY plays a random legal
 * move (`randomRate`) and how many plies HARD searches (`depth`; 0 = greedy).
 */
export const CHECKERS_BOT_LEVELS = {
  easy:   { randomRate: 0.6, depth: 0 },
  normal: { randomRate: 0,   depth: 0 },
  hard:   { randomRate: 0,   depth: 4 },
}

const WIN = 10000

/** @typedef {{ from: number, to: number, captures: number[], promotes: boolean }} CheckersMove */

/** @param {'X'|'O'} side */
const other = (side) => (side === 'X' ? 'O' : 'X')

/**
 * Material from `me`'s point of view: a king is worth 1.6 men, and men count
 * a little more the closer they are to crowning.
 * @param {string[]} board
 * @param {'X'|'O'} me
 */
function material(board, me) {
  let score = 0
  for (let i = 0; i < board.length; i++) {
    const p = board[i]
    if (!p) continue
    const side = p.toUpperCase()
    const king = p === side
    const row = Math.floor(i / 8)
    // X crowns on row 0, O on row 7.
    const progress = side === 'X' ? 7 - row : row
    const value = king ? 16 : 10 + progress * 0.4
    score += side === me ? value : -value
  }
  return score
}

/**
 * Alpha-beta over full moves (a multi-jump is one move).
 * @param {string[]} board
 * @param {'X'|'O'} side  who moves next
 * @param {'X'|'O'} me
 * @param {number} depth
 * @param {number} alpha
 * @param {number} beta
 * @returns {number}
 */
function search(board, side, me, depth, alpha, beta) {
  const moves = /** @type {CheckersMove[]} */ (getLegalMoves(board, side))
  // No move loses for the side to move (the demo's rule: blocked = lost).
  if (moves.length === 0) return side === me ? -WIN - depth : WIN + depth
  if (depth === 0) return material(board, me)
  const maximizing = side === me
  let best = maximizing ? -Infinity : Infinity
  for (const m of moves) {
    const applied = applyCheckersMove(board, m.from, m.to)
    if (!applied) continue
    const value = search(applied.board, other(side), me, depth - 1, alpha, beta)
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
 * The move the bot plays, or null when it has none.
 * @param {string[]} board
 * @param {'X'|'O'} [side]  the bot's side (the demo's bot is O)
 * @param {'easy'|'normal'|'hard'} [level]
 * @param {() => number} [rng]  0..1; injectable so tests are deterministic
 * @returns {CheckersMove | null}
 */
export function pickCheckersMove(board, side = 'O', level = 'normal', rng = Math.random) {
  const b = normalizeCheckers(board)
  const moves = /** @type {CheckersMove[]} */ (getLegalMoves(b, side))
  if (!moves.length) return null
  const tune = CHECKERS_BOT_LEVELS[level] ?? CHECKERS_BOT_LEVELS.normal

  if (tune.randomRate > 0 && rng() < tune.randomRate) {
    return moves[Math.floor(rng() * moves.length) % moves.length]
  }

  const scored = moves.map((m) => {
    const applied = applyCheckersMove(b, m.from, m.to)
    let score
    if (tune.depth > 0 && applied) {
      score = search(applied.board, other(side), side, tune.depth - 1, -Infinity, Infinity)
      score += rng() * 0.5 // break ties between equal lines
    } else {
      score = m.captures.length * 100 + (m.promotes ? 50 : 0)
      const hunted = applied
        && getLegalMoves(applied.board, other(side)).some((r) => r.captures.includes(m.to))
      if (hunted) score -= m.captures.length > 0 ? 10 : 40
      score += rng() * 5
    }
    return { move: m, score }
  })
  scored.sort((a, b2) => b2.score - a.score)
  return scored[0].move
}
