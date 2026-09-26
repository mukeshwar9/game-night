import { useCallback, useEffect, useRef, useState } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import { sounds } from '../lib/sounds'
import useBusy from '../hooks/useBusy'
import useServerClock from '../hooks/useServerClock'
import RoundTimer from '../components/RoundTimer'
import WordFeedback from '../components/WordFeedback'
import OfflineNotice from '../components/loading/OfflineNotice'
import GameSwitcher from '../components/GameSwitcher'
import PasswordCard, { PasswordMatchResult } from '../components/PasswordCard'
import { PASSWORD_DECK } from '../lib/decks/password'
import {
  CLUE_MS, INTRO_MS, MAX_CLUES, MAX_ROUNDS, MAX_TEAM_SCORE, PARTNER_OFFLINE_MS, guessSecondsForClueNumber,
} from '../lib/passwordLogic'
import {
  advanceAfterReveal, applyClue, applyClueTimeout, applyGuess, applyGuessTimeout, bestRound,
  canEndForAbsence, createInitialRound, endMatchEarly, isCorrectGuess, nextRoles, normalizeText,
  pickWordForRound, starRating, startCluePhase, teamScoreOf, teamScoresFor, toList, validateClue,
} from '../lib/passwordLogic'

const TIMED_PHASES = new Set(['intro', 'clue', 'guess', 'reveal'])

function matchSeed() {
  try { return crypto.randomUUID() } catch { return `${Date.now()}-${Math.random()}` }
}

function ActionButton({ children, busy, busyLabel = 'SENDING…', onClick, disabled = false, secondary = false, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy || disabled}
      className={secondary
        ? 'min-h-11 px-5 py-2.5 border-2 border-retro-border text-retro-text font-pixel text-[10px] rounded hover:border-retro-p1 hover:text-retro-p1 transition-all active:scale-95 disabled:opacity-50'
        : 'min-h-11 px-5 py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta transition-all active:scale-95 disabled:opacity-50'}
    >
      {busy ? busyLabel : children}
    </button>
  )
}

