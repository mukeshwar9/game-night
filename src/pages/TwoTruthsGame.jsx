import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { commit, verifyReveal } from '../lib/commit'
import GameSwitcher from '../components/GameSwitcher'
import SpectatorCard from '../components/SpectatorCard'
import PixelDots from '../components/loading/PixelDots'
import { sounds } from '../lib/sounds'
import { shareResult } from '../lib/shareCard'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import useServerClock from '@/hooks/useServerClock'
import { toast } from 'sonner'
import { getGameConfig } from '../lib/games'
import {
  MAX_STATEMENT_LENGTH as MAX_LEN, WRITING_DEADLINE_MS, GUESSING_DEADLINE_MS, REVEAL_DEADLINE_MS,
  DEFAULT_MATCH_TARGET, otherSymbol, validateEntry, lieSecret, secretStorageKey, buildStoredSecret,
  parseStoredSecret, normalizeRound, toFirebaseRound, anchorRound, lockEntry, lockGuess, submitReveal,
  canEndWriting, canEndGuessing, canForfeitOpponentReveal, revealKey, verifyRoundReveals,
  settleRevealedGame, settleStalledGame, advanceGame,
} from '../lib/twoTruthsLogic'

const SETTLE_RETRY_MS = 3000

// This tab's secret for the current commitment (sessionStorage survives a
// reload in the same tab; a new tab can't reveal).
function readSecret(gameId, commitment) {
  try {
    return parseStoredSecret(sessionStorage.getItem(secretStorageKey(gameId)), commitment)
  } catch {
    return null
  }
}

function secondsLeft(since, deadlineMs, now) {
  if (since == null) return null
  return Math.max(0, Math.ceil((since + deadlineMs - now) / 1000))
}

function formatClock(secs) {
  const m = Math.floor(secs / 60)
  return `${m}:${String(secs % 60).padStart(2, '0')}`
}

// --- Writer: three statements, mark the lie ---
function StatementWriter({ onLock, busy }) {
  const [statements, setStatements] = useState(['', '', ''])
  const [lieIndex, setLieIndex] = useState(null)
  const [error, setError] = useState('')
  const submitRef = useRef(null)

  const setStatement = (i, val) => {
    setStatements(prev => prev.map((s, idx) => (idx === i ? val.slice(0, MAX_LEN) : s)))
    setError('')
  }

  // Nudge LOCK IT IN back into view once the on-screen keyboard finishes
  // animating in — otherwise the last statement + submit button can land
  // under the keyboard fold on short viewports.
  const handleFieldFocus = () => {
    setTimeout(() => {
      submitRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 300)
  }

  const handleSubmit = () => {
    const v = validateEntry(statements, lieIndex)
    if (!v.ok) {
      setError(v.error)
      return
    }
    onLock(v.statements, v.lieIndex)
  }

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <p className="font-pixel text-[10px] text-retro-p1 text-glow-p1 tracking-wider">
          WRITE ABOUT YOURSELF
        </p>
        <p className="font-mono text-xs text-retro-dim">
          2 truths and 1 lie — then mark the lie
        </p>
      </div>

      <div className="space-y-3">
        {statements.map((s, i) => {
          const isLie = lieIndex === i
          return (
            <div key={i} className="space-y-1.5">
              <textarea
                value={s}
                onChange={e => setStatement(i, e.target.value)}
                onFocus={handleFieldFocus}
                maxLength={MAX_LEN}
                rows={2}
                placeholder={`STATEMENT ${i + 1}`}
                aria-label={`Statement ${i + 1}`}
                className={cn(
                  'w-full bg-retro-card border-2 rounded px-3 py-2 resize-none',
                  'font-mono text-xs text-retro-text leading-relaxed',
                  'placeholder-retro-dim focus:outline-none transition-colors',
                  isLie ? 'border-retro-p2 focus:border-retro-p2' : 'border-retro-border focus:border-retro-p1',
                )}
              />
              <button
                type="button"
                onClick={() => { setLieIndex(i); setError('') }}
                aria-pressed={isLie}
                className={cn(
                  'w-full py-1.5 font-pixel text-[9px] rounded border transition-all active:scale-95',
                  isLie
                    ? 'border-retro-p2 text-retro-p2 bg-retro-tint-p2 shadow-neon-p2'
                    : 'border-retro-border text-retro-dim hover:border-retro-p2/50 hover:text-retro-p2',
                )}
              >
                {isLie ? '✗ THIS IS THE LIE' : 'MARK AS LIE'}
              </button>
            </div>
          )
        })}
      </div>

      {error && (
        <p role="alert" className="font-pixel text-[10px] text-retro-p2 text-center">{error}</p>
      )}

      <button
        type="button"
        ref={submitRef}
        onClick={handleSubmit}
        disabled={busy}
        className={cn(
          'w-full py-3 font-pixel text-[10px] rounded border-2 transition-all active:scale-95',
          busy
            ? 'border-retro-border text-retro-border cursor-not-allowed'
            : 'border-retro-p1 text-retro-p1 hover:shadow-neon-p1 hover:bg-retro-tint-p1',
        )}
      >
        {busy ? 'LOCKING…' : 'LOCK IT IN'}
      </button>
    </div>
  )
}

