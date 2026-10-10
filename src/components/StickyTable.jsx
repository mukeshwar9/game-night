import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { canvasPixelRatio } from '../lib/platform'
import { isReducedMotion } from '../hooks/useMotionPref'
import useThemeId from '../hooks/useThemeId'
import { TABLE_W, TABLE_H } from '../lib/stickyLogic'
import { createStage, drawScene, playerKey, readPalette, updateStage } from '../lib/stickyDraw'

// Sticky Fingers table: one canvas painted from `getScene()` every animation
// frame (the host's sim or a decoded snapshot), plus a thin DOM score strip so
// the numbers are readable by assistive tech and tests. React only re-renders
// when a score, the clock's whole second or the phase changes.

const INK = { p1: 'text-retro-p1', p2: 'text-retro-p2', p3: 'text-retro-p3', p4: 'text-retro-p4' }
const EDGE = { p1: 'border-retro-p1/60', p2: 'border-retro-p2/60', p3: 'border-retro-p3/60', p4: 'border-retro-p4/60' }

function signature(scene) {
  return `${scene.phase}|${Math.ceil(Math.max(0, scene.time))}|${scene.sudden ? 1 : 0}|${scene.players.map((p) => p.score).join(',')}`
}

export function StickyScores({ scores, names, mine = -1, className }) {
  return (
    <div className={cn('grid gap-1.5 font-pixel', scores.length > 2 ? 'grid-cols-4' : 'grid-cols-2', className)}>
      {scores.map((score, i) => (
        <div
          key={i}
          data-testid={`sticky-score-${i}`}
          aria-label={`${names[i]}: ${score}`}
          className={cn('min-w-0 rounded border bg-retro-card px-2 py-1.5 text-center', EDGE[playerKey(i)], mine === i && 'shadow-neon-cta')}
        >
          <span className={cn('block truncate text-[7px]', INK[playerKey(i)])}>{names[i]}</span>
          <span className="block text-base leading-tight tabular-nums text-retro-text">{score}</span>
        </div>
      ))}
    </div>
  )
}

export default function StickyTable({
  tableRef,
  getScene,
  roundKey = 0,
  rotated = false,           // the guest sees the table turned so their safe is nearest
  flipSeat,                  // (player) => draw that player's score window upside down (one phone)
  names = [],
  onScores,                  // (scores[]) => void when a score or the phase changes
  dim = false,
  overlay,
  className,
}) {
  const sceneFn = useRef(getScene)
  useEffect(() => { sceneFn.current = getScene })
  const optsRef = useRef({})
  useEffect(() => { optsRef.current = { rotated, flipSeat, names } })
  const onScoresRef = useRef(onScores)
  useEffect(() => { onScoresRef.current = onScores })
  const themeId = useThemeId()
  const [hud, setHud] = useState(null)
  const sigRef = useRef('')

  useEffect(() => {
    const cv = tableRef.current
    if (!cv) return undefined
    const ctx = cv.getContext('2d')
    const stage = createStage()
    const pal = readPalette(cv)
    let raf = 0
    let last = performance.now()
    let hookAt = 0
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
      updateStage(stage, scene, dt, reduced)
      ctx.setTransform(pw / TABLE_W, 0, 0, ph / TABLE_H, 0, 0)
      ctx.clearRect(0, 0, TABLE_W, TABLE_H)
      const o = optsRef.current
      if (o.rotated) { ctx.translate(TABLE_W, TABLE_H); ctx.rotate(Math.PI) }
      drawScene(ctx, stage, scene, pal, { rotated: !!o.rotated, flipSeat: o.flipSeat, names: o.names, reduced })
      // A plain-text readout of the landed loot, ~8 times a second, for the e2e
      // spec and assistive tooling: [id, kind, x, y, holders] in table units.
      if (now - hookAt > 120) {
        hookAt = now
        cv.dataset.loot = JSON.stringify(scene.loot.filter((l) => l.z <= 0).map((l) => [l.id, l.kind, Math.round(l.x), Math.round(l.y), l.holders.length]))
      }
      const sig = signature(scene)
      if (sig !== sigRef.current) {
        sigRef.current = sig
        const scores = scene.players.map((p) => p.score)
        setHud({ scores })
        onScoresRef.current?.(scores)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [tableRef, roundKey, themeId])

  const scores = hud?.scores ?? names.map(() => 0)
  return (
    <div className={cn('space-y-2', className)}>
      <StickyScores scores={scores} names={names.length ? names : scores.map((_, i) => `P${i + 1}`)} />
      <div
        className="relative mx-auto select-none touch-none"
        style={{ width: 'min(100%, max(220px, calc((100dvh - 330px) * 0.643)))' }}
      >
        <canvas
          ref={tableRef}
          data-testid="sticky-table"
          aria-label="Sticky Fingers table"
          className={cn('block w-full font-pixel rounded-2xl touch-none shadow-[0_4px_0_rgb(var(--c-structure))] transition-opacity', dim && 'opacity-60')}
          style={{ aspectRatio: `${TABLE_W} / ${TABLE_H}` }}
        />
        {overlay && (
          <div data-testid="sticky-overlay" className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-retro-bg/70 backdrop-blur-[1px]">
            {overlay}
          </div>
        )}
      </div>
    </div>
  )
}
