// demoBots.js — pure AI logic for casual "play vs computer" mode.
// NO React, NO Firebase. Pure functions only.
//
// pickBotMove(type, game, botSymbol, difficulty = 'normal') → move payload
// (same shape the board's onMove emits). Returns null when no move is
// possible (e.g. Reversi pass).
//
// Difficulty (see the "Difficulty" section at the bottom):
//   easy   — mostly a random legal move (EASY_RANDOM_RATE), otherwise normal.
//   normal — the original casual heuristics below, unchanged.
//   hard   — deeper search / stronger heuristics where that is cheap enough
//            for the demo's 600 ms turn budget; botDifficulties(type) lists
//            which levels a game actually distinguishes.

import { getWinner, normalizeBoard } from './gameLogic'
import { getTicTacToe4Winner, TTT4_WIN_LINES } from './tictactoe4Logic'
import {
  getConnectFourWinner,
  getConnectFourDrop,
  CF5,
} from './connectFourLogic'
import {
  legalCells, miniBoardWinner, normalizeUWon, applyUltimateMove, getUltimateWinner,
} from './ultimateTttLogic'
import {
  getGomokuWinner, GOMOKU_SIZE, GOMOKU_CELL_COUNT, canGomokuSwap,
  SWAP_ACTION as GOMOKU_SWAP_ACTION,
} from './gomokuLogic'
import { legalMoves, flippedBy, applyReversiMove, hasAnyMove } from './reversiLogic'
import {
  applyOrderChaosMove,
  getOrderChaosWinner,
  OC_SIZE,
} from './orderChaosLogic'
import { applySosMove, normalizeSosLines, findNewSosLines } from './sosLogic'
import {
  applyEdgeMove,
  edgesOfBox,
  boxesOfEdge,
  dbSizeFromGame,
  dbConfig,
} from './dotsAndBoxesLogic'
import { PIG_TARGET } from './diceLogic'
import {
  applyPlacement,
  decodeCell,
  criticalMass,
  crDimsFromLength,
} from './chainReactionLogic'
import { computeBotMove as botBlockade, legalPawnMoves as bkLegalPawnMoves } from './blockadeLogic'
import { computePairsBotMove } from './pairsLogic'
import {
  neighbors, HEX_CELL_COUNT, HEX_SIZE, canHexSwap, SWAP_ACTION as HEX_SWAP_ACTION,
} from './hexLogic'
import {
  SIM_EDGE_COUNT, SIM_EDGES, edgesOf, triangleOf,
} from './simLogic'
import { applyChompMove, edibleSquares, POISON_INDEX } from './chompLogic'
import {
  BT_COLS, BT_ROWS, legalMoves as btLegalMoves,
} from './breakthroughLogic'
import {
  legalAtaxxMoves, applyAtaxxMove, getAtaxxWinner,
  countAtaxx, AX_COLS,
} from './ataxxLogic'
import {
  KM_COLORS, kmTowerMoves, kmTowerCellOf as kmTowerOf, applyKamisadoMove,
} from './kamisadoLogic'
import {
  normalizeOnBoard, legalOnMoves, applyOnitamaMove,
} from './onitamaLogic'
import {
  normalizeQuartoBoard, lineWins, QRT_LINES,
} from './quartoLogic'
import {
  normalizeStBoard, normalizeStWorkers, legalStTurns, applyStMove,
} from './santoriniLogic'
import {
  normalizeLoaBoard, loaMoves, applyLoaMove,
} from './loaLogic'
import {
  YV_CELL_COUNT, normalizeYvBoard, getYavalathResult,
} from './yavalathLogic'
import {
  KM_SIZE,
} from './kamisadoLogic'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const opponent = sym => (sym === 'X' ? 'O' : 'X')

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// For any board game: find a cell where placing `sym` wins immediately,
// using the provided winnerFn(board) → truthy-if-win.
function findWinningMove(board, empties, sym, winnerFn) {
  for (const i of shuffle(empties)) {
    const b = [...board]
    b[i] = sym
    const res = winnerFn(b)
    if (res && res.winner === sym) return i
  }
  return null
}

// ---------------------------------------------------------------------------
// 1. Tic-tac-toe
// ---------------------------------------------------------------------------

function botTicTacToe(game, botSymbol) {
  const board = game.board
  const opp = opponent(botSymbol)
  const empties = board.map((c, i) => (c === '' ? i : -1)).filter(i => i >= 0)
  if (!empties.length) return null

  // Win
  const win = findWinningMove(board, empties, botSymbol, getWinner)
  if (win !== null) return win

  // Block
  const block = findWinningMove(board, empties, opp, getWinner)
  if (block !== null) return block

  // Prefer center → corners → edges
  const center = [4]
  const corners = shuffle([0, 2, 6, 8])
  const edges = shuffle([1, 3, 5, 7])
  for (const tier of [center, corners, edges]) {
    const avail = tier.filter(i => board[i] === '')
    if (avail.length) return pickRandom(avail)
  }

  return pickRandom(empties)
}

// 4×4 four-in-a-row — same win/block logic as the 3×3 bot but checked against
// the real 4×4 win lines; falls back to the inner square, then any empty.
function botTicTacToe4(game, botSymbol) {
  const board = game.board
  const opp = opponent(botSymbol)
  const empties = board.map((c, i) => (c === '' ? i : -1)).filter(i => i >= 0)
  if (!empties.length) return null

  const win = findWinningMove(board, empties, botSymbol, getTicTacToe4Winner)
  if (win !== null) return win

  const block = findWinningMove(board, empties, opp, getTicTacToe4Winner)
  if (block !== null) return block

  const centers = [5, 6, 9, 10]
  const avail = centers.filter(i => board[i] === '')
  return pickRandom(avail.length ? avail : empties)
}

// ---------------------------------------------------------------------------
// 2. Connect Four
// ---------------------------------------------------------------------------

// Center-biased column preference order
const CF_COL_PREF = [3, 2, 4, 1, 5, 0, 6]

// Centre-out column order for any width (7 → [3,2,4,1,5,0,6]).
function colPref(cols) {
  if (cols === 7) return CF_COL_PREF
  const centre = Math.floor(cols / 2)
  return [...Array(cols).keys()].sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre) || a - b)
}

function botConnectFour(game, botSymbol, config = null) {
  const board = game.board
  const opp = opponent(botSymbol)
  const legalCols = colPref(config?.cols ?? 7).filter(c => getConnectFourDrop(board, c, config ?? undefined) !== -1)
  if (!legalCols.length) return null

  // Win immediately
  for (const col of shuffle(legalCols)) {
    const landing = getConnectFourDrop(board, col, config ?? undefined)
    const b = [...board]
    b[landing] = botSymbol
    const res = getConnectFourWinner(b, config ?? undefined)
    if (res && res.winner === botSymbol) return col
  }

  // Block opponent win
  for (const col of shuffle(legalCols)) {
    const landing = getConnectFourDrop(board, col, config ?? undefined)
    const b = [...board]
    b[landing] = opp
    const res = getConnectFourWinner(b, config ?? undefined)
    if (res && res.winner === opp) return col
  }

  // Prefer center-biased order with slight randomness
  // Split legalCols into preferred order (already sorted by CF_COL_PREF)
  // and pick with a bias: pick from the first 3 available 80% of the time
  const topCols = legalCols.slice(0, Math.min(3, legalCols.length))
  if (Math.random() < 0.8) return pickRandom(topCols)
  return pickRandom(legalCols)
}

// ---------------------------------------------------------------------------
// 3. Gomoku (15×15)
// ---------------------------------------------------------------------------

function adjacentIndices(idx, size) {
  const row = Math.floor(idx / size)
  const col = idx % size
  const result = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const r = row + dr
      const c = col + dc
      if (r >= 0 && r < size && c >= 0 && c < size) {
        result.push(r * size + c)
      }
    }
  }
  return result
}

function botGomoku(game, botSymbol) {
  const board = game.board
  const opp = opponent(botSymbol)
  const empties = board.map((c, i) => (c === '' ? i : -1)).filter(i => i >= 0)
  if (!empties.length) return null

  // (a) Win immediately — only scan cells near existing stones for speed
  const occupied = board.map((c, i) => (c !== '' ? i : -1)).filter(i => i >= 0)

  if (occupied.length === 0) {
    // Empty board — play center
    return Math.floor(GOMOKU_CELL_COUNT / 2)
  }

  // Build candidate set: empty cells adjacent to any stone
  const candidateSet = new Set()
  for (const occ of occupied) {
    for (const adj of adjacentIndices(occ, GOMOKU_SIZE)) {
      if (board[adj] === '') candidateSet.add(adj)
    }
  }
  const candidates = [...candidateSet]

  // (a) Try to win
  for (const i of shuffle(candidates)) {
    const b = [...board]
    b[i] = botSymbol
    const res = getGomokuWinner(b)
    if (res && res.winner === botSymbol) return i
  }

  // (b) Block opponent win
  for (const i of shuffle(candidates)) {
    const b = [...board]
    b[i] = opp
    const res = getGomokuWinner(b)
    if (res && res.winner === opp) return i
  }

  // (c) Pick adjacent cell preferring those adjacent to the most bot stones
  if (candidates.length) {
    // Score each candidate by # of adjacent bot stones
    const scored = candidates.map(i => {
      const adjCount = adjacentIndices(i, GOMOKU_SIZE).filter(a => board[a] === botSymbol).length
      return { i, adjCount }
    })
    scored.sort((a, b) => b.adjCount - a.adjCount)
    // Among top tier (same adjCount as best), pick randomly
    const best = scored[0].adjCount
    const topTier = scored.filter(s => s.adjCount === best).map(s => s.i)
    return pickRandom(topTier)
  }

  // (d) Fallback: center
  return Math.floor(GOMOKU_CELL_COUNT / 2)
}

