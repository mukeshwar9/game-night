import { useEffect } from 'react'
import { ref, onValue, update, set as dbSet, push, onDisconnect, runTransaction, serverTimestamp } from 'firebase/database'
import { db } from '../../lib/firebase'
import { presenceHeal } from '../../lib/presenceLogic'

// Publishes this client's presence in a room, one entry per connection
// (src/lib/presenceLogic.js has the node shape and the derived "online"):
//
//   kind 'seat'       2P seat   → games/{id}/presence/{seat}/conns/{pushId}
//   kind 'party'      party seat → games/{id}/players/{uid}/conns/{pushId}
//   kind 'spectator'  watcher   → games/{id}/spectators/{uid}/{pushId}: { name, at }
//
// Each connection's entry is removed by its own onDisconnect, so a second
// tab closing or a dead socket's late onDisconnect can't take a present
// player offline. Seats also keep the legacy `online` flag for old clients:
// set true on connect, false by onDisconnect, and put back by any other
// still-connected tab of the same seat (presenceHeal).
export default function useRoomPresence({ gameId, kind, seat, uid, name }) {
  useEffect(() => {
    if (!db || !kind || !gameId) return
    if (kind === 'seat' ? !seat : !uid) return
    const base = kind === 'seat'
      ? `games/${gameId}/presence/${seat}`
      : kind === 'party' ? `games/${gameId}/players/${uid}` : `games/${gameId}/spectators/${uid}`
    const baseRef = ref(db, base)
    let cancelled = false
    let connKey = null
    let lastRegisterAt = 0

    const connRef = (key) => ref(db, kind === 'spectator' ? `${base}/${key}` : `${base}/conns/${key}`)

    const register = () => {
      const key = push(kind === 'spectator' ? baseRef : ref(db, `${base}/conns`)).key
      connKey = key
      lastRegisterAt = Date.now()
      onDisconnect(connRef(key)).remove().catch(() => {})
      if (kind === 'spectator') {
        dbSet(connRef(key), { name: name || 'PLAYER', at: Date.now() }).catch(() => {})
        return
      }
      onDisconnect(ref(db, `${base}/online`)).set(false).catch(() => {})
      if (kind === 'party') {
        onDisconnect(ref(db, `${base}/offlineAt`)).set(serverTimestamp()).catch(() => {})
        patchPartySeat(seatNode => ({ ...seatNode, online: true, offlineAt: null, conns: { ...(seatNode.conns || {}), [key]: Date.now() } }))
        return
      }
      // back after a LEAVE: the seat is live again
      update(baseRef, { online: true, leftAt: null, [`conns/${key}`]: Date.now() }).catch(() => {})
    }

    // Party seats live inside `players`, which a game switch or a latecomer's
    // ghost eviction rewrites — patch only a seat that still exists, so a
    // presence write never resurrects a partial seat. (Returning null for a
    // missing seat, not undefined, lets a cold cache retry against the server.)
    const patchPartySeat = (fn) => {
      runTransaction(baseRef, cur => (cur && cur.playerId ? fn(cur) : (cur ?? null))).catch(() => {})
    }

    const unsubConnected = onValue(ref(db, '.info/connected'), snap => {
      if (cancelled) return
      if (!snap.val()) { connKey = null; return }
      register()
    })

    // Self-heal (seats only): react to another connection's onDisconnect or
    // an old client's whole-node write on this same seat.
    const unsubSelf = kind === 'spectator' ? null : onValue(baseRef, snap => {
      if (cancelled || !connKey) return
      const node = snap.val()
      // A party seat that no longer exists (switched away / evicted): never
      // resurrect a partial seat from here.
      if (kind === 'party' && !node?.playerId) return
      const heal = presenceHeal(node, connKey)
      if (heal === 'online') {
        if (kind === 'party') patchPartySeat(seatNode => ({ ...seatNode, online: true }))
        else update(baseRef, { online: true }).catch(() => {})
      }
      else if (heal === 'register' && Date.now() - lastRegisterAt > 3000) register()
    })

    return () => {
      cancelled = true
      unsubConnected()
      if (unsubSelf) unsubSelf()
      if (!connKey) return
      const key = connKey
      onDisconnect(connRef(key)).cancel().catch(() => {})
      if (kind === 'spectator') {
        dbSet(connRef(key), null).catch(() => {})
        return
      }
      onDisconnect(ref(db, `${base}/online`)).cancel().catch(() => {})
      // Clean exit (navigation / seat change): drop this connection and clear
      // the legacy flag; any other still-open tab of this seat heals it back.
      if (kind === 'party') {
        onDisconnect(ref(db, `${base}/offlineAt`)).cancel().catch(() => {})
        patchPartySeat(seatNode => {
          const conns = { ...(seatNode.conns || {}) }
          delete conns[key]
          return { ...seatNode, conns, online: false, offlineAt: Date.now() }
        })
        return
      }
      update(baseRef, { [`conns/${key}`]: null, online: false }).catch(() => {})
    }
  }, [gameId, kind, seat, uid, name])
}
