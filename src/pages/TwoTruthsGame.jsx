import { useEffect, useRef, useState, useCallback } from 'react'
import { ref, onValue, update } from 'firebase/database'
import { db } from '../lib/firebase'
import { commit, verifyReveal } from '../lib/commit'
import GameSwitcher from '../components/GameSwitcher'
import SpectatorCard from '../components/SpectatorCard'
import PixelDots from '../components/loading/PixelDots'
import WinEffect from '../components/WinEffect'
import { sounds } from '../lib/sounds'
import { shareResult } from '../lib/shareCard'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import useBusy from '@/hooks/useBusy'
import { toast } from 'sonner'

const MATCH_WINS = 3
const MAX_LEN = 80

function normalizeStatements(raw) {
  if (!raw) return ['', '', '']
  if (Array.isArray(raw)) return [raw[0] ?? '', raw[1] ?? '', raw[2] ?? '']
  return [raw[0] ?? '', raw[1] ?? '', raw[2] ?? '']
}

function CheatScreen({ evidence }) {
  return (
    <div className="min-h-screen bg-retro-bg flex flex-col items-center justify-center p-6 gap-6">
      <div className="text-center space-y-3">
        <p
          className="font-pixel text-base text-retro-p2 text-glow-p2"
          style={{ animation: 'blink-text 0.6s step-end infinite' }}
        >
          ⚠ CHEAT DETECTED ⚠
        </p>
        <p className="font-mono text-xs text-retro-dim">The liar changed their answer.</p>
      </div>
      <div className="w-full max-w-sm bg-retro-card border border-retro-p2/40 rounded p-4 space-y-2 font-mono text-[10px] text-retro-dim break-all">
        <p><span className="text-retro-p2">COMMITMENT:</span> {evidence?.commitment?.slice(0, 16)}…</p>
        <p><span className="text-retro-p2">REVEALED LIE:</span> #{evidence?.revealed != null ? evidence.revealed + 1 : '?'}</p>
        <p><span className="text-retro-p2">HASH OK:</span> {String(evidence?.commitOk)}</p>
      </div>
      <Link
        to="/"
        className="font-pixel text-[10px] text-retro-p1 text-glow-p1 hover:opacity-80 transition-opacity"
      >
        ← BACK TO HOME
      </Link>
    </div>
  )
}

// --- Setter UI: write 3 statements, pick the lie ---
function StatementSetter({ onLock, loading }) {
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
    const trimmed = statements.map(s => s.trim())
    if (trimmed.some(s => !s)) {
      setError('FILL ALL 3 STATEMENTS')
      return
    }
    if (lieIndex === null) {
      setError('PICK WHICH ONE IS THE LIE')
      return
    }
    onLock(trimmed, lieIndex)
  }

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <p className="font-pixel text-[10px] text-retro-p1 text-glow-p1 tracking-wider">
          YOU ARE THE STORYTELLER
        </p>
        <p className="font-mono text-xs text-retro-dim">
          Write 2 truths and 1 lie — then mark the lie
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
                className={cn(
                  'w-full bg-retro-card border-2 rounded px-3 py-2 resize-none',
                  'font-mono text-xs text-retro-text leading-relaxed',
                  'placeholder-retro-border focus:outline-none transition-colors',
                  isLie ? 'border-retro-p2 focus:border-retro-p2' : 'border-retro-border focus:border-retro-p1',
                )}
              />
              <button
                onClick={() => { setLieIndex(i); setError('') }}
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
        <p className="font-pixel text-[10px] text-retro-p2 text-center">{error}</p>
      )}

      <button
        ref={submitRef}
        onClick={handleSubmit}
        disabled={loading}
        className={cn(
          'w-full py-3 font-pixel text-[10px] rounded border-2 transition-all active:scale-95',
          loading
            ? 'border-retro-border text-retro-border cursor-not-allowed'
            : 'border-retro-p1 text-retro-p1 hover:shadow-neon-p1 hover:bg-retro-tint-p1',
        )}
      >
        {loading ? 'LOCKING…' : 'LOCK IT IN'}
      </button>
    </div>
  )
}

