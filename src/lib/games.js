import Board from '../components/Board'
import ConnectFourBoard from '../components/ConnectFourBoard'
import DotsAndBoxesBoard from '../components/DotsAndBoxesBoard'
import SosBoard from '../components/SosBoard'
import SimonBoard from '../components/SimonBoard'
// ChimpBoard is used only from ChimpGame (custom component), not directly via registry
import VisualMemoryBoard from '../components/VisualMemoryBoard'
import {
  TicTacToeIcon, ConnectFourIcon, HangwomanIcon, DotsAndBoxesIcon, SosIcon,
  SimonIcon, ChimpIcon, NumberMemoryIcon, VisualMemoryIcon, ReactionIcon,
} from '../components/GameIcons'
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
import { normalizeSimonSequence, applySimonMove } from './simonLogic'
import {
  CHIMP_START_LEVEL,
  generateChimpLayout,
} from './chimpLogic'
import {
  VM_START_LEVEL,
  normalizeVmArray,
  generateVmPattern,
  applyVmMove,
} from './visualMemoryLogic'

function generateNumber(level) {
  let n = String(Math.floor(Math.random() * 9) + 1)
  for (let i = 1; i < level; i++) n += String(Math.floor(Math.random() * 10))
  return n
}

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
  {
    type: 'chimp', label: 'CHIMP TEST',
    desc: '5 × 5 grid', Icon: ChimpIcon,
    badge: 'CT', maxWidth: 'max-w-xs',
    custom: true,
  },
  {
    type: 'numbermemory', label: 'NUMBER MEMORY',
    desc: 'digit recall', Icon: NumberMemoryIcon,
    badge: 'NM', maxWidth: 'max-w-xs',
    custom: true,
  },
  {
    type: 'reaction', label: 'REACTION TIME',
    desc: '4 rounds', Icon: ReactionIcon,
    badge: 'RT', maxWidth: 'max-w-xs',
    custom: true,
  },
  {
    type: 'visualmemory', label: 'VISUAL MEMORY',
    desc: '4 × 4 grid', Icon: VisualMemoryIcon,
    badge: 'VM', maxWidth: 'max-w-xs',
    boardSize: 0,
    getMoveIndex: (_, cellIndex) => cellIndex,
    BoardComponent: VisualMemoryBoard,
    applyMove: ({ game, move, symbol }) => applyVmMove(game, move, symbol),
    boardProps: (game) => ({
      vmPattern: normalizeVmArray(game.vmPattern),
      vmClicked: normalizeVmArray(game.vmClicked),
      vmLevel: game.vmLevel ?? VM_START_LEVEL,
    }),
  },
]

export const getGameConfig = (type) => GAME_TYPES.find(t => t.type === type) ?? GAME_TYPES[0]

// Nulls for every game-specific field — spread into freshGameState so switching
// games clears the previous game's keys from Firebase.
const FIELD_NULLS = {
  sosLines: null,
  simonSequence: null, simonProgress: null,
  chimpLevel: null, chimpLayout: null,
  chimpProgressX: null, chimpProgressO: null,
  chimpDoneX: null, chimpDoneO: null,
  vmLevel: null, vmPattern: null, vmClicked: null,
  numRound: null,
  reactionTimesX: null, reactionTimesO: null,
}

export function freshGameState(gameType) {
  const cfg = getGameConfig(gameType)
  if (gameType === 'hangwoman') {
    return { ...FIELD_NULLS, board: null, currentTurn: null, boxes: null,
      round: { setter: 'X', phase: 'setting', wrongCount: 0 } }
  }
  if (gameType === 'dotsandboxes') {
    return { ...FIELD_NULLS, round: null,
      board: Array(DB_EDGE_COUNT).fill(''), boxes: Array(DB_BOX_COUNT).fill(''), currentTurn: 'X' }
  }
  if (gameType === 'sos') {
    return { ...FIELD_NULLS, round: null, boxes: null,
      board: Array(SOS_CELL_COUNT).fill(''), currentTurn: 'X',
      sosLines: null }
  }
  if (gameType === 'simon') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null,
      currentTurn: 'X', simonSequence: null, simonProgress: 0 }
  }
  if (gameType === 'chimp') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null,
      currentTurn: null,
      chimpLevel: CHIMP_START_LEVEL,
      chimpLayout: generateChimpLayout(CHIMP_START_LEVEL),
      chimpProgressX: 0, chimpProgressO: 0,
      chimpDoneX: false, chimpDoneO: false }
  }
  if (gameType === 'reaction') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null }
  }
  if (gameType === 'numbermemory') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      numRound: { phase: 'showing', level: 1, number: generateNumber(1) } }
  }
  if (gameType === 'visualmemory') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null,
      currentTurn: 'X',
      vmLevel: VM_START_LEVEL,
      vmPattern: generateVmPattern(VM_START_LEVEL),
      vmClicked: null }
  }
  return { ...FIELD_NULLS, board: Array(cfg.boardSize).fill(''), boxes: null, round: null, currentTurn: 'X' }
}
