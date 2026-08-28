import { useEffect, useRef, useState } from 'react'

// Hides chrome (NavBar) on scroll-down, shows it again on scroll-up or near
// the top. Passive listener, matches the convention Home's scroll-restore
// listener already uses. `resetKey` (typically pathname) forces `hidden`
// back to false on route change; `enabled` lets a caller opt out entirely
// (e.g. game routes, where the header stays pinned).
export default function useHideOnScroll({ enabled = true, resetKey } = {}) {
  const [hidden, setHidden] = useState(false)
  const lastYRef = useRef(0)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-way reset driven by the external route change (resetKey), the header must reappear immediately on navigation
    setHidden(false)
    lastYRef.current = Math.max(0, window.scrollY)
  }, [resetKey])

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-way reset driven by the external enabled flag (game routes/demo keep the header pinned)
      setHidden(false)
      return
    }
    const onScroll = () => {
      // iOS rubber-band can push scrollY negative past the top — clamp so
      // the bounce never reads as a downward scroll.
      const y = Math.max(0, window.scrollY)
      const dy = y - lastYRef.current
      if (y <= 64 || dy < -8) setHidden(false)
      else if (y > 64 && dy > 8) setHidden(true)
      lastYRef.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [enabled])

  return hidden
}
