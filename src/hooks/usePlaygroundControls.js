import { useEffect, useRef } from 'react'

// Captures 2-axis movement input for the Playground world: arrows/WASD on the
// world element (not window — an unfocused world leaves page-scroll arrows
// alone) plus pointer-drag joystick for touch. Pointer wins over keyboard.
// Exposes getInput() → { dx, dy } each -1|0|1, fed straight into playgroundLogic.step.
export function usePlaygroundControls(worldRef, enabled = true) {
  const keys = useRef({ up: false, down: false, left: false, right: false })
  const keyDir = useRef({ dx: 0, dy: 0 })
  const originRef = useRef(null) // { x, y } in client px while dragging, else null
  const dragDir = useRef(null) // { dx, dy } while past the deadzone, else null

  useEffect(() => {
    const el = worldRef.current
    if (!el || !enabled) return
    const recompute = () => {
      keyDir.current = {
        dx: (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0),
        dy: (keys.current.down ? 1 : 0) - (keys.current.up ? 1 : 0),
      }
    }
    const isUp = (k) => k === 'ArrowUp' || k === 'w' || k === 'W'
    const isDown = (k) => k === 'ArrowDown' || k === 's' || k === 'S'
    const isLeft = (k) => k === 'ArrowLeft' || k === 'a' || k === 'A'
    const isRight = (k) => k === 'ArrowRight' || k === 'd' || k === 'D'
    const onDown = (e) => {
      let hit = true
      if (isUp(e.key)) keys.current.up = true
      else if (isDown(e.key)) keys.current.down = true
      else if (isLeft(e.key)) keys.current.left = true
      else if (isRight(e.key)) keys.current.right = true
      else hit = false
      if (hit) { recompute(); e.preventDefault() }
    }
    const onUp = (e) => {
      let hit = true
      if (isUp(e.key)) keys.current.up = false
      else if (isDown(e.key)) keys.current.down = false
      else if (isLeft(e.key)) keys.current.left = false
      else if (isRight(e.key)) keys.current.right = false
      else hit = false
      if (hit) recompute()
    }
    el.addEventListener('keydown', onDown)
    el.addEventListener('keyup', onUp)
    return () => {
      el.removeEventListener('keydown', onDown)
      el.removeEventListener('keyup', onUp)
    }
  }, [worldRef, enabled])

  useEffect(() => {
    const el = worldRef.current
    if (!el || !enabled) return
    const DEADZONE = 12 // px
    const setFrom = (e) => {
      if (!originRef.current) return
      const ddx = e.clientX - originRef.current.x
      const ddy = e.clientY - originRef.current.y
      if (Math.hypot(ddx, ddy) < DEADZONE) { dragDir.current = { dx: 0, dy: 0 }; return }
      const angle = Math.atan2(ddy, ddx)
      const dx = Math.round(Math.cos(angle))
      const dy = Math.round(Math.sin(angle))
      dragDir.current = { dx, dy }
    }
    const onDown = (e) => {
      originRef.current = { x: e.clientX, y: e.clientY }
      el.setPointerCapture?.(e.pointerId)
      dragDir.current = { dx: 0, dy: 0 }
    }
    const onMove = (e) => { if (originRef.current) setFrom(e) }
    const onEnd = () => { originRef.current = null; dragDir.current = null }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onEnd)
    el.addEventListener('pointercancel', onEnd)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onEnd)
      el.removeEventListener('pointercancel', onEnd)
    }
  }, [worldRef, enabled])

  const getInput = () => dragDir.current ?? keyDir.current

  return { getInput }
}