// ---------------------------------------------------------------------------
// 4. Reversi
// ---------------------------------------------------------------------------

const REVERSI_CORNERS = [0, 7, 56, 63]

function botReversi(game, botSymbol) {
  const board = game.board
  const moves = legalMoves(board, botSymbol)
  if (!moves.length) return null // caller handles pass

  // Prefer corners
  const cornerMoves = moves.filter(m => REVERSI_CORNERS.includes(m))
  if (cornerMoves.length) return pickRandom(cornerMoves)

  // Greedy: maximize flips
  let best = null
  let bestCount = -1
  for (const m of shuffle(moves)) {
    const count = flippedBy(board, m, botSymbol).length
    if (count > bestCount) {
      bestCount = count
      best = m
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// 5. Order & Chaos — botSymbol picks the role: X = ORDER (wants a 5-run of
// either letter), O = CHAOS (wants to prevent one until the board fills).
// ---------------------------------------------------------------------------

// [dr, dc] for 4 canonical directions: right, down, down-right, down-left —
// mirrors orderChaosLogic's own DIRECTIONS (not exported, kept in sync here).
const OC_DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]

// Longest contiguous run of `letter` that passes through `index`, assuming
// `letter` has already been placed there.
function ocRunLengthThrough(board, index, letter) {
  const row = Math.floor(index / OC_SIZE)
  const col = index % OC_SIZE
  let best = 1
  for (const [dr, dc] of OC_DIRECTIONS) {
    let count = 1
    let r = row + dr, c = col + dc
    while (r >= 0 && r < OC_SIZE && c >= 0 && c < OC_SIZE && board[r * OC_SIZE + c] === letter) {
      count++; r += dr; c += dc
    }
    r = row - dr; c = col - dc
    while (r >= 0 && r < OC_SIZE && c >= 0 && c < OC_SIZE && board[r * OC_SIZE + c] === letter) {
      count++; r -= dr; c -= dc
    }
    if (count > best) best = count
  }
  return best
}

function botOrderChaosOrder(game) {
  const board = game.board
  const empties = board.map((c, i) => (c === '' ? i : -1)).filter(i => i >= 0)
  if (!empties.length) return null

  const letters = ['X', 'O']

  // 1. Take an immediate win if one exists.
  for (const i of empties) {
    for (const letter of letters) {
      const result = applyOrderChaosMove(board, i, letter)
      if (!result) continue
      const res = getOrderChaosWinner(result.board)
      if (res && res.winner === 'X') return { index: i, letter }
    }
  }

  // 2. Otherwise, greedily extend the longest run available — center bias
  // as a tiebreaker so early moves aren't wasted against the edge.
  const centerCells = [14, 15, 20, 21]
  let best = null
  let bestScore = -1
  for (const i of shuffle(empties)) {
    for (const letter of letters) {
      const length = ocRunLengthThrough(place(board, i, letter), i, letter)
      const score = length * 10 + (centerCells.includes(i) ? 1 : 0)
      if (score > bestScore) {
        bestScore = score
        best = { index: i, letter }
      }
    }
  }
  return best
}

function place(board, index, letter) {
  const copy = [...board]
  copy[index] = letter
  return copy
}

function botOrderChaosChaos(game) {
  const board = game.board
  const empties = board.map((c, i) => (c === '' ? i : -1)).filter(i => i >= 0)
  if (!empties.length) return null

  const letters = ['X', 'O']

  // Build candidates: [index, letter] pairs that do NOT immediately hand Order a win
  const safe = []
  for (const i of empties) {
    for (const letter of letters) {
      const result = applyOrderChaosMove(board, i, letter)
      if (!result) continue
      const res = getOrderChaosWinner(result.board)
      if (!res || res.winner !== 'X') {
        safe.push({ index: i, letter })
      }
    }
  }

  // If no safe candidate exists, forced — play anything
  if (!safe.length) {
    const i = pickRandom(empties)
    return { index: i, letter: pickRandom(letters) }
  }

  // Among safe candidates, slight center bias on 6×6 board (center cells 14,15,20,21)
  const centerCells = [14, 15, 20, 21]
  const centerSafe = safe.filter(c => centerCells.includes(c.index))
  const pool = centerSafe.length && Math.random() < 0.4 ? centerSafe : safe

  return pickRandom(pool)
}

function botOrderChaos(game, botSymbol) {
  return botSymbol === 'X' ? botOrderChaosOrder(game) : botOrderChaosChaos(game)
}

// ---------------------------------------------------------------------------
// 6. SOS
// ---------------------------------------------------------------------------

function botSos(game, botSymbol) {
  const board = game.board
  const sosLines = normalizeSosLines(game.sosLines)
  const empties = board.map((c, i) => (c === '' ? i : -1)).filter(i => i >= 0)
  if (!empties.length) return null

  const letters = ['S', 'O']

  // Find the move that completes the most SOS sequences
  let bestPayload = null
  let bestCount = 0

  for (const i of shuffle(empties)) {
    for (const letter of letters) {
      const result = applySosMove(board, sosLines, i, letter, botSymbol)
      if (!result) continue
      if (result.completedCount > bestCount) {
        bestCount = result.completedCount
        bestPayload = { index: i, letter }
      }
    }
  }

  if (bestCount > 0) return bestPayload

  // No scoring move — random empty cell with random letter
  const i = pickRandom(empties)
  return { index: i, letter: pickRandom(letters) }
}

// ---------------------------------------------------------------------------
// 7. Dots and Boxes (classic casual heuristic)
// ---------------------------------------------------------------------------

function countFilledEdges(edges, boxIdx, size) {
  return edgesOfBox(boxIdx, size).filter(e => edges[e]).length
}

function botDotsAndBoxes(game, botSymbol) {
  const size = dbSizeFromGame(game)
  const { edgeCount } = dbConfig(size)
  const edges = game.board
  const boxes = game.boxes

  const emptyEdges = []
  for (let e = 0; e < edgeCount; e++) {
    if (!edges[e]) emptyEdges.push(e)
  }
  if (!emptyEdges.length) return null

  let bestCompletion = null
  let bestBoxCount = 0
  for (const e of emptyEdges) {
    const result = applyEdgeMove(edges, boxes, e, botSymbol, size)
    if (!result) continue
    if (result.completedBoxes.length > bestBoxCount) {
      bestBoxCount = result.completedBoxes.length
      bestCompletion = e
    }
  }
  if (bestCompletion !== null && bestBoxCount > 0) return bestCompletion

  const safeEdges = emptyEdges.filter(e => {
    const adjacentBoxes = boxesOfEdge(e, size)
    for (const b of adjacentBoxes) {
      if (boxes[b]) continue
      if (countFilledEdges(edges, b, size) === 2) {
        return false
      }
    }
    return true
  })

  if (safeEdges.length) return pickRandom(safeEdges)
  return pickRandom(emptyEdges)
}

// ---------------------------------------------------------------------------
// 8. Dice (Pig) — "hold at 20" heuristic
// ---------------------------------------------------------------------------

function botDice(game, botSymbol) {
  const myScore = (botSymbol === 'O' ? game.diceScoreO : game.diceScoreX) ?? 0
  const oppScore = (botSymbol === 'O' ? game.diceScoreX : game.diceScoreO) ?? 0
  const turn = game.diceTurnScore ?? 0

  if (myScore + turn >= PIG_TARGET) return 'bank'
  // Hold-at-20 baseline; when the bot is behind it takes more risk (holds up
  // to ~40) to try to catch up in fewer turns. Capped so it never piles up
  // indefinitely on a huge deficit.
  const behind = oppScore - myScore
  let target = 20
  if (behind > 0) target = 20 + Math.min(behind, 20)
  if (turn >= target) return 'bank'
  return 'roll'
}

// ---------------------------------------------------------------------------
// 9. Chain Reaction
// ---------------------------------------------------------------------------

function crNeighbours(index, cols, rows) {
  const row = Math.floor(index / cols)
  const col = index % cols
  const ns = []
  if (row > 0)           ns.push(index - cols)
  if (row < rows - 1)    ns.push(index + cols)
  if (col > 0)           ns.push(index - 1)
  if (col < cols - 1)    ns.push(index + 1)
  return ns
}

function botChainReaction(game, botSymbol) {
  const board = game.board || []
  const { cols, rows } = crDimsFromLength(board.length)
  const cellCount = cols * rows
  const dims = { cols, rows }
  const crMoves = game.crMoves ?? 0
  const opp = opponent(botSymbol)

  const moves = []
  for (let i = 0; i < cellCount; i++) {
    const cell = board[i]
    if (!cell || cell[0] === botSymbol) moves.push(i)
  }
  if (!moves.length) return null

  const countOppOrbs = (b) =>
    b.reduce((acc, c) => {
      if (!c || c[0] !== opp) return acc
      return acc + parseInt(c.slice(1), 10)
    }, 0)

  const oppBefore = countOppOrbs(board)

  if (crMoves >= 1) {
    for (const i of moves) {
      const { board: nb } = applyPlacement(board, i, botSymbol, dims)
      if (countOppOrbs(nb) === 0) return i
    }
  }

  let bestCapture = -1
  let bestMoves = []
  for (const i of moves) {
    const { board: nb } = applyPlacement(board, i, botSymbol, dims)
    const captured = oppBefore - countOppOrbs(nb)
    if (captured > bestCapture) {
      bestCapture = captured
      bestMoves = [i]
    } else if (captured === bestCapture) {
      bestMoves.push(i)
    }
  }

  if (bestMoves.length === 1) return bestMoves[0]

  const nearCritical = new Set()
  for (let i = 0; i < cellCount; i++) {
    const cell = board[i]
    if (cell && cell[0] === opp) {
      const { count } = decodeCell(cell)
      if (count === criticalMass(i, cols, rows) - 1) nearCritical.add(i)
    }
  }

  const crCorners = new Set([0, cols - 1, cellCount - cols, cellCount - 1])
  const isEdge = (i) => {
    const row = Math.floor(i / cols)
    const col = i % cols
    return (row === 0 || row === rows - 1 || col === 0 || col === cols - 1) && !crCorners.has(i)
  }

  const scored = bestMoves.map(i => {
    const adjToNearCrit = crNeighbours(i, cols, rows).some(n => nearCritical.has(n))
    const posScore = crCorners.has(i) ? 3 : isEdge(i) ? 2 : 1
    const safeBonus = adjToNearCrit ? 0 : 100
    return { i, score: safeBonus + posScore }
  })

  scored.sort((a, b) => b.score - a.score)
  const topScore = scored[0].score
  const top = scored.filter(s => s.score === topScore)
  return pickRandom(top).i
}

// Connect Four Pop Out — the bot only ever drops (never pops); good enough for
// casual solo practice. Emits the { col, action } payload the pop board expects.
function botConnectFourPop(game, botSymbol) {
  const col = botConnectFour(game, botSymbol)
  return col == null ? null : { col, action: 'drop' }
}

// Ultimate Tic-Tac-Toe — respects the active-board constraint, grabs a miniboard
// win, blocks the opponent's miniboard win, then prefers board centers.
function botUltimate(game, botSymbol) {
  const board = normalizeBoard(game.board, 81)
  const uWon = normalizeUWon(game.uWon)
  const active = game.uActiveBoard ?? -1
  const cells = legalCells(board, uWon, active)
  if (!cells.length) return null
  const opp = opponent(botSymbol)
  const completes = (idx, sym) => {
    const mini = Math.floor(idx / 9)
    const test = [...board]; test[idx] = sym
    return miniBoardWinner(test.slice(mini * 9, mini * 9 + 9)) === sym
  }
  for (const idx of shuffle(cells)) if (completes(idx, botSymbol)) return idx
  for (const idx of shuffle(cells)) if (completes(idx, opp)) return idx
  const centers = cells.filter(i => i % 9 === 4)
  return pickRandom(centers.length ? centers : cells)
}

// Hex — casual bot: prefers cells that touch existing stones (builds shapes,
// contests the center) and falls back to random empties. No deep search; the
// 11×11 board is far too wide for the demo's 600ms budget to matter. On move
// 2 it applies the swap (pie) rule to a strong opening (hexShouldSwap).
function botHex(game, botSymbol) {
  const board = game.board
  if (hexShouldSwap(game, botSymbol)) return { action: HEX_SWAP_ACTION }
  const empties = []
  for (let i = 0; i < HEX_CELL_COUNT; i++) {
    if (board[i] === '' || board[i] == null) empties.push(i)
  }
  if (!empties.length) return null
  const adjacent = empties.filter(i => neighbors(i).some(n => board[n] === botSymbol))
  const contested = empties.filter(i => neighbors(i).some(n => board[n] && board[n] !== botSymbol))
  if (adjacent.length && Math.random() < 0.7) return pickRandom(adjacent)
  if (contested.length && Math.random() < 0.5) return pickRandom(contested)
  return pickRandom(empties)
}

// Sim — avoid completing our own triangle, then try to force the opponent:
// prefer edges that create two shared endpoints with enemy edges (they're
// one move from a loss only if WE would benefit... in Sim you lose by your
// OWN triangle, so the bot simply: (1) never closes its own triangle, (2)
// avoids moves that leave an opponent-color triangle available, (3) picks
// the edge touching the most of its own edges (contests space).
function botSim(game, botSymbol) {
  const board = game.board
  const myEdges = edgesOf(board, botSymbol)
  const oppEdges = edgesOf(board, opponent(botSymbol))
  const candidates = []
  for (let i = 0; i < SIM_EDGE_COUNT; i++) {
    if (board[i]) continue
    // Does taking edge i complete MY triangle? Then never take it.
    const mine = [...myEdges, i]
    if (triangleOf(mine)) continue
    // Does taking i leave the opponent able to complete theirs next turn?
    // (i.e. they own two edges of a triangle whose third is still empty)
    const theirs = [...oppEdges, i]
    const oppTri = triangleOf(theirs)
    if (!oppTri) candidates.push({ i, score: 1 })
    else candidates.push({ i, score: 0 }) // forced-loss-avoidance tier
  }
  if (!candidates.length) {
    // All remaining edges complete our triangle — we're lost; take anything.
    const any = board.map((c, i) => (c ? -1 : i)).filter(i => i >= 0)
    return any.length ? any[0] : null
  }
  // Prefer safe edges that share endpoints with existing own edges (build
  // pressure), then random.
  const scored = candidates.map(c => {
    const [a, b] = SIM_EDGES[c.i]
    const touches = myEdges.filter(e => SIM_EDGES[e].includes(a) || SIM_EDGES[e].includes(b)).length
    return { ...c, score: c.score * 10 + touches }
  })
  const top = scored.filter(s => s.score === Math.max(...scored.map(s => s.score)))
  return pickRandom(top).i
}

// Chomp — greedy safety heuristic: never eat the poison; among safe bites,
// prefer leaving the opponent a position with the fewest safe replies
// (1-ply trap search); skip full solve (larger bars are exponential).
function botChomp(game) {
  const board = game.board
  const options = edibleSquares(board).filter(i => i !== POISON_INDEX)
  if (!options.length) return POISON_INDEX // forced: we must eat the poison
  // If a bite leaves exactly [poison], the OPPONENT is forced to eat it — win.
  for (const i of shuffle(options)) {
    const res = applyChompMove(board, i)
    if (edibleSquares(res.board).length === 1) return i // only poison left
  }
  // Otherwise minimize opponent's non-poison reply count (trap-seeking),
  // with a bias toward big bites (keeps the game short).
  let best = null
  let bestScore = Infinity
  for (const i of shuffle(options)) {
    const { board: next } = applyChompMove(board, i)
    const replies = edibleSquares(next).filter(x => x !== POISON_INDEX).length
    const score = replies * 100 + next.filter(v => v !== 'eaten').length
    if (score < bestScore) { bestScore = score; best = i }
  }
  return best
}

// Breakthrough — 1-ply: win by advancing to the goal row; block nothing
// (racing game), instead prefer captures, then advances that don't hang the
// pawn to an immediate recapture-free enemy advance, then random.
function botBreakthrough(game, botSymbol) {
  const board = game.board
  const moves = btLegalMoves(board, botSymbol)
  if (!moves.length) return null
  // 1. Win now: any move reaching the goal row.
  const goalRow = botSymbol === 'X' ? 0 : BT_ROWS - 1
  for (const m of shuffle(moves)) {
    if (Math.floor(m.to / BT_COLS) === goalRow) return m
  }
  // 2. Capture if it doesn't hang the capturing pawn immediately.
  const captures = moves.filter(m => {
    const dest = board[m.to]
    return dest && dest !== botSymbol
  })
  if (captures.length) return pickRandom(shuffle(captures))
  // 3. Prefer advanced pawns (closest to goal) that keep a safe structure.
  const scored = moves.map(m => {
    const toRow = Math.floor(m.to / BT_COLS)
    const progress = botSymbol === 'X' ? (BT_ROWS - 1 - toRow) : toRow
    return { m, score: progress + Math.random() }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0].m
}

// Ataxx — 1-ply greedy: win now, take max (converted + gained - lost),
// slight preference for jumps late (mobility) and clones early.
function botAtaxx(game, botSymbol) {
  const board = game.board
  const moves = legalAtaxxMoves(board, botSymbol)
  if (!moves.length) return null // pass (turn handling is the harness's job)
  const opp = opponent(botSymbol)
  let best = null
  let bestScore = -Infinity
  for (const m of shuffle(moves)) {
    const res = applyAtaxxMove(board, m, botSymbol)
    if (!res) continue
    let score = res.converted * 10
    // net material after the move
    const myCount = countAtaxx(res.board, botSymbol)
    const oppCount = countAtaxx(res.board, opp)
    score += (myCount - oppCount) * 6
    // immediate win?
    const w = getAtaxxWinner(res.board, (game.ataxxMoves ?? 0) + 1)
    if (w && w.winner === botSymbol) score += 1000
    // discourage staking everything on the rim early
    const [tr, tc] = [Math.floor(m.to / AX_COLS), m.to % AX_COLS]
    const rim = tr === 0 || tc === 0 || tr === 6 || tc === 6
    if (m.kind === 'clone' && !rim) score += 2
    if (score > bestScore) { bestScore = score; best = m }
  }
  return best
}

// Kamisado — move the forced tower toward the goal, preferring landings that
// send the opponent a color tower that is badly blocked (stuck = bonus move).
function botKamisado(game, botSymbol) {
  const board = game.board
  const forced = game.kamisadoColor ?? null
  const towers = game.kamisadoTowers ?? null
  // Collect legal moves for the forced tower (any tower if unforced).
  let all = []
  if (forced == null) {
    for (let k = 0; k < 8; k++) all.push(...kmTowerMoves(board, botSymbol, k, towers))
  } else {
    all = kmTowerMoves(board, botSymbol, forced, towers)
  }
  if (!all.length) return null // pass — bonus move with constraint lifted
  const opp = opponent(botSymbol)
  let best = null
  let bestScore = -Infinity
  for (const m of shuffle(all)) {
    const res = applyKamisadoMove(board, m, botSymbol, forced, { towers })
    if (!res) continue
    let score = 0
    if (res.result) {
      score = res.result.winner === botSymbol ? 1000 : -1000
    } else {
      // advance: rows toward goal
      const toRow = Math.floor(m.to / KM_SIZE)
      score += botSymbol === 'X' ? (KM_SIZE - 1 - toRow) * 4 : toRow * 4
      // reward forcing the opponent onto a stuck tower (bonus move for us)
      if (res.extraTurn) score += 40
      // mild penalty for giving the opponent free choice (they sent US null)
      if (res.forcedColor == null) score -= 6
      // prefer landing squares whose matching enemy tower is far away
      const enemyTower = kmTowerOf(res.board, opp, KM_COLORS[m.to], res.towers)
      if (enemyTower >= 0) {
        const dist = Math.abs(Math.floor(m.to / KM_SIZE) - Math.floor(enemyTower / KM_SIZE))
        score += dist
      }
    }
    if (score > bestScore) { bestScore = score; best = m }
  }
  return best
}

// ─── ONITAMA — prefer capturing the master, then temple runs, else random ───
function botOnitama(game, botSymbol) {
  const hands = { handX: game.onitamaHandX, handO: game.onitamaHandO, spare: game.onitamaSpare }
  if (!hands.handX || !hands.handO || !Number.isInteger(hands.spare)) return null
  const board = normalizeOnBoard(game.board)
  const hand = botSymbol === 'X' ? hands.handX : hands.handO
  const all = hand.flatMap(k => legalOnMoves(board, botSymbol, k))
  if (!all.length) return null
  let best = null
  let bestScore = -Infinity
  for (const m of shuffle(all)) {
    const res = applyOnitamaMove(board, m, botSymbol, hands)
    if (!res) continue
    let score = 0
    if (res.result) {
      score = res.result.winner === botSymbol ? 1000 : -1000
    } else {
      // March toward the enemy temple (X's goal row 0, O's goal row 4).
      const goalRow = botSymbol === 'X' ? 0 : 4
      score += (4 - Math.abs(Math.floor(m.to / 5) - goalRow)) * 2
      // Reward captures: the piece that WAS on `to` belongs to the enemy.
      const moved = res.board[m.to]
      if (moved && moved[0] !== botSymbol) score += 8 // moved is the mover's piece — capture detection via removed enemy instead
      const enemyCountBefore = board.filter(v => v[0] !== botSymbol && v !== '').length
      const enemyCountAfter = res.board.filter(v => v[0] !== botSymbol && v !== '').length
      if (enemyCountAfter < enemyCountBefore) score += 12
    }
    if (score > bestScore) { bestScore = score; best = m }
  }
  return best
}

// ─── QUARTO — place smart, then hand over the LEAST dangerous piece ─────────
function botQuarto(game) {
  const board = normalizeQuartoBoard(game.board)
  const unplaced = Array.isArray(game.quartoUnplaced) ? game.quartoUnplaced : []
  const pending = game.quartoPending
  if (!Number.isInteger(pending) || !unplaced.includes(pending)) return null
  // Choose the empty cell — prefer cells that do NOT complete a line now.
  const empties = []
  for (let i = 0; i < 16; i++) if (board[i] === '') empties.push(i)
  if (!empties.length) return null
  const place = shuffle(empties)[0]
  // Give: simulate each candidate gift; prefer pieces where the OPPONENT has
  // no winning placement on any empty cell (else pick randomly among safe).
  const rest = unplaced.filter(v => v !== pending)
  if (!rest.length) return { place } // last piece placed → win/draw, no give
  const safe = []
  for (const gift of shuffle(rest)) {
    const b2 = [...board]
    b2[place] = pending
    const oppCanWin = QRT_LINES.some(line => {
      const cells = line.filter(i => b2[i] === '')
      if (cells.length !== 1) return false
      const ids = line.map(i => (i === cells[0] ? gift : b2[i]))
      return lineWins(ids)
    })
    if (!oppCanWin) safe.push(gift)
  }
  const give = safe.length ? safe[0] : rest[0]
  return { place, give }
}

// ─── SANTORINI — climb toward level 3, dodge opponent summits, else random ──
function botSantorini(game, botSymbol) {
  const board = normalizeStBoard(game.board)
  const workers = normalizeStWorkers(game.santoriniWorkers)
  const turns = legalStTurns(board, workers, botSymbol)
  if (!turns.length) return null
  const opp = botSymbol === 'X' ? 'O' : 'X'
  let best = null
  let bestScore = -Infinity
  for (const t of shuffle(turns)) {
    const res = applyStMove({ board, workers }, t, botSymbol)
    if (!res) continue
    let score = 0
    if (res.result) {
      score = res.result.winner === botSymbol ? 1000 : -1000
    } else {
      // Tower height at destination (higher = closer to winning).
      score += board[t.to] * 3
      // Danger: could the opponent reach a level-3 square next turn?
      const oppTurns = legalStTurns(res.board, res.workers, opp)
      const oppWins = oppTurns.some(t2 => res.board[t2.to] === 3)
      if (oppWins) score -= 200
      // Deny: building on squares the opponent wants to climb.
      score += res.board[t.build] * 2
    }
    if (score > bestScore) { bestScore = score; best = t }
  }
  return best
}

// ─── LINES OF ACTION — prefer captures and uniting, else biggest progress ───
function botLoa(game, botSymbol) {
  const board = normalizeLoaBoard(game.board)
  const all = []
  for (let i = 0; i < 64; i++) {
    if (board[i] === botSymbol) {
      for (const to of loaMoves(board, i, botSymbol)) all.push({ from: i, to })
    }
  }
  if (!all.length) return null
  let best = null
  let bestScore = -Infinity
  for (const m of shuffle(all)) {
    const res = applyLoaMove(board, m, botSymbol)
    if (!res) continue
    let score = 0
    if (res.result) {
      score = res.result.winner === botSymbol ? 1000 : -1000
    } else {
      if (res.captured) score += 30
      // Progress: total pairwise distance shrink (proxy for uniting).
      const mine = []
      for (let i = 0; i < 64; i++) if (res.board[i] === botSymbol) mine.push(i)
      let dist = 0
      for (const a of mine) {
        for (const b of mine) {
          dist += Math.max(Math.abs(Math.floor(a / 8) - Math.floor(b / 8)), Math.abs((a % 8) - (b % 8)))
        }
      }
      score -= dist / 10
    }
    if (score > bestScore) { bestScore = score; best = m }
  }
  return best
}

// ─── YAVALATH — make 4 if possible, dodge forced 3s, else random ────────────
function botYavalath(game, botSymbol) {
  const board = normalizeYvBoard(game.board)
  const opp = botSymbol === 'X' ? 'O' : 'X'
  const open = []
  for (let i = 0; i < YV_CELL_COUNT; i++) if (board[i] === '') open.push(i)
  if (!open.length) return null
  const safe = []
  const winning = []
  const oppWinning = []
  for (const i of open) {
    const b2 = [...board]
    b2[i] = botSymbol
    const res = getYavalathResult(b2, botSymbol)
    if (res?.winner === botSymbol) winning.push(i)
    if (res?.winner === opp) continue // immediate self-loss — skip
    safe.push(i)
    const b3 = [...board]
    b3[i] = opp
    const resOpp = getYavalathResult(b3, opp)
    if (resOpp?.winner === opp) oppWinning.push(i)
  }
  if (winning.length) return winning[0]
  if (oppWinning.length) return shuffle(oppWinning)[0] // block
  return safe.length ? shuffle(safe)[0] : shuffle(open)[0] // all lose: random
}

// ---------------------------------------------------------------------------
// Normal-difficulty dispatcher (the original casual bots)

function pickNormalMove(type, game, botSymbol) {
  switch (type) {
    case 'tictactoe':    return botTicTacToe(game, botSymbol)
    case 'tictactoe4':   return botTicTacToe4(game, botSymbol)
    case 'ultimatettt':  return botUltimate(game, botSymbol)
    case 'connectfour':  return botConnectFour(game, botSymbol)
    case 'connectfour5': return botConnectFour(game, botSymbol, CF5)
    case 'connectfourpop': return botConnectFourPop(game, botSymbol)
    case 'gomoku':       return botGomoku(game, botSymbol)
    case 'gomokuswap':   return botGomokuSwap(game, botSymbol, botGomoku)
    case 'reversi':      return botReversi(game, botSymbol)
    case 'orderchaos':   return botOrderChaos(game, botSymbol)
    case 'sos':          return botSos(game, botSymbol)
    case 'dotsandboxes':
    case 'dotsandboxes4':  return botDotsAndBoxes(game, botSymbol)
    case 'dice':           return botDice(game, botSymbol)
    case 'dice-big':       return botDice(game, botSymbol)
    case 'chainreaction':
    case 'chainreaction6': return botChainReaction(game, botSymbol)
    case 'blockade':      return botBlockade(game, botSymbol)
    case 'pairs':        return computePairsBotMove(game, botSymbol)
    case 'hex':          return botHex(game, botSymbol)
    case 'sim':          return botSim(game, botSymbol)
    case 'chomp':        return botChomp(game, botSymbol)
    case 'breakthrough': return botBreakthrough(game, botSymbol)
    case 'ataxx':        return botAtaxx(game, botSymbol)
    case 'kamisado':     return botKamisado(game, botSymbol)
    case 'onitama':      return botOnitama(game, botSymbol)
    case 'quarto':       return botQuarto(game, botSymbol)
    case 'santorini':    return botSantorini(game, botSymbol)
    case 'loa':          return botLoa(game, botSymbol)
    case 'yavalath':     return botYavalath(game, botSymbol)
    default:               return null
  }
}

// ---------------------------------------------------------------------------
// Swap (pie) rule decisions — Hex (always on) and GOMOKU SWAP
// ---------------------------------------------------------------------------

// Hex: every opening in the inner 7×7 is strong for the opener, so take it;
// edge and next-to-edge openings are left alone.
function hexShouldSwap(game, botSymbol) {
  const board = game.board
  if (!canHexSwap(board, botSymbol, !!game.pieSwap)) return false
  const i = board.findIndex(Boolean)
  const r = Math.floor(i / HEX_SIZE)
  const c = i % HEX_SIZE
  return Math.min(r, c, HEX_SIZE - 1 - r, HEX_SIZE - 1 - c) >= 2
}

// A balanced Hex opening for when the bot opens under the swap rule: the
// second ring from the edge — too weak to be worth swapping, still playable.
function hexFairOpening() {
  const ring = []
  for (let i = 0; i < HEX_CELL_COUNT; i++) {
    const r = Math.floor(i / HEX_SIZE)
    const c = i % HEX_SIZE
    if (Math.min(r, c, HEX_SIZE - 1 - r, HEX_SIZE - 1 - c) === 1) ring.push(i)
  }
  return pickRandom(ring)
}

const GOMOKU_CENTER = Math.floor(GOMOKU_SIZE / 2)
const gomokuCenterDistance = i =>
  Math.max(Math.abs(Math.floor(i / GOMOKU_SIZE) - GOMOKU_CENTER), Math.abs((i % GOMOKU_SIZE) - GOMOKU_CENTER))

// Gomoku: a first stone within 4 of the center keeps freestyle's first-move
// edge, so take it.
function gomokuShouldSwap(game, botSymbol) {
  const board = game.board
  if (!canGomokuSwap(board, botSymbol, !!game.pieSwap)) return false
  return gomokuCenterDistance(board.findIndex(Boolean)) <= 4
}

// GOMOKU SWAP: swap a strong opening; when opening, stay off-center (5–6 from
// the middle) so the opponent has nothing worth swapping; else `inner`.
function botGomokuSwap(game, botSymbol, inner) {
  const board = game.board
  if (gomokuShouldSwap(game, botSymbol)) return { action: GOMOKU_SWAP_ACTION }
  if (board.every(c => !c)) {
    const ring = []
    for (let i = 0; i < GOMOKU_CELL_COUNT; i++) {
      const d = gomokuCenterDistance(i)
      if (d === 5 || d === 6) ring.push(i)
    }
    return pickRandom(ring)
  }
  return inner(game, botSymbol)
}

// ---------------------------------------------------------------------------
// Difficulty
// ---------------------------------------------------------------------------

export const BOT_DIFFICULTIES = ['easy', 'normal', 'hard']
export const DEFAULT_BOT_DIFFICULTY = 'normal'
// Share of EASY turns that ignore strategy and play a random legal move; the
// rest fall through to the normal bot, so easy still lands the odd good move.
export const EASY_RANDOM_RATE = 0.7

export const normalizeDifficulty = d => (BOT_DIFFICULTIES.includes(d) ? d : DEFAULT_BOT_DIFFICULTY)

const emptyCells = board => {
  const out = []
  for (let i = 0; i < board.length; i++) if (!board[i]) out.push(i)
  return out
}

// Gomoku-family candidates: empty cells within 2 of any stone (the centre on
// an empty board) — random play across all 225 cells reads as broken, not easy.
function gomokuNearby(board) {
  const near = new Set()
  for (let i = 0; i < GOMOKU_CELL_COUNT; i++) {
    if (!board[i]) continue
    const r = Math.floor(i / GOMOKU_SIZE)
    const c = i % GOMOKU_SIZE
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr
        const cc = c + dc
        if (rr < 0 || rr >= GOMOKU_SIZE || cc < 0 || cc >= GOMOKU_SIZE) continue
        if (!board[rr * GOMOKU_SIZE + cc]) near.add(rr * GOMOKU_SIZE + cc)
      }
    }
  }
  return near.size ? [...near] : [Math.floor(GOMOKU_CELL_COUNT / 2)]
}

// Types with an easy level: every legalBotMoves case, plus Pig's own.
const EASY_TYPES = new Set([
  'tictactoe', 'tictactoe4', 'yavalath', 'hex', 'gomoku', 'gomokuswap', 'ultimatettt',
  'connectfour', 'connectfour5', 'connectfourpop', 'reversi', 'orderchaos', 'sos',
  'dotsandboxes', 'dotsandboxes4', 'chainreaction', 'chainreaction6', 'blockade', 'sim',
  'chomp', 'breakthrough', 'ataxx', 'kamisado', 'onitama', 'quarto', 'santorini', 'loa',
  'dice', 'dice-big',
])

// Every legal move payload for `botSymbol`, in the same shape pickBotMove
// returns — or null for types without an easy mode (dice has its own).
export function legalBotMoves(type, game, botSymbol) {
  const board = game.board || []
  switch (type) {
    case 'tictactoe':
    case 'tictactoe4':
      return emptyCells(board)
    case 'yavalath':
      return emptyCells(normalizeYvBoard(board))
    case 'hex': {
      const cells = emptyCells(normalizeBoard(board, HEX_CELL_COUNT))
      return canHexSwap(board, botSymbol, !!game.pieSwap) ? [...cells, { action: HEX_SWAP_ACTION }] : cells
    }
    case 'gomoku':
      return gomokuNearby(board)
    case 'gomokuswap':
      return canGomokuSwap(board, botSymbol, !!game.pieSwap)
        ? [...gomokuNearby(board), { action: GOMOKU_SWAP_ACTION }]
        : gomokuNearby(board)
    case 'ultimatettt':
      return legalCells(normalizeBoard(board, 81), normalizeUWon(game.uWon), game.uActiveBoard ?? -1)
    case 'connectfour':
    case 'connectfour5':
    case 'connectfourpop': {
      const config = type === 'connectfour5' ? CF5 : undefined
      const cols = [...Array(config?.cols ?? 7).keys()].filter(c => getConnectFourDrop(board, c, config) !== -1)
      return type === 'connectfourpop' ? cols.map(col => ({ col, action: 'drop' })) : cols
    }
    case 'reversi':
      return legalMoves(board, botSymbol)
    case 'orderchaos':
      return emptyCells(board).flatMap(index => [{ index, letter: 'X' }, { index, letter: 'O' }])
    case 'sos':
      return emptyCells(board).flatMap(index => [{ index, letter: 'S' }, { index, letter: 'O' }])
    case 'dotsandboxes':
    case 'dotsandboxes4': {
      const { edgeCount } = dbConfig(dbSizeFromGame(game))
      return emptyCells(board.slice(0, edgeCount))
    }
    case 'chainreaction':
    case 'chainreaction6': {
      const { cols, rows } = crDimsFromLength(board.length)
      const out = []
      for (let i = 0; i < cols * rows; i++) if (!board[i] || board[i][0] === botSymbol) out.push(i)
      return out
    }
    case 'blockade': {
      // Pawn steps only: enumerating every legal wall needs a path search per
      // slot, and a pawn-shuffling easy bot is the right kind of weak.
      const pawns = { X: game.blockadePawnX ?? 76, O: game.blockadePawnO ?? 4 }
      return bkLegalPawnMoves(pawns, board.length ? board : Array(128).fill(''), botSymbol)
        .map(to => ({ type: 'pawn', to }))
    }
    case 'sim':
      return emptyCells(board.slice(0, SIM_EDGE_COUNT))
    case 'chomp': {
      const safe = edibleSquares(board).filter(i => i !== POISON_INDEX)
      return safe.length ? safe : [POISON_INDEX]
    }
    case 'breakthrough':
      return btLegalMoves(board, botSymbol)
    case 'ataxx':
      return legalAtaxxMoves(board, botSymbol)
    case 'kamisado': {
      const forced = game.kamisadoColor ?? null
      const towers = game.kamisadoTowers ?? null
      if (forced != null) return kmTowerMoves(board, botSymbol, forced, towers)
      const all = []
      for (let k = 0; k < 8; k++) all.push(...kmTowerMoves(board, botSymbol, k, towers))
      return all
    }
    case 'onitama': {
      const hand = botSymbol === 'X' ? game.onitamaHandX : game.onitamaHandO
      if (!Array.isArray(hand)) return []
      const onBoard = normalizeOnBoard(board)
      return hand.flatMap(k => legalOnMoves(onBoard, botSymbol, k))
    }
    case 'quarto': {
      const qb = normalizeQuartoBoard(board)
      const unplaced = Array.isArray(game.quartoUnplaced) ? game.quartoUnplaced : []
      const pending = game.quartoPending
      if (!Number.isInteger(pending) || !unplaced.includes(pending)) return []
      const rest = unplaced.filter(v => v !== pending)
      // Piece ids start at 0, so an empty square is strictly ''.
      const open = []
      for (let i = 0; i < 16; i++) if (qb[i] === '') open.push(i)
      return open.flatMap(place => (rest.length ? rest.map(give => ({ place, give })) : [{ place }]))
    }
    case 'santorini':
      return legalStTurns(normalizeStBoard(board), normalizeStWorkers(game.santoriniWorkers), botSymbol)
    case 'loa': {
      const lb = normalizeLoaBoard(board)
      const all = []
      for (let i = 0; i < 64; i++) {
        if (lb[i] === botSymbol) for (const to of loaMoves(lb, i, botSymbol)) all.push({ from: i, to })
      }
      return all
    }
    default:
      return null
  }
}

// Pig: a timid, erratic banker — rolls on an empty turn, then banks with a
// 25% chance per decision (always by 25 points, or as soon as it has won).
function botDiceEasy(game, botSymbol) {
  const myScore = (botSymbol === 'O' ? game.diceScoreO : game.diceScoreX) ?? 0
  const turn = game.diceTurnScore ?? 0
  if (myScore + turn >= PIG_TARGET) return 'bank'
  if (turn === 0) return 'roll'
  return turn >= 25 || Math.random() < 0.25 ? 'bank' : 'roll'
}

// Pig: Neller & Presser's "keep pace and end race" — roll for the win once
// either player is within 29 of the target, otherwise hold at
// 21 + round((opponent − me) / 8). Beats hold-at-20.
function botDiceHard(game, botSymbol) {
  const myScore = (botSymbol === 'O' ? game.diceScoreO : game.diceScoreX) ?? 0
  const oppScore = (botSymbol === 'O' ? game.diceScoreX : game.diceScoreO) ?? 0
  const turn = game.diceTurnScore ?? 0
  if (myScore + turn >= PIG_TARGET) return 'bank'
  if (myScore >= PIG_TARGET - 29 || oppScore >= PIG_TARGET - 29) return 'roll'
  return turn >= 21 + Math.round((oppScore - myScore) / 8) ? 'bank' : 'roll'
}

// Undefined = "no easy override this turn" (fall through to normal).
function pickEasyMove(type, game, botSymbol) {
  if (type === 'dice' || type === 'dice-big') return botDiceEasy(game, botSymbol)
  if (Math.random() >= EASY_RANDOM_RATE) return undefined
  const legal = legalBotMoves(type, game, botSymbol)
  return legal?.length ? pickRandom(legal) : undefined
}

// ─── HARD: place-a-mark games (Tic Tac Toe 3×3 / 4×4) — alpha-beta search ──

// Line-potential evaluation: open lines score by the square of their stones.
function lineEval(board, lines, me) {
  let score = 0
  for (const line of lines) {
    let mine = 0
    let theirs = 0
    for (const i of line) {
      if (board[i] === me) mine++
      else if (board[i]) theirs++
    }
    if (mine && !theirs) score += mine * mine
    else if (theirs && !mine) score -= theirs * theirs
  }
  return score
}

function placementSearch(board, toMove, me, winnerFn, lines, depth, alpha, beta) {
  const w = winnerFn(board)
  if (w) return w.winner === 'draw' ? 0 : (w.winner === me ? 1000 + depth : -1000 - depth)
  if (depth === 0) return lineEval(board, lines, me)
  const maximizing = toMove === me
  let best = maximizing ? -Infinity : Infinity
  for (let i = 0; i < board.length; i++) {
    if (board[i]) continue
    board[i] = toMove
    const s = placementSearch(board, opponent(toMove), me, winnerFn, lines, depth - 1, alpha, beta)
    board[i] = ''
    if (maximizing) { if (s > best) best = s; if (best > alpha) alpha = best }
    else { if (s < best) best = s; if (best < beta) beta = best }
    if (alpha >= beta) break
  }
  return best
}

function bestPlacement(board, botSymbol, winnerFn, lines, depth) {
  const b = board.map(c => c || '')
  const empties = emptyCells(b)
  if (!empties.length) return null
  let best = -Infinity
  let bestMoves = []
  for (const i of empties) {
    b[i] = botSymbol
    const s = placementSearch(b, opponent(botSymbol), botSymbol, winnerFn, lines, depth - 1, -Infinity, Infinity)
    b[i] = ''
    if (s > best) { best = s; bestMoves = [i] } else if (s === best) bestMoves.push(i)
  }
  return pickRandom(bestMoves)
}

const TTT_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]

