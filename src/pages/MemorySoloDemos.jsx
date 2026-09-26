// Single-player runs for the memory games on /solo/:type (see memorySoloLogic.js).
// Each run grows until you slip; the score is kept as a per-device personal best.

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import SimonBoard from '../components/SimonBoard'
import VisualMemoryBoard from '../components/VisualMemoryBoard'
import ChimpBoard from '../components/ChimpBoard'
import { BigNumber, MarkedAnswer } from '../components/NumberMemoryParts'
import { sounds } from '../lib/sounds'
import { readSoloBest, recordSoloBest } from '../lib/soloBest'
import { showMsForLevel } from '../lib/numberMemoryLogic'
import {
  SOLO_LIVES,
  startSimonSolo, applySimonSoloPress,
  startVmSolo, applyVmSoloTap, vmSoloScore,
  startChimpSolo, applyChimpSoloTap, chimpSoloScore,
  startNumberSolo, submitNumberSolo, numberSoloScore,
} from '../lib/memorySoloLogic'

const plural = (n, word) => `${word}${n === 1 ? '' : 'S'}`

// Pause after a cleared round before the next one starts, so the success registers.
const NEXT_ROUND_MS = 700

// Score + best + lives strip shared by every run.
function RunHeader({ scoreLabel, score, best, lives = null }) {
  return (
    <div className="flex items-center justify-between rounded border border-retro-border bg-retro-surface px-3 py-2 font-pixel text-[9px]">
      <span className="text-retro-text">{scoreLabel} <span className="text-retro-cta text-glow-cta">{score}</span></span>
      {lives !== null && (
        <span className="flex items-center gap-1" aria-label={`${lives} of ${SOLO_LIVES} lives left`}>
          {Array.from({ length: SOLO_LIVES }, (_, i) => (
            <span key={i} aria-hidden="true" className={i < lives ? 'text-retro-danger' : 'text-retro-border'}>♥</span>
          ))}
        </span>
      )}
      <span className="text-retro-dim">BEST {best}</span>
    </div>
  )
}

function RunOver({ result, score, unit, isNewBest, onRestart }) {
  return (
    <div className="space-y-3 text-center" role="status">
      <p className="font-pixel text-[10px] text-retro-text">{result}</p>
      <p className="font-pixel text-base text-retro-cta text-glow-cta">{score} {unit}</p>
      {isNewBest && <p className="font-pixel text-[9px] text-retro-win text-glow-win">NEW PERSONAL BEST!</p>}
      <button
        type="button"
        onClick={onRestart}
        className="px-6 py-2.5 min-h-11 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
      >
        PLAY AGAIN
      </button>
    </div>
  )
}

// Personal best for a run type. `finish(score)` is called from the tap handler that
// ended the run; it saves the score if it beats the best and plays the matching sound.
function useRunBest(type) {
  const [best, setBest] = useState(() => readSoloBest(type))
  const [isNewBest, setIsNewBest] = useState(false)
  const finish = (score) => {
    const beat = recordSoloBest(type, score)
    setIsNewBest(beat)
    if (beat) { setBest(score); sounds.win() } else sounds.lose()
  }
  const reset = () => setIsNewBest(false)
  return { best, isNewBest, finish, reset }
}

export function SimonSolo() {
  const [run, setRun] = useState(() => startSimonSolo())
  const [shown, setShown] = useState(run) // what the board shows (lags a cleared round briefly)
  const [pausing, setPausing] = useState(false)
  const { best, isNewBest, finish, reset } = useRunBest('simon')

  const press = (pad) => {
    if (pausing || run.over) return
    const next = applySimonSoloPress(run, pad)
    setRun(next)
    if (next.over) finish(next.score)
    if (!next.over && next.seq.length > run.seq.length) {
      // Show the full sequence as recalled, then hand over the longer one.
      setShown({ ...run, progress: run.seq.length })
      setPausing(true)
      setTimeout(() => { setShown(next); setPausing(false) }, NEXT_ROUND_MS)
    } else {
      setShown(next)
    }
  }
  const restart = () => { const r = startSimonSolo(); setRun(r); setShown(r); reset() }

  return (
    <div className="space-y-4">
      <RunHeader scoreLabel="SCORE" score={run.score} best={best} />
      <SimonBoard
        onMove={press}
        disabled={pausing || run.over}
        simonSequence={shown.seq}
        simonProgress={shown.progress}
        simonMiss={run.miss}
        finished={run.over}
        waitingLabel={pausing ? 'NICE! ONE MORE PAD…' : null}
      />
      {run.over && (
        <RunOver result="WRONG PAD — RUN OVER" score={run.score} unit={plural(run.score, 'PAD')} isNewBest={isNewBest} onRestart={restart} />
      )}
    </div>
  )
}

