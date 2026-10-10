import { lazyWithRetry } from './lazyWithRetry'
// ChimpBoard is used only from ChimpGame (custom component), not directly via registry
import {
  TicTacToeIcon, ConnectFourIcon, HangwomanIcon, DotsAndBoxesIcon, SosIcon,
  SimonIcon, ChimpIcon, NumberMemoryIcon, VisualMemoryIcon, ReactionIcon, AimIcon, PulpIcon,
  TypingIcon, MathIcon,
  GomokuIcon, ReversiIcon, OrderChaosIcon, DiceIcon, TwoTruthsIcon, BluffIcon,
  WavelengthIcon, FibbageIcon, SpyfairIcon, PongIcon, SnakeIcon,
  TronIcon, SumoIcon, SpaceDuelIcon, ChainReactionIcon,
  WordDuelIcon, WordCoopIcon, WordRaceIcon, BlockadeIcon, PairsIcon, WordHuntIcon, PaintIcon, SketchIcon,
  PasswordIcon, AnagramsIcon, ArrowsIcon, UpdraftIcon,
  PacmacIcon, HexIcon, MinesIcon, HerdIcon, TriviaIcon, BattleshipIcon,
  MancalaIcon, CheckersIcon, AirHockeyIcon, PuckRushIcon, FenderBenderIcon, YachtIcon, FaceOffIcon, ChopChopIcon, DartsIcon, StickyFingersIcon, LazySusanIcon, FirstCutIcon, ArtilleryIcon, ArcheryIcon,
  SimIcon, ChompIcon, BreakthroughIcon, AtaxxIcon, KamisadoIcon,
  OnitamaIcon, QuartoIcon, SantoriniIcon, LoaIcon, YavalathIcon,
  HeadsUpIcon, ChameleonIcon,
} from '../components/GameIcons'
import { LanternsIcon, DockingIcon } from '../components/GameIcons'
import { CodeWordsIcon, JustOneIcon } from '../components/GameIcons'
import { HunchIcon, ConvergeIcon } from '../components/GameIcons'
import {
  VerbalMemoryIcon, NBackIcon, CupShuffleIcon, WhatChangedIcon, KimsGameIcon, NameTagsIcon, SplitSignalIcon,
} from '../components/GameIcons'
import { memLevelStart, memStreamStart, newSeed } from './memoryRaceLogic'
import { WireCrossedIcon, AnimalStackIcon, MinigolfIcon, BirdseyeIcon, PartyIcon } from '../components/GameIcons'
import { FORTS as BIRDSEYE_FORTS, freshDuel, nextFortIndex } from './birdseyeCore'
import { getWinner, normalizeBoard } from './gameLogic'
import { getConnectFourWinner, getConnectFourDrop, CF_BOARD_SIZE, CF5 } from './connectFourLogic'
import {
  SIM_EDGE_COUNT, getSimWinner, getMoveIndex as simMoveIndex,
} from './simLogic'
import {
  CHOMP_CELL_COUNT, applyChompMove, getChompWinner,
} from './chompLogic'
import {
  BT_CELL_COUNT, INITIAL_BREAKTHROUGH,
  applyBreakthroughMove, getBreakthroughWinner,
} from './breakthroughLogic'
import {
  AX_CELL_COUNT, INITIAL_ATAXX,
  applyAtaxxMove, getAtaxxWinner,
} from './ataxxLogic'
import {
  KM_CELL_COUNT, INITIAL_KAMISADO, INITIAL_KAMISADO_TOWERS,
  applyKamisadoMove,
} from './kamisadoLogic'
import {
  ON_CELL_COUNT, INITIAL_ONITAMA, dealCards,
  applyOnitamaMove, normalizeOnBoard,
} from './onitamaLogic'
import {
  QRT_CELL_COUNT, applyQuartoMove, dealQuarto,
  normalizeQuartoBoard,
} from './quartoLogic'
import {
  ST_CELL_COUNT, INITIAL_SANTORINI,
  applyStMove, normalizeStBoard, normalizeStWorkers,
} from './santoriniLogic'
import {
  LOA_CELL_COUNT, INITIAL_LOA,
  applyLoaMove, normalizeLoaBoard,
} from './loaLogic'
import {
  YV_CELL_COUNT, applyYavalathMove, normalizeYvBoard,
} from './yavalathLogic'
import {
  UT_CELL_COUNT, UT_BOARD_COUNT, applyUltimateMove, getUltimateWinner, normalizeUWon,
} from './ultimateTttLogic'
import { applyConnectFourPopMove, bottomIndex } from './connectFourPopLogic'
import {
  DB_EDGE_COUNT,
  DB_BOX_COUNT,
  DB_SIZE,
  DB_SIZE_CLASSIC,
  DB_EDGE_COUNT_CLASSIC,
  DB_BOX_COUNT_CLASSIC,
  dbConfig,
  applyEdgeMove,
  getDotsAndBoxesWinner,
  boxMargin,
} from './dotsAndBoxesLogic'
import {
  SOS_CELL_COUNT,
  normalizeSosLines,
  applySosMove,
  getSosWinner,
  sosMargin,
} from './sosLogic'
import { normalizeSimonSequence, applySimonMove } from './simonLogic'
import {
  CHIMP_START_LEVEL,
  generateChimpLayout,
} from './chimpLogic'
import { generateSeed } from './mathLogic'
import { startStackMatch } from './animalStackCore'
import { arrowsFreshState, arrowsNextRound } from './arrowsLogic'
import { MATCH_TARGET as UPDRAFT_MATCH_TARGET, updraftFreshState } from './updraftConfig'
import { ARCHERY_SEATS, archeryFormat } from './archeryLogic'
import {
  createRound as createDartsRound, normalizeCfg as normalizeDartsCfg,
  MIN_PLAYERS as DARTS_MIN_PLAYERS, MAX_PLAYERS as DARTS_MAX_PLAYERS,
} from './dartsLogic'
import { generateGrid } from './wordhuntGrid'
import { nextWireBomb } from './wireMatchLogic'
import {
  VM_START_LEVEL,
  normalizeVmArray,
  generateVmPattern,
  applyVmMove,
} from './visualMemoryLogic'
import { getGomokuWinner, GOMOKU_CELL_COUNT, applyGomokuMove, getMoveIndex as getGomokuMoveIndex } from './gomokuLogic'
import { REVERSI_SIZE, reversiInitialBoard, applyReversiMove, hasAnyMove, getReversiWinner } from './reversiLogic'
import { OC_CELL_COUNT, applyOrderChaosMove, getOrderChaosWinner } from './orderChaosLogic'
import { CR_CELL_COUNT, CR_CELL_COUNT_CLASSIC, CR_COLS, CR_ROWS, CR_COLS_CLASSIC, CR_ROWS_CLASSIC, CR_SYMBOLS_4, applyChainReactionMove } from './chainReactionLogic'
import {
  BK_CELL_COUNT,
  BK_WALL_SLOT_COUNT,
  BK_WALLS_PER_PLAYER,
  BK_START_X,
  BK_START_O,
  applyBlockadeMove,
} from './blockadeLogic'
import { applyDiceMove, generateSeedHex, rollFace, rollFacePair } from './diceLogic'
import { createRound as createYachtRound, MIN_PLAYERS as YACHT_MIN_PLAYERS, MAX_PLAYERS as YACHT_MAX_PLAYERS } from './yachtLogic'
import { createRound as createSusanRound, MIN_PLAYERS as SUSAN_MIN_PLAYERS, MAX_PLAYERS as SUSAN_MAX_PLAYERS } from './lazySusanRound'
import { runPigRoomEffect } from '../hooks/room/pigSeedProtocol'
import { seatOrder as seatOrderWL, pickSpectrumIndex } from './wavelengthLogic'
import {
  PAIRS_CELL_COUNT, PAIRS_QUICK_CELL_COUNT,
  generatePairsDeck,
  normalizePairsDeck,
  normalizePairsFlipped,
  applyPairsMove,
  getPairsWinner,
} from './pairsLogic'
import { seatOrder as seatOrderSketch, CHOOSE_MS as SKETCH_CHOOSE_MS, sketchChatLock } from './sketchLogic'
import { scaledMs } from './timerScale'
import {
  INITIAL_PITS,
  normalizePits,
  applyMancalaMove,
} from './mancalaLogic'
import {
  INITIAL_CHECKERS,
} from './checkersLogic'
import { getTicTacToe4Winner } from './tictactoe4Logic'
import { applyDiceBigMove } from './diceLogic'
import { getHexWinner, HEX_CELL_COUNT, applyHexMove, getMoveIndex as getHexMoveIndex } from './hexLogic'
import { generateNumber } from './numberMemoryLogic'
import { DISC_LAND_MS } from './motion'

// Board and page components load on demand: the registry sits in the entry
// chunk (Home renders the picker from it), so eager imports here would pull
// every game's UI into the first download. lazyWithRetry reloads once when
// a chunk from an older deploy is gone.
const Board = lazyWithRetry(() => import('../components/Board'))
const ConnectFourBoard = lazyWithRetry(() => import('../components/ConnectFourBoard'))
const DotsAndBoxesBoard = lazyWithRetry(() => import('../components/DotsAndBoxesBoard'))
const SosBoard = lazyWithRetry(() => import('../components/SosBoard'))
const SimonBoard = lazyWithRetry(() => import('../components/SimonBoard'))
const VisualMemoryBoard = lazyWithRetry(() => import('../components/VisualMemoryBoard'))
const BlockadeBoard = lazyWithRetry(() => import('../components/BlockadeBoard'))
const SimBoard = lazyWithRetry(() => import('../components/SimBoard'))
const ChompBoard = lazyWithRetry(() => import('../components/ChompBoard'))
const BreakthroughBoard = lazyWithRetry(() => import('../components/BreakthroughBoard'))
const AtaxxBoard = lazyWithRetry(() => import('../components/AtaxxBoard'))
const KamisadoBoard = lazyWithRetry(() => import('../components/KamisadoBoard'))
const OnitamaBoard = lazyWithRetry(() => import('../components/OnitamaBoard'))
const QuartoBoard = lazyWithRetry(() => import('../components/QuartoBoard'))
const SantoriniBoard = lazyWithRetry(() => import('../components/SantoriniBoard'))
const LoaBoard = lazyWithRetry(() => import('../components/LoaBoard'))
const YavalathBoard = lazyWithRetry(() => import('../components/YavalathBoard'))
const UltimateTttBoard = lazyWithRetry(() => import('../components/UltimateTttBoard'))
const GomokuBoard = lazyWithRetry(() => import('../components/GomokuBoard'))
const ReversiBoard = lazyWithRetry(() => import('../components/ReversiBoard'))
const OrderChaosBoard = lazyWithRetry(() => import('../components/OrderChaosBoard'))
const ChainReactionBoard = lazyWithRetry(() => import('../components/ChainReactionBoard'))
const DiceBoard = lazyWithRetry(() => import('../components/DiceBoard'))
const PairsBoard = lazyWithRetry(() => import('../components/PairsBoard'))
const MancalaBoard = lazyWithRetry(() => import('../components/MancalaBoard'))
const HexBoard = lazyWithRetry(() => import('../components/HexBoard'))

// generateNumber moved to numberMemoryLogic.js (single tested source).

function dotsAndBoxesMove(size) {
  const { boxCount } = dbConfig(size)
  return ({ board, game, index, symbol }) => {
    const boxes = normalizeBoard(game.boxes, boxCount)
    const moved = applyEdgeMove(board, boxes, index, symbol, size)
    if (!moved) return null
    const extraTurn = moved.completedBoxes.length > 0
    return {
      updates: {
        board: moved.edges,
        boxes: moved.boxes,
        currentTurn: extraTurn ? symbol : (symbol === 'X' ? 'O' : 'X'),
        extraTurn: extraTurn ? true : null,
      },
      result: getDotsAndBoxesWinner(moved.boxes, size),
    }
  }
}

