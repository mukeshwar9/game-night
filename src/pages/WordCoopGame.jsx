import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { getAnswerList } from '../lib/dictionary'
import { getKeyboardState, isValidGuess } from '../lib/wordduelLogic'
import {
  applySharedGuess, buildWordCoopRoundStart, canSubmitGuess, getRoundOutcome,
  normalizeGuesses, MAX_GUESSES, WORD_LENGTH,
} from '../lib/wordcoopLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'
import Avatar from '../components/Avatar'
import GameSwitcher from '../components/GameSwitcher'
import ShareResultButton from '../components/ShareResultButton'

const KEY_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
]

const MARK_INFO = {
  G: { label: 'correct spot', icon: '✓', className: 'bg-retro-win border-retro-win text-retro-bg' },
  Y: { label: 'wrong spot', icon: '•', className: 'bg-retro-cta border-retro-cta text-retro-bg' },
  B: { label: 'not in word', icon: '×', className: 'bg-retro-dim border-retro-dim text-retro-bg' },
}

function SeatBadge({ symbol, player, small = false, online }) {
  const avatar = player?.avatar
  return (
    <div className={cn('flex items-center gap-1.5 min-w-0', small && 'gap-1')}>
      <div className="relative shrink-0">
        {avatar ? <Avatar id={avatar} size={small ? 22 : 30} /> : (
          <span className={cn(
            'flex items-center justify-center rounded font-pixel border',
            small ? 'w-[22px] h-[22px] text-[8px]' : 'w-[30px] h-[30px] text-[10px]',
            symbol === 'X' ? 'text-retro-p1 border-retro-p1 bg-retro-tint-p1' : 'text-retro-p2 border-retro-p2 bg-retro-tint-p2',
          )}>{symbol}</span>
        )}
        {online !== undefined && (
          <div
            className={cn(
              'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-retro-bg',
              online ? 'bg-retro-win' : 'bg-retro-dim',
            )}
            aria-hidden="true"
          />
        )}
      </div>
      <span className={cn('font-mono truncate', small ? 'text-[8px]' : 'text-[10px]')}>{player?.name || symbol}</span>
    </div>
  )
}

function MarkTile({ letter = '', mark = '', pending = false, index }) {
  const info = mark ? MARK_INFO[mark] : null
  const label = letter
    ? `${letter}, ${info?.label || 'pending'}`
    : 'empty tile'
  return (
    <div
      className={cn(
        'wordcoop-tile w-full aspect-square flex flex-col items-center justify-center rounded border-2',
        'font-pixel text-lg sm:text-2xl leading-none uppercase select-none',
        info?.className || 'bg-retro-card border-retro-border text-retro-text',
        pending && 'border-retro-cta shadow-neon-cta',
      )}
      style={mark ? { animationDelay: `${index * 70}ms` } : undefined}
      aria-label={label}
    >
      <span>{letter}</span>
      {info && <span className="font-mono text-[9px] leading-none mt-0.5" aria-hidden="true">{info.icon}</span>}
    </div>
  )
}

function OwnerChip({ guess, player, symbol, active }) {
  if (!guess && !active) return <div className="w-7" aria-hidden="true" />
  return (
    <div className={cn('w-7 flex justify-center', active && 'animate-pulse')} title={player?.name || symbol}>
      <SeatBadge symbol={symbol} player={player} small />
    </div>
  )
}

