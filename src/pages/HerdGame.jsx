import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import {
  HERD_TARGET,
  ANSWER_MS,
  REVEAL_GRACE_MS,
  REVEAL_ADVANCE_MS,
  normalizeAnswer,
  groupAnswers,
  scoreGroups,
  getMatchWinners,
  seatOrder,
  allCommitted,
  allRevealed,
  collectRevealedTexts,
  submitOrderOf,
  isBannedAnswer,
  resolveHerdRound,
  armAnswerDeadline,
  seededShuffle,
} from '../lib/herdLogic'
import { commit as makeCommit, verifyReveal } from '../lib/commit'
import { isCoordinator } from '../lib/coordinator'
import { HERD_PROMPTS } from '../lib/decks/herd'
import GameSwitcher from '../components/GameSwitcher'
import RoundTimer from '../components/RoundTimer'
import WordFeedback from '../components/WordFeedback'
import useServerClock from '../hooks/useServerClock'
import { sounds } from '../lib/sounds'
import { shareResult } from '../lib/shareCard'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

const MIN_PLAYERS = 3
const MAX_ANSWER_LEN = 40

// sessionStorage holds my { text, salt } for the round I answered — the
// plaintext never touches Firebase until the reveal phase (commit-reveal, as in
// Fibbage/Two Truths). Keyed per deck + prompt so a new round never reuses it.
const secretPrefix = gameId => `herd-answer-${gameId}-`
const secretKey = (gameId, deckSeed, promptIndex) => `${secretPrefix(gameId)}${deckSeed}-${promptIndex}`

function readSecret(key) {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') } catch { return null }
}

function writeSecret(gameId, key, secret) {
  try {
    // Drop older rounds' secrets for this room, then store this one.
    const prefix = secretPrefix(gameId)
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k && k !== key && k.startsWith(prefix)) sessionStorage.removeItem(k)
    }
    sessionStorage.setItem(key, JSON.stringify(secret))
  } catch { /* storage unavailable — the in-memory copy still works */ }
}

function normalizeMap(raw) {
  return raw && typeof raw === 'object' ? raw : {}
}

function normalizeList(raw) {
  if (Array.isArray(raw)) return raw.filter(v => v != null)
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw)
    .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
    .map(([, v]) => v)
    .filter(v => v != null)
}

function normalizeRound(raw) {
  if (!raw) return null
  return {
    phase: raw.phase ?? 'answering',
    promptIndex: raw.promptIndex ?? 0,
    deckSeed: raw.deckSeed ?? 1,
    answers: normalizeMap(raw.answers),   // { [uid]: { commit, at } } — commitment only
    reveals: normalizeMap(raw.reveals),   // { [uid]: { text, salt } } — reveal phase only
    tally: normalizeMap(raw.tally),       // { [uid]: text } — verified answers that were scored
    order: normalizeList(raw.order),      // submit order, for the display-spelling tie-break
    revealAt: raw.revealAt ?? null,
    endsAt: raw.endsAt ?? null,
    nextAt: raw.nextAt ?? null,
    scored: !!raw.scored,
    cowTo: raw.cowTo ?? null,
    cowMoved: !!raw.cowMoved,
    winners: normalizeList(raw.winners),
  }
}