// 3×3: full-depth search — never loses. Empty board: any corner or the
// centre (all perfect-play safe), skipping the only non-trivial search.
function botTicTacToeHard(game, botSymbol) {
  const board = game.board
  if (board.every(c => !c)) return pickRandom([0, 2, 4, 6, 8])
  return bestPlacement(board, botSymbol, getWinner, TTT_LINES, 9)
}

// 4×4: depth-4 search with the line-potential evaluation at the horizon.
function botTicTacToe4Hard(game, botSymbol) {
  return bestPlacement(game.board, botSymbol, getTicTacToe4Winner, TTT4_WIN_LINES, 4)
}

// ─── HARD: Ultimate TTT — 2-ply: never send the opponent to a winning board ─

function botUltimateHard(game, botSymbol) {
  const board = normalizeBoard(game.board, 81)
  const uWon = normalizeUWon(game.uWon)
  const active = game.uActiveBoard ?? -1
  const cells = legalCells(board, uWon, active)
  if (!cells.length) return null
  const opp = opponent(botSymbol)
  let best = -Infinity
  let bestMoves = []
  for (const idx of shuffle(cells)) {
    const res = applyUltimateMove(board, uWon, active, idx, botSymbol)
    if (!res) continue
    if (getUltimateWinner(res.uWon)?.winner === botSymbol) return idx
    const mini = Math.floor(idx / 9)
    let score = 0
    if (res.uWon[mini] === botSymbol) score += 50
    // Blocks the opponent's mini-board win here.
    const block = [...board]; block[idx] = opp
    if (miniBoardWinner(block.slice(mini * 9, mini * 9 + 9)) === opp) score += 40
    // What the opponent can do with the board we send them to.
    let oppWinsMini = false
    let oppWinsGame = false
    for (const reply of legalCells(res.board, res.uWon, res.activeBoard)) {
      const r2 = applyUltimateMove(res.board, res.uWon, res.activeBoard, reply, opp)
      if (!r2) continue
      if (getUltimateWinner(r2.uWon)?.winner === opp) { oppWinsGame = true; break }
      if (r2.uWon[Math.floor(reply / 9)] === opp) oppWinsMini = true
    }
    if (oppWinsGame) score -= 1000
    else if (oppWinsMini) score -= 60
    if (res.activeBoard === -1) score -= 20 // a free choice is a gift
    if (idx % 9 === 4) score += 3
    else if ([0, 2, 6, 8].includes(idx % 9)) score += 1
    if (score > best) { best = score; bestMoves = [idx] } else if (score === best) bestMoves.push(idx)
  }
  return bestMoves.length ? pickRandom(bestMoves) : pickRandom(cells)
}

