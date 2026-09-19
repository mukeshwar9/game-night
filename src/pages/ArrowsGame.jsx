import { useState } from 'react'
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
  ARROWS_LIVES,
  ARROWS_MATCH_TARGET,
} from '../lib/arrowsLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const TIER_LABEL = { easy: 'EASY', medium: 'MEDIUM', hard: 'HARD' }

function Lives({ n }) {
  return (
    <span className="flex gap-1" aria-label={`${n} lives`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2.5 h-2.5"
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

function HudSide({ sym, name, isMe, clears, lives, score }) {
  const isX = sym === 'X'
  return (
    <div
      className={cn(
        'bg-retro-card border rounded p-2.5 space-y-1',
        isMe ? (isX ? 'border-retro-p1/60' : 'border-retro-p2/60') : 'border-retro-border',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn('font-pixel text-[9px] truncate', isX ? 'text-retro-p1' : 'text-retro-p2')}>
          {name?.toUpperCase() ?? sym}
        </span>
        <span className="font-pixel text-[9px] text-retro-dim tabular-nums">{score}</span>
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
          <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', border)}>
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
  const matchWinner = scoreX >= ARROWS_MATCH_TARGET ? 'X' : scoreO >= ARROWS_MATCH_TARGET ? 'O' : null
  const roundNum = (game.arrowsRound ?? 0) + 1

  const [shakeSignal, setShakeSignal] = useState(null)

  const handleTap = async (index) => {
    if (!game || isSpectator) return
    if (game.status !== 'playing') return
    if (myLives <= 0) return
    if (cleared[index]) return
    const arrow = level.arrows[index]
    if (!arrow) return

    if (arrow.blocked) {
      setShakeSignal({ index, key: Date.now() })
      sounds.miss()
    } else {
      sounds.hit()
    }

    const gameRef = ref(db, `games/${gameId}`)
    try {
      await runTransaction(gameRef, (current) => {
        if (!current || current.status === 'finished') return
        const lvl = getLevel(current.arrowsLevel)
        const clr = normalizeCleared(current.arrowsCleared, lvl.arrows.length)
        const lives = { X: current.arrowsLivesX ?? ARROWS_LIVES, O: current.arrowsLivesO ?? ARROWS_LIVES }
        const applied = applyTap(lvl, clr, lives, index, mySymbol)
        if (!applied) return
        const updates = {
          arrowsCleared: applied.cleared,
          arrowsLivesX: applied.lives.X,
          arrowsLivesO: applied.lives.O,
          lastActivityAt: Date.now(),
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
          onPlayAgain={!matchWinner && !proposal && !isSpectator ? onPlayAgain : null}
          onNewMatch={matchWinner && !proposal && !isSpectator ? onNewMatch : null}
          onSwitchGame={!proposal && !isSpectator ? onSwitchGame : null}
        />
      </div>
    )
  }

  if (isSpectator) {
    return (
      <div className="space-y-4">
        <div className="bg-retro-card border border-retro-border rounded p-4 text-center space-y-2">
          <p className="font-pixel text-[9px] text-retro-dim">SPECTATING</p>
          <div className="flex justify-around font-pixel text-base">
            <span className="text-retro-p1">X {clears.X}</span>
            <span className="text-retro-p2">{clears.O} O</span>
          </div>
        </div>
        <ArrowsBoard key={game.arrowsLevel} level={level} cleared={cleared} interactive={false} />
        {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  const canTap = game.status === 'playing' && myLives > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between font-pixel text-[9px] text-retro-dim tracking-wider">
        <span>ROUND {roundNum} · {TIER_LABEL[level.tier] ?? level.tier.toUpperCase()}</span>
        <span className="tabular-nums">{scoreX} – {scoreO}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <HudSide
          sym="X"
          name={game.players?.X?.name}
          isMe={mySymbol === 'X'}
          clears={clears.X}
          lives={livesX}
          score={scoreX}
        />
        <HudSide
          sym="O"
          name={game.players?.O?.name}
          isMe={mySymbol === 'O'}
          clears={clears.O}
          lives={livesO}
          score={scoreO}
        />
      </div>

      <ArrowsBoard
        key={game.arrowsLevel}
        level={level}
        cleared={cleared}
        onTap={handleTap}
        interactive={canTap}
        shakeSignal={shakeSignal}
      />

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
