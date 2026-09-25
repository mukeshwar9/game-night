import { useCallback, useEffect, useRef, useState } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { getAnswerList } from '../lib/dictionary'
import {
  DONE_GRACE_MS,
  FINISH_GRACE_MS,
  MATCH_TARGET,
  MAX_GUESSES,
  RACE_REVEAL_MS,
  WORD_LENGTH,
  advanceRaceRound,
  applyGuessForPlayer,
  buildRaceRoundStart,
  compareRace,
  getGraceEndsAt,
  getKeyboardState,
  getRaceReason,
  getRoundAnswer,
  guessProblem,
  normalizeGuesses,
  resolveRaceRound,
  shouldReveal,
} from '../lib/wordraceLogic'
import { sounds } from '../lib/sounds'
import { getGameConfig } from '../lib/games'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import OfflineNotice from '../components/loading/OfflineNotice'
import PixelDots from '../components/loading/PixelDots'
import useBusy from '../hooks/useBusy'
import useServerClock from '../hooks/useServerClock'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { WordRaceBoard, WordRaceMeter } from '../components/WordRaceBoards'
import WordKeyboard from '../components/WordKeyboard'
import RoundTimer from '../components/RoundTimer'
import WordFeedback from '../components/WordFeedback'
import MatchScoreRail from '../components/MatchScoreRail'

const ANSWERS = getAnswerList()
const RACE_TARGET = getGameConfig('wordrace')?.matchTarget || MATCH_TARGET

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

function ResultCopy({ result, mySymbol, doneX, doneO, game }) {
  if (!result) return null
  const winner = result.winner
  const iWon = !!mySymbol && winner === mySymbol
  const winnerName = game.players?.[winner]?.name || winner
  const winnerDone = winner === 'X' ? doneX : doneO
  const loserDone = winner === 'X' ? doneO : doneX
  if (winner === 'draw') {
    return <p className="font-pixel text-base text-retro-text">{result.reason === 'speed' ? 'DRAW — DEAD HEAT' : 'DRAW — BOTH MISSED'}</p>
  }
  const why = result.reason === 'speed' ? 'FASTER'
    : loserDone?.timedOut ? `${winnerDone?.guesses || 0} GUESSES · TIME RAN OUT`
    : `${winnerDone?.guesses || 0} GUESSES`
  if (iWon) return <p className="font-pixel text-base text-retro-win text-glow-win">YOU WIN — {why}</p>
  return <p className="font-pixel text-base text-retro-p2">{String(winnerName).toUpperCase()} WINS — {why}</p>
}

