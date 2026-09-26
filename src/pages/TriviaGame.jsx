import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import {
  MATCH_QUESTIONS,
  QUESTION_MS,
  applyRoundScores,
  drawMatchOrder,
  matchQuestions,
  orderOf,
  questionMultiplier,
  scoringWindow,
  questionDeadline,
} from '../lib/triviaLogic'
import { TRIVIA_DECK } from '../lib/decks/trivia'
import { roomCoordinator, roomSeats } from '../lib/coordinator'
import { markSeen } from '../lib/seenHistory'
import { normalizeTimerScale, scaledMs, timersOff } from '../lib/timerScale'
import { formatClock } from '../lib/format'
import useServerClock, { getServerNow } from '../hooks/useServerClock'
import RoundEndPanel from '../components/RoundEndPanel'
import GameSwitcher from '../components/GameSwitcher'
import { sounds } from '../lib/sounds'
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
    order: raw.order ?? null,
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
  gameId, game, mySeat, players,
  onStart, onSwitchGame, onNewMatch, proposal,
}) {
  const round = normalizeRound(game.round)
  const seats = activeSeats(players || {})
  const playerCount = Object.keys(players || {}).length
  const enough = seats.length >= MIN_PLAYERS

  const scores = game.scores || {}
  const isPlayer = !!mySeat && !!players?.[mySeat]
  // Online-aware coordinator (src/lib/coordinator.js roomCoordinator): the
  // room host (or a TRANSFER HOST pick, game.hostUid) while connected, else
  // the next online seat by join time — so a host
  // disconnect hands START, question->reveal and reveal->next off instead of
  // freezing the match. Each write below re-checks phase inside its
  // transaction, so a coordinator handover mid-flight stays single-writer.
  const allSeats = roomSeats(players)
  const coordinatorId = roomCoordinator(players, game.hostUid ?? null)
  const amCoordinator = isPlayer && coordinatorId === mySeat
  const nameOf = (id) => players?.[id]?.name || id || ''

  const timerScale = normalizeTimerScale(game.timerScale)
  const noTimer = timersOff(game.timerScale)
  const windowMs = scaledMs(QUESTION_MS, timerScale)

  // A fresh match waits for the coordinator to draw its questions (avoiding
  // the room's seen history) before anyone sees Q1. Legacy rounds without an
  // order keep the old seededDraw(deckSeed) questions.
  const orderKey = orderOf(round, TRIVIA_DECK.length).join(',')
  const hasOrder = orderKey !== ''
  const needsOrder = !!round && !hasOrder && round.phase === 'question' && round.qNum === 0 &&
    Object.keys(round.answers || {}).length === 0

  const questions = useMemo(
    () => (round && !needsOrder ? matchQuestions(TRIVIA_DECK, round) : []),
    [round?.deckSeed, orderKey, needsOrder], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const question = round && questions.length ? questions[round.qNum % questions.length] : null
  const isFinal = !!round && questionMultiplier(round.qNum) > 1

  const { now: serverNow } = useServerClock(game.status === 'playing' && round ? 250 : 0)
  const [localChoice, setLocalChoice] = useState(null)
  const [starting, runStart] = useBusy()
  const [nexting, runNext] = useBusy()

  const prevPhaseKey = useRef(null)
  const advancing = useRef(false)
  const advancingReveal = useRef(false)
  const drawing = useRef(false)
  const lastQNumRef = useRef(round?.qNum)
  const scoresSeeded = useRef(false)
  // Snapshot of who was seated when the match's first question started — used to
  // compute `joinedLate` from actual seat membership rather than from `scores`
  // (a seated player who never answers Q1 has no score delta and would otherwise
  // be wrongly benched as "joined late" the moment Q2 starts). State, not a ref,
  // because it's read during render.
  const [seatedAtStart, setSeatedAtStart] = useState(
    () => new Set(round?.qNum === 0 ? Object.keys(players || {}) : []),
  )

  // Snapshot who is seated as of Q1 (qNum 0) — the definitive "was here at match
  // start" roster `joinedLate` is computed against, independent of `scores`. Kept
  // in sync via the render-phase derive-from-prop-change pattern (see `prevQNum`
  // below), not an effect, so it never trails a player joining right at kickoff.
  if (round?.qNum === 0) {
    const seatIds = Object.keys(players || {})
    const same = seatIds.length === seatedAtStart.size && seatIds.every(id => seatedAtStart.has(id))
    if (!same) setSeatedAtStart(new Set(seatIds))
  }

  // ---- COORDINATOR: seed scores[seat]=0 for every seated player once, at match
  // start, so a player who never answers Q1 still has a score entry and isn't
  // mistaken for someone who joined mid-match (see `joinedLate` below). -----------
  useEffect(() => {
    if (!amCoordinator || !round || round.qNum !== 0 || game.status !== 'playing') return
    if (scoresSeeded.current) return
    const seatIds = Object.keys(players || {})
    if (seatIds.every(id => id in scores)) { scoresSeeded.current = true; return }
    scoresSeeded.current = true
    runTransaction(ref(db, `games/${gameId}/scores`), current => {
      const next = { ...(current || {}) }
      for (const id of seatIds) if (!(id in next)) next[id] = 0
      return next
    }).catch(() => { scoresSeeded.current = false })
  }, [amCoordinator, round?.qNum, game.status, players, scores, gameId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- COORDINATOR: draw this match's questions once, avoiding what the room
  // has already seen (seen/trivia), and restamp qStartAt so Q1 gets its full
  // window. One transaction on the room: order + seen history land together. --
  useEffect(() => {
    if (!amCoordinator || !needsOrder || game.status !== 'playing') return
    if (drawing.current) return
    drawing.current = true
    const fallbackSeed = Math.floor(Math.random() * 2147483647)
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || !current.round) return current
      const r = current.round
      if (r.phase !== 'question' || (r.qNum ?? 0) !== 0) return
      if (orderOf(r, TRIVIA_DECK.length).length || Object.keys(r.answers || {}).length) return
      const deckSeed = r.deckSeed ?? fallbackSeed
      const order = drawMatchOrder(TRIVIA_DECK, deckSeed, current.seen?.trivia)
      return {
        ...current,
        round: { ...r, deckSeed, order, qStartAt: getServerNow() },
        seen: { ...(current.seen || {}), trivia: markSeen(current.seen?.trivia, order) },
      }
    }).catch(() => {}).finally(() => { drawing.current = false })
  }, [amCoordinator, needsOrder, game.status, gameId, serverNow])

  // ---- COORDINATOR: defend against a bad qStartAt seed (e.g. stamped in the future)
  // by restamping it at the very start of the match if it's implausibly far ahead. --
  useEffect(() => {
    if (!amCoordinator || !round || round.phase !== 'question' || round.qNum !== 0) return
    if (round.qStartAt == null) return
    const TOLERANCE_MS = 2000
    if (round.qStartAt - serverNow <= TOLERANCE_MS) return
    runTransaction(ref(db, `games/${gameId}/round`), current => {
      if (!current || current.phase !== 'question' || current.qNum !== 0) return current
      if ((current.qStartAt ?? 0) - getServerNow() <= TOLERANCE_MS) return current
      return { ...current, qStartAt: getServerNow() }
    }).catch(() => {})
  }, [amCoordinator, round?.phase, round?.qNum, round?.qStartAt, serverNow, gameId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset per-question local state when the question advances (render-phase
  // derive-from-prop-change pattern — no cascading effect renders).
  const [prevQNum, setPrevQNum] = useState(round?.qNum)
  if (prevQNum !== round?.qNum) {
    setPrevQNum(round?.qNum)
    setLocalChoice(null)
  }

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
  const deadline = round && !needsOrder ? questionDeadline(round.qStartAt, timerScale) : null
  const remainingMs = deadline != null ? Math.max(0, deadline - serverNow) : null
  const timeUp = remainingMs != null && remainingMs <= 0
  // Joined mid-match (seat wasn't part of the roster snapshotted at Q1, past
  // question 0): spectate until next match. Computed from seat membership, not
  // `scores` — a seated player who simply never answers Q1 must not be benched.
  const joinedLate = isPlayer && (round?.qNum ?? 0) > 0 && !seatedAtStart.has(mySeat)

  // ---- COORDINATOR: question → reveal + score, one idempotent transaction -------
  useEffect(() => {
    if (lastQNumRef.current !== round?.qNum) {
      lastQNumRef.current = round?.qNum
      advancing.current = false
    }
    if (!amCoordinator || !round || round.phase !== 'question' || game.status !== 'playing') return
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
          const qs = matchQuestions(TRIVIA_DECK, cur)
          const q = qs.length ? qs[cur.qNum % qs.length] : null
          if (!q) return current
          const { deltas, newStreaks } = applyRoundScores(
            cur.answers, { answer: q.answer, qStartAt: cur.qStartAt }, cur.streaks,
            { ...scoringWindow(current.timerScale), multiplier: questionMultiplier(cur.qNum) },
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
  }, [amCoordinator, round?.phase, round?.answers, timeUp, gameId, game.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // reveal → next question (or match end). Guarded on phase + qNum inside the
  // transaction, so the timer, a manual NEXT and a coordinator handover can
  // never double-advance. Streaks carry into the next question's round.
  const advanceFromReveal = (qNum) => runTransaction(ref(db, `games/${gameId}`), current => {
    if (!current || !current.round || current.round.phase !== 'reveal' || current.round.qNum !== qNum) {
      return current // already advanced (e.g. by a coordinator handover)
    }
    const isLast = qNum + 1 >= MATCH_QUESTIONS
    return isLast
      ? { ...current, status: 'finished', proposal: null }
      : {
          ...current,
          round: {
            phase: 'question',
            deckSeed: current.round.deckSeed,
            order: current.round.order ?? null,
            qNum: qNum + 1,
            qStartAt: getServerNow(),
            answers: null,
            scored: null,
            deltas: null,
            streaks: current.round.streaks ?? null,
          },
          proposal: null,
        }
  })

  // ---- COORDINATOR: reveal auto-advances after REVEAL_MS (scaled; with timers
  // off the coordinator taps NEXT QUESTION instead) --------------------------
  const revealMs = scaledMs(REVEAL_MS, timerScale)
  useEffect(() => {
    if (!amCoordinator || !round || round.phase !== 'reveal' || !round.scored) return
    if (game.status !== 'playing' || revealMs == null) return
    const qNum = round.qNum
    const t = setTimeout(() => {
      if (advancingReveal.current) return
      advancingReveal.current = true
      advanceFromReveal(qNum).catch(() => {}).finally(() => { advancingReveal.current = false })
    }, revealMs)
    return () => clearTimeout(t)
  }, [amCoordinator, round?.phase, round?.scored, round?.qNum, game.status, gameId, revealMs]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Answer pick ----------------------------------------------------------
  const handlePick = async (choice) => {
    if (!isPlayer || iAnswered || joinedLate || round?.phase !== 'question') return
    setLocalChoice(choice)
    sounds.move('O')
    try {
      await update(ref(db, `games/${gameId}/round/answers`), {
        [mySeat]: { choice, at: getServerNow() },
      })
    } catch {
      setLocalChoice(null)
      toast.error('ANSWER FAILED — RETRY')
    }
  }

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

    const headline = champs.length === 0
      ? 'NOBODY SCORED'
      : champs.some(c => c.id === mySeat)
        ? 'YOU WIN!'
        : `${champs.map(c => c.name.toUpperCase()).join(' & ')} WINS`

    return (
      <div className="space-y-5 text-center">
        <div className="space-y-2">
          <p className="font-pixel text-sm text-retro-p1 text-glow-p1">TRIVIA BLITZ</p>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
            {MATCH_QUESTIONS} questions. Fast answers score more.<br />
            Streaks stack up to +300. The final question scores double.
          </p>
        </div>

        {matchOver ? (
          <RoundEndPanel
            caption="MATCH OVER"
            headline={headline}
            sub={champs.length > 1 && (
              <p className="font-pixel text-[9px] text-retro-dim">SHARED VICTORY</p>
            )}
            scores={{
              title: 'FINAL SCORES',
              rows: ranked.map(p => ({
                id: p.id, name: p.name, score: p.score, you: p.id === mySeat,
                muted: players[p.id]?.online === false,
                win: champs.some(c => c.id === p.id),
              })),
            }}
            actions={isPlayer ? [
              !proposal && onNewMatch && {
                key: 'new', label: 'NEW MATCH', busyLabel: 'STARTING…', onClick: onNewMatch,
              },
            ] : []}
            share={isPlayer && champs.length > 0 ? {
              gameLabel: 'TRIVIA BLITZ',
              headline: champs.some(c => c.id === mySeat)
                ? 'YOU WIN!'
                : `${(champs[0]?.name || '').toUpperCase()} WINS`,
              sub: 'Trivia Blitz · Game Night',
            } : null}
          />
        ) : (
          <>
            {/* Lobby */}
            <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1.5">
              <p className="font-pixel text-[9px] text-retro-dim tracking-widest">
                PLAYERS ({playerCount})
              </p>
              {allSeats.length === 0 && (
                <p className="font-mono text-[11px] text-retro-dim arcade-blink">WAITING…</p>
              )}
              {allSeats.map(id => (
                <div key={id} className="flex items-center justify-between font-mono text-[11px]">
                  <span className={cn(
                    'truncate',
                    id === mySeat ? 'text-retro-p1' : 'text-retro-text',
                    players[id]?.online === false && 'opacity-40',
                  )}>
                    {nameOf(id)}{id === mySeat ? ' (YOU)' : ''}
                  </span>
                </div>
              ))}
            </div>

            {!enough && (
              <p className="font-pixel text-[10px] text-retro-p2 arcade-blink leading-relaxed">
                NEED {MIN_PLAYERS}+ PLAYERS<br />
                ({Math.max(0, MIN_PLAYERS - playerCount)} MORE TO START)
              </p>
            )}

            {amCoordinator && enough && (
              <button
                onClick={() => runStart(() => onStart())}
                disabled={starting}
                className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
              >
                {starting ? 'STARTING…' : 'START MATCH'}
              </button>
            )}
            {!amCoordinator && enough && (
              <p className="font-pixel text-[10px] text-retro-dim arcade-blink">
                WAITING FOR {coordinatorId ? nameOf(coordinatorId).toUpperCase() : 'HOST'} TO START…
              </p>
            )}
          </>
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
      {round.phase === 'question' && remainingMs != null && windowMs ? (
        <div className="space-y-1">
          <div className="h-1.5 bg-retro-surface rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                remainingMs > 5000 ? 'bg-retro-win' : 'bg-retro-danger',
              )}
              style={{ width: `${Math.min(100, Math.round((remainingMs / windowMs) * 100))}%` }}
            />
          </div>
          <p className="font-pixel text-[8px] text-retro-dim text-right tabular-nums">{formatClock(remainingMs)}</p>
        </div>
      ) : round.phase === 'question' && noTimer && (
        <p className="font-pixel text-[8px] text-retro-dim text-center tracking-widest">
          NO TIMER · ENDS WHEN EVERYONE ANSWERS
        </p>
      )}

      {/* Question card */}
      <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2">
        <p className="font-pixel text-[8px] text-retro-dim tracking-widest text-center">
          QUESTION {round.qNum + 1}/{MATCH_QUESTIONS}
          {round.phase === 'reveal' ? ' · THE ANSWER' : ''}
        </p>
        {isFinal && (
          <p className="font-pixel text-[9px] text-retro-p2 text-glow-p2 text-center tracking-widest">
            ★ FINAL QUESTION · DOUBLE POINTS ★
          </p>
        )}
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
                  SCORES · Q{round.qNum + 1}/{MATCH_QUESTIONS}{isFinal ? ' · ×2' : ''}
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

              {/* Timers off: the coordinator moves on by hand. */}
              {revealMs == null && (amCoordinator ? (
                <button
                  onClick={() => runNext(
                    () => advanceFromReveal(round.qNum),
                    () => toast.error('NEXT FAILED — CHECK CONNECTION'),
                  )}
                  disabled={nexting}
                  className="w-full py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95 disabled:opacity-50"
                >
                  {nexting ? 'LOADING…' : round.qNum + 1 >= MATCH_QUESTIONS ? 'FINISH MATCH' : 'NEXT QUESTION'}
                </button>
              ) : (
                <p className="font-pixel text-[9px] text-retro-dim text-center arcade-blink">
                  WAITING FOR {(nameOf(coordinatorId) || 'HOST').toUpperCase()}…
                </p>
              ))}
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
