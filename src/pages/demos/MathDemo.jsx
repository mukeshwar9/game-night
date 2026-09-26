import { useState, useRef, useEffect } from 'react'
import NumberPad from '../../components/NumberPad'
import { generateQuestion, QUESTION_MS } from '../../lib/mathLogic'
import { cn } from '@/lib/utils'

// ─── Math demo ────────────────────────────────────────────────────────────────

function demoSpeedPts(elapsed) {
  return Math.max(1, Math.ceil(5 * Math.max(0, (QUESTION_MS - elapsed) / QUESTION_MS)))
}

const DEMO_MATH_S = 60

export default function MathDemo() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9))

  const [phase, setPhase]           = useState('idle')
  const [cdSec, setCdSec]           = useState(3)
  const [qIndex, setQIndex]         = useState(0)
  const [answer, setAnswer]         = useState('')
  const [lastResult, setLastResult] = useState(null)
  const [youScore, setYouScore]     = useState(0)
  const [botScore, setBotScore]     = useState(0)
  const [youStreak, setYouStreak]   = useState(0)
  const [botStreak, setBotStreak]   = useState(0)
  const [timeLeft, setTimeLeft]     = useState(DEMO_MATH_S)
  const [qStartAt, setQStartAt]     = useState(null)
  const [now, setNow]               = useState(() => Date.now())

  const playerLockedRef = useRef(false)
  const botLockedRef    = useRef(false)
  const botTimerRef     = useRef(null)
  const advTimerRef     = useRef(null)
  const qTimeoutRef     = useRef(null)
  const gameEndRef      = useRef(null)
  const streakRef       = useRef({ you: 0, bot: 0 })
  const qRef            = useRef(null)

  const q = generateQuestion(seed, qIndex)
  useEffect(() => { qRef.current = q }, [q])

  const scheduleNextQuestion = () => {
    advTimerRef.current = setTimeout(() => {
      playerLockedRef.current = false
      botLockedRef.current    = false
      setQStartAt(Date.now())
      setQIndex(i => i + 1)
      setAnswer('')
      setLastResult(null)
    }, 1000)
  }

  const resolveQuestion = (by, submitted) => {
    clearTimeout(botTimerRef.current)
    clearTimeout(qTimeoutRef.current)
    if (phase === 'done') return
    const cq      = qRef.current
    const correct = submitted === cq.answer
    const elapsed = Date.now() - (qStartAt ?? Date.now())
    const speed   = demoSpeedPts(elapsed)
    const power   = cq.isPower ? 2 : 1
    const strk    = streakRef.current[by] >= 3 ? 2 : 1
    const pts     = correct ? speed * power * strk : 0
    const penalty = correct ? 0 : (cq.isPower ? 2 : 1)

    if (by === 'you') {
      setYouScore(s => Math.max(0, s + pts - penalty))
      if (correct) {
        setYouStreak(s => s + 1); setBotStreak(0)
        streakRef.current = { you: streakRef.current.you + 1, bot: 0 }
      } else {
        setYouStreak(0)
        streakRef.current = { ...streakRef.current, you: 0 }
      }
    } else {
      setBotScore(s => Math.max(0, s + pts - penalty))
      if (correct) {
        setBotStreak(s => s + 1); setYouStreak(0)
        streakRef.current = { you: 0, bot: streakRef.current.bot + 1 }
      } else {
        setBotStreak(0)
        streakRef.current = { ...streakRef.current, bot: 0 }
      }
    }

    setLastResult({ by, correct, pts })
    scheduleNextQuestion()
  }

  const handleKey = (key) => {
    if (phase !== 'playing' || playerLockedRef.current) return
    if (key === 'BACKSPACE') { setAnswer(a => a.slice(0, -1)); return }
    if (key === 'ENTER') { handleSubmit(); return }
    if (/^\d$/.test(key) && answer.length < 5) setAnswer(a => a + key)
  }

  const handleSubmit = () => {
    if (!answer || playerLockedRef.current || phase !== 'playing') return
    playerLockedRef.current = true
    botLockedRef.current    = true
    resolveQuestion('you', parseInt(answer, 10))
  }

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return
    let c = 3
    const id = setInterval(() => {
      c--
      if (c <= 0) {
        clearInterval(id)
        const t = Date.now()
        gameEndRef.current = t + DEMO_MATH_S * 1000
        setQStartAt(t)
        setNow(t)
        setPhase('playing')
      } else setCdSec(c)
    }, 1000)
    return () => clearInterval(id)
  }, [phase])

  // Game timer + bot scheduling per question
  useEffect(() => {
    if (phase !== 'playing') return
    playerLockedRef.current = false
    botLockedRef.current    = false

    // Game clock
    const clockId = setInterval(() => {
      const t = Date.now()
      setNow(t)
      const rem = Math.ceil((gameEndRef.current - t) / 1000)
      setTimeLeft(Math.max(0, rem))
      if (rem <= 0) { clearInterval(clockId); setPhase('done') }
    }, 100)

    // Bot answer
    const botDelay = 1000 + Math.random() * 2000
    botTimerRef.current = setTimeout(() => {
      if (botLockedRef.current || phase === 'done') return
      botLockedRef.current = true
      playerLockedRef.current = true
      const cq      = qRef.current
      const correct = Math.random() < 0.70
      const bad     = cq.answer + 1 + Math.floor(Math.random() * 4)
      resolveQuestion('bot', correct ? cq.answer : bad)
    }, botDelay)

    // 8s question timeout (skip — no points)
    qTimeoutRef.current = setTimeout(() => {
      if (botLockedRef.current) return
      botLockedRef.current    = true
      playerLockedRef.current = true
      setLastResult({ by: 'timeout', correct: false, pts: 0 })
      scheduleNextQuestion()
    }, QUESTION_MS)

    return () => {
      clearInterval(clockId)
      clearTimeout(botTimerRef.current)
      clearTimeout(qTimeoutRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveQuestion/scheduleNextQuestion are fresh closures each render (read latest state); adding them would re-arm the clock/bot timers every render
  }, [phase, qIndex])

  const reset = () => {
    clearTimeout(botTimerRef.current)
    clearTimeout(advTimerRef.current)
    clearTimeout(qTimeoutRef.current)
    setSeed(Math.floor(Math.random() * 1e9))
    streakRef.current           = { you: 0, bot: 0 }
    playerLockedRef.current     = false
    botLockedRef.current        = false
    setPhase('idle'); setCdSec(3)
    setQIndex(0); setAnswer(''); setLastResult(null)
    setYouScore(0); setBotScore(0); setYouStreak(0); setBotStreak(0)
    setTimeLeft(DEMO_MATH_S)
  }

  if (phase === 'done') {
    const winner = youScore > botScore ? 'YOU' : youScore < botScore ? 'BOT' : null
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'YOU', score: youScore, won: winner === 'YOU', col: 'retro-p1' },
            { label: 'BOT', score: botScore, won: winner === 'BOT', col: 'retro-p2' },
          ].map(({ label, score, won, col }) => (
            <div key={label} className={`bg-retro-card border border-${col}/50 rounded p-3 text-center space-y-1`}>
              <p className={`font-pixel text-[8px] text-${col}`}>{label}</p>
              <p className={cn('font-pixel text-3xl tabular-nums', won ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
                {score}
              </p>
              <p className="font-pixel text-[8px] text-retro-dim">POINTS</p>
            </div>
          ))}
        </div>
        <p className="font-pixel text-[8px] text-retro-dim text-center">
          {winner === 'YOU' ? <span className="text-retro-win">YOU WIN!</span>
          : winner === 'BOT' ? <span className="text-retro-p2">BOT WINS!</span>
          : <span className="text-retro-dim">DRAW!</span>}
          {' '}Q{qIndex} ANSWERED
        </p>
        <button onClick={reset}
          className="w-full py-2 font-pixel text-[9px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95">
          PLAY AGAIN
        </button>
      </div>
    )
  }

  if (phase === 'idle') {
    return (
      <div className="space-y-4 text-center">
        <div className="font-pixel text-[8px] text-retro-dim space-y-1 text-left">
          <p>● FIRST CORRECT ANSWER WINS THE ROUND</p>
          <p>⚡ POWER QUESTIONS · 2× POINTS</p>
          <p>🔥 3 IN A ROW = DOUBLE MULTIPLIER</p>
          <p>⏱ 60-SECOND DEMO TIMER</p>
        </div>
        <button onClick={() => setPhase('countdown')}
          className="px-6 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95">
          START
        </button>
      </div>
    )
  }

  if (phase === 'countdown') {
    return (
      <div className="space-y-4 text-center py-4">
        <p className="font-pixel text-[9px] text-retro-dim arcade-blink">GET READY!</p>
        <p className="font-pixel text-7xl text-retro-win text-glow-win">{cdSec}</p>
      </div>
    )
  }

  const qPct    = qStartAt ? Math.max(0, 1 - (now - qStartAt) / QUESTION_MS) : 1
  const speedPts = demoSpeedPts(qStartAt ? now - qStartAt : 0)
  const barColor = qPct > 0.6 ? 'bg-retro-win' : qPct > 0.3 ? 'bg-retro-cta' : 'bg-retro-p2'
  const answered = lastResult !== null

  return (
    <div className="space-y-3">
      {/* Scores + timer */}
      <div className="flex items-center gap-2">
        <div className="bg-retro-card border border-retro-border rounded px-2 py-1 text-center min-w-[3rem]">
          <p className={cn('font-pixel text-base tabular-nums leading-none',
            timeLeft <= 10 ? 'text-retro-p2' : 'text-retro-win')}>{timeLeft}s</p>
        </div>
        <div className="flex-1 bg-retro-card border border-retro-border rounded p-1.5 space-y-1">
          <div className="flex justify-between font-pixel text-[9px]">
            <span className="text-retro-p1">YOU · {youScore}</span>
            <span className="text-retro-p2">{botScore} · BOT</span>
          </div>
          <div className="h-1.5 bg-retro-deep rounded-full overflow-hidden flex">
            <div className="bg-retro-p1 h-full transition-all duration-300"
              style={{ width: `${youScore + botScore > 0 ? (youScore / (youScore + botScore)) * 100 : 50}%` }} />
            <div className="bg-retro-p2 h-full flex-1" />
          </div>
        </div>
      </div>

      {/* Question card */}
      <div className={cn('bg-retro-surface border rounded p-4 text-center space-y-2',
        q.isPower ? 'border-retro-cta/60' : 'border-retro-border')}>
        {q.isPower && <p className="font-pixel text-[9px] text-retro-cta">⚡ POWER · 2×</p>}
        <div className="h-1 bg-retro-deep rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full transition-all duration-100', barColor)}
            style={{ width: `${qPct * 100}%` }} />
        </div>
        <p className="font-pixel text-[9px] text-retro-dim">Q{qIndex + 1}</p>
        <p className="font-pixel text-3xl text-retro-text">{q.text}</p>
        <p className="font-pixel text-[9px] text-retro-dim">= ?</p>

        <div className="flex gap-1 justify-center">
          {[1,2,3,4,5].map(i => (
            <span key={i} className={cn('font-pixel text-[10px]',
              i <= speedPts ? 'text-retro-win' : 'text-retro-dim opacity-30')}>●</span>
          ))}
        </div>

        {!answered && (
          <div className="bg-retro-deep border border-retro-border rounded px-4 py-2 min-h-[2.5rem] flex items-center justify-center">
            <p className="font-pixel text-2xl text-retro-text tabular-nums">
              {answer || <span className="opacity-30">_</span>}
            </p>
          </div>
        )}
        {answered && lastResult?.correct === true && (
          <div className="bg-retro-tint-cta border border-retro-cta/60 rounded px-3 py-1.5">
            <p className="font-pixel text-[10px] text-retro-win">
              {lastResult.by === 'you' ? '✓ YOU' : '✓ BOT'} +{lastResult.pts}
            </p>
          </div>
        )}
        {answered && lastResult?.correct === false && lastResult?.by !== 'timeout' && (
          <div className="bg-retro-tint-p2 border border-retro-p2/60 rounded px-3 py-1.5">
            <p className="font-pixel text-[10px] text-retro-p2">
              {lastResult.by === 'you' ? '✗ WRONG' : '✗ BOT WRONG'} · ANS: {q.answer}
            </p>
          </div>
        )}
        {answered && lastResult?.by === 'timeout' && (
          <p className="font-pixel text-[9px] text-retro-dim">TIME'S UP · NEXT QUESTION...</p>
        )}
        {!answered && (
          <p className="font-pixel text-[8px] text-retro-dim arcade-blink">BOT IS THINKING ●●●</p>
        )}
      </div>

      {(youStreak >= 3 || botStreak >= 3) && (
        <p className="font-pixel text-[9px] text-retro-cta text-center">
          {youStreak >= 3 ? `🔥 YOU ×2 STREAK (${youStreak})` : `🔥 BOT ×2 STREAK (${botStreak})`}
        </p>
      )}

      <NumberPad onKey={handleKey} disabled={answered || phase !== 'playing'} />
    </div>
  )
}
