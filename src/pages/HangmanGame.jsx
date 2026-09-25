import { useEffect, useRef, useState, useCallback } from 'react'
import { ref, onValue, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { commit, verifyReveal } from '../lib/commit'
import {
  MAX_WRONG, verifyRoundConsistency, deriveRoundResult, wordStructure,
  PENDING, pendingLetters, canQueueGuess, gradePending,
  PRESENCE_GRACE_MS, SETTING_DEADLINE_MS, GRADING_STALL_MS, GUESSER_IDLE_MS,
  otherSymbol, getRoundClaim, revealRoundWinner, canAdvanceReveal, autoAdvanceAt,
  buildNextRound,
} from '../lib/hangmanLogic'
import { getGameConfig } from '../lib/games'
import useBusy from '../hooks/useBusy'
import useServerClock from '../hooks/useServerClock'
import { toast } from 'sonner'
import HangmanGallows from '../components/HangmanGallows'
import PixelDots from '../components/loading/PixelDots'
import WordDisplay from '../components/WordDisplay'
import LetterKeyboard from '../components/LetterKeyboard'
import WordSetter from '../components/WordSetter'
import RoundTimer from '../components/RoundTimer'
import WinEffect from '../components/WinEffect'
import RoseFall from '../components/RoseFall'
import Gravestone from '../components/Gravestone'
import GameSwitcher from '../components/GameSwitcher'
import { sounds } from '../lib/sounds'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

// A claim countdown for a time-based stall only appears in its last 30 s, so
// the timer doesn't nag during normal play.
const CLAIM_WARNING_MS = 30_000

const CLAIM_WINDOW_MS = {
  'no-word': SETTING_DEADLINE_MS,
  grading: GRADING_STALL_MS,
  idle: GUESSER_IDLE_MS,
  offline: PRESENCE_GRACE_MS,
}

const PRIMARY_BTN = 'px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'
const SECONDARY_BTN = 'px-6 py-2.5 border-2 border-retro-border text-retro-text font-pixel text-xs rounded hover:border-retro-p1/50 hover:text-retro-p1 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'

function normalizeGuess(val) {
  if (val === false || val === null || val === undefined) return false
  if (val === 'pending') return 'pending'
  if (Array.isArray(val)) return val
  return Object.values(val).map(Number)
}

function normalizeGuesses(raw) {
  if (!raw) return {}
  const out = {}
  for (const [k, v] of Object.entries(raw)) {
    out[k] = normalizeGuess(v)
  }
  return out
}

// The setter's secret: { word, salt, commitment } in this tab only.
// `commitment` was added later — older entries may lack it.
function readStoredWord(gameId) {
  try {
    const raw = sessionStorage.getItem(`hangwoman-word-${gameId}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function sideOf(round, symbol) {
  const setter = round?.setter === 'O' ? 'O' : 'X'
  if (symbol === setter) return 'setter'
  if (symbol === otherSymbol(setter)) return 'guesser'
  return null
}

// Seen by the guesser once their client has proven the word-keeper cheated.
function CheatScreen({ evidence, onNextRound, advancing }) {
  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center p-6 gap-6">
      <div className="text-center space-y-3">
        <p
          className="font-pixel text-base text-retro-p2 text-glow-p2"
          style={{ animation: 'blink-text 0.6s step-end infinite' }}
        >
          ⚠ CHEAT DETECTED ⚠
        </p>
        <p className="font-mono text-xs text-retro-dim">The word-keeper cheated. Round forfeited — the point is yours.</p>
      </div>
      {evidence && (
        <div className="w-full max-w-sm bg-retro-card border border-retro-p2/40 rounded p-4 space-y-2 font-mono text-[10px] text-retro-dim break-all">
          <p><span className="text-retro-p2">COMMITMENT:</span> {evidence?.commitment?.slice(0, 16)}…</p>
          <p><span className="text-retro-p2">REVEALED:</span> {evidence?.revealed}</p>
          <p><span className="text-retro-p2">HASH OK:</span> {String(evidence?.commitOk)}</p>
          <p><span className="text-retro-p2">ANSWERS OK:</span> {String(evidence?.consistencyOk)}</p>
          <p><span className="text-retro-p2">RESULT OK:</span> {String(evidence?.resultOk)}</p>
        </div>
      )}
      {onNextRound && (
        <button onClick={onNextRound} disabled={advancing} className={PRIMARY_BTN}>
          {advancing ? 'STARTING…' : 'NEXT ROUND'}
        </button>
      )}
      <Link
        to="/"
        className="font-pixel text-[10px] text-retro-p1 text-glow-p1 hover:opacity-80 transition-opacity"
      >
        ← BACK TO HOME
      </Link>
    </div>
  )
}

// Shown to the word-keeper (and spectators) once the guesser's client has
// written the binding cheat verdict. Either player may start the next round;
// the point always goes to the guesser, so the word-keeper can't be stuck
// here by a guesser who leaves.
function CheatForfeitScreen({ onNextRound, advancing }) {
  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center p-6 gap-6">
      <div className="text-center space-y-3">
        <p
          className="font-pixel text-base text-retro-p2 text-glow-p2"
          style={{ animation: 'blink-text 0.6s step-end infinite' }}
        >
          ⚠ CHEAT DETECTED ⚠
        </p>
        <p className="font-mono text-xs text-retro-dim">Round forfeited — the guesser takes the point.</p>
      </div>
      {onNextRound && (
        <button onClick={onNextRound} disabled={advancing} className={PRIMARY_BTN}>
          {advancing ? 'STARTING…' : 'NEXT ROUND'}
        </button>
      )}
      <Link
        to="/"
        className="font-pixel text-[10px] text-retro-p1 text-glow-p1 hover:opacity-80 transition-opacity"
      >
        ← BACK TO HOME
      </Link>
    </div>
  )
}

const CLAIM_REASON_TEXT = {
  'no-word': 'NO WORD WAS SET IN TIME',
  grading: 'YOUR GUESS WAS NEVER CHECKED',
  idle: 'THE GUESSER STOPPED GUESSING',
}

// The claim offered to this player because the other side is stalling:
// a countdown while it's close, then CLAIM ROUND (+1 to the claimant).
function ClaimPanel({ claim, now, opponentLabel, onClaim, claiming }) {
  if (!claim) return null
  const showCountdown = !claim.ready &&
    (claim.reason === 'no-word' || claim.reason === 'offline' || claim.at - now <= CLAIM_WARNING_MS)
  if (!claim.ready && !showCountdown) return null
  const why = claim.reason === 'offline' ? `${opponentLabel} IS OFFLINE` : CLAIM_REASON_TEXT[claim.reason]
  return (
    <div className="text-center space-y-2 border border-retro-border rounded p-3">
      {claim.ready ? (
        <>
          <p className="font-pixel text-[10px] text-retro-dim">{why}</p>
          <button onClick={onClaim} disabled={claiming} className={SECONDARY_BTN}>
            {claiming ? 'CLAIMING…' : 'CLAIM ROUND (+1)'}
          </button>
        </>
      ) : (
        <RoundTimer
          endsAt={claim.at}
          now={now}
          totalMs={CLAIM_WINDOW_MS[claim.reason]}
          label={claim.reason === 'offline' ? `${opponentLabel} OFFLINE · CLAIM IN` : 'CAN CLAIM ROUND IN'}
          lowMs={0}
        />
      )}
    </div>
  )
}

// The other side's claim against this player, shown as a warning while it's
// close so nobody loses a round to a clock they couldn't see.
function StallWarning({ claim, now, label }) {
  if (!claim || claim.ready || claim.reason === 'offline') return null
  if (claim.reason !== 'no-word' && claim.at - now > CLAIM_WARNING_MS) return null
  return (
    <RoundTimer endsAt={claim.at} now={now} totalMs={CLAIM_WINDOW_MS[claim.reason]} label={label} />
  )
}

export default function HangmanGame({ gameId, game, mySymbol, opponentOnline, onSwitchGame, onNewMatch, proposal }) {
  const round = game.round || {}
  const guesses = normalizeGuesses(round.guesses)
  const wrongCount = round.wrongCount || 0
  const phase = round.phase || 'setting'
  const setter = round.setter === 'O' ? 'O' : 'X'
  const guesser = otherSymbol(setter)
  const roundCheatDetected = round.cheatDetected ?? false
  const target = getGameConfig('hangwoman').matchTarget || 3

  const isSetter = mySymbol === setter
  const isGuesser = mySymbol != null && mySymbol !== setter
  const isSpectator = mySymbol == null
  const mySide = isSetter ? 'setter' : isGuesser ? 'guesser' : null

  const scoreX = game.scores?.X || 0
  const scoreO = game.scores?.O || 0
  const matchWinner = scoreX >= target ? 'X' : scoreO >= target ? 'O' : null

  const [flash, setFlash] = useState(false)
  // Local verification results, keyed by the commitment they belong to so a
  // new round never inherits the previous round's verdict.
  const [cheatEvidence, setCheatEvidence] = useState(null)
  const [verifiedFor, setVerifiedFor] = useState(null)
  const [showWinEffect, setShowWinEffect] = useState(false)
  const [winEffectFor, setWinEffectFor] = useState(null)

  const cheatDetected = !!cheatEvidence && cheatEvidence.commitment === round.commitment
  const localVerified = !!round.commitment && verifiedFor === round.commitment

  const verifyStarted = useRef(null)
  const prevWrongCount = useRef(wrongCount)
  const prevWrongDrop = useRef(wrongCount)

  // Server-corrected clock for every deadline below.
  const { now, serverNow } = useServerClock({ tickMs: 500, ticking: !matchWinner })

  // When the opponent went offline (server time). Set from a timeout so the
  // effect body never sets state synchronously; the claim grace counts from it.
  const [opponentOfflineSince, setOpponentOfflineSince] = useState(null)
  useEffect(() => {
    if (isSpectator) return
    const t = setTimeout(() => setOpponentOfflineSince(opponentOnline ? null : serverNow()), 0)
    return () => clearTimeout(t)
  }, [opponentOnline, isSpectator, serverNow])
  const offlineSince = opponentOnline ? null : opponentOfflineSince
  const opponentGone = offlineSince != null && now - offlineSince >= PRESENCE_GRACE_MS

  // Anchor `round/settingStartedAt` the moment a round enters 'setting', so
  // the no-word deadline has a fixed, server-corrected reference point.
  // Guarded by a transaction so only one client's write sticks.
  useEffect(() => {
    if (phase !== 'setting' || matchWinner || round.settingStartedAt) return
    runTransaction(ref(db, `games/${gameId}/round`), current => {
      if (!current || current.phase !== 'setting' || current.settingStartedAt) return
      return { ...current, settingStartedAt: serverNow() }
    }).catch(() => toast.error('ROUND CLOCK NOT SAVED — CHECK CONNECTION'))
  }, [phase, matchWinner, round.settingStartedAt, gameId, serverNow])

  // --- Setter: grade the pending guess ---
  // gradePending() grades in a fixed order and stops once the round is
  // decided, so a queue left by an older client can't win after six misses.
  // A transaction guarded on phase + commitment, so a grade can never land in
  // a round that a claim or reset has already replaced.
  useEffect(() => {
    if (!isSetter || phase !== 'guessing') return

    const stored = readStoredWord(gameId)
    if (!stored) return
    const { word, salt, commitment } = stored

    const roundRef = ref(db, `games/${gameId}/round`)
    const unsub = onValue(ref(db, `games/${gameId}/round/guesses`), (snap) => {
      if (pendingLetters(normalizeGuesses(snap.val())).length === 0) return
      runTransaction(roundRef, current => {
        if (!current || current.phase !== 'guessing') return
        if (commitment && current.commitment !== commitment) return
        const graded = gradePending(word, normalizeGuesses(current.guesses))
        if (graded.graded.length === 0 && graded.discarded.length === 0) return
        const at = serverNow()
        const next = {
          ...current,
          guesses: graded.guesses,
          wrongCount: graded.wrongCount,
          // Nothing is pending any more — clear the grading-stall anchor and
          // restart the guesser's idle clock.
          pendingAt: null,
          gradedAt: at,
          lastGuess: graded.lastGuess ?? current.lastGuess ?? null,
        }
        if (graded.result) {
          next.phase = 'reveal'
          next.result = graded.result
          next.reveal = { word, salt }
          next.revealAt = at
        }
        return next
      }).catch(() => toast.error('COULD NOT CHECK THE GUESS — CHECK CONNECTION'))
    })

    return () => unsub()
  }, [isSetter, phase, gameId, serverNow])

  // --- Guesser: verify the reveal ---
  // Re-hash the word, re-check every recorded answer and re-derive the result,
  // then write the verdict: `verified` (lets the word-keeper advance and starts
  // the auto-advance) or the binding `cheatDetected` (point to the guesser).
  useEffect(() => {
    if (!isGuesser || phase !== 'reveal') return
    if (!round.reveal || !round.commitment) return
    if (verifyStarted.current === round.commitment) return

    const commitment = round.commitment
    verifyStarted.current = commitment
    const { word, salt } = round.reveal
    const recorded = guesses
    const claimedResult = round.result

    verifyReveal(commitment, word, salt).then((commitOk) => {
      const consistencyOk = verifyRoundConsistency(word, recorded)
      // Re-derive the outcome so a dishonest setter cannot win by writing
      // result:'hanged' after the word was actually fully guessed.
      const resultOk = deriveRoundResult(word, recorded) === claimedResult
      const ok = commitOk && consistencyOk && resultOk
      if (!ok) {
        setCheatEvidence({ commitment, revealed: word, salt, commitOk, consistencyOk, resultOk })
      }
      setVerifiedFor(commitment)
      runTransaction(ref(db, `games/${gameId}/round`), current => {
        if (!current || current.phase !== 'reveal' || current.commitment !== commitment) return
        return ok ? { ...current, verified: true } : { ...current, cheatDetected: true }
      }).catch(() => toast.error('WORD CHECK NOT SAVED — CHECK CONNECTION'))

      if (ok && claimedResult === 'guessed') {
        setWinEffectFor(guesser)
        setShowWinEffect(true)
        if (guesser === mySymbol) sounds.win()
        else if (mySymbol) sounds.lose()
      }
      // hanged: drop+bell already fired; roses render via roundResult state
    }).catch(() => {
      setVerifiedFor(commitment)
      toast.error('COULD NOT CHECK THE WORD ON THIS DEVICE')
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round.reveal, round.commitment, isGuesser, gameId])

  // --- Flash on new wrong guess ---
  useEffect(() => {
    if (wrongCount > prevWrongCount.current) {
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 120)
      prevWrongCount.current = wrongCount
      return () => clearTimeout(t)
    }
    prevWrongCount.current = wrongCount
  }, [wrongCount])

  // --- Setter: play the miss sound when their grade lands ---
  const prevWrongRef = useRef(wrongCount)
  useEffect(() => {
    if (wrongCount > prevWrongRef.current && isSetter) sounds.miss()
    prevWrongRef.current = wrongCount
  }, [wrongCount, isSetter])

  // --- Drop + bell sounds for all clients when wrongCount reaches MAX_WRONG ---
  useEffect(() => {
    if (prevWrongDrop.current < MAX_WRONG && wrongCount >= MAX_WRONG) {
      sounds.drop()
      const t = setTimeout(() => sounds.bell(), 600)
      prevWrongDrop.current = wrongCount
      return () => clearTimeout(t)
    }
    prevWrongDrop.current = wrongCount
  }, [wrongCount])

  // --- Lock the word ---
  // Transaction-guarded on the round still waiting for this player's word, so
  // a word can't be locked into a round a claim has already ended.
  const [lockingWord, runLock] = useBusy()
  const handleWordSet = useCallback((word, hint) => {
    runLock(async () => {
      const { hash, salt } = await commit(word)
      sessionStorage.setItem(`hangwoman-word-${gameId}`, JSON.stringify({ word, salt, commitment: hash }))
      const res = await runTransaction(ref(db, `games/${gameId}/round`), current => {
        if (!current || current.phase !== 'setting') return
        if ((current.setter === 'O' ? 'O' : 'X') !== mySymbol) return
        return {
          ...current,
          phase: 'guessing',
          wordStructure: wordStructure(word),
          hint: hint || null,
          commitment: hash,
          wrongCount: 0,
          guesses: null,
          reveal: null,
          result: null,
          settingStartedAt: null,
          pendingAt: null,
          gradedAt: null,
          lastGuess: null,
          guessingStartedAt: serverNow(),
        }
      })
      if (!res.committed) toast.error('ROUND ALREADY ENDED — WORD NOT LOCKED')
    }, () => toast.error('WORD NOT LOCKED — CHECK CONNECTION'))
  }, [gameId, mySymbol, serverNow, runLock])

  // One pending guess at a time: the keyboard is disabled while a guess waits
  // for the word-keeper, and the transaction refuses a second pending letter
  // (a double tap, a key repeat or an older client).
  const [sendingGuess, runGuess] = useBusy()
  const handleGuess = useCallback((letter) => {
    if (phase !== 'guessing' || !isGuesser) return
    if (!canQueueGuess(guesses, letter)) return
    runGuess(async () => {
      await runTransaction(ref(db, `games/${gameId}/round`), current => {
        if (!current || current.phase !== 'guessing') return
        if (!canQueueGuess(normalizeGuesses(current.guesses), letter)) return
        return {
          ...current,
          guesses: { ...(current.guesses || {}), [letter]: PENDING },
          // Anchors the grading-stall clock for this guess.
          pendingAt: serverNow(),
        }
      })
    }, () => toast.error('GUESS NOT SENT — CHECK CONNECTION'))
  }, [phase, isGuesser, guesses, gameId, serverNow, runGuess])

  // --- Next round (either player) ---
  // Transaction-guarded on the reveal still being the one on screen, scored
  // from live values, so both players (or both auto-advance timers) can fire
  // it and only one lands.
  const [advancing, runAdvance] = useBusy()
  const advanceRound = useCallback(() => {
    const expected = round.commitment ?? null
    runAdvance(async () => {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current?.round || current.status === 'finished') return
        const r = current.round
        if (r.phase !== 'reveal') return
        if (expected && r.commitment !== expected) return
        const side = sideOf(r, mySymbol)
        const guesserOffline = current.presence?.[otherSymbol(r.setter === 'O' ? 'O' : 'X')]?.online === false
        if (!canAdvanceReveal(r, side, { guesserGone: opponentGone && guesserOffline })) return
        const winner = revealRoundWinner(r, { cheat: side === 'guesser' && cheatDetected })
        return { ...current, ...buildNextRound(current, winner, { target }) }
      })
    }, () => toast.error('NEXT ROUND FAILED — CHECK CONNECTION'))
  }, [round.commitment, gameId, mySymbol, opponentGone, cheatDetected, target, runAdvance])

  // Auto-advance AUTO_ADVANCE_MS after a verified reveal (never after a cheat,
  // so the evidence stays readable). Every player's client may fire it.
  const autoAt = autoAdvanceAt(round)
  const autoDue = !isSpectator && autoAt != null && now >= autoAt
  useEffect(() => {
    if (autoDue) advanceRound()
  // advanceRound changes identity every render; fire once per due reveal.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDue])

  // --- Claim a stalled round (+1 to the side that isn't stalling) ---
  const myClaim = mySide ? getRoundClaim(round, mySide, { now, opponentOfflineSince: offlineSince }) : null
  const theirClaim = mySide
    ? getRoundClaim(round, mySide === 'setter' ? 'guesser' : 'setter', { now })
    : null
  const [claiming, runClaim] = useBusy()
  const handleClaimRound = useCallback(() => {
    runClaim(async () => {
      const res = await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current?.round || current.status === 'finished') return
        const r = current.round
        const side = sideOf(r, mySymbol)
        if (!side) return
        // A disconnect claim needs the server to agree the opponent is still offline.
        const stillOffline = current.presence?.[otherSymbol(mySymbol)]?.online === false
        const claim = getRoundClaim(r, side, {
          now: serverNow(),
          opponentOfflineSince: stillOffline ? offlineSince : null,
        })
        if (!claim?.ready) return
        return { ...current, ...buildNextRound(current, mySymbol, { target }) }
      })
      if (!res.committed) toast.error('NOTHING TO CLAIM — THE ROUND MOVED ON')
    }, () => toast.error('CLAIM FAILED — CHECK CONNECTION'))
  }, [gameId, mySymbol, serverNow, offlineSince, target, runClaim])

  // --- Word-keeper lost the word (new tab): concede the round ---
  const [conceding, runConcede] = useBusy()
  const handleConcede = useCallback(() => {
    runConcede(async () => {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current?.round || current.status === 'finished') return
        const r = current.round
        if (r.phase !== 'guessing' || sideOf(r, mySymbol) !== 'setter') return
        return { ...current, ...buildNextRound(current, otherSymbol(mySymbol), { target }) }
      })
      sessionStorage.removeItem(`hangwoman-word-${gameId}`)
    }, () => toast.error('CONCEDE FAILED — CHECK CONNECTION'))
  }, [gameId, mySymbol, target, runConcede])

  // Binding verdict written by the guesser's client: setter (and spectators)
  // see the forfeit screen; guesser sees evidence + NEXT ROUND button.
  if (roundCheatDetected && phase === 'reveal') {
    if (!isGuesser) {
      return <CheatForfeitScreen onNextRound={isSetter ? advanceRound : null} advancing={advancing} />
    }
    return <CheatScreen evidence={cheatEvidence} onNextRound={advanceRound} advancing={advancing} />
  }
  // Local detection only (brief race window before the Firebase write
  // propagates, or the write failed): NEXT ROUND still awards the guesser.
  if (cheatDetected && phase === 'reveal') {
    return <CheatScreen evidence={cheatEvidence} onNextRound={advanceRound} advancing={advancing} />
  }

  const opponentLabel = isSetter ? 'GUESSER' : 'WORD-KEEPER'

  // --- Match over ---
  if (matchWinner) {
    const iWon = matchWinner === mySymbol
    const winnerName = game.players?.[matchWinner]?.name || matchWinner
    return (
      <div className="space-y-6 text-center">
        {showWinEffect && (
          <WinEffect winner={winEffectFor} onDone={() => setShowWinEffect(false)} />
        )}
        <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
        <p className={cn(
          'font-pixel text-base',
          iWon ? 'text-retro-cta text-glow-cta' : 'text-retro-dim',
        )}>
          {iWon ? 'YOU WIN!' : `${winnerName} WINS`}
        </p>
        <p className="font-mono text-sm text-retro-dim">{scoreX} – {scoreO}</p>
        {!isSpectator && !proposal && onNewMatch && (
          <button onClick={onNewMatch} className={PRIMARY_BTN}>
            NEW MATCH
          </button>
        )}
        {!isSpectator && onSwitchGame && !proposal && (
          <GameSwitcher currentType="hangwoman" onSwitch={onSwitchGame} />
        )}
      </div>
    )
  }

  const claimPanel = (
    <ClaimPanel
      claim={myClaim}
      now={now}
      opponentLabel={opponentLabel}
      onClaim={handleClaimRound}
      claiming={claiming}
    />
  )

  // --- Setting phase ---
  if (phase === 'setting') {
    return (
      <div className="space-y-4">
        {showWinEffect && (
          <WinEffect winner={winEffectFor} onDone={() => setShowWinEffect(false)} />
        )}
        {isSetter ? (
          <>
            <StallWarning claim={theirClaim} now={now} label="LOCK A WORD WITHIN" />
            <WordSetter onWordSet={handleWordSet} loading={lockingWord} />
          </>
        ) : (
          <div className="text-center space-y-3 py-6">
            <div className="flex justify-center">
              <PixelDots tone="p2" size="lg" glow />
            </div>
            <p className="font-pixel text-[10px] text-retro-p2 text-glow-p2 leading-relaxed">
              WAITING FOR<br />WORD-KEEPER…
            </p>
            {!opponentOnline && !isSpectator && (
              <p className="font-pixel text-[10px] text-retro-dim">
                (WORD-KEEPER IS OFFLINE)
              </p>
            )}
            {claimPanel}
          </div>
        )}
      </div>
    )
  }

  // --- Guessing / Reveal phases ---
  const isReveal = phase === 'reveal'
  const revealedWord = isReveal ? round.reveal?.word : null
  const roundResult = round.result

  // Setter lost their word (refreshed in a new tab, or the stored word belongs
  // to another round).
  const storedWord = isSetter && phase === 'guessing' ? readStoredWord(gameId) : null
  const setterMissingWord = isSetter && phase === 'guessing' &&
    (!storedWord || (!!storedWord.commitment && storedWord.commitment !== round.commitment))

  const waitingLetter = pendingLetters(guesses)[0] ?? null
  const canGuess = isGuesser && phase === 'guessing' && !setterMissingWord && !waitingLetter

  // Reveal: who may start the next round right now.
  const canAdvanceNow = isGuesser
    ? (localVerified || !!round.verified)
    : isSetter && canAdvanceReveal(round, 'setter', { guesserGone: opponentGone })
  const autoLeftS = autoAt != null ? Math.max(0, Math.ceil((autoAt - now) / 1000)) : null

  const revealActions = isReveal && !isSpectator && (
    <div className="space-y-2">
      {canAdvanceNow ? (
        <button onClick={advanceRound} disabled={advancing} className={cn('mt-2', PRIMARY_BTN)}>
          {advancing ? 'STARTING…' : 'NEXT ROUND'}
        </button>
      ) : (
        <p className="mt-2 font-pixel text-[10px] text-retro-dim arcade-blink">
          {isGuesser ? 'CHECKING THE WORD…' : 'WAITING FOR THE GUESSER TO CHECK THE WORD…'}
        </p>
      )}
      {autoLeftS != null && (
        <p className="font-mono text-[10px] text-retro-dim">Next round starts in {autoLeftS}s</p>
      )}
      {onSwitchGame && !proposal && (
        <GameSwitcher currentType="hangwoman" onSwitch={onSwitchGame} />
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {showWinEffect && (
        <WinEffect winner={winEffectFor} onDone={() => setShowWinEffect(false)} />
      )}
      {isReveal && roundResult === 'hanged' && <RoseFall />}

      {/* Gallows */}
      <HangmanGallows wrongCount={wrongCount} flash={flash} />

      {/* Word display */}
      {(round.wordStructure || round.wordLength > 0) && (
        <WordDisplay
          wordStructure={round.wordStructure}
          wordLength={round.wordLength}
          hint={round.hint}
          guesses={guesses}
          revealedWord={revealedWord}
        />
      )}

      {/* Phase status */}
      <div className="text-center space-y-1">
        {!isReveal && (
          <p className={cn(
            'font-pixel text-[10px]',
            canGuess && wrongCount === MAX_WRONG - 1
              ? 'text-retro-p2 text-glow-p2'
              : canGuess
                ? 'text-retro-cta text-glow-cta arcade-blink'
                : 'text-retro-dim',
          )}
          style={canGuess && wrongCount === MAX_WRONG - 1
            ? { animation: 'blink-text 0.6s step-end infinite' }
            : undefined}
          >
            {canGuess
              ? wrongCount === MAX_WRONG - 1
                ? 'DEAD WOMAN GUESSING'
                : 'YOUR TURN — GUESS A LETTER'
              : isSetter
                ? setterMissingWord
                  ? 'WORD LOST — YOU OPENED A NEW TAB'
                  : 'WAITING FOR GUESS…'
                : waitingLetter
                  ? `CHECKING ${waitingLetter}…`
                  : 'WAITING FOR WORD-KEEPER…'}
          </p>
        )}
        {isReveal && roundResult === 'hanged' && (
          <div className="space-y-2">
            <p className="font-pixel text-xs text-retro-p2 text-glow-p2">
              RIP QUEEN
            </p>
            {isSetter && (
              <p className="font-pixel text-[10px] text-retro-p2/70">
                YOU HANGED HER
              </p>
            )}
            <div className="flex justify-center py-1">
              <Gravestone />
            </div>
            <p className="font-mono text-[10px] text-retro-dim">
              THE WORD THAT KILLED HER: <span className="text-retro-cta">{revealedWord}</span>
            </p>
            {revealActions}
          </div>
        )}
        {isReveal && roundResult === 'guessed' && (
          <div className="space-y-2">
            <p className="font-pixel text-xs text-retro-p1 text-glow-p1">
              WORD GUESSED!
            </p>
            <p className="font-mono text-[10px] text-retro-dim">
              The word was <span className="text-retro-cta">{revealedWord}</span>
            </p>
            {revealActions}
          </div>
        )}
        <p className={cn(
          'font-mono text-[10px]',
          wrongCount >= MAX_WRONG - 1 ? 'text-retro-p2 text-glow-p2' : 'text-retro-dim',
        )}
        style={wrongCount >= MAX_WRONG - 1
          ? { animation: 'blink-text 0.6s step-end infinite' }
          : undefined}
        >
          {wrongCount}/{MAX_WRONG} wrong
        </p>
      </div>

      {/* Setter missing word — concede */}
      {setterMissingWord && (
        <div className="text-center space-y-2 border border-retro-p2/30 rounded p-3">
          <p className="font-pixel text-[10px] text-retro-dim leading-relaxed">
            Your word was stored in this browser tab only.<br />
            Concede the round to continue.
          </p>
          <button onClick={handleConcede} disabled={conceding} className={SECONDARY_BTN}>
            {conceding ? 'CONCEDING…' : 'CONCEDE ROUND'}
          </button>
        </div>
      )}

      {/* Opponent offline notice (before the grace runs out) */}
      {!isReveal && !isSpectator && !opponentOnline && !opponentGone && (
        <p className="text-center font-pixel text-[10px] text-retro-dim">
          {opponentLabel} IS OFFLINE…
        </p>
      )}

      {/* Stall claims: +1 to the side that isn't stalling */}
      {!isReveal && claimPanel}
      {!isReveal && isGuesser && (
        <StallWarning claim={theirClaim} now={now} label="GUESS WITHIN" />
      )}

      {/* Keyboard */}
      {!isReveal && (
        <LetterKeyboard
          guesses={guesses}
          onGuess={handleGuess}
          disabled={!canGuess || sendingGuess}
        />
      )}

      {isSpectator && (
        <p className="text-center font-pixel text-[10px] text-retro-border">SPECTATING</p>
      )}
    </div>
  )
}
