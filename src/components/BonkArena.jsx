import { useEffect, useRef } from 'react'
import { createPainter, readPalette } from './bonkDraw'
import { NEW_CAMERA, ambient, cameraTarget, stepCamera, stepFx } from '../lib/bonkFx'
import useThemeId from '../hooks/useThemeId'
import { isReducedMotion } from '../hooks/useMotionPref'
import { cn } from '@/lib/utils'

// BONK BUGGIES arena: one canvas that paints whatever view `getView()` returns
// each frame (see lib/bonkNet.js), plus slots for the banner and the loser's
// pick cards on top. Rendering only — the page owns the sim or the snapshot.
//
// `fx` is the mutable particle/shake/flash state from lib/bonkFx.js; the page
// feeds it events with applyEvent(). The arena steps it, follows the action
// with a camera and re-reads the theme's colours when the theme changes. The
// scene is never glass: glass is for chrome, not for a real-time arena.
export default function BonkArena({ getView, fx, label, testId = 'bonk-arena', dim = false, className, children }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const themeId = useThemeId()
  const palRef = useRef(null)
  const live = useRef({})
  useEffect(() => { live.current = { getView, fx } })

  // The palette is read after the theme's CSS has applied, so the arena follows the theme live.
  useEffect(() => {
    palRef.current = readPalette(wrapRef.current || document.documentElement)
  }, [themeId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const painter = createPainter(canvas)
    let raf = 0
    let last = performance.now()
    let time = 0
    let focus = null
    let lastPhase = ''
    const cam = { ...NEW_CAMERA }
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => painter.resize()) : null
    ro?.observe(canvas)
    painter.resize()
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (document.hidden) return
      const { getView: view, fx: f } = live.current
      const v = view?.()
      if (!v) return
      if (!palRef.current) palRef.current = readPalette(wrapRef.current || document.documentElement)
      const reduced = isReducedMotion()
      time += dt
      if (v.phase !== lastPhase) {
        if (v.phase === 'ko' && v.outcome && v.outcome.winner >= 0) focus = { x: v.outcome.x ?? 0, y: v.outcome.y ?? 3.5 }
        if (v.phase === 'count' || v.phase === 'play') focus = null
        lastPhase = v.phase
      }
      ambient(f, v, dt)
      stepFx(f, dt)
      stepCamera(cam, cameraTarget(v, { focus, reduced }), dt, v.phase)
      const sh = reduced || f.shake <= 0 ? null : [(Math.random() - 0.5) * f.shake * 26, (Math.random() - 0.5) * f.shake * 26]
      painter.draw(v, f, cam, time, palRef.current, sh)
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); ro?.disconnect() }
  }, [])

  return (
    <div
      ref={wrapRef}
      data-testid={testId}
      className={cn(
        'relative w-full aspect-[14/9] overflow-hidden rounded-lg border-2 border-retro-border bg-retro-deep select-none touch-none',
        dim && 'opacity-80',
        className,
      )}
    >
      <canvas ref={canvasRef} role="img" aria-label={label} className="absolute inset-0 w-full h-full block" />
      {children}
    </div>
  )
}
