// demoBots.js — pure AI logic for casual "play vs computer" mode.
// NO React, NO Firebase. Pure functions only.
//
// pickBotMove(type, game, botSymbol) → move payload (same shape the board's onMove emits)
// Returns null when no move is possible (e.g. Reversi pass).

import { getWinner, normalizeBoard } from './gameLogic'
import {
  getConnectFourWinner,
  getConnectFourDrop,
} from './connectFourLogic'
import { legalCells, miniBoardWinner, normalizeUWon } from './ultimateTttLogic'
import { getGomokuWinner, GOMOKU_SIZE, GOMOKU_CELL_COUNT } from './gomokuLogic'
import { legalMoves, flippedBy } from './reversiLogic'
import {
  applyOrderChaosMove,
  getOrderChaosWinner,
} from './orderChaosLogic'
import { applySosMove, normalizeSosLines } from './sosLogic'
import {
  applyEdgeMove,
  edgesOfBox,
  boxesOfEdge,
  DB_EDGE_COUNT,
} from './dotsAndBoxesLogic'
import { PIG_TARGET } from './diceLogic'
import {
  applyPlacement,
  decodeCell,
  criticalMass,
  CR_CELL_COUNT,
  CR_COLS,
  CR_ROWS,
} from './chainReactionLogic'

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

// ---------------------------------------------------------------------------
// 2. Connect Four
// ---------------------------------------------------------------------------

// Center-biased column preference order
const CF_COL_PREF = [3, 2, 4, 1, 5, 0, 6]

