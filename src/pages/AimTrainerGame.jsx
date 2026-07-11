import { useEffect, useRef, useState } from 'react'
import { ref, update, runTransaction, increment } from 'firebase/database'
import { db } from '../lib/firebase'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import { sounds } from '../lib/sounds'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const RADIUS   = 24
const MIN_DIST = RADIUS * 2 + 8 // px gap between target centers so they never overlap or touch edges
const GAME_MS  = 30_000
const LEAD_MS  = 3_000

function ResultsPanel({ scoreX, scoreO, hitsX, hitsO, friendlyX, friendlyO, mySymbol, players }) {
  const winner = scoreX > scoreO ? 'X' : scoreX < scoreO ? 'O' : null
  const diff   = Math.abs(scoreX - scoreO)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {['X', 'O'].map(sym => {
          const score  = sym === 'X' ? scoreX    : scoreO
          const hits   = sym === 'X' ? hitsX     : hitsO
          const ff     = sym === 'X' ? friendlyX : friendlyO
          const col    = sym === 'X' ? 'text-retro-p1' : 'text-retro-p2'
          const border = mySymbol === sym
            ? (sym === 'X' ? 'border-retro-p1/60' : 'border-retro-p2/60')
            : 'border-retro-border'
          return (
            <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', border)}>
              <p className={cn('font-pixel text-[8px]', col)}>
                {players?.[sym]?.name?.toUpperCase() ?? sym}
              </p>
              <p className={cn('font-pixel text-xl', winner === sym ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
                {score}
              </p>
              <p className="font-pixel text-[8px] text-retro-dim">net pts</p>
              <div className="font-pixel text-[8px] space-y-0.5 pt-1">
                <p><span className="text-retro-dim">HITS </span><span className="text-retro-cta">{hits}</span></p>
                <p>
                  <span className="text-retro-dim">FF   </span>
                  <span className={ff > 0 ? 'text-retro-p2' : 'text-retro-cta'}>{ff}</span>
                </p>
              </div>
            </div>
          )
        })}
      </div>
      {winner ? (
        <p className="font-pixel text-[8px] text-retro-dim text-center">
          {players?.[winner]?.name?.toUpperCase() ?? winner} SCORED{' '}
          <span className="text-retro-win">{diff} MORE POINT{diff !== 1 ? 'S' : ''}</span>
        </p>
      ) : (
        <p className="font-pixel text-[8px] text-retro-dim text-center">EQUAL SCORE — DRAW!</p>
      )}
    </div>
  )
}

export default function AimTrainerGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const myKey = mySymbol === 'X' ? 'X' : 'O'
  const opKey = myKey === 'X' ? 'O' : 'X'

  const [now, setNow]    = useState(() => Date.now())
  const containerRef      = useRef(null)
  const hasSpawnedRef     = useRef(false)

  const endTime    = game.aimEndTime ?? null
  const isCountdown = !!endTime && now < endTime - GAME_MS
  const isActive    = !!endTime && now >= endTime - GAME_MS && now < endTime
  const countdownSec = isCountdown ? Math.ceil((endTime - GAME_MS - now) / 1000) : 0
  const timeLeft    = isActive    ? Math.ceil((endTime - now) / 1000) : 0

  const myTarget = game[`aimTarget${myKey}`] ?? null
  const opTarget = game[`aimTarget${opKey}`] ?? null
  const myScore  = game[`aimScore${myKey}`]  ?? 0
  const opScore  = game[`aimScore${opKey}`]  ?? 0

  const tryFinish = async () => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.status === 'finished') return
        const sx = current.aimScoreX ?? 0
        const so = current.aimScoreO ?? 0
        const winner = sx > so ? 'X' : sx < so ? 'O' : 'draw'
        const scores = { ...(current.scores || {}) }
        if (winner !== 'draw') scores[winner] = (scores[winner] || 0) + 1
        return { ...current, winner, status: 'finished', scores }
      })
    } catch { /* other client resolved */ }
  }

  // Rejection-samples a position, retrying a few times if it lands within
  // MIN_DIST of `avoid` (the other player's current target) so the two
  // targets can never overlap or sit edge-to-edge.
  const randomPos = (avoid) => {
    const el = containerRef.current
    if (!el) return null
    const { width, height } = el.getBoundingClientRect()
    if (!width || !height) return null
    const avoidPx = avoid ? { x: avoid.xPct * width, y: avoid.yPct * height } : null
    let pos = null
    for (let attempt = 0; attempt < 12; attempt++) {
      const xPct = (RADIUS + Math.random() * (width  - 2 * RADIUS)) / width
      const yPct = (RADIUS + Math.random() * (height - 2 * RADIUS)) / height
      pos = { xPct, yPct }
      if (!avoidPx) break
      const dx = xPct * width - avoidPx.x
      const dy = yPct * height - avoidPx.y
      if (Math.hypot(dx, dy) >= MIN_DIST) break
    }
    return pos
  }

  const spawnTarget = async () => {
    const pos = randomPos(game[`aimTarget${opKey}`] ?? null)
    if (!pos) return
    try {
      await update(ref(db, `games/${gameId}`), { [`aimTarget${myKey}`]: pos })
    } catch { /* ignore */ }
  }

  // Ticker: drives countdown display, first-target spawn, and game-over detection
  useEffect(() => {
    if (!endTime) return
    hasSpawnedRef.current = false
    const id = setInterval(() => {
      const t = Date.now()
      if (!hasSpawnedRef.current && mySymbol && t >= endTime - GAME_MS) {
        hasSpawnedRef.current = true
        spawnTarget()
      }
      if (t >= endTime) { clearInterval(id); tryFinish() }
      else setNow(t)
    }, 100)
    return () => clearInterval(id)
  }, [endTime]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartClick = async () => {
    if (endTime) return
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.aimEndTime) return
        return { ...current, aimEndTime: Date.now() + LEAD_MS + GAME_MS }
      })
    } catch { toast.error('START FAILED — CHECK CONNECTION') }
  }

  const handleOwnTargetClick = async (e) => {
    e.stopPropagation()
    if (!isActive || !mySymbol) return
    sounds.hit(game[`aimHits${myKey}`] ?? 0)
    const pos = randomPos(opTarget)
    if (!pos) return
    try {
      await update(ref(db, `games/${gameId}`), {
        [`aimTarget${myKey}`]: pos,
        [`aimScore${myKey}`]: increment(1),
        [`aimHits${myKey}`]:  increment(1),
      })
    } catch { /* ignore */ }
  }

  const handleOpponentTargetClick = async (e) => {
    e.stopPropagation()
    if (!isActive || !mySymbol) return
    sounds.miss()
    try {
      await update(ref(db, `games/${gameId}`), {
        [`aimScore${myKey}`]:    increment(-1),
        [`aimFriendly${myKey}`]: increment(1),
      })
    } catch { /* ignore */ }
  }

  // Render a positioned target button. Position is expressed as a % of the
  // container (not measured pixels) so this never needs to read containerRef
  // during render — the click handlers still measure it, but only on click.
  const renderTarget = (target, sym) => {
    if (!target) return null
    const isOwn = sym === myKey
    return (
      <button
        onClick={isOwn ? handleOwnTargetClick : handleOpponentTargetClick}
        style={{
          position:  'absolute',
          left:      `${target.xPct * 100}%`,
          top:       `${target.yPct * 100}%`,
          transform: 'translate(-50%, -50%)',
          width:     RADIUS * 2,
          height:    RADIUS * 2,
        }}
        className={cn(
          'rounded-full active:scale-90 transition-transform duration-75',
          sym === 'X'
            ? 'bg-retro-p1 shadow-neon-p1 hover:brightness-110'
            : 'bg-retro-p2 shadow-neon-p2 hover:brightness-110',
        )}
        aria-label={isOwn ? 'your target' : "opponent's target"}
      />
    )
  }

  const matchWinner = (game.scores?.X || 0) >= 3 ? 'X' : (game.scores?.O || 0) >= 3 ? 'O' : null

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <ResultsPanel
          scoreX={game.aimScoreX ?? 0}   scoreO={game.aimScoreO ?? 0}
          hitsX={game.aimHitsX ?? 0}     hitsO={game.aimHitsO ?? 0}
          friendlyX={game.aimFriendlyX ?? 0} friendlyO={game.aimFriendlyO ?? 0}
          mySymbol={mySymbol} players={game.players}
        />
        <GameStatus
          status={game.status} winner={game.winner} mySymbol={mySymbol}
          scores={game.scores} players={game.players} gameType={game.gameType}
          onPlayAgain={!matchWinner && !proposal ? onPlayAgain : null}
          onNewMatch={matchWinner && !proposal ? onNewMatch : null}
          onSwitchGame={!proposal ? onSwitchGame : null}
        />
      </div>
    )
  }

  if (!mySymbol) {
    return (
      <div className="space-y-4">
        <SpectatorCard game={game} statusOverride={!endTime ? 'WAITING TO START' : undefined} />
        {endTime && (
          <div className="bg-retro-card border border-retro-border rounded p-3 text-center">
            <div className="flex justify-around font-pixel text-[8px]">
              <span className="text-retro-p1">X: {game.aimScoreX ?? 0}</span>
              <span className="text-retro-p2">O: {game.aimScoreO ?? 0}</span>
            </div>
            <p className="font-pixel text-[7px] text-retro-dim/70 mt-1">THIS ROUND</p>
          </div>
        )}
        {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Score + timer header */}
      {endTime && (
        <div className="flex items-center justify-between px-1">
          <span className="font-pixel text-[9px] text-retro-p1">
            {game.players?.X?.name?.toUpperCase() ?? 'X'} {myKey === 'X' ? myScore : opScore}
          </span>
          <span className={cn('font-pixel text-2xl tabular-nums',
            isCountdown ? 'text-retro-dim' :
            isActive    ? 'text-retro-win text-glow-win' : 'text-retro-dim'
          )}>
            {isCountdown ? countdownSec : timeLeft}
          </span>
          <span className="font-pixel text-[9px] text-retro-p2">
            {myKey === 'O' ? myScore : opScore} {game.players?.O?.name?.toUpperCase() ?? 'O'}
          </span>
        </div>
      )}

      {/* Game area */}
      <div
        ref={containerRef}
        className={cn(
          'relative w-full h-[min(16rem,52vh)] rounded-xl border-2 overflow-hidden select-none',
          isActive    ? 'bg-retro-surface border-retro-border cursor-crosshair' :
          isCountdown ? 'bg-retro-surface/60 border-retro-border/50 cursor-default' :
                        'bg-retro-surface border-retro-border cursor-default',
        )}
      >
        {!endTime && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <p className="font-pixel text-sm text-retro-dim">AIM TRAINER</p>
            <p className="font-pixel text-[8px] text-retro-dim text-center leading-loose">
              SHOOT YOUR COLOR · MISS = −1 PT · 30s
            </p>
            <button
              onClick={handleStartClick}
              className="px-6 py-3 min-h-11 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
            >
              START
            </button>
          </div>
        )}

        {isCountdown && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <p className="font-pixel text-6xl text-retro-win text-glow-win">{countdownSec}</p>
            <p className="font-pixel text-[9px] text-retro-dim arcade-blink">GET READY!</p>
          </div>
        )}

        {isActive && (
          <>
            {renderTarget(myTarget, myKey)}
            {renderTarget(opTarget, opKey)}
          </>
        )}
      </div>

      {/* Live stats */}
      {isActive && (
        <div className="flex justify-center gap-6 font-pixel text-[8px] text-retro-dim">
          <span>HITS <span className="text-retro-p1">{game[`aimHits${myKey}`] ?? 0}</span></span>
          <span>FF <span className="text-retro-p2">{game[`aimFriendly${myKey}`] ?? 0}</span></span>
        </div>
      )}

      {!opponentOnline && mySymbol && <OfflineNotice label="OPPONENT" />}
      {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
    </div>
  )
}
