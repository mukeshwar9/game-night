import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MATCH_QUESTIONS,
  QUESTION_MS,
  seededDraw,
  applyRoundScores,
} from '../lib/triviaLogic'
import { TRIVIA_DECK } from '../lib/decks/trivia'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Solo TRIVIA BLITZ vs three bots — fully local, no Firebase. Runs the same
// seeded draw + applyRoundScores pipeline as the multiplayer page.

const GLYPHS = ['▲', '■', '●', '◆']
const REVEAL_MS = 4000
const BOT_ACCURACY = { 1: 0.75, 2: 0.55, 3: 0.4 }
const BOTS = [
  { id: 'b1', name: 'RUSTY' },
  { id: 'b2', name: 'PIXEL' },
  { id: 'b3', name: 'BYTE' },
]
const ALL_IDS = ['me', ...BOTS.map(b => b.id)]
const FRESH_SCORES = () => ({ me: 0, b1: 0, b2: 0, b3: 0 })

function botPick(q) {
  const acc = BOT_ACCURACY[q.diff] ?? 0.5
  if (Math.random() < acc) return q.answer
  const wrong = q.options.map((_, i) => i).filter(i => i !== q.answer)
  return wrong[Math.floor(Math.random() * wrong.length)]
}

export default function TriviaDemo() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2147483647))
  const questions = useMemo(
    () => seededDraw(TRIVIA_DECK, seed, MATCH_QUESTIONS),
    [seed],
  )

  const [qNum, setQNum] = useState(0)
  const [phase, setPhase] = useState('question')
  const [qStartAt, setQStartAt] = useState(null)
  const [answers, setAnswers] = useState({})
  const [deltas, setDeltas] = useState({})
  const [scores, setScores] = useState(FRESH_SCORES)
  const [streaks, setStreaks] = useState({})
  const [now, setNow] = useState(() => Date.now())

  const answersRef = useRef({})
  const streaksRef = useRef({})
  const settleRef = useRef(null)

  const lockIn = (id, choice) => {
    if (answersRef.current[id] != null) return
    answersRef.current = { ...answersRef.current, [id]: { choice, at: Date.now() } }
    setAnswers(answersRef.current)
    if (Object.keys(answersRef.current).length === ALL_IDS.length) settleRef.current?.()
  }

  // Per-question init on advance (render-phase derive-from-prop-change pattern).
  const [prevQ, setPrevQ] = useState(qNum)
  if (prevQ !== qNum) {
    setPrevQ(qNum)
    setAnswers({})
    setDeltas({})
    // eslint-disable-next-line react-hooks/purity
    setQStartAt(Date.now())
  }

  // One effect owns the rest of the question lifecycle: schedule the bots at
  // random delays, arm the deadline, and settle into reveal once.
  useEffect(() => {
    if (phase !== 'question' || qStartAt == null) return
    const q = questions[qNum]
    if (!q) return
    let settled = false
    const start = qStartAt

    const settle = () => {
      if (settled) return
      settled = true
      const { deltas: d, newStreaks } = applyRoundScores(
        answersRef.current,
        { answer: q.answer, qStartAt: start },
        streaksRef.current,
      )
      streaksRef.current = newStreaks
      setStreaks(newStreaks)
      setDeltas(d)
      setScores(prev => {
        const next = { ...prev }
        for (const id of ALL_IDS) next[id] = (next[id] || 0) + (d[id] || 0)
        return next
      })
      if ((d.me || 0) > 0) sounds.win()
      else sounds.miss()
      setPhase('reveal')
    }
    settleRef.current = settle

    const timers = [setTimeout(settle, QUESTION_MS + 50)]
    for (const bot of BOTS) {
      timers.push(setTimeout(() => {
        if (!settled && answersRef.current[bot.id] == null) lockIn(bot.id, botPick(q))
      }, 1500 + Math.random() * 6500))
    }
    return () => timers.forEach(clearTimeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, qNum, questions])

  // Reveal lingers, then auto-advances — or ends the match after question 10.
  useEffect(() => {
    if (phase !== 'reveal') return
    const t = setTimeout(() => {
      if (qNum + 1 >= MATCH_QUESTIONS) setPhase('end')
      else {
        setQNum(n => n + 1)
        setPhase('question')
      }
    }, REVEAL_MS)
    return () => clearTimeout(t)
  }, [phase, qNum])

  useEffect(() => {
    if (phase !== 'question') return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [phase])

  const handlePick = (idx) => {
    if (phase !== 'question' || answersRef.current.me != null) return
    sounds.move('O')
    lockIn('me', idx)
  }

  const playAgain = () => {
    streaksRef.current = {}
    answersRef.current = {}
    setScores(FRESH_SCORES())
    setStreaks({})
    setDeltas({})
    setAnswers({})
    setQNum(0)
    setSeed(Math.floor(Math.random() * 2147483647))
    setPhase('question')
  }

  const question = questions[qNum]
  const remainingMs = qStartAt != null ? Math.max(0, qStartAt + QUESTION_MS - now) : QUESTION_MS
  const urgent = remainingMs <= 5000
  const pct = Math.max(0, Math.min(100, (remainingMs / QUESTION_MS) * 100))
  const answeredCount = Object.keys(answers).length
  const myAnswer = answers.me
  const iAnswered = myAnswer != null

  const distribution = useMemo(() => {
    const dist = [0, 0, 0, 0]
    for (const a of Object.values(answers)) {
      if (a?.choice != null && dist[a.choice] != null) dist[a.choice]++
    }
    return dist
  }, [answers])

  const ranked = ALL_IDS
    .map(id => ({
      id,
      name: id === 'me' ? 'YOU' : BOTS.find(b => b.id === id).name,
      score: scores[id] || 0,
    }))
    .sort((a, b) => b.score - a.score)
  const topScore = ranked[0]?.score ?? 0
  const champs = ranked.filter(p => p.score === topScore)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between font-pixel text-[9px] text-retro-dim">
        <span>Q{Math.min(qNum + 1, MATCH_QUESTIONS)}/{MATCH_QUESTIONS}</span>
        <span>SEED {seed}</span>
        <span>{answeredCount}/4 IN</span>
      </div>

      {phase !== 'end' && question && (
        <>
          {phase === 'question' && (
            <div className="h-2 rounded overflow-hidden bg-retro-surface border border-retro-border">
              <div
                className={cn('h-full', urgent ? 'bg-retro-danger' : 'bg-retro-cta')}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}

          <div className="bg-retro-card border border-retro-border rounded p-3 space-y-3">
            <div className="flex items-center justify-between font-pixel text-[8px] text-retro-dim">
              <span>{question.cat.toUpperCase()}</span>
              <span className={urgent && phase === 'question' ? 'text-retro-danger' : ''}>
                {phase === 'question' ? `⏱ ${(remainingMs / 1000).toFixed(1)}s` : `DIFF ${'★'.repeat(question.diff)}`}
              </span>
            </div>

            {phase === 'question' && (
              <>
                <p className="font-mono text-[13px] text-retro-text text-center leading-snug">
                  {question.q}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {question.options.map((opt, idx) => {
                    const picked = myAnswer?.choice === idx
                    return (
                      <button
                        key={idx}
                        onClick={() => handlePick(idx)}
                        disabled={iAnswered}
                        className={cn(
                          'min-h-14 px-2 py-2 rounded border-2 transition-all active:scale-[0.98]',
                          'flex flex-col items-center justify-center gap-1',
                          picked
                            ? 'border-retro-cta text-retro-cta shadow-neon-cta'
                            : 'border-retro-border text-retro-text hover:border-retro-p1/50',
                          iAnswered && !picked && 'opacity-40',
                        )}
                      >
                        <span className="font-pixel text-[11px]" aria-hidden="true">{GLYPHS[idx]}</span>
                        <span className="font-mono text-[11px] leading-tight text-center">{opt}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="font-pixel text-[9px] text-retro-dim text-center pt-1">
                  {iAnswered
                    ? `LOCKED IN ✓ — ${answeredCount}/4 ANSWERED`
                    : 'PICK FAST — SPEED IS POINTS'}
                </p>
              </>
            )}

            {phase === 'reveal' && (
              <>
                <div className="space-y-1.5">
                  {question.options.map((opt, idx) => {
                    const isCorrect = idx === question.answer
                    const mine = myAnswer?.choice === idx
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'px-3 py-2 rounded border-2 flex items-center gap-2',
                          isCorrect
                            ? 'border-retro-win text-retro-win shadow-neon-win'
                            : mine
                              ? 'border-retro-p2 text-retro-text'
                              : 'border-retro-border text-retro-dim opacity-60',
                        )}
                      >
                        <span className="font-pixel text-[10px]" aria-hidden="true">{GLYPHS[idx]}</span>
                        <span className="font-mono text-[12px] flex-1 truncate">{opt}</span>
                        {isCorrect && <span className="font-pixel text-[8px] shrink-0">✓</span>}
                        {distribution[idx] > 0 && (
                          <span className="font-pixel text-[8px] text-retro-dim shrink-0">
                            ×{distribution[idx]}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="bg-retro-surface border border-retro-border rounded p-3 space-y-1">
                  <p className="font-pixel text-[9px] text-retro-dim tracking-widest text-center">
                    SCORES · Q{qNum + 1}/{MATCH_QUESTIONS}
                  </p>
                  {ranked.map(p => {
                    const delta = deltas[p.id] || 0
                    const streak = streaks[p.id] || 0
                    return (
                      <div key={p.id} className="flex items-center justify-between font-mono text-[11px]">
                        <span className={cn('truncate', p.id === 'me' ? 'text-retro-p1' : 'text-retro-text')}>
                          {p.name}{p.id === 'me' ? ' (YOU)' : ''}
                          {streak >= 3 && <span className="ml-1" title={`${streak} streak`}>🔥{streak}</span>}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className={delta > 0 ? 'text-retro-win' : 'text-retro-dim'}>
                            +{delta}
                          </span>
                          <span className="font-pixel text-[10px] text-retro-dim w-12 text-right">
                            {p.score}
                          </span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {phase === 'end' && (
        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-3 text-center">
          <p className="font-pixel text-xs text-retro-win text-glow-win">
            🏆 {champs.map(c => c.name).join(' & ')} WIN{champs.length > 1 ? '' : 'S'}!
          </p>
          <div className="space-y-1 text-left">
            {ranked.map((p, place) => (
              <div key={p.id} className="flex items-center justify-between font-mono text-[11px]">
                <span className={cn('truncate', p.id === 'me' ? 'text-retro-p1' : 'text-retro-text')}>
                  {place + 1}. {p.name}{p.id === 'me' ? ' (YOU)' : ''}
                </span>
                <span className="font-pixel text-[10px] text-retro-dim">{p.score}</span>
              </div>
            ))}
          </div>
          <button
            onClick={playAgain}
            className="px-5 py-2 font-pixel text-[10px] border border-retro-cta text-retro-cta rounded hover:shadow-neon-cta active:scale-95"
          >
            PLAY AGAIN
          </button>
        </div>
      )}
    </div>
  )
}
