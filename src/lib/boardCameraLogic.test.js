import { describe, it, expect } from 'vitest'
import {
  DOUBLE_TAP_MS,
  MAX_ZOOM,
  clampCamera,
  doubleTapCamera,
  fitCamera,
  inView,
  isDoubleTap,
  isTap,
  keyPan,
  panBy,
  panByScreen,
  pinchStep,
  revealPoint,
  screenToBoard,
  stepZoom,
  wheelFactor,
  zoomAt,
  zoomOf,
  zoomTo,
  cameraTransform,
  sameCamera,
  wheelZooms,
} from './boardCameraLogic'

// A 16 × 22 board at 10 units a cell, padded by 2.
const fit = fitCamera(160, 220, 2)

describe('board camera', () => {
  it('the fit camera shows the whole padded board at zoom 1', () => {
    expect(fit).toEqual({ x: -2, y: -2, w: 164, h: 224 })
    expect(zoomOf(fit, fit)).toBe(1)
    expect(fitCamera(50, 60)).toEqual({ x: 0, y: 0, w: 50, h: 60 })
  })

  it('clamps the zoom to fit … 3× fit and the position inside the board', () => {
    expect(clampCamera({ x: -50, y: -50, w: 500, h: 500 }, fit)).toEqual(fit)
    const tight = clampCamera({ x: 0, y: 0, w: 1, h: 1 }, fit)
    expect(tight.w).toBeCloseTo(fit.w / MAX_ZOOM)
    expect(tight.h).toBeCloseTo(fit.h / MAX_ZOOM)
    const right = clampCamera({ x: 500, y: 500, w: 82, h: 112 }, fit)
    expect(right.x + right.w).toBeCloseTo(fit.x + fit.w)
    expect(right.y + right.h).toBeCloseTo(fit.y + fit.h)
    const left = clampCamera({ x: -500, y: -500, w: 82, h: 112 }, fit)
    expect([left.x, left.y]).toEqual([fit.x, fit.y])
  })

  it('keeps the aspect ratio of the fitted board', () => {
    for (const w of [164, 120, 82, 55]) {
      const c = clampCamera({ x: 0, y: 0, w, h: 1 }, fit)
      expect(c.w / c.h).toBeCloseTo(fit.w / fit.h)
    }
  })

  it('zooming at a point keeps that point under the same spot of the screen', () => {
    const c = zoomAt(fit, fit, 2, 80, 110)
    expect(zoomOf(c, fit)).toBeCloseTo(2)
    // The point sat at (82/164, 112/224) of the view before and still does.
    expect((80 - c.x) / c.w).toBeCloseTo((80 - fit.x) / fit.w)
    expect((110 - c.y) / c.h).toBeCloseTo((110 - fit.y) / fit.h)
    // Out of fit, a zoom-out is a no-op; past 3× it stops.
    expect(zoomAt(fit, fit, 0.5, 80, 110)).toEqual(fit)
    expect(zoomOf(zoomAt(fit, fit, 10, 80, 110), fit)).toBeCloseTo(MAX_ZOOM)
  })

  it('zoomTo reaches an absolute level; stepZoom steps around the centre', () => {
    expect(zoomOf(zoomTo(fit, fit, 2, 10, 10), fit)).toBeCloseTo(2)
    const inn = stepZoom(fit, fit, 1)
    expect(zoomOf(inn, fit)).toBeCloseTo(1.5)
    expect(inn.x + inn.w / 2).toBeCloseTo(fit.x + fit.w / 2)
    expect(stepZoom(inn, fit, -1)).toEqual(fit)
  })

  it('panning moves the view and stops at the board edge', () => {
    const z = zoomTo(fit, fit, 2, 80, 110)
    const moved = panBy(z, fit, 10, 5)
    expect(moved.x).toBeCloseTo(z.x + 10)
    expect(moved.y).toBeCloseTo(z.y + 5)
    expect(panBy(z, fit, 1e6, 1e6).x + z.w).toBeCloseTo(fit.x + fit.w)
    expect(panBy(fit, fit, 30, 30)).toEqual(fit)
  })

  it('dragging moves the board with the finger', () => {
    const z = zoomTo(fit, fit, 2, 80, 110)
    // The view is 400 px wide: a 100 px drag right shows 100 * (82 / 400) units further left.
    const dragged = panByScreen(z, fit, 100, 0, 400)
    expect(dragged.x).toBeCloseTo(z.x - 100 * (z.w / 400))
    expect(dragged.y).toBeCloseTo(z.y)
  })

  it('maps screen positions to board points', () => {
    expect(screenToBoard(fit, 328, 0, 0)).toEqual([-2, -2])
    expect(screenToBoard(fit, 328, 328, 448)[0]).toBeCloseTo(162)
    expect(screenToBoard(fit, 328, 164, 224)).toEqual([80, 110])
  })

  it('a pinch zooms by the finger gap and drags with their middle', () => {
    const spread = pinchStep(fit, fit, [[100, 100], [200, 100]], [[50, 100], [250, 100]], 328)
    expect(zoomOf(spread, fit)).toBeCloseTo(2)
    // The board point between the fingers before is between them after.
    const before = screenToBoard(fit, 328, 150, 100)
    const after = screenToBoard(spread, 328, 150, 100)
    expect(after[0]).toBeCloseTo(before[0])
    expect(after[1]).toBeCloseTo(before[1])
    // Same gap, middle moved: a plain pan.
    const z = zoomTo(fit, fit, 2, 80, 110)
    const dragged = pinchStep(z, fit, [[100, 100], [200, 100]], [[130, 100], [230, 100]], 328)
    expect(zoomOf(dragged, fit)).toBeCloseTo(2)
    expect(dragged.x).toBeCloseTo(z.x - 30 * (z.w / 328))
    // A degenerate pinch (fingers on the same spot) is a no-zoom.
    expect(zoomOf(pinchStep(z, fit, [[5, 5], [5, 5]], [[9, 9], [9, 9]], 328), fit)).toBeCloseTo(2)
  })

  it('the wheel zooms in on scroll up and out on scroll down', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1)
    expect(wheelFactor(100)).toBeLessThan(1)
    expect(wheelFactor(0)).toBe(1)
    expect(wheelFactor(-10, true)).toBeGreaterThan(wheelFactor(-10, false))
  })

  it('revealPoint pans the least that brings a point into view', () => {
    const z = zoomTo(fit, fit, 3, 20, 20)
    expect(inView(z, [100, 150])).toBe(false)
    const r = revealPoint(z, fit, [100, 150], 8)
    expect(inView(r, [100, 150], 8 - 1e-9)).toBe(true)
    expect(zoomOf(r, fit)).toBeCloseTo(3)
    // Already visible: the very same camera.
    expect(revealPoint(z, fit, [z.x + 20, z.y + 20], 4)).toBe(z)
    // On a fitted board nothing is ever off-screen.
    expect(revealPoint(fit, fit, [159, 219], 2)).toBe(fit)
  })

  it('a pointer that barely moves taps; two quick taps nearby double-tap', () => {
    expect(isTap({ x: 10, y: 10 }, { x: 14, y: 13 })).toBe(true)
    expect(isTap({ x: 10, y: 10 }, { x: 10, y: 18 })).toBe(false)
    expect(isTap({ x: 10, y: 10 }, { x: 10, y: 18 }, 12)).toBe(true)
    const first = { x: 50, y: 50, t: 1000 }
    expect(isDoubleTap(first, { x: 60, y: 55, t: 1000 + DOUBLE_TAP_MS })).toBe(true)
    expect(isDoubleTap(first, { x: 60, y: 55, t: 1000 + DOUBLE_TAP_MS + 1 })).toBe(false)
    expect(isDoubleTap(first, { x: 200, y: 55, t: 1100 })).toBe(false)
    expect(isDoubleTap(null, first)).toBe(false)
  })

  it('a double-tap zooms to 2× there, and from deep zoom goes back to fit', () => {
    const z2 = doubleTapCamera(fit, fit, 40, 60)
    expect(zoomOf(z2, fit)).toBeCloseTo(2)
    expect(doubleTapCamera(zoomTo(fit, fit, 3, 40, 60), fit, 40, 60)).toEqual(fit)
  })

  it('the arrow keys pan a fifth of the view', () => {
    const z = zoomTo(fit, fit, 2, 80, 110)
    expect(keyPan(z, 'ArrowLeft')).toEqual([-z.w / 5, 0])
    expect(keyPan(z, 'ArrowDown')).toEqual([0, z.w / 5])
    expect(keyPan(z, 'x')).toBeNull()
  })
})

