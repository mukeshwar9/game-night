// @ts-check
// Arrows — camera maths for drag and zoom on big boards. Pure: no DOM, no
// Firebase, no React (ArrowsBoard.jsx feeds it pointer positions and draws
// the camera it returns).
//
// A camera is the part of the board in view, in board units: { x, y, w, h },
// the rectangle the SVG viewBox shows. The `fit` camera shows the whole board
// (padding included); zoom is fit.w / cam.w, from 1 (fitted) up to MAX_ZOOM.
// Every camera keeps fit's aspect ratio and stays inside it, so the SVG never
// changes size while the player moves around.

import { cellCenter, freeArrows } from './arrowsLogic.js'

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
// Boards up to this size open fitted and play exactly as they always did:
// no camera at all. Bigger ones get drag and zoom.
export const FIT_COLS = 10
export const FIT_ROWS = 13
// Camera boards open zoomed so one cell is about this many px on screen.
export const START_CELL_PX = 30

/** Does a board of this size need drag and zoom? */
export function needsCamera(level) {
  return level.cols > FIT_COLS || level.rows > FIT_ROWS
}

/** The camera that shows the whole board with `pad` units around it. */
export function fitCamera(width, height, pad = 0) {
  return { x: 0 - pad, y: 0 - pad, w: width + pad * 2, h: height + pad * 2 }
}

/**
 * Full-screen fit: the whole board (with `pad`) centred in a camera shaped
 * like the stage (`stageW` × `stageH` px), so the SVG can fill the stage. The
 * spare length on the long side is empty margin; every other camera function
 * treats it as the board's fit like any other.
 */
export function focusFitCamera(width, height, pad, stageW, stageH) {
  const base = fitCamera(width, height, pad)
  if (!(stageW > 0) || !(stageH > 0)) return base
  const aspect = stageW / stageH
  if (base.w / base.h < aspect) {
    const w = base.h * aspect
    return { x: base.x - (w - base.w) / 2, y: base.y, w, h: base.h }
  }
  const h = base.w / aspect
  return { x: base.x, y: base.y - (h - base.h) / 2, w: base.w, h }
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
 * Zoom at which one cell (`cell` board units) is about START_CELL_PX on a view
 * `viewPx` wide, shown through `fit`. Never below fit (1) or past MAX_ZOOM; a
 * board whose cells are already that big at fit stays at 1.
 */
export function startZoomFor(fit, viewPx, cell) {
  if (!(viewPx > 0) || !(fit.w > 0) || !(cell > 0)) return 1
  const fitCellPx = (viewPx * cell) / fit.w
  return Math.min(MAX_ZOOM, Math.max(1, START_CELL_PX / fitCellPx))
}

/**
 * Board point (a cell centre) with the most cells of free arrows inside the
 * square window `radiusCells` cells either side of it: where a player would
 * start. Ties go to the first such cell (row-major by arrow, so stable). A
 * board with nothing free gives its centre.
 * @returns {Point}
 */
export function densestFreePoint(level, gone, cell, radiusCells) {
  const cells = freeArrows(level, gone).flatMap((i) => level.arrows[i].cells)
  if (!cells.length) return [(level.cols * cell) / 2, (level.rows * cell) / 2]
  let best = cells[0]
  let bestN = -1
  for (const [cx, cy] of cells) {
    let n = 0
    for (const [ox, oy] of cells) if (Math.abs(ox - cx) <= radiusCells && Math.abs(oy - cy) <= radiusCells) n++
    if (n > bestN) { bestN = n; best = [cx, cy] }
  }
  return /** @type {Point} */ (cellCenter(best, cell))
}

/** The camera a big board opens with: start zoom, centred on the densest free cluster (fit when no zoom is needed). */
export function startCamera(level, gone, fit, viewPx, cell) {
  const z = startZoomFor(fit, viewPx, cell)
  if (z <= 1.02) return fit
  const w = fit.w / z
  const [px, py] = densestFreePoint(level, gone, cell, w / cell / 2)
  return clampCamera({ x: px - w / 2, y: py - (fit.h / z) / 2, w, h: fit.h / z }, fit)
}

/** Move the camera so the board point is at the middle of the view. */
export function centerOn(cam, fit, fx, fy) {
  return clampCamera({ ...cam, x: fx - cam.w / 2, y: fy - cam.h / 2 }, fit)
}

/**
 * Overview strip -> board: the strip draws `fit` scaled to sit inside a
 * `boxW` × `boxH` px box, centred; this maps a position in that box to the
 * board point under it (clamped to fit, so a tap in the margin still lands).
 * @returns {Point}
 */
export function stripToBoard(fit, boxW, boxH, px, py) {
  const k = Math.min(boxW / fit.w, boxH / fit.h)
  const ox = (boxW - fit.w * k) / 2
  const oy = (boxH - fit.h * k) / 2
  const x = Math.min(fit.x + fit.w, Math.max(fit.x, fit.x + (px - ox) / k))
  const y = Math.min(fit.y + fit.h, Math.max(fit.y, fit.y + (py - oy) / k))
  return [x, y]
}
