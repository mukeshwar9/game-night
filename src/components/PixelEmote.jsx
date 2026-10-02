import { useEffect, useRef } from 'react'
import { FRAME_MS, SPRITE_SIZE, pixelColour, spriteFrame } from '../lib/pixelEmotes'
import useMotionPref from '../hooks/useMotionPref'

// One PIXEL EMOTES sprite (src/lib/pixelEmotes.js) drawn on a 16×16 canvas
// scaled up with crisp pixels, looping its frames like a flip-book. With
// reduced motion (Settings or OS) it shows the first frame only.
export default function PixelEmote({ id, size = 40, label, className = '' }) {
  const ref = useRef(null)
  const { reduced } = useMotionPref()

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext?.('2d')
    if (!ctx) return undefined
    let frame = 0
    const paint = () => {
      const grid = spriteFrame(id, frame)
      ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE)
      if (!grid) return
      grid.forEach((row, y) => row.forEach((key, x) => {
        const colour = pixelColour(key)
        if (!colour) return
        ctx.fillStyle = colour
        ctx.fillRect(x, y, 1, 1)
      }))
    }
    paint()
    if (reduced) return undefined
    const timer = setInterval(() => { frame += 1; paint() }, FRAME_MS)
    return () => clearInterval(timer)
  }, [id, reduced])

  return (
    <canvas
      ref={ref}
      width={SPRITE_SIZE}
      height={SPRITE_SIZE}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
    />
  )
}
