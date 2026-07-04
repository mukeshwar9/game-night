import { describe, it, expect } from 'vitest'
import { pickBotMove } from './demoBots'
import { legalMoves } from './reversiLogic'

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
    const game = { board: emptyBoard(40), boxes: emptyBoard(16) }
    const move = pickBotMove('dotsandboxes', game, 'O')
    expect(move).toBeGreaterThanOrEqual(0)
    expect(move).toBeLessThan(40)
  })

  it('completes a box when 3 edges are already filled', () => {
    // Box 0 has edges: top=0, bottom=4, left=20, right=21
    // Fill 3 of them; bot should play the 4th
    const edges = emptyBoard(40)
    edges[0] = 'X'  // top
    edges[4] = 'X'  // bottom
    edges[20] = 'X' // left
    // right = 21 is open → bot should play 21
    const game = { board: edges, boxes: emptyBoard(16) }
    const move = pickBotMove('dotsandboxes', game, 'O')
    expect(move).toBe(21)
  })

  it('does not play an already-filled edge', () => {
    // Fill all but edge 39
    const edges = Array(40).fill('X')
    edges[39] = ''
    const game = { board: edges, boxes: emptyBoard(16) }
    const move = pickBotMove('dotsandboxes', game, 'O')
    expect(move).toBe(39)
  })
})

// ---------------------------------------------------------------------------
// 9. Chain Reaction
// ---------------------------------------------------------------------------

describe('pickBotMove — chainreaction', () => {
  const emptyBoard48 = () => Array(48).fill('')

  it('returns a valid index on an empty board', () => {
    const game = { board: emptyBoard48(), crMoves: 0 }
    const move = pickBotMove('chainreaction', game, 'O')
    expect(move).not.toBeNull()
    expect(typeof move).toBe('number')
    expect(move).toBeGreaterThanOrEqual(0)
    expect(move).toBeLessThan(48)
  })

  it('picks a winning capture (clears all opponent orbs) when available', () => {
    // Board: opponent (X) has a single orb at cell 6 (row 1, col 0 — criticalMass 3).
    // Bot (O) has three orbs at cell 0 (corner, criticalMass 2) so placing there causes
    // an explosion that reaches cell 6. Build a simpler scenario:
    // X has one orb at cell 47 (corner). O has two orbs at cell 47's neighbour cell 41
    // (criticalMass 3 — row 6 col 5, neighbours: 35, 47, 40). Place O at 41 → count=3=cm
    // → explodes → orb goes to 47, converting it to O.
    // But crMoves must be >= 1 for win check to apply.
    const board = emptyBoard48()
    board[47] = 'X1'  // opponent single orb at corner (criticalMass=2)
    board[41] = 'O1'  // bot has one orb at 41 (neighbour of 47; criticalMass=3)
    // Placing O at 41 again: count becomes 2 (< 3), no explosion yet. Need count=3 to explode.
    // Let's put 2 orbs at 41 already:
    board[41] = 'O2'
    // Now placing O at 41 → count=3 = criticalMass(41)=3 → explodes → sends to 35, 47, 40
    // cell 47 (was X1) becomes O2, 40 and 35 each get +1 orb. Opponent orbs = 0 → win.
    const game = { board, crMoves: 2 } // both have moved at least once
    const move = pickBotMove('chainreaction', game, 'O')
    expect(move).toBe(41)
  })

  it('prefers a move that captures more opponent orbs', () => {
    // Two candidate moves: move A captures 1 opponent orb, move B captures 3.
    // 6×8 grid — use row 0 (top edge).
    // Opponent at cell 1 with 2 orbs (criticalMass(1)=3, edge cell). Placing at cell 0
    // (corner, criticalMass=2): with 1 own orb at 0, placing makes count=2=cm → explodes
    // → sends to cell 1 (right) and cell 6 (below). Cell 1 was X2 → becomes O3 → cm=3
    // → explodes again. Complex; let's use a direct scenario.
    // Simpler: O has orbs at a cell that when placed causes 3 captures vs another cell
    // causing 0 captures. We'll craft:
    // X3 at cell 1 (edge, cm=3). Placing O at cell 0 (corner, cm=2) with count 1 there:
    //   0 gets count=2=cm(0)=2 → explodes → sends to 1 and 6.
    //   cell 1 (X3) → gains 1 → X4 = cm reached (3) → explodes → sends to 0,2,7 as O.
    //   Actually the explosion converts cells to the current symbol.
    // This is complex. Let's do a simpler test: move at a cell adjacent to opponent vs not.
    const board = emptyBoard48()
    board[0] = 'O1'  // bot owns corner 0
    // Opponent owns cell 1 with 2 orbs (1 below critical mass=3)
    // Placing O at 0 → count=2=cm(0)=2 → explodes → sends to cell 1 and cell 6
    // cell 1: gains O orb, becomes O1 (was X2 → now O3, but wait conversion: it's X2+1=X3
    // Actually in applyPlacement, the conversion happens: neighbours get symbol of exploder.
    // So cell 1 (X2) gains 1 orb and converts to O: becomes O3. criticalMass(1)=3. O3=cm → explodes.
    // Chain: O captures cell 1 (and possibly more). That's 2 opponent orbs captured.
    // If we instead place at cell 36 (interior, far from opponent): 0 captures.
    // So bot should prefer placing at 0.
    board[1] = 'X2'
    const game = { board, crMoves: 1 }
    const move = pickBotMove('chainreaction', game, 'O')
    // Move at 0 leads to capturing opponent orbs; other moves capture 0
    expect(move).toBe(0)
  })

  it('avoids placing adjacent to opponent near-critical cell on tie (no captures)', () => {
    // Empty board, no opponent orbs → all moves capture 0 (tie).
    // Opponent has a near-critical cell at index 7 (row 1, col 1, cm=4, so near-crit at count=3).
    // Neighbours of 7: 1, 13, 6, 8.
    // Bot should prefer a corner (e.g. 0) over cells adjacent to 7.
    const board = emptyBoard48()
    board[7] = 'X3'  // near critical (cm=4, count=3)
    const game = { board, crMoves: 1 }
    const move = pickBotMove('chainreaction', game, 'O')
    // Move should NOT be one of the neighbours of 7 (1, 13, 6, 8) if a better option exists
    // Corners are 0, 5, 42, 47 — all safe and higher-scored
    const nearCritNeighbours = [1, 6, 8, 13]
    // All captures are 0 here (no opponent orbs to capture), so tie-break applies
    expect(nearCritNeighbours).not.toContain(move)
  })

  it('returns null when no legal moves exist (all cells owned by opponent)', () => {
    // All cells owned by opponent — bot has no legal moves
    const board = Array(48).fill('X1')
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
