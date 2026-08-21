import { describe, it, expect } from 'vitest'
import {
  ROWS, COLS, CELL_COUNT, MINES, SAFE_CELLS,
  indexOf, rowColOf, neighborsOf,
  computeCounts, generateBoard,
  floodReveal, chordTargets,
  countRevealed, isComplete,
} from './minesweeperLogic'

// ── fixture helpers ─────────────────────────────────────────────────────────

function blankMines() {
  return Array(CELL_COUNT).fill(false)
}

function minesAt(indices) {
  const m = blankMines()
  for (const i of indices) m[i] = true
  return m
}

function setOf(...items) {
  return new Set(items)
}

describe('constants', () => {
  it('matches the PRD board shape', () => {
    expect(ROWS).toBe(12)
    expect(COLS).toBe(12)
    expect(CELL_COUNT).toBe(144)
    expect(MINES).toBe(22)
    expect(SAFE_CELLS).toBe(122)
    expect(ROWS * COLS).toBe(CELL_COUNT)
  })
})

describe('indexOf / rowColOf', () => {
  it('round-trips every cell', () => {
    for (let i = 0; i < CELL_COUNT; i++) {
      const [r, c] = rowColOf(i)
      expect(indexOf(r, c)).toBe(i)
    }
  })

  it('maps corners correctly', () => {
    expect(rowColOf(0)).toEqual([0, 0])
    expect(rowColOf(COLS - 1)).toEqual([0, COLS - 1])
    expect(rowColOf(CELL_COUNT - 1)).toEqual([ROWS - 1, COLS - 1])
  })
})

describe('neighborsOf', () => {
  it('interior cell has 8 neighbors', () => {
    // r5c5
    expect(neighborsOf(indexOf(5, 5))).toHaveLength(8)
  })

  it('corner cell has 3 neighbors', () => {
    expect(neighborsOf(0)).toEqual([1, COLS, COLS + 1].sort((a, b) => a - b))
  })

  it('edge cell has 5 neighbors', () => {
    // r0c5 — top edge
    const n = neighborsOf(5)
    expect(n).toHaveLength(5)
    for (const i of n) expect(rowColOf(i)[0]).toBeGreaterThanOrEqual(0)
  })

  it('never leaves the board', () => {
    for (let i = 0; i < CELL_COUNT; i++) {
      for (const n of neighborsOf(i)) {
        expect(n).toBeGreaterThanOrEqual(0)
        expect(n).toBeLessThan(CELL_COUNT)
      }
    }
  })
})

describe('computeCounts fixtures', () => {
  it('empty minefield → all counts 0', () => {
    expect(computeCounts(blankMines())).toEqual(Array(CELL_COUNT).fill(0))
  })

  it('single center mine → its 8 neighbors count 1', () => {
    const center = indexOf(5, 5) // 65
    const counts = computeCounts(minesAt([center]))
    for (const n of neighborsOf(center)) expect(counts[n]).toBe(1)
    expect(counts[0]).toBe(0)
    expect(counts[CELL_COUNT - 1]).toBe(0)
  })

  it('corner mine → exactly its 3 neighbors count 1', () => {
    const counts = computeCounts(minesAt([0]))
    expect(counts[1]).toBe(1)
    expect(counts[COLS]).toBe(1)
    expect(counts[COLS + 1]).toBe(1)
    expect(counts[2]).toBe(0)
    expect(counts[COLS + 2]).toBe(0)
  })

  it('edge mine → exactly its 5 neighbors count 1', () => {
    const edge = 5 // r0c5
    const counts = computeCounts(minesAt([edge]))
    for (const n of neighborsOf(edge)) expect(counts[n]).toBe(1)
    expect(counts[7]).toBe(0) // r0c7 — two columns away, untouched
  })

  it('two adjacent mines → shared neighbors count 2, exclusive ones 1', () => {
    const a = indexOf(5, 5) // 65
    const b = indexOf(5, 6) // 66
    const counts = computeCounts(minesAt([a, b]))
    expect(counts[indexOf(4, 6)]).toBe(2) // between them, above
    expect(counts[indexOf(4, 4)]).toBe(1) // only touches a
    expect(counts[indexOf(6, 7)]).toBe(1) // only touches b
  })
})

