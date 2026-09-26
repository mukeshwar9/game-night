import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { commit, verifyReveal } from '../lib/commit'
import {
  getSpectrumPair,
  parseStoredTarget,
  storedOrNewTarget,
  clampGuess,
  normalizeGuesses,
  normalizeUsedSpectrums,
  seatOrder,
  onlineGuessers,
  validateClue,
  roundDeltas,
  matchWinners,
  advanceAfterReveal,
  skipRound,
  beginMatch,
  WAVELENGTH_MIN_PLAYERS,
  WAVELENGTH_CLUE_MS,
  WAVELENGTH_GUESS_MS,
  WAVELENGTH_CLUE_MAX_LENGTH,
} from '../lib/wavelengthLogic'
import { isRoomCoordinator } from '../lib/coordinator'
import { scaledMs, timersOff } from '../lib/timerScale'
import useServerClock, { getServerNow } from '../hooks/useServerClock'
import GameSwitcher from '../components/GameSwitcher'
import RoundEndPanel from '../components/RoundEndPanel'
import RoundTimer from '../components/RoundTimer'
import WordFeedback from '../components/WordFeedback'
import PixelDots from '../components/loading/PixelDots'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import useBusy from '@/hooks/useBusy'

// Rules (scoring, win target, spectrum rotation + room seen history) live in
// src/lib/wavelengthLogic.js, shared with WavelengthDemo.jsx. An AFK clue-giver
// or guesser would otherwise stall the round forever — the per-phase deadlines
// (WAVELENGTH_CLUE_MS / WAVELENGTH_GUESS_MS, scaled by the room's timerScale)
// are anchored via `round.phaseStartedAt` + the server-time offset, same
// pattern as TriviaGame's question clock. Timer scale 0 turns them off; the
// coordinator / clue-giver then advance by hand.

// sessionStorage key for the clue-giver's hidden {target, salt, hash}. The
// target is rolled when the round enters the clue phase (so the clue-giver
// sees it while writing the clue), committed on submit, and removed once it
// has been revealed so a later round on the same spectrum can't reuse it.
const targetKey = (gameId, spectrumIndex) => `wavelength-target-${gameId}-${spectrumIndex}`

function readStoredTarget(key) {
  try { return parseStoredTarget(sessionStorage.getItem(key)) } catch { return null }
}

function writeStoredTarget(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); return true } catch { return false }
}

function normalizeRound(raw) {
  if (!raw) return null
  return {
    clueGiver: raw.clueGiver ?? null,
    phase: raw.phase ?? 'clue',
    spectrumIndex: raw.spectrumIndex ?? 0,
    commitment: raw.commitment ?? null,
    clue: raw.clue ?? '',
    guesses: normalizeGuesses(raw.guesses),
    reveal: raw.reveal ?? null,
    phaseStartedAt: raw.phaseStartedAt ?? null,
    usedSpectrums: normalizeUsedSpectrums(raw.usedSpectrums),
    cheatDetected: !!raw.cheatDetected,
  }
}

// ---------------------------------------------------------------------------
// Dial — a 0–100 slider rendered as a retro spectrum bar.
// ---------------------------------------------------------------------------
function Dial({ value, onChange, disabled, pair, target = null }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between font-pixel text-[9px]">
        <span className="text-retro-p1 text-glow-p1">{pair.left}</span>
        <span className="text-retro-p2 text-glow-p2">{pair.right}</span>
      </div>
      <div className="relative h-8">
        {/* spectrum track */}
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full border border-retro-border"
          style={{
            background:
              'linear-gradient(90deg, rgb(var(--c-p1)) 0%, rgb(var(--c-surface)) 50%, rgb(var(--c-p2)) 100%)',
          }}
        />
        {/* revealed target marker */}
        {target != null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-retro-win shadow-neon-win"
            style={{ left: `${clampGuess(target)}%` }}
          >
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 font-pixel text-[8px] text-retro-win whitespace-nowrap">
              ★ {clampGuess(target)}
            </span>
          </div>
        )}
        {/* the guess thumb */}
        <div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-retro-cta bg-retro-bg',
            !disabled && 'shadow-neon-cta',
          )}
          style={{ left: `${clampGuess(value)}%` }}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          disabled={disabled}
          onChange={e => onChange(Number(e.target.value))}
          aria-label="Your guess on the spectrum"
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-full h-11 opacity-0 cursor-pointer disabled:cursor-default"
        />
      </div>
      <p className="text-center font-pixel text-[10px] text-retro-cta text-glow-cta">{clampGuess(value)}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scoreboard — every seated player, sorted by score desc.