// Seat list of players currently present (online). Falls back to all known
// players if presence data is missing so the round can never deadlock (the
// answer deadline advances it regardless).
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
  const roundKey = round ? `${round.deckSeed}:${round.promptIndex}` : null
  const seats = activeSeats(players || {})
  const playerCount = Object.keys(players || {}).length
  const enough = seats.length >= MIN_PLAYERS

  const scores = game.scores || {}
  const herdCow = game.herdCow ?? null
  const isPlayer = !!mySeat && !!players?.[mySeat]
  const playing = game.status === 'playing'
  // Deterministic host fallback: the lowest-id ONLINE seat drives every phase
  // change, so the match keeps going when the host drops. Each write re-checks
  // the phase inside its transaction, so a handover stays single-writer.
  const amCoordinator = isPlayer && isCoordinator(mySeat, seatOrder(players || {}), players)

  const { now, serverNow } = useServerClock({ tickMs: 250, ticking: playing })

  const prompts = useMemo(
    () => (round ? seededShuffle(HERD_PROMPTS, round.deckSeed) : null),
    [round?.deckSeed], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const prompt = round && prompts ? prompts[round.promptIndex % prompts.length] : null

  // Per-round local state, keyed by round so a new prompt starts clean without
  // a reset effect.
  const [draft, setDraft] = useState({ key: null, text: '' })
  const [feedback, setFeedback] = useState({ key: null, message: '', tone: 'info', id: 0 })
  const [localSecret, setLocalSecret] = useState(null)
  const answerInput = draft.key === roundKey ? draft.text : ''
  const fb = feedback.key === roundKey ? feedback : { message: '', tone: 'info', id: 0 }
  const storageKey = round ? secretKey(gameId, round.deckSeed, round.promptIndex) : null
  const mySecret = useMemo(
    () => (localSecret?.key === storageKey ? localSecret : (storageKey ? readSecret(storageKey) : null)),
    [localSecret, storageKey],
  )

  const [submitting, runSubmit] = useBusy()
  const [starting, runStart] = useBusy()
  const [advancing, runAdvance] = useBusy()
  const [resettingMatch, runNewMatch] = useBusy()
  const [sharing, runShare] = useBusy()

  const armFor = useRef(null)           // roundKey the answer deadline was armed for
  const flipFor = useRef(null)          // roundKey the answering → reveal flip was attempted for
  const revealSentFor = useRef(null)    // roundKey my reveal was published for
  const scoreFor = useRef(null)         // roundKey scoring was attempted for
  const autoAdvanceFor = useRef(null)   // roundKey the auto-advance was attempted for
  const soundFor = useRef(round?.scored ? roundKey : null)

  const say = useCallback((message, tone = 'bad') => {
    setFeedback(f => ({ key: roundKey, message, tone, id: f.id + 1 }))
  }, [roundKey])

  const myCommit = isPlayer ? round?.answers?.[mySeat] : null
  const iAnswered = !!myCommit
  const committedCount = Object.keys(round?.answers || {}).length
  const timeUp = !!round?.endsAt && now >= round.endsAt

  // ---- COORDINATOR: arm the answer deadline with server time ------------------
  // Rounds may start with endsAt: null so no client's local clock sets the
  // deadline; the coordinator stamps serverNow() + ANSWER_MS once. Rounds that
  // already carry an endsAt (older starts, advance()) are left as they are.
  useEffect(() => {
    if (!amCoordinator || !playing || !round || round.phase !== 'answering' || round.endsAt != null) return
    if (armFor.current === roundKey) return
    armFor.current = roundKey
    const expected = round.promptIndex
    runTransaction(ref(db, `games/${gameId}/round`), cr => {
      if (!cr) return cr
      return armAnswerDeadline(cr, expected, serverNow())
    }).catch(() => { armFor.current = null })
  }, [amCoordinator, playing, round?.phase, round?.endsAt, roundKey, gameId, serverNow]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- COORDINATOR: answering → reveal once everyone locked in or time ran out --
  useEffect(() => {
    if (!amCoordinator || !playing || !round || round.phase !== 'answering') return
    if (!allCommitted(seats, round.answers) && !timeUp) return
    if (flipFor.current === roundKey) return
    flipFor.current = roundKey
    const expected = round.promptIndex
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || !current.round) return current
      const cr = current.round
      if (current.status !== 'playing' || cr.phase !== 'answering' || cr.promptIndex !== expected) return
      return { ...current, round: { ...cr, phase: 'reveal', revealAt: serverNow() + REVEAL_GRACE_MS } }
    }).catch(() => { flipFor.current = null })
  }, [amCoordinator, playing, round?.phase, round?.answers, timeUp, roundKey, seats.join(','), gameId, serverNow]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- PLAYER: publish my { text, salt } — only now, in the reveal phase ------
  useEffect(() => {
    if (!isPlayer || !round || round.phase !== 'reveal' || round.scored) return
    if (!myCommit || typeof myCommit === 'string' || !mySecret) return
    if (round.reveals[mySeat]?.salt === mySecret.salt) return
    if (revealSentFor.current === roundKey) return
    revealSentFor.current = roundKey
    update(ref(db, `games/${gameId}/round/reveals`), { [mySeat]: { text: mySecret.text, salt: mySecret.salt } })
      .catch(() => { revealSentFor.current = null })
  }, [isPlayer, round?.phase, round?.scored, round?.reveals, myCommit, mySecret, roundKey, gameId, mySeat]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- COORDINATOR: verify reveals, then score + Cow + match end, once ---------
  // Runs when every committed player has revealed, or when the reveal grace runs
  // out — a player who never reveals (tab closed) simply counts as no answer.
  useEffect(() => {
    if (!amCoordinator || !playing || !round || round.phase !== 'reveal' || round.scored) return
    const committedIds = Object.keys(round.answers)
    const graceOver = round.revealAt == null || now >= round.revealAt
    if (!allRevealed(committedIds, round.reveals) && !graceOver) return
    if (scoreFor.current === roundKey) return
    scoreFor.current = roundKey
    const snap = round
    const run = async () => {
      const verified = []
      const texts = {}
      for (const [uid, answer] of Object.entries(snap.answers)) {
        if (typeof answer === 'string') { texts[uid] = answer.trim(); continue } // pre-commit rounds
        const rev = snap.reveals[uid]
        if (!answer?.commit || rev?.text == null || rev?.salt == null) continue
        if (await verifyReveal(answer.commit, String(rev.text), rev.salt)) verified.push(uid)
      }
      Object.assign(texts, collectRevealedTexts(snap.reveals, verified))
      const order = submitOrderOf(snap.answers)
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || !current.round) return current
        const cr = current.round
        if (current.status !== 'playing' || cr.phase !== 'reveal' || cr.scored || cr.promptIndex !== snap.promptIndex) return
        const res = resolveHerdRound({
          texts,
          submitOrder: order,
          scores: current.scores || {},
          cow: current.herdCow ?? null,
          seatIds: seatOrder(current.players || {}),
        })
        const over = res.winners.length > 0
        return {
          ...current,
          scores: res.scores,
          herdCow: res.cow,
          status: over ? 'finished' : 'playing',
          round: {
            ...cr,
            scored: true,
            tally: texts,
            order,
            cowTo: res.cow,
            cowMoved: res.transferred,
            winners: over ? res.winners : null,
            nextAt: over ? null : serverNow() + REVEAL_ADVANCE_MS,
          },
        }
      })
    }
    run().catch(() => { scoreFor.current = null })
  }, [amCoordinator, playing, round?.phase, round?.scored, round?.reveals, round?.revealAt, now, roundKey, gameId, serverNow]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Next prompt: any player may skip the wait; the coordinator auto-advances --
  const advance = useCallback(async (expectedIndex) => {
    await runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || !current.round) return current
      const cr = current.round
      if (current.status !== 'playing' || cr.phase !== 'reveal' || !cr.scored || cr.promptIndex !== expectedIndex) return
      return {
        ...current,
        proposal: null,
        round: {
          phase: 'answering',
          promptIndex: cr.promptIndex + 1,
          deckSeed: cr.deckSeed,
          endsAt: serverNow() + ANSWER_MS,
        },
      }
    })
  }, [gameId, serverNow])

  useEffect(() => {
    if (!amCoordinator || !playing || !round || round.phase !== 'reveal' || !round.scored) return
    if (round.nextAt == null || now < round.nextAt) return
    if (autoAdvanceFor.current === roundKey) return
    autoAdvanceFor.current = roundKey
    advance(round.promptIndex).catch(() => { autoAdvanceFor.current = null })
  }, [amCoordinator, playing, round?.phase, round?.scored, round?.nextAt, now, roundKey, advance]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Round-result sound, once per scored round -------------------------------
  useEffect(() => {
    if (!round?.scored || soundFor.current === roundKey) return
    soundFor.current = roundKey
    if (round.cowMoved && round.cowTo === mySeat) { sounds.bust(); return }
    if (!isPlayer) return
    const { pointUids } = scoreGroups(groupAnswers(round.tally, round.order))
    if (pointUids.includes(mySeat)) sounds.win()
    else sounds.miss()
  }, [round?.scored, roundKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Submit my answer: commit now, plaintext stays in this tab until reveal ---
  const handleSubmitAnswer = () => runSubmit(async () => {
    if (!isPlayer || !round || round.phase !== 'answering' || iAnswered || !prompt) return
    const text = answerInput.trim().slice(0, MAX_ANSWER_LEN)
    if (!normalizeAnswer(text)) { say('TYPE AN ANSWER'); return }
    if (isBannedAnswer(text)) { say('NOT ALLOWED — TRY ANOTHER ANSWER'); return }
    if (round.endsAt && serverNow() >= round.endsAt) { say("TIME'S UP"); return }
    const expected = { promptIndex: round.promptIndex, deckSeed: round.deckSeed }
    try {
      const { hash, salt } = await makeCommit(text)
      const secret = { key: storageKey, text, salt }
      writeSecret(gameId, storageKey, secret)
      setLocalSecret(secret)
      const res = await runTransaction(ref(db, `games/${gameId}/round`), cr => {
        if (!cr) return cr
        if (cr.phase !== 'answering' || cr.promptIndex !== expected.promptIndex || cr.deckSeed !== expected.deckSeed) return
        if (cr.answers?.[mySeat]) return
        return { ...cr, answers: { ...(cr.answers || {}), [mySeat]: { commit: hash, at: serverNow() } } }
      })
      if (!res.committed) { say('TOO LATE — THE ROUND MOVED ON'); return }
      sounds.move('X')
      say('LOCKED IN — HIDDEN UNTIL THE REVEAL', 'ok')
    } catch {
      say('SUBMIT FAILED — RETRY')
      toast.error('SUBMIT FAILED — CHECK CONNECTION')
    }
  })

  const handleNextPrompt = () => runAdvance(async () => {
    if (!isPlayer || !round || round.phase !== 'reveal' || !round.scored) return
    try {
      await advance(round.promptIndex)
    } catch {
      toast.error('NEXT PROMPT FAILED — CHECK CONNECTION')
    }
  })

  // -------------------------------------------------------------------------
  // WAITING / MATCH-OVER screen (status !== 'playing')
  // -------------------------------------------------------------------------
  if (!playing) {
    const matchOver = game.status === 'finished'
    const ranked = seatOrder(players || {})
      .map(id => ({ id, name: players[id]?.name || id, score: scores[id] || 0 }))
      .sort((a, b) => b.score - a.score)
    // Winners as the scoring round recorded them; a match ended any other way
    // (e.g. a platform claim) falls back to game.winner, then the top scorers.
    const recorded = (round?.winners || []).filter(id => players?.[id])
    const champs = !matchOver ? [] : recorded.length
      ? recorded
      : game.winner && players?.[game.winner]
        ? [game.winner]
        : getMatchWinners(scores, herdCow, 0).filter(id => players?.[id])
    const champNames = champs.map(id => (players[id]?.name || id).toUpperCase())
    const iWon = champs.includes(mySeat)
    const headline = iWon
      ? (champs.length > 1 ? 'YOU TIE FOR THE WIN!' : 'YOU WIN!')
      : champs.length > 1 ? `${champNames.join(' & ')} TIE` : `${champNames[0] || '???'} WINS`

    return (
      <div className="space-y-5 text-center">
        {matchOver && champs.length > 0 && (
          <div className="space-y-1">
            <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
            <p className="font-pixel text-base text-retro-cta text-glow-cta">{headline}</p>
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

        {!enough && !matchOver && (
          <p className="font-pixel text-[10px] text-retro-p2 arcade-blink leading-relaxed">
            NEED {MIN_PLAYERS}+ PLAYERS<br />
            ({Math.max(0, MIN_PLAYERS - playerCount)} MORE TO START)
          </p>
        )}

        {isHost && enough && !matchOver && (
          <button
            onClick={() => runStart(onStart)}
            disabled={starting}
            className="px-6 py-2.5 min-w-[8.5rem] bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
          >
            {starting ? 'STARTING…' : 'START ROUND'}
          </button>
        )}
        {!isHost && enough && !matchOver && (
          <p className="font-pixel text-[10px] text-retro-dim arcade-blink">
            WAITING FOR HOST TO START…
          </p>
        )}

        {matchOver && isPlayer && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {!proposal && onNewMatch && (
              <button
                onClick={() => runNewMatch(onNewMatch)}
                disabled={resettingMatch}
                className="px-6 py-2.5 min-w-[8.5rem] bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
              >
                {resettingMatch ? 'RESETTING…' : 'NEW MATCH'}
              </button>
            )}
            <button
              onClick={() => runShare(async () => {
                const ok = await shareResult({
                  gameLabel: 'HERD MIND',
                  headline,
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
  // Active round
  // -------------------------------------------------------------------------
  const groups = round.phase === 'reveal' && round.scored ? groupAnswers(round.tally, round.order) : []
  const { pointUids } = scoreGroups(groups)
  const maxGroupSize = groups[0]?.members.length ?? 0
  const blockedRider = Object.entries(scores)
    .find(([uid, s]) => s >= HERD_TARGET && uid === herdCow)
  const revealedCount = Object.keys(round.answers).filter(id => round.reveals[id]).length
  const noShows = round.scored
    ? Object.keys(round.answers).filter(id => round.tally[id] == null)
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
          {round.endsAt != null ? (
            <RoundTimer endsAt={round.endsAt} now={now} totalMs={ANSWER_MS} label="ANSWER TIME" />
          ) : (
            <p className="font-pixel text-[9px] text-retro-dim text-center">STARTING THE CLOCK…</p>
          )}
          {isPlayer && !iAnswered && !timeUp ? (
            <div className="space-y-2">
              <input
                type="text"
                value={answerInput}
                maxLength={MAX_ANSWER_LEN}
                onChange={e => setDraft({ key: roundKey, text: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmitAnswer() }}
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="send"
                aria-label="Your answer"
                placeholder="YOUR ANSWER"
                className="w-full bg-retro-surface border-2 border-retro-border text-retro-text font-pixel text-[11px] text-center rounded px-3 py-2.5 focus:outline-none focus:border-retro-p1 disabled:opacity-40"
              />
              <button
                onClick={handleSubmitAnswer}
                disabled={submitting}
                className="w-full py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-40"
              >
                {submitting ? 'LOCKING…' : 'LOCK IT IN'}
              </button>
            </div>
          ) : (
            <p className={cn(
              'font-pixel text-[10px] text-center',
              iAnswered ? 'text-retro-win text-glow-win arcade-blink' : 'text-retro-dim',
            )}>
              {!isPlayer ? 'SPECTATING' : iAnswered ? 'LOCKED IN ✓' : "TIME'S UP — NO ANSWER"}
            </p>
          )}
          <WordFeedback message={fb.message} tone={fb.tone} id={fb.id} />
          <p className="font-pixel text-[9px] text-retro-dim text-center">
            {committedCount}/{seats.length} LOCKED IN · ANSWERS STAY HIDDEN UNTIL THE REVEAL
          </p>
        </div>
      )}

      {/* ---- REVEAL PHASE ---- */}
      {round.phase === 'reveal' && (
        <div className="space-y-3">
          {!round.scored ? (
            <div className="text-center py-4 space-y-1">
              <p className="font-pixel text-[10px] text-retro-cta text-glow-cta arcade-blink">
                TALLYING…
              </p>
              <p className="font-pixel text-[8px] text-retro-dim">
                {revealedCount}/{Object.keys(round.answers).length} ANSWERS REVEALED
              </p>
            </div>
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
                          {grp.display}
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
                {noShows.length > 0 && (
                  <p className="font-pixel text-[8px] text-retro-dim text-center">
                    NOT REVEALED IN TIME: {noShows.map(id => (players[id]?.name || id).toUpperCase()).join(', ')}
                  </p>
                )}
              </div>

              {pointUids.length === 0 && (
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
                        players[p.id]?.online === false && 'opacity-40',
                      )}>
                        {p.id === herdCow && '🐄 '}{p.name}{p.id === mySeat ? ' (YOU)' : ''}
                        {players[p.id]?.online === false && ' · OFFLINE'}
                      </span>
                      <span className={cn('ml-2', p.score >= HERD_TARGET && p.id !== herdCow ? 'text-retro-win' : 'text-retro-cta')}>
                        {p.score}
                      </span>
                    </div>
                  ))}
              </div>

              {round.nextAt != null && (
                <RoundTimer
                  endsAt={round.nextAt}
                  now={now}
                  totalMs={REVEAL_ADVANCE_MS}
                  label="NEXT PROMPT IN"
                  lowMs={0}
                />
              )}
              {isPlayer && (
                <button
                  onClick={handleNextPrompt}
                  disabled={advancing}
                  className="w-full py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95 disabled:opacity-50"
                >
                  {advancing ? 'STARTING…' : 'NEXT PROMPT NOW'}
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
