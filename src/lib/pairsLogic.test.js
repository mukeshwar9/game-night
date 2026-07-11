import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  PAIRS_FACES,
  PAIRS_CELL_COUNT,
  generatePairsDeck,
  normalizePairsDeck,
  normalizePairsFlipped,
  getPairsWinner,
  applyPairsMove,
  computePairsBotMove,
} from './pairsLogic'
import { SHAPES } from './avatars'

describe('PAIRS_FACES', () => {
  it('has exactly 18 faces', () => {
    expect(PAIRS_FACES.length).toBe(18)
  })

  it('every face exists as an avatar shape in SHAPES', () => {
    for (const face of PAIRS_FACES) {
      expect(SHAPES).toContain(face)
    }
  })
})

describe('generatePairsDeck', () => {
  it('returns 36 entries', () => {
    expect(generatePairsDeck().length).toBe(36)
  })

  it('every face in PAIRS_FACES appears exactly twice', () => {
    const deck = generatePairsDeck()
    for (const face of PAIRS_FACES) {
      expect(deck.filter(f => f === face).length).toBe(2)
    }
  })

  it('no face outside PAIRS_FACES appears', () => {
    const deck = generatePairsDeck()
    for (const f of deck) {
      expect(PAIRS_FACES).toContain(f)
    }
  })
})

describe('normalizePairsDeck', () => {
  it('passes array input through unchanged', () => {
    const arr = ['a', 'b', 'c']
    expect(normalizePairsDeck(arr)).toEqual(arr)
  })

  it('returns [] for null/undefined', () => {
    expect(normalizePairsDeck(null)).toEqual([])
    expect(normalizePairsDeck(undefined)).toEqual([])
  })

  it('converts a Firebase numeric-keyed object to a sorted array', () => {
    expect(normalizePairsDeck({ 0: 'a', 2: 'b' })).toEqual(['a', 'b'])
  })
})

describe('normalizePairsFlipped', () => {
  it('passes array input through unchanged', () => {
    const arr = [3, 7]
    expect(normalizePairsFlipped(arr)).toEqual(arr)
  })

  it('returns [] for null/undefined', () => {
    expect(normalizePairsFlipped(null)).toEqual([])
    expect(normalizePairsFlipped(undefined)).toEqual([])
  })

  it('converts a Firebase numeric-keyed object to a sorted array', () => {
    expect(normalizePairsFlipped({ 0: 5, 2: 9 })).toEqual([5, 9])
  })
})

