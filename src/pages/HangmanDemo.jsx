import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import HangmanGallows from '../components/HangmanGallows'
import WordDisplay from '../components/WordDisplay'
import LetterKeyboard from '../components/LetterKeyboard'
import WordSetter from '../components/WordSetter'
import WordFeedback from '../components/WordFeedback'
import MatchScoreRail from '../components/MatchScoreRail'
import {
  applyGuess, isWordGuessed, countWrong, wordStructure, buildNextRound, roundNumber, isSuddenDeath,
  MAX_WRONG, WORD_RULE_DICTIONARY,
} from '../lib/hangmanLogic'
import {
  pickKeeperWord, hangmanPattern, hangmanCandidates, pickHangmanGuess, hangmanThinkMs,
} from '../lib/wordBotsLogic'
import { loadDictionary } from '../lib/wordhuntDictionary'
import { sounds } from '../lib/sounds'
import useBusy from '../hooks/useBusy'
import { cn } from '@/lib/utils'

// Solo HANGWOMAN vs the CPU, fully local. Setting alternates like the room
// game: the CPU keeps a word first (you guess), then you keep one under the
// room's default rule (one dictionary word, 4+ letters) and the CPU guesses.
// First to 3 with equal setter turns (hangmanLogic.buildNextRound).
// X = you, O = the CPU.

const MATCH_TARGET = 3

function playerName() {
  try { return localStorage.getItem('playerName') || 'YOU' } catch { return 'YOU' }
}

function freshMatch() {
  return { scores: { X: 0, O: 0 }, round: { setter: 'O', turns: { X: 0, O: 0 } } }
}

// A round's opening state: the CPU's word is ready at once; yours waits for
// the setter form.
function openRound(setter, used) {
  if (setter === 'O') {
    const { word, hint } = pickKeeperWord({ used })
    return { setter, phase: 'guessing', word, hint, guesses: {}, result: null }
  }
  return { setter, phase: 'setting', word: '', hint: '', guesses: {}, result: null }
}

function applyLetter(round, letter) {
  const positions = applyGuess(round.word, letter)
  const guesses = { ...round.guesses, [letter]: positions.length ? positions : false }
  const result = isWordGuessed(round.word, guesses) ? 'guessed'
    : countWrong(guesses) >= MAX_WRONG ? 'hanged' : null
  return { ...round, guesses, result, phase: result ? 'reveal' : 'guessing', last: { letter, hit: positions.length > 0 } }
}

