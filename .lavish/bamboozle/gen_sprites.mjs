// Renders four real avatar-kit looks (full-body "hero" view) into palette-indexed
// frames for the prototype. Pure kit code, no DOM: src/lib/avatarKit/character.js.
import { renderPixels } from '../../src/lib/avatarKit/character.js'
import { randomLook, encodeAvatar } from '../../src/lib/avatarKit/catalog.js'
import { writeFileSync } from 'node:fs'

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const seeds = (process.argv[2] || '11,29,47,83').split(',').map(Number)
const FRAMES = [['idle', 'hero', 'idle', 0.35], ['hop1', 'hero', 'hop', 1 / 6 + 0.01], ['hop2', 'hero', 'hop', 2 / 6 + 0.01], ['cheer0', 'hero', 'cheer', 0.01], ['cheer1', 'hero', 'cheer', 1 / 6 + 0.01], ['bust', 'bust', undefined, 0.35]]
const out = []
for (const seed of seeds) {
  const look = { ...randomLook(mulberry32(seed)), pet: 'none' }
  const pal = [], idx = new Map(), frames = {}
  for (const [name, view, pose, t] of FRAMES) {
    const px = renderPixels(look, view, { t, tile: false, pose })
    frames[name] = px.map(c => {
      if (!c) return '..'
      const k = c.map(v => Math.round(v)).join(',')
      if (!idx.has(k)) { idx.set(k, pal.length); pal.push(k) }
      return idx.get(k).toString(16).padStart(2, '0')
    }).join('')
  }
  out.push({ code: encodeAvatar(look), pal, frames })
}
writeFileSync(new URL('./sprites.json', import.meta.url), JSON.stringify(out))
console.log(out.map(o => o.code + ' pal=' + o.pal.length).join('\n'))
