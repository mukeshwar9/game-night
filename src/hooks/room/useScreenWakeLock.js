import { useEffect, useRef } from 'react'
import { createWakeLockController } from '../../lib/wakeLock'

// Keeps the screen on while `active` (a live match). See src/lib/wakeLock.js.
export default function useScreenWakeLock(active) {
  const controller = useRef(null)
  useEffect(() => {
    const c = createWakeLockController()
    controller.current = c
    return () => { controller.current = null; c.dispose() }
  }, [])
  useEffect(() => { controller.current?.setActive(!!active) }, [active])
}
