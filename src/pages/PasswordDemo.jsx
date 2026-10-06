import { useEffect, useRef, useState } from 'react'
import PasswordCard, { PasswordMatchResult } from '../components/PasswordCard'
import RoundTimer from '../components/RoundTimer'
import { sounds } from '../lib/sounds'
import { PASSWORD_DECK } from '../lib/decks/password'
import {
  CLUE_MS, MAX_CLUES, applyClue, applyGuess, bestRound, createInitialRound,
  getMatchWinner, guessSecondsForClueNumber, nextRoles, pickWord, toList, validateClue,
} from '../lib/passwordLogic'
import { BOT_CLUE_DECK, advanceDemoClock, pickBotClue, pickBotGuess } from '../lib/passwordBot'

// Solo/bot PASSWORD — one screen, no Firebase. The human is always X and the
// bot is O; roles swap every round via passwordLogic.nextRoles. Co-op like the
// room game: one team score over the match. The clue and guess clocks run
// through advanceDemoClock, so a slot left to expire times out instead of
// refusing every late guess. Intro and reveal are shorter than the live 2s/5s.

const PLAYER = 'X'
const BOT = 'O'
const DEMO_INTRO_MS = 1200
const DEMO_REVEAL_MS = 2200
const BOT_THINK_MS = 900
const TICK_MS = 250
const PLAYERS = { X: { name: 'YOU' }, O: { name: 'BOT' } }

function makeSeed() {
  try { return crypto.randomUUID() } catch { return `${Date.now()}-${Math.random()}` }
}

// Bot-clue rounds draw from the curated clue bank so its clues are guessable;
// player-clue rounds draw from the full deck.
// `previous` carries the team score and recap into the next round.
function buildRound({ roundNum, clueGiver, usedWords, seed, previous = null, now = Date.now() }) {
  const deck = clueGiver === BOT ? BOT_CLUE_DECK : PASSWORD_DECK
  const blocked = deck.map((entry, index) => (usedWords.has(entry.word) ? index : -1)).filter(index => index >= 0)
  const entry = deck[pickWord(deck, seed, blocked)] || deck[0]
  return {
    ...createInitialRound({ starter: clueGiver, seed, wordIndex: 0, wordLength: entry.word.length }),
    phase: 'intro',
    roundNum,
    clueGiver,
    guesser: clueGiver === PLAYER ? BOT : PLAYER,
    word: entry.word,
    used: [...usedWords, entry.word],
    teamScore: previous?.teamScore || 0,
    history: toList(previous?.history),
    endsAt: now + DEMO_INTRO_MS,
  }
}

function ActionButton({ children, onClick, secondary = false }) {
  return (
    <button
      type={secondary ? 'button' : 'submit'}
      onClick={onClick}
      className={secondary
        ? 'min-h-11 px-5 py-2.5 border-2 border-retro-border text-retro-text font-pixel text-[10px] rounded hover:border-retro-p1 hover:text-retro-p1 transition press'
        : 'min-h-11 px-5 py-2.5 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta transition press'}
    >
      {children}
    </button>
  )
}

