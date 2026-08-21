// Pure logic for MINE RACE — simultaneous seeded minesweeper duel.
// No Firebase, no React — unit-tested in minesweeperLogic.test.js.
// Spec: docs/prds/mine-race.md
//
// ANTI-LEAK MODEL: the board itself never touches Firebase. Both clients derive
// the IDENTICAL board from the shared `minesSeed`; only revealed-cell COUNTS are
// mirrored (`minesRevealedX/O`). Revealed positions stay client-side — on an
// identical board they are direct hints ("they're deep in the top-right").

export const ROWS = 12
export const COLS = 12
export const CELL_COUNT = ROWS * COLS // 144
export const MINES = 22
export const SAFE_CELLS = CELL_COUNT - MINES // 122

export function indexOf(row, col) {
  return row * COLS + col
}

export function rowColOf(cell) {
  return [Math.floor(cell / COLS), cell % COLS]
}

// All 8 in-bounds neighbors (edge/corner cells get fewer).
export function neighborsOf(cell) {
  const r = Math.floor(cell / COLS)
  const c = cell % COLS
  const out = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const nr = r + dr
      const nc = c + dc
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) out.push(nr * COLS + nc)
    }
  }
  return out
}

// Mulberry32 PRNG — same construction as fibbageLogic.js (private there; this
// module needs a raw stream for mine placement, not a shuffle).
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Mix the game seed with a regeneration attempt into a fresh 32-bit stream
// seed, so attempt N of the same game seed is fully deterministic.
function mixSeed(seed, attempt) {
  let h = ((seed | 0) + Math.imul(attempt, 999983)) | 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return (h ^ (h >>> 16)) >>> 0
}

// Adjacent-mine count for every cell (mines themselves get whatever falls out —
// their counts are never displayed).
export function computeCounts(mines) {
  const counts = Array(CELL_COUNT).fill(0)
  for (let i = 0; i < CELL_COUNT; i++) {
    if (!mines[i]) continue
    for (const n of neighborsOf(i)) counts[n]++
  }
  return counts
}

// Classic zero flood-fill. Returns a NEW Set (input never mutated); mine cells
// are never added — a tapped mine is a death, handled by the caller, and must
// not pollute the safe-cell count.
export function floodReveal(counts, mines, revealed, cell) {
  const out = new Set(revealed instanceof Set ? revealed : (revealed ?? []))
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) return out
  if (mines[cell] || out.has(cell)) return out
  const stack = [cell]
  while (stack.length) {
    const cur = stack.pop()
    if (out.has(cur) || mines[cur]) continue
    out.add(cur)
    if ((counts[cur] ?? 0) === 0) {
      for (const n of neighborsOf(cur)) {
        if (!out.has(n) && !mines[n]) stack.push(n)
      }
    }
  }
  return out
}

// Chording: tapping a revealed number whose flag count matches reveals its
// remaining unrevealed/unflagged neighbors (which may include mines — the
// standard misfire punishment). Unsatisfied (<) and OVERFLAGGED (>) → [].
export function chordTargets(counts, revealed, flags, cell) {
  const revSet = revealed instanceof Set ? revealed : new Set(revealed ?? [])
  const flagSet = flags instanceof Set ? flags : new Set(flags ?? [])
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) return []
  if (!revSet.has(cell)) return []
  const n = counts[cell] ?? 0
  if (n === 0) return []
  const neigh = neighborsOf(cell)
  let flagged = 0
  for (const nb of neigh) {
    if (flagSet.has(nb)) flagged++
  }
  if (flagged !== n) return []
  return neigh.filter(nb => !revSet.has(nb) && !flagSet.has(nb))
}

// Unique revealed-cell count — accepts a Set or an array (deduped).
export function countRevealed(revealed) {
  if (!revealed) return 0
  return revealed instanceof Set ? revealed.size : new Set(revealed).size
}

// Round won when every safe cell is revealed (by construction `revealed` never
// holds a mine — see floodReveal).
export function isComplete(revealed) {
  return countRevealed(revealed) === SAFE_CELLS
}

// Deterministic board per seed: place MINES, compute counts, then pre-flood an
// opening from a seeded zero-cell so both players start revealed (first-click
// safety without per-player boards). If a placement leaves no zero-cell to
// open from, regenerate deterministically (attempt counter mixes into the PRNG
// seed) — with 22 mines on 144 cells this loop effectively always lands on
// attempt 0; the cap is purely defensive so termination is provable.
export function generateBoard(seed) {
  const MAX_ATTEMPTS = 500
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rand = mulberry32(mixSeed(seed, attempt))
    const mines = Array(CELL_COUNT).fill(false)
    let placed = 0
    while (placed < MINES) {
      const idx = Math.floor(rand() * CELL_COUNT)
      if (!mines[idx]) {
        mines[idx] = true
        placed++
      }
    }
    const counts = computeCounts(mines)
    const zeros = []
    for (let i = 0; i < CELL_COUNT; i++) {
      if (!mines[i] && counts[i] === 0) zeros.push(i)
    }
    if (zeros.length === 0) continue
    const openingCell = zeros[Math.floor(rand() * zeros.length)]
    // Opening = the zero-interior of the pre-flooded region (contract: every
    // opening cell is mine-free with count 0). Boundary numbers stay hidden —
    // players uncover them safely with their own first floods.
    const flooded = floodReveal(counts, mines, new Set(), openingCell)
    const opening = [...flooded].filter(c => counts[c] === 0).sort((a, b) => a - b)
    return { mines, counts, opening }
  }
  // Unreachable in practice (see above) — degenerate but terminating fallback.
  const mines = Array(CELL_COUNT).fill(false)
  return { mines, counts: Array(CELL_COUNT).fill(0), opening: [] }
}
