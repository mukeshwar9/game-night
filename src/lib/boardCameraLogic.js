// @ts-check
// Board camera — the maths for drag and zoom on dense boards. Pure: no DOM,
// no Firebase, no React. `useBoardCamera` feeds it pointer positions; an SVG
// board draws the camera as its viewBox (Arrows), a DOM grid as a CSS
// transform (`cameraTransform`, via `ZoomViewport`).
//
// A camera is the part of the board in view, in board units: { x, y, w, h },
// the rectangle the SVG viewBox shows. The `fit` camera shows the whole board
// (padding included); zoom is fit.w / cam.w, from 1 (fitted) up to MAX_ZOOM.
// Every camera keeps fit's aspect ratio and stays inside it, so the SVG never
// changes size while the player moves around.

/** @typedef {{ x: number, y: number, w: number, h: number }} Camera */
/** @typedef {[number, number]} Point */

export const MAX_ZOOM = 3
// A button or key press zooms by this factor; a double-tap jumps to
// DOUBLE_TAP_ZOOM, or back to fit when already past DOUBLE_TAP_RESET.
export const ZOOM_STEP = 1.5
export const DOUBLE_TAP_ZOOM = 2
export const DOUBLE_TAP_RESET = 2.5
// A pointer that moves less than this many px between down and up is a tap.
export const TAP_SLOP_PX = 8
export const DOUBLE_TAP_MS = 320
export const DOUBLE_TAP_PX = 28
/** The camera that shows the whole board with `pad` units around it. */
export function fitCamera(width, height, pad = 0) {
  return { x: 0 - pad, y: 0 - pad, w: width + pad * 2, h: height + pad * 2 }
}

/** Zoom of `cam` relative to `fit` (1 = the whole board). */
export function zoomOf(cam, fit) {
  return fit.w / cam.w
}

/** Keep a camera at fit's aspect, within the zoom range, inside the board. */
export function clampCamera(cam, fit) {
  const w = Math.min(fit.w, Math.max(fit.w / MAX_ZOOM, cam.w))
  const h = (w * fit.h) / fit.w
  const x = Math.min(fit.x + fit.w - w, Math.max(fit.x, cam.x))
  const y = Math.min(fit.y + fit.h - h, Math.max(fit.y, cam.y))
  return { x, y, w, h }
}

/**
 * Zoom so the board point (fx, fy) stays under the same spot of the screen,
 * `factor` times closer (factor < 1 zooms out).
 */
export function zoomAt(cam, fit, factor, fx, fy) {
  const w = Math.min(fit.w, Math.max(fit.w / MAX_ZOOM, cam.w / factor))
  const k = w / cam.w
  return clampCamera({ x: fx - (fx - cam.x) * k, y: fy - (fy - cam.y) * k, w, h: cam.h * k }, fit)
}

/** Zoom to an absolute level (1 = fit) around the board point (fx, fy). */
export function zoomTo(cam, fit, zoom, fx, fy) {
  return zoomAt(cam, fit, zoom / zoomOf(cam, fit), fx, fy)
}

/** One button or key step in (+1) or out (-1) around the camera's centre. */
export function stepZoom(cam, fit, direction) {
  const factor = direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP
  return zoomAt(cam, fit, factor, cam.x + cam.w / 2, cam.y + cam.h / 2)
}

/** Move the camera by (dx, dy) board units. */
export function panBy(cam, fit, dx, dy) {
  return clampCamera({ ...cam, x: cam.x + dx, y: cam.y + dy }, fit)
}

/** Drag: the board follows the finger by (dxPx, dyPx) screen px. */
export function panByScreen(cam, fit, dxPx, dyPx, viewPx) {
  const k = cam.w / viewPx
  return panBy(cam, fit, -dxPx * k, -dyPx * k)
}

/** The board point under the screen position (px, py), relative to the view. */
export function screenToBoard(cam, viewPx, px, py) {
  const k = cam.w / viewPx
  return /** @type {Point} */ ([cam.x + px * k, cam.y + py * k])
}

/**
 * One two-finger step: the fingers moved from `prev` to `next` (screen px,
 * relative to the view). The gap between them sets the zoom and their middle
 * drags the board, so the point between the fingers stays between them.
 * @param {[Point, Point]} prev
 * @param {[Point, Point]} next
 */
