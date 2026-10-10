import { useEffect, useMemo, useRef } from 'react'
import useThemeId from '../hooks/useThemeId'
import { isReducedMotion } from '../hooks/useMotionPref'
import { makePalette, readTokens } from '../lib/bamboozlePalette'
import { VIEW, drawGarden, stepFx } from '../lib/bamboozleDraw'
import { getSprites } from '../lib/bamboozleSprites'
import { cn } from '@/lib/utils'

// The BAMBOOZLE garden: one canvas, drawn from a sim every animation frame.
//
// The arena owns the frame loop. Each frame it first calls `onTick(dt)` (the
// page steps its sim there and feeds the effects), then eases the particles and
// draws. Colours come from the app theme (bamboozlePalette.js), so the garden
// re-tints the moment the theme changes. Children are DOM overlays (countdown,
// banners) laid over the canvas.
//
//   simRef      ref to the current sim (bamboozleSim.js)
//   fxRef       ref to the effects store (bamboozleDraw.createFx)
//   avatars     avatar strings by seat, for the standing figures
//   ghostsRef   optional ref to [{ id, x, y, hearts, out, avatar, seat }]: other racers online
export default function BamboozleArena({
  simRef, fxRef, avatars = [], ghostsRef = null, onTick, hints = true, className, children, label,
}) {
  const canvasRef = useRef(null)
  const themeId = useThemeId()
  const palette = useMemo(() => {
    const style = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : { getPropertyValue: () => '' }
    return makePalette(readTokens(style), themeId === 'matcha')
    // themeId is the cache key: the tokens change exactly when the theme does.
  }, [themeId])
  const paletteRef = useRef(palette)
  const tickRef = useRef(onTick)
  const avatarKey = avatars.join('|')
  const hintsRef = useRef(hints)
  useEffect(() => {
    paletteRef.current = palette
    tickRef.current = onTick
    hintsRef.current = hints
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    let raf = 0
    let last = 0
    let spriteKey = ''
    let sprites = []
    const loop = (ts) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (ts - last) / 1000 || 0)
      last = ts
      tickRef.current?.(dt)
      const sim = simRef.current
      const fx = fxRef.current
      if (!sim || !fx) return
      stepFx(fx, dt)
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(3, window.devicePixelRatio || 1)
      const px = Math.max(1, Math.round(rect.width * dpr))
      if (canvas.width !== px) { canvas.width = px; canvas.height = px }
      const key = avatarKey
      if (key !== spriteKey) { spriteKey = key; sprites = avatars.map((a) => getSprites(a)) }
      const P = paletteRef.current
      const ghosts = (ghostsRef?.current || []).map((g) => ({
        ...g, sprites: g.avatar != null ? getSprites(g.avatar) : null, rgb: P.pal[`p${((g.seat ?? 1) % 4) + 1}`] || P.pal.dim,
      }))
      ctx.setTransform(canvas.width / VIEW, 0, 0, canvas.height / VIEW, 0, 0)
      drawGarden(ctx, {
        sim, P, fx, sprites, ghosts,
        seatRgb: [P.pal.p1, P.pal.p2, P.pal.p3, P.pal.p4],
        hints: hintsRef.current, reduced: isReducedMotion(),
      })
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // avatars is read through avatarKey; the refs carry everything else
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarKey, simRef, fxRef, ghostsRef])

  return (
    <div className={cn('relative w-full select-none', className)}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label || 'The garden: bamboo poles fire across it from one wall at a time. Hide behind a boulder.'}
        data-testid="bamboozle-canvas"
        className="block w-full aspect-square touch-none"
      />
      {children}
    </div>
  )
}
