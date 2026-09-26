// @ts-check
// When a finished 2P round decides the match. Shared by the room page
// (Game.jsx: win effect, recordMatch, the night scoreboard, the round-end
// CTAs) and the results Cloud Function (functions/src/core.mjs), which credits
// the leaderboard on exactly the finishes the clients treat as a match end —
// so the two must never disagree. Pure: no DOM, no Firebase, no React.

import { MATCH_TARGET as ANAGRAMS_MATCH_TARGET } from './anagramsLogic'
import { TARGET_SCORE as PASSWORD_TARGET } from './passwordLogic'
import { ARROWS_MATCH_TARGET, getArrowsMatchEnd } from './arrowsLogic'

/**
 * @typedef {{ gameType?: string, status?: string, matchLength?: number | null,
 *   scores?: { X?: number, O?: number } | null }} MatchRoom
 */

// Real-time games where one round decides the match (page-level `matchWinner`
// already uses scores ≥ 1; the parent's matchTarget must agree so the
// "New Match" button supersedes "Play Again" once the round resolves).
export const SINGLE_ROUND_GAMES = new Set(['tron', 'sumo', 'spaceduel'])

// 2P co-op games: both seats share the result, so there is no winner/loser —
// no DRAW overlay or win effect, no W/L stats, no night standings, no
// leaderboard credit, and partners never CLAIM WIN from each other. Mirrors
// the registry's `coop: true` flags (src/lib/games.js; matchRules.test.js
// keeps the two in sync — the registry itself can't be bundled into functions/).
export const COOP_GAMES = new Set(['wordcoop', 'password', 'lanterns', 'docking'])

/**
 * @param {string | undefined} gameType
 * @returns {boolean}
 */
export const isCoopGame = (gameType) => COOP_GAMES.has(gameType ?? '')

/**
 * Round wins (Password: points) needed to take the match. Registry
 * `matchTarget` values must agree (matchRules.test.js checks them).
 * @param {MatchRoom} game
 * @returns {number}
 */
export function matchTargetFor(game) {
  return game.gameType === 'password' ? PASSWORD_TARGET : game.gameType === 'pong' ? (game.matchLength ?? 3)
    : game.gameType === 'anagrams' ? ANAGRAMS_MATCH_TARGET
    : game.gameType === 'arrows' ? ARROWS_MATCH_TARGET
    : SINGLE_ROUND_GAMES.has(game.gameType) ? 1 : 3
}

/**
 * Does this just-finished round end the match? Password rounds always do
 * (its page decides the match itself). Arrows also ends on final-round
 * completion (leader wins, level scores draw) — without that a 1–0 / 1–1
 * finish would play round-end audio and skip match history.
 * @param {MatchRoom} game
 * @returns {boolean}
 */
export function isMatchFinish(game) {
  const sx = game.scores?.X || 0
  const so = game.scores?.O || 0
  const target = matchTargetFor(game)
  const arrowsOver = game.gameType === 'arrows' && !!getArrowsMatchEnd(game)
  return game.gameType === 'password' || sx >= target || so >= target || arrowsOver
}
