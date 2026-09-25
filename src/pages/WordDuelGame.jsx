import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { ref, update, onValue, runTransaction, set } from 'firebase/database'
import { db } from '../lib/firebase'
import { commit as makeCommit } from '../lib/commit'
import {
  markGuess, compareResults, getDoneState,
  isValidGuess, getKeyboardState, MAX_GUESSES, WORD_LENGTH, MATCH_WINS,
  verifyTranscript,
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

const KB_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
]

function normalizeGuesses(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  // Firebase may return numeric-keyed objects
  const arr = []
  for (const k of Object.keys(raw).sort((a, b) => Number(a) - Number(b))) {
    arr.push(raw[k])
  }
  return arr
}

// Mini ghost tile showing only the mark color
function GhostTile({ mark }) {
  const colorClass =
    mark === 'G' ? 'bg-retro-win' :
    mark === 'Y' ? 'bg-[rgb(var(--c-cta))]' :
    mark === 'B' ? 'bg-retro-dim' :
    'bg-retro-structure'
  return (
    <div className={cn('w-3 h-3 rounded-sm border border-retro-dim/30 transition-colors duration-300', colorClass)} />
  )
}

// Full game tile with letter + color
function GameTile({ letter, mark, pending }) {
  const colorClass =
    !mark ? 'bg-retro-card border-retro-border' :
    mark === 'G' ? 'bg-retro-win border-retro-win' :
    mark === 'Y' ? 'bg-[rgb(var(--c-cta))] border-[rgb(var(--c-cta))]' :
    'bg-retro-dim border-retro-dim'

  return (
    <div
      className={cn(
        'w-8 h-8 sm:w-12 sm:h-12 flex items-center justify-center rounded',
        'text-base sm:text-2xl font-bold border-2 uppercase select-none',
        'transition-colors duration-300',
        colorClass,
        letter && mark ? 'text-retro-bg' :
        letter ? 'text-retro-text' : '',
        pending && 'arcade-blink border-retro-cta',
      )}
    >
      {letter || ''}
    </div>
  )
}

function GameBoard({ guesses, compact, ghostMode }) {
  const rows = []
  for (let r = 0; r < MAX_GUESSES; r++) {
    const g = guesses[r]
    const cells = []
    for (let c = 0; c < WORD_LENGTH; c++) {
      const letter = g && g.word ? g.word[c] : null
      const mark = g && g.marks ? g.marks[c] : null
      if (ghostMode) {
        cells.push(<GhostTile key={c} mark={mark} />)
      } else {
        cells.push(
          <GameTile key={c} letter={letter} mark={mark} pending={g && !g.marks} />
        )
      }
    }
    rows.push(
      <div key={r} className={cn('flex', compact ? 'gap-0.5' : 'gap-1')}>
        {cells}
      </div>
    )
  }
  return <div className="flex flex-col gap-1">{rows}</div>
}