export const GAME_TYPES = [
  {
    type: 'tictactoe', label: 'TIC TAC TOE',
    desc: 'three in a row wins', Icon: TicTacToeIcon,
    badge: null, maxWidth: 'max-w-sm',
    category: 'board',
    durationMin: 1, tags: ['quick', 'thinky'], solo: true,
    classicLabel: '3×3',
    classicBlurb: 'Three in a row on a 3×3. The original.',
    boardSize: 9,
    getMoveIndex: (board, index) => (board[index] ? -1 : index),
    getWinner,
    BoardComponent: Board,
    focus: true,
  },
  {
    type: 'sim', label: 'SIM',
    desc: "color an edge, don't close a triangle", Icon: SimIcon,
    badge: 'SIM', maxWidth: 'max-w-sm',
    category: 'board',
    addedAt: '2026-09-17',
    durationMin: 3, tags: ['quick', 'thinky'], solo: true,
    boardSize: SIM_EDGE_COUNT,
    getMoveIndex: simMoveIndex,
    getWinner: getSimWinner,
    BoardComponent: SimBoard,
    focus: true,
  },
  {
    type: 'chomp', label: 'CHOMP',
    desc: 'eat the bar, dodge the poison', Icon: ChompIcon,
    badge: 'CH', maxWidth: 'max-w-sm',
    category: 'board',
    addedAt: '2026-09-17',
    durationMin: 4, tags: ['quick', 'thinky'], solo: true,
    boardSize: CHOMP_CELL_COUNT,
    getMoveIndex: (board, i) => (board[i] ? -1 : i),
    BoardComponent: ChompBoard,
    focus: true,
    applyMove: ({ board, index, symbol }) => {
      const moved = applyChompMove(board, index)
      if (!moved) return null
      return {
        updates: {
          board: moved.board,
          currentTurn: symbol === 'X' ? 'O' : 'X',
        },
        // The ONLY resolving event: the mover biting the poison themselves.
        // Leaving the poison alone does NOT resolve — the opponent must eat it.
        result: getChompWinner(moved.atePoison, symbol),
      }
    },
  },
  {
    type: 'breakthrough', label: 'BREAKTHROUGH',
    desc: 'race a pawn to the far row', Icon: BreakthroughIcon,
    badge: 'BT', maxWidth: 'max-w-md',
    category: 'board',
    addedAt: '2026-09-17',
    durationMin: 8, tags: ['thinky'], solo: true,
    boardSize: BT_CELL_COUNT,
    // Move payload { from, to }: getMoveIndex only checks payload shape (the
    // Mancala precedent) — ownership + legality live in applyBreakthroughMove.
    getMoveIndex: (_, move) =>
      move && Number.isInteger(move.from) && Number.isInteger(move.to) ? move.from : -1,
    BoardComponent: BreakthroughBoard,
    focus: true,
    applyMove: ({ board, move, symbol }) => {
      const moved = applyBreakthroughMove(board, move, symbol)
      if (!moved) return null
      return {
        updates: {
          board: moved.board,
          currentTurn: symbol === 'X' ? 'O' : 'X',
          lastMove: move.to,
        },
        result: getBreakthroughWinner(moved.board, symbol),
      }
    },
    boardProps: (game) => ({
      board: normalizeBoard(game.board, BT_CELL_COUNT),
    }),
  },
  {
    type: 'ataxx', label: 'ATAXX',
    desc: 'clone, jump, convert the neighborhood', Icon: AtaxxIcon,
    badge: 'AX', maxWidth: 'max-w-md',
    category: 'board',
    addedAt: '2026-09-17',
    durationMin: 6, tags: ['thinky'], solo: true,
    boardSize: AX_CELL_COUNT,
    // Payload { from, to }: shape check only (Mancala precedent) — ownership
    // + clone/jump legality live in applyAtaxxMove.
    getMoveIndex: (_, move) =>
      move && Number.isInteger(move.from) && Number.isInteger(move.to) ? move.from : -1,
    BoardComponent: AtaxxBoard,
    focus: true,
    applyMove: ({ board, game, move, symbol }) => {
      const moved = applyAtaxxMove(board, move, symbol)
      if (!moved) return null
      const moveCount = (game.ataxxMoves ?? 0) + 1
      return {
        updates: {
          board: moved.board,
          ataxxMoves: moveCount,
          // Pass note: if the opponent has no legal move they skip (Reversi
          // precedent) — surfaced by GameStatus as "OPPONENT PASSED".
          currentTurn: symbol === 'X' ? 'O' : 'X',
          passNote: null,
          lastMove: move.to,
        },
        result: getAtaxxWinner(moved.board, moveCount),
      }
    },
  },
  {
    type: 'kamisado', label: 'KAMISADO',
    desc: 'your landing picks their tower', Icon: KamisadoIcon,
    badge: 'KM', maxWidth: 'max-w-md',
    category: 'board',
    addedAt: '2026-09-17',
    durationMin: 10, tags: ['thinky'], solo: true,
    boardSize: KM_CELL_COUNT,
    // Payload { from, to }: shape check only (Mancala precedent) — ownership,
    // forward-glide legality and the forced-color rule live in applyKamisadoMove.
    getMoveIndex: (_, move) =>
      move && Number.isInteger(move.from) && Number.isInteger(move.to) ? move.from : -1,
    BoardComponent: KamisadoBoard,
    focus: true,
    applyMove: ({ board, game, move, symbol }) => {
      const forced = game.kamisadoColor ?? null
      const res = applyKamisadoMove(board, move, symbol, forced, { towers: game.kamisadoTowers })
      if (!res) return null
      // extraTurn (opponent's forced tower stuck): turn STAYS on the mover
      // with the constraint lifted (kamisadoColor null — any tower).
      const nextMover = res.extraTurn ? symbol : (symbol === 'X' ? 'O' : 'X')
      return {
        updates: {
          board: res.board,
          kamisadoTowers: res.towers,
          kamisadoColor: res.forcedColor,
          currentTurn: nextMover,
          extraTurn: res.extraTurn ? true : null,
          lastMove: move.to,
        },
        result: res.result,
      }
    },
    boardProps: (game) => ({
      board: normalizeBoard(game.board, KM_CELL_COUNT),
      forcedColor: game.kamisadoColor ?? null,
      towers: game.kamisadoTowers ?? null,
    }),
  },
  {
    type: 'onitama', label: 'ONITAMA',
    desc: 'the way of the master — your card becomes their move', Icon: OnitamaIcon,
    badge: 'ON', maxWidth: 'max-w-md',
    category: 'board',
    addedAt: '2026-09-17',
    durationMin: 15, tags: ['thinky'], solo: true,
    boardSize: ON_CELL_COUNT,
    // Payload { from, to, card }: shape check only (Mancala precedent) —
    // hand membership, card legality and captures live in applyOnitamaMove.
    getMoveIndex: (_, move) =>
      move && Number.isInteger(move.from) && Number.isInteger(move.to) ? move.from : -1,
    BoardComponent: OnitamaBoard,
    focus: true,
    applyMove: ({ board, game, move, symbol }) => {
      const hands = { handX: game.onitamaHandX, handO: game.onitamaHandO, spare: game.onitamaSpare }
      const res = applyOnitamaMove(board, move, symbol, hands)
      if (!res) return null
      return {
        updates: {
          board: res.board,
          onitamaHandX: res.handX,
          onitamaHandO: res.handO,
          onitamaSpare: res.spare,
          currentTurn: res.currentTurn,
          lastMove: move.to,
        },
        result: res.result,
      }
    },
    boardProps: (game) => ({
      board: normalizeOnBoard(game.board),
      handX: game.onitamaHandX ?? [],
      handO: game.onitamaHandO ?? [],
      spare: game.onitamaSpare ?? null,
    }),
  },
  {
    type: 'quarto', label: 'QUARTO',
    desc: 'place the piece you are given, give the next', Icon: QuartoIcon,
    badge: 'QT', maxWidth: 'max-w-md',
    category: 'board',
    addedAt: '2026-09-17',
    durationMin: 15, tags: ['thinky'], solo: true,
    boardSize: QRT_CELL_COUNT,
    // Payload { place, give }: `place` is the cell index; `give` the piece
    // handed over. Shape check only — shelf/pending rules in applyQuartoMove.
    getMoveIndex: (_, move) =>
      move && Number.isInteger(move.place) ? move.place : -1,
    BoardComponent: QuartoBoard,
    focus: true,
    applyMove: ({ board, game, move, symbol }) => {
      const res = applyQuartoMove(board, move, symbol, {
        unplaced: game.quartoUnplaced,
        pending: game.quartoPending,
      })
      if (!res) return null
      return {
        updates: {
          board: res.board,
          quartoUnplaced: res.unplaced,
          quartoPending: res.pending,
          currentTurn: res.currentTurn,
          lastMove: move.place,
        },
        result: res.result,
      }
    },
    boardProps: (game) => ({
      board: normalizeQuartoBoard(game.board),
      unplaced: game.quartoUnplaced ?? [],
      pending: game.quartoPending ?? null,
    }),
  },
  {
    type: 'santorini', label: 'SANTORINI',
    desc: 'climb the island, build their grave', Icon: SantoriniIcon,
    badge: 'SA', maxWidth: 'max-w-md',
    category: 'board',
    addedAt: '2026-09-17',
    durationMin: 12, tags: ['thinky'], solo: true,
    boardSize: ST_CELL_COUNT,
    getMoveIndex: (_, move) =>
      move && Number.isInteger(move.worker) && Number.isInteger(move.to) ? move.worker : -1,
    BoardComponent: SantoriniBoard,
    focus: true,
    applyMove: ({ board, game, move, symbol }) => {
      const res = applyStMove(
        { board, workers: game.santoriniWorkers },
        move,
        symbol,
      )
      if (!res) return null
      return {
        updates: {
          board: res.board,
          santoriniWorkers: res.workers,
          currentTurn: res.currentTurn,
          lastMove: move.build ?? move.to,
        },
        result: res.result,
      }
    },
    boardProps: (game) => ({
      board: normalizeStBoard(game.board),
      workers: normalizeStWorkers(game.santoriniWorkers),
    }),
  },
  {
    type: 'loa', label: 'LINES OF ACTION',
    desc: 'move as far as the line is crowded, unite all', Icon: LoaIcon,
    badge: 'LOA', maxWidth: 'max-w-md',
    category: 'board',
    addedAt: '2026-09-17',
    durationMin: 15, tags: ['thinky'], solo: true,
    boardSize: LOA_CELL_COUNT,
    getMoveIndex: (_, move) =>
      move && Number.isInteger(move.from) && Number.isInteger(move.to) ? move.from : -1,
    BoardComponent: LoaBoard,
    focus: true,
    applyMove: ({ board, move, symbol }) => {
      const res = applyLoaMove(board, move, symbol)
      if (!res) return null
      return {
        updates: {
          board: res.board,
          currentTurn: res.currentTurn,
          lastMove: move.to,
        },
        result: res.result,
      }
    },
    boardProps: (game) => ({
      board: normalizeLoaBoard(game.board),
    }),
  },
  {
    type: 'yavalath', label: 'YAVALATH',
    desc: 'four in a row wins — three in a row loses', Icon: YavalathIcon,
    badge: 'YV', maxWidth: 'max-w-md',
    category: 'board',
    addedAt: '2026-09-17',
    durationMin: 10, tags: ['thinky'], solo: true,
    boardSize: YV_CELL_COUNT,
    // Standard placement: payload = cell index.
    getMoveIndex: (board, i) => (!board[i] && Number.isInteger(i) ? i : -1),
    BoardComponent: YavalathBoard,
    focus: true,
    applyMove: ({ board, index, symbol }) => {
      const res = applyYavalathMove(board, index, symbol)
      if (!res) return null
      return {
        updates: {
          board: res.board,
          currentTurn: res.currentTurn,
          lastMove: index,
        },
        result: res.result,
      }
    },
    boardProps: (game) => ({
      board: normalizeYvBoard(game.board),
    }),
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
    focus: true,
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
    type: 'tictactoe4', label: 'TTT 4×4', desc: 'four in a row on 4×4',
    Icon: TicTacToeIcon, badge: 'TT4', maxWidth: 'max-w-sm',
    category: 'board', addedAt: '2026-08-15',
    durationMin: 3, tags: ['quick', 'thinky'], solo: true,
    variantOf: 'tictactoe', variantLabel: '4×4',
    variantBlurb: '16 cells. Four in a row wins. Three does not.',
    boardSize: 16,
    getMoveIndex: (board, i) => (board[i] ? -1 : i),
    getWinner: getTicTacToe4Winner,
    BoardComponent: Board,
    focus: true,
    boardProps: () => ({ cols: 4 }),
  },
  {
    type: 'connectfour', label: 'CONNECT FOUR',
    desc: 'four in a row wins', Icon: ConnectFourIcon,
    badge: 'C4', maxWidth: 'max-w-md',
    category: 'board',
    durationMin: 4, tags: ['thinky'], solo: true,
    classicLabel: '7×6',
    classicBlurb: 'The classic board. Four in a row wins.',
    boardSize: CF_BOARD_SIZE,
    getMoveIndex: getConnectFourDrop,
    getWinner: getConnectFourWinner,
    BoardComponent: ConnectFourBoard,
    focus: true,
    landMs: DISC_LAND_MS,
  },
  {
    type: 'connectfour5', label: 'C4 FIVE', desc: 'five in a row on 9×7',
    Icon: ConnectFourIcon, badge: 'C5', maxWidth: 'max-w-lg',
    category: 'board', addedAt: '2026-08-15',
    durationMin: 5, tags: ['thinky'], solo: true,
    variantOf: 'connectfour', variantLabel: '9×7 · 5',
    variantBlurb: '9×7 grid. Five in a row wins. Four does not.',
    boardSize: 63,
    getMoveIndex: (board, col) => getConnectFourDrop(board, col, CF5),
    getWinner: (board) => getConnectFourWinner(board, CF5),
    BoardComponent: ConnectFourBoard,
    focus: true,
    landMs: DISC_LAND_MS,
    boardProps: () => ({ cols: 9, rows: 7 }),
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
    focus: true,
    landMs: DISC_LAND_MS,
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
    custom: true, matchTarget: 3, hidePlayerCards: true,
    Page: lazyWithRetry(() => import('../pages/HangmanGame')),
  },
  {
    type: 'dotsandboxes', label: 'DOTS & BOXES',
    desc: 'claim the most boxes', Icon: DotsAndBoxesIcon,
    badge: 'DB', maxWidth: 'max-w-md',
    category: 'board',
    durationMin: 8, tags: ['thinky'], solo: true,
    classicLabel: '6×6',
    classicBlurb: '36 boxes on a 6×6 grid. First to 19 clinches.',
    boardSize: DB_EDGE_COUNT,
    getMoveIndex: (board, index) => (board[index] ? -1 : index),
    BoardComponent: DotsAndBoxesBoard,
    focus: true,
    applyMove: dotsAndBoxesMove(DB_SIZE),
    boardProps: (game) => ({ boxes: normalizeBoard(game.boxes, DB_BOX_COUNT), size: DB_SIZE }),
    resultMargin: (game, sym) => withUnit(boxMargin(normalizeBoard(game.boxes, DB_BOX_COUNT), sym, DB_SIZE), BOX_UNIT),
  },
  {
    type: 'dotsandboxes4', label: 'DOTS & BOXES 4×4',
    desc: 'classic 4×4 boxes', Icon: DotsAndBoxesIcon,
    badge: 'DB4', maxWidth: 'max-w-sm',
    category: 'board',
    durationMin: 5, tags: ['quick', 'thinky'], solo: true,
    variantOf: 'dotsandboxes', variantLabel: '4×4',
    variantBlurb: '16 boxes. First to 9 clinches. Bigger taps on a phone.',
    boardSize: DB_EDGE_COUNT_CLASSIC,
    getMoveIndex: (board, index) => (board[index] ? -1 : index),
    BoardComponent: DotsAndBoxesBoard,
    focus: true,
    applyMove: dotsAndBoxesMove(DB_SIZE_CLASSIC),
    boardProps: (game) => ({ boxes: normalizeBoard(game.boxes, DB_BOX_COUNT_CLASSIC), size: DB_SIZE_CLASSIC }),
    resultMargin: (game, sym) => withUnit(boxMargin(normalizeBoard(game.boxes, DB_BOX_COUNT_CLASSIC), sym, DB_SIZE_CLASSIC), BOX_UNIT),
  },
  {
    type: 'sos', label: 'SOS',
    desc: 'spell the most S-O-S', Icon: SosIcon,
    badge: 'SOS', maxWidth: 'max-w-sm',
    category: 'board',
    durationMin: 10, tags: ['thinky'], solo: true,
    boardSize: SOS_CELL_COUNT,
    getMoveIndex: (board, move) => {
      if (!move || typeof move !== 'object' || !Number.isInteger(move.index)) return -1
      return board[move.index] ? -1 : move.index
    },
    BoardComponent: SosBoard,
    focus: true,
    applyMove: ({ board, game, move, symbol }) => {
      const lines = normalizeSosLines(game.sosLines)
      const applied = applySosMove(board, lines, move.index, move.letter, symbol)
      if (!applied) return null
      // M-48: completing >=1 S-O-S grants an extra turn — flag it distinctly
      // (cleared/renewed on every subsequent move write) so GameStatus can
      // show a "GO AGAIN!" pulse instead of the normal turn text.
      const extraTurn = !!applied.completedCount
      return {
        updates: {
          board: applied.board,
          sosLines: applied.sosLines,
          currentTurn: extraTurn ? symbol : (symbol === 'X' ? 'O' : 'X'),
          extraTurn: extraTurn ? true : null,
        },
        result: getSosWinner(applied.board, applied.sosLines),
      }
    },
    boardProps: (game) => ({ sosLines: normalizeSosLines(game.sosLines) }),
    resultMargin: (game, sym) => withUnit(sosMargin(normalizeSosLines(game.sosLines), sym), ['S-O-S', 'S-O-S']),
  },
  {
    type: 'simon', label: 'SIMON',
    desc: 'repeat the growing pattern', Icon: SimonIcon,
    badge: 'SQ', maxWidth: 'max-w-xs',
    category: 'memory',
    durationMin: 3, tags: ['quick', 'thinky'], solo: true,
    // A solo run (beat your best), not a CPU opponent: the options sheet, the /solo
    // header and the tab title say so instead of "vs AI".
    soloRun: true, soloLabel: 'PLAY SOLO', soloBadge: '1P', soloBlurb: 'Beat your best run. No waiting.',
    boardSize: 0,
    getMoveIndex: (_, padIndex) => padIndex,
    BoardComponent: SimonBoard,
    focus: true,
    applyMove: ({ game, move, symbol }) => applySimonMove(game, move, symbol),
    boardProps: (game) => ({
      simonSequence: normalizeSimonSequence(game.simonSequence),
      simonProgress: game.simonProgress ?? 0,
      simonMiss: game.simonMiss ?? null,
      finished: game.status === 'finished',
      simonDeadline: game.simonDeadline ?? null,
      simonReplayUsed: !!game.simonReplayUsed,
    }),
    // SimonBoard plays each pad's own tone on tap; the generic move blip on top
    // of it made every press sound twice.
    quietMoves: true,
    // Pass-and-play hides the board until the next player taps ready (BotBoardDemo).
    handoffGate: true,
  },
  {
    type: 'chimp', label: 'CHIMP TEST',
    desc: 'recall numbered tiles fast', Icon: ChimpIcon,
    badge: 'CT', maxWidth: 'max-w-sm',
    category: 'memory',
    durationMin: 2, tags: ['quick', 'thinky'], solo: true,
    // A solo run (beat your best), not a CPU opponent: the options sheet, the /solo
    // header and the tab title say so instead of "vs AI".
    soloRun: true, soloLabel: 'PLAY SOLO', soloBadge: '1P', soloBlurb: 'Beat your best run. No waiting.',
    custom: true, simultaneous: true,
    Page: lazyWithRetry(() => import('../pages/ChimpGame')),
  },
  {
    type: 'numbermemory', label: 'NUMBER MEMORY',
    desc: 'memorize the growing number', Icon: NumberMemoryIcon,
    badge: 'NM', maxWidth: 'max-w-xs',
    category: 'memory',
    durationMin: 2, tags: ['quick', 'thinky'], solo: true,
    // A solo run (beat your best), not a CPU opponent: the options sheet, the /solo
    // header and the tab title say so instead of "vs AI".
    soloRun: true, soloLabel: 'PLAY SOLO', soloBadge: '1P', soloBlurb: 'Beat your best run. No waiting.',
    custom: true, simultaneous: true,
    Page: lazyWithRetry(() => import('../pages/NumberMemoryGame')),
  },
  {
    type: 'reaction', label: 'REACTION TIME',
    desc: 'fastest reflexes win', Icon: ReactionIcon,
    badge: 'RT', maxWidth: 'max-w-xs',
    category: 'reflex',
    durationMin: 1, tags: ['quick', 'skill'], solo: true,
    // N-player race (raceLogic.js / RaceShell): a party room of 2–8 racers.
    custom: true, simultaneous: true, race: true, nPlayer: true, minPlayers: 2, maxPlayers: 8,
    Page: lazyWithRetry(() => import('../pages/ReactionGame')),
  },
  {
    type: 'aim', label: 'AIM TRAINER',
    desc: 'click targets fast', Icon: AimIcon,
    badge: 'AT', maxWidth: 'max-w-sm',
    category: 'reflex',
    durationMin: 2, tags: ['quick', 'skill'], solo: true,
    custom: true, simultaneous: true, race: true, nPlayer: true, minPlayers: 2, maxPlayers: 8,
    Page: lazyWithRetry(() => import('../pages/AimTrainerGame')),
  },
  {
    type: 'chopchop', label: 'CHOP CHOP',
    desc: 'knock out crates, dodge the beams', Icon: ChopChopIcon,
    badge: 'CC', maxWidth: 'max-w-sm',
    category: 'reflex',
    addedAt: '2026-10-10',
    durationMin: 1, tags: ['quick', 'frantic', 'skill'], solo: true,
    // N-player race on one shared seeded stack (chopLogic.js / RaceShell).
    custom: true, simultaneous: true, race: true, nPlayer: true, minPlayers: 2, maxPlayers: 8,
    Page: lazyWithRetry(() => import('../pages/ChopChopGame')),
  },
  {
    type: 'firstcut', label: 'FIRST CUT',
    desc: 'cut the fruit, leave the lookalikes', Icon: FirstCutIcon,
    badge: 'FC', maxWidth: 'max-w-sm',
    category: 'reflex',
    addedAt: '2026-10-10',
    durationMin: 3, tags: ['quick', 'frantic', 'skill', 'party'], solo: true,
    // Everyone watches one plate and swings a katana at the fruit, not the
    // lookalikes (firstCutLogic.js). Online it is an N-player race on RaceShell:
    // every client plays the same seeded timetable and reports its own cut times.
    // LocalPage: /local/firstcut puts 2-4 players round one phone.
    custom: true, simultaneous: true, race: true, nPlayer: true, minPlayers: 2, maxPlayers: 8, localMaxPlayers: 4,
    Page: lazyWithRetry(() => import('../pages/FirstCutGame')),
    localBlurb: 'ONE PHONE · EVERYONE CUTS AT ONCE',
    LocalPage: lazyWithRetry(() => import('../pages/FirstCutDemo').then(m => ({ default: m.FirstCutLocal }))),
  },
  {
    type: 'pulprush', label: 'PULP RUSH',
    desc: 'slice the produce, dodge the rot', Icon: PulpIcon,
    badge: 'PR', maxWidth: 'max-w-sm',
    classicLabel: 'DUEL', classicBlurb: 'Same throws for everyone. Highest score wins.',
    category: 'reflex',
    addedAt: '2026-09-27',
    durationMin: 2, tags: ['quick', 'frantic', 'skill'], solo: true,
    // N-player race on one shared seeded course (pulpLogic.js / RaceShell);
    // same-device split screen + TWO-TONE co-op live on its /solo page.
    custom: true, simultaneous: true, race: true, nPlayer: true, minPlayers: 2, maxPlayers: 8,
    Page: lazyWithRetry(() => import('../pages/PulpRushGame')),
  },
  {
    type: 'pulpharvest', label: 'PULP HARVEST',
    desc: 'fill one basket together', Icon: PulpIcon,
    badge: 'PH', maxWidth: 'max-w-sm',
    category: 'reflex',
    addedAt: '2026-09-27',
    variantOf: 'pulprush', variantLabel: 'CO-OP',
    variantBlurb: 'Same throws, one team basket, shared hearts.',
    durationMin: 2, tags: ['quick', 'frantic'],
    custom: true, simultaneous: true, race: true, coop: true, nPlayer: true, minPlayers: 2, maxPlayers: 8,
    Page: lazyWithRetry(() => import('../pages/PulpHarvestGame')),
  },
  {
    type: 'typing', label: 'TYPING RACE',
    desc: 'outtype the whole room', Icon: TypingIcon,
    badge: 'TR', maxWidth: 'max-w-sm',
    category: 'reflex',
    durationMin: 2, tags: ['quick', 'skill'], solo: true,
    custom: true, simultaneous: true, race: true, nPlayer: true, minPlayers: 2, maxPlayers: 8,
    Page: lazyWithRetry(() => import('../pages/TypingGame')),
  },
  {
    type: 'math', label: 'MENTAL MATH',
    desc: 'solve fastest under pressure', Icon: MathIcon,
    badge: 'MM', maxWidth: 'max-w-xs',
    category: 'reflex',
    durationMin: 2, tags: ['quick', 'skill'], solo: true,
    custom: true, simultaneous: true, race: true, nPlayer: true, minPlayers: 2, maxPlayers: 8,
    Page: lazyWithRetry(() => import('../pages/MathGame')),
  },
  {
    type: 'arrows', label: 'ARROWS PUZZLE',
    desc: 'slide every arrow off the board', Icon: ArrowsIcon,
    badge: 'AR', maxWidth: 'max-w-sm',
    // Mostly a thinking puzzle (the race is the 2-player mode), so it sits with
    // the board games and gets their calmer in-game track.
    category: 'board',
    addedAt: '2026-09-19',
    durationMin: 4, tags: ['quick', 'skill'], solo: true,
    // Solo opens the ARROWS hub (campaign, endless, tutorial, races), not just
    // a bot, so the play sheet names it as such.
    soloTitle: ' — solo or 2 players', soloLabel: 'PLAY SOLO', soloBadge: '1P', soloBlurb: '170 puzzle levels, endless boards, or race a bot.',
    custom: true, realtime: true,
    Page: lazyWithRetry(() => import('../pages/ArrowsGame')),
    // HOW TO PLAY adds the arrow types, each with a replayable lesson.
    RulesExtra: lazyWithRetry(() => import('../components/ArrowTypes')),
    matchTarget: 2,
    nextRound: arrowsNextRound,
    hidePlayerCards: true,
  },
  {
    type: 'updraft', label: 'UPDRAFT',
    desc: 'race up the same sky tower', Icon: UpdraftIcon,
    badge: 'UD', maxWidth: 'max-w-sm',
    category: 'reflex',
    addedAt: '2026-09-27',
    // Ghost race (Arrows model): both seats climb one seeded tower, each
    // simulating only its own hopper; progress rides `updraft` in Firebase.
    durationMin: 4, tags: ['quick', 'frantic', 'skill'], solo: true,
    classicLabel: 'VERSUS',
    classicBlurb: 'Race your rival up the same tower. First to 400 m wins; CHAOS pickups sabotage them.',
    custom: true, realtime: true,
    Page: lazyWithRetry(() => import('../pages/UpdraftGame')),
    matchTarget: UPDRAFT_MATCH_TARGET,
    hidePlayerCards: true,
  },
  {
    type: 'updraftduo', label: 'UPDRAFT CO-OP',
    desc: 'climb twin towers together', Icon: UpdraftIcon,
    badge: 'UC', maxWidth: 'max-w-sm',
    category: 'reflex',
    addedAt: '2026-09-27',
    variantOf: 'updraft', variantLabel: 'CO-OP',
    variantBlurb: 'Twin towers: your keys open your partner\'s gates. Three shared lives, both reach 300 m to win.',
    // Co-op: both seats share the result (runs cleared credit both scores).
    durationMin: 4, tags: ['frantic', 'skill'], solo: false,
    custom: true, realtime: true, coop: true, hidePlayerCards: true,
    Page: lazyWithRetry(() => import('../pages/UpdraftCoopGame')),
  },
  {
    type: 'pong', label: 'PONG',
    desc: 'power-ups, multi-ball & modes', Icon: PongIcon,
    badge: 'PG', maxWidth: 'max-w-md',
    category: 'reflex', hidePlayerCards: true,
    durationMin: 5, tags: ['frantic', 'skill'], solo: true,
    custom: true, realtime: true, p2p: true,
    Page: lazyWithRetry(() => import('../pages/PongGame')),
  },
  {
    type: 'snake', label: 'SNAKE BATTLE',
    desc: 'outlast the other snake', Icon: SnakeIcon,
    badge: 'SN', maxWidth: 'max-w-md',
    category: 'reflex',
    durationMin: 4, tags: ['frantic', 'skill'], solo: true,
    custom: true, realtime: true, p2p: true,
    Page: lazyWithRetry(() => import('../pages/SnakeGame')),
  },
  {
    type: 'tron', label: 'TRON',
    desc: "don't crash first", Icon: TronIcon,
    badge: 'TR', maxWidth: 'max-w-md',
    category: 'reflex',
    addedAt: '2026-07-04',
    durationMin: 2, tags: ['quick', 'frantic', 'skill'], solo: true,
    custom: true, realtime: true, p2p: true,
    Page: lazyWithRetry(() => import('../pages/TronGame')),
  },
  {
    type: 'sumo', label: 'SUMO ARENA',
    desc: 'shove them off the ledge', Icon: SumoIcon,
    badge: 'SM', maxWidth: 'max-w-md',
    category: 'reflex',
    addedAt: '2026-07-04',
    durationMin: 2, tags: ['quick', 'frantic', 'skill'], solo: true,
    custom: true, realtime: true, p2p: true,
    Page: lazyWithRetry(() => import('../pages/SumoGame')),
  },
  {
    type: 'spaceduel', label: 'SPACE DUEL',
    desc: "blast your rival's ship", Icon: SpaceDuelIcon,
    badge: 'SD', maxWidth: 'max-w-md',
    category: 'reflex',
    addedAt: '2026-07-04',
    durationMin: 2, tags: ['quick', 'frantic', 'skill'], solo: true,
    custom: true, realtime: true, p2p: true,
    Page: lazyWithRetry(() => import('../pages/SpaceduelGame')),
  },
  {
    type: 'paint', label: 'PAINT TURF',
    desc: 'claim more turf than they do', Icon: PaintIcon,
    badge: 'PT', maxWidth: 'max-w-md',
    category: 'reflex',
    addedAt: '2026-07-11',
    durationMin: 3, tags: ['quick', 'frantic', 'skill'], solo: true,
    custom: true, realtime: true, p2p: true,
    Page: lazyWithRetry(() => import('../pages/PaintGame')),
  },
  {
    type: 'pacmac', label: 'PAC MAC',
    desc: 'maze duel: out-eat them, then eat them', Icon: PacmacIcon,
    badge: 'PM', maxWidth: 'max-w-md',
    category: 'reflex',
    addedAt: '2026-08-14',
    durationMin: 3, tags: ['frantic', 'skill'], solo: true,
    custom: true, realtime: true, p2p: true,
    Page: lazyWithRetry(() => import('../pages/PacmacGame')),
    hidePlayerCards: true,
  },
  {
    type: 'visualmemory', label: 'VISUAL MEMORY',
    desc: 'remember the lit tiles', Icon: VisualMemoryIcon,
    badge: 'VM', maxWidth: 'max-w-sm',
    category: 'memory',
    durationMin: 2, tags: ['quick', 'thinky'], solo: true,
    // A solo run (beat your best), not a CPU opponent: the options sheet, the /solo
    // header and the tab title say so instead of "vs AI".
    soloRun: true, soloLabel: 'PLAY SOLO', soloBadge: '1P', soloBlurb: 'Beat your best run. No waiting.',
    // Online: a simultaneous duel page (same pattern for both, shared reveal).
    // Pass-and-play keeps the turn-based board below (`localBoard`).
    custom: true, simultaneous: true, localBoard: true,
    Page: lazyWithRetry(() => import('../pages/VisualMemoryGame')),
    boardSize: 0,
    getMoveIndex: (_, cellIndex) => cellIndex,
    BoardComponent: VisualMemoryBoard,
    applyMove: ({ game, move, symbol }) => applyVmMove(game, move, symbol),
    boardProps: (game) => ({
      vmPattern: normalizeVmArray(game.vmPattern),
      vmClicked: normalizeVmArray(game.vmClicked),
      vmLevel: game.vmLevel ?? VM_START_LEVEL,
      vmMiss: game.vmMiss ?? null,
      finished: game.status === 'finished',
      vmDeadline: game.vmDeadline ?? null,
    }),
    handoffGate: true,
  },
  {
    type: 'gomoku', label: 'GOMOKU',
    desc: 'five in a row wins', Icon: GomokuIcon,
    badge: 'GO', maxWidth: 'max-w-md',
    category: 'board',
    durationMin: 8, tags: ['thinky'], solo: true,
    classicLabel: 'FREESTYLE',
    classicBlurb: 'Five in a row on 15×15. No opening rule — the first stone is a real edge.',
    boardSize: GOMOKU_CELL_COUNT,
    getMoveIndex: (board, i) => (board[i] ? -1 : i),
    getWinner: getGomokuWinner,
    BoardComponent: GomokuBoard,
    focus: true,
  },
  {
    type: 'gomokuswap', label: 'GOMOKU SWAP',
    desc: 'five in a row, swap rule', Icon: GomokuIcon,
    badge: 'GS', maxWidth: 'max-w-md',
    category: 'board', addedAt: '2026-09-26',
    durationMin: 8, tags: ['thinky'], solo: true,
    variantOf: 'gomoku', variantLabel: 'SWAP',
    variantBlurb: 'After the first stone, the other player may take it as their own instead of moving — so the opener has to play fair.',
    boardSize: GOMOKU_CELL_COUNT,
    // Swap (pie) rule: on move 2 the board may emit { action: 'swap' }.
    // `pieSwap` marks the round's one swap as spent; every placement clears
    // it (gomokuLogic.js).
    getMoveIndex: getGomokuMoveIndex,
    getWinner: getGomokuWinner,
    BoardComponent: GomokuBoard,
    focus: true,
    applyMove: ({ board, game, move, symbol }) => {
      const moved = applyGomokuMove(board, move, symbol, !!game.pieSwap)
      if (!moved) return null
      return {
        updates: {
          board: moved.board,
          currentTurn: symbol === 'X' ? 'O' : 'X',
          lastMove: moved.index,
          pieSwap: moved.swapped ? true : null,
        },
        result: moved.result,
      }
    },
    boardProps: (game) => ({ swapRule: true, pieSwap: !!game.pieSwap }),
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
    focus: true,
    applyMove: ({ board, index, symbol }) => {
      const moved = applyReversiMove(board, index, symbol)
      if (!moved) return null
      const opp = symbol === 'X' ? 'O' : 'X'
      const oppCanMove = hasAnyMove(moved.board, opp)
      return {
        updates: {
          board: moved.board,
          currentTurn: oppCanMove ? opp : symbol,
          // Surfaced by GameStatus as "OPPONENT PASSED" — without it a pass
          // is silent and both players think a move failed to send.
          passNote: oppCanMove ? null : opp,
        },
        result: getReversiWinner(moved.board),
      }
    },
  },
  {
    type: 'chainreaction', label: 'CHAIN REACTION',
    desc: 'trigger chain explosions', Icon: ChainReactionIcon,
    badge: 'CR', maxWidth: 'max-w-sm',
    category: 'board',
    addedAt: '2026-07-04',
    durationMin: 6, tags: ['thinky'], solo: true,
    classicLabel: '8×10',
    classicBlurb: '8 columns by 10 rows. More room for long cascades.',
    boardSize: CR_CELL_COUNT,
    getMoveIndex: (_board, index) => {
      if (index < 0 || index >= CR_CELL_COUNT) return -1
      return index
    },
    BoardComponent: ChainReactionBoard,
    focus: true,
    // M-46: the tallest non-realtime board — Game.jsx tightens the vertical
    // rhythm so board+status still fit a 667px viewport (iPhone SE).
    compactLayout: true,
    applyMove: ({ board, game, index, symbol }) =>
      applyChainReactionMove({ board, game, index, symbol, cols: CR_COLS, rows: CR_ROWS }),
    boardProps: (game) => ({ crLastMove: game.crLastMove ?? null, cols: CR_COLS, rows: CR_ROWS }),
  },
  {
    type: 'chainreaction6', label: 'CHAIN REACTION 6×8',
    desc: 'compact chain reaction', Icon: ChainReactionIcon,
    badge: 'CR6', maxWidth: 'max-w-sm',
    category: 'board',
    addedAt: '2026-07-11',
    durationMin: 4, tags: ['quick', 'thinky'], solo: true,
    variantOf: 'chainreaction', variantLabel: '6×8',
    variantBlurb: 'The original smaller grid. Bigger cells on a phone.',
    boardSize: CR_CELL_COUNT_CLASSIC,
    getMoveIndex: (_board, index) => {
      if (index < 0 || index >= CR_CELL_COUNT_CLASSIC) return -1
      return index
    },
    BoardComponent: ChainReactionBoard,
    focus: true,
    applyMove: ({ board, game, index, symbol }) =>
      applyChainReactionMove({ board, game, index, symbol, cols: CR_COLS_CLASSIC, rows: CR_ROWS_CLASSIC }),
    boardProps: (game) => ({ crLastMove: game.crLastMove ?? null, cols: CR_COLS_CLASSIC, rows: CR_ROWS_CLASSIC }),
  },
  {
    type: 'chainreaction4', label: 'CHAIN REACTION 4P',
    desc: '2–4 player chain explosions', Icon: ChainReactionIcon,
    badge: 'CR4', maxWidth: 'max-w-sm',
    category: 'board',
    addedAt: '2026-09-18',
    durationMin: 8, tags: ['thinky', 'party'],
    // N-player variant: rides the uid-keyed room model (lobby → host start),
    // NOT the X/O seat flow. Colors deal by join order: X O A B → p1..p4.
    custom: true, nPlayer: true, minPlayers: 2, maxPlayers: 4,
    Page: lazyWithRetry(() => import('../pages/ChainReaction4Game')),
    startRound: (players) => {
      // Same seat order the lobby displays (playersToSeatList): joinedAt, then
      // uid tiebreak so identical timestamps still deal deterministically.
      const seats = Object.values(players || {})
        .filter(p => p.online !== false)
        .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || String(a.playerId).localeCompare(String(b.playerId)))
        .slice(0, CR_SYMBOLS_4.length)
      const crSeatSymbols = {}
      seats.forEach((p, i) => { crSeatSymbols[p.playerId] = CR_SYMBOLS_4[i] })
      return {
        board: Array(CR_CELL_COUNT).fill(''),
        currentTurn: 'X',
        crMoves: 0, crPlaced: {}, crEliminated: {}, crLastMove: null,
        crSeatSymbols,
        scores: {},
      }
    },
  },
  {
    type: 'blockade', label: 'BLOCKADE',
    desc: 'race across, wall them off', Icon: BlockadeIcon,
    badge: 'BK', maxWidth: 'max-w-md',
    category: 'board',
    addedAt: '2026-07-11',
    durationMin: 10, tags: ['thinky'], solo: true,
    boardSize: BK_WALL_SLOT_COUNT,
    getMoveIndex: (board, move) => {
      if (!move || typeof move !== 'object') return -1
      if (move.type === 'pawn') {
        return Number.isInteger(move.to) && move.to >= 0 && move.to < BK_CELL_COUNT ? move.to : -1
      }
      if (move.type === 'wall') {
        if (!Number.isInteger(move.slot) || move.slot < 0 || move.slot >= BK_WALL_SLOT_COUNT) return -1
        return board[move.slot] ? -1 : BK_CELL_COUNT + move.slot
      }
      return -1
    },
    BoardComponent: BlockadeBoard,
    focus: true,
    // Pawn moves never touch `board` (only wall placements do), so opponent
    // moves are detected by this counter instead of the filled-cell count.
    moveCountKey: 'blockadeMoves',
    // Full-move applier lives in blockadeLogic (pure, tested) — includes the
    // trapped-player skip house rule the old inline copy here lacked.
    applyMove: applyBlockadeMove,
    boardProps: (game) => ({
      pawns: { X: game.blockadePawnX ?? BK_START_X, O: game.blockadePawnO ?? BK_START_O },
      walls: { X: game.blockadeWallsX ?? BK_WALLS_PER_PLAYER, O: game.blockadeWallsO ?? BK_WALLS_PER_PLAYER },
    }),
  },
  {
    type: 'orderchaos', label: 'ORDER & CHAOS',
    desc: 'order builds, chaos blocks', Icon: OrderChaosIcon,
    badge: 'OC', maxWidth: 'max-w-sm',
    category: 'board',
    durationMin: 6, tags: ['thinky'], solo: true,
    boardSize: OC_CELL_COUNT,
    getMoveIndex: (board, move) => {
      if (!move || typeof move !== 'object' || !Number.isInteger(move.index)) return -1
      return board[move.index] ? -1 : move.index
    },
    BoardComponent: OrderChaosBoard,
    focus: true,
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
    classicLabel: 'ONE DIE',
    classicBlurb: 'Roll a 1 and the turn pot is gone. First to 100.',
    boardSize: 0,
    getMoveIndex: () => 0,
    BoardComponent: DiceBoard,
    // Rolls come from the room's shared seed (commit-reveal coin flip in
    // roomEffect) and the server time of each roll request (diceLogic.js);
    // Game.jsx gates rolls on the seed and verifies every resolved roll.
    rollFace,
    roomEffect: runPigRoomEffect,
    applyMove: ({ game, move, symbol }) => {
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
    type: 'dice-big', label: 'PIG BIG', desc: 'two dice, snake eyes bust',
    Icon: DiceIcon, badge: 'PIG2', maxWidth: 'max-w-xs',
    category: 'dicebluff', addedAt: '2026-08-15',
    durationMin: 4, tags: ['luck'], solo: true,
    variantOf: 'dice', variantLabel: '2 DICE',
    variantBlurb: 'Two dice. Only double 1 busts. A single 1 still scores.',
    boardSize: 0,
    getMoveIndex: () => 0,
    BoardComponent: DiceBoard,
    // Rolls come from the room's shared seed (commit-reveal coin flip in
    // roomEffect) and the server time of each roll request (diceLogic.js);
    // Game.jsx gates rolls on the seed and verifies every resolved roll.
    rollFace: rollFacePair,
    bigDice: true,
    roomEffect: runPigRoomEffect,
    applyMove: ({ game, move, symbol }) => {
      const action = typeof move === 'string' ? move : move?.action
      const face = typeof move === 'string' ? undefined : move?.face
      return applyDiceBigMove(game, action, symbol, face)
    },
    boardProps: (game) => ({
      isBig: true,
      diceScoreX: game.diceScoreX ?? 0,
      diceScoreO: game.diceScoreO ?? 0,
      diceTurnScore: game.diceTurnScore ?? 0,
      diceLast: game.diceLast ?? null,
      diceRolls: Array.isArray(game.diceRolls) ? game.diceRolls : [],
      diceSeed: game.diceSeed ?? null,
    }),
  },
  {
    type: 'hex', label: 'HEX',
    desc: 'connect your two edges', Icon: HexIcon,
    badge: 'HX', maxWidth: 'max-w-md',
    category: 'board',
    addedAt: '2026-08-21',
    durationMin: 8, tags: ['thinky'], solo: true,
    boardSize: HEX_CELL_COUNT,
    // Swap (pie) rule is standard: after the opening stone the second player
    // may emit { action: 'swap' } instead of a cell. `pieSwap` marks the
    // round's one swap as spent; every placement clears it (hexLogic.js).
    getMoveIndex: getHexMoveIndex,
    getWinner: getHexWinner,
    BoardComponent: HexBoard,
    focus: true,
    applyMove: ({ board, game, move, symbol }) => {
      const moved = applyHexMove(board, move, symbol, !!game.pieSwap)
      if (!moved) return null
      return {
        updates: {
          board: moved.board,
          currentTurn: symbol === 'X' ? 'O' : 'X',
          lastMove: moved.index,
          pieSwap: moved.swapped ? true : null,
        },
        result: moved.result,
      }
    },
    boardProps: (game) => ({ swapRule: true, pieSwap: !!game.pieSwap }),
  },
  {
    type: 'minesweeper', label: 'MINE RACE',
    desc: 'clear the same minefield faster', Icon: MinesIcon,
    badge: 'MR', maxWidth: 'max-w-md',
    category: 'reflex',
    addedAt: '2026-08-21',
    durationMin: 3, tags: ['quick', 'skill'], solo: true,
    custom: true, simultaneous: true, race: true, nPlayer: true, minPlayers: 2, maxPlayers: 8,
    Page: lazyWithRetry(() => import('../pages/MineRaceGame')),
  },
  {
    type: 'herd', label: 'HERD MIND',
    desc: 'match the majority answer', Icon: HerdIcon,
    badge: 'HD', maxWidth: 'max-w-sm',
    category: 'party',
    addedAt: '2026-08-21',
    durationMin: 10, tags: ['thinky'], solo: true,
    custom: true, nPlayer: true, minPlayers: 3, maxPlayers: 8,
    Page: lazyWithRetry(() => import('../pages/HerdGame')),
    startRound: () => ({
      round: {
        phase: 'answering',
        promptIndex: 0,
        deckSeed: Math.floor(Math.random() * 2147483647),
        answers: null,
        // Armed by the page's coordinator with server time (a host's local
        // clock here skewed every other player's countdown).
        endsAt: null,
      },
    }),
  },
  {
    type: 'trivia', label: 'TRIVIA BLITZ',
    desc: 'fast answers score more', Icon: TriviaIcon,
    badge: 'TQ', maxWidth: 'max-w-sm',
    category: 'party',
    addedAt: '2026-08-21',
    durationMin: 6, tags: ['quick', 'thinky'], solo: true,
    custom: true, nPlayer: true, minPlayers: 2, maxPlayers: 8,
    Page: lazyWithRetry(() => import('../pages/TriviaGame')),
    startRound: () => ({
      round: {
        phase: 'question',
        qNum: 0,
        deckSeed: Math.floor(Math.random() * 2147483647),
        // Question START, not deadline — the page computes the deadline as
        // qStartAt + QUESTION_MS. Stamping this in the future gave everyone
        // a 30s Q1 with free max-speed points.
        qStartAt: Date.now(),
        answers: null,
      },
    }),
  },
  {
    type: 'battleship', label: 'BATTLESHIP',
    desc: 'sink the hidden fleet', Icon: BattleshipIcon,
    badge: 'BS', maxWidth: 'max-w-md',
    category: 'board',
    addedAt: '2026-08-21',
    durationMin: 8, tags: ['thinky'], solo: true,
    custom: true,
    Page: lazyWithRetry(() => import('../pages/BattleshipGame')),
  },
  {
    type: 'faceoff', label: 'FACE OFF',
    desc: 'ask, flip, name the hidden face', Icon: FaceOffIcon,
    badge: 'FO', maxWidth: 'max-w-sm',
    category: 'board',
    addedAt: '2026-10-10',
    durationMin: 4, tags: ['thinky', 'quick'], solo: true,
    // The page draws its own seats (secret face + faces left), so the shell's
    // player cards are hidden. Everything lives in `round` (faceoffLogic.js).
    custom: true, hidePlayerCards: true,
    Page: lazyWithRetry(() => import('../pages/FaceOffGame')),
  },
  {
    type: 'mancala', label: 'MANCALA',
    desc: 'sow & capture', Icon: MancalaIcon,
    badge: 'MC', maxWidth: 'max-w-md',
    category: 'board',
    addedAt: '2026-08-22',
    durationMin: 8, tags: ['thinky'], solo: true,
    boardSize: 0,
    getMoveIndex: (_, pit) => pit,
    BoardComponent: MancalaBoard,
    focus: true,
    applyMove: ({ game, index, symbol }) => {
      const pits = normalizePits(game.mancalaPits)
      const moved = applyMancalaMove(pits, index, symbol)
      if (!moved) return null
      return {
        updates: {
          mancalaPits: moved.pits,
          // `captured` feeds the board's capture banner; `at` makes the sow
          // replay key unique when the same pit/seed-count repeats.
          mancalaLast: {
            pit: index, by: symbol, seeds: pits[index],
            captured: moved.captured ?? 0, at: Date.now(),
          },
          currentTurn: moved.extraTurn ? symbol : (symbol === 'X' ? 'O' : 'X'),
          extraTurn: moved.extraTurn ? true : null,
        },
        result: moved.result
          ? { winner: moved.result.winner, scoreX: moved.result.scoreX, scoreO: moved.result.scoreO }
          : null,
      }
    },
    boardProps: (game) => ({
      pits: normalizePits(game.mancalaPits),
      last: game.mancalaLast ?? null,
      players: game.players,
    }),
  },
  {
    type: 'checkers', label: 'CHECKERS',
    desc: 'jumps forced, kings crown', Icon: CheckersIcon,
    badge: 'CK', maxWidth: 'max-w-md',
    category: 'board',
    addedAt: '2026-08-22',
    durationMin: 8, tags: ['thinky'], solo: true,
    custom: true,
    Page: lazyWithRetry(() => import('../pages/CheckersGame')),
  },
  {
    type: 'airhockey', label: 'AIR HOCKEY',
    desc: 'flick the puck, score 7', Icon: AirHockeyIcon,
    badge: 'AH', maxWidth: 'max-w-md',
    category: 'reflex',
    addedAt: '2026-08-22',
    durationMin: 5, tags: ['skill'], solo: true,
    custom: true, realtime: true, p2p: true,
    Page: lazyWithRetry(() => import('../pages/AirHockeyGame')),
  },
  {
    type: 'puckrush', label: 'PUCK RUSH',
    desc: 'sling every puck through the gap', Icon: PuckRushIcon,
    badge: 'PK', maxWidth: 'max-w-md',
    category: 'reflex',
    addedAt: '2026-10-10',
    durationMin: 4, tags: ['skill', 'quick'], solo: true,
    custom: true, realtime: true, p2p: true,
    Page: lazyWithRetry(() => import('../pages/PuckRushGame')),
  },
  {
    type: 'stickyfingers', label: 'STICKY FINGERS',
    desc: 'grab the loot, rip the bills, stash it first', Icon: StickyFingersIcon,
    badge: 'ST', maxWidth: 'max-w-md',
    category: 'reflex',
    addedAt: '2026-10-10',
    durationMin: 4, tags: ['skill', 'quick'], solo: true,
    // Online is a 2-player duel on the pong family's peer-to-peer transport
    // (X hosts the sim). Solo against 1–3 bots and 2–4 people on one phone run
    // the same sim offline: /solo/stickyfingers and /local/stickyfingers.
    custom: true, realtime: true, p2p: true, localMaxPlayers: 4,
    Page: lazyWithRetry(() => import('../pages/StickyFingersGame')),
    LocalPage: lazyWithRetry(() => import('../pages/StickyFingersDemo').then(m => ({ default: m.StickyFingersLocal }))),
  },
  {
    type: 'fenderbender', label: 'FENDER BENDER',
    desc: 'shove rivals off the road · up to 4 on one phone', Icon: FenderBenderIcon,
    badge: 'FD', maxWidth: 'max-w-md',
    category: 'reflex',
    addedAt: '2026-10-10',
    durationMin: 5, tags: ['skill', 'party', 'quick'], solo: true,
    // Online it is a two-car duel on the pong stack (host sim, WebRTC
    // snapshots). The LocalPage seats 2-4 people on one phone, or one person
    // against bots, on the same sim with no network.
    custom: true, realtime: true, p2p: true, localMaxPlayers: 4,
    localBlurb: 'ONE PHONE · EVERYONE DRIVES AT ONCE',
    Page: lazyWithRetry(() => import('../pages/FenderBenderGame')),
    LocalPage: lazyWithRetry(() => import('../pages/FenderBenderDemo')),
  },
  {
    type: 'artillery', label: 'ARTILLERY',
    desc: 'angle, power, bracket', Icon: ArtilleryIcon,
    badge: 'AR', maxWidth: 'max-w-md',
    category: 'reflex',
    addedAt: '2026-08-22',
    durationMin: 8, tags: ['skill', 'thinky'], solo: true,
    custom: true,
    Page: lazyWithRetry(() => import('../pages/ArtilleryGame')),
  },
  {
    type: 'archery', label: 'ARCHERY',
    desc: 'draw, loose, score the neon range', Icon: ArcheryIcon,
    badge: 'AR', maxWidth: 'max-w-md',
    category: 'reflex', addedAt: '2026-09-27',
    durationMin: 8, tags: ['skill', 'quick'], solo: true,
    custom: true, waitForStart: true,
    localMaxPlayers: 4,
    Page: lazyWithRetry(() => import('../pages/ArcheryGame')),
    LocalPage: lazyWithRetry(() => import('../pages/ArcheryDemo').then(m => ({ default: m.ArcheryLocal }))),
  },
  {
    type: 'archery4', label: 'ARCHERY RANGE 4P',
    desc: 'pass the range around · 2–4 archers', Icon: ArcheryIcon,
    badge: 'AR4', maxWidth: 'max-w-md',
    category: 'reflex', addedAt: '2026-09-27',
    durationMin: 10, tags: ['skill', 'party'],
    custom: true, nPlayer: true, minPlayers: 2, maxPlayers: 4,
    Page: lazyWithRetry(() => import('../pages/ArcheryGame')),
    startRound: (players, game = {}) => {
      const ordered = Object.values(players || {}).filter(p => p?.playerId)
        .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || String(a.playerId).localeCompare(String(b.playerId)))
        .slice(0, 4)
      if (ordered.length < 2) return null
      const archerySeatUids = Object.fromEntries(ordered.map((p, i) => [ARCHERY_SEATS[i], p.playerId]))
      return {
        currentTurn: 'X', archerySeatUids, archerySeed: generateSeed(),
        archeryFormat: archeryFormat(game.archeryFormat), archeryPhase: 'main',
        archeryShots: null, archeryShootOffShots: null, archeryTied: null,
        archeryTurnStartedAt: null,
      }
    },
  },
  {
    type: 'darts', label: 'STEADY HAND',
    desc: 'hold, aim, let go · race to zero or own the board', Icon: DartsIcon,
    badge: 'DT', maxWidth: 'max-w-md',
    category: 'reflex', addedAt: '2026-10-10',
    durationMin: 8, tags: ['skill', 'party'], solo: true,
    // Rides the uid-keyed room model (lobby → host START), like Yacht. The
    // lobby picks and the match are one object under `round` (dartsLogic.js):
    // an append-only list of landing points that every client replays.
    // Solo (vs a bot) and pass-and-play 2–4 run the same replay offline via
    // LocalPage — see supportsLocalPlay.
    custom: true, nPlayer: true, minPlayers: DARTS_MIN_PLAYERS, maxPlayers: DARTS_MAX_PLAYERS,
    Page: lazyWithRetry(() => import('../pages/DartsGame')),
    LocalPage: lazyWithRetry(() => import('../pages/DartsDemo')),
    startRound: (players, game = {}) => {
      // Turn order is the lobby's seat order: joinedAt, then uid.
      const seats = Object.values(players || {})
        .filter(p => p && p.playerId && p.online !== false)
        .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || String(a.playerId).localeCompare(String(b.playerId)))
        .slice(0, DARTS_MAX_PLAYERS)
        .map(p => p.playerId)
      if (seats.length < DARTS_MIN_PLAYERS) return null
      return { board: null, currentTurn: null, scores: {}, round: createDartsRound(seats, normalizeDartsCfg(game.round?.dCfg)) }
    },
  },
  {
    type: 'minigolf', label: 'MINIGOLF',
    desc: 'pull, putt, sink it', Icon: MinigolfIcon,
    badge: 'MG', maxWidth: 'max-w-sm',
    category: 'reflex',
    addedAt: '2026-09-27',
    durationMin: 10, tags: ['skill', 'party'], solo: true,
    // Turn-based putting for 2–4 on the uid-keyed room model (lobby → host
    // START, like Chain Reaction 4P). The room stores only each stroke's
    // integer inputs; every client replays them through the deterministic sim
    // (minigolfLogic.replayCourse), so there is no turn pointer to keep in sync.
    // Solo (PAR RUN / VS BOT) and pass-and-play 2–4 run the same replay
    // offline via LocalPage — see supportsLocalPlay.
    custom: true, nPlayer: true, minPlayers: 2, maxPlayers: 4,
    Page: lazyWithRetry(() => import('../pages/MinigolfGame')),
    LocalPage: lazyWithRetry(() => import('../pages/MinigolfLocal')),
    startRound: (players) => {
      const seats = Object.values(players || {})
        .filter(p => p && p.playerId && p.online !== false)
        .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || String(a.playerId).localeCompare(String(b.playerId)))
        .slice(0, 4)
      if (seats.length < 2) return null
      return {
        golfOrder: seats.map(p => p.playerId),
        golfShots: null, golfSkip: null, golfAway: null,
      }
    },
  },
  {
    type: 'animalstack', label: 'ANIMAL STACK',
    desc: 'drop animals, don\'t topple the tower', Icon: AnimalStackIcon,
    badge: 'AS', maxWidth: 'max-w-md',
    category: 'reflex',
    addedAt: '2026-09-27',
    durationMin: 6, tags: ['skill', 'party'], solo: true,
    // 2-4 seat uid-keyed room (lobby → START), turn-based physics replayed
    // deterministically on every client over RTDB — see animalStackRoom.js.
    // LocalPage: /local/animalstack is its own 2-4 player pass-and-play page.
    custom: true, nPlayer: true, minPlayers: 2, maxPlayers: 4, localMaxPlayers: 4,
    Page: lazyWithRetry(() => import('../pages/AnimalStackGame')),
    LocalPage: lazyWithRetry(() => import('../pages/AnimalStackDemo').then(m => ({ default: m.AnimalStackLocal }))),
    startRound: (players) => startStackMatch(players, generateSeed()),
  },
  {
    type: 'birdseye', label: 'BIRDSEYE',
    desc: 'sling the flock, ride the shot', Icon: BirdseyeIcon,
    badge: 'BE', maxWidth: 'max-w-md',
    category: 'reflex',
    addedAt: '2026-10-06',
    durationMin: 5, tags: ['skill', 'quick'], solo: true,
    // Solo is World 1's five forts (/solo/birdseye). Online is a 2P duel on
    // one fort, Artillery's model: the room stores bsFort + an append-only
    // bsShots list and every client replays it (birdseyeLogic.replayDuel).
    soloLabel: 'PLAY SOLO', soloBadge: '1P', soloBlurb: `${BIRDSEYE_FORTS.length} farm forts to topple. Ride the shot from the beak.`,
    custom: true,
    Page: lazyWithRetry(() => import('../pages/BirdseyeGame')),
  },
  {
    type: 'wirecrossed', label: 'WIRE CROSSED',
    desc: 'one sees the bomb, one reads the manual', Icon: WireCrossedIcon,
    badge: 'WX', maxWidth: 'max-w-md',
    category: 'reflex',
    addedAt: '2026-09-26',
    // Co-op: Tech and Handbook defuse together (both scores +1 per bomb);
    // roles swap every bomb via the rotating starter (firstMoverUpdates).
    // solo: false — the manual and the device are useless alone.
    durationMin: 4, tags: ['frantic', 'thinky'], solo: false,
    custom: true, coop: true, hidePlayerCards: true,
    Page: lazyWithRetry(() => import('../pages/WireCrossedGame')),
  },
  {
    type: 'twotruths', label: 'TWO TRUTHS',
    desc: 'spot the lie', Icon: TwoTruthsIcon,
    badge: 'TT', maxWidth: 'max-w-sm',
    category: 'word',
    durationMin: 3, tags: ['quick', 'thinky'],
    // simultaneous: both players write and guess every round, so there is no
    // first mover to pick; the page renders MatchScoreRail itself.
    custom: true, simultaneous: true, hidePlayerCards: true, matchTarget: 3,
    Page: lazyWithRetry(() => import('../pages/TwoTruthsGame')),
  },
  {
    type: 'yacht', label: 'YACHT',
    desc: 'five dice, three rolls, thirteen boxes', Icon: YachtIcon,
    badge: 'YT', maxWidth: 'max-w-sm',
    category: 'dicebluff',
    addedAt: '2026-10-10',
    durationMin: 8, tags: ['luck', 'thinky'], solo: true,
    // Rides the uid-keyed room model (lobby → host START), like Chain
    // Reaction 4P. The whole match is one object under `round` (yachtLogic.js).
    custom: true, nPlayer: true, minPlayers: YACHT_MIN_PLAYERS, maxPlayers: YACHT_MAX_PLAYERS,
    Page: lazyWithRetry(() => import('../pages/YachtGame')),
    startRound: (players) => {
      // Turn order is the lobby's seat order: joinedAt, then uid.
      const seats = Object.values(players || {})
        .filter(p => p && p.playerId && p.online !== false)
        .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || String(a.playerId).localeCompare(String(b.playerId)))
        .slice(0, YACHT_MAX_PLAYERS)
        .map(p => p.playerId)
      if (seats.length < YACHT_MIN_PLAYERS) return null
      return { board: null, currentTurn: null, scores: {}, round: createYachtRound(seats, generateSeedHex()) }
    },
  },
  {
    type: 'lazysusan', label: 'LAZY SUSAN',
    desc: 'tap when the food reaches your gate', Icon: LazySusanIcon,
    badge: 'LS', maxWidth: 'max-w-sm',
    category: 'reflex',
    addedAt: '2026-10-10',
    durationMin: 2, tags: ['skill', 'quick', 'party'], solo: true,
    // One shared turning plate, 2-4 seats on the uid-keyed room model (lobby →
    // host START). The match is one object under `round` (lazySusanLogic.js);
    // a taken piece is a write-once claim, so the first writer owns it.
    // LocalPage: /local/lazysusan is 2-4 on one phone, /solo/lazysusan a bot.
    custom: true, nPlayer: true, minPlayers: SUSAN_MIN_PLAYERS, maxPlayers: SUSAN_MAX_PLAYERS, localMaxPlayers: SUSAN_MAX_PLAYERS,
    Page: lazyWithRetry(() => import('../pages/LazySusanGame')),
    LocalPage: lazyWithRetry(() => import('../pages/LazySusanDemo').then(m => ({ default: m.LazySusanLocal }))),
    startRound: (players, _room, ctx) => {
      // Seat order is the lobby's: joinedAt, then uid. startAt is the server
      // time the transaction was built at, so the countdown is shared.
      const seats = Object.values(players || {})
        .filter(p => p && p.playerId && p.online !== false)
        .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || String(a.playerId).localeCompare(String(b.playerId)))
        .slice(0, SUSAN_MAX_PLAYERS)
        .map(p => p.playerId)
      if (seats.length < SUSAN_MIN_PLAYERS) return null
      return { board: null, currentTurn: null, scores: {}, round: createSusanRound(seats, generateSeed(), ctx?.now ?? Date.now()) }
    },
  },
  {
    type: 'bluff', label: 'BLUFF BATTLE',
    desc: 'outroll the liar', Icon: BluffIcon,
    badge: 'BB', maxWidth: 'max-w-sm',
    category: 'dicebluff',
    durationMin: 5, tags: ['luck', 'thinky'],
    custom: true,
    Page: lazyWithRetry(() => import('../pages/BluffBattleGame')),
  },
  {
    type: 'lanterns', label: 'LANTERNS',
    desc: 'see their cards, never yours', Icon: LanternsIcon,
    badge: 'LN', maxWidth: 'max-w-md',
    category: 'board',
    addedAt: '2026-09-26',
    // Co-op (matchRules COOP_GAMES): a 20+ evening adds a team star to both
    // seats. The page deals and scores itself; state lives under `round`.
    durationMin: 20, tags: ['thinky'], solo: false,
    custom: true, coop: true, hidePlayerCards: true,
    Page: lazyWithRetry(() => import('../pages/LanternsGame')),
  },
  {
    type: 'docking', label: 'DOCKING',
    desc: 'roll secret dice, dock in silence', Icon: DockingIcon,
    badge: 'DK', maxWidth: 'max-w-md',
    category: 'dicebluff',
    addedAt: '2026-09-26',
    // Co-op like Lanterns: a docked capsule adds a team star to both seats.
    durationMin: 12, tags: ['thinky', 'luck'], solo: false,
    custom: true, coop: true, hidePlayerCards: true,
    Page: lazyWithRetry(() => import('../pages/DockingGame')),
  },
  {
    type: 'wavelength', label: 'WAVELENGTH',
    desc: 'guess the hidden target', Icon: WavelengthIcon,
    badge: 'WL', maxWidth: 'max-w-sm',
    category: 'party',
    durationMin: 10, tags: ['thinky'], solo: true,
    custom: true, nPlayer: true, minPlayers: 3, maxPlayers: 8,
    Page: lazyWithRetry(() => import('../pages/WavelengthGame')),
    // The room's seen history (seen/wavelength, kept across matches) is
    // skipped so a new match doesn't reopen on a pair the group just played.
    startRound: (players, game) => ({
      round: {
        clueGiver: seatOrderWL(players)[0] ?? null,
        phase: 'clue',
        spectrumIndex: pickSpectrumIndex({ seen: game?.seen?.wavelength }),
        clue: '', commitment: null, guesses: null, reveal: null,
      },
    }),
  },
  {
    type: 'fibbage', label: 'FIBBAGE',
    desc: 'bluff a believable answer', Icon: FibbageIcon,
    badge: 'FB', maxWidth: 'max-w-sm',
    category: 'party',
    durationMin: 10, tags: ['thinky'], solo: true,
    custom: true, nPlayer: true, minPlayers: 3, maxPlayers: 8,
    Page: lazyWithRetry(() => import('../pages/FibbageGame')),
    // deckSeed fixes a per-match shuffled prompt order every client agrees on
    // (G-02: a fixed 0,1,2… order replayed the same facts every match).
    startRound: () => ({ round: { phase: 'lying', promptIndex: 0, deckSeed: Math.floor(Math.random() * 2147483647) } }),
  },
  {
    type: 'spyfair', label: 'SPYFAIR',
    desc: 'find the spy among you', Icon: SpyfairIcon,
    badge: 'SF', maxWidth: 'max-w-sm',
    category: 'party',
    durationMin: 10, tags: ['thinky'], solo: true,
    custom: true, nPlayer: true, minPlayers: 3, maxPlayers: 8,
    Page: lazyWithRetry(() => import('../pages/SpyfairGame')),
    // no startRound — SpyfairGame drives its own round start
  },
  {
    type: 'headsup', label: 'HEADS UP',
    desc: 'act it out on the call', Icon: HeadsUpIcon,
    badge: 'HU', maxWidth: 'max-w-sm',
    category: 'party',
    addedAt: '2026-09-26',
    durationMin: 10, tags: ['party'],
    custom: true, nPlayer: true, minPlayers: 3, maxPlayers: 8,
    Page: lazyWithRetry(() => import('../pages/HeadsUpGame')),
    // no startRound — HeadsUpGame deals its own sealed turns
  },
  {
    type: 'chameleon', label: 'CHAMELEON',
    desc: 'blend in, or spot who can’t', Icon: ChameleonIcon,
    badge: 'CM', maxWidth: 'max-w-sm',
    category: 'party',
    addedAt: '2026-09-26',
    durationMin: 12, tags: ['thinky', 'party'],
    custom: true, nPlayer: true, minPlayers: 3, maxPlayers: 8,
    Page: lazyWithRetry(() => import('../pages/ChameleonGame')),
    // no startRound — ChameleonGame deals its own sealed rounds
  },
  {
    type: 'wordduel', label: 'WORD DUEL',
    desc: 'race to guess the word', Icon: WordDuelIcon,
    badge: 'WD', maxWidth: 'max-w-sm',
    category: 'word',
    addedAt: '2026-07-04',
    durationMin: 3, tags: ['quick', 'thinky'], solo: true,
    soloRun: true, soloLabel: 'PLAY SOLO', soloBadge: '1P', soloBlurb: 'Five words. Fewer guesses, more points.',
    custom: true, simultaneous: true, matchTarget: 3, hidePlayerCards: true,
    Page: lazyWithRetry(() => import('../pages/WordDuelGame')),
  },
  {
    type: 'wordcoop', label: 'WORD CO-OP',
    desc: 'solve one word together', Icon: WordCoopIcon,
    badge: 'WC', maxWidth: 'max-w-md',
    category: 'word',
    addedAt: '2026-09-18',
    durationMin: 4, tags: ['quick', 'thinky'], solo: true,
    soloRun: true, soloLabel: 'PLAY SOLO', soloBadge: '1P', soloBlurb: 'Solve word after word. One miss ends the streak.',
    // coop: partners never "claim a win" from each other (Game.jsx skips the
    // abandoned-opponent banner); the page lets the online partner play on.
    custom: true, hidePlayerCards: true, coop: true,
    Page: lazyWithRetry(() => import('../pages/WordCoopGame')),
  },
  {
    type: 'converge', label: 'CONVERGE',
    desc: 'type the same word together', Icon: ConvergeIcon,
    badge: 'CV', maxWidth: 'max-w-md',
    category: 'word',
    addedAt: '2026-09-26',
    // Co-op: both lock a word at once until the two words match. Stars and
    // the chain history live in `round` (ConvergeGame); scores count chains.
    // `quiet` while words are being written: agreeing a word in chat would
    // make every chain a free ★★★.
    durationMin: 6, tags: ['quick'], solo: false,
    custom: true, simultaneous: true, coop: true, hidePlayerCards: true,
    quiet: (game) => game?.status === 'playing' && game?.round?.phase === 'write',
    Page: lazyWithRetry(() => import('../pages/ConvergeGame')),
  },
  {
    type: 'wordrace', label: 'WORD RACE',
    desc: 'solve the same word first', Icon: WordRaceIcon,
    badge: 'WR', maxWidth: 'max-w-4xl',
    category: 'word',
    addedAt: '2026-09-18',
    durationMin: 3, tags: ['quick', 'thinky'], solo: true,
    soloRun: true, soloLabel: 'PLAY SOLO', soloBadge: '1P', soloBlurb: 'Three minutes. Solve as many words as you can.',
    custom: true, simultaneous: true, matchTarget: 3, hidePlayerCards: true,
    Page: lazyWithRetry(() => import('../pages/WordRaceGame')),
  },
  {
    type: 'wordhunt', label: 'WORD HUNT',
    desc: 'race to find the most words', Icon: WordHuntIcon,
    // Desktop: grid beside the score and word list (WordHuntGame).
    badge: 'WH', maxWidth: 'max-w-md lg:max-w-3xl',
    category: 'word',
    addedAt: '2026-07-11',
    durationMin: 2, tags: ['quick', 'thinky'], solo: true,
    custom: true, simultaneous: true, matchTarget: 3, hidePlayerCards: true,
    Page: lazyWithRetry(() => import('../pages/WordHuntGame')),
  },
  {
    type: 'password', label: 'PASSWORD',
    desc: 'clue the word for your partner', Icon: PasswordIcon,
    badge: 'PW', maxWidth: 'max-w-sm',
    category: 'word',
    addedAt: '2026-09-18',
    // Co-op since the D1 decision: partners share one team score over 12
    // rounds, so there is no opponent to claim a win from. solo: false —
    // the /solo/password demo's bot guesser ignores the clue, so VS AI is not
    // offered and the demo stays off the solo shelf (OFF_SHELF, pages/demos/partyBlurbs.js).
    durationMin: 12, tags: ['thinky'], solo: false,
    custom: true, coop: true, hidePlayerCards: true,
    Page: lazyWithRetry(() => import('../pages/PasswordGame')),
  },
  {
    type: 'anagrams', label: 'ANAGRAMS',
    desc: 'race to find words', Icon: AnagramsIcon,
    badge: 'AG', maxWidth: 'max-w-sm',
    category: 'word',
    addedAt: '2026-09-18',
    durationMin: 3, tags: ['quick', 'thinky'], solo: true,
    soloRun: true, soloLabel: 'PLAY SOLO', soloBadge: '1P', soloBlurb: 'One rack, 90 seconds. Find every word you can.',
    custom: true, simultaneous: true, hidePlayerCards: true, matchTarget: 2,
    Page: lazyWithRetry(() => import('../pages/AnagramsGame')),
  },
  {
    type: 'hunch', label: 'HUNCH',
    desc: 'play cards in order, no talking', Icon: HunchIcon,
    badge: 'HN', maxWidth: 'max-w-md',
    category: 'board',
    addedAt: '2026-09-26',
    // Co-op and silent: `quiet` hides typed chat (emotes stay). The run —
    // hands, pile, lives — lives in `round` (HunchGame); scores count levels.
    durationMin: 8, tags: ['thinky'], solo: false,
    custom: true, simultaneous: true, coop: true, quiet: true, hidePlayerCards: true,
    Page: lazyWithRetry(() => import('../pages/HunchGame')),
  },
  // ── Memory shelf additions (docs/design/MEMORY-GAMES-SHAPE.md) ──
  // Solo runs on /solo/:type (MemoryRunSolo) and online duels on one engine
  // (MemoryDuelGame, room node `mem`): same seeded deal for both, shared 3-2-1.
  {
    type: 'verbalmemory', label: 'VERBAL MEMORY',
    desc: 'seen it before, or new?', Icon: VerbalMemoryIcon,
    badge: 'VB', maxWidth: 'max-w-sm',
    category: 'memory', addedAt: '2026-10-02',
    durationMin: 3, tags: ['quick', 'thinky'], solo: true,
    soloRun: true, soloLabel: 'PLAY SOLO', soloBadge: '1P', soloBlurb: 'Beat your best run. No waiting.',
    custom: true, simultaneous: true,
    Page: lazyWithRetry(() => import('../pages/MemoryDuelGame')),
  },
  {
    type: 'nback', label: 'N-BACK',
    desc: 'match the cell n steps back', Icon: NBackIcon,
    badge: 'NB', maxWidth: 'max-w-xs',
    category: 'memory', addedAt: '2026-10-02',
    durationMin: 3, tags: ['thinky'], solo: true,
    soloRun: true, soloLabel: 'PLAY SOLO', soloBadge: '1P', soloBlurb: 'Beat your best run. No waiting.',
    custom: true, simultaneous: true,
    Page: lazyWithRetry(() => import('../pages/MemoryDuelGame')),
  },
  {
    type: 'cupshuffle', label: 'CUP SHUFFLE',
    desc: 'follow the ball under the cups', Icon: CupShuffleIcon,
    badge: 'CS', maxWidth: 'max-w-sm',
    category: 'memory', addedAt: '2026-10-02',
    durationMin: 2, tags: ['quick'], solo: true,
    soloRun: true, soloLabel: 'PLAY SOLO', soloBadge: '1P', soloBlurb: 'Beat your best run. No waiting.',
    custom: true, simultaneous: true,
    Page: lazyWithRetry(() => import('../pages/MemoryDuelGame')),
  },
  {
    type: 'whatchanged', label: 'WHAT CHANGED?',
    desc: 'spot the change from memory', Icon: WhatChangedIcon,
    badge: 'WC', maxWidth: 'max-w-sm',
    category: 'memory', addedAt: '2026-10-02',
    durationMin: 3, tags: ['quick', 'thinky'], solo: true,
    soloRun: true, soloLabel: 'PLAY SOLO', soloBadge: '1P', soloBlurb: 'Beat your best run. No waiting.',
    custom: true, simultaneous: true,
    Page: lazyWithRetry(() => import('../pages/MemoryDuelGame')),
  },
  {
    type: 'kimsgame', label: 'LOST & FOUND',
    desc: "what's missing from the tray?", Icon: KimsGameIcon,
    badge: 'LF', maxWidth: 'max-w-sm',
    category: 'memory', addedAt: '2026-10-02',
    durationMin: 3, tags: ['quick', 'thinky'], solo: true,
    soloRun: true, soloLabel: 'PLAY SOLO', soloBadge: '1P', soloBlurb: 'Beat your best run. No waiting.',
    custom: true, simultaneous: true,
    Page: lazyWithRetry(() => import('../pages/MemoryDuelGame')),
  },
  {
    type: 'nametags', label: 'NAME TAGS',
    desc: 'put the names back on the faces', Icon: NameTagsIcon,
    badge: 'NT', maxWidth: 'max-w-sm',
    category: 'memory', addedAt: '2026-10-02',
    durationMin: 3, tags: ['thinky'], solo: true,
    soloRun: true, soloLabel: 'PLAY SOLO', soloBadge: '1P', soloBlurb: 'Beat your best run. No waiting.',
    custom: true, simultaneous: true,
    Page: lazyWithRetry(() => import('../pages/MemoryDuelGame')),
  },
  {
    type: 'splitsignal', label: 'SPLIT SIGNAL',
    desc: 'two halves, one pattern — co-op', Icon: SplitSignalIcon,
    badge: 'SS', maxWidth: 'max-w-sm',
    category: 'memory', addedAt: '2026-10-02',
    // Co-op: the team's cleared levels are both players' score.
    durationMin: 4, tags: ['thinky'], solo: false,
    custom: true, simultaneous: true, coop: true,
    Page: lazyWithRetry(() => import('../pages/SplitSignalGame')),
  },
  {
    type: 'pairs', label: 'PAIRS',
    desc: 'match the hidden pairs', Icon: PairsIcon,
    badge: 'PR', maxWidth: 'max-w-md',
    category: 'memory',
    addedAt: '2026-07-11',
    durationMin: 6, tags: ['thinky'], solo: true,
    classicLabel: '6×6',
    classicBlurb: '18 pairs. First to 10 clinches.',
    boardSize: PAIRS_CELL_COUNT,
    getMoveIndex: (board, index) => (board[index] ? -1 : index),
    BoardComponent: PairsBoard,
    focus: true,
    applyMove: ({ board, game, index, symbol }) => {
      const deck = normalizePairsDeck(game.pairsDeck)
      const flipped = normalizePairsFlipped(game.pairsFlipped)
      const applied = applyPairsMove(board, deck, flipped, index, symbol)
      if (!applied) return null
      return {
        updates: {
          board: applied.board,
          pairsFlipped: applied.flipped,
          currentTurn: applied.turnStays ? symbol : (symbol === 'X' ? 'O' : 'X'),
          // GO AGAIN! is for a match only — a first flip also keeps the turn, but that
          // is just the middle of a turn, not a bonus one.
          extraTurn: applied.matched ? true : null,
          pairsDeadline: null, // every flip restarts the mover's idle window
        },
        result: getPairsWinner(applied.board),
      }
    },
    boardProps: (game) => ({
      deck: normalizePairsDeck(game.pairsDeck),
      flipped: normalizePairsFlipped(game.pairsFlipped),
      finished: game.status === 'finished',
      pairsDeadline: game.pairsDeadline ?? null,
    }),
  },
  {
    type: 'pairs4', label: 'PAIRS 4×4',
    desc: 'a quick 16-card memory duel', Icon: PairsIcon,
    badge: 'PR4', maxWidth: 'max-w-sm',
    category: 'memory',
    addedAt: '2026-10-02',
    durationMin: 2, tags: ['quick', 'thinky'], solo: true,
    variantOf: 'pairs', variantLabel: '4×4',
    variantBlurb: '8 pairs on big cards. First to 5 clinches.',
    boardSize: PAIRS_QUICK_CELL_COUNT,
    getMoveIndex: (board, index) => (board[index] ? -1 : index),
    BoardComponent: PairsBoard,
    focus: true,
    applyMove: ({ board, game, index, symbol }) => {
      const deck = normalizePairsDeck(game.pairsDeck)
      const flipped = normalizePairsFlipped(game.pairsFlipped)
      const applied = applyPairsMove(board, deck, flipped, index, symbol)
      if (!applied) return null
      return {
        updates: {
          board: applied.board,
          pairsFlipped: applied.flipped,
          currentTurn: applied.turnStays ? symbol : (symbol === 'X' ? 'O' : 'X'),
          // GO AGAIN! is for a match only — a first flip also keeps the turn, but that
          // is just the middle of a turn, not a bonus one.
          extraTurn: applied.matched ? true : null,
          pairsDeadline: null, // every flip restarts the mover's idle window
        },
        result: getPairsWinner(applied.board),
      }
    },
    boardProps: (game) => ({
      deck: normalizePairsDeck(game.pairsDeck),
      flipped: normalizePairsFlipped(game.pairsFlipped),
      finished: game.status === 'finished',
      pairsDeadline: game.pairsDeadline ?? null,
    }),
  },
  {
    type: 'sketch', label: 'SKETCH',
    desc: 'draw & guess the word', Icon: SketchIcon,
    badge: 'SK', maxWidth: 'max-w-sm',
    category: 'party',
    addedAt: '2026-07-11',
    durationMin: 10, tags: ['thinky'],
    custom: true, nPlayer: true, minPlayers: 2, maxPlayers: 8,
    Page: lazyWithRetry(() => import('../pages/SketchGame')),
    // Room chat is off for the artist mid-round (the word could be typed out).
    chatLocked: (game, uid) => sketchChatLock(game?.round, uid),
    // `game` (the room) is passed by Game.jsx's START: offline seats are left
    // out of the drawing order, and the first choose window follows the
    // room's timer scale (null = timers off, the coordinator advances).
    startRound: (players, game) => {
      const online = Object.fromEntries(Object.entries(players || {}).filter(([, p]) => p?.online !== false))
      const order = seatOrderSketch(Object.keys(online).length ? online : players)
      const startedAt = Date.now()
      const chooseMs = scaledMs(SKETCH_CHOOSE_MS, game?.timerScale)
      return {
        round: {
          phase: 'choosing',
          cycle: 1,
          artist: order[0] ?? null,
          order,
          used: [],
          matchSeed: `${startedAt}:${Math.random().toString(36).slice(2)}`,
          endsAt: chooseMs == null ? null : startedAt + chooseMs,
        },
      }
    },
  },
  {
    type: 'codewords', label: 'CODE WORDS',
    desc: 'team clues, hidden agents', Icon: CodeWordsIcon,
    badge: 'CW', maxWidth: 'max-w-lg',
    category: 'party',
    addedAt: '2026-09-26',
    durationMin: 15, tags: ['thinky', 'party'], solo: false,
    custom: true, nPlayer: true, minPlayers: 4, maxPlayers: 8,
    Page: lazyWithRetry(() => import('../pages/CodeWordsGame')),
    // no startRound — CodeWordsGame deals its own boards (teams + sealed key)
  },
  {
    type: 'justone', label: 'JUST ONE',
    desc: 'co-op clues, duplicates cancel', Icon: JustOneIcon,
    badge: 'J1', maxWidth: 'max-w-sm',
    category: 'party',
    addedAt: '2026-09-26',
    durationMin: 15, tags: ['thinky', 'party'], solo: false,
    custom: true, nPlayer: true, minPlayers: 3, maxPlayers: 8,
    // `quiet` from the clues to the guess: the clue-givers know the word, so
    // typed chat would let anyone hand it to the guesser.
    quiet: (game) => game?.status === 'playing' && JUST_ONE_QUIET_PHASES.has(game?.round?.phase),
    Page: lazyWithRetry(() => import('../pages/JustOneGame')),
    // no startRound — JustOneGame deals its own sealed cards
  },
]