export default function TwoTruthsGame({ gameId, game, mySymbol, opponentOnline, onSwitchGame, onNewMatch, proposal }) {
  const round = game.round || {}
  const phase = round.phase || 'writing'
  const setter = round.setter || 'X'
  const guesser = setter === 'X' ? 'O' : 'X'
  const statements = normalizeStatements(round.statements)
  const guess = round.guess ?? null

  const isSetter = mySymbol === setter
  const isGuesser = mySymbol !== null && mySymbol !== setter
  const isSpectator = mySymbol === null

  const scoreX = game.scores?.X || 0
  const scoreO = game.scores?.O || 0
  const matchWinner = scoreX >= MATCH_WINS ? 'X' : scoreO >= MATCH_WINS ? 'O' : null

  const [locking, setLocking] = useState(false)
  const [cheatDetected, setCheatDetected] = useState(false)
  const [cheatEvidence, setCheatEvidence] = useState(null)
  const [showWinEffect, setShowWinEffect] = useState(false)
  const [winEffectFor, setWinEffectFor] = useState(null)
  const [sharing, runShare] = useBusy()

  const verifiedCommitment = useRef(null)
  const lieRevealed = round.reveal?.lieIndex
  const guessedRight = guess != null && lieRevealed != null && guess === lieRevealed

  // --- Setter: when guess arrives, reveal + verify own commitment ---
  useEffect(() => {
    if (!isSetter || phase !== 'guessing') return

    const stored = sessionStorage.getItem(`twotruths-${gameId}`)
    if (!stored) return
    const { lieIndex, salt } = JSON.parse(stored)

    const guessRef = ref(db, `games/${gameId}/round/guess`)
    const unsub = onValue(guessRef, async (snap) => {
      const g = snap.val()
      if (g == null) return

      const commitOk = await verifyReveal(round.commitment, String(lieIndex), salt)
      if (!commitOk) {
        setCheatDetected(true)
        setCheatEvidence({ commitment: round.commitment, revealed: lieIndex, commitOk })
        return
      }

      update(ref(db), {
        [`games/${gameId}/round/phase`]: 'reveal',
        [`games/${gameId}/round/reveal`]: { lieIndex, salt },
      }).catch(() => {})
    })

    return () => unsub()
  }, [isSetter, phase, gameId, round.commitment])

  // --- Guesser: verify reveal against commitment when it lands ---
  useEffect(() => {
    if (phase !== 'reveal') return
    if (!round.reveal || !round.commitment) return
    if (verifiedCommitment.current === round.commitment) return

    verifiedCommitment.current = round.commitment
    const { lieIndex, salt } = round.reveal

    verifyReveal(round.commitment, String(lieIndex), salt).then((commitOk) => {
      if (!commitOk) {
        setCheatDetected(true)
        setCheatEvidence({ commitment: round.commitment, revealed: lieIndex, commitOk })
        return
      }
      if (isSpectator) return
      const roundWinner = guess === lieIndex ? guesser : setter
      setWinEffectFor(roundWinner)
      setShowWinEffect(true)
      if (roundWinner === mySymbol) sounds.win()
      else sounds.lose()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round.reveal, round.commitment])

  const handleLock = useCallback(async (stmts, lieIndex) => {
    setLocking(true)
    try {
      const { hash, salt } = await commit(String(lieIndex))
      sessionStorage.setItem(`twotruths-${gameId}`, JSON.stringify({ lieIndex, salt }))
      await update(ref(db, `games/${gameId}`), {
        'round/phase': 'guessing',
        'round/statements': stmts,
        'round/commitment': hash,
        'round/guess': null,
        'round/reveal': null,
      })
    } catch {
      /* ignore */
    } finally {
      setLocking(false)
    }
  }, [gameId])

  const handleGuess = useCallback(async (index) => {
    if (phase !== 'guessing' || !isGuesser || guess != null) return
    sounds.move(mySymbol)
    try {
      await update(ref(db), { [`games/${gameId}/round/guess`]: index })
    } catch { /* ignore */ }
  }, [phase, isGuesser, guess, gameId, mySymbol])

  const handleNextRound = useCallback(async () => {
    if (isSpectator) return
    const roundWinner = guess === lieRevealed ? guesser : setter
    const newScores = { X: scoreX, O: scoreO }
    newScores[roundWinner] = (newScores[roundWinner] || 0) + 1

    const newMatchWinner = newScores.X >= MATCH_WINS ? 'X' : newScores.O >= MATCH_WINS ? 'O' : null
    const newSetter = setter === 'X' ? 'O' : 'X'

    sessionStorage.removeItem(`twotruths-${gameId}`)

    const updates = {
      'scores/X': newScores.X,
      'scores/O': newScores.O,
      'round/setter': newSetter,
      'round/phase': 'writing',
      'round/statements': null,
      'round/commitment': null,
      'round/guess': null,
      'round/reveal': null,
      proposal: null,
    }

    if (newMatchWinner) {
      updates.status = 'finished'
      updates.winner = newMatchWinner
    }

    try { await update(ref(db, `games/${gameId}`), updates) } catch { /* ignore */ }
  }, [guess, lieRevealed, setter, guesser, scoreX, scoreO, isSpectator, gameId])

  // Stuck-round escape hatch: the storyteller's lie index lives only in
  // sessionStorage, so if it's gone (new tab) the reveal can never land — reset
  // to a fresh round with no score change, swap setter. Used by the guesser
  // when the storyteller is offline, and by the storyteller themselves when
  // they detect their own secret is missing.
  const handleResetStuckRound = useCallback(async () => {
    const newSetter = setter === 'X' ? 'O' : 'X'
    try {
      await update(ref(db, `games/${gameId}`), {
        'round/setter': newSetter,
        'round/phase': 'writing',
        'round/statements': null,
        'round/commitment': null,
        'round/guess': null,
        'round/reveal': null,
        proposal: null,
      })
    } catch { /* ignore */ }
  }, [setter, gameId])

  if (cheatDetected) return <CheatScreen evidence={cheatEvidence} />

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
        {!isSpectator && (
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
                  gameLabel: 'TWO TRUTHS',
                  headline: matchWinner === mySymbol
                    ? 'YOU WIN!'
                    : `${game.players?.[matchWinner]?.name || matchWinner} WINS`,
                  sub: `${scoreX} – ${scoreO}`,
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
        {!isSpectator && onSwitchGame && !proposal && (
          <GameSwitcher currentType="twotruths" onSwitch={onSwitchGame} />
        )}
      </div>
    )
  }

  // --- Writing phase ---
  if (phase === 'writing') {
    return (
      <div className="space-y-4">
        {showWinEffect && (
          <WinEffect winner={winEffectFor} onDone={() => setShowWinEffect(false)} />
        )}
        {isSpectator && <SpectatorCard game={game} />}
        {isSetter ? (
          <StatementSetter onLock={handleLock} loading={locking} />
        ) : (
          <div className="text-center space-y-3 py-6">
            <div className="flex justify-center">
              <PixelDots tone="p1" size="lg" glow />
            </div>
            <p className="font-pixel text-[10px] text-retro-p1 text-glow-p1 leading-relaxed">
              WAITING FOR<br />STORYTELLER…
            </p>
            {!opponentOnline && (
              <p className="font-pixel text-[10px] text-retro-dim">
                (STORYTELLER IS OFFLINE)
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  // --- Guessing / Reveal phases ---
  const isReveal = phase === 'reveal'
  const setterMissingSecret = isSetter && phase === 'guessing' &&
    !sessionStorage.getItem(`twotruths-${gameId}`)

  return (
    <div className="space-y-4">
      {showWinEffect && (
        <WinEffect winner={winEffectFor} onDone={() => setShowWinEffect(false)} />
      )}

      {isSpectator && <SpectatorCard game={game} />}

      <div className="text-center space-y-1">
        <p className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-wider">
          TWO TRUTHS &amp; A LIE
        </p>
        <p className={cn(
          'font-pixel text-[9px]',
          isReveal ? 'text-retro-dim'
            : isGuesser && guess == null ? 'text-retro-cta text-glow-cta arcade-blink'
            : 'text-retro-dim',
        )}>
          {isReveal
            ? 'THE LIE IS REVEALED'
            : isGuesser
              ? guess != null ? 'WAITING FOR REVEAL…' : 'WHICH ONE IS THE LIE?'
              : setterMissingSecret
                ? 'SECRET LOST — YOU OPENED A NEW TAB'
                : 'WAITING FOR THEIR GUESS…'}
        </p>
      </div>

      {/* Statements */}
      <div className="space-y-2">
        {statements.map((s, i) => {
          const isGuessed = guess === i
          const isTheLie = isReveal && lieRevealed === i
          const isTruth = isReveal && lieRevealed !== i
          const canPick = isGuesser && phase === 'guessing' && guess == null

          return (
            <button
              key={i}
              onClick={() => canPick && handleGuess(i)}
              disabled={!canPick}
              className={cn(
                'w-full min-h-11 text-left rounded border-2 px-3 py-3 transition-all',
                'font-mono text-xs leading-relaxed flex items-start gap-2',
                canPick && 'hover:border-retro-p2 hover:bg-retro-tint-p2 active:scale-[0.99] cursor-pointer',
                isTheLie
                  ? 'border-retro-p2 bg-retro-tint-p2 text-retro-p2 shadow-neon-p2'
                  : isTruth
                    ? 'border-retro-win/50 text-retro-dim'
                    : isGuessed
                      ? 'border-retro-cta text-retro-text shadow-neon-cta'
                      : 'border-retro-border text-retro-text',
              )}
            >
              <span className={cn(
                'font-pixel text-[9px] mt-0.5 shrink-0',
                isTheLie ? 'text-retro-p2' : isTruth ? 'text-retro-win' : 'text-retro-dim',
              )}>
                {isTheLie ? '✗' : isTruth ? '✓' : i + 1}
              </span>
              <span className="break-words">{s}</span>
              {isGuessed && !isReveal && (
                <span className="font-pixel text-[8px] text-retro-cta ml-auto shrink-0 mt-0.5">PICKED</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Reveal outcome + next round */}
      {isReveal && (
        <div className="text-center space-y-2">
          <p className={cn(
            'font-pixel text-xs',
            guessedRight ? 'text-retro-win text-glow-win' : 'text-retro-p2 text-glow-p2',
          )}>
            {guessedRight
              ? isGuesser ? 'YOU CAUGHT THE LIE!' : 'THEY CAUGHT YOUR LIE'
              : isSetter ? 'YOU FOOLED THEM!' : 'YOU GOT FOOLED'}
          </p>
          <p className="font-mono text-[10px] text-retro-dim">
            {(game.players?.[guessedRight ? guesser : setter]?.name || (guessedRight ? guesser : setter))} scores this round
          </p>
          {!isSpectator && (
            <div className="space-y-2">
              <button
                onClick={handleNextRound}
                className="mt-2 px-6 py-2.5 font-pixel text-[10px] border-2 border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 hover:bg-retro-tint-p1 transition-all active:scale-95"
              >
                NEXT ROUND
              </button>
              {onSwitchGame && !proposal && (
                <GameSwitcher currentType="twotruths" onSwitch={onSwitchGame} />
              )}
            </div>
          )}
        </div>
      )}

      {/* Setter lost their own secret (new tab) — the reveal can never land;
          give them a way out with no score change */}
      {setterMissingSecret && (
        <div className="text-center space-y-2">
          <p className="font-pixel text-[10px] text-retro-dim">
            THE REVEAL CAN&apos;T LAND WITHOUT YOUR SECRET
          </p>
          <button
            onClick={handleResetStuckRound}
            className="px-5 py-2 font-pixel text-[10px] border border-retro-p2 text-retro-p2 rounded hover:shadow-neon-p2 transition-all active:scale-95"
          >
            RESET ROUND
          </button>
        </div>
      )}

      {/* Setter lost their secret — let guesser bail out */}
      {!isReveal && !isSetter && !opponentOnline && (
        <div className="text-center space-y-2">
          <p className="font-pixel text-[10px] text-retro-dim">
            STORYTELLER IS OFFLINE — REVEAL WILL STALL
          </p>
          {isGuesser && (
            <button
              onClick={handleResetStuckRound}
              className="px-5 py-2 font-pixel text-[10px] border border-retro-p2 text-retro-p2 rounded hover:shadow-neon-p2 transition-all active:scale-95"
            >
              END ROUND
            </button>
          )}
        </div>
      )}
    </div>
  )
}
