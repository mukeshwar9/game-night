import { useState, useRef, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ref, set } from 'firebase/database'
import { db, configError } from '../lib/firebase'
import { generateGameId } from '../lib/gameLogic'
import { freshGameState, getGameConfig } from '../lib/games'
import { getPlayerId } from '../lib/playerId'
import { getStats, getRooms, recordRoom } from '../lib/profile'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { sounds } from '../lib/sounds'
import GamePicker from '../components/GamePicker'
import ThemeSwitcher from '../components/ThemeSwitcher'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export default function Home() {
  const navigate = useNavigate()
  const [name, setName] = useState(() => localStorage.getItem('playerName') || '')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(null)
  const [muted, setMuted] = useState(() => sounds.isMuted())
  const { canInstall, install } = useInstallPrompt()
  const nameRef = useRef(null)
  const rooms = useMemo(() => getRooms(), [])
  const stats = useMemo(() => getStats(), [])

  const toggleMute = () => setMuted(sounds.toggle())

  const rejoin = (id) => { if (saveName()) navigate(`/game/${id}`) }

  const saveName = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('ENTER YOUR NAME FIRST')
      nameRef.current?.focus()
      return null
    }
    localStorage.setItem('playerName', trimmed)
    return trimmed
  }

  const createGame = async (gameType) => {
    const playerName = saveName()
    if (!playerName) return
    setLoading(gameType)
    try {
      const gameId = generateGameId()
      const gameData = {
        gameType,
        status: 'waiting',
        scores: { X: 0, O: 0 },
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        players: { X: { name: playerName, joinedAt: Date.now(), playerId: getPlayerId() } },
        ...freshGameState(gameType),
      }
      await set(ref(db, `games/${gameId}`), gameData)
      sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: 'X', name: playerName }))
      recordRoom({ id: gameId, gameType })
      navigate(`/game/${gameId}`)
    } catch {
      toast.error('CONNECTION ERROR. TRY AGAIN.')
      setLoading(null)
    }
  }

  const joinGame = () => {
    const playerName = saveName()
    if (!playerName) return
    const code = joinCode.trim().toUpperCase()
    if (!code) { toast.error('ENTER A GAME CODE'); return }
    navigate(`/game/${code}`)
  }

  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center p-4 relative">
      {/* Controls — fixed top-right */}
      <div className="fixed top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-10 flex gap-2">
        <ThemeSwitcher />
        <button
          onClick={toggleMute}
          title={muted ? 'Unmute sounds' : 'Mute sounds'}
          className="text-retro-dim hover:text-retro-text transition-colors p-2 rounded border border-retro-border bg-retro-card"
        >
          {muted ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Unmute">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <line x1="23" y1="9" x2="17" y2="15"/>
              <line x1="17" y1="9" x2="23" y2="15"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Mute">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          )}
        </button>
      </div>
      {configError && (
        <div className="w-full max-w-sm mb-6 border border-retro-p2/50 bg-retro-card rounded px-4 py-3">
          <p className="font-pixel text-[10px] text-retro-p2">FIREBASE NOT CONFIGURED</p>
          <p className="font-mono text-xs text-retro-dim mt-1">{configError}</p>
        </div>
      )}

      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-14 h-14 border-2 border-retro-cta bg-retro-tint-cta rounded
            flex items-center justify-center shadow-neon-cta">
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
              <line x1="10" y1="2" x2="10" y2="28" className="stroke-retro-cta" strokeWidth="2.5" strokeLinecap="square"/>
              <line x1="20" y1="2" x2="20" y2="28" className="stroke-retro-cta" strokeWidth="2.5" strokeLinecap="square"/>
              <line x1="2" y1="10" x2="28" y2="10" className="stroke-retro-cta" strokeWidth="2.5" strokeLinecap="square"/>
              <line x1="2" y1="20" x2="28" y2="20" className="stroke-retro-cta" strokeWidth="2.5" strokeLinecap="square"/>
            </svg>
          </div>
          <div>
            <h1 className="font-pixel text-xl text-retro-cta text-glow-cta leading-relaxed">
              GAME NIGHT
            </h1>
            <p className="font-mono text-xs text-retro-dim mt-2 tracking-widest">
              PLAY WITH FRIENDS — NO ACCOUNT NEEDED
            </p>
          </div>
        </div>

        {/* Name input */}
        <div className="space-y-1.5">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">YOUR NAME</label>
          <input
            ref={nameRef}
            type="text"
            placeholder="PLAYER ONE"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={20}
            autoFocus
            className="w-full bg-retro-card border-2 border-retro-border text-retro-text
              font-pixel text-xs tracking-widest placeholder-retro-border rounded px-4 py-3
              focus:outline-none focus:border-retro-p1 transition-colors"
          />
        </div>

        {/* Join game */}
        <div className="space-y-1.5">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">JOIN A FRIEND</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="GAME CODE"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && joinGame()}
              maxLength={6}
              className="flex-1 bg-retro-card border-2 border-retro-border text-retro-p1
                font-pixel text-xs placeholder-retro-border rounded px-4 py-3
                focus:outline-none focus:border-retro-p1 tracking-widest transition-colors"
            />
            <button
              onClick={joinGame}
              className="px-5 py-3 bg-retro-card border-2 border-retro-border text-retro-text
                font-pixel text-[10px] rounded hover:border-retro-p1/50 transition-colors active:scale-95"
            >
              JOIN
            </button>
          </div>
        </div>

        {/* Your rooms — one tap to return */}
        {rooms.length > 0 && (
          <div className="space-y-1.5">
            <label className="font-pixel text-[10px] text-retro-dim tracking-wider">YOUR ROOMS</label>
            <div className="space-y-1.5">
              {rooms.map(r => (
                <button
                  key={r.id}
                  onClick={() => rejoin(r.id)}
                  className="w-full flex items-center justify-between bg-retro-card border border-retro-border rounded px-3 py-2.5 hover:border-retro-p1/50 transition-colors active:scale-[0.99]"
                >
                  <span className="font-pixel text-[11px] text-retro-p1 text-glow-p1 tracking-widest">{r.id}</span>
                  <span className="font-pixel text-[8px] text-retro-dim">{getGameConfig(r.gameType)?.label || 'GAME'} →</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-retro-border" />
          <span className="font-pixel text-[9px] text-retro-border">OR START NEW</span>
          <div className="flex-1 h-px bg-retro-border" />
        </div>

        {/* Game selection */}
        <div className="space-y-1.5">
          <label className="font-pixel text-[10px] text-retro-dim tracking-wider">SELECT GAME</label>
          <GamePicker onSelect={createGame} loadingType={loading} />
        </div>

        {/* Your stats — local, no login */}
        {stats && stats.games > 0 && (
          <div className="space-y-1.5">
            <label className="font-pixel text-[10px] text-retro-dim tracking-wider">YOUR STATS</label>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'WINS', val: stats.wins, col: 'text-retro-win' },
                { label: 'LOSSES', val: stats.losses, col: 'text-retro-p2' },
                { label: 'BEST STREAK', val: stats.bestStreak, col: 'text-retro-cta' },
              ].map(({ label, val, col }) => (
                <div key={label} className="bg-retro-card border border-retro-border rounded py-2">
                  <p className={cn('font-pixel text-base', col)}>{val}</p>
                  <p className="font-pixel text-[7px] text-retro-dim mt-1 tracking-wider">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PWA install */}
        {canInstall && (
          <button
            onClick={install}
            className="w-full py-2.5 flex items-center justify-center gap-2 border border-retro-p1/30
              bg-retro-card text-retro-p1 font-pixel text-[10px] rounded
              hover:border-retro-p1/60 hover:shadow-neon-p1 transition-all active:scale-95"
          >
            + ADD TO HOME SCREEN
          </button>
        )}

        <Link to="/demo" className="block text-center font-mono text-xs text-retro-dim hover:text-retro-p1 transition-colors">
          PRACTICE OFFLINE →
        </Link>
      </div>
    </div>
  )
}