const NEW_BADGE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

export const isNewGame = (entry, now = new Date()) => {
  if (!entry?.addedAt) return false
  const addedAt = new Date(entry.addedAt)
  return now.getTime() - addedAt.getTime() <= NEW_BADGE_WINDOW_MS
}

// The catalog's one NEW rail (instead of a NEW tag on every card, which a
// batch launch turned into noise): base entries inside the window, newest
// first, registry order breaking ties.
export const getNewGames = (entries, now = new Date()) =>
  entries
    .map((entry, i) => ({ entry, i }))
    .filter(({ entry }) => !entry.variantOf && isNewGame(entry, now))
    .sort((a, b) => String(b.entry.addedAt).localeCompare(String(a.entry.addedAt)) || a.i - b.i)
    .map(({ entry }) => entry)

// The party lobby (party-first rooms, src/lib/partyLogic.js): a room starts
// here and comes back here between games. Not a catalogue game, so it lives
// outside GAME_TYPES (the picker, search, counts and HOW TO PLAY all walk the
// registry) but resolves through getGameConfig like any room type.
export const PARTY_LOBBY = {
  type: 'party', label: 'PARTY', desc: 'pick a game together', category: 'party',
  nPlayer: true, minPlayers: 1, maxPlayers: 4, custom: true, hidePlayerCards: true, Icon: PartyIcon,
  Page: lazyWithRetry(() => import('../pages/PartyLobby')),
}

