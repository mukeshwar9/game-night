import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import NumberPad from '../components/NumberPad'
import ThemeSwitcher from '../components/ThemeSwitcher'
import { generateQuestion } from '../lib/mathLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

const DAILY_MS = 60_000

// ── date / seed helpers ──────────────────────────────────────────────

// Local yyyy-mm-dd so the puzzle rolls over at the player's midnight.
function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Stable integer seed derived from the date string — identical for every client today.
function seedFromDate(date) {
  let h = 0
  for (let i = 0; i < date.length; i++) h = (Math.imul(h, 31) + date.charCodeAt(i)) | 0
  return h >>> 0
}

function storageKey(date) { return `gn-daily-${date}` }

function readBest(date) {
  try {
    const raw = localStorage.getItem(storageKey(date))
    if (!raw) return null
    const v = JSON.parse(raw)
    return typeof v?.best === 'number' ? v : null
  } catch { return null }
}

function writeBest(date, score) {
  try { localStorage.setItem(storageKey(date), JSON.stringify({ best: score, at: Date.now() })) }
  catch { /* storage unavailable — best is in-memory only */ }
}

function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `0:${String(s).padStart(2, '0')}`
}

// ── component ────────────────────────────────────────────────────────

export default function DailyGame() {
  const date = todayKey()
  const seed = seedFromDate(date)

  const [phase, setPhase] = useState('intro')   // intro | playing | done
  const [qIndex, setQIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [correct, setCorrect] = useState(0)
  const [wrong, setWrong] = useState(0)
  const [streak, setStreak] = useState(0)
  const [feedback, setFeedback] = useState(null) // 'right' | 'wrong' | null
  const [endTime, setEndTime] = useState(null)
  const [timeLeft, setTimeLeft] = useState(DAILY_MS)
  const [best, setBest] = useState(() => readBest(todayKey()))
  const [muted, setMuted] = useState(() => sounds.isMuted())

  const fbTimer = useRef(null)
  const correctRef = useRef(0)   // mirrors `correct` so the timer reads the final value
  const playedToday = best != null

  const q = generateQuestion(seed, qIndex)

  const toggleMute = () => setMuted(sounds.toggle())

  const start = () => {
    correctRef.current = 0
    setPhase('playing')
    setQIndex(0)
    setAnswer('')
    setCorrect(0)
    setWrong(0)
    setStreak(0)
    setFeedback(null)
    setTimeLeft(DAILY_MS)
    setEndTime(Date.now() + DAILY_MS)
  }

  const finish = () => {
    setPhase('done')
    setEndTime(null)
    const score = correctRef.current
    const prevBest = readBest(date)?.best ?? -1
    if (score > prevBest) {
      writeBest(date, score)
      setBest({ best: score, at: Date.now() })
      sounds.win()
    } else {
      setBest({ best: prevBest })
      sounds.lose()
    }
  }

  // Countdown ticker while playing
  useEffect(() => {
    if (phase !== 'playing' || endTime == null) return
    const id = setInterval(() => {
      const left = endTime - Date.now()
      if (left <= 0) {
        clearInterval(id)
        setTimeLeft(0)
        finish()
      } else {
        setTimeLeft(left)
      }
    }, 100)
    return () => clearInterval(id)
  }, [phase, endTime]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(fbTimer.current), [])

  const flash = (kind) => {
    setFeedback(kind)
    clearTimeout(fbTimer.current)
    fbTimer.current = setTimeout(() => setFeedback(null), 350)
  }

  const submit = () => {
    if (phase !== 'playing' || !answer) return
    const isRight = parseInt(answer, 10) === q.answer
    if (isRight) {
      correctRef.current += 1
      setCorrect(c => c + 1)
      setStreak(s => s + 1)
      flash('right')
      sounds.hit(streak + 1)
    } else {
      setWrong(w => w + 1)
      setStreak(0)
      flash('wrong')
      sounds.miss()
    }
    setQIndex(i => i + 1)
    setAnswer('')
  }

  const handleKey = (key) => {
    if (phase !== 'playing') return
    if (key === 'BACKSPACE') { setAnswer(a => a.slice(0, -1)); return }
    if (key === 'ENTER') { submit(); return }
    if (/^\d$/.test(key) && answer.length < 5) setAnswer(a => a + key)
  }

  // ── render ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center p-4 relative">
      {/* Controls — fixed top-right */}
      <div className="fixed top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-10 flex gap-2">
        <ThemeSwitcher />
        <button
          onClick={toggleMute}
          title={muted ? 'Unmute sounds' : 'Mute sounds'}
          className="text-retro-dim hover:text-retro-text transition-colors p-2 rounded border border-retro-border bg-retro-card"
        >
          {muted ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Unmute">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <line x1="23" y1="9" x2="17" y2="15"/>
              <line x1="17" y1="9" x2="23" y2="15"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Mute">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          )}
        </button>
      </div>

      <div className="w-full max-w-sm space-y-6 mt-16">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="font-pixel text-lg text-retro-cta text-glow-cta leading-relaxed">
            DAILY PUZZLE
          </h1>
          <p className="font-mono text-xs text-retro-dim tracking-widest">{date}</p>
        </div>

        {/* INTRO */}
        {phase === 'intro' && (
          <div className="space-y-4">
            <div className="bg-retro-card border border-retro-border rounded p-5 text-center space-y-4">
              <p className="font-pixel text-[9px] text-retro-cta">MENTAL MATH GAUNTLET</p>
              <div className="font-pixel text-[8px] text-retro-dim space-y-1.5 text-left mx-auto w-fit leading-relaxed">
                <p>● 60 SECONDS · SOLVE AS MANY AS YOU CAN</p>
                <p>● SAME PUZZLE FOR EVERYONE TODAY</p>
                <p>● ONE SCORE PER DAY — COME BACK TOMORROW</p>
              </div>
              {playedToday && (
                <div className="bg-retro-tint-cta border border-retro-cta/50 rounded px-3 py-2">
                  <p className="font-pixel text-[8px] text-retro-dim">TODAY'S BEST</p>
                  <p className="font-pixel text-2xl text-retro-win text-glow-win tabular-nums">{best.best}</p>
                </div>
              )}
              <button
                onClick={start}
                className="px-6 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
              >
                {playedToday ? 'PLAY AGAIN' : 'START'}
              </button>
              {playedToday && (
                <p className="font-pixel text-[7px] text-retro-dim leading-relaxed">
                  REPLAYS ARE JUST FOR FUN ·{'\n'}YOUR BEST IS ALREADY LOGGED
                </p>
              )}
            </div>
            <Link
              to="/"
              className="block text-center font-mono text-xs text-retro-dim hover:text-retro-p1 transition-colors"
            >
              ← BACK TO HOME
            </Link>
          </div>
        )}

        {/* PLAYING */}
        {phase === 'playing' && (
          <div className="space-y-3">
            {/* Timer + score header */}
            <div className="flex items-center gap-2">
              <div className="bg-retro-card border border-retro-border rounded px-3 py-1.5 text-center min-w-[4.5rem]">
                <p className={cn(
                  'font-pixel text-[18px] tabular-nums leading-none',
                  timeLeft < 10_000 ? 'text-retro-p2 text-glow-p2' : 'text-retro-win',
                )}>
                  {fmtTime(timeLeft)}
                </p>
                <p className="font-pixel text-[7px] text-retro-dim mt-0.5">TIME</p>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2">
                <div className="bg-retro-card border border-retro-border rounded py-1.5 text-center">
                  <p className="font-pixel text-base text-retro-win tabular-nums">{correct}</p>
                  <p className="font-pixel text-[7px] text-retro-dim">CORRECT</p>
                </div>
                <div className="bg-retro-card border border-retro-border rounded py-1.5 text-center">
                  <p className="font-pixel text-base text-retro-p2 tabular-nums">{wrong}</p>
                  <p className="font-pixel text-[7px] text-retro-dim">WRONG</p>
                </div>
              </div>
            </div>

            {streak >= 3 && (
              <p className="font-pixel text-[9px] text-retro-cta text-center">
                🔥 {streak} IN A ROW
              </p>
            )}

            {/* Question card */}
            <div className={cn(
              'bg-retro-surface border rounded p-5 text-center space-y-3 transition-colors',
              feedback === 'right' ? 'border-retro-win' :
              feedback === 'wrong' ? 'border-retro-p2' : 'border-retro-border',
            )}>
              <p className="font-pixel text-[9px] text-retro-dim">Q{qIndex + 1}</p>
              <p className="font-pixel text-4xl text-retro-text tracking-wider">{q.text}</p>
              <p className="font-pixel text-[9px] text-retro-dim">= ?</p>
              <div className="bg-retro-deep border border-retro-border rounded px-4 py-2 min-h-[2.5rem] flex items-center justify-center">
                <p className="font-pixel text-2xl text-retro-text tabular-nums tracking-widest">
                  {answer || <span className="opacity-30">_</span>}
                </p>
              </div>
            </div>

            <NumberPad onKey={handleKey} disabled={phase !== 'playing'} />
          </div>
        )}

        {/* DONE */}
        {phase === 'done' && (
          <div className="space-y-4">
            <div className="bg-retro-card border border-retro-border rounded p-6 text-center space-y-3">
              <p className="font-pixel text-[9px] text-retro-dim">TIME'S UP!</p>
              <p className="font-pixel text-5xl text-retro-win text-glow-win tabular-nums">{correct}</p>
              <p className="font-pixel text-[8px] text-retro-dim">CORRECT IN 60s</p>
              <div className="flex justify-center gap-6 font-pixel text-[8px] pt-1">
                <span className="text-retro-win">{correct} ✓</span>
                <span className="text-retro-p2">{wrong} ✗</span>
              </div>
              {best != null && (
                <div className="bg-retro-tint-cta border border-retro-cta/50 rounded px-3 py-2 mt-1">
                  <p className="font-pixel text-[8px] text-retro-dim">TODAY'S BEST</p>
                  <p className="font-pixel text-xl text-retro-cta text-glow-cta tabular-nums">{best.best}</p>
                </div>
              )}
            </div>

            <div className="bg-retro-card border border-retro-border rounded p-3 text-center">
              <p className="font-pixel text-[9px] text-retro-cta text-glow-cta">COME BACK TOMORROW</p>
              <p className="font-pixel text-[7px] text-retro-dim mt-1.5 leading-relaxed">
                A FRESH PUZZLE DROPS EACH DAY
              </p>
            </div>

            <button
              onClick={start}
              className="w-full py-2.5 border border-retro-border bg-retro-card text-retro-text font-pixel text-[10px] rounded hover:border-retro-p1/50 transition-colors active:scale-95"
            >
              REPLAY (JUST FOR FUN)
            </button>

            <Link
              to="/"
              className="block text-center font-mono text-xs text-retro-dim hover:text-retro-p1 transition-colors"
            >
              ← BACK TO HOME
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
