// Pure logic for WORD HUNT (Boggle duel) — no DOM, no Firebase. Unit-tested in
// wordhuntLogic.test.js.
//
// Both players trace words on an identical seeded 4x4 grid (see generateGrid).
// A word is valid if it's >= MIN_WORD_LENGTH letters, present in the Word Hunt
// dictionary (checked by the caller — see wordhuntDictionary.js, not this file),
// and traceable through 8-directionally-adjacent tiles without reusing a tile
// (findPath). Scoring follows the classic Boggle table (scoreWord/scoreWords).

import { seededShuffle } from './fibbageLogic'

export const GRID_SIZE = 4
export const CELL_COUNT = 16

export const COUNTDOWN_MS = 3_000
export const ROUND_MS = 80_000
export const MATCH_WINS = 3
export const MIN_WORD_LENGTH = 3

// The 16 classic Boggle dice — fixed face distributions, verbatim, do not alter.
// Index 14 ('himnqu') is the only die carrying the Qu face, stored as the single
// character 'q' (rendered as "Qu"; counts as 2 letters for tracing/scoring).
export const BOGGLE_DICE = [
  'aaeegn', 'abbjoo', 'achops', 'affkps', 'aoottw', 'cimotu',
  'deilrx', 'delrvy', 'distty', 'eeghnw', 'eeinsu', 'ehrtvw',
  'eiosst', 'elrtty', 'himnqu', 'hlnnrz',
]

// Row/column <-> flat-index helpers for the 4x4 grid.
export function rowColOf(index) {
  return [Math.floor(index / GRID_SIZE), index % GRID_SIZE]
}

export function indexOf(row, col) {
  return row * GRID_SIZE + col
}

// The up-to-8 orthogonal+diagonal, in-bounds neighbor indices (excludes self).
export function neighborsOf(index) {
  const [row, col] = rowColOf(index)
  const out = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const r = row + dr
      const c = col + dc
      if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) out.push(indexOf(r, c))
    }
  }
  return out
}

// The one and only normalization/dedup-key function — use it everywhere a word
// is compared or stored.
export function canonicalize(word) {
  return String(word ?? '').trim().toLowerCase()
}

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

// DFS path search through the grid — pure grid-geometry, no dictionary
// membership or length checks (callers apply those separately, cheapest-check-
// first). Returns the tile-index path in traversal order, or null.
export function findPath(grid, word) {
  const target = canonicalize(word)
  if (!target) return null
  for (let start = 0; start < CELL_COUNT; start++) {
    const path = dfs(grid, target, start, new Set())
    if (path) return path
  }
  return null
}

function dfs(grid, remaining, index, visited) {
  if (visited.has(index)) return null
  // A 'q' tile consumes exactly 'qu' (2 characters) from `remaining` in one
  // step — a candidate word with 'q' not immediately followed by 'u' simply
  // fails the startsWith check below (correct: the Qu tile can't spell a bare "Q").
  const letters = grid[index] === 'q' ? 'qu' : grid[index]
  if (!remaining.startsWith(letters)) return null
  const rest = remaining.slice(letters.length)
  if (rest.length === 0) return [index] // whole word consumed exactly here
  const nextVisited = new Set(visited)
  nextVisited.add(index)
  for (const neighbor of neighborsOf(index)) {
    const sub = dfs(grid, rest, neighbor, nextVisited)
    if (sub) return [index, ...sub]
  }
  return null
}

// Classic Boggle scoring table, keyed by the letter-length of the word.
// Returns 0 for words shorter than MIN_WORD_LENGTH.
export function scoreWord(word) {
  const len = canonicalize(word).length
  if (len < MIN_WORD_LENGTH) return 0
  if (len <= 4) return 1
  if (len === 5) return 2
  if (len === 6) return 3
  if (len === 7) return 5
  return 11
}

// Sums scoreWord over a list. Assumes the caller has already deduplicated (by
// canonicalize) — this is a tally/reducer, not a dedup step.
export function scoreWords(words) {
  return (words || []).reduce((sum, w) => sum + scoreWord(w), 0)
}