export const getGameConfig = (type) => (type === PARTY_LOBBY.type ? PARTY_LOBBY : GAME_TYPES.find(t => t.type === type) ?? GAME_TYPES[0])

// Whether this build knows `type`. getGameConfig falls back to the first entry
// (TIC TAC TOE) for an unknown type, so a room opened by an older build after a
// newer one switched it to a game this build doesn't have would render, and
// write, as tic-tac-toe. The room shell checks this first and asks for an
// update instead.
export const isKnownGameType = (type) => typeof type === 'string' && (type === PARTY_LOBBY.type || GAME_TYPES.some(t => t.type === type))

// 2P turn-based games: one seat must act first, so the waiting room (and
// rematch) asks who starts. Real-time, party, and simultaneous races skip
// this and still auto-start when the second player sits.
export function usesFirstMover(gameType) {
  const cfg = GAME_TYPES.find(t => t.type === gameType)
  if (!cfg) return false
  return !cfg.nPlayer && !cfg.realtime && !cfg.simultaneous
}

// Offline local pass-and-play (hot-seat, no Firebase): same eligibility as a
// standard registry-driven board game — a real board/win-checker, not custom
// (hidden-info or bespoke-state) logic, not nPlayer, simultaneous, or realtime.
export function supportsLocalPlay(gameType) {
  const cfg = GAME_TYPES.find(t => t.type === gameType)
  if (!cfg) return false
  // A custom game can opt in with its own pass-and-play page (`LocalPage`),
  // rendered by Demo.jsx's local route instead of the generic board engine.
  if (cfg.LocalPage) return true
  // A custom online page that keeps a turn-based board for pass-and-play.
  if (cfg.localBoard && cfg.BoardComponent) return true
  return !!cfg.BoardComponent && !cfg.custom && !cfg.nPlayer && !cfg.simultaneous && !cfg.realtime
}

