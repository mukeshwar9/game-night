import { useEffect, useRef, useState } from 'react'
import { ARCHERY_FORMATS, archeryFormat, arrowResult, idealDrawForDistance, normalizeShots, shotResult } from '../lib/archeryLogic'

function tokenColor(canvas, token) {
  const value = getComputedStyle(canvas).getPropertyValue(token).trim()
  return value ? `rgb(${value})` : 'currentColor'
}

export default function ArcheryRange({
  shots = [], shootOffShots = [], seed = 0,
  format = 'standard', activeDraw = null, disabled = false,
  pointerProps, currentDistance = 50,
}) {
  const canvasRef = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const layerRef = useRef(null)
  const paintRef = useRef(null)
  const formatId = archeryFormat(format)
  const distance = currentDistance || ARCHERY_FORMATS[formatId].distances[0]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const measure = () => setSize({ width: canvas.clientWidth, height: canvas.clientHeight })
    const observer = new ResizeObserver(measure)
    observer.observe(canvas)
    measure()
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.width || !size.height) return
    // DPR is capped at 2: a 3x backing store costs 2.25x the fill for no
    // visible gain on thin neon strokes.
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    canvas.width = Math.round(size.width * ratio)
    canvas.height = Math.round(size.height * ratio)
    const layer = document.createElement('canvas')
    layer.width = canvas.width
    layer.height = canvas.height
    const ctx = layer.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    const w = size.width, h = size.height
    const css = token => tokenColor(canvas, token)
    const p1 = css('--c-p1'), p2 = css('--c-p2'), p3 = css('--c-p3'), p4 = css('--c-p4')
    const cta = css('--c-cta'), win = css('--c-win'), deep = css('--c-deep'), dim = css('--c-dim')
    const palette = { X: p1, O: p2, A: p3, B: p4 }
    const cx = w * 0.5, cy = h * 0.4, radius = Math.min(w * 0.34, h * 0.31)

    ctx.fillStyle = deep
    ctx.fillRect(0, 0, w, h)
    // NEON RANGE: vector horizon and perspective floor, no image assets.
    ctx.save()
    ctx.globalAlpha = 0.28
    ctx.strokeStyle = cta
    ctx.lineWidth = 1
    const horizon = h * 0.66
    ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(w, horizon); ctx.stroke()
    for (let i = -7; i <= 7; i++) {
      ctx.beginPath(); ctx.moveTo(cx + i * 3, horizon); ctx.lineTo(cx + i * w * 0.12, h); ctx.stroke()
    }
    for (let row = 1; row <= 5; row++) {
      const y = horizon + (h - horizon) * row * row / 25
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
    }
    ctx.restore()
    ctx.save()
    ctx.globalAlpha = 0.35
    ctx.strokeStyle = dim
    for (let i = 0; i < 6; i++) {
      const y = h * (0.13 + i * 0.075)
      const x = ((i * 71 + 19) % 100) / 100 * w
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * 0.08, y); ctx.stroke()
    }
    ctx.restore()

    // WA face: rings are distance-scaled; strokes preserve theme contrast.
    ctx.save()
    ctx.shadowBlur = 11
    for (let ring = 1; ring <= 10; ring++) {
      const r = radius * ring / 10
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.strokeStyle = ring <= 2 ? win : ring <= 4 ? cta : ring <= 6 ? p2 : p1
      ctx.lineWidth = ring === 10 ? 2 : 1
      ctx.shadowColor = ctx.strokeStyle
      ctx.stroke()
    }
    ctx.beginPath(); ctx.arc(cx, cy, radius * 30 / 610, 0, Math.PI * 2)
    ctx.strokeStyle = win; ctx.lineWidth = 2; ctx.shadowColor = win; ctx.stroke()
    ctx.beginPath(); ctx.arc(cx, cy, radius * 10 / 610, 0, Math.PI * 2)
    ctx.fillStyle = win; ctx.fill()
    ctx.restore()

    // Historic arrows, re-simulated from integer payloads. Shoot-off arrows sit
    // on the same face with the newest cluster visible.
    const mainShots = normalizeShots(shots)
    const tieShots = normalizeShots(shootOffShots)
    const allShots = [...mainShots, ...tieShots]
    allShots.forEach((shot, i) => {
      if (!shot) return
      const isShootOff = i >= mainShots.length
      const result = isShootOff
        ? shotResult(shot, i - mainShots.length, seed, 70)
        : shotResult(shot, i, seed, shot.distance ?? 50)
      const x = cx + result.ax / 610 * radius * 0.9
      const y = cy + result.ay / 610 * radius * 0.9
      ctx.beginPath(); ctx.arc(x, y, isShootOff ? 4 : 3, 0, Math.PI * 2)
      ctx.fillStyle = palette[shot.by] || p1
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8; ctx.fill()
      ctx.shadowBlur = 0
    })

    // Bow grip in the lower thumb zone.
    const bowY = h * 0.84
    ctx.save(); ctx.strokeStyle = p1; ctx.lineWidth = 2; ctx.shadowColor = p1; ctx.shadowBlur = 9
    ctx.beginPath(); ctx.moveTo(cx - 12, bowY + 23); ctx.quadraticCurveTo(cx + 35, bowY, cx - 12, bowY - 23); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx - 12, bowY - 23); ctx.lineTo(cx - 12, bowY + 23); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx - 12, bowY); ctx.lineTo(cx + 14, bowY); ctx.stroke()
    ctx.restore()

    // Distance marker and sight band.
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = cta
    ctx.fillText(`${distance} M · SIGHT ${idealDrawForDistance(distance)}`, cx, 18)
    layerRef.current = { layer, ratio, cx, cy, radius, cta }
    paintRef.current?.()
  }, [distance, seed, shootOffShots, shots, size.height, size.width])


  // The static range (floor, face, arrows, bow) is drawn once into `layer`
  // above; dragging the bow only blits it and redraws the crosshair, so a draw
  // gesture costs one drawImage per pointermove instead of a full repaint.
  const activeDrawRef = useRef(activeDraw)
  const distanceRef = useRef(distance)
  useEffect(() => {
    activeDrawRef.current = activeDraw
    distanceRef.current = distance
    paintRef.current?.()
  }, [activeDraw, distance])

  useEffect(() => {
    paintRef.current = () => {
      const canvas = canvasRef.current
      const built = layerRef.current
      if (!canvas || !built) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const { layer, ratio, cx, cy, radius } = built
      const activeDraw = activeDrawRef.current
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(layer, 0, 0)
      ctx.scale(ratio, ratio)
      const cta = built.cta
      const distance = distanceRef.current
      if (activeDraw?.active) {
        const preview = arrowResult({
          ax: activeDraw.ax, dr: activeDraw.dr,
          wind: activeDraw.wind ?? 0, sway: activeDraw.sway ?? 0,
          distance,
        })
        const x = cx + preview.ax / 610 * radius * 0.9
        const y = cy + preview.ay / 610 * radius * 0.9
        ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = cta; ctx.globalAlpha = 0.8
        ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke()
        ctx.restore()
      }
    }
    return () => { paintRef.current = null }
  }, [])

  return (
    <div className="relative overflow-hidden rounded border border-retro-border shadow-neon-p1">
      <canvas
        ref={canvasRef}
        className="block h-[clamp(220px,36dvh,360px)] w-full touch-none select-none"
        style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
        aria-label={`Neon archery range, ${distance} metres${disabled ? ', waiting for your turn' : ', pull down from the bow grip to draw and release to shoot'}`}
        role="img"
        {...(pointerProps || {})}
      />
      {activeDraw?.active && (
        <div className="pointer-events-none absolute left-3 right-3 top-8 flex items-center gap-2" aria-live="polite">
          <span className="font-pixel text-[8px] text-retro-win">SIGHT BAND</span>
          <span className="h-2 flex-1 overflow-hidden rounded border border-retro-border bg-retro-deep">
            <span className="block h-full bg-retro-win transition-[width]" style={{ width: `${Math.max(0, Math.min(100, (activeDraw.dr - 500) / 5))}%` }} />
          </span>
          <span className="font-pixel text-[8px] text-retro-cta">{activeDraw.dr} MM</span>
        </div>
      )}
      {/* The draw hint lives below the range (it sat on top of the bow grip once
          phone text got a 10px floor); only the locked state needs the overlay. */}
      {disabled && (
        <span className="pointer-events-none absolute bottom-2 left-0 right-0 text-center font-pixel text-[8px] text-retro-dim">
          RANGE LOCKED · OPPONENT SHOOTS
        </span>
      )}
    </div>
  )
}
