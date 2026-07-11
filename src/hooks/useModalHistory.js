import { useEffect, useRef } from 'react'

// Wires an open overlay into the browser/Android back-gesture history stack
// (M-06). Call it once from a mounted-while-open overlay: it pushes a no-op
// history marker on mount so the system back gesture pops that marker
// instead of navigating the underlying route, and closes the overlay via
// `onClose` when that happens. On a normal close (backdrop tap, Escape, a
// button inside the overlay) the overlay unmounts first — the cleanup then
// consumes the still-pending marker with a programmatic back-step so it
// never lingers as an extra dead entry in history.
export default function useModalHistory(onClose) {
  const pushedRef = useRef(false)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    window.history.pushState({ modalHistory: true }, '')
    pushedRef.current = true

    const onPopState = () => {
      pushedRef.current = false
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
      if (pushedRef.current) {
        pushedRef.current = false
        window.history.back()
      }
    }
  }, [])
}