export default function PasswordGame({
  gameId, game, mySymbol, opponentOnline, onSwitchGame, onNewMatch, proposal,
}) {
  const [input, setInput] = useState('')
  // One feedback line for clue/guess results: why a clue was rejected, a
  // missed guess, or a submission that lost the race to the clock.
  const [feedback, setFeedback] = useState({ message: '', tone: 'info', id: 0 })
  const [busy, runBusy] = useBusy()
  const [ending, runEnding] = useBusy()
  const [startingNewMatch, runNewMatch] = useBusy()
  const inputRef = useRef(null)
  const previousPhase = useRef(null)
  const deadlineAttempt = useRef('')
  const [offlineSince, setOfflineSince] = useState(null)

  const round = game?.round || null
  const phase = round?.phase || 'starting'
  const clues = toList(round?.clues)
  const guesses = toList(round?.guesses)
  const teamScore = teamScoreOf(round, game?.scores)
  const word = PASSWORD_DECK[Number(round?.wordIndex)]?.word || ''
  const isClueGiver = mySymbol && mySymbol === round?.clueGiver
  const isGuesser = mySymbol && mySymbol === round?.guesser
  const isSpectator = !mySymbol
  const matchFinished = game?.status === 'finished'
  // Every deadline is server-corrected: `now` for rendering, `serverNow()`
  // for anything written to Firebase, so phones with skewed clocks agree.
  const { now, serverNow } = useServerClock({ tickMs: 250, ticking: !!round && !matchFinished })

  // First seated client initializes the shared round after the second seat joins.
  useEffect(() => {
    if (!game || game.status !== 'playing' || game.round || !mySymbol) return
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || current.status !== 'playing' || current.round) return
      const seed = matchSeed()
      const wordIndex = pickWordForRound(PASSWORD_DECK, seed, [], 1)
      const starter = current.starter === 'O' ? 'O' : 'X'
      return {
        ...current,
        // Co-op: both seats carry the team total, which starts every match at 0.
        scores: teamScoresFor(0),
        round: {
          ...createInitialRound({
            starter,
            seed,
            wordIndex,
            wordLength: PASSWORD_DECK[wordIndex]?.word.length,
          }),
          endsAt: serverNow() + INTRO_MS,
        },
        lastActivityAt: serverNow(),
      }
    }).catch(() => {})
  }, [game, gameId, mySymbol, serverNow])

  // Deadlines for every phase — intro, the clue clock, the guess clock and
  // the reveal. Either client may fire the transition; the transaction
  // re-checks phase + endsAt so only one write lands. One attempt per
  // deadline, retried on the next tick only if it did not commit.
  useEffect(() => {
    if (matchFinished || !round || !TIMED_PHASES.has(phase)) return
    // Rounds dealt before the clue clock existed sit in 'clue' with no
    // deadline; arm one so a stalled clue-giver can never freeze the room.
    const legacyClue = phase === 'clue' && !round.endsAt
    if (!legacyClue && (!round.endsAt || now < round.endsAt)) return
    const key = `${round.roundNum}-${phase}-${round.endsAt}-${clues.length}`
    if (deadlineAttempt.current === key) return
    deadlineAttempt.current = key
    runTransaction(ref(db, `games/${gameId}`), current => {
      const currentRound = current?.round
      if (!current || current.status !== 'playing' || !currentRound || currentRound.phase !== phase) return
      if ((currentRound.endsAt ?? null) !== (round.endsAt ?? null)) return
      const at = serverNow()
      let patch = null
      if (legacyClue) {
        patch = { round: { ...currentRound, endsAt: at + CLUE_MS } }
      } else if (phase === 'intro') {
        const next = startCluePhase(currentRound, at)
        if (next) patch = { round: next }
      } else if (phase === 'clue') {
        const next = applyClueTimeout(currentRound, at)
        if (next) patch = { round: next }
      } else if (phase === 'guess') {
        const next = applyGuessTimeout(currentRound, at)
        if (next) patch = { round: next }
      } else {
        const advanced = advanceAfterReveal(currentRound, current.scores, PASSWORD_DECK, at)
        if (advanced) patch = { ...advanced, winner: advanced.winner || null, proposal: null }
      }
      if (!patch) return
      return { ...current, ...patch, lastActivityAt: at }
    }).then(result => {
      if (!result.committed && deadlineAttempt.current === key) deadlineAttempt.current = ''
    }).catch(() => {
      if (deadlineAttempt.current === key) deadlineAttempt.current = ''
    })
  }, [now, phase, round, clues.length, gameId, matchFinished, serverNow])

  // Partner presence: after PARTNER_OFFLINE_MS away, the online player may end
  // the match with the team score banked so far. The clocks keep running
  // meanwhile, so the room never freezes even if nobody presses it.
  useEffect(() => {
    const watching = !isSpectator && !matchFinished && opponentOnline === false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tracks when the partner's presence flag went false
    setOfflineSince(prev => (watching ? prev ?? serverNow() : null))
  }, [opponentOnline, isSpectator, matchFinished, serverNow])
  const partnerAway = canEndForAbsence(offlineSince, now)

  const say = useCallback((message, tone = 'info') => {
    setFeedback(prev => ({ message, tone, id: prev.id + 1 }))
  }, [])

  const endMatch = useCallback(() => runEnding(async () => {
    const result = await runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || current.status !== 'playing') return
      const ended = endMatchEarly(current.round, current.scores)
      if (!ended) return
      return { ...current, ...ended, proposal: null, lastActivityAt: serverNow() }
    })
    if (!result.committed) toast('THE MATCH HAS ALREADY ENDED')
  }, () => toast.error('END MATCH FAILED — CHECK CONNECTION')), [gameId, runEnding, serverNow])

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
    setFeedback(prev => ({ message: '', tone: 'info', id: prev.id }))
    if ((phase === 'clue' && isClueGiver) || (phase === 'guess' && isGuesser)) {
      const timer = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(timer)
    }
  }, [phase, round?.roundNum, isClueGiver, isGuesser])

  const submitClue = useCallback(async () => {
    const check = validateClue({ clue: input, word, previousClues: clues })
    if (!check.valid) { say(check.reason, 'bad'); return }
    say('')
    await runBusy(async () => {
      const result = await runTransaction(ref(db, `games/${gameId}`), current => {
        const currentRound = current?.round
        if (!current || current.status !== 'playing' || !currentRound || currentRound.phase !== 'clue' || currentRound.clueGiver !== mySymbol) return
        const at = serverNow()
        const nextRound = applyClue({ ...currentRound, word }, input, at)
        if (!nextRound) return
        return { ...current, round: nextRound, lastActivityAt: at }
      })
      // Not committed = the round moved on first (the clue clock burned the
      // last slot, or the match ended) — not a connection problem.
      if (!result.committed) { say('TOO LATE — THE CLUE CLOCK RAN OUT', 'info'); return }
      setInput('')
      sounds.move(mySymbol)
    }, () => toast.error('CLUE FAILED — CHECK CONNECTION'))
  }, [clues, gameId, input, mySymbol, runBusy, say, serverNow, word])

  const submitGuess = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed) { say('ENTER A GUESS', 'bad'); return }
    if (trimmed.length > 24) { say('GUESS MUST BE 24 CHARACTERS OR LESS', 'bad'); return }
    say('')
    await runBusy(async () => {
      const result = await runTransaction(ref(db, `games/${gameId}`), current => {
        const currentRound = current?.round
        if (!current || current.status !== 'playing' || !currentRound || currentRound.phase !== 'guess' || currentRound.guesser !== mySymbol) return
        const at = serverNow()
        const nextRound = applyGuess(currentRound, trimmed, word, at)
        if (!nextRound) return
        // Co-op: a solved round's points go to the shared team total, which
        // both seats mirror so every client (and the shared UI) agrees.
        return { ...current, round: nextRound, scores: teamScoresFor(nextRound.teamScore), lastActivityAt: at }
      })
      // Not committed = the guess clock expired first; the slot already
      // counts as a timed-out miss.
      if (!result.committed) { say('TOO LATE — THE GUESS CLOCK RAN OUT', 'info'); return }
      setInput('')
      sounds.move(mySymbol)
      if (!isCorrectGuess(trimmed, word)) say(`NOT “${trimmed.toUpperCase()}” — WAIT FOR THE NEXT CLUE`, 'bad')
    }, () => toast.error('GUESS FAILED — CHECK CONNECTION'))
  }, [gameId, input, mySymbol, runBusy, say, serverNow, word])

  const startNewMatch = useCallback(() => runNewMatch(
    async () => { await onNewMatch?.() },
    () => toast.error('NEW MATCH FAILED — CHECK CONNECTION'),
  ), [onNewMatch, runNewMatch])

  const submit = phase === 'clue' ? submitClue : submitGuess
  const canSubmit = phase === 'clue' ? isClueGiver : isGuesser
  const solvedWith = guesses.find(guess => guess?.correct)?.text || ''
  const clockTotalMs = phase === 'clue' ? CLUE_MS : guessSecondsForClueNumber(Math.max(1, clues.length)) * 1000
  const clockLabel = phase === 'clue'
    ? `CLUE ${Math.min(MAX_CLUES, clues.length + 1)} OF ${MAX_CLUES}`
    : `GUESS ${clues.length} OF ${MAX_CLUES}`
  const roundNum = round?.roundNum || 1
  const nameOf = symbol => (game?.players?.[symbol]?.name || symbol || '').toUpperCase()
  const upcoming = round ? nextRoles(round.clueGiver) : null
  const nextLine = roundNum >= MAX_ROUNDS
    ? 'FINAL ROUND · RESULTS NEXT'
    : !upcoming ? ''
      : isSpectator ? `NEXT: ${nameOf(upcoming.clueGiver)} GIVES CLUES`
        : mySymbol === upcoming.guesser ? 'NEXT: YOU GUESS' : 'NEXT: YOU GIVE CLUES'
  const lastClue = clues[clues.length - 1]

  // Screen-reader status: one polite line that changes once per phase/slot,
  // instead of the whole card being re-announced every phase.
  let announcement = ''
  if (phase === 'intro') {
    announcement = `Round ${roundNum} of ${MAX_ROUNDS}. ${isClueGiver ? `You give clues. The password is ${word}.` : isGuesser ? 'You guess.' : ''}`
  } else if (phase === 'clue') {
    announcement = isClueGiver ? `Send clue ${clues.length + 1}.` : `Waiting for clue ${clues.length + 1}.`
  } else if (phase === 'guess') {
    const clueText = lastClue?.text ? `Clue ${clues.length}: ${lastClue.text}.` : ''
    announcement = isGuesser ? `${clueText} Your guess.` : `${clueText} Waiting for the guess.`
  } else if (phase === 'reveal') {
    const points = round?.lastDelta?.points
    announcement = `The password was ${word}. ${points ? `Plus ${points} team points.` : 'No points.'} ${nextLine}`
  }

  if (matchFinished) {
    const history = toList(round?.history).map(entry => ({ ...entry, word: PASSWORD_DECK[Number(entry.wordIndex)]?.word || '' }))
    const best = bestRound(history)
    return (
      <div className="space-y-5 py-4 max-w-sm mx-auto">
        <p className="sr-only" role="status" aria-live="polite">
          {`Match over. Team score ${teamScore} of ${MAX_TEAM_SCORE}. ${starRating(teamScore)} stars.`}
        </p>
        <div className="text-center space-y-1">
          <p className="font-pixel text-[10px] text-retro-dim tracking-widest">PASSWORD · CO-OP RESULT</p>
          <p className="font-mono text-[9px] text-retro-dim">YOU PLAY AS A TEAM — EVERY POINT COUNTS FOR BOTH OF YOU</p>
        </div>
        <PasswordMatchResult
          teamScore={teamScore}
          history={history}
          best={best}
          players={game.players}
          mySymbol={mySymbol}
          endedEarly={!!round?.endedEarly || (history.length > 0 && history.length < MAX_ROUNDS)}
        />
        <div className="flex flex-wrap justify-center gap-2">
          {/* No PLAY AGAIN here: applyPlayAgain preserves scores, so a
              finished match would reopen with a stale team total. NEW MATCH
              resets via applyNewMatch. */}
          {!proposal && onNewMatch && (
            <ActionButton busy={startingNewMatch} busyLabel="STARTING…" onClick={startNewMatch}>NEW MATCH</ActionButton>
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
        roundNum={roundNum}
        teamScore={teamScore}
        players={game?.players}
        mySymbol={mySymbol}
        clueGiver={round?.clueGiver}
        guesser={round?.guesser}
      />
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      {isSpectator && <p className="font-pixel text-[9px] text-retro-dim text-center">SPECTATING · SECRET LOCKED UNTIL REVEAL</p>}
      {!isSpectator && !opponentOnline && !partnerAway && (
        <div className="space-y-1 text-center">
          <OfflineNotice label="PARTNER" />
          {offlineSince != null && (
            <p className="font-mono text-[9px] text-retro-dim">
              IF THEY DON&apos;T RETURN, YOU CAN END THE MATCH IN {Math.max(0, Math.ceil((offlineSince + PARTNER_OFFLINE_MS - now) / 1000))}S
            </p>
          )}
        </div>
      )}
      {!isSpectator && partnerAway && (
        <div className="rounded border border-retro-danger/50 bg-retro-tint-danger p-3 text-center space-y-2">
          <p className="font-pixel text-[9px] text-retro-danger">PARTNER OFFLINE {Math.floor((now - offlineSince) / 1000)}S</p>
          <p className="font-mono text-[10px] text-retro-dim">
            THE CLOCKS KEEP RUNNING WHILE THEY ARE AWAY. WAIT FOR THEM, OR END THE MATCH NOW WITH YOUR TEAM SCORE OF {teamScore}.
          </p>
          <ActionButton busy={ending} busyLabel="ENDING…" onClick={endMatch}>END MATCH</ActionButton>
        </div>
      )}

      {(phase === 'clue' || phase === 'guess') && round?.endsAt && (
        <RoundTimer endsAt={round.endsAt} now={now} totalMs={clockTotalMs} label={clockLabel} />
      )}

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
              onChange={event => { setInput(event.target.value); if (feedback.message) say('') }}
              maxLength={phase === 'clue' ? 16 : 24}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="send"
              aria-describedby="password-entry-feedback"
              placeholder={phase === 'clue' ? 'TYPE ONE-WORD CLUE…' : 'TYPE YOUR GUESS…'}
              className="min-h-11 min-w-0 flex-1 bg-retro-card border-2 border-retro-border text-retro-text font-mono text-sm rounded px-3 focus:outline-none focus:border-retro-p1 transition-colors placeholder:text-retro-dim/60"
            />
            <ActionButton type="submit" busy={busy} busyLabel={phase === 'clue' ? 'SENDING…' : 'CHECKING…'}>
              {phase === 'clue' ? 'SEND CLUE' : 'GUESS'}
            </ActionButton>
          </div>
          {phase === 'clue' && <p className="font-mono text-[9px] text-retro-dim">ONE WORD · 3–16 LETTERS · {MAX_CLUES - clues.length} CLUES LEFT</p>}
        </form>
      )}
      {!isSpectator && (
        <div id="password-entry-feedback">
          <WordFeedback message={feedback.message} tone={feedback.tone} id={feedback.id} />
        </div>
      )}

      {phase === 'intro' && <p className="font-pixel text-[10px] text-retro-cta text-center arcade-blink">REVEALING ROLES…</p>}
      {phase === 'reveal' && (
        <div className="text-center space-y-1">
          {round?.lastDelta?.points ? (
            <p className="font-pixel text-base text-retro-win text-glow-win">+{round.lastDelta.points} TEAM POINTS</p>
          ) : <p className="font-pixel text-[10px] text-retro-dim">NO POINTS THIS ROUND</p>}
          {solvedWith && normalizeText(solvedWith) !== normalizeText(word) && (
            <p className="font-mono text-[10px] text-retro-dim">ACCEPTED “{solvedWith.toUpperCase()}” — CLOSE ENOUGH</p>
          )}
          <p className="font-pixel text-[10px] text-retro-cta">{nextLine}</p>
        </div>
      )}
      {/* No in-play SWITCH GAME: the room header's switch icon covers it
          mid-match, and the end screen keeps the full button. */}
    </div>
  )
}
