import { useState, useRef, useEffect } from 'react'
import SnakeArena from '../../components/SnakeArena'
import { useSnakeControls } from '../../hooks/useSnakeControls'
import { createState as createSnakeState, tick as snakeTick, computeAI as snakeAI, getWinner as snakeWinner, WIN_SCORE as SNAKE_WIN, TICK_MS as SNAKE_TICK } from '../../lib/snakeLogic'
import { sounds } from '../../lib/sounds'
import { cn } from '@/lib/utils'

// ─── Snake demo (you vs a greedy AI, fully local) ──────────────────────────────

export default function SnakeDemo() {
  const arenaRef = useRef(null)
  const simRef = useRef(null)
  if (simRef.current === null) simRef.current = createSnakeState()
  const [view, setView] = useState({ snakes: null, food: null, eatenX: 0, eatenO: 0 })
  const [winner, setWinner] = useState(null)
  const [round, setRound] = useState(0)
  const [scoreX, setScoreX] = useState(0)
  const [scoreO, setScoreO] = useState(0)
  const { getDir } = useSnakeControls(arenaRef, !winner)

  useEffect(() => {
    if (winner) return
    let timer, aiDir = 'left'
    const loop = () => {
      timer = setTimeout(loop, SNAKE_TICK)
      const s = simRef.current
      // AI re-evaluates every tick (cheap; the sim runs at ~8 Hz).
      aiDir = snakeAI(s, 'O')
      const inputs = { X: getDir(s.snakes.X.dir), O: aiDir }
      const { state: next, events } = snakeTick(s, inputs)
      simRef.current = next
      for (const e of events) {
        if (e.type === 'eat') sounds.hit()
        else if (e.type === 'die') sounds.miss()
      }
      setView({
        snakes: next.snakes,
        food: next.food,
        eatenX: next.snakes.X.eaten,
        eatenO: next.snakes.O.eaten,
      })
      const w = snakeWinner(next)
      if (w) {
        setWinner(w)
        if (w === 'X') setScoreX(n => n + 1)
        else if (w === 'O') setScoreO(n => n + 1)
        clearTimeout(timer)
      }
    }
    timer = setTimeout(loop, SNAKE_TICK)
    return () => clearTimeout(timer)
  }, [winner, round]) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    simRef.current = createSnakeState()
    setView({ snakes: null, food: null, eatenX: 0, eatenO: 0 })
    setWinner(null)
    setRound(n => n + 1)
  }

  const matchWinner = scoreX >= 3 ? 'X' : scoreO >= 3 ? 'O' : null

  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-6 font-pixel text-[10px]">
        <span className={cn('text-retro-p1', scoreX >= 3 && 'text-glow-p1')}>YOU {scoreX}</span>
        <span className="text-retro-dim">{SNAKE_WIN} WINS</span>
        <span className={cn('text-retro-p2', scoreO >= 3 && 'text-glow-p2')}>{scoreO} BOT</span>
      </div>
      <SnakeArena
        ref={arenaRef}
        snakes={view.snakes}
        food={view.food}
        eatenX={view.eatenX}
        eatenO={view.eatenO}
        mySide="X"
        namesX="YOU"
        namesO="BOT"
        overlay={winner ? (
          <p className="font-pixel text-base text-retro-cta text-glow-cta">
            {winner === 'X' ? 'YOU WIN!' : winner === 'O' ? 'BOT WINS' : 'DRAW'}
          </p>
        ) : null}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim">FIRST TO {SNAKE_WIN} · ↑↓←→ · WASD · SWIPE</p>
      {matchWinner && (
        <p className="text-center font-pixel text-[10px] text-retro-win text-glow-win">
          {matchWinner === 'X' ? '🏆 MATCH: YOU' : '🏆 MATCH: BOT'}
        </p>
      )}
      {winner && (
        <div className="flex justify-center gap-2">
          {!matchWinner && (
            <button onClick={reset} className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95">
              NEXT ROUND
            </button>
          )}
          {matchWinner && (
            <button
              onClick={() => { setScoreX(0); setScoreO(0); reset() }}
              className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
            >
              PLAY AGAIN
            </button>
          )}
        </div>
      )}
    </div>
  )
}
