import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import {
  HERD_TARGET,
  ANSWER_MS,
  REVEAL_GRACE_MS,
  groupAnswers,
  scoreGroups,
  seatOrder,
  allCommitted,
  isCommitted,
  pendingReveals,
  answerDeadline,
  verifyHerdReveals,
  scoredTexts,
  resolveHerdRound,
  seededShuffle,
} from '../lib/herdLogic'
import { roomCoordinator } from '../lib/coordinator'
import { normalizeTimerScale, scaledMs, timersOff } from '../lib/timerScale'
import { formatClock } from '../lib/format'
import { HERD_PROMPTS } from '../lib/decks/herd'
import useServerClock, { getServerNow } from '../hooks/useServerClock'
import useCommitReveal, { clearSecret, secretKey } from '../hooks/useCommitReveal'
import RoundEndPanel from '../components/RoundEndPanel'
import GameSwitcher from '../components/GameSwitcher'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

const MIN_PLAYERS = 3
// sessionStorage prefix for my { text, salt, hash } — see useCommitReveal.
const SECRET_KEY = 'herd-answer'

function normalizeRound(raw) {
  if (!raw) return null
  return {
    phase: raw.phase ?? 'answering',
    promptIndex: raw.promptIndex ?? 0,
    deckSeed: raw.deckSeed ?? 1,
    answers: raw.answers ?? {},     // { [uid]: { commit } } — or a legacy plaintext string
    reveals: raw.reveals ?? {},     // { [uid]: { text, salt } } — reveal phase only
    tally: raw.tally ?? null,       // { [uid]: text } — verified answers that were scored
    cheats: raw.cheats ?? {},       // { [uid]: true } — reveal failed verification
    startedAt: raw.startedAt ?? null,
    revealAt: raw.revealAt ?? null,
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

const roundIdOf = (round) => (round ? `${round.deckSeed}-${round.promptIndex}` : null)

export default function HerdGame({
  gameId, game, mySeat, players,
  onStart, onSwitchGame, onNewMatch, proposal,
}) {
  const round = normalizeRound(game.round)
  const allSeats = seatOrder(players || {})
  const seats = activeSeats(players || {})
  const playerCount = allSeats.length
  const enough = seats.length >= MIN_PLAYERS

  const scores = game.scores || {}
  const herdCow = game.herdCow ?? null
  const isPlayer = !!mySeat && !!players?.[mySeat]
  const nameOf = (id) => players?.[id]?.name || id || ''

  // Online-aware coordinator (src/lib/coordinator.js roomCoordinator): the
  // room host (or a TRANSFER HOST pick, game.hostUid) while connected, else
  // the next online seat by join time. Drives START and
  // answering → reveal → scored, so a departed host no longer freezes the room.
  // Every write re-checks phase inside its transaction, so a handover
  // mid-flight stays single-writer.
  const coordinatorId = roomCoordinator(players, game.hostUid ?? null)
  const amCoordinator = isPlayer && coordinatorId === mySeat

  const timerScale = normalizeTimerScale(game.timerScale)
  const noTimer = timersOff(game.timerScale)
  const windowMs = scaledMs(ANSWER_MS, timerScale)

  const prompts = useMemo(
    () => (round ? seededShuffle(HERD_PROMPTS, round.deckSeed) : null),
    [round?.deckSeed], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const prompt = round && prompts
    ? prompts[round.promptIndex % prompts.length]
    : null

  const roundId = roundIdOf(round)
  const secret = useCommitReveal(gameId, SECRET_KEY, roundId ?? undefined)
  const { now: serverNow } = useServerClock(game.status === 'playing' && round ? 500 : 0)

  const [answerInput, setAnswerInput] = useState('')
  const [inputError, setInputError] = useState('')
  const [submitting, runSubmit] = useBusy()
  const [starting, runStart] = useBusy()
  const [closing, runClose] = useBusy()

  // Reset per-round input when the prompt advances (render-phase derive).
  const [prevRoundId, setPrevRoundId] = useState(roundId)
  if (prevRoundId !== roundId) {
    setPrevRoundId(roundId)
    setAnswerInput('')
    setInputError('')
  }

  const advancing = useRef(false)
  const scoring = useRef(false)
  const revealPublished = useRef(false)
  const lastRoundId = useRef(roundId)
  useEffect(() => {
    if (lastRoundId.current === roundId) return
    // The old round's secret is spent once the prompt moves on.
    if (lastRoundId.current) clearSecret(secretKey(SECRET_KEY, gameId, lastRoundId.current))
    lastRoundId.current = roundId
    advancing.current = false
    scoring.current = false
    revealPublished.current = false
  }, [roundId, gameId])

  // Result sounds — once per round, when the tally lands (not at mount).
  const soundKey = useRef(null)
  useEffect(() => {
    if (!round) return
    const key = `${roundId}:${round.phase}:${round.scored}`
    if (key === soundKey.current) return
    const first = soundKey.current == null
    soundKey.current = key
    if (first || round.phase !== 'reveal' || !round.scored) return
    if (round.cowMoved && round.cowTo === mySeat) sounds.bust()
    else if (isPlayer) {
      const iScored = scoreGroups(groupAnswers(scoredTexts(round))).pointUids.includes(mySeat)
      if (iScored) sounds.win()
      else sounds.miss()
    }
  }, [roundId, round?.phase, round?.scored]) // eslint-disable-line react-hooks/exhaustive-deps

  const myEntry = isPlayer ? round?.answers?.[mySeat] : null
  const iAnswered = isCommitted(myEntry)
  const answeredCount = Object.values(round?.answers || {}).filter(isCommitted).length
  const deadline = round ? answerDeadline(round, timerScale) : null
  const remainingMs = deadline != null ? Math.max(0, deadline - serverNow) : null
  const timeUp = remainingMs != null && remainingMs <= 0

  // answering → reveal (phase flip only; answers stay commitments). Guarded on
  // phase + prompt inside the transaction so it can only fire once per round.
  const closeAnswers = (promptIndex) => runTransaction(ref(db, `games/${gameId}/round`), cur => {
    if (!cur) return cur
    if (cur.phase !== 'answering' || (cur.promptIndex ?? 0) !== promptIndex) return
    return { ...cur, phase: 'reveal', revealAt: getServerNow(), scored: false }
  })

  // ---- COORDINATOR: close answering once everyone is locked in or time is up.
  useEffect(() => {
    if (!amCoordinator || !round || round.phase !== 'answering' || game.status !== 'playing') return
    if (!allCommitted(seats, round.answers) && !timeUp) return
    if (advancing.current) return
    advancing.current = true
    closeAnswers(round.promptIndex).catch(() => { advancing.current = false })
  }, [amCoordinator, round?.phase, round?.answers, timeUp, gameId, game.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- PLAYER: publish my { text, salt } — ONLY now that answering is closed.
  // A player whose tab lost the secret (new tab) can't reveal and simply counts
  // as a non-answer once the grace runs out.
  useEffect(() => {
    if (!isPlayer || !round || round.phase !== 'reveal' || round.scored) return
    const mine = round.answers[mySeat]
    if (!mine || typeof mine !== 'object' || !mine.commit) return
    if (round.reveals[mySeat] != null || revealPublished.current) return
    const stored = secret.read()
    if (!stored || stored.text == null || stored.salt == null || stored.hash !== mine.commit) return
    revealPublished.current = true
    update(ref(db, `games/${gameId}/round/reveals`), { [mySeat]: { text: stored.text, salt: stored.salt } })
      .catch(() => { revealPublished.current = false })
  }, [isPlayer, round?.phase, round?.scored, round?.reveals, round?.answers, gameId, mySeat]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- COORDINATOR: once every committed player has revealed (or the grace is
  // over), verify each reveal against its commitment, then score + move the Cow
  // in one idempotent transaction. Unverified/missing reveals are non-answers.
  useEffect(() => {
    if (!amCoordinator || !round || round.phase !== 'reveal' || round.scored) return
    if (game.status !== 'playing') return
    const waiting = pendingReveals(round.answers, round.reveals)
    const graceOver = round.revealAt == null || serverNow >= round.revealAt + REVEAL_GRACE_MS
    if (waiting.length > 0 && !graceOver) return
    if (scoring.current) return
    scoring.current = true
    const promptIndex = round.promptIndex
    const run = async () => {
      try {
        const { tally, cheats } = await verifyHerdReveals(round.answers, round.reveals, secret.verify)
        await runTransaction(ref(db, `games/${gameId}`), current => {
          if (!current || !current.round) return current
          const cur = current.round
          if (cur.phase !== 'reveal' || cur.scored || (cur.promptIndex ?? 0) !== promptIndex) return
          const seatIds = Object.values(current.players || {}).filter(Boolean).map(p => p.playerId)
          const out = resolveHerdRound({
            texts: tally, scores: current.scores, herdCow: current.herdCow ?? null, seatIds,
          })
          return {
            ...current,
            scores: out.newScores,
            herdCow: out.cow,
            status: out.winner ? 'finished' : 'playing',
            round: {
              ...cur,
              scored: true,
              tally,
              cheats: Object.keys(cheats).length ? cheats : null,
              cowTo: out.cow,
              cowMoved: out.transferred,
            },
          }
        })
      } catch {
        scoring.current = false // allow a retry on transient failure
      }
    }
    run()
  }, [amCoordinator, round?.phase, round?.scored, round?.reveals, serverNow, gameId, game.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Lock in my answer: commit the hash now; the plaintext stays in this tab.
  const handleSubmitAnswer = () => {
    if (!isPlayer || iAnswered || submitting || !prompt || round?.phase !== 'answering') return
    const text = answerInput.trim()
    if (!text) { setInputError('TYPE AN ANSWER'); return }
    if (timeUp) { setInputError("TIME'S UP"); return }
    setInputError('')
    runSubmit(async () => {
      const { hash } = await secret.commit(text, { text })
      sounds.move('X')
      await update(ref(db, `games/${gameId}/round/answers`), { [mySeat]: { commit: hash } })
    }, () => {
      setInputError('SUBMIT FAILED — RETRY')
      toast.error('ANSWER FAILED — CHECK CONNECTION')
    })
  }

  // ---- Next prompt (any player, once the round is scored). Transactional so
  // two players tapping together advance exactly once.
  const handleNextPrompt = async () => {
    if (!isPlayer || !round || !round.scored) return
    const from = round.promptIndex
    const startedAt = getServerNow()
    const ms = scaledMs(ANSWER_MS, game.timerScale)
    await runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || !current.round) return current
      if ((current.round.promptIndex ?? 0) !== from || !current.round.scored) return
      return {
        ...current,
        round: {
          phase: 'answering',
          promptIndex: from + 1,
          deckSeed: current.round.deckSeed ?? 1,
          startedAt,
          endsAt: ms == null ? null : startedAt + ms,
        },
        proposal: null,
      }
    })
  }

  // -------------------------------------------------------------------------
  // WAITING / START / MATCH-OVER screen (status !== 'playing')
  // -------------------------------------------------------------------------
  if (game.status !== 'playing') {
    const matchOver = game.status === 'finished'
    const ranked = allSeats
      .map(id => ({ id, name: nameOf(id), score: scores[id] || 0 }))
      .sort((a, b) => b.score - a.score)
    const champ = ranked.find(p => p.id !== herdCow) || ranked[0]

    return (
      <div className="space-y-5 text-center">
        <div className="space-y-2">
          <p className="font-pixel text-sm text-retro-p1 text-glow-p1">HERD MIND</p>
          <p className="font-mono text-[11px] text-retro-dim leading-relaxed">
            Name it like everyone else.<br />Match the majority — dodge the Pink Cow.
          </p>
        </div>

        {matchOver && champ ? (
          <RoundEndPanel
            caption="MATCH OVER"
            headline={champ.id === mySeat ? 'YOU WIN!' : `${champ.name.toUpperCase()} WINS`}
            sub={herdCow && (
              <p className="font-pixel text-[9px] text-retro-dim">
                🐄 {nameOf(herdCow).toUpperCase()} ENDED WITH THE COW
              </p>
            )}
            scores={{
              title: `FINAL SCORES · FIRST TO ${HERD_TARGET}`,
              rows: ranked.map(p => ({
                id: p.id, name: p.name, score: p.score, you: p.id === mySeat,
                marker: p.id === herdCow ? '🐄' : null, muted: players[p.id]?.online === false,
              })),
            }}
            actions={isPlayer ? [
              !proposal && onNewMatch && {
                key: 'new', label: 'NEW MATCH', busyLabel: 'STARTING…', onClick: onNewMatch,
              },
            ] : []}
            share={isPlayer ? {
              gameLabel: 'HERD MIND',
              headline: champ.id === mySeat ? 'YOU WIN!' : `${champ.name.toUpperCase()} WINS`,
              sub: 'Herd Mind · Game Night',
            } : null}
          />
        ) : (
          <>
            {/* Lobby */}
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
                {starting ? 'STARTING…' : 'START ROUND'}
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
  const texts = round.phase === 'reveal' && round.scored ? scoredTexts(round) : {}
  const groups = round.phase === 'reveal' && round.scored ? groupAnswers(texts) : []
  const { pointUids } = scoreGroups(groups)
  const maxGroupSize = groups[0]?.members.length ?? 0
  const blockedRider = Object.entries(scores)
    .find(([uid, s]) => s >= HERD_TARGET && uid === herdCow)
  const committedCount = Object.values(round.answers).filter(a => a && typeof a === 'object' && a.commit).length
  const revealedCount = Object.keys(round.reveals).filter(uid => round.answers[uid]?.commit).length
  const cheaterNames = Object.keys(round.cheats).map(nameOf)
  const silentNames = round.scored
    ? Object.keys(round.answers).filter(uid => !texts[uid] && !round.cheats[uid]).map(nameOf)
    : []

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
          {remainingMs != null && windowMs ? (
            <div className="space-y-1">
              <div className="h-1.5 bg-retro-surface rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    remainingMs > 10000 ? 'bg-retro-win' : 'bg-retro-danger',
                  )}
                  style={{ width: `${Math.min(100, Math.round((remainingMs / windowMs) * 100))}%` }}
                />
              </div>
              <p className="font-pixel text-[8px] text-retro-dim text-right tabular-nums">{formatClock(remainingMs)}</p>
            </div>
          ) : noTimer && (
            <p className="font-pixel text-[8px] text-retro-dim text-center tracking-widest">
              NO TIMER · {amCoordinator ? 'YOU CLOSE' : `${(nameOf(coordinatorId) || 'HOST').toUpperCase()} CLOSES`} ANSWERS
            </p>
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
              {isPlayer ? 'LOCKED IN ✓ — HIDDEN UNTIL THE REVEAL' : 'SPECTATING'}
            </p>
          )}
          <p className="font-pixel text-[9px] text-retro-dim text-center">
            {answeredCount}/{seats.length} ANSWERED…
          </p>
          {noTimer && amCoordinator && answeredCount > 0 && (
            <button
              onClick={() => runClose(
                () => closeAnswers(round.promptIndex),
                () => toast.error('CLOSE FAILED — CHECK CONNECTION'),
              )}
              disabled={closing}
              className="w-full py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95 disabled:opacity-50"
            >
              {closing ? 'CLOSING…' : 'CLOSE ANSWERS'}
            </button>
          )}
        </div>
      )}

      {/* ---- REVEAL PHASE ---- */}
      {round.phase === 'reveal' && (
        <div className="space-y-3">
          {!round.scored ? (
            <div className="text-center py-4 space-y-1">
              <p className="font-pixel text-[10px] text-retro-cta text-glow-cta arcade-blink">
                REVEALING…
              </p>
              {committedCount > 0 && (
                <p className="font-pixel text-[8px] text-retro-dim">
                  {revealedCount}/{committedCount} ANSWERS IN
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Pink Cow moment */}
              {round.cowMoved && round.cowTo && (
                <div className="border-2 border-retro-p2 rounded p-3 text-center space-y-1 bg-retro-tint-p2/30">
                  <p className="font-pixel text-[11px] text-retro-p2 text-glow-p2">🐄 THE PINK COW</p>
                  <p className="font-mono text-[11px] text-retro-text">
                    {nameOf(round.cowTo).toUpperCase()} MATCHED NOBODY
                  </p>
                  <p className="font-pixel text-[8px] text-retro-dim">THE COW IS THEIRS UNTIL SOMEONE ELSE IS</p>
                </div>
              )}

              {cheaterNames.length > 0 && (
                <p className="font-pixel text-[9px] text-retro-p2 text-center">
                  ⚠ ANSWER FAILED VERIFICATION: {cheaterNames.join(', ').toUpperCase()}
                </p>
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
                        ×{grp.members.length} · {grp.members.map(nameOf).join(', ').toUpperCase()}
                      </p>
                    </div>
                  )
                })}
                {groups.length === 0 && (
                  <p className="font-mono text-[11px] text-retro-dim text-center py-2">
                    NO ANSWERS TO GROUP
                  </p>
                )}
                {silentNames.length > 0 && (
                  <p className="font-pixel text-[8px] text-retro-dim text-center">
                    NO ANSWER REVEALED: {silentNames.join(', ').toUpperCase()}
                  </p>
                )}
              </div>

              {pointUids.length === 0 && (
                <p className="font-pixel text-[9px] text-retro-dim text-center">NOBODY MATCHED — NO POINTS</p>
              )}

              {/* Blocked-win callout */}
              {blockedRider && (
                <p className="font-pixel text-[9px] text-retro-p2 text-center" style={{ animation: 'blink-text 0.6s step-end infinite' }}>
                  🐄 {nameOf(blockedRider[0]).toUpperCase()} HAS {HERD_TARGET} — CAN&apos;T WIN WITH THE COW!
                </p>
              )}

              <RoundEndPanel
                scores={{
                  title: `SCORES · FIRST TO ${HERD_TARGET}`,
                  rows: allSeats
                    .map(id => ({ id, name: nameOf(id), score: scores[id] || 0 }))
                    .sort((a, b) => b.score - a.score)
                    .map(p => ({
                      ...p,
                      you: p.id === mySeat,
                      marker: p.id === herdCow ? '🐄' : null,
                      muted: p.id === herdCow,
                      win: p.score >= HERD_TARGET && p.id !== herdCow,
                    })),
                }}
                actions={isPlayer ? [{
                  key: 'next', label: 'NEXT PROMPT', busyLabel: 'DEALING…', variant: 'next',
                  onClick: handleNextPrompt, errorMsg: 'NEXT PROMPT FAILED — CHECK CONNECTION',
                }] : []}
              />
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
