// Single-player runs for the memory games on /solo/:type (see memorySoloLogic.js).
// Each run grows until you slip; the score is kept as a personal best on the device
// and, signed in, on the account (memoryProgress.js).
//
// DAILY MEMORY (DailyMemory.jsx) reuses these runs with three props: `rand`, the
// day's seeded stream so everyone gets the same deal; `single`, one attempt (no
// PLAY AGAIN); and `onFinish(score)`, called once when the run ends.

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import SimonBoard from '../components/SimonBoard'
import VisualMemoryBoard from '../components/VisualMemoryBoard'
import ChimpBoard from '../components/ChimpBoard'
import { BigNumber, MarkedAnswer } from '../components/NumberMemoryParts'
import { sounds } from '../lib/sounds'
import useGameKeys from '../hooks/useGameKeys'
import { readSoloBest, recordSoloBest } from '../lib/soloBest'
import { mirrorMemoryBest, syncMemoryBests } from '../lib/memoryProgress'
import { showMsForLevel, generateNumber } from '../lib/numberMemoryLogic'
import { generateVmPattern, vmCellCount } from '../lib/visualMemoryLogic'
import { generateChimpLayout, CHIMP_GRID } from '../lib/chimpLogic'
import {
  SOLO_LIVES,
  startSimonSolo, applySimonSoloPress,
  startVmSolo, applyVmSoloTap, vmSoloScore, continueVmSolo,
  startChimpSolo, applyChimpSoloTap, chimpSoloScore, continueChimpSolo,
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

function RunOver({ result, score, unit, isNewBest, onRestart, single = false }) {
  return (
    <div className="space-y-3 text-center" role="status">
      <p className="font-pixel text-[10px] text-retro-text">{result}</p>
      <p className="font-pixel text-base text-retro-cta text-glow-cta">{score} {unit}</p>
      {isNewBest && <p className="font-pixel text-[9px] text-retro-win text-glow-win">NEW PERSONAL BEST!</p>}
      {!single && (
        <button
          type="button"
          onClick={onRestart}
          className="px-6 py-2.5 min-h-11 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
        >
          PLAY AGAIN
        </button>
      )}
    </div>
  )
}

// Every run waits for a tap before its first reveal: the reveal used to start the
// instant the page or chip loaded, while the player was still looking for the board.
// Space or Enter also starts it.
function StartGate({ title, how, onStart }) {
  useGameKeys((e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return false
    onStart()
    return true
  })
  return (
    <div className="min-h-[18rem] flex flex-col items-center justify-center gap-4 rounded border-2 border-dashed border-retro-border bg-retro-surface p-6 text-center">
      <p className="font-pixel text-[10px] text-retro-text">{title}</p>
      <p className="font-pixel text-[8px] text-retro-dim leading-relaxed max-w-[17rem]">{how}</p>
      <button
        type="button"
        onClick={onStart}
        className="px-8 py-3 min-h-11 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
      >
        TAP TO START
      </button>
    </div>
  )
}

// One line under the header that is always there (empty or not), so a message
// appearing never pushes the board down mid-reveal.
function RunNote({ children }) {
  return (
    <p className="font-pixel text-[8px] text-center text-retro-danger min-h-[1.5em] leading-relaxed" aria-live="polite">
      {children}
    </p>
  )
}

// After a slip the board holds on the mistake; the next deal waits for this tap.
function ContinueButton({ lives, onContinue }) {
  return (
    <button
      type="button"
      onClick={onContinue}
      className="w-full py-3 min-h-11 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
    >
      TRY AGAIN · {lives} {lives === 1 ? 'LIFE' : 'LIVES'} LEFT
    </button>
  )
}

// Personal best for a run type. `finish(score)` is called from the tap handler that
// ended the run; it saves the score if it beats the best and plays the matching sound.
function useRunBest(type, onFinish) {
  const [best, setBest] = useState(() => readSoloBest(type))
  const [isNewBest, setIsNewBest] = useState(false)
  // Pull the account's best in (another device may hold a higher one).
  useEffect(() => {
    let live = true
    syncMemoryBests().then(b => { if (live && b[type] != null) setBest(cur => Math.max(cur, b[type])) })
    return () => { live = false }
  }, [type])
  const finish = (score) => {
    const beat = recordSoloBest(type, score)
    setIsNewBest(beat)
    if (beat) { setBest(score); mirrorMemoryBest(type, score); sounds.win() } else sounds.lose()
    onFinish?.(score)
  }
  const reset = () => setIsNewBest(false)
  return { best, isNewBest, finish, reset }
}

export function SimonSolo({ rand = Math.random, single = false, onFinish } = {}) {
  const [run, setRun] = useState(() => startSimonSolo(rand))
  const [shown, setShown] = useState(run) // what the board shows (lags a cleared round briefly)
  const [pausing, setPausing] = useState(false)
  const { best, isNewBest, finish, reset } = useRunBest('simon', onFinish)

  const press = (pad) => {
    if (pausing || run.over) return
    const next = applySimonSoloPress(run, pad, rand)
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
  const restart = () => { const r = startSimonSolo(rand); setRun(r); setShown(r); reset() }
  const [started, setStarted] = useState(single) // DAILY MEMORY already had its start tap

  return (
    <div className="space-y-4">
      <RunHeader scoreLabel="SCORE" score={run.score} best={best} />
      {!started ? (
        <StartGate title="WATCH, THEN REPEAT" how="THE PADS FLASH A SEQUENCE. TAP IT BACK IN ORDER — ONE PAD LONGER EVERY ROUND." onStart={() => setStarted(true)} />
      ) : (
      <SimonBoard
        onMove={press}
        disabled={pausing || run.over}
        simonSequence={shown.seq}
        simonProgress={shown.progress}
        simonMiss={run.miss}
        finished={run.over}
        waitingLabel={pausing ? 'NICE! ONE MORE PAD…' : null}
      />
      )}
      {run.over && (
        <RunOver result="WRONG PAD — RUN OVER" score={run.score} unit={plural(run.score, 'PAD')} isNewBest={isNewBest} onRestart={restart} single={single} />
      )}
    </div>
  )
}

export function VisualMemorySolo({ rand = Math.random, single = false, onFinish } = {}) {
  const gen = level => generateVmPattern(level, vmCellCount(level), rand)
  const [run, setRun] = useState(() => startVmSolo(gen))
  const [flash, setFlash] = useState(null)
  const score = vmSoloScore(run)
  const { best, isNewBest, finish, reset } = useRunBest('visualmemory', onFinish)

  const tap = (cell) => {
    const next = applyVmSoloTap(run, cell, gen)
    if (next === run) return
    if (next.over) finish(vmSoloScore(next))
    else if (next.lostLife) { sounds.miss(); setFlash('SLIP! ONE LIFE GONE') }
    else if (next.level > run.level) { sounds.go(); setFlash(null) }
    else sounds.step()
    setRun(next)
  }
  const restart = () => { setRun(startVmSolo(gen)); setFlash(null); reset() }
  const carryOn = () => { setRun(r => continueVmSolo(r, gen)); setFlash(null) }
  const [started, setStarted] = useState(single) // DAILY MEMORY already had its start tap

  return (
    <div className="space-y-4">
      <RunHeader scoreLabel="CLEARED" score={score} best={best} lives={run.lives} />
      <RunNote>{!run.over && flash}</RunNote>
      {!started ? (
        <StartGate title="REMEMBER THE LIT TILES" how="TILES LIGHT UP FOR A MOMENT. TAP EVERY ONE THAT WAS LIT, IN ANY ORDER. 3 LIVES." onStart={() => setStarted(true)} />
      ) : (
      <VisualMemoryBoard
        // A fresh board per deal, so the reveal always starts clean.
        key={run.pattern.join(',')}
        onMove={tap}
        disabled={run.over || run.paused}
        vmPattern={run.pattern}
        vmClicked={run.clicked}
        vmLevel={run.level}
        vmMiss={run.miss}
        finished={run.over || run.paused}
        mySymbol="X"
      />
      )}
      {run.paused && !run.over && <ContinueButton lives={run.lives} onContinue={carryOn} />}
      {run.over && (
        <RunOver result={`OUT OF LIVES ON LEVEL ${run.level}`} score={score} unit={plural(score, 'LEVEL')} isNewBest={isNewBest} onRestart={restart} single={single} />
      )}
    </div>
  )
}

export function ChimpSolo({ rand = Math.random, single = false, onFinish } = {}) {
  const gen = level => generateChimpLayout(level, CHIMP_GRID, rand)
  const [run, setRun] = useState(() => startChimpSolo(gen))
  const [flash, setFlash] = useState(null)
  const score = chimpSoloScore(run)
  const { best, isNewBest, finish, reset } = useRunBest('chimp', onFinish)

  const tap = (cell) => {
    const next = applyChimpSoloTap(run, cell, gen)
    if (next === run) return
    if (next.over) finish(chimpSoloScore(next))
    else if (next.lostLife) { sounds.miss(); setFlash('SLIP! ONE LIFE GONE') }
    else if (next.level > run.level) { sounds.go(); setFlash(null) }
    else sounds.step()
    setRun(next)
  }
  const restart = () => { setRun(startChimpSolo(gen)); setFlash(null); reset() }
  const carryOn = () => { setRun(r => continueChimpSolo(r, gen)); setFlash(null) }
  const [started, setStarted] = useState(single) // DAILY MEMORY already had its start tap

  return (
    <div className="space-y-4">
      <RunHeader scoreLabel="NUMBERS" score={score} best={best} lives={run.lives} />
      <RunNote>{!run.over && flash}</RunNote>
      {!started ? (
        <StartGate title="NUMBERS, THEN BLANKS" how="REMEMBER WHERE EACH NUMBER IS. THEY HIDE WHEN YOU TAP 1 — TAP THE REST IN ORDER. 3 LIVES." onStart={() => setStarted(true)} />
      ) : (
      <ChimpBoard
        // Remount per layout so the memorize timer restarts with each new deal.
        key={run.over ? 'over' : `${run.level}-${run.layout.join(',')}`}
        onMove={tap}
        disabled={run.over || run.paused}
        chimpLayout={run.layout}
        myProgress={run.progress}
        myDone={false}
        chimpLevel={run.level}
        reveal={run.over || run.paused}
        missCell={run.miss}
        solo
      />
      )}
      {run.paused && !run.over && <ContinueButton lives={run.lives} onContinue={carryOn} />}
      {run.over && (
        <RunOver result={`OUT OF LIVES AT ${run.level} NUMBERS`} score={score} unit={plural(score, 'NUMBER')} isNewBest={isNewBest} onRestart={restart} single={single} />
      )}
    </div>
  )
}

export function NumberMemorySolo({ rand = Math.random, single = false, onFinish } = {}) {
  const gen = level => generateNumber(level, rand)
  const [run, setRun] = useState(() => startNumberSolo(gen))
  const [input, setInput] = useState('')
  const [msLeft, setMsLeft] = useState(() => showMsForLevel(1))
  const inputRef = useRef(null)
  const score = numberSoloScore(run)
  const { best, isNewBest, finish, reset } = useRunBest('numbermemory', onFinish)
  const showMs = showMsForLevel(run.level)
  const [started, setStarted] = useState(single) // DAILY MEMORY already had its start tap
  const [cheer, setCheer] = useState(null) // "CORRECT!" beat between levels

  // Memorize window, then recall.
  useEffect(() => {
    if (!started || run.phase !== 'showing') return undefined
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
  }, [started, run.phase, run.level, run.number, showMs])

  useEffect(() => {
    if (!cheer) return undefined
    const t = setTimeout(() => setCheer(null), 1200)
    return () => clearTimeout(t)
  }, [cheer])

  useEffect(() => {
    if (run.phase === 'recall') inputRef.current?.focus()
  }, [run.phase])

  const submit = () => {
    if (run.phase !== 'recall' || !input.trim()) return
    const next = submitNumberSolo(run, input, gen)
    if (next.over) finish(numberSoloScore(next))
    else { sounds.go(); setCheer(`CORRECT! NEXT: ${next.level} DIGITS`) }
    setRun(next)
    setInput('')
  }
  const restart = () => { setRun(startNumberSolo(gen)); setInput(''); reset() }

  return (
    <div className="space-y-4">
      <RunHeader scoreLabel="DIGITS" score={score} best={best} />
      <div className="flex items-center justify-between font-pixel text-[9px]">
        <span className="text-retro-cta text-glow-cta">LEVEL {run.level}</span>
        <span className="text-retro-dim">{run.level} DIGIT{run.level > 1 ? 'S' : ''}</span>
      </div>
      <p className="font-pixel text-[9px] text-center text-retro-win text-glow-win min-h-[1.5em]" aria-live="polite">{cheer}</p>

      {!started && (
        <StartGate title="HOLD THE NUMBER" how="A NUMBER FLASHES, THEN HIDES. TYPE IT BACK — ONE DIGIT LONGER EVERY LEVEL." onStart={() => setStarted(true)} />
      )}

      {started && run.phase === 'showing' && (
        <div className="bg-retro-surface border border-retro-border rounded p-4 text-center space-y-3">
          <p className="font-pixel text-[8px] text-retro-dim">MEMORIZE THIS NUMBER</p>
          <BigNumber number={run.number} className="text-retro-cta text-glow-cta" />
          <div className="h-1.5 rounded-full bg-retro-card overflow-hidden" aria-hidden="true">
            <div className="h-full bg-retro-cta" style={{ width: `${(msLeft / showMs) * 100}%` }} />
          </div>
          <button
            type="button"
            onClick={() => setRun(r => (r.phase === 'showing' ? { ...r, phase: 'recall' } : r))}
            className="w-full py-2.5 min-h-11 bg-retro-surface border-2 border-retro-border text-retro-cta font-pixel text-[9px] rounded hover:border-retro-cta/60 active:scale-95"
          >
            GOT IT
          </button>
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
          <RunOver result={`MISSED AT ${run.level} ${plural(run.level, 'DIGIT')}`} score={score} unit={plural(score, 'DIGIT')} isNewBest={isNewBest} onRestart={restart} single={single} />
        </>
      )}
    </div>
  )
}
