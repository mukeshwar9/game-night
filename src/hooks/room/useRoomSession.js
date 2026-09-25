import { useEffect, useRef, useState } from 'react'
import { ref, onValue, update, get, runTransaction, remove } from 'firebase/database'
import { toast } from 'sonner'
import { db, configError } from '../../lib/firebase'
import { getGameConfig } from '../../lib/games'
import { getPlayerId } from '../../lib/playerId'
import { defaultAvatarForId } from '../../lib/avatars'
import { recordRoom } from '../../lib/profile'
import { guestName, isGuestStyleName, saveDisplayName } from '../../lib/social'
import { isListableRoom, listingHost, removePublicListing, republishPublicRoom } from '../../lib/matchmaking'
import { isSeatOnline, seatLeft } from '../../lib/presenceLogic'
import { applyPartyJoin, inviteSummary, openSeat, partyJoinPlan } from '../../lib/roomLogic'
import { canTakeSeat, normalizeQueue } from '../../lib/nightLogic'
import useDbConnected from '../useDbConnected'
import useRoomPresence from './useRoomPresence'
import { buildSwitchUpdates } from './roomUpdates'

const GAME_TTL_MS = 24 * 60 * 60 * 1000

function readName() {
  try { return localStorage.getItem('playerName') || '' } catch { return '' }
}

function readAvatar() {
  try { return localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId()) } catch { return defaultAvatarForId(getPlayerId()) }
}

function readStoredSeat(gameId) {
  try { return JSON.parse(sessionStorage.getItem(`game-${gameId}`) || 'null') } catch { return null }
}

// The 2P room patch once the second seat fills: non-lobby rooms start
// straight away (Hangwoman also arms its first round); lobby rooms
// (challenge-created, `lobby: true`) stay 'waiting' for START.
function secondSeatUpdates(data) {
  if (data.lobby) return { lastActivityAt: Date.now() }
  const updates = { status: 'playing', lastActivityAt: Date.now() }
  if (data.gameType === 'hangwoman') {
    updates['round/setter'] = 'X'
    updates['round/phase'] = 'setting'
    updates['round/wrongCount'] = 0
  }
  return updates
}

