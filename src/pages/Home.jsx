import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ref, set } from 'firebase/database'
import { db, configError } from '../lib/firebase'
import { generateGameId } from '../lib/gameLogic'
import { CF_BOARD_SIZE } from '../lib/connectFourLogic'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

const GAMES = [
  {
    type: 'tictactoe',
    label: 'TIC TAC TOE',
    desc: '3 × 3',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <line x1="8" y1="2" x2="8" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/>
        <line x1="16" y1="2" x2="16" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/>
        <line x1="2" y1="8" x2="22" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/>
        <line x1="2" y1="16" x2="22" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/>
      </svg>
    ),
  },
  {
    type: 'connectfour',
    label: 'CONNECT FOUR',
    desc: '6 × 7',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {[3, 9, 15, 21].map(cx =>
          [4, 12, 20].map(cy => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.5"
              fill="currentColor" opacity={cy === 4 ? '1' : '0.4'} />
          ))
        )}
      </svg>
    ),
  },
]

export default function Home() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(() => sounds.isMuted())
  const { canInstall, install } = useInstallPrompt()

  const toggleMute = () => setMuted(sounds.toggle())

  const saveName = () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('ENTER YOUR NAME FIRST'); return null }
    sessionStorage.setItem('playerName', trimmed)
    return trimmed
  }

  const createGame = async (gameType) => {
    const playerName = saveName()
    if (!playerName) return
    setLoading(gameType)
    setError('')
    try {
      const gameId = generateGameId()
      const boardSize = gameType === 'connectfour' ? CF_BOARD_SIZE : 9
      await set(ref(db, `games/${gameId}`), {
        gameType,
        status: 'waiting',
        board: Array(boardSize).fill(''),
        currentTurn: 'X',
        scores: { X: 0, O: 0 },
        createdAt: Date.now(),
        players: { X: { name: playerName, joinedAt: Date.now() } },
      })
      sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: 'X', name: playerName }))
      navigate(`/game/${gameId}`)
    } catch {
      setError('CONNECTION ERROR. TRY AGAIN.')
      setLoading(null)
    }
  }

  const joinGame = () => {
    const playerName = saveName()
    if (!playerName) return
    const code = joinCode.trim().toUpperCase()
    if (!code) { setError('ENTER A GAME CODE'); return }
    navigate(`/game/${code}`)
  }

  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center p-4 relative">
      {/* Mute toggle — fixed top-right */}
      <button
        onClick={toggleMute}
        title={muted ? 'Unmute sounds' : 'Mute sounds'}
        className="fixed top-4 right-4 z-10 text-retro-dim hover:text-retro-text transition-colors p-2 rounded border border-retro-border bg-retro-card"
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
      {configError && (
        <div className="w-full max-w-sm mb-6 border border-retro-pink/50 bg-retro-card rounded px-4 py-3">
          <p className="font-pixel text-[9px] text-retro-pink">FIREBASE NOT CONFIGURED</p>
          <p className="font-mono text-xs text-retro-dim mt-1">{configError}</p>
        </div>
      )}

      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-14 h-14 border-2 border-retro-yellow bg-[#1a1500] rounded
            flex items-center justify-center shadow-neon-yellow">
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
              <line x1="10" y1="2" x2="10" y2="28" stroke="#ffe600" strokeWidth="2.5" strokeLinecap="square"/>
              <line x1="20" y1="2" x2="20" y2="28" stroke="#ffe600" strokeWidth="2.5" strokeLinecap="square"/>
              <line x1="2" y1="10" x2="28" y2="10" stroke="#ffe600" strokeWidth="2.5" strokeLinecap="square"/>
              <line x1="2" y1="20" x2="28" y2="20" stroke="#ffe600" strokeWidth="2.5" strokeLinecap="square"/>
            </svg>
          </div>
          <div>
            <h1 className="font-pixel text-xl text-retro-yellow text-glow-yellow leading-relaxed">
              GAME NIGHT
            </h1>
            <p className="font-mono text-xs text-retro-dim mt-2 tracking-widest">
              PLAY WITH FRIENDS — NO ACCOUNT NEEDED
            </p>
          </div>
        </div>

        {/* Name input */}
        <div className="space-y-1.5">
          <label className="font-pixel text-[9px] text-retro-dim tracking-wider">YOUR NAME</label>
          <input
            type="text"
            placeholder="PLAYER ONE"
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            maxLength={20}
            autoFocus
            className="w-full bg-retro-card border-2 border-retro-border text-retro-text
              font-mono text-sm placeholder-retro-border rounded px-4 py-3
              focus:outline-none focus:border-retro-cyan transition-colors"
          />
        </div>

        {/* Game selection */}
        <div className="space-y-1.5">
          <label className="font-pixel text-[9px] text-retro-dim tracking-wider">SELECT GAME</label>
          <div className="grid grid-cols-2 gap-3">
            {GAMES.map(({ type, label, desc, icon }) => (
              <button
                key={type}
                onClick={() => createGame(type)}
                disabled={!!loading}
                className={cn(
                  'flex flex-col items-center gap-2.5 py-4 px-2 border-2 rounded',
                  'transition-all active:scale-95',
                  loading === type
                    ? 'border-retro-yellow bg-[#1a1500] shadow-neon-yellow'
                    : 'border-retro-border bg-retro-card hover:border-retro-yellow/50',
                  loading && loading !== type && 'opacity-40',
                )}
              >
                <div className={cn(
                  'w-10 h-10 rounded flex items-center justify-center',
                  loading === type ? 'text-retro-yellow' : 'text-retro-dim',
                )}>
                  {icon}
                </div>
                <div className="text-center">
                  <p className="font-pixel text-[9px] text-retro-text leading-relaxed">{label}</p>
                  <p className="font-mono text-[10px] text-retro-dim mt-0.5">{desc}</p>
                </div>
                {loading === type && (
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-1 h-1 bg-retro-yellow rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-retro-border" />
          <span className="font-pixel text-[9px] text-retro-border">OR JOIN</span>
          <div className="flex-1 h-px bg-retro-border" />
        </div>

        {/* Join game */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="GAME CODE"
            value={joinCode}
            onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError('') }}
            onKeyDown={e => e.key === 'Enter' && joinGame()}
            maxLength={6}
            className="flex-1 bg-retro-card border-2 border-retro-border text-retro-cyan
              font-pixel text-xs placeholder-retro-border rounded px-4 py-3
              focus:outline-none focus:border-retro-cyan tracking-widest transition-colors"
          />
          <button
            onClick={joinGame}
            className="px-5 py-3 bg-retro-card border-2 border-retro-border text-retro-text
              font-pixel text-[9px] rounded hover:border-retro-cyan/50 transition-colors active:scale-95"
          >
            JOIN
          </button>
        </div>

        {error && (
          <p className="font-pixel text-[9px] text-retro-pink text-center animate-pulse">{error}</p>
        )}

        {/* PWA install */}
        {canInstall && (
          <button
            onClick={install}
            className="w-full py-2.5 flex items-center justify-center gap-2 border border-retro-cyan/30
              bg-retro-card text-retro-cyan font-pixel text-[9px] rounded
              hover:border-retro-cyan/60 hover:shadow-neon-cyan transition-all active:scale-95"
          >
            + ADD TO HOME SCREEN
          </button>
        )}
      </div>
    </div>
  )
}