export default function PasswordDemo() {
  const [round, setRound] = useState(() => buildRound({
    roundNum: 1, clueGiver: PLAYER, usedWords: new Set(), seed: makeSeed(),
  }))
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const phase = round.phase
  const finished = phase === 'finished'
  const isMyClueTurn = phase === 'clue' && round.clueGiver === PLAYER
  const isMyGuessTurn = phase === 'guess' && round.guesser === PLAYER

  // One clock: ends the intro and times out an expired clue or guess slot.
  const timed = phase === 'intro' || phase === 'clue' || phase === 'guess'
  useEffect(() => {
    if (!timed) return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      setRound(current => advanceDemoClock(current, t) || current)
    }, TICK_MS)
    return () => clearInterval(id)
  }, [timed])

  // reveal → next round or match end
  useEffect(() => {
    if (round.phase !== 'reveal') return
    const timer = setTimeout(() => {
      if (getMatchWinner(null, round.roundNum)) {
        setRound(current => ({ ...current, phase: 'finished', endsAt: null }))
        return
      }
      const roles = nextRoles(round.clueGiver)
      setRound(current => buildRound({
        roundNum: current.roundNum + 1,
        clueGiver: roles.clueGiver,
        usedWords: new Set(current.used),
        seed: makeSeed(),
        previous: current,
      }))
    }, DEMO_REVEAL_MS)
    return () => clearTimeout(timer)
  }, [round])

  // Bot turn: give a clue, or guess after a beat.
  useEffect(() => {
    if (round.phase === 'clue' && round.clueGiver === BOT) {
      const timer = setTimeout(() => {
        const clue = pickBotClue({ word: round.word, previousClues: round.clues })
        if (clue == null) return
        const applied = applyClue(round, clue)
        if (applied) setRound({ ...applied, word: round.word })
      }, BOT_THINK_MS)
      return () => clearTimeout(timer)
    }
    if (round.phase === 'guess' && round.guesser === BOT) {
      const timer = setTimeout(() => {
        const guess = pickBotGuess({ word: round.word, deck: PASSWORD_DECK, clueNumber: round.clues.length })
        const applied = applyGuess(round, guess, round.word)
        if (applied) setRound(applied)
      }, BOT_THINK_MS)
      return () => clearTimeout(timer)
    }
  }, [round])

  // Phase-change audio, mirroring PasswordGame's cue points.
  const previousPhase = useRef(null)
  useEffect(() => {
    const current = round.phase
    if (previousPhase.current === current) return
    const from = previousPhase.current
    previousPhase.current = current
    if (!from) return
    if (current === 'clue') sounds.go()
    if (current === 'guess') sounds.bell()
    if (current === 'reveal') {
      if (round.lastDelta?.points) sounds.win()
      else sounds.miss()
    }
  }, [round])

  const submitClue = () => {
    if (!isMyClueTurn) return
    const check = validateClue({ clue: input, word: round.word, previousClues: round.clues })
    if (!check.valid) { setError(check.reason); return }
    const applied = applyClue(round, input)
    if (!applied) { setError('CLUE REJECTED'); return }
    setError('')
    setInput('')
    // applyClue strips the secret from its result (the live game re-injects it
    // from the deck); this demo owns the word locally, so put it back.
    setRound({ ...applied, word: round.word })
  }

  const submitGuess = () => {
    if (!isMyGuessTurn) return
    const trimmed = input.trim()
    if (!trimmed) { setError('ENTER A GUESS'); return }
    if (trimmed.length > 24) { setError('GUESS MUST BE 24 CHARACTERS OR LESS'); return }
    const applied = applyGuess(round, trimmed, round.word)
    if (!applied) { setError('GUESS REJECTED'); return }
    setError('')
    setInput('')
    setRound(applied)
  }

  const playAgain = () => {
    setInput('')
    setError('')
    setRound(buildRound({ roundNum: 1, clueGiver: PLAYER, usedWords: new Set(), seed: makeSeed() }))
  }

  // The demo's rounds keep their words in `used` (one per round, in order).
  const history = toList(round.history).map(entry => ({ ...entry, word: round.used[entry.roundNum - 1] || '' }))

  return (
    <div className="space-y-4">
      <PasswordCard
        phase={phase}
        word={round.word}
        wordPattern={round.wordPattern}
        canSeeSecret={round.clueGiver === PLAYER}
        clues={round.clues}
        guesses={round.guesses}
        roundNum={round.roundNum}
        teamScore={round.teamScore || 0}
        players={PLAYERS}
        mySymbol={PLAYER}
        clueGiver={round.clueGiver}
        guesser={round.guesser}
      />

      {finished ? (
        <div className="space-y-3 text-center" aria-live="polite">
          <PasswordMatchResult teamScore={round.teamScore || 0} history={history} best={bestRound(history)} players={PLAYERS} mySymbol={PLAYER} />
          <ActionButton secondary onClick={playAgain}>PLAY AGAIN</ActionButton>
        </div>
      ) : (
        <>
          {(phase === 'clue' || phase === 'guess') && round.endsAt && (
            <RoundTimer
              endsAt={round.endsAt}
              now={now}
              totalMs={phase === 'clue' ? CLUE_MS : guessSecondsForClueNumber(Math.max(1, round.clues.length)) * 1000}
              label={phase === 'clue'
                ? `CLUE ${Math.min(MAX_CLUES, round.clues.length + 1)} OF ${MAX_CLUES}`
                : `GUESS ${round.clues.length} OF ${MAX_CLUES}`}
            />
          )}
          {(isMyClueTurn || isMyGuessTurn) && (
            <form onSubmit={event => { event.preventDefault(); if (isMyClueTurn) submitClue(); else submitGuess() }} className="space-y-2">
              <label htmlFor="password-demo-entry" className="sr-only">
                {isMyClueTurn ? 'One-word clue' : 'Guess the password'}
              </label>
              <div className="flex gap-2">
                <input
                  id="password-demo-entry"
                  value={input}
                  onChange={event => { setInput(event.target.value); setError('') }}
                  maxLength={isMyClueTurn ? 16 : 24}
                  enterKeyHint="send"
                  autoComplete="off"
                  spellCheck="false"
                  placeholder={isMyClueTurn ? 'TYPE ONE-WORD CLUE…' : 'TYPE YOUR GUESS…'}
                  className="min-h-11 min-w-0 flex-1 bg-retro-card border-2 border-retro-border text-retro-text font-mono text-sm rounded px-3 focus:outline-none focus:border-retro-p1 transition-colors placeholder:text-retro-dim/60"
                />
                <ActionButton>{isMyClueTurn ? 'SEND CLUE' : 'GUESS'}</ActionButton>
              </div>
              {error && <p role="alert" className="font-pixel text-[9px] text-retro-danger">{error}</p>}
              {isMyClueTurn && (
                <p className="font-mono text-[9px] text-retro-dim">
                  ONE WORD · MAX 16 CHARACTERS · {MAX_CLUES - round.clues.length} CLUES LEFT
                </p>
              )}
            </form>
          )}

          {phase === 'intro' && (
            <p className="font-pixel text-[10px] text-retro-cta text-center arcade-blink">REVEALING ROLES…</p>
          )}
          {phase === 'clue' && round.clueGiver === BOT && (
            <p className="font-pixel text-[10px] text-retro-dim text-center">BOT IS WRITING A CLUE…</p>
          )}
          {phase === 'guess' && round.guesser === BOT && (
            <p className="font-pixel text-[10px] text-retro-dim text-center">BOT IS GUESSING…</p>
          )}
          {phase === 'reveal' && (
            <div className="text-center space-y-1" aria-live="polite">
              {round.lastDelta?.points ? (
                <p className="font-pixel text-base text-retro-win text-glow-win">
                  +{round.lastDelta.points} TEAM POINTS
                </p>
              ) : <p className="font-pixel text-[10px] text-retro-dim">NO POINTS THIS ROUND</p>}
              <p className="font-mono text-[10px] text-retro-dim">NEXT ROUND SWAPS CLUE-GIVER</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
