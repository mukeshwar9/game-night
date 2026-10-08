import { useEffect, useMemo, useRef, useState } from 'react'
import MarkTile from '../components/MarkTile'
import WordKeyboard from '../components/WordKeyboard'
import WordFeedback from '../components/WordFeedback'
import RoundTimer from '../components/RoundTimer'
import { RunHeader, RunOver, RunNote } from '../components/memory/RunParts'
import { markGuess, getKeyboardState, guessProblem, MAX_GUESSES, WORD_LENGTH } from '../lib/wordduelLogic'
import { getAnswerList } from '../lib/dictionary'
import {
  WORD_SOLO_MODES, SET_WORDS, SPRINT_MS, pickSoloWord, runOver, runScore, scoreUnit,
} from '../lib/wordSoloLogic'
import { readSoloBest, recordSoloBest } from '../lib/soloBest'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Solo WORD RACE (SPRINT), WORD DUEL (FIVE-WORD SET) and WORD CO-OP (STREAK):
// one hidden 5-letter word at a time, six guesses, no opponent. The rules for
// each mode and its score live in wordSoloLogic.

const TICK_MS = 250
const NOTE_MS = 1600

function Board({ guesses, current = '', active = true }) {
  return (
    <div className="mx-auto flex w-fit flex-col gap-1" role="group" aria-label="Your guesses">
      {Array.from({ length: MAX_GUESSES }, (_, r) => {
        const g = guesses[r]
        const typing = active && !g && r === guesses.length && current
        return (
          <div key={r} className="flex gap-1">
            {Array.from({ length: WORD_LENGTH }, (_, c) => (
              <MarkTile
                key={c}
                letter={g ? g.word[c] : typing ? current[c] || '' : ''}
                mark={g?.marks?.[c] || null}
                pending={!!typing}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

const freshWord = (answers, used) => pickSoloWord(answers, used)

export default function WordSoloRun({ mode }) {
  const cfg = WORD_SOLO_MODES[mode]
  const answers = useMemo(() => getAnswerList(), [])
  const [best, setBest] = useState(() => readSoloBest(mode))
  const [isNewBest, setIsNewBest] = useState(false)
  // null until START; then { results, used, word, guesses, startedAt, between, over }
  const [run, setRun] = useState(null)
  const [typed, setTyped] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [note, setNote] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const noteTimer = useRef(null)
  const rootRef = useRef(null)
  useEffect(() => () => clearTimeout(noteTimer.current), [])

  const playing = !!run && !run.over && !run.between

  const flashNote = (text) => {
    clearTimeout(noteTimer.current)
    setNote(text)
    noteTimer.current = setTimeout(() => setNote(''), NOTE_MS)
  }

  const finish = (results, word, at) => {
    const score = runScore(mode, results)
    const beat = recordSoloBest(mode, score)
    setIsNewBest(beat)
    if (beat) setBest(score)
    if (beat) sounds.win(); else sounds.lose()
    setTyped('')
    setRun(r => ({ ...r, results, word, over: true, between: null, endedAt: at }))
  }

  // SPRINT: the clock ends the run, with the word in play left unsolved.
  useEffect(() => {
    if (mode !== 'wordrace' || !playing) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t - run.startedAt >= SPRINT_MS) finish(run.results, run.word, t)
    }, TICK_MS)
    return () => clearInterval(id)
    // finish only reads fresh state through its arguments
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, playing, run])

  const start = () => {
    const at = Date.now()
    setIsNewBest(false)
    setNow(at)
    setTyped('')
    setFeedback(null)
    setNote('')
    setRun({ results: [], used: [], word: freshWord(answers, run?.used ?? []), guesses: [], startedAt: at, between: null, over: false })
    // On a phone the board and keyboard only fit once the page heading is scrolled away.
    requestAnimationFrame(() => rootRef.current?.scrollIntoView({ block: 'start' }))
  }

  const nextWord = () => {
    setTyped('')
    setFeedback(null)
    setRun(r => ({ ...r, used: [...r.used, r.word], word: freshWord(answers, [...r.used, r.word]), guesses: [], between: null }))
  }

  const submit = () => {
    const word = typed.toLowerCase()
    const problem = guessProblem(word)
    if (problem) {
      sounds.miss()
      setFeedback(f => ({ message: problem, id: (f?.id || 0) + 1 }))
      return
    }
    const at = Date.now()
    const guesses = [...run.guesses, { word, marks: markGuess(word, run.word) }]
    const solved = guesses[guesses.length - 1].marks === 'GGGGG'
    setTyped('')
    setFeedback(null)
    sounds.move('X')
    if (!solved && guesses.length < MAX_GUESSES) {
      setRun(r => ({ ...r, guesses }))
      return
    }
    const results = [...run.results, { word: run.word, solved, guesses: guesses.length }]
    if (solved) sounds.go(); else sounds.miss()
    if (runOver(mode, { results, elapsedMs: at - run.startedAt })) {
      setRun(r => ({ ...r, guesses }))
      finish(results, run.word, at)
    } else if (mode === 'wordrace') {
      // The clock keeps running, so SPRINT moves straight on to the next word.
      flashNote(solved ? `${run.word.toUpperCase()} · SOLVED` : `MISSED · IT WAS ${run.word.toUpperCase()}`)
      setRun(r => ({
        ...r, results, used: [...r.used, r.word], word: freshWord(answers, [...r.used, r.word]), guesses: [],
      }))
    } else {
      setRun(r => ({ ...r, guesses, results, between: { solved } }))
    }
  }

  const onKey = (key) => {
    if (!playing) return
    if (key === 'ENTER') submit()
    else if (key === 'BACK') setTyped(t => t.slice(0, -1))
    else if (typed.length < WORD_LENGTH) setTyped(t => t + key)
  }

  if (!run) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <p className="font-pixel text-[10px] text-retro-text">{cfg.name}</p>
        <div className="mx-auto w-fit space-y-1 text-left font-pixel text-[8px] text-retro-dim">
          {cfg.how.map(line => <p key={line}>● {line}</p>)}
          <p>✓ GREEN: RIGHT SPOT · • YELLOW: WRONG SPOT · × GRAY: NOT IN THE WORD</p>
        </div>
        {best > 0 && <p className="font-pixel text-[9px] text-retro-dim">BEST {best}</p>}
        <button
          type="button"
          onClick={start}
          className="min-h-11 rounded bg-retro-cta px-6 py-2 font-pixel text-[10px] text-retro-bg hover:shadow-neon-cta press"
        >
          START
        </button>
      </div>
    )
  }

  const score = runScore(mode, run.results)
  const stateLabel = mode === 'wordduel'
    ? `WORD ${Math.min(run.results.length + (run.between || run.over ? 0 : 1), SET_WORDS)} OF ${SET_WORDS}`
    : mode === 'wordcoop' ? `WORD ${run.results.length + (run.between || run.over ? 0 : 1)}` : ''
  const overResult = mode === 'wordrace' ? "TIME'S UP"
    : mode === 'wordduel' ? 'SET COMPLETE'
      : `STREAK ENDED — THE WORD WAS ${run.word.toUpperCase()}`

  return (
    <div ref={rootRef} className="scroll-mt-2 space-y-3">
      <RunHeader scoreLabel={cfg.unit} score={score} best={best} />
      {mode === 'wordrace' && !run.over && (
        <RoundTimer endsAt={run.startedAt + SPRINT_MS} now={now} totalMs={SPRINT_MS} label={cfg.name} />
      )}
      {stateLabel && !run.over && <p className="text-center font-pixel text-[9px] text-retro-dim">{stateLabel}</p>}
      <RunNote>{note}</RunNote>

      <Board guesses={run.guesses} current={typed} active={playing} />

      {run.between && (
        <div className="space-y-2 rounded border-2 border-retro-cta/50 bg-retro-card p-4 text-center" role="status" aria-live="polite">
          <p className="font-pixel text-[9px] tracking-widest text-retro-dim">THE WORD</p>
          <p className="font-pixel text-2xl tracking-[0.35em] text-retro-cta text-glow-cta">{run.word.toUpperCase()}</p>
          <p className={cn('font-pixel text-[10px]', run.between.solved ? 'text-retro-win' : 'text-retro-danger')}>
            {run.between.solved
              ? `SOLVED IN ${run.guesses.length}${mode === 'wordduel' ? ` · +${MAX_GUESSES + 1 - run.guesses.length}` : ''}`
              : 'MISSED'}
          </p>
          <button
            type="button"
            onClick={nextWord}
            className="min-h-11 rounded border-2 border-retro-p1 px-5 font-pixel text-[10px] text-retro-p1 hover:shadow-neon-p1 press"
          >
            NEXT WORD
          </button>
        </div>
      )}

      {run.over && (
        <RunOver
          type={mode}
          result={overResult}
          score={score}
          unit={scoreUnit(mode, score)}
          isNewBest={isNewBest}
          onRestart={start}
        />
      )}

      {playing && (
        <div className="space-y-1">
          <WordFeedback message={feedback?.message} tone="bad" id={feedback?.id} />
          <WordKeyboard keyState={getKeyboardState(run.guesses)} onKey={onKey} />
        </div>
      )}
    </div>
  )
}
