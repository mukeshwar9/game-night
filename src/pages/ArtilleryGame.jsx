import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { ref, push, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import ArtilleryArena from '../components/ArtilleryArena'
import GameStatus from '../components/GameStatus'
import SpectatorCard from '../components/SpectatorCard'
import {
  replayAll,
  windForShot,
  generateTerrain,
} from '../lib/artilleryLogic'
import { sounds } from '../lib/sounds'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ARTILLERY — deterministic-replay duel. Firebase stores only the seed + an
// append-only shot list; every client re-simulates identically.

const FINE_STEP = 1

export default function ArtilleryGame({
  gameId, game, mySymbol, opponentOnline,
  onPlayAgain,
}) {
  const me = mySymbol === 'X' ? 'X' : 'O'
  const isSpectator = !mySymbol
  const seed = game.artillerySeed ?? 0
  const shots = game.artilleryShots || {}
  const myTurn = game.status === 'playing' && game.currentTurn === me

  const [angle, setAngle] = useState(45)
  const [power, setPower] = useState(60)
  const [animating, setAnimating] = useState(null) // shot record being animated
  const firingRef = useRef(false)
  const lastCountRef = useRef(0)

  // Derived state — replay everything on every change. Cheap (< few ms).
  const derived = useMemo(() => replayAll(seed, shots), [seed, shots])
  const { state } = derived
  const records = derived.records

  const terrain = useMemo(
    () => (state.terrain ?? generateTerrain(seed)),
    [state.terrain, seed],
  )

  const shotKeys = Object.keys(shots).sort()
  const windNow = windForShot(seed, shotKeys.length)

  // Animate ONLY the newest shot when it arrives; older shots skip.
  useEffect(() => {
    if (shotKeys.length === lastCountRef.current) return
    const isNew = shotKeys.length > lastCountRef.current
    lastCountRef.current = shotKeys.length
    if (!isNew || !records.length) return
    const rec = records[records.length - 1]
    setAnimating(rec)
    if (rec.damage.X > 0 || rec.damage.O > 0) sounds.bust()
    else sounds.miss()
    const t = setTimeout(() => setAnimating(null), Math.min(2000, rec.path.length * 8))
    return () => clearTimeout(t)
  }, [shotKeys.length, records]) // eslint-disable-line react-hooks/exhaustive-deps

  // Winner transaction when the replay shows a death and no winner recorded.
  useEffect(() => {
    if (!state.winner || game.status !== 'playing') return
    runTransaction(ref(db, `games/${gameId}`), current => {
      if (!current || current.status === 'finished') return
      const winner = state.winner
      const next = { ...current, status: 'finished' }
      if (winner !== 'draw') {
        next.winner = winner
        next.scores = { ...current.scores, [winner]: (current.scores?.[winner] || 0) + 1 }
      } else {
        next.winner = 'draw'
      }
      return next
    }).catch(() => {})
  }, [state.winner, game.status, gameId])

  const fire = useCallback(() => {
    if (!myTurn || firingRef.current) return
    firingRef.current = true
    push(ref(db, `games/${gameId}/artilleryShots`), { by: me, angleDeg: angle, power })
      .then(() => sounds.move(me))
      .catch(() => toast.error('FIRE FAILED — RETRY'))
      .finally(() => { firingRef.current = false })
  }, [myTurn, angle, power, gameId, me])

  const adjust = (setter, delta, lo, hi) =>
    setter(v => Math.max(lo, Math.min(hi, v + delta)))

  // Keyboard fine-tune.
  useEffect(() => {
    const kd = e => {
      if (!myTurn) return
      if (e.key === 'ArrowUp') adjust(setAngle, 1, 5, 90)
      if (e.key === 'ArrowDown') adjust(setAngle, -1, 5, 90)
      if (e.key === 'ArrowRight') adjust(setPower, 1, 10, 100)
      if (e.key === 'ArrowLeft') adjust(setPower, -1, 10, 100)
      if (e.key === ' ' || e.key === 'Enter') fire()
    }
    window.addEventListener('keydown', kd)
    return () => window.removeEventListener('keydown', kd)
  }, [myTurn, fire]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isSpectator) {
    return (
      <div className="space-y-4">
        <SpectatorCard />
        <ArtilleryArena terrain={state.terrain} tanks={state.tanks} />
        <div className="flex justify-between font-pixel text-[9px] text-retro-dim">
          <span className="text-retro-p1">X {state.tanks.X.hp}HP</span>
          <span>O {state.tanks.O.hp}HP</span>
        </div>
        <GameStatus status={game.status} winner={game.winner} currentTurn={null} mySymbol="X" />
      </div>
    )
  }

  const animPath = animating?.path ?? null

  return (
    <div className="space-y-4">
      {/* HUD */}
      <div className="flex items-center justify-between font-pixel text-[9px]">
        <span className={cn('text-retro-p1', me === 'X' && myTurn && 'text-glow-p1')}>
          YOU {state.tanks.X.hp} HP
        </span>
        <span className="text-retro-dim">
          WIND {windNow >= 0 ? '→' : '←'} {Math.abs(windNow * 100).toFixed(0)}
        </span>
        <span className={cn('text-retro-p2', me === 'O' && myTurn && 'text-glow-p2')}>
          {state.tanks.O.hp} HP RIVAL
        </span>
      </div>

      <ArtilleryArena
        terrain={terrain}
        tanks={state.tanks}
        path={animPath}
        impact={animPath ? animating?.impact : null}
      />

      {!isSpectator && game.status === 'playing' && (
        <>
          <p className="font-pixel text-[10px] text-center arcade-blink">
            {myTurn ? (
              <span className="text-retro-cta text-glow-cta">YOUR SHOT — BRACKET IT</span>
            ) : (
              <span className="text-retro-dim">RIVAL AIMS…</span>
            )}
          </p>

          {/* Controls */}
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
            onClick={fire}
            disabled={!myTurn}
            className="w-full py-2.5 bg-retro-danger text-retro-bg font-pixel text-xs rounded hover:shadow-neon-danger active:scale-95 disabled:opacity-40"
          >
            FIRE
          </button>
          <p className="font-mono text-[10px] text-retro-dim text-center">
            ARROWS AIM · SPACE/ENTER FIRES · LAST TRAIL SHOWS AS DOTS
          </p>
        </>
      )}

      <GameStatus
        status={game.status}
        winner={game.winner}
        currentTurn={null}
        mySymbol={me}
        onPlayAgain={onPlayAgain ?? null}
      />

      {opponentOnline === false && game.status === 'playing' && (
        <p className="font-pixel text-[8px] text-retro-dim text-center">RIVAL OFFLINE</p>
      )}
    </div>
  )
}
