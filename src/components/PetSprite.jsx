import { useLayoutEffect, useRef } from 'react'
import { renderPet, isPetAnimated, PET_BOX } from '../lib/avatarKit'

const STATIC_T = 0.35

// One pet drawn on its own at a whole-pixel scale (the pet picker's cards and the
// profile's PET button), in the fixed avatar palette. Animated pets step at 4 fps
// while mounted, never under reduced motion. `id="none"` draws an empty dashed
// slot so "no pet" still reads as a choice.
export default function PetSprite({ id, scale = 6, className = '', label }) {
  const ref = useRef(null)
  const size = PET_BOX * scale
  useLayoutEffect(() => {
    const canvas = ref.current
    if (!canvas) return undefined
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1))
    canvas.width = size * dpr
    canvas.height = size * dpr
    const ctx = canvas.getContext('2d')
    const cell = scale * dpr
    const paint = (t) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const px = renderPet(id, t)
      if (!px) return
      for (let i = 0; i < px.length; i++) {
        const c = px[i]
        if (!c) continue
        ctx.fillStyle = `rgb(${c[0]} ${c[1]} ${c[2]})`
        ctx.fillRect((i % PET_BOX) * cell, Math.floor(i / PET_BOX) * cell, cell, cell)
      }
    }
    paint(STATIC_T)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!isPetAnimated(id) || reduce) return undefined
    const t0 = performance.now()
    const timer = setInterval(() => paint((performance.now() - t0) / 1000), 250)
    return () => clearInterval(timer)
  }, [id, scale, size])

  if (id === 'none') {
    return (
      <span
        role="img"
        aria-label={label || 'no pet'}
        className={`inline-block rounded border-2 border-dashed border-retro-border ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label || `${id} pet`}
      className={className}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
    />
  )
}
