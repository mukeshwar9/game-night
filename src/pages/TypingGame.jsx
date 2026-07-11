import { useEffect, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import TypingKeyboard from '../components/TypingKeyboard'
import OfflineNotice from '../components/loading/OfflineNotice'
import { cn } from '@/lib/utils'

function ProgressBar({ label, val, max, colorClass }) {
  const pct = max > 0 ? Math.min(100, Math.round((val / max) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <span className={cn('font-pixel text-[8px] w-16 truncate', colorClass)}>{label}</span>
      <div className="flex-1 h-2 bg-retro-surface rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-200', colorClass === 'text-retro-p1' ? 'bg-retro-p1' : 'bg-retro-p2')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-pixel text-[8px] text-retro-dim w-8 text-right tabular-nums">{pct}%</span>
    </div>
  )
}

function ResultsPanel({ game, mySymbol, players }) {
  const wpmX  = game.typingWpmX  ?? null
  const wpmO  = game.typingWpmO  ?? null
  const accX  = game.typingAccX  ?? null
  const accO  = game.typingAccO  ?? null
  const winner = game.winner
  const eX = wpmX != null && accX != null ? Math.round(wpmX * accX / 100) : null
  const eO = wpmO != null && accO != null ? Math.round(wpmO * accO / 100) : null

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {['X', 'O'].map(sym => {
          const wpm = sym === 'X' ? wpmX : wpmO
          const acc = sym === 'X' ? accX : accO
          const eff = sym === 'X' ? eX   : eO
          const col = sym === 'X' ? 'text-retro-p1' : 'text-retro-p2'
          const border = mySymbol === sym
            ? (sym === 'X' ? 'border-retro-p1/60' : 'border-retro-p2/60')
            : 'border-retro-border'
          const isWin = winner === sym
          return (
            <div key={sym} className={cn('bg-retro-card border rounded p-3 text-center space-y-1', border)}>
              <p className={cn('font-pixel text-[8px]', col)}>
                {players?.[sym]?.name?.toUpperCase() ?? sym}
              </p>
              <p className={cn('font-pixel text-2xl tabular-nums', isWin ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
                {wpm ?? '—'}
              </p>
              <p className="font-pixel text-[8px] text-retro-dim">WPM</p>
              {acc != null && (
                <p className="font-pixel text-[8px] text-retro-cta">{acc}% ACC</p>
              )}
              {eff != null && (
                <p className="font-pixel text-[8px] text-retro-dim">{eff} EFF</p>
              )}
            </div>
          )
        })}
      </div>
      {winner && winner !== 'draw' && eX != null && eO != null && (
        <p className="font-pixel text-[8px] text-retro-dim text-center">
          {players?.[winner]?.name?.toUpperCase() ?? winner} WINS BY{' '}
          <span className="text-retro-win">{Math.abs(eX - eO)} EFF-WPM</span>
        </p>
      )}
      {winner === 'draw' && (
        <p className="font-pixel text-[8px] text-retro-dim text-center">PERFECTLY MATCHED — DRAW!</p>
      )}
    </div>
  )
}

export default function TypingGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onPlayAgain, onNewMatch, proposal,
}) {
  const myKey = mySymbol === 'X' ? 'X' : 'O'
  const opKey = myKey === 'X' ? 'O' : 'X'

  const [typed, setTyped] = useState('')
  const [now, setNow]     = useState(() => Date.now())

  const syncTimerRef  = useRef(null)
  const gameStartRef  = useRef(null)
  const finishedRef   = useRef(false)
  const prevPassageRef = useRef(game.typingPassage ?? '')

  const passage   = game.typingPassage ?? ''
  const startedAt = game.typingStartedAt ?? null
  const isCountdown = !!startedAt && now < startedAt + 3000
  const isRacing    = !!startedAt && now >= startedAt + 3000 && game.status !== 'finished'
  const countdownSec = isCountdown ? Math.ceil((startedAt + 3000 - now) / 1000) : 0
  const opProgress  = game[`typingProgress${opKey}`] ?? 0
  const myProgress  = typed.length
  const myFinished  = game[`typingWpm${myKey}`] != null
  const isWaiting   = myFinished && game.status !== 'finished'

  // Ticker + set gameStartRef when startedAt arrives
  useEffect(() => {
    if (!startedAt || game.status === 'finished') return
    gameStartRef.current = startedAt + 3000
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [startedAt, game.status])

  // Reset local state on new game (passage change)
  useEffect(() => {
    if (passage !== prevPassageRef.current) {
      prevPassageRef.current = passage
      setTyped('')
      finishedRef.current = false
      clearTimeout(syncTimerRef.current)
    }
  }, [passage])

  const syncProgress = (len) => {
    clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      update(ref(db, `games/${gameId}`), { [`typingProgress${myKey}`]: len }).catch(() => {})
    }, 200)
  }

  const handleFinish = async (finalTyped) => {
    finishedRef.current = true
    clearTimeout(syncTimerRef.current)
    // eslint-disable-next-line react-hooks/purity -- runs only from handleKey (a keystroke handler), never during render
    const finishedAt = Date.now()
    const elapsed = finishedAt - (gameStartRef.current ?? finishedAt)
    const wpm = Math.max(1, Math.round((passage.length / 5) / (elapsed / 60_000)))
    let matches = 0
    for (let i = 0; i < finalTyped.length; i++) {
      if (finalTyped[i] === passage[i]) matches++
    }
    const acc = Math.round((matches / passage.length) * 100)
    await update(ref(db, `games/${gameId}`), {
      [`typingProgress${myKey}`]: passage.length,
      [`typingWpm${myKey}`]: wpm,
      [`typingAcc${myKey}`]: acc,
    }).catch(() => {})
    tryFinish()
  }

  const tryFinish = async () => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.status === 'finished') return
        const wX = current.typingWpmX ?? null
        const wO = current.typingWpmO ?? null
        if (wX == null || wO == null) return  // wait for both
        const aX = current.typingAccX ?? 100
        const aO = current.typingAccO ?? 100
        const eX = wX * aX / 100
        const eO = wO * aO / 100
        const winner = eX > eO ? 'X' : eX < eO ? 'O' : 'draw'
        const scores = { ...(current.scores || {}) }
        if (winner !== 'draw') scores[winner] = (scores[winner] || 0) + 1
        return { ...current, winner, status: 'finished', scores }
      })
    } catch { /* other client resolved */ }
  }

  const handleKey = (char) => {
    if (!isRacing || finishedRef.current) return
    let newTyped
    if (char === 'BACKSPACE') {
      newTyped = typed.slice(0, -1)
    } else if (char === 'WORD_BACKSPACE') {
      const trimmed = typed.trimEnd()
      const lastSpace = trimmed.lastIndexOf(' ')
      newTyped = lastSpace === -1 ? '' : typed.slice(0, lastSpace + 1)
      if (newTyped.length === typed.length) newTyped = typed.slice(0, -1)
    } else {
      if (typed.length >= passage.length) return
      newTyped = typed + char
    }
    setTyped(newTyped)
    syncProgress(newTyped.length)
    if (newTyped.length === passage.length) handleFinish(newTyped)
  }

  const handleStartClick = async () => {
    if (startedAt) return
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.typingStartedAt) return
        return { ...current, typingStartedAt: Date.now() }
      })
    } catch { /* ignore */ }
  }

  const matchWinner = (game.scores?.X || 0) >= 3 ? 'X' : (game.scores?.O || 0) >= 3 ? 'O' : null

  if (game.status === 'finished') {
    return (
      <div className="space-y-4">
        <ResultsPanel game={game} mySymbol={mySymbol} players={game.players} />
        <GameStatus
          status={game.status} winner={game.winner} mySymbol={mySymbol}
          scores={game.scores} players={game.players} gameType={game.gameType}
          onPlayAgain={!matchWinner && !proposal ? onPlayAgain : null}
          onNewMatch={matchWinner && !proposal ? onNewMatch : null}
          onSwitchGame={!proposal ? onSwitchGame : null}
        />
      </div>
    )
  }

  if (!mySymbol) {
    return (
      <div className="space-y-4">
        <SpectatorCard game={game} statusOverride={!startedAt ? 'WAITING TO START' : undefined} />
        {startedAt && (
          <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1">
            <ProgressBar label="X" val={game.typingProgressX ?? 0} max={passage.length} colorClass="text-retro-p1" />
            <ProgressBar label="O" val={game.typingProgressO ?? 0} max={passage.length} colorClass="text-retro-p2" />
          </div>
        )}
        {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
      </div>
    )
  }

  const showPassage = isRacing || isWaiting

  return (
    <div className="space-y-3 [@media(max-height:700px)]:space-y-2">
      {/* Progress bars */}
      {startedAt && (
        <div className="space-y-1">
          <ProgressBar
            label={game.players?.[myKey]?.name?.toUpperCase() ?? myKey}
            val={myProgress} max={passage.length}
            colorClass="text-retro-p1"
          />
          <ProgressBar
            label={game.players?.[opKey]?.name?.toUpperCase() ?? opKey}
            val={opProgress} max={passage.length}
            colorClass="text-retro-p2"
          />
        </div>
      )}

      {/* Passage + start/countdown overlay — padding/line-height compact on short viewports (M-52) so the keyboard stays above the fold */}
      <div className="bg-retro-surface border border-retro-border rounded p-3 [@media(max-height:700px)]:p-2">
        {!startedAt && (
          <div className="flex flex-col items-center gap-3 py-4 [@media(max-height:700px)]:py-2">
            <p className="font-pixel text-[9px] text-retro-dim text-center leading-loose">
              TYPE EVERYTHING · ERRORS STAY · ⌫ CORRECTS · WIN ON EFF-WPM
            </p>
            <button
              onClick={handleStartClick}
              className="px-6 py-3 min-h-11 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
            >
              START
            </button>
          </div>
        )}

        {isCountdown && (
          <div className="flex flex-col items-center gap-2 py-4 [@media(max-height:700px)]:py-2">
            <p className="font-pixel text-6xl text-retro-win text-glow-win">{countdownSec}</p>
            <p className="font-pixel text-[9px] text-retro-dim arcade-blink">GET READY!</p>
          </div>
        )}

        {showPassage && (
          <>
            <p className="font-mono text-[13px] leading-6 break-words [@media(max-height:700px)]:text-[12px] [@media(max-height:700px)]:leading-5">
              {passage.split('').map((char, i) => {
                const isTyped   = i < typed.length
                const isCorrect = isTyped && typed[i] === passage[i]
                const isWrong   = isTyped && typed[i] !== passage[i]
                const isCursor  = isRacing && !isWaiting && i === typed.length
                const isGhost   = isRacing && opProgress > 0 && i === opProgress && i !== typed.length
                return (
                  <span
                    key={i}
                    className={cn(
                      isCorrect ? 'text-retro-text' :
                      isWrong   ? 'text-retro-p2 bg-retro-p2/20' :
                                  'text-retro-dim',
                      isCursor ? 'border-l-2 border-retro-cta' : '',
                      isGhost  ? 'border-b-2 border-retro-p2/60' : '',
                    )}
                  >
                    {char}
                  </span>
                )
              })}
            </p>
            {isWaiting && (
              <p className="font-pixel text-[9px] text-retro-cta text-center mt-3 arcade-blink">
                WAITING FOR OPPONENT...
              </p>
            )}
          </>
        )}
      </div>

      {/* Keyboard */}
      {(isRacing || isCountdown) && !isWaiting && (
        <TypingKeyboard onKey={handleKey} disabled={!isRacing} />
      )}

      {!opponentOnline && mySymbol && (
        <OfflineNotice label="OPPONENT" />
      )}
      {!proposal && <GameSwitcher currentType={game.gameType} onSwitch={onSwitchGame} />}
    </div>
  )
}