export function resolveGoesFirst(goesFirst) {
  if (goesFirst === 'O') return 'O'
  if (goesFirst === 'random') return Math.random() < 0.5 ? 'X' : 'O'
  return 'X'
}

export function firstMoverUpdates(gameType, symbol) {
  if (!usesFirstMover(gameType)) return {}
  if (gameType === 'hangwoman') {
    return { 'round/setter': symbol }
  }
  if (gameType === 'bluff') {
    return { 'bluffRound/turn': symbol }
  }
  if (gameType === 'faceoff') {
    return { 'round/fTurn': symbol }
  }
  if (gameType === 'password') {
    // Password's first clue-giver is `starter` (PasswordGame reads it when it
    // deals the first round); writing currentTurn here was silently ignored.
    return { starter: symbol }
  }
  if (gameType === 'wirecrossed') {
    // The starter is this bomb's Tech; nextStarter alternates it every bomb.
    return { 'wire/tech': symbol }
  }
  return { currentTurn: symbol }
}

// Merges firstMoverUpdates into a freshGameState() patch. Firebase update()
// rejects a patch holding both `round` and `round/setter` ("ancestor of
// another path"), which made NEW MATCH / PLAY AGAIN fail outright for
// Hangwoman and Bluff; nested first-mover paths are folded into the parent
// object the fresh state already carries.
export function withFirstMover(fresh, gameType, symbol) {
  const out = { ...fresh }
  for (const [path, value] of Object.entries(firstMoverUpdates(gameType, symbol))) {
    const [head, ...rest] = path.split('/')
    if (!rest.length || !(head in out)) { out[path] = value; continue }
    const base = out[head] && typeof out[head] === 'object' ? { ...out[head] } : {}
    let node = base
    rest.slice(0, -1).forEach(key => {
      node[key] = node[key] && typeof node[key] === 'object' ? { ...node[key] } : {}
      node = node[key]
    })
    node[rest[rest.length - 1]] = value
    out[head] = base
  }
  return out
}

