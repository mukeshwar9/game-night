import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

const DEMO_ROUNDS = 4

export default function ReactionDemo() {
  const [phase, setPhase] = useState('start')
  const [times, setTimes] = useState([])
  const [lastTime, setLastTime] = useState(null)
  const [opTimes, setOpTimes] = useState(null)
  const roundStartRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const startRound = () => {
    setPhase('waiting')
    const delay = 1500 + Math.random() * 2500
    timerRef.current = setTimeout(() => {
      setPhase('ready')
      roundStartRef.current = performance.now()
    }, delay)
  }

  const handleClick = () => {
    switch (phase) {
      case 'start': startRound(); break
      case 'waiting':
        clearTimeout(timerRef.current)
        setPhase('too_early')
        break
      case 'ready': {
        const rt = Math.round(performance.now() - roundStartRef.current)
        setLastTime(rt)
        const newTimes = [...times, rt]
        setTimes(newTimes)
        if (newTimes.length === DEMO_ROUNDS) {
          const bot = Array.from({ length: DEMO_ROUNDS }, () => 180 + Math.round(Math.random() * 200))
          setOpTimes(bot)
          setPhase('done')
        } else {
          setPhase('result')
        }
        break
      }
      case 'result': startRound(); break
      case 'too_early': startRound(); break
    }
  }

  const reset = () => {
    clearTimeout(timerRef.current)
    setPhase('start'); setTimes([]); setLastTime(null); setOpTimes(null)
  }

  if (phase === 'done' && opTimes) {
    const avgY = Math.round(times.reduce((a, b) => a + b, 0) / DEMO_ROUNDS)
    const avgB = Math.round(opTimes.reduce((a, b) => a + b, 0) / DEMO_ROUNDS)
    const fastY = Math.min(...times)
    const fastB = Math.min(...opTimes)
    const winner = avgY < avgB ? 'YOU' : avgY > avgB ? 'BOT' : null
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'YOU', a: avgY, f: fastY, w: winner === 'YOU', col: 'retro-p1' },
            { label: 'BOT', a: avgB, f: fastB, w: winner === 'BOT', col: 'retro-p2' },
          ].map(({ label, a, f, w, col }) => (
            <div key={label} className={`bg-retro-card border border-${col}/50 rounded p-3 text-center space-y-1`}>
              <p className={`font-pixel text-[8px] text-${col}`}>{label}</p>
              <p className={cn('font-pixel text-xl', w ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
                {a}<span className="text-[8px] text-retro-dim">ms</span>
              </p>
              <p className="font-pixel text-[8px] text-retro-dim">avg</p>
              <p className="font-pixel text-[9px] text-retro-cta">{f}ms best</p>
            </div>
          ))}
        </div>
        <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1">
          <div className="grid grid-cols-3 font-pixel text-[8px] text-retro-dim pb-1 border-b border-retro-border">
            <span className="text-retro-p1">YOU</span>
            <span className="text-center">RND</span>
            <span className="text-right text-retro-p2">BOT</span>
          </div>
          {times.map((t, i) => (
            <div key={i} className="grid grid-cols-3 font-pixel text-[8px]">
              <span className={t < opTimes[i] ? 'text-retro-win' : 'text-retro-text'}>{t}ms</span>
              <span className="text-center text-retro-dim">{i + 1}</span>
              <span className={cn('text-right', opTimes[i] < t ? 'text-retro-win' : 'text-retro-text')}>{opTimes[i]}ms</span>
            </div>
          ))}
        </div>
        {winner && (
          <p className="font-pixel text-[8px] text-retro-dim text-center">
            <span className={winner === 'YOU' ? 'text-retro-p1' : 'text-retro-p2'}>{winner}</span>
            {' WAS '}
            <span className="text-retro-win">{Math.abs(avgY - avgB)}ms</span>
            {' FASTER ON AVERAGE'}
          </p>
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
      <button
        onClick={handleClick}
        className={cn(
          'w-full rounded-xl border-2 transition-colors duration-75 select-none',
          'min-h-[180px] flex flex-col items-center justify-center gap-2',
          phase === 'ready'     ? 'bg-retro-win/20 border-retro-win shadow-neon-win' :
          phase === 'too_early' ? 'bg-retro-p2/15 border-retro-p2/50' :
                                  'bg-retro-surface border-retro-border',
          'active:scale-[0.98] cursor-pointer',
        )}
      >
        <p className={cn(
          'font-pixel text-center',
          phase === 'ready'     && 'text-3xl text-retro-win text-glow-win',
          phase === 'result'    && 'text-2xl text-retro-cta text-glow-cta',
          phase === 'too_early' && 'text-xl text-retro-p2',
          (phase === 'start' || phase === 'waiting') && 'text-base text-retro-dim',
        )}>
          {phase === 'ready'     ? 'CLICK!'        :
           phase === 'too_early' ? 'TOO EARLY!'    :
           phase === 'result'    ? `${lastTime}ms` :
           phase === 'waiting'   ? 'WAIT...'       :
           'TAP TO START'}
        </p>
        <p className={cn('font-pixel text-[9px]', phase === 'too_early' ? 'text-retro-p2' : 'text-retro-dim arcade-blink')}>
          {phase === 'waiting'   ? "DON'T CLICK YET"                       :
           phase === 'too_early' ? 'TAP TO TRY AGAIN'                      :
           phase === 'result'    ? `ROUND ${times.length}/${DEMO_ROUNDS} — TAP FOR NEXT` :
           phase === 'start'     ? `${DEMO_ROUNDS} ROUNDS · VS BOT`        :
           ''}
        </p>
      </button>
      <div className="flex items-center gap-2 font-pixel text-[8px]">
        <span className="text-retro-dim">ROUND</span>
        <div className="flex gap-1 flex-1">
          {Array.from({ length: DEMO_ROUNDS }, (_, i) => (
            <div key={i} className={cn(
              'flex-1 h-2 rounded-sm border',
              i < times.length ? 'bg-retro-cta border-retro-cta' : 'bg-retro-surface border-retro-border',
            )} />
          ))}
        </div>
        <span className="text-retro-dim">{times.length}/{DEMO_ROUNDS}</span>
      </div>
    </div>
  )
}
