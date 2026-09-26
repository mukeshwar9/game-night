import { useCallback, useEffect, useRef, useState } from 'react'
import { steadyAim } from '../lib/archeryLogic'
import { sounds } from '../lib/sounds'

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

// Press the lower bow grip, pull down for draw length and sideways to steer.
// Pointer capture and touch-action:none keep iOS from stealing an in-flight draw.
export default function useBowDraw(onLoose, { enabled = true, steady = true, mirror = false } = {}) {
  const [draw, setDraw] = useState({ active: false, dr: 600, ax: 0, drawMs: 0 })
  const drawRef = useRef(null)
  const looseRef = useRef(onLoose)
  useEffect(() => { looseRef.current = onLoose }, [onLoose])
  const enabledRef = useRef(enabled)
  useEffect(() => { enabledRef.current = enabled }, [enabled])

  const reset = useCallback(() => {
    drawRef.current = null
    setDraw({ active: false, dr: 600, ax: 0, drawMs: 0 })
  }, [])

  const onPointerDown = useCallback((event) => {
    if (!enabledRef.current || (event.pointerType === 'mouse' && event.button !== 0)) return
    const rect = event.currentTarget.getBoundingClientRect()
    const y = (event.clientY - rect.top) / rect.height
    if (y < 0.72) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const now = performance.now()
    drawRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rect,
      at: now,
      moved: false,
      pulled: false,
      cancelled: false,
    }
    setDraw({ active: true, dr: 600, ax: 0, drawMs: 0 })
    sounds.archeryDraw()
  }, [])

  const onPointerMove = useCallback((event) => {
    const current = drawRef.current
    if (!current || current.pointerId !== event.pointerId) return
    event.preventDefault()
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    if (dy > 24) current.pulled = true
    if (current.pulled && dy < 12) current.cancelled = true
    if (dy > 12 || Math.abs(dx) > 12) current.moved = true
    const drawMs = Math.max(0, Math.min(3000, performance.now() - current.at))
    const dr = clamp(600 + Math.round(dy / current.rect.height * 2500), 600, 1000)
    const ax = clamp(Math.round(dx / current.rect.width * 1200), -600, 600)
    const phase = (current.at % 10000) / 10000 * Math.PI * 2
    const sway = steadyAim(drawMs, steady, phase)
    setDraw({ active: true, dr, ax, drawMs, sway })
  }, [steady])

  const finish = useCallback((event, release) => {
    const current = drawRef.current
    if (!current || current.pointerId !== event.pointerId) return
    if (release && !current.cancelled && current.moved && enabledRef.current) {
      const dx = event.clientX - current.startX
      const dy = event.clientY - current.startY
      const drawMs = Math.max(0, Math.min(3000, performance.now() - current.at))
      const dr = clamp(600 + Math.round(dy / current.rect.height * 2500), 600, 1000)
      const ax = clamp(Math.round(dx / current.rect.width * 1200), -600, 600)
      const sway = steadyAim(drawMs, steady, (current.at % 10000) / 10000 * Math.PI * 2)
      looseRef.current?.({ ax: mirror ? -ax : ax, ay: 0, dr, drawMs, sway })
    }
    reset()
  }, [mirror, reset, steady])

  const onPointerUp = useCallback((event) => finish(event, true), [finish])
  const onPointerCancel = useCallback((event) => finish(event, false), [finish])
  const setAim = useCallback((values) => setDraw(current => ({ ...current, ...values })), [])

  return {
    draw,
    setAim,
    pointerProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  }
}