describe('applyPairsMove', () => {
  function emptyBoard() { return Array(PAIRS_CELL_COUNT).fill('') }

  it('is illegal when board[i] is already claimed', () => {
    const board = emptyBoard()
    board[3] = 'X'
    const deck = generatePairsDeck()
    expect(applyPairsMove(board, deck, [], 3, 'X')).toBeNull()
  })

  it('is illegal when index is already in flipped (flipped.length === 1 self-retap)', () => {
    const board = emptyBoard()
    const deck = generatePairsDeck()
    expect(applyPairsMove(board, deck, [5], 5, 'X')).toBeNull()
  })

  it('is illegal when index is already in flipped (flipped.length === 2 stale mismatch retap)', () => {
    const board = emptyBoard()
    const deck = generatePairsDeck()
    expect(applyPairsMove(board, deck, [4, 9], 4, 'X')).toBeNull()
    expect(applyPairsMove(board, deck, [4, 9], 9, 'X')).toBeNull()
  })

  it('is illegal when index is out of range', () => {
    const board = emptyBoard()
    const deck = generatePairsDeck()
    expect(applyPairsMove(board, deck, [], -1, 'X')).toBeNull()
    expect(applyPairsMove(board, deck, [], 36, 'X')).toBeNull()
  })

  it('first flip with flipped = [] returns board unchanged, flipped: [i], turnStays true', () => {
    const board = emptyBoard()
    const deck = generatePairsDeck()
    const result = applyPairsMove(board, deck, [], 7, 'X')
    expect(result).toEqual({ board, flipped: [7], turnStays: true, matched: false })
  })

  it('first flip clearing a leftover mismatch (flipped has 2 entries) discards old indices', () => {
    const board = emptyBoard()
    const deck = generatePairsDeck()
    const result = applyPairsMove(board, deck, [4, 9], 12, 'O')
    expect(result).toEqual({ board, flipped: [12], turnStays: true, matched: false })
  })

  it('second flip match: claims both cells for symbol, clears flipped, turnStays true', () => {
    const board = emptyBoard()
    const deck = emptyBoard().map(() => '')
    deck[2] = 'robot'
    deck[8] = 'robot'
    const result = applyPairsMove(board, deck, [2], 8, 'X')
    const expectedBoard = emptyBoard()
    expectedBoard[2] = 'X'
    expectedBoard[8] = 'X'
    expect(result).toEqual({ board: expectedBoard, flipped: null, turnStays: true, matched: true })
  })

  it('second flip mismatch: board unchanged, flipped: [j, i] in held-then-new order, turnStays false', () => {
    const board = emptyBoard()
    const deck = emptyBoard().map(() => '')
    deck[2] = 'robot'
    deck[8] = 'ghost'
    const result = applyPairsMove(board, deck, [2], 8, 'X')
    expect(result).toEqual({ board, flipped: [2, 8], turnStays: false, matched: false })
  })
})

describe('getPairsWinner', () => {
  function boardWith(xCells, oCells) {
    const board = Array(PAIRS_CELL_COUNT).fill('')
    for (const i of xCells) board[i] = 'X'
    for (const i of oCells) board[i] = 'O'
    return board
  }

  it('returns null when neither side has reached clinch and board is not full', () => {
    const board = boardWith([0, 1, 2, 3], [4, 5, 6, 7])
    expect(getPairsWinner(board)).toBeNull()
  })

  it('returns null at exactly 9 pairs for X (18 cells) when board is not full', () => {
    // Synthetic (not naturally reachable) 9-X-pairs board with the rest unclaimed —
    // confirms the clinch threshold is a hard >= 10, not >= 9.
    const xCells = Array.from({ length: 18 }, (_, i) => i)
    const board = boardWith(xCells, [])
    expect(getPairsWinner(board)).toBeNull()
  })

  it('X reaches exactly 10 pairs (20 X-cells), board not full → X wins (clinch before fill)', () => {
    const xCells = Array.from({ length: 20 }, (_, i) => i)
    const board = boardWith(xCells, [])
    expect(getPairsWinner(board)).toEqual({ winner: 'X' })
  })

  it('O reaches exactly 10 pairs (20 O-cells), board not full → O wins (clinch before fill)', () => {
    const oCells = Array.from({ length: 20 }, (_, i) => i)
    const board = boardWith([], oCells)
    expect(getPairsWinner(board)).toEqual({ winner: 'O' })
  })

  it('board fully claimed 9-9 → draw', () => {
    const xCells = Array.from({ length: 18 }, (_, i) => i)
    const oCells = Array.from({ length: 18 }, (_, i) => i + 18)
    const board = boardWith(xCells, oCells)
    expect(getPairsWinner(board)).toEqual({ winner: 'draw' })
  })
})

