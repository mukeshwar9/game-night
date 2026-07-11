import { describe, it, expect } from 'vitest'
import { seededShuffle } from './fibbageLogic'
import {
  BOGGLE_DICE, GRID_SIZE, CELL_COUNT,
  generateGrid, rowColOf, indexOf, neighborsOf,
  canonicalize, findPath, scoreWord, scoreWords,
} from './wordhuntLogic'

// NOTE: this file must never import wordhuntDictionary.js (the lazy loader
// that fetches the huge public/wordhunt-dict.txt word list) — it tests pure
// grid/path/scoring logic only.

// ── helpers to build small hand-authored test grids ────────────────────────

function buildGrid(overrides) {
  const letters = Array(CELL_COUNT).fill('x')
  for (const [idx, letter] of Object.entries(overrides)) {
    letters[Number(idx)] = letter
  }
  return letters.join('')
}

describe('generateGrid', () => {
  it('is deterministic for the same seed', () => {
    expect(generateGrid(42)).toBe(generateGrid(42))
    expect(generateGrid(123456)).toBe(generateGrid(123456))
  })

  it('differs across at least one of several seed pairs', () => {
    const seeds = [1, 2, 3, 4, 5]
    const grids = seeds.map(s => generateGrid(s))
    const allSame = grids.every(g => g === grids[0])
    expect(allSame).toBe(false)
  })

  it('always outputs exactly 16 characters', () => {
    for (const seed of [0, 1, 999, 1_000_000]) {
      expect(generateGrid(seed).length).toBe(CELL_COUNT)
    }
  })

  it('every character is a lowercase letter (a-z)', () => {
    for (const seed of [7, 88, 4242]) {
      const grid = generateGrid(seed)
      for (const ch of grid) {
        expect(/^[a-z]$/.test(ch)).toBe(true)
      }
    }
  })

  it('uses each of the 16 BOGGLE_DICE exactly once (dice coverage)', () => {
    for (const seed of [1, 2, 3, 100]) {
      const diceOrder = seededShuffle(BOGGLE_DICE, seed)
      expect(diceOrder.length).toBe(BOGGLE_DICE.length)
      expect([...diceOrder].sort()).toEqual([...BOGGLE_DICE].sort())
    }
  })

  it('exactly one cell is produced by the himnqu die, and its letter is one of h,i,m,n,q,u', () => {
    for (const seed of [1, 2, 3, 100]) {
      const diceOrder = seededShuffle(BOGGLE_DICE, seed)
      const quCellIndex = diceOrder.indexOf('himnqu')
      expect(quCellIndex).toBeGreaterThanOrEqual(0)
      // only one die is 'himnqu'
      expect(diceOrder.filter(d => d === 'himnqu').length).toBe(1)

      const grid = generateGrid(seed)
      expect('himnqu'.includes(grid[quCellIndex])).toBe(true)
    }
  })
})

describe('rowColOf / indexOf', () => {
  it('round-trips', () => {
    for (let i = 0; i < CELL_COUNT; i++) {
      const [r, c] = rowColOf(i)
      expect(indexOf(r, c)).toBe(i)
    }
  })
})

describe('neighborsOf', () => {
  it('corner cell (0) has exactly 3 neighbors', () => {
    expect(neighborsOf(0).length).toBe(3)
  })

  it('edge, non-corner cell (1) has exactly 5 neighbors', () => {
    expect(neighborsOf(1).length).toBe(5)
  })

  it('interior cell (5) has exactly 8 neighbors', () => {
    expect(neighborsOf(5).length).toBe(8)
  })

  it('never includes the input index itself', () => {
    for (let i = 0; i < CELL_COUNT; i++) {
      expect(neighborsOf(i).includes(i)).toBe(false)
    }
  })

  it('GRID_SIZE is 4', () => {
    expect(GRID_SIZE).toBe(4)
  })
})

