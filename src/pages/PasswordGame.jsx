import { useCallback, useEffect, useRef, useState } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import { sounds } from '../lib/sounds'
import useBusy from '../hooks/useBusy'
import OfflineNotice from '../components/loading/OfflineNotice'
import GameSwitcher from '../components/GameSwitcher'
import PasswordCard from '../components/PasswordCard'
import { PASSWORD_DECK } from '../lib/decks/password'
import { INTRO_MS, MAX_CLUES } from '../lib/passwordLogic'
import {
  advanceAfterReveal, applyClue, applyGuess, createInitialRound,
  pickWord, validateClue,
} from '../lib/passwordLogic'

function normalizeList(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return Object.keys(raw)
    .sort((a, b) => Number(a) - Number(b))
    .map(key => raw[key])
}

function matchSeed() {
  try { return crypto.randomUUID() } catch { return `${Date.now()}-${Math.random()}` }
}

function ActionButton({ children, busy, onClick, disabled = false, secondary = false, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy || disabled}
      className={secondary
        ? 'min-h-11 px-5 py-2.5 border-2 border-retro-border text-retro-text font-pixel text-[10px] rounded hover:border-retro-p1 hover:text-retro-p1 transition-all active:scale-95 disabled:opacity-50'
        : 'min-h-11 px-5 py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50'}
    >
      {busy ? 'SENDING…' : children}
    </button>
  )
}

