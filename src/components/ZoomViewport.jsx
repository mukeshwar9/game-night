import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MAX_ZOOM, cameraTransform, fitCamera } from '../lib/boardCameraLogic'
import useBoardCamera from '../hooks/useBoardCamera'

// Drag and zoom for a dense DOM board (Gomoku, Hex, Blockade, Battleship's
// grids, Mine Race). Wrap the grid; it lays out exactly as before at fit, and
// the camera moves it with a CSS transform inside a clipping view. The grid's
// own buttons keep their clicks: a tap still plays, while the click that ends
// a drag or a pinch is swallowed. − / FIT / + sit under the view so they never
// cover a cell. `onGestureStart` tells the board a press became a drag or a
// pinch (Mine Race drops its long-press flag timer).
export default function ZoomViewport({ children, enabled = true, className, label = 'Board', onGestureStart }) {
  const viewRef = useRef(null)
  const contentRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return undefined
    const measure = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      setSize(s => (s.w === w && s.h === h ? s : { w, h }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ready = enabled && size.w > 0 && size.h > 0
  const fit = useMemo(() => fitCamera(Math.max(1, size.w), Math.max(1, size.h)), [size.w, size.h])
  const camera = useBoardCamera({ fit, enabled: ready, viewRef, onGestureStart, capture: false, wheel: 'zoomed', doubleTap: false, onTap: () => true })
  const { cam, zoom } = camera
  const zoomed = zoom > 1.02

  if (!enabled) return <div className={className}>{children}</div>

  const btn = 'min-h-9 min-w-9 px-2 font-pixel text-[9px] rounded border border-retro-border text-retro-dim hover:border-retro-cta/50 hover:text-retro-text transition press disabled:opacity-40 disabled:pointer-events-none'
  return (
    <div className={className}>
      <div
        ref={viewRef}
        className="relative overflow-hidden"
        style={{ touchAction: 'none' }}
        role="group"
        aria-label={zoomed ? `${label}, zoomed ${zoom.toFixed(1)} times` : label}
        data-zoom-viewport
        {...camera.handlers}
        onClickCapture={camera.onClickCapture}
      >
        <div
          ref={contentRef}
          style={zoomed ? { transform: cameraTransform(cam, fit, size.w), transformOrigin: '0 0' } : undefined}
        >
          {children}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1.5">
        <span className="font-pixel text-[7px] text-retro-dim leading-relaxed" aria-hidden="true">
          {zoomed ? `${zoom.toFixed(1)}× · DRAG TO MOVE` : 'PINCH OR + TO ZOOM'}
        </span>
        <div className="flex gap-1.5">
          <button type="button" className={btn} aria-label="Zoom out" disabled={!zoomed} onClick={camera.zoomOut}>−</button>
          <button type="button" className={btn} aria-label="Fit the whole board" disabled={!zoomed} onClick={camera.reset}>FIT</button>
          <button type="button" className={btn} aria-label="Zoom in" disabled={zoom >= MAX_ZOOM - 0.02} onClick={camera.zoomIn}>+</button>
        </div>
      </div>
    </div>
  )
}
