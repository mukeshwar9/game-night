// @ts-check
// One character, two framings. The head kit (skin, hair, face, headwear, glasses)
// is drawn once; `view: 'bust'` frames it head-and-shoulders for every small slot
// (chips, seat cards, lists) and `view: 'hero'` adds the full body, a pose and a pet
// for the profile, podium and Playground. Everything composes into a 24x24 tile so
// the in-app sizes (24 / 48 / 72 / 96) are integer multiples.

import { applyPart, selOut, paintTile, resolve, BACKGROUNDS, FRAMES, W, H } from './compose.js'
import { PREMIUM_RAMPS } from './palette.js'
import { HEAD, eyes, brows, nose, mouth, marks, beard, hair, hat, glasses, extra, tops, outfits, OUTFITS, POSES, pets } from './art.js'

export const VIEWS = /** @type {const} */ (['bust', 'hero'])
/** @typedef {'bust' | 'hero'} View */

/** Part catalogs by config key. Their key order is wire format (catalog.js). */
export const PART_CATALOGS = /** @type {Record<string, Record<string, any>>} */ ({
  hair, eyes, brows, nose, mouth, marks, beard, hat, glasses, extra, outfit: OUTFITS, pet: pets, bg: BACKGROUNDS, frame: FRAMES,
})

/** @param {Record<string, any>} o */
const anyAnim = (o) => Boolean(o && (o.anim || o.frames))
const fr = (/** @type {any} */ p, /** @type {number} */ t) => (p && p.frames ? Math.floor(t * (p.anim || 4)) : 0)

/** @param {any} cfg @param {any[]} buf @param {number} t @param {number} HX @param {number} HY */
function drawHead(cfg, buf, t, HX, HY) {
  const slots = { skin: cfg.skin, hair: cfg.hairColor, eye: cfg.eyeColor, p: cfg.hatColor, s: cfg.hatAccent }
  const Hr = hair[cfg.hair] || hair.crop
  const hw = hat[cfg.hat]
  const hide = hw && hw.hide
  return { slots, Hr, hw, hide, HX, HY, buf, t }
}

/** Back layer of the hair, which sits behind the head and body. */
function drawHairBack(/** @type {ReturnType<typeof drawHead>} */ c) {
  if (c.Hr.back && c.hide !== 'all') applyPart(c.buf, { ...c.Hr.back, x: c.HX - 1, y: c.HY - 3 }, c.slots)
}

function drawFace(/** @type {any} */ cfg, /** @type {ReturnType<typeof drawHead>} */ c) {
  const { slots, Hr, hw, hide, HX, HY, buf, t } = c
  applyPart(buf, { ...HEAD, x: HX, y: HY }, slots)
  const face = (/** @type {any} */ p) => p && (p.rows || p.frames) && applyPart(buf, { ...p, x: HX + (p.x || 0), y: HY + (p.y || 0) }, slots, 0, 0, fr(p, t))
  face(marks[cfg.marks])
  if (cfg.beard === 'stubble') face(beard.stubble)
  face(brows[cfg.brows])
  face(eyes[cfg.eyes])
  face(nose[cfg.nose])
  if (cfg.beard && cfg.beard !== 'stubble') face(beard[cfg.beard])
  face(mouth[cfg.mouth])
  face(extra[cfg.extra])
  if (Hr.front && hide !== 'all') {
    const rows = hide === 'top' ? Hr.front.rows.map((/** @type {string} */ r, /** @type {number} */ i) => (i < 5 ? '' : r)) : Hr.front.rows
    applyPart(buf, { ...Hr.front, rows, x: HX - 1, y: HY - 3 }, slots)
  }
  face(glasses[cfg.glasses])
  if (hw && (hw.rows || hw.frames)) applyPart(buf, { ...hw, x: HX - 1, y: HY - 3 }, slots, 0, 0, fr(hw, t))
}

/**
 * Compose the outlined character layer.
 * @param {any} cfg @param {View} view @param {number} [t] @param {string} [pose]
 */
