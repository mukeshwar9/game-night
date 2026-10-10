import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  DARTS_PER_VISIT, TURF_ROUNDS, finishSegments, nervesFactor, nervesLabel, segmentLabel, threeDartAverage,
} from '../lib/dartsLogic'
import { createDartsScene } from './dartsScene'
import useGameKeys from '../hooks/useGameKeys'
import { cn } from '@/lib/utils'

// The STEADY HAND table: seat cards, the board stage, this visit's darts and a
// status line. Rendering and input only — pages own the room and the rules.
//
// `controls` says this screen may throw now (its player is up). In pass-and-play
// the same screen controls every human seat in turn, so `myUid` follows the
// thrower; online it is this player's uid and `controls` is false on every
// other turn. `flip` turns the stage 180° for the player across the table.

const SEAT_TONE = [
  { text: 'text-retro-p1', ring: 'border-retro-p1 shadow-neon-p1' },
  { text: 'text-retro-p2', ring: 'border-retro-p2 shadow-neon-p2' },
  { text: 'text-retro-p3', ring: 'border-retro-p3 shadow-neon-p3' },
  { text: 'text-retro-p4', ring: 'border-retro-p4 shadow-neon-p4' },
]

// A shape per seat, so colour is never the only cue.
export function SeatGlyph({ index, className }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" className={className}>
      {index === 0 && <circle cx="8" cy="8" r="6" fill="currentColor" />}
      {index === 1 && <rect x="2.5" y="2.5" width="11" height="11" fill="currentColor" />}
      {index === 2 && <path d="M8 2l6.2 11H1.8z" fill="currentColor" />}
      {index === 3 && <path d="M8 1.5l6.5 6.5L8 14.5 1.5 8z" fill="currentColor" />}
    </svg>
  )
}

function statusFor({ state, name, controls, ctrl, scene, isBot }) {
  if (!state) return ''
  if (state.over) return 'GOOD DARTS'
  const who = (name || 'PLAYER').toUpperCase()
  if (state.phase === 'shoot' && !controls) return `SHOOT-OFF · ${who} · NEAREST THE BULL`
  if (!controls) return isBot ? `${who} IS LINING UP` : `${who} IS THROWING…`
  if (scene.phase === 'aim') return `AIMING ${scene.seg ? (scene.seg.ring === 'M' ? 'OFF THE BOARD' : scene.seg.label) : ''} · LET GO WHEN THE RING IS SMALL`
  if (scene.phase === 'sweepX') return 'TAP TO LOCK LEFT / RIGHT'
  if (scene.phase === 'sweepY') return 'TAP AGAIN TO THROW'
  if (scene.tooShort) return 'HOLD TO AIM, LET GO TO THROW'
  if (state.phase === 'shoot') return 'SHOOT-OFF · NEAREST THE BULL WINS'
  if (state.cfg.mode === 'x01') {
    const left = state.scores[state.turnUid]
    const fin = [...new Set(finishSegments(left).map(segmentLabel))]
    if (fin.length) return `${left} LEFT · FINISH ON ${fin.join(' / ')}`
    return ctrl === 'one' ? `${left} LEFT · TAP THROW TO START THE SWEEP` : `${left} LEFT · HOLD, DRAG TO AIM, LET GO`
  }
  return ctrl === 'one' ? 'TAP THROW TO START THE SWEEP' : 'HIT A WEDGE TO CLAIM IT'
}

