import Board from '../components/Board'
import ConnectFourBoard from '../components/ConnectFourBoard'
import DotsAndBoxesBoard from '../components/DotsAndBoxesBoard'
import SosBoard from '../components/SosBoard'
import SimonBoard from '../components/SimonBoard'
// ChimpBoard is used only from ChimpGame (custom component), not directly via registry
import VisualMemoryBoard from '../components/VisualMemoryBoard'
import {
  TicTacToeIcon, ConnectFourIcon, HangwomanIcon, DotsAndBoxesIcon, SosIcon,
  SimonIcon, ChimpIcon, NumberMemoryIcon, VisualMemoryIcon, ReactionIcon, AimIcon,
  TypingIcon, MathIcon,
  GomokuIcon, ReversiIcon, OrderChaosIcon, DiceIcon, TwoTruthsIcon, BluffIcon,
  WavelengthIcon, FibbageIcon, SpyfairIcon, PongIcon, SnakeIcon,
  TronIcon, SumoIcon, SpaceDuelIcon, ChainReactionIcon,
  WordDuelIcon,
} from '../components/GameIcons'
import { getWinner, normalizeBoard } from './gameLogic'
import { getConnectFourWinner, getConnectFourDrop, CF_BOARD_SIZE } from './connectFourLogic'
import {
  UT_CELL_COUNT, UT_BOARD_COUNT, applyUltimateMove, getUltimateWinner, normalizeUWon,
} from './ultimateTttLogic'
import UltimateTttBoard from '../components/UltimateTttBoard'
import { applyConnectFourPopMove, bottomIndex } from './connectFourPopLogic'
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
import { generateSeed } from './mathLogic'
import {
  VM_START_LEVEL,
  normalizeVmArray,
  generateVmPattern,
  applyVmMove,
} from './visualMemoryLogic'
import { getGomokuWinner, GOMOKU_CELL_COUNT } from './gomokuLogic'
import GomokuBoard from '../components/GomokuBoard'
import { REVERSI_SIZE, reversiInitialBoard, applyReversiMove, hasAnyMove, getReversiWinner } from './reversiLogic'
import ReversiBoard from '../components/ReversiBoard'
import { OC_CELL_COUNT, applyOrderChaosMove, getOrderChaosWinner } from './orderChaosLogic'
import OrderChaosBoard from '../components/OrderChaosBoard'
import { CR_CELL_COUNT, applyChainReactionMove } from './chainReactionLogic'
import ChainReactionBoard from '../components/ChainReactionBoard'
import { applyDiceMove } from './diceLogic'
import DiceBoard from '../components/DiceBoard'
import { seatOrder as seatOrderWL, randomSpectrumIndex } from './wavelengthLogic'

const PASSAGES = [
  "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. A wizard's job is to vex chumps quickly in fog.",
  "To be yourself in a world that is constantly trying to make you something else is the greatest accomplishment. Never stop being who you are.",
  "Success is not final, failure is not fatal. It is the courage to continue that counts. Keep moving forward and never give up on your dreams.",
  "The only way to do great work is to love what you do. If you have not found it yet, keep looking. Do not settle for less than what makes you happy.",
  "In the middle of every difficulty lies opportunity. Those who dare to fail greatly can achieve greatly. Believe in yourself and your abilities.",
  "Typing fast requires practice, focus, and the right technique. Keep your fingers on the home row, stay relaxed, and let your muscle memory do the work.",
  "The best time to plant a tree was twenty years ago. The second best time is now. Start today and your future self will thank you for the effort.",
  "We are what we repeatedly do. Excellence, then, is not an act but a habit. Small daily improvements over time lead to remarkable results.",
  "All great things are simple, and many can be expressed in single words such as freedom, justice, honor, duty, mercy, and hope. These words guide us.",
  "Life is what happens when you are busy making other plans. Enjoy the little things, for one day you may look back and realize they were the big things.",
  "It does not matter how slowly you go as long as you do not stop. Perseverance and patience are the keys to mastering any skill worth having.",
  "The secret of getting ahead is getting started. Break your tasks into small steps and tackle one at a time. Progress, not perfection, is the goal.",
]

function generateNumber(level) {
  let n = String(Math.floor(Math.random() * 9) + 1)
  for (let i = 1; i < level; i++) n += String(Math.floor(Math.random() * 10))
  return n
}