// ─── HARD: Connect Four family — alpha-beta negamax ──────────────────────────

const C4_DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]]
const c4WindowCache = new Map()

// Every length-`need` window on a cols×rows board, cached per geometry.
function c4Windows(cols, rows, need) {
  const key = `${cols}x${rows}x${need}`
  if (c4WindowCache.has(key)) return c4WindowCache.get(key)
  const out = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const [dr, dc] of C4_DIRS) {
        const endR = r + dr * (need - 1)
        const endC = c + dc * (need - 1)
        if (endR < 0 || endR >= rows || endC < 0 || endC >= cols) continue
        const w = []
        for (let k = 0; k < need; k++) w.push((r + dr * k) * cols + (c + dc * k))
        out.push(w)
      }
    }
  }
  c4WindowCache.set(key, out)
  return out
}

function c4Landing(board, col, cols, rows) {
  if (board[col]) return -1
  for (let r = rows - 1; r >= 0; r--) if (!board[r * cols + col]) return r * cols + col
  return -1
}

function c4WinsAt(board, idx, sym, cols, rows, need) {
  const r0 = Math.floor(idx / cols)
  const c0 = idx % cols
  for (const [dr, dc] of C4_DIRS) {
    let n = 1
    for (const s of [1, -1]) {
      let r = r0 + dr * s
      let c = c0 + dc * s
      while (r >= 0 && r < rows && c >= 0 && c < cols && board[r * cols + c] === sym) {
        n++; r += dr * s; c += dc * s
      }
    }
    if (n >= need) return true
  }
  return false
}