describe('generateBoard determinism', () => {
  it('same seed → identical mines, counts and opening', () => {
    for (const seed of [0, 1, 42, 999_999]) {
      expect(generateBoard(seed)).toEqual(generateBoard(seed))
    }
  })

  it('different seeds produce different boards', () => {
    const boards = [1, 2, 3, 4, 5].map(s => JSON.stringify(generateBoard(s)))
    expect(new Set(boards).size).toBeGreaterThan(1)
  })

  it('always places exactly MINES mines in a CELL_COUNT array of booleans', () => {
    for (const seed of [0, 1, 2, 7, 42, 999, 123_456_789]) {
      const { mines } = generateBoard(seed)
      expect(mines).toHaveLength(CELL_COUNT)
      expect(mines.filter(Boolean)).toHaveLength(MINES)
      for (const m of mines) expect(typeof m).toBe('boolean')
    }
  })

  it('counts are consistent with the mines it placed', () => {
    for (const seed of [3, 77, 2024]) {
      const { mines, counts } = generateBoard(seed)
      expect(counts).toEqual(computeCounts(mines))
    }
  })

  it('opening is a sorted, unique, mine-free zero-count region equal to a flood from its first cell', () => {
    for (const seed of [1, 2, 3, 42, 999]) {
      const { mines, counts, opening } = generateBoard(seed)
      expect(opening.length).toBeGreaterThanOrEqual(1)
      expect([...opening].sort((a, b) => a - b)).toEqual(opening)
      expect(new Set(opening).size).toBe(opening.length)
      for (const cell of opening) {
        expect(mines[cell]).toBe(false)
        expect(counts[cell]).toBe(0)
      }
      expect(opening).toEqual(
        [...floodReveal(counts, mines, new Set(), opening[0])]
          .filter(c => counts[c] === 0)
          .sort((a, b) => a - b),
      )
    }
  })
})

describe('floodReveal', () => {
  it('whole-board-zero: floods all 144 cells from any cell', () => {
    const mines = blankMines()
    const counts = computeCounts(mines)
    const out = floodReveal(counts, mines, new Set(), indexOf(4, 9))
    expect(out.size).toBe(CELL_COUNT)
    expect(out.has(0)).toBe(true)
    expect(out.has(CELL_COUNT - 1)).toBe(true)
  })

  it('mine wall splits the board: flood stops at the numbered boundary', () => {
    // Full column of mines at col 3 → left region is cols 0-2 (36 cells).
    const wall = []
    for (let r = 0; r < ROWS; r++) wall.push(indexOf(r, 3))
    const mines = minesAt(wall)
    const counts = computeCounts(mines)

    const left = floodReveal(counts, mines, new Set(), 0)
    expect(left.size).toBe(3 * ROWS)
    for (const cell of left) expect(rowColOf(cell)[1]).toBeLessThan(3)

    // Start from a zero cell well clear of the wall (col 8) — a number cell
    // would only reveal itself.
    const right = floodReveal(counts, mines, new Set(), indexOf(6, 8))
    expect(right.size).toBe(CELL_COUNT - 4 * ROWS)
    for (const cell of right) expect(rowColOf(cell)[1]).toBeGreaterThan(2)
  })

  it('single mine: flood reveals everything except the mine (numbered ring included)', () => {
    const mines = minesAt([indexOf(5, 5)])
    const counts = computeCounts(mines)
    const out = floodReveal(counts, mines, new Set(), 0)
    expect(out.size).toBe(CELL_COUNT - 1)
    expect(out.has(indexOf(5, 5))).toBe(false)
  })

  it('never reveals a mine, even when tapped directly', () => {
    const mines = minesAt([40])
    const counts = computeCounts(mines)
    const out = floodReveal(counts, mines, new Set(), 40)
    expect(out.size).toBe(0)
  })

  it('preserves prior reveals, returns a NEW set, never mutates the input', () => {
    const mines = blankMines()
    const counts = computeCounts(mines)
    const base = setOf(10, 20)
    const out = floodReveal(counts, mines, base, 0)
    expect(out.has(10)).toBe(true)
    expect(out.has(20)).toBe(true)
    expect(base.size).toBe(2)
    expect(out).not.toBe(base)
  })

  it('is idempotent on an already-revealed cell', () => {
    const mines = blankMines()
    const counts = computeCounts(mines)
    const once = floodReveal(counts, mines, new Set(), 57)
    const twice = floodReveal(counts, mines, once, 57)
    expect(twice).toEqual(once)
  })

  it('ignores out-of-range / non-integer cells', () => {
    const mines = blankMines()
    const counts = computeCounts(mines)
    expect(floodReveal(counts, mines, new Set(), -1).size).toBe(0)
    expect(floodReveal(counts, mines, new Set(), CELL_COUNT).size).toBe(0)
    expect(floodReveal(counts, mines, new Set(), null).size).toBe(0)
    expect(floodReveal(counts, mines, new Set(), 1.5).size).toBe(0)
  })
})

