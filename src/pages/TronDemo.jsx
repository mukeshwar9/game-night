import { useEffect, useRef, useState } from 'react'
import TronArena from '../components/TronArena'
import { useTronControls } from '../hooks/useTronControls'
import { createState, tick, computeAI, getWinner, TICK_MS } from '../lib/tronLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

export default function TronDemo() {
  const arenaRef = useRef(null)
  const simRef = useRef(null)
  if (simRef.current == null) { simRef.current = createState() }
  const [view, setView] = useState({ cycles: null })
  const [winner, setWinner] = useState(null)
  const [round, setRound] = useState(0)
  const { getDir } = useTronControls(arenaRef, !winner)

  useEffect(() => {
    if (winner) return
    let timer, aiDir = 'left'
    const loop = () => {
      timer = setTimeout(loop, TICK_MS)
      const s = simRef.current
      aiDir = computeAI(s, 'O')
      const inputs = { X: getDir(s.cycles.X.dir), O: aiDir }
      const { state: next, events } = tick(s, inputs)
      simRef.current = next
      for (const e of events) {
        if (e.type === 'die') sounds.miss()
      }
      setView({ cycles: next.cycles })
      const w = getWinner(next)
      if (w) {
        setWinner(w)
        clearTimeout(timer)
      }
    }
    timer = setTimeout(loop, TICK_MS)
    return () => clearTimeout(timer)
  }, [winner, round]) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    simRef.current = createState()
    setView({ cycles: null })
    setWinner(null)
    setRound(n => n + 1)
  }

  const resultMsg = winner === 'X' ? 'OPPONENT CRASHED'
    : winner === 'O' ? 'YOU CRASHED'
    : 'DRAW'

  return (
    <div className="space-y-3">
      <p className="text-center font-pixel text-[10px] text-retro-cta text-glow-cta">TRON · DEMO</p>
      <TronArena
        ref={arenaRef}
        cycles={view.cycles}
        mySide="X"
        namesX="YOU"
        namesO="BOT"
        overlay={winner ? (
          <div className="text-center space-y-2">
            <p className={cn('font-pixel text-base text-retro-win text-glow-win')}>
              {resultMsg}
            </p>
            <button
              onClick={reset}
              className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
            >
              PLAY AGAIN
            </button>
          </div>
        ) : null}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim">VS COMPUTER · ↑↓←→ · WASD · SWIPE</p>
    </div>
  )
}
