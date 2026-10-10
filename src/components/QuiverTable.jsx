import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { canvasPixelRatio } from '../lib/platform'
import { isReducedMotion } from '../hooks/useMotionPref'
import useThemeId from '../hooks/useThemeId'
import { TABLE_W, TABLE_H, WHEELS, HEARTS } from '../lib/quiverLogic'
import { createStage, drawScene, pressed, readPalette, updateStage } from '../lib/quiverDraw'

// QUIVER table: one canvas painted from `getScene()` every animation frame (the
// host's sim or a decoded snapshot), a domed button per seat laid over it, and a
// thin DOM strip so the numbers are readable by assistive tech and tests. React
// re-renders only when a score, a quiver, the wheel clock's whole second or the
// phase changes.

const INK = { 0: 'text-retro-p1', 1: 'text-retro-p2', 2: 'text-retro-p3', 3: 'text-retro-p4' }
const EDGE = { 0: 'border-retro-p1/60', 1: 'border-retro-p2/60', 2: 'border-retro-p3/60', 3: 'border-retro-p4/60' }
const PAD_TOKEN = ['--c-p1', '--c-p2', '--c-p3', '--c-p4']

function snapshotOf(scene) {
  return {
    phase: scene.phase,
    wheel: scene.wheel,
    sudden: scene.sudden,
    secs: Math.ceil(Math.max(0, scene.wt)),
    hearts: scene.hearts,
    coop: scene.coop,
    scores: scene.players.map((p) => p.score),
    ammo: scene.players.map((p) => p.ammo),
    locked: scene.players.map((p) => p.stun > 0),
    out: scene.players.map((p) => p.out),
    seats: scene.players.map((p) => p.seat),
  }
}
const signature = (h) => `${h.phase}|${h.wheel}|${h.sudden}|${h.secs}|${h.hearts}|${h.scores}|${h.ammo}|${h.locked.map(Number)}|${h.out.map(Number)}`

export function QuiverScores({ scores, names, mine = -1, className }) {
  return (
    <div className={cn('grid gap-1.5 font-pixel', scores.length > 2 ? 'grid-cols-4' : 'grid-cols-2', className)}>
      {scores.map((score, i) => (
        <div
          key={i}
          data-testid={`quiver-score-${i}`}
          aria-label={`${names[i]}: ${score}`}
          className={cn('min-w-0 rounded border bg-retro-card px-2 py-1.5 text-center', EDGE[i], mine === i && 'shadow-neon-cta')}
        >
          <span className={cn('block truncate text-[7px]', INK[i])}>{names[i]}</span>
          <span className="block text-base leading-tight tabular-nums text-retro-text">{score}</span>
        </div>
      ))}
    </div>
  )
}