describe('cameraTransform (DOM boards)', () => {
  // Content laid out 300 px wide; the camera works in content px.
  const domFit = fitCamera(300, 200)

  it('is the identity at fit', () => {
    expect(cameraTransform(domFit, domFit, 300)).toBe('translate(0px, 0px) scale(1)')
  })

  it('maps the camera corner to the view corner at 2×', () => {
    const cam = { x: 100, y: 50, w: 150, h: 100 }
    // A content point p lands at k·p + t; the camera corner must land at 0.
    expect(cameraTransform(cam, domFit, 300)).toBe('translate(-200px, -100px) scale(2)')
    expect(100 * 2 - 200).toBe(0)
  })

  it('works for a padded fit too', () => {
    const padded = fitCamera(100, 100, 10)
    expect(cameraTransform(padded, padded, 120)).toBe('translate(0px, 0px) scale(1)')
  })
})

describe('sameCamera', () => {
  it('ignores float noise only', () => {
    expect(sameCamera(fit, { ...fit, x: fit.x + 1e-9 })).toBe(true)
    expect(sameCamera(fit, { ...fit, w: fit.w - 1 })).toBe(false)
  })
})

describe('wheelZooms', () => {
  it('a board that owns the wheel always zooms', () => {
    expect(wheelZooms({ mode: 'always', ctrlKey: false, zoomed: false })).toBe(true)
  })
  it('otherwise a plain wheel scrolls the page until the board is zoomed', () => {
    expect(wheelZooms({ mode: 'zoomed', ctrlKey: false, zoomed: false })).toBe(false)
    expect(wheelZooms({ mode: 'zoomed', ctrlKey: false, zoomed: true })).toBe(true)
  })
  it('a trackpad pinch (ctrlKey) always zooms', () => {
    expect(wheelZooms({ mode: 'zoomed', ctrlKey: true, zoomed: false })).toBe(true)
  })
})