export const GAME_CATEGORIES = [
  { id: 'board',     label: 'BOARD',  full: 'BOARD GAMES' },
  { id: 'reflex',    label: 'REFLEX', full: 'REFLEX & SKILL' },
  { id: 'memory',    label: 'MEMORY', full: 'MEMORY' },
  { id: 'word',      label: 'WORD',   full: 'WORD GAMES' },
  { id: 'dicebluff', label: 'DICE',   full: 'DICE & BLUFF' },
  { id: 'party',     label: 'PARTY',  full: 'PARTY · 2–8 PLAYERS' },
]

export const getPlayerTag = (cfg) =>
  cfg?.nPlayer ? `${cfg.minPlayers}-${cfg.maxPlayers}P` : '2P'

// Nulls for every game-specific field — spread into freshGameState so switching
// games clears the previous game's keys from Firebase.
const FIELD_NULLS = {
  uWon: null, uActiveBoard: null,
  passNote: null, pieSwap: null,
  lastFrom: null, lastTo: null,
  sosLines: null,
  simonSequence: null, simonProgress: null, simonMiss: null, simonReplayUsed: null,
  simonDeadline: null, vmDeadline: null,
  chimpLevel: null, chimpLayout: null,
  chimpProgressX: null, chimpProgressO: null,
  chimpDoneX: null, chimpDoneO: null,
  chimpRoundStartedAt: null, chimpMiss: null,
  chimpFailX: null, chimpFailO: null, chimpTimeX: null, chimpTimeO: null,
  vmLevel: null, vmPattern: null, vmClicked: null, vmClears: null, vmMiss: null,
  vmClickedX: null, vmClickedO: null, vmDoneX: null, vmDoneO: null, vmFailX: null, vmFailO: null,
  vmTimeX: null, vmTimeO: null, vmRoundStartedAt: null,
  mem: null,
  numRound: null,
  reactionTimesX: null, reactionTimesO: null,
  aimTimesX: null, aimTimesO: null, aimMissesX: null, aimMissesO: null,
  aimEndTime: null, aimTargetX: null, aimTargetO: null,
  aimScoreX: null, aimScoreO: null,
  aimHitsX: null, aimHitsO: null,
  aimFriendlyX: null, aimFriendlyO: null,
  typingConfig: null, mathConfig: null, firstcutConfig: null,
  typingPassage: null, typingStartedAt: null,
  typingFinishedAtX: null, typingFinishedAtO: null,
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
  wordhuntGrid: null, wordhuntStartedAt: null,
  wordhuntWordsX: null, wordhuntWordsO: null,
  wordhuntScoreX: null, wordhuntScoreO: null,
  wordhuntDoneX: null, wordhuntDoneO: null,
  wordhuntReadyX: null, wordhuntReadyO: null,
  diceScoreX: null, diceScoreO: null, diceTurnScore: null, diceLast: null,
  diceRolls: null, diceRollIndex: null, diceRoll: null,
  diceSeed: null, diceSeedCommitX: null, diceSeedRevealX: null, diceSeedB: null,
  diceSeedCommitter: null, diceSeedResets: null, // Pig seed-loss recovery (pigSeedProtocol.js)
  bluffRound: null,
  wire: null, // wirecrossed
  pongScoreX: null, pongScoreO: null, pongMode: null, signaling: null, matchLength: null,
  arrowsRound: null, arrowsSeed: null, arrowsStartedAt: null, arrowsDifficulty: null,
  arrowsGoneX: null, arrowsGoneO: null, arrowsLivesX: null, arrowsLivesO: null,
  // updraft / updraftduo: the whole round (seed, start, seats, hazards, keys).
  updraft: null,
  // Retired shared-board keys: still nulled so rooms from before the race
  // rework shed them on the next reset.
  arrowsLevel: null, arrowsCleared: null,
  arrowsTrapSeen: null, arrowsLastBlocked: null, arrowsSeen: null,
  snakeScoreX: null, snakeScoreO: null,
  tronScoreX: null, tronScoreO: null,
  sumoScoreX: null, sumoScoreO: null,
  spaceduelScoreX: null, spaceduelScoreO: null,
  spaceduelHitsX: null, spaceduelHitsO: null,
  paintScoreX: null, paintScoreO: null,
  pacmacScoreX: null, pacmacScoreO: null,
  crMoves: null,
  crLastMove: null,
  // chainreaction4 (nPlayer variant): per-game deal + elimination marks.
  crPlaced: null,
  crEliminated: null,
  crSeatSymbols: null,
  // M-47: last cell/edge played, written by every board move so boards can
  // render a persistent marker after the placement animation ends.
  lastMove: null,
  // M-48: transient "extra turn" signal (D&B/SOS) — cleared on the next write.
  extraTurn: null,
  blockadePawnX: null, blockadePawnO: null,
  blockadeWallsX: null, blockadeWallsO: null,
  blockadeMoves: null,
  pairsDeck: null, pairsFlipped: null, pairsDeadline: null,
  mancalaPits: null, mancalaLast: null,
  airhockeyScoreX: null, airhockeyScoreO: null,
  artillerySeed: null, artilleryShots: null,
  // BIRDSEYE duel: the fort being played and the append-only shot list.
  bsFort: null, bsShots: null,
  archeryFormat: null, archerySeed: null, archeryShots: null,
  archeryPhase: null, archeryTied: null, archeryShootOffShots: null,
  archerySeatUids: null, archeryTurnStartedAt: null,
  // Animal Stack: the whole match (seats, hearts, drops, checkpoint) in one node.
  stack: null,
  // Minigolf per-match inputs (minigolfLogic.replayCourse). The lobby picks
  // golfCourse / golfClock are room-level house rules and stay out of here.
  golfOrder: null, golfShots: null, golfSkip: null, golfAway: null,
  minesSeed: null, minesStartedAt: null,
  minesRevealedX: null, minesRevealedO: null,
  minesDeadX: null, minesDeadO: null,
  minesDoneX: null, minesDoneO: null,
  // N-player races (raceLogic.js): the last round's ranking. The live round
  // itself sits in `round`.
  raceResult: null,
  herdCow: null,
  chatLog: null,
  // emote currently leaks across game switches — clear it too. `emotes` is
  // the reaction list that replaced it (old clients still write `emote`).
  emote: null,
  emotes: null,
  // Ataxx ply counter for the anti-cycle move cap (getAtaxxWinner).
  ataxxMoves: null,
  // Kamisado forced-color chain: color index 0-7 the current mover must play
  // (null = any tower). Shared state, lives outside round. Tower identity is
  // explicit: kamisadoTowers[sym][k] = cell of sym's home-color-k tower —
  // towers keep their home color after cross-color marches.
  kamisadoColor: null,
  kamisadoTowers: null,
  // Onitama card pool: 2/2 hands + face-up spare. Numbers rotate every move;
  // they never leave play, so switching games must clear them.
  onitamaHandX: null, onitamaHandO: null, onitamaSpare: null,
  // Quarto shared shelf + the piece the current mover must place.
  quartoUnplaced: null, quartoPending: null,
  // Santorini worker positions (heights live in `board`).
  santoriniWorkers: null,
  // Game-night mode (src/lib/nightLogic.js): the finished match already
  // counted into `night`, and players the host removed for this match. Both
  // reset with every fresh round/match/switch. Room-level night keys —
  // `night`, `queue`, `partyRoom`, `hostUid`, `locked`, `timerScale` — are
  // deliberately NOT here: they survive switches and NEW MATCH.
  nightMark: null,
  kicked: null,
  // Arrival (arrivalLogic.js): the 3·2·1 stamp of this match's first move, and
  // the anonymous "someone opened your link" signals. Both belong to one
  // match's start, so a rematch or a switch drops them.
  startsAt: null,
  arriving: null,
}