function Keyboard({ keyState, onKey, disabled }) {
  return (
    <div className="flex flex-col gap-1.5 w-full max-w-md mx-auto">
      {KB_ROWS.map((row, ri) => (
        <div key={ri} className="flex gap-1 w-full">
          {ri === 2 && (
            <button
              className={cn(
                'relative before:content-[\'\'] before:absolute before:inset-y-0 before:-left-0.5 before:-right-0.5',
                'flex-[1.5] min-w-0 h-11 rounded text-xs sm:text-sm font-bold uppercase cursor-pointer',
                'bg-retro-structure text-retro-text hover:bg-retro-border transition-colors',
                'disabled:opacity-30 disabled:cursor-default',
              )}
              onClick={() => onKey('ENTER')}
              disabled={disabled}
            >
              ↵
            </button>
          )}
          {row.map(letter => {
            const state = keyState[letter]
            const bg =
              state === 'G' ? 'bg-retro-win text-retro-bg' :
              state === 'Y' ? 'bg-[rgb(var(--c-cta))] text-retro-bg' :
              state === 'B' ? 'bg-retro-dim text-retro-bg' :
              'bg-retro-structure text-retro-text'
            return (
              <button
                key={letter}
                className={cn(
                  'relative before:content-[\'\'] before:absolute before:inset-y-0 before:-left-0.5 before:-right-0.5',
                  'flex-1 min-w-0 h-11 rounded text-xs sm:text-sm font-bold uppercase',
                  'hover:opacity-80 transition-colors',
                  bg,
                  'disabled:opacity-30 disabled:cursor-default',
                )}
                onClick={() => onKey(letter)}
                disabled={disabled}
              >
                {letter}
              </button>
            )
          })}
          {ri === 2 && (
            <button
              className={cn(
                'relative before:content-[\'\'] before:absolute before:inset-y-0 before:-left-0.5 before:-right-0.5',
                'flex-[1.5] min-w-0 h-11 rounded text-xs sm:text-sm font-bold uppercase cursor-pointer',
                'bg-retro-structure text-retro-text hover:bg-retro-border transition-colors',
                'disabled:opacity-30 disabled:cursor-default',
              )}
              onClick={() => onKey('BACK')}
              disabled={disabled}
            >
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  )
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

  const processedGuesses = useRef(new Set())
  const verifiedRef = useRef(false)
  const scoredRef = useRef(false)
  const gradingRef = useRef(false)

  const [sharing, runShare] = useBusy()

  // Derived from game
  const round = useMemo(() => game?.round || {}, [game])
  const phase = round.phase || 'setting'
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

  const stored = getStoredWord(gameId, mySymbol)
  const myCommit = commits[mySymbol]
  const oppCommit = commits[opponentSymbol]
  const allScores = (game?.scores) || { X: 0, O: 0 }

  const bothCommitted = myCommit && oppCommit
  const bothRevealed = reveal.X && reveal.O
  const bothDone = myDone && oppDone
  const matchWinner = allScores.X >= MATCH_WINS ? 'X' : allScores.O >= MATCH_WINS ? 'O' : null

  const keyboardState = getKeyboardState(myGuesses)

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
          round: { phase: 'reveal', result: { winner: mySymbol, reason: 'stall' } },
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
      setStoredWord(gameId, mySymbol, { word, salt })
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

  // ──── Grading: listen for opponent guesses and fill marks ────
  useEffect(() => {
    if (isSpectator || phase !== 'guessing' || !stored) return
    if (gradingRef.current) return

    const ungraded = oppGuesses.filter((g, i) => g && g.word && !g.marks && !processedGuesses.current.has(i))
    if (!ungraded.length) return

    gradingRef.current = true
    const word = stored.word
    // NOTE: indexOf-by-reference is correct here — Firebase entries are
    // distinct objects, so identical guess words never collide.
    ungraded.forEach(async (g) => {
      const idx = oppGuesses.indexOf(g)
      if (idx < 0 || processedGuesses.current.has(idx)) return
      const marks = markGuess(g.word, word)
      try {
        if (marks) {
          // marks is a plain string ("GYBBB") — update() requires an object and
          // throws on a string payload, silently killing grading; set() is the
          // correct primitive for a leaf write.
          await set(ref(db, `games/${gameId}/round/guesses${opponentSymbol}/${idx}/marks`), marks)
        }
        // Mark processed only after the write lands — a failed set() stays
        // retryable instead of sitting pending until the stall claim.
        processedGuesses.current.add(idx)
      } finally {
        gradingRef.current = false
      }
    })
  }, [oppGuesses, stored, phase, isSpectator, gameId, opponentSymbol])

  // Check if player is done and write done{X/O}
  useEffect(() => {
    if (isSpectator || phase !== 'guessing' || myDone) return
    const doneState = getDoneState(myGuesses)
    if (doneState && !scoredRef.current) {
      scoredRef.current = true
      update(ref(db, `games/${gameId}/round/done${mySymbol}`), {
        solved: doneState.solved,
        guesses: doneState.guesses,
        at: Date.now() + clockOffset,
      }).catch(() => { scoredRef.current = false })
    }
  }, [myGuesses, myDone, phase, isSpectator, gameId, mySymbol, clockOffset])

  // Auto-advance to reveal when both done
  useEffect(() => {
    if (isSpectator || phase !== 'guessing') return
    if (bothDone && !bothRevealed) {
      const myReveal = getStoredWord(gameId, mySymbol)
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
  }, [bothDone, bothRevealed, phase, isSpectator, gameId, mySymbol])

  // Write the round result (+ bump the winner's score, ending the match at
  // MATCH_WINS) via a transaction guarded on `round.result` so two clients
  // racing to resolve the same round can't double-score.
  const writeRoundResult = useCallback(async (winner, reason) => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || !current.round || current.round.result) return
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
  useEffect(() => {
    if (phase !== 'reveal' || !reveal || verifiedRef.current) return
    const oppReveal = reveal[opponentSymbol]
    if (!oppReveal || !oppCommit) return

    verifiedRef.current = true
    ;(async () => {
      const oppResult = await verifyTranscript(oppCommit, oppReveal, oppGuesses)
      const myWord = getStoredWord(gameId, mySymbol)
      let myOk = true
      if (myWord && commits[mySymbol]) {
        const myResult = await verifyTranscript(commits[mySymbol], { word: myWord.word, salt: myWord.salt }, [])
        myOk = myResult.ok
      }

      if (!oppResult.ok || !myOk) {
        setCheatDetected(true)
        setVerifyStatus({ ok: false, reason: !oppResult.ok ? oppResult.reason : 'own_commit_mismatch' })
        const winner = !oppResult.ok ? mySymbol : opponentSymbol
        await writeRoundResult(winner, 'cheat')
        return
      }

      setVerifyStatus({ ok: true })
      // compareResults is seat-positional (doneX, doneO) — passing
      // (myDone, oppDone) mirrors the verdict on O's client and races X's
      // correct write 50/50.
      const winner = mySymbol === 'X'
        ? compareResults(myDone, oppDone)
        : compareResults(oppDone, myDone)
      setLocalResult(winner)
      if (winner) {
        sounds[winner === 'draw' ? 'draw' : winner === mySymbol ? 'win' : 'lose']?.()
      }
      if (!result) {
        await writeRoundResult(winner || 'draw', 'solved')
      }
    })()
  }, [phase, reveal, oppCommit, oppGuesses, mySymbol, opponentSymbol, gameId, myDone, oppDone, commits, result, writeRoundResult])

  // ──── Handle keypress ────
  const handleKey = useCallback((key) => {
    if (myDone || phase !== 'guessing' || isSpectator) return

    if (key === 'ENTER') {
      const word = currentGuess.toUpperCase()
      if (word.length !== WORD_LENGTH) return
      if (!isValidGuess(word)) {
        sounds.miss?.()
        return
      }
      sounds.move?.(mySymbol)
      const idx = myGuesses.length
      update(ref(db, `games/${gameId}/round/guesses${mySymbol}/${idx}`), {
        word,
        at: Date.now() + clockOffset,
      }).catch(() => {})
      setCurrentGuess('')
    } else if (key === 'BACK') {
      setCurrentGuess(prev => prev.slice(0, -1))
    } else if (currentGuess.length < WORD_LENGTH) {
      setCurrentGuess(prev => prev + key.toUpperCase())
    }
  }, [currentGuess, myDone, phase, isSpectator, mySymbol, gameId, myGuesses.length, clockOffset])

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

  // Physical keyboard for setting phase
  useEffect(() => {
    if (phase !== 'setting' || !!myCommit) return
    const handler = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSettingKey('ENTER')
      } else if (e.key === 'Backspace') {
        handleSettingKey('BACK')
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        handleSettingKey(e.key.toUpperCase())
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSettingKey, phase, myCommit])
  useEffect(() => {
    if (phase !== 'guessing' || myDone || isSpectator) return
    const handler = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Enter') {
        e.preventDefault()
        handleKey('ENTER')
      } else if (e.key === 'Backspace') {
        handleKey('BACK')
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        handleKey(e.key.toUpperCase())
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleKey, phase, myDone, isSpectator])

  const resetRound = useCallback(() => {
    setStoredWord(gameId, mySymbol, null)
    processedGuesses.current = new Set()
    gradingRef.current = false
    scoredRef.current = false
    verifiedRef.current = false
    setCheatDetected(false)
    setVerifyStatus(null)
    setLocalResult(null)
    setCurrentGuess('')
  }, [gameId, mySymbol])

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
              <Keyboard keyState={{}} onKey={handleSettingKey} disabled={lockingWord} />
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
            <GameBoard guesses={oppGuesses} compact ghostMode={true} />
          </div>
        </div>

        {/* Keyboard */}
        <div className="mt-1 w-full">
          <Keyboard keyState={keyboardState} onKey={handleKey} disabled={!!myDone} />
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
  const myRevealWord = getStoredWord(gameId, mySymbol)

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
              rounded hover:shadow-neon-cta transition-all active:scale-95"
            onClick={() => {
              resetRound()
              update(ref(db, `games/${gameId}/round`), {
                phase: 'setting',
                commits: null,
                startedAt: null,
                settingStartedAt: null,
                guessesX: null,
                guessesO: null,
                doneX: null,
                doneO: null,
                reveal: null,
                result: null,
              }).catch(() => {})
            }}
          >
            NEXT ROUND
          </button>
        )}
        {onNewMatch && !proposal && !matchWinner && (
          <button
            className="px-6 py-2.5 border-2 border-retro-border text-retro-text font-pixel text-xs
              rounded hover:border-retro-p1/50 hover:text-retro-p1 transition-all active:scale-95"
            onClick={() => {
              resetRound()
              onNewMatch()
            }}
          >
            NEW MATCH
          </button>
        )}
        {matchWinner && onNewMatch && !proposal && (
          <button
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs
              rounded hover:shadow-neon-cta transition-all active:scale-95"
            onClick={() => {
              resetRound()
              onNewMatch()
            }}
          >
            NEW MATCH
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
