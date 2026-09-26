// Word Hunt's seeded grid, split from wordhuntLogic.js so the game registry
// (games.js, in the entry chunk) can deal a fresh grid without pulling the
// word lists wordhuntLogic imports into the first download.

import { seededShuffle } from './fibbageLogic'

export const GRID_SIZE = 4
export const CELL_COUNT = 16

// The 16 classic Boggle dice — fixed face distributions, verbatim, do not alter.
// Index 14 ('himnqu') is the only die carrying the Qu face, stored as the single
// character 'q' (rendered as "Qu"; counts as 2 letters for tracing/scoring).
export const BOGGLE_DICE = [
  'aaeegn', 'abbjoo', 'achops', 'affkps', 'aoottw', 'cimotu',
  'deilrx', 'delrvy', 'distty', 'eeghnw', 'eeinsu', 'ehrtvw',
  'eiosst', 'elrtty', 'himnqu', 'hlnnrz',
]

// Deterministic 16-char grid string from a single integer seed: same seed =>
// byte-identical grid, forever. Both random draws (die-to-cell shuffle, and the
// per-die face pick) reuse the single exported seededShuffle from
// fibbageLogic.js — no new PRNG is introduced here.
export function generateGrid(seed) {
  const diceOrder = seededShuffle(BOGGLE_DICE, seed) // 16 dice, shuffled; diceOrder[i] -> cell i
  const cells = new Array(CELL_COUNT)
  for (let i = 0; i < CELL_COUNT; i++) {
    const die = diceOrder[i]
    // Derive a per-cell seed so each cell's face pick is independent yet fully
    // reproducible from the single top-level `seed`. 104729 is just a
    // decorrelating prime offset (no cryptographic significance).
    const faceOrder = seededShuffle([0, 1, 2, 3, 4, 5], seed + i * 104729 + 1)
    const face = faceOrder[0]
    cells[i] = die[face]
  }
  return cells.join('')
}
