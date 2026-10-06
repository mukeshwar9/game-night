import { useEffect } from 'react'
import { scrollBehavior } from './useMotionPref'

// Scrolls a tall arena to the top of the screen when play starts, so the part
// you are heading into is never left under the app header or off the bottom.
// The app header slides away on solo/pass & play routes once the page scrolls
// (NavBar), so the arena can use the full height.
export default function useFocusArena(ref, active) {
  useEffect(() => {
    if (!active) return undefined
    const id = requestAnimationFrame(() => {
      ref.current?.scrollIntoView?.({ block: 'start', behavior: scrollBehavior() })
    })
    return () => cancelAnimationFrame(id)
  }, [ref, active])
}
