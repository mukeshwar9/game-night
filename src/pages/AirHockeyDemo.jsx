import { useEffect, useRef, useState } from 'react'
import AirHockeyTable from '../components/AirHockeyTable'
import {
  COURT_W,
  COURT_H,
  MALLET_R,
  createState,
  step,
  computeAI,
  getWinner,
} from '../lib/airhockeyLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Solo AIR HOCKEY vs reaction-delay AI — the physics-tuning environment.
// Drag your mallet (bottom half); keyboard arrows/WASD fallback.

const DIFFICULTIES = ['easy', 'normal', 'hard']
const KEY_SPEED = 0.012 // court units per tick while a key is held

export default function AirHockeyDemo() {
  const [state, setState] = useState(createState)
  const [difficulty, setDifficulty] = useState('normal')
  const [flash, setFlash] = useState(null)
  const tableRef = useRef(null)
  const stateRef = useRef(state)
  const inputRef = useRef({ x: COURT_W / 2, y: COURT_H - 0.25 })
  const keysRef = useRef(new Set())
  const draggingRef = useRef(false)
  const rafRef = useRef(null)
  const lastTsRef = useRef(0)
  const accRef = useRef(0)

  // Keep a ref mirror of the sim state for the rAF loop (written in effects
  // and the loop itself — never read during render).
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Pointer drag → target position (mallet chases finger with smoothing).
  useEffect(() => {
    const el = tableRef.current
    if (!el) return
    const toCourt = (e) => {
      const rect = el.getBoundingClientRect()
      return {
        x: ((e.clientX - rect.left) / rect.width) * COURT_W,
        y: ((e.clientY - rect.top) / rect.height) * COURT_H,
      }
    }
    const down = e => { draggingRef.current = true; Object.assign(inputRef.current, toCourt(e)) }
    const move = e => { if (draggingRef.current) Object.assign(inputRef.current, toCourt(e)) }
    const up = () => { draggingRef.current = false }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  // Keyboard fallback.
  useEffect(() => {
    const kd = e => keysRef.current.add(e.key.toLowerCase())
    const ku = e => keysRef.current.delete(e.key.toLowerCase())
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
    }
  }, [])

  // Fixed-timestep accumulator loop (pong pattern).
  useEffect(() => {
    let alive = true
    const loop = ts => {
      if (!alive) return
      const dt = Math.min(50, ts - (lastTsRef.current || ts))
      lastTsRef.current = ts
      accRef.current += dt

      // Keyboard nudges the input target directly.
      const k = keysRef.current
      if (k.size) {
        if (k.has('arrowup') || k.has('w')) inputRef.current.y -= KEY_SPEED
        if (k.has('arrowdown') || k.has('s')) inputRef.current.y += KEY_SPEED
        if (k.has('arrowleft') || k.has('a')) inputRef.current.x -= KEY_SPEED
        if (k.has('arrowright') || k.has('d')) inputRef.current.x += KEY_SPEED
      }

      const DT = 1 / 120
      while (accRef.current >= DT * 1000 && alive) {
        accRef.current -= DT * 1000
        const cur = stateRef.current
        const aiTarget = computeAI(cur, difficulty)
        const inputs = {
          X: { ...inputRef.current },
          O: { x: aiTarget.x, y: aiTarget.y },
        }
        // Player mallet chases the input target with smoothing (drag feel).
        const m = cur.mallets.X
        inputs.X = {
          x: m.x + (inputs.X.x - m.x) * 0.55,
          y: m.y + (inputs.X.y - m.y) * 0.55,
        }
        const { state: next, events } = step(cur, inputs, DT)
        for (const ev of events) {
          if (ev.type === 'hit') sounds.hit(3)
          if (ev.type === 'wall') sounds.move('O')
          if (ev.type === 'goal') {
            sounds.win()
            setFlash('goal')
            setTimeout(() => setFlash(null), 600)
          }
        }
        stateRef.current = next
        setState(next)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { alive = false; cancelAnimationFrame(rafRef.current) }
  }, [difficulty])

  const winner = getWinner(state)
  const reset = () => { stateRef.current = createState(); setState(createState()) }

  const clampInput = () => {}

  void clampInput
  void MALLET_R

  return (
    <div className="space-y-3">
      {/* Score strip */}
      <div className="flex items-center justify-between font-pixel text-[10px]">
        <span className="text-retro-p1">YOU {state.score.X}</span>
        <span className="text-retro-dim">FIRST TO 7</span>
        <span className="text-retro-p2">CPU {state.score.O}</span>
      </div>

      <AirHockeyTable puck={state.puck} mallets={state.mallets} flash={flash} tableRef={tableRef} />

      {winner ? (
        <div className="text-center space-y-2">
          <p className={cn(
            'font-pixel text-sm',
            winner === 'X' ? 'text-retro-win text-glow-win' : 'text-retro-danger',
          )}>
            {winner === 'X' ? 'YOU WIN THE TABLE!' : 'CPU TAKES IT'}
          </p>
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
          >
            PLAY AGAIN
          </button>
        </div>
      ) : (
        <>
          {/* Difficulty picker */}
          <div className="flex justify-center gap-1.5">
            {DIFFICULTIES.map(d => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={cn(
                  'px-3 py-1 font-pixel text-[8px] uppercase rounded border-2 transition-all active:scale-95',
                  difficulty === d
                    ? 'border-retro-cta text-retro-cta shadow-neon-cta'
                    : 'border-retro-border text-retro-dim hover:border-retro-p1/50',
                )}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="font-mono text-[10px] text-retro-dim text-center leading-relaxed">
            DRAG YOUR MALLET · DEFEND THE BOTTOM GOAL<br />
            ARROWS / WASD ALSO WORK
          </p>
        </>
      )}
    </div>
  )
}