const MEMORY_STREAM_TYPES = new Set(['verbalmemory', 'nback'])
const MEMORY_LEVEL_TYPES = new Set(['cupshuffle', 'whatchanged', 'kimsgame', 'nametags'])
const JUST_ONE_QUIET_PHASES = new Set(['clues', 'compare', 'guess', 'judging'])

/** Does the room hide typed chat right now? Registry `quiet` is either a
 * flag (HUNCH: always) or a function of the room (CONVERGE: while writing). */
export function isQuietRoom(cfg, game) {
  return typeof cfg?.quiet === 'function' ? !!cfg.quiet(game) : !!cfg?.quiet
}

export function freshGameState(gameType, previous = null) {
  const cfg = getGameConfig(gameType)
  if (gameType === 'archery4') {
    const keep = previous?.gameType === 'archery4' ? previous : null
    return { ...FIELD_NULLS, board: null, boxes: null, currentTurn: null, round: null,
      archeryFormat: archeryFormat(keep?.archeryFormat) }
  }
  if (gameType === 'darts') {
    // The lobby picks (game, start score, throw, legs, Nerves) ride a rematch.
    const keep = previous?.gameType === 'darts' && previous.round?.dCfg ? normalizeDartsCfg(previous.round.dCfg) : null
    return { ...FIELD_NULLS, board: null, boxes: null, currentTurn: null, round: keep ? { dCfg: keep } : null }
  }
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
  if (gameType === 'dotsandboxes' || gameType === 'dotsandboxes4') {
    const { edgeCount, boxCount } = dbConfig(gameType === 'dotsandboxes4' ? DB_SIZE_CLASSIC : DB_SIZE)
    return { ...FIELD_NULLS, round: null,
      board: Array(edgeCount).fill(''), boxes: Array(boxCount).fill(''), currentTurn: 'X' }
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
      chimpDoneX: false, chimpDoneO: false,
      // Stamped (server time) by the first client that sees the room playing — a
      // creation-time stamp had already expired round 1 by the time O joined.
      chimpRoundStartedAt: null, chimpMiss: null,
      chimpFailX: null, chimpFailO: null, chimpTimeX: 0, chimpTimeO: 0 }
  }
  if (gameType === 'pong') {
    // currentTurn omitted (null) — Pong has no turns, so Game.jsx's move-sound
    // detection stays silent and the page drives its own audio.
    // matchLength: rounds needed to win the match (default 3 = best-of-5).
    // pongMode: rule set from pongLogic's MODES. Both are the host's lobby
    // picks, so a rematch (previous = this room) keeps them.
    const keep = previous?.gameType === 'pong' ? previous : null
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      pongScoreX: 0, pongScoreO: 0,
      matchLength: keep?.matchLength ?? 3,
      pongMode: keep?.pongMode ?? 'classic' }
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
  if (gameType === 'paint') {
    // currentTurn omitted (null) — Paint is real-time with no turns.
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      paintScoreX: 0, paintScoreO: 0 }
  }
  if (gameType === 'pacmac') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      pacmacScoreX: 0, pacmacScoreO: 0 }
  }
  if (gameType === 'numbermemory') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      numRound: { phase: 'showing', level: 1, number: generateNumber(1) } }
  }
  if (gameType === 'visualmemory') {
    // Online duel state (VisualMemoryGame). vmRoundStartedAt is stamped by the first
    // client that sees the room playing; the pass-and-play board starts from
    // currentTurn/vmClicked like before.
    return { ...FIELD_NULLS, board: null, boxes: null, round: null,
      currentTurn: 'X',
      vmLevel: VM_START_LEVEL,
      vmPattern: generateVmPattern(VM_START_LEVEL),
      vmClicked: null,
      vmDoneX: false, vmDoneO: false, vmTimeX: 0, vmTimeO: 0 }
  }
  if (gameType === 'reversi') {
    return { ...FIELD_NULLS, boxes: null, round: null,
      board: reversiInitialBoard(), currentTurn: 'X' }
  }
  if (gameType === 'chainreaction' || gameType === 'chainreaction6') {
    const n = gameType === 'chainreaction6' ? CR_CELL_COUNT_CLASSIC : CR_CELL_COUNT
    return { ...FIELD_NULLS, boxes: null, round: null,
      board: Array(n).fill(''), currentTurn: 'X', crMoves: 0 }
  }
  if (gameType === 'blockade') {
    return { ...FIELD_NULLS, boxes: null, round: null,
      board: Array(BK_WALL_SLOT_COUNT).fill(''), currentTurn: 'X',
      blockadePawnX: BK_START_X, blockadePawnO: BK_START_O,
      blockadeWallsX: BK_WALLS_PER_PLAYER, blockadeWallsO: BK_WALLS_PER_PLAYER,
      blockadeMoves: 0 }
  }
  if (gameType === 'dice' || gameType === 'dice-big') {
    // Both Pig variants share the dice state shape and the commit-reveal
    // seed protocol; dice-big previously fell through to the generic board
    // branch and never got a seed, leaving every roll rejected.
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: 'X',
      diceScoreX: 0, diceScoreO: 0, diceTurnScore: 0, diceLast: null,
      diceRolls: [], diceRollIndex: 0, diceRoll: null,
      diceSeed: null, diceSeedCommitX: null, diceSeedRevealX: null, diceSeedB: null,
      diceSeedCommitter: null, diceSeedResets: null }
  }
  if (gameType === 'battleship') {
    // currentTurn null — the page drives its own shot sounds (hangwoman
    // precedent). Everything else lives in round; no new top-level keys.
    return { ...FIELD_NULLS, board: null, boxes: null, currentTurn: null,
      round: { phase: 'placing' } }
  }
  if (gameType === 'faceoff') {
    // currentTurn null: turns live in round.fTurn (Battleship precedent). The
    // first seated client deals the faces by writing round.fSeed.
    return { ...FIELD_NULLS, board: null, boxes: null, currentTurn: null,
      round: { fTurn: 'X' } }
  }
  if (gameType === 'mancala') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null,
      currentTurn: 'X',
      mancalaPits: INITIAL_PITS(),
      mancalaLast: null }
  }
  if (gameType === 'checkers') {
    return { ...FIELD_NULLS, boxes: null, round: null,
      board: INITIAL_CHECKERS(),
      currentTurn: 'X' }
  }
  if (gameType === 'breakthrough') {
    return { ...FIELD_NULLS, boxes: null, round: null,
      board: INITIAL_BREAKTHROUGH(),
      currentTurn: 'X' }
  }
  if (gameType === 'ataxx') {
    return { ...FIELD_NULLS, boxes: null, round: null,
      board: INITIAL_ATAXX(),
      currentTurn: 'X',
      ataxxMoves: 0 }
  }
  if (gameType === 'kamisado') {
    return { ...FIELD_NULLS, boxes: null, round: null,
      board: INITIAL_KAMISADO(),
      currentTurn: 'X',
      kamisadoColor: null,
      kamisadoTowers: INITIAL_KAMISADO_TOWERS() }
  }
  if (gameType === 'onitama') {
    // Deal 2/2/1 from the 16-card deck; X moves first.
    const deal = dealCards()
    return { ...FIELD_NULLS, boxes: null, round: null,
      board: INITIAL_ONITAMA(),
      currentTurn: 'X',
      onitamaHandX: deal.handX,
      onitamaHandO: deal.handO,
      onitamaSpare: deal.spare }
  }
  if (gameType === 'quarto') {
    // Random piece awaits X on turn one (the imaginary first hand-over).
    const deal = dealQuarto()
    return { ...FIELD_NULLS, boxes: null, round: null,
      board: Array(QRT_CELL_COUNT).fill(''),
      currentTurn: 'X',
      quartoUnplaced: deal.unplaced,
      quartoPending: deal.pending }
  }
  if (gameType === 'santorini') {
    const st = INITIAL_SANTORINI()
    return { ...FIELD_NULLS, boxes: null, round: null,
      board: st.board,
      currentTurn: 'X',
      santoriniWorkers: st.workers }
  }
  if (gameType === 'loa') {
    return { ...FIELD_NULLS, boxes: null, round: null,
      board: INITIAL_LOA(),
      currentTurn: 'X' }
  }
  if (gameType === 'yavalath') {
    return { ...FIELD_NULLS, boxes: null, round: null,
      board: Array(YV_CELL_COUNT).fill(''),
      currentTurn: 'X' }
  }
  if (gameType === 'stickyfingers' || gameType === 'fenderbender') {
    // Realtime (pong family): the round lives in the host's sim, the room only
    // holds the standard winner/scores.
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null }
  }
  if (gameType === 'lazysusan') {
    // The match is one `round` object written at START; nothing else to reset.
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null }
  }
  if (gameType === 'puckrush') {
    // Realtime (pong family): the round lives in the host's sim, the room only
    // holds the standard winner/scores.
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null }
  }
  if (gameType === 'airhockey') {
    // Realtime (pong family): currentTurn null, page drives its own audio.
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      airhockeyScoreX: 0, airhockeyScoreO: 0 }
  }
  if (gameType === 'archery') {
    const keep = previous?.gameType === 'archery' ? previous : null
    return { ...FIELD_NULLS, board: null, boxes: null, round: null,
      currentTurn: 'X', archeryFormat: archeryFormat(keep?.archeryFormat),
      archerySeed: generateSeed(), archeryShots: null, archeryPhase: 'main',
      archeryTied: null, archeryShootOffShots: null, archerySeatUids: null,
      archeryTurnStartedAt: null }
  }
  if (gameType === 'birdseye') {
    // PLAY AGAIN walks the five forts; a fresh room starts on 1-1.
    const prevFort = previous?.gameType === 'birdseye' ? previous.bsFort : undefined
    return { ...FIELD_NULLS, board: null, boxes: null, round: null,
      currentTurn: 'X', ...freshDuel(prevFort === undefined ? 0 : nextFortIndex(prevFort)) }
  }
  if (gameType === 'artillery') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null,
      currentTurn: 'X',
      artillerySeed: generateSeed(),
      artilleryShots: null }
  }
  if (gameType === 'twotruths') {
    return { ...FIELD_NULLS, board: null, currentTurn: null, boxes: null,
      round: { phase: 'writing', roundNum: 1 } }
  }
  if (gameType === 'bluff') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      bluffRound: { phase: 'rolling', turn: 'X', diceCountX: 5, diceCountO: 5 } }
  }
  if (gameType === 'wordduel') {
    return { ...FIELD_NULLS, board: null, boxes: null, currentTurn: null,
      round: { phase: 'setting' } }
  }
  if (gameType === 'arrows') {
    // A decided/final match must never advance into a 4th round: fall back to
    // a fresh round-0 board (scores are zeroed separately by applyNewMatch).
    // The host's difficulty pick rides along to the next round.
    const keep = previous?.gameType === 'arrows' ? previous : null
    const next = keep ? arrowsNextRound(keep) : null
    const arrowFields = next ?? arrowsFreshState()
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      ...arrowFields, arrowsDifficulty: keep?.arrowsDifficulty ?? null }
  }
  if (gameType === 'updraft' || gameType === 'updraftduo') {
    // A new seed every round; a versus rematch keeps the host's CHAOS/PURE pick.
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      ...updraftFreshState(previous, { coop: gameType === 'updraftduo' }) }
  }
  if (gameType === 'wordcoop') {
    return { ...FIELD_NULLS, board: null, boxes: null, currentTurn: null, round: null }
  }
  if (gameType === 'hunch' || gameType === 'converge') {
    // The page deals the run on first sight of a round without a phase.
    // PLAY AGAIN (which passes the room) keeps the best result so far; NEW
    // MATCH and a switch start from nothing.
    const best = previous?.gameType === gameType ? Number(previous.round?.best) || 0 : 0
    return { ...FIELD_NULLS, board: null, boxes: null, currentTurn: null,
      round: best ? { best } : null }
  }
  if (gameType === 'wirecrossed') {
    // New rooms begin on legacy generator v1 until both seats acknowledge the
    // updated client; v2 then asks for one difficulty and runs two role-swapped bombs.
    // Existing v1 rooms keep their old level climb until a new match.
    return { ...FIELD_NULLS, board: null, boxes: null, currentTurn: null, round: null,
      wire: nextWireBomb(previous?.wire, generateSeed()) }
  }
  if (gameType === 'lanterns' || gameType === 'docking') {
    // Co-op pages deal on first view (the setup screen picks deck/approach),
    // so a fresh state is just an empty round.
    return { ...FIELD_NULLS, board: null, boxes: null, currentTurn: null, round: null }
  }
  if (gameType === 'wordrace') {
    return { ...FIELD_NULLS, board: null, boxes: null, currentTurn: null,
      round: null }
  }
  if (gameType === 'password') {
    return { ...FIELD_NULLS, board: null, boxes: null, currentTurn: null, round: null }
  }
  if (gameType === 'wordhunt') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      wordhuntGrid: generateGrid(generateSeed()),
      wordhuntScoreX: 0, wordhuntScoreO: 0 }
  }
  if (gameType === 'anagrams') {
    const previousRound = previous?.round
    return { ...FIELD_NULLS, board: null, boxes: null, currentTurn: null,
      round: previousRound
        ? {
          phase: 'ready',
          roundNum: (previousRound.roundNum || 1) + 1,
          usedRacks: previousRound.usedRacks || [],
        }
        : null }
  }
  if (MEMORY_STREAM_TYPES.has(gameType) || MEMORY_LEVEL_TYPES.has(gameType)) {
    // memoryRaceLogic.js: one seeded deal per level (or one stream) for both seats.
    const seed = newSeed()
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      mem: MEMORY_STREAM_TYPES.has(gameType) ? memStreamStart(seed) : memLevelStart(1, seed) }
  }
  if (gameType === 'splitsignal') {
    return { ...FIELD_NULLS, board: null, boxes: null, round: null, currentTurn: null,
      mem: { level: 1, seed: newSeed(), startAt: null, lives: 3, found: null } }
  }
  if (gameType === 'pairs' || gameType === 'pairs4') {
    const cells = gameType === 'pairs4' ? PAIRS_QUICK_CELL_COUNT : PAIRS_CELL_COUNT
    return { ...FIELD_NULLS, boxes: null, round: null, currentTurn: 'X',
      board: Array(cells).fill(''),
      pairsDeck: generatePairsDeck(cells / 2),
      pairsFlipped: null }
  }
  return { ...FIELD_NULLS, board: Array(cfg.boardSize).fill(''), boxes: null, round: null, currentTurn: 'X' }
}

