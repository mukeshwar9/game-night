import { useEffect, useRef, useState, useCallback } from 'react'
import { ref, onValue, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { commit, verifyReveal } from '../lib/commit'
import {
  applyGuess, isWordGuessed, countWrong,
  MAX_WRONG, verifyRoundConsistency, deriveRoundResult, wordStructure,
} from '../lib/hangmanLogic'
import HangmanGallows from '../components/HangmanGallows'
import PixelDots from '../components/loading/PixelDots'
import WordDisplay from '../components/WordDisplay'
import LetterKeyboard from '../components/LetterKeyboard'
import WordSetter from '../components/WordSetter'
import WinEffect from '../components/WinEffect'
import RoseFall from '../components/RoseFall'
import Gravestone from '../components/Gravestone'
import GameSwitcher from '../components/GameSwitcher'
import ShareResultButton from '../components/ShareResultButton'
import { sounds } from '../lib/sounds'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

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

function CheatScreen({ evidence, onNextRound }) {
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
        <button
          onClick={onNextRound}
          className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
        >
          NEXT ROUND
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

// Shown to the setter (and spectators) when the guesser's client has written
// the binding cheat verdict to Firebase. The guesser advances the round.
// onReset is provided to the setter so they can manually reset a stuck round
// (e.g. if the guesser disconnects after writing the cheat verdict but before
// clicking NEXT ROUND, which would leave the setter frozen here indefinitely).
function CheatForfeitScreen({ waiting, onReset }) {
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
      {waiting && (
        <p className="font-pixel text-[10px] text-retro-dim arcade-blink">WAITING FOR GUESSER…</p>
      )}
      {onReset && (
        <button
          onClick={onReset}
          className="px-6 py-2.5 border-2 border-retro-border text-retro-text font-pixel text-xs rounded hover:border-retro-p1/50 hover:text-retro-p1 transition-all active:scale-95"
        >
          RESET ROUND
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

const MATCH_WINS = 3
// Escape-hatch deadlines — anchored to server-corrected timestamps (see
// clockOffset below) so they can't be gamed by a client's local clock.
const SETTING_DEADLINE_MS = 120_000 // setter never locks a word
const GRADING_STALL_MS = 60_000 // setter online but stops resolving a pending guess
const NO_GUESS_DEADLINE_MS = 120_000 // guesser never makes a first guess

export default function HangmanGame({ gameId, game, mySymbol, opponentOnline, onSwitchGame, onNewMatch, proposal }) {
  const round = game.round || {}
  const guesses = normalizeGuesses(round.guesses)
  const wrongCount = round.wrongCount || 0
  const phase = round.phase || 'setting'
  const setter = round.setter || 'X'
  const guesser = setter === 'X' ? 'O' : 'X'
  const roundCheatDetected = round.cheatDetected ?? false

  const isSetter = mySymbol === setter
  const isGuesser = mySymbol !== null && mySymbol !== setter
  const isSpectator = mySymbol === null

  const scoreX = game.scores?.X || 0
  const scoreO = game.scores?.O || 0
  const matchWinner = scoreX >= MATCH_WINS ? 'X' : scoreO >= MATCH_WINS ? 'O' : null

  const [lockingWord, setLockingWord] = useState(false)
  const [flash, setFlash] = useState(false)
  const [cheatDetected, setCheatDetected] = useState(false)
  const [cheatEvidence, setCheatEvidence] = useState(null)
  const [showWinEffect, setShowWinEffect] = useState(false)
  const [winEffectFor, setWinEffectFor] = useState(null)
  const [clockOffset, setClockOffset] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const verifiedCommitment = useRef(null)
  const prevWrongCount = useRef(wrongCount)
  const prevWrongDrop = useRef(wrongCount)
  const advancingRound = useRef(false)

  // Corrected clock for the deadline/hatch paths below — never used by the
  // commit-reveal machinery itself.
  useEffect(() => {
    const offRef = ref(db, '.info/serverTimeOffset')
    const unsub = onValue(offRef, snap => setClockOffset(snap.val() ?? 0))
    return () => unsub()
  }, [])
  const serverNow = now + clockOffset

  // Ticker — only runs while a deadline could matter, so idle reveal/finished
  // screens don't re-render every second for no reason.
  useEffect(() => {
    if (phase !== 'setting' && phase !== 'guessing') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [phase])

  // Anchor `round/settingStartedAt` the moment a round enters 'setting', so
  // the 120s no-word deadline has a fixed, server-corrected reference point.
  // Guarded by a transaction so only one client's write sticks.
  useEffect(() => {
    if (phase !== 'setting' || matchWinner || round.settingStartedAt) return
    runTransaction(ref(db, `games/${gameId}/round`), current => {
      if (!current || current.phase !== 'setting' || current.settingStartedAt) return
      return { ...current, settingStartedAt: Date.now() + clockOffset }
    }).catch(() => {})
  }, [phase, matchWinner, round.settingStartedAt, gameId, clockOffset])

  const settingStartedAt = round.settingStartedAt ?? null
  const settingElapsedMs = settingStartedAt ? Math.max(0, serverNow - settingStartedAt) : 0
  const settingExpired = phase === 'setting' && !!settingStartedAt && settingElapsedMs >= SETTING_DEADLINE_MS

  const pendingAt = round.pendingAt ?? null
  const gradingStalled = phase === 'guessing' && !!pendingAt && (serverNow - pendingAt) >= GRADING_STALL_MS

  const guessingStartedAt = round.guessingStartedAt ?? null
  const noGuessYet = phase === 'guessing' && Object.keys(guesses).length === 0
  const guesserIdleExpired = noGuessYet && !!guessingStartedAt &&
    (serverNow - guessingStartedAt) >= NO_GUESS_DEADLINE_MS

  // --- Setter: process pending guesses ---
  useEffect(() => {
    if (!isSetter || phase !== 'guessing') return

    const stored = sessionStorage.getItem(`hangwoman-word-${gameId}`)
    if (!stored) return
    const { word, salt } = JSON.parse(stored)

    const guessesRef = ref(db, `games/${gameId}/round/guesses`)
    const unsub = onValue(guessesRef, (snap) => {
      const raw = snap.val()
      if (!raw) return

      const pending = Object.entries(raw).filter(([, v]) => v === 'pending')
      if (pending.length === 0) return

      const currentGuesses = normalizeGuesses(raw)
      const updates = {}
      const merged = { ...currentGuesses }

      for (const [letter] of pending) {
        const positions = applyGuess(word, letter)
        const guessVal = positions.length > 0 ? positions : false
        updates[`games/${gameId}/round/guesses/${letter}`] = guessVal
        merged[letter] = guessVal
      }

      const newWrongCount = countWrong(merged)
      updates[`games/${gameId}/round/wrongCount`] = newWrongCount
      // Every pending guess in this batch is resolved above — clear the
      // grading-stall anchor so the guesser's 60s hatch doesn't fire stale.
      updates[`games/${gameId}/round/pendingAt`] = null

      const guessed = isWordGuessed(word, merged)
      const hanged = newWrongCount >= MAX_WRONG

      if (guessed || hanged) {
        const result = guessed ? 'guessed' : 'hanged'
        updates[`games/${gameId}/round/phase`] = 'reveal'
        updates[`games/${gameId}/round/result`] = result
        updates[`games/${gameId}/round/reveal`] = { word, salt }
      }

      update(ref(db), updates).catch(() => {})
    })

    return () => unsub()
  }, [isSetter, phase, gameId])

  // --- Guesser: verify reveal ---
  useEffect(() => {
    if (!isGuesser || phase !== 'reveal') return
    if (!round.reveal || !round.commitment) return
    if (verifiedCommitment.current === round.commitment) return

    verifiedCommitment.current = round.commitment
    const { word, salt } = round.reveal

    Promise.all([
      verifyReveal(round.commitment, word, salt),
      Promise.resolve(verifyRoundConsistency(word, guesses)),
    ]).then(([commitOk, consistencyOk]) => {
      // BUG 2: re-derive the outcome from the revealed word + recorded guesses
      // so a dishonest setter cannot win by writing result:'hanged' after the
      // word was actually fully guessed (or vice-versa).
      const derivedResult = deriveRoundResult(word, guesses)
      const resultOk = derivedResult === round.result

      if (!commitOk || !consistencyOk || !resultOk) {
        // BUG 1: write a binding verdict to Firebase so the setter's client
        // also shows the forfeit screen and cannot bank the point.
        update(ref(db, `games/${gameId}/round`), { cheatDetected: true }).catch(() => {})
        setCheatDetected(true)
        setCheatEvidence({
          commitment: round.commitment,
          revealed: word,
          salt,
          commitOk,
          consistencyOk,
          resultOk,
        })
      } else if (round.result === 'guessed') {
        const roundWinner = guesser
        setWinEffectFor(roundWinner)
        setShowWinEffect(true)
        if (roundWinner === mySymbol) sounds.win()
        else if (mySymbol) sounds.lose()
      }
      // hanged: drop+bell already fired; roses render via roundResult state
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

  // --- Setter: also play sounds on guess resolution ---
  // (Setter's onValue already runs; play sound based on wrongCount increase)
  const prevWrongRef = useRef(wrongCount)
  useEffect(() => {
    if (wrongCount > prevWrongRef.current && isSetter) {
      sounds.miss()
    } else if (wrongCount === prevWrongRef.current && phase === 'guessing' && isSetter) {
      // hit — move sound already played in onValue loop via the data
    }
    prevWrongRef.current = wrongCount
  }, [wrongCount, isSetter, phase])

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

  const handleWordSet = useCallback(async (word, hint) => {
    setLockingWord(true)
    try {
      const { hash, salt } = await commit(word)
      sessionStorage.setItem(`hangwoman-word-${gameId}`, JSON.stringify({ word, salt }))
      await update(ref(db, `games/${gameId}`), {
        'round/phase': 'guessing',
        'round/wordStructure': wordStructure(word),
        'round/hint': hint || null,
        'round/commitment': hash,
        'round/wrongCount': 0,
        'round/guesses': null,
        'round/reveal': null,
        'round/result': null,
        'round/settingStartedAt': null,
        'round/pendingAt': null,
        'round/guessingStartedAt': Date.now() + clockOffset,
      })
    } catch {
      /* ignore */
    } finally {
      setLockingWord(false)
    }
  }, [gameId, clockOffset])

  const handleGuess = useCallback(async (letter) => {
    if (phase !== 'guessing' || !isGuesser) return
    if (letter in guesses) return
    try {
      await update(ref(db), { [`games/${gameId}/round/guesses/${letter}`]: 'pending' })
      // Anchor the grading-stall timestamp on the first outstanding pending
      // guess only — later pending guesses don't push the deadline out.
      await runTransaction(ref(db, `games/${gameId}/round/pendingAt`), current =>
        current == null ? Date.now() + clockOffset : current)
    } catch { /* ignore */ }
  }, [phase, isGuesser, guesses, gameId, clockOffset])

  const handleNextRound = useCallback(async () => {
    // Clear local cheat state so a previously detected cheat doesn't leave the
    // guesser permanently stuck on a dead CheatScreen after the Firebase flag
    // is cleared (the local flag is never reset otherwise).
    setCheatDetected(false)
    setCheatEvidence(null)
    // BUG 3: only the guesser (who becomes next setter) may advance the round.
    // This prevents the setter from simultaneously clicking NEXT ROUND and
    // double-applying the score write.
    if (!isGuesser) return
    if (advancingRound.current) return
    advancingRound.current = true

    // BUG 1/2: if a cheat was detected (DB flag from Firebase propagation, or
    // local state from the brief race window before propagation), the guesser
    // wins regardless of what round.result says.
    const cheated = roundCheatDetected || cheatDetected
    const roundWinner = cheated ? guesser : (round.result === 'guessed' ? guesser : setter)
    const newScores = { X: scoreX, O: scoreO }
    newScores[roundWinner] = (newScores[roundWinner] || 0) + 1

    const newMatchWinner = newScores.X >= MATCH_WINS ? 'X' : newScores.O >= MATCH_WINS ? 'O' : null
    const newSetter = setter === 'X' ? 'O' : 'X'

    sessionStorage.removeItem(`hangwoman-word-${gameId}`)

    const updates = {
      'scores/X': newScores.X,
      'scores/O': newScores.O,
      'round/setter': newSetter,
      'round/phase': 'setting',
      'round/wrongCount': 0,
      'round/wordStructure': null,
      'round/hint': null,
      'round/commitment': null,
      'round/guesses': null,
      'round/reveal': null,
      'round/result': null,
      // Clear the cheat flag so it does not bleed into the next round.
      'round/cheatDetected': null,
      'round/settingStartedAt': null,
      'round/pendingAt': null,
      'round/guessingStartedAt': null,
      proposal: null,
    }

    if (newMatchWinner) {
      updates.status = 'finished'
      updates.winner = newMatchWinner
    }

    try { await update(ref(db, `games/${gameId}`), updates) } catch { /* ignore */ } finally {
      advancingRound.current = false
    }
  }, [isGuesser, roundCheatDetected, cheatDetected, round.result, setter, guesser, scoreX, scoreO, gameId])

  const handleForfeit = useCallback(async () => {
    const newScores = { X: scoreX, O: scoreO }
    newScores[guesser] = (newScores[guesser] || 0) + 1
    const newMatchWinner = newScores.X >= MATCH_WINS ? 'X' : newScores.O >= MATCH_WINS ? 'O' : null
    const newSetter = setter === 'X' ? 'O' : 'X'

    sessionStorage.removeItem(`hangwoman-word-${gameId}`)

    const updates = {
      'scores/X': newScores.X,
      'scores/O': newScores.O,
      'round/setter': newSetter,
      'round/phase': 'setting',
      'round/wrongCount': 0,
      'round/wordStructure': null,
      'round/hint': null,
      'round/commitment': null,
      'round/guesses': null,
      'round/reveal': null,
      'round/result': null,
      'round/cheatDetected': null,
      'round/settingStartedAt': null,
      'round/pendingAt': null,
      'round/guessingStartedAt': null,
      proposal: null,
    }

    if (newMatchWinner) {
      updates.status = 'finished'
      updates.winner = newMatchWinner
    }

    try { await update(ref(db, `games/${gameId}`), updates) } catch { /* ignore */ }
  }, [setter, guesser, scoreX, scoreO, gameId])

  // Symmetric escape hatch, callable by either side once their opposite
  // number has gone unresponsive: the word-keeper abandoning mid-round
  // (offline, or online but stalled resolving a pending guess for
  // GRADING_STALL_MS — called by the guesser), or the guesser never making a
  // first guess for NO_GUESS_DEADLINE_MS (called by the setter). No score
  // change — resets to a fresh round with setter/guesser swapped so play
  // continues. Runs as a transaction guarded on phase still being 'guessing'
  // so it can never clobber a reveal that resolved in the same instant.
  const handleResetStuckRound = useCallback(async () => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || !current.round) return current
        if (current.round.phase !== 'guessing') return // already resolved — don't clobber a live reveal
        const curSetter = current.round.setter || 'X'
        const newSetter = curSetter === 'X' ? 'O' : 'X'
        return {
          ...current,
          round: { setter: newSetter, phase: 'setting', wrongCount: 0 },
          proposal: null,
        }
      })
    } catch { /* ignore */ }
  }, [gameId])

  // Guesser-only hatch: the setter never locked in a word within
  // SETTING_DEADLINE_MS. Awards the round to the guesser, same as conceding
  // (setterMissingWord/handleForfeit) — failing to set a word in time is the
  // same failure as losing the word after setting it. Transaction-guarded on
  // the phase still being 'setting' and the deadline having actually passed
  // server-side, so a setter who locks a word in the same instant wins the
  // race instead of being overridden.
  const handleClaimSettingTimeout = useCallback(async () => {
    if (!isGuesser) return
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || !current.round) return current
        const r = current.round
        if (r.phase !== 'setting') return // setter locked a word already
        const anchor = r.settingStartedAt
        if (!anchor || Date.now() + clockOffset - anchor < SETTING_DEADLINE_MS) return // not expired yet
        const curSetter = r.setter || 'X'
        const curGuesser = curSetter === 'X' ? 'O' : 'X'
        const sX = current.scores?.X || 0
        const sO = current.scores?.O || 0
        const newScores = { X: sX, O: sO }
        newScores[curGuesser] = (newScores[curGuesser] || 0) + 1
        const newMatchWinner = newScores.X >= MATCH_WINS ? 'X' : newScores.O >= MATCH_WINS ? 'O' : null
        const newSetter = curSetter === 'X' ? 'O' : 'X'
        return {
          ...current,
          scores: newScores,
          round: { setter: newSetter, phase: 'setting', wrongCount: 0 },
          ...(newMatchWinner ? { status: 'finished', winner: newMatchWinner } : {}),
          proposal: null,
        }
      })
    } catch { /* ignore */ }
  }, [isGuesser, gameId, clockOffset])

  // Binding verdict written by the guesser's client: setter (and spectators)
  // see the forfeit screen; guesser sees evidence + NEXT ROUND button.
  if (roundCheatDetected) {
    if (!isGuesser) return <CheatForfeitScreen waiting={isSetter} onReset={isSetter ? handleResetStuckRound : null} />
    return <CheatScreen evidence={cheatEvidence} onNextRound={handleNextRound} />
  }
  // Local detection only (brief race window before the Firebase write propagates).
  // Still offer NEXT ROUND: if that write failed, the guesser would otherwise
  // sit on a dead screen with no exit.
  if (cheatDetected) return <CheatScreen evidence={cheatEvidence} onNextRound={handleNextRound} />

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
          <button
            onClick={onNewMatch}
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
          >
            NEW MATCH
          </button>
        )}
        <ShareResultButton
          gameLabel="HANGWOMAN"
          headline={iWon ? 'YOU WIN!' : `${winnerName} WINS`}
          sub={`${scoreX} – ${scoreO}`}
          accentVar={iWon ? '--c-cta' : '--c-p2'}
          url={window.location.href}
        />
        {!isSpectator && onSwitchGame && !proposal && (
          <GameSwitcher currentType="hangwoman" onSwitch={onSwitchGame} />
        )}
      </div>
    )
  }

  // --- Setting phase ---
  if (phase === 'setting') {
    return (
      <div className="space-y-4">
        {showWinEffect && (
          <WinEffect winner={winEffectFor} onDone={() => setShowWinEffect(false)} />
        )}
        {isSetter ? (
          <WordSetter onWordSet={handleWordSet} loading={lockingWord} />
        ) : (
          <div className="text-center space-y-3 py-6">
            <div className="flex justify-center">
              <PixelDots tone="p2" size="lg" glow />
            </div>
            <p className="font-pixel text-[10px] text-retro-p2 text-glow-p2 leading-relaxed">
              WAITING FOR<br />WORD-KEEPER…
            </p>
            {!opponentOnline && (
              <p className="font-pixel text-[10px] text-retro-dim">
                (WORD-KEEPER IS OFFLINE)
              </p>
            )}
            {isGuesser && settingExpired && (
              <button
                onClick={handleClaimSettingTimeout}
                className="px-6 py-2.5 border-2 border-retro-border text-retro-text font-pixel text-xs rounded hover:border-retro-p1/50 hover:text-retro-p1 transition-all active:scale-95"
              >
                CLAIM ROUND — NO WORD SET
              </button>
            )}
            {isGuesser && settingStartedAt && !settingExpired && (
              <p className="font-mono text-[9px] text-retro-dim">
                CAN CLAIM IN {Math.max(0, Math.ceil((SETTING_DEADLINE_MS - settingElapsedMs) / 1000))}s
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  // --- Guessing / Reveal phases ---
  const isReveal = phase === 'reveal'
  const revealedWord = isReveal ? round.reveal?.word : null
  const roundResult = round.result

  // Setter lost their word (refreshed in new tab)
  const setterMissingWord = isSetter && phase === 'guessing' &&
    !sessionStorage.getItem(`hangwoman-word-${gameId}`)

  const canGuess = isGuesser && phase === 'guessing' && !setterMissingWord

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
            {/* BUG 3: only the guesser may advance the round; setter waits. */}
            {isGuesser && (
              <div className="space-y-2">
                <button
                  onClick={handleNextRound}
                  className="mt-2 px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
                >
                  NEXT ROUND
                </button>
                {onSwitchGame && !proposal && (
                  <GameSwitcher currentType="hangwoman" onSwitch={onSwitchGame} />
                )}
              </div>
            )}
            {isSetter && (
              <p className="mt-2 font-pixel text-[10px] text-retro-dim arcade-blink">
                WAITING FOR GUESSER…
              </p>
            )}
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
            {/* BUG 3: only the guesser may advance the round; setter waits. */}
            {isGuesser && (
              <div className="space-y-2">
                <button
                  onClick={handleNextRound}
                  className="mt-2 px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
                >
                  NEXT ROUND
                </button>
                {onSwitchGame && !proposal && (
                  <GameSwitcher currentType="hangwoman" onSwitch={onSwitchGame} />
                )}
              </div>
            )}
            {isSetter && (
              <p className="mt-2 font-pixel text-[10px] text-retro-dim arcade-blink">
                WAITING FOR GUESSER…
              </p>
            )}
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

      {/* Setter missing word — forfeit option */}
      {setterMissingWord && (
        <div className="text-center space-y-2 border border-retro-p2/30 rounded p-3">
          <p className="font-pixel text-[10px] text-retro-dim leading-relaxed">
            Your word was stored in this browser tab only.<br />
            Concede the round to continue.
          </p>
          <button
            onClick={handleForfeit}
            className="px-6 py-2.5 border-2 border-retro-border text-retro-text font-pixel text-xs rounded hover:border-retro-p1/50 hover:text-retro-p1 transition-all active:scale-95"
          >
            CONCEDE ROUND
          </button>
        </div>
      )}

      {/* Setter offline / stalled warning + guesser escape hatch */}
      {!isSetter && !isReveal && (!opponentOnline || gradingStalled) && (
        <div className="text-center space-y-2">
          <p className="font-pixel text-[10px] text-retro-dim">
            {!opponentOnline
              ? 'WORD-KEEPER IS OFFLINE — GUESSES WILL STALL'
              : 'WORD-KEEPER HAS NOT RESPONDED IN 60s'}
          </p>
          {isGuesser && (
            <button
              onClick={handleResetStuckRound}
              className="px-6 py-2.5 border-2 border-retro-border text-retro-text font-pixel text-xs rounded hover:border-retro-p1/50 hover:text-retro-p1 transition-all active:scale-95"
            >
              END ROUND
            </button>
          )}
        </div>
      )}

      {/* Symmetric hatch: guesser never made a first guess — setter may end it */}
      {isSetter && !isReveal && guesserIdleExpired && (
        <div className="text-center space-y-2">
          <p className="font-pixel text-[10px] text-retro-dim">
            GUESSER HAS NOT MOVED IN 120s
          </p>
          <button
            onClick={handleResetStuckRound}
            className="px-6 py-2.5 border-2 border-retro-border text-retro-text font-pixel text-xs rounded hover:border-retro-p1/50 hover:text-retro-p1 transition-all active:scale-95"
          >
            END ROUND
          </button>
        </div>
      )}

      {/* Keyboard */}
      {!isReveal && (
        <LetterKeyboard
          guesses={guesses}
          onGuess={handleGuess}
          disabled={!canGuess}
        />
      )}

      {isSpectator && (
        <p className="text-center font-pixel text-[10px] text-retro-border">SPECTATING</p>
      )}
    </div>
  )
}