// Static evaluation from `sym`'s point of view: open windows one or two short
// of a line, plus a small centre-column bonus.
function c4Eval(board, sym, g) {
  const opp = opponent(sym)
  let score = 0
  for (const w of c4Windows(g.cols, g.rows, g.need)) {
    let mine = 0
    let theirs = 0
    for (const i of w) {
      if (board[i] === sym) mine++
      else if (board[i] === opp) theirs++
    }
    if (mine && theirs) continue
    if (mine === g.need - 1) score += 50
    else if (mine === g.need - 2) score += 5
    else if (theirs === g.need - 1) score -= 60
    else if (theirs === g.need - 2) score -= 5
  }
  const centre = Math.floor(g.cols / 2)
  for (let r = 0; r < g.rows; r++) {
    const v = board[r * g.cols + centre]
    if (v === sym) score += 3
    else if (v === opp) score -= 3
  }
  return score
}

function c4Negamax(board, sym, g, depth, alpha, beta) {
  let any = false
  for (const col of g.order) {
    const at = c4Landing(board, col, g.cols, g.rows)
    if (at === -1) continue
    any = true
    board[at] = sym
    const win = c4WinsAt(board, at, sym, g.cols, g.rows, g.need)
    board[at] = ''
    if (win) return 100000 + depth
  }
  if (!any) return 0 // full board: draw
  if (depth === 0) return c4Eval(board, sym, g)
  let best = -Infinity
  for (const col of g.order) {
    const at = c4Landing(board, col, g.cols, g.rows)
    if (at === -1) continue
    board[at] = sym
    const s = -c4Negamax(board, opponent(sym), g, depth - 1, -beta, -alpha)
    board[at] = ''
    if (s > best) best = s
    if (s > alpha) alpha = s
    if (alpha >= beta) break
  }
  return best
}

