import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { commit as makeCommit, verifyReveal } from '../lib/commit'
import {
  compareResults, getKeyboardState, MAX_GUESSES, WORD_LENGTH, MATCH_WINS,
  verifyOpponentRound, verifyGradedBoard, decideDuelRound,
  applyGrading, applyDuelGuess, applySelfDone, nextDuelRound, normalizeGuessList,
  guessProblem, secretWordProblem, getFinishGraceEndsAt, applyFinishTimeout,
  DUEL_FINISH_GRACE_MS,
} from '../lib/wordduelLogic'
import { sounds } from '../lib/sounds'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import { cn } from '@/lib/utils'
import { getGameConfig } from '@/lib/games'
import { shareResult } from '@/lib/shareCard'
import PixelDots from '@/components/loading/PixelDots'
import OfflineNotice from '@/components/loading/OfflineNotice'
import useBusy from '@/hooks/useBusy'
import useServerClock from '@/hooks/useServerClock'
import MarkTile from '@/components/MarkTile'
import WordKeyboard from '@/components/WordKeyboard'
import RoundTimer from '@/components/RoundTimer'
import WordFeedback from '@/components/WordFeedback'
import MatchScoreRail from '@/components/MatchScoreRail'
import { toast } from 'sonner'

const STORAGE_PREFIX = 'wordduel-word-'
// A setter who never commits, or an opponent whose tab closed leaving a guess
// ungraded forever, would otherwise stall the round indefinitely — grace
// periods below back a claim/skip escape hatch (pattern: BattleshipGame's
// REVEAL_GRACE_MS / SHOT_GRACE_MS). Once one board is finished, the other
// side gets DUEL_FINISH_GRACE_MS (wordduelLogic) before time is called.
const SETTING_DEADLINE_MS = 120000
const GRADE_GRACE_MS = 60000
const MATCH_TARGET = getGameConfig('wordduel')?.matchTarget || MATCH_WINS

function storageKey(gameId, symbol) {
  return `${STORAGE_PREFIX}${gameId}-${symbol}`
}

function getStoredWord(gameId, symbol) {
  try {
    const raw = localStorage.getItem(storageKey(gameId, symbol))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function setStoredWord(gameId, symbol, data) {
  if (data) {
    localStorage.setItem(storageKey(gameId, symbol), JSON.stringify(data))
  } else {
    localStorage.removeItem(storageKey(gameId, symbol))
  }
}

const normalizeGuesses = normalizeGuessList

// `ghostMode` shows marks only (glyph tiles, no letters): the opponent's board
// while you play, and both boards for spectators until the reveal.
function GameBoard({ guesses, ghostMode, label }) {
  const rows = []
  for (let r = 0; r < MAX_GUESSES; r++) {
    const g = guesses[r]
    const cells = []
    for (let c = 0; c < WORD_LENGTH; c++) {
      const letter = g && g.word ? g.word[c] : ''
      const mark = g && g.marks ? g.marks[c] : null
      cells.push(ghostMode
        ? <MarkTile key={c} size="xs" mark={mark} label={mark ? undefined : g ? 'not checked yet' : 'empty'} />
        : <MarkTile key={c} size="md" letter={letter} mark={mark} pending={!!g && !g.marks} />)
    }
    rows.push(
      <div key={r} className={cn('flex', ghostMode ? 'gap-0.5' : 'gap-1')}>
        {cells}
      </div>
    )
  }
  return <div className="flex flex-col gap-1" role="group" aria-label={label}>{rows}</div>
}

// Word input for setting phase
function WordInput({ value }) {
  return (
    <div className="flex flex-col items-center gap-2" aria-label={`Your word: ${value || 'empty'}`}>
      <div className="flex gap-1.5">
        {Array.from({ length: WORD_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded',
              'text-xl sm:text-2xl font-bold border-2 uppercase',
              value[i] ? 'bg-retro-cta text-retro-bg border-retro-cta' : 'bg-retro-card border-retro-border',
              'transition-colors duration-150',
            )}
          >
            {value[i] || ''}
          </div>
        ))}
      </div>
    </div>
  )
}

// Outline share CTA — classes copied from GameStatus's ShareButton for visual parity
function ShareButton({ onClick, busy }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="px-6 py-2.5 min-w-[6.5rem] border-2 border-retro-border text-retro-text font-pixel text-xs
        rounded hover:border-retro-p1/50 hover:text-retro-p1 transition-all active:scale-95 disabled:opacity-50"
    >
      {busy ? 'BUILDING…' : 'SHARE'}
    </button>
  )
}

function ClaimBox({ message, onClick, busy, label = 'CLAIM ROUND' }) {
  return (
    <div className="text-center space-y-2 border border-retro-p2/30 rounded p-3 mt-1">
      <p className="text-xs text-retro-dim">{message}</p>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="min-h-11 px-6 py-2.5 border-2 border-retro-p2 text-retro-p2 font-bold text-xs uppercase rounded hover:shadow-neon-p2 transition-all active:scale-95 disabled:opacity-50"
      >
        {busy ? 'CLAIMING…' : label}
      </button>
    </div>
  )
}

