import { useEffect } from 'react'
import { ref, onValue, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { getPlayerId } from '../lib/playerId'
import useServerClock, { getServerNow } from './useServerClock'

// Generic per-turn deadline watchdog for boardless memory-duel games (Simon,
// Visual Memory) whose board component writes directly to Firebase — these
// games run through Game.jsx's generic applyMove path and have no dedicated
// page, so this is the only place that can enforce an idle-player timeout.
//
// `deadlineField` is an epoch-ms timestamp at `games/{gameId}/{deadlineField}`
// armed by the active player's own client once it's genuinely their move (see
// SimonBoard/VisualMemoryBoard). Only a SEATED player (X or O) may commit the
// forfeit transaction — a spectator's client never judges a match — and the
// CAS on the deadline field + status inside the transaction makes double-firing
// safe. Every comparison runs on the server-corrected clock (useServerClock),
// so a phone with a skewed clock can't end someone's turn early or late.
export default function useTurnDeadlineEnforcer(gameId, gameType, deadlineField) {
  // Keeps the shared `.info/serverTimeOffset` subscription alive while mounted
  // so getServerNow() below is corrected; no re-render ticking needed.
  useServerClock()

  useEffect(() => {
    if (!gameId) return

    const myId = getPlayerId()
    let deadline = null
    let seated = false
    const deadlineRef = ref(db, `games/${gameId}/${deadlineField}`)
    const unsub = onValue(deadlineRef, snap => { deadline = snap.val() ?? null })
    const unsubPlayers = onValue(ref(db, `games/${gameId}/players`), snap => {
      const players = snap.val() || {}
      seated = !!myId && (players.X?.playerId === myId || players.O?.playerId === myId)
    })

    const enforce = () => {
      if (!seated || !deadline || getServerNow() < deadline) return
      runTransaction(ref(db, `games/${gameId}`), cur => {
        if (!cur || cur.status !== 'playing' || cur.gameType !== gameType) return cur
        // Re-check the seat on the live node: spectators never enforce.
        if (cur.players?.X?.playerId !== myId && cur.players?.O?.playerId !== myId) return
        const cd = cur[deadlineField]
        if (!cd || getServerNow() < cd) return cur
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
    return () => { unsub(); unsubPlayers(); clearInterval(tick) }
  }, [gameId, gameType, deadlineField])
}