function botConnectFourHard(game, botSymbol, config = null) {
  const cols = config?.cols ?? 7
  const rows = config?.rows ?? 6
  const g = { cols, rows, need: config?.winRun ?? 4, order: colPref(cols) }
  // 9-wide boards branch harder — one ply less keeps a turn well under 600 ms.
  const depth = cols > 7 ? 5 : 6
  const board = (game.board || []).map(c => c || '')
  const legal = g.order.filter(c => c4Landing(board, c, cols, rows) !== -1)
  if (!legal.length) return null
  let best = -Infinity
  let bestCols = []
  for (const col of legal) {
    const at = c4Landing(board, col, cols, rows)
    board[at] = botSymbol
    if (c4WinsAt(board, at, botSymbol, cols, rows, g.need)) { board[at] = ''; return col }
    const s = -c4Negamax(board, opponent(botSymbol), g, depth - 1, -Infinity, Infinity)
    board[at] = ''
    if (s > best) { best = s; bestCols = [col] } else if (s === best) bestCols.push(col)
  }
  return pickRandom(bestCols)
}

// ─── HARD: Gomoku — threat-pattern scoring (attack + defence) ────────────────

// Run of `count` stones with `open` free ends → threat value.
function gomokuPatternScore(count, open) {
  if (count >= 5) return 1_000_000
  if (open === 0) return 0
  if (count === 4) return open === 2 ? 100_000 : 10_000
  if (count === 3) return open === 2 ? 5_000 : 500
  if (count === 2) return open === 2 ? 200 : 50
  return open === 2 ? 10 : 2
}