function botConnectFour(game, botSymbol) {
  const board = game.board
  const opp = opponent(botSymbol)
  const legalCols = CF_COL_PREF.filter(c => getConnectFourDrop(board, c) !== -1)
  if (!legalCols.length) return null

  // Win immediately
  for (const col of shuffle(legalCols)) {
    const landing = getConnectFourDrop(board, col)
    const b = [...board]
    b[landing] = botSymbol
    const res = getConnectFourWinner(b)
    if (res && res.winner === botSymbol) return col
  }

  // Block opponent win
  for (const col of shuffle(legalCols)) {
    const landing = getConnectFourDrop(board, col)
    const b = [...board]
    b[landing] = opp
    const res = getConnectFourWinner(b)
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
// 5. Order & Chaos — bot plays as CHAOS (seat O), wants to PREVENT 5-in-a-row
// ---------------------------------------------------------------------------

function botOrderChaos(game) {
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

function countFilledEdges(edges, boxIdx) {
  return edgesOfBox(boxIdx).filter(e => edges[e]).length
}

function botDotsAndBoxes(game, botSymbol) {
  const edges = game.board  // board = edges array for dots and boxes
  const boxes = game.boxes

  const emptyEdges = []
  for (let e = 0; e < DB_EDGE_COUNT; e++) {
    if (!edges[e]) emptyEdges.push(e)
  }
  if (!emptyEdges.length) return null

  // (a) Complete a box — prefer the move that closes the most boxes
  let bestCompletion = null
  let bestBoxCount = 0
  for (const e of emptyEdges) {
    const result = applyEdgeMove(edges, boxes, e, botSymbol)
    if (!result) continue
    if (result.completedBoxes.length > bestBoxCount) {
      bestBoxCount = result.completedBoxes.length
      bestCompletion = e
    }
  }
  if (bestCompletion !== null && bestBoxCount > 0) return bestCompletion

  // (b) Safe edges — adding them won't bring any adjacent box to 3 filled sides
  const safeEdges = emptyEdges.filter(e => {
    const adjacentBoxes = boxesOfEdge(e)
    // After placing this edge, check if any adjacent box would have 3 filled sides
    // (opponent could then close it next turn)
    for (const b of adjacentBoxes) {
      if (boxes[b]) continue // already claimed
      if (countFilledEdges(edges, b) === 2) {
        // Adding e brings it to 3 — unsafe
        return false
      }
    }
    return true
  })

  if (safeEdges.length) return pickRandom(safeEdges)

  // (c) No safe edge — play any empty edge
  return pickRandom(emptyEdges)
}

// ---------------------------------------------------------------------------
// 8. Dice (Pig) — "hold at 20" heuristic
// ---------------------------------------------------------------------------

function botDice(game, botSymbol) {
  const myScore = (botSymbol === 'O' ? game.diceScoreO : game.diceScoreX) ?? 0
  const turn = game.diceTurnScore ?? 0

  if (myScore + turn >= PIG_TARGET) return 'bank'
  if (turn >= 20) return 'bank'
  return 'roll'
}

// ---------------------------------------------------------------------------
// 9. Chain Reaction
// ---------------------------------------------------------------------------

function crNeighbours(index) {
  const row = Math.floor(index / CR_COLS)
  const col = index % CR_COLS
  const ns = []
  if (row > 0)           ns.push(index - CR_COLS)
  if (row < CR_ROWS - 1) ns.push(index + CR_COLS)
  if (col > 0)           ns.push(index - 1)
  if (col < CR_COLS - 1) ns.push(index + 1)
  return ns
}

function botChainReaction(game, botSymbol) {
  const board = game.board || []
  const crMoves = game.crMoves ?? 0
  const opp = opponent(botSymbol)

  // Legal moves: empty or own cells
  const moves = []
  for (let i = 0; i < CR_CELL_COUNT; i++) {
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

  // (1) Win: any move that leaves opponent with 0 orbs (needs crMoves+1 >= 2)
  if (crMoves >= 1) {
    for (const i of moves) {
      const { board: nb } = applyPlacement(board, i, botSymbol)
      if (countOppOrbs(nb) === 0) return i
    }
  }

  // (2) Capture: pick move that reduces opponent orb count the most
  let bestCapture = -1
  let bestMoves = []
  for (const i of moves) {
    const { board: nb } = applyPlacement(board, i, botSymbol)
    const captured = oppBefore - countOppOrbs(nb)
    if (captured > bestCapture) {
      bestCapture = captured
      bestMoves = [i]
    } else if (captured === bestCapture) {
      bestMoves.push(i)
    }
  }

  if (bestMoves.length === 1) return bestMoves[0]

  // (3) Tie-break: avoid cells adjacent to opponent near-critical cells;
  //     prefer corners > edges > interior
  const nearCritical = new Set()
  for (let i = 0; i < CR_CELL_COUNT; i++) {
    const cell = board[i]
    if (cell && cell[0] === opp) {
      const { count } = decodeCell(cell)
      if (count === criticalMass(i) - 1) nearCritical.add(i)
    }
  }

  const crCorners = new Set([0, CR_COLS - 1, CR_CELL_COUNT - CR_COLS, CR_CELL_COUNT - 1])
  const isEdge = (i) => {
    const row = Math.floor(i / CR_COLS)
    const col = i % CR_COLS
    return (row === 0 || row === CR_ROWS - 1 || col === 0 || col === CR_COLS - 1) && !crCorners.has(i)
  }

  const scored = bestMoves.map(i => {
    const adjToNearCrit = crNeighbours(i).some(n => nearCritical.has(n))
    const posScore = crCorners.has(i) ? 3 : isEdge(i) ? 2 : 1
    // Danger avoidance dominates; within same danger tier, prefer better position
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

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function pickBotMove(type, game, botSymbol) {
  switch (type) {
    case 'tictactoe':    return botTicTacToe(game, botSymbol)
    case 'ultimatettt':  return botUltimate(game, botSymbol)
    case 'connectfour':  return botConnectFour(game, botSymbol)
    case 'connectfourpop': return botConnectFourPop(game, botSymbol)
    case 'gomoku':       return botGomoku(game, botSymbol)
    case 'reversi':      return botReversi(game, botSymbol)
    case 'orderchaos':   return botOrderChaos(game, botSymbol)
    case 'sos':          return botSos(game, botSymbol)
    case 'dotsandboxes':   return botDotsAndBoxes(game, botSymbol)
    case 'dice':           return botDice(game, botSymbol)
    case 'chainreaction':  return botChainReaction(game, botSymbol)
    default:               return null
  }
}