describe('computePairsBotMove', () => {
  function randomDeck() {
    const faces = PAIRS_FACES.flatMap(f => [f, f])
    for (let i = faces.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[faces[i], faces[j]] = [faces[j], faces[i]]
    }
    return faces
  }

  it('legality fuzz: returned index (when non-null) is always unclaimed and not in flipped', () => {
    for (let iter = 0; iter < 200; iter++) {
      const deck = randomDeck()
      const board = Array(PAIRS_CELL_COUNT).fill('')
      // Randomly claim some pairs (respecting the "both cells claimed together" invariant).
      const faces = [...PAIRS_FACES]
      const numClaimed = Math.floor(Math.random() * faces.length)
      for (let k = 0; k < numClaimed; k++) {
        const face = faces[k]
        const owner = Math.random() < 0.5 ? 'X' : 'O'
        deck.forEach((f, idx) => { if (f === face) board[idx] = owner })
      }
      // Random flipped state (0, 1, or 2 unclaimed cells).
      const unclaimed = []
      for (let i = 0; i < PAIRS_CELL_COUNT; i++) if (board[i] === '') unclaimed.push(i)
      let flipped = []
      const flipCount = Math.floor(Math.random() * 3)
      if (unclaimed.length >= flipCount) {
        const shuffled = [...unclaimed].sort(() => Math.random() - 0.5)
        flipped = shuffled.slice(0, flipCount)
      }

      const gameView = { board, pairsDeck: deck, pairsFlipped: flipped.length ? flipped : null }
      const move = computePairsBotMove(gameView, 'X')

      if (move !== null) {
        expect(board[move]).toBe('')
        expect(flipped.includes(move)).toBe(false)
      }
    }
  })

  describe('with Math.random mocked', () => {
    let randomSpy

    afterEach(() => {
      randomSpy.mockRestore()
    })

    it('flipped.length === 1 and forced < RECALL_P returns the true twin', () => {
      const board = Array(PAIRS_CELL_COUNT).fill('')
      const deck = Array(PAIRS_CELL_COUNT).fill('')
      deck[0] = 'robot'
      deck[10] = 'robot' // known twin of held card 0
      deck[1] = 'ghost'
      deck[2] = 'ghost'

      randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0) // forces < RECALL_P branch, and picks first match
      const gameView = { board, pairsDeck: deck, pairsFlipped: [0] }
      const move = computePairsBotMove(gameView, 'X')
      expect(move).toBe(10)
    })

    it('flipped.length === 1 and forced >= RECALL_P returns a legal cell that is not flipped[0]', () => {
      const board = Array(PAIRS_CELL_COUNT).fill('')
      const deck = Array(PAIRS_CELL_COUNT).fill('')
      deck[0] = 'robot'
      deck[10] = 'robot'
      deck[1] = 'ghost'
      deck[2] = 'ghost'

      randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99) // forces >= RECALL_P, and pickRandom picks last
      const gameView = { board, pairsDeck: deck, pairsFlipped: [0] }
      const move = computePairsBotMove(gameView, 'X')
      expect(move).not.toBeNull()
      expect(board[move]).toBe('')
      expect(move).not.toBe(0)
    })
  })

  it('flipped.length === 0 returns some legal, unclaimed, non-flipped index', () => {
    const board = Array(PAIRS_CELL_COUNT).fill('')
    board[0] = 'X'
    board[1] = 'X'
    const deck = randomDeck()
    const gameView = { board, pairsDeck: deck, pairsFlipped: null }
    const move = computePairsBotMove(gameView, 'X')
    expect(move).not.toBeNull()
    expect(board[move]).toBe('')
  })

  it('flipped.length === 2 returns some legal, unclaimed, non-flipped index', () => {
    const board = Array(PAIRS_CELL_COUNT).fill('')
    const deck = randomDeck()
    const gameView = { board, pairsDeck: deck, pairsFlipped: [3, 7] }
    const move = computePairsBotMove(gameView, 'O')
    expect(move).not.toBeNull()
    expect(board[move]).toBe('')
    expect(move).not.toBe(3)
    expect(move).not.toBe(7)
  })

  it('returns null when there are zero legal cells (fully claimed board, flipped = [])', () => {
    const board = Array(PAIRS_CELL_COUNT).fill('X')
    const deck = randomDeck()
    const gameView = { board, pairsDeck: deck, pairsFlipped: null }
    expect(computePairsBotMove(gameView, 'X')).toBeNull()
  })
})