// Value of `sym` placing at `idx`: the threat each of the 4 lines through it becomes.
function gomokuPlacementScore(board, idx, sym) {
  const row = Math.floor(idx / GOMOKU_SIZE)
  const col = idx % GOMOKU_SIZE
  let total = 0
  for (const [dr, dc] of C4_DIRS) {
    let count = 1
    let open = 0
    for (const s of [1, -1]) {
      let r = row + dr * s
      let c = col + dc * s
      while (r >= 0 && r < GOMOKU_SIZE && c >= 0 && c < GOMOKU_SIZE && board[r * GOMOKU_SIZE + c] === sym) {
        count++; r += dr * s; c += dc * s
      }
      if (r >= 0 && r < GOMOKU_SIZE && c >= 0 && c < GOMOKU_SIZE && !board[r * GOMOKU_SIZE + c]) open++
    }
    total += gomokuPatternScore(count, open)
  }
  return total
}

function botGomokuHard(game, botSymbol) {
  const board = game.board
  if (board.every(c => !c)) return Math.floor(GOMOKU_CELL_COUNT / 2)
  const opp = opponent(botSymbol)
  let best = -Infinity
  let bestMoves = []
  for (const i of gomokuNearby(board)) {
    const score = gomokuPlacementScore(board, i, botSymbol)
      + 0.9 * gomokuPlacementScore(board, i, opp)
      - gomokuCenterDistance(i)
    if (score > best) { best = score; bestMoves = [i] } else if (score === best) bestMoves.push(i)
  }
  return pickRandom(bestMoves)
}

// ─── HARD: Reversi — depth-3 alpha-beta, positional weights + mobility ───────

const RV_WEIGHTS = [
  100, -20, 10, 5, 5, 10, -20, 100,
  -20, -50, -2, -2, -2, -2, -50, -20,
  10, -2, 1, 1, 1, 1, -2, 10,
  5, -2, 1, 0, 0, 1, -2, 5,
  5, -2, 1, 0, 0, 1, -2, 5,
  10, -2, 1, 1, 1, 1, -2, 10,
  -20, -50, -2, -2, -2, -2, -50, -20,
  100, -20, 10, 5, 5, 10, -20, 100,
]

function rvEval(board, sym) {
  const opp = opponent(sym)
  let score = 0
  for (let i = 0; i < 64; i++) {
    if (board[i] === sym) score += RV_WEIGHTS[i]
    else if (board[i] === opp) score -= RV_WEIGHTS[i]
  }
  return score + 5 * (legalMoves(board, sym).length - legalMoves(board, opp).length)
}

function rvNegamax(board, sym, depth, alpha, beta) {
  const opp = opponent(sym)
  const moves = legalMoves(board, sym)
  if (!moves.length) {
    if (!hasAnyMove(board, opp)) {
      // Game over: the disc count decides.
      let diff = 0
      for (const c of board) diff += c === sym ? 1 : c === opp ? -1 : 0
      return diff * 1000
    }
    return -rvNegamax(board, opp, depth, -beta, -alpha) // pass
  }
  if (depth === 0) return rvEval(board, sym)
  let best = -Infinity
  for (const m of [...moves].sort((a, b) => RV_WEIGHTS[b] - RV_WEIGHTS[a])) {
    const s = -rvNegamax(applyReversiMove(board, m, sym).board, opp, depth - 1, -beta, -alpha)
    if (s > best) best = s
    if (s > alpha) alpha = s
    if (alpha >= beta) break
  }
  return best
}

function botReversiHard(game, botSymbol) {
  const board = game.board
  const moves = legalMoves(board, botSymbol)
  if (!moves.length) return null
  let best = -Infinity
  let bestMoves = []
  for (const m of moves) {
    const s = -rvNegamax(applyReversiMove(board, m, botSymbol).board, opponent(botSymbol), 2, -Infinity, Infinity)
    if (s > best) { best = s; bestMoves = [m] } else if (s === best) bestMoves.push(m)
  }
  return pickRandom(bestMoves)
}

// ─── HARD: SOS — score greedily, otherwise never set the opponent up ─────────

function sosBestCompletion(board) {
  let best = 0
  for (let j = 0; j < board.length; j++) {
    if (board[j]) continue
    for (const letter of ['S', 'O']) {
      board[j] = letter
      const n = findNewSosLines(board, j).length
      board[j] = ''
      if (n > best) best = n
    }
  }
  return best
}