export default function HangmanDemo() {
  const [match, setMatch] = useState(freshMatch)
  const [used, setUsed] = useState([])
  const [round, setRound] = useState(() => openRound('O', []))
  const [names] = useState(() => ({ X: { name: playerName() }, O: { name: 'CPU' } }))

  // The word list backs your setter word and the CPU's guessing; it loads
  // while you play the first round.
  const [dict, setDict] = useState(null)
  const [dictError, setDictError] = useState(false)
  const [, runRetry] = useBusy()
  useEffect(() => {
    let cancelled = false
    loadDictionary()
      .then(d => { if (!cancelled) setDict(d) })
      .catch(() => { if (!cancelled) setDictError(true) })
    return () => { cancelled = true }
  }, [])
  const retryDictionary = () => runRetry(async () => {
    setDictError(false)
    setDict(await loadDictionary())
  }, () => {
    setDictError(true)
    toast.error("COULDN'T LOAD WORD LIST — TRY AGAIN")
  })

  const cpuGuessing = round.setter === 'X' && round.phase === 'guessing'
  const youGuessing = round.setter === 'O' && round.phase === 'guessing'
  const matchOver = match.status === 'finished'

  // End of a round: score it and set up the match for the next one.
  const finishRound = (next) => {
    if (!next.result) return
    const guesser = next.setter === 'O' ? 'X' : 'O'
    const winner = next.result === 'guessed' ? guesser : next.setter
    const after = buildNextRound({ scores: match.scores, round: match.round }, winner, { target: MATCH_TARGET })
    setMatch({ scores: after.scores, round: after.round, status: after.status, winner: after.winner })
    if (after.status === 'finished') {
      if (after.winner === 'X') sounds.matchWin(); else sounds.lose()
    } else if (winner === 'X') sounds.win()
    else sounds.lose()
  }

  const handleGuess = (letter) => {
    if (!youGuessing || letter in round.guesses) return
    const next = applyLetter(round, letter)
    if (next.last.hit) sounds.hit(); else sounds.miss()
    setRound(next)
    finishRound(next)
  }

  // CPU guesser: one letter per think delay, from the words that still fit
  // (or plain letter frequency while too many do).
  useEffect(() => {
    if (!cpuGuessing) return
    const id = setTimeout(() => {
      const guessed = Object.keys(round.guesses)
      const candidates = hangmanCandidates({ pattern: hangmanPattern(round.word, round.guesses), guessed, dict })
      const letter = pickHangmanGuess({ guessed, candidates })
      if (!letter) return
      const next = applyLetter(round, letter)
      if (next.last.hit) sounds.hit(); else sounds.miss()
      setRound(next)
      finishRound(next)
    }, hangmanThinkMs())
    return () => clearTimeout(id)
    // finishRound reads `match`, which only changes when a round ends
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpuGuessing, round, dict])

  const handleWordSet = (word, hint) => {
    setRound({ setter: 'X', phase: 'guessing', word, hint: hint || '', guesses: {}, result: null })
  }

  // The CPU never repeats one of its words within a visit.
  const usedAfterRound = () => (round.setter === 'O' && !used.includes(round.word) ? [...used, round.word] : used)

  const nextRound = () => {
    const nextUsed = usedAfterRound()
    setUsed(nextUsed)
    setRound(openRound(match.round.setter, nextUsed))
  }

  const newMatch = () => {
    const nextUsed = usedAfterRound()
    const fresh = freshMatch()
    setUsed(nextUsed)
    setMatch(fresh)
    setRound(openRound(fresh.round.setter, nextUsed))
  }

  const game = { scores: match.scores, players: names }
  const turns = match.round.turns
  const shownRound = round.phase === 'reveal' ? roundNumber(turns) - 1 : roundNumber(turns)
  const wrong = countWrong(round.guesses)
  const guesserIsYou = round.setter === 'O'
  const youWonRound = round.result && ((round.result === 'guessed') === guesserIsYou)
  const feedback = round.last
    ? `${guesserIsYou ? 'YOU' : 'CPU'} GUESSED ${round.last.letter} — ${round.last.hit ? 'IN THE WORD' : 'NOT IN THE WORD'}`
    : guesserIsYou ? 'THE CPU HAS A WORD — GUESS A LETTER' : ''

  return (
    <div className="space-y-4">
      <MatchScoreRail
        game={game}
        mySymbol="X"
        matchTarget={MATCH_TARGET}
        roundLabel={`ROUND ${Math.max(1, shownRound)}${isSuddenDeath(match.scores, MATCH_TARGET) ? ' · SUDDEN DEATH' : ''}`}
      />

      {round.phase === 'setting' && (
        <WordSetter
          onWordSet={handleWordSet}
          rule={WORD_RULE_DICTIONARY}
          dictionary={dict}
          dictionaryError={dictError}
          onRetryDictionary={retryDictionary}
        />
      )}

      {round.phase !== 'setting' && (
        <>
          <p className="font-pixel text-[9px] text-center tracking-wider text-retro-dim">
            {guesserIsYou ? 'THE CPU KEEPS THE WORD — YOU GUESS' : 'YOU KEEP THE WORD — THE CPU GUESSES'}
          </p>
          <HangmanGallows wrongCount={wrong} />
          <WordDisplay
            wordStructure={wordStructure(round.word)}
            hint={round.hint || null}
            guesses={round.guesses}
            revealedWord={round.phase === 'reveal' ? round.word : null}
          />
          {!guesserIsYou && round.phase === 'guessing' && (
            <p className="font-mono text-[10px] text-retro-dim text-center">
              Your word: <span className="text-retro-cta">{round.word}</span>
            </p>
          )}
          <p className="font-mono text-[10px] text-retro-dim text-center">{wrong}/{MAX_WRONG} wrong</p>
          <WordFeedback
            message={round.phase === 'reveal' ? '' : feedback}
            tone={round.last ? (round.last.hit ? 'ok' : 'bad') : 'info'}
            id={Object.keys(round.guesses).length}
          />
          {cpuGuessing && (
            <p className="font-pixel text-[9px] text-retro-p2 text-center arcade-blink">CPU IS THINKING…</p>
          )}

          {round.phase === 'reveal' && (
            <div className="text-center space-y-2">
              <p className={cn('font-pixel text-xs', youWonRound ? 'text-retro-win text-glow-win' : 'text-retro-p2')}>
                {round.result === 'guessed'
                  ? (guesserIsYou ? 'YOU GOT IT — +1 YOU' : 'THE CPU GOT IT — +1 CPU')
                  : (guesserIsYou ? 'HANGED — +1 CPU' : 'THE CPU WAS HANGED — +1 YOU')}
              </p>
              <p className="font-mono text-[10px] text-retro-dim">
                The word was <span className="text-retro-cta">{round.word}</span>
              </p>
              {matchOver ? (
                <div className="space-y-2 pt-1">
                  <p className={cn('font-pixel text-sm', match.winner === 'X' ? 'text-retro-win text-glow-win' : 'text-retro-p2')}>
                    {match.winner === 'X' ? 'YOU WIN THE MATCH!' : 'THE CPU WINS THE MATCH'}
                  </p>
                  <button
                    type="button"
                    onClick={newMatch}
                    className="px-5 py-2 font-pixel text-[10px] bg-retro-cta text-retro-bg rounded hover:shadow-neon-cta active:scale-95"
                  >
                    NEW MATCH
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={nextRound}
                  className="px-5 py-2 font-pixel text-[10px] border border-retro-p1 text-retro-p1 rounded hover:shadow-neon-p1 active:scale-95"
                >
                  {match.round.setter === 'X' ? 'NEXT ROUND — YOU SET A WORD' : 'NEXT ROUND — YOU GUESS'}
                </button>
              )}
            </div>
          )}

          {round.phase !== 'reveal' && (
            <LetterKeyboard guesses={round.guesses} onGuess={handleGuess} disabled={!youGuessing} />
          )}
        </>
      )}
    </div>
  )
}
