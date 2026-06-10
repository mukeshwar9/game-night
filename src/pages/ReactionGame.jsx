import { useEffect, useRef, useState } from 'react'
import { ref, update, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import GameSwitcher from '../components/GameSwitcher'
import GameStatus from '../components/GameStatus'
import { sounds } from '../lib/sounds'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const ROUNDS = 4
const MIN_DELAY_MS = 1500
const MAX_DELAY_MS = 4000

function normalizeReactionTimes(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return Object.values(raw).map(Number)
}

function avg(arr) {
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
}

function ResultsPanel({ timesX, timesO, mySymbol, players }) {
  const avgX = avg(timesX)
  const avgO = avg(timesO)
  const fastX = Math.min(...timesX)
  const fastO = Math.min(...timesO)
  const winner = avgX < avgO ? 'X' : avgX > avgO ? 'O' : null

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {[
          { sym: 'X', a: avgX, f: fastX, col: 'retro-p1' },
          { sym: 'O', a: avgO, f: fastO, col: 'retro-p2' },
        ].map(({ sym, a, f, col }) => (
          <div key={sym} className={cn(
            'bg-retro-card border rounded p-3 text-center space-y-1',
            mySymbol === sym ? `border-${col}/60` : 'border-retro-border',
          )}>
            <p className={`font-pixel text-[8px] text-${col}`}>
              {players?.[sym]?.name?.toUpperCase() ?? sym}
            </p>
            <p className={cn('font-pixel text-xl', winner === sym ? 'text-retro-win text-glow-win' : 'text-retro-text')}>
              {a}<span className="text-[8px] text-retro-dim">ms</span>
            </p>
            <p className="font-pixel text-[8px] text-retro-dim">avg</p>
            <p className="font-pixel text-[9px] text-retro-cta">
              {f}ms <span className="text-retro-dim text-[7px]">best</span>
            </p>
          </div>
        ))}
      </div>

      <div className="bg-retro-card border border-retro-border rounded p-3 space-y-1">
        <div className="grid grid-cols-3 font-pixel text-[7px] text-retro-dim pb-1 border-b border-retro-border">
          <span className="text-retro-p1">{players?.X?.name?.toUpperCase() ?? 'X'}</span>
          <span className="text-center">RND</span>
          <span className="text-right text-retro-p2">{players?.O?.name?.toUpperCase() ?? 'O'}</span>
        </div>
        {timesX.map((tx, i) => {
          const to = timesO[i]
          return (
            <div key={i} className="grid grid-cols-3 font-pixel text-[8px]">
              <span className={tx < to ? 'text-retro-win' : 'text-retro-text'}>{tx}ms</span>
              <span className="text-center text-retro-dim">{i + 1}</span>
              <span className={cn('text-right', to < tx ? 'text-retro-win' : 'text-retro-text')}>{to}ms</span>
            </div>
          )
        })}
      </div>

      {winner ? (
        <p className="font-pixel text-[8px] text-retro-dim text-center">
          {players?.[winner]?.name?.toUpperCase() ?? winner} WAS{' '}
          <span className="text-retro-win">{Math.abs(avgX - avgO)}ms</span> FASTER ON AVERAGE
        </p>
      ) : (
        <p className="font-pixel text-[8px] text-retro-dim text-center">SAME AVERAGE — DRAW!</p>
      )}
    </div>
  )
}

