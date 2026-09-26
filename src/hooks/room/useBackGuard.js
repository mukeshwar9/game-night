import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, update } from 'firebase/database'
import { db } from '../../lib/firebase'
import { getGameConfig } from '../../lib/games'
import { getPlayerId } from '../../lib/playerId'

// M-22: guard the browser back gesture / iOS edge-swipe during an active
// match instead of silently ejecting the seated player. Pushes one history
// marker for the whole "playing" window; overlays (Rules/Invite/Switcher)
// push their own marker on top via useModalHistory, so a back-gesture while
// one is open just closes that overlay (its own listener fires unconditionally)
// — this listener only reacts once ITS marker is the one actually consumed,
// i.e. it lets the topmost pushed state win. On a genuine pop past our
// marker we can't veto the browser's already-applied history change, so we
// re-push the marker (undoing the URL/entry effect) and surface the confirm
// instead; confirming does a normal client-side navigate('/') rather than
// trying to replay the exact number of back-steps.
export default function useBackGuard({ game, gameId, mySeat }) {
  const navigate = useNavigate()
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

  // Is this client a seated player in a currently-live round? Covers both
  // game families — 2P `mySeat` and n-player uid-keyed `players`.
  // Spectators are never guarded (nothing of theirs to lose).
  const isActivePlay = !!game && game.status === 'playing' && (
    getGameConfig(game.gameType).nPlayer
      ? !!game.players?.[getPlayerId()]
      : !!mySeat
  )

  useEffect(() => {
    if (!isActivePlay) return
    window.history.pushState({ matchGuard: true }, '')

    const onPopState = (e) => {
      if (e.state && (e.state.matchGuard || e.state.modalHistory)) return
      window.history.pushState({ matchGuard: true }, '')
      setShowLeaveConfirm(true)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [isActivePlay, gameId])

  const cancelLeaveMatch = () => setShowLeaveConfirm(false)
  // LEAVE tells the opponent straight away instead of letting them sit out the
  // 120 s abandon window: a `leftAt` marker on this player's OWN presence seat
  // (never the opponent's, never the result) that also drops every connection
  // of the seat, so their CLAIM WIN transaction sees the seat offline. The
  // marker clears if this player reopens the room (useRoomPresence). Party
  // rooms need nothing extra — unmounting marks the seat offline and the
  // coordinator hands over.
  const confirmLeaveMatch = () => {
    setShowLeaveConfirm(false)
    if (db && isActivePlay && mySeat && !getGameConfig(game.gameType).nPlayer) {
      update(ref(db, `games/${gameId}/presence/${mySeat}`), { leftAt: Date.now(), online: false, conns: null }).catch(() => {})
    }
    navigate('/')
  }
  const handleHomeLinkClick = (e) => {
    if (isActivePlay) {
      e.preventDefault()
      setShowLeaveConfirm(true)
    }
  }

  return { showLeaveConfirm, cancelLeaveMatch, confirmLeaveMatch, handleHomeLinkClick }
}
