import { Suspense, useMemo, useState } from 'react'
import { getMemoryKit } from '../lib/memoryKits'
import { MEM_LIVES, newSeed, startLevelRun, levelRunRand, levelRunDone, levelRunFail, levelRunContinue } from '../lib/memoryRaceLogic'
import { mulberry32 } from '../lib/detMath'
import useRunBest from '../hooks/useRunBest'
import { RunHeader, RunOver, StartGate, RunNote, ContinueButton } from '../components/memory/RunParts'

const NEXT_LEVEL_MS = 900 // a beat on a clear before the next level's study starts
const LEAD_MS = 300      // a breath between a tap and the next reveal

function BoardFallback() {
  return <div className="min-h-[18rem] rounded border-2 border-retro-border bg-retro-surface" aria-hidden="true" />
}

// Levels with 3 lives: a slip pauses on the mistake until TRY AGAIN deals the same
// level afresh; the score is the levels cleared.
function LevelRun({ kit, seed, best, started, onStart, finish, isNewBest, onRestart, single }) {
  const [run, setRun] = useState(() => startLevelRun(seed))
  const [startAt, setStartAt] = useState(() => Date.now() + LEAD_MS)
  const [note, setNote] = useState(null)
  // A new deal per level and per attempt (levelRunRand reads both).
  const deal = useMemo(() => kit.deal(run.level, levelRunRand(run)), [kit, run.level, run.attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  const onDone = () => {
    setNote(`LEVEL ${run.level} CLEARED!`)
    setTimeout(() => { setRun(r => levelRunDone(r)); setStartAt(Date.now() + LEAD_MS); setNote(null) }, NEXT_LEVEL_MS)
  }
  const onFail = () => {
    const next = levelRunFail(run)
    setRun(next)
    if (next.over) finish(next.cleared)
    else setNote('SLIP! ONE LIFE GONE')
  }
  const carryOn = () => { setRun(r => levelRunContinue(r)); setStartAt(Date.now() + LEAD_MS); setNote(null) }
  const Board = kit.Board

  return (
    <>
      <RunHeader scoreLabel="CLEARED" score={run.cleared} best={best} lives={run.lives} />
      <RunNote>{!run.over && note}</RunNote>
      {!started ? (
        <StartGate title={kit.start.title} how={kit.start.how} onStart={() => { setStartAt(Date.now() + LEAD_MS); onStart() }} />
      ) : (
        <Suspense fallback={<BoardFallback />}>
          <Board
            key={`${run.level}:${run.attempt}`}
            deal={deal}
            level={run.level}
            startAt={startAt}
            clock={Date.now}
            disabled={run.over || run.paused}
            answer={run.over || run.paused}
            onDone={onDone}
            onFail={onFail}
          />
        </Suspense>
      )}
      {run.paused && !run.over && <ContinueButton lives={run.lives} onContinue={carryOn} />}
      {run.over && (
        <RunOver result={`OUT OF LIVES ON LEVEL ${run.level}`} score={run.cleared} unit={run.cleared === 1 ? 'LEVEL' : 'LEVELS'} isNewBest={isNewBest} onRestart={onRestart} single={single} />
      )}
    </>
  )
}

// One seeded stream until the lives are gone (Verbal Memory, N-Back); the board
// owns the run and reports the final score.
function StreamRun({ kit, seed, best, started, onStart, finish, isNewBest, onRestart, single }) {
  const [rand] = useState(() => mulberry32(seed))
  const [score, setScore] = useState(null)
  const Board = kit.Board
  return (
    <>
      <p className="font-pixel text-[9px] text-right text-retro-dim">BEST {best}</p>
      {!started ? (
        <StartGate title={kit.start.title} how={kit.start.how} onStart={onStart} />
      ) : (
        <Suspense fallback={<BoardFallback />}>
          <Board rand={rand} onOver={(s) => { setScore(s); finish(s) }} />
        </Suspense>
      )}
      {score != null && (
        <RunOver result={`OUT OF LIVES — ${MEM_LIVES} SLIPS`} score={score} unit={kit.unit} isNewBest={isNewBest} onRestart={onRestart} single={single} />
      )}
    </>
  )
}

// Solo run for a memory kit (src/lib/memoryKits.js), with a personal best kept on
// the device and the account. `seed` makes a run reproducible (DAILY MEMORY);
// `single` hides PLAY AGAIN; `onFinish(score)` fires once at the end.
export default function MemoryRunSolo({ type, seed: seedProp, single = false, onFinish }) {
  const kit = getMemoryKit(type)
  const { best, isNewBest, finish, reset } = useRunBest(type, onFinish)
  const [started, setStarted] = useState(single)
  const [seed, setSeed] = useState(() => seedProp ?? newSeed())
  const restart = () => { reset(); setSeed(newSeed()); setStarted(true) }
  const Run = kit.mode === 'level' ? LevelRun : StreamRun
  return (
    <div className="space-y-4">
      <Run
        key={seed}
        kit={kit}
        seed={seed}
        best={best}
        started={started}
        onStart={() => setStarted(true)}
        finish={finish}
        isNewBest={isNewBest}
        onRestart={restart}
        single={single}
      />
    </div>
  )
}
