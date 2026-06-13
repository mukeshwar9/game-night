import { useEffect, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import { sounds } from '../lib/sounds'
import { toast } from 'sonner'

const SHOW_MS = 3000

function generateNumber(level) {
  let n = String(Math.floor(Math.random() * 9) + 1)
  for (let i = 1; i < level; i++) n += String(Math.floor(Math.random() * 10))
  return n
}

function normalizeRound(raw) {
  if (!raw) return { phase: 'showing', level: 1, number: '1', answerX: null, answerO: null }
  return {
    phase: raw.phase ?? 'showing',
    level: raw.level ?? 1,
    number: raw.number ?? '1',
    answerX: raw.answerX ?? null,
    answerO: raw.answerO ?? null,
  }
}

export default function NumberMemoryGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const round = normalizeRound(game.numRound)
  const myKey = mySymbol === 'X' ? 'X' : 'O'
  const opKey = myKey === 'X' ? 'O' : 'X'
  const myAnswer = round[`answer${myKey}`]
  const opAnswer = round[`answer${opKey}`]

  const [guessInput, setGuessInput] = useState('')
  const [inputError, setInputError] = useState('')
  const [countdown, setCountdown] = useState(null)
  const [localSubmitted, setLocalSubmitted] = useState(false)
  const timerRef = useRef(null)
  const prevLevel = useRef(round.level)
  const prevAnswerX = useRef(round.answerX)
  const prevAnswerO = useRef(round.answerO)

  const hasSubmitted = localSubmitted || myAnswer != null

  // Reset local state when round advances (level changes)
  useEffect(() => {
    if (round.level !== prevLevel.current) {
      setLocalSubmitted(false)
      setGuessInput('')
      setInputError('')
      prevLevel.current = round.level
    }
  }, [round.level])

  // Both clients drive showing→recall transition (idempotent — same value written twice)
  useEffect(() => {
    if (round.phase !== 'showing') {
      if (timerRef.current) clearInterval(timerRef.current)
      setCountdown(null)
      return
    }
    setCountdown(Math.ceil(SHOW_MS / 1000))
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
  }, [round.phase, gameId])

  const tryFinishRound = async () => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.status === 'finished') return  // abort
        const r = current.numRound
        if (!r || r.answerX == null || r.answerO == null) return  // abort — not both submitted

        const xCorrect = r.answerX === r.number
        const oCorrect = r.answerO === r.number

        if (xCorrect && oCorrect) {
          const newLevel = r.level + 1
          return {
            ...current,
            numRound: { phase: 'showing', level: newLevel, number: generateNumber(newLevel), answerX: null, answerO: null },
          }
        }

        const loser = !xCorrect ? 'X' : 'O'
        const winner = loser === 'X' ? 'O' : 'X'
        return {
          ...current,
          winner,
          status: 'finished',
          scores: { ...(current.scores || {}), [winner]: (current.scores?.[winner] || 0) + 1 },
        }
      })
    } catch { /* other client already resolved — ignore */ }
  }

  // Watcher: opponent just submitted — if I already submitted, trigger resolution
  useEffect(() => {
    const ax = game.numRound?.answerX
    const ao = game.numRound?.answerO
    if (ax != null && ao != null && (prevAnswerX.current == null || prevAnswerO.current == null)) {
      tryFinishRound()
    }
    prevAnswerX.current = ax
    prevAnswerO.current = ao
  }, [game.numRound?.answerX, game.numRound?.answerO])

  const handleSubmit = async () => {
    if (!mySymbol || hasSubmitted) return
    const guess = guessInput.trim()
    if (!guess) { setInputError('TYPE YOUR ANSWER'); return }
    if (!/^\d+$/.test(guess)) { setInputError('DIGITS ONLY'); return }
    setInputError('')
    setLocalSubmitted(true)
    sounds.move(mySymbol)
    try {
      await update(ref(db, `games/${gameId}/numRound`), { [`answer${myKey}`]: guess })
      await tryFinishRound()
    } catch {
      setLocalSubmitted(false)
      toast.error('SUBMIT FAILED — CHECK CONNECTION')
    }
  }

  const matchWinner = (game.scores?.X || 0) >= 3 ? 'X' : (game.scores?.O || 0) >= 3 ? 'O' : null

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        {round.number && (
          <div className="bg-retro-card border border-retro-border rounded p-4 space-y-2 text-center">
            <p className="font-pixel text-[8px] text-retro-dim">THE NUMBER WAS</p>
            <p className="font-pixel text-lg text-retro-p1 text-glow-p1 tracking-widest">{round.number}</p>
          </div>
        )}
        <GameStatus
          status={game.status}
          winner={game.winner}
          mySymbol={mySymbol}
          scores={game.scores}
          players={game.players}
          gameType={game.gameType}
          onPlayAgain={!matchWinner && !proposal ? onPlayAgain : null}
          onNewMatch={matchWinner && !proposal ? onNewMatch : null}
          onSwitchGame={!proposal ? onSwitchGame : null}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between font-pixel text-[9px]">
        <span className="text-retro-cta text-glow-cta">
          {round.level} DIGIT{round.level > 1 ? 'S' : ''}
        </span>
        <span className="text-retro-dim">LEVEL {round.level}</span>
      </div>

      {round.phase === 'showing' && (
        <div className="bg-retro-card border border-retro-border rounded p-6 text-center space-y-3">
          <p className="font-pixel text-[8px] text-retro-dim">MEMORIZE THIS NUMBER</p>
          <p className="font-pixel text-2xl text-retro-cta text-glow-cta tracking-widest">
            {round.number}
          </p>
          {countdown != null && (
            <p className="font-pixel text-[9px] text-retro-p2 animate-pulse">{countdown}s</p>
          )}
        </div>
      )}

      {round.phase === 'recall' && (
        <div className="bg-retro-card border border-retro-border rounded p-4 space-y-3 relative">
          {hasSubmitted && (
            <div className="absolute inset-0 bg-retro-bg/70 flex items-center justify-center rounded z-10">
              <p className="font-pixel text-[9px] text-retro-win text-glow-win text-center leading-relaxed animate-pulse">
                SUBMITTED ✓{'\n'}WAITING FOR{'\n'}OPPONENT...
              </p>
            </div>
          )}
          <p className="font-pixel text-[9px] text-retro-cta text-center">
            WHAT WAS THE NUMBER?
          </p>
          <div className="flex items-center justify-center gap-6 font-pixel text-[8px]">
            <span className={myAnswer != null ? 'text-retro-win' : 'text-retro-dim'}>
              ME {myAnswer != null ? '✓' : '...'}
            </span>
            <span className={opAnswer != null ? 'text-retro-win' : 'text-retro-dim'}>
              OP {opAnswer != null ? '✓' : '...'}
            </span>
          </div>
          <input
            type="text"
            inputMode="numeric"
            maxLength={round.level + 2}
            value={guessInput}
            disabled={hasSubmitted || !mySymbol}
            onChange={e => { setGuessInput(e.target.value.replace(/\D/g, '')); setInputError('') }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoFocus={!hasSubmitted}
            className="w-full bg-retro-surface border-2 border-retro-border text-retro-text font-pixel text-sm tracking-[0.3em] text-center rounded px-3 py-2 focus:outline-none focus:border-retro-p1 disabled:opacity-40"
            placeholder={'?'.repeat(round.level)}
          />
          {inputError && <p className="font-pixel text-[8px] text-retro-p2 text-center">{inputError}</p>}
          <button
            onClick={handleSubmit}
            disabled={hasSubmitted || !mySymbol}
            className="w-full py-2 bg-retro-cta text-retro-bg font-pixel text-[9px] rounded hover:shadow-neon-cta active:scale-95 disabled:opacity-40 disabled:cursor-default"
          >
            SUBMIT
          </button>
        </div>
      )}

      {!opponentOnline && mySymbol && (
        <p className="font-pixel text-[10px] text-retro-p2 text-center animate-pulse">
          OPPONENT DISCONNECTED
        </p>
      )}
      {!proposal && <GameSwitcher onSwitchGame={onSwitchGame} />}
    </div>
  )
}
