import { useEffect, useRef, useState } from 'react'
import SumoArena from '../components/SumoArena'
import { useSumoControls } from '../hooks/useSumoControls'
import { createState, step, computeAI, getWinner } from '../lib/sumoLogic'
import { sounds } from '../lib/sounds'

const DT = 1 / 120

export default function SumoDemo() {
  const arenaRef = useRef(null)
  const simRef = useRef(null)
  if (simRef.current == null) simRef.current = createState()
  const [view, setView] = useState({
    blobs: {
      X: { x: 0.3, y: 0.5, vx: 0, vy: 0, alive: true },
      O: { x: 0.7, y: 0.5, vx: 0, vy: 0, alive: true },
    },
    arenaR: 0.5,
  })
  const [winner, setWinner] = useState(null)
  const { getTap, press } = useSumoControls(!winner)

  useEffect(() => {
    if (winner) return
    let raf, last = performance.now(), acc = 0, aiInput = { x: 0, y: 0 }, aiAt = 0
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      let dt = (now - last) / 1000; last = now
      if (dt > 0.1) dt = 0.1
      acc += dt
      // ~120ms reaction lag keeps the AI beatable.
      if (now - aiAt > 120) { aiAt = now; aiInput = computeAI(simRef.current, 'O') }
      const inputs = { X: { press: getTap() }, O: aiInput }
      const events = []
      while (acc >= DT) {
        const r = step(simRef.current, inputs, DT)
        simRef.current = r.state
        if (r.events.length) events.push(...r.events)
        acc -= DT
      }
      for (const e of events) {
        if (e.type === 'out') sounds.miss()
      }
      setView({ blobs: simRef.current.blobs, arenaR: simRef.current.arenaR })
      const w = getWinner(simRef.current)
      if (w) { setWinner(w); cancelAnimationFrame(raf) }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [winner]) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    simRef.current = createState()
    setView({ blobs: simRef.current.blobs, arenaR: simRef.current.arenaR })
    setWinner(null)
  }

  const overlay = winner ? (
    <p className="font-pixel text-base text-retro-cta text-glow-cta">
      {winner === 'X' ? 'YOU WIN!' : winner === 'O' ? 'BOT WINS' : 'DRAW'}
    </p>
  ) : null

  return (
    <div className="space-y-3">
      <p className="text-center font-pixel text-[10px] text-retro-cta text-glow-cta">SUMO ARENA · DEMO</p>
      <SumoArena
        ref={arenaRef}
        blobs={view.blobs}
        arenaR={view.arenaR}
        mySide="X"
        namesX="YOU"
        namesO="BOT"
        overlay={overlay}
      />
      <p className="text-center font-pixel text-[8px] text-retro-dim">PUSH THE BOT OFF · TAP TO PUSH</p>
      <div className="flex justify-center pt-1">
        <button
          onPointerDown={(e) => { e.preventDefault(); press() }}
          className="px-10 py-4 bg-retro-cta text-retro-bg font-pixel text-sm rounded-lg hover:shadow-neon-cta active:scale-95 active:bg-retro-cta/80 select-none touch-none"
        >
          PUSH
        </button>
      </div>
      {winner && (
        <div className="flex justify-center">
          <button onClick={reset} className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95">
            PLAY AGAIN
          </button>
        </div>
      )}
    </div>
  )
}