// Why the round ended the way it did, from the result + done states.
function resultExplanation({ result, mySymbol, doneMine, doneOpp }) {
  if (!result) return null
  const iWon = result.winner === mySymbol
  if (result.reason === 'stall') {
    if (result.stall === 'setting') {
      return iWon
        ? 'Your opponent never locked in a word, so the round is yours.'
        : "You didn't lock in a word in time, so the round went to your opponent."
    }
    return iWon
      ? "Your opponent's game stopped grading your guesses, so the round is yours."
      : "Your game couldn't grade your opponent's guesses in time, so the round went to them."
  }
  if (result.reason === 'cheat') {
    return iWon
      ? "Your opponent's word or grading didn't check out — you win by forfeit."
      : 'Your board failed verification — round forfeited.'
  }
  if (doneOpp?.timedOut) return iWon ? 'Your opponent ran out of time.' : 'Time ran out.'
  if (doneMine?.timedOut) return 'You ran out of time.'
  if (result.winner === 'draw') return doneMine?.solved ? 'Same guesses, same time.' : 'Neither word was cracked.'
  if (doneMine?.solved && doneOpp?.solved && doneMine.guesses === doneOpp.guesses) {
    return iWon ? 'Same number of guesses — you were faster.' : 'Same number of guesses — they were faster.'
  }
  return null
}

