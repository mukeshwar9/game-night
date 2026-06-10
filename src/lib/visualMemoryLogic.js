export const VM_GRID = 16  // 4×4
export const VM_START_LEVEL = 3

export function normalizeVmArray(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return Object.keys(raw).map(Number).sort((a, b) => a - b).map(k => raw[k])
}

// Returns `level` unique random cell indices from a VM_GRID-cell grid.
export function generateVmPattern(level, gridSize = VM_GRID) {
  const used = new Set()
  const pattern = []
  while (pattern.length < level) {
    const i = Math.floor(Math.random() * gridSize)
    if (!used.has(i)) { used.add(i); pattern.push(i) }
  }
  return pattern
}

// Returns { updates, result } or null if invalid.
// cellIndex = the cell the player clicked (0–15)
export function applyVmMove(game, cellIndex, symbol) {
  const pattern = normalizeVmArray(game.vmPattern)
  const clicked = normalizeVmArray(game.vmClicked)
  const level = game.vmLevel ?? VM_START_LEVEL
  const opponent = symbol === 'X' ? 'O' : 'X'

  if (pattern.length === 0 || cellIndex < 0 || cellIndex >= VM_GRID) return null
  if (clicked.includes(cellIndex)) return null  // already clicked this cell

  if (!pattern.includes(cellIndex)) {
    return { updates: {}, result: { winner: opponent } }
  }

  const newClicked = [...clicked, cellIndex]
  if (newClicked.length === level) {
    return {
      updates: {
        vmLevel: level + 1,
        vmPattern: generateVmPattern(level + 1),
        vmClicked: null,
        currentTurn: opponent,
      },
      result: null,
    }
  }

  return { updates: { vmClicked: newClicked }, result: null }
}
