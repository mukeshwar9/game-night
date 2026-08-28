import { useEffect } from 'react'
import { ref, onValue, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'

// Generic per-turn deadline watchdog for boardless memory-duel games (Simon,
// Visual Memory) whose board component writes directly to Firebase — these
// games run through Game.jsx's generic applyMove path and have no dedicated
// page, so this is the only place that can enforce an idle-player timeout.
//
// `deadlineField` is an epoch-ms timestamp at `games/{gameId}/{deadlineField}`
// armed by the active player's own client once it's genuinely their move (see
// SimonBoard/VisualMemoryBoard). Any connected client — either player, or a
// spectator — may be the one to commit the forfeit transaction; the CAS on
// the deadline field + status inside the transaction makes double-firing safe.
export default function useTurnDeadlineEnforcer(gameId, gameType, deadlineField) {
  useEffect(() => {
    if (!gameId) return

    let deadline = null
    const deadlineRef = ref(db, `games/${gameId}/${deadlineField}`)
    const unsub = onValue(deadlineRef, snap => { deadline = snap.val() ?? null })

    const enforce = () => {
      if (!deadline || Date.now() < deadline) return
      runTransaction(ref(db, `games/${gameId}`), cur => {
        if (!cur || cur.status !== 'playing' || cur.gameType !== gameType) return cur
        const cd = cur[deadlineField]
        if (!cd || Date.now() < cd) return cur
        const loser = cur.currentTurn
        if (loser !== 'X' && loser !== 'O') return cur
        const winner = loser === 'X' ? 'O' : 'X'
        return {
          ...cur,
          status: 'finished',
          winner,
          scores: { ...(cur.scores || {}), [winner]: (cur.scores?.[winner] || 0) + 1 },
          [deadlineField]: null,
          lastActivityAt: Date.now(),
        }
      }).catch(() => {})
    }

    const tick = setInterval(enforce, 1000)
    return () => { unsub(); clearInterval(tick) }
  }, [gameId, gameType, deadlineField])
}
