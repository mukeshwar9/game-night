import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import Onboarding from './LazyOnboarding'
import useBusy from '../hooks/useBusy'
import useCreateGame from '../hooks/useCreateGame'
import { useAuth } from '../lib/AuthContext'
import { ARROWS_DIFFICULTIES, ARROWS_DIFFICULTY_INFO } from '../lib/arrowsLogic'
import { PARTY_MAX_BOTS, PARTY_TIERS, normalizePartyConfig } from '../lib/arrowsPartyLogic'
import { defaultAvatarForId } from '../lib/avatarKit'
import { generateGameId } from '../lib/gameLogic'
import { claimPublicRoom, createPublicRoom, listPublicRoomsOnce } from '../lib/matchmaking'
import { getPlayerId } from '../lib/playerId'
import { recordRoom } from '../lib/profile'
import { recordPlay } from '../lib/analytics'
import { trackRoomCreated, trackRoomJoined } from '../lib/track'
import { cn } from '@/lib/utils'

// The 2 PLAYERS screen of the Arrows hub: pick the race settings first, then
// who to race. The difficulty is written with the room, so the invite already
// says what is being played; the in-room picker stays for rematches.

const getPlayerName = (profile) => profile?.displayName || localStorage.getItem('playerName') || ''

function WhoCard({ title, sub, onClick, busy, busyLabel, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full min-h-16 flex flex-col items-start justify-center gap-0.5 px-3 py-2 border border-retro-border rounded bg-retro-card text-left hover:border-retro-cta/50 press-card transition disabled:opacity-50"
    >
      <span className="font-pixel text-[10px] text-retro-cta">{busy ? busyLabel : title}</span>
      <span className="font-mono text-[11px] text-retro-dim">{sub}</span>
    </button>
  )
}

export default function ArrowsRaceSetup() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [difficulty, setDifficulty] = useState('mixed')
  const [aiCount, setAiCount] = useState(2)
  const [needName, setNeedName] = useState(false)
  const [quickBusy, runQuick] = useBusy()
  const avatar = profile?.avatar || localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId())
  const { createGame, loading } = useCreateGame({ profile, avatar, onMissingName: () => setNeedName(true) })
  const [friendBusy, runFriend] = useBusy()
  const [aiBusy, runAi] = useBusy()
  const anyBusy = quickBusy || friendBusy || aiBusy || !!loading
  const initial = { arrowsDifficulty: difficulty }

  const friend = () => runFriend(() => createGame('arrows', initial))

  // Practice against AI racers: an Arrows Party room with the AIs already in it, so one
  // player can ready up alone. MIXED has no single tier there, so it starts at medium.
  const ai = () => runAi(
    () => createGame('arrowsparty', {
      arrowsPartyConfig: normalizePartyConfig({ tier: PARTY_TIERS.includes(difficulty) ? difficulty : 'medium', rounds: 3, bots: aiCount }),
    }),
    () => toast.error("COULDN'T START — TRY AGAIN"),
  )

  // Same public-room path as PLAY PUBLIC: take the longest-waiting open Arrows
  // room (it keeps its host's setting), else open one at the chosen setting.
  const quick = () => runQuick(async () => {
    const name = getPlayerName(profile)
    if (!name) { setNeedName(true); return }
    const me = getPlayerId()
    const rooms = (await listPublicRoomsOnce()).filter((r) => r.gameType === 'arrows' && r.hostUid !== me).slice(0, 3)
    for (const room of rooms) {
      const result = await claimPublicRoom({ gameId: room.gameId, playerId: me, playerName: name, playerAvatar: avatar })
      if (!result.ok) continue
      sessionStorage.setItem(`game-${room.gameId}`, JSON.stringify({ symbol: 'O', name }))
      recordRoom({ id: room.gameId, gameType: 'arrows' })
      recordPlay('arrows', 'multi')
      trackRoomJoined('arrows', 'public')
      navigate(`/game/${room.gameId}`)
      return
    }
    const gameId = generateGameId()
    await createPublicRoom({ gameId, gameType: 'arrows', playerId: me, playerName: name, playerAvatar: avatar, initial })
    recordPlay('arrows', 'multi')
    trackRoomCreated('arrows', 'public')
    sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: 'X', name }))
    recordRoom({ id: gameId, gameType: 'arrows' })
    navigate(`/game/${gameId}`)
  }, () => toast.error("COULDN'T START A QUICK MATCH — TRY AGAIN"))

  if (needName) return <Onboarding onDone={() => setNeedName(false)} />

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="font-pixel text-[9px] text-retro-dim">RACE SETTINGS</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Race difficulty">
          {ARROWS_DIFFICULTIES.map((id) => (
            <button
              key={id}
              onClick={() => setDifficulty(id)}
              aria-pressed={difficulty === id}
              className={cn(
                'min-h-14 flex flex-col items-start justify-center gap-0.5 px-3 py-2 rounded border text-left transition press',
                difficulty === id ? 'border-retro-cta bg-retro-tint-cta text-retro-cta' : 'border-retro-border text-retro-dim hover:border-retro-cta/50',
              )}
            >
              <span className="font-pixel text-[9px]">{ARROWS_DIFFICULTY_INFO[id].label}</span>
              <span className="font-mono text-[10px] leading-tight">{ARROWS_DIFFICULTY_INFO[id].blurb.toLowerCase()}</span>
            </button>
          ))}
        </div>
        <p className="font-mono text-[10px] text-retro-dim">best of 3 · both players get the same board</p>
      </div>
      <div className="space-y-2">
        <p className="font-pixel text-[9px] text-retro-dim">WHO ARE YOU RACING?</p>
        <WhoCard title="A FRIEND" sub="private room — share the link" onClick={friend} busy={friendBusy || !!loading} busyLabel="CREATING…" disabled={anyBusy} />
        <WhoCard title="QUICK MATCH" sub="join an open room, or open one at these settings" onClick={quick} busy={quickBusy} busyLabel="FINDING…" disabled={anyBusy} />
        <WhoCard title="AI RACERS" sub={`${aiCount} AI${aiCount === 1 ? '' : 'S'} in ARROWS PARTY — race alone, a 3-round cup`} onClick={ai} busy={aiBusy || !!loading} busyLabel="CREATING…" disabled={anyBusy} />
        <div className="flex items-center gap-2" role="group" aria-label="How many AI racers">
          <span className="font-pixel text-[8px] text-retro-dim">HOW MANY AIS</span>
          {Array.from({ length: PARTY_MAX_BOTS }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setAiCount(n)}
              aria-pressed={aiCount === n}
              aria-label={`${n} AI racer${n === 1 ? '' : 's'}`}
              className={cn(
                'min-h-9 min-w-9 rounded border font-pixel text-[10px] transition press',
                aiCount === n ? 'border-retro-cta bg-retro-tint-cta text-retro-cta' : 'border-retro-border text-retro-dim hover:border-retro-cta/50',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
