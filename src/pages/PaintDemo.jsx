import { useEffect, useRef, useState } from 'react'
import PaintArena from '../components/PaintArena'
import { usePaintControls } from '../hooks/usePaintControls'
import { createState, step, computeAI, getWinner, AI_DIFFICULTIES, MATCH_SECONDS } from '../lib/paintLogic'
import { sounds } from '../lib/sounds'

// Difficulty is fixed for the /demo loopback (no selector UI exists on any
// other demo page either) — 'normal' gives a fair, beatable-but-not-trivial
// bot. cfg.replanMs throttles how often the AI re-plans (its "reaction
// handicap"); cfg.speedCap is baked permanently into the bot's own player
// via createState({ speedCaps }).
const DIFFICULTY = 'normal'
const cfg = AI_DIFFICULTIES[DIFFICULTY]

function freshSim() {
  return createState({ speedCaps: { O: cfg.speedCap } })
}

function viewOf(sim) {
  return { grid: sim.grid, players: sim.players, timeLeft: sim.timeLeft }
}

export default function PaintDemo() {
  const arenaRef = useRef(null)
  const simRef = useRef(null)
  if (simRef.current == null) simRef.current = freshSim()
  // Placeholder until the first rAF tick paints the real grid/positions —
  // mirrors TronDemo's/SumoDemo's initial-view-doesn't-read-the-ref pattern
  // (reading simRef.current inside useState's initializer would be a
  // render-time ref read, which react-hooks/refs flags).
  const [view, setView] = useState({ grid: null, players: null, timeLeft: MATCH_SECONDS })
  const [winner, setWinner] = useState(null)
  const { getDir } = usePaintControls(arenaRef, !winner)

  useEffect(() => {
    if (winner) return
    let raf, last = performance.now(), aiDir = 'left', aiAt = 0, paintCount = 0
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      let dt = (now - last) / 1000; last = now
      if (dt > 0.1) dt = 0.1
      const s = simRef.current
      if (now - aiAt >= cfg.replanMs) {
        aiAt = now
        aiDir = computeAI(s, 'O', DIFFICULTY)
      }
      const inputs = { X: getDir(s.players.X.dir), O: aiDir }
      const { state: next, events } = step(s, inputs, dt)
      simRef.current = next
      for (const e of events) {
        if (e.type === 'cellPainted') {
          paintCount += 1
          if (paintCount % 20 === 0) sounds.move(e.by)
        } else if (e.type === 'warning10s') {
          sounds.bell()
        }
      }
      setView(viewOf(next))
      const w = getWinner(next)
      if (w) {
        setWinner(w)
        cancelAnimationFrame(raf)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [winner]) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    simRef.current = freshSim()
    setView(viewOf(simRef.current))
    setWinner(null)
  }

  const resultMsg = winner === 'X' ? 'YOU WIN!' : winner === 'O' ? 'BOT WINS' : 'DRAW'

  return (
    <div className="space-y-3">
      <p className="text-center font-pixel text-[10px] text-retro-cta text-glow-cta">PAINT TURF · DEMO</p>
      <PaintArena
        ref={arenaRef}
        grid={view.grid}
        players={view.players}
        timeLeft={view.timeLeft}
        mySide="X"
        namesX="YOU"
        namesO="BOT"
        overlay={winner ? (
          <div className="text-center space-y-2">
            <p className="font-pixel text-base text-retro-win text-glow-win">{resultMsg}</p>
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
