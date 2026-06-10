import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ref, onValue, update, get, runTransaction, onDisconnect, set as dbSet } from 'firebase/database'
import { db, configError } from '../lib/firebase'
import { normalizeBoard } from '../lib/gameLogic'
import { freshGameState, getGameConfig } from '../lib/games'
import { getPlayerId } from '../lib/playerId'
import GameStatus from '../components/GameStatus'
import PlayerCard from '../components/PlayerCard'
import WaitingRoom from '../components/WaitingRoom'
import WinEffect from '../components/WinEffect'
import HangmanGame from './HangmanGame'
import ProposalBanner from '../components/ProposalBanner'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import ThemeSwitcher from '../components/ThemeSwitcher'

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
          <div key={i} className="w-3 h-3 bg-retro-cta rounded-full animate-bounce shadow-neon-cta"
            style={{ animationDelay: `${i * 200}ms` }} />
        ))}
      </div>
    </div>
  )
}

export default function Game() {
  const { gameId } = useParams()
  const [game, setGame] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [opponentOnline, setOpponentOnline] = useState(true)
  const [showWinEffect, setShowWinEffect] = useState(false)
  const [winEffectWinner, setWinEffectWinner] = useState(null)
  const [muted, setMuted] = useState(() => sounds.isMuted())
  const [needName, setNeedName] = useState(false)
  const [nameVersion, setNameVersion] = useState(0)
  const [nameInput, setNameInput] = useState('')
  const [nameError, setNameError] = useState('')
  const mySymbol = useRef(null)
  const prevStatus = useRef(null)
  const prevTurn = useRef(null)
  const prevFilledCount = useRef(0)
  const prevProposal = useRef(null)

  // Firebase init: join room, set up listeners, set up presence
  useEffect(() => {
    if (configError || !db) {
      setError(configError || 'Firebase is not configured.')
      setLoading(false)
      return
    }

    const playerName = sessionStorage.getItem('playerName')
    if (!playerName) {
      setNeedName(true)
      setLoading(false)
      return
    }

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

      if (stored && JSON.parse(stored).symbol) {
        // 1. Valid sessionStorage record
        mySymbol.current = JSON.parse(stored).symbol
      } else {
        // 2. Try playerId reclaim
        const myId = getPlayerId()
        if (data.players?.X?.playerId === myId) {
          mySymbol.current = 'X'
          sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: 'X', name: playerName }))
          try { await update(ref(db, `games/${gameId}/players/X`), { name: playerName }) } catch { /* ignore */ }
        } else if (data.players?.O?.playerId === myId) {
          mySymbol.current = 'O'
          sessionStorage.setItem(`game-${gameId}`, JSON.stringify({ symbol: 'O', name: playerName }))
          try { await update(ref(db, `games/${gameId}/players/O`), { name: playerName }) } catch { /* ignore */ }
        } else if (!data.players?.O) {
          // 3. Claim O slot via transaction
          try {
            const { committed } = await runTransaction(
              ref(db, `games/${gameId}/players/O`),
              current => {
                if (current !== null) return
                return { name: playerName, joinedAt: Date.now(), playerId: getPlayerId() }
              }
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
          // 4. Spectator
          mySymbol.current = null
        }
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
  }, [gameId, nameVersion])

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

    const cfg = getGameConfig(game.gameType)
    const filledCount = cfg.boardSize ? normalizeBoard(game.board, cfg.boardSize).filter(Boolean).length : 0

    if (cfg.applyMove) {
      // Games with applyMove (e.g. dots and boxes): detect opponent moves by filled count increase
      if (
        game.status === 'playing' &&
        filledCount > prevFilledCount.current &&
        prevTurn.current &&
        prevTurn.current !== mySymbol.current
      ) {
        sounds.move(prevTurn.current)
      }
    } else {
      // Standard games: opponent's move = turn flipped to mine
      if (
        game.status === 'playing' &&
        prevTurn.current &&
        game.currentTurn !== prevTurn.current &&
        game.currentTurn === mySymbol.current
      ) {
        sounds.move(prevTurn.current)
      }
    }

    prevStatus.current = game.status
    prevTurn.current = game.currentTurn
    prevFilledCount.current = filledCount
  }, [game])

  // Proposal effect — sound + declined toast
  useEffect(() => {
    if (!game) return
    const proposal = game.proposal ?? null

    // Opponent newly proposed — play join sound
    if (
      proposal &&
      !proposal.declined &&
      proposal.by !== mySymbol.current &&
      mySymbol.current &&
      !prevProposal.current
    ) {
      sounds.join()
    }

    // Opponent declined my proposal (guard: only on the transition to declined)
    if (
      proposal &&
      proposal.declined &&
      proposal.by === mySymbol.current &&
      !prevProposal.current?.declined
    ) {
      const opSym = mySymbol.current === 'X' ? 'O' : 'X'
      const opName = (game.players?.[opSym]?.name || opSym).toUpperCase()
      toast.error(`${opName} DECLINED`)
      update(ref(db, `games/${gameId}`), { proposal: null }).catch(() => {})
    }

    prevProposal.current = proposal
  }, [game, gameId])

  const handleMove = async (colOrIndex) => {
    if (!game || !mySymbol.current) return
    if (game.status !== 'playing') return
    if (game.currentTurn !== mySymbol.current) return

    const cfg = getGameConfig(game.gameType)
    if (cfg.custom) return
    const board = normalizeBoard(game.board, cfg.boardSize)
    const index = cfg.getMoveIndex(board, colOrIndex)
    if (index === -1) return

    let updates, result
    if (cfg.applyMove) {
      const applied = cfg.applyMove({ board, game, index, move: colOrIndex, symbol: mySymbol.current })
      if (!applied) return
      updates = applied.updates
      result = applied.result
    } else {
      const newBoard = [...board]
      newBoard[index] = mySymbol.current
      result = cfg.getWinner(newBoard)
      updates = { board: newBoard, currentTurn: mySymbol.current === 'X' ? 'O' : 'X' }
    }

    sounds.move(mySymbol.current)

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

  // Apply functions (called directly when no second player / opponent offline)
  const applyPlayAgain = async () => {
    try {
      await update(ref(db, `games/${gameId}`), {
        ...freshGameState(game.gameType),
        status: 'playing',
        winner: null,
        winningLine: null,
        proposal: null,
      })
    } catch { toast.error('PLAY AGAIN FAILED — CHECK CONNECTION') }
  }

  const applyNewMatch = async () => {
    try {
      await update(ref(db, `games/${gameId}`), {
        ...freshGameState(game.gameType),
        status: 'playing',
        winner: null,
        winningLine: null,
        'scores/X': 0,
        'scores/O': 0,
        proposal: null,
      })
    } catch { toast.error('NEW MATCH FAILED — CHECK CONNECTION') }
  }

  const applySwitchGame = async (newType) => {
    sessionStorage.removeItem(`hangwoman-word-${gameId}`)
    try {
      await update(ref(db, `games/${gameId}`), {
        gameType: newType,
        ...freshGameState(newType),
        status: 'playing',
        winner: null,
        winningLine: null,
        'scores/X': 0,
        'scores/O': 0,
        proposal: null,
      })
    } catch { toast.error('SWITCH FAILED — CHECK CONNECTION') }
  }

  // Propose or apply directly (if solo / opponent offline)
  const propose = async (action, gameType = null) => {
    if (!game || !mySymbol.current) return
    if (!game.players?.O || opponentOnline === false) {
      if (action === 'playAgain') { applyPlayAgain(); return }
      if (action === 'newMatch') { applyNewMatch(); return }
      if (action === 'switch') { applySwitchGame(gameType); return }
    }
    try {
      await update(ref(db, `games/${gameId}`), {
        proposal: { action, gameType, by: mySymbol.current, declined: false },
      })
    } catch { toast.error('PROPOSAL FAILED — CHECK CONNECTION') }
  }

  const acceptProposal = async () => {
    if (!game?.proposal) return
    const { action, gameType: gt } = game.proposal
    if (action === 'playAgain') { applyPlayAgain(); return }
    if (action === 'newMatch') { applyNewMatch(); return }
    if (action === 'switch') { applySwitchGame(gt); return }
  }

  const declineProposal = async () => {
    try {
      await update(ref(db, `games/${gameId}`), { 'proposal/declined': true })
    } catch { toast.error('DECLINE FAILED — CHECK CONNECTION') }
  }

  const cancelProposal = async () => {
    try {
      await update(ref(db, `games/${gameId}`), { proposal: null })
    } catch { toast.error('CANCEL FAILED — CHECK CONNECTION') }
  }

  const toggleMute = () => setMuted(sounds.toggle())

  // Feature A — name prompt for invited players
  if (needName) {
    const handleNameSubmit = () => {
      const trimmed = nameInput.trim()
      if (!trimmed) { setNameError('ENTER YOUR NAME FIRST'); return }
      sessionStorage.setItem('playerName', trimmed)
      setNeedName(false)
      setLoading(true)
      setNameVersion(v => v + 1)
    }

    return (
      <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h2 className="font-pixel text-sm text-retro-cta text-glow-cta">YOU&apos;RE INVITED!</h2>
          <p className="font-mono text-xs text-retro-dim">
            ROOM <span className="text-retro-p1 text-glow-p1 tracking-widest">{gameId}</span>
          </p>
          <input
            type="text"
            placeholder="PLAYER ONE"
            value={nameInput}
            onChange={e => { setNameInput(e.target.value); setNameError('') }}
            onKeyDown={e => e.key === 'Enter' && handleNameSubmit()}
            maxLength={20}
            autoFocus
            aria-label="Your name"
            className="w-full bg-retro-card border-2 border-retro-border text-retro-text font-pixel text-xs tracking-widest placeholder-retro-border rounded px-4 py-3 focus:outline-none focus:border-retro-p1 transition-colors"
          />
          {nameError && (
            <p className="font-pixel text-[10px] text-retro-p2 animate-pulse">{nameError}</p>
          )}
          <button
            onClick={handleNameSubmit}
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
          >
            JOIN GAME
          </button>
        </div>
      </div>
    )
  }

  if (loading) return <LoadingScreen />

  if (error) {
    return (
      <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center gap-5 p-4">
        <p className="font-pixel text-[10px] text-retro-p2 text-center max-w-xs leading-relaxed">{error}</p>
        <Link to="/" className="font-pixel text-[10px] text-retro-p1 text-glow-p1 hover:opacity-80 transition-opacity">
          ← BACK TO HOME
        </Link>
      </div>
    )
  }

  if (!game) return null

  const cfg = getGameConfig(game.gameType)
  const isCustom = !!cfg.custom
  const board = isCustom ? [] : normalizeBoard(game.board, cfg.boardSize)
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

  // Proposal: hide action buttons while a proposal is pending (not declined by me)
  const activeProposal = game.proposal && !game.proposal.declined ? game.proposal : null

  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center p-4 pt-5">
      {showWinEffect && (
        <WinEffect winner={winEffectWinner} onDone={() => setShowWinEffect(false)} />
      )}

      <div className={cn('w-full space-y-4', cfg.maxWidth)} key={game.gameType}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link to="/" className="font-pixel text-[10px] text-retro-dim hover:text-retro-p1 transition-colors">
            ← HOME
          </Link>
          <div className="flex items-center gap-3">
            <ThemeSwitcher />
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
            {cfg.badge && (
              <span className="font-pixel text-[8px] text-retro-dim border border-retro-border px-2 py-0.5 rounded">{cfg.badge}</span>
            )}
            <span className="font-pixel text-[10px] text-retro-p1 text-glow-p1 tracking-widest">{gameId}</span>
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

        {/* Disconnect warning (non-custom — hangwoman handles this inline) */}
        {!isCustom && !isSpectator && !opponentOnline && game.status === 'playing' && (
          <p className="font-pixel text-[10px] text-retro-p2 text-center leading-relaxed animate-pulse">
            OPPONENT DISCONNECTED
          </p>
        )}

        {/* Proposal banner — shown for both standard and custom branches */}
        {activeProposal && game.status !== 'waiting' && (
          <ProposalBanner
            proposal={activeProposal}
            mySymbol={mySymbol.current}
            players={game.players}
            onAccept={acceptProposal}
            onDecline={declineProposal}
            onCancel={cancelProposal}
          />
        )}

        {/* Game area */}
        {game.status === 'waiting' ? (
          <WaitingRoom gameId={gameId} />
        ) : isCustom ? (
          <HangmanGame
            gameId={gameId}
            game={game}
            mySymbol={mySymbol.current}
            opponentOnline={opponentOnline}
            onSwitchGame={activeProposal ? null : (t) => propose('switch', t)}
            onNewMatch={activeProposal ? null : () => propose('newMatch')}
            proposal={activeProposal}
          />
        ) : (
          <>
            <cfg.BoardComponent
              board={board}
              onMove={handleMove}
              disabled={!canMove}
              winningLine={winningLine}
              currentTurn={game.currentTurn}
              {...(cfg.boardProps ? cfg.boardProps(game) : {})}
            />
            <GameStatus
              status={game.status}
              winner={game.winner}
              currentTurn={game.currentTurn}
              mySymbol={mySymbol.current}
              scores={game.scores}
              players={game.players}
              gameType={game.gameType}
              onPlayAgain={game.status === 'finished' && !isSpectator && !matchWinner && !activeProposal ? () => propose('playAgain') : null}
              onNewMatch={matchWinner && !isSpectator && !activeProposal ? () => propose('newMatch') : null}
              onSwitchGame={!isSpectator && !activeProposal ? (t) => propose('switch', t) : null}
            />
          </>
        )}

        {!isCustom && isSpectator && game.status === 'playing' && (
          <p className="text-center font-pixel text-[10px] text-retro-border">SPECTATING</p>
        )}
      </div>
    </div>
  )
}
