import Board from '../components/Board'
import ConnectFourBoard from '../components/ConnectFourBoard'
import DotsAndBoxesBoard from '../components/DotsAndBoxesBoard'
import SosBoard from '../components/SosBoard'
import SimonBoard from '../components/SimonBoard'
import { TicTacToeIcon, ConnectFourIcon, HangwomanIcon, DotsAndBoxesIcon, SosIcon, SimonIcon } from '../components/GameIcons'
import { getWinner, normalizeBoard } from './gameLogic'
import { getConnectFourWinner, getConnectFourDrop, CF_BOARD_SIZE } from './connectFourLogic'
import {
  DB_EDGE_COUNT,
  DB_BOX_COUNT,
  applyEdgeMove,
  getDotsAndBoxesWinner,
} from './dotsAndBoxesLogic'
import {
  SOS_CELL_COUNT,
  normalizeSosLines,
  applySosMove,
  getSosWinner,
} from './sosLogic'
import {
  normalizeSimonSequence,
  applySimonMove,
} from './simonLogic'

export const GAME_TYPES = [
  {
    type: 'tictactoe', label: 'TIC TAC TOE',
    desc: '3 × 3', Icon: TicTacToeIcon,
    badge: null, maxWidth: 'max-w-sm',
    boardSize: 9,
    getMoveIndex: (board, index) => (board[index] ? -1 : index),
    getWinner,
    BoardComponent: Board,
  },
  {
    type: 'connectfour', label: 'CONNECT FOUR',
    desc: '6 × 7', Icon: ConnectFourIcon,
    badge: 'C4', maxWidth: 'max-w-md',
    boardSize: CF_BOARD_SIZE,
    getMoveIndex: getConnectFourDrop,
    getWinner: getConnectFourWinner,
    BoardComponent: ConnectFourBoard,
  },
  {
    type: 'hangwoman', label: 'HANGWOMAN',
    desc: 'word game', Icon: HangwomanIcon,
    badge: 'HW', maxWidth: 'max-w-sm',
    custom: true,
  },
  {
    type: 'dotsandboxes', label: 'DOTS & BOXES',
    desc: '4 × 4', Icon: DotsAndBoxesIcon,
    badge: 'DB', maxWidth: 'max-w-sm',
    boardSize: DB_EDGE_COUNT,
    getMoveIndex: (board, index) => (board[index] ? -1 : index),
    BoardComponent: DotsAndBoxesBoard,
    applyMove: ({ board, game, index, symbol }) => {
      const boxes = normalizeBoard(game.boxes, DB_BOX_COUNT)
      const moved = applyEdgeMove(board, boxes, index, symbol)
      if (!moved) return null
      return {
        updates: {
          board: moved.edges,
          boxes: moved.boxes,
          currentTurn: moved.completedBoxes.length ? symbol : (symbol === 'X' ? 'O' : 'X'),
        },
        result: getDotsAndBoxesWinner(moved.boxes),
      }
    },
    boardProps: (game) => ({ boxes: normalizeBoard(game.boxes, DB_BOX_COUNT) }),
  },
  {
    type: 'sos', label: 'SOS',
    desc: '7 × 7', Icon: SosIcon,
    badge: 'SOS', maxWidth: 'max-w-sm',
    boardSize: SOS_CELL_COUNT,
    getMoveIndex: (board, move) => (board[move.index] ? -1 : move.index),
    BoardComponent: SosBoard,
    applyMove: ({ board, game, move, symbol }) => {
      const lines = normalizeSosLines(game.sosLines)
      const applied = applySosMove(board, lines, move.index, move.letter, symbol)
      if (!applied) return null
      return {
        updates: {
          board: applied.board,
          sosLines: applied.sosLines,
          currentTurn: applied.completedCount ? symbol : (symbol === 'X' ? 'O' : 'X'),
        },
        result: getSosWinner(applied.board, applied.sosLines),
      }
    },
    boardProps: (game) => ({ sosLines: normalizeSosLines(game.sosLines) }),
  },
  {
    type: 'simon', label: 'SIMON',
    desc: 'memory duel', Icon: SimonIcon,
    badge: 'SQ', maxWidth: 'max-w-xs',
    boardSize: 0,
    getMoveIndex: (_, padIndex) => padIndex,
    BoardComponent: SimonBoard,
    applyMove: ({ game, move, symbol }) => applySimonMove(game, move, symbol),
    boardProps: (game) => ({
      simonSequence: normalizeSimonSequence(game.simonSequence),
      simonProgress: game.simonProgress ?? 0,
    }),
  },
]

export const getGameConfig = (type) => GAME_TYPES.find(t => t.type === type) ?? GAME_TYPES[0]

export function freshGameState(gameType) {
  const cfg = getGameConfig(gameType)
  if (cfg.custom) {
    return { board: null, currentTurn: null, round: { setter: 'X', phase: 'setting', wrongCount: 0 }, boxes: null, sosLines: null }
  }
  if (gameType === 'dotsandboxes') {
    return { board: Array(DB_EDGE_COUNT).fill(''), boxes: Array(DB_BOX_COUNT).fill(''), currentTurn: 'X', round: null, sosLines: null }
  }
  if (gameType === 'sos') {
    return { board: Array(SOS_CELL_COUNT).fill(''), boxes: null, sosLines: null, currentTurn: 'X', round: null }
  }
  if (gameType === 'simon') {
    return { board: null, boxes: null, currentTurn: 'X', round: null, sosLines: null, simonSequence: null, simonProgress: 0 }
  }
  return { board: Array(cfg.boardSize).fill(''), boxes: null, currentTurn: 'X', round: null, sosLines: null }
}