function Hearts({ left }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${left} of ${HEARTS} hearts left`} data-testid="quiver-hearts">
      {Array.from({ length: HEARTS }, (_, k) => (
        <span key={k} className={cn('h-2.5 w-2.5 rounded-full border', k < left ? 'border-retro-danger bg-retro-danger' : 'border-retro-border bg-transparent')} />
      ))}
    </span>
  )
}

export default function QuiverTable({
  tableRef,
  getScene,
  roundKey = 0,
  rotated = false,           // the guest sees the table turned so their button is nearest
  flipSeat,                  // (seat) => print that button's label upside down (one phone)
  names = [],
  mySeats = null,            // seats this device controls; null means all of them
  onPress,                   // (seat) => void, on pointer-down
  enabled = true,
  predict = false,           // guest: show the arrow at once, before the host's snapshot
  coop = false,
  onScores,                  // (scores[]) => void when a score or the phase changes
  dim = false,
  overlay,
  className,
}) {
  const sceneFn = useRef(getScene)
  useEffect(() => { sceneFn.current = getScene })
  const optsRef = useRef({})
  useEffect(() => { optsRef.current = { rotated, mySeats } })
  const onScoresRef = useRef(onScores)
  useEffect(() => { onScoresRef.current = onScores })
  const stageRef = useRef(null)
  const themeId = useThemeId()
  const [hud, setHud] = useState(null)
  const hudRef = useRef(null)
  const sigRef = useRef('')
  const [pops, setPops] = useState({})
  const popTimers = useRef({})

  useEffect(() => {
    const cv = tableRef.current
    if (!cv) return undefined
    const ctx = cv.getContext('2d')
    const stage = createStage()
    stageRef.current = stage
    const pal = readPalette(cv)
    let raf = 0
    let last = performance.now()
    sigRef.current = ''
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
      last = now
      const scene = sceneFn.current()
      if (!scene) return
      const dpr = Math.min(2, Math.max(1, canvasPixelRatio() || 1))
      const cw = cv.clientWidth || TABLE_W
      const pw = Math.round(cw * dpr)
      const ph = Math.round(((cw * TABLE_H) / TABLE_W) * dpr)
      if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph }
      const reduced = isReducedMotion()
      updateStage(stage, scene, dt, reduced, pal)
      ctx.setTransform(pw / TABLE_W, 0, 0, ph / TABLE_H, 0, 0)
      ctx.clearRect(0, 0, TABLE_W, TABLE_H)
      const o = optsRef.current
      drawScene(ctx, stage, scene, pal, { rotated: !!o.rotated, mySeats: o.mySeats, reduced })
      const h = snapshotOf(scene)
      const sig = signature(h)
      if (sig !== sigRef.current) {
        const prev = hudRef.current
        sigRef.current = sig
        hudRef.current = h
        setHud(h)
        onScoresRef.current?.(h.scores)
        if (prev) {
          h.scores.forEach((s, i) => {
            if (s === prev.scores[i]) return
            setPops((p) => ({ ...p, [i]: true }))
            clearTimeout(popTimers.current[i])
            popTimers.current[i] = setTimeout(() => setPops((p) => ({ ...p, [i]: false })), 260)
          })
        }
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [tableRef, roundKey, themeId])
  useEffect(() => () => { Object.values(popTimers.current).forEach(clearTimeout) }, [])

  const fire = useCallback((seat) => {
    if (!enabled) return
    onPress?.(seat)
    const h = hudRef.current
    const live = h && h.phase === 'play' && h.ammo[seat] > 0 && !h.locked[seat] && !h.out[seat]
    if (predict && live && stageRef.current) pressed(stageRef.current, seat)
  }, [enabled, onPress, predict])

  const scores = hud?.scores ?? names.map(() => 0)
  const labels = names.length ? names : scores.map((_, i) => `P${i + 1}`)
  const seats = hud?.seats ?? []
  const status = !hud
    ? ''
    : hud.phase === 'over' ? 'MATCH OVER'
      : hud.sudden > 0 ? 'SUDDEN DEATH'
        : `WHEEL ${Math.min(WHEELS, hud.wheel + 1)}/${WHEELS}${hud.phase === 'play' ? ` · ${hud.secs}S` : ''}`
  const teamStars = scores.reduce((a, b) => a + b, 0)

  return (
    <div className={cn('space-y-2', className)}>
      <QuiverScores scores={scores} names={labels} mine={mySeats && mySeats.length === 1 ? mySeats[0] : -1} />
      <div className="flex items-center justify-between gap-2 font-pixel text-[8px] text-retro-dim" data-testid="quiver-status">
        <span>{status}</span>
        {coop && hud ? (
          <span className="flex items-center gap-2 text-retro-text">
            <span>STARS {teamStars}</span>
            <Hearts left={hud.hearts} />
          </span>
        ) : <span>EVERYONE SHOOTS</span>}
      </div>
      <div
        className="relative mx-auto select-none touch-none"
        style={{ width: 'min(100%, max(220px, calc((100dvh - 350px) * 0.667)))' }}
      >
        <canvas
          ref={tableRef}
          data-testid="quiver-table"
          aria-label="Quiver table"
          className={cn('block w-full font-pixel rounded-2xl touch-none shadow-[0_4px_0_rgb(var(--c-structure))] transition-opacity', dim && 'opacity-60')}
          style={{ aspectRatio: `${TABLE_W} / ${TABLE_H}` }}
        />
        {seats.map((seat, i) => {
          const mine = !mySeats || mySeats.includes(i)
          const x = rotated ? TABLE_W - seat.x : seat.x
          const y = rotated ? TABLE_H - seat.y : seat.y
          const live = hud.phase === 'play' && hud.ammo[i] > 0 && !hud.locked[i] && !hud.out[i]
          const flip = !!flipSeat?.(i)
          const small = hud.out[i] ? 'OUT' : hud.locked[i] ? 'LOCK' : `x${hud.ammo[i]}`
          const face = (
            <span className={cn('flex flex-col items-center justify-center leading-none', flip && 'rotate-180')}>
              <span className="quiver-pad-score block text-[15px]">{scores[i]}</span>
              <span className="mt-1 block text-[7px]">{small}</span>
            </span>
          )
          const cls = cn(
            'quiver-pad absolute z-10 grid w-[22%] min-w-14 aspect-square place-items-center rounded-full font-pixel text-retro-bg',
            mine ? 'press' : 'pointer-events-none',
          )
          const style = {
            left: `${(x / TABLE_W) * 100}%`, top: `${(y / TABLE_H) * 100}%`, translate: '-50% -50%',
            '--pad': `var(${PAD_TOKEN[i]})`,
          }
          return mine ? (
            <button
              key={i}
              type="button"
              data-testid={`quiver-pad-${i}`}
              data-live={live && enabled}
              data-stun={hud.locked[i]}
              data-pop={!!pops[i]}
              aria-label={`${labels[i]} shoot, ${hud.ammo[i]} arrows left`}
              className={cls}
              style={style}
              onPointerDown={(e) => { e.preventDefault(); fire(i) }}
              onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); fire(i) } }}
              onClick={(e) => e.preventDefault()}
            >
              {face}
            </button>
          ) : (
            <div key={i} data-testid={`quiver-pad-${i}`} data-live={false} data-stun={hud.locked[i]} data-pop={!!pops[i]} aria-hidden className={cn(cls, 'opacity-80')} style={style}>
              {face}
            </div>
          )
        })}
        {overlay && (
          <div data-testid="quiver-overlay" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl bg-retro-bg/70 backdrop-blur-[1px]">
            {overlay}
          </div>
        )}
      </div>
    </div>
  )
}
