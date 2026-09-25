import { ref, runTransaction } from 'firebase/database'
import { db } from '../firebase'
import { claimAbandonedPatch } from './connectionLogic'

// Claim the current round against an opponent whose room presence is offline
// (real-time games' "OPPONENT LEFT — CLAIM WIN" prompt). The transaction
// re-reads status + presence server-side (claimAbandonedPatch), so a
// last-second return by the opponent can't be clobbered.
//
// @returns {Promise<boolean>} true if this client's claim committed
export async function claimAbandonedRound(gameId, mySymbol) {
  const { committed } = await runTransaction(
    ref(db, `games/${gameId}`),
    cur => claimAbandonedPatch(cur, mySymbol),
  )
  return committed
}
