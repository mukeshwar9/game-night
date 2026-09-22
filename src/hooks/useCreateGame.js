import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, set } from 'firebase/database'
import { db } from '../lib/firebase'
import { generateGameId } from '../lib/gameLogic'
import { freshGameState, getGameConfig } from '../lib/games'
import { getPlayerId } from '../lib/playerId'
import { recordRoom } from '../lib/profile'
import { recordPlay } from '../lib/analytics'
import { toast } from 'sonner'

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

      if (cfg.nPlayer) {
        gameData = {
          gameType,
          status: 'waiting',
          scores: {},
          createdAt: now,
          lastActivityAt: now,
          players: { [myId]: { name: playerName, joinedAt: now, playerId: myId, online: true, avatar } },
          ...freshGameState(gameType),
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
      navigate(`/game/${gameId}`)
    } catch {
      toast.error('CONNECTION ERROR. TRY AGAIN.')
      setLoading(null)
    }
  }

  return { createGame, loading }
}
