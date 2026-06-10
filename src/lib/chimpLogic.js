export const CHIMP_GRID = 25  // 5×5
export const CHIMP_START_LEVEL = 4

export function normalizeChimpLayout(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return Object.keys(raw).map(Number).sort((a, b) => a - b).map(k => raw[k])
}

// Returns an array of `level` unique random cell indices (0–CHIMP_GRID-1).
// Position i in the array = cell for number (i+1).
export function generateChimpLayout(level, gridSize = CHIMP_GRID) {
  const used = new Set()
  const layout = []
  while (layout.length < level) {
    const i = Math.floor(Math.random() * gridSize)
    if (!used.has(i)) { used.add(i); layout.push(i) }
  }
  return layout
}

// Returns { updates, result } or null if invalid.
// cellIndex = the cell the player clicked (0–24)
export function applyChimpMove(game, cellIndex, symbol) {
  const layout = normalizeChimpLayout(game.chimpLayout)
  const progress = game.chimpProgress ?? 0
  const level = game.chimpLevel ?? CHIMP_START_LEVEL
  const opponent = symbol === 'X' ? 'O' : 'X'

  if (layout.length === 0 || cellIndex < 0 || cellIndex >= CHIMP_GRID) return null

  if (layout[progress] !== cellIndex) {
    return { updates: {}, result: { winner: opponent } }
  }

  const newProgress = progress + 1
  if (newProgress === level) {
    return {
      updates: {
        chimpLevel: level + 1,
        chimpLayout: generateChimpLayout(level + 1),
        chimpProgress: 0,
        currentTurn: opponent,
      },
      result: null,
    }
  }

  return { updates: { chimpProgress: newProgress }, result: null }
}
