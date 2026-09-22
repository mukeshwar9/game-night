import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { onValue, ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { getAnswerList } from '../lib/dictionary'
import {
  FINISH_GRACE_MS,
  MATCH_TARGET,
  MAX_GUESSES,
  WORD_LENGTH,
  applyGuessForPlayer,
  compareRace,
  getKeyboardState,
  getRaceReason,
  isValidGuess,
  normalizeGuesses,
  pickAnswer,
  shouldReveal,
} from '../lib/wordraceLogic'
import { sounds } from '../lib/sounds'
import GameSwitcher from '../components/GameSwitcher'
import ShareResultButton from '../components/ShareResultButton'
import OfflineNotice from '../components/loading/OfflineNotice'
import PixelDots from '../components/loading/PixelDots'
import useBusy from '../hooks/useBusy'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  WordRaceBoard,
  WordRaceKeyboard,
  WordRaceMeter,
} from '../components/WordRaceBoards'

const ANSWERS = getAnswerList()

function normalizeNumbers(raw) {
  if (Array.isArray(raw)) return raw.filter(value => value != null).map(Number)
  if (!raw) return []
  return Object.keys(raw)
    .sort((a, b) => Number(a) - Number(b))
    .map(key => Number(raw[key]))
    .filter(Number.isInteger)
}