export default function PasswordGame({
  gameId, game, mySymbol, opponentOnline, onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [busy, runBusy] = useBusy()
  const inputRef = useRef(null)
  const previousPhase = useRef(null)
  const [clock, setClock] = useState(() => Date.now())

  const round = game?.round || null
  const phase = round?.phase || 'starting'
  const clues = normalizeList(round?.clues)
  const guesses = normalizeList(round?.guesses)
  const word = PASSWORD_DECK[Number(round?.wordIndex)]?.word || ''
  const isClueGiver = mySymbol && mySymbol === round?.clueGiver
  const isGuesser = mySymbol && mySymbol === round?.guesser
  const isSpectator = !mySymbol
  const matchFinished = game?.status === 'finished'

  // First seated client initializes the shared round after the second seat joins.
  useEffect(() => {
    if (!game || game.status !== 'playing' || game.round || !mySymbol) return
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || current.status !== 'playing' || current.round) return
      const seed = matchSeed()
      const wordIndex = pickWord(PASSWORD_DECK, seed, [])
      const starter = current.starter === 'O' ? 'O' : 'X'
      return {
        ...current,
        round: {
          ...createInitialRound({
            starter,
            seed,
            wordIndex,
            wordLength: PASSWORD_DECK[wordIndex]?.word.length,
          }),
          endsAt: Date.now() + INTRO_MS,
        },
        lastActivityAt: Date.now(),
      }
    }).catch(() => {})
  }, [game, gameId, mySymbol])

  // Small local ticker drives intro/reveal deadlines. Transaction guards make
  // simultaneous transitions safe when both clients hit the deadline.
  useEffect(() => {
    if (phase !== 'intro' && phase !== 'reveal') return
    const timer = setInterval(() => setClock(Date.now()), 250)
    return () => clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (!round?.endsAt || clock < round.endsAt || (phase !== 'intro' && phase !== 'reveal')) return
    runTransaction(ref(db, `games/${gameId}`), current => {
      const currentRound = current?.round
      if (!current || current.status !== 'playing' || !currentRound || currentRound.phase !== phase || currentRound.endsAt !== round.endsAt) return
      if (phase === 'intro') {
        return { ...current, round: { ...currentRound, phase: 'clue', endsAt: null }, lastActivityAt: Date.now() }
      }
      const advanced = advanceAfterReveal(currentRound, current.scores || { X: 0, O: 0 }, PASSWORD_DECK, Date.now())
      if (!advanced) return
      return {
        ...current,
        ...advanced,
        winner: advanced.winner || null,
        proposal: null,
        lastActivityAt: Date.now(),
      }
    }).catch(() => {})
  }, [clock, phase, round?.endsAt, gameId])

  useEffect(() => {
    if (!round || previousPhase.current === phase) return
    const from = previousPhase.current
    previousPhase.current = phase
    if (!from) return
    if (phase === 'clue') sounds.go()
    if (phase === 'guess') sounds.bell()
    if (phase === 'reveal') {
      if (round.lastDelta?.points) sounds.win()
      else sounds.miss()
    }
  }, [phase, round])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears local entry when Firebase phase/round advances
    setInput('')
    setError('')
    if ((phase === 'clue' && isClueGiver) || (phase === 'guess' && isGuesser)) {
      const timer = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(timer)
    }
  }, [phase, round?.roundNum, isClueGiver, isGuesser])

  const submitClue = useCallback(async () => {
    const check = validateClue({ clue: input, word, previousClues: clues })
    if (!check.valid) { setError(check.reason); return }
    setError('')
    await runBusy(async () => {
      const result = await runTransaction(ref(db, `games/${gameId}`), current => {
        const currentRound = current?.round
        if (!current || current.status !== 'playing' || !currentRound || currentRound.phase !== 'clue' || currentRound.clueGiver !== mySymbol) return
        const nextRound = applyClue({ ...currentRound, word }, input, Date.now())
        if (!nextRound) return
        return { ...current, round: nextRound, lastActivityAt: Date.now() }
      })
      if (!result.committed) throw new Error('clue rejected')
      setInput('')
      sounds.move(mySymbol)
    }, () => toast.error('CLUE FAILED — CHECK CONNECTION'))
  }, [clues, gameId, input, mySymbol, runBusy, word])

  const submitGuess = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed) { setError('ENTER A GUESS'); return }
    if (trimmed.length > 24) { setError('GUESS MUST BE 24 CHARACTERS OR LESS'); return }
    setError('')
    await runBusy(async () => {
      const result = await runTransaction(ref(db, `games/${gameId}`), current => {
        const currentRound = current?.round
        if (!current || current.status !== 'playing' || !currentRound || currentRound.phase !== 'guess' || currentRound.guesser !== mySymbol) return
        const nextRound = applyGuess(currentRound, trimmed, word, Date.now())
        if (!nextRound) return
        const scores = { X: current.scores?.X || 0, O: current.scores?.O || 0 }
        if (nextRound.lastDelta?.points) scores[nextRound.lastDelta.player] += nextRound.lastDelta.points
        return { ...current, round: nextRound, scores, lastActivityAt: Date.now() }
      })
      if (!result.committed) throw new Error('guess rejected')
      setInput('')
      sounds.move(mySymbol)
    }, () => toast.error('GUESS FAILED — CHECK CONNECTION'))
  }, [gameId, input, mySymbol, runBusy, word])

  const submit = phase === 'clue' ? submitClue : submitGuess
  const canSubmit = phase === 'clue' ? isClueGiver : isGuesser
  const matchWinner = game?.winner || null

  if (matchFinished) {
    const draw = matchWinner === 'draw'
    const won = matchWinner === mySymbol
    return (
      <div className="space-y-5 text-center py-4" aria-live="polite">
        <p className="font-pixel text-[10px] text-retro-dim tracking-widest">PASSWORD DUEL COMPLETE</p>
        <p className={`font-pixel text-lg ${draw ? 'text-retro-text' : won ? 'text-retro-win text-glow-win' : 'text-retro-p2'}`}>
          {draw ? 'DRAW!' : won ? 'YOU WIN!' : `${game.players?.[matchWinner]?.name || matchWinner} WINS`}
        </p>
        <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto">
          {['X', 'O'].map(symbol => (
            <div key={symbol} className="rounded border border-retro-border bg-retro-card p-3">
              <p className="font-pixel text-[8px] text-retro-dim truncate">{game.players?.[symbol]?.name || symbol}</p>
              <p className={`font-pixel text-2xl mt-2 ${symbol === 'X' ? 'text-retro-p1' : 'text-retro-p2'}`}>{game.scores?.[symbol] || 0}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {!proposal && onPlayAgain && (
            <ActionButton onClick={onPlayAgain} secondary>PLAY AGAIN</ActionButton>
          )}
          {!proposal && onNewMatch && (
            <ActionButton onClick={onNewMatch}>NEW MATCH</ActionButton>
          )}
        </div>
        {!proposal && onSwitchGame && <GameSwitcher currentType="password" onSwitch={onSwitchGame} />}
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-sm mx-auto">
      <PasswordCard
        phase={phase}
        word={word}
        wordPattern={round?.wordPattern}
        canSeeSecret={!!isClueGiver}
        clues={clues}
        guesses={guesses}
        roundNum={round?.roundNum || 1}
        scores={game?.scores}
        players={game?.players}
        mySymbol={mySymbol}
        clueGiver={round?.clueGiver}
        guesser={round?.guesser}
      />

      {isSpectator && <p className="font-pixel text-[9px] text-retro-dim text-center">SPECTATING · SECRET LOCKED UNTIL REVEAL</p>}
      {!isSpectator && !opponentOnline && <OfflineNotice label="OPPONENT" />}

      {canSubmit && (phase === 'clue' || phase === 'guess') && (
        <form onSubmit={event => { event.preventDefault(); submit() }} className="space-y-2">
          <label htmlFor="password-entry" className="sr-only">
            {phase === 'clue' ? 'One-word clue' : 'Guess the password'}
          </label>
          <div className="flex gap-2">
            <input
              id="password-entry"
              ref={inputRef}
              value={input}
              onChange={event => { setInput(event.target.value); setError('') }}
              maxLength={phase === 'clue' ? 16 : 24}
              autoComplete="off"
              spellCheck="false"
              aria-describedby={error ? 'password-entry-error' : undefined}
              placeholder={phase === 'clue' ? 'TYPE ONE-WORD CLUE…' : 'TYPE YOUR GUESS…'}
              className="min-h-11 min-w-0 flex-1 bg-retro-card border-2 border-retro-border text-retro-text font-mono text-sm rounded px-3 focus:outline-none focus:border-retro-p1 transition-colors placeholder:text-retro-dim/60"
            />
            <ActionButton type="submit" busy={busy}>{phase === 'clue' ? 'SEND CLUE' : 'GUESS'}</ActionButton>
          </div>
          {error && <p id="password-entry-error" role="alert" className="font-pixel text-[9px] text-retro-danger">{error}</p>}
          {phase === 'clue' && <p className="font-mono text-[9px] text-retro-dim">ONE WORD · MAX 16 CHARACTERS · {MAX_CLUES - clues.length} CLUES LEFT</p>}
        </form>
      )}

      {phase === 'intro' && <p className="font-pixel text-[10px] text-retro-cta text-center arcade-blink">REVEALING ROLES…</p>}
      {phase === 'reveal' && (
        <div className="text-center space-y-1" aria-live="polite">
          {round?.lastDelta?.points ? (
            <p className="font-pixel text-base text-retro-win text-glow-win">+{round.lastDelta.points} FOR {game.players?.[round.lastDelta.player]?.name || round.lastDelta.player}</p>
          ) : <p className="font-pixel text-[10px] text-retro-dim">NO POINTS THIS ROUND</p>}
          <p className="font-mono text-[10px] text-retro-dim">NEXT ROUND SWAPS CLUE-GIVER</p>
        </div>
      )}

      {!proposal && onSwitchGame && <GameSwitcher currentType="password" onSwitch={onSwitchGame} />}
    </div>
  )
}
