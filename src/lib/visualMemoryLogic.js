export const VM_START_LEVEL = 3
// Largest grid the board ever draws (8×8). Kept for callers that need an upper bound.
export const VM_MAX_SIDE = 8
export const VM_GRID = VM_MAX_SIDE * VM_MAX_SIDE

// Grid side for a level: the board grows as the pattern grows, so a level never lights
// more than ~40% of the tiles (at 16 lit tiles on a fixed 4×4 the "pattern" was the
// whole board, and level 17 could not be generated at all).
export function vmGridSide(level) {
  if (level <= 6) return 4
  if (level <= 10) return 5
  if (level <= 15) return 6
  if (level <= 21) return 7
  return VM_MAX_SIDE
}

export function vmCellCount(level) {
  const side = vmGridSide(level)
  return side * side
}

// Memorize window: longer patterns get a little more time to take in.
export function vmRevealMs(level) {
  return Math.min(4000, 1400 + level * 150)
}

// Both players play every level once: the level only goes up after the second clear of
// a pair of turns, so the player who moves second never faces a harder pattern than the
// one who moved first. `clears` counts completed turns in the round (0-based before the
// first clear).
export function vmLevelForClears(clears) {
  return VM_START_LEVEL + Math.floor(clears / 2)
}

export function normalizeVmArray(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return Object.keys(raw).map(Number).sort((a, b) => a - b).map(k => raw[k])
}

// Returns `level` unique random cell indices from a `gridSize`-cell grid (never more
// than the grid holds, so it always terminates).
export function generateVmPattern(level, gridSize = vmCellCount(level)) {
  const cells = Array.from({ length: gridSize }, (_, i) => i)
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cells[i], cells[j]] = [cells[j], cells[i]]
  }
  return cells.slice(0, Math.min(level, gridSize))
}

// Returns { updates, result } or null if invalid.
// cellIndex = the cell the player clicked, in the current level's grid.
export function applyVmMove(game, cellIndex, symbol) {
  const pattern = normalizeVmArray(game.vmPattern)
  const clicked = normalizeVmArray(game.vmClicked)
  const level = game.vmLevel ?? VM_START_LEVEL
  const opponent = symbol === 'X' ? 'O' : 'X'

  if (pattern.length === 0 || cellIndex < 0 || cellIndex >= vmCellCount(level)) return null
  if (clicked.includes(cellIndex)) return null  // already clicked this cell

  if (!pattern.includes(cellIndex)) {
    // vmMiss lets every client show which tile was wrong next to the real pattern.
    return { updates: { vmDeadline: null, vmMiss: cellIndex }, result: { winner: opponent } }
  }

  const newClicked = [...clicked, cellIndex]
  if (newClicked.length === pattern.length) {
    // Rooms created before vmClears existed only know their level; start them level-aligned.
    const clears = (game.vmClears ?? (level - VM_START_LEVEL) * 2) + 1
    const nextLevel = vmLevelForClears(clears)
    return {
      updates: {
        vmLevel: nextLevel,
        vmClears: clears,
        vmPattern: generateVmPattern(nextLevel),
        vmClicked: null,
        currentTurn: opponent,
        vmDeadline: null,
      },
      result: null,
    }
  }

  return { updates: { vmClicked: newClicked }, result: null }
}
