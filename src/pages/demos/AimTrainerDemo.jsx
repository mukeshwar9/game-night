import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

const DEMO_R       = 20
const DEMO_GAME_MS = 30_000

export default function AimTrainerDemo() {
  const [phase, setPhase]         = useState('idle')
  const [countdownSec, setCDown]  = useState(3)
  const [timeLeft, setTimeLeft]   = useState(30)
  const [targetYou, setTargetYou] = useState(null)
  const [targetBot, setTargetBot] = useState(null)
  const [scoreYou, setScoreYou]   = useState(0)
  const [hitsYou,  setHitsYou]    = useState(0)
  const [ffYou,    setFfYou]      = useState(0)
  const [scoreBot, setScoreBot]   = useState(0)
  const containerRef = useRef(null)
  const endTimeRef   = useRef(null)
  const botTimerRef  = useRef(null)

  const spawnLocal = () => {
    const el = containerRef.current
    if (!el) return null
    const { width, height } = el.getBoundingClientRect()
    return {
      x: DEMO_R + Math.random() * (width  - 2 * DEMO_R),
      y: DEMO_R + Math.random() * (height - 2 * DEMO_R),
    }
  }

  // 3-2-1 countdown
  useEffect(() => {
    if (phase !== 'countdown') return
    let c = 3
    const id = setInterval(() => {
      c--
      if (c <= 0) {
        clearInterval(id)
        endTimeRef.current = Date.now() + DEMO_GAME_MS
        setTargetYou(spawnLocal())
        setTargetBot(spawnLocal())
        setPhase('active')
      } else {
        setCDown(c)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [phase])

  // 30s game timer
  useEffect(() => {
    if (phase !== 'active') return
    const id = setInterval(() => {
      const rem = Math.ceil((endTimeRef.current - Date.now()) / 1000)
      if (rem <= 0) { clearInterval(id); setPhase('done') }
      else setTimeLeft(rem)
    }, 100)
    return () => clearInterval(id)
  }, [phase])

  // Bot auto-clicks its own target
  useEffect(() => {
    if (phase !== 'active') return
    const scheduleBot = () => {
      botTimerRef.current = setTimeout(() => {
        if (phase !== 'active') return
        setScoreBot(s => s + 1)
        setTargetBot(spawnLocal())
        scheduleBot()
      }, 400 + Math.floor(Math.random() * 350))
    }
    scheduleBot()
    return () => clearTimeout(botTimerRef.current)
  }, [phase])

  const handleYouTargetClick = (e) => {
    e.stopPropagation()
    if (phase !== 'active') return
    setScoreYou(s => s + 1)
    setHitsYou(h => h + 1)
    setTargetYou(spawnLocal())
  }

  const handleBotTargetClick = (e) => {
    e.stopPropagation()
    if (phase !== 'active') return
    setScoreYou(s => s - 1)
    setFfYou(f => f + 1)
    // bot target stays
  }

  const reset = () => {
    clearTimeout(botTimerRef.current)
    setPhase('idle'); setCDown(3); setTimeLeft(30)
    setTargetYou(null); setTargetBot(null)
    setScoreYou(0); setHitsYou(0); setFfYou(0); setScoreBot(0)
  }

  if (phase === 'done') {
    const winner = scoreYou > scoreBot ? 'YOU' : scoreYou < scoreBot ? 'BOT' : null
    const diff   = Math.abs(scoreYou - scoreBot)
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'YOU', score: scoreYou, hits: hitsYou, ff: ffYou, w: winner === 'YOU', col: 'retro-p1' },
            { label: 'BOT', score: scoreBot, hits: scoreBot, ff: 0,    w: winner === 'BOT', col: 'retro-p2' },
          ].map(({ label, score, hits, ff, w, col }) => (
            <div key={label} className={`bg-retro-card border border-${col}/50 rounded p-3 text-center space-y-1`}>
              <p className={`font-pixel text-[8px] text-${col}`}>{label}</p>
              <p className={cn('font-pixel text-xl', w ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
                {score}
              </p>
              <p className="font-pixel text-[8px] text-retro-dim">net pts</p>
              <p className="font-pixel text-[8px] text-retro-cta">{hits} hits</p>
              {ff > 0 && <p className="font-pixel text-[8px] text-retro-p2">{ff} FF</p>}
            </div>
          ))}
        </div>
        {winner ? (
          <p className="font-pixel text-[8px] text-retro-dim text-center">
            <span className={winner === 'YOU' ? 'text-retro-p1' : 'text-retro-p2'}>{winner}</span>
            {' SCORED '}
            <span className="text-retro-win">{diff} MORE POINT{diff !== 1 ? 'S' : ''}</span>
          </p>
        ) : (
          <p className="font-pixel text-[8px] text-retro-dim text-center">DRAW!</p>
        )}
        <button onClick={reset}
          className="w-full py-2 font-pixel text-[9px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95">
          PLAY AGAIN
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {phase !== 'idle' && (
        <div className="flex items-center justify-between px-1">
          <span className="font-pixel text-[9px] text-retro-p1">YOU {scoreYou}</span>
          <span className={cn('font-pixel text-2xl tabular-nums',
            phase === 'countdown' ? 'text-retro-dim' : 'text-retro-win text-glow-win'
          )}>
            {phase === 'countdown' ? countdownSec : timeLeft}
          </span>
          <span className="font-pixel text-[9px] text-retro-p2">{scoreBot} BOT</span>
        </div>
      )}

      <div
        ref={containerRef}
        className={cn(
          'relative w-full h-56 rounded-xl border-2 overflow-hidden select-none',
          phase === 'active'    ? 'bg-retro-surface border-retro-border cursor-crosshair' :
          phase === 'countdown' ? 'bg-retro-surface/60 border-retro-border/50 cursor-default' :
                                  'bg-retro-surface border-retro-border cursor-default',
        )}
      >
        {phase === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <p className="font-pixel text-sm text-retro-dim">AIM TRAINER</p>
            <p className="font-pixel text-[8px] text-retro-dim text-center leading-loose">
              SHOOT YOUR COLOR · MISS = −1 PT · 30s
            </p>
            <button
              onClick={e => { e.stopPropagation(); setPhase('countdown') }}
              className="px-6 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
            >
              START
            </button>
          </div>
        )}
        {phase === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <p className="font-pixel text-6xl text-retro-win text-glow-win">{countdownSec}</p>
            <p className="font-pixel text-[9px] text-retro-dim arcade-blink">GET READY!</p>
          </div>
        )}
        {phase === 'active' && targetYou && (
          <button
            onClick={handleYouTargetClick}
            style={{
              position: 'absolute',
              left: targetYou.x - DEMO_R, top: targetYou.y - DEMO_R,
              width: DEMO_R * 2, height: DEMO_R * 2,
            }}
            className="rounded-full bg-retro-p1 shadow-neon-p1 hover:brightness-110 active:scale-90 transition-transform duration-75"
            aria-label="your target"
          />
        )}
        {phase === 'active' && targetBot && (
          <button
            onClick={handleBotTargetClick}
            style={{
              position: 'absolute',
              left: targetBot.x - DEMO_R, top: targetBot.y - DEMO_R,
              width: DEMO_R * 2, height: DEMO_R * 2,
            }}
            className="rounded-full bg-retro-p2 shadow-neon-p2 hover:brightness-110 active:scale-90 transition-transform duration-75"
            aria-label="bot's target"
          />
        )}
      </div>

      {phase === 'active' && (
        <div className="flex justify-center gap-6 font-pixel text-[8px] text-retro-dim">
          <span>HITS <span className="text-retro-p1">{hitsYou}</span></span>
          <span>FF <span className="text-retro-p2">{ffYou}</span></span>
        </div>
      )}
    </div>
  )
}
