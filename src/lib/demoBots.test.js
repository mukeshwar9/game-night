import { describe, it, expect } from 'vitest'
import { pickBotMove } from './demoBots'
import { legalMoves } from './reversiLogic'
import { CR_CELL_COUNT, CR_COLS } from './chainReactionLogic'
import { DB_EDGE_COUNT, DB_BOX_COUNT, edgesOfBox } from './dotsAndBoxesLogic'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const emptyBoard = size => Array(size).fill('')

function place(board, cells, symbol) {
  const b = [...board]
  cells.forEach(i => { b[i] = symbol })
  return b
}

// Build a minimal game object for board-only games
function boardGame(board, extras = {}) {
  return { board, ...extras }
}

// ---------------------------------------------------------------------------
// 1. Tic-tac-toe
// ---------------------------------------------------------------------------

describe('pickBotMove — tictactoe', () => {
  it('takes an immediate winning move for the bot', () => {
    // O has two in a row at 0,1 — playing 2 wins
    const board = place(emptyBoard(9), [0, 1], 'O')
    board[3] = 'X'; board[4] = 'X' // X is not about to win on index 2
    const move = pickBotMove('tictactoe', boardGame(board), 'O')
    expect(move).toBe(2)
  })

  it('blocks an immediate opponent win (X about to win)', () => {
    // X has 0,1 — would win at 2; O must block
    const board = place(emptyBoard(9), [0, 1], 'X')
    board[3] = 'O' // O is somewhere else
    const move = pickBotMove('tictactoe', boardGame(board), 'O')
    expect(move).toBe(2)
  })

  it('prefers center when no win/block is available', () => {
    // Completely empty board — should play center (4)
    const move = pickBotMove('tictactoe', boardGame(emptyBoard(9)), 'O')
    expect(move).toBe(4)
  })

  it('blocks an X diagonal win (must play 8 to stop X at 0,4,8)', () => {
    // X is at 0 and 4; X would win at 8. O must block.
    const board = ['X', '', 'O', '', 'X', '', 'O', '', '']
    // O is at 2,6 — cannot win immediately. X wins at 8 → bot must block.
    const move = pickBotMove('tictactoe', boardGame(board), 'O')
    expect(move).toBe(8)
  })

  it('does not return an occupied cell', () => {
    // Only cell 8 is empty
    const board = ['X', 'O', 'X', 'O', 'X', 'O', 'O', 'X', '']
    const move = pickBotMove('tictactoe', boardGame(board), 'O')
    expect(move).toBe(8)
  })
})

// ---------------------------------------------------------------------------
// 2. Connect Four
// ---------------------------------------------------------------------------