export function composeLayer(cfg, view, t = 0, pose) {
  const buf = new Array(W * H).fill(null)
  const o = OUTFITS[cfg.outfit] || OUTFITS.casual
  const slots = { p: cfg.topColor, s: cfg.bottomColor, shoes: cfg.shoeColor, skin: cfg.skin }
  if (view === 'bust') {
    const c = drawHead(cfg, buf, t, 5, 4)
    drawHairBack(c)
    const tp = tops[o.bust] || tops.tee
    applyPart(buf, { ...tp, map: { ...tp.map, ...o.bustMap } }, slots, 0, 0, fr(tp, t))
    drawFace(cfg, c)
    return selOut(buf)
  }
  const P = POSES[pose || 'idle'] || POSES.idle
  const step = Math.floor(t * 6)
  const dy = P.dy ? P.dy[step % P.dy.length] : 0
  const dx = P.dx ? P.dx[step % P.dx.length] : 0
  const c = drawHead(cfg, buf, t, 5 + dx, 3 + dy)
  drawHairBack(c)
  const body = outfits[o.body] || outfits.casual
  applyPart(buf, { ...body, map: { ...body.map, ...o.bodyMap }, x: dx, y: body.y + dy }, slots, 0, 0, fr(body, t))
  for (const ov of P.frames[step % P.frames.length]) {
    applyPart(buf, { ...ov, x: dx, y: ov.y + dy, map: { '#': { slot: 'p', s: 'auto' } } }, slots)
  }
  drawFace(cfg, c)
  const pt = pets[cfg.pet]
  if (pt && (pt.rows || pt.frames)) applyPart(buf, pt, slots, 0, 0, fr(pt, t))
  return selOut(buf)
}

/**
 * Full tile pixels (backdrop + frame + character).
 * @param {any} cfg @param {View} view @param {{ t?: number, tile?: boolean, pose?: string }} [opts]
 */
export function renderPixels(cfg, view, { t = 0, tile = true, pose } = {}) {
  return paintTile(composeLayer(cfg, view, t, pose), cfg, t, tile)
}

/** Does anything on this look move? Static looks are cached as a bitmap instead. @param {any} cfg @param {View} view */
export function isAnimated(cfg, view) {
  const ramps = [cfg.hairColor, cfg.eyeColor, cfg.topColor, cfg.bottomColor, cfg.hatColor, cfg.hatAccent]
  if (ramps.some((r) => PREMIUM_RAMPS.includes(r))) return true
  const o = OUTFITS[cfg.outfit]
  const list = [eyes[cfg.eyes], marks[cfg.marks], hat[cfg.hat], glasses[cfg.glasses], extra[cfg.extra], BACKGROUNDS[cfg.bg], FRAMES[cfg.frame], o]
  if (view === 'hero') list.push(pets[cfg.pet])
  return list.some(anyAnim)
}

/** Side of the square a pet is drawn into on its own (7x7 art plus a 1px outline). */
export const PET_BOX = 9

/**
 * One pet on its own, for the pet picker: outlined, cropped to a PET_BOX square,
 * transparent around it. Null for 'none' or an unknown id.
 * @param {string} id @param {number} [t] @returns {(import('./palette.js').RGB | null)[] | null}
 */
export function renderPet(id, t = 0) {
  const pt = pets[id]
  if (!pt || !(pt.rows || pt.frames)) return null
  const buf = new Array(W * H).fill(null)
  applyPart(buf, { ...pt, x: 1, y: 1 }, {}, 0, 0, fr(pt, t))
  const layer = selOut(buf)
  /** @type {(import('./palette.js').RGB | null)[]} */
  const out = new Array(PET_BOX * PET_BOX).fill(null)
  for (let y = 0; y < PET_BOX; y++) {
    for (let x = 0; x < PET_BOX; x++) out[y * PET_BOX + x] = resolve(layer[y * W + x], x, y, t)
  }
  return out
}

/** Does this pet animate on its own? @param {string} id */
export const isPetAnimated = (id) => anyAnim(pets[id])
