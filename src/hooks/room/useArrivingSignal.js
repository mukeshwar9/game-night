import { useEffect } from 'react'
import { ref, set as dbSet, remove, onDisconnect, serverTimestamp } from 'firebase/database'
import { db } from '../../lib/firebase'
import { getPlayerId } from '../../lib/playerId'

// How often the stamp is refreshed while the join screen stays open. A host
// who switches the game in the waiting room clears the room's per-match keys
// (arriving is one), so a still-open invite re-announces itself.
const REFRESH_MS = 45_000

// "Someone opened your link": while `active` (this visitor is on the invite /
// join screen of room `gameId`), publish `games/{id}/arriving/{myUid}` with the
// server time. It carries nothing else — no name, no look — so the host only
// learns that a person is on the way. The stamp is removed when the visitor
// joins or leaves the screen, and by onDisconnect if the tab simply closes.
export default function useArrivingSignal(gameId, active) {
  useEffect(() => {
    if (!db || !gameId || !active) return undefined
    const uid = getPlayerId()
    if (!uid) return undefined
    const stamp = ref(db, `games/${gameId}/arriving/${uid}`)
    let cancelled = false
    const announce = () => {
      if (cancelled) return
      dbSet(stamp, serverTimestamp()).catch(() => {})
    }
    onDisconnect(stamp).remove().catch(() => {})
    announce()
    const timer = setInterval(announce, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
      onDisconnect(stamp).cancel().catch(() => {})
      remove(stamp).catch(() => {})
    }
  }, [gameId, active])
}
