import { useMemo, useRef, useState } from 'react'
import ArtilleryArena from '../components/ArtilleryArena'
import {
  initialState,
  simulateShot,
  windForShot,
} from '../lib/artilleryLogic'
import { sounds } from '../lib/sounds'
import { cn } from '@/lib/utils'

// Solo ARTILLERY vs an aim-converging bot — fully local, no Firebase.
// Bot brackets toward the player each turn with seeded-feeling noise.

const FINE_STEP = 1

function botAim(tankX, targetX, lastMiss, shotIndex) {
  // Closed-form-ish guess refined by last miss distance.
  const dx = targetX - tankX
  const base = Math.round(45 + Math.abs(dx) * 40)
  let power = Math.min(100, Math.max(20, Math.round(Math.abs(dx) * 130)))
  if (lastMiss != null) {
    power += Math.max(-12, Math.min(12, Math.round(lastMiss * 90)))
  }
  const noise = ((shotIndex * 37) % 7) - 3
  return {
    angleDeg: Math.max(5, Math.min(90, base + noise)),
    power: Math.max(10, Math.min(100, power + noise)),
  }
}

export default function ArtilleryDemo() {
  const seed = 20260822
  const [state, setState] = useState(() => initialState(seed))
  const [angle, setAngle] = useState(50)
  const [power, setPower] = useState(60)
  const [animating, setAnimating] = useState(null)
  const [turn, setTurn] = useState('me')
  const [shotCount, setShotCount] = useState(0)
  const botTimerRef = useRef(null)

  const done = state.winner != null
  const myTurn = turn === 'me' && !done
  const windNow = windForShot(seed, shotCount)
  const terrain = useMemo(() => state.terrain, [state.terrain])

  const applyShot = (by, angleDeg, power) => {
    const st = { ...state, seed, shotIndex: shotCount }
    const { state: next, record } = simulateShot(st, { by, angleDeg, power })
    setShotCount(c => c + 1)
    setAnimating(record)
    if (record.damage.X > 0 || record.damage.O > 0) sounds.bust()
    else sounds.miss()
    setState(next)
    setTimeout(() => setAnimating(null), Math.min(2000, record.path.length * 8))
    return next
  }

  const handleFire = () => {
    if (!myTurn) return
    const next = applyShot('X', angle, power)
    if (next.winner) return
    setTurn('bot')
    botTimerRef.current = setTimeout(() => {
      const me2 = next.tanks.O.x
      const aim = botAim(me2, next.tanks.X.x, null, shotCount + 1)
      const st2 = { ...next, seed, shotIndex: shotCount + 1 }
      const r2 = simulateShot(st2, { by: 'O', ...aim })
      setShotCount(c => c + 1)
      setAnimating(r2.record)
      if (r2.record.damage.X > 0 || r2.record.damage.O > 0) sounds.bust()
      setState(r2.state)
      if (!r2.state.winner) setTurn('me')
    }, 900)
  }

  void windNow

  const reset = () => {
    clearTimeout(botTimerRef.current)
    setState(initialState(seed)); setTurn('me'); setAnimating(null); setShotCount(0)
    void shotCount
  }

  const adjust = (setter, delta, lo, hi) => setter(v => Math.max(lo, Math.min(hi, v + delta)))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between font-pixel text-[9px]">
        <span className={cn('text-retro-p1', myTurn && 'text-glow-p1')}>YOU {state.tanks.X.hp} HP</span>
        <span className="text-retro-dim">WIND {windNow >= 0 ? '→' : '←'} {Math.abs(windNow * 100).toFixed(0)}</span>
        <span className={cn('text-retro-p2', turn === 'bot' && 'text-glow-p2')}>CPU {state.tanks.O.hp} HP</span>
      </div>

      <ArtilleryArena
        terrain={terrain}
        tanks={state.tanks}
        path={animating?.path ?? null}
        impact={animating ? animating.impact : null}
      />

      {!done && (
        <>
          <p className="font-pixel text-[10px] text-center arcade-blink">
            {myTurn ? <span className="text-retro-cta text-glow-cta">YOUR SHOT</span> : <span className="text-retro-dim">CPU AIMS…</span>}
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button onClick={() => adjust(setAngle, -FINE_STEP, 5, 90)} disabled={!myTurn}
                className="w-9 h-9 border border-retro-border text-retro-text font-pixel rounded active:scale-90 disabled:opacity-40">−</button>
              <input type="range" min="5" max="90" value={angle} disabled={!myTurn}
                onChange={e => setAngle(Number(e.target.value))}
                className="flex-1 accent-[rgb(var(--c-cta))]" />
              <button onClick={() => adjust(setAngle, FINE_STEP, 5, 90)} disabled={!myTurn}
                className="w-9 h-9 border border-retro-border text-retro-text font-pixel rounded active:scale-90 disabled:opacity-40">+</button>
              <span className="font-pixel text-[10px] text-retro-dim w-12 text-right">{angle}° ANGLE</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => adjust(setPower, -FINE_STEP, 10, 100)} disabled={!myTurn}
                className="w-9 h-9 border border-retro-border text-retro-text font-pixel rounded active:scale-90 disabled:opacity-40">−</button>
              <input type="range" min="10" max="100" value={power} disabled={!myTurn}
                onChange={e => setPower(Number(e.target.value))}
                className="flex-1 accent-[rgb(var(--c-cta))]" />
              <button onClick={() => adjust(setPower, FINE_STEP, 10, 100)} disabled={!myTurn}
                className="w-9 h-9 border border-retro-border text-retro-text font-pixel rounded active:scale-90 disabled:opacity-40">+</button>
              <span className="font-pixel text-[10px] text-retro-dim w-12 text-right">{power} PWR</span>
            </div>
          </div>
          <button
            onClick={handleFire}
            disabled={!myTurn}
            className="w-full py-2.5 bg-retro-danger text-retro-bg font-pixel text-xs rounded hover:shadow-neon-danger active:scale-95 disabled:opacity-40"
          >
            FIRE
          </button>
          <p className="font-mono text-[10px] text-retro-dim text-center leading-relaxed">
            BRACKET THE TARGET · WIND PUSHES YOUR SHELL<br />
            ARROWS AIM · SPACE FIRES · SELF-SPLASH IS REAL
          </p>
        </>
      )}

      {done && (
        <div className="text-center space-y-2 pt-2">
          <p className={cn(
            'font-pixel text-sm',
            state.winner === 'draw' ? 'text-retro-dim'
              : state.winner === 'X' ? 'text-retro-win text-glow-win' : 'text-retro-danger',
          )}>
            {state.winner === 'draw' ? 'MUTUAL DESTRUCTION — DRAW'
              : state.winner === 'X' ? 'TANK DESTROYED — YOU WIN!' : 'YOUR TANK IS SCRAP'}
          </p>
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-retro-cta text-retro-bg font-pixel text-xs rounded hover:shadow-neon-cta transition-all active:scale-95"
          >
            PLAY AGAIN
          </button>
        </div>
      )}
    </div>
  )
}
