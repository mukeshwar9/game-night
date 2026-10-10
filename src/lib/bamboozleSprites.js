// bamboozleSprites.js — a player's own avatar as a standing figure in the
// garden. Browser only (it paints offscreen canvases).
//
// The avatar kit draws 24×24 pixel art from the front. For the garden each
// frame is baked three times: lit (the art itself), side (a darker copy that is
// stacked behind it a pixel at a time to give the figure thickness) and dark (a
// solid silhouette for the shadow cast on the sand). Kit looks use the kit's own
// hero poses; the 27 legacy creatures are frozen 8×8 sprites, which get the same
// treatment from their grid. Avatar colours are cosmetics a player may pay for,
// so they are never routed through theme tokens (.claude/rules/theming-rules.md).
import { RAMPS, TONE_TO_RAMP, renderPixels, resolveAvatar } from './avatarKit'
import { CREATURE_GLYPHS, glyphFor } from './avatarSprites'
import { parseAvatar, TONES } from './avatars'

const SIZE = 24
const CACHE_MAX = 32

/** [name, view, pose, t]: the kit frames the garden uses. */
const FRAMES = [
  ['idle', 'hero', 'idle', 0.35],
  ['hop1', 'hero', 'hop', 1 / 6 + 0.01],
  ['hop2', 'hero', 'hop', 2 / 6 + 0.01],
  ['cheer0', 'hero', 'cheer', 0.01],
  ['cheer1', 'hero', 'cheer', 1 / 6 + 0.01],
  ['bust', 'bust', undefined, 0.35],
]

/** @type {Map<string, Record<string, { lit: HTMLCanvasElement, side: HTMLCanvasElement, dark: HTMLCanvasElement }>>} */
const cache = new Map()

/** @param {(([number, number, number]) | null)[]} px 576 pixels */
function bake(px) {
  const make = (shade) => {
    const c = document.createElement('canvas')
    c.width = SIZE
    c.height = SIZE
    const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'))
    const img = ctx.createImageData(SIZE, SIZE)
    for (let i = 0; i < SIZE * SIZE; i++) {
      const p = px[i]
      if (!p) continue
      img.data[i * 4] = p[0] * shade
      img.data[i * 4 + 1] = p[1] * shade
      img.data[i * 4 + 2] = p[2] * shade
      img.data[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    return c
  }
  return { lit: make(1), side: make(0.55), dark: make(0) }
}

/** A legacy creature's 8×8 grid blown up to the kit's 24×24 canvas. */
function creaturePixels(id) {
  const { shape, tone } = parseAvatar(id)
  const grid = CREATURE_GLYPHS[shape] || glyphFor(shape).grid
  const ramp = RAMPS[TONE_TO_RAMP[TONES.includes(tone) ? tone : 'p1']]
  const body = ramp ? ramp[2] : [200, 200, 200]
  const n = grid.length
  const k = Math.max(1, Math.floor(SIZE / n))
  const off = Math.floor((SIZE - n * k) / 2)
  /** @type {(number[] | null)[]} */
  const px = new Array(SIZE * SIZE).fill(null)
  grid.forEach((row, y) => {
    row.split('').forEach((ch, x) => {
      if (ch === '.') return
      const col = ch === 'o' ? [20, 20, 20] : body
      for (let dy = 0; dy < k; dy++) {
        for (let dx = 0; dx < k; dx++) px[(off + y * k + dy) * SIZE + off + x * k + dx] = col
      }
    })
  })
  return px
}

/**
 * Baked frames for an avatar string: { idle, hop1, hop2, cheer0, cheer1, bust }.
 * Never throws; an unreadable avatar falls back to the kit's default look.
 * @param {string | null | undefined} avatarId
 */
export function getSprites(avatarId) {
  const key = typeof avatarId === 'string' ? avatarId : ''
  const hit = cache.get(key)
  if (hit) return hit
  const frames = {}
  try {
    const resolved = resolveAvatar(key)
    if (resolved.kind === 'kit') {
      for (const [name, view, pose, t] of FRAMES) {
        frames[name] = bake(renderPixels({ ...resolved.look, pet: 'none' }, view, { t, tile: false, pose }))
      }
    } else {
      const baked = bake(creaturePixels(resolved.id))
      for (const [name] of FRAMES) frames[name] = baked
    }
  } catch {
    const baked = bake(new Array(SIZE * SIZE).fill(null))
    for (const [name] of FRAMES) frames[name] = baked
  }
  if (cache.size >= CACHE_MAX) cache.delete(/** @type {string} */ (cache.keys().next().value))
  cache.set(key, frames)
  return frames
}