function createSeed() {
  try {
    const bytes = new Uint32Array(2)
    crypto.getRandomValues(bytes)
    return `${Date.now()}-${bytes[0].toString(16)}${bytes[1].toString(16)}`
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

function formatTimer(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function ScoreRail({ game, mySymbol, roundNum, isSpectator }) {
  const scores = game.scores || { X: 0, O: 0 }
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded border border-retro-border bg-retro-card px-3 py-2">
      {['X', 'O'].map((symbol, index) => {
        const isMe = symbol === mySymbol
        const color = symbol === 'X' ? 'text-retro-p1' : 'text-retro-p2'
        return (
          <div key={symbol} className={cn('min-w-0', index === 0 ? 'col-start-1' : 'col-start-3', index === 1 && 'text-right')}>
            <p className={cn('font-pixel text-[9px] tracking-widest truncate', color)}>
              {isSpectator ? symbol : isMe ? 'YOU' : 'OPPONENT'}
            </p>
            <div className={cn('flex items-center gap-2', index === 1 && 'justify-end')}>
              <span className="font-mono text-xs text-retro-dim truncate">{game.players?.[symbol]?.name || symbol}</span>
              <span className={cn('font-pixel text-lg tabular-nums', color)}>{scores[symbol] || 0}</span>
            </div>
            <div className={cn('flex gap-1 mt-1', index === 1 && 'justify-end')} aria-label={`${scores[symbol] || 0} of ${MATCH_TARGET} rounds won`}>
              {Array.from({ length: MATCH_TARGET }, (_, i) => (
                <span key={i} className={cn('h-1.5 w-4 rounded-sm', i < (scores[symbol] || 0) ? (symbol === 'X' ? 'bg-retro-p1' : 'bg-retro-p2') : 'bg-retro-deep border border-retro-border')} />
              ))}
            </div>
          </div>
        )
      })}
      <div className="col-start-2 row-start-1 text-center">
        <p className="font-pixel text-[10px] text-retro-cta text-glow-cta tracking-widest">WORD RACE</p>
        <p className="font-pixel text-[8px] text-retro-dim mt-1">ROUND {roundNum || 1}</p>
      </div>
    </div>
  )
}

function ResultCopy({ result, mySymbol, myDone, opponentDone, game }) {
  if (!result) return null
  const winner = result.winner
  const isDraw = winner === 'draw'
  const iWon = winner === mySymbol
  const winnerName = game.players?.[winner]?.name || winner
  if (isDraw) return <p className="font-pixel text-base text-retro-text">DRAW — BOTH MISSED</p>
  if (iWon && result.reason === 'speed') return <p className="font-pixel text-base text-retro-win text-glow-win">YOU WIN — FASTER</p>
  if (iWon) return <p className="font-pixel text-base text-retro-win text-glow-win">YOU WIN — {myDone?.guesses || 0} GUESSES</p>
  if (result.reason === 'speed') return <p className="font-pixel text-base text-retro-p2">{winnerName.toUpperCase()} WINS — FASTER</p>
  return <p className="font-pixel text-base text-retro-p2">{winnerName.toUpperCase()} WINS — {opponentDone?.guesses || 0} GUESSES</p>
}

export default function WordRaceGame({
  gameId, game, mySymbol, opponentOnline, onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const [currentGuess, setCurrentGuess] = useState('')
  const [clockOffset, setClockOffset] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [feedback, setFeedback] = useState('')
  const [guessBusy, runGuess] = useBusy()
  const [actionBusy, runAction] = useBusy()
  const previousOpponentCount = useRef(null)
  const previousOpponentRound = useRef(null)
  const previousResult = useRef(null)
  const resolving = useRef(false)

  const round = game?.round || null
  const phase = round?.phase || 'waiting'
  const isSpectator = !mySymbol
  const activeSymbol = mySymbol || 'X'
  const opponentSymbol = activeSymbol === 'X' ? 'O' : 'X'
  const myGuesses = normalizeGuesses(round?.[`guesses${activeSymbol}`])
  const opponentGuesses = normalizeGuesses(round?.[`guesses${opponentSymbol}`])
  const myDone = round?.[`done${activeSymbol}`] || null
  const opponentDone = round?.[`done${opponentSymbol}`] || null
  const answer = Number.isInteger(Number(round?.answerIndex)) ? ANSWERS[Number(round.answerIndex)] : null
  const keyboardState = useMemo(() => getKeyboardState(myGuesses), [myGuesses])
  const serverNow = now + clockOffset
  const matchWinner = (game?.scores?.X || 0) >= MATCH_TARGET ? 'X' : (game?.scores?.O || 0) >= MATCH_TARGET ? 'O' : null
  const reveal = phase === 'reveal' || game?.status === 'finished'

  useEffect(() => {
    const offRef = ref(db, '.info/serverTimeOffset')
    return onValue(offRef, snapshot => setClockOffset(snapshot.val() ?? 0))
  }, [])

  useEffect(() => {
    if (phase !== 'playing') return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [phase])

  // First client creates one shared seeded round. RTDB transaction makes the
  // two simultaneous initializers converge on the same answer index. Rematch
  // stubs carry `used` so play-again/new-match cannot repeat room answers.
  useEffect(() => {
    if (!game || game.status !== 'playing' || round?.seed || !game.players?.X || !game.players?.O) return
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || current.status !== 'playing' || current.round?.seed) return
      const seed = createSeed()
      const used = normalizeNumbers(current.round?.used)
      const answerIndex = pickAnswer(ANSWERS, seed, used)
      return {
        ...current,
        round: {
          phase: 'playing',
          roundNum: 1,
          seed,
          answerIndex,
          startedAt: Date.now() + clockOffset,
          guessesX: [],
          guessesO: [],
          doneX: null,
          doneO: null,
          result: null,
          used: [...used, answerIndex],
          revealEndsAt: null,
        },
      }
    }).catch(() => {})
  }, [gameId, game?.status, game?.players?.X, game?.players?.O, round, clockOffset])

  // Opponent feedback is intentionally limited to marks and progress.
  useEffect(() => {
    if (previousOpponentCount.current === null || round?.roundNum !== previousOpponentRound.current) {
      previousOpponentCount.current = opponentGuesses.length
      previousOpponentRound.current = round?.roundNum
    } else if (phase === 'playing' && opponentGuesses.length > previousOpponentCount.current) {
      sounds.bell()
      previousOpponentCount.current = opponentGuesses.length
    }
  }, [opponentGuesses.length, phase, round?.roundNum])

  // Resolve grace expiry and any simultaneous done-state race. The write is
  // guarded by round.phase/result inside one root transaction.
  const resolveRound = useCallback(async (at) => {
    if (resolving.current) return
    resolving.current = true
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        const currentRound = current?.round
        if (!current || current.status !== 'playing' || !currentRound || currentRound.phase !== 'playing' || currentRound.result) return
        if (!shouldReveal(currentRound, at)) return
        const resolvedRound = { ...currentRound }
        if (resolvedRound.doneX?.solved && !resolvedRound.doneO) {
          resolvedRound.doneO = { solved: false, guesses: normalizeGuesses(resolvedRound.guessesO).length, at }
        } else if (resolvedRound.doneO?.solved && !resolvedRound.doneX) {
          resolvedRound.doneX = { solved: false, guesses: normalizeGuesses(resolvedRound.guessesX).length, at }
        }
        const winner = compareRace(resolvedRound.doneX, resolvedRound.doneO)
        if (!winner) return
        const reason = getRaceReason(resolvedRound.doneX, resolvedRound.doneO)
        const result = { winner, reason }
        const next = { ...current, round: { ...resolvedRound, phase: 'reveal', result, revealEndsAt: at }, lastActivityAt: at }
        if (winner !== 'draw') {
          const scores = { X: current.scores?.X || 0, O: current.scores?.O || 0 }
          scores[winner] += 1
          next.scores = scores
          if (scores[winner] >= MATCH_TARGET) {
            next.status = 'finished'
            next.winner = winner
          }
        }
        return next
      })
    } catch {
      toast.error('ROUND RESOLVE FAILED — CHECK CONNECTION')
    } finally {
      resolving.current = false
    }
  }, [gameId])

  useEffect(() => {
    if (phase === 'playing' && shouldReveal(round, serverNow)) resolveRound(serverNow)
  }, [phase, round, serverNow, resolveRound])

  useEffect(() => {
    if (phase !== 'reveal' || !round?.result) return
    const signature = `${round.roundNum}:${round.result.winner}:${round.result.reason}`
    if (previousResult.current === signature) return
    previousResult.current = signature
    if (round.result.winner === 'draw') sounds.draw()
    else if (round.result.winner === mySymbol) sounds[matchWinner ? 'matchWin' : 'win']()
    else sounds.lose()
  }, [phase, round?.roundNum, round?.result, mySymbol, matchWinner])

  const submitGuess = useCallback(async () => {
    const word = currentGuess.trim().toLowerCase()
    if (isSpectator || phase !== 'playing' || myDone || !answer || guessBusy) return
    if (word.length !== WORD_LENGTH) {
      setFeedback('NEED 5 LETTERS')
      sounds.miss()
      return
    }
    if (!isValidGuess(word)) {
      setFeedback('NOT IN WORD LIST')
      sounds.miss()
      return
    }
    await runGuess(async () => {
      const at = Date.now() + clockOffset
      const result = await runTransaction(ref(db, `games/${gameId}`), current => {
        const currentRound = current?.round
        if (!current || !currentRound || currentRound.phase !== 'playing') return
        const updatedRound = applyGuessForPlayer(currentRound, activeSymbol, word, ANSWERS[currentRound.answerIndex], at)
        if (!updatedRound) return
        if (shouldReveal(updatedRound, at)) {
          const winner = compareRace(updatedRound.doneX, updatedRound.doneO)
          if (winner) {
            updatedRound.phase = 'reveal'
            updatedRound.result = { winner, reason: getRaceReason(updatedRound.doneX, updatedRound.doneO) }
            updatedRound.revealEndsAt = at
            const next = { ...current, round: updatedRound, lastActivityAt: at }
            if (winner !== 'draw') {
              next.scores = { X: current.scores?.X || 0, O: current.scores?.O || 0 }
              next.scores[winner] += 1
              if (next.scores[winner] >= MATCH_TARGET) {
                next.status = 'finished'
                next.winner = winner
              }
            }
            return next
          }
        }
        return { ...current, round: updatedRound, lastActivityAt: at }
      })
      if (!result.committed) return
      setCurrentGuess('')
      setFeedback('')
      sounds.move(activeSymbol)
    }, () => toast.error('GUESS FAILED — CHECK CONNECTION'))
  }, [activeSymbol, answer, clockOffset, currentGuess, gameId, guessBusy, isSpectator, myDone, phase, runGuess])

  const handleKey = useCallback((key) => {
    if (isSpectator || phase !== 'playing' || myDone || guessBusy) return
    if (key === 'ENTER') {
      submitGuess()
    } else if (key === 'BACK') {
      setCurrentGuess(value => value.slice(0, -1))
    } else if (/^[A-Z]$/.test(key) && currentGuess.length < WORD_LENGTH) {
      setCurrentGuess(value => value + key)
      setFeedback('')
    }
  }, [currentGuess.length, guessBusy, isSpectator, myDone, phase, submitGuess])

  useEffect(() => {
    if (isSpectator || phase !== 'playing' || myDone) return undefined
    const handler = event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'Enter') {
        event.preventDefault()
        handleKey('ENTER')
      } else if (event.key === 'Backspace') {
        event.preventDefault()
        handleKey('BACK')
      } else if (/^[a-zA-Z]$/.test(event.key)) {
        handleKey(event.key.toUpperCase())
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleKey, isSpectator, myDone, phase])

  const handleAction = (action) => runAction(async () => action(), () => toast.error('ACTION FAILED — CHECK CONNECTION'))

  // Idle-opponent hatch: rounds have no deadline and shouldReveal stays false
  // while neither side marks done, so an opponent who vanishes (closed tab,
  // idle) stalls the room forever. When they read as offline, close the round
  // with both sides recorded unsolved — resolves as a draw via the standard
  // compareRace path, no score change.
  const canClaimIdle = !isSpectator && phase === 'playing' && !myDone && !opponentDone && opponentOnline === false
  const handleClaimIdle = () => runAction(async () => {
    await runTransaction(ref(db, `games/${gameId}`), current => {
      const r = current?.round
      if (!current || current.status !== 'playing' || !r || r.phase !== 'playing' || r.result) return
      if (r.doneX || r.doneO) return
      const at = Date.now() + clockOffset
      const doneX = { solved: false, guesses: normalizeGuesses(r.guessesX).length, at }
      const doneO = { solved: false, guesses: normalizeGuesses(r.guessesO).length, at }
      const winner = compareRace(doneX, doneO)
      if (!winner) return
      return {
        ...current,
        round: { ...r, phase: 'reveal', doneX, doneO, result: { winner, reason: getRaceReason(doneX, doneO) }, revealEndsAt: at },
        lastActivityAt: at,
      }
    })
  }, () => toast.error('CLAIM FAILED — CHECK CONNECTION'))
  const graceLeft = myDone?.solved && !opponentDone
    ? Math.max(0, Math.ceil((myDone.at + FINISH_GRACE_MS - serverNow) / 1000))
    : 0
  const timer = round?.startedAt ? formatTimer(serverNow - round.startedAt) : '00:00'

  if (!game || !gameId) return null

  if (!round?.seed) {
    return <div className="flex flex-col items-center gap-3 py-12"><PixelDots tone="cta" size="lg" /><p className="font-pixel text-[9px] text-retro-dim tracking-widest">BUILDING SHARED PUZZLE…</p></div>
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-3 py-2">
      <ScoreRail game={game} mySymbol={mySymbol} isSpectator={isSpectator} roundNum={round.roundNum} />

      {phase === 'playing' && (
        <div className="flex items-center justify-between gap-2 px-1" aria-live="polite">
          <span className="font-pixel text-[9px] text-retro-dim">SAME WORD · {MAX_GUESSES} GUESSES</span>
          <span className="font-mono text-xs tabular-nums text-retro-cta">{timer}</span>
        </div>
      )}

      <WordRaceMeter myGuesses={myGuesses} opponentGuesses={opponentGuesses} mySymbol={activeSymbol} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-start">
        <div className="order-1 rounded border border-retro-p1/30 bg-retro-tint-p1/10 p-3 sm:p-4">
          <WordRaceBoard
            guesses={myGuesses}
            currentGuess={phase === 'playing' && !myDone ? currentGuess : ''}
            label={isSpectator ? 'X BOARD' : `YOU · ${game.players?.[activeSymbol]?.name || activeSymbol}`}
            solved={myDone?.solved}
          />
        </div>
        <div className="order-2 rounded border border-retro-p2/30 bg-retro-tint-p2/10 p-3 sm:p-4 md:mt-0">
          <WordRaceBoard
            guesses={opponentGuesses}
            ghost={!reveal}
            reveal={reveal}
            compact={!reveal}
            label={isSpectator ? 'O BOARD' : `OPPONENT · ${game.players?.[opponentSymbol]?.name || opponentSymbol}`}
            solved={opponentDone?.solved}
          />
        </div>
      </div>

      {phase === 'playing' && (
        <div className="space-y-2">
          {opponentDone?.solved && !myDone && <p className="text-center font-pixel text-[10px] text-retro-p2 arcade-blink" aria-live="polite">OPPONENT SOLVED — KEEP GOING</p>}
          {myDone?.solved && !opponentDone && <p className="text-center font-pixel text-[10px] text-retro-win arcade-blink" aria-live="polite">YOU SOLVED — OPPONENT HAS {graceLeft}S</p>}
          {myDone && !myDone.solved && !opponentDone && <p className="text-center font-pixel text-[10px] text-retro-dim" aria-live="polite">YOU&apos;RE OUT — WAITING FOR OPPONENT</p>}
          {!isSpectator && !myDone && (
            <>
              <div className="flex items-center justify-center gap-2" aria-label="Current guess">
                {Array.from({ length: WORD_LENGTH }, (_, index) => <span key={index} className={cn('flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded border-2 font-pixel text-lg', currentGuess[index] ? 'border-retro-cta bg-retro-tint-cta text-retro-text' : 'border-retro-border bg-retro-card text-retro-dim')}>{currentGuess[index] || ''}</span>)}
                <button type="button" onClick={submitGuess} disabled={guessBusy || currentGuess.length !== WORD_LENGTH} className="min-h-11 px-4 rounded bg-retro-cta text-retro-bg font-pixel text-[10px] disabled:opacity-40">{guessBusy ? 'SENDING…' : 'GUESS'}</button>
              </div>
              <p className="h-4 text-center font-pixel text-[9px] text-retro-cta" role="status">{feedback}</p>
              <WordRaceKeyboard keyState={keyboardState} onKey={handleKey} disabled={guessBusy} />
            </>
          )}
          {isSpectator && <p className="text-center font-pixel text-[9px] text-retro-dim">SPECTATING · LETTERS HIDDEN UNTIL REVEAL</p>}
          {!opponentOnline && !isSpectator && <OfflineNotice label="OPPONENT" />}
          {canClaimIdle && (
            <div className="text-center">
              <button type="button" onClick={handleClaimIdle} disabled={actionBusy} className="min-h-10 px-4 rounded border-2 border-retro-border text-retro-dim font-pixel text-[9px] hover:border-retro-cta hover:text-retro-cta active:scale-95 disabled:opacity-50">
                {actionBusy ? 'CLAIMING…' : 'OPPONENT GONE — END ROUND AS DRAW'}
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'reveal' && (
        <div className="modal-pop space-y-3 rounded border-2 border-retro-cta/50 bg-retro-card p-4 text-center" aria-live="polite">
          <p className="font-pixel text-[9px] text-retro-dim tracking-widest">ANSWER</p>
          <p className="font-pixel text-2xl tracking-[0.35em] text-retro-cta text-glow-cta">{answer?.toUpperCase() || '?????'}</p>
          <ResultCopy result={round.result} mySymbol={mySymbol} myDone={myDone} opponentDone={opponentDone} game={game} />
          <p className="font-mono text-[11px] text-retro-dim">{myDone?.solved ? `YOU ${myDone.guesses}/${MAX_GUESSES}` : 'YOU MISSED'} · {opponentDone?.solved ? `OPPONENT ${opponentDone.guesses}/${MAX_GUESSES}` : 'OPPONENT MISSED'}</p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {!matchWinner && onPlayAgain && !proposal && <button type="button" disabled={actionBusy} onClick={() => handleAction(onPlayAgain)} className="min-h-11 px-5 rounded bg-retro-cta text-retro-bg font-pixel text-[10px] disabled:opacity-50">{actionBusy ? 'STARTING…' : 'PLAY AGAIN'}</button>}
            {onNewMatch && !proposal && (matchWinner || !onPlayAgain) && <button type="button" disabled={actionBusy} onClick={() => handleAction(onNewMatch)} className="min-h-11 px-5 rounded border-2 border-retro-border text-retro-text font-pixel text-[10px] disabled:opacity-50">{actionBusy ? 'STARTING…' : 'NEW MATCH'}</button>}
            <ShareResultButton
              gameLabel="WORD RACE"
              headline={(() => {
                const r = round.result
                if (!r) return 'WORD RACE'
                if (r.winner === 'draw') return 'DRAW — BOTH MISSED'
                if (r.winner === mySymbol) return 'YOU WIN!'
                return `${game.players?.[r.winner]?.name || r.winner} WINS`
              })()}
              sub={`${myDone?.solved ? `YOU ${myDone.guesses}/${MAX_GUESSES}` : 'YOU MISSED'} · ${opponentDone?.solved ? `OPPONENT ${opponentDone.guesses}/${MAX_GUESSES}` : 'OPPONENT MISSED'}`}
              accentVar={round.result?.winner === mySymbol ? '--c-win' : '--c-p2'}
              url={window.location.href}
            />
            {onSwitchGame && !proposal && <GameSwitcher currentType="wordrace" onSwitch={onSwitchGame} />}
          </div>
        </div>
      )}
    </div>
  )
}
