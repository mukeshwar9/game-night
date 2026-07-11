import { useRef, useState } from 'react'

// Guard is checked+set synchronously (before any await) so double-taps are blocked
// even before React flushes state — required to preserve navigator.share's user-activation window.
export default function useBusy() {
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const run = async (fn, onError) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      return await fn()
    } catch (err) {
      if (onError) onError(err)
      else console.error(err)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return [busy, run]
}
