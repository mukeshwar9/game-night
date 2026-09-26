import { useEffect, useRef, useState } from 'react'
import { ref, runTransaction, update } from 'firebase/database'
import { db } from '../lib/firebase'
import RaceShell from '../components/RaceShell'
import NumberPad from '../components/NumberPad'
import {
  GAME_MS, STREAK_FOR_DOUBLE,
  generateQuestion, questionMsForIndex, speedPtsFor,
  scoreMathAnswer, advanceMathQuestion, normalizeMathStats,
  mathRaceEntry, mathRow,
} from '../lib/mathLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// Mental Math — N-player race (2–8). Everyone answers the same seeded
// question sequence at their own pace for two minutes; speed, power
// questions and streaks score. Highest points wins; room flow in RaceShell.

// How long the "✗ WRONG" feedback stays up before auto-advancing
const WRONG_FEEDBACK_MS = 1000

const RACE = {
  type: 'math',
  title: 'MENTAL MATH',
  sameWhat: 'QUESTIONS',
  rules: [
    'SAME QUESTIONS FOR EVERYONE · YOUR OWN PACE',
    '⚡ POWER QUESTIONS EVERY 8 · 2× POINTS',
    `🔥 ${STREAK_FOR_DOUBLE}-STREAK = DOUBLE NEXT CORRECT`,
    '⏱ 2-MINUTE BLITZ · HIGHEST SCORE WINS',
  ],
  baseMs: GAME_MS,
  scaled: false,
  entry: mathRaceEntry,
  isDone: () => false, // time-boxed: the round ends at the deadline
  row: (stats) => mathRow(stats),
}

function QuestionBar({ qPct, critical }) {
  const pct = Math.max(0, Math.min(1, qPct))
  const color = pct > 0.6 ? 'bg-retro-win' : pct > 0.3 ? 'bg-retro-cta' : 'bg-retro-danger'
  return (
    <div className="h-2.5 bg-retro-deep rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-100', color, critical && 'animate-pulse')}
        style={{ width: `${pct * 100}%` }}
      />
    </div>
  )
}

function SpeedDots({ pts }) {
  return (
    <div className="flex gap-1 justify-center">
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={cn('font-pixel text-[10px]', i <= pts ? 'text-retro-win' : 'text-retro-dim opacity-40')}>●</span>
      ))}
      <span className="font-pixel text-[9px] text-retro-dim ml-1">{pts}pt{pts !== 1 ? 's' : ''}</span>
    </div>
  )
}

