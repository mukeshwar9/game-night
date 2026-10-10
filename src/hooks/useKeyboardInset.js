import { useEffect, useState } from 'react'

// Height (px) the on-screen keyboard covers at the bottom of the layout
// viewport, from window.visualViewport. 0 on desktop and when no keyboard is
// up. A bottom sheet pads itself by this much so its input stays above the
// keyboard instead of under it (iOS Safari keeps fixed elements on the layout
// viewport, which the keyboard overlaps).
export default function useKeyboardInset(enabled = true) {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!enabled || !vv) return undefined
    const sync = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [enabled])
  return enabled ? inset : 0
}
