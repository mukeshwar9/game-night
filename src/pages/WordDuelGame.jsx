import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { ref, update, onValue, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { commit as makeCommit } from '../lib/commit'
import {
  compareResults, isValidGuess, getKeyboardState, MAX_GUESSES, WORD_LENGTH, MATCH_WINS,
  verifyOpponentRound, verifyGradedBoard, decideDuelRound,
  applyGrading, applyDuelGuess, applySelfDone, nextDuelRound, normalizeGuessList,
} from '../lib/wordduelLogic'
import { verifyReveal } from '../lib/commit'
import { sounds } from '../lib/sounds'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import { cn } from '@/lib/utils'
import { getGameConfig } from '@/lib/games'
import { shareResult } from '@/lib/shareCard'
import PixelDots from '@/components/loading/PixelDots'
import OfflineNotice from '@/components/loading/OfflineNotice'
import useBusy from '@/hooks/useBusy'
import MarkTile from '@/components/MarkTile'
import WordKeyboard from '@/components/WordKeyboard'
import { toast } from 'sonner'

const STORAGE_PREFIX = 'wordduel-word-'
// A setter who never commits, or an opponent whose tab closed leaving a guess
// ungraded forever, would otherwise stall the round indefinitely — grace
// periods below back a claim/skip escape hatch (pattern: BattleshipGame's
// REVEAL_GRACE_MS / SHOT_GRACE_MS).
const SETTING_DEADLINE_MS = 120000
const GRADE_GRACE_MS = 60000

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
    <div className="flex flex-col items-center gap-2">
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

export default function WordDuelGame({
  gameId, game, mySymbol, opponentOnline, onSwitchGame, onNewMatch, proposal,
}) {
  // ── ALL HOOKS FIRST ──

  const [settingWord, setSettingWord] = useState('')
  const [settingError, setSettingError] = useState('')
  const [lockingWord, setLockingWord] = useState(false)
  const [currentGuess, setCurrentGuess] = useState('')
  const [cheatDetected, setCheatDetected] = useState(false)
  const [verifyStatus, setVerifyStatus] = useState(null)
  const [localResult, setLocalResult] = useState(null)
  const [clockOffset, setClockOffset] = useState(0)
  const [nowTs, setNowTs] = useState(() => Date.now())

  // Per-round client state. The page is not remounted between rounds
  // (Game.jsx keys it on gameType), so everything below is reset whenever the
  // round identity (roundNum, or a return to the setting phase) changes — on
  // BOTH clients, not just the one that pressed NEXT ROUND.
  const verifiedRef = useRef(false)
  const gradingRef = useRef(false)
  const selfDoneRef = useRef(false)
  const roundKeyRef = useRef('')
  const [gradeRetry, setGradeRetry] = useState(0)

  const [sharing, runShare] = useBusy()
  const [guessBusy, runGuess] = useBusy()
  const [actionBusy, runAction] = useBusy()

  // Derived from game
  const round = useMemo(() => game?.round || {}, [game])
  const phase = round.phase || 'setting'
  const roundNum = Number(round.roundNum) || 1
  const roundKey = `${roundNum}:${phase === 'setting' ? 'setting' : 'live'}`
  const opponentSymbol = mySymbol === 'X' ? 'O' : 'X'
  const isSpectator = !mySymbol

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
  const matchWinner = allScores.X >= MATCH_WINS ? 'X' : allScores.O >= MATCH_WINS ? 'O' : null

  const keyboardState = getKeyboardState(myGuesses)

  const [trackedRoundKey, setTrackedRoundKey] = useState(roundKey)
  if (trackedRoundKey !== roundKey) {
    setTrackedRoundKey(roundKey)
    setCheatDetected(false)
    setVerifyStatus(null)
    setLocalResult(null)
    setCurrentGuess('')
    if (phase === 'setting') {
      setSettingWord('')
      setSettingError('')
    }
  }
  useEffect(() => {
    roundKeyRef.current = roundKey
    verifiedRef.current = false
    gradingRef.current = false
    selfDoneRef.current = false
  }, [roundKey])

  // Corrected clock — every deadline comparison below runs through this offset.
  useEffect(() => {
    const offRef = ref(db, '.info/serverTimeOffset')
    const unsub = onValue(offRef, snap => setClockOffset(snap.val() ?? 0))
    return () => unsub()
  }, [])
  const serverNow = nowTs + clockOffset

  // Ticker drives the stall-deadline countdowns while a round is in progress.
  useEffect(() => {
    if (phase !== 'setting' && phase !== 'guessing') return
    const id = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [phase])

  // Setting-phase deadline: anchor the phase start so every client agrees on
  // when the 120s clock began (first client to notice writes it).
  useEffect(() => {
    if (isSpectator || phase !== 'setting' || round.settingStartedAt) return
    update(ref(db, `games/${gameId}/round`), { settingStartedAt: Date.now() + clockOffset }).catch(() => {})
  }, [isSpectator, phase, round.settingStartedAt, gameId, clockOffset])

  const settingStalled = !isSpectator && phase === 'setting' && !!myCommit && !oppCommit &&
    !!round.settingStartedAt && (serverNow - round.settingStartedAt >= SETTING_DEADLINE_MS)

  const handleClaimSettingStall = useCallback(async () => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || !current.round) return
        const r = current.round
        if (r.phase !== 'setting' || r.result) return
        const commits = r.commits || {}
        if (!commits[mySymbol] || commits[opponentSymbol]) return
        if (!r.settingStartedAt || Date.now() + clockOffset - r.settingStartedAt < SETTING_DEADLINE_MS) return
        const newScores = { ...(current.scores || { X: 0, O: 0 }) }
        newScores[mySymbol] = (newScores[mySymbol] || 0) + 1
        const matchOver = newScores[mySymbol] >= MATCH_WINS
        return {
          ...current,
          scores: newScores,
          status: matchOver ? 'finished' : current.status,
          winner: matchOver ? mySymbol : current.winner,
          round: { phase: 'reveal', roundNum: r.roundNum || 1, result: { winner: mySymbol, reason: 'stall' } },
        }
      })
    } catch { toast.error('CLAIM FAILED — CHECK CONNECTION') }
  }, [gameId, mySymbol, opponentSymbol, clockOffset])

  // Grading stall: my own guesses can only be graded by the opponent's client
  // (it alone holds their secret word). If their tab closed, the guess sits
  // ungraded forever — let me claim the round after a grace period instead.
  const myPendingGuess = myGuesses.find(g => g && g.word && !g.marks)
  const gradeStalled = !isSpectator && phase === 'guessing' && !myDone &&
    !!myPendingGuess?.at && (serverNow - myPendingGuess.at >= GRADE_GRACE_MS)

  const handleClaimGradeStall = useCallback(async () => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || !current.round) return
        const r = current.round
        if (r.phase !== 'guessing' || r.result) return
        const mine = normalizeGuesses(r[`guesses${mySymbol}`])
        const pending = mine.find(g => g && g.word && !g.marks)
        if (!pending || !pending.at || Date.now() + clockOffset - pending.at < GRADE_GRACE_MS) return
        const newScores = { ...(current.scores || { X: 0, O: 0 }) }
        newScores[mySymbol] = (newScores[mySymbol] || 0) + 1
        const matchOver = newScores[mySymbol] >= MATCH_WINS
        return {
          ...current,
          scores: newScores,
          status: matchOver ? 'finished' : current.status,
          winner: matchOver ? mySymbol : current.winner,
          round: { ...r, phase: 'reveal', result: { winner: mySymbol, reason: 'stall' } },
        }
      })
    } catch { toast.error('CLAIM FAILED — CHECK CONNECTION') }
  }, [gameId, mySymbol, clockOffset])

  // ── Setting Phase: commit word ──
  const handleSetWord = useCallback(async () => {
    const word = settingWord.toUpperCase()
    if (word.length !== WORD_LENGTH) {
      setSettingError('Word must be 5 letters')
      return
    }
    if (!isValidGuess(word)) {
      setSettingError('Not in word list')
      return
    }
    setSettingError('')
    setLockingWord(true)
    try {
      const { hash, salt } = await makeCommit(word)
      setStoredWord(gameId, mySymbol, { word, salt, hash })
      await update(ref(db, `games/${gameId}/round/commits`), {
        [mySymbol]: hash,
      })
    } catch { setSettingError('Failed to lock in. Try again.') }
    setLockingWord(false)
  }, [settingWord, gameId, mySymbol])

  // When both commits land, advance to guessing
  useEffect(() => {
    if (!isSpectator && phase === 'setting' && bothCommitted) {
      update(ref(db, `games/${gameId}/round`), {
        phase: 'guessing',
        startedAt: startedAt || Date.now() + clockOffset,
      }).catch(() => {})
    }
  }, [phase, bothCommitted, isSpectator, gameId, startedAt, clockOffset])

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
      return applyGrading(current, { guesser: opponentSymbol, word, now: Date.now() + clockOffset }) ?? undefined
    }).then(() => release(0), () => release(1500))
  }, [oppNeedsGrading, stored, myCommit, phase, isSpectator, gameId, mySymbol, opponentSymbol, clockOffset, gradeRetry])

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
        return applySelfDone(current, { player: mySymbol, now: Date.now() + clockOffset }) ?? undefined
      }).catch(() => { selfDoneRef.current = false })
    }, 2000)
    return () => { clearTimeout(id); selfDoneRef.current = false }
  }, [myBoardFinished, phase, isSpectator, gameId, mySymbol, clockOffset])

  // Auto-advance to reveal when both done
  useEffect(() => {
    if (isSpectator || phase !== 'guessing') return
    if (bothDone && !bothRevealed) {
      const myReveal = stored ? { word: stored.word, salt: stored.salt } : null
      if (!myReveal) {
        // Secret lost (cleared storage / different browser) — the result needs
        // only done states, so resolve straight to reveal instead of stalling
        // with both done but bothRevealed false forever.
        runTransaction(ref(db, `games/${gameId}`), current => {
          const r = current?.round
          if (!current || !r || r.phase !== 'guessing' || r.result) return
          if (!(r.doneX && r.doneO)) return
          const winner = compareResults(r.doneX, r.doneO)
          if (!winner) return
          const next = { ...current, round: { ...r, phase: 'reveal', result: { winner, reason: 'solved' } }, lastActivityAt: Date.now() }
          if (winner !== 'draw') {
            const scores = { ...(current.scores || { X: 0, O: 0 }) }
            scores[winner] += 1
            next.scores = scores
            if (scores[winner] >= MATCH_WINS) {
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
  }, [bothDone, bothRevealed, phase, isSpectator, gameId, mySymbol, stored])

  // Write the round result (+ bump the winner's score, ending the match at
  // MATCH_WINS) via a transaction guarded on `round.result` so two clients
  // racing to resolve the same round can't double-score.
  const writeRoundResult = useCallback(async (winner, reason, forRound) => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || !current.round || current.round.result) return
        // A verification that finishes after the room moved on must not
        // write into the next round.
        if (current.round.phase !== 'reveal' || (Number(current.round.roundNum) || 1) !== forRound) return
        const next = { ...current, round: { ...current.round, result: { winner, reason } } }
        if (winner === 'X' || winner === 'O') {
          const newScores = { ...(current.scores || { X: 0, O: 0 }) }
          newScores[winner] = (newScores[winner] || 0) + 1
          next.scores = newScores
          if (newScores[winner] >= MATCH_WINS) {
            next.status = 'finished'
            next.winner = winner
          }
        }
        return next
      })
    } catch { /* another client will retry / resolve */ }
  }, [gameId])

  // ──── Reveal Phase: verify ────
  // My guesses were graded by the opponent with THEIR word, and theirs by me
  // with MY word — so their reveal is checked against my board, and my word
  // against theirs. The round is decided from the verified boards, not the
  // recorded done states.
  useEffect(() => {
    if (phase !== 'reveal' || !reveal || verifiedRef.current) return
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
        if (roundKeyRef.current !== key) return
        await writeRoundResult(winner, 'cheat', roundNum)
        return
      }

      if (roundKeyRef.current !== key) return
      setVerifyStatus({ ok: true })
      const myVerified = oppCheck.done
      const oppVerified = ownCheck.done || oppDone
      // Seat-positional: (X, O).
      const winner = mySymbol === 'X'
        ? decideDuelRound(myVerified, oppVerified)
        : decideDuelRound(oppVerified, myVerified)
      setLocalResult(winner ? { winner, reason: 'solved' } : null)
      if (winner) {
        sounds[winner === 'draw' ? 'draw' : winner === mySymbol ? 'win' : 'lose']?.()
      }
      if (!result) {
        await writeRoundResult(winner || 'draw', 'solved', roundNum)
      }
    })()
  }, [phase, reveal, oppCommit, oppGuesses, myGuesses, mySymbol, opponentSymbol, myDone, oppDone, commits, result, writeRoundResult, roundNum, stored])

  // ──── Handle keypress ────
  const boardFull = myGuesses.length >= MAX_GUESSES || myGuesses.some(g => g?.marks === 'GGGGG')
  const submitGuess = useCallback((word) => runGuess(async () => {
    const res = await runTransaction(ref(db, `games/${gameId}/round`), current => {
      if (!current) return
      return applyDuelGuess(current, { player: mySymbol, word, at: Date.now() + clockOffset }) ?? undefined
    })
    if (res.committed) {
      sounds.move?.(mySymbol)
      setCurrentGuess('')
    }
  }, () => toast.error('GUESS FAILED — CHECK CONNECTION')), [runGuess, gameId, mySymbol, clockOffset])

  const handleKey = useCallback((key) => {
    if (myDone || phase !== 'guessing' || isSpectator || guessBusy) return
    // Six guesses (or a solve) end the board — never write a 7th.
    if (boardFull) return

    if (key === 'ENTER') {
      const word = currentGuess.toUpperCase()
      if (word.length !== WORD_LENGTH) return
      if (!isValidGuess(word)) {
        sounds.miss?.()
        return
      }
      submitGuess(word)
    } else if (key === 'BACK') {
      setCurrentGuess(prev => prev.slice(0, -1))
    } else if (currentGuess.length < WORD_LENGTH) {
      setCurrentGuess(prev => prev + key.toUpperCase())
    }
  }, [currentGuess, myDone, phase, isSpectator, guessBusy, boardFull, submitGuess])

  const handleSettingKey = useCallback((key) => {
    if (phase !== 'setting' || !!myCommit) return
    if (key === 'ENTER') {
      handleSetWord()
    } else if (key === 'BACK') {
      setSettingWord(prev => prev.slice(0, -1))
    } else if (settingWord.length < WORD_LENGTH && /^[A-Z]$/.test(key)) {
      setSettingWord(prev => prev + key)
    }
  }, [settingWord, phase, myCommit, handleSetWord])

  // Either player may start the next round; the transaction lets exactly one
  // click through and bumps roundNum, which resets both clients.
  const handleNextRound = () => runAction(async () => {
    await runTransaction(ref(db, `games/${gameId}`), current => {
      const r = current?.round
      if (!current || current.status !== 'playing' || !r || r.phase !== 'reveal' || !r.result) return
      return { ...current, round: nextDuelRound(r), lastActivityAt: Date.now() + clockOffset }
    })
  }, () => toast.error('NEXT ROUND FAILED — CHECK CONNECTION'))
  const handleNewMatch = () => runAction(async () => {
    await onNewMatch?.()
  }, () => toast.error('NEW MATCH FAILED — CHECK CONNECTION'))

  // ── RENDER ──
  if (!game || !gameId) return null

  if (game.status === 'finished') {
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

  if (isSpectator) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <h2 className="text-lg font-bold text-retro-text">SPECTATING</h2>
        <p className="text-sm text-retro-dim">Watching the duel…</p>
        {phase === 'guessing' && (
          <div className="flex gap-8 mt-2">
            <div>
              <p className="text-xs text-retro-dim mb-2 text-center uppercase tracking-wider">X GUESSES</p>
              <GameBoard guesses={normalizeGuesses(round.guessesX)} ghostMode={false} />
            </div>
            <div>
              <p className="text-xs text-retro-dim mb-2 text-center uppercase tracking-wider">O GUESSES</p>
              <GameBoard guesses={normalizeGuesses(round.guessesO)} ghostMode={false} />
            </div>
          </div>
        )}
        {reveal.X && reveal.O && (
          <div className="text-sm text-retro-cta mt-4">
            X: {reveal.X.word} &nbsp;|&nbsp; O: {reveal.O.word}
          </div>
        )}
      </div>
    )
  }

  // Setting phase
  if (phase === 'setting') {
    return (
      <div className="flex flex-col items-center gap-6 py-8 max-w-md mx-auto">
        <div className="text-center">
          <h2 className="text-lg font-bold text-retro-text mb-1">PICK A WORD</h2>
          <p className="text-xs text-retro-dim">
            Choose a 5-letter word for your opponent to crack.
            {oppCommit ? ' Both players are ready!' : myCommit ? ' Waiting for opponent…' : ' Enter your word below.'}
          </p>
        </div>

        {!myCommit ? (
          <>
            <WordInput value={settingWord} />
            {settingError && <p className="text-xs text-retro-cta">{settingError}</p>}
            <button
              className={cn(
                'px-6 py-2 rounded font-bold text-sm uppercase cursor-pointer',
                'bg-retro-cta text-retro-bg shadow-neon-cta hover:opacity-90 transition-opacity',
                'disabled:opacity-50 disabled:cursor-default',
              )}
              onClick={handleSetWord}
              disabled={lockingWord || settingWord.length !== WORD_LENGTH}
            >
              {lockingWord ? 'LOCKING…' : 'LOCK IN'}
            </button>
            <div className="w-full">
              <WordKeyboard keyState={{}} onKey={handleSettingKey} disabled={lockingWord} enterLabel="Lock in word" />
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
              <div className="text-center space-y-2 border border-retro-p2/30 rounded p-3 mt-2">
                <p className="text-xs text-retro-dim">
                  OPPONENT NEVER LOCKED A WORD
                </p>
                <button
                  onClick={handleClaimSettingStall}
                  className="min-h-11 px-6 py-2.5 border-2 border-retro-p2 text-retro-p2 font-bold text-xs uppercase rounded hover:shadow-neon-p2 transition-all active:scale-95"
                >
                  CLAIM ROUND
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Guessing phase
  if (phase === 'guessing') {
    return (
      <div className="flex flex-col items-center gap-2 py-2 max-w-md mx-auto">
        {/* Header: scores */}
        <div className="flex items-center gap-4 text-xs text-retro-dim">
          <span className={cn(mySymbol === 'X' ? 'text-retro-p1' : '')}>
            {game.players.X?.name || 'X'}: {allScores.X}
          </span>
          <span className="text-retro-border">vs</span>
          <span className={cn(mySymbol === 'O' ? 'text-retro-p2' : '')}>
            {game.players.O?.name || 'O'}: {allScores.O}
          </span>
        </div>

        {myDone && (
          <p className="text-xs text-retro-cta arcade-blink">
            WAITING FOR OPPONENT TO FINISH…
          </p>
        )}

        {/* My guesses board */}
        <div className="flex items-start gap-4">
          <div>
            <p className="text-xs text-retro-dim mb-1 text-center uppercase tracking-wider">YOUR GUESSES</p>
            <GameBoard
              guesses={[
                ...myGuesses,
                ...(currentGuess ? [{ word: currentGuess.padEnd(WORD_LENGTH, ' ') }] : []),
              ]}
              ghostMode={false}
            />
          </div>
          {/* Opponent ghost */}
          <div>
            <p className="text-xs text-retro-dim mb-1 text-center uppercase tracking-wider">OPPONENT</p>
            <GameBoard guesses={oppGuesses} ghostMode label="Opponent board" />
          </div>
        </div>

        {/* Keyboard */}
        <div className="mt-1 w-full">
          <WordKeyboard keyState={keyboardState} onKey={handleKey} disabled={!!myDone || boardFull || guessBusy} />
        </div>

        {/* Current input preview */}
        <div className="flex gap-1">
          {Array.from({ length: WORD_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'w-7 h-7 flex items-center justify-center rounded text-sm font-bold uppercase border',
                'border-retro-border bg-retro-card text-retro-dim',
              )}
            >
              {currentGuess[i] || ''}
            </div>
          ))}
        </div>

        {!opponentOnline && !myDone && <OfflineNotice label="OPPONENT" className="mt-1" />}

        {gradeStalled && (
          <div className="text-center space-y-2 border border-retro-p2/30 rounded p-3 mt-1">
            <p className="text-xs text-retro-dim">
              OPPONENT HASN&apos;T GRADED YOUR GUESS
            </p>
            <button
              onClick={handleClaimGradeStall}
              className="min-h-11 px-6 py-2.5 border-2 border-retro-p2 text-retro-p2 font-bold text-xs uppercase rounded hover:shadow-neon-p2 transition-all active:scale-95"
            >
              CLAIM ROUND
            </button>
          </div>
        )}
      </div>
    )
  }

  // Reveal / Done phase
  const finalResult = result || localResult
  const finalWinner = finalResult?.winner
  const reason = finalResult?.reason
  const myRevealWord = stored

  const shareHeadline = matchWinner
    ? (matchWinner === mySymbol ? 'MATCH WON!' : `${game.players[matchWinner]?.name || matchWinner} WINS THE MATCH`)
    : cheatDetected ? 'CHEAT DETECTED'
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

  return (
    <div className="flex flex-col items-center gap-6 py-6 max-w-md mx-auto">
      {/* Scores */}
      <div className="flex items-center gap-4 text-sm">
        <span className={cn('font-bold', mySymbol === 'X' ? 'text-retro-p1' : '')}>
          {game.players.X?.name || 'X'}: {allScores.X}
        </span>
        <span className="text-retro-border">vs</span>
        <span className={cn('font-bold', mySymbol === 'O' ? 'text-retro-p2' : '')}>
          {game.players.O?.name || 'O'}: {allScores.O}
        </span>
      </div>

      {/* Match over? */}
      {matchWinner && (
        <div className="text-center">
          <h2 className={cn(
            'text-2xl font-bold mb-1',
            matchWinner === mySymbol ? 'text-retro-win text-glow-cta' : 'text-retro-dim',
          )}>
            {matchWinner === mySymbol ? 'MATCH WON!' : 'MATCH OVER'}
          </h2>
          <p className="text-xs text-retro-dim">
            {matchWinner === mySymbol ? 'You win the match!' : `${game.players[matchWinner]?.name || matchWinner} wins the match!`}
          </p>
        </div>
      )}

      {/* Round result */}
      {!matchWinner && (
        <div className="text-center">
          <h2 className={cn(
            'text-xl font-bold',
            cheatDetected ? 'text-retro-cta' :
            finalWinner === mySymbol ? 'text-retro-win' :
            finalWinner === 'draw' ? 'text-retro-text' :
            'text-retro-dim',
          )}>
            {cheatDetected ? 'CHEAT DETECTED' :
             finalWinner === mySymbol ? 'YOU WIN!' :
             finalWinner === 'draw' ? "IT'S A DRAW" :
             finalWinner ? 'YOU LOST' : 'ROUND OVER'}
          </h2>
          {reason === 'cheat' && (
            <p className="text-xs text-retro-cta mt-1">Opponent&apos;s word was tampered with — you win by forfeit.</p>
          )}
        </div>
      )}

      {/* Two revealed words side by side */}
      <div className="flex gap-4">
        <div className="text-center">
          <p className="text-xs text-retro-dim mb-1 uppercase tracking-wider">{game.players.X?.name || 'X'}&apos;S WORD</p>
          <div className="flex gap-1">
            {Array.from({ length: WORD_LENGTH }).map((_, i) => (
              <div
                key={i}
                className="w-8 h-8 flex items-center justify-center rounded text-lg font-bold uppercase border border-retro-border bg-retro-card text-retro-text"
              >
                {(mySymbol === 'X' ? myRevealWord?.word?.[i] : reveal.X?.word?.[i]) || '?'}
              </div>
            ))}
          </div>
          <p className="text-xs text-retro-dim mt-1">
            {mySymbol === 'X' ? (myDone?.solved ? `${myDone.guesses}/6` : 'failed') : (oppDone?.solved ? `${oppDone.guesses}/6` : 'failed')}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-retro-dim mb-1 uppercase tracking-wider">{game.players.O?.name || 'O'}&apos;S WORD</p>
          <div className="flex gap-1">
            {Array.from({ length: WORD_LENGTH }).map((_, i) => (
              <div
                key={i}
                className="w-8 h-8 flex items-center justify-center rounded text-lg font-bold uppercase border border-retro-border bg-retro-card text-retro-text"
              >
                {(mySymbol === 'O' ? myRevealWord?.word?.[i] : reveal.O?.word?.[i]) || '?'}
              </div>
            ))}
          </div>
          <p className="text-xs text-retro-dim mt-1">
            {mySymbol === 'O' ? (myDone?.solved ? `${myDone.guesses}/6` : 'failed') : (oppDone?.solved ? `${oppDone.guesses}/6` : 'failed')}
          </p>
        </div>
      </div>

      {/* Both boards */}
      <div className="flex gap-4">
        <div>
          <GameBoard guesses={myGuesses} ghostMode={false} />
        </div>
        <div>
          <GameBoard guesses={oppGuesses} ghostMode={false} />
        </div>
      </div>

      {/* Verification */}
      {verifyStatus && (
        <p className={cn('text-xs', verifyStatus.ok ? 'text-retro-win' : 'text-retro-cta')}>
          {verifyStatus.ok ? 'Transcript verified' : `Verification issue: ${verifyStatus.reason}`}
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
            disabled={actionBusy}
          >
            {actionBusy ? 'STARTING…' : 'NEXT ROUND'}
          </button>
        )}
        {onNewMatch && !proposal && !matchWinner && (
          <button
            className="px-6 py-2.5 border-2 border-retro-border text-retro-text font-pixel text-xs
              rounded hover:border-retro-p1/50 hover:text-retro-p1 transition-all active:scale-95 disabled:opacity-50"
            onClick={handleNewMatch}
            disabled={actionBusy}
          >
            {actionBusy ? 'ASKING…' : 'NEW MATCH'}
          </button>
        )}
        {matchWinner && onNewMatch && !proposal && (
          <button
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs
              rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50"
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