describe('findPath', () => {
  it('finds a simple adjacent word', () => {
    // 0='c', 1='a', 2='t' — all in row 0, mutually adjacent in sequence
    const grid = buildGrid({ 0: 'c', 1: 'a', 2: 't' })
    const path = findPath(grid, 'cat')
    expect(path).not.toBeNull()
    // decodes back to "cat" and each consecutive pair is adjacent
    const word = path.map(i => grid[i]).join('')
    expect(word).toBe('cat')
    for (let i = 0; i < path.length - 1; i++) {
      expect(neighborsOf(path[i])).toContain(path[i + 1])
    }
  })

  it('returns null when the letters do not appear in the grid at all', () => {
    const grid = buildGrid({ 0: 'c', 1: 'a', 2: 't' })
    expect(findPath(grid, 'dog')).toBeNull()
  })

  it('returns null when letters exist but are never adjacent in the required order', () => {
    // c at 0, a at 2 (not a neighbor of 0 — same row, 2 cols apart), t at 3
    const grid = buildGrid({ 0: 'c', 2: 'a', 3: 't' })
    expect(findPath(grid, 'cat')).toBeNull()
  })

  it('does not allow reusing a tile', () => {
    // a=0, b=1 (adjacent). Every other neighbor of 1 is 'x', so "aba" would
    // require revisiting tile 0 — must fail.
    const grid = buildGrid({ 0: 'a', 1: 'b' })
    expect(findPath(grid, 'aba')).toBeNull()
  })

  it('qu tile consumes 2 characters in a single step', () => {
    // 0='q', 1='i', 2='e', 3='t' — chain spells "qu"+"i"+"e"+"t" = "quiet"
    const grid = buildGrid({ 0: 'q', 1: 'i', 2: 'e', 3: 't' })
    const path = findPath(grid, 'quiet')
    expect(path).not.toBeNull()
    expect(path).toEqual([0, 1, 2, 3])
    // path length (4 tiles) is less than the word length (5 letters)
    expect(path.length).toBeLessThan('quiet'.length)
  })

  it('honors 8-direction (diagonal) adjacency', () => {
    // c=0 (row0,col0), a=5 (row1,col1 — diagonal neighbor of 0),
    // t=10 (row2,col2 — diagonal neighbor of 5). No orthogonal path exists.
    const grid = buildGrid({ 0: 'c', 5: 'a', 10: 't' })
    expect(neighborsOf(0)).toContain(5)
    expect(neighborsOf(5)).toContain(10)
    const path = findPath(grid, 'cat')
    expect(path).toEqual([0, 5, 10])
  })

  it('returns null for empty/whitespace input', () => {
    const grid = buildGrid({ 0: 'c', 1: 'a', 2: 't' })
    expect(findPath(grid, '')).toBeNull()
    expect(findPath(grid, '   ')).toBeNull()
  })
})

describe('scoreWord', () => {
  it('follows the classic Boggle table boundaries', () => {
    expect(scoreWord('ab')).toBe(0)          // length 2
    expect(scoreWord('abc')).toBe(1)         // length 3
    expect(scoreWord('abcd')).toBe(1)        // length 4
    expect(scoreWord('abcde')).toBe(2)       // length 5
    expect(scoreWord('abcdef')).toBe(3)      // length 6
    expect(scoreWord('abcdefg')).toBe(5)     // length 7
    expect(scoreWord('abcdefgh')).toBe(11)   // length 8
    expect(scoreWord('abcdefghi')).toBe(11)  // length 9 — still 8+ bucket
  })
})

describe('scoreWords', () => {
  it('sums correctly over a mixed-length list', () => {
    // cat(1) + house(2) + wonders(5) = 8
    expect(scoreWords(['cat', 'house', 'wonders'])).toBe(8)
  })

  it('returns 0 for an empty list', () => {
    expect(scoreWords([])).toBe(0)
    expect(scoreWords(undefined)).toBe(0)
  })
})

describe('canonicalize', () => {
  it('trims whitespace and lowercases', () => {
    expect(canonicalize('  CaT  ')).toBe('cat')
  })

  it('handles undefined/null', () => {
    expect(canonicalize(undefined)).toBe('')
    expect(canonicalize(null)).toBe('')
  })
})
