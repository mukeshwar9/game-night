export const CHIMP_GRID = 25  // 5×5
export const CHIMP_START_LEVEL = 4

export function normalizeChimpLayout(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return Object.keys(raw).map(Number).sort((a, b) => a - b).map(k => raw[k])
}

// Returns an array of `level` unique random cell indices (0–CHIMP_GRID-1), never more
// than the grid holds (a rejection loop here used to spin forever past level 25).
// Position i in the array = cell for number (i+1).
export function generateChimpLayout(level, gridSize = CHIMP_GRID) {
  const cells = Array.from({ length: gridSize }, (_, i) => i)
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cells[i], cells[j]] = [cells[j], cells[i]]
  }
  return cells.slice(0, Math.min(level, gridSize))
}

// How long the numbers stay visible before they hide on their own, even if the player
// hasn't tapped anything yet. Scales with the level so longer sequences still get time.
export function chimpMemorizeMs(level) {
  return (3 + level * 0.5) * 1000
}

// Pure per-player tap evaluation — mirrors ChimpGame.jsx's real rules:
// each player races through their own copy of the shared layout
// independently (no shared `currentTurn`/turn-flip; both play simultaneously).
//
// Returns one of:
//   { valid: false }                              — out-of-range cell or no layout yet
//   { valid: true, correct: false }                — mis-tap: this player loses the round
//   { valid: true, correct: true, newProgress, done } — correct tap; `done` when
//                                                       newProgress reaches `level`
export function evaluateChimpTap({ layout, progress, level, cellIndex }) {
  const board = normalizeChimpLayout(layout)
  if (board.length === 0 || cellIndex < 0 || cellIndex >= CHIMP_GRID) return { valid: false }

  const p = progress ?? 0
  if (board[p] !== cellIndex) return { valid: true, correct: false }

  const newProgress = p + 1
  return { valid: true, correct: true, newProgress, done: newProgress === (level ?? CHIMP_START_LEVEL) }
}

// The Firebase patch to advance both players into the next round once both
// have finished the current level. Pure — the caller is responsible for the
// CAS/atomicity around applying it.
export function buildChimpAdvance(currentLevel) {
  // A full 5×5 is the ceiling: past it, the level repeats with a fresh layout.
  const level = Math.min(currentLevel + 1, CHIMP_GRID)
  return {
    chimpLevel: level,
    chimpLayout: generateChimpLayout(level),
    chimpProgressX: 0,
    chimpProgressO: 0,
    chimpDoneX: false,
    chimpDoneO: false,
  }
}