describe('pickBotMove — connectfour', () => {
  it('takes a winning column immediately', () => {
    // O has three in a row vertically at col 3 (rows 5,4,3 = 38,31,24).
    // Only col 3 lets O drop to row 2 (index 17) and win vertically.
    // No other column gives O a 4-in-a-row.
    const board = emptyBoard(42)
    board[38] = 'O' // row5 col3
    board[31] = 'O' // row4 col3
    board[24] = 'O' // row3 col3
    // Block col 2 and col 4 with X so bot can't accidentally win elsewhere
    board[41] = 'X'
    const move = pickBotMove('connectfour', boardGame(board), 'O')
    // O must win via col 3 (vertical completion at index 17)
    expect(move).toBe(3)
  })

  it('blocks the opponent from winning (vertical threat)', () => {
    // X has 3 in a row vertically at col 3 (rows 5,4,3 = indices 38,31,24)
    // X would win at col 3 row 2 (index 17). Bot must block col 3.
    const board = emptyBoard(42)
    board[38] = 'X' // row5 col3
    board[31] = 'X' // row4 col3
    board[24] = 'X' // row3 col3
    board[35] = 'O' // O at row5 col0
    board[36] = 'O' // O at row5 col1 — no immediate O win
    const move = pickBotMove('connectfour', boardGame(board), 'O')
    expect(move).toBe(3)
  })

  it('returns a valid column (0-6) for an empty board', () => {
    const move = pickBotMove('connectfour', boardGame(emptyBoard(42)), 'O')
    expect(move).toBeGreaterThanOrEqual(0)
    expect(move).toBeLessThanOrEqual(6)
  })

  it('does not play in a full column', () => {
    // Fill columns 0-5 completely, only col 6 has space
    const board = emptyBoard(42)
    for (let col = 0; col < 6; col++) {
      for (let row = 0; row < 6; row++) {
        board[row * 7 + col] = 'X'
      }
    }
    const move = pickBotMove('connectfour', boardGame(board), 'O')
    expect(move).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// 3. Dice (Pig)
// ---------------------------------------------------------------------------

describe('pickBotMove — dice', () => {
  it('returns "roll" when turn score is 0 and banking would not win', () => {
    const game = { diceScoreX: 0, diceScoreO: 0, diceTurnScore: 0, currentTurn: 'O' }
    expect(pickBotMove('dice', game, 'O')).toBe('roll')
  })

  it('returns "roll" when turn score is 19 (below threshold)', () => {
    const game = { diceScoreX: 0, diceScoreO: 10, diceTurnScore: 19, currentTurn: 'O' }
    expect(pickBotMove('dice', game, 'O')).toBe('roll')
  })

  it('returns "bank" when turn score is exactly 20', () => {
    const game = { diceScoreX: 0, diceScoreO: 0, diceTurnScore: 20, currentTurn: 'O' }
    expect(pickBotMove('dice', game, 'O')).toBe('bank')
  })

  it('returns "bank" when turn score exceeds 20', () => {
    const game = { diceScoreX: 0, diceScoreO: 0, diceTurnScore: 25, currentTurn: 'O' }
    expect(pickBotMove('dice', game, 'O')).toBe('bank')
  })

  it('returns "bank" when banking would reach exactly 100', () => {
    const game = { diceScoreX: 0, diceScoreO: 90, diceTurnScore: 10, currentTurn: 'O' }
    expect(pickBotMove('dice', game, 'O')).toBe('bank')
  })

  it('returns "bank" when banking would exceed 100', () => {
    const game = { diceScoreX: 0, diceScoreO: 90, diceTurnScore: 15, currentTurn: 'O' }
    expect(pickBotMove('dice', game, 'O')).toBe('bank')
  })

  it('returns "roll" when close to winning but turn score under 20', () => {
    const game = { diceScoreX: 0, diceScoreO: 70, diceTurnScore: 15, currentTurn: 'O' }
    // 70 + 15 = 85 < 100, turn < 20 → roll
    expect(pickBotMove('dice', game, 'O')).toBe('roll')
  })

  it('works when bot is X (uses diceScoreX)', () => {
    const game = { diceScoreX: 95, diceScoreO: 0, diceTurnScore: 8, currentTurn: 'X' }
    // 95 + 8 = 103 >= 100 → bank
    expect(pickBotMove('dice', game, 'X')).toBe('bank')
  })

  it('handles missing scores gracefully (defaults to 0)', () => {
    // No score fields at all
    const game = { currentTurn: 'O' }
    // 0 + 0 = 0 < 100, turn = 0 < 20 → roll
    expect(pickBotMove('dice', game, 'O')).toBe('roll')
  })

  it('rolls past 20 when far behind (race-aware)', () => {
    // Bot O trails 0..95; behind 95 → target capped at 40. turn=25 < 40 → roll
    const game = { diceScoreX: 95, diceScoreO: 0, diceTurnScore: 25, currentTurn: 'O' }
    expect(pickBotMove('dice', game, 'O')).toBe('roll')
  })

  it('still banks past 20 when behind target is reached', () => {
    // behind 95 → target 40. turn=40 → bank
    const game = { diceScoreX: 95, diceScoreO: 0, diceTurnScore: 40, currentTurn: 'O' }
    expect(pickBotMove('dice', game, 'O')).toBe('bank')
  })
})

// ---------------------------------------------------------------------------
// 4. SOS
// ---------------------------------------------------------------------------

describe('pickBotMove — sos', () => {
  it('takes a move that completes an SOS sequence when one exists', () => {
    // Set up board: S at 0, O at 1 — placing S at 2 completes SOS (horizontal)
    const board = emptyBoard(49)
    board[0] = 'S'
    board[1] = 'O'
    // Cell 2 is empty — bot must play S there to score
    const game = { board, sosLines: [] }
    const move = pickBotMove('sos', game, 'O')
    expect(move).not.toBeNull()
    expect(move.index).toBe(2)
    expect(move.letter).toBe('S')
  })

  it('returns a valid {index, letter} on an empty board', () => {
    const game = { board: emptyBoard(49), sosLines: [] }
    const move = pickBotMove('sos', game, 'O')
    expect(move).not.toBeNull()
    expect(typeof move.index).toBe('number')
    expect(move.index).toBeGreaterThanOrEqual(0)
    expect(move.index).toBeLessThan(49)
    expect(['S', 'O']).toContain(move.letter)
  })

  it('does not play on an occupied cell', () => {
    // Fill all but cell 48
    const board = Array(49).fill('S')
    board[48] = ''
    const game = { board, sosLines: [] }
    const move = pickBotMove('sos', game, 'O')
    expect(move).not.toBeNull()
    expect(move.index).toBe(48)
  })
})

// ---------------------------------------------------------------------------
// 5. Reversi
// ---------------------------------------------------------------------------

describe('pickBotMove — reversi', () => {
  it('takes a corner when available', () => {
    // Build a board where O has a legal move at corner 0
    // Standard opening: 27=X, 28=O, 35=O, 36=X
    // O can play at 0 only if it would flip something — let's force a scenario
    // Use an 8x8 board with O able to flip via top-left path
    const board = emptyBoard(64)
    // Place X across row 0 from col 1 to 6, O at 7 → O at 0 would need X between
    // Simpler: place X at 1, O can play at 0 if X is between 0 and O's disc somewhere
    // Actually use a direct legal move: O at 0 flanks X at 1 with O at 2
    board[1] = 'X'
    board[2] = 'O'
    const move = pickBotMove('reversi', boardGame(board), 'O')
    expect(move).toBe(0)
  })

  it('returns null when no legal move exists', () => {
    // Full board, all X (O has no legal moves)
    const board = Array(64).fill('X')
    const move = pickBotMove('reversi', boardGame(board), 'O')
    expect(move).toBeNull()
  })

  it('returns a valid index within legal moves', () => {
    // Standard opening position
    const board = emptyBoard(64)
    board[27] = 'X'; board[28] = 'O'; board[35] = 'O'; board[36] = 'X'
    const legal = legalMoves(board, 'O')
    const move = pickBotMove('reversi', boardGame(board), 'O')
    expect(legal).toContain(move)
  })
})

// ---------------------------------------------------------------------------
// 6. Order & Chaos
// ---------------------------------------------------------------------------

describe('pickBotMove — orderchaos', () => {
  it('returns a {index, letter} payload', () => {
    const board = emptyBoard(36)
    const move = pickBotMove('orderchaos', boardGame(board), 'O')
    expect(move).not.toBeNull()
    expect(typeof move.index).toBe('number')
    expect(['X', 'O']).toContain(move.letter)
  })

  it('avoids completing a 5-in-a-row for Order (X) when possible', () => {
    // X has 4 in a row at positions 0-3; placing X at 4 or O at 4 — only O at 4 is safe
    const board = emptyBoard(36)
    board[0] = 'X'; board[1] = 'X'; board[2] = 'X'; board[3] = 'X'
    // Bot (Chaos) must not play X at 4 (would give Order the win)
    const move = pickBotMove('orderchaos', boardGame(board), 'O')
    expect(move).not.toBeNull()
    // The move must either not be at index 4, or if it is, it must place 'O' not 'X'
    if (move.index === 4) {
      expect(move.letter).toBe('O')
    }
  })

  it('does not play on an occupied cell', () => {
    // Fill all but index 35
    const board = Array(36).fill('X')
    board[35] = ''
    const move = pickBotMove('orderchaos', boardGame(board), 'O')
    expect(move).not.toBeNull()
    expect(move.index).toBe(35)
  })
})

// ---------------------------------------------------------------------------
// 7. Gomoku
// ---------------------------------------------------------------------------

describe('pickBotMove — gomoku', () => {
  it('plays center on an empty board', () => {
    const move = pickBotMove('gomoku', boardGame(emptyBoard(225)), 'O')
    expect(move).toBe(112) // center of 15×15
  })

  it('returns a valid index in 0..224', () => {
    const board = emptyBoard(225)
    board[112] = 'X' // one stone
    const move = pickBotMove('gomoku', boardGame(board), 'O')
    expect(move).toBeGreaterThanOrEqual(0)
    expect(move).toBeLessThan(225)
    expect(board[move]).toBe('')
  })

  it('takes a winning move when available', () => {
    // O has 4 in a row (row 0, cols 0-3); playing index 4 wins
    const board = emptyBoard(225)
    board[0] = 'O'; board[1] = 'O'; board[2] = 'O'; board[3] = 'O'
    board[15] = 'X' // X stone nearby so adjacency heuristic includes candidate 4
    const move = pickBotMove('gomoku', boardGame(board), 'O')
    expect(move).toBe(4)
  })

  it('blocks an opponent about to win', () => {
    // X has 4 in a row (row 0, cols 0-3); O must block at index 4
    const board = emptyBoard(225)
    board[0] = 'X'; board[1] = 'X'; board[2] = 'X'; board[3] = 'X'
    board[15] = 'O' // O stone nearby
    const move = pickBotMove('gomoku', boardGame(board), 'O')
    expect(move).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// 8. Dots and Boxes
// ---------------------------------------------------------------------------

describe('pickBotMove — dotsandboxes', () => {
  it('returns a valid edge index', () => {
    const game = { board: emptyBoard(DB_EDGE_COUNT), boxes: emptyBoard(DB_BOX_COUNT) }
    const move = pickBotMove('dotsandboxes', game, 'O')
    expect(move).toBeGreaterThanOrEqual(0)
    expect(move).toBeLessThan(DB_EDGE_COUNT)
  })

  it('completes a box when 3 edges are already filled', () => {
    const [top, bottom, left, right] = edgesOfBox(0)
    const edges = emptyBoard(DB_EDGE_COUNT)
    edges[top] = 'X'
    edges[bottom] = 'X'
    edges[left] = 'X'
    const game = { board: edges, boxes: emptyBoard(DB_BOX_COUNT) }
    const move = pickBotMove('dotsandboxes', game, 'O')
    expect(move).toBe(right)
  })

  it('does not play an already-filled edge', () => {
    const last = DB_EDGE_COUNT - 1
    const edges = Array(DB_EDGE_COUNT).fill('X')
    edges[last] = ''
    const game = { board: edges, boxes: emptyBoard(DB_BOX_COUNT) }
    const move = pickBotMove('dotsandboxes', game, 'O')
    expect(move).toBe(last)
  })
})

// ---------------------------------------------------------------------------
// 9. Chain Reaction
// ---------------------------------------------------------------------------

describe('pickBotMove — chainreaction', () => {
  const emptyCr = () => Array(CR_CELL_COUNT).fill('')

  it('returns a valid index on an empty board', () => {
    const game = { board: emptyCr(), crMoves: 0 }
    const move = pickBotMove('chainreaction', game, 'O')
    expect(move).not.toBeNull()
    expect(typeof move).toBe('number')
    expect(move).toBeGreaterThanOrEqual(0)
    expect(move).toBeLessThan(CR_CELL_COUNT)
  })

  it('picks a winning capture (clears all opponent orbs) when available', () => {
    // X has one orb at the bottom-right corner (cm=2). O has two orbs at the
    // left neighbour (bottom edge, cm=3). Placing there explodes into the
    // corner and converts it — opponent orbs drop to 0.
    const last = CR_CELL_COUNT - 1
    const left = last - 1
    const board = emptyCr()
    board[last] = 'X1'
    board[left] = 'O2'
    const game = { board, crMoves: 2 }
    const move = pickBotMove('chainreaction', game, 'O')
    expect(move).toBe(left)
  })

  it('prefers a move that captures more opponent orbs', () => {
    const board = emptyCr()
    board[0] = 'O1'
    board[1] = 'X2'
    const game = { board, crMoves: 1 }
    const move = pickBotMove('chainreaction', game, 'O')
    expect(move).toBe(0)
  })

  it('avoids placing adjacent to opponent near-critical cell on tie (no captures)', () => {
    const interior = CR_COLS + 1 // (1,1), cm=4
    const board = emptyCr()
    board[interior] = 'X3'
    const game = { board, crMoves: 1 }
    const move = pickBotMove('chainreaction', game, 'O')
    const nearCritNeighbours = [
      interior - CR_COLS,
      interior + CR_COLS,
      interior - 1,
      interior + 1,
    ]
    expect(nearCritNeighbours).not.toContain(move)
  })

  it('returns null when no legal moves exist (all cells owned by opponent)', () => {
    const board = Array(CR_CELL_COUNT).fill('X1')
    const game = { board, crMoves: 5 }
    const move = pickBotMove('chainreaction', game, 'O')
    expect(move).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Unknown type
// ---------------------------------------------------------------------------

describe('pickBotMove — unknown type', () => {
  it('returns null for an unrecognised game type', () => {
    expect(pickBotMove('chess', {}, 'O')).toBeNull()
    expect(pickBotMove('', {}, 'O')).toBeNull()
    expect(pickBotMove(undefined, {}, 'O')).toBeNull()
  })
})
