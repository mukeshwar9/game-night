import { useEffect, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import OfflineNotice from '../components/loading/OfflineNotice'
import { sounds } from '../lib/sounds'
import { toast } from 'sonner'

// Reveal window scales with digit count so harder (longer) numbers get more
// time to memorize instead of the same flash as a 1-digit number. Level 1
// (the starting difficulty) still works out to the original ~3s.
const SHOW_MS_BASE      = 2000
const SHOW_MS_PER_DIGIT = 1000
function showMsForLevel(level) { return SHOW_MS_BASE + SHOW_MS_PER_DIGIT * level }

// Opponent-idle claim: presence only catches real disconnects, so an opponent
// who is online but walked away would leave me waiting forever. After I submit
// my answer, if their state hasn't changed for this long I may claim the round.
const CLAIM_IDLE_MS = 45000
const CLAIM_HINT_MS = 30000  // show the countdown hint this far in

function generateNumber(level) {
  let n = String(Math.floor(Math.random() * 9) + 1)
  for (let i = 1; i < level; i++) n += String(Math.floor(Math.random() * 10))
  return n
}

function normalizeRound(raw) {
  if (!raw) return { phase: 'showing', level: 1, number: '1', answerX: null, answerO: null }
  return {
    phase: raw.phase ?? 'showing',
    level: raw.level ?? 1,
    number: raw.number ?? '1',
    answerX: raw.answerX ?? null,
    answerO: raw.answerO ?? null,
  }
}

export default function NumberMemoryGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const round = normalizeRound(game.numRound)
  const myKey = mySymbol === 'X' ? 'X' : 'O'
  const opKey = myKey === 'X' ? 'O' : 'X'
  const myAnswer = round[`answer${myKey}`]
  const opAnswer = round[`answer${opKey}`]

  const [guessInput, setGuessInput] = useState('')
  const [inputError, setInputError] = useState('')
  const [countdown, setCountdown] = useState(null)
  const [localSubmitted, setLocalSubmitted] = useState(false)
  const timerRef = useRef(null)
  const prevLevel = useRef(round.level)
  const prevAnswerX = useRef(round.answerX)
  const prevAnswerO = useRef(round.answerO)
  const claimingRef = useRef(false)  // prevents double-click on claim button

  const hasSubmitted = localSubmitted || myAnswer != null

  // Reset local state when round advances (level changes)
  useEffect(() => {
    if (round.level !== prevLevel.current) {
      setLocalSubmitted(false)
      setGuessInput('')
      setInputError('')
      prevLevel.current = round.level
    }
  }, [round.level])

  // Both clients drive showing→recall transition (idempotent — same value written twice)
  useEffect(() => {
    if (round.phase !== 'showing') {
      if (timerRef.current) clearInterval(timerRef.current)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seeds the countdown display for this phase transition; deferring would flash a stale value on this timing-critical memorize countdown
      setCountdown(null)
      return
    }
    const showMs = showMsForLevel(round.level)
    setCountdown(Math.ceil(showMs / 1000))
    let remaining = showMs
    const interval = setInterval(() => {
      remaining -= 100
      setCountdown(Math.ceil(remaining / 1000))
      if (remaining <= 0) {
        clearInterval(interval)
        setCountdown(null)
        update(ref(db, `games/${gameId}/numRound`), { phase: 'recall' }).catch(() => {})
      }
    }, 100)
    timerRef.current = interval
    return () => clearInterval(interval)
  }, [round.phase, round.level, gameId])

  // Avoids spreading ...current through a root transaction (would re-write
  // players.O.playerId under the wrong auth.uid and fail the security rule).
  // Uses narrow CAS transactions + targeted update() calls instead, matching
  // the handleCellClick pattern already established in the codebase.
  // NOTE: reads game state from the component closure, so calls from handleSubmit
  // may bail early (stale local state); the watcher effect (below) always has
  // fresh state and handles the actual resolution in that case.
  const tryFinishRound = async () => {
    const r = game.numRound
    if (!r || r.answerX == null || r.answerO == null) return  // bail — not both submitted yet
    if (game.status === 'finished') return                    // bail — already resolved

    const xCorrect = r.answerX === r.number
    const oCorrect = r.answerO === r.number

    if (xCorrect && oCorrect) {
      // Both correct: advance to the next level.
      // CAS on numRound/level deduplicates concurrent calls from both clients.
      const currentLevel = r.level
      let claimed = false
      try {
        await runTransaction(ref(db, `games/${gameId}/numRound/level`), lvl => {
          if ((lvl ?? 1) !== currentLevel) return  // abort — already advanced
          claimed = true
          return currentLevel + 1
        })
      } catch { return }
      if (!claimed) return
      const newLevel = currentLevel + 1
      try {
        await update(ref(db, `games/${gameId}/numRound`), {
          phase: 'showing',
          level: newLevel,
          number: generateNumber(newLevel),
          answerX: null,  // Firebase deletes null-valued keys → normalizeRound treats absent as null ✓
          answerO: null,
        })
      } catch { /* level was already advanced; ignore */ }
    } else {
      // One or both wrong: end the round.
      // CAS on winner deduplicates concurrent resolution attempts.
      const loser = !xCorrect ? 'X' : 'O'
      const winner = loser === 'X' ? 'O' : 'X'
      let claimed = false
      try {
        await runTransaction(ref(db, `games/${gameId}/winner`), currentWinner => {
          if (currentWinner != null) return  // abort — already resolved
          claimed = true
          return winner
        })
      } catch { return }
      if (!claimed) return
      try {
        await update(ref(db, `games/${gameId}`), {
          status: 'finished',
          [`scores/${winner}`]: (game.scores?.[winner] || 0) + 1,
        })
      } catch { /* winner was already set; ignore */ }
    }
  }

  // Watcher: opponent just submitted — if I already submitted, trigger resolution
  useEffect(() => {
    const ax = game.numRound?.answerX
    const ao = game.numRound?.answerO
    if (ax != null && ao != null && (prevAnswerX.current == null || prevAnswerO.current == null)) {
      tryFinishRound()
    }
    prevAnswerX.current = ax
    prevAnswerO.current = ao
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tryFinishRound is recreated every render and intentionally reads fresh state from the closure (see NOTE above); the prevAnswerX/prevAnswerO refs already dedupe repeat calls
  }, [game.numRound?.answerX, game.numRound?.answerO])

  // --- Opponent-idle claim ---
  // opIdleSinceRef is set to Date.now() in the effect body (safe — not during
  // render). Never initialized with Date.now() here to satisfy react-hooks/purity.
  const opIdleSinceRef = useRef(null)
  const [opIdleMs, setOpIdleMs] = useState(0)
  // Only offered once MY answer is durably in Firebase (not just localSubmitted)
  const claimEligible = game.status === 'playing' && !!mySymbol
    && round.phase === 'recall' && myAnswer != null && opAnswer == null

  // Single combined effect: restarts on any relevant state change, recording the
  // new session start time via a ref and resetting the display state via a
  // setTimeout callback (async — avoids react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!claimEligible) return
    opIdleSinceRef.current = Date.now()
    // Reset display asynchronously so we don't call setState synchronously in the
    // effect body — the timeout fires on the next event-loop tick before any paint.
    const reset = setTimeout(() => setOpIdleMs(0), 0)
    const interval = setInterval(() => {
      if (opIdleSinceRef.current != null) {
        setOpIdleMs(Date.now() - opIdleSinceRef.current)
      }
    }, 1000)
    return () => { clearTimeout(reset); clearInterval(interval) }
  }, [claimEligible, opAnswer, round.phase, round.level, myAnswer, game.status])

  const claimReady     = claimEligible && opIdleMs >= CLAIM_IDLE_MS
  const showClaimHint  = claimEligible && !claimReady && opIdleMs >= CLAIM_HINT_MS
  const claimCountdown = Math.max(1, Math.ceil((CLAIM_IDLE_MS - opIdleMs) / 1000))

  // Resolve the round in my favor.
  // Two-step write to avoid spreading ...current through a root transaction (which
  // would write players.O.playerId under X's auth.uid and fail the security rule):
  //   1. Narrow CAS on `winner` only — `players` is never in scope of this ref.
  //   2. Targeted update() for status + scores (same pattern as handleCellClick).
  // claimingRef prevents a second in-flight call while the first is pending.
  const claimIdleRound = async () => {
    if (claimingRef.current) return
    claimingRef.current = true
    try {
      // Local pre-condition re-check before any network call
      const r = game.numRound ?? {}
      if (game.status !== 'playing' || r[`answer${myKey}`] == null || r[`answer${opKey}`] != null) return
      // Atomic CAS: only write winner if the slot is still empty
      let claimed = false
      await runTransaction(ref(db, `games/${gameId}/winner`), currentWinner => {
        if (currentWinner != null) return  // abort — already resolved
        claimed = true
        return myKey
      })
      if (!claimed) return  // opponent answered at the same instant — no-op
      await update(ref(db, `games/${gameId}`), {
        status: 'finished',
        [`scores/${myKey}`]: (game.scores?.[myKey] || 0) + 1,
      })
    } catch { toast.error('CLAIM FAILED — CHECK CONNECTION') }
    finally { claimingRef.current = false }
  }

  const handleSubmit = async () => {
    if (!mySymbol || hasSubmitted) return
    const guess = guessInput.trim()
    if (!guess) { setInputError('TYPE YOUR ANSWER'); return }
    if (!/^\d+$/.test(guess)) { setInputError('DIGITS ONLY'); return }
    setInputError('')
    setLocalSubmitted(true)
    sounds.move(mySymbol)
    try {
      await update(ref(db, `games/${gameId}/numRound`), { [`answer${myKey}`]: guess })
      await tryFinishRound()
    } catch {
      setLocalSubmitted(false)
      toast.error('SUBMIT FAILED — CHECK CONNECTION')
    }
  }

  const matchWinner = (game.scores?.X || 0) >= 3 ? 'X' : (game.scores?.O || 0) >= 3 ? 'O' : null

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        {round.number && (
          <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2 text-center">
            <p className="font-pixel text-[8px] text-retro-dim">THE NUMBER WAS</p>
            <p className="font-pixel text-lg text-retro-p1 text-glow-p1 tracking-widest">{round.number}</p>
          </div>
        )}
        <GameStatus
          status={game.status}
          winner={game.winner}
          mySymbol={mySymbol}
          scores={game.scores}
          players={game.players}
          gameType={game.gameType}
          onPlayAgain={!matchWinner && !proposal ? onPlayAgain : null}
          onNewMatch={matchWinner && !proposal ? onNewMatch : null}
          onSwitchGame={!proposal ? onSwitchGame : null}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {!mySymbol && <SpectatorCard game={game} />}
      <div className="flex items-center justify-between font-pixel text-[9px]">
        <span className="text-retro-cta text-glow-cta">
          {round.level} DIGIT{round.level > 1 ? 'S' : ''}
        </span>
        <span className="text-retro-dim">LEVEL {round.level}</span>
      </div>

      {round.phase === 'showing' && (
        <div className="bg-retro-card border border-retro-border rounded p-6 text-center space-y-3">
          <p className="font-pixel text-[8px] text-retro-dim">MEMORIZE THIS NUMBER</p>
          <p className="font-pixel text-2xl text-retro-cta text-glow-cta tracking-widest">
            {round.number}
          </p>
          {countdown != null && (
            <p className="font-pixel text-[9px] text-retro-p2 arcade-blink">{countdown}s</p>
          )}
        </div>
      )}

      {round.phase === 'recall' && (
        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-3 relative">
          {hasSubmitted && (
            <div className="absolute inset-0 bg-retro-bg/70 flex items-center justify-center rounded z-10">
              <p className="font-pixel text-[9px] text-retro-win text-glow-win text-center leading-relaxed arcade-blink">
                SUBMITTED ✓{'\n'}WAITING FOR{'\n'}OPPONENT...
              </p>
            </div>
          )}
          <p className="font-pixel text-[9px] text-retro-cta text-center">
            WHAT WAS THE NUMBER?
          </p>
          <div className="flex items-center justify-center gap-6 font-pixel text-[8px]">
            <span className={myAnswer != null ? 'text-retro-win' : 'text-retro-dim'}>
              ME {myAnswer != null ? '✓' : '...'}
            </span>
            <span className={opAnswer != null ? 'text-retro-win' : 'text-retro-dim'}>
              OP {opAnswer != null ? '✓' : '...'}
            </span>
          </div>
          <input
            type="text"
            inputMode="numeric"
            maxLength={round.level + 2}
            value={guessInput}
            disabled={hasSubmitted || !mySymbol}
            onChange={e => { setGuessInput(e.target.value.replace(/\D/g, '')); setInputError('') }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            className="w-full bg-retro-surface border-2 border-retro-border text-retro-text font-pixel text-sm tracking-[0.3em] text-center rounded px-3 py-2 focus:outline-none focus:border-retro-p1 disabled:opacity-40"
            placeholder={'?'.repeat(round.level)}
          />
          {inputError && <p className="font-pixel text-[8px] text-retro-p2 text-center">{inputError}</p>}
          <button
            onClick={handleSubmit}
            disabled={hasSubmitted || !mySymbol}
            className="w-full py-3 min-h-11 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-40 disabled:cursor-default"
          >
            SUBMIT
          </button>
        </div>
      )}

      {!opponentOnline && mySymbol && <OfflineNotice label="OPPONENT" />}
      {showClaimHint && (
        <p className="font-pixel text-[9px] text-retro-dim text-center arcade-blink">
          OPPONENT IDLE — CLAIM UNLOCKS IN {claimCountdown}s
        </p>
      )}
      {claimReady && (
        <button
          onClick={claimIdleRound}
          className="w-full py-2 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded hover:shadow-neon-cta active:scale-95"
        >
          CLAIM ROUND — OPPONENT IDLE
        </button>
      )}
      {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
    </div>
  )
}