// ---------------------------------------------------------------------------
function Scoreboard({ players, scores, mySeat, clueGiver, highlight }) {
  const rows = Object.values(players || {})
    .filter(p => p && p.playerId)
    .map(p => ({ ...p, score: scores?.[p.playerId] || 0 }))
    .sort((a, b) => b.score - a.score)

  return (
    <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1.5">
      <p className="font-pixel text-[8px] text-retro-dim tracking-widest text-center">SCORES</p>
      {rows.map(p => (
        <div key={p.playerId} className="flex items-center justify-between font-pixel text-[9px]">
          <span className={cn(
            'truncate',
            p.playerId === mySeat ? 'text-retro-cta' : 'text-retro-text',
          )}>
            {p.playerId === clueGiver && <span className="text-retro-p2">◆ </span>}
            {(p.name || '???').toUpperCase()}
            {p.playerId === mySeat && <span className="text-retro-dim"> (YOU)</span>}
          </span>
          <span className={cn(
            'tabular-nums',
            highlight?.[p.playerId] ? 'text-retro-win text-glow-win' : 'text-retro-dim',
          )}>
            {p.score}{highlight?.[p.playerId] ? ` +${highlight[p.playerId]}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function WavelengthGame({
  gameId, game, mySeat, players,
  onSwitchGame, onNewMatch, proposal,
}) {
  const order = useMemo(() => seatOrder(players), [players])
  const playerCount = order.length
  const round = normalizeRound(game.round)
  const amSeated = !!mySeat && !!players?.[mySeat]
  // Online-aware host: START (and the timers-off manual skip) belong to the
  // first online seat in join order, so a creator who closed the tab can't freeze the lobby.
  const amCoordinator = isRoomCoordinator(mySeat, players, game.hostUid)
  const clueMs = scaledMs(WAVELENGTH_CLUE_MS, game.timerScale)
  const guessMs = scaledMs(WAVELENGTH_GUESS_MS, game.timerScale)
  const noTimer = timersOff(game.timerScale)

  const isClueGiver = round?.clueGiver === mySeat
  const myGuess = round?.guesses?.[mySeat]
  const hasGuessed = myGuess != null

  const [clueInput, setClueInput] = useState('')
  const [clueError, setClueError] = useState('')
  const [clueErrorId, setClueErrorId] = useState(0)
  const [committing, setCommitting] = useState(false)
  const [dialValue, setDialValue] = useState(50)
  const [submittingGuess, setSubmittingGuess] = useState(false)
  const [lastDelta, setLastDelta] = useState(null) // {playerId: pointsGained} after a reveal
  // Clue-giver only: this round's hidden target ({ target, salt, hash }). Mirrors
  // sessionStorage; also the fallback when storage is unavailable.
  const [myTarget, setMyTarget] = useState(null)
  const myTargetRef = useRef(null)
  const [starting, runStart] = useBusy()
  const [skipping, runSkip] = useBusy()
  const [revealing, runReveal] = useBusy()
  const [advancing, runAdvance] = useBusy()

  const revealResolved = useRef(null)
  const prevPhase = useRef(round?.phase)
  const prevSpectrum = useRef(round?.spectrumIndex)

  // Server-corrected clock — every deadline comparison and the on-screen
  // countdown run on it. Ticks only while a clue/guess deadline can expire.
  const timedPhase = !noTimer && game.status === 'playing' && (round?.phase === 'clue' || round?.phase === 'guessing')
  const { now: serverNow } = useServerClock({ tickMs: 500, ticking: timedPhase })

  // Anchor the phase-start time so every client agrees on when the clock
  // began (first client to notice writes it). Timers off: no clock to anchor.
  useEffect(() => {
    if (noTimer) return
    if ((round?.phase !== 'clue' && round?.phase !== 'guessing') || round?.phaseStartedAt) return
    update(ref(db, `games/${gameId}/round`), { phaseStartedAt: getServerNow() }).catch(() => {})
  }, [round?.phase, round?.phaseStartedAt, gameId, noTimer])

  // Reset local input when the round advances to a new spectrum.
  useEffect(() => {
    if (round?.spectrumIndex != null && round.spectrumIndex !== prevSpectrum.current) {
      setClueInput('')
      setClueError('')
      setDialValue(50)
      setLastDelta(null)
      prevSpectrum.current = round.spectrumIndex
    }
  }, [round?.spectrumIndex])

  // --- Clue-giver: roll the hidden target as soon as the round enters the clue
  // phase, so they can see it on their dial while writing the clue. Reuses the
  // stored target on reload; commits it (salted hash) in the background so the
  // submit is a single write. Guessers never see it before the reveal. ---
  useEffect(() => {
    if (!isClueGiver || round?.phase !== 'clue') return
    const spectrumIndex = round.spectrumIndex
    const key = targetKey(gameId, spectrumIndex)
    const fallback = myTargetRef.current?.spectrumIndex === spectrumIndex ? myTargetRef.current : null
    const t = storedOrNewTarget(readStoredTarget(key) ?? fallback)
    if (t.fresh) writeStoredTarget(key, { target: t.target })
    const show = entry => {
      myTargetRef.current = { ...entry, spectrumIndex }
      setMyTarget(myTargetRef.current)
    }
    show({ target: t.target, salt: t.salt, hash: t.hash })
    if (t.salt && t.hash) return
    let alive = true
    commit(String(t.target)).then(({ hash, salt }) => {
      const current = readStoredTarget(key)
      // Another tab/effect run already committed a target for this round: keep it.
      if (current && current.hash) { if (alive) show(current); return }
      const entry = { target: t.target, salt, hash }
      writeStoredTarget(key, entry)
      if (alive) show(entry)
    }).catch(() => {})
    return () => { alive = false }
  }, [isClueGiver, round?.phase, round?.spectrumIndex, gameId])

  // --- Clue-giver: once the target is revealed it is public — drop it from
  // storage so a later round on the same spectrum rolls a new one. ---
  useEffect(() => {
    if (!isClueGiver || round?.phase !== 'reveal' || !round.reveal) return
    try { sessionStorage.removeItem(targetKey(gameId, round.spectrumIndex)) } catch { /* ignore */ }
    if (myTargetRef.current?.spectrumIndex === round.spectrumIndex) myTargetRef.current = null
  }, [isClueGiver, round?.phase, round?.reveal, round?.spectrumIndex, gameId])

  // Sound cue when the round transitions to guessing (clue is in).
  useEffect(() => {
    if (round?.phase === 'guessing' && prevPhase.current !== 'guessing') {
      sounds.go()
    }
    prevPhase.current = round?.phase
  }, [round?.phase])

  // --- Clue-giver: publish the one-word clue (house rules: validateClue) with
  // the commitment to the target they have been looking at since the clue
  // phase began ---
  const handleSubmitClue = async () => {
    if (!isClueGiver || committing) return
    const rejectClue = msg => { setClueError(msg); setClueErrorId(n => n + 1) }
    const check = validateClue(clueInput, getSpectrumPair(round.spectrumIndex))
    if (!check.ok) { rejectClue(check.error); return }
    const clue = check.clue
    const key = targetKey(gameId, round.spectrumIndex)
    const fallback = myTargetRef.current?.spectrumIndex === round.spectrumIndex ? myTargetRef.current : null
    let entry = readStoredTarget(key) ?? (fallback && { target: fallback.target, salt: fallback.salt, hash: fallback.hash })
    if (!entry) { rejectClue('TARGET NOT READY — TRY AGAIN'); return }

    setCommitting(true)
    try {
      if (!entry.salt || !entry.hash) {
        const { hash, salt } = await commit(String(entry.target))
        entry = { target: entry.target, salt, hash }
        writeStoredTarget(key, entry)
        myTargetRef.current = { ...entry, spectrumIndex: round.spectrumIndex }
        setMyTarget(myTargetRef.current)
      }
      await update(ref(db, `games/${gameId}/round`), {
        commitment: entry.hash,
        clue,
        phase: 'guessing',
        phaseStartedAt: null,
      })
      sounds.move('X')
    } catch {
      toast.error('CLUE FAILED — CHECK CONNECTION')
    } finally {
      setCommitting(false)
    }
  }

  // --- Guesser: lock in a 0–100 guess ---
  const handleSubmitGuess = async () => {
    if (isClueGiver || hasGuessed || submittingGuess) return
    if (round?.phase !== 'guessing') return
    setSubmittingGuess(true)
    try {
      await update(ref(db, `games/${gameId}/round/guesses`), {
        [mySeat]: clampGuess(dialValue),
      })
      sounds.move('O')
    } catch {
      toast.error('GUESS FAILED — CHECK CONNECTION')
    } finally {
      setSubmittingGuess(false)
    }
  }

  // Everyone except the clue-giver should have guessed before reveal — but an
  // offline guesser must not stall the round forever, so the required set is
  // only the connected guessers (a reconnecting guesser rejoins it live and can
  // still submit before reveal). Zero online guessers ⇒ allGuessed stays false:
  // never auto-reveal into an empty room.
  const guesserIds = order.filter(id => id !== round?.clueGiver)
  const requiredGuesserIds = onlineGuessers(players, round?.clueGiver)
  const guessDeadlineExpired = round?.phase === 'guessing' && !!round.phaseStartedAt && guessMs != null &&
    (serverNow - round.phaseStartedAt >= guessMs)
  // Past the deadline, stop waiting on stragglers — their guess (if it never
  // lands) simply isn't counted when scores are computed.
  const allGuessed =
    round?.phase === 'guessing' &&
    requiredGuesserIds.length > 0 &&
    (requiredGuesserIds.every(id => round.guesses[id] != null) || guessDeadlineExpired)

  const clueDeadlineExpired = round?.phase === 'clue' && !!round.phaseStartedAt && clueMs != null &&
    (serverNow - round.phaseStartedAt >= clueMs)

  // --- Clue-giver: publish target + salt (guessing -> reveal). Guarded on the
  // phase and spectrum inside a transaction so a repeat call is a no-op. ---
  const revealTarget = async () => {
    const spectrumIndex = round?.spectrumIndex
    const fallback = myTargetRef.current?.spectrumIndex === spectrumIndex ? myTargetRef.current : null
    const parsed = readStoredTarget(targetKey(gameId, spectrumIndex)) ?? fallback
    if (!parsed || parsed.salt == null) return
    await runTransaction(ref(db, `games/${gameId}/round`), current => {
      if (!current || current.phase !== 'guessing' || current.spectrumIndex !== spectrumIndex) return
      return { ...current, phase: 'reveal', reveal: { target: parsed.target, salt: parsed.salt } }
    })
  }

  // --- Clue-giver: once everyone has guessed (or the deadline lapsed), reveal ---
  useEffect(() => {
    if (!isClueGiver || !allGuessed) return
    if (round.phase !== 'guessing') return
    revealTarget().catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClueGiver, allGuessed, round?.phase, round?.spectrumIndex, gameId])

  // --- Seated players: skip the round without scoring (clue passes on, fresh
  // spectrum), guarded inside the transaction by `stillStuck`. ---
  const skipIf = (stillStuck) => runTransaction(ref(db, `games/${gameId}`), current => {
    if (!current?.round || !stillStuck(current)) return
    return skipRound(current)
  })

  // --- Anyone: an AFK clue-giver who never submits a clue would otherwise
  // stall the round forever — auto-skip to the next seat once the clue
  // deadline lapses. Any connected client can trigger this (host-or-any-client
  // transaction), guarded by a fresh re-check of the deadline inside the
  // transaction so a race between clients can't double-skip.
  useEffect(() => {
    if (!clueDeadlineExpired || !amSeated) return
    skipIf(current => {
      const r = current.round
      const ms = scaledMs(WAVELENGTH_CLUE_MS, current.timerScale)
      return r.phase === 'clue' && !!r.phaseStartedAt && ms != null &&
        getServerNow() - r.phaseStartedAt >= ms
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clueDeadlineExpired, amSeated, gameId])

  // --- Everyone: on reveal, verify the commitment then score each guesser ---
  useEffect(() => {
    if (round?.phase !== 'reveal' || !round.reveal || !round.commitment) return
    const key = `${round.spectrumIndex}:${round.commitment}`
    if (revealResolved.current === key) return
    revealResolved.current = key

    const { target, salt } = round.reveal
    verifyReveal(round.commitment, String(target), salt).then(ok => {
      if (!ok) {
        toast.error('CLUE-GIVER CHEATED — TARGET MISMATCH')
        // Persist the verdict so scoring (handleNextRound) can void the round
        // instead of quietly awarding points off a tampered target.
        update(ref(db, `games/${gameId}/round`), { cheatDetected: true }).catch(() => {})
        return
      }
      // Same rule advanceAfterReveal applies: guessers score by closeness, the
      // clue-giver scores the rounded mean of those scores.
      const delta = roundDeltas({ guesses: round.guesses, target, clueGiver: round.clueGiver, seatIds: order })
      setLastDelta(delta)
      const mine = delta[mySeat]
      if (mine != null) {
        if (mine >= 40) sounds.win()
        else if (mine > 0) sounds.hit(0)
        else sounds.miss()
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.phase, round?.reveal, round?.commitment, round?.spectrumIndex, gameId])

  // --- Anyone: advance to the next round (commit scores, rotate clue-giver) ---
  const handleNextRound = async () => {
    if (round?.phase !== 'reveal' || !round.reveal) return
    try {
      // advanceAfterReveal returns null once someone else already advanced —
      // returning undefined aborts the transaction without a write.
      await runTransaction(ref(db, `games/${gameId}`), current => advanceAfterReveal(current) ?? undefined)
    } catch {
      toast.error('NEXT ROUND FAILED — CHECK CONNECTION')
    }
  }

  // --- Clue-giver: hidden target lost (new tab wiped sessionStorage), so the
  // reveal can never fire — restart the round with no scoring, rotating the
  // clue to the next seat (same write as the offline skip hatch). ---
  const handleRestartLostRound = () => runSkip(async () => {
    if (!isClueGiver) return
    const stuckGiver = round.clueGiver
    try {
      await skipIf(current => current.round.phase === 'guessing' && current.round.clueGiver === stuckGiver)
    } catch { toast.error('RESTART FAILED — CHECK CONNECTION') }
  })

  // --- Seated players: the clue-giver dropped during clue or guessing. ---
  const handleSkipOfflineClueGiver = () => runSkip(async () => {
    const stuckGiver = round.clueGiver
    try {
      await skipIf(current => current.round.phase !== 'reveal' && current.round.clueGiver === stuckGiver &&
        current.players?.[stuckGiver]?.online === false)
    } catch { toast.error('SKIP FAILED — CHECK CONNECTION') }
  })

  // --- Timers off: the coordinator passes a stalled clue on by hand. ---
  const handleSkipClue = () => runSkip(async () => {
    const stuckGiver = round.clueGiver
    try {
      await skipIf(current => current.round.phase === 'clue' && current.round.clueGiver === stuckGiver)
    } catch { toast.error('SKIP FAILED — CHECK CONNECTION') }
  })

  // --- Timers off: the clue-giver reveals once at least one guess is in. ---
  const handleRevealNow = () => runReveal(async () => {
    try { await revealTarget() } catch { toast.error('REVEAL FAILED — CHECK CONNECTION') }
  })

  // --- Coordinator: lobby -> first round. The page deals the round itself
  // (spectrum from the room's seen history) in one transaction, so two clients
  // that both think they're the coordinator during a handover start it once. ---
  const handleStart = () => runStart(async () => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => beginMatch(current, Date.now()) ?? undefined)
    } catch { toast.error('START FAILED — CHECK CONNECTION') }
  })

  // -------------------------------------------------------------------------
  // Waiting / lobby — not enough players, or host hasn't started.
  // -------------------------------------------------------------------------
  // (A finished match falls through to the MATCH OVER screen below — it used to
  // land here and offer START GAME on top of the old scores.)
  if (game.status !== 'playing' && game.status !== 'finished') {
    const enough = playerCount >= WAVELENGTH_MIN_PLAYERS
    return (
      <div className="space-y-4 text-center">
        <p className="font-pixel text-sm text-retro-cta text-glow-cta">WAVELENGTH</p>
        <p className="font-pixel text-[9px] text-retro-dim leading-relaxed">
          THE CLUE-GIVER SEES A HIDDEN TARGET{'\n'}AND GIVES A ONE-WORD CLUE.{'\n'}EVERYONE ELSE GUESSES WHERE IT IS.
        </p>

        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2">
          <p className="font-pixel text-[10px] text-retro-text">
            PLAYERS ({playerCount})
          </p>
          <div className="space-y-1">
            {order.map(id => (
              <p key={id} className={cn(
                'font-pixel text-[9px]',
                id === mySeat ? 'text-retro-cta' : 'text-retro-dim',
              )}>
                {(players[id]?.name || '???').toUpperCase()}
                {id === mySeat && ' (YOU)'}
                {!players[id]?.online && <span className="text-retro-p2"> ·OFFLINE</span>}
              </p>
            ))}
          </div>
        </div>

        {!enough && (
          <p className="font-pixel text-[9px] text-retro-p2 arcade-blink leading-relaxed">
            NEED {WAVELENGTH_MIN_PLAYERS - playerCount} MORE{'\n'}PLAYER{WAVELENGTH_MIN_PLAYERS - playerCount === 1 ? '' : 'S'} TO START
          </p>
        )}

        {amCoordinator ? (
          <button
            onClick={handleStart}
            disabled={!enough || starting}
            className="px-6 py-2.5 min-w-[8.5rem] bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40 disabled:cursor-default"
          >
            {starting ? 'STARTING…' : 'START GAME'}
          </button>
        ) : (
          <p className="font-pixel text-[9px] text-retro-dim arcade-blink">
            WAITING TO START…
          </p>
        )}

        {!proposal && onSwitchGame && <GameSwitcher currentType="wavelength" onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Match over.
  // -------------------------------------------------------------------------
  if (game.status === 'finished') {
    // Winners come from the final scores (highest score at or past the target;
    // exact ties shared — `winner` is only written for a sole winner). Older
    // rooms only stored `winner` — fall back to it.
    const derived = matchWinners(game.scores, order)
    const winnerIds = derived.length > 0 ? derived : (game.winner ? [game.winner] : [])
    const iWon = winnerIds.includes(mySeat)
    const nameOf = id => (players[id]?.name || id || '???').toUpperCase()
    const headline = winnerIds.length > 1
      ? (iWon ? 'YOU SHARE THE WIN!' : `${winnerIds.map(nameOf).join(' & ')} TIE`)
      : (iWon ? 'YOU WIN!' : `${nameOf(winnerIds[0])} WINS`)
    const ranked = order
      .map(id => ({ id, name: (players[id]?.name || '???').toUpperCase(), score: game.scores?.[id] || 0 }))
      .sort((a, b) => b.score - a.score)
    return (
      <div className="space-y-4">
        <RoundEndPanel
          caption="MATCH OVER"
          headline={headline}
          scores={{
            title: 'FINAL SCORES',
            rows: ranked.map(p => ({
              id: p.id, name: p.name, score: p.score, you: p.id === mySeat,
              muted: players[p.id]?.online === false, win: winnerIds.includes(p.id),
            })),
          }}
          actions={amSeated ? [
            !proposal && onNewMatch && {
              key: 'new', label: 'NEW MATCH', busyLabel: 'STARTING…', onClick: onNewMatch,
            },
          ] : []}
          share={amSeated ? { gameLabel: 'WAVELENGTH', headline, sub: 'Wavelength · Game Night' } : null}
        />
        {!proposal && onSwitchGame && <GameSwitcher currentType="wavelength" onSwitch={onSwitchGame} />}
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Active round.
  // -------------------------------------------------------------------------
  if (!round || !round.clueGiver) {
    return (
      <div className="text-center py-8 font-pixel text-[10px] text-retro-dim arcade-blink">
        STARTING ROUND…
      </div>
    )
  }

  const pair = getSpectrumPair(round.spectrumIndex)
  const clueGiverName = (players[round.clueGiver]?.name || '???').toUpperCase()
  const isReveal = round.phase === 'reveal'
  const target = isReveal && round.reveal ? round.reveal.target : null
  // Clue-giver reloaded into a new tab: the hidden {target, salt} lives only in
  // sessionStorage, so the reveal effect above can never fire and the round
  // would stall with everyone online. Only the giver's own client can detect it.
  const secretLost = isClueGiver && round.phase === 'guessing' &&
    !readStoredTarget(targetKey(gameId, round.spectrumIndex)) &&
    !(myTarget?.spectrumIndex === round.spectrumIndex && myTarget.salt)
  // What the clue-giver sees on their own dial (never rendered for guessers).
  const myVisibleTarget = isClueGiver && myTarget?.spectrumIndex === round.spectrumIndex
    ? myTarget.target
    : null
  const phaseMs = round.phase === 'clue' ? clueMs : guessMs

  return (
    <div className="space-y-4">
      <Scoreboard
        players={players}
        scores={game.scores}
        mySeat={mySeat}
        clueGiver={round.clueGiver}
        highlight={isReveal ? lastDelta : null}
      />

      {/* Clue line */}
      <div className="text-center space-y-1">
        <p className="font-pixel text-[8px] text-retro-dim">
          {isClueGiver ? 'YOU ARE THE CLUE-GIVER' : `${clueGiverName}'S CLUE`}
        </p>
        {round.phase !== 'clue' && (
          <p className="font-pixel text-base text-retro-cta text-glow-cta tracking-widest break-words">
            {round.clue || '…'}
          </p>
        )}
      </div>

      {/* Phase countdown — the deadline every client enforces (none when the
          room's timers are off) */}
      {(round.phase === 'clue' || round.phase === 'guessing') && round.phaseStartedAt && phaseMs != null && (
        <RoundTimer
          endsAt={round.phaseStartedAt + phaseMs}
          now={serverNow}
          totalMs={phaseMs}
          label={round.phase === 'clue' ? 'CLUE TIME' : 'GUESS TIME'}
        />
      )}

      {/* CLUE PHASE -------------------------------------------------------- */}
      {round.phase === 'clue' && (
        isClueGiver ? (
          <div className="bg-retro-card border border-retro-border rounded p-4 space-y-3">
            <p className="font-pixel text-[9px] text-retro-cta text-center leading-relaxed">
              ★ IS THE TARGET — ONLY YOU CAN SEE IT
            </p>
            <Dial
              value={myVisibleTarget ?? 50}
              onChange={() => {}}
              disabled
              pair={pair}
              target={myVisibleTarget}
            />
            <p className="font-pixel text-[8px] text-retro-dim text-center leading-relaxed">
              GIVE A ONE-WORD CLUE THAT POINTS{'\n'}YOUR TEAM TO THE ★ — NO NUMBERS,{'\n'}NO DIAL WORDS. YOU SCORE THEIR AVERAGE.
            </p>
            <input
              type="text"
              value={clueInput}
              maxLength={WAVELENGTH_CLUE_MAX_LENGTH}
              aria-label="Your one-word clue"
              onChange={e => { setClueInput(e.target.value); setClueError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSubmitClue()}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="ONE WORD…"
              className="w-full bg-retro-surface border-2 border-retro-border text-retro-text font-pixel text-xs tracking-widest text-center rounded px-3 py-2 focus:outline-none focus:border-retro-p1 uppercase"
            />
            <WordFeedback message={clueError} tone="bad" id={clueErrorId} />
            <button
              onClick={handleSubmitClue}
              disabled={committing}
              className="w-full py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-40"
            >
              {committing ? 'LOCKING…' : 'LOCK CLUE'}
            </button>
          </div>
        ) : (
          <div className="text-center space-y-3 py-6">
            <div className="flex justify-center">
              <PixelDots tone="p2" size="lg" glow />
            </div>
            <p className="font-pixel text-[10px] text-retro-p2 text-glow-p2 leading-relaxed">
              WAITING FOR {clueGiverName}{'\n'}TO GIVE A CLUE…
            </p>
          </div>
        )
      )}

      {/* GUESSING PHASE --------------------------------------------------- */}
      {round.phase === 'guessing' && (
        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-3">
          <Dial
            value={isClueGiver ? (myVisibleTarget ?? 50) : dialValue}
            onChange={setDialValue}
            disabled={isClueGiver || hasGuessed}
            pair={pair}
            target={isClueGiver ? myVisibleTarget : null}
          />
          {isClueGiver ? (
            <p className="font-pixel text-[9px] text-retro-dim text-center leading-relaxed">
              WAITING FOR GUESSES…{'\n'}{guesserIds.filter(id => round.guesses[id] != null).length}/{guesserIds.length} IN
            </p>
          ) : hasGuessed ? (
            <p className="font-pixel text-[9px] text-retro-win text-glow-win text-center arcade-blink">
              GUESS LOCKED ✓ — WAITING…
            </p>
          ) : (
            <button
              onClick={handleSubmitGuess}
              disabled={submittingGuess}
              className="w-full py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-40"
            >
              {submittingGuess ? 'LOCKING…' : 'LOCK GUESS'}
            </button>
          )}
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-0.5 font-pixel text-[8px]">
            {guesserIds.map(id => {
              const locked = round.guesses[id] != null
              const offline = players[id]?.online === false
              return (
                <span key={id} className={locked ? 'text-retro-win' : offline ? 'text-retro-p2' : 'text-retro-dim'}>
                  {(players[id]?.name || '???').toUpperCase()} {locked ? '✓' : offline ? '·OFF' : '…'}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* REVEAL PHASE ----------------------------------------------------- */}
      {isReveal && (
        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-3">
          {round.cheatDetected && (
            <p className="font-pixel text-[9px] text-retro-p2 text-glow-p2 text-center"
               style={{ animation: 'blink-text 0.6s step-end infinite' }}>
              ⚠ CLUE-GIVER CHEATED — ROUND VOIDED, NO POINTS
            </p>
          )}
          <p className="font-pixel text-[9px] text-retro-win text-glow-win text-center">
            TARGET WAS {clampGuess(target)}
          </p>
          <div className="relative">
            <Dial value={50} onChange={() => {}} disabled pair={pair} target={target} />
            {/* each guesser's marker */}
            <div className="relative h-0">
              {guesserIds.map(id => {
                const g = round.guesses[id]
                if (g == null) return null
                const mine = id === mySeat
                return (
                  <div
                    key={id}
                    className="absolute -top-9 -translate-x-1/2 flex flex-col items-center"
                    style={{ left: `${clampGuess(g)}%` }}
                  >
                    <span className={cn('font-pixel text-[7px]', mine ? 'text-retro-cta' : 'text-retro-dim')}>
                      {(players[id]?.name || '?').toUpperCase().slice(0, 4)}
                    </span>
                    <span className={cn('text-[10px]', mine ? 'text-retro-cta' : 'text-retro-p1')}>▾</span>
                  </div>
                )
              })}
            </div>
          </div>
          {!round.cheatDetected && round.clueGiver && lastDelta?.[round.clueGiver] != null && (
            <p className="font-pixel text-[8px] text-retro-dim text-center">
              {isClueGiver ? 'YOU' : clueGiverName} SCORED THE TEAM AVERAGE: +{lastDelta[round.clueGiver]}
            </p>
          )}
          <button
            onClick={() => runAdvance(handleNextRound)}
            disabled={advancing}
            className="w-full py-2 mt-2 border-2 border-retro-p1 text-retro-p1 font-pixel text-[10px] rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95 disabled:opacity-40"
          >
            {advancing ? 'ADVANCING…' : 'NEXT ROUND'}
          </button>
        </div>
      )}

      {/* Lost-secret escape hatch — shown only to the clue-giver themselves.
          Without the sessionStorage target the reveal can never fire; restart
          the round (no points scored, clue rotates to the next seat). */}
      {secretLost && (
        <div className="text-center space-y-2 border border-retro-p2/30 rounded p-3">
          <p className="font-pixel text-[9px] text-retro-p2">
            SECRET LOST — YOU OPENED A NEW TAB
          </p>
          <button
            onClick={handleRestartLostRound}
            disabled={skipping}
            className="min-h-11 px-5 py-2 font-pixel text-[9px] border border-retro-p2 text-retro-p2 rounded hover:shadow-neon-p2 transition-all active:scale-95 disabled:opacity-50"
          >
            {skipping ? 'RESTARTING…' : 'RESTART ROUND'}
          </button>
        </div>
      )}

      {/* Offline / abandoned clue-giver escape hatch.
          If the clue-giver dropped during clue or guessing, anyone can skip them. */}
      {amSeated && !isReveal && round.clueGiver && players[round.clueGiver] && players[round.clueGiver].online === false && (
        <div className="text-center space-y-2 border border-retro-p2/30 rounded p-3">
          <p className="font-pixel text-[9px] text-retro-p2">
            CLUE-GIVER IS OFFLINE
          </p>
          <button
            onClick={handleSkipOfflineClueGiver}
            disabled={skipping}
            className="min-h-11 px-5 py-2 font-pixel text-[9px] border border-retro-p2 text-retro-p2 rounded hover:shadow-neon-p2 transition-all active:scale-95 disabled:opacity-50"
          >
            {skipping ? 'SKIPPING…' : 'SKIP CLUE-GIVER'}
          </button>
        </div>
      )}

      {/* Timers off (room timer scale 0): no deadline will move a stalled
          round on, so the coordinator / clue-giver get manual controls. */}
      {noTimer && amCoordinator && !isClueGiver && round.phase === 'clue' && players[round.clueGiver]?.online !== false && (
        <div className="text-center">
          <button
            onClick={handleSkipClue}
            disabled={skipping}
            className="min-h-11 px-5 py-2 font-pixel text-[9px] border border-retro-border text-retro-dim rounded hover:border-retro-p2 hover:text-retro-p2 transition-all active:scale-95 disabled:opacity-50"
          >
            {skipping ? 'SKIPPING…' : 'SKIP THIS CLUE'}
          </button>
        </div>
      )}
      {noTimer && isClueGiver && round.phase === 'guessing' && !secretLost &&
        guesserIds.some(id => round.guesses[id] != null) && !allGuessed && (
        <div className="text-center">
          <button
            onClick={handleRevealNow}
            disabled={revealing}
            className="min-h-11 px-5 py-2 font-pixel text-[9px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 transition-all active:scale-95 disabled:opacity-50"
          >
            {revealing ? 'REVEALING…' : 'REVEAL NOW'}
          </button>
        </div>
      )}

      {!proposal && onSwitchGame && <GameSwitcher currentType="wavelength" onSwitch={onSwitchGame} />}
    </div>
  )
}
