import { useEffect, useRef, useState } from 'react'
import { ref, update } from 'firebase/database'
import { db } from '../lib/firebase'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import { sounds } from '../lib/sounds'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const SHOW_MS = 3000  // how long the number is visible

function normalizeRound(raw) {
  if (!raw) return { phase: 'setting', setter: 'X', level: 1 }
  return raw
}

export default function NumberMemoryGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onNewMatch, proposal,
}) {
  const round = normalizeRound(game.numRound)
  const isSetter   = mySymbol === round.setter
  const isRecaller = mySymbol && mySymbol !== round.setter
  const recaller   = round.setter === 'X' ? 'O' : 'X'

  const [numberInput, setNumberInput] = useState('')
  const [guessInput, setGuessInput]   = useState('')
  const [inputError, setInputError]   = useState('')
  const [countdown, setCountdown]     = useState(null)
  const timerRef = useRef(null)

  // Transition showing → recall after SHOW_MS (recaller's client drives this)
  useEffect(() => {
    if (round.phase !== 'showing') {
      clearTimeout(timerRef.current)
      setCountdown(null)
      return
    }
    if (!isRecaller && mySymbol) return  // only recaller drives transition

    let remaining = SHOW_MS
    const interval = setInterval(() => {
      remaining -= 100
      setCountdown(Math.ceil(remaining / 1000))
      if (remaining <= 0) {
        clearInterval(interval)
        setCountdown(null)
        update(ref(db, `games/${gameId}/numRound`), { phase: 'recall' }).catch(() => {})
      }
    }, 100)
    timerRef.current = interval
    return () => clearInterval(interval)
  }, [round.phase, isRecaller, mySymbol, gameId])

  const writeRound = async (patch) => {
    try { await update(ref(db, `games/${gameId}/numRound`), patch) }
    catch { toast.error('WRITE FAILED — CHECK CONNECTION') }
  }

  const writeGame = async (patch) => {
    try { await update(ref(db, `games/${gameId}`), patch) }
    catch { toast.error('WRITE FAILED — CHECK CONNECTION') }
  }

  // Setter confirms number
  const handleSetNumber = () => {
    const n = numberInput.trim()
    if (!n || !/^\d+$/.test(n)) { setInputError('DIGITS ONLY'); return }
    if (n.length !== round.level) { setInputError(`MUST BE ${round.level} DIGIT${round.level > 1 ? 'S' : ''}`); return }
    setNumberInput('')
    setInputError('')
    sounds.move('X')
    writeRound({ phase: 'showing', number: n })
  }

  // Recaller submits guess
  const handleGuess = () => {
    const guess = guessInput.trim()
    if (!guess) { setInputError('TYPE YOUR ANSWER'); return }
    setGuessInput('')
    setInputError('')
    const correct = guess === round.number
    sounds.move(mySymbol)
    if (correct) {
      // Next round: swap roles, level up
      writeRound({
        phase: 'setting',
        setter: recaller,  // recaller becomes setter next round
        level: round.level + 1,
        number: null,
      })
    } else {
      // Wrong — setter wins
      writeGame({
        'numRound/phase': 'result',
        'numRound/guess': guess,
        'numRound/correct': false,
        winner: round.setter,
        status: 'finished',
        [`scores/${round.setter}`]: (game.scores?.[round.setter] || 0) + 1,
      })
    }
  }

  const matchWinner = (game.scores?.X || 0) >= 3 ? 'X' : (game.scores?.O || 0) >= 3 ? 'O' : null

  // Game finished — show result
  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        {round.phase === 'result' && (
          <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2 text-center">
            <p className="font-pixel text-[8px] text-retro-dim">THE NUMBER WAS</p>
            <p className="font-pixel text-lg text-retro-p1 text-glow-p1 tracking-widest">{round.number}</p>
            {round.guess && (
              <p className="font-pixel text-[8px] text-retro-p2">
                GUESS: <span className="text-retro-text">{round.guess}</span>
              </p>
            )}
          </div>
        )}
        <GameStatus
          status={game.status}
          winner={game.winner}
          mySymbol={mySymbol}
          scores={game.scores}
          players={game.players}
          gameType={game.gameType}
          onPlayAgain={!matchWinner && !proposal ? onNewMatch : null}
          onNewMatch={matchWinner && !proposal ? onNewMatch : null}
          onSwitchGame={!proposal ? onSwitchGame : null}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Round info */}
      <div className="flex items-center justify-between font-pixel text-[9px]">
        <span className="text-retro-cta text-glow-cta">
          {round.level} DIGIT{round.level > 1 ? 'S' : ''}
        </span>
        <span className="text-retro-dim">
          SETTER: <span className={round.setter === 'X' ? 'text-retro-p1' : 'text-retro-p2'}>{round.setter}</span>
        </span>
      </div>

      {/* Phase: SETTING */}
      {round.phase === 'setting' && (
        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-3">
          {isSetter ? (
            <>
              <p className="font-pixel text-[9px] text-retro-cta text-center animate-pulse">
                TYPE A {round.level}-DIGIT NUMBER
              </p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={round.level}
                value={numberInput}
                onChange={e => { setNumberInput(e.target.value.replace(/\D/g, '')); setInputError('') }}
                onKeyDown={e => e.key === 'Enter' && handleSetNumber()}
                autoFocus
                className="w-full bg-retro-surface border-2 border-retro-border text-retro-text font-pixel text-sm tracking-[0.3em] text-center rounded px-3 py-2 focus:outline-none focus:border-retro-p1"
                placeholder={'—'.repeat(round.level)}
              />
              {inputError && <p className="font-pixel text-[8px] text-retro-p2 text-center">{inputError}</p>}
              <button
                onClick={handleSetNumber}
                className="w-full py-2 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded hover:shadow-neon-cta active:scale-95"
              >
                LOCK IN
              </button>
            </>
          ) : (
            <p className="font-pixel text-[9px] text-retro-dim text-center animate-pulse">
              {game.players?.[round.setter]?.name?.toUpperCase() ?? round.setter} IS SETTING THE NUMBER...
            </p>
          )}
        </div>
      )}

      {/* Phase: SHOWING */}
      {round.phase === 'showing' && (
        <div className="bg-retro-card border border-retro-border rounded p-6 text-center space-y-3">
          <p className="font-pixel text-[8px] text-retro-dim">MEMORIZE THIS NUMBER</p>
          <p className="font-pixel text-2xl text-retro-cta text-glow-cta tracking-widest">
            {round.number}
          </p>
          {isRecaller && countdown !== null && (
            <p className="font-pixel text-[9px] text-retro-p2 animate-pulse">{countdown}s</p>
          )}
          {!isRecaller && (
            <p className="font-pixel text-[8px] text-retro-dim">
              WAITING FOR OPPONENT TO MEMORIZE...
            </p>
          )}
        </div>
      )}

      {/* Phase: RECALL */}
      {round.phase === 'recall' && (
        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-3">
          {isRecaller ? (
            <>
              <p className="font-pixel text-[9px] text-retro-cta text-center animate-pulse">
                WHAT WAS THE NUMBER?
              </p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={round.level + 2}
                value={guessInput}
                onChange={e => { setGuessInput(e.target.value.replace(/\D/g, '')); setInputError('') }}
                onKeyDown={e => e.key === 'Enter' && handleGuess()}
                autoFocus
                className="w-full bg-retro-surface border-2 border-retro-border text-retro-text font-pixel text-sm tracking-[0.3em] text-center rounded px-3 py-2 focus:outline-none focus:border-retro-p1"
                placeholder={'?'.repeat(round.level)}
              />
              {inputError && <p className="font-pixel text-[8px] text-retro-p2 text-center">{inputError}</p>}
              <button
                onClick={handleGuess}
                className="w-full py-2 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded hover:shadow-neon-cta active:scale-95"
              >
                SUBMIT
              </button>
            </>
          ) : (
            <p className="font-pixel text-[9px] text-retro-dim text-center animate-pulse">
              {game.players?.[recaller]?.name?.toUpperCase() ?? recaller} IS RECALLING...
            </p>
          )}
        </div>
      )}

      {/* Disconnect warning */}
      {!opponentOnline && mySymbol && (
        <p className="font-pixel text-[10px] text-retro-p2 text-center animate-pulse">
          OPPONENT DISCONNECTED
        </p>
      )}

      {/* Switch game */}
      {!proposal && <GameSwitcher onSwitchGame={onSwitchGame} />}
    </div>
  )
}
