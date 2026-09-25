import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, update, onValue, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { commit, verifyReveal } from '../lib/commit'
import {
  getSpectrumPair,
  nextSpectrumIndex,
  parseStoredTarget,
  storedOrNewTarget,
  clampGuess,
  scoreGuess,
  normalizeGuesses,
  seatOrder,
  onlineGuessers,
  nextClueGiver,
} from '../lib/wavelengthLogic'
import GameSwitcher from '../components/GameSwitcher'
import PixelDots from '../components/loading/PixelDots'
import { sounds } from '../lib/sounds'
import { shareResult } from '../lib/shareCard'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import useBusy from '@/hooks/useBusy'

const MIN_PLAYERS = 3
const WIN_SCORE = 200 // first to this many points clinches the match
// An AFK clue-giver or guesser would otherwise stall the round forever — these
// back per-phase deadlines (anchored via `round.phaseStartedAt` + the
// server-time offset, same pattern as TriviaGame's question clock).
const CLUE_DEADLINE_MS = 90000
const GUESS_DEADLINE_MS = 60000

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
    usedSpectrums: Array.isArray(raw.usedSpectrums) ? raw.usedSpectrums : [],
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
  gameId, game, mySeat, players, isHost, onStart,
  onSwitchGame, onNewMatch, proposal,
}) {
  const order = useMemo(() => seatOrder(players), [players])
  const playerCount = order.length
  const round = normalizeRound(game.round)

  const isClueGiver = round?.clueGiver === mySeat
  const myGuess = round?.guesses?.[mySeat]
  const hasGuessed = myGuess != null

  const [clueInput, setClueInput] = useState('')
  const [clueError, setClueError] = useState('')
  const [committing, setCommitting] = useState(false)
  const [dialValue, setDialValue] = useState(50)
  const [submittingGuess, setSubmittingGuess] = useState(false)
  const [lastDelta, setLastDelta] = useState(null) // {playerId: pointsGained} after a reveal
  // Clue-giver only: this round's hidden target ({ target, salt, hash }). Mirrors
  // sessionStorage; also the fallback when storage is unavailable.
  const [myTarget, setMyTarget] = useState(null)
  const myTargetRef = useRef(null)
  const [sharing, runShare] = useBusy()
  const [clockOffset, setClockOffset] = useState(0)
  const [nowTs, setNowTs] = useState(() => Date.now())

  const revealResolved = useRef(null)
  const prevPhase = useRef(round?.phase)
  const prevSpectrum = useRef(round?.spectrumIndex)

  // Corrected clock — every deadline comparison below runs through this offset.
  useEffect(() => {
    const offRef = ref(db, '.info/serverTimeOffset')
    const unsub = onValue(offRef, snap => setClockOffset(snap.val() ?? 0))
    return () => unsub()
  }, [])
  const serverNow = nowTs + clockOffset

  // Ticker drives the clue/guess deadline countdowns.
  useEffect(() => {
    if (round?.phase !== 'clue' && round?.phase !== 'guessing') return
    const id = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [round?.phase])

  // Anchor the phase-start time so every client agrees on when the clock
  // began (first client to notice writes it).
  useEffect(() => {
    if ((round?.phase !== 'clue' && round?.phase !== 'guessing') || round?.phaseStartedAt) return
    update(ref(db, `games/${gameId}/round`), { phaseStartedAt: Date.now() + clockOffset }).catch(() => {})
  }, [round?.phase, round?.phaseStartedAt, gameId, clockOffset])

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

  // --- Clue-giver: publish the one-word clue with the commitment to the target
  // they have been looking at since the clue phase began ---
  const handleSubmitClue = async () => {
    if (!isClueGiver || committing) return
    const clue = clueInput.trim()
    if (!clue) { setClueError('TYPE A CLUE'); return }
    if (/\s/.test(clue)) { setClueError('ONE WORD ONLY'); return }
    if (clue.length > 24) { setClueError('TOO LONG'); return }
    const key = targetKey(gameId, round.spectrumIndex)
    const fallback = myTargetRef.current?.spectrumIndex === round.spectrumIndex ? myTargetRef.current : null
    let entry = readStoredTarget(key) ?? (fallback && { target: fallback.target, salt: fallback.salt, hash: fallback.hash })
    if (!entry) { setClueError('TARGET NOT READY — TRY AGAIN'); return }

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
        clue: clue.toUpperCase(),
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
  const guessDeadlineExpired = round?.phase === 'guessing' && !!round.phaseStartedAt &&
    (serverNow - round.phaseStartedAt >= GUESS_DEADLINE_MS)
  // Past the deadline, stop waiting on stragglers — their guess (if it never
  // lands) simply isn't counted when scores are computed.
  const allGuessed =
    round?.phase === 'guessing' &&
    requiredGuesserIds.length > 0 &&
    (requiredGuesserIds.every(id => round.guesses[id] != null) || guessDeadlineExpired)

  const clueDeadlineExpired = round?.phase === 'clue' && !!round.phaseStartedAt &&
    (serverNow - round.phaseStartedAt >= CLUE_DEADLINE_MS)

  // --- Clue-giver: once everyone has guessed (or the deadline lapsed), reveal
  // target + salt ---
  useEffect(() => {
    if (!isClueGiver || !allGuessed) return
    if (round.phase !== 'guessing') return
    const fallback = myTargetRef.current?.spectrumIndex === round.spectrumIndex ? myTargetRef.current : null
    const parsed = readStoredTarget(targetKey(gameId, round.spectrumIndex)) ?? fallback
    if (!parsed || parsed.salt == null) return
    update(ref(db, `games/${gameId}/round`), {
      phase: 'reveal',
      reveal: { target: parsed.target, salt: parsed.salt },
    }).catch(() => {})
  }, [isClueGiver, allGuessed, round?.phase, round?.spectrumIndex, gameId])

  // --- Anyone: an AFK clue-giver who never submits a clue would otherwise
  // stall the round forever — auto-skip to the next seat once the clue
  // deadline lapses. Any connected client can trigger this (host-or-any-client
  // transaction), guarded by a fresh re-check of the deadline inside the
  // transaction so a race between clients can't double-skip.
  useEffect(() => {
    if (!clueDeadlineExpired) return
    runTransaction(ref(db, `games/${gameId}`), current => {
      const r = current?.round
      if (!r || r.phase !== 'clue' || !r.phaseStartedAt) return
      if (Date.now() + clockOffset - r.phaseStartedAt < CLUE_DEADLINE_MS) return
      const usedSpectrums = Array.isArray(r.usedSpectrums) ? r.usedSpectrums : []
      return {
        ...current,
        round: {
          clueGiver: nextClueGiver(current.players, r.clueGiver),
          phase: 'clue',
          spectrumIndex: nextSpectrumIndex(usedSpectrums, r.spectrumIndex),
          usedSpectrums: [...usedSpectrums, r.spectrumIndex],
          clue: '',
          commitment: null,
          guesses: null,
          reveal: null,
          phaseStartedAt: null,
        },
      }
    }).catch(() => {})
  }, [clueDeadlineExpired, gameId, clockOffset])

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
      const delta = {}
      for (const id of guesserIds) {
        const g = round.guesses[id]
        if (g != null) delta[id] = scoreGuess(g, target)
      }
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
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current) return current
        const r = current.round
        if (!r || r.phase !== 'reveal' || !r.reveal) return // already advanced
        const target = r.reveal.target
        const guesses = normalizeGuesses(r.guesses)
        const scores = { ...(current.scores || {}) }
        const livePlayers = current.players || {}
        const liveOrder = seatOrder(livePlayers)
        // A cheating clue-giver (commitment didn't match the revealed target)
        // voids the round — nobody scores, but play still moves on.
        if (!r.cheatDetected) {
          for (const id of liveOrder) {
            if (id === r.clueGiver) continue
            const g = guesses[id]
            if (g != null) scores[id] = (scores[id] || 0) + scoreGuess(g, target)
          }
        }
        const clinch = !r.cheatDetected && liveOrder.find(id => (scores[id] || 0) >= WIN_SCORE)
        if (clinch) {
          return { ...current, scores, status: 'finished', winner: clinch, proposal: null }
        }
        const usedSpectrums = Array.isArray(r.usedSpectrums) ? r.usedSpectrums : []
        return {
          ...current,
          scores,
          proposal: null,
          round: {
            clueGiver: nextClueGiver(livePlayers, r.clueGiver),
            phase: 'clue',
            spectrumIndex: nextSpectrumIndex(usedSpectrums, r.spectrumIndex),
            usedSpectrums: [...usedSpectrums, r.spectrumIndex],
            clue: '',
            commitment: null,
            guesses: null,
            reveal: null,
            phaseStartedAt: null,
          },
        }
      })
    } catch {
      toast.error('NEXT ROUND FAILED — CHECK CONNECTION')
    }
  }

  // --- Clue-giver: hidden target lost (new tab wiped sessionStorage), so the
  // reveal can never fire — restart the round with no scoring, rotating the
  // clue to the next seat (same write as the offline skip hatch). ---
  const handleRestartLostRound = async () => {
    if (!isClueGiver) return
    try {
      const usedSpectrums = round.usedSpectrums || []
      await update(ref(db, `games/${gameId}/round`), {
        clueGiver: nextClueGiver(players, round.clueGiver),
        phase: 'clue',
        spectrumIndex: nextSpectrumIndex(usedSpectrums, round.spectrumIndex),
        usedSpectrums: [...usedSpectrums, round.spectrumIndex],
        clue: '',
        commitment: null,
        guesses: null,
        reveal: null,
        phaseStartedAt: null,
        cheatDetected: null,
      })
    } catch { toast.error('RESTART FAILED — CHECK CONNECTION') }
  }

  // -------------------------------------------------------------------------
  // Waiting / lobby — not enough players, or host hasn't started.
  // -------------------------------------------------------------------------
  if (game.status !== 'playing') {
    const enough = playerCount >= MIN_PLAYERS
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
            NEED {MIN_PLAYERS - playerCount} MORE{'\n'}PLAYER{MIN_PLAYERS - playerCount === 1 ? '' : 'S'} TO START
          </p>
        )}

        {isHost ? (
          <button
            onClick={onStart}
            disabled={!enough}
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-40 disabled:cursor-default"
          >
            START GAME
          </button>
        ) : (
          <p className="font-pixel text-[9px] text-retro-dim arcade-blink">
            WAITING FOR HOST TO START…
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
    const winnerId = game.winner
    const iWon = winnerId === mySeat
    const winnerName = (players[winnerId]?.name || winnerId || '???').toUpperCase()
    return (
      <div className="space-y-4 text-center">
        <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
        <p className={cn('font-pixel text-base', iWon ? 'text-retro-cta text-glow-cta' : 'text-retro-dim')}>
          {iWon ? 'YOU WIN!' : `${winnerName} WINS`}
        </p>
        <Scoreboard players={players} scores={game.scores} mySeat={mySeat} clueGiver={null} />
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
                gameLabel: 'WAVELENGTH',
                headline: iWon ? 'YOU WIN!' : `${winnerName} WINS`,
                sub: 'Wavelength · Game Night',
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
              GIVE A ONE-WORD CLUE THAT POINTS{'\n'}YOUR TEAM TO THE ★
            </p>
            <input
              type="text"
              value={clueInput}
              maxLength={24}
              onChange={e => { setClueInput(e.target.value); setClueError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSubmitClue()}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="ONE WORD…"
              className="w-full bg-retro-surface border-2 border-retro-border text-retro-text font-pixel text-xs tracking-widest text-center rounded px-3 py-2 focus:outline-none focus:border-retro-p1 uppercase"
            />
            {clueError && <p className="font-pixel text-[8px] text-retro-p2 text-center">{clueError}</p>}
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
              LOCK GUESS
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
          <button
            onClick={handleNextRound}
            className="w-full py-2 mt-2 border-2 border-retro-p1 text-retro-p1 font-pixel text-[10px] rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95"
          >
            NEXT ROUND
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
            className="min-h-11 px-5 py-2 font-pixel text-[9px] border border-retro-p2 text-retro-p2 rounded hover:shadow-neon-p2 transition-all active:scale-95"
          >
            RESTART ROUND
          </button>
        </div>
      )}

      {/* Offline / abandoned clue-giver escape hatch.
          If the clue-giver dropped during clue or guessing, anyone can skip them. */}
      {!isReveal && round.clueGiver && players[round.clueGiver] && !players[round.clueGiver].online && (
        <div className="text-center space-y-2 border border-retro-p2/30 rounded p-3">
          <p className="font-pixel text-[9px] text-retro-p2">
            CLUE-GIVER IS OFFLINE
          </p>
          <button
            onClick={async () => {
              try {
                const usedSpectrums = round.usedSpectrums || []
                await update(ref(db, `games/${gameId}/round`), {
                  clueGiver: nextClueGiver(players, round.clueGiver),
                  phase: 'clue',
                  spectrumIndex: nextSpectrumIndex(usedSpectrums, round.spectrumIndex),
                  usedSpectrums: [...usedSpectrums, round.spectrumIndex],
                  clue: '',
                  commitment: null,
                  guesses: null,
                  reveal: null,
                  phaseStartedAt: null,
                  cheatDetected: null,
                })
              } catch { toast.error('SKIP FAILED — CHECK CONNECTION') }
            }}
            className="min-h-11 px-5 py-2 font-pixel text-[9px] border border-retro-p2 text-retro-p2 rounded hover:shadow-neon-p2 transition-all active:scale-95"
          >
            SKIP CLUE-GIVER
          </button>
        </div>
      )}

      {!proposal && onSwitchGame && <GameSwitcher currentType="wavelength" onSwitch={onSwitchGame} />}
    </div>
  )
}
