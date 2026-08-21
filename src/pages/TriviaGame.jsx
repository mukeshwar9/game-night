import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { ref, onValue, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import {
  MATCH_QUESTIONS,
  QUESTION_MS,
  seededDraw,
  applyRoundScores,
} from '../lib/triviaLogic'
import { TRIVIA_DECK } from '../lib/decks/trivia'
import GameSwitcher from '../components/GameSwitcher'
import { sounds } from '../lib/sounds'
import { shareResult } from '../lib/shareCard'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

const MIN_PLAYERS = 2
const REVEAL_MS = 5000
const GLYPHS = ['▲', '■', '●', '◆']

function normalizeRound(raw) {
  if (!raw) return null
  return {
    phase: raw.phase ?? 'question',
    deckSeed: raw.deckSeed ?? 1,
    qNum: raw.qNum ?? 0,
    qStartAt: raw.qStartAt ?? null,
    answers: raw.answers ?? {},
    scored: !!raw.scored,
    streaks: raw.streaks ?? {},
    deltas: raw.deltas ?? {},
  }
}

// Seat list of players currently present (online). Falls back to all known
// players if presence data is missing so the round can never deadlock.
function activeSeats(players) {
  const all = Object.values(players || {}).filter(Boolean)
    .sort((a, b) => (a.joinedAt - b.joinedAt) || String(a.playerId).localeCompare(String(b.playerId)))
    .map(p => p.playerId)
  const online = all.filter(id => players[id]?.online !== false)
  return online.length >= MIN_PLAYERS ? online : all
}

export default function TriviaGame({
  gameId, game, mySeat, players, isHost,
  onStart, onSwitchGame, onNewMatch, proposal,
}) {
  const round = normalizeRound(game.round)
  const seats = activeSeats(players || {})
  const playerCount = Object.keys(players || {}).length
  const enough = seats.length >= MIN_PLAYERS

  const scores = game.scores || {}
  const isPlayer = !!mySeat && !!players?.[mySeat]

  const questions = useMemo(
    () => (round ? seededDraw(TRIVIA_DECK, round.deckSeed, MATCH_QUESTIONS) : []),
    [round?.deckSeed], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const question = round ? questions[round.qNum % Math.max(1, questions.length)] : null

  const [clockOffset, setClockOffset] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [localChoice, setLocalChoice] = useState(null)
  const [sharing, runShare] = useBusy()

  const prevPhaseKey = useRef(null)
  const advancing = useRef(false)
  const lastQNumRef = useRef(round?.qNum)

  // Corrected clock — every deadline comparison runs through this offset.
  useEffect(() => {
    const offRef = ref(db, '.info/serverTimeOffset')
    const unsub = onValue(offRef, snap => setClockOffset(snap.val() ?? 0))
    return () => unsub()
  }, [])
  const serverNow = now + clockOffset

  // Reset per-question local state when the question advances (render-phase
  // derive-from-prop-change pattern — no cascading effect renders).
  const [prevQNum, setPrevQNum] = useState(round?.qNum)
  if (prevQNum !== round?.qNum) {
    setPrevQNum(round?.qNum)
    setLocalChoice(null)
  }

  // Ticker drives the countdown display.
  useEffect(() => {
    if (!round || game.status !== 'playing') return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [round?.phase, game.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Phase-change sounds.
  useEffect(() => {
    if (!round || !question) return
    const key = `${round.phase}:${round.qNum}:${round.scored}`
    if (key !== prevPhaseKey.current) {
      if (round.phase === 'reveal' && round.scored && isPlayer) {
        const mine = round.answers[mySeat]
        if (mine?.choice === question.answer) sounds.win()
        else sounds.miss()
      }
      prevPhaseKey.current = key
    }
  }, [round?.phase, round?.scored, round?.qNum]) // eslint-disable-line react-hooks/exhaustive-deps

  const myAnswer = isPlayer ? round?.answers?.[mySeat] : null
  const iAnswered = !!myAnswer || localChoice != null
  const answeredCount = Object.keys(round?.answers || {}).length
  const remainingMs = round?.qStartAt
    ? Math.max(0, round.qStartAt + QUESTION_MS - serverNow)
    : null
  const timeUp = remainingMs != null && remainingMs <= 0
  // Joined mid-match (no score yet, past question 0): spectate until next match.
  const joinedLate = isPlayer && !(mySeat in scores) && (round?.qNum ?? 0) > 0

  // ---- HOST: question → reveal + score, one idempotent transaction ----------
  useEffect(() => {
    if (lastQNumRef.current !== round?.qNum) {
      lastQNumRef.current = round?.qNum
      advancing.current = false
    }
    if (!isHost || !round || round.phase !== 'question' || game.status !== 'playing') return
    const everyoneIn = seats.length > 0 && seats.every(id =>
      id in (round.answers || {}) || players[id]?.online === false)
    if (!everyoneIn && !timeUp) return
    if (advancing.current) return
    advancing.current = true

    const run = async () => {
      try {
        await runTransaction(ref(db, `games/${gameId}`), current => {
          if (!current || !current.round) return current
          if (current.round.phase !== 'question') return // someone else advanced
          const cur = normalizeRound(current.round)
          const q = seededDraw(TRIVIA_DECK, cur.deckSeed, MATCH_QUESTIONS)[cur.qNum % MATCH_QUESTIONS]
          if (!q) return current
          const { deltas, newStreaks } = applyRoundScores(
            cur.answers, { answer: q.answer, qStartAt: cur.qStartAt }, cur.streaks,
          )
          const newScores = { ...(current.scores || {}) }
          for (const [uid, pts] of Object.entries(deltas)) {
            newScores[uid] = (newScores[uid] || 0) + pts
          }
          return {
            ...current,
            scores: newScores,
            round: {
              ...current.round,
              phase: 'reveal',
              scored: true,
              deltas,
              streaks: newStreaks,
            },
          }
        })
      } catch {
        advancing.current = false // retry on transient failure
      }
    }
    run()
  }, [isHost, round?.phase, round?.answers, timeUp, gameId, game.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- HOST: reveal auto-advances after REVEAL_MS ---------------------------
  useEffect(() => {
    if (!isHost || !round || round.phase !== 'reveal' || !round.scored) return
    if (game.status !== 'playing') return
    const t = setTimeout(() => {
      const isLast = round.qNum + 1 >= MATCH_QUESTIONS
      update(ref(db, `games/${gameId}`), isLast
        ? { status: 'finished', proposal: null }
        : {
            round: {
              phase: 'question',
              deckSeed: round.deckSeed,
              qNum: round.qNum + 1,
              qStartAt: Date.now() + clockOffset,
              answers: null,
              scored: null,
              deltas: null,
            },
            proposal: null,
          }).catch(() => {})
    }, REVEAL_MS)
    return () => clearTimeout(t)
  }, [isHost, round?.phase, round?.scored, round?.qNum, game.status, gameId, clockOffset]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Answer pick ----------------------------------------------------------
  const handlePick = useCallback(async (choice) => {
    if (!isPlayer || iAnswered || joinedLate || round?.phase !== 'question') return
    setLocalChoice(choice)
    sounds.move('O')
    try {
      await update(ref(db, `games/${gameId}/round/answers`), {
        [mySeat]: { choice, at: Date.now() + clockOffset },
      })
    } catch {
      setLocalChoice(null)
      toast.error('ANSWER FAILED — RETRY')
    }
  }, [isPlayer, iAnswered, joinedLate, round?.phase, gameId, mySeat, clockOffset])

  // -------------------------------------------------------------------------
  // WAITING / START screen (status !== 'playing')
  // -------------------------------------------------------------------------
  if (game.status !== 'playing') {
    const matchOver = game.status === 'finished'
    const ranked = Object.entries(scores)
      .map(([id, score]) => ({ id, name: players[id]?.name || id, score }))
      .sort((a, b) => b.score - a.score)
    const topScore = ranked[0]?.score ?? 0
    const champs = topScore > 0 ? ranked.filter(p => p.score === topScore) : []

    return (
      <div className="space-y-5 text-center">
        {matchOver && champs.length > 0 && (
          <div className="space-y-1">
            <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
            <p className="font-pixel text-base text-retro-cta text-glow-cta">
              {champs.some(c => c.id === mySeat)
                ? 'YOU WIN!'
                : `${champs.map(c => c.name.toUpperCase()).join(' & ')} WINS`}
            </p>
            {champs.length > 1 && (
              <p className="font-pixel text-[9px] text-retro-dim">SHARED VICTORY</p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <p className="font-pixel text-sm text-retro-p1 text-glow-p1">TRIVIA BLITZ</p>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
            {MATCH_QUESTIONS} questions. Fast answers score more.<br />Streaks stack up to +300.
          </p>
        </div>

        {/* Lobby / scoreboard */}
        <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1.5">
          <p className="font-pixel text-[9px] text-retro-dim tracking-widest">
            PLAYERS ({playerCount})
          </p>
          {ranked.length === 0 && (
            <p className="font-mono text-[11px] text-retro-dim arcade-blink">WAITING…</p>
          )}
          {ranked.map(p => (
            <div key={p.id} className="flex items-center justify-between font-mono text-[11px]">
              <span className={cn(
                'truncate',
                p.id === mySeat ? 'text-retro-p1' : 'text-retro-text',
                players[p.id]?.online === false && 'opacity-40',
              )}>
                {p.name}{p.id === mySeat ? ' (YOU)' : ''}
              </span>
              {matchOver && <span className="text-retro-dim ml-2">{p.score}</span>}
            </div>
          ))}
        </div>

        {!enough && (
          <p className="font-pixel text-[10px] text-retro-p2 arcade-blink leading-relaxed">
            NEED {MIN_PLAYERS}+ PLAYERS<br />
            ({Math.max(0, MIN_PLAYERS - playerCount)} MORE TO START)
          </p>
        )}

        {isHost && enough && !matchOver && (
          <button
            onClick={onStart}
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
          >
            START MATCH
          </button>
        )}
        {!isHost && enough && !matchOver && (
          <p className="font-pixel text-[10px] text-retro-dim arcade-blink">
            WAITING FOR HOST TO START…
          </p>
        )}

        {matchOver && isPlayer && champs.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {!proposal && onNewMatch && (
              <button
                onClick={onNewMatch}
                className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
              >
                NEW MATCH
              </button>
            )}
            <button
              onClick={() => runShare(async () => {
                const ok = await shareResult({
                  gameLabel: 'TRIVIA BLITZ',
                  headline: champs.some(c => c.id === mySeat)
                    ? 'YOU WIN!'
                    : `${(champs[0]?.name || '').toUpperCase()} WINS`,
                  sub: 'Trivia Blitz · Game Night',
                  accentVar: '--c-cta',
                  url: window.location.href,
                })
                if (!ok) toast.error("COULDN'T BUILD SHARE CARD — TRY AGAIN")
              })}
              disabled={sharing}
              className="px-6 py-2.5 min-w-[6.5rem] font-pixel text-xs border-2 border-retro-border text-retro-dim rounded hover:border-retro-cta hover:text-retro-cta transition-all active:scale-95 disabled:opacity-50"
            >
              {sharing ? 'BUILDING…' : 'SHARE'}
            </button>
          </div>
        )}

        {isPlayer && onSwitchGame && !proposal && (
          <GameSwitcher currentType="trivia" onSwitch={onSwitchGame} />
        )}
      </div>
    )
  }

  if (!round || !question) {
    return (
      <div className="text-center py-8 font-pixel text-[10px] text-retro-dim arcade-blink">
        STARTING MATCH…
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Shared header: question card + live standings
  // -------------------------------------------------------------------------
  const ranked = Object.entries(scores)
    .map(([id, score]) => ({ id, name: players[id]?.name || id, score }))
    .sort((a, b) => b.score - a.score)
  const top3 = ranked.slice(0, 3)
  const distribution = [0, 0, 0, 0]
  for (const a of Object.values(round.answers || {})) {
    if (a && Number.isInteger(a.choice)) distribution[a.choice]++
  }

  return (
    <div className="space-y-4">
      {/* Timer bar */}
      {round.phase === 'question' && remainingMs != null && (
        <div className="h-1.5 bg-retro-surface rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              remainingMs > 5000 ? 'bg-retro-win' : 'bg-retro-danger',
            )}
            style={{ width: `${Math.min(100, Math.round((remainingMs / QUESTION_MS) * 100))}%` }}
          />
        </div>
      )}

      {/* Question card */}
      <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2">
        <p className="font-pixel text-[8px] text-retro-dim tracking-widest text-center">
          QUESTION {round.qNum + 1}/{MATCH_QUESTIONS}
          {round.phase === 'reveal' ? ' · THE ANSWER' : ''}
        </p>
        <p className="font-mono text-[13px] text-retro-text leading-relaxed text-center">
          {question.q}
        </p>
      </div>

      {/* ---- QUESTION PHASE ---- */}
      {round.phase === 'question' && (
        <div className="space-y-2">
          {joinedLate ? (
            <p className="font-pixel text-[10px] text-retro-dim text-center py-4 leading-relaxed">
              JOINED MID-MATCH<br />SPECTATING UNTIL THE NEXT ONE
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {question.options.map((opt, idx) => {
                const picked = (localChoice ?? myAnswer?.choice) === idx
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
          )}
          {!joinedLate && (
            <p className="font-pixel text-[9px] text-retro-dim text-center pt-1">
              {iAnswered
                ? `LOCKED IN ✓ — ${answeredCount}/${seats.length} ANSWERED`
                : 'PICK FAST — SPEED IS POINTS'}
            </p>
          )}
        </div>
      )}

      {/* ---- REVEAL PHASE ---- */}
      {round.phase === 'reveal' && (
        <div className="space-y-3">
          {!round.scored ? (
            <p className="font-pixel text-[10px] text-retro-cta text-glow-cta text-center arcade-blink py-4">
              SCORING…
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                {question.options.map((opt, idx) => {
                  const isCorrect = idx === question.answer
                  const mine = (myAnswer?.choice ?? localChoice) === idx
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

              {/* Per-player deltas + running scores */}
              <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1">
                <p className="font-pixel text-[9px] text-retro-dim tracking-widest text-center">
                  SCORES · Q{round.qNum + 1}/{MATCH_QUESTIONS}
                </p>
                {ranked.map(p => {
                  const delta = round.deltas[p.id]
                  const streak = round.streaks[p.id] || 0
                  return (
                    <div key={p.id} className="flex items-center justify-between font-mono text-[11px]">
                      <span className={cn('truncate', p.id === mySeat ? 'text-retro-p1' : 'text-retro-text')}>
                        {p.name}{p.id === mySeat ? ' (YOU)' : ''}
                        {streak >= 3 && <span className="ml-1" title={`${streak} streak`}>🔥{streak}</span>}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {delta != null && (
                          <span className={delta > 0 ? 'text-retro-win' : 'text-retro-dim'}>
                            {delta > 0 ? `+${delta}` : '+0'}
                          </span>
                        )}
                        <span className="text-retro-cta">{p.score}</span>
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Top-3 ticker */}
              {top3.length > 0 && top3[0].score > 0 && (
                <p className="font-pixel text-[9px] text-retro-dim text-center">
                  🥇 {top3[0]?.name.toUpperCase()}
                  {top3[1] && ` · 🥈 ${top3[1].name.toUpperCase()}`}
                  {top3[2] && ` · 🥉 ${top3[2].name.toUpperCase()}`}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {isPlayer && onSwitchGame && !proposal && round.phase === 'reveal' && round.scored && (
        <GameSwitcher currentType="trivia" onSwitch={onSwitchGame} />
      )}
    </div>
  )
}
