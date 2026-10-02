/* eslint-disable react-refresh/only-export-components -- provider and hook share one context. */
// Party voice for one room. Game.jsx mounts this ABOVE both of its render
// branches and keyed only by the room, so switching games, BACK TO PARTY or a
// 2P reseat never tears the connection down. The work happens in
// src/lib/voice/voiceController.js; this binds it to React.
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { getPlayerId } from '../../lib/playerId'
import { useMutedMap } from '../../lib/mute'
import { VOICE_ENABLED } from '../../lib/features'
import { createVoiceController } from '../../lib/voice/voiceController'

const VoiceContext = createContext(null)

/** { state, actions } for this room's voice, or null when voice is off. */
export function useVoice() {
  return useContext(VoiceContext)
}

export function VoiceProvider({ gameId, game, children }) {
  if (!VOICE_ENABLED) return children
  return <VoiceRoom key={gameId} gameId={gameId} game={game}>{children}</VoiceRoom>
}

function VoiceRoom({ gameId, game, children }) {
  const [ctl] = useState(() => createVoiceController({ gameId, me: getPlayerId(), enabled: VOICE_ENABLED }))
  const state = useSyncExternalStore(ctl.subscribe, ctl.getState)
  const blocks = useMutedMap()
  useEffect(() => { ctl.setRoom(game) }, [ctl, game])
  useEffect(() => { ctl.setBlocks(blocks) }, [ctl, blocks])
  useEffect(() => () => { ctl.dispose() }, [ctl])
  return <VoiceContext.Provider value={{ state, actions: ctl }}>{children}</VoiceContext.Provider>
}