function MathRacer({ round, myStats, statsPath, now }) {
  const stats = normalizeMathStats(myStats)
  const myQ = stats.q
  const live = round.endsAt == null || now < round.endsAt
  const q = generateQuestion(round.seed, myQ)
  const questionMs = questionMsForIndex(myQ)

  const [answer, setAnswer] = useState('')
  const [lastResult, setLastResult] = useState(null) // { correct, pts, timedOut? } | null
  const [answered, setAnswered] = useState(false)
  const [qElapsed, setQElapsed] = useState(0)
  const [prevQ, setPrevQ] = useState(myQ)

  const submittingRef = useRef(false)
  const qShownAtRef = useRef(null)
  const timedOutRef = useRef(null)
  const advanceTimerRef = useRef(null)

  // New question (mine advanced): reset the per-question UI during render —
  // the derive-from-prop-change pattern, so the pad never lags the index.
  if (prevQ !== myQ) {
    setPrevQ(myQ)
    setAnswer('')
    setLastResult(null)
    setAnswered(false)
  }

  useEffect(() => {
    submittingRef.current = false
    qShownAtRef.current = Date.now()
  }, [myQ])

  useEffect(() => () => clearTimeout(advanceTimerRef.current), [])

  // Register as present (0 pts) so a racer who never answers still ranks.
  useEffect(() => {
    if (!myStats) update(ref(db, statsPath), normalizeMathStats(null)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per round (the Racer is keyed by round id)
  }, [])

  const advance = (fromIndex) => {
    runTransaction(ref(db, statsPath), cur => advanceMathQuestion(cur, fromIndex)).catch(() => {})
  }

  // Per-question clock (my own clock only: it scores my answers, so skew
  // between devices can't bias anyone's speed points) + timeout auto-advance.
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => {
      const elapsed = Date.now() - (qShownAtRef.current ?? Date.now())
      setQElapsed(elapsed)
      if (elapsed >= questionMsForIndex(myQ) && !submittingRef.current && timedOutRef.current !== myQ) {
        timedOutRef.current = myQ
        submittingRef.current = true
        setAnswered(true)
        setLastResult({ correct: false, pts: 0, timedOut: true })
        sounds.buzz()
        advanceTimerRef.current = setTimeout(() => advance(myQ), WRONG_FEEDBACK_MS)
      }
    }, 100)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- advance only closes over statsPath, stable per round
  }, [myQ, live])

  const handleSubmit = async () => {
    if (!live || answered || !answer || submittingRef.current) return
    submittingRef.current = true
    setAnswered(true)
    const elapsed = Date.now() - (qShownAtRef.current ?? Date.now())
    let outcome = null
    try {
      const res = await runTransaction(ref(db, statsPath), cur => {
        if (normalizeMathStats(cur).q !== myQ) return undefined // already advanced (timeout)
        outcome = scoreMathAnswer(cur, { seed: round.seed, answer, elapsed })
        return outcome.stats
      })
      if (!res.committed || !outcome) {
        submittingRef.current = false
        setAnswered(false)
        return
      }
      setLastResult({ correct: outcome.correct, pts: outcome.pts })
      if (outcome.correct) sounds.hit(outcome.stats.streak)
      else {
        sounds.miss()
        advanceTimerRef.current = setTimeout(() => advance(myQ), WRONG_FEEDBACK_MS)
      }
    } catch {
      // Thrown runTransaction (offline/permission): re-enable the pad.
      submittingRef.current = false
      setAnswered(false)
      setLastResult(null)
      toast.error('ANSWER FAILED — RETRY')
    }
  }

  const handleKey = (key) => {
    if (!live || answered) return
    if (key === 'BACKSPACE') { setAnswer(a => a.slice(0, -1)); return }
    if (key === 'ENTER') { handleSubmit(); return }
    if (/^\d$/.test(key) && answer.length < 5) setAnswer(a => a + key)
  }

  const qPct = Math.max(0, 1 - qElapsed / questionMs)
  const speedPts = speedPtsFor(qElapsed, questionMs)
  const isCorrect = lastResult?.correct === true
  const isWrong = lastResult?.correct === false

  return (
    <div className="space-y-3">
      <div className="min-h-[22px] flex gap-2 justify-center flex-wrap">
        {stats.streak >= STREAK_FOR_DOUBLE && (
          <span className="font-pixel text-[9px] bg-retro-tint-cta border border-retro-cta rounded px-2 py-0.5 text-retro-cta">
            🔥 ×2 STREAK
          </span>
        )}
        <span className="font-pixel text-[9px] text-retro-dim px-2 py-0.5">{stats.score} PTS</span>
      </div>

      <div className={cn(
        'bg-retro-surface border rounded p-4 text-center space-y-3 transition-colors',
        q.isPower ? 'border-retro-cta/60' : 'border-retro-border',
      )}>
        <div className="min-h-[14px]">
          {q.isPower && <p className="font-pixel text-[9px] text-retro-cta">⚡ POWER QUESTION · 2× POINTS</p>}
        </div>
        <QuestionBar qPct={qPct} critical={questionMs - qElapsed <= 2000} />
        <div className="space-y-1">
          <p className="font-pixel text-[9px] text-retro-dim">Q{myQ + 1}</p>
          <p className="font-pixel text-3xl text-retro-text tracking-wider" data-testid="math-question">{q.text}</p>
          <p className="font-pixel text-[9px] text-retro-dim">= ?</p>
        </div>
        <SpeedDots pts={speedPts} />

        {!answered && (
          <div className="bg-retro-deep border border-retro-border rounded px-4 py-2 min-h-[2.5rem] flex items-center justify-center">
            <p className="font-pixel text-2xl text-retro-text tabular-nums tracking-widest">
              {answer || <span className="opacity-30">_</span>}
            </p>
          </div>
        )}
        {answered && isCorrect && (
          <div className="bg-retro-tint-cta border border-retro-cta/60 rounded px-4 py-2 min-h-[2.5rem] flex items-center justify-center">
            <p className="font-pixel text-[10px] text-retro-win">✓ CORRECT +{lastResult.pts}</p>
          </div>
        )}
        {answered && isWrong && (
          <div className="bg-retro-tint-danger border border-retro-danger/60 rounded px-4 py-2 min-h-[2.5rem] flex items-center justify-center">
            <p className="font-pixel text-[10px] text-retro-danger">
              {lastResult?.timedOut
                ? <>⏱ TIME&apos;S UP · ANS: {q.answer}</>
                : <>✗ WRONG · ANS: {q.answer} · -{q.isPower ? 2 : 1}</>}
            </p>
          </div>
        )}
        {answered && !lastResult && (
          <div className="min-h-[2.5rem] flex items-center justify-center">
            <p className="font-pixel text-[9px] text-retro-dim arcade-blink">CHECKING...</p>
          </div>
        )}
      </div>

      <NumberPad onKey={handleKey} disabled={answered || !live} />
    </div>
  )
}

export default function MathGame(props) {
  return <RaceShell {...props} race={RACE} Racer={MathRacer} />
}