export function pinchStep(cam, fit, prev, next, viewPx) {
  const gap = (/** @type {[Point, Point]} */ p) => Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1])
  const before = gap(prev)
  const after = gap(next)
  const factor = before > 0 && after > 0 ? after / before : 1
  const mid = (/** @type {[Point, Point]} */ p) => /** @type {Point} */ ([(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2])
  const m0 = mid(prev)
  const m1 = mid(next)
  const [fx, fy] = screenToBoard(cam, viewPx, m0[0], m0[1])
  const zoomed = zoomAt(cam, fit, factor, fx, fy)
  // Zooming kept (fx, fy) under m0; now drag it to m1.
  return panByScreen(zoomed, fit, m1[0] - m0[0], m1[1] - m0[1], viewPx)
}

/** Wheel zoom factor for a wheel delta (pixel units; trackpad pinch is finer). */
export function wheelFactor(deltaY, ctrl = false) {
  return Math.exp((-deltaY * (ctrl ? 0.01 : 0.0015)))
}

/**
 * Pan the minimum needed so the board point stays inside the view with
 * `margin` board units to spare. An already-visible point leaves the camera
 * as it is (same object).
 */
export function revealPoint(cam, fit, point, margin = 0) {
  const [px, py] = point
  let dx = 0
  let dy = 0
  if (px < cam.x + margin) dx = px - margin - cam.x
  else if (px > cam.x + cam.w - margin) dx = px + margin - (cam.x + cam.w)
  if (py < cam.y + margin) dy = py - margin - cam.y
  else if (py > cam.y + cam.h - margin) dy = py + margin - (cam.y + cam.h)
  return dx === 0 && dy === 0 ? cam : panBy(cam, fit, dx, dy)
}

/** Is the board point inside the camera's view? */
export function inView(cam, point, margin = 0) {
  return point[0] >= cam.x + margin && point[0] <= cam.x + cam.w - margin &&
    point[1] >= cam.y + margin && point[1] <= cam.y + cam.h - margin
}

/** Did a pointer that went down at `down` and came up at `up` tap? */
export function isTap(down, up, slop = TAP_SLOP_PX) {
  return Math.hypot(up.x - down.x, up.y - down.y) < slop
}

/** Is `tap` the second half of a double-tap that began at `prev`? */
export function isDoubleTap(prev, tap) {
  return !!prev && tap.t - prev.t <= DOUBLE_TAP_MS && Math.hypot(tap.x - prev.x, tap.y - prev.y) <= DOUBLE_TAP_PX
}

/** What a double-tap at board point (fx, fy) does: zoom in, or back to fit. */
export function doubleTapCamera(cam, fit, fx, fy) {
  return zoomOf(cam, fit) >= DOUBLE_TAP_RESET ? fit : zoomTo(cam, fit, DOUBLE_TAP_ZOOM, fx, fy)
}

/** Pan step for the arrow keys: a fifth of the view. */
export function keyPan(cam, key) {
  const d = cam.w / 5
  if (key === 'ArrowLeft') return [-d, 0]
  if (key === 'ArrowRight') return [d, 0]
  if (key === 'ArrowUp') return [0, -d]
  if (key === 'ArrowDown') return [0, d]
  return null
}

/**
 * The CSS transform that shows `cam` for content laid out `viewPx` wide at
 * fit (fit spans the content's full width). Apply with transform-origin 0 0.
 */
export function cameraTransform(cam, fit, viewPx) {
  const k = fit.w / cam.w
  const s = viewPx / cam.w
  return `translate(${(fit.x - cam.x) * s}px, ${(fit.y - cam.y) * s}px) scale(${k})`
}

/** Two cameras show the same view (within a hair). */
export function sameCamera(a, b, eps = 1e-6) {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.w - b.w) < eps && Math.abs(a.h - b.h) < eps
}

/**
 * Does a wheel turn zoom the board? 'always' (a board that owns the wheel),
 * or 'zoomed': a plain wheel scrolls the page until the board is zoomed in,
 * while a trackpad pinch (ctrlKey) always zooms.
 */
export function wheelZooms({ mode, ctrlKey, zoomed }) {
  return mode === 'always' || ctrlKey || zoomed
}
