import { CF_BOARD_SIZE } from './connectFourLogic'

export const GAME_TYPES = [
  { type: 'tictactoe',   label: 'TIC TAC TOE' },
  { type: 'connectfour', label: 'CONNECT FOUR' },
  { type: 'hangwoman',   label: 'HANGWOMAN' },
]

export function freshGameState(gameType) {
  if (gameType === 'hangwoman') {
    return { board: null, currentTurn: null, round: { setter: 'X', phase: 'setting', wrongCount: 0 } }
  }
  const size = gameType === 'connectfour' ? CF_BOARD_SIZE : 9
  return { board: Array(size).fill(''), currentTurn: 'X', round: null }
}
