import { useEffect, useRef, useState } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import ArrowsBoard from '../components/ArrowsBoard'
import {
  getLevel,
  normalizeCleared,
  countClears,
  applyTap,
  getArrowsWinner,
  getClearableCount,
  arrowsMatchWinner,
  getArrowsMatchEnd,
  ARROWS_LIVES,
  ARROWS_MATCH_TARGET,
  ARROWS_MAX_ROUNDS,
} from '../lib/arrowsLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const TIER_LABEL = { easy: 'EASY', medium: 'MEDIUM', hard: 'HARD' }
const INTRO_MS = 1200

function Lives({ n }) {
  return (
    <span className="flex gap-1" aria-label={`${n} lives`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-3.5 h-3.5"
          style={{
            background: i < n ? 'rgb(var(--c-danger))' : 'rgb(var(--c-structure))',
            opacity: i < n ? 1 : 0.25,
            clipPath: 'polygon(50% 0%, 100% 35%, 82% 100%, 50% 78%, 18% 100%, 0% 35%)',
          }}
        />
      ))}
    </span>
  )
}

function HudSide({ sym, name, isMe, clears, lives, score, out }) {
  const isX = sym === 'X'
  return (
    <div
      className={cn(
        'bg-retro-card border rounded p-2.5 space-y-1',
        isMe ? (isX ? 'border-retro-p1/60' : 'border-retro-p2/60') : 'border-retro-border',
        out && 'opacity-60',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn('font-pixel text-[9px] truncate', isX ? 'text-retro-p1' : 'text-retro-p2')}>
          {name?.toUpperCase() ?? sym}
        </span>
        <span className="flex items-center gap-1.5">
          {out && <span className="font-pixel text-[7px] text-retro-dim border border-retro-border rounded px-1">OUT</span>}
          <span className="font-pixel text-[9px] text-retro-dim tabular-nums">{score}</span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-retro-text tabular-nums">{clears} <span className="text-[9px] text-retro-dim">CLR</span></span>
        <Lives n={lives} />
      </div>
    </div>
  )
}

function ArrowsResult({ clears, livesX, livesO, winner, mySymbol, players }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {['X', 'O'].map((sym) => {
        const cl = sym === 'X' ? clears.X : clears.O
        const lives = sym === 'X' ? livesX : livesO
        const col = sym === 'X' ? 'text-retro-p1' : 'text-retro-p2'
        const border = mySymbol === sym
          ? (sym === 'X' ? 'border-retro-p1/60' : 'border-retro-p2/60')
          : 'border-retro-border'
        return (
          <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', border, lives <= 0 && 'opacity-60')}>
            <p className={cn('font-pixel text-[8px]', col)}>{players?.[sym]?.name?.toUpperCase() ?? sym}</p>
            <p className={cn('font-pixel text-xl', winner === sym ? 'text-retro-win text-glow-win' : 'text-retro-text')}>{cl}</p>
            <div className="flex items-center justify-center gap-2">
              <span className="font-pixel text-[7px] text-retro-dim">CLEARED</span>
              <Lives n={lives} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function ArrowsGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const isSpectator = !mySymbol
  const level = getLevel(game.arrowsLevel)
  const cleared = normalizeCleared(game.arrowsCleared, level.arrows.length)
  const livesX = game.arrowsLivesX ?? ARROWS_LIVES
  const livesO = game.arrowsLivesO ?? ARROWS_LIVES
  const myLives = mySymbol === 'X' ? livesX : livesO
  const clears = countClears(cleared)
  const scoreX = game.scores?.X || 0
  const scoreO = game.scores?.O || 0
  // Target hits end the match immediately; otherwise the match ends when the
  // final round finishes (leader wins, level scores draw) — never a 4th board.
  const targetWinner = arrowsMatchWinner(game.scores)
  const matchEnd = targetWinner ?? getArrowsMatchEnd(game)
  const matchOver = !!matchEnd
  const roundNum = (game.arrowsRound ?? 0) + 1
  const clearable = getClearableCount(level)
  const revealTraps = !!game.arrowsTrapSeen
  const showTip = game.status === 'playing' && roundNum === 1 && !game.arrowsTrapSeen

  const [shakeSignal, setShakeSignal] = useState(null)
  const [stolenSignal, setStolenSignal] = useState(null)
  const [showIntro, setShowIntro] = useState(true)
  const lastBlockedAt = useRef(null)

  // Round-start interstitial beat: brief coaching overlay per round. The reset
  // to visible on level change is the point of the effect (same pattern as the
  // NumberMemoryDemo countdown reset).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intro must re-show synchronously on each new level, then dismiss on a timer
    setShowIntro(true)
    const t = setTimeout(() => setShowIntro(false), INTRO_MS)
    return () => clearTimeout(t)
  }, [game.arrowsLevel])

  // Remote trap feedback: shake on the opponent's blocked taps too, so both
  // sides see the cost — not just the tapper.
  useEffect(() => {
    const last = game.arrowsLastBlocked
    if (!last || typeof last.index !== 'number') return
    if (last.at === lastBlockedAt.current) return
    lastBlockedAt.current = last.at
    if (last.by === mySymbol) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Firebase echo arrives as a prop change; shaking here is the event handler
    setShakeSignal({ index: last.index, key: last.at })
  }, [game.arrowsLastBlocked, mySymbol])

  const liveMsg = game.status === 'finished'
    ? (game.winner === 'draw' ? `Round over. Draw. Clears X ${clears.X}, O ${clears.O}.`
      : `Round over. ${game.winner} wins the round. Clears X ${clears.X}, O ${clears.O}.`)
    : `Round ${roundNum} of ${ARROWS_MAX_ROUNDS}. Clears X ${clears.X}, O ${clears.O}. Lives X ${livesX}, O ${livesO}.`

  const handleTap = async (index) => {
    if (!game || isSpectator) return
    if (game.status !== 'playing') return
    if (myLives <= 0) return
    if (cleared[index]) return
    const arrow = level.arrows[index]
    if (!arrow) return

    // No audio before confirmation: sound (and shake/stolen) fires only from
    // the transaction result below, so a raced tap never plays a false clear.
    let appliedTap = null
    let txResult
    const gameRef = ref(db, `games/${gameId}`)
    try {
      txResult = await runTransaction(gameRef, (current) => {
        if (!current || current.status === 'finished') return
        const lvl = getLevel(current.arrowsLevel)
        const clr = normalizeCleared(current.arrowsCleared, lvl.arrows.length)
        const lives = { X: current.arrowsLivesX ?? ARROWS_LIVES, O: current.arrowsLivesO ?? ARROWS_LIVES }
        const applied = applyTap(lvl, clr, lives, index, mySymbol)
        if (!applied) return
        appliedTap = applied.tap
        const updates = {
          arrowsCleared: applied.cleared,
          arrowsLivesX: applied.lives.X,
          arrowsLivesO: applied.lives.O,
          lastActivityAt: Date.now(),
        }
        if (applied.tap.result === 'blocked') {
          // Teach-once trap tell: the first trap of the match reveals traps.
          if (!current.arrowsTrapSeen) updates.arrowsTrapSeen = true
          updates.arrowsLastBlocked = { index, by: mySymbol, at: Date.now() }
        }
        const winner = getArrowsWinner(lvl, applied.cleared, applied.lives.X, applied.lives.O)
        if (winner) {
          updates.winner = winner
          updates.status = 'finished'
          if (winner !== 'draw') {
            const scores = { ...(current.scores || {}) }
            scores[winner] = (scores[winner] || 0) + 1
            updates.scores = scores
          }
        }
        return { ...current, ...updates }
      })
    } catch {
      toast.error('TAP FAILED — CHECK CONNECTION')
      return
    }
    if (!txResult?.committed || !appliedTap) {
      // Someone else cleared it first (or the round just ended): flash stolen.
      setStolenSignal({ index, key: Date.now() })
      sounds.miss()
      return
    }
    if (appliedTap.result === 'blocked') {
      setShakeSignal({ index, key: Date.now() })
      sounds.miss()
    } else {
      sounds.hit(clears.X + clears.O)
    }
  }

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <ArrowsResult
          clears={clears}
          livesX={livesX}
          livesO={livesO}
          winner={game.winner}
          mySymbol={mySymbol}
          players={game.players}
        />
        <GameStatus
          status={game.status}
          winner={game.winner}
          mySymbol={mySymbol}
          scores={game.scores}
          players={game.players}
          gameType={game.gameType}
          matchTarget={ARROWS_MATCH_TARGET}
          matchOver={matchOver}
          matchWinnerOverride={matchEnd}
          onPlayAgain={!matchOver && !proposal && !isSpectator ? onPlayAgain : null}
          onNewMatch={matchOver && !proposal && !isSpectator ? onNewMatch : null}
          onSwitchGame={!proposal && !isSpectator ? onSwitchGame : null}
        />
      </div>
    )
  }

  const hud = (
    <div className="grid grid-cols-2 gap-2">
      <HudSide
        sym="X"
        name={game.players?.X?.name}
        isMe={mySymbol === 'X'}
        clears={clears.X}
        lives={livesX}
        score={scoreX}
        out={livesX <= 0}
      />
      <HudSide
        sym="O"
        name={game.players?.O?.name}
        isMe={mySymbol === 'O'}
        clears={clears.O}
        lives={livesO}
        score={scoreO}
        out={livesO <= 0}
      />
    </div>
  )

  if (isSpectator) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between font-pixel text-[9px] text-retro-dim tracking-wider">
          <span>ROUND {roundNum}/{ARROWS_MAX_ROUNDS} · {TIER_LABEL[level.tier] ?? level.tier.toUpperCase()} — {level.label}</span>
          <span className="tabular-nums">{scoreX} – {scoreO}</span>
        </div>
        <p className="text-center font-pixel text-[9px] text-retro-dim">SPECTATING · FIRST TO {ARROWS_MATCH_TARGET}</p>
        {hud}
        <ArrowsBoard key={game.arrowsLevel} level={level} cleared={cleared} interactive={false} revealTraps={revealTraps} shakeSignal={shakeSignal} />
        <p className="sr-only" aria-live="polite">{liveMsg}</p>
        {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  const canTap = game.status === 'playing' && myLives > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between font-pixel text-[9px] text-retro-dim tracking-wider">
        <span>ROUND {roundNum}/{ARROWS_MAX_ROUNDS} · {TIER_LABEL[level.tier] ?? level.tier.toUpperCase()}</span>
        <span className="tabular-nums">{scoreX} – {scoreO}</span>
      </div>
      <p className="text-center font-pixel text-[8px] text-retro-dim tracking-wider">
        {level.label} · {clearable} ARROWS · 1 TRAP · FIRST TO {ARROWS_MATCH_TARGET}
      </p>
      {level.fallback && (
        <p className="text-center font-pixel text-[8px] text-retro-cta">
          STALE BOARD SWAPPED — PLAYING FALLBACK LEVEL
        </p>
      )}

      {showIntro && game.status === 'playing' && (
        <div className="bg-retro-card border border-retro-cta/50 rounded p-3 text-center space-y-1">
          <p className="font-pixel text-[10px] text-retro-cta text-glow-cta">
            ROUND {roundNum} — {TIER_LABEL[level.tier] ?? level.tier.toUpperCase()}
          </p>
          <p className="font-pixel text-[8px] text-retro-dim">
            {level.label} · {clearable} ARROWS · 1 TRAP
          </p>
        </div>
      )}
      {showTip && (
        <p className="text-center font-pixel text-[8px] text-retro-cta border border-retro-cta/40 rounded px-2 py-1.5">
          ONE ARROW IS A TRAP — THREE LIVES
        </p>
      )}

      {hud}

      <ArrowsBoard
        key={game.arrowsLevel}
        level={level}
        cleared={cleared}
        onTap={handleTap}
        interactive={canTap}
        shakeSignal={shakeSignal}
        stolenSignal={stolenSignal}
        revealTraps={revealTraps}
      />
      <p className="sr-only" aria-live="polite">{liveMsg}</p>

      {!canTap && game.status === 'playing' && myLives <= 0 && (
        <p className="text-center font-pixel text-[9px] text-retro-danger tracking-wider">
          OUT OF LIVES — SPECTATING
        </p>
      )}

      {!opponentOnline && (
        <p className="text-center font-pixel text-[8px] text-retro-dim">OPPONENT OFFLINE</p>
      )}
    </div>
  )
}
