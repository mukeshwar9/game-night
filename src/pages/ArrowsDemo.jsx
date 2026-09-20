import { useEffect, useRef, useState } from 'react'
import ArrowsBoard from '../components/ArrowsBoard'
import {
  getLevel,
  applyTap,
  getArrowsWinner,
  getClearableCount,
  pickLevelId,
  ARROWS_LIVES,
} from '../lib/arrowsLogic'
import { ARROWS_TIERS } from '../lib/levels/arrows'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

const BOT_MS = 1100

function freshBoard(tier, rng = Math.random) {
  const id = pickLevelId(tier, rng)
  const level = getLevel(id)
  return {
    level,
    cleared: Array(level.arrows.length).fill(''),
    lives: { X: ARROWS_LIVES, O: ARROWS_LIVES },
    trapSeen: false,
  }
}

export default function ArrowsDemo() {
  const [tier, setTier] = useState('easy')
  const [board, setBoard] = useState(() => freshBoard('easy'))
  const [shakeSignal, setShakeSignal] = useState(null)
  const [winner, setWinner] = useState(null)
  const botTimer = useRef(null)
  const stateRef = useRef(board)
  useEffect(() => { stateRef.current = board })

  const reset = (nextTier = tier) => {
    clearTimeout(botTimer.current)
    setWinner(null)
    setShakeSignal(null)
    setBoard(freshBoard(nextTier))
  }

  useEffect(() => () => clearTimeout(botTimer.current), [])

  // Practice rival: taps a random arrow ~every second (usually clearable,
  // sometimes the trap) so the board feels like the live race.
  useEffect(() => {
    if (winner) return
    botTimer.current = setTimeout(() => {
      const s = stateRef.current
      const open = s.cleared
        .map((c, i) => (c ? -1 : i))
        .filter((i) => i >= 0)
      if (open.length === 0) return
      const clearable = open.filter((i) => !s.level.arrows[i].blocked)
      const pickBot = clearable.length > 0 && Math.random() > 0.15
        ? clearable[Math.floor(Math.random() * clearable.length)]
        : open[Math.floor(Math.random() * open.length)]
      setBoard((prev) => {
        const applied = applyTap(prev.level, prev.cleared, prev.lives, pickBot, 'O')
        if (!applied) return prev
        const w = getArrowsWinner(prev.level, applied.cleared, applied.lives.X, applied.lives.O)
        if (w) {
          setWinner(w)
          if (w === 'draw') sounds.draw()
          else if (w === 'X') sounds.win()
          else sounds.lose()
        } else if (applied.tap.result === 'blocked') {
          setShakeSignal({ index: pickBot, key: Date.now() })
          sounds.miss()
        } else {
          sounds.hit()
        }
        return {
          ...prev,
          cleared: applied.cleared,
          lives: applied.lives,
          trapSeen: prev.trapSeen || applied.tap.result === 'blocked',
        }
      })
    }, BOT_MS)
    return () => clearTimeout(botTimer.current)
  }, [board.cleared, winner])

  const handleTap = (index) => {
    if (winner) return
    const s = stateRef.current
    if (s.cleared[index]) return
    if (s.lives.X <= 0) return
    const applied = applyTap(s.level, s.cleared, s.lives, index, 'X')
    if (!applied) return
    const w = getArrowsWinner(s.level, applied.cleared, applied.lives.X, applied.lives.O)
    if (applied.tap.result === 'blocked') {
      setShakeSignal({ index, key: Date.now() })
      sounds.miss()
    } else {
      sounds.hit()
    }
    if (w) {
      setWinner(w)
      if (w === 'draw') sounds.draw()
      else if (w === 'X') sounds.win()
      else sounds.lose()
    }
    setBoard({
      ...s,
      cleared: applied.cleared,
      lives: applied.lives,
      trapSeen: s.trapSeen || applied.tap.result === 'blocked',
    })
  }

  const youClears = board.cleared.filter((c) => c === 'X').length
  const botClears = board.cleared.filter((c) => c === 'O').length
  const clearable = getClearableCount(board.level)

  return (
    <div className="space-y-3">
      <p className="text-center font-pixel text-[9px] text-retro-dim tracking-wider">
        PRACTICE — {board.level.label} · {clearable} ARROWS · 1 TRAP
      </p>
      <div className="flex justify-center gap-2">
        {ARROWS_TIERS.map((t) => (
          <button
            key={t}
            onClick={() => { setTier(t); reset(t) }}
            className={cn(
              'px-3 py-1.5 font-pixel text-[9px] rounded border transition-all active:scale-95',
              tier === t
                ? 'border-retro-cta text-retro-cta'
                : 'border-retro-border text-retro-dim hover:border-retro-cta/50',
            )}
          >
            {t.toUpperCase()}
          </button>
        ))}
      </div>
      {!board.trapSeen && !winner && (
        <p className="text-center font-pixel text-[8px] text-retro-cta border border-retro-cta/40 rounded px-2 py-1.5">
          ONE ARROW IS A TRAP — THREE LIVES
        </p>
      )}
      <div className="flex justify-around font-pixel text-base">
        <span className="text-retro-p1">YOU {youClears}</span>
        <span className="text-retro-p2">{botClears} BOT</span>
      </div>
      {winner ? (
        <div className="text-center space-y-2">
          <p className={cn(
            'font-pixel text-sm',
            winner === 'X' ? 'text-retro-win text-glow-win' : winner === 'draw' ? 'text-retro-text' : 'text-retro-dim',
          )}>
            {winner === 'X' ? 'YOU CLEAR MORE!' : winner === 'draw' ? 'DRAW!' : 'BOT WINS'}
          </p>
          <button
            onClick={() => reset()}
            className="px-5 py-2 font-pixel text-[10px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95"
          >
            PLAY AGAIN
          </button>
        </div>
      ) : (
        <ArrowsBoard
          level={board.level}
          cleared={board.cleared}
          onTap={handleTap}
          interactive={board.lives.X > 0}
          shakeSignal={shakeSignal}
          revealTraps={board.trapSeen}
        />
      )}
      {board.lives.X <= 0 && !winner && (
        <p className="text-center font-pixel text-[9px] text-retro-danger">OUT OF LIVES — WATCHING BOT</p>
      )}
    </div>
  )
}
