import { useEffect, useMemo, useRef, useState } from 'react'
import ArrowsBoard from '../components/ArrowsBoard'
import { RaceRow } from '../components/ArrowsHud'
import {
  generateArrowsLevel,
  applyArrowTap,
  freeArrows,
  countGone,
  arrowsRoundWinner,
  randomArrowsSeed,
  ARROWS_LIVES,
  ARROWS_TIERS,
} from '../lib/arrowsLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Practice race: you and a bot clear identical copies of the same board.
// The bot works on its own copy (never yours), clearing one open arrow per
// beat and occasionally fumbling a blocked one, exactly like a live rival.
const BOT_MS = { easy: 1700, medium: 1500, hard: 1300 }
const BOT_FUMBLE = 0.08

export default function ArrowsDemo() {
  const [tier, setTier] = useState('easy')
  const [seed, setSeed] = useState(() => randomArrowsSeed())
  const level = useMemo(() => generateArrowsLevel(seed, tier), [seed, tier])
  const total = level.arrows.length
  const [gone, setGone] = useState(() => Array(total).fill(false))
  const [lives, setLives] = useState(ARROWS_LIVES)
  const [bot, setBot] = useState({ gone: Array(total).fill(false), lives: ARROWS_LIVES })
  const [feedback, setFeedback] = useState(null)
  const streak = useRef(0)

  const winner = arrowsRoundWinner({
    total,
    clearedX: countGone(gone),
    clearedO: countGone(bot.gone),
    livesX: lives,
    livesO: bot.lives,
  })

  const reset = (nextTier = tier) => {
    const nextSeed = randomArrowsSeed()
    const n = generateArrowsLevel(nextSeed, nextTier).arrows.length
    setTier(nextTier)
    setSeed(nextSeed)
    setGone(Array(n).fill(false))
    setLives(ARROWS_LIVES)
    setBot({ gone: Array(n).fill(false), lives: ARROWS_LIVES })
    setFeedback(null)
    streak.current = 0
  }

  // Bot beat: one tap on its own board.
  useEffect(() => {
    if (winner) return
    const t = setTimeout(() => {
      setBot((prev) => {
        const open = freeArrows(level, prev.gone)
        if (open.length === 0) return prev
        const fumble = Math.random() < BOT_FUMBLE
        const blocked = prev.gone.map((g, i) => (!g && !open.includes(i) ? i : -1)).filter((i) => i >= 0)
        const pick = fumble && blocked.length
          ? blocked[Math.floor(Math.random() * blocked.length)]
          : open[Math.floor(Math.random() * open.length)]
        const applied = applyArrowTap(level, prev.gone, prev.lives, pick)
        return applied ? { gone: applied.gone, lives: applied.lives } : prev
      })
    }, BOT_MS[tier])
    return () => clearTimeout(t)
  }, [bot, winner, level, tier])

  useEffect(() => {
    if (!winner) return
    if (winner === 'X') sounds.win()
    else if (winner === 'draw') sounds.draw()
    else sounds.lose()
  }, [winner])

  const handleTap = (index) => {
    if (winner) return
    const applied = applyArrowTap(level, gone, lives, index)
    if (!applied) return
    if (applied.result === 'blocked') {
      streak.current = 0
      setLives(applied.lives)
      setFeedback({ index, blocker: applied.blocker, gap: applied.gap, key: Date.now() })
      sounds.buzz()
      return
    }
    setGone(applied.gone)
    sounds.hit(Math.min(streak.current, 8))
    streak.current += 1
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-2">
        {ARROWS_TIERS.map((t) => (
          <button
            key={t}
            onClick={() => reset(t)}
            className={cn(
              'px-3 py-2 font-pixel text-[9px] rounded border transition-all active:scale-95',
              tier === t
                ? 'border-retro-cta text-retro-cta'
                : 'border-retro-border text-retro-dim hover:border-retro-cta/50',
            )}
          >
            {t.toUpperCase()}
          </button>
        ))}
      </div>
      <p className="text-center font-pixel text-[8px] text-retro-dim leading-relaxed">
        TAP AN ARROW WITH A CLEAR PATH — IT SLIDES OFF. BLOCKED TAPS COST A LIFE.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <RaceRow name="YOU" sym="X" isMe cleared={countGone(gone)} total={total} lives={lives} />
        <RaceRow name="BOT" sym="O" cleared={countGone(bot.gone)} total={total} lives={bot.lives} />
      </div>
      <div className="relative">
        <ArrowsBoard
          key={`${seed}-${tier}`}
          level={level}
          gone={gone}
          onTap={handleTap}
          interactive={!winner}
          feedback={feedback}
        />
        {winner && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-retro-bg/80 rounded-lg">
            <p className={cn(
              'font-pixel text-sm',
              winner === 'X' ? 'text-retro-win text-glow-win' : 'text-retro-dim',
            )}>
              {winner === 'X' ? 'BOARD CLEAR!' : lives <= 0 ? 'OUT OF LIVES' : winner === 'draw' ? 'DRAW' : 'BOT CLEARED FIRST'}
            </p>
            <button
              onClick={() => reset()}
              className="px-5 py-2.5 font-pixel text-[10px] border border-retro-cta text-retro-cta rounded hover:shadow-neon-cta active:scale-95"
            >
              NEW BOARD
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