export function VisualMemorySolo() {
  const [run, setRun] = useState(() => startVmSolo())
  const [flash, setFlash] = useState(null)
  const score = vmSoloScore(run)
  const { best, isNewBest, finish, reset } = useRunBest('visualmemory')

  const tap = (cell) => {
    const next = applyVmSoloTap(run, cell)
    if (next === run) return
    if (next.over) finish(vmSoloScore(next))
    else if (next.lostLife) { sounds.miss(); setFlash(`MISSED — ${next.lives} ${next.lives === 1 ? 'LIFE' : 'LIVES'} LEFT, NEW PATTERN`) }
    else if (next.level > run.level) { sounds.go(); setFlash(null) }
    else sounds.step()
    setRun(next)
  }
  const restart = () => { setRun(startVmSolo()); setFlash(null); reset() }

  return (
    <div className="space-y-4">
      <RunHeader scoreLabel="LEVELS" score={score} best={best} lives={run.lives} />
      {flash && !run.over && <p className="font-pixel text-[8px] text-center text-retro-danger">{flash}</p>}
      <VisualMemoryBoard
        onMove={tap}
        disabled={run.over}
        vmPattern={run.pattern}
        vmClicked={run.clicked}
        vmLevel={run.level}
        vmMiss={run.miss}
        finished={run.over}
        mySymbol="X"
      />
      {run.over && (
        <RunOver result={`OUT OF LIVES ON LEVEL ${run.level}`} score={score} unit={plural(score, 'LEVEL')} isNewBest={isNewBest} onRestart={restart} />
      )}
    </div>
  )
}

export function ChimpSolo() {
  const [run, setRun] = useState(() => startChimpSolo())
  const [flash, setFlash] = useState(null)
  const score = chimpSoloScore(run)
  const { best, isNewBest, finish, reset } = useRunBest('chimp')

  const tap = (cell) => {
    const next = applyChimpSoloTap(run, cell)
    if (next === run) return
    if (next.over) finish(chimpSoloScore(next))
    else if (next.lostLife) { sounds.miss(); setFlash(`WRONG ORDER — ${next.lives} ${next.lives === 1 ? 'LIFE' : 'LIVES'} LEFT, NEW LAYOUT`) }
    else if (next.level > run.level) { sounds.go(); setFlash(null) }
    else sounds.step()
    setRun(next)
  }
  const restart = () => { setRun(startChimpSolo()); setFlash(null); reset() }

  return (
    <div className="space-y-4">
      <RunHeader scoreLabel="NUMBERS" score={score} best={best} lives={run.lives} />
      {flash && !run.over && <p className="font-pixel text-[8px] text-center text-retro-danger">{flash}</p>}
      <ChimpBoard
        // Remount per layout so the memorize timer restarts with each new deal.
        key={run.over ? 'over' : `${run.level}-${run.layout.join(',')}`}
        onMove={tap}
        disabled={run.over}
        chimpLayout={run.layout}
        myProgress={run.progress}
        myDone={false}
        chimpLevel={run.level}
        reveal={run.over}
        missCell={run.miss}
        solo
      />
      {run.over && (
        <RunOver result={`OUT OF LIVES AT ${run.level} NUMBERS`} score={score} unit={plural(score, 'NUMBER')} isNewBest={isNewBest} onRestart={restart} />
      )}
    </div>
  )
}