export const GAME_TYPES = [
  {
    type: 'tictactoe', label: 'TIC TAC TOE',
    desc: 'three in a row wins', Icon: TicTacToeIcon,
    badge: null, maxWidth: 'max-w-sm',
    category: 'board',
    durationMin: 1, tags: ['quick', 'thinky'], solo: true,
    boardSize: 9,
    getMoveIndex: (board, index) => (board[index] ? -1 : index),
    getWinner,
    BoardComponent: Board,
  },
  {
    type: 'ultimatettt', label: 'ULTIMATE TTT',
    desc: 'outsmart across nine boards', Icon: TicTacToeIcon,
    badge: 'U3', maxWidth: 'max-w-md',
    category: 'board',
    addedAt: '2026-07-04',
    durationMin: 6, tags: ['thinky'], solo: true,
    variantOf: 'tictactoe', variantLabel: 'ULTIMATE',
    variantBlurb: 'Nine tic-tac-toes in one. Your move sends your rival to the matching board. Win 3 boards in a row.',
    boardSize: UT_CELL_COUNT,
    getMoveIndex: (board, move) => (board[move] ? -1 : move),
    BoardComponent: UltimateTttBoard,
    applyMove: ({ board, game, index, symbol }) => {
      const uWon = normalizeUWon(game.uWon)
      const active = game.uActiveBoard ?? -1
      const res = applyUltimateMove(board, uWon, active, index, symbol)
      if (!res) return null
      return {
        updates: {
          board: res.board,
          uWon: res.uWon,
          uActiveBoard: res.activeBoard,
          currentTurn: symbol === 'X' ? 'O' : 'X',
        },
        result: getUltimateWinner(res.uWon),
      }
    },
    boardProps: (game) => ({
      uWon: normalizeUWon(game.uWon),
      uActiveBoard: game.uActiveBoard ?? -1,
    }),
  },
  {
    type: 'connectfour', label: 'CONNECT FOUR',
    desc: 'four in a row wins', Icon: ConnectFourIcon,
    badge: 'C4', maxWidth: 'max-w-md',
    category: 'board',
    durationMin: 4, tags: ['thinky'], solo: true,
    boardSize: CF_BOARD_SIZE,
    getMoveIndex: getConnectFourDrop,
    getWinner: getConnectFourWinner,
    BoardComponent: ConnectFourBoard,
  },
  {
    type: 'connectfourpop', label: 'C4 POP OUT',
    desc: 'connect four, then pop', Icon: ConnectFourIcon,
    badge: 'C4P', maxWidth: 'max-w-md',
    category: 'board',
    addedAt: '2026-07-04',
    durationMin: 5, tags: ['thinky'], solo: true,
    variantOf: 'connectfour', variantLabel: 'POP OUT',
    variantBlurb: 'Classic Connect Four, but on your turn you can pop one of your own bottom discs out — the whole column slides down.',
    boardSize: CF_BOARD_SIZE,
    getMoveIndex: (board, move) => {
      if (move?.action === 'pop') return board[bottomIndex(move.col)] ? bottomIndex(move.col) : -1
      return getConnectFourDrop(board, move?.col)
    },
    BoardComponent: ConnectFourBoard,
    applyMove: ({ board, move, symbol }) => {
      const res = applyConnectFourPopMove(board, move, symbol)
      if (!res) return null
      return {
        updates: { board: res.board, currentTurn: symbol === 'X' ? 'O' : 'X' },
        result: res.result,
      }
    },
    boardProps: () => ({ popMode: true }),
  },
  {
    type: 'hangwoman', label: 'HANGWOMAN',
    desc: 'guess the hidden word', Icon: HangwomanIcon,
    badge: 'HW', maxWidth: 'max-w-sm',
    category: 'word',
    durationMin: 3, tags: ['quick', 'thinky'], solo: true,
    custom: true,
  },
  {
    type: 'dotsandboxes', label: 'DOTS & BOXES',
    desc: 'claim the most boxes', Icon: DotsAndBoxesIcon,
    badge: 'DB', maxWidth: 'max-w-sm',
    category: 'board',
    durationMin: 8, tags: ['thinky'], solo: true,
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
    desc: 'spell the most S-O-S', Icon: SosIcon,
    badge: 'SOS', maxWidth: 'max-w-sm',
    category: 'board',
    durationMin: 10, tags: ['thinky'], solo: true,
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
    desc: 'repeat the growing pattern', Icon: SimonIcon,
    badge: 'SQ', maxWidth: 'max-w-xs',
    category: 'memory',
    durationMin: 3, tags: ['quick', 'thinky'], solo: true,
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
    desc: 'recall numbered tiles fast', Icon: ChimpIcon,
    badge: 'CT', maxWidth: 'max-w-xs',
    category: 'memory',
    durationMin: 2, tags: ['quick', 'thinky'], solo: true,
    custom: true,
  },
  {
    type: 'numbermemory', label: 'NUMBER MEMORY',
    desc: 'memorize the growing number', Icon: NumberMemoryIcon,
    badge: 'NM', maxWidth: 'max-w-xs',
    category: 'memory',
    durationMin: 2, tags: ['quick', 'thinky'], solo: true,
    custom: true,
  },
  {
    type: 'reaction', label: 'REACTION TIME',
    desc: 'fastest reflexes win', Icon: ReactionIcon,
    badge: 'RT', maxWidth: 'max-w-xs',
    category: 'reflex',
    durationMin: 1, tags: ['quick', 'skill'], solo: true,
    custom: true,
  },
  {
    type: 'aim', label: 'AIM TRAINER',
    desc: 'click targets fast', Icon: AimIcon,
    badge: 'AT', maxWidth: 'max-w-xs',
    category: 'reflex',
    durationMin: 2, tags: ['quick', 'skill'], solo: true,
    custom: true,
  },
  {
    type: 'typing', label: 'TYPING RACE',
    desc: "outtype your opponent's ghost", Icon: TypingIcon,
    badge: 'TR', maxWidth: 'max-w-sm',
    category: 'reflex',
    durationMin: 2, tags: ['quick', 'skill'], solo: true,
    custom: true,
  },
  {
    type: 'math', label: 'MENTAL MATH',
    desc: 'solve fastest under pressure', Icon: MathIcon,
    badge: 'MM', maxWidth: 'max-w-xs',
    category: 'reflex',
    durationMin: 2, tags: ['quick', 'skill'], solo: true,
    custom: true,
  },
  {
    type: 'pong', label: 'PONG',
    desc: 'first to five points', Icon: PongIcon,
    badge: 'PG', maxWidth: 'max-w-md',
    category: 'reflex',
    durationMin: 5, tags: ['frantic', 'skill'], solo: true,
    custom: true, realtime: true,
  },
  {
    type: 'snake', label: 'SNAKE BATTLE',
    desc: 'outlast the other snake', Icon: SnakeIcon,
    badge: 'SN', maxWidth: 'max-w-md',
    category: 'reflex',
    durationMin: 4, tags: ['frantic', 'skill'], solo: true,
    custom: true, realtime: true,
  },
  {
    type: 'tron', label: 'TRON',
    desc: "don't crash first", Icon: TronIcon,
    badge: 'TR', maxWidth: 'max-w-md',
    category: 'reflex',
    addedAt: '2026-07-04',
    durationMin: 2, tags: ['quick', 'frantic', 'skill'], solo: true,
    custom: true, realtime: true,
  },
  {
    type: 'sumo', label: 'SUMO ARENA',
    desc: 'shove them off the ledge', Icon: SumoIcon,
    badge: 'SM', maxWidth: 'max-w-md',
    category: 'reflex',
    addedAt: '2026-07-04',
    durationMin: 2, tags: ['quick', 'frantic', 'skill'], solo: true,
    custom: true, realtime: true,
  },
  {
    type: 'spaceduel', label: 'SPACE DUEL',
    desc: "blast your rival's ship", Icon: SpaceDuelIcon,
    badge: 'SD', maxWidth: 'max-w-md',
    category: 'reflex',
    addedAt: '2026-07-04',
    durationMin: 2, tags: ['quick', 'frantic', 'skill'], solo: true,
    custom: true, realtime: true,
  },
  {
    type: 'visualmemory', label: 'VISUAL MEMORY',
    desc: 'remember the lit tiles', Icon: VisualMemoryIcon,
    badge: 'VM', maxWidth: 'max-w-xs',
    category: 'memory',
    durationMin: 2, tags: ['quick', 'thinky'], solo: true,
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
  {
    type: 'gomoku', label: 'GOMOKU',
    desc: 'five in a row wins', Icon: GomokuIcon,
    badge: 'GO', maxWidth: 'max-w-md',
    category: 'board',
    durationMin: 8, tags: ['thinky'], solo: true,
    boardSize: GOMOKU_CELL_COUNT,
    getMoveIndex: (board, i) => (board[i] ? -1 : i),
    getWinner: getGomokuWinner,
    BoardComponent: GomokuBoard,
  },
  {
    type: 'reversi', label: 'REVERSI',
    desc: 'flip the board your way', Icon: ReversiIcon,
    badge: 'RV', maxWidth: 'max-w-sm',
    category: 'board',
    durationMin: 10, tags: ['thinky'], solo: true,
    boardSize: REVERSI_SIZE,
    getMoveIndex: (board, index) => (board[index] ? -1 : index),
    BoardComponent: ReversiBoard,
    applyMove: ({ board, index, symbol }) => {
      const moved = applyReversiMove(board, index, symbol)
      if (!moved) return null
      const opp = symbol === 'X' ? 'O' : 'X'
      const nextTurn = hasAnyMove(moved.board, opp) ? opp : symbol
      return {
        updates: { board: moved.board, currentTurn: nextTurn },
        result: getReversiWinner(moved.board),
      }
    },
  },
  {
    type: 'chainreaction', label: 'CHAIN REACTION',
    desc: 'trigger chain explosions', Icon: ChainReactionIcon,
    badge: 'CR', maxWidth: 'max-w-xs',
    category: 'board',
    addedAt: '2026-07-04',
    durationMin: 6, tags: ['thinky'], solo: true,
    boardSize: CR_CELL_COUNT,
    getMoveIndex: (_board, index) => {
      if (index < 0 || index >= CR_CELL_COUNT) return -1
      // Ownership check is done in applyMove; any in-range index passes here.
      return index
    },
    BoardComponent: ChainReactionBoard,
    applyMove: ({ board, game, index, symbol }) =>
      applyChainReactionMove({ board, game, index, symbol }),
    boardProps: (game) => ({ crLastMove: game.crLastMove ?? null }),
  },
  {
    type: 'orderchaos', label: 'ORDER & CHAOS',
    desc: 'order builds, chaos blocks', Icon: OrderChaosIcon,
    badge: 'OC', maxWidth: 'max-w-sm',
    category: 'board',
    durationMin: 6, tags: ['thinky'], solo: true,
    boardSize: OC_CELL_COUNT,
    getMoveIndex: (board, move) => (board[move.index] ? -1 : move.index),
    BoardComponent: OrderChaosBoard,
    applyMove: ({ board, move, symbol }) => {
      const applied = applyOrderChaosMove(board, move.index, move.letter)
      if (!applied) return null
      return {
        updates: { board: applied.board, currentTurn: symbol === 'X' ? 'O' : 'X' },
        result: getOrderChaosWinner(applied.board),
      }
    },
  },
  {
    type: 'dice', label: 'PIG',
    desc: 'push your luck, bank often', Icon: DiceIcon,
    badge: 'PIG', maxWidth: 'max-w-xs',
    category: 'dicebluff',
    durationMin: 5, tags: ['luck'], solo: true,
    boardSize: 0,
    getMoveIndex: () => 0,
    BoardComponent: DiceBoard,
    applyMove: ({ game, move, symbol }) => {
      // `move` is a string ('roll'/'bank') from the bot/demo harness, or
      // { action, face } from Game.jsx (precomputed deterministic face).
      const action = typeof move === 'string' ? move : move?.action
      const face = typeof move === 'string' ? undefined : move?.face
      return applyDiceMove(game, action, symbol, face)
    },
    boardProps: (game) => ({
      diceScoreX: game.diceScoreX ?? 0,
      diceScoreO: game.diceScoreO ?? 0,
      diceTurnScore: game.diceTurnScore ?? 0,
      diceLast: game.diceLast ?? null,
      diceRolls: Array.isArray(game.diceRolls) ? game.diceRolls : [],
      diceSeed: game.diceSeed ?? null,
    }),
  },
  {
    type: 'twotruths', label: 'TWO TRUTHS',
    desc: 'spot the lie', Icon: TwoTruthsIcon,
    badge: 'TT', maxWidth: 'max-w-sm',
    category: 'word',
    durationMin: 3, tags: ['quick', 'thinky'],
    custom: true,
  },
  {
    type: 'bluff', label: 'BLUFF BATTLE',
    desc: 'outroll the liar', Icon: BluffIcon,
    badge: 'BB', maxWidth: 'max-w-sm',
    category: 'dicebluff',
    durationMin: 5, tags: ['luck', 'thinky'],
    custom: true,
  },
  {
    type: 'wavelength', label: 'WAVELENGTH',
    desc: 'guess the hidden target', Icon: WavelengthIcon,
    badge: 'WL', maxWidth: 'max-w-sm',
    category: 'party',
    durationMin: 10, tags: ['thinky'],
    custom: true, nPlayer: true, minPlayers: 3, maxPlayers: 8,
    startRound: (players) => ({
      round: {
        clueGiver: seatOrderWL(players)[0] ?? null,
        phase: 'clue',
        spectrumIndex: randomSpectrumIndex(),
        clue: '', commitment: null, guesses: null, reveal: null,
      },
    }),
  },
  {
    type: 'fibbage', label: 'FIBBAGE',
    desc: 'bluff a believable answer', Icon: FibbageIcon,
    badge: 'FB', maxWidth: 'max-w-sm',
    category: 'party',
    durationMin: 10, tags: ['thinky'],
    custom: true, nPlayer: true, minPlayers: 3, maxPlayers: 8,
    startRound: () => ({ round: { phase: 'lying', promptIndex: 0 } }),
  },
  {
    type: 'spyfair', label: 'SPYFAIR',
    desc: 'find the spy among you', Icon: SpyfairIcon,
    badge: 'SF', maxWidth: 'max-w-sm',
    category: 'party',
    durationMin: 10, tags: ['thinky'],
    custom: true, nPlayer: true, minPlayers: 3, maxPlayers: 8,
    // no startRound — SpyfairGame drives its own round start
  },
  {
    type: 'wordduel', label: 'WORD DUEL',
    desc: 'race to guess the word', Icon: WordDuelIcon,
    badge: 'WD', maxWidth: 'max-w-sm',
    category: 'word',
    addedAt: '2026-07-04',
    durationMin: 3, tags: ['quick', 'thinky'], solo: true,
    custom: true,
  },
]

const NEW_BADGE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

export const isNewGame = (entry, now = new Date()) => {
  if (!entry?.addedAt) return false
  const addedAt = new Date(entry.addedAt)
  return now.getTime() - addedAt.getTime() <= NEW_BADGE_WINDOW_MS
}

export const getGameConfig = (type) => GAME_TYPES.find(t => t.type === type) ?? GAME_TYPES[0]

export const GAME_CATEGORIES = [
  { id: 'board',     label: 'BOARD',  full: 'BOARD GAMES' },
  { id: 'reflex',    label: 'REFLEX', full: 'REFLEX & SKILL' },
  { id: 'memory',    label: 'MEMORY', full: 'MEMORY' },
  { id: 'word',      label: 'WORD',   full: 'WORD GAMES' },
  { id: 'dicebluff', label: 'DICE',   full: 'DICE & BLUFF' },
  { id: 'party',     label: 'PARTY',  full: 'PARTY · 3–8 PLAYERS' },
]

export const getPlayerTag = (cfg) =>
  cfg?.nPlayer ? `${cfg.minPlayers}-${cfg.maxPlayers}P` : '2P'

// Nulls for every game-specific field — spread into freshGameState so switching
// games clears the previous game's keys from Firebase.
const FIELD_NULLS = {
  uWon: null, uActiveBoard: null,
  sosLines: null,
  simonSequence: null, simonProgress: null,
  chimpLevel: null, chimpLayout: null,
  chimpProgressX: null, chimpProgressO: null,
  chimpDoneX: null, chimpDoneO: null,
  vmLevel: null, vmPattern: null, vmClicked: null,
  numRound: null,
  reactionTimesX: null, reactionTimesO: null,
  aimTimesX: null, aimTimesO: null, aimMissesX: null, aimMissesO: null,
  aimEndTime: null, aimTargetX: null, aimTargetO: null,
  aimScoreX: null, aimScoreO: null,
  aimHitsX: null, aimHitsO: null,
  aimFriendlyX: null, aimFriendlyO: null,
  typingPassage: null, typingStartedAt: null,
  typingProgressX: null, typingProgressO: null,
  typingWpmX: null, typingWpmO: null,
  typingAccX: null, typingAccO: null,
  mathSeed: null, mathQIndex: null, mathQStartAt: null, // mathQIndex/mathQStartAt: legacy shared-index keys, kept so stale rooms still clear
  mathQIndexX: null, mathQIndexO: null,
  mathScoreX: null, mathScoreO: null,
  mathStreakX: null, mathStreakO: null,
  mathCorrectX: null, mathCorrectO: null,
  mathWrongX: null, mathWrongO: null,
  mathStartedAt: null, mathEndTime: null,
  diceScoreX: null, diceScoreO: null, diceTurnScore: null, diceLast: null,
  diceRolls: null, diceRollIndex: null,
  diceSeed: null, diceSeedCommitX: null, diceSeedRevealX: null, diceSeedB: null,
  bluffRound: null,
  pongScoreX: null, pongScoreO: null, signaling: null, matchLength: null,
  snakeScoreX: null, snakeScoreO: null,
  tronScoreX: null, tronScoreO: null,
  sumoScoreX: null, sumoScoreO: null,
  spaceduelScoreX: null, spaceduelScoreO: null,
  spaceduelHitsX: null, spaceduelHitsO: null,
  crMoves: null,
  crLastMove: null,
}

export function freshGameState(gameType) {
  const cfg = getGameConfig(gameType)
  if (cfg.nPlayer) {
    return { ...FIELD_NULLS, board: null, boxes: null, currentTurn: null, round: null }
  }
  if (gameType === 'hangwoman') {
    return { ...FIELD_NULLS, board: null, currentTurn: null, boxes: null,
      round: { setter: 'X', phase: 'setting', wrongCount: 0 } }
  }
  if (gameType === 'ultimatettt') {
    return { ...FIELD_NULLS, boxes: null, round: null,
      board: Array(UT_CELL_COUNT).fill(''),
      uWon: Array(UT_BOARD_COUNT).fill(''),
      uActiveBoard: -1,
      currentTurn: 'X' }
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
  if (gameType === 'pong') {
    // currentTurn omitted (null) — Pong has no turns, so Game.jsx's move-sound
    // detection stays silent and the page drives its own audio.
    // matchLength: rounds needed to win the match (default 3 = best-of-5).
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      pongScoreX: 0, pongScoreO: 0, matchLength: 3 }
  }
  if (gameType === 'snake') {
    // currentTurn omitted (null) — Snake is real-time with no turns.
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      snakeScoreX: 0, snakeScoreO: 0 }
  }
  if (gameType === 'tron') {
    // Single-round: no currentTurn, no mid-round score counter. tronScore keys
    // are cosmetic (1 for the winner, 0 otherwise) for the finished card.
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      tronScoreX: 0, tronScoreO: 0 }
  }
  if (gameType === 'sumo') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      sumoScoreX: 0, sumoScoreO: 0 }
  }
  if (gameType === 'spaceduel') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      spaceduelScoreX: 0, spaceduelScoreO: 0,
      spaceduelHitsX: 0, spaceduelHitsO: 0 }
  }
  if (gameType === 'aim') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      aimScoreX: 0, aimScoreO: 0, aimHitsX: 0, aimHitsO: 0, aimFriendlyX: 0, aimFriendlyO: 0 }
  }
  if (gameType === 'typing') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      typingPassage: PASSAGES[Math.floor(Math.random() * PASSAGES.length)],
      typingProgressX: 0, typingProgressO: 0 }
  }
  if (gameType === 'math') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      mathSeed: generateSeed(),
      mathQIndexX: 0, mathQIndexO: 0, // per-player progression through the same seeded sequence
      mathScoreX: 0, mathScoreO: 0,
      mathStreakX: 0, mathStreakO: 0,
      mathCorrectX: 0, mathCorrectO: 0,
      mathWrongX: 0, mathWrongO: 0,
    }
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
  if (gameType === 'reversi') {
    return { ...FIELD_NULLS, boxes: null, round: null,
      board: reversiInitialBoard(), currentTurn: 'X' }
  }
  if (gameType === 'chainreaction') {
    return { ...FIELD_NULLS, boxes: null, round: null,
      board: Array(CR_CELL_COUNT).fill(''), currentTurn: 'X', crMoves: 0 }
  }
  if (gameType === 'dice') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: 'X',
      diceScoreX: 0, diceScoreO: 0, diceTurnScore: 0, diceLast: null,
      diceRolls: [], diceRollIndex: 0,
      diceSeed: null, diceSeedCommitX: null, diceSeedRevealX: null, diceSeedB: null }
  }
  if (gameType === 'twotruths') {
    return { ...FIELD_NULLS, board: null, currentTurn: null, boxes: null,
      round: { setter: 'X', phase: 'writing' } }
  }
  if (gameType === 'bluff') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      bluffRound: { phase: 'rolling', turn: 'X', diceCountX: 5, diceCountO: 5 } }
  }
  if (gameType === 'wordduel') {
    return { ...FIELD_NULLS, board: null, boxes: null, currentTurn: null,
      round: { phase: 'setting' } }
  }
  return { ...FIELD_NULLS, board: Array(cfg.boardSize).fill(''), boxes: null, round: null, currentTurn: 'X' }
}