export default function WordRaceGame({
  gameId, game, mySymbol, opponentOnline, onSwitchGame, onNewMatch, proposal,
}) {
  const [currentGuess, setCurrentGuess] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [guessBusy, runGuess] = useBusy()
  const [actionBusy, runAction] = useBusy()
  const previousOpponentCount = useRef(null)
  const previousOpponentRound = useRef(null)
  const resolving = useRef(false)
  const advancing = useRef(false)

  const round = game?.round || null
  const phase = round?.phase || 'waiting'
  const roundNum = Number(round?.roundNum) || 1
  const status = game?.status
  const matchOver = status === 'finished'
  const isSpectator = !mySymbol
  // Spectators view X on the left and O on the right — both hidden until the
  // reveal (they must not see letters a player could be told about).
  const viewSymbol = mySymbol || 'X'
  const otherSymbol = viewSymbol === 'X' ? 'O' : 'X'
  const myGuesses = normalizeGuesses(round?.[`guesses${viewSymbol}`])
  const opponentGuesses = normalizeGuesses(round?.[`guesses${otherSymbol}`])
  const myDone = round?.[`done${viewSymbol}`] || null
  const opponentDone = round?.[`done${otherSymbol}`] || null
  const answer = getRoundAnswer(round, ANSWERS)
  const keyboardState = getKeyboardState(myGuesses)
  const reveal = phase === 'reveal' || matchOver
  const { now, serverNow } = useServerClock({
    tickMs: 500,
    ticking: !matchOver && (phase === 'playing' || phase === 'reveal'),
  })

  // First client creates one shared seeded round. The root transaction makes
  // two simultaneous initializers converge on one answer, pinned as a string.
  // Rematch stubs carry `used` (no repeats in a room) and `roundNum`.
  const hasX = !!game?.players?.X
  const hasO = !!game?.players?.O
  const hasSeed = !!round?.seed
  useEffect(() => {
    if (!gameId || status !== 'playing' || hasSeed || !hasX || !hasO) return
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || current.status !== 'playing' || current.round?.seed) return
      return {
        ...current,
        round: buildRaceRoundStart({ stub: current.round, seed: createSeed(), answerList: ANSWERS, at: serverNow() }),
      }
    }).catch(() => {})
  }, [gameId, status, hasSeed, hasX, hasO, serverNow])

  // A soft bell when the opponent commits a guess (per round).
  useEffect(() => {
    if (previousOpponentCount.current === null || roundNum !== previousOpponentRound.current) {
      previousOpponentCount.current = opponentGuesses.length
      previousOpponentRound.current = roundNum
    } else if (phase === 'playing' && opponentGuesses.length > previousOpponentCount.current) {
      if (!isSpectator) sounds.bell()
      previousOpponentCount.current = opponentGuesses.length
    }
  }, [opponentGuesses.length, phase, roundNum, isSpectator])

  // Resolve grace expiry and any simultaneous done-state race. The write is
  // guarded by round.phase/result inside one root transaction; failures back
  // off quietly (this runs on a timer, not a button).
  const resolveRound = useCallback(async () => {
    if (resolving.current) return
    resolving.current = true
    let failed = false
    try {
      await runTransaction(ref(db, `games/${gameId}`), current =>
        resolveRaceRound(current, serverNow(), { matchTarget: RACE_TARGET }) ?? undefined)
    } catch {
      failed = true
    } finally {
      if (failed) setTimeout(() => { resolving.current = false }, 3000)
      else resolving.current = false
    }
  }, [gameId, serverNow])

  useEffect(() => {
    if (isSpectator || matchOver) return
    if (phase === 'playing' && shouldReveal(round, now)) resolveRound()
  }, [isSpectator, matchOver, phase, round, now, resolveRound])

  // Auto-advance inside a match: after a short reveal either client starts the
  // next round (roundNum + 1) by transaction — no per-round consent. Paused
  // while a New Match / switch proposal is pending.
  const advanceDue = !isSpectator && !matchOver && !proposal && phase === 'reveal' && !!round?.result &&
    !!round?.revealEndsAt && now >= round.revealEndsAt
  useEffect(() => {
    if (!advanceDue || advancing.current) return
    advancing.current = true
    runTransaction(ref(db, `games/${gameId}`), current =>
      advanceRaceRound(current, { at: serverNow(), seed: createSeed(), answerList: ANSWERS, expectedRoundNum: roundNum }) ?? undefined)
      .catch(() => {})
      .finally(() => { setTimeout(() => { advancing.current = false }, 1500) })
  }, [advanceDue, now, gameId, roundNum, serverNow])

  // Round sound, once per round. The match-deciding round flips status to
  // 'finished' and Game.jsx plays the match fanfare — don't double it.
  const resultSig = phase === 'reveal' && round?.result ? `${roundNum}:${round.result.winner}:${round.result.reason}` : ''
  const previousResult = useRef(resultSig)
  useEffect(() => {
    if (!resultSig || previousResult.current === resultSig) return
    previousResult.current = resultSig
    if (isSpectator || matchOver) return
    const w = round.result.winner
    if (w === 'draw') sounds.draw()
    else if (w === mySymbol) sounds.win()
    else sounds.lose()
  }, [resultSig, round?.result, isSpectator, matchOver, mySymbol])

  const submitGuess = useCallback(async () => {
    const word = currentGuess.trim().toLowerCase()
    if (isSpectator || matchOver || phase !== 'playing' || myDone || !answer || guessBusy) return
    const problem = guessProblem(word)
    if (problem) {
      setFeedback(prev => ({ message: problem, id: (prev?.id || 0) + 1 }))
      sounds.miss()
      return
    }
    await runGuess(async () => {
      const at = serverNow()
      const result = await runTransaction(ref(db, `games/${gameId}`), current => {
        const currentRound = current?.round
        if (!current || current.status !== 'playing' || !currentRound || currentRound.phase !== 'playing') return
        const updatedRound = applyGuessForPlayer(currentRound, mySymbol, word, getRoundAnswer(currentRound, ANSWERS), at)
        if (!updatedRound) return
        const next = { ...current, round: updatedRound, lastActivityAt: at }
        return resolveRaceRound(next, at, { matchTarget: RACE_TARGET }) ?? next
      })
      if (!result.committed) return
      setCurrentGuess('')
      setFeedback(null)
      sounds.move(mySymbol)
    }, () => toast.error('GUESS FAILED — CHECK CONNECTION'))
  }, [answer, currentGuess, gameId, guessBusy, isSpectator, matchOver, myDone, mySymbol, phase, runGuess, serverNow])

  const handleKey = useCallback((key) => {
    if (isSpectator || matchOver || phase !== 'playing' || myDone || guessBusy) return
    if (key === 'ENTER') {
      submitGuess()
    } else if (key === 'BACK') {
      setCurrentGuess(value => value.slice(0, -1))
      setFeedback(null)
    } else if (/^[A-Z]$/.test(key) && currentGuess.length < WORD_LENGTH) {
      setCurrentGuess(value => value + key)
      setFeedback(null)
    }
  }, [currentGuess.length, guessBusy, isSpectator, matchOver, myDone, phase, submitGuess])

  const handleAction = (action) => runAction(async () => action(), () => toast.error('ACTION FAILED — CHECK CONNECTION'))

  // Idle-opponent hatch: an opponent who vanishes before either side is done
  // would stall the room. When they read as offline, close the round with
  // both sides recorded unsolved — a draw via compareRace, no score change.
  // (Once either side is done, the grace clock below ends the round instead.)
  const canClaimIdle = !isSpectator && !matchOver && phase === 'playing' && !myDone && !opponentDone && opponentOnline === false
  const handleClaimIdle = () => runAction(async () => {
    await runTransaction(ref(db, `games/${gameId}`), current => {
      const r = current?.round
      if (!current || current.status !== 'playing' || !r || r.phase !== 'playing' || r.result) return
      if (r.doneX || r.doneO) return
      const at = serverNow()
      const doneX = { solved: false, guesses: normalizeGuesses(r.guessesX).length, at }
      const doneO = { solved: false, guesses: normalizeGuesses(r.guessesO).length, at }
      const winner = compareRace(doneX, doneO)
      if (!winner) return
      return {
        ...current,
        round: { ...r, phase: 'reveal', doneX, doneO, result: { winner, reason: getRaceReason(doneX, doneO) }, revealEndsAt: at + RACE_REVEAL_MS },
        lastActivityAt: at,
      }
    })
  }, () => toast.error('CLAIM FAILED — CHECK CONNECTION'))

  const graceEndsAt = phase === 'playing' ? getGraceEndsAt(round) : null
  const firstDone = myDone || opponentDone
  const graceTotal = firstDone?.solved ? FINISH_GRACE_MS : DONE_GRACE_MS
  const timer = round?.startedAt ? formatTimer(now - round.startedAt) : '00:00'
  const nextRoundIn = phase === 'reveal' && round?.revealEndsAt ? Math.max(0, Math.ceil((round.revealEndsAt - now) / 1000)) : null

  if (!game || !gameId) return null

  if (!round?.seed && !matchOver) {
    return <div className="flex flex-col items-center gap-3 py-12"><PixelDots tone="cta" size="lg" /><p className="font-pixel text-[9px] text-retro-dim tracking-widest">BUILDING SHARED PUZZLE…</p></div>
  }

  const presence = isSpectator
    ? { X: game.presence?.X?.online, O: game.presence?.O?.online }
    : { [mySymbol]: true, [otherSymbol]: opponentOnline !== false }
  const seatTint = (sym) => (sym === 'X' ? 'border-retro-p1/30 bg-retro-tint-p1/10' : 'border-retro-p2/30 bg-retro-tint-p2/10')
  const nameOf = (sym) => game.players?.[sym]?.name || sym

  const boards = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-start">
      <div className={cn('order-1 rounded border p-3 sm:p-4', seatTint(viewSymbol))}>
        <WordRaceBoard
          guesses={myGuesses}
          currentGuess={!isSpectator && phase === 'playing' && !myDone && !matchOver ? currentGuess : ''}
          ghost={isSpectator}
          reveal={reveal}
          label={isSpectator ? `X · ${nameOf('X')}` : `YOU · ${nameOf(viewSymbol)}`}
          solved={myDone?.solved}
        />
      </div>
      <div className={cn('order-2 rounded border p-3 sm:p-4', seatTint(otherSymbol))}>
        <WordRaceBoard
          guesses={opponentGuesses}
          ghost
          reveal={reveal}
          compact={!reveal}
          label={isSpectator ? `O · ${nameOf('O')}` : `OPPONENT · ${nameOf(otherSymbol)}`}
          solved={opponentDone?.solved}
        />
      </div>
    </div>
  )

  const rail = (
    <MatchScoreRail
      game={game}
      mySymbol={mySymbol}
      isSpectator={isSpectator}
      matchTarget={RACE_TARGET}
      title="WORD RACE"
      roundLabel={`ROUND ${roundNum}`}
      presence={presence}
    />
  )

  // Match over — the last round's reveal, or the platform's CLAIM WIN ending
  // it mid-round. Input stops; the answer and both boards are shown.
  if (matchOver) {
    return (
      <div className="w-full max-w-4xl mx-auto space-y-3 py-2">
        {rail}
        {answer && (
          <div className="rounded border-2 border-retro-cta/50 bg-retro-card p-3 text-center">
            <p className="font-pixel text-[9px] text-retro-dim tracking-widest">ANSWER</p>
            <p className="font-pixel text-xl tracking-[0.35em] text-retro-cta text-glow-cta">{answer.toUpperCase()}</p>
          </div>
        )}
        <GameStatus
          status={game.status}
          winner={game.winner}
          mySymbol={mySymbol}
          scores={game.scores}
          players={game.players}
          gameType={game.gameType}
          matchTarget={RACE_TARGET}
          matchOver
          matchWinnerOverride={game.winner ?? null}
          onNewMatch={!proposal ? onNewMatch : null}
          onSwitchGame={!proposal ? onSwitchGame : null}
        />
        {boards}
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-3 py-2">
      {rail}

      {phase === 'playing' && (
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="font-pixel text-[9px] text-retro-dim">SAME WORD · {MAX_GUESSES} GUESSES</span>
          <span className="font-mono text-xs tabular-nums text-retro-cta" aria-hidden="true">{timer}</span>
        </div>
      )}

      <WordRaceMeter
        myGuesses={myGuesses}
        opponentGuesses={opponentGuesses}
        mySymbol={viewSymbol}
        myLabel={isSpectator ? 'X' : 'YOU'}
        opponentLabel={isSpectator ? 'O' : 'OPPONENT'}
      />

      {boards}

      {phase === 'playing' && (
        <div className="space-y-2">
          {graceEndsAt && (
            <div className="space-y-1">
              <p className={cn('text-center font-pixel text-[10px]', opponentDone && !myDone ? 'text-retro-p2' : 'text-retro-win')} aria-live="polite">
                {isSpectator ? `${firstDone?.solved ? 'SOLVED' : 'OUT'} — THE OTHER PLAYER IS ON THE CLOCK`
                  : myDone ? (myDone.solved ? 'YOU SOLVED — OPPONENT IS ON THE CLOCK' : "YOU'RE OUT — OPPONENT IS ON THE CLOCK")
                  : (opponentDone.solved ? 'OPPONENT SOLVED — KEEP GOING' : 'OPPONENT IS OUT — SOLVE IT TO WIN')}
              </p>
              <RoundTimer endsAt={graceEndsAt} now={now} totalMs={graceTotal} label={myDone ? 'OPPONENT HAS' : 'TIME LEFT'} />
            </div>
          )}
          {!isSpectator && !myDone && (
            <>
              <div className="flex items-center justify-center gap-2" aria-label={`Current guess: ${currentGuess || 'empty'}`}>
                {Array.from({ length: WORD_LENGTH }, (_, index) => <span key={index} aria-hidden="true" className={cn('flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded border-2 font-pixel text-lg', currentGuess[index] ? 'border-retro-cta bg-retro-tint-cta text-retro-text' : 'border-retro-border bg-retro-card text-retro-dim')}>{currentGuess[index] || ''}</span>)}
                <button type="button" onClick={submitGuess} disabled={guessBusy || currentGuess.length !== WORD_LENGTH} className="min-h-11 px-4 rounded bg-retro-cta text-retro-bg font-pixel text-[10px] disabled:opacity-40">{guessBusy ? 'SENDING…' : 'GUESS'}</button>
              </div>
              <WordFeedback message={feedback?.message} tone="bad" id={feedback?.id} />
              <WordKeyboard keyState={keyboardState} onKey={handleKey} disabled={guessBusy} />
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
          <ResultCopy result={round.result} mySymbol={mySymbol} doneX={round.doneX} doneO={round.doneO} game={game} />
          <p className="font-mono text-[11px] text-retro-dim">
            {isSpectator ? 'X' : 'YOU'} {myDone?.solved ? `${myDone.guesses}/${MAX_GUESSES}` : 'MISSED'} · {isSpectator ? 'O' : 'OPPONENT'} {opponentDone?.solved ? `${opponentDone.guesses}/${MAX_GUESSES}` : 'MISSED'}
          </p>
          {nextRoundIn !== null && (
            <p className="font-pixel text-[9px] text-retro-dim tracking-widest" aria-hidden="true">
              {proposal ? 'NEXT ROUND PAUSED — ANSWER THE REQUEST' : nextRoundIn > 0 ? `NEXT ROUND IN ${nextRoundIn}…` : 'STARTING NEXT ROUND…'}
            </p>
          )}
          {!isSpectator && !proposal && (
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              {onNewMatch && <button type="button" disabled={actionBusy} onClick={() => handleAction(onNewMatch)} className="min-h-11 px-5 rounded border-2 border-retro-border text-retro-text font-pixel text-[10px] disabled:opacity-50">{actionBusy ? 'ASKING…' : 'NEW MATCH'}</button>}
              {onSwitchGame && <GameSwitcher currentType="wordrace" onSwitch={onSwitchGame} />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