// --- One player's three statements (read-only, pickable, or revealed) ---
function StatementList({ statements, lieIndex = null, picked = null, pickedLabel = 'PICKED', onPick = null, revealed = false }) {
  return (
    <div className="space-y-2">
      {statements.map((s, i) => {
        const isTheLie = lieIndex === i
        const isTruth = revealed && lieIndex != null && lieIndex !== i
        const isPicked = picked === i
        const canPick = !!onPick
        return (
          <button
            key={i}
            type="button"
            onClick={() => canPick && onPick(i)}
            disabled={!canPick}
            className={cn(
              'w-full min-h-11 text-left rounded border-2 px-3 py-3 transition-all',
              'font-mono text-xs leading-relaxed flex items-start gap-2',
              canPick && 'hover:border-retro-p2 hover:bg-retro-tint-p2 active:scale-[0.99] cursor-pointer',
              isTheLie
                ? 'border-retro-p2 bg-retro-tint-p2 text-retro-p2'
                : isTruth
                  ? 'border-retro-win/50 text-retro-dim'
                  : isPicked
                    ? 'border-retro-cta text-retro-text shadow-neon-cta'
                    : 'border-retro-border text-retro-text',
              isTheLie && revealed && 'shadow-neon-p2',
            )}
          >
            <span className={cn(
              'font-pixel text-[9px] mt-0.5 shrink-0',
              isTheLie ? 'text-retro-p2' : isTruth ? 'text-retro-win' : 'text-retro-dim',
            )}>
              {isTheLie ? '✗' : isTruth ? '✓' : i + 1}
            </span>
            <span className="break-words min-w-0">{s}</span>
            {(isPicked || isTheLie) && (
              <span className="font-pixel text-[8px] ml-auto shrink-0 mt-0.5 text-right space-y-0.5">
                {isTheLie && <span className="block text-retro-p2">LIE</span>}
                {isPicked && <span className="block text-retro-cta">{pickedLabel}</span>}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function EndRoundButton({ onClick, busy, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="px-5 py-2 font-pixel text-[10px] border border-retro-p2 text-retro-p2 rounded hover:shadow-neon-p2 transition-all active:scale-95 disabled:opacity-50"
    >
      {busy ? 'ENDING…' : label}
    </button>
  )
}

export default function TwoTruthsGame({ gameId, game, mySymbol, opponentOnline, onSwitchGame, onNewMatch, proposal }) {
  const round = useMemo(() => normalizeRound(game.round), [game.round])
  const { phase, roundNum, entries, guesses, reveals, result } = round
  const isSpectator = mySymbol !== 'X' && mySymbol !== 'O'
  const me = isSpectator ? null : mySymbol
  const opp = me ? otherSymbol(me) : null
  const isPlaying = game.status === 'playing'
  const isFinished = game.status === 'finished'
  const matchTarget = getGameConfig('twotruths').matchTarget || DEFAULT_MATCH_TARGET
  const scoreX = game.scores?.X || 0
  const scoreO = game.scores?.O || 0

  const { now, serverNow } = useServerClock({ tickMs: 500, ticking: isPlaying })

  const [locking, runLock] = useBusy()
  const [guessing, runGuess] = useBusy()
  const [ending, runEnd] = useBusy()
  const [conceding, runConcede] = useBusy()
  const [advancing, runAdvance] = useBusy()
  const [sharing, runShare] = useBusy()

  const nameOf = sym => (game.players?.[sym]?.name || sym).toUpperCase()
  const who = sym => (sym === me ? 'YOU' : nameOf(sym))
  const whose = sym => (sym === me ? 'YOUR' : `${nameOf(sym)}'S`)

  const roundRef = () => ref(db, `games/${gameId}/round`)
  const gameRef = () => ref(db, `games/${gameId}`)

  const myEntry = me ? entries[me] : null
  const mySecret = myEntry ? readSecret(gameId, myEntry.commitment) : null

  // Anchor the writing clock once per round (transaction: first write wins).
  useEffect(() => {
    if (!isPlaying || isSpectator || phase !== 'writing' || round.startedAt != null) return
    runTransaction(ref(db, `games/${gameId}/round`), current => {
      const r = normalizeRound(current)
      if (r.roundNum !== roundNum) return undefined
      const next = anchorRound(r, serverNow())
      return next ? toFirebaseRound(next) : undefined
    }).catch(() => toast.error("COULDN'T START THE ROUND CLOCK — CHECK CONNECTION"))
  }, [isPlaying, isSpectator, phase, round.startedAt, roundNum, gameId, serverNow])

  // Both guessed: reveal my own lie from this tab's secret.
  const revealAttempt = useRef(null)
  useEffect(() => {
    if (!isPlaying || !me || phase !== 'revealing' || reveals[me] || !myEntry) return
    const secret = readSecret(gameId, myEntry.commitment)
    if (!secret) return // secret lost — the page offers CONCEDE
    if (revealAttempt.current === myEntry.commitment) return
    revealAttempt.current = myEntry.commitment
    runTransaction(ref(db, `games/${gameId}/round`), current => {
      const next = submitReveal(normalizeRound(current), me, secret)
      return next ? toFirebaseRound(next) : undefined
    }).catch(() => {
      revealAttempt.current = null
      toast.error("COULDN'T REVEAL YOUR LIE — CHECK CONNECTION")
    })
  }, [isPlaying, me, phase, reveals, myEntry, gameId])

  // Both revealed: verify each reveal against its commitment, then score the
  // round (transaction: exactly once, and only for the reveals verified).
  const settleAttempt = useRef(null)
  const [settleRetry, setSettleRetry] = useState(0)
  useEffect(() => {
    if (!isPlaying || !me || phase !== 'revealing' || !reveals.X || !reveals.O) return
    const key = `${roundNum}|${entries.X?.commitment}|${entries.O?.commitment}|${revealKey(reveals.X)}|${revealKey(reveals.O)}`
    if (settleAttempt.current === key) return
    settleAttempt.current = key
    ;(async () => {
      const verification = await verifyRoundReveals(round, verifyReveal)
      await runTransaction(ref(db, `games/${gameId}`), current =>
        settleRevealedGame(current, verification, { now: serverNow(), matchTarget }) ?? undefined)
    })().catch(() => {
      toast.error("COULDN'T SCORE THE ROUND — RETRYING")
      // Not cleared on re-render: any room update re-runs this effect.
      setTimeout(() => {
        settleAttempt.current = null
        setSettleRetry(n => n + 1)
      }, SETTLE_RETRY_MS)
    })
  }, [isPlaying, me, phase, reveals, entries, roundNum, round, gameId, serverNow, matchTarget, settleRetry])

  // Round-end sound (the match-end fanfare is Game.jsx's job).
  const soundedRound = useRef(null)
  useEffect(() => {
    if (phase !== 'done' || !result || !me || !isPlaying) return
    const key = `${roundNum}|${round.doneAt}`
    if (soundedRound.current === key) return
    soundedRound.current = key
    const mine = result[me].points
    const theirs = result[opp].points
    if (mine > theirs) sounds.win()
    else if (theirs > mine) sounds.lose()
    else sounds.draw()
  }, [phase, result, me, opp, isPlaying, roundNum, round.doneAt])

  const handleLock = (statements, lieIndex) => runLock(async () => {
    const { hash, salt } = await commit(lieSecret(lieIndex))
    sessionStorage.setItem(secretStorageKey(gameId),
      JSON.stringify(buildStoredSecret({ roundNum, commitment: hash, lieIndex, salt })))
    const { committed } = await runTransaction(roundRef(), current => {
      const next = lockEntry(normalizeRound(current), me, { statements, commitment: hash }, serverNow())
      return next ? toFirebaseRound(next) : undefined
    })
    if (!committed) toast.error('THE ROUND MOVED ON — COULDN\'T LOCK IN')
  }, () => toast.error("COULDN'T LOCK IN — CHECK CONNECTION"))

  const handleGuess = (index) => runGuess(async () => {
    const { committed } = await runTransaction(roundRef(), current => {
      const next = lockGuess(normalizeRound(current), me, index, serverNow())
      return next ? toFirebaseRound(next) : undefined
    })
    if (committed) sounds.move(me)
    else toast.error('THE ROUND MOVED ON — GUESS NOT SAVED')
  }, () => toast.error("COULDN'T SAVE YOUR GUESS — CHECK CONNECTION"))

  const handleEndStalled = () => runEnd(async () => {
    const { committed } = await runTransaction(gameRef(), current =>
      settleStalledGame(current, me, { now: serverNow(), matchTarget }) ?? undefined)
    if (!committed) toast.error('THE ROUND ALREADY MOVED ON')
  }, () => toast.error("COULDN'T END THE ROUND — CHECK CONNECTION"))

  const handleForfeitOpponentReveal = () => runEnd(async () => {
    const { committed } = await runTransaction(roundRef(), current => {
      const r = normalizeRound(current)
      if (!canForfeitOpponentReveal(r, me, serverNow())) return undefined
      const next = submitReveal(r, opp, { forfeit: true })
      return next ? toFirebaseRound(next) : undefined
    })
    if (!committed) toast.error('THE ROUND ALREADY MOVED ON')
  }, () => toast.error("COULDN'T END THE ROUND — CHECK CONNECTION"))

  const handleConcedeReveal = () => runConcede(async () => {
    const { committed } = await runTransaction(roundRef(), current => {
      const next = submitReveal(normalizeRound(current), me, { forfeit: true })
      return next ? toFirebaseRound(next) : undefined
    })
    if (!committed) toast.error('THE ROUND ALREADY MOVED ON')
  }, () => toast.error("COULDN'T CONCEDE — CHECK CONNECTION"))

  const handleNextRound = () => runAdvance(async () => {
    await runTransaction(gameRef(), current => advanceGame(current, roundNum, serverNow()) ?? undefined)
  }, () => toast.error("COULDN'T START THE NEXT ROUND — CHECK CONNECTION"))

  // --- Pieces ---
  const header = (
    <div className="text-center space-y-1">
      <p className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-wider">
        TWO TRUTHS &amp; A LIE
      </p>
      <p className="font-pixel text-[8px] text-retro-dim">ROUND {roundNum} · FIRST TO {matchTarget}</p>
    </div>
  )

  const sideOutcome = (sym) => {
    const side = result?.[sym]
    if (!side) return null
    const o = otherSymbol(sym)
    if (side.fault === 'cheat') {
      return `${whose(sym)} REVEAL DIDN'T MATCH ${sym === me ? 'YOUR' : 'THEIR'} LOCKED LIE — ${sym === me ? 'YOUR' : 'THEIR'} CATCH DOESN'T COUNT`
    }
    if (side.fault === 'forfeit') return `${who(sym)} COULDN'T REVEAL ${sym === me ? 'YOUR' : 'THEIR'} LIE — NO POINT`
    if (side.fault === 'noStatements') return `${who(sym)} DIDN'T LOCK STATEMENTS IN TIME`
    if (side.fault === 'noGuess') return `${who(sym)} DIDN'T GUESS IN TIME`
    if (side.caught === true) return `${who(sym)} CAUGHT ${whose(o)} LIE +1`
    if (side.caught === false) return `${whose(o)} LIE FOOLED ${who(sym)}`
    if (side.points) return `${who(sym)} +1 — ${result.reason === 'reveal' ? `${whose(o)} LIE COULDN'T BE CHECKED` : 'LOCKED IN ON TIME'}`
    return null
  }

  const cheatEvidence = (sym) => {
    if (result?.[sym]?.fault !== 'cheat') return null
    const entry = entries[sym]
    const reveal = reveals[sym]
    return (
      <div className="bg-retro-card border border-retro-p2/40 rounded p-3 space-y-1 font-mono text-[10px] text-retro-dim break-all text-left">
        <p><span className="text-retro-p2">COMMITMENT:</span> {entry?.commitment?.slice(0, 16)}…</p>
        <p><span className="text-retro-p2">REVEALED LIE:</span> #{reveal?.lieIndex != null ? reveal.lieIndex + 1 : '?'}</p>
        <p><span className="text-retro-p2">HASH OK:</span> false</p>
      </div>
    )
  }

  // Both players' statements after a round: the lie (if proven) and the pick
  // the OTHER player made against them.
  const roundBreakdown = () => {
    const order = me ? [me, opp] : ['X', 'O']
    return (
      <div className="space-y-4">
        {order.map(sym => {
          const entry = entries[sym]
          if (!entry) {
            return (
              <p key={sym} className="font-pixel text-[9px] text-retro-dim text-center">
                {who(sym)} DIDN&apos;T LOCK ANY STATEMENTS
              </p>
            )
          }
          const guesser = otherSymbol(sym)
          const lie = result?.[sym]?.lieIndex ?? null
          return (
            <div key={sym} className="space-y-2">
              <p className={cn('font-pixel text-[9px] tracking-wider', sym === 'X' ? 'text-retro-p1' : 'text-retro-p2')}>
                {sym === me ? 'YOUR STATEMENTS' : `${nameOf(sym)}'S STATEMENTS`}
              </p>
              <StatementList
                statements={entry.statements}
                lieIndex={lie}
                revealed={lie != null}
                picked={guesses[guesser]}
                pickedLabel={guesser === me ? 'YOUR PICK' : `${nameOf(guesser)}'S PICK`}
              />
              {cheatEvidence(sym)}
            </div>
          )
        })}
      </div>
    )
  }

  const outcomeLines = () => {
    const order = me ? [me, opp] : ['X', 'O']
    return (
      <div className="space-y-1" role="status" aria-live="polite">
        {order.map(sym => {
          const line = sideOutcome(sym)
          if (!line) return null
          const good = result[sym].points > 0
          return (
            <p key={sym} className={cn('font-pixel text-[10px] leading-relaxed', good ? 'text-retro-win text-glow-win' : 'text-retro-dim')}>
              {line}
            </p>
          )
        })}
      </div>
    )
  }

  // --- Match over (own finish, CLAIM WIN, or any other status:'finished') ---
  if (isFinished) {
    const winner = game.winner ?? null
    const iWon = !!me && winner === me
    const headline = winner === 'draw' ? 'DRAW' : !winner ? 'MATCH OVER' : iWon ? 'YOU WIN!' : `${nameOf(winner)} WINS`
    return (
      <div className="space-y-6 text-center">
        {isSpectator && <SpectatorCard game={game} />}
        <p className="font-pixel text-[10px] text-retro-dim tracking-widest">MATCH OVER</p>
        <p className={cn('font-pixel text-base', iWon ? 'text-retro-cta text-glow-cta' : 'text-retro-dim')}>
          {headline}
        </p>
        <p className="font-mono text-sm text-retro-dim">{scoreX} – {scoreO}</p>
        {phase === 'done' && result && (
          <div className="space-y-3 text-left">
            <p className="font-pixel text-[9px] text-retro-dim text-center">FINAL ROUND</p>
            <div className="text-center">{outcomeLines()}</div>
            {roundBreakdown()}
          </div>
        )}
        {!isSpectator && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {!proposal && onNewMatch && (
              <button
                type="button"
                onClick={onNewMatch}
                className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
              >
                NEW MATCH
              </button>
            )}
            <button
              type="button"
              onClick={() => runShare(async () => {
                const ok = await shareResult({
                  gameLabel: 'TWO TRUTHS',
                  headline,
                  sub: `${scoreX} – ${scoreO}`,
                  accentVar: '--c-cta',
                  url: window.location.href,
                })
                if (!ok) toast.error("COULDN'T BUILD SHARE CARD — TRY AGAIN")
              }, () => toast.error("COULDN'T SHARE — TRY AGAIN"))}
              disabled={sharing}
              className="px-6 py-2.5 min-w-[6.5rem] font-pixel text-xs border-2 border-retro-border text-retro-dim rounded hover:border-retro-cta hover:text-retro-cta transition-all active:scale-95 disabled:opacity-50"
            >
              {sharing ? 'BUILDING…' : 'SHARE'}
            </button>
          </div>
        )}
        {!isSpectator && onSwitchGame && !proposal && (
          <GameSwitcher currentType="twotruths" onSwitch={onSwitchGame} />
        )}
      </div>
    )
  }

  // --- Writing: both players write at the same time ---
  if (phase === 'writing') {
    const writeLeft = secondsLeft(round.startedAt, WRITING_DEADLINE_MS, now)
    const timeLine = writeLeft != null && (
      <p className="font-mono text-[10px] text-retro-dim text-center tabular-nums">WRITING TIME {formatClock(writeLeft)}</p>
    )
    if (me && !myEntry) {
      return (
        <div className="space-y-4">
          {header}
          {timeLine}
          <StatementWriter key={`write-${roundNum}`} onLock={handleLock} busy={locking} />
          <p className="font-pixel text-[9px] text-retro-dim text-center">
            {entries[opp] ? `${nameOf(opp)} HAS LOCKED IN ✓` : `${nameOf(opp)} IS WRITING…`}
          </p>
        </div>
      )
    }
    if (me) {
      const canEnd = canEndWriting(round, me, now)
      return (
        <div className="space-y-4">
          {header}
          <div className="text-center space-y-3">
            <div className="flex justify-center"><PixelDots tone="p1" size="lg" glow /></div>
            <p className="font-pixel text-[10px] text-retro-p1 text-glow-p1 leading-relaxed">
              LOCKED IN ✓<br />WAITING FOR {nameOf(opp)}…
            </p>
            {opponentOnline === false && (
              <p className="font-pixel text-[9px] text-retro-dim">({nameOf(opp)} IS OFFLINE)</p>
            )}
            {canEnd ? (
              <EndRoundButton onClick={handleEndStalled} busy={ending} label="END ROUND — +1 TO YOU" />
            ) : writeLeft != null && (
              <p className="font-mono text-[9px] text-retro-dim">CAN END IN {writeLeft}s</p>
            )}
          </div>
          <div className="space-y-2">
            <p className="font-pixel text-[9px] text-retro-dim">YOUR STATEMENTS</p>
            <StatementList statements={myEntry.statements} lieIndex={mySecret?.lieIndex ?? null} />
          </div>
        </div>
      )
    }
    return (
      <div className="space-y-4">
        <SpectatorCard game={game} />
        {header}
        {timeLine}
        <div className="text-center space-y-2 py-4">
          <div className="flex justify-center"><PixelDots tone="p1" size="lg" glow /></div>
          <p className="font-pixel text-[10px] text-retro-p1 text-glow-p1">BOTH PLAYERS ARE WRITING…</p>
          {['X', 'O'].map(sym => (
            <p key={sym} className="font-pixel text-[9px] text-retro-dim">
              {nameOf(sym)}: {entries[sym] ? 'LOCKED IN ✓' : 'WRITING…'}
            </p>
          ))}
        </div>
      </div>
    )
  }

  // --- Guessing: both guess the other's lie at the same time ---
  if (phase === 'guessing') {
    const guessLeft = secondsLeft(round.guessStartedAt, GUESSING_DEADLINE_MS, now)
    const timeLine = guessLeft != null && (
      <p className="font-mono text-[10px] text-retro-dim text-center tabular-nums">GUESSING TIME {formatClock(guessLeft)}</p>
    )
    if (me) {
      const myGuess = guesses[me]
      const canPick = myGuess == null && !guessing
      const canEnd = canEndGuessing(round, me, now)
      return (
        <div className="space-y-4">
          {header}
          {timeLine}
          <p className={cn(
            'font-pixel text-[9px] text-center',
            myGuess == null ? 'text-retro-cta text-glow-cta arcade-blink' : 'text-retro-dim',
          )}>
            {myGuess == null ? `WHICH OF ${nameOf(opp)}'S IS THE LIE?` : `GUESS LOCKED — WAITING FOR ${nameOf(opp)}…`}
          </p>
          <StatementList
            statements={entries[opp].statements}
            picked={myGuess}
            pickedLabel="YOUR PICK"
            onPick={canPick ? handleGuess : null}
          />
          {myGuess != null && (
            <div className="text-center space-y-2">
              {opponentOnline === false && (
                <p className="font-pixel text-[9px] text-retro-dim">({nameOf(opp)} IS OFFLINE)</p>
              )}
              {canEnd ? (
                <EndRoundButton onClick={handleEndStalled} busy={ending} label="END ROUND — +1 TO YOU" />
              ) : guessLeft != null && guesses[opp] == null && (
                <p className="font-mono text-[9px] text-retro-dim">CAN END IN {guessLeft}s</p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <p className="font-pixel text-[9px] text-retro-dim">YOUR STATEMENTS</p>
            <StatementList statements={myEntry.statements} lieIndex={mySecret?.lieIndex ?? null} />
          </div>
        </div>
      )
    }
    return (
      <div className="space-y-4">
        <SpectatorCard game={game} />
        {header}
        {timeLine}
        {['X', 'O'].map(sym => (
          <div key={sym} className="space-y-2">
            <p className={cn('font-pixel text-[9px] tracking-wider', sym === 'X' ? 'text-retro-p1' : 'text-retro-p2')}>
              {nameOf(sym)}'S STATEMENTS · {guesses[otherSymbol(sym)] != null ? `${nameOf(otherSymbol(sym))} HAS GUESSED ✓` : `${nameOf(otherSymbol(sym))} IS THINKING…`}
            </p>
            <StatementList statements={entries[sym].statements} />
          </div>
        ))}
      </div>
    )
  }

  // --- Revealing: each client reveals its own lie automatically ---
  if (phase === 'revealing') {
    const myRevealMissing = me && !reveals[me]
    const secretLost = myRevealMissing && !mySecret
    const canForfeit = me && canForfeitOpponentReveal(round, me, now)
    const revealLeft = secondsLeft(round.revealStartedAt, REVEAL_DEADLINE_MS, now)
    return (
      <div className="space-y-4">
        {isSpectator && <SpectatorCard game={game} />}
        {header}
        <div className="text-center space-y-3 py-4">
          <div className="flex justify-center"><PixelDots tone="cta" size="lg" glow /></div>
          <p className="font-pixel text-[10px] text-retro-cta text-glow-cta">REVEALING THE LIES…</p>
          {secretLost && (
            <div className="space-y-2">
              <p className="font-pixel text-[9px] text-retro-dim leading-relaxed">
                YOUR SECRET IS LOST (NEW TAB) —<br />YOUR LIE CAN&apos;T BE PROVEN. {nameOf(opp)} GETS THE POINT.
              </p>
              <button
                type="button"
                onClick={handleConcedeReveal}
                disabled={conceding}
                className="px-5 py-2 font-pixel text-[10px] border border-retro-p2 text-retro-p2 rounded hover:shadow-neon-p2 transition-all active:scale-95 disabled:opacity-50"
              >
                {conceding ? 'CONCEDING…' : 'CONCEDE REVEAL'}
              </button>
            </div>
          )}
          {me && reveals[me] && !reveals[opp] && (
            canForfeit ? (
              <EndRoundButton onClick={handleForfeitOpponentReveal} busy={ending} label={`END ROUND — ${nameOf(opp)} DIDN'T REVEAL`} />
            ) : revealLeft != null && (
              <p className="font-mono text-[9px] text-retro-dim">WAITING FOR {nameOf(opp)}&apos;S REVEAL · CAN END IN {revealLeft}s</p>
            )
          )}
        </div>
      </div>
    )
  }

  // --- Done: both lies revealed, round scored ---
  return (
    <div className="space-y-4">
      {isSpectator && <SpectatorCard game={game} />}
      {header}
      <div className="text-center">{outcomeLines()}</div>
      {roundBreakdown()}
      {!isSpectator && (
        <div className="text-center space-y-2">
          <button
            type="button"
            onClick={handleNextRound}
            disabled={advancing}
            className="mt-2 px-6 py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95 disabled:opacity-50"
          >
            {advancing ? 'STARTING…' : 'NEXT ROUND'}
          </button>
          {onSwitchGame && !proposal && (
            <GameSwitcher currentType="twotruths" onSwitch={onSwitchGame} />
          )}
        </div>
      )}
    </div>
  )
}
