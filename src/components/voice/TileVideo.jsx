// One person's camera inside a party tile. The audio travels separately (Web
// Audio in the voice controller), so this element is always muted.
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export default function TileVideo({ stream, mirror = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    el.srcObject = stream
    el.play?.().catch(() => {})
    return () => { el.srcObject = null }
  }, [stream])
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      aria-hidden="true"
      data-testid="tile-video"
      className={cn('w-full h-full object-cover bg-retro-deep', mirror && '-scale-x-100')}
    />
  )
}
