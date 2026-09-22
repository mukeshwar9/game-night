import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import Onboarding from '../components/Onboarding'
import useBusy from '../hooks/useBusy'
import { useAuth } from '../lib/AuthContext'
import { getGameConfig } from '../lib/games'
import { getPlayerId } from '../lib/playerId'
import { defaultAvatarForId } from '../lib/avatars'
import { recordRoom } from '../lib/profile'
import { recordPlay } from '../lib/analytics'
import { generateGameId } from '../lib/gameLogic'
import { claimPublicRoom, createPublicRoom, getPublicGameTypes, subscribePublicRooms } from '../lib/matchmaking'
import { cn } from '@/lib/utils'
const getPlayerName = profile => profile?.displayName || localStorage.getItem('playerName') || ''
export default function OnlineLobby() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { profile } = useAuth()
  const [rooms, setRooms] = useState([])
  const [filter, setFilter] = useState(params.get('game') || 'all')
  const [createType, setCreateType] = useState(params.get('game') || 'tictactoe')
  const [joinBusy, setJoinBusy] = useState(null)
  const [createBusy, runCreate] = useBusy()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const games = useMemo(() => getPublicGameTypes(), [])
  const name = getPlayerName(profile)
  const avatar = profile?.avatar || localStorage.getItem('playerAvatar') || defaultAvatarForId(getPlayerId())
  const visibleRooms = filter === 'all' ? rooms : rooms.filter(room => room.gameType === filter)
  useEffect(() => subscribePublicRooms(setRooms), [])
  const ensureName = () => { if (name) return true; setShowOnboarding(true); return false }
  const joinRoom = async room => {
    if (!ensureName()) return
    setJoinBusy(room.gameId)
    try {
      const result = await claimPublicRoom({ gameId: room.gameId, playerId: getPlayerId(), playerName: name, playerAvatar: avatar })
      if (!result.ok) { toast('ROOM NO LONGER AVAILABLE — PICK ANOTHER'); setRooms(current => current.filter(item => item.gameId !== room.gameId)); return }
      sessionStorage.setItem(`game-${room.gameId}`, JSON.stringify({ symbol: 'O', name }))
      recordRoom({ id: room.gameId, gameType: result.gameType })
      navigate(`/game/${room.gameId}`)
    } catch { toast.error("COULDN'T JOIN ROOM — TRY AGAIN") } finally { setJoinBusy(null) }
  }
  const createRoom = () => runCreate(async () => {
    if (!ensureName()) return
    const gameId = generateGameId()
    await createPublicRoom({ gameId, gameType: createType, playerId: getPlayerId(), playerName: name, playerAvatar: avatar })
    recordPlay(createType, 'multi')
    sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: 'X', name }))
    recordRoom({ id: gameId, gameType: createType })
    navigate(`/game/${gameId}`)
  }, () => toast.error("COULDN'T CREATE ROOM — TRY AGAIN"))
  if (showOnboarding) return <Onboarding onDone={() => setShowOnboarding(false)} />
  return <div className="min-h-screen bg-retro-bg flex flex-col items-center p-4"><div className="w-full max-w-2xl space-y-5">
    <div className="flex items-center justify-between gap-3"><div><p className="font-pixel text-lg text-retro-cta text-glow-cta">PLAY ONLINE</p><p className="font-mono text-[11px] text-retro-dim mt-1">PLAY PRIVATELY OR FIND A PUBLIC OPPONENT</p></div><Link to="/" className="font-pixel text-[9px] text-retro-dim p-3 -m-3">HOME</Link></div>
    <div className="bg-retro-card border-2 border-retro-p1/50 rounded p-3 space-y-3"><div className="flex items-center justify-between gap-2"><div><p className="font-pixel text-[10px] text-retro-p1 tracking-wider">PRIVATE ROOM</p><p className="font-mono text-[11px] text-retro-dim mt-1">Create an invite-only room and share the link or code.</p></div><Link to="/" className="shrink-0 min-h-11 px-3 flex items-center bg-retro-p1 text-retro-bg font-pixel text-[9px] rounded">CREATE</Link></div></div>
    <div className="bg-retro-card border border-retro-border rounded p-3 space-y-3"><div className="flex items-center justify-between"><p className="font-pixel text-[10px] text-retro-text tracking-wider">WAITING ROOMS</p><span className="font-mono text-[10px] text-retro-dim">{visibleRooms.length} OPEN</span></div>
      <div className="flex gap-2 overflow-x-auto pb-1"><button onClick={() => setFilter('all')} className={cn('shrink-0 min-h-9 px-3 rounded border font-pixel text-[8px]', filter === 'all' ? 'border-retro-cta text-retro-cta bg-retro-tint-cta' : 'border-retro-border text-retro-dim')}>ALL</button>{games.map(game => <button key={game.type} onClick={() => setFilter(game.type)} className={cn('shrink-0 min-h-9 px-3 rounded border font-pixel text-[8px]', filter === game.type ? 'border-retro-cta text-retro-cta bg-retro-tint-cta' : 'border-retro-border text-retro-dim')}>{game.label}</button>)}</div>
      {visibleRooms.length === 0 ? <EmptyState>{filter === 'all' ? 'NO ONE IS WAITING YET' : `NO ${getGameConfig(filter).label} ROOMS YET`}</EmptyState> : <div className="space-y-2">{visibleRooms.map(room => { const busy = joinBusy === room.gameId; return <div key={room.gameId} className="flex items-center gap-3 bg-retro-surface border border-retro-border rounded p-2.5"><Avatar id={room.hostAvatar} size={36} /><div className="min-w-0 flex-1"><p className="font-pixel text-[9px] text-retro-cta truncate">{getGameConfig(room.gameType).label}</p><p className="font-mono text-[11px] text-retro-text truncate">{room.hostName} <span className="text-retro-dim">· WAITING</span></p></div><button onClick={() => joinRoom(room)} disabled={!!joinBusy || createBusy} className="min-h-11 px-3 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded disabled:opacity-50">{busy ? 'JOINING…' : 'JOIN'}</button></div> })}</div>}
    </div>
    <div className="bg-retro-card border border-retro-border rounded p-3 space-y-3"><p className="font-pixel text-[10px] text-retro-text tracking-wider">CREATE PUBLIC ROOM</p><p className="font-mono text-[11px] text-retro-dim">Anyone can join. No Google login required.</p><div className="flex gap-2"><select value={createType} onChange={event => setCreateType(event.target.value)} className="min-h-11 flex-1 min-w-0 bg-retro-surface border border-retro-border rounded px-2 text-retro-text font-mono text-xs">{games.map(game => <option key={game.type} value={game.type}>{game.label}</option>)}</select><button onClick={createRoom} disabled={createBusy || !!joinBusy} className="min-h-11 px-3 bg-retro-p1 text-retro-bg font-pixel text-[9px] rounded disabled:opacity-50">{createBusy ? 'CREATING…' : 'CREATE'}</button></div></div>
    <p className="text-center font-mono text-[10px] text-retro-dim">Want a private match? <Link to="/" className="text-retro-cta">PLAY WITH FRIENDS</Link></p>
  </div></div>
}
