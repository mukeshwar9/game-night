// mancalaLogic.js — pure Kalah(6,4) core. No Firebase, no React.
//
// Slot map (14 slots):
//   pits[0..5]  = X's pits (left→right from X's view)
//   pits[6]     = X's store
//   pits[7..12] = O's pits
//   pits[13]    = O's store
// Sowing runs counterclockwise (increasing index) and SKIPS the opponent's
// store: X skips 13, O skips 6.

export const PIT_COUNT = 14
export const STORE_X = 6
export const STORE_O = 13

export function INITIAL_PITS() {
  return [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]
}

// Firebase may hand back arrays or numeric-keyed objects (normalizeBoard
// precedent). Always returns a 14-element number array.
export function normalizePits(raw) {
  const arr = Array.isArray(raw) ? raw : Object.values(raw ?? {})
  return Array.from({ length: PIT_COUNT }, (_, i) => Number(arr[i]) || 0)
}

export const opposite = i => 12 - i

const isOwnPit = (symbol, i) => (symbol === 'X' ? i >= 0 && i <= 5 : i >= 7 && i <= 12)
const ownStore = symbol => (symbol === 'X' ? STORE_X : STORE_O)
const oppStore = symbol => (symbol === 'X' ? STORE_O : STORE_X)

// ---------------------------------------------------------------------------
// applyMancalaMove — sow + capture + end-sweep in one pure step.
// Returns null when the move is illegal (not your pit / empty pit).
// Else { pits, extraTurn, captured, result }:
//   captured: number of seeds captured into your store this move (0 if none)
//   result:   null while the game continues, else { winner: 'X'|'O'|'draw' }
// ---------------------------------------------------------------------------
export function applyMancalaMove(pits, pit, symbol) {
  if (!Number.isInteger(pit) || pit < 0 || pit >= PIT_COUNT) return null
  if (!isOwnPit(symbol, pit)) return null
  const seeds = pits[pit]
  if (seeds === 0) return null

  const next = [...pits]
  next[pit] = 0

  // Sow counterclockwise, skipping the opponent's store.
  let cursor = pit
  let extraTurn = false
  for (let s = 0; s < seeds; s++) {
    cursor = (cursor + 1) % PIT_COUNT
    if (cursor === oppStore(symbol)) cursor = (cursor + 1) % PIT_COUNT
    next[cursor] += 1
  }

  // Extra turn: last seed landed in your own store.
  let captured = 0
  if (cursor === ownStore(symbol)) {
    extraTurn = true
  } else if (isOwnPit(symbol, cursor) && next[cursor] === 1) {
    // Capture: last seed landed in your OWN pit that was empty, and the
    // opposite pit is non-empty. Empty opposite → no capture.
    const opp = opposite(cursor)
    if (next[opp] > 0) {
      captured = next[opp] + 1
      next[opp] = 0
      next[cursor] = 0
      next[ownStore(symbol)] += captured
    }
  }

  // End check after every move: either side empty at start-of-turn equivalent.
  const xEmpty = next.slice(0, STORE_X).every(n => n === 0)
  const oEmpty = next.slice(STORE_X + 1, STORE_O).every(n => n === 0)
  let result = null
  if (xEmpty || oEmpty) {
    const sweptX = next.slice(0, STORE_X).reduce((a, b) => a + b, 0)
    const sweptO = next.slice(STORE_X + 1, STORE_O).reduce((a, b) => a + b, 0)
    next[STORE_X] += sweptX
    next[STORE_O] += sweptO
    for (let i = 0; i < PIT_COUNT; i++) {
      if (i !== STORE_X && i !== STORE_O) next[i] = 0
    }
    const xs = next[STORE_X]
    const os = next[STORE_O]
    result = { winner: xs > os ? 'X' : os > xs ? 'O' : 'draw', scoreX: xs, scoreO: os }
  }

  return { pits: next, extraTurn, captured, result }
}

// Exported for tests + demo bots: which pits can `symbol` legally play?
export function legalPits(pits, symbol) {
  return [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12].filter(i => isOwnPit(symbol, i) && pits[i] > 0)
}
export const SMOKETEST = 'xyz123'