const DartsTable = forwardRef(function DartsTable({
  state, names = {}, bots = {}, myUid = null, controls = false, ctrl = 'aim', flip = false,
  onThrow, banner = null, ariaLabel = 'Dartboard', children,
}, ref) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const sceneRef = useRef(null)
  const onThrowRef = useRef(onThrow)
  const [scene, setScene] = useState({ phase: 'idle', seg: null, tooShort: false })

  useEffect(() => { onThrowRef.current = onThrow })

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return undefined
    const s = createDartsScene(canvas, {
      onThrow: (shot) => onThrowRef.current?.(shot),
      onPhase: (p) => setScene((prev) => (prev.phase === p.phase && prev.seg?.key === p.seg?.key && !p.tooShort && !prev.tooShort ? prev : { phase: p.phase, seg: p.seg ?? null, tooShort: !!p.tooShort })),
    })
    sceneRef.current = s
    const fit = () => s.resize(wrap.clientWidth, wrap.clientHeight)
    fit()
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null
    ro?.observe(wrap)
    return () => { ro?.disconnect(); s.destroy(); sceneRef.current = null }
  }, [])

  const factor = state && myUid ? nervesFactor(state, myUid) : 1
  useEffect(() => {
    sceneRef.current?.update({ state, myUid, controls, ctrl, factor, flip, showFinish: controls })
  }, [state, myUid, controls, ctrl, factor, flip])

  useImperativeHandle(ref, () => ({
    aimThenThrow: (target, shot, ms) => sceneRef.current?.aimThenThrow(target, shot, ms) ?? Promise.resolve(false),
    cancelBot: () => sceneRef.current?.cancelBot(),
  }), [])

  useGameKeys((e) => {
    if ((e.code === 'Space' || e.key === 'Enter') && ctrl === 'one' && controls) {
      sceneRef.current?.press()
      return true
    }
    return false
  }, { enabled: ctrl === 'one' && controls })

  // The handoff banner: shown for a moment whenever the thrower changes.
  const [shown, setShown] = useState(null)
  const turnKey = state ? `${state.turnUid}:${state.visitNo}:${state.leg}` : null
  const lastTurn = useRef(turnKey)
  useEffect(() => {
    if (!state || state.over || turnKey === lastTurn.current) { lastTurn.current = turnKey; return undefined }
    lastTurn.current = turnKey
    const uid = state.turnUid
    setShown({ uid, key: turnKey })
    const id = setTimeout(() => setShown(null), 950)
    return () => clearTimeout(id)
  }, [state, turnKey])

  if (!state) return null
  const seats = state.seats
  const turnIdx = seats.indexOf(state.turnUid)
  const nameOf = (uid) => names[uid] || 'PLAYER'
  const turnName = nameOf(state.turnUid)
  const live = scene
  const status = statusFor({ state, name: turnName, controls, ctrl, scene: live, isBot: !!bots[state.turnUid] })
  const visit = state.visit
  const visitTotal = state.cfg.mode === 'x01' ? visit.reduce((n, d) => n + d.seg.v, 0) : 0
  const turf = state.cfg.mode === 'turf'
  const bannerIdx = shown ? seats.indexOf(shown.uid) : -1

  return (
    <div className="w-full space-y-2">
      <div className={cn('grid gap-1.5', seats.length === 2 ? 'grid-cols-2' : seats.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4')}>
        {seats.map((uid, i) => {
          const on = i === turnIdx && !state.over
          const won = state.winner === uid
          const f = nervesFactor(state, uid)
          const score = turf ? state.points[uid] : state.scores[uid]
          return (
            <div
              key={uid}
              data-seat-card={uid}
              className={cn(
                'relative min-w-0 rounded border-2 bg-retro-card px-2 py-1.5 transition-colors',
                on || won ? SEAT_TONE[i].ring : 'border-retro-border',
              )}
              aria-label={`${nameOf(uid)}: ${score} ${turf ? 'points' : 'left'}${on ? ', up' : ''}`}
            >
              <div className="flex items-center gap-1.5">
                <SeatGlyph index={i} className={SEAT_TONE[i].text} />
                <span className="truncate font-pixel text-[8px] text-retro-text">{nameOf(uid).toUpperCase()}</span>
              </div>
              <div className="mt-1 flex items-end justify-between gap-1">
                <strong className={cn('font-pixel text-base leading-none tabular-nums', SEAT_TONE[i].text)}>{score}</strong>
                <span className="flex flex-col items-end gap-0.5">
                  {state.cfg.legs > 1 && (
                    <span className="font-pixel text-[7px] text-retro-dim" aria-label={`${state.legWins[uid]} legs`}>
                      {Array.from({ length: state.legsNeeded }, (_, n) => (n < state.legWins[uid] ? '●' : '○')).join('')}
                    </span>
                  )}
                  {on && (
                    <span className="flex gap-0.5" aria-label={`${state.dartsLeft} darts left`}>
                      {Array.from({ length: DARTS_PER_VISIT }, (_, n) => (
                        <i key={n} className={cn('block h-1.5 w-1.5 rounded-full', n < state.dartsLeft ? 'bg-retro-cta' : 'bg-retro-border')} />
                      ))}
                    </span>
                  )}
                </span>
              </div>
              {state.cfg.nerves && (
                <span className="mt-0.5 block font-pixel text-[6px] text-retro-dim" title="Hand shake">{nervesLabel(f)}</span>
              )}
            </div>
          )
        })}
      </div>

      <div
        ref={wrapRef}
        className="relative h-[min(62vh,430px)] min-h-[300px] w-full overflow-hidden rounded border-2 border-retro-border select-none"
        style={{ touchAction: 'none' }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ transform: flip ? 'rotate(180deg)' : undefined }}
          role="img"
          aria-label={ariaLabel}
        />
        {shown && bannerIdx >= 0 && (
          <div
            key={shown.key}
            className={cn(
              'pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full border-2 bg-retro-card px-3 py-1.5 font-pixel text-[9px]',
              SEAT_TONE[bannerIdx].text, SEAT_TONE[bannerIdx].ring,
            )}
          >
            {bots[shown.uid] ? `${nameOf(shown.uid).toUpperCase()} THROWS` : `${nameOf(shown.uid).toUpperCase()} · YOUR THROW`}
          </div>
        )}
        {banner}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1" aria-label="This visit">
          {Array.from({ length: DARTS_PER_VISIT }, (_, n) => {
            const d = visit[n]
            return (
              <span
                key={n}
                className={cn(
                  'min-w-[3.1rem] rounded border px-1.5 py-1 text-center font-pixel text-[8px]',
                  d ? 'border-retro-cta text-retro-text' : 'border-retro-border text-retro-dim',
                )}
              >
                {d ? (d.skip ? '—' : d.seg.label) : '·'}
              </span>
            )
          })}
        </div>
        <span className="font-pixel text-[8px] text-retro-dim tabular-nums">
          {state.phase === 'shoot'
            ? 'SHOOT-OFF'
            : turf ? `RD ${Math.min(state.round, TURF_ROUNDS)}/${TURF_ROUNDS}` : `${visitTotal} THIS VISIT`}
          {!turf && state.cfg.legs > 1 ? ` · LEG ${state.leg + 1}` : ''}
        </span>
      </div>

      <p role="status" className={cn('min-h-[2.2em] text-center font-pixel text-[8px] leading-relaxed', controls ? 'text-retro-cta' : 'text-retro-dim')}>
        {status}
      </p>

      {ctrl === 'one' && (
        <button
          type="button"
          disabled={!controls}
          onClick={() => sceneRef.current?.press()}
          className="min-h-12 w-full rounded bg-retro-cta py-3 font-pixel text-xs text-retro-bg press-card hover:shadow-neon-cta disabled:opacity-40"
        >
          {live.phase === 'sweepX' ? 'LOCK' : 'THROW'}
        </button>
      )}
      {state.over && state.cfg.mode === 'x01' && (
        <p className="text-center font-mono text-[10px] text-retro-dim">
          {seats.map((u) => `${nameOf(u)} ${threeDartAverage(state, u)} AVG`).join(' · ')}
        </p>
      )}
      {children}
    </div>
  )
})

export default DartsTable
