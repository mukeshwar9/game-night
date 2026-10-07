import { useEffect, useRef, useState } from 'react'
import {
  doubleTapCamera,
  isDoubleTap,
  isTap,
  keyPan,
  panBy,
  panByScreen,
  pinchStep,
  revealPoint,
  sameCamera,
  screenToBoard,
  stepZoom,
  wheelFactor,
  wheelZooms,
  zoomAt,
  zoomOf,
} from '../lib/boardCameraLogic'

// Drag and zoom for a dense board, shared by every board that has one (Arrows
// draws the camera as an SVG viewBox; DOM grids go through ZoomViewport).
//
// `viewRef` is the element the camera fills on screen: pointer positions are
// read relative to its bounding rect, so a board that is itself scaled (the
// focus stage) still maps fingers to the right board point.
//
// Gestures: one finger drags once it moves past the tap slop, two fingers
// pinch, the wheel zooms around the cursor, and a tap is decided when the
// pointer comes up — never on the way down, so a drag never plays a move.
// `onTap(event)` gets each tap and returns true when it hit something; a miss
// counts towards a double-tap, which zooms in there or back out to fit.
//
// `capture` takes pointer capture on the view (an SVG board that hit-tests its
// own taps). A DOM grid leaves it off so its buttons still get their clicks;
// `onClickCapture` then swallows the click that ends a drag or a pinch.
//
// `wheel`: 'always' zooms on every wheel turn over the view (Arrows), 'zoomed'
// lets a plain wheel scroll the page until the board is zoomed in (a trackpad
// pinch, which arrives with ctrlKey, always zooms).
export default function useBoardCamera({ fit, enabled = true, viewRef, onTap, capture = true, wheel = 'always', doubleTap = true }) {
  const [cam, setCam] = useState(fit)
  const camRef = useRef(fit)
  const pointers = useRef(new Map())
  const gesture = useRef(null)
  const lastTap = useRef(null)
  const swallowClick = useRef(false)

  const applyCam = (update) => {
    const next = typeof update === 'function' ? update(camRef.current) : update
    camRef.current = next
    setCam(next)
  }

  // A new fit (another level, a re-measured grid) starts back at the whole board.
  const [shownFit, setShownFit] = useState(fit)
  if (!sameCamera(shownFit, fit)) {
    setShownFit(fit)
    setCam(fit)
  }
  useEffect(() => { camRef.current = cam }, [cam])

  const view = enabled ? cam : fit
  const zoom = zoomOf(view, fit)
  const viewRect = () => viewRef.current?.getBoundingClientRect()
  const viewPx = () => viewRect()?.width || 1
  // Screen position relative to the board view, in px.
  const local = (clientX, clientY) => {
    const rect = viewRect()
    return rect ? [clientX - rect.left, clientY - rect.top] : [0, 0]
  }

  const onPointerDown = (e) => {
    if (!enabled) return
    if (capture) viewRef.current?.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      gesture.current = { start: { x: e.clientX, y: e.clientY }, moved: false, multi: false }
      swallowClick.current = false
    } else if (gesture.current) {
      gesture.current.multi = true
    }
  }

  const onPointerMove = (e) => {
    const prev = pointers.current.get(e.pointerId)
    if (!enabled || !prev) return
    const next = { x: e.clientX, y: e.clientY }
    if (pointers.current.size === 2) {
      const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)?.[1]
      if (other) {
        applyCam((c) => pinchStep(c, fit, [local(prev.x, prev.y), local(other.x, other.y)], [local(next.x, next.y), local(other.x, other.y)], viewPx()))
      }
    } else if (gesture.current && pointers.current.size === 1) {
      if (!gesture.current.moved && !isTap(gesture.current.start, next)) gesture.current.moved = true
      if (gesture.current.moved) {
        applyCam((c) => panByScreen(c, fit, next.x - prev.x, next.y - prev.y, viewPx()))
      }
    }
    pointers.current.set(e.pointerId, next)
  }

  const onPointerUp = (e) => {
    if (!enabled || !pointers.current.has(e.pointerId)) return
    const g = gesture.current
    const alone = pointers.current.size === 1
    pointers.current.delete(e.pointerId)
    if (!pointers.current.size) gesture.current = null
    const tapped = alone && g && !g.moved && !g.multi && isTap(g.start, { x: e.clientX, y: e.clientY })
    if (!tapped) {
      if (g) swallowClick.current = true
      return
    }
    if (onTap?.(e)) {
      lastTap.current = null
      return
    }
    if (!doubleTap) return
    // Empty space: two quick taps zoom in there, or back out to the whole board.
    const tap = { x: e.clientX, y: e.clientY, t: performance.now() }
    if (isDoubleTap(lastTap.current, tap)) {
      lastTap.current = null
      const [px, py] = local(e.clientX, e.clientY)
      const [fx, fy] = screenToBoard(camRef.current, viewPx(), px, py)
      applyCam((c) => doubleTapCamera(c, fit, fx, fy))
    } else {
      lastTap.current = tap
    }
  }

  const onPointerCancel = (e) => {
    pointers.current.delete(e.pointerId)
    if (!pointers.current.size) gesture.current = null
  }

  // The click a drag or pinch ends with is not a move.
  const onClickCapture = (e) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  // Wheel zoom around the cursor. React attaches wheel listeners as passive,
  // so this one is added by hand to be able to stop the page scrolling.
  useEffect(() => {
    const el = viewRef.current
    if (!enabled || !el) return undefined
    const onWheel = (e) => {
      if (!wheelZooms({ mode: wheel, ctrlKey: e.ctrlKey, zoomed: zoomOf(camRef.current, fit) > 1.001 })) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      applyCam((c) => {
        const [fx, fy] = screenToBoard(c, rect.width, e.clientX - rect.left, e.clientY - rect.top)
        return zoomAt(c, fit, wheelFactor(e.deltaY, e.ctrlKey), fx, fy)
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [enabled, fit, viewRef, wheel])

  const onKeyDown = (e) => {
    if (!enabled || e.ctrlKey || e.metaKey || e.altKey) return
    let handled = true
    if (e.key === '+' || e.key === '=') applyCam((c) => stepZoom(c, fit, 1))
    else if (e.key === '-' || e.key === '_') applyCam((c) => stepZoom(c, fit, -1))
    else if (e.key === '0') applyCam(fit)
    else {
      const pan = keyPan(camRef.current, e.key)
      if (pan) applyCam((c) => panBy(c, fit, pan[0], pan[1]))
      else handled = false
    }
    if (handled) e.preventDefault()
  }

  return {
    cam: view,
    zoom,
    applyCam,
    zoomIn: () => applyCam((c) => stepZoom(c, fit, 1)),
    zoomOut: () => applyCam((c) => stepZoom(c, fit, -1)),
    reset: () => applyCam(fit),
    // Bring a board point into view (with `margin` units to spare) if it is off-screen.
    reveal: (point, margin = 0) => { if (enabled) applyCam((c) => revealPoint(c, fit, point, margin)) },
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    onClickCapture,
    onKeyDown,
  }
}
