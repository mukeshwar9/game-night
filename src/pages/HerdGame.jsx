import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { ref, onValue, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import {
  HERD_TARGET,
  ANSWER_MS,
  groupAnswers,
  scoreGroups,
  nextCow,
  getMatchWinner,
  seatOrder,
  allAnswered,
  seededShuffle,
} from '../lib/herdLogic'
import { HERD_PROMPTS } from '../lib/decks/herd'
import GameSwitcher from '../components/GameSwitcher'
import { sounds } from '../lib/sounds'
import { shareResult } from '../lib/shareCard'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

const MIN_PLAYERS = 3

function normalizeRound(raw) {
  if (!raw) return null
  return {
    phase: raw.phase ?? 'answering',
    promptIndex: raw.promptIndex ?? 0,
    deckSeed: raw.deckSeed ?? 1,
    answers: raw.answers ?? {},
    endsAt: raw.endsAt ?? null,
    scored: !!raw.scored,
    cowTo: raw.cowTo ?? null,
    cowMoved: !!raw.cowMoved,
  }
}

// Seat list of players currently present (online). Falls back to all known
// players if presence data is missing so the round can never deadlock.
function activeSeats(players) {
  const all = seatOrder(players)
  const online = all.filter(id => players[id]?.online !== false)
  return online.length >= MIN_PLAYERS ? online : all
}

export default function HerdGame({
  gameId, game, mySeat, players, isHost,
  onStart, onSwitchGame, onNewMatch, proposal,
}) {
  const round = normalizeRound(game.round)
  const seats = activeSeats(players || {})
  const playerCount = Object.keys(players || {}).length
  const enough = seats.length >= MIN_PLAYERS

  const scores = game.scores || {}
  const herdCow = game.herdCow ?? null
  const isPlayer = !!mySeat && !!players?.[mySeat]

  const prompts = useMemo(
    () => (round ? seededShuffle(HERD_PROMPTS, round.deckSeed) : null),
    [round?.deckSeed], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const prompt = round && prompts
    ? prompts[round.promptIndex % prompts.length]
    : null

  const [answerInput, setAnswerInput] = useState('')
  const [inputError, setInputError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sharing, runShare] = useBusy()
  const [now, setNow] = useState(() => Date.now())
  const [clockOffset, setClockOffset] = useState(0)

  const prevPhase = useRef(round?.phase)
  const prevPromptIndex = useRef(round?.promptIndex)
  const advancing = useRef(false)

  // Corrected clock — every deadline comparison runs through this offset.
  useEffect(() => {
    const offRef = ref(db, '.info/serverTimeOffset')
    const unsub = onValue(offRef, snap => setClockOffset(snap.val() ?? 0))
    return () => unsub()
  }, [])
  const serverNow = now + clockOffset

  // Reset per-round local state when the prompt advances.
  useEffect(() => {
    if (!round) return
    if (round.promptIndex !== prevPromptIndex.current) {
      setAnswerInput('')
      setInputError('')
      advancing.current = false
      prevPromptIndex.current = round.promptIndex
    }
  }, [round?.promptIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ticker drives the countdown display.
  useEffect(() => {
    if (!round || round.phase !== 'answering' || game.status !== 'playing') return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [round?.phase, game.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Phase-change sounds.
  useEffect(() => {
    if (!round || !prompt) return
    if (round.phase !== prevPhase.current) {
      if (round.phase === 'reveal') {
        if (round.cowMoved && round.cowTo === mySeat) sounds.bust()
        else if (isPlayer && round.scored) {
          const iScored = scoreGroups(groupAnswers(round.answers)).pointUids.includes(mySeat)
          if (iScored) sounds.win()
          else sounds.miss()
        }
      }
      prevPhase.current = round.phase
    }
  }, [round?.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const myAnswer = isPlayer ? String(round?.answers?.[mySeat] ?? '').trim() : ''
  const iAnswered = myAnswer !== ''
  const answeredCount = Object.values(round?.answers || {})
    .filter(a => String(a ?? '').trim() !== '').length
  const remainingMs = round?.endsAt ? Math.max(0, round.endsAt - serverNow) : null
  const timeUp = remainingMs != null && remainingMs <= 0

  // ---- HOST: answering → reveal + score + Cow, one idempotent transaction ----
  useEffect(() => {
    if (!isHost || !round || round.phase !== 'answering' || game.status !== 'playing') return
    if (!allAnswered(seats, round.answers) && !timeUp) return
    if (advancing.current) return
    advancing.current = true

    const run = async () => {
      try {
        await runTransaction(ref(db, `games/${gameId}`), current => {
          if (!current || !current.round) return current
          if (current.round.phase !== 'answering') return // someone else advanced
          const cur = normalizeRound(current.round)
          const groups = groupAnswers(cur.answers)
          const { pointUids } = scoreGroups(groups)
          const answeredUids = Object.entries(cur.answers)
            .filter(([, t]) => String(t ?? '').trim() !== '')
            .map(([uid]) => uid)
          const { cow, transferred } = nextCow(groups, current.herdCow ?? null, answeredUids)
          const seatSet = new Set(
            Object.values(current.players || {}).filter(Boolean).map(p => p.playerId),
          )
          const newScores = { ...(current.scores || {}) }
          for (const uid of pointUids) {
            if (seatSet.has(uid)) newScores[uid] = (newScores[uid] || 0) + 1
          }
          const winner = getMatchWinner(newScores, cow)
          return {
            ...current,
            scores: newScores,
            herdCow: cow,
            status: winner ? 'finished' : 'playing',
            round: {
              ...current.round,
              phase: 'reveal',
              scored: true,
              cowTo: cow,
              cowMoved: transferred,
            },
          }
        })
      } catch {
        advancing.current = false // allow a retry on transient failure
      }
    }
    run()
  }, [isHost, round?.phase, round?.answers, timeUp, gameId, game.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Submit my answer (plaintext by design — the target is other heads) ----
  const handleSubmitAnswer = useCallback(async () => {
    if (!isPlayer || iAnswered || submitting || !prompt) return
    const text = answerInput.trim()
    if (!text) { setInputError('TYPE AN ANSWER'); return }
    setInputError('')
    setSubmitting(true)
    try {
      sounds.move('X')
      await update(ref(db, `games/${gameId}/round/answers`), { [mySeat]: text })
    } catch {
      setInputError('SUBMIT FAILED — RETRY')
    } finally {
      setSubmitting(false)
    }
  }, [isPlayer, iAnswered, submitting, answerInput, prompt, gameId, mySeat])

  // ---- Next prompt (any player can advance after the reveal) -----------------
  const handleNextPrompt = useCallback(async () => {
    if (!isPlayer || !round || !round.scored) return
    try {
      await update(ref(db, `games/${gameId}`), {
        round: {
          phase: 'answering',
          promptIndex: round.promptIndex + 1,
          deckSeed: round.deckSeed,
          answers: null,
          endsAt: Date.now() + clockOffset + ANSWER_MS,
          scored: null,
          cowTo: null,
          cowMoved: null,
        },
        proposal: null,
      })
    } catch { /* ignore */ }
  }, [isPlayer, round, gameId, clockOffset])

  // -------------------------------------------------------------------------
  // WAITING / START screen (status !== 'playing')
  // -------------------------------------------------------------------------
  if (game.status !== 'playing') {
    const matchOver = game.status === 'finished'
    const ranked = seatOrder(players || {})
      .map(id => ({ id, name: players[id]?.name || id, score: scores[id] || 0 }))
      .sort((a, b) => b.score - a.score)
    const champ = ranked.find(p => p.id !== herdCow) || ranked[0]

    return (
      <div className="space-y-5 text-center">
        {matchOver && champ && (
          <div className="space-y-1">
            <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
            <p className="font-pixel text-base text-retro-cta text-glow-cta">
              {champ.id === mySeat ? 'YOU WIN!' : `${champ.name.toUpperCase()} WINS`}
            </p>
            {herdCow && (
              <p className="font-pixel text-[9px] text-retro-dim">
                🐄 {(players[herdCow]?.name || herdCow).toUpperCase()} ENDED WITH THE COW
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <p className="font-pixel text-sm text-retro-p1 text-glow-p1">HERD MIND</p>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
            Name it like everyone else.<br />Match the majority — dodge the Pink Cow.
          </p>
        </div>

        {/* Lobby / scoreboard */}
        <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1.5">
          <p className="font-pixel text-[9px] text-retro-dim tracking-widest">
            PLAYERS ({playerCount}) · FIRST TO {HERD_TARGET}
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
                {p.id === herdCow && '🐄 '}{p.name}{p.id === mySeat ? ' (YOU)' : ''}
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
            START ROUND
          </button>
        )}
        {!isHost && enough && !matchOver && (
          <p className="font-pixel text-[10px] text-retro-dim arcade-blink">
            WAITING FOR HOST TO START…
          </p>
        )}

        {matchOver && isPlayer && champ && (
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
                  gameLabel: 'HERD MIND',
                  headline: champ?.id === mySeat
                    ? 'YOU WIN!'
                    : `${(champ?.name || '').toUpperCase()} WINS`,
                  sub: 'Herd Mind · Game Night',
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
          <GameSwitcher currentType="herd" onSwitch={onSwitchGame} />
        )}
      </div>
    )
  }

  if (!round || !prompt) {
    return (
      <div className="text-center py-8 font-pixel text-[10px] text-retro-dim arcade-blink">
        STARTING ROUND…
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Shared header: the prompt
  // -------------------------------------------------------------------------
  const groups = round.phase === 'reveal' ? groupAnswers(round.answers) : []
  const { pointUids } = round.phase === 'reveal' ? scoreGroups(groups) : { pointUids: [] }
  const maxGroupSize = groups[0]?.members.length ?? 0
  const blockedRider = Object.entries(scores)
    .find(([uid, s]) => s >= HERD_TARGET && uid === herdCow)

  return (
    <div className="space-y-4">
      {/* Prompt */}
      <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2">
        <p className="font-pixel text-[8px] text-retro-dim tracking-widest text-center">
          {round.phase === 'answering' ? 'NAME IT LIKE THE HERD' : 'THE HERD SAID'}
        </p>
        <p className="font-mono text-[13px] text-retro-text leading-relaxed text-center">
          {prompt}
        </p>
      </div>

      {/* ---- ANSWERING PHASE ---- */}
      {round.phase === 'answering' && (
        <div className="space-y-3">
          {remainingMs != null && (
            <div className="h-1.5 bg-retro-surface rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  remainingMs > 10000 ? 'bg-retro-win' : 'bg-retro-danger',
                )}
                style={{ width: `${Math.min(100, Math.round((remainingMs / ANSWER_MS) * 100))}%` }}
              />
            </div>
          )}
          {isPlayer && !iAnswered ? (
            <div className="space-y-2">
              <input
                type="text"
                value={answerInput}
                maxLength={40}
                onChange={e => { setAnswerInput(e.target.value); setInputError('') }}
                onKeyDown={e => e.key === 'Enter' && handleSubmitAnswer()}
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="YOUR ANSWER"
                autoFocus
                className="w-full bg-retro-surface border-2 border-retro-border text-retro-text font-pixel text-[11px] text-center rounded px-3 py-2.5 focus:outline-none focus:border-retro-p1 disabled:opacity-40"
              />
              {inputError && <p className="font-pixel text-[9px] text-retro-p2 text-center">{inputError}</p>}
              <button
                onClick={handleSubmitAnswer}
                disabled={submitting}
                className="w-full py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-40"
              >
                {submitting ? 'LOCKING…' : 'LOCK IT IN'}
              </button>
            </div>
          ) : (
            <p className="font-pixel text-[10px] text-retro-win text-glow-win text-center arcade-blink">
              {isPlayer ? 'LOCKED IN ✓' : 'SPECTATING'}
            </p>
          )}
          <p className="font-pixel text-[9px] text-retro-dim text-center">
            {answeredCount}/{seats.length} ANSWERED…
          </p>
        </div>
      )}

      {/* ---- REVEAL PHASE ---- */}
      {round.phase === 'reveal' && (
        <div className="space-y-3">
          {!round.scored ? (
            <p className="font-pixel text-[10px] text-retro-cta text-glow-cta text-center arcade-blink py-4">
              TALLYING…
            </p>
          ) : (
            <>
              {/* Pink Cow moment */}
              {round.cowMoved && round.cowTo && (
                <div className="border-2 border-retro-p2 rounded p-3 text-center space-y-1 bg-retro-tint-p2/30">
                  <p className="font-pixel text-[11px] text-retro-p2 text-glow-p2">🐄 THE PINK COW</p>
                  <p className="font-mono text-[11px] text-retro-text">
                    {(players[round.cowTo]?.name || round.cowTo).toUpperCase()} MATCHED NOBODY
                  </p>
                  <p className="font-pixel text-[8px] text-retro-dim">THE COW IS THEIRS UNTIL SOMEONE ELSE IS</p>
                </div>
              )}

              {/* Groups, biggest first */}
              <div className="space-y-1.5">
                {groups.map((grp, gi) => {
                  const isWinning = grp.members.length === maxGroupSize && maxGroupSize >= 2
                  return (
                    <div
                      key={`${grp.norm}-${gi}`}
                      className={cn(
                        'px-3 py-2 rounded border-2',
                        isWinning ? 'border-retro-win shadow-neon-win' : 'border-retro-border',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn('font-mono text-[12px] truncate', isWinning && 'text-retro-win')}>
                          {grp.norm}
                        </span>
                        {isWinning && (
                          <span className="font-pixel text-[8px] text-retro-win shrink-0">+1 EACH</span>
                        )}
                      </div>
                      <p className="font-pixel text-[8px] text-retro-dim mt-0.5">
                        ×{grp.members.length} · {grp.members.map(m => players[m]?.name || m).join(', ').toUpperCase()}
                      </p>
                    </div>
                  )
                })}
                {groups.length === 0 && (
                  <p className="font-mono text-[11px] text-retro-dim text-center py-2">
                    NO ANSWERS TO GROUP
                  </p>
                )}
              </div>

              {pointUids.length === 0 && round.scored && (
                <p className="font-pixel text-[9px] text-retro-dim text-center">NOBODY MATCHED — NO POINTS</p>
              )}

              {/* Blocked-win callout */}
              {blockedRider && (
                <p className="font-pixel text-[9px] text-retro-p2 text-center" style={{ animation: 'blink-text 0.6s step-end infinite' }}>
                  🐄 {(players[blockedRider[0]]?.name || blockedRider[0]).toUpperCase()} HAS {HERD_TARGET} — CAN&apos;T WIN WITH THE COW!
                </p>
              )}

              {/* Scoreboard rail */}
              <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1">
                <p className="font-pixel text-[9px] text-retro-dim tracking-widest text-center">
                  SCORES · FIRST TO {HERD_TARGET}
                </p>
                {seatOrder(players || {})
                  .map(id => ({ id, name: players[id]?.name || id, score: scores[id] || 0 }))
                  .sort((a, b) => b.score - a.score)
                  .map(p => (
                    <div key={p.id} className="flex items-center justify-between font-mono text-[11px]">
                      <span className={cn(
                        'truncate',
                        p.id === mySeat ? 'text-retro-p1' : 'text-retro-text',
                        p.id === herdCow && 'opacity-70',
                      )}>
                        {p.id === herdCow && '🐄 '}{p.name}{p.id === mySeat ? ' (YOU)' : ''}
                      </span>
                      <span className={cn('ml-2', p.score >= HERD_TARGET && p.id !== herdCow ? 'text-retro-win' : 'text-retro-cta')}>
                        {p.score}
                      </span>
                    </div>
                  ))}
              </div>

              {isPlayer && (
                <button
                  onClick={handleNextPrompt}
                  className="w-full py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95"
                >
                  NEXT PROMPT
                </button>
              )}
            </>
          )}
        </div>
      )}

      {isPlayer && onSwitchGame && !proposal && round.phase === 'reveal' && round.scored && (
        <GameSwitcher currentType="herd" onSwitch={onSwitchGame} />
      )}
    </div>
  )
}
