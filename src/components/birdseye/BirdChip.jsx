import { useEffect, useRef } from 'react'
import { birdseyeSprite } from './birdseyeView'
import { useThemeKey } from './useThemeKey'

// A bird (or the scarecrow) as a small pixel sprite, re-painted on a theme change.
export default function BirdChip({ id, used = false, className = 'w-5 h-5', view = 'side', label }) {
  const ref = useRef(null)
  const theme = useThemeKey()
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const sp = birdseyeSprite(id, 0, view)
    c.width = sp.width; c.height = sp.height
    const g = c.getContext('2d')
    g.clearRect(0, 0, c.width, c.height)
    g.drawImage(sp, 0, 0)
  }, [id, view, theme])
  return (
    <canvas
      ref={ref}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      className={`${className} object-contain [image-rendering:pixelated] ${used ? 'opacity-25' : ''}`}
    />
  )
}