function SharedBoard({ guesses, currentGuess, currentPlayer, players, activeRow }) {
  return (
    <div className="w-full space-y-1.5" role="grid" aria-label="Shared six row word board">
      {Array.from({ length: MAX_GUESSES }).map((_, row) => {
        const guess = guesses[row]
        const pending = row === activeRow && currentGuess
          ? { word: currentGuess.padEnd(WORD_LENGTH, ' '), by: currentPlayer, pending: true }
          : guess
        const owner = pending?.by
        const partnerRow = guess && guess.by !== currentPlayer
        return (
          <div
            key={row}
            className={cn(
              'grid grid-cols-[1.75rem_repeat(5,minmax(0,1fr))] gap-1.5 items-stretch',
              row === activeRow && 'wordcoop-active-row',
              partnerRow && (guess.by === 'O' ? 'wordcoop-row-partner-o' : 'wordcoop-row-partner-x'),
            )}
            role="row"
          >
            <OwnerChip guess={guess} player={players?.[owner]} symbol={owner} active={row === activeRow && !!currentGuess} />
            {Array.from({ length: WORD_LENGTH }).map((__, col) => (
              <div key={col} role="gridcell">
                <MarkTile
                  letter={pending?.word?.[col] === ' ' ? '' : pending?.word?.[col]}
                  mark={pending?.marks?.[col]}
                  pending={pending?.pending}
                  index={col}
                />
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function Keyboard({ keyState, onKey, disabled }) {
  return (
    <div className="flex flex-col gap-1.5 w-full" aria-label="On-screen keyboard">
      {KEY_ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-1 w-full">
          {rowIndex === 2 && (
            <button
              type="button"
              onClick={() => onKey('ENTER')}
              disabled={disabled}
              aria-label="Lock guess"
              className="flex-[1.55] min-w-0 h-11 rounded border border-retro-cta bg-retro-tint-cta text-retro-cta font-pixel text-[9px] disabled:opacity-30"
            >↵</button>
          )}
          {row.map(letter => {
            const info = keyState[letter] ? MARK_INFO[keyState[letter]] : null
            return (
              <button
                type="button"
                key={letter}
                onClick={() => onKey(letter)}
                disabled={disabled}
                aria-label={`${letter}${info ? `, ${info.label}` : ''}`}
                className={cn(
                  'flex-1 min-w-0 h-11 rounded border font-pixel text-xs sm:text-sm transition-colors',
                  info?.className || 'border-retro-structure bg-retro-structure text-retro-text',
                  'hover:opacity-80 disabled:opacity-30 disabled:cursor-default',
                )}
              >{letter}</button>
            )
          })}
          {rowIndex === 2 && (
            <button
              type="button"
              onClick={() => onKey('BACK')}
              disabled={disabled}
              aria-label="Delete last letter"
              className="flex-[1.55] min-w-0 h-11 rounded border border-retro-cta bg-retro-tint-cta text-retro-cta font-pixel text-sm disabled:opacity-30"
            >⌫</button>
          )}
        </div>
      ))}
    </div>
  )
}

function ResultCard({ result, guesses, players }) {
  const solvedByName = result?.solvedBy ? players?.[result.solvedBy]?.name || result.solvedBy : null
  return (
    <div className={cn(
      'w-full rounded border-2 p-4 text-center space-y-2',
      result?.outcome === 'win' ? 'border-retro-win bg-retro-card shadow-neon-win' : 'border-retro-cta bg-retro-tint-cta',
    )}>
      <p className={cn('font-pixel text-xl tracking-widest', result?.outcome === 'win' ? 'text-retro-win text-glow-cta' : 'text-retro-cta')}>
        {result?.outcome === 'win' ? 'SOLVED TOGETHER' : 'WORD ESCAPED'}
      </p>
      {result?.outcome === 'win' ? (
        <p className="font-mono text-[11px] text-retro-text">
          {solvedByName || 'Your partner'} found it in {guesses.length}/{MAX_GUESSES} guesses.
        </p>
      ) : (
        <p className="font-mono text-[11px] text-retro-text">ANSWER WAS <span className="font-pixel text-retro-cta tracking-widest">{result?.answer}</span></p>
      )}
    </div>
  )
}

export default function WordCoopGame({
  gameId, game, mySymbol, opponentOnline, onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const [currentGuess, setCurrentGuess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [playAgainBusy, runPlayAgain] = useBusy()
  const [newMatchBusy, runNewMatch] = useBusy()
  const inputRef = useRef(null)
  const previousRound = useRef(null)
  const answerList = useMemo(() => getAnswerList(), [])
  const round = game?.round || null
  const guesses = normalizeGuesses(round?.guesses)
  const isSpectator = !mySymbol
  const canAct = !isSpectator && canSubmitGuess(round, mySymbol) && opponentOnline !== false
  const keyState = useMemo(() => getKeyboardState(guesses), [guesses])
  const score = Math.min(game?.scores?.X || 0, game?.scores?.O || 0)
  const result = round?.result || null
  const partner = mySymbol === 'X' ? 'O' : 'X'
  const activeRow = round?.phase === 'playing' ? guesses.length : -1
  const latestPartnerGuess = [...guesses].reverse().find(guess => guess.by === partner)

  // First observing client initializes one shared round. Transaction guard makes
  // simultaneous observers safe and keeps answer selection server-consistent.
  useEffect(() => {
    if (!game || game.gameType !== 'wordcoop' || game.status !== 'playing' || game.round) return
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || current.gameType !== 'wordcoop' || current.status !== 'playing' || current.round) return
      const seed = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const starter = current.starter === 'O' ? 'O' : 'X'
      const round = buildWordCoopRoundStart({
        answerList,
        previousRound: null,
        seed,
        starter,
      })
      return {
        ...current,
        starter,
        currentTurn: starter,
        round,
        lastActivityAt: Date.now(),
      }
    }).catch(() => {})
  }, [answerList, game, gameId])

  // Page owns co-op move and reveal feedback because top-level winner remains
  // unset while a room continues into another shared word.
  useEffect(() => {
    const oldRound = previousRound.current
    if (!round) return
    if (oldRound) {
      if (oldRound.phase === 'playing' && round.phase === 'reveal') {
        if (getRoundOutcome(round) === 'win') sounds.win()
        else sounds.lose()
      }
    }
    previousRound.current = round
  }, [guesses, mySymbol, round])

  useEffect(() => {
    if (!canAct) return
    inputRef.current?.focus()
  }, [canAct, round?.currentTurn])

  const submitGuess = useCallback(async () => {
    if (submitting || !canAct) return
    const guess = currentGuess.trim().toUpperCase()
    if (guess.length !== WORD_LENGTH) {
      toast.error('USE FIVE LETTERS')
      return
    }
    if (!isValidGuess(guess)) {
      sounds.miss()
      toast.error('NOT IN WORD LIST')
      return
    }
    setSubmitting(true)
    try {
      const resultTx = await runTransaction(ref(db, `games/${gameId}`), current => {
        const liveRound = current?.round
        if (!current || current.status !== 'playing' || current.gameType !== 'wordcoop') return
        const answer = (typeof liveRound?.answer === 'string' && liveRound.answer)
          || answerList[liveRound?.answerIndex]
        const nextRound = applySharedGuess(liveRound, { player: mySymbol, guess, answer, at: Date.now() })
        if (!nextRound) return
        const next = {
          ...current,
          round: nextRound,
          currentTurn: nextRound.currentTurn,
          lastActivityAt: Date.now(),
          proposal: null,
        }
        if (nextRound.result?.outcome === 'win') {
          next.scores = { X: (current.scores?.X || 0) + 1, O: (current.scores?.O || 0) + 1 }
        }
        return next
      })
      if (!resultTx.committed) {
        toast.error('TURN MOVED — TRY AGAIN')
        return
      }
      sounds.move(mySymbol)
      setCurrentGuess('')
    } catch {
      toast.error('GUESS FAILED — CHECK CONNECTION')
    } finally {
      setSubmitting(false)
    }
  }, [answerList, canAct, currentGuess, gameId, mySymbol, submitting])

  const onKey = useCallback((key) => {
    if (!canAct || submitting) return
    if (key === 'ENTER') return submitGuess()
    if (key === 'BACK') return setCurrentGuess(value => value.slice(0, -1))
    if (/^[A-Z]$/.test(key) && currentGuess.length < WORD_LENGTH) setCurrentGuess(value => value + key)
  }, [canAct, currentGuess.length, submitGuess, submitting])

  useEffect(() => {
    const handler = event => {
      if (event.ctrlKey || event.metaKey || event.altKey || !canAct) return
      if (event.key === 'Enter') { event.preventDefault(); onKey('ENTER') }
      else if (event.key === 'Backspace') { event.preventDefault(); onKey('BACK') }
      else if (/^[a-zA-Z]$/.test(event.key)) { event.preventDefault(); onKey(event.key.toUpperCase()) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canAct, onKey])

  const status = isSpectator
    ? 'SPECTATING'
    : result?.outcome === 'win'
      ? 'YOU BOTH WIN!'
      : result?.outcome === 'loss'
        ? 'WORD ESCAPED'
        : canAct
          ? 'YOUR TURN'
          : opponentOnline === false
            ? 'PARTNER OFFLINE'
            : 'PARTNER THINKING…'

  const requestPlayAgain = () => runPlayAgain(async () => {
    if (onPlayAgain) await onPlayAgain()
  }, () => toast.error('PLAY AGAIN FAILED'))
  const requestNewMatch = () => runNewMatch(async () => {
    if (onNewMatch) await onNewMatch()
  }, () => toast.error('NEW MATCH FAILED'))

  if (!round) {
    return <div className="py-10 text-center font-pixel text-[10px] text-retro-dim arcade-blink">PREPARING SHARED WORD…</div>
  }

  return (
    <div className="flex flex-col items-center gap-4 py-2 max-w-md mx-auto">
      <div className="w-full flex items-center justify-between gap-2">
        <SeatBadge symbol="X" player={game.players?.X} online={isSpectator ? undefined : (mySymbol === 'X' ? true : opponentOnline)} />
        <div className="flex flex-col items-center gap-1">
          <span className={cn(
            'px-3 py-1.5 rounded-full border font-pixel text-[9px] tracking-widest text-center',
            result?.outcome === 'win' ? 'border-retro-win text-retro-win bg-retro-card' : result?.outcome === 'loss' ? 'border-retro-cta text-retro-cta bg-retro-tint-cta' : canAct ? 'border-retro-cta text-retro-cta bg-retro-tint-cta shadow-neon-cta' : 'border-retro-border text-retro-dim',
          )} aria-live="polite">{status}</span>
          <span className="font-pixel text-[8px] text-retro-dim tracking-widest">WINS {score}</span>
        </div>
        <SeatBadge symbol="O" player={game.players?.O} online={isSpectator ? undefined : (mySymbol === 'O' ? true : opponentOnline)} />
      </div>

      <p className="font-mono text-[10px] text-retro-dim text-center max-w-xs">
        {result ? 'One board. One word. One team.' : canAct ? 'Build on your partner’s clues, then lock the next guess.' : 'Your partner is working the shared board.'}
      </p>

      <div className="w-full flex justify-center">
        <SharedBoard
          guesses={guesses}
          currentGuess={currentGuess}
          currentPlayer={mySymbol}
          players={game.players}
          activeRow={activeRow}
        />
      </div>

      {latestPartnerGuess && !result && (
        <p className="w-full text-center font-mono text-[10px] text-retro-dim" aria-live="polite">
          <span className="text-retro-p2">{game.players?.[partner]?.name || partner}</span> played {latestPartnerGuess.word}
        </p>
      )}

      {result ? (
        <>
          <ResultCard result={result} guesses={guesses} players={game.players} />
          {!proposal && (
            <div className="w-full flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={requestPlayAgain}
                disabled={playAgainBusy || !onPlayAgain}
                className="min-h-11 px-4 py-2.5 rounded bg-retro-cta text-retro-bg font-pixel text-[10px] hover:shadow-neon-cta disabled:opacity-50"
              >{playAgainBusy ? 'LOADING…' : 'PLAY AGAIN'}</button>
              <button
                type="button"
                onClick={requestNewMatch}
                disabled={newMatchBusy || !onNewMatch}
                className="min-h-11 px-4 py-2.5 rounded border-2 border-retro-border text-retro-text font-pixel text-[10px] hover:border-retro-p1/60 disabled:opacity-50"
              >{newMatchBusy ? 'RESETTING…' : 'NEW MATCH'}</button>
              <ShareResultButton
                gameLabel="WORD CO-OP"
                headline={result?.outcome === 'win' ? 'SOLVED TOGETHER!' : 'WORD ESCAPED'}
                sub={result?.outcome === 'win' ? `SOLVED IN ${guesses.length}/${MAX_GUESSES} GUESSES` : undefined}
                accentVar={result?.outcome === 'win' ? '--c-win' : '--c-cta'}
                url={window.location.href}
              />
              {onSwitchGame && <GameSwitcher currentType="wordcoop" onSwitch={onSwitchGame} />}
            </div>
          )}
        </>
      ) : (
        <>
          <input
            ref={inputRef}
            value={currentGuess}
            onChange={event => setCurrentGuess(event.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, WORD_LENGTH))}
            aria-label="Current shared guess"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck="false"
            className="sr-only"
          />
          <div className="w-full flex items-center justify-between gap-2">
            <span className="font-pixel text-[8px] text-retro-dim tracking-wider">{canAct ? 'YOUR GUESS' : 'WAITING FOR PARTNER'}</span>
            <button
              type="button"
              onClick={submitGuess}
              disabled={!canAct || submitting || currentGuess.length !== WORD_LENGTH}
              className="min-h-11 px-4 rounded border-2 border-retro-cta text-retro-cta font-pixel text-[9px] tracking-wider hover:bg-retro-tint-cta disabled:opacity-40"
            >{submitting ? 'LOCKING…' : 'LOCK GUESS'}</button>
          </div>
          <Keyboard keyState={keyState} onKey={onKey} disabled={!canAct || submitting} />
          {!canAct && opponentOnline === false && <p className="font-pixel text-[9px] text-retro-p2">PARTNER MUST RECONNECT TO PLAY</p>}
        </>
      )}
    </div>
  )
}
