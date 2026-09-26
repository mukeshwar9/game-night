import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ref, runTransaction, set } from 'firebase/database'
import { db } from '../lib/firebase'
import { getAnswerList } from '../lib/dictionary'
import { getKeyboardState, guessProblem } from '../lib/wordduelLogic'
import {
  applySharedGuess, buildWordCoopRoundStart, canSubmitGuess, getRoundOutcome,
  normalizeCoopStats, normalizeGuesses, sanitizeDraft,
  DRAFT_WRITE_MS, MAX_GUESSES, PARTNER_OFFLINE_SOLO_MS, WORD_LENGTH,
} from '../lib/wordcoopLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import useBusy from '../hooks/useBusy'
import Avatar from '../components/Avatar'
import GameSwitcher from '../components/GameSwitcher'
import MarkTile from '../components/MarkTile'
import WordKeyboard from '../components/WordKeyboard'
import WordFeedback from '../components/WordFeedback'

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

function OwnerChip({ guess, player, symbol, active }) {
  if (!guess && !active) return <div className="w-7" aria-hidden="true" />
  return (
    <div className={cn('w-7 flex justify-center', active && 'animate-pulse')} title={player?.name || symbol}>
      <SeatBadge symbol={symbol} player={player} small />
    </div>
  )
}

// `draft` is the row being typed on the active line — mine on my turn, or my
// partner's live draft (round/draft{X|O}) on theirs.
function SharedBoard({ guesses, draft, draftBy, viewer, players, activeRow }) {
  return (
    <div className="w-full space-y-1.5" role="grid" aria-label="Shared six row word board">
      {Array.from({ length: MAX_GUESSES }).map((_, row) => {
        const guess = guesses[row]
        const pending = row === activeRow && draft
          ? { word: draft.padEnd(WORD_LENGTH, ' '), by: draftBy, pending: true }
          : guess
        const owner = pending?.by
        const partnerRow = guess && guess.by !== viewer
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
            <OwnerChip guess={guess} player={players?.[owner]} symbol={owner} active={row === activeRow && !!draft} />
            {Array.from({ length: WORD_LENGTH }).map((__, col) => (
              <div key={col} role="gridcell">
                <MarkTile
                  size="fluid"
                  className={cn(
                    'wordcoop-tile font-pixel',
                    pending?.pending && pending?.word?.[col]?.trim() && (draftBy === viewer ? 'shadow-neon-cta' : 'opacity-70'),
                  )}
                  style={pending?.marks?.[col] ? { animationDelay: `${col * 70}ms` } : undefined}
                  letter={pending?.word?.[col] === ' ' ? '' : pending?.word?.[col]}
                  mark={pending?.marks?.[col] || null}
                  pending={pending?.pending}
                />
              </div>
            ))}
          </div>
        )
      })}
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
  const [feedback, setFeedback] = useState(null)
  const [submitting, runSubmit] = useBusy()
  const [playAgainBusy, runPlayAgain] = useBusy()
  const [newMatchBusy, runNewMatch] = useBusy()
  const [soloArmed, setSoloArmed] = useState(false)
  const inputRef = useRef(null)
  const previousRound = useRef(null)
  const lastDraftSent = useRef('')
  const answerList = useMemo(() => getAnswerList(), [])
  const round = game?.round || null
  const roundId = round?.seed || ''
  const guesses = normalizeGuesses(round?.guesses)
  const isSpectator = !mySymbol
  const playing = game?.status === 'playing' && round?.phase === 'playing'
  const partner = mySymbol === 'X' ? 'O' : 'X'

  // Partner offline for PARTNER_OFFLINE_SOLO_MS: the online player may take
  // the partner's turns instead of the board freezing.
  const partnerOffline = !isSpectator && opponentOnline === false
  useEffect(() => {
    if (!partnerOffline) return undefined
    const t = setTimeout(() => setSoloArmed(true), PARTNER_OFFLINE_SOLO_MS)
    return () => { clearTimeout(t); setSoloArmed(false) }
  }, [partnerOffline])
  const solo = partnerOffline && soloArmed

  const myTurn = !isSpectator && canSubmitGuess(round, mySymbol)
  const canAct = !isSpectator && game?.status === 'playing' && canSubmitGuess(round, mySymbol, { solo }) && (opponentOnline !== false || solo)
  const keyState = getKeyboardState(guesses)
  const score = Math.min(game?.scores?.X || 0, game?.scores?.O || 0)
  const stats = normalizeCoopStats(round?.stats)
  const result = round?.result || null
  const activeRow = round?.phase === 'playing' ? guesses.length : -1
  const latestPartnerGuess = [...guesses].reverse().find(guess => guess.by === partner)
  const partnerTurn = playing && round?.currentTurn === partner && !solo
  const partnerDraft = partnerTurn ? sanitizeDraft(round?.[`draft${partner}`]) : ''
  const partnerName = game?.players?.[partner]?.name || partner

  // A new shared word clears whatever I had typed for the last one.
  const [trackedRoundId, setTrackedRoundId] = useState(roundId)
  if (trackedRoundId !== roundId) {
    setTrackedRoundId(roundId)
    setCurrentGuess('')
    setFeedback(null)
  }

  // First observing client initializes one shared round. Transaction guard makes
  // simultaneous observers safe and keeps answer selection server-consistent.
  const needsRound = !!game && game.gameType === 'wordcoop' && game.status === 'playing' && !game.round
  useEffect(() => {
    if (!needsRound) return
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
  }, [answerList, needsRound, gameId])

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
  }, [round])

  // Turn chime: a short cue whenever the turn becomes mine (not on load).
  const turnNow = playing ? round?.currentTurn : null
  const previousTurn = useRef(turnNow)
  useEffect(() => {
    if (!isSpectator && turnNow === mySymbol && previousTurn.current !== mySymbol) sounds.go()
    previousTurn.current = turnNow
  }, [turnNow, mySymbol, isSpectator])

  useEffect(() => {
    if (!canAct) return
    inputRef.current?.focus()
  }, [canAct, round?.currentTurn])

  // Live draft: debounce-write what I'm typing to round/draft{me} so my
  // partner watches the row form on my turn.
  useEffect(() => {
    if (!canAct || !myTurn || !roundId) return undefined
    const draft = sanitizeDraft(currentGuess)
    if (draft === lastDraftSent.current) return undefined
    const t = setTimeout(() => {
      lastDraftSent.current = draft
      set(ref(db, `games/${gameId}/round/draft${mySymbol}`), draft || null).catch(() => {})
    }, DRAFT_WRITE_MS)
    return () => clearTimeout(t)
  }, [currentGuess, canAct, myTurn, roundId, gameId, mySymbol])
  useEffect(() => { lastDraftSent.current = '' }, [roundId, round?.currentTurn])

  const submitGuess = useCallback(() => {
    if (submitting || !canAct) return
    const guess = currentGuess.trim().toUpperCase()
    const problem = guessProblem(guess)
    if (problem) {
      sounds.miss()
      setFeedback(prev => ({ message: problem, tone: 'bad', id: (prev?.id || 0) + 1 }))
      return
    }
    setFeedback(null)
    runSubmit(async () => {
      const resultTx = await runTransaction(ref(db, `games/${gameId}`), current => {
        const liveRound = current?.round
        if (!current || current.status !== 'playing' || current.gameType !== 'wordcoop') return
        const answer = (typeof liveRound?.answer === 'string' && liveRound.answer)
          || answerList[liveRound?.answerIndex]
        const nextRound = applySharedGuess(liveRound, { player: mySymbol, guess, answer, at: Date.now(), solo })
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
        // Benign: my partner locked a row first or the word just ended — the
        // board already shows why. Keep what I typed; no error toast.
        setFeedback(prev => ({ message: 'YOUR PARTNER MOVED FIRST', tone: 'info', id: (prev?.id || 0) + 1 }))
        return
      }
      sounds.move(mySymbol)
      lastDraftSent.current = ''
      setCurrentGuess('')
    }, () => toast.error('GUESS FAILED — CHECK CONNECTION'))
  }, [answerList, canAct, currentGuess, gameId, mySymbol, runSubmit, solo, submitting])

  const onKey = useCallback((key) => {
    if (!canAct || submitting) return
    if (key === 'ENTER') return submitGuess()
    if (key === 'BACK') {
      setFeedback(null)
      return setCurrentGuess(value => value.slice(0, -1))
    }
    if (/^[A-Z]$/.test(key) && currentGuess.length < WORD_LENGTH) {
      setFeedback(null)
      setCurrentGuess(value => value + key)
    }
  }, [canAct, currentGuess.length, submitGuess, submitting])

  const status = isSpectator
    ? 'SPECTATING'
    : result?.outcome === 'win'
      ? 'YOU BOTH WIN!'
      : result?.outcome === 'loss'
        ? 'WORD ESCAPED'
        : solo
          ? 'PLAYING SOLO'
          : canAct
            ? 'YOUR TURN'
            : partnerOffline
              ? 'PARTNER OFFLINE'
              : 'PARTNER THINKING…'

  const requestPlayAgain = () => runPlayAgain(async () => {
    if (onPlayAgain) await onPlayAgain()
  }, () => toast.error('PLAY AGAIN FAILED — CHECK CONNECTION'))
  const requestNewMatch = () => runNewMatch(async () => {
    if (onNewMatch) await onNewMatch()
  }, () => toast.error('NEW MATCH FAILED — CHECK CONNECTION'))

  if (!round) {
    return <div className="py-10 text-center font-pixel text-[10px] text-retro-dim arcade-blink">PREPARING SHARED WORD…</div>
  }

  const draft = canAct ? currentGuess : partnerDraft
  const draftBy = canAct ? mySymbol : partner

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
          <span
            className="font-pixel text-[8px] text-retro-dim tracking-widest text-center"
            aria-label={`Current streak ${stats.streak}, best streak ${stats.bestStreak}, losses ${stats.losses}`}
          >
            STREAK {stats.streak} · BEST {stats.bestStreak} · LOSSES {stats.losses}
          </span>
        </div>
        <SeatBadge symbol="O" player={game.players?.O} online={isSpectator ? undefined : (mySymbol === 'O' ? true : opponentOnline)} />
      </div>

      {solo && !result && (
        <p className="w-full text-center font-pixel text-[9px] text-retro-p2 tracking-wider" role="status">
          PARTNER OFFLINE — PLAYING SOLO
        </p>
      )}

      <p className="font-mono text-[10px] text-retro-dim text-center max-w-xs">
        {result ? 'One board. One word. One team.'
          : solo ? 'Take every turn until your partner is back.'
          : canAct ? 'Build on your partner’s clues, then lock the next guess.'
          : partnerDraft ? `${partnerName} is typing…`
          : 'Your partner is working the shared board.'}
      </p>

      <div className="w-full flex justify-center">
        <SharedBoard
          guesses={guesses}
          draft={draft}
          draftBy={draftBy}
          viewer={mySymbol}
          players={game.players}
          activeRow={activeRow}
        />
      </div>

      {latestPartnerGuess && !result && (
        <p className="w-full text-center font-mono text-[10px] text-retro-dim" aria-live="polite">
          <span className="text-retro-p2">{partnerName}</span> played {latestPartnerGuess.word}
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
              {onSwitchGame && <GameSwitcher currentType="wordcoop" onSwitch={onSwitchGame} />}
            </div>
          )}
        </>
      ) : !isSpectator && (
        <>
          <input
            ref={inputRef}
            value={currentGuess}
            onChange={event => {
              setFeedback(null)
              setCurrentGuess(event.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, WORD_LENGTH))
            }}
            onKeyDown={event => {
              // The sr-only input keeps the phone keyboard up; physical Enter
              // typed into it locks the guess (useGameKeys skips text fields).
              if (event.key === 'Enter' && !event.repeat) { event.preventDefault(); submitGuess() }
            }}
            readOnly={!canAct}
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
          <WordFeedback message={feedback?.message} tone={feedback?.tone || 'bad'} id={feedback?.id} />
          <WordKeyboard keyState={keyState} onKey={onKey} disabled={!canAct || submitting} enterLabel="Lock guess" />
          {!canAct && partnerOffline && !solo && (
            <p className="font-pixel text-[9px] text-retro-p2 text-center">
              PARTNER OFFLINE — YOU CAN PLAY SOLO IF THEY&apos;RE NOT BACK IN {Math.round(PARTNER_OFFLINE_SOLO_MS / 1000)}S
            </p>
          )}
        </>
      )}
    </div>
  )
}
