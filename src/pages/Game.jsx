import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ref, onValue, update, get, runTransaction, onDisconnect, set as dbSet } from 'firebase/database'
import { db, configError } from '../lib/firebase'
import { getWinner, normalizeBoard } from '../lib/gameLogic'
import { getConnectFourWinner, getConnectFourDrop, CF_BOARD_SIZE } from '../lib/connectFourLogic'
import Board from '../components/Board'
import ConnectFourBoard from '../components/ConnectFourBoard'
import GameStatus from '../components/GameStatus'
import PlayerCard from '../components/PlayerCard'
import WaitingRoom from '../components/WaitingRoom'
import WinEffect from '../components/WinEffect'
import HangmanGame from './HangmanGame'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const GAME_TTL_MS = 24 * 60 * 60 * 1000

function toArray(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  return Object.values(val)
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-retro-bg flex items-center justify-center">
      <div className="flex gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-3 h-3 bg-retro-yellow rounded-full animate-bounce shadow-neon-yellow"
            style={{ animationDelay: `${i * 200}ms` }} />
        ))}
      </div>
    </div>
  )
}

export default function Game() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const [game, setGame] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [opponentOnline, setOpponentOnline] = useState(true)
  const [showWinEffect, setShowWinEffect] = useState(false)
  const [winEffectWinner, setWinEffectWinner] = useState(null)
  const [muted, setMuted] = useState(() => sounds.isMuted())
  const mySymbol = useRef(null)
  const prevStatus = useRef(null)
  const prevTurn = useRef(null)

  // Firebase init: join room, set up listeners, set up presence
  useEffect(() => {
    if (configError || !db) {
      setError(configError || 'Firebase is not configured.')
      setLoading(false)
      return
    }

    const playerName = sessionStorage.getItem('playerName')
    if (!playerName) { navigate('/'); return }

    const gameRef = ref(db, `games/${gameId}`)
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

      if (data.createdAt && Date.now() - data.createdAt > GAME_TTL_MS) {
        setError('THIS GAME HAS EXPIRED. CREATE A NEW ONE!')
        setLoading(false)
        return
      }

      const stored = sessionStorage.getItem(`game-${gameId}`)

      if (stored) {
        mySymbol.current = JSON.parse(stored).symbol
      } else if (!data.players?.O) {
        try {
          const { committed } = await runTransaction(
            ref(db, `games/${gameId}/players/O`),
            current => { if (current !== null) return; return { name: playerName, joinedAt: Date.now() } }
          )
          if (committed) {
            mySymbol.current = 'O'
            sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: 'O', name: playerName }))
            const joinUpdates = { status: 'playing' }
            if (data.gameType === 'hangwoman') {
              joinUpdates['round/setter'] = 'X'
              joinUpdates['round/phase'] = 'setting'
              joinUpdates['round/wrongCount'] = 0
            }
            await update(gameRef, joinUpdates)
          } else {
            mySymbol.current = null
            sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: null }))
          }
        } catch { mySymbol.current = null }
      } else {
        mySymbol.current = null
      }

      if (cancelled) return
      setLoading(false)

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
      if (mySymbol.current && db) {
        const presRef = ref(db, `games/${gameId}/presence/${mySymbol.current}`)
        onDisconnect(presRef).cancel().catch(() => {})
        dbSet(presRef, { online: false }).catch(() => {})
      }
    }
  }, [gameId, navigate])

  // Sounds + win effect — react to game state changes
  useEffect(() => {
    if (!game) return

    if (prevStatus.current === 'waiting' && game.status === 'playing') {
      sounds.join()
    }

    if (prevStatus.current === 'playing' && game.status === 'finished') {
      const w = game.winner
      if (w === 'draw') sounds.draw()
      else if (w === mySymbol.current) sounds.win()
      else if (mySymbol.current) sounds.lose()
      setWinEffectWinner(w)
      setShowWinEffect(true)
    }

    // Opponent's move: turn flipped to mine = opponent just moved
    if (
      game.status === 'playing' &&
      prevTurn.current &&
      game.currentTurn !== prevTurn.current &&
      game.currentTurn === mySymbol.current
    ) {
      sounds.move(prevTurn.current)
    }

    prevStatus.current = game.status
    prevTurn.current = game.currentTurn
  }, [game])

  const handleMove = async (colOrIndex) => {
    if (!game || !mySymbol.current) return
    if (game.status !== 'playing') return
    if (game.currentTurn !== mySymbol.current) return

    const isConnectFour = game.gameType === 'connectfour'
    const boardSize = isConnectFour ? CF_BOARD_SIZE : 9
    const board = normalizeBoard(game.board, boardSize)

    let index
    if (isConnectFour) {
      index = getConnectFourDrop(board, colOrIndex)
      if (index === -1) return
    } else {
      index = colOrIndex
      if (board[index]) return
    }

    sounds.move(mySymbol.current)

    const newBoard = [...board]
    newBoard[index] = mySymbol.current

    const result = isConnectFour ? getConnectFourWinner(newBoard) : getWinner(newBoard)
    const updates = {
      board: newBoard,
      currentTurn: mySymbol.current === 'X' ? 'O' : 'X',
    }

    if (result) {
      updates.winner = result.winner
      updates.status = 'finished'
      if (result.line?.length) updates.winningLine = result.line
      if (result.winner !== 'draw') {
        updates[`scores/${result.winner}`] = (game.scores?.[result.winner] || 0) + 1
      }
    }

    try { await update(ref(db, `games/${gameId}`), updates) } catch { toast.error('MOVE FAILED — CHECK CONNECTION') }
  }

  const handlePlayAgain = async () => {
    const boardSize = game.gameType === 'connectfour' ? CF_BOARD_SIZE : 9
    try {
      await update(ref(db, `games/${gameId}`), {
        board: Array(boardSize).fill(''),
        currentTurn: 'X',
        status: 'playing',
        winner: null,
        winningLine: null,
      })
    } catch { toast.error('PLAY AGAIN FAILED — CHECK CONNECTION') }
  }

  const handleNewMatch = async () => {
    const boardSize = game.gameType === 'connectfour' ? CF_BOARD_SIZE : 9
    try {
      await update(ref(db, `games/${gameId}`), {
        board: Array(boardSize).fill(''),
        currentTurn: 'X',
        status: 'playing',
        winner: null,
        winningLine: null,
        'scores/X': 0,
        'scores/O': 0,
      })
    } catch { toast.error('NEW MATCH FAILED — CHECK CONNECTION') }
  }

  const toggleMute = () => setMuted(sounds.toggle())

  if (loading) return <LoadingScreen />

  if (error) {
    return (
      <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center gap-5 p-4">
        <p className="font-pixel text-[10px] text-retro-pink text-center max-w-xs leading-relaxed">{error}</p>
        <Link to="/" className="font-pixel text-[9px] text-retro-cyan text-glow-cyan hover:opacity-80 transition-opacity">
          ← BACK TO HOME
        </Link>
      </div>
    )
  }

  if (!game) return null

  const isConnectFour = game.gameType === 'connectfour'
  const isHangman = game.gameType === 'hangwoman'
  const boardSize = isConnectFour ? CF_BOARD_SIZE : 9
  const board = isHangman ? [] : normalizeBoard(game.board, boardSize)
  const winningLine = toArray(game.winningLine)
  const isSpectator = !mySymbol.current
  const canMove = !isSpectator && game.status === 'playing' && game.currentTurn === mySymbol.current

  const scoreX = game.scores?.X || 0
  const scoreO = game.scores?.O || 0
  const matchWinner = scoreX >= 3 ? 'X' : scoreO >= 3 ? 'O' : null

  // Presence: show dot for players — green for me, live status for opponent
  const getPresence = (sym) => {
    if (isSpectator) return undefined
    if (sym === mySymbol.current) return true
    return opponentOnline
  }

  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center p-4 pt-5">
      {showWinEffect && (
        <WinEffect winner={winEffectWinner} onDone={() => setShowWinEffect(false)} />
      )}

      <div className={cn('w-full space-y-4', isConnectFour ? 'max-w-md' : 'max-w-sm')} key={game.gameType}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link to="/" className="font-pixel text-[9px] text-retro-dim hover:text-retro-cyan transition-colors">
            ← HOME
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleMute}
              title={muted ? 'Unmute sounds' : 'Mute sounds'}
              className="text-retro-dim hover:text-retro-text transition-colors p-1 rounded"
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
            {isConnectFour && (
              <span className="font-pixel text-[8px] text-retro-dim border border-retro-border px-2 py-0.5 rounded">C4</span>
            )}
            {isHangman && (
              <span className="font-pixel text-[8px] text-retro-dim border border-retro-border px-2 py-0.5 rounded">HW</span>
            )}
            <span className="font-pixel text-[9px] text-retro-cyan text-glow-cyan tracking-widest">{gameId}</span>
          </div>
        </div>

        {/* Players */}
        <div className="grid grid-cols-2 gap-2">
          <PlayerCard
            name={game.players?.X?.name}
            symbol="X"
            isActive={game.status === 'playing' && game.currentTurn === 'X'}
            isMe={mySymbol.current === 'X'}
            score={scoreX}
            online={getPresence('X')}
          />
          <PlayerCard
            name={game.players?.O?.name}
            symbol="O"
            isActive={game.status === 'playing' && game.currentTurn === 'O'}
            isMe={mySymbol.current === 'O'}
            score={scoreO}
            online={getPresence('O')}
          />
        </div>

        {/* Disconnect warning (non-hangman — hangman handles this inline) */}
        {!isHangman && !isSpectator && !opponentOnline && game.status === 'playing' && (
          <p className="font-pixel text-[9px] text-retro-pink text-center leading-relaxed animate-pulse">
            OPPONENT DISCONNECTED
          </p>
        )}

        {/* Game area */}
        {game.status === 'waiting' ? (
          <WaitingRoom gameId={gameId} />
        ) : isHangman ? (
          <HangmanGame
            gameId={gameId}
            game={game}
            mySymbol={mySymbol.current}
            opponentOnline={opponentOnline}
          />
        ) : (
          <>
            {isConnectFour ? (
              <ConnectFourBoard
                board={board}
                onMove={handleMove}
                disabled={!canMove}
                winningLine={winningLine}
                currentTurn={game.currentTurn}
              />
            ) : (
              <Board board={board} onMove={handleMove} disabled={!canMove} winningLine={winningLine} />
            )}
            <GameStatus
              status={game.status}
              winner={game.winner}
              currentTurn={game.currentTurn}
              mySymbol={mySymbol.current}
              scores={game.scores}
              players={game.players}
              onPlayAgain={game.status === 'finished' && !isSpectator && !matchWinner ? handlePlayAgain : null}
              onNewMatch={matchWinner && !isSpectator ? handleNewMatch : null}
            />
          </>
        )}

        {!isHangman && isSpectator && game.status === 'playing' && (
          <p className="text-center font-pixel text-[9px] text-retro-border">SPECTATING</p>
        )}
      </div>
    </div>
  )
}
