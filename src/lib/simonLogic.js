export const SIMON_PADS = 4

export function normalizeSimonSequence(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  // Firebase converts arrays to numeric-keyed objects
  return Object.keys(raw).map(Number).sort((a, b) => a - b).map(k => raw[k])
}

// Returns { updates, result } or null if invalid move.
// padIndex = 0–3
// game must have simonSequence, simonProgress
export function applySimonMove(game, padIndex, symbol) {
  if (padIndex < 0 || padIndex >= SIMON_PADS) return null

  const seq = normalizeSimonSequence(game.simonSequence)
  const progress = game.simonProgress ?? 0
  const opponent = symbol === 'X' ? 'O' : 'X'

  if (progress < seq.length) {
    // Replay phase — verify correct pad
    if (padIndex !== seq[progress]) {
      return { updates: {}, result: { winner: opponent } }
    }
    return { updates: { simonProgress: progress + 1 }, result: null }
  }

  // Append phase — add pad, flip turn, reset progress
  return {
    updates: {
      simonSequence: [...seq, padIndex],
      simonProgress: 0,
      currentTurn: opponent,
    },
    result: null,
  }
}