// Result-screen margin for a finished round (registry `resultMargin(game,
// viewerSymbol)`): `{ mine, theirs, total?, unit: [one, many] }`, or null when
// the game can't say — the result screen then keeps its plain copy
// (resultMoodLogic.js).
export function resultMarginFor(game, viewerSymbol) {
  return getGameConfig(game?.gameType)?.resultMargin?.(game, viewerSymbol) ?? null
}
const BOX_UNIT = ['box', 'boxes']
const withUnit = (m, unit) => (m ? { ...m, unit } : null)

// The reason room chat is locked for `uid` right now (registry `chatLocked`,
// e.g. the Sketch artist mid-round), or null when they may type.
export function chatLockFor(game, uid) {
  return getGameConfig(game?.gameType)?.chatLocked?.(game, uid) ?? null
}

// Lobby (challenge-created room) support ------------------------------------
//
// A challenge room is created with a concrete `gameType` (default tictactoe)
// plus `lobby: true`; status stays 'waiting' until either seated player taps
// START, which clears the flag. See CLAUDE.md's Data model delta.

// Forces a switch-updates patch back to 'waiting' (a lobby switch must never
// auto-start even once both seats are filled) and strips chatLog/emote from
// it so lobby chat/reactions survive a pre-game game-type switch — the
// freshGameState()-derived nulls in `updates` would otherwise wipe them via
// FIELD_NULLS. Does not mutate its input.
export function lobbySwitchOverrides(updates) {
  const out = { ...updates, status: 'waiting' }
  delete out.chatLog
  delete out.emote
  delete out.emotes
  return out
}

// Builds a party-first room (Home START A PARTY, Friends INVITE): the creator
// alone in the PARTY lobby, uid-keyed, hosting, capped at 4 (captain call D4).
// `partyRoom` marks it so switches reseat everyone (nightLogic) and `removed`
// / `partyCap` / `hostUid` last for the whole party.
export function buildPartyRoom({ name, avatar, playerId, now = Date.now(), cap = 4 }) {
  return {
    gameType: PARTY_LOBBY.type, status: 'waiting', lobby: true,
    partyRoom: true, partyCap: cap, hostUid: playerId,
    scores: {}, createdAt: now, lastActivityAt: now,
    players: { [playerId]: { name, joinedAt: now, playerId, online: true, avatar: avatar ?? null } },
    ...freshGameState(PARTY_LOBBY.type),
  }
}

// Builds the room doc for a friend challenge (Friends.jsx) — same X-seat/
// scores/createdAt shape Home.jsx uses for a link-created room, plus the
// `lobby: true` flag so both players land in a shared lobby instead of the
// challenger's game-type choice being forced up front.
export function buildChallengeRoom({ name, avatar, playerId, now = Date.now(), gameType = 'tictactoe' }) {
  return {
    gameType, status: 'waiting', lobby: true,
    scores: { X: 0, O: 0 }, createdAt: now, lastActivityAt: now,
    players: { X: { name, joinedAt: now, playerId, avatar } },
    ...freshGameState(gameType),
  }
}