// Room session for /game/:gameId — joins the room (seat claim or reclaim for
// 2P rooms, uid-keyed join for party rooms), subscribes to games/{gameId},
// and publishes presence. Returns the live `game` snapshot plus this client's
// seat: `mySymbol` (ref) is the source of truth read inside effects/handlers/
// async callbacks; `mySeat` (state) mirrors it for reads during render.
//
// A visitor who isn't seated yet and still has a placeholder name gets the
// invite screen first (`needName` + `invite`, a summary of the room). Party
// latecomers are seated whenever the room is back in its lobby; 2P spectators
// get `takeSeat` when a seat frees up there.
export default function useRoomSession(gameId) {
  const [game, setGame] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [errorGameType, setErrorGameType] = useState(null)
  const [needName, setNeedName] = useState(false)
  const [invite, setInvite] = useState(null)
  const [nameVersion, setNameVersion] = useState(0)
  // Set once the visitor answers the invite screen, so a kept placeholder
  // name doesn't bring the prompt back on the re-run.
  const nameChosen = useRef(false)
  // Every seat write goes through assignSeat() to keep the ref and the state
  // in lockstep. All writes happen synchronously within the init() async flow
  // in the effect below, before that same flow's first setGame — so a render
  // can never observe `game` populated while `mySeat` is still stale.
  const mySymbol = useRef(null)
  const [mySeat, setMySeat] = useState(null)
  const assignSeat = (s) => { mySymbol.current = s; setMySeat(s) }
  const spectatorToastShown = useRef(false)
  const partyJoining = useRef(false)
  const connected = useDbConnected()
  const myId = getPlayerId()

  // Firebase init: join room, set up listeners
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

    const gameRef = ref(db, `games/${gameId}`)
    const publicListingRef = ref(db, `matchmaking/${gameId}`)
    let cancelled = false
    let unsubGame = null

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

      let data = snap.val()

      if (data.visibility === 'public' && (data.status !== 'waiting' || !listingHost(data))) remove(publicListingRef).catch(() => {})

      const lastActive = data.lastActivityAt ?? data.createdAt
      if (lastActive && Date.now() - lastActive > GAME_TTL_MS) {
        setErrorGameType(data.gameType || null)
        setError('THIS GAME HAS EXPIRED. CREATE A NEW ONE!')
        setLoading(false)
        return
      }

      const myId = getPlayerId()
      const cfgData = getGameConfig(data.gameType)
      const storedName = readName()
      const alreadySeated = cfgData.nPlayer
        ? !!data.players?.[myId]
        : data.players?.X?.playerId === myId || data.players?.O?.playerId === myId || !!readStoredSeat(gameId)?.symbol

      // Invite screen — anyone about to take a seat or watch under a
      // placeholder (or no) name. Checked against the room, not just an empty
      // localStorage: ensureProfile may already have mirrored Guest-XXXX there.
      if (!alreadySeated && !nameChosen.current && isGuestStyleName(storedName)) {
        setInvite({ gameType: data.gameType, ...inviteSummary(data, cfgData) })
        setNeedName(true)
        setLoading(false)
        return
      }

      const playerName = storedName || guestName(myId)
      const playerAvatar = readAvatar()

      if (cfgData.nPlayer && (data.players?.X || data.players?.O)) {
        // A game type that became a party game (the N-player races) in a room
        // still seated X/O from before: reseat it uid-keyed on read — the same
        // patch a 2P → party switch writes — or every client would hit the
        // family-mismatch screen.
        try {
          const { snapshot } = await runTransaction(gameRef, cur => (
            cur && cur.gameType === data.gameType && (cur.players?.X || cur.players?.O)
              ? { ...cur, ...buildSwitchUpdates(cur, cur.gameType) }
              : undefined
          ))
          if (snapshot?.exists()) data = snapshot.val()
        } catch { /* rules or network — the room shows the mismatch notice */ }
        if (cancelled) return
      }

      if (cfgData.nPlayer) {
        let amPlayer = !!data.players?.[myId]
        if (amPlayer) {
          try { await update(ref(db, `games/${gameId}/players/${myId}`), { name: playerName, avatar: playerAvatar }) } catch { /* ignore */ }
        } else if (data.status === 'waiting' && canTakeSeat(data, myId)) {
          amPlayer = await joinPartySeat(gameId, cfgData, { name: playerName, avatar: playerAvatar })
        }
        if (cancelled) return
        setLoading(false)
        if (amPlayer) recordRoom({ id: gameId, gameType: data.gameType })
        unsubGame = onValue(gameRef, snap => { if (!cancelled && snap.exists()) setGame(snap.val()) })
        return
      }

      const stored = readStoredSeat(gameId)

      if (stored?.symbol) {
        // 1. Valid sessionStorage record
        assignSeat(stored.symbol)
      } else {
        // 2. Try playerId reclaim
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
              await update(gameRef, secondSeatUpdates(data))
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
    }

    init()

    return () => {
      cancelled = true
      if (unsubGame) unsubGame()
    }
  }, [gameId, nameVersion])

  const latestGame = useRef(null)
  useEffect(() => { latestGame.current = game }, [game])

  const cfg = game ? getGameConfig(game.gameType) : null
  const party = !!cfg?.nPlayer
  const partySeated = party && !!game?.players?.[myId]

  // --- Game night (night agent): 2P seats can change after init — a party
  // room switching into a 2P game, winner-stays rotation, a host kick — so
  // follow the live snapshot by uid. Plain 2P rooms only ever gain a seat
  // here (a legacy sessionStorage seat is never taken away); losing one needs
  // a party-origin room (`partyRoom`) or a kick. See src/lib/nightLogic.js.
  const seatX = party ? null : game?.players?.X?.playerId ?? null
  const seatO = party ? null : game?.players?.O?.playerId ?? null
  const reseatable = !!game?.partyRoom || !!game?.kicked?.[myId]
  useEffect(() => {
    if (!game) return
    // Party rooms have no X/O seat: drop one left over from a 2P game (it
    // would otherwise tag this client's emotes and chat as 'X'/'O').
    if (party) {
      if (mySymbol.current) assignSeat(null)
      return
    }
    const uidSeat = seatX === myId ? 'X' : seatO === myId ? 'O' : null
    if (uidSeat === mySymbol.current) return
    if (!uidSeat && !reseatable) return
    // Syncing the seat from the Firebase snapshot (an external system) —
    // one update per seat change, not a render cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    assignSeat(uidSeat)
    try { sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: uidSeat, name: readName() })) } catch { /* private mode */ }
    if (uidSeat) recordRoom({ id: gameId, gameType: game.gameType })
    // Keyed on the seat holders, not every snapshot (chat, presence).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party, seatX, seatO, reseatable, gameId])
  // --- end game night

  // Presence — one entry per connection (useRoomPresence). Party seats live
  // on players/{uid}; 2P seats on presence/{X|O}; everyone else is counted as
  // a spectator. Recomputed from the live snapshot, so a latecomer who gets
  // seated (or a spectator who takes a free seat) switches over by itself.
  const presenceKind = !game ? null : party ? (partySeated ? 'party' : 'spectator') : (mySeat ? 'seat' : 'spectator')
  useRoomPresence({
    gameId,
    kind: presenceKind,
    seat: presenceKind === 'seat' ? mySeat : null,
    uid: myId,
    name: presenceKind === 'spectator' ? (readName() || guestName(myId)) : null,
  })

  // Party latecomers — seated whenever the room is back in its lobby (after a
  // NEW MATCH or a switch), not only when they first opened the link; also
  // retried when a place frees up (a seat drops past its grace window).
  const playersNode = game?.players
  const partySeatCount = party ? Object.keys(playersNode || {}).length : 0
  // Game night's LOCK ROOM / KICK (nightLogic.canTakeSeat) bar it.
  const partyLobbyOpen = party && game?.status === 'waiting' && !partySeated && !needName && canTakeSeat(game, myId)
  const [seatRecheck, setSeatRecheck] = useState(0)
  useEffect(() => {
    if (!partyLobbyOpen || partyJoining.current || !cfg) return
    const plan = partyJoinPlan({ players: playersNode, myId, status: 'waiting', maxPlayers: cfg.maxPlayers || 8 })
    if (plan.action !== 'join') {
      // Full for now — an offline seat may pass its grace window without the
      // seat count changing, so look again in a while.
      const t = setTimeout(() => setSeatRecheck(n => n + 1), 15_000)
      return () => clearTimeout(t)
    }
    partyJoining.current = true
    joinPartySeat(gameId, cfg, { name: readName() || guestName(myId), avatar: readAvatar() })
      .then(joined => {
        if (!joined) return
        recordRoom({ id: gameId, gameType: game.gameType })
        toast("A SEAT OPENED — YOU'RE IN")
      })
      .finally(() => { partyJoining.current = false })
    // Re-evaluated when the lobby opens or the seat count changes — not on
    // every snapshot (chat, presence) while waiting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyLobbyOpen, partySeatCount, gameId, seatRecheck])

  // One-time spectator notice — fires only once, when a full 2-seat room
  // resolves us to a spectator (never for the never-seated-but-empty-room case).
  useEffect(() => {
    if (!game || spectatorToastShown.current) return
    if (!mySymbol.current && game.players?.X && game.players?.O) {
      spectatorToastShown.current = true
      toast("ROOM'S FULL — YOU'RE SPECTATING")
    }
  }, [game])

  // Public rooms: the host's onDisconnect deletes the lobby listing, so put it
  // back whenever the host is (re)connected here and the room is still
  // waiting for an opponent (matchmaking.js republishPublicRoom).
  // Race rooms (uid-keyed seats) list the same way, hosted by their only
  // seated player; the host also takes the listing down once someone joins.
  const listedHostUid = listingHost(game)?.uid ?? null
  const shouldList = connected === true && listedHostUid === myId && isListableRoom(game)
  useEffect(() => {
    if (!shouldList) return
    republishPublicRoom({ gameId, game: latestGame.current }).catch(() => {})
  }, [shouldList, gameId])
  const shouldDelist = game?.visibility === 'public' && partySeated && !listedHostUid
  useEffect(() => {
    if (shouldDelist) removePublicListing(gameId).catch(() => {})
  }, [shouldDelist, gameId])

  // The invite screen's JOIN: persist the chosen name (profile + localStorage)
  // and re-run init. An empty field keeps the current placeholder name.
  const joinWithName = (name) => {
    nameChosen.current = true
    const trimmed = String(name || '').trim()
    if (trimmed) saveDisplayName(trimmed).catch(() => {})
    setNeedName(false)
    setInvite(null)
    setLoading(true)
    setNameVersion(v => v + 1)
  }

  // "YOU'RE UP NEXT" — a 2P spectator takes a seat that freed up while the
  // room is in its lobby. Same transaction as a first-time O claim. Not while
  // game night's queue has people lined up (their order wins), the room is
  // locked, or this player was kicked.
  // With a queue (a party-origin 2P game), only its head may take the seat.
  const queueHead = normalizeQueue(game?.queue)[0]?.uid ?? null
  const seatOffer = !party && !mySeat && !!openSeat(game) && canTakeSeat(game, myId) && (!queueHead || queueHead === myId)
  const takeSeat = async () => {
    const seat = openSeat(game)
    if (!seat || mySymbol.current || !db || !seatOffer) return false
    const name = readName() || guestName(myId)
    const { committed } = await runTransaction(
      ref(db, `games/${gameId}/players/${seat}`),
      current => (current !== null ? undefined : { name, joinedAt: Date.now(), playerId: myId, avatar: readAvatar() }),
    )
    if (!committed) return false
    assignSeat(seat)
    sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: seat, name }))
    recordRoom({ id: gameId, gameType: game.gameType })
    const other = seat === 'X' ? 'O' : 'X'
    const after = game.players?.[other] ? secondSeatUpdates(game) : {}
    if (queueHead === myId) after[`queue/${myId}`] = null // seated: out of the line
    if (Object.keys(after).length) await update(ref(db, `games/${gameId}`), after)
    return true
  }

  const opSym = mySeat === 'X' ? 'O' : 'X'
  const opPresence = mySeat ? game?.presence?.[opSym] : null
  const opponentOnline = mySeat ? isSeatOnline(opPresence) : true
  const opponentLeft = mySeat ? seatLeft(opPresence) : false

  return {
    game, loading, error, errorGameType, needName, invite, joinWithName, opponentOnline, opponentLeft,
    mySeat, mySymbol, connected, seatOffer, takeSeat,
  }
}

// Party seat claim: a transaction on the players node so capacity (online
// seats only — see roomLogic.partyJoinPlan) and any ghost eviction are
// decided against the server's copy. Only called while the room is waiting.
async function joinPartySeat(gameId, cfg, { name, avatar }) {
  const myId = getPlayerId()
  const seat = { name, joinedAt: Date.now(), playerId: myId, online: true, avatar }
  try {
    const { committed, snapshot } = await runTransaction(ref(db, `games/${gameId}/players`), cur => {
      const plan = partyJoinPlan({ players: cur, myId, status: 'waiting', maxPlayers: cfg.maxPlayers || 8 })
      return applyPartyJoin(cur, plan, seat) ?? undefined
    })
    return committed || !!snapshot?.val()?.[myId]
  } catch { return false }
}
