// Arrows 2-player match flow: round count, who has won, and the room fields a
// new round starts from. Split from arrowsLogic.js (generator, solver,
// geometry) so games.js and matchRules.js can load it without that weight;
// arrowsLogic.js re-exports everything here.

export const ARROWS_LIVES = 3
export const ARROWS_MATCH_TARGET = 2
export const ARROWS_MAX_ROUNDS = 3
export const ARROWS_TIERS = ['easy', 'medium', 'hard']

export function randomArrowsSeed(rng = Math.random) {
  return Math.floor(rng() * 2147483647) + 1
}

// First to ARROWS_MATCH_TARGET round wins.
export function arrowsMatchWinner(scores) {
  const x = scores?.X || 0
  const o = scores?.O || 0
  if (x >= ARROWS_MATCH_TARGET) return 'X'
  if (o >= ARROWS_MATCH_TARGET) return 'O'
  return null
}

export function isFinalArrowsRound(game) {
  return (game?.arrowsRound ?? 0) >= ARROWS_MAX_ROUNDS - 1
}

// Conclusive match end for a game object: someone hit the target, or the
// final round finished (higher score wins, level scores draw). Returns
// 'X' | 'O' | 'draw' | null while the match is still live.
export function getArrowsMatchEnd(game) {
  const target = arrowsMatchWinner(game?.scores)
  if (target) return target
  if (isFinalArrowsRound(game) && game?.status === 'finished') {
    const x = game?.scores?.X || 0
    const o = game?.scores?.O || 0
    if (x === o) return 'draw'
    return x > o ? 'X' : 'O'
  }
  return null
}

function roundFields(round, rng) {
  return {
    arrowsRound: round,
    arrowsSeed: randomArrowsSeed(rng),
    arrowsStartedAt: null,
    arrowsGoneX: null,
    arrowsGoneO: null,
    arrowsLivesX: ARROWS_LIVES,
    arrowsLivesO: ARROWS_LIVES,
  }
}

// Config hook for Game.jsx's applyPlayAgain: advance easy → medium → hard.
// Returns null when the match is over (callers start a new match instead).
export function arrowsNextRound(game, rng = Math.random) {
  if (arrowsMatchWinner(game?.scores)) return null
  const round = (game?.arrowsRound ?? 0) + 1
  if (round >= ARROWS_MAX_ROUNDS) return null
  return roundFields(round, rng)
}

// Fresh round-0 state fragment (used by freshGameState in games.js).
export function arrowsFreshState(rng = Math.random) {
  return roundFields(0, rng)
}
