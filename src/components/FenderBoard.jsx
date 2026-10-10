import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { W, H } from '../lib/fenderLogic'
import { createFenderRenderer } from './fenderRender'
import { SEAT_STYLES, heartsText } from './fenderSeats'

// Fender Bender's arena (a canvas the page feeds a view) and the thumb pads.
// Rendering only: the rules are in lib/fenderLogic.js, the colours come from
// the theme tokens (lib/fenderPalette.js).

/**
 * @param {{ getView: () => object|null, getUi?: () => object, rendererRef?: {current: any},
 *           overlay?: React.ReactNode, className?: string }} props
 */
export function FenderArena({ getView, getUi, rendererRef, overlay, className }) {
  const canvasRef = useRef(null)
  const getViewRef = useRef(getView)
  const getUiRef = useRef(getUi)
  useEffect(() => { getViewRef.current = getView; getUiRef.current = getUi })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const renderer = createFenderRenderer(canvas)
    if (rendererRef) rendererRef.current = renderer
    let raf = 0
    let last = 0
    const loop = (ts) => {
      raf = requestAnimationFrame(loop)
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0
      last = ts
      const view = getViewRef.current?.()
      if (view) renderer.draw(view, dt, getUiRef.current?.() || {})
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      renderer.dispose()
      if (rendererRef) rendererRef.current = null
    }
  }, [rendererRef])

  return (
    <div className={cn('relative w-full overflow-hidden rounded border border-retro-border bg-retro-deep', className)} style={{ aspectRatio: `${W} / ${H}` }}>
      <canvas ref={canvasRef} data-testid="fender-arena" className="block h-full w-full" role="img" aria-label="Road with the cars, traffic and water at both sides" />
      {overlay}
    </div>
  )
}

/**
 * One seat's thumb pad. `info` is the seat's HUD state (hearts, ghost, points,
 * horn recharge); `getKnob` is read every frame to draw the stick without
 * re-rendering React.
 */
export function FenderPad({ seat, name, bind, getKnob, info, enabled = true, flip = false, className }) {
  const knobRef = useRef(null)
  const style = SEAT_STYLES[seat]
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const el = knobRef.current
      if (!el) return
      const k = getKnob(seat)
      el.style.transform = `translate(${k.x * 16}px, ${k.y * 16}px) scale(${k.held ? 1.12 : 1})`
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [getKnob, seat])

  const out = info && !info.alive && !info.ghost
  const status = !info ? '' : info.alive ? heartsText(info.hp) : info.ghost ? 'TRUCK!' : 'OUT'
  const horn = info?.alive && info.hornOn ? (info.cd > 0 ? `HORN ${Math.ceil(info.cd)}` : 'TAP: HORN') : ''
  return (
    <div
      {...(enabled ? bind(seat) : {})}
      data-testid={`fender-pad-${seat}`}
      role="group"
      aria-label={`${name} pad: drag to steer, tap to honk`}
      className={cn(
        'relative select-none touch-none rounded border-2 min-h-[84px] flex items-center justify-center overflow-hidden transition-opacity',
        style.border, style.tint, out && 'opacity-45', !enabled && 'opacity-60', className,
      )}
    >
      <div className={cn('absolute inset-x-1.5 top-1 flex justify-between gap-1 font-pixel text-[8px] leading-tight pointer-events-none', style.text, flip && 'rotate-180')}>
        <span className="truncate">{name}</span>
        <span className="tabular-nums">{status}</span>
      </div>
      <div className={cn('absolute inset-x-1.5 bottom-1 flex justify-between gap-1 font-pixel text-[7px] leading-tight text-retro-dim pointer-events-none', flip && 'rotate-180')}>
        <span>{horn}</span>
        <span className="tabular-nums">{info?.pts != null ? `PTS ${info.pts}` : ''}</span>
      </div>
      <div className={cn('h-16 w-16 rounded-full border-2 border-dashed opacity-70 flex items-center justify-center', style.border)}>
        <div ref={knobRef} className={cn('h-8 w-8 rounded-full border-2 will-change-transform', style.border, style.dot)} />
      </div>
    </div>
  )
}
