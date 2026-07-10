import { useEffect, useRef, useState } from 'react'
import { ref, runTransaction, update } from 'firebase/database'
import { db } from '../lib/firebase'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import NumberPad from '../components/NumberPad'
import { generateQuestion, GAME_MS, QUESTION_MS } from '../lib/mathLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// ── small helpers ────────────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2, '0') }

function fmtTime(ms) {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`
}

function speedPtsFor(elapsed) {
  return Math.max(1, Math.ceil(5 * Math.max(0, (QUESTION_MS - elapsed) / QUESTION_MS)))
}

// How long the "✗ WRONG" feedback stays up before auto-advancing to my next question
const WRONG_FEEDBACK_MS = 1000

// ── sub-components ───────────────────────────────────────────────────

function ScoreBar({ game, myKey, opKey, players }) {
  const sX = game.mathScoreX ?? 0
  const sO = game.mathScoreO ?? 0
  const total = Math.max(sX + sO, 1)
  const pX = (sX / total) * 100
  return (
    <div className="bg-retro-card border border-retro-border rounded p-2 space-y-1">
      <div className="flex justify-between font-pixel text-[10px]">
        <span className="text-retro-p1">
          {players?.X?.name?.toUpperCase() ?? 'X'} · {sX}
        </span>
        <span className="text-retro-p2">
          {sO} · {players?.O?.name?.toUpperCase() ?? 'O'}
        </span>
      </div>
      <div className="h-2 bg-retro-deep rounded-full overflow-hidden flex">
        <div
          className="bg-retro-p1 h-full transition-all duration-500"
          style={{ width: `${pX}%` }}
        />
        <div className="bg-retro-p2 h-full flex-1" />
      </div>
    </div>
  )
}

function QuestionBar({ qPct }) {
  const pct = Math.max(0, Math.min(1, qPct))
  const color = pct > 0.6 ? 'bg-retro-win' : pct > 0.3 ? 'bg-retro-cta' : 'bg-retro-p2'
  return (
    <div className="h-1.5 bg-retro-deep rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-100', color)}
        style={{ width: `${pct * 100}%` }}
      />
    </div>
  )
}

function SpeedDots({ pts }) {
  return (
    <div className="flex gap-1 justify-center">
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          className={cn(
            'font-pixel text-[10px]',
            i <= pts ? 'text-retro-win' : 'text-retro-dim opacity-40',
          )}
        >
          ●
        </span>
      ))}
      <span className="font-pixel text-[9px] text-retro-dim ml-1">
        {pts}pt{pts !== 1 ? 's' : ''}
      </span>
    </div>
  )
}

function ResultsPanel({ game, players }) {
  const sX = game.mathScoreX ?? 0
  const sO = game.mathScoreO ?? 0
  const cX = game.mathCorrectX ?? 0
  const cO = game.mathCorrectO ?? 0
  const wX = game.mathWrongX ?? 0
  const wO = game.mathWrongO ?? 0

  return (
    <div className="grid grid-cols-2 gap-2">
      {['X', 'O'].map(sym => {
        const score   = sym === 'X' ? sX : sO
        const correct = sym === 'X' ? cX : cO
        const wrong   = sym === 'X' ? wX : wO
        const isWin   = game.winner === sym
        const col     = sym === 'X' ? 'text-retro-p1' : 'text-retro-p2'
        const border  = sym === 'X' ? 'border-retro-p1/60' : 'border-retro-p2/60'
        return (
          <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', border)}>
            <p className={cn('font-pixel text-[8px]', col)}>
              {players?.[sym]?.name?.toUpperCase() ?? sym}
            </p>
            <p className={cn('font-pixel text-3xl tabular-nums',
              isWin ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
              {score}
            </p>
            <p className="font-pixel text-[8px] text-retro-dim">POINTS</p>
            <p className="font-pixel text-[8px] text-retro-cta">
              {correct}✓ {wrong}✗
            </p>
          </div>
        )
      })}
    </div>
  )
}

// ── main component ───────────────────────────────────────────────────

export default function MathGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const myKey = mySymbol === 'X' ? 'X' : 'O'
  const opKey = myKey === 'X' ? 'O' : 'X'

  const [answer, setAnswer]         = useState('')
  const [hasAnswered, setHasAnswered] = useState(false)
  const [lastResult, setLastResult]   = useState(null) // { correct, pts } | null
  const [tick, setTick]               = useState(0)

  const hasAutoAdvancedRef = useRef(null)
  const hasFinishedRef     = useRef(false)
  const submittingRef      = useRef(false)
  const qShownAtRef        = useRef(null) // local clock: when MY current question appeared

  const myQIndex   = game[`mathQIndex${myKey}`] ?? 0
  const opQIndex   = game[`mathQIndex${opKey}`] ?? 0
  const startedAt  = game.mathStartedAt ?? null
  const endTime    = game.mathEndTime   ?? null
  const seed       = game.mathSeed      ?? null

  const now          = Date.now()
  const isCountdown  = !!startedAt && now < startedAt + 3000
  const isPlaying    = !!startedAt && now >= startedAt + 3000 && game.status !== 'finished'
  const countdownSec = isCountdown ? Math.ceil((startedAt + 3000 - now) / 1000) : 0
  const timeLeftMs   = endTime ? Math.max(0, endTime - now) : GAME_MS
  const qElapsed     = qShownAtRef.current != null ? now - qShownAtRef.current : 0
  const qPct         = Math.max(0, 1 - qElapsed / QUESTION_MS)
  const speedPts     = speedPtsFor(qElapsed)

  const myStreak  = game[`mathStreak${myKey}`] ?? 0
  const opStreak  = game[`mathStreak${opKey}`] ?? 0
  const myScore   = game[`mathScore${myKey}`]  ?? 0
  const opScore   = game[`mathScore${opKey}`]  ?? 0

  const q = seed != null ? generateQuestion(seed, myQIndex) : null

  // Reset per-question state when MY question changes
  useEffect(() => {
    setHasAnswered(false)
    setAnswer('')
    setLastResult(null)
    submittingRef.current = false
  }, [myQIndex])

  // Stamp when my current question appears — on MY clock. Only my client
  // scores my answers, so this never touches Firebase and clock skew between
  // devices can't bias speed points.
  useEffect(() => {
    if (isPlaying) qShownAtRef.current = Date.now()
  }, [isPlaying, myQIndex])

  // Ticker: drives countdown display and checks timeouts
  useEffect(() => {
    if (!startedAt || game.status === 'finished') return
    const id = setInterval(() => {
      setTick(n => n + 1)
      const n = Date.now()

      // Check per-question timeout — auto-advance MY index only (spectators skip)
      if (isPlaying && mySymbol && qShownAtRef.current != null) {
        const elapsed = n - qShownAtRef.current
        if (elapsed >= QUESTION_MS && hasAutoAdvancedRef.current !== myQIndex) {
          hasAutoAdvancedRef.current = myQIndex
          advanceQuestion(myQIndex)
        }
      }

      // Check game end
      if (isPlaying && endTime && n >= endTime && !hasFinishedRef.current) {
        hasFinishedRef.current = true
        tryFinishGame()
      }
    }, 100)
    return () => clearInterval(id)
  }, [startedAt, game.status, isPlaying, mySymbol, myQIndex, endTime])

  // ── Firebase transactions ─────────────────────────────────────────

  const handleStartClick = async () => {
    if (startedAt) return
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.mathStartedAt) return
        const t = Date.now()
        return {
          ...current,
          mathStartedAt: t,
          mathEndTime:   t + 3000 + GAME_MS,
        }
      })
    } catch { /* ignore */ }
  }

  const handleKey = (key) => {
    if (!isPlaying || hasAnswered) return
    if (key === 'BACKSPACE') { setAnswer(a => a.slice(0, -1)); return }
    if (key === 'ENTER') { handleSubmit(); return }
    if (/^\d$/.test(key) && answer.length < 5) setAnswer(a => a + key)
  }

  const handleSubmit = async () => {
    if (!isPlaying || hasAnswered || !answer || submittingRef.current || !q) return
    submittingRef.current = true
    setHasAnswered(true)

    // Elapsed on MY clock, captured at submit time (transaction retries don't inflate it)
    const submitAt = Date.now()
    const elapsed  = submitAt - (qShownAtRef.current ?? submitAt)

    try {
      const result = await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.status === 'finished') return
        if ((current[`mathQIndex${myKey}`] ?? 0) !== myQIndex) return  // my question already advanced

        const cq      = generateQuestion(current.mathSeed, myQIndex)
        const correct = parseInt(answer, 10) === cq.answer
        const speed   = speedPtsFor(elapsed)
        const power   = cq.isPower ? 2 : 1
        const streak  = current[`mathStreak${myKey}`] ?? 0
        const mult    = streak >= 3 ? 2 : 1

        if (correct) {
          const pts = speed * power * mult
          return {
            ...current,
            [`mathQIndex${myKey}`]:   myQIndex + 1,
            [`mathScore${myKey}`]:    (current[`mathScore${myKey}`] ?? 0) + pts,
            [`mathStreak${myKey}`]:   streak + 1,
            [`mathCorrect${myKey}`]:  (current[`mathCorrect${myKey}`] ?? 0) + 1,
          }
        } else {
          const penalty = cq.isPower ? 2 : 1
          return {
            ...current,
            [`mathScore${myKey}`]:  Math.max(0, (current[`mathScore${myKey}`] ?? 0) - penalty),
            [`mathStreak${myKey}`]: 0,
            [`mathWrong${myKey}`]:  (current[`mathWrong${myKey}`] ?? 0) + 1,
          }
        }
      })

      // Derive what happened from the transaction result
      if (result.committed && result.snapshot.val()) {
        const after = result.snapshot.val()
        const wasCorrect = (after[`mathQIndex${myKey}`] ?? 0) > myQIndex
        const speed = speedPtsFor(elapsed)
        const power = q.isPower ? 2 : 1
        const mult  = myStreak >= 3 ? 2 : 1
        const pts   = wasCorrect ? speed * power * mult : 0
        setLastResult({ correct: wasCorrect, pts })
        if (wasCorrect) sounds.hit(after[`mathStreak${myKey}`] ?? 1)
        else {
          sounds.miss()
          // brief feedback (shows the right answer), then move to my next question — no lockout
          setTimeout(() => advanceQuestion(myQIndex), WRONG_FEEDBACK_MS)
        }
      }
    } catch { /* retry; result will show via firebase update */ }
  }

  // Advance MY index past `fromIndex` (wrong answer or per-question timeout)
  const advanceQuestion = async (fromIndex) => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.status === 'finished' || current.gameType !== 'math') return
        if ((current[`mathQIndex${myKey}`] ?? 0) !== fromIndex) return
        return {
          ...current,
          [`mathQIndex${myKey}`]: fromIndex + 1,
        }
      })
    } catch { /* ignore */ }
  }

  const tryFinishGame = async () => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.status === 'finished') return
        const sX = current.mathScoreX ?? 0
        const sO = current.mathScoreO ?? 0
        const winner = sX > sO ? 'X' : sX < sO ? 'O' : 'draw'
        const scores = { ...(current.scores || {}) }
        if (winner !== 'draw') scores[winner] = (scores[winner] || 0) + 1
        return { ...current, winner, status: 'finished', scores }
      })
    } catch { /* other client resolved */ }
  }

  // ── render: finished ─────────────────────────────────────────────

  const matchWinner = (game.scores?.X || 0) >= 3 ? 'X' : (game.scores?.O || 0) >= 3 ? 'O' : null

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <ResultsPanel game={game} players={game.players} />
        <GameStatus
          status={game.status} winner={game.winner} mySymbol={mySymbol}
          scores={game.scores} players={game.players} gameType={game.gameType}
          onPlayAgain={!matchWinner && !proposal ? onPlayAgain : null}
          onNewMatch={matchWinner && !proposal ? onNewMatch : null}
          onSwitchGame={!proposal ? onSwitchGame : null}
        />
      </div>
    )
  }

  // ── render: spectator ────────────────────────────────────────────

  if (!mySymbol) {
    return (
      <div className="space-y-4">
        <div className="bg-retro-card border border-retro-border rounded p-4 text-center space-y-2">
          <p className="font-pixel text-[9px] text-retro-dim">SPECTATING</p>
          {isPlaying && (
            <ScoreBar game={game} myKey="X" opKey="O" players={game.players} />
          )}
        </div>
        {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // ── render: waiting to start ─────────────────────────────────────

  if (!startedAt) {
    return (
      <div className="space-y-4">
        <div className="bg-retro-card border border-retro-border rounded p-6 text-center space-y-4">
          <p className="font-pixel text-[9px] text-retro-cta">MENTAL MATH DUEL</p>
          <div className="font-pixel text-[8px] text-retro-dim space-y-1 text-left mx-auto w-fit">
            <p>● SAME QUESTIONS FOR BOTH · SOLVE AT YOUR OWN PACE</p>
            <p>⚡ POWER QUESTIONS EVERY 8 ROUNDS · 2× POINTS</p>
            <p>🔥 3-STREAK = DOUBLE NEXT CORRECT</p>
            <p>⏱ 2-MINUTE BLITZ · HIGHEST SCORE WINS</p>
          </div>
          <button
            onClick={handleStartClick}
            className="px-6 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
          >
            START
          </button>
        </div>
        {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // ── render: countdown ────────────────────────────────────────────

  if (isCountdown) {
    return (
      <div className="space-y-4">
        <div className="bg-retro-card border border-retro-border rounded p-8 text-center space-y-3">
          <p className="font-pixel text-[9px] text-retro-dim animate-pulse">GET READY!</p>
          <p className="font-pixel text-7xl text-retro-win text-glow-win">{countdownSec}</p>
          <p className="font-pixel text-[8px] text-retro-dim">THINK FAST</p>
        </div>
      </div>
    )
  }

  // ── render: playing ──────────────────────────────────────────────

  const answered   = hasAnswered
  const isCorrect  = lastResult?.correct === true
  const isWrong    = lastResult?.correct === false

  return (
    <div className="space-y-3">
      {/* Header: time + scores */}
      <div className="flex items-center gap-2">
        <div className="bg-retro-card border border-retro-border rounded px-3 py-1.5 text-center min-w-[4rem]">
          <p className={cn(
            'font-pixel text-[18px] tabular-nums leading-none',
            timeLeftMs < 30_000 ? 'text-retro-p2 text-glow-p2' : 'text-retro-win',
          )}>
            {fmtTime(timeLeftMs)}
          </p>
          <p className="font-pixel text-[7px] text-retro-dim mt-0.5">TIME LEFT</p>
        </div>
        <div className="flex-1">
          <ScoreBar game={game} myKey={myKey} opKey={opKey} players={game.players} />
        </div>
      </div>

      {/* Streak badges */}
      {(myStreak >= 3 || opStreak >= 3) && (
        <div className="flex gap-2 justify-center flex-wrap">
          {myStreak >= 3 && (
            <span className="font-pixel text-[9px] bg-retro-tint-cta border border-retro-cta rounded px-2 py-0.5 text-retro-cta">
              🔥 {game.players?.[myKey]?.name?.toUpperCase() ?? myKey} ×2 STREAK
            </span>
          )}
          {opStreak >= 3 && (
            <span className="font-pixel text-[9px] bg-retro-tint-p2 border border-retro-p2/50 rounded px-2 py-0.5 text-retro-p2">
              🔥 {game.players?.[opKey]?.name?.toUpperCase() ?? opKey} ×2 STREAK
            </span>
          )}
        </div>
      )}

      {/* Question card */}
      <div className={cn(
        'bg-retro-surface border rounded p-4 text-center space-y-3 transition-colors',
        q?.isPower ? 'border-retro-cta/60' : 'border-retro-border',
      )}>
        {q?.isPower && (
          <p className="font-pixel text-[9px] text-retro-cta">
            ⚡ POWER QUESTION · 2× POINTS
          </p>
        )}

        <QuestionBar qPct={qPct} />

        <div className="space-y-1">
          <p className="font-pixel text-[9px] text-retro-dim">Q{myQIndex + 1}</p>
          <p className="font-pixel text-3xl text-retro-text tracking-wider">
            {q?.text ?? '…'}
          </p>
          <p className="font-pixel text-[9px] text-retro-dim">= ?</p>
        </div>

        <SpeedDots pts={speedPts} />

        {/* Answer area */}
        {!answered && (
          <div className="bg-retro-deep border border-retro-border rounded px-4 py-2 min-h-[2.5rem] flex items-center justify-center">
            <p className="font-pixel text-2xl text-retro-text tabular-nums tracking-widest">
              {answer || <span className="opacity-30">_</span>}
            </p>
          </div>
        )}

        {answered && isCorrect && (
          <div className="bg-retro-tint-cta border border-retro-cta/60 rounded px-4 py-2 text-center">
            <p className="font-pixel text-[10px] text-retro-win">✓ CORRECT +{lastResult.pts}</p>
          </div>
        )}

        {answered && isWrong && (
          <div className="bg-retro-tint-p2 border border-retro-p2/60 rounded px-4 py-2 text-center">
            <p className="font-pixel text-[10px] text-retro-p2">
              ✗ WRONG · ANS: {q?.answer} · -{q?.isPower ? 2 : 1}
            </p>
          </div>
        )}

        {answered && !lastResult && (
          <p className="font-pixel text-[9px] text-retro-dim animate-pulse">
            CHECKING...
          </p>
        )}
      </div>

      {/* Opponent activity */}
      {!answered && opponentOnline && (
        <p className="font-pixel text-[9px] text-retro-dim text-center animate-pulse">
          {game.players?.[opKey]?.name?.toUpperCase() ?? opKey} ON Q{opQIndex + 1} ●●●
        </p>
      )}

      {!opponentOnline && (
        <p className="font-pixel text-[10px] text-retro-p2 text-center animate-pulse">
          OPPONENT DISCONNECTED
        </p>
      )}

      {/* Number pad */}
      <NumberPad onKey={handleKey} disabled={answered || !isPlaying} />

      {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
    </div>
  )
}
