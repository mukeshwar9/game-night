import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { startNBack, stepNBack, NB_LIVES, NB_CELLS, NB_BLOCK } from '../../lib/nBackLogic'
import { sounds } from '../../lib/sounds'
import useGameKeys from '../../hooks/useGameKeys'
import { Lives, BoardHint } from './MemoryParts'

// Step pacing (posture B starting values): the cell is lit for 600 ms of a 2.2 s step.
export const NB_STEP_MS = 2200
const NB_LIT_MS = 600

// N-Back: a cell lights each step; tap MATCH (or Space / M) when it is the same cell
// as the one n steps back. Scored at the end of each step; misses and false alarms
// cost a life. `onChange` reports the run, `onOver(score)` fires once at the end.
export default function NBackBoard({ rand, disabled = false, onChange, onOver }) {
  const [run, setRun] = useState(() => startNBack(rand))
  const [lit, setLit] = useState(true)
  const [pressed, setPressed] = useState(false)
  const pressedRef = useRef(false)
  const runRef = useRef(run)
  useEffect(() => { runRef.current = run })

  useEffect(() => {
    if (disabled || run.over) return undefined
    setLit(true) // eslint-disable-line react-hooks/set-state-in-effect -- each step starts lit; the timers below dim and close it
    const dim = setTimeout(() => setLit(false), NB_LIT_MS)
    const end = setTimeout(() => {
      const next = stepNBack(runRef.current, pressedRef.current, rand)
      pressedRef.current = false
      setPressed(false)
      if (!next.last.correct) sounds.miss()
      else if (next.promoted) sounds.go()
      setRun(next)
      onChange?.(next)
      if (next.over) onOver?.(next.score)
    }, NB_STEP_MS)
    return () => { clearTimeout(dim); clearTimeout(end) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one timer pair per step (seq length) while running
  }, [run.seq.length, run.n, disabled, run.over])

  const match = () => {
    if (disabled || run.over || pressedRef.current) return
    pressedRef.current = true
    setPressed(true)
    sounds.step()
  }
  useGameKeys((e) => {
    if (e.key === ' ' || e.key.toLowerCase() === 'm') { match(); return true }
    return false
  }, { enabled: !disabled && !run.over })

  const cell = run.seq[run.seq.length - 1]
  const last = run.last
  return (
    <div className="w-full max-w-xs mx-auto space-y-4">
      <div className="flex items-center justify-between font-pixel text-[9px]">
        <span className="text-retro-cta text-glow-cta">{run.n}-BACK</span>
        <span className="text-retro-text">SCORE <span className="text-retro-cta">{run.score}</span></span>
        <Lives lives={run.lives} max={NB_LIVES} />
      </div>
      <div className="bg-retro-surface border-2 border-retro-border rounded p-2.5">
        <div className="grid grid-cols-3 gap-2" aria-label={`step ${run.blockStep + 1} of ${NB_BLOCK}`}>
          {Array.from({ length: NB_CELLS }, (_, i) => (
            <div
              key={i}
              aria-hidden="true"
              className={cn(
                'aspect-square rounded border-2 transition-colors duration-100',
                lit && i === cell && !run.over ? 'bg-retro-p2 border-retro-p2 scale-[1.03]' : 'bg-retro-card border-retro-border/60',
              )}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={match}
        disabled={disabled || run.over}
        aria-pressed={pressed}
        className={cn(
          'w-full min-h-14 rounded border-2 font-pixel text-[11px] press disabled:opacity-50 transition-colors',
          pressed ? 'border-retro-cta bg-retro-cta text-retro-bg' : 'border-retro-cta bg-retro-tint-cta text-retro-text',
        )}
      >
        MATCH
      </button>
      <BoardHint tone={last && !last.correct ? 'danger' : run.promoted ? 'win' : 'dim'}>
        {run.over ? '' : run.promoted ? `LEVEL UP — NOW ${run.n}-BACK` : last && !last.correct ? (last.match ? 'THAT WAS A MATCH' : 'NOT A MATCH') : `TAP MATCH WHEN IT IS THE SAME CELL AS ${run.n} STEP${run.n > 1 ? 'S' : ''} AGO`}
      </BoardHint>
    </div>
  )
}
