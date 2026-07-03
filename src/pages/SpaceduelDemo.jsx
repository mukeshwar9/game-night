import { useEffect, useRef, useState } from 'react'
import SpaceduelArena from '../components/SpaceduelArena'
import { useSpaceduelControls } from '../hooks/useSpaceduelControls'
import {
  createState, step, getWinner, computeAI, ROUND_CAP_S, SHIP_MAX_HP,
} from '../lib/spaceduelLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

const DT = 1 / 120

const initialShips = {
  X: { x: 0.25, y: 0.5, ang: 0, alive: true, thrust: false },
  O: { x: 0.75, y: 0.5, ang: Math.PI, alive: true, thrust: false },
}
const initialView = { ships: initialShips, bullets: [], t: 0, hitsX: 0, hitsO: 0, hpX: SHIP_MAX_HP, hpO: SHIP_MAX_HP }

// Local Space Duel demo (you vs a reaction-handicapped AI). Runs the pure sim
// in a fixed-timestep rAF accumulator with no networking — the way to iterate
// on physics/feel. Mirrors the PongDemo loop shape.
export default function SpaceduelDemo() {
  const arenaRef = useRef(null)
  const simRef = useRef(null)
  if (simRef.current == null) simRef.current = createState()
  const [view, setView] = useState(initialView)
  const [winner, setWinner] = useState(null)
  const [round, setRound] = useState(0)
  const { getInput, touch } = useSpaceduelControls(arenaRef, !winner)

  useEffect(() => {
    if (winner) return
    let raf, last = performance.now(), acc = 0
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      let dt = (now - last) / 1000; last = now
      if (dt > 0.1) dt = 0.1
      acc += dt
      // Read local input once per frame; the AI re-evaluates once per frame too.
      const inp = getInput()
      const ai = computeAI(simRef.current, 'O')
      const inputs = { X: inp, O: ai }
      const events = []
      while (acc >= DT) {
        const res = step(simRef.current, inputs, DT)
        simRef.current = res.state
        if (res.events.length) events.push(...res.events)
        acc -= DT
      }
      for (const e of events) {
        if (e.type === 'fire') sounds.hit()
        else if (e.type === 'hit') sounds.hit()
        else if (e.type === 'kill') sounds.miss()
      }
      const s = simRef.current
      setView({
        ships: {
          X: { x: s.ships.X.x, y: s.ships.X.y, ang: s.ships.X.ang, alive: s.ships.X.alive, thrust: !!inp.thrust },
          O: { x: s.ships.O.x, y: s.ships.O.y, ang: s.ships.O.ang, alive: s.ships.O.alive, thrust: !!ai.thrust },
        },
        bullets: s.bullets.map(b => ({ x: b.x, y: b.y })),
        t: s.t,
        hitsX: s.ships.X.hits,
        hitsO: s.ships.O.hits,
        hpX: s.ships.X.hp,
        hpO: s.ships.O.hp,
      })
      const w = getWinner(s)
      if (w) { setWinner(w); cancelAnimationFrame(raf) }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [winner, round]) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    simRef.current = createState()
    setView(initialView)
    setWinner(null)
    setRound(n => n + 1)
  }

  const timeLeft = Math.max(0, Math.ceil(ROUND_CAP_S - (view.t || 0)))
  const resultMsg = winner === 'X' ? 'ENEMY DESTROYED'
    : winner === 'O' ? 'YOU WERE DESTROYED'
    : winner === 'draw' ? 'DRAW — TIME CAP'
    : ''

  return (
    <div className="space-y-3">
      <p className="text-center font-pixel text-[10px] text-retro-cta text-glow-cta">SPACE DUEL · DEMO</p>

      <SpaceduelArena
        ref={arenaRef}
        ships={view.ships}
        bullets={view.bullets}
        t={view.t}
        hitsX={view.hitsX}
        hitsO={view.hitsO}
        hpX={view.hpX}
        hpO={view.hpO}
        mySide="X"
        namesX="YOU"
        namesO="BOT"
        dim={false}
        overlay={winner ? (
          <div className="text-center space-y-3">
            <p className={cn('font-pixel text-base text-retro-win text-glow-win')}>{resultMsg}</p>
            <div className="font-pixel text-[8px] space-y-1">
              <p>
                <span className="text-retro-p1">YOU</span>
                {' '}
                {view.ships?.X?.alive ? 'ALIVE' : 'DESTROYED'}
                {' · '}
                {view.hitsX} HITS
              </p>
              <p>
                <span className="text-retro-p2">BOT</span>
                {' '}
                {view.ships?.O?.alive ? 'ALIVE' : 'DESTROYED'}
                {' · '}
                {view.hitsO} HITS
              </p>
            </div>
            <button
              onClick={reset}
              className="px-4 py-2 bg-retro-cta text-retro-bg font-pixel text-[10px] rounded hover:shadow-neon-cta active:scale-95"
            >
              PLAY AGAIN
            </button>
          </div>
        ) : null}
        touch={touch}
      />

      <p className="text-center font-pixel text-[8px] text-retro-dim">
        {timeLeft}s LEFT · A/D ROTATE · W THRUST · SPACE FIRE
      </p>
    </div>
  )
}