export default function WordDuelGame({
  gameId, game, mySymbol, opponentOnline, onSwitchGame, onNewMatch, proposal,
}) {
  // ── ALL HOOKS FIRST ──

  const [settingWord, setSettingWord] = useState('')
  const [settingFeedback, setSettingFeedback] = useState(null)
  const [currentGuess, setCurrentGuess] = useState('')
  const [guessFeedback, setGuessFeedback] = useState(null)
  const [cheatDetected, setCheatDetected] = useState(false)
  const [verifyStatus, setVerifyStatus] = useState(null)
  const [localResult, setLocalResult] = useState(null)

  // Per-round client state. The page is not remounted between rounds
  // (Game.jsx keys it on gameType), so everything below is reset whenever the
  // round identity (roundNum, or a return to the setting phase) changes — on
  // BOTH clients, not just the one that pressed NEXT ROUND.
  const verifiedRef = useRef(false)
  const gradingRef = useRef(false)
  const selfDoneRef = useRef(false)
  const autoTimeoutRef = useRef(false)
  const roundKeyRef = useRef('')
  const [gradeRetry, setGradeRetry] = useState(0)

  const [sharing, runShare] = useBusy()
  const [locking, runLock] = useBusy()
  const [guessBusy, runGuess] = useBusy()
  const [actionBusy, runAction] = useBusy()

  // Derived from game
  const round = useMemo(() => game?.round || {}, [game])
  const phase = round.phase || 'setting'
  const roundNum = Number(round.roundNum) || 1
  const roundKey = `${roundNum}:${phase === 'setting' ? 'setting' : 'live'}`
  const opponentSymbol = mySymbol === 'X' ? 'O' : 'X'
  const isSpectator = !mySymbol
  const matchOver = game?.status === 'finished'

  const commits = useMemo(() => round.commits || {}, [round])
  const reveal = useMemo(() => round.reveal || {}, [round])
  const result = round.result

  const myGuesses = normalizeGuesses(round['guesses' + mySymbol])
  const oppGuesses = normalizeGuesses(round['guesses' + opponentSymbol])
  const myDone = round['done' + mySymbol]
  const oppDone = round['done' + opponentSymbol]
  const startedAt = round.startedAt

  const myCommit = commits[mySymbol]
  // A word stored for an earlier round (or another device's commit) must never
  // grade or reveal this round: the stored hash has to match my commit.
  const stored = useMemo(() => {
    const raw = getStoredWord(gameId, mySymbol)
    return raw && (!raw.hash || raw.hash === myCommit) ? raw : null
  }, [gameId, mySymbol, myCommit])
  const oppCommit = commits[opponentSymbol]
  const allScores = (game?.scores) || { X: 0, O: 0 }

  const bothCommitted = myCommit && oppCommit
  const bothRevealed = reveal.X && reveal.O
  const bothDone = myDone && oppDone
  const matchWinner = allScores.X >= MATCH_TARGET ? 'X' : allScores.O >= MATCH_TARGET ? 'O' : null

  const keyboardState = getKeyboardState(myGuesses)

  const [trackedRoundKey, setTrackedRoundKey] = useState(roundKey)
  if (trackedRoundKey !== roundKey) {
    setTrackedRoundKey(roundKey)
    setCheatDetected(false)
    setVerifyStatus(null)
    setLocalResult(null)
    setCurrentGuess('')
    setGuessFeedback(null)
    if (phase === 'setting') {
      setSettingWord('')
      setSettingFeedback(null)
    }
  }
  useEffect(() => {
    roundKeyRef.current = roundKey
    verifiedRef.current = false
    gradingRef.current = false
    selfDoneRef.current = false
    autoTimeoutRef.current = false
  }, [roundKey])

  // Server-corrected clock: `now` for rendering countdowns, `serverNow()` for
  // stamps written to Firebase and deadline checks inside transactions.
  const { now, serverNow } = useServerClock({
    tickMs: 500,
    ticking: !matchOver && (phase === 'setting' || phase === 'guessing'),
  })

  // Setting-phase deadline: anchor the phase start so every client agrees on
  // when the 120s clock began (first client to notice writes it).
  useEffect(() => {
    if (isSpectator || matchOver || phase !== 'setting' || round.settingStartedAt) return
    update(ref(db, `games/${gameId}/round`), { settingStartedAt: serverNow() }).catch(() => {})
  }, [isSpectator, matchOver, phase, round.settingStartedAt, gameId, serverNow])

  const settingEndsAt = round.settingStartedAt ? round.settingStartedAt + SETTING_DEADLINE_MS : null
  const settingStalled = !isSpectator && phase === 'setting' && !!myCommit && !oppCommit &&
    !!settingEndsAt && now >= settingEndsAt

  const handleClaimSettingStall = () => runAction(async () => {
    await runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || !current.round || current.status !== 'playing') return
      const r = current.round
      if (r.phase !== 'setting' || r.result) return
      const commits = r.commits || {}
      if (!commits[mySymbol] || commits[opponentSymbol]) return
      if (!r.settingStartedAt || serverNow() - r.settingStartedAt < SETTING_DEADLINE_MS) return
      const newScores = { ...(current.scores || { X: 0, O: 0 }) }
      newScores[mySymbol] = (newScores[mySymbol] || 0) + 1
      const over = newScores[mySymbol] >= MATCH_TARGET
      return {
        ...current,
        scores: newScores,
        status: over ? 'finished' : current.status,
        winner: over ? mySymbol : current.winner ?? null,
        round: { phase: 'reveal', roundNum: r.roundNum || 1, result: { winner: mySymbol, reason: 'stall', stall: 'setting' } },
      }
    })
  }, () => toast.error('CLAIM FAILED — CHECK CONNECTION'))

  // Grading stall: my own guesses can only be graded by the opponent's client
  // (it alone holds their secret word). If their tab closed, the guess sits
  // ungraded forever — let me claim the round after a grace period instead.
  const myPendingGuess = myGuesses.find(g => g && g.word && !g.marks)
  const gradeStalled = !isSpectator && phase === 'guessing' && !myDone &&
    !!myPendingGuess?.at && (now - myPendingGuess.at >= GRADE_GRACE_MS)

  const handleClaimGradeStall = () => runAction(async () => {
    await runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || !current.round || current.status !== 'playing') return
      const r = current.round
      if (r.phase !== 'guessing' || r.result) return
      const mine = normalizeGuesses(r[`guesses${mySymbol}`])
      const pending = mine.find(g => g && g.word && !g.marks)
      if (!pending || !pending.at || serverNow() - pending.at < GRADE_GRACE_MS) return
      const newScores = { ...(current.scores || { X: 0, O: 0 }) }
      newScores[mySymbol] = (newScores[mySymbol] || 0) + 1
      const over = newScores[mySymbol] >= MATCH_TARGET
      return {
        ...current,
        scores: newScores,
        status: over ? 'finished' : current.status,
        winner: over ? mySymbol : current.winner ?? null,
        round: { ...r, phase: 'reveal', result: { winner: mySymbol, reason: 'stall', stall: 'grading' } },
      }
    })
  }, () => toast.error('CLAIM FAILED — CHECK CONNECTION'))

  // ── Setting Phase: commit word ──
  const handleSetWord = () => {
    const word = settingWord.toUpperCase()
    const problem = secretWordProblem(word)
    if (problem) {
      sounds.miss?.()
      setSettingFeedback(prev => ({ message: problem, id: (prev?.id || 0) + 1 }))
      return
    }
    setSettingFeedback(null)
    runLock(async () => {
      const { hash, salt } = await makeCommit(word)
      setStoredWord(gameId, mySymbol, { word, salt, hash })
      await update(ref(db, `games/${gameId}/round/commits`), {
        [mySymbol]: hash,
      })
    }, () => {
      setSettingFeedback(prev => ({ message: 'COULD NOT LOCK IN — TRY AGAIN', id: (prev?.id || 0) + 1 }))
      toast.error('LOCK IN FAILED — CHECK CONNECTION')
    })
  }

  // When both commits land, advance to guessing
  useEffect(() => {
    if (!isSpectator && !matchOver && phase === 'setting' && bothCommitted) {
      update(ref(db, `games/${gameId}/round`), {
        phase: 'guessing',
        startedAt: startedAt || serverNow(),
      }).catch(() => {})
    }
  }, [phase, bothCommitted, isSpectator, matchOver, gameId, startedAt, serverNow])

  // ──── Grading ────
  // Only my client knows my word, so it grades the opponent's guesses. Marks
  // and (when they finish the board) the opponent's done state are written in
  // ONE transaction, so done never lands before the final grade and a
  // 6th-guess solve is never recorded as a fail.
  const oppNeedsGrading = oppGuesses.some(g => g && g.word && !g.marks)
  useEffect(() => {
    if (isSpectator || phase !== 'guessing' || !stored || !myCommit) return
    if (!oppNeedsGrading || gradingRef.current) return
    gradingRef.current = true
    const word = stored.word
    const key = roundKeyRef.current
    const release = (delay) => {
      if (roundKeyRef.current !== key) return
      gradingRef.current = false
      // Re-check afterwards: a guess that landed while this write was in
      // flight would otherwise wait for the next unrelated change.
      setTimeout(() => { if (roundKeyRef.current === key) setGradeRetry(n => n + 1) }, delay)
    }
    runTransaction(ref(db, `games/${gameId}/round`), current => {
      if (!current || current.commits?.[mySymbol] !== myCommit) return
      return applyGrading(current, { guesser: opponentSymbol, word, now: serverNow() }) ?? undefined
    }).then(() => release(0), () => release(1500))
  }, [oppNeedsGrading, stored, myCommit, phase, isSpectator, gameId, mySymbol, opponentSymbol, serverNow, gradeRetry])

  // Fallback for a grader on an older client (marks without done): record my
  // own done from graded marks only — the same value the grader would write.
  const myBoardFinished = !myDone && myGuesses.some(g => g?.marks === 'GGGGG') ||
    (!myDone && myGuesses.length >= MAX_GUESSES && myGuesses.slice(0, MAX_GUESSES).every(g => g?.marks))
  useEffect(() => {
    if (isSpectator || phase !== 'guessing' || !myBoardFinished || selfDoneRef.current) return
    selfDoneRef.current = true
    const id = setTimeout(() => {
      runTransaction(ref(db, `games/${gameId}/round`), current => {
        if (!current) return
        return applySelfDone(current, { player: mySymbol, now: serverNow() }) ?? undefined
      }).catch(() => { selfDoneRef.current = false })
    }, 2000)
    return () => { clearTimeout(id); selfDoneRef.current = false }
  }, [myBoardFinished, phase, isSpectator, gameId, mySymbol, serverNow])

  // ──── Finish grace: once one board is done, the other has a visible clock.
  // At expiry the finished player's client calls time (auto, with a button as
  // a fallback). It grades any pending guess first, so a last-second solve
  // still counts; otherwise the unfinished board is recorded as a fail.
  const graceEndsAt = phase === 'guessing' ? getFinishGraceEndsAt(round) : null
  const graceExpired = !!graceEndsAt && now >= graceEndsAt
  const canCallTime = !isSpectator && !matchOver && phase === 'guessing' && !!myDone && !oppDone && graceExpired

  const handleCallTime = useCallback(() => runAction(async () => {
    await runTransaction(ref(db, `games/${gameId}/round`), current => {
      if (!current || current.commits?.[mySymbol] !== myCommit) return
      return applyFinishTimeout(current, { claimer: mySymbol, word: stored?.word, now: serverNow() }) ?? undefined
    })
  }, () => toast.error('CLAIM FAILED — CHECK CONNECTION')), [runAction, gameId, mySymbol, myCommit, stored, serverNow])

  useEffect(() => {
    if (!canCallTime || autoTimeoutRef.current) return
    autoTimeoutRef.current = true
    handleCallTime()
  }, [canCallTime, handleCallTime])

  // Auto-advance to reveal when both done
  useEffect(() => {
    if (isSpectator || matchOver || phase !== 'guessing') return
    if (bothDone && !bothRevealed) {
      const myReveal = stored ? { word: stored.word, salt: stored.salt } : null
      if (!myReveal) {
        // Secret lost (cleared storage / different browser) — the result needs
        // only done states, so resolve straight to reveal instead of stalling
        // with both done but bothRevealed false forever.
        runTransaction(ref(db, `games/${gameId}`), current => {
          const r = current?.round
          if (!current || current.status !== 'playing' || !r || r.phase !== 'guessing' || r.result) return
          if (!(r.doneX && r.doneO)) return
          const winner = compareResults(r.doneX, r.doneO)
          if (!winner) return
          const next = { ...current, round: { ...r, phase: 'reveal', result: { winner, reason: 'solved' } }, lastActivityAt: serverNow() }
          if (winner !== 'draw') {
            const scores = { ...(current.scores || { X: 0, O: 0 }) }
            scores[winner] = (scores[winner] || 0) + 1
            next.scores = scores
            if (scores[winner] >= MATCH_TARGET) {
              next.status = 'finished'
              next.winner = winner
            }
          }
          return next
        }).catch(() => {})
        return
      }
      update(ref(db, `games/${gameId}/round`), {
        phase: 'reveal',
        ['reveal/' + mySymbol]: myReveal,
      }).catch(() => {})
    }
  }, [bothDone, bothRevealed, phase, isSpectator, matchOver, gameId, mySymbol, stored, serverNow])

  // Write the round result (+ bump the winner's score, ending the match at
  // the registry's matchTarget) via a transaction guarded on `round.result` so
  // two clients racing to resolve the same round can't double-score.
  const writeRoundResult = useCallback(async (winner, reason, forRound) => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || !current.round || current.round.result || current.status !== 'playing') return
        // A verification that finishes after the room moved on must not
        // write into the next round.
        if (current.round.phase !== 'reveal' || (Number(current.round.roundNum) || 1) !== forRound) return
        const next = { ...current, round: { ...current.round, result: { winner, reason } } }
        if (winner === 'X' || winner === 'O') {
          const newScores = { ...(current.scores || { X: 0, O: 0 }) }
          newScores[winner] = (newScores[winner] || 0) + 1
          next.scores = newScores
          if (newScores[winner] >= MATCH_TARGET) {
            next.status = 'finished'
            next.winner = winner
          }
        }
        return next
      })
    } catch { /* the other client resolves the same round */ }
  }, [gameId])

  // ──── Reveal Phase: verify ────
  // My guesses were graded by the opponent with THEIR word, and theirs by me
  // with MY word — so their reveal is checked against my board, and my word
  // against theirs. The round is decided from the verified boards, not the
  // recorded done states.
  useEffect(() => {
    if (phase !== 'reveal' || !reveal || verifiedRef.current || matchOver) return
    const oppReveal = reveal[opponentSymbol]
    if (!oppReveal || !oppCommit) return

    verifiedRef.current = true
    const key = roundKeyRef.current
    ;(async () => {
      const oppCheck = await verifyOpponentRound({ oppCommit, oppReveal, myGuesses, myDone })
      if (oppCheck.pending) { verifiedRef.current = false; return }

      const myWord = stored
      let ownCheck = { ok: true }
      let myCommitOk = true
      if (myWord && commits[mySymbol]) {
        myCommitOk = await verifyReveal(commits[mySymbol], myWord.word, myWord.salt)
        if (myCommitOk) ownCheck = verifyGradedBoard({ word: myWord.word, guesses: oppGuesses, done: oppDone })
      }
      if (ownCheck.pending) { verifiedRef.current = false; return }
      if (roundKeyRef.current !== key) return

      if (!oppCheck.ok || !ownCheck.ok || !myCommitOk) {
        setCheatDetected(true)
        const reason = !oppCheck.ok ? oppCheck.reason : !myCommitOk ? 'own_commit_mismatch' : ownCheck.reason
        setVerifyStatus({ ok: false, reason })
        // My own word failing its commitment is on me; anything else means the
        // opponent's grading or board was tampered with.
        const winner = myCommitOk ? mySymbol : opponentSymbol
        await writeRoundResult(winner, 'cheat', roundNum)
        return
      }

      setVerifyStatus({ ok: true })
      const myVerified = oppCheck.done
      const oppVerified = ownCheck.done || oppDone
      // Seat-positional: (X, O).
      const winner = mySymbol === 'X'
        ? decideDuelRound(myVerified, oppVerified)
        : decideDuelRound(oppVerified, myVerified)
      setLocalResult(winner ? { winner, reason: 'solved' } : null)
      if (!result) {
        await writeRoundResult(winner || 'draw', 'solved', roundNum)
      }
    })()
  }, [phase, reveal, oppCommit, oppGuesses, myGuesses, mySymbol, opponentSymbol, myDone, oppDone, commits, result, writeRoundResult, roundNum, stored, matchOver])

  // Round-result sound, once per round, from the written result. The match-
  // deciding round flips status to 'finished' and Game.jsx plays the match
  // fanfare — don't double it here.
  const resultSig = result ? `${roundNum}:${result.winner}:${result.reason}` : ''
  const playedResultRef = useRef(resultSig)
  useEffect(() => {
    if (!resultSig || playedResultRef.current === resultSig) return
    playedResultRef.current = resultSig
    if (isSpectator || matchOver) return
    const w = result.winner
    sounds[w === 'draw' ? 'draw' : w === mySymbol ? 'win' : 'lose']?.()
  }, [resultSig, result, isSpectator, matchOver, mySymbol])

  // ──── Handle keypress ────
  const boardFull = myGuesses.length >= MAX_GUESSES || myGuesses.some(g => g?.marks === 'GGGGG')
  const submitGuess = useCallback((word) => runGuess(async () => {
    const res = await runTransaction(ref(db, `games/${gameId}/round`), current => {
      if (!current) return
      return applyDuelGuess(current, { player: mySymbol, word, at: serverNow() }) ?? undefined
    })
    if (res.committed) {
      sounds.move?.(mySymbol)
      setCurrentGuess('')
    }
  }, () => toast.error('GUESS FAILED — CHECK CONNECTION')), [runGuess, gameId, mySymbol, serverNow])

  const handleKey = useCallback((key) => {
    if (matchOver || myDone || phase !== 'guessing' || isSpectator || guessBusy) return
    // Six guesses (or a solve) end the board — never write a 7th.
    if (boardFull) return

    if (key === 'ENTER') {
      const word = currentGuess.toUpperCase()
      const problem = guessProblem(word)
      if (problem) {
        sounds.miss?.()
        setGuessFeedback(prev => ({ message: problem, id: (prev?.id || 0) + 1 }))
        return
      }
      setGuessFeedback(null)
      submitGuess(word)
    } else if (key === 'BACK') {
      setCurrentGuess(prev => prev.slice(0, -1))
      setGuessFeedback(null)
    } else if (currentGuess.length < WORD_LENGTH) {
      setCurrentGuess(prev => prev + key.toUpperCase())
      setGuessFeedback(null)
    }
  }, [currentGuess, matchOver, myDone, phase, isSpectator, guessBusy, boardFull, submitGuess])

  const handleSettingKey = (key) => {
    if (matchOver || phase !== 'setting' || !!myCommit || locking) return
    if (key === 'ENTER') {
      handleSetWord()
    } else if (key === 'BACK') {
      setSettingWord(prev => prev.slice(0, -1))
      setSettingFeedback(null)
    } else if (settingWord.length < WORD_LENGTH && /^[A-Z]$/.test(key)) {
      setSettingWord(prev => prev + key)
      setSettingFeedback(null)
    }
  }

  // Either player may start the next round; the transaction lets exactly one
  // click through and bumps roundNum, which resets both clients.
  const handleNextRound = () => runAction(async () => {
    await runTransaction(ref(db, `games/${gameId}`), current => {
      const r = current?.round
      if (!current || current.status !== 'playing' || !r || r.phase !== 'reveal' || !r.result) return
      return { ...current, round: nextDuelRound(r), lastActivityAt: serverNow() }
    })
  }, () => toast.error('NEXT ROUND FAILED — CHECK CONNECTION'))
  const handleNewMatch = () => runAction(async () => {
    await onNewMatch?.()
  }, () => toast.error('NEW MATCH FAILED — CHECK CONNECTION'))

  // ── RENDER ──
  if (!game || !gameId) return null

  // Match over — also when the platform's CLAIM WIN ended it mid-round.
  if (matchOver) {
    return (
      <GameStatus
        status={game.status}
        winner={game.winner}
        mySymbol={mySymbol}
        scores={game.scores}
        players={game.players}
        gameType={game.gameType}
        onNewMatch={!proposal ? onNewMatch : null}
        onSwitchGame={!proposal ? onSwitchGame : null}
      />
    )
  }

  const presence = isSpectator
    ? { X: game.presence?.X?.online, O: game.presence?.O?.online }
    : { [mySymbol]: true, [opponentSymbol]: opponentOnline !== false }
  const rail = (
    <div className="w-full">
      <MatchScoreRail
        game={game}
        mySymbol={mySymbol}
        isSpectator={isSpectator}
        matchTarget={MATCH_TARGET}
        title="WORD DUEL"
        roundLabel={`ROUND ${roundNum}`}
        presence={presence}
      />
    </div>
  )

  if (isSpectator) {
    const revealed = phase === 'reveal'
    return (
      <div className="flex flex-col items-center gap-4 py-4 max-w-md mx-auto">
        {rail}
        <p className="font-pixel text-[9px] text-retro-dim tracking-widest">
          {phase === 'setting' ? 'PLAYERS ARE PICKING WORDS…' : revealed ? 'ROUND OVER' : 'SPECTATING · LETTERS HIDDEN UNTIL REVEAL'}
        </p>
        {phase !== 'setting' && (
          <div className="flex gap-6 mt-2">
            {['X', 'O'].map(sym => (
              <div key={sym}>
                <p className="text-xs text-retro-dim mb-2 text-center uppercase tracking-wider">
                  {game.players?.[sym]?.name || sym}
                </p>
                <GameBoard
                  guesses={normalizeGuesses(round[`guesses${sym}`])}
                  ghostMode={!revealed}
                  label={`${sym} board`}
                />
              </div>
            ))}
          </div>
        )}
        {revealed && (reveal.X || reveal.O) && (
          <div className="text-sm text-retro-cta mt-2">
            X: {reveal.X?.word || '?????'} &nbsp;|&nbsp; O: {reveal.O?.word || '?????'}
          </div>
        )}
      </div>
    )
  }

  // Setting phase
  if (phase === 'setting') {
    const copy = bothCommitted ? ' Both players are ready!'
      : myCommit ? ' Waiting for your opponent to pick theirs…'
      : oppCommit ? ' Your opponent has locked in a word.'
      : ' Enter your word below.'
    return (
      <div className="flex flex-col items-center gap-5 py-4 max-w-md mx-auto">
        {rail}
        <div className="text-center">
          <h2 className="text-lg font-bold text-retro-text mb-1">PICK A WORD</h2>
          <p className="text-xs text-retro-dim">
            Choose a 5-letter word for your opponent to crack.{copy}
          </p>
        </div>

        {settingEndsAt && !bothCommitted && (
          <RoundTimer
            className="w-full"
            endsAt={settingEndsAt}
            now={now}
            totalMs={SETTING_DEADLINE_MS}
            label={myCommit ? 'OPPONENT HAS' : 'LOCK IN WITHIN'}
          />
        )}

        {!myCommit ? (
          <>
            <WordInput value={settingWord} />
            <WordFeedback message={settingFeedback?.message} tone="bad" id={settingFeedback?.id} />
            <button
              className={cn(
                'px-6 py-2 rounded font-bold text-sm uppercase cursor-pointer',
                'bg-retro-cta text-retro-bg shadow-neon-cta hover:opacity-90 transition-opacity',
                'disabled:opacity-50 disabled:cursor-default',
              )}
              onClick={handleSetWord}
              disabled={locking || settingWord.length !== WORD_LENGTH}
            >
              {locking ? 'LOCKING…' : 'LOCK IN'}
            </button>
            <div className="w-full">
              <WordKeyboard keyState={{}} onKey={handleSettingKey} disabled={locking} enterLabel="Lock in word" />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {!opponentOnline && <OfflineNotice label="OPPONENT" />}
            <div className="flex justify-center">
              <PixelDots tone="cta" size="lg" />
            </div>
            <p className="text-xs text-retro-dim mt-1">
              {oppCommit ? 'STARTING…' : 'WAITING FOR OPPONENT…'}
            </p>
            {settingStalled && (
              <ClaimBox
                message="OPPONENT NEVER LOCKED A WORD"
                onClick={handleClaimSettingStall}
                busy={actionBusy}
              />
            )}
          </div>
        )}
      </div>
    )
  }

  // Guessing phase
  if (phase === 'guessing') {
    const iSolved = myDone?.solved
    return (
      <div className="flex flex-col items-center gap-2 py-2 max-w-md mx-auto">
        {rail}

        {myDone && !oppDone && (
          <div className="w-full space-y-1 text-center">
            <p className="text-xs text-retro-cta" aria-live="polite">
              {iSolved ? `SOLVED IN ${myDone.guesses} — ` : 'OUT OF GUESSES — '}WAITING FOR OPPONENT
            </p>
            {graceEndsAt && (
              <RoundTimer endsAt={graceEndsAt} now={now} totalMs={DUEL_FINISH_GRACE_MS} label="OPPONENT HAS" />
            )}
          </div>
        )}
        {!myDone && oppDone && (
          <div className="w-full space-y-1 text-center">
            <p className="text-xs text-retro-p2" aria-live="polite">
              {oppDone.solved ? `OPPONENT SOLVED IN ${oppDone.guesses} — ` : 'OPPONENT IS OUT — '}FINISH BEFORE TIME RUNS OUT
            </p>
            {graceEndsAt && (
              <RoundTimer endsAt={graceEndsAt} now={now} totalMs={DUEL_FINISH_GRACE_MS} label="TIME LEFT" />
            )}
          </div>
        )}

        {/* My guesses board */}
        <div className="flex items-start gap-4">
          <div>
            <p className="text-xs text-retro-dim mb-1 text-center uppercase tracking-wider">YOUR GUESSES</p>
            <GameBoard
              guesses={[
                ...myGuesses,
                ...(currentGuess && !boardFull ? [{ word: currentGuess.padEnd(WORD_LENGTH, ' ') }] : []),
              ]}
              ghostMode={false}
              label="Your board"
            />
          </div>
          {/* Opponent ghost: marks only — the letters stay hidden */}
          <div>
            <p className="text-xs text-retro-dim mb-1 text-center uppercase tracking-wider">OPPONENT</p>
            <GameBoard guesses={oppGuesses} ghostMode label="Opponent board" />
          </div>
        </div>

        <WordFeedback message={guessFeedback?.message} tone="bad" id={guessFeedback?.id} />

        {/* Keyboard */}
        <div className="w-full">
          <WordKeyboard keyState={keyboardState} onKey={handleKey} disabled={!!myDone || boardFull || guessBusy} />
        </div>

        {!opponentOnline && !myDone && <OfflineNotice label="OPPONENT" className="mt-1" />}

        {canCallTime && (
          <ClaimBox
            message="TIME'S UP FOR YOUR OPPONENT"
            onClick={handleCallTime}
            busy={actionBusy}
            label={iSolved ? 'CLAIM ROUND' : 'END ROUND'}
          />
        )}

        {gradeStalled && (
          <ClaimBox
            message="OPPONENT HASN'T GRADED YOUR GUESS"
            onClick={handleClaimGradeStall}
            busy={actionBusy}
          />
        )}
      </div>
    )
  }

  // Reveal / Done phase
  const finalResult = result || localResult
  const finalWinner = finalResult?.winner
  const reason = finalResult?.reason
  const cheat = cheatDetected || reason === 'cheat'
  const explanation = resultExplanation({ result: finalResult, mySymbol, doneMine: myDone, doneOpp: oppDone })
  const myRevealWord = stored || reveal[mySymbol] || null

  const shareHeadline = matchWinner
    ? (matchWinner === mySymbol ? 'MATCH WON!' : `${game.players[matchWinner]?.name || matchWinner} WINS THE MATCH`)
    : cheat ? 'CHEAT DETECTED'
    : finalWinner === mySymbol ? 'YOU WIN!'
    : finalWinner === 'draw' ? "IT'S A DRAW"
    : finalWinner ? `${game.players[finalWinner]?.name || finalWinner} WINS`
    : 'ROUND OVER'
  const shareAccent = matchWinner
    ? (matchWinner === 'X' ? '--c-p1' : '--c-p2')
    : (finalWinner === 'X' ? '--c-p1' : finalWinner === 'O' ? '--c-p2' : '--c-cta')
  const shareScore = () => runShare(async () => {
    const ok = await shareResult({
      gameLabel: getGameConfig('wordduel')?.label || 'WORD DUEL',
      headline: shareHeadline,
      sub: `${allScores.X} – ${allScores.O}`,
      accentVar: shareAccent,
      url: window.location.href,
    })
    if (!ok) toast.error("COULDN'T BUILD SHARE CARD — TRY AGAIN")
  })

  // Each column: one seat's secret word over the board that was guessing it
  // (the OTHER seat's guesses), with how that guesser did.
  const columns = ['X', 'O'].map(owner => {
    const guesser = owner === 'X' ? 'O' : 'X'
    const isMine = owner === mySymbol
    return {
      owner,
      word: (isMine ? myRevealWord?.word : reveal[owner]?.word) || '',
      guesses: guesser === mySymbol ? myGuesses : oppGuesses,
      done: guesser === mySymbol ? myDone : oppDone,
      guesserLabel: guesser === mySymbol ? 'you' : 'opponent',
    }
  })

  return (
    <div className="flex flex-col items-center gap-5 py-4 max-w-md mx-auto">
      {rail}

      {/* Round result */}
      <div className="text-center" aria-live="polite">
        <h2 className={cn(
          'text-xl font-bold',
          cheat ? 'text-retro-cta' :
          finalWinner === mySymbol ? 'text-retro-win' :
          finalWinner === 'draw' ? 'text-retro-text' :
          'text-retro-dim',
        )}>
          {cheat ? 'CHEAT DETECTED' :
           finalWinner === mySymbol ? 'YOU WIN!' :
           finalWinner === 'draw' ? "IT'S A DRAW" :
           finalWinner ? 'YOU LOST' : 'CHECKING…'}
        </h2>
        {explanation && <p className="text-xs text-retro-dim mt-1 max-w-xs">{explanation}</p>}
      </div>

      <div className="flex gap-4">
        {columns.map(col => (
          <div key={col.owner} className="flex flex-col items-center gap-2">
            <p className="text-xs text-retro-dim uppercase tracking-wider">{game.players?.[col.owner]?.name || col.owner}&apos;S WORD</p>
            <div className="flex gap-1 justify-center" aria-label={`Word: ${col.word || 'hidden'}`}>
              {Array.from({ length: WORD_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  className="w-8 h-8 flex items-center justify-center rounded text-lg font-bold uppercase border border-retro-border bg-retro-card text-retro-text"
                >
                  {col.word[i] || '?'}
                </div>
              ))}
            </div>
            <p className="text-xs text-retro-dim">
              {col.guesserLabel}: {col.done?.solved ? `${col.done.guesses}/${MAX_GUESSES}` : col.done?.timedOut ? 'out of time' : col.done ? 'failed' : '—'}
            </p>
            <GameBoard guesses={col.guesses} ghostMode={false} label={`${col.guesserLabel} guessing ${col.owner}'s word`} />
          </div>
        ))}
      </div>

      {/* Verification */}
      {verifyStatus && (
        <p className={cn('text-xs', verifyStatus.ok ? 'text-retro-win' : 'text-retro-cta')}>
          {verifyStatus.ok ? '✓ Both words verified' : `Verification issue: ${verifyStatus.reason}`}
        </p>
      )}

      {/* Buttons */}
      <div className="flex flex-wrap gap-3 mt-2 justify-center">
        <ShareButton onClick={shareScore} busy={sharing} />
        {!matchWinner && !proposal && (
          <button
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs
              rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
            onClick={handleNextRound}
            disabled={actionBusy || !result}
          >
            {actionBusy ? 'STARTING…' : 'NEXT ROUND'}
          </button>
        )}
        {onNewMatch && !proposal && (
          <button
            className={cn(
              'px-6 py-2.5 font-pixel text-xs rounded transition-all active:scale-95 disabled:opacity-50',
              matchWinner
                ? 'bg-retro-cta text-retro-bg hover:shadow-neon-cta'
                : 'border-2 border-retro-border text-retro-text hover:border-retro-p1/50 hover:text-retro-p1',
            )}
            onClick={handleNewMatch}
            disabled={actionBusy}
          >
            {actionBusy ? 'ASKING…' : 'NEW MATCH'}
          </button>
        )}
      </div>

      {!matchWinner && !proposal && onSwitchGame && (
        <div className="mt-2">
          <GameSwitcher currentType="wordduel" onSwitch={onSwitchGame} />
        </div>
      )}
    </div>
  )
}
