// Trust model: simonSequence sits in the room node in the clear for the whole game —
// the same honest-client tier as Pairs' deck (see pairsLogic.js). SimonBoard hides
// the pad colours outside the flash, which stops casual peeking, not a player
// reading the database.

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
      // simonMiss lets every client show the wrong press against the real sequence.
      return { updates: { simonDeadline: null, simonMiss: padIndex }, result: { winner: opponent } }
    }
    return { updates: { simonProgress: progress + 1 }, result: null }
  }

  // Append phase — add pad, flip turn, reset progress. Clear the per-turn
  // deadline: the new current player's board will arm a fresh one once their
  // watch-flash (or immediate append, if the sequence was empty) finishes.
  return {
    updates: {
      simonSequence: [...seq, padIndex],
      simonProgress: 0,
      currentTurn: opponent,
      simonDeadline: null,
      simonReplayUsed: null, // the next player gets their own WATCH AGAIN
    },
    result: null,
  }
}

// Flash timing for a sequence of `length` pads. Like the original Simon, the replay
// speeds up as the sequence grows: 10% quicker at 5, 9 and 13 pads (starting value,
// posture B — if median solo runs drop by more than 2 pads, back the steps off), and
// never below 300 ms lit, so it gets harder to hold, not impossible to see.
export const SIMON_FLASH_ON_MS = 480
export const SIMON_FLASH_GAP_MS = 240
export function simonFlashTiming(length) {
  const steps = [5, 9, 13].filter(n => length >= n).length
  const f = 0.9 ** steps
  return { on: Math.max(300, Math.round(SIMON_FLASH_ON_MS * f)), gap: Math.max(150, Math.round(SIMON_FLASH_GAP_MS * f)) }
}
