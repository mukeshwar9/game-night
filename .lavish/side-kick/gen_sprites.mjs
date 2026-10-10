// Renders four real avatar-kit looks into palette-indexed 24x24 frames for the prototype:
// the full-body "hero" view (idle and cheer) and the head-and-shoulders "bust".
// Pure kit code, no DOM: src/lib/avatarKit/character.js. Same seeds as the Bamboozle board,
// so both prototypes show the same four characters.
import { renderPixels } from '../../src/lib/avatarKit/character.js'
import { randomLook, encodeAvatar } from '../../src/lib/avatarKit/catalog.js'
import { writeFileSync } from 'node:fs'
import { applyPart, selOut, paintTile } from '../../src/lib/avatarKit/compose.js'
import { HEAD, hair, hat, tops, OUTFITS } from '../../src/lib/avatarKit/art.js'

// The kit only draws fronts. A back view by rule, from the kit's own parts: same body, same head
// shape, no face; the back of the head is covered in the hair colour (unless bald or fully hidden
// by a hat), the fringe keeps its outline, long hair falls over the shoulders, the hat stays, and
// the whole thing is mirrored. Head-and-shoulders framing only.
function backBust(cfg) {
  const buf = new Array(24 * 24).fill(null), HX = 5, HY = 4
  const o = OUTFITS[cfg.outfit] || OUTFITS.casual, tp = tops[o.bust] || tops.tee
  const body = { p: cfg.topColor, s: cfg.bottomColor, shoes: cfg.shoeColor, skin: cfg.skin }
  const head = { skin: cfg.skin, hair: cfg.hairColor, eye: cfg.eyeColor, p: cfg.hatColor, s: cfg.hatAccent }
  const Hr = hair[cfg.hair] || hair.crop, hw = hat[cfg.hat], hide = hw && hw.hide
  applyPart(buf, { ...tp, map: { ...tp.map, ...o.bustMap } }, body)
  applyPart(buf, { ...HEAD, x: HX, y: HY }, head)
  if (Hr.front && hide !== 'all') {
    applyPart(buf, { ...HEAD, rows: HEAD.rows.map((r, i) => (i < 9 ? r : '')), x: HX, y: HY }, { ...head, skin: cfg.hairColor })
    const rows = hide === 'top' ? Hr.front.rows.map((r, i) => (i < 5 ? '' : r)) : Hr.front.rows
    applyPart(buf, { ...Hr.front, rows, x: HX - 1, y: HY - 3 }, head)
  }
  if (Hr.back && hide !== 'all') applyPart(buf, { ...Hr.back, x: HX - 1, y: HY - 3 }, head)
  if (hw && (hw.rows || hw.frames)) applyPart(buf, { ...hw, x: HX - 1, y: HY - 3 }, head)
  const px = paintTile(selOut(buf), cfg, 0, false), out = new Array(576).fill(null)
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) out[y * 24 + x] = px[y * 24 + (23 - x)]
  return out
}

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const seeds = (process.argv[2] || '11,29,47,83').split(',').map(Number)
const FRAMES = [['idle', 'hero', 'idle', 0.35], ['cheer0', 'hero', 'cheer', 0.01], ['cheer1', 'hero', 'cheer', 1 / 6 + 0.01], ['bust', 'bust', 'idle', 0.35]]
const out = []
for (const seed of seeds) {
  const look = { ...randomLook(mulberry32(seed)), pet: 'none' }
  const pal = [], idx = new Map(), frames = {}
  let n = 0
  const enc = (px) => px.map((c) => {
    if (!c) return '..'
    const k = c.map((v) => Math.round(v)).join(',')
    if (!idx.has(k)) { idx.set(k, pal.length); pal.push(k) }
    return idx.get(k).toString(16).padStart(2, '0')
  }).join('')
  for (const [name, view, pose, t] of FRAMES) {
    const px = renderPixels(look, view, { t, tile: false, pose }); n = px.length
    frames[name] = enc(px)
  }
  const bb = backBust(look), front = renderPixels(look, 'bust', { t: 0.35, tile: false })
  frames.back = enc(bb)
  const rgb = (c) => (c ? c.map((v) => Math.round(v)) : null)
  out.push({ code: encodeAvatar(look), pal, frames, n, top: rgb(bb[21 * 24 + 6]), skin: rgb(front[11 * 24 + 7]) })
}
writeFileSync(new URL('./sprites.json', import.meta.url), JSON.stringify(out))
console.log(out.map((o) => o.code + ' pal=' + o.pal.length + ' px=' + o.n).join('\n'))
