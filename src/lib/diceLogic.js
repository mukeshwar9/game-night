export const PIG_TARGET = 100

// Returns a uniform random integer 1–6.
export function rollDie() {
  return Math.floor(Math.random() * 6) + 1
}

// Pure-ish move application for PIG (push-your-luck dice).
// action: 'roll' | 'bank'
//   'roll' — rolls a die (via rollDie). On a 1 the turn score is wiped and the
//            turn flips; otherwise the roll is added to the at-risk turn score.
//   'bank' — adds the turn score to the mover's banked score, resets the turn
//            score, and flips the turn. A banked total ≥ 100 wins.
// game must carry: diceScoreX, diceScoreO, diceTurnScore, currentTurn.
// Returns { updates, result } (updates = full Firebase patch incl. currentTurn;
// result = null | { winner }) or null for an invalid action.
export function applyDiceMove(game, action, symbol) {
  if (symbol !== 'X' && symbol !== 'O') return null
  if (action !== 'roll' && action !== 'bank') return null

  const opponent = symbol === 'X' ? 'O' : 'X'
  const turnScore = game.diceTurnScore ?? 0
  const myScore = (symbol === 'X' ? game.diceScoreX : game.diceScoreO) ?? 0

  if (action === 'roll') {
    const die = rollDie()
    if (die === 1) {
      // Bust: lose the at-risk points and pass the dice.
      return {
        updates: {
          diceLast: 1,
          diceTurnScore: 0,
          currentTurn: opponent,
        },
        result: null,
      }
    }
    // Safe roll: bank it into the at-risk pile, keep rolling.
    return {
      updates: {
        diceLast: die,
        diceTurnScore: turnScore + die,
        currentTurn: symbol,
      },
      result: null,
    }
  }

  // action === 'bank'
  const newScore = myScore + turnScore
  const scoreKey = symbol === 'X' ? 'diceScoreX' : 'diceScoreO'
  const win = newScore >= PIG_TARGET
  return {
    updates: {
      [scoreKey]: newScore,
      diceTurnScore: 0,
      currentTurn: opponent,
    },
    result: win ? { winner: symbol } : null,
  }
}
