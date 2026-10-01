// Browser painter for the avatar kit: look -> <canvas>, plus the one shared clock
// that animates premium looks. Static looks are painted once from a cached 24x24
// bitmap; animated ones repaint at 8 fps, only while on screen, never under
// reduced motion. Pixel data comes from the pure renderer (character.js).

import { renderPixels, isAnimated } from './character.js'
import { encodeAvatar } from './catalog.js'
import { W } from './compose.js'

const STATIC_T = 0.35 // a pleasant frame for looks that animate but are paused
const CACHE_MAX = 400

/** @type {Map<string, HTMLCanvasElement>} */
const bitmaps = new Map()
const scratch = typeof document !== 'undefined' ? document.createElement('canvas') : null
if (scratch) { scratch.width = W; scratch.height = W }

/** @param {Record<string, string>} look @param {string} view @param {number} t @param {boolean} tile @param {string | undefined} pose */
function paintSource(look, view, t, tile, pose) {
  const px = renderPixels(look, /** @type {any} */ (view), { t, tile, pose })
  const ctx = /** @type {HTMLCanvasElement} */ (scratch).getContext('2d')
  const img = /** @type {CanvasRenderingContext2D} */ (ctx).createImageData(W, W)
  for (let i = 0; i < W * W; i++) {
    const c = px[i]
    if (!c) continue
    img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255
  }
  /** @type {CanvasRenderingContext2D} */ (ctx).putImageData(img, 0, 0)
  return /** @type {HTMLCanvasElement} */ (scratch)
}

/** @param {HTMLCanvasElement} canvas @param {Entry} e @param {number} t */
function draw(canvas, e, t) {
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1))
  const want = e.size * dpr
  if (canvas.width !== want) { canvas.width = want; canvas.height = want }
  let source
  if (e.animated) source = paintSource(e.look, e.view, t, e.tile, e.pose)
  else {
    const key = `${e.key}|${e.view}|${e.tile}|${e.pose || ''}`
    source = bitmaps.get(key)
    if (!source) {
      const painted = paintSource(e.look, e.view, STATIC_T, e.tile, e.pose)
      source = document.createElement('canvas')
      source.width = W; source.height = W
      const sctx = /** @type {CanvasRenderingContext2D} */ (source.getContext('2d'))
      sctx.drawImage(painted, 0, 0)
      if (bitmaps.size >= CACHE_MAX) bitmaps.delete(/** @type {string} */ (bitmaps.keys().next().value))
      bitmaps.set(key, source)
    }
  }
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, want, want)
  ctx.drawImage(source, 0, 0, want, want)
}

/**
 * @typedef {{ canvas: HTMLCanvasElement, look: Record<string, string>, view: string, size: number, tile: boolean,
 *   pose?: string, key: string, animated: boolean, visible: boolean }} Entry
 */

/** @type {Set<Entry>} */
const live = new Set()
let raf = 0
let last = 0
const t0 = typeof performance !== 'undefined' ? performance.now() : 0
const reduce = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false }
const io = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver((ents) => {
    for (const en of ents) {
      for (const e of live) if (e.canvas === en.target) e.visible = en.isIntersecting
    }
  }, { rootMargin: '80px' })
  : null

function tick(/** @type {number} */ now) {
  if (!live.size) { raf = 0; return }
  raf = requestAnimationFrame(tick)
  if (now - last < 1000 / 8) return
  last = now
  const t = (now - t0) / 1000
  for (const e of live) if (e.visible) draw(e.canvas, e, t)
}

/**
 * Paint a look onto a canvas at an exact CSS size (a multiple of 24). Returns a stop
 * function. Animated looks join the shared clock unless the user prefers reduced motion.
 * @param {HTMLCanvasElement} canvas @param {Record<string, string>} look
 * @param {{ view?: string, size?: number, tile?: boolean, pose?: string }} [opts]
 */
export function mountAvatar(canvas, look, { view = 'bust', size = 48, tile = true, pose } = {}) {
  const animated = isAnimated(look, /** @type {any} */ (view)) || (view === 'hero' && Boolean(pose) && pose !== 'idle')
  /** @type {Entry} */
  const e = { canvas, look, view, size, tile, pose, key: encodeAvatar(look), animated: false, visible: !io }
  draw(canvas, e, STATIC_T)
  if (!animated || reduce.matches) return () => {}
  e.animated = true
  live.add(e)
  io?.observe(canvas)
  if (!raf) raf = requestAnimationFrame(tick)
  return () => { live.delete(e); io?.unobserve(canvas) }
}

/** Paint once into a data URL - for places that cannot host a canvas. */
export function avatarDataUrl(look, { view = 'bust', size = 96, tile = true, pose } = {}) {
  const c = document.createElement('canvas')
  mountAvatar(c, look, { view, size, tile, pose })()
  return c.toDataURL('image/png')
}