describe('chordTargets', () => {
  // Fixture: revealed "1" at r1c2 (14), its only adjacent mine flagged at r2c3 (27).
  const mines = minesAt([27])
  const counts = computeCounts(mines)
  const chordCell = 14

  it('satisfied number → reveals remaining unflagged unrevealed neighbors', () => {
    const targets = chordTargets(counts, setOf(chordCell), setOf(27), chordCell)
    expect(targets.sort((a, b) => a - b)).toEqual([1, 2, 3, 13, 15, 25, 26])
  })

  it('unsatisfied number (too few flags) → []', () => {
    expect(chordTargets(counts, setOf(chordCell), new Set(), chordCell)).toEqual([])
  })

  it('overflagged number (too many flags) → []', () => {
    expect(chordTargets(counts, setOf(chordCell), setOf(26, 27), chordCell)).toEqual([])
  })

  it('accepts plain arrays for revealed/flags', () => {
    expect(chordTargets(counts, [chordCell], [27], chordCell).sort((a, b) => a - b))
      .toEqual([1, 2, 3, 13, 15, 25, 26])
  })

  it('excludes already-revealed and flagged cells from targets', () => {
    const revealed = setOf(chordCell, 1, 25)
    const targets = chordTargets(counts, revealed, setOf(27), chordCell)
    expect(targets.sort((a, b) => a - b)).toEqual([2, 3, 13, 15, 26])
  })

  it('unrevealed cell → []', () => {
    expect(chordTargets(counts, new Set(), setOf(27), chordCell)).toEqual([])
  })

  it('revealed zero cell → []', () => {
    const empty = blankMines()
    expect(chordTargets(computeCounts(empty), setOf(50), new Set(), 50)).toEqual([])
  })

  it('out-of-range cell → []', () => {
    expect(chordTargets(counts, setOf(chordCell), setOf(27), 999)).toEqual([])
  })
})

describe('countRevealed', () => {
  it('handles null/undefined', () => {
    expect(countRevealed(null)).toBe(0)
    expect(countRevealed(undefined)).toBe(0)
  })

  it('counts a Set directly', () => {
    expect(countRevealed(setOf(1, 2, 3))).toBe(3)
  })

  it('dedupes arrays', () => {
    expect(countRevealed([1, 1, 2, 3, 3])).toBe(3)
    expect(countRevealed([])).toBe(0)
  })
})

describe('isComplete boundary', () => {
  function anySafeCells(n) {
    const s = new Set()
    for (let i = 0; s.size < n && i < CELL_COUNT; i++) s.add(i)
    return s
  }

  it('empty → false', () => {
    expect(isComplete(new Set())).toBe(false)
  })

  it('121 safe cells → false, 122 → true', () => {
    expect(isComplete(anySafeCells(SAFE_CELLS - 1))).toBe(false)
    expect(isComplete(anySafeCells(SAFE_CELLS))).toBe(true)
  })

  it('strictly equality-based (123 unique impossible here, but over-count is still false)', () => {
    expect(isComplete(anySafeCells(CELL_COUNT))).toBe(false)
  })

  it('accepts arrays via dedupe', () => {
    const arr = Array.from({ length: SAFE_CELLS }, (_, i) => i)
    expect(isComplete(arr)).toBe(true)
    expect(isComplete([...arr, 0])).toBe(true) // dupe collapses back to 122
  })
})
