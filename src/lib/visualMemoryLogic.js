// Trust model: the pattern (vmPattern) sits in the room node in the clear, readable by
// any signed-in client for the whole turn — the same honest-client tier as Pairs'
// deck (see pairsLogic.js). The reveal timing and the no-replay-on-reload guard in
// VisualMemoryBoard stop casual peeking, not a player reading the database.

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

// ── Simultaneous duel (VisualMemoryGame) ──
// Both players get the SAME pattern at the same moment (server-clock reveal) and
// recall it on their own boards; the level resolves through resolveLevelRace once
// both have cleared or slipped. Replaces the turn-based duel where the waiting
// player stared at a dark grid for the whole of the other player's turn.

// How long each player has to recall after the reveal ends; whoever has not finished
// by then is counted as a slip with no wrong cell (-1).
export const VM_RECALL_MS = 30000

// One tap on my own board. Returns { valid: false } for a repeat or out-of-range tap,
// { valid: true, correct: false } for a wrong tile, or { valid: true, correct: true,
// clicked, done } for a right one.
export function evaluateVmDuelTap({ pattern, clicked, level, cell }) {
  const pat = normalizeVmArray(pattern)
  const got = normalizeVmArray(clicked)
  if (!pat.length || cell < 0 || cell >= vmCellCount(level) || got.includes(cell)) return { valid: false }
  if (!pat.includes(cell)) return { valid: true, correct: false }
  const next = [...got, cell]
  return { valid: true, correct: true, clicked: next, done: next.length === pat.length }
}

// Patch for the next level (both cleared) or a replay of this one (dead-even double slip).
export function buildVmDuelLevel(level, startAt) {
  return {
    vmLevel: level,
    vmPattern: generateVmPattern(level),
    vmClickedX: null, vmClickedO: null,
    vmDoneX: false, vmDoneO: false,
    vmFailX: null, vmFailO: null,
    vmRoundStartedAt: startAt,
  }
}