// SOS letters are shared, so the choice doesn't depend on which side we are.
function botSosHard(game) {
  const board = game.board.map(c => c || '')
  const empties = emptyCells(board)
  if (!empties.length) return null
  let bestScoring = null
  let bestCount = 0
  const quiet = []
  for (const index of shuffle(empties)) {
    for (const letter of ['S', 'O']) {
      board[index] = letter
      const n = findNewSosLines(board, index).length
      if (n > bestCount) { bestCount = n; bestScoring = { index, letter } }
      if (n === 0) quiet.push({ index, letter, gift: sosBestCompletion(board) })
      board[index] = ''
    }
  }
  // Scoring keeps the turn, so always cash in the biggest completion first.
  if (bestScoring) return bestScoring
  const minGift = Math.min(...quiet.map(q => q.gift))
  const { index, letter } = pickRandom(quiet.filter(q => q.gift === minGift))
  return { index, letter }
}

// ─── HARD: Dots and Boxes — when forced, sacrifice the shortest chain ────────

// Boxes the opponent collects by greedily closing every 3-sided box after
// `edge` is played (the chain we'd be handing over).
function dbGiveaway(edges, boxes, edge, sym, size) {
  const opp = opponent(sym)
  let state = applyEdgeMove(edges, boxes, edge, sym, size)
  if (!state) return Infinity
  let taken = 0
  for (;;) {
    let next = null
    for (let b = 0; b < state.boxes.length && next === null; b++) {
      if (state.boxes[b]) continue
      const missing = edgesOfBox(b, size).filter(e => !state.edges[e])
      if (missing.length === 1) next = missing[0]
    }
    if (next === null) return taken
    state = applyEdgeMove(state.edges, state.boxes, next, opp, size)
    taken += state.completedBoxes.length
  }
}

function botDotsAndBoxesHard(game, botSymbol) {
  const size = dbSizeFromGame(game)
  const { edgeCount } = dbConfig(size)
  const edges = game.board
  const boxes = game.boxes
  const emptyEdges = []
  for (let e = 0; e < edgeCount; e++) if (!edges[e]) emptyEdges.push(e)
  if (!emptyEdges.length) return null
  // Captures and safe edges: exactly the normal bot's play.
  const hasCapture = emptyEdges.some(e => applyEdgeMove(edges, boxes, e, botSymbol, size)?.completedBoxes.length)
  const hasSafe = emptyEdges.some(e => boxesOfEdge(e, size).every(b => boxes[b] || countFilledEdges(edges, b, size) !== 2))
  if (hasCapture || hasSafe) return botDotsAndBoxes(game, botSymbol)
  let fewest = Infinity
  let bestEdges = []
  for (const e of emptyEdges) {
    const given = dbGiveaway(edges, boxes, e, botSymbol, size)
    if (given < fewest) { fewest = given; bestEdges = [e] } else if (given === fewest) bestEdges.push(e)
  }
  return pickRandom(bestEdges)
}

// ─── HARD: Chain Reaction — 2-ply: best capture net of the best reply ────────

function botChainReactionHard(game, botSymbol) {
  const board = game.board || []
  const { cols, rows } = crDimsFromLength(board.length)
  const dims = { cols, rows }
  const opp = opponent(botSymbol)
  const crMoves = game.crMoves ?? 0
  const moves = legalBotMoves('chainreaction', game, botSymbol)
  if (!moves.length) return null
  const orbs = (b, sym) => b.reduce((n, c) => (c && c[0] === sym ? n + parseInt(c.slice(1), 10) : n), 0)
  // 1-ply pass: take a wipe-out, and keep the 12 best captures for the reply search.
  const oneStep = []
  for (const i of shuffle(moves)) {
    const { board: nb } = applyPlacement(board, i, botSymbol, dims, { stopOnDomination: crMoves >= 1 })
    if (crMoves >= 1 && orbs(nb, opp) === 0) return i
    oneStep.push({ i, nb, net: orbs(nb, botSymbol) - orbs(nb, opp) })
  }
  oneStep.sort((a, b) => b.net - a.net)
  let best = -Infinity
  let bestMoves = []
  for (const { i, nb } of oneStep.slice(0, 12)) {
    let worst = Infinity
    for (let j = 0; j < cols * rows; j++) {
      if (nb[j] && nb[j][0] !== opp) continue
      const { board: rb } = applyPlacement(nb, j, opp, dims, { stopOnDomination: true })
      const net = orbs(rb, botSymbol) === 0 ? -10000 : orbs(rb, botSymbol) - orbs(rb, opp)
      if (net < worst) worst = net
      if (worst === -10000) break
    }
    if (worst > best) { best = worst; bestMoves = [i] } else if (worst === best) bestMoves.push(i)
  }
  return pickRandom(bestMoves)
}

// ─── HARD: Hex — shortest-path race (0-1 BFS resistance) ────────────────────

// Stones `sym` still needs to connect its edges: own stones cost 0, empty
// cells 1, enemy stones block. Infinity when cut off.
function hexDistance(board, sym) {
  const N = HEX_CELL_COUNT
  const dist = new Array(N).fill(Infinity)
  const dq = new Int32Array(N * 16)
  let head = N * 8
  let tail = N * 8
  const isStart = i => (sym === 'X' ? i % HEX_SIZE === 0 : i < HEX_SIZE)
  const isGoal = i => (sym === 'X' ? i % HEX_SIZE === HEX_SIZE - 1 : i >= N - HEX_SIZE)
  const cost = i => (board[i] === sym ? 0 : board[i] ? Infinity : 1)
  for (let i = 0; i < N; i++) {
    if (!isStart(i)) continue
    const c = cost(i)
    if (c === Infinity) continue
    dist[i] = c
    if (c === 0) dq[--head] = i
    else dq[tail++] = i
  }
  let best = Infinity
  while (head < tail) {
    const cur = dq[head++]
    if (isGoal(cur)) best = Math.min(best, dist[cur])
    for (const nb of neighbors(cur)) {
      const c = cost(nb)
      if (c === Infinity) continue
      if (dist[cur] + c < dist[nb]) {
        dist[nb] = dist[cur] + c
        if (c === 0) dq[--head] = nb
        else dq[tail++] = nb
      }
    }
  }
  return best
}

function botHexHard(game, botSymbol) {
  const board = normalizeBoard(game.board, HEX_CELL_COUNT)
  if (hexShouldSwap({ ...game, board }, botSymbol)) return { action: HEX_SWAP_ACTION }
  const empties = emptyCells(board)
  if (!empties.length) return null
  if (empties.length === HEX_CELL_COUNT) return hexFairOpening() // swap rule is always on
  const opp = opponent(botSymbol)
  const mid = (HEX_SIZE - 1) / 2
  let best = -Infinity
  let bestMoves = []
  for (const i of empties) {
    board[i] = botSymbol
    const mine = hexDistance(board, botSymbol)
    const theirs = hexDistance(board, opp)
    board[i] = ''
    if (mine === 0) return i
    const r = Math.floor(i / HEX_SIZE)
    const c = i % HEX_SIZE
    // Race margin first; a mild centre pull breaks the (many) early ties.
    const score = (theirs === Infinity ? 100 : theirs) * 10 - mine * 10 - (Math.abs(r - mid) + Math.abs(c - mid)) / 10
    if (score > best) { best = score; bestMoves = [i] } else if (score === best) bestMoves.push(i)
  }
  return pickRandom(bestMoves)
}

// Types whose hard level differs from normal.
const HARD_BOTS = {
  tictactoe: botTicTacToeHard,
  tictactoe4: botTicTacToe4Hard,
  ultimatettt: botUltimateHard,
  connectfour: (game, sym) => botConnectFourHard(game, sym),
  connectfour5: (game, sym) => botConnectFourHard(game, sym, CF5),
  // Pop Out: searches drops only (like the normal bot, it never pops).
  connectfourpop: (game, sym) => {
    const col = botConnectFourHard(game, sym)
    return col == null ? null : { col, action: 'drop' }
  },
  gomoku: botGomokuHard,
  gomokuswap: (game, sym) => botGomokuSwap(game, sym, botGomokuHard),
  reversi: botReversiHard,
  sos: botSosHard,
  dotsandboxes: botDotsAndBoxesHard,
  dotsandboxes4: botDotsAndBoxesHard,
  chainreaction: botChainReactionHard,
  chainreaction6: botChainReactionHard,
  hex: botHexHard,
  dice: botDiceHard,
  'dice-big': botDiceHard,
}

// The difficulty levels a type actually distinguishes — what a picker should
// offer. ['normal'] alone means the type has no easy/hard variants (Pairs, a
// memory game, keeps its own bot).
export function botDifficulties(type) {
  const levels = []
  if (EASY_TYPES.has(type)) levels.push('easy')
  levels.push('normal')
  if (HARD_BOTS[type]) levels.push('hard')
  return levels
}

// ---------------------------------------------------------------------------
// Dispatcher

export function pickBotMove(type, game, botSymbol, difficulty = DEFAULT_BOT_DIFFICULTY) {
  const level = normalizeDifficulty(difficulty)
  if (level === 'easy') {
    const move = pickEasyMove(type, game, botSymbol)
    if (move !== undefined) return move
  } else if (level === 'hard' && HARD_BOTS[type]) {
    return HARD_BOTS[type](game, botSymbol)
  }
  return pickNormalMove(type, game, botSymbol)
}