export default function ReactionGame({
  gameId, game, mySymbol, opponentOnline,
  onSwitchGame, onNewMatch, proposal,
}) {
  const myKey = mySymbol === 'X' ? 'X' : 'O'
  const opKey = myKey === 'X' ? 'O' : 'X'
  const myTimes = normalizeReactionTimes(game[`reactionTimes${myKey}`])
  const opTimes = normalizeReactionTimes(game[`reactionTimes${opKey}`])

  const [phase, setPhase] = useState('start')
  const [times, setTimes] = useState([])
  const [lastTime, setLastTime] = useState(null)
  const roundStartRef = useRef(null)
  const timerRef = useRef(null)
  const prevMyLen = useRef(myTimes.length)
  const prevOpLen = useRef(opTimes.length)

  // On mount: if I already submitted (reconnect), restore state
  useEffect(() => {
    if (myTimes.length === ROUNDS) {
      setPhase('submitted')
      setTimes(myTimes)
    }
    return () => clearTimeout(timerRef.current)
  }, [])

  // When both players done → resolve
  useEffect(() => {
    const ml = myTimes.length
    const ol = opTimes.length
    if (ml === ROUNDS && ol === ROUNDS &&
        (prevMyLen.current < ROUNDS || prevOpLen.current < ROUNDS)) {
      tryFinish()
    }
    prevMyLen.current = ml
    prevOpLen.current = ol
  }, [myTimes.length, opTimes.length])

  const tryFinish = async () => {
    try {
      await runTransaction(ref(db, `games/${gameId}`), current => {
        if (!current || current.status === 'finished') return
        const tx = normalizeReactionTimes(current.reactionTimesX)
        const to = normalizeReactionTimes(current.reactionTimesO)
        if (tx.length < ROUNDS || to.length < ROUNDS) return
        const avgX = tx.reduce((a, b) => a + b, 0) / tx.length
        const avgO = to.reduce((a, b) => a + b, 0) / to.length
        const winner = avgX < avgO ? 'X' : avgX > avgO ? 'O' : 'draw'
        const scores = { ...(current.scores || {}) }
        if (winner !== 'draw') scores[winner] = (scores[winner] || 0) + 1
        return { ...current, winner, status: 'finished', scores }
      })
    } catch { /* other client resolved — ignore */ }
  }

  const startRound = () => {
    setPhase('waiting')
    const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)
    timerRef.current = setTimeout(() => {
      setPhase('ready')
      roundStartRef.current = performance.now()
    }, delay)
  }

  const handleClick = async () => {
    if (!mySymbol || game.status !== 'playing' || phase === 'submitted') return

    switch (phase) {
      case 'start':
        startRound()
        break
      case 'waiting':
        clearTimeout(timerRef.current)
        setPhase('too_early')
        break
      case 'ready': {
        const rt = Math.round(performance.now() - roundStartRef.current)
        setLastTime(rt)
        sounds.move(myKey)
        const newTimes = [...times, rt]
        setTimes(newTimes)
        if (newTimes.length === ROUNDS) {
          setPhase('submitted')
          try {
            await update(ref(db, `games/${gameId}`), { [`reactionTimes${myKey}`]: newTimes })
          } catch { toast.error('SUBMIT FAILED — CHECK CONNECTION') }
        } else {
          setPhase('result')
        }
        break
      }
      case 'result':
        startRound()
        break
      case 'too_early':
        startRound()
        break
    }
  }

  const matchWinner = (game.scores?.X || 0) >= 3 ? 'X' : (game.scores?.O || 0) >= 3 ? 'O' : null

  if (game.status === 'finished') {
    const timesX = normalizeReactionTimes(game.reactionTimesX)
    const timesO = normalizeReactionTimes(game.reactionTimesO)
    return (
      <div className="space-y-4">
        <ResultsPanel timesX={timesX} timesO={timesO} mySymbol={mySymbol} players={game.players} />
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

  if (!mySymbol) {
    return (
      <div className="space-y-4">
        <div className="bg-retro-card border border-retro-border rounded p-4 text-center space-y-3">
          <p className="font-pixel text-[9px] text-retro-dim">SPECTATING</p>
          <div className="space-y-1">
            <p className="font-pixel text-[8px] text-retro-p1">
              X: {myTimes.length}/{ROUNDS} rounds
            </p>
            <p className="font-pixel text-[8px] text-retro-p2">
              O: {opTimes.length}/{ROUNDS} rounds
            </p>
          </div>
        </div>
        {!proposal && <GameSwitcher onSwitchGame={onSwitchGame} />}
      </div>
    )
  }

  const areaColor = {
    start:      'bg-retro-surface border-retro-border/60',
    waiting:    'bg-retro-surface border-retro-border/60',
    ready:      'bg-retro-win/20 border-retro-win shadow-neon-win',
    too_early:  'bg-retro-p2/15 border-retro-p2/60',
    result:     'bg-retro-card border-retro-border',
    submitted:  'bg-retro-surface border-retro-border/40',
  }

  return (
    <div className="space-y-4">
      {/* Big clickable game area */}
      <button
        onClick={handleClick}
        disabled={phase === 'submitted'}
        className={cn(
          'w-full rounded-xl border-2 transition-colors duration-75 select-none',
          'min-h-[210px] flex flex-col items-center justify-center gap-3',
          areaColor[phase] ?? areaColor.start,
          phase !== 'submitted' && 'active:scale-[0.99] cursor-pointer',
          phase === 'submitted' && 'cursor-default',
        )}
      >
        {phase === 'submitted' ? (
          <div className="text-center space-y-2 px-4">
            <p className="font-pixel text-[10px] text-retro-win text-glow-win">ALL DONE!</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              {times.map((t, i) => (
                <p key={i} className="font-pixel text-[8px]">
                  <span className="text-retro-dim">R{i + 1} </span>
                  <span className="text-retro-text">{t}ms</span>
                </p>
              ))}
            </div>
            <p className="font-pixel text-[9px] text-retro-cta">
              AVG {avg(times)}ms · BEST {Math.min(...times)}ms
            </p>
            <p className="font-pixel text-[8px] text-retro-dim animate-pulse">
              WAITING FOR OPPONENT {opTimes.length}/{ROUNDS}
            </p>
          </div>
        ) : (
          <>
            <p className={cn(
              'font-pixel text-center leading-none',
              phase === 'ready'     && 'text-3xl text-retro-win text-glow-win',
              phase === 'result'    && 'text-2xl text-retro-cta text-glow-cta',
              phase === 'too_early' && 'text-xl text-retro-p2',
              (phase === 'start' || phase === 'waiting') && 'text-base text-retro-dim',
            )}>
              {phase === 'ready'     ? 'CLICK!'        :
               phase === 'too_early' ? 'TOO EARLY!'    :
               phase === 'result'    ? `${lastTime}ms` :
               phase === 'waiting'   ? 'WAIT...'       :
               'TAP TO START'}
            </p>
            <p className={cn(
              'font-pixel text-[9px]',
              phase === 'too_early' ? 'text-retro-p2' : 'text-retro-dim animate-pulse',
            )}>
              {phase === 'waiting'   ? "DON'T CLICK YET"              :
               phase === 'too_early' ? 'TAP TO TRY AGAIN'             :
               phase === 'result'    ? `ROUND ${times.length}/${ROUNDS} — TAP FOR NEXT` :
               phase === 'start'     ? `${ROUNDS} ROUNDS · FASTEST AVG WINS`  :
               ''}
            </p>
          </>
        )}
      </button>

      {/* Progress — you vs opponent */}
      <div className="space-y-1.5">
        {[
          { label: 'YOU', count: times.length, col: 'bg-retro-cta border-retro-cta' },
          { label: 'OPP', count: opTimes.length, col: 'bg-retro-p2/60 border-retro-p2/60' },
        ].map(({ label, count, col }) => (
          <div key={label} className="flex items-center gap-2 font-pixel text-[8px]">
            <span className="text-retro-dim w-6">{label}</span>
            <div className="flex gap-1 flex-1">
              {Array.from({ length: ROUNDS }, (_, i) => (
                <div key={i} className={cn(
                  'flex-1 h-2 rounded-sm border',
                  i < count ? col : 'bg-retro-surface border-retro-border',
                )} />
              ))}
            </div>
            <span className={cn('w-6 text-right', count === ROUNDS ? 'text-retro-win' : 'text-retro-dim')}>
              {count}/{ROUNDS}
            </span>
          </div>
        ))}
      </div>

      {!opponentOnline && (
        <p className="font-pixel text-[10px] text-retro-p2 text-center animate-pulse">
          OPPONENT DISCONNECTED
        </p>
      )}
      {!proposal && <GameSwitcher onSwitchGame={onSwitchGame} />}
    </div>
  )
}
