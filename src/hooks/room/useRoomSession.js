import { useEffect, useRef, useState } from 'react'
import { ref, onValue, update, get, runTransaction, onDisconnect, remove, set as dbSet } from 'firebase/database'
import { toast } from 'sonner'
import { db, configError } from '../../lib/firebase'
import { getGameConfig } from '../../lib/games'
import { getPlayerId } from '../../lib/playerId'
import { defaultAvatarForId } from '../../lib/avatars'
import { recordRoom } from '../../lib/profile'

const GAME_TTL_MS = 24 * 60 * 60 * 1000

// Room session for /game/:gameId — joins the room (seat claim or reclaim for
// 2P rooms, uid-keyed join for party rooms), subscribes to games/{gameId},
// and publishes presence. Returns the live `game` snapshot plus this client's
// seat: `mySymbol` (ref) is the source of truth read inside effects/handlers/
// async callbacks; `mySeat` (state) mirrors it for reads during render.
export default function useRoomSession(gameId) {
  const [game, setGame] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [errorGameType, setErrorGameType] = useState(null)
  const [opponentOnline, setOpponentOnline] = useState(true)
  const [needName, setNeedName] = useState(false)
  const [nameVersion, setNameVersion] = useState(0)
  // Every seat write goes through assignSeat() to keep the ref and the state
  // in lockstep. All writes happen synchronously within the init() async flow
  // in the effect below, before that same flow's first setGame — so a render
  // can never observe `game` populated while `mySeat` is still stale.
  const mySymbol = useRef(null)
  const [mySeat, setMySeat] = useState(null)
  const assignSeat = (s) => { mySymbol.current = s; setMySeat(s) }
  const nPlayerCleanup = useRef(null)
  const spectatorToastShown = useRef(false)

  // Firebase init: join room, set up listeners, set up presence
  useEffect(() => {
    if (configError || !db) {
      // configError/db are module-level constants set once at import time
      // (see src/lib/firebase.js) — this is a one-time sync of that static
      // condition into state on mount, not a reactive cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(configError || 'Firebase is not configured.')
      setLoading(false)
      return
    }

    const playerName = localStorage.getItem('playerName')
    if (!playerName) {
      setNeedName(true)
      setLoading(false)
      return
    }
    const playerAvatar = localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId())

    const gameRef = ref(db, `games/${gameId}`)
    const publicListingRef = ref(db, `matchmaking/${gameId}`)
    let cancelled = false
    let unsubGame = null
    let unsubPresence = null
    let unsubOpPresence = null

    const init = async () => {
      let snap
      try { snap = await get(gameRef) }
      catch {
        if (!cancelled) { setError('CONNECTION ERROR. CHECK YOUR NETWORK.'); setLoading(false) }
        return
      }

      if (cancelled) return

      if (!snap.exists()) {
        setError('GAME NOT FOUND — CODE MAY BE WRONG OR GAME HAS EXPIRED.')
        setLoading(false)
        return
      }

      const data = snap.val()

      if (data.visibility === 'public' && (data.status !== 'waiting' || data.players?.O)) remove(publicListingRef).catch(() => {})

      const lastActive = data.lastActivityAt ?? data.createdAt
      if (lastActive && Date.now() - lastActive > GAME_TTL_MS) {
        setErrorGameType(data.gameType || null)
        setError('THIS GAME HAS EXPIRED. CREATE A NEW ONE!')
        setLoading(false)
        return
      }

      const cfgData = getGameConfig(data.gameType)
      if (cfgData.nPlayer) {
        const myId = getPlayerId()
        let amPlayer = !!data.players?.[myId]
        if (amPlayer) {
          try { await update(ref(db, `games/${gameId}/players/${myId}`), { name: playerName, avatar: playerAvatar }) } catch { /* ignore */ }
        } else if (data.status === 'waiting' && Object.keys(data.players || {}).length < (cfgData.maxPlayers || 8)) {
          try {
            const { committed } = await runTransaction(
              ref(db, `games/${gameId}/players/${myId}`),
              cur => { if (cur) return; return { name: playerName, joinedAt: Date.now(), playerId: myId, online: true, avatar: playerAvatar } }
            )
            amPlayer = committed
          } catch { amPlayer = false }
        }
        if (cancelled) return
        setLoading(false)
        if (amPlayer) recordRoom({ id: gameId, gameType: data.gameType })
        unsubGame = onValue(gameRef, snap => { if (!cancelled && snap.exists()) setGame(snap.val()) })
        if (amPlayer) {
          const presRef = ref(db, `games/${gameId}/players/${myId}/online`)
          unsubPresence = onValue(ref(db, '.info/connected'), snap => {
            if (cancelled || !snap.val()) return
            onDisconnect(presRef).set(false)
            dbSet(presRef, true)
          })
          nPlayerCleanup.current = myId
        }
        return
      }

      const stored = sessionStorage.getItem(`game-${gameId}`)

      if (stored && JSON.parse(stored).symbol) {
        // 1. Valid sessionStorage record
        assignSeat(JSON.parse(stored).symbol)
      } else {
        // 2. Try playerId reclaim
        const myId = getPlayerId()
        if (data.players?.X?.playerId === myId) {
          assignSeat('X')
          sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: 'X', name: playerName }))
          try { await update(ref(db, `games/${gameId}/players/X`), { name: playerName, avatar: playerAvatar }) } catch { /* ignore */ }
        } else if (data.players?.O?.playerId === myId) {
          assignSeat('O')
          sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: 'O', name: playerName }))
          try { await update(ref(db, `games/${gameId}/players/O`), { name: playerName, avatar: playerAvatar }) } catch { /* ignore */ }
        } else if (!data.players?.O) {
          // 3. Claim O slot via transaction
          try {
            const { committed } = await runTransaction(
              ref(db, `games/${gameId}/players/O`),
              current => {
                if (current !== null) return
                return { name: playerName, joinedAt: Date.now(), playerId: getPlayerId(), avatar: playerAvatar }
              }
            )
            if (committed) {
              assignSeat('O')
              sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: 'O', name: playerName }))
              // Lobby rooms (challenge-created, `lobby: true`) stay 'waiting'
              // when the second seat fills — either player picks the game and
              // taps START from WaitingRoom instead of auto-playing.
              const joinUpdates = data.lobby
                ? { lastActivityAt: Date.now() }
                : { status: 'playing' }
              if (!data.lobby && data.gameType === 'hangwoman') {
                joinUpdates['round/setter'] = 'X'
                joinUpdates['round/phase'] = 'setting'
                joinUpdates['round/wrongCount'] = 0
              }
              await update(gameRef, joinUpdates)
              if (data.visibility === 'public') remove(publicListingRef).catch(() => {})
            } else {
              assignSeat(null)
              sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: null }))
              // We lost the race for O — someone else's write committed first.
              // Mark the generic full-room notice as already shown so it doesn't
              // also fire once `game` reflects both seats filled.
              spectatorToastShown.current = true
              toast("SEAT TAKEN — YOU'RE SPECTATING")
            }
          } catch { assignSeat(null) }
        } else {
          // 4. Spectator
          assignSeat(null)
        }
      }

      if (cancelled) return
      setLoading(false)
      if (mySymbol.current) recordRoom({ id: gameId, gameType: data.gameType })

      unsubGame = onValue(gameRef, snap => {
        if (!cancelled && snap.exists()) setGame(snap.val())
      })

      // Presence — players only, not spectators
      if (mySymbol.current) {
        const presRef = ref(db, `games/${gameId}/presence/${mySymbol.current}`)

        unsubPresence = onValue(ref(db, '.info/connected'), snap => {
          if (cancelled || !snap.val()) return
          onDisconnect(presRef).set({ online: false })
          dbSet(presRef, { online: true })
        })

        const opSym = mySymbol.current === 'X' ? 'O' : 'X'
        unsubOpPresence = onValue(ref(db, `games/${gameId}/presence/${opSym}`), snap => {
          if (cancelled) return
          const d = snap.val()
          setOpponentOnline(!d || d.online !== false)
        })
      }
    }

    init()

    return () => {
      cancelled = true
      if (unsubGame) unsubGame()
      if (unsubPresence) unsubPresence()
      if (unsubOpPresence) unsubOpPresence()
      // Mark offline on clean unmount (tab navigation)
      if (nPlayerCleanup.current && db) {
        const presRef = ref(db, `games/${gameId}/players/${nPlayerCleanup.current}/online`)
        onDisconnect(presRef).cancel().catch(() => {})
        dbSet(presRef, false).catch(() => {})
      } else if (mySymbol.current && db) {
        const presRef = ref(db, `games/${gameId}/presence/${mySymbol.current}`)
        onDisconnect(presRef).cancel().catch(() => {})
        dbSet(presRef, { online: false }).catch(() => {})
      }
    }
  }, [gameId, nameVersion])

  // One-time spectator notice — fires only once, when a full 2-seat room
  // resolves us to a spectator (never for the never-seated-but-empty-room case).
  useEffect(() => {
    if (!game || spectatorToastShown.current) return
    if (!mySymbol.current && game.players?.X && game.players?.O) {
      spectatorToastShown.current = true
      toast("ROOM'S FULL — YOU'RE SPECTATING")
    }
  }, [game])

  // Feature A — the invited player typed a name: store it and re-run init.
  const joinWithName = (name) => {
    localStorage.setItem('playerName', name)
    setNeedName(false)
    setLoading(true)
    setNameVersion(v => v + 1)
  }

  return { game, loading, error, errorGameType, needName, joinWithName, opponentOnline, mySeat, mySymbol }
}
