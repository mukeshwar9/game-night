import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { startVerbal, answerVerbal, VB_LIVES } from '../../lib/verbalMemoryLogic'
import { sounds } from '../../lib/sounds'
import useGameKeys from '../../hooks/useGameKeys'
import { Lives, BoardHint } from './MemoryParts'

// Verbal Memory: one word at a time — SEEN if it came up before in this run, NEW if
// not. The run is the board's own state; `onChange` reports it (for a duel's score
// strip), `onOver(score)` once when the last life goes. Keys: S = seen, N = new.
export default function VerbalMemoryBoard({ rand, disabled = false, onChange, onOver }) {
  const [run, setRun] = useState(() => startVerbal(rand))
  const [flash, setFlash] = useState(null) // 'right' | 'wrong'
  const flashTimer = useRef(null)
  useEffect(() => () => clearTimeout(flashTimer.current), [])

  const say = (said) => {
    if (disabled || run.over) return
    const next = answerVerbal(run, said, rand)
    setRun(next)
    setFlash(next.last.correct ? 'right' : 'wrong')
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 260)
    if (next.last.correct) sounds.step(); else sounds.miss()
    onChange?.(next)
    if (next.over) onOver?.(next.score)
  }

  useGameKeys((e) => {
    const k = e.key.toLowerCase()
    if (k === 's') { say('seen'); return true }
    if (k === 'n') { say('new'); return true }
    return false
  }, { enabled: !disabled && !run.over })

  return (
    <div className="w-full max-w-sm mx-auto space-y-4">
      <div className="flex items-center justify-between font-pixel text-[9px]">
        <span className="text-retro-text">SCORE <span className="text-retro-cta text-glow-cta">{run.score}</span></span>
        <Lives lives={run.lives} max={VB_LIVES} />
      </div>
      <div
        className={cn(
          'min-h-36 rounded border-2 bg-retro-card flex items-center justify-center px-4 transition-colors duration-150',
          flash === 'right' ? 'border-retro-win' : flash === 'wrong' ? 'border-retro-danger' : 'border-retro-border',
        )}
      >
        {run.over ? (
          <p className="font-pixel text-[10px] text-retro-dim text-center leading-relaxed">
            LAST WORD: <span className="text-retro-text">{run.last?.word?.toUpperCase()}</span><br />
            IT WAS {run.last?.wasRepeat ? 'SEEN' : 'NEW'}
          </p>
        ) : (
          <p key={run.seen.length + run.score + run.lives} className="font-pixel text-2xl text-retro-text tracking-wider vm-found-pop" aria-live="polite">
            {run.current?.toUpperCase()}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => say('seen')}
          disabled={disabled || run.over}
          className="min-h-14 rounded border-2 border-retro-p2 bg-retro-tint-p2 text-retro-text font-pixel text-[11px] active:scale-95 disabled:opacity-50"
        >
          SEEN
        </button>
        <button
          type="button"
          onClick={() => say('new')}
          disabled={disabled || run.over}
          className="min-h-14 rounded border-2 border-retro-p1 bg-retro-tint-p1 text-retro-text font-pixel text-[11px] active:scale-95 disabled:opacity-50"
        >
          NEW
        </button>
      </div>
      <BoardHint tone="dim">{run.over ? '' : 'HAVE YOU SEEN THIS WORD IN THIS RUN?'}</BoardHint>
    </div>
  )
}
