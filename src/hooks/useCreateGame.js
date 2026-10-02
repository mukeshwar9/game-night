import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, set } from 'firebase/database'
import { db } from '../lib/firebase'
import { generateGameId } from '../lib/gameLogic'
import { freshGameState, getGameConfig, buildPartyRoom, PARTY_LOBBY } from '../lib/games'
import { getPlayerId } from '../lib/playerId'
import { recordRoom } from '../lib/profile'
import { recordPlay } from '../lib/analytics'
import { toast } from 'sonner'
import { waitForModalHistory } from './useModalHistory'

const getPlayerName = (profile) => profile?.displayName || localStorage.getItem('playerName') || ''

export default function useCreateGame({ profile, avatar, onMissingName }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(null)

  const createGame = async (gameType) => {
    const playerName = getPlayerName(profile)
    if (!playerName) { onMissingName?.(); return }

    setLoading(gameType)
    try {
      const gameId = generateGameId()
      const cfg = getGameConfig(gameType)
      const myId = getPlayerId()
      const now = Date.now()
      let gameData

      if (gameType === PARTY_LOBBY.type) {
        gameData = buildPartyRoom({ name: playerName, avatar, playerId: myId, now })
      } else if (cfg.nPlayer) {
        gameData = {
          gameType,
          status: 'waiting',
          scores: {},
          createdAt: now,
          lastActivityAt: now,
          players: { [myId]: { name: playerName, joinedAt: now, playerId: myId, online: true, avatar } },
          ...freshGameState(gameType),
          ...(['typing', 'math'].includes(gameType) ? { hostUid: myId } : {}),
        }
      } else {
        gameData = {
          gameType,
          status: 'waiting',
          scores: { X: 0, O: 0 },
          createdAt: now,
          lastActivityAt: now,
          players: { X: { name: playerName, joinedAt: now, playerId: myId, avatar } },
          ...freshGameState(gameType),
        }
      }

      await set(ref(db, `games/${gameId}`), gameData)
      recordPlay(gameType, 'multi')
      if (!cfg.nPlayer) {
        sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: 'X', name: playerName }))
      }
      recordRoom({ id: gameId, gameType })
      // The picker sheet that started this may still be consuming its
      // history marker; navigating before that lands would be undone by it.
      await waitForModalHistory()
      navigate(`/game/${gameId}`)
    } catch {
      toast.error('CONNECTION ERROR. TRY AGAIN.')
      setLoading(null)
    }
  }

  // START A PARTY: a party-first room in its lobby (src/lib/partyLogic.js).
  const createParty = () => createGame(PARTY_LOBBY.type)

  return { createGame, createParty, loading }
}