export function NumberMemorySolo() {
  const [run, setRun] = useState(() => startNumberSolo())
  const [input, setInput] = useState('')
  const [msLeft, setMsLeft] = useState(() => showMsForLevel(1))
  const inputRef = useRef(null)
  const score = numberSoloScore(run)
  const { best, isNewBest, finish, reset } = useRunBest('numbermemory')
  const showMs = showMsForLevel(run.level)

  // Memorize window, then recall.
  useEffect(() => {
    if (run.phase !== 'showing') return undefined
    const end = Date.now() + showMs
    const tick = setInterval(() => {
      const left = end - Date.now()
      setMsLeft(Math.max(0, left))
      if (left <= 0) {
        clearInterval(tick)
        setRun(r => (r.phase === 'showing' ? { ...r, phase: 'recall' } : r))
      }
    }, 100)
    return () => clearInterval(tick)
  }, [run.phase, run.level, run.number, showMs])

  useEffect(() => {
    if (run.phase === 'recall') inputRef.current?.focus()
  }, [run.phase])

  const submit = () => {
    if (run.phase !== 'recall' || !input.trim()) return
    const next = submitNumberSolo(run, input)
    if (next.over) finish(numberSoloScore(next))
    else sounds.go()
    setRun(next)
    setInput('')
  }
  const restart = () => { setRun(startNumberSolo()); setInput(''); reset() }

  return (
    <div className="space-y-4">
      <RunHeader scoreLabel="DIGITS" score={score} best={best} />
      <div className="flex items-center justify-between font-pixel text-[9px]">
        <span className="text-retro-cta text-glow-cta">LEVEL {run.level}</span>
        <span className="text-retro-dim">{run.level} DIGIT{run.level > 1 ? 'S' : ''}</span>
      </div>

      {run.phase === 'showing' && (
        <div className="bg-retro-surface border border-retro-border rounded p-4 text-center space-y-3">
          <p className="font-pixel text-[8px] text-retro-dim">MEMORIZE THIS NUMBER</p>
          <BigNumber number={run.number} className="text-retro-cta text-glow-cta" />
          <div className="h-1.5 rounded-full bg-retro-card overflow-hidden" aria-hidden="true">
            <div className="h-full bg-retro-cta" style={{ width: `${(msLeft / showMs) * 100}%` }} />
          </div>
        </div>
      )}

      {run.phase === 'recall' && (
        <form
          className="bg-retro-surface border border-retro-border rounded p-4 space-y-3"
          onSubmit={e => { e.preventDefault(); submit() }}
        >
          <p className="font-pixel text-[9px] text-retro-cta text-center">WHAT WAS THE NUMBER?</p>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Your answer"
            maxLength={run.level + 2}
            value={input}
            onChange={e => setInput(e.target.value.replace(/\D/g, ''))}
            className="w-full bg-retro-card border-2 border-retro-border text-retro-text font-pixel text-base tracking-[0.2em] text-center rounded px-3 py-2 focus:outline-none focus:border-retro-p1"
            placeholder={'?'.repeat(Math.min(run.level, 12))}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="w-full py-3 min-h-11 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-40"
          >
            SUBMIT
          </button>
        </form>
      )}

      {run.over && (
        <>
          <div className={cn('bg-retro-surface border border-retro-border rounded p-4 space-y-3 text-center')}>
            <p className="font-pixel text-[8px] text-retro-dim">THE NUMBER WAS</p>
            <BigNumber number={run.number} className="text-retro-p1 text-glow-p1" />
            <p className="font-pixel text-[10px]">
              <span className="text-retro-dim">YOU TYPED </span>
              <MarkedAnswer answer={run.answer} number={run.number} />
            </p>
          </div>
          <RunOver result={`MISSED AT ${run.level} ${plural(run.level, 'DIGIT')}`} score={score} unit={plural(score, 'DIGIT')} isNewBest={isNewBest} onRestart={restart} />
        </>
      )}
    </div>
  )
}